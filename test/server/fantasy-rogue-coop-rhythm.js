'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { journeyCoins } = require('../../dist/server/fantasy-rogue/early-balance');
const { content, firstEventRoute } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op shared rhythm and personal sweet dance', () => {
	let oldConfig, oldNow, now, store, manager, host, guest, preview;
	let serial = 0;
	before(() => { preview = createPreviewContent(); });
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		oldNow = Date.now; now = oldNow(); Date.now = () => now;
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true;
		fixture.items = [...fixture.items, ...preview.items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		store = new RogueStore(':memory:'); const engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true }));
		host = makeUser(`Rhythm Host ${++serial}`, `127.0.87.${serial}`);
		guest = makeUser(`Rhythm Guest ${serial}`, `127.0.88.${serial}`);
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
		Date.now = oldNow;
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const event = user => manager.coop.view(user).session.adventure.coopEvent;
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	const choose = (user, value, visit = event(user).key, owner) =>
		manager.coop.command(user, { action: 'eventchoice', value, visit, owner });
	function agree(value) {
		const visit = event(host).key; choose(host, value, visit); choose(guest, value, visit);
	}
	function enter(id) {
		change(shared => {
			shared.adventure.floor = 61;
			shared.adventure.routeChoices = [{ id: 'rhythmroute', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(other => other !== id).map(other => ({ id: other, floor: 1 }));
		});
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'rhythmroute' });
		});
		assert.equal(event(host).id, id);
	}
	it('shares the ski course, accepts either player input and rejects stale replays', () => {
		enter('skiing'); const original = event(host).key;
		choose(host, 'skistart'); assert.equal(event(host).ski, undefined);
		choose(guest, 'skistart', original);
		assert.deepEqual(event(host).ski, event(guest).ski);
		assert.equal(event(host).ski.started, now);
		const key = event(guest).key;
		choose(guest, 'skileft', key);
		assert.equal(event(host).ski.lane, 0);
		assert.deepEqual(event(host).ski, event(guest).ski);
		assert.throws(() => choose(host, 'skiright', key));
		choose(host, 'skiright'); assert.equal(event(guest).ski.lane, 1);
	});
	it('settles a shared ski finish once into both inventories without duplicate claims', () => {
		enter('skiing'); agree('skistart');
		change(shared => {
			for (const user of [host, guest]) shared.adventure.members[user.id].coopEvent.ski.obstacles = [];
			shared.adventure.node.event.ski.obstacles = [];
		});
				const before = [host, guest].map(user => member(user).money);
		now += 15251;
		const stale = event(host).key;
		choose(host, 'skitick');
		assert.equal(event(host).stage, 'result'); assert.equal(event(guest).stage, 'result');
		const gains = [host, guest].map((user, i) => member(user).money - before[i]);
		assert(gains[0] > 0); assert.equal(gains[0], gains[1]);
		assert.equal(member(host).bag.revive, 1); assert.equal(member(guest).bag.revive, 1);
		assert.throws(() => choose(guest, 'skitick', stale));
		assert.equal(member(host).money, before[0] + gains[0]);
	});
	it('restores the course after reconnect and settles collisions using the original clock', () => {
		enter('skiing'); agree('skistart');
		change(shared => {
			for (const user of [host, guest]) shared.adventure.members[user.id].coopEvent.ski.obstacles = [{at: 2100, lane: 1, kind: 'tree'}];
			shared.adventure.node.event.ski.obstacles = [{at: 2100, lane: 1, kind: 'tree'}];
		});
		const started = event(host).ski.started;
		manager = new RogueManager(new RogueEngine(store, preview), () => ({enabled: true}));
		assert.equal(event(guest).ski.started, started);
		now += 2400; choose(guest, 'skitick');
		assert.equal(event(host).stage, 'result');
		assert.equal(member(host).coopEvent.ski.ended, 2100);
		assert.equal(member(host).coopEvent.ski.crashed, true);
		assert.deepEqual(member(host).coopEvent.ski, member(guest).coopEvent.ski);
	});
	it('requires consensus to leave a ski visit without creating rewards', () => {
		enter('skiing'); const before = [host, guest].map(user => member(user).money);
		choose(host, 'leave'); assert.equal(event(host).stage, 'choice');
		choose(guest, 'leave'); assert.equal(event(host).stage, 'result');
		assert.deepEqual([host, guest].map(user => member(user).money), before);
	});
	function kitchen() {
		enter('poffinworkshop'); agree('berry:0'); agree('berry:1');
		assert.equal(event(host).activity.startedAt, now); assert.deepEqual(event(host).activity, event(guest).activity);
	}
	function prepareContest() {
		enter('minicontest'); agree('style:cool');
		for (const user of [host, guest]) {
			choose(user, 'member:' + member(user).team[0].id);
			choose(user, 'perform:' + member(user).team[0].set.moves[0]);
		}
		assert.equal(event(host).branchResolved, false); assert(event(host).branchOptions.some(o => o.id === 'start'));
	}
	function milcery(user, sweets = 1) {
		change(shared => {
			const state = shared.adventure.members[user.id];
			state.team = [createRoguePokemon({ species: 'Milcery', ability: 'Sweet Veil', level: 35, moves: ['Tackle'], nature: 'Serious' }, state.boosts)];
			state.bag.strawberrysweet = sweets; state.money = 2000;
		});
	}
	function dance() {
		milcery(host); milcery(guest, 0);
		enter('sweetdance'); agree('participate');
		for (const user of [host, guest]) {
			choose(user, 'member:' + member(user).team[0].id); choose(user, 'ceremony');
		}
	}
	for (const id of ['poffinworkshop', 'minicontest', 'sweetdance']) {
		it(`offers ${id} through the common event pool and declines only after consensus`, () => {
			if (id === 'sweetdance') milcery(guest);
			enter(id); const saved = session(), accounts = [store.get(host.id), store.get(guest.id)];
			assert.deepEqual(event(host).branchOptions, event(guest).branchOptions); assert.deepEqual(session(), saved);
			choose(host, 'leave'); assert(!member(host).coopEvent.settled);
			manager.coop.command(host, { action: 'cancelevent', visit: event(host).key });
			assert.equal(event(host).ownChoice, null); agree('leave');
			for (const user of [host, guest]) {
				assert.deepEqual(member(user).bag, saved.adventure.members[user.id].bag);
				assert.equal(member(user).money, saved.adventure.members[user.id].money);
				manager.coop.command(user, { action: 'finishroute' });
			}
			assert.equal(session().adventure.floor, 62);
			assert.deepEqual([store.get(host.id).run, store.get(guest.id).run], accounts.map(account => account.run));
		});
	}
	it('requires two different common kitchen berries and rejects stale preparation requests', () => {
		enter('poffinworkshop'); const old = event(host).key; agree('berry:0');
		assert.throws(() => choose(host, 'berry:0'), /共同分支/);
		assert.throws(() => choose(host, 'berry:1', old), /已变化/);
		choose(host, 'berry:1'); assert.equal(event(host).activity, undefined);
		choose(guest, 'berry:1'); assert.equal(event(host).activity.startedAt, now);
	});
	it('counts one shared tap per beat, including simultaneous clicks and misses from either owner', () => {
		kitchen(); const visit = event(host).key;
		now += 350; choose(host, 'tap', visit); choose(guest, 'tap', visit);
		assert.equal(event(host).activity.score, 1); assert.equal(event(guest).activity.score, 1);
		assert.equal(event(host).key, visit);
		now += 500; choose(guest, 'tap', visit);
		now += 300; choose(host, 'tap', visit);
		assert.equal(event(host).activity.score, 1, 'a missed beat cannot be retried in its hit window');
		now += 800; choose(guest, 'tap', visit); assert.equal(event(host).activity.score, 2);
		assert.deepEqual(member(host).coopEvent.activity, member(guest).coopEvent.activity);
	});
	for (const phase of [249, 250, 550, 551]) it(`retains the native hit-window boundary at ${phase} ms`, () => {
		kitchen(); now += phase; choose(host, 'tap');
		assert.equal(event(host).activity.score, phase >= 250 && phase <= 550 ? 1 : 0);
	});
	it('does not accept client timestamps or scores and requires common finish after expiration', () => {
		kitchen(); const start = now, visit = event(host).key;
		now += 50; manager.coop.command(host, { action: 'eventchoice', value: 'tap', visit, now: start + 350, score: 999 });
		assert.equal(event(host).activity.score, 0);
		now = start + 12000; const before = session();
		assert.throws(() => choose(guest, 'tap'), /节奏已结束/); assert.deepEqual(session(), before);
		choose(host, 'finish'); assert(!member(host).coopEvent.settled); choose(guest, 'finish');
		assert(member(host).coopEvent.settled); assert(member(guest).coopEvent.settled);
		assert.throws(() => choose(host, 'tap', visit), /已变化/);
	});
	it('awards both kitchen supplies and own party affection and healing once', () => {
		change(shared => { for (const state of Object.values(shared.adventure.members)) state.team[0].hp -= 5; });
		kitchen(); const before = session().adventure.members;
		for (let i = 0; i < 8; i++) { now = event(host).activity.startedAt + i * 800 + 350; choose(i % 2 ? host : guest, 'tap'); }
		agree('finish');
		for (const user of [host, guest]) {
			const state = member(user), prior = before[user.id];
			assert.equal(state.bag.ether, 1); assert.equal(state.bag.oranberry, 3);
			assert.equal(state.money - prior.money, journeyCoins(61, 405));
			assert.equal(state.team[0].set.happiness - prior.team[0].set.happiness, 28);
			assert.equal(state.team[0].hp - prior.team[0].hp, Math.ceil(prior.team[0].maxhp * 0.12));
		}
		const saved = session(); assert.throws(() => choose(host, 'finish')); assert.deepEqual(session(), saved);
	});
	it('prepares contestants privately after a shared style and starts only on common confirmation', () => {
		enter('minicontest'); agree('style:cool'); const partnerKey = event(guest).key;
		choose(host, 'member:' + member(host).team[0].id);
		assert.equal(event(guest).key, partnerKey);
		choose(host, 'perform:' + member(host).team[0].set.moves[0]);
		assert.equal(event(host).activity, undefined); assert(event(host).options.some(o => o.id === 'rechoose'));
		choose(host, 'rechoose'); assert(!member(host).coopEvent.activity.member);
		for (const user of [host, guest]) {
			choose(user, 'member:' + member(user).team[0].id); choose(user, 'perform:' + member(user).team[0].set.moves[0]);
		}
		assert.equal(event(host).key, event(guest).key); choose(host, 'start'); assert.equal(event(host).activity, undefined);
		choose(guest, 'start'); assert.equal(event(host).activity.score, 2); assert.equal(event(host).activity.startedAt, now);
	});
	it('rejects another player’s contestant, stale steps and moves the contestant does not know', () => {
		enter('minicontest'); agree('style:cool'); const old = event(host).key;
		assert.throws(() => choose(host, 'member:' + member(guest).team[0].id), /目标|步骤/);
		choose(host, 'member:' + member(host).team[0].id);
		assert.throws(() => choose(host, 'perform:explosion'), /目标|步骤/);
		assert.throws(() => choose(host, 'perform:' + member(host).team[0].set.moves[0], old), /已变化/);
	});
	it('can jointly redo both preparations without starting a clock or consuming resources', () => {
		prepareContest(); const before = session().adventure.members; agree('prepare');
		assert.equal(event(host).branchResolved, true);
		for (const user of [host, guest]) {
			assert(!member(user).coopEvent.activity.member); assert.equal(event(user).activity, undefined);
			assert.equal(member(user).money, before[user.id].money);
		}
	});
	it('shares contest score and the chosen feathers while applying personal target effects', () => {
		prepareContest(); agree('start');
		now += 350; choose(host, 'tap'); choose(guest, 'tap');
		agree('finish');
		assert.equal(member(host).coopEvent.activity.score, 3); assert.equal(event(host).activity, undefined);
		choose(host, 'prize:musclefeather'); choose(guest, 'prize:geniusfeather');
		assert.equal(member(host).bag.musclefeather, undefined);
		choose(guest, 'prize:musclefeather');
		for (const user of [host, guest]) {
			assert.equal(member(user).bag.musclefeather, 2); assert.equal(member(user).bag.geniusfeather, undefined);
			assert.equal(member(user).bag.ether, 1); assert.equal(member(user).bag.oranberry, 1);
			assert(member(user).coopEvent.settled);
		}
	});
	it('keeps each sweet dance clock, cost and evolution condition personal', () => {
		dance(); const visit = event(host).key;
		assert.equal(member(host).bag.strawberrysweet, 0); assert.equal(member(host).money, 2000);
		assert.equal(member(guest).money, 400);
		for (let i = 0; i < 3; i++) { now = event(host).activity.startedAt + i * 800 + 350; choose(host, 'tap', visit); }
		choose(host, 'finish'); choose(guest, 'finish');
		assert(member(host).team[0].evolutionProgress.scenes.includes('alcremie'));
		assert(!member(guest).team[0].evolutionProgress?.scenes?.includes('alcremie'));
		assert.equal(member(guest).money, 400); assert.equal(member(host).money, 2000);
	});
	it('lets an ineligible sweet-dance partner skip but waits for the eligible owner to finish', () => {
		milcery(guest); enter('sweetdance'); agree('participate');
		choose(host, 'leave');
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /双方/);
		choose(guest, 'leave');
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 62);
	});
	it('rejects duplicate ceremony payments and cannot use an unavailable target to complete an evolution condition', () => {
		dance(); const stale = event(host).key;
		assert.throws(() => choose(host, 'ceremony', stale)); assert.equal(member(host).money, 2000);
		change(shared => { shared.adventure.members[host.id].team[0].nuzlockeDead = true; });
		assert.equal(event(host).activity, undefined);
		assert.throws(() => choose(host, 'finish'), /目标|步骤/);
		choose(host, 'leave'); assert(!member(host).team[0].evolutionProgress?.scenes?.includes('alcremie'));
	});
	it('preserves timers and scores on reload and does not restart expired games', () => {
		kitchen(); const started = now; now += 350;
		choose(host, 'tap'); now = started + 13000;
		const saved = session(), visible = event(host);
		assert.equal(visible.activity.startedAt, started); assert.equal(visible.activity.score, 1);
		assert.deepEqual(session(), saved); assert.equal(event(guest).activity.startedAt, started);
		assert.throws(() => choose(guest, 'tap'), /节奏已结束/);
	});
	it('supports delegated personal clocks and revocation without granting access to another owner', () => {
		dance(); manager.coop.command(host, { action: 'delegate', value: 'partner' });
		const ownVisit = event(guest).key, targetVisit = event(guest).partnerKey;
		assert(event(guest).partnerActivity); now += 350;
		choose(guest, 'tap', targetVisit, host.id); assert.equal(member(host).coopEvent.activity.score, 1);
		assert.throws(() => choose(host, 'tap'), /操作权/);
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		assert.throws(() => choose(guest, 'tap', targetVisit, host.id), /移交|本人|队友|操作权/);
		choose(guest, 'tap', ownVisit); assert.equal(member(guest).coopEvent.activity.score, 1);
	});
	it('rolls back both shared rewards and taps on failed persistence', () => {
		kitchen(); now += 350; const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec("CREATE TEMP TRIGGER rhythm_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'rhythm write failed'); END;");
		try {
			assert.throws(() => choose(host, 'tap'), /rhythm write failed/);
			assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		} finally { store.db.exec('DROP TRIGGER rhythm_fail'); }
		choose(host, 'tap'); assert.equal(event(host).activity.score, 1);
	});
});
