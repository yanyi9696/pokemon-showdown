'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { affectionThemeGift } = require('../../dist/server/fantasy-rogue/affection-gifts');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { content, firstEventRoute } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op companion affection', () => {
	let oldConfig, store, engine, manager, host, guest;
	let serial = 0;
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true;
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true }));
		host = makeUser(`Bond Host ${++serial}`, `127.0.87.${serial}`);
		guest = makeUser(`Bond Guest ${serial}`, `127.0.88.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: crypto.randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(shared => {
			const round = { floor: 1, tier: 'silver', remaining: 1, familiesSeen: [], idsSeen: ['swapstats'],
				options: [{ id: 'swapstats', tier: 'silver', refreshes: 1, chosen: false }] };
			shared.adventure.coopBlessingRound = round;
			for (const user of [host, guest]) shared.adventure.members[user.id].blessings.round = structuredClone(round);
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'blessingchoice', slot: 0 });
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = user => manager.coop.view(user).session.adventure;
	const scene = () => view(host).coopAffection;
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function companion(user, score, id = 'olivia', pending = []) {
		change(shared => {
			const own = shared.adventure.members[user.id];
			(own.blessings.companions ||= []).push({ id, preferences: 0 });
			if (score !== undefined) (own.trainerBonds ||= {})[id] = {
				score, gifts: score >= 100 ? [50, 100] : score >= 50 ? [50] : [], pending,
			};
		});
	}
	function rest(floor = 12) {
		change(shared => {
			shared.adventure.floor = floor; shared.adventure.phase = 'route-interaction';
			shared.adventure.node = { id: `bond-rest-${floor}`, name: '休整', kind: 'rest',
				encounters: [], reward: { money: 0, items: {} } };
			shared.adventure.routeExitSelections = {};
		});
	}
	function advance() { for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' }); }
	function respond(user, value = 'thanks', visit = scene().visit) {
		return manager.coop.command(user, { action: 'affection', visit, value });
	}
	function agree(value = 'thanks') {
		const visit = scene().visit; respond(host, value, visit); respond(guest, value, visit);
	}
	function claim(user) {
		const pending = member(user).blessings.pending[0];
		manager.coop.command(user, { action: 'blessingreward', member: pending.id, value: pending.options[0] });
	}

	it('persists native per-floor affection separately without changing either solo run or inventing past progress', () => {
		companion(host, undefined); companion(guest, 12, 'guzma'); rest();
		const solo = [store.get(host.id).run, store.get(guest.id).run];
		const before = session(); manager.coop.view(host); manager.coop.view(guest);
		assert.deepEqual(session(), before); assert.equal(member(host).trainerBonds, undefined);
		advance();
		assert.equal(member(host).trainerBonds.olivia.score, 1); assert.equal(member(guest).trainerBonds.guzma.score, 13);
		assert.deepEqual(member(host).affectionClaims, ['olivia:floor:12']);
		assert.equal(view(host).trainerBonds[0].score, 1); assert.equal(view(host).partnerTrainerBonds[0].score, 13);
		manager = new RogueManager(engine, () => ({ enabled: true }));
		assert.equal(view(guest).trainerBonds[0].score, 13);
		assert.deepEqual([store.get(host.id).run, store.get(guest.id).run], solo);
		const bag = member(host).bag; rest(12); advance();
		assert.equal(member(host).trainerBonds.olivia.score, 1); assert.deepEqual(member(host).bag, bag);
	});
	it('persists a personal Mew milestone conversion through real commands and reconnection', () => {
		companion(host, 49); companion(guest, 12); rest();
		change(shared => { shared.spirit = shared.adventure.spirit = 'hoopagift'; shared.adventure.spiritVersion = 1; });
		const solo = [store.get(host.id).run, store.get(guest.id).run];
		const original = crypto.randomInt;
		crypto.randomInt = max => max === 100 ? 99 : 0;
		try { advance(); } finally { crypto.randomInt = original; }
		assert.equal(member(host).bag.fantasypowerlens, 1);
		assert.equal(member(host).spiritConversions['affection:olivia:50'], 'fantasypowerlens');
		assert(!member(guest).bag.fantasypowerlens); assert(!member(guest).spiritConversions);
		const before = session(); manager = new RogueManager(engine, () => ({ enabled: true }));
		view(host); view(guest); assert.deepEqual(session(), before);
		agree(); assert.equal(member(host).bag.fantasypowerlens, 1);
		assert.deepEqual([store.get(host.id).run, store.get(guest.id).run], solo);
	});
	it('rolls back both Mew conversion ledgers when the shared session write fails', () => {
		companion(host, 49); companion(guest, 49); rest();
		change(shared => { shared.spirit = shared.adventure.spirit = 'hoopagift'; shared.adventure.spiritVersion = 1; });
		manager.coop.command(host, { action: 'finishroute' });
		const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec("CREATE TEMP TRIGGER mew_bond_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'mew bond failure'); END;");
		const original = crypto.randomInt;
		crypto.randomInt = max => max === 100 ? 99 : 0;
		try {
			assert.throws(() => manager.coop.command(guest, { action: 'finishroute' }), /mew bond failure/);
			assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
			store.db.exec('DROP TRIGGER mew_bond_fail');
			manager.coop.command(guest, { action: 'finishroute' });
			for (const user of [host, guest]) assert.equal(member(user).bag.fantasypowerlens, 1);
		} finally { crypto.randomInt = original; }
	});
	it('does not reward an away companion', () => {
		companion(host, 49); change(shared => { shared.adventure.members[host.id].blessings.companions[0].away = true; });
		rest(); advance();
		assert.equal(member(host).trainerBonds.olivia.score, 49); assert(!scene());
	});
	it('awards one milestone only to its owner and waits for both replies before entering the next floor', () => {
		companion(host, 49); rest(); const gift = affectionThemeGift('olivia', 50).id;
		const counts = [member(host).bag[gift] || 0, member(guest).bag[gift] || 0];
		advance();
		assert.equal(session().adventure.floor, 12); assert.equal(session().adventure.phase, 'affection');
		assert.equal(member(host).bag[gift], counts[0] + 1); assert.equal(member(guest).bag[gift] || 0, counts[1]);
		assert.equal(scene().owner, host.id); assert.equal(scene().stage, 50);
		assert.deepEqual(scene().options, view(guest).coopAffection.options);
		const key = scene().visit; respond(host); assert.equal(scene().ownChoice, 'thanks');
		assert.equal(view(guest).coopAffection.partnerChoice, 'thanks');
		assert.throws(() => manager.coop.command(guest, { action: 'finishroute' }), /共同回应/);
		respond(host, 'cancel'); assert.equal(scene().ownChoice, null);
		respond(guest); assert(scene()); respond(host);
		assert.equal(session().adventure.floor, 13); assert(!scene());
		assert.deepEqual(member(host).trainerBonds.olivia.pending, []);
		assert.equal(member(host).trainerBonds.olivia.responses[50], 'thanks');
		const saved = session(); assert.throws(() => respond(guest, 'thanks', key), /对话已变化/); assert.deepEqual(session(), saved);
		assert.equal(member(host).bag[gift], counts[0] + 1);
	});
	it('keeps opposing branch votes until agreement, then scopes the next conversation to its own owner and stage', () => {
		companion(host, 100, 'olivia', [100]); companion(guest, 50, 'olivia', [50]);
		const first = scene().visit; respond(host, 'accept'); respond(guest, 'friends');
		assert(!member(host).trainerBonds.olivia.relationship);
		respond(host, 'friends'); assert.equal(member(host).trainerBonds.olivia.relationship, 'bestfriend');
		assert.equal(scene().owner, guest.id); assert.notEqual(scene().visit, first);
		assert.equal(scene().ownChoice, null); assert.equal(scene().partnerChoice, null);
		assert.throws(() => respond(guest, 'thanks', first), /对话已变化/); agree(); assert(!scene());
	});
	it('fences identical reply labels across the same companion milestones', () => {
		companion(host, 100, 'guzma', [50, 100]); const key = scene().visit; agree();
		assert.equal(scene().stage, 100); assert.notEqual(scene().visit, key);
		assert.throws(() => respond(host, 'thanks', key), /对话已变化/);
		agree(); assert.equal(member(host).trainerBonds.guzma.relationship, 'bestfriend');
	});
	it('clears votes when delegation changes and permits the controller to answer jointly until revoked', () => {
		companion(host, 100, 'olivia', [100]); respond(host, 'accept');
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.equal(scene().ownChoice, null); assert.throws(() => respond(host, 'accept'), /移交/);
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		respond(guest, 'friends'); assert(scene()); assert(!member(host).trainerBonds.olivia.relationship);
		manager.coop.command(host, { action: 'delegate', value: 'partner' }); respond(guest, 'friends');
		assert.equal(member(host).trainerBonds.olivia.relationship, 'bestfriend'); assert(!scene());
	});
	it('does not show or accept a dialogue during a battle, pending move, pending capture, or reward choice', () => {
		companion(host, 50, 'olivia', [50]); const key = scene().visit;
		for (const blocked of ['battle', 'battle-starting', 'moves', 'capture', 'reward']) {
			change(shared => {
				shared.adventure.phase = blocked.startsWith('battle') ? blocked : 'area-selection';
				const own = shared.adventure.members[guest.id];
				own.pendingMoves = blocked === 'moves' ? [{ member: own.team[0].id, move: 'tackle' }] : [];
				own.pendingCaptures = blocked === 'capture' ? [structuredClone(own.team[0])] : [];
				own.blessings.pending = blocked === 'reward' ? [{ id: 'gift', kind: 'item', title: '礼物', options: ['potion'] }] : [];
			});
			assert(!scene(), blocked); assert.throws(() => respond(host, 'thanks', key), /对话已变化/);
		}
		change(shared => { shared.adventure.members[guest.id].blessings.pending = []; });
		assert.equal(scene().visit, key); agree();
	});

	for (const floor of [49, 50, 99, 100, 149, 150, 199, 200]) {
		it(`finishes the ${floor}-floor milestone and resumes the original blessing or completion boundary`, () => {
			companion(host, 49); rest(floor); const sessionId = session().id;
			advance(); assert.equal(session().adventure.floor, floor);
			agree();
			if ([50, 100, 150].includes(floor)) {
				assert.equal(session().adventure.phase, 'blessing-selection');
				assert.equal(session().adventure.coopBlessingRound.floor, floor);
			} else if (floor === 200) {
				const ended = store.coopSession(sessionId);
				assert.equal(ended.status, 'complete'); assert.equal(ended.adventure.phase, 'complete');
			} else assert.equal(session().adventure.floor, floor + 1);
		});
	}
	it('handles both 100-point item rewards before both joint conversations, without duplicate gifts on continuation', () => {
		companion(host, 99); companion(guest, 99, 'guzma'); rest();
		const before = member(host).bag.rarecandy || 0; advance();
		assert.equal(session().adventure.phase, 'blessing-reward'); assert(!scene());
		assert.equal(member(host).bag.rarecandy, before + 2); claim(host);
		assert(!scene()); claim(guest);
		assert.equal(session().adventure.phase, 'affection'); assert.equal(scene().stage, 100);
		agree('friends'); assert.equal(scene().owner, guest.id); agree();
		assert.equal(session().adventure.floor, 13); assert.equal(member(host).bag.rarecandy, before + 2);
		assert.deepEqual(member(host).trainerBonds.olivia.gifts, [50, 100]);
	});
	for (const floor of [50, 200]) {
		it(`handles a 100-point item choice and conversation at the ${floor}-floor boundary`, () => {
			companion(host, 99); rest(floor); const sessionId = session().id;
			advance(); claim(host);
			assert.equal(scene().stage, 100); agree('friends');
			const saved = store.coopSession(sessionId);
			assert.equal(saved.adventure.members[host.id].trainerBonds.olivia.relationship, 'bestfriend');
			assert.equal(saved.adventure.phase, floor === 50 ? 'blessing-selection' : 'complete');
		});
	}
	it('preserves the waiting dialogue and vote across manager recreation, pause and resume', () => {
		companion(host, 49); rest(); advance();
		respond(host); const key = scene().visit;
		manager.coop.command(guest, { action: 'leave', id: session().id }); assert.equal(session().status, 'paused');
		assert(!scene()); assert.throws(() => respond(guest, 'thanks', key), /共同冒险/);
		manager = new RogueManager(engine, () => ({ enabled: true }));
		manager.coop.command(guest, { action: 'resume', id: session().id });
		assert.equal(scene().visit, key); assert.equal(scene().ownChoice, 'thanks');
		respond(guest); assert.equal(session().adventure.floor, 13);
	});
	it('persists event preference affection and its receipt across visits and subsequent floor completion', () => {
		companion(host, 47); companion(guest, 12, 'guzma');
		change(shared => {
			shared.adventure.floor = 70; shared.adventure.phase = 'area-selection';
			shared.adventure.members[host.id].money = 10000;
			shared.adventure.routeChoices = [{ id: 'stones', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(id => id !== 'stones')
				.map(id => ({ id, floor: 1 }));
			shared.areaSelections = { [host.id]: null, [guest.id]: null };
		});
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'stones' });
		});
		let event = view(host).coopEvent;
		const stone = event.branchOptions.find(option => option.id.startsWith(`stone:${host.id}:`));
		for (const user of [host, guest]) manager.coop.command(user, { action: 'eventchoice', value: stone.id, visit: event.key });
		event = view(host).coopEvent;
		for (const user of [host, guest]) manager.coop.command(user, { action: 'eventchoice', value: 'stonefinish', visit: event.key });
		assert.equal(member(host).trainerBonds.olivia.score, 49); assert.equal(member(guest).trainerBonds.guzma.score, 12);
		assert(member(host).affectionClaims.some(receipt => receipt.startsWith('olivia:preference:')));
		advance(); assert.equal(member(host).trainerBonds.olivia.score, 50); agree();
		assert.equal(member(host).trainerBonds.olivia.score, 50);
	});
	for (const failure of ['account', 'session']) {
		it(`rolls back both milestone gifts and progress when the ${failure} write fails`, () => {
			companion(host, 49); companion(guest, 49); rest();
			manager.coop.command(host, { action: 'finishroute' });
			const saved = session(), accounts = [store.get(host.id), store.get(guest.id)];
			const changeAccount = store.change;
			if (failure === 'account') store.change = function (userid, ...args) {
				if (userid === guest.id) throw new Error('bond account failure');
				return changeAccount.call(this, userid, ...args);
			};
			else store.db.exec("CREATE TEMP TRIGGER bond_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'bond session failure'); END;");
			try {
				assert.throws(() => manager.coop.command(guest, { action: 'finishroute' }), /bond .* failure/);
				assert.deepEqual(session(), saved); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
			} finally {
				store.change = changeAccount;
				if (failure === 'session') store.db.exec('DROP TRIGGER bond_fail');
			}
			manager.coop.command(guest, { action: 'finishroute' }); assert.equal(member(host).trainerBonds.olivia.score, 50);
			assert.equal(member(guest).trainerBonds.olivia.score, 50); agree(); agree();
		});
	}
	it('keeps a failed second reply retryable and preserves the first vote', () => {
		companion(host, 50, 'olivia', [50]); respond(host); const saved = session();
		store.db.exec("CREATE TEMP TRIGGER bond_reply_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'bond reply failure'); END;");
		try {
			assert.throws(() => respond(guest), /bond reply failure/); assert.deepEqual(session(), saved);
		} finally {
			store.db.exec('DROP TRIGGER bond_reply_fail');
		}
		respond(guest); assert(!scene()); assert.deepEqual(member(host).trainerBonds.olivia.pending, []);
	});
});
