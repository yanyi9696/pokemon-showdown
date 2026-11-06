'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op eggs and hatching', () => {
	let oldConfig, store, engine, manager, host, guest;
	let serial = 0;
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true;
		fixture.unlocks = { magikarp: { starter: 'magikarp', captures: 1 } };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true }));
		host = makeUser(`Egg Host ${++serial}`, `127.0.85.${serial}`);
		guest = makeUser(`Egg Guest ${serial}`, `127.0.86.${serial}`);
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
	const event = user => view(user).coopEvent;
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter(id, floor = 12) {
		change(shared => {
			shared.adventure.floor = floor; shared.adventure.phase = 'area-selection';
			shared.adventure.routeChoices = [{ id: 'eggroute', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(other => other !== id)
				.map(other => ({ id: other, floor: 1 }));
			shared.areaSelections = { [host.id]: null, [guest.id]: null };
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'eggroute' });
		assert.equal(event(host).id, id);
	}
	const choose = (user, value, visit = event(user).key) => manager.coop.command(user, { action: 'eventchoice', value, visit });
	function agree(choice) {
		const key = event(host).key; choose(host, choice, key); choose(guest, choice, key);
	}
	function admit(user, value = 'join', confirmed = false) {
		const pending = member(user).blessings.pending[0];
		return manager.coop.command(user, { action: 'blessingreward', member: pending.id, value, confirmed });
	}
	function receiveEggs() {
		enter('grassegg'); agree('egg');
		admit(host); admit(guest);
	}
	function rest(floor = session().adventure.floor) {
		change(shared => {
			shared.adventure.floor = floor; shared.adventure.phase = 'route-interaction';
			shared.adventure.node = { id: 'egg-rest', name: '休整', kind: 'rest', encounters: [], reward: { money: 0, items: {} } };
			shared.adventure.routeExitSelections = {};
		});
	}
	function advance() { for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' }); }
	function addEgg(user, hatch = 20, boxed = false) {
		let id;
		change(shared => {
			const own = shared.adventure.members[user.id];
			const mon = createRoguePokemon(structuredClone(engine.content.starters.find(p => p.id === 'magikarp').set), own.boosts);
			mon.egg = { found: 12, hatch }; mon.hp = 0;
			mon.set.shiny = true; id = mon.id;
			(boxed ? (own.box ||= []) : own.team).push(mon);
		});
		return id;
	}
	const captures = user => store.get(user.id).captures.magikarp || 0;

	it('draws one shared reward with distinct member IDs, local boosts and no premature permanent unlock', () => {
		change(shared => { shared.adventure.members[guest.id].boosts.hp = 10; });
		enter('grassegg'); const key = event(host).key;
		choose(host, 'egg'); assert.equal(member(host).blessings.pending.length, 0);
		manager.coop.command(host, { action: 'cancelevent', visit: key });
		assert.equal(event(host).ownChoice, null); agree('egg');
		const first = member(host).blessings.pending[0], second = member(guest).blessings.pending[0];
		assert.deepEqual(first.pokemon.set, second.pokemon.set); assert.deepEqual(first.pokemon.egg, second.pokemon.egg);
		assert.notEqual(first.pokemon.id, second.pokemon.id); assert.notEqual(first.id, second.id);
		assert(second.pokemon.maxhp > first.pokemon.maxhp);
		assert(first.pokemon.egg.hatch >= 17 && first.pokemon.egg.hatch <= 20);
		for (const user of [host, guest]) {
			assert.equal(captures(user), 0); assert(!store.get(user.id).unlocked.includes('magikarp'));
			const pending = view(user).coopBlessing.ownPending[0].pokemon;
			assert.equal(pending.set.species, 'Egg'); assert.deepEqual(pending.set.moves, []);
			assert(!JSON.stringify(pending).includes('Magikarp')); assert.equal(pending.hp, 0);
		}
		const saved = session(); assert.throws(() => choose(host, 'egg', key), /当前没有可处理/);
		assert.deepEqual(session(), saved);
	});
	it('admits or declines independently and blocks route progress until both finish', () => {
		enter('grassegg'); agree('egg'); admit(host);
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /当前|步骤/);
		admit(guest, 'release'); assert.equal(member(host).team.length, 2); assert.equal(member(guest).team.length, 1);
		assert.equal(session().adventure.phase, 'route-interaction'); advance();
		assert.equal(session().adventure.floor, 13); assert.equal(captures(host), 0); assert.equal(captures(guest), 0);
	});
	it('hatches on actual floor entry only, persists through reconnect, and unlocks each owner exactly once', () => {
		receiveEggs(); const egg = member(host).team[1], deadline = egg.egg.hatch;
		const solo = store.get(host.id).run;
		for (let floor = 12; floor < deadline; floor++) {
			rest(floor); const before = session();
			manager.coop.view(host); manager.coop.view(guest);
			const reconnected = new RogueManager(engine, () => ({ enabled: true }));
			assert.equal(reconnected.coop.view(host).session.adventure.team[1].species, 'Egg');
			assert.deepEqual(session(), before); advance();
			if (floor + 1 < deadline) assert.equal(captures(host), 0);
		}
		for (const user of [host, guest]) {
			const mon = member(user).team[1]; assert(!mon.egg); assert.equal(mon.hp, mon.maxhp);
			assert.equal(captures(user), 1); assert(store.get(user.id).unlocked.includes('magikarp'));
			assert.equal(view(user).team[1].species, 'Magikarp');
		}
		rest(); advance();
		assert.equal(captures(host), 1); assert.equal(captures(guest), 1);
		assert.deepEqual(store.get(host.id).run, solo);
	});
	it('keeps party and delegated views hidden and rejects an egg battle selection', () => {
		receiveEggs();
		for (const user of [host, guest]) {
			const visible = view(user);
			assert(!JSON.stringify(visible).includes('Magikarp'));
			assert(!JSON.stringify(visible).includes('Swift Swim'));
			for (const mon of [visible.team[1], visible.partnerTeam[1]]) {
				assert.equal(mon.species, 'Egg'); assert(!mon.shiny); assert.equal(mon.ability, '');
				assert.equal(mon.experience, null); assert.deepEqual(mon.evs, {}); assert.equal(mon.hp, 0);
			}
		}
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.equal(view(guest).partnerTeam[1].species, 'Egg');
		change(shared => { shared.adventure.phase = 'battle-selection'; });
		assert.throws(() => manager.coop.command(guest, { action: 'selectbattle', members: [member(guest).team[1].id] }), /健康队伍/);
	});
	it('requires confirmation at full capacity and protects the last hatched partner when admitting an egg', () => {
		for (let i = 0; i < 5; i++) addEgg(host, 25);
		enter('grassegg'); agree('egg'); const before = session();
		assert.throws(() => admit(host, member(host).team[1].id), /确认放生/); assert.deepEqual(session(), before);
		assert.throws(() => admit(host, member(host).team[0].id, true), /至少需要保留/);
		const target = member(host).team[1].id, bag = member(host).bag;
		admit(host, target, true); admit(guest, 'release');
		assert.equal(member(host).team.length, 6); assert(!member(host).team.some(mon => mon.id === target));
		assert.deepEqual(member(host).bag, bag); assert(!member(host).notices.join(' ').includes('Magikarp'));
		assert.equal(captures(host), 0);
	});
	it('allows the hatchery when only the guest carries an egg and hatches both party and boxed eggs', () => {
		addEgg(guest, 30); addEgg(host, 31, true); addEgg(guest, 32, true);
		enter('hatchhouse'); agree('hatch');
		assert.equal(captures(host), 1); assert.equal(captures(guest), 2);
		assert(!member(host).box[0].egg); assert(!member(guest).team[1].egg); assert(!member(guest).box[0].egg);
		assert.equal(member(guest).team[1].set.shiny, true);
		const saved = session(); assert.throws(() => choose(host, 'hatch'), /选项/); assert.deepEqual(session(), saved);
	});
	it('does not add the hatchery to the route pool for boxed eggs alone', () => {
		addEgg(guest, 30, true);
		change(shared => { shared.adventure.coopEventHistory = []; });
		const { chooseEvent } = require('../../dist/server/fantasy-rogue/events');
		const run = { floor: 12, team: member(host).team.concat(member(guest).team), box: member(guest).box, eventHistory: [] };
		assert.notEqual(chooseEvent(run, () => 0, new Set(['hatchhouse', 'grassegg'])), 'hatchhouse');
	});
	for (const checkpoint of [50, 100, 150, 200]) it(`hatches before preparing the floor ${checkpoint} content`, () => {
		addEgg(host, checkpoint); addEgg(guest, checkpoint, true);
		rest(checkpoint - 1); advance();
		assert.equal(session().adventure.floor, checkpoint);
		assert.equal(captures(host), 1); assert.equal(captures(guest), 1);
		assert(!member(host).team[1].egg); assert(!member(guest).box[0].egg);
	});
	it('keeps individual egg admission subject to current delegation and protects the partner on revocation', () => {
		enter('grassegg'); manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		choose(host, 'egg'); assert.equal(session().adventure.phase, 'blessing-reward');
		const pending = member(guest).blessings.pending[0];
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.throws(() => manager.coop.command(host, {
			action: 'blessingreward', owner: guest.id, member: pending.id, value: 'release',
		}), /只能提交自己/);
		assert.equal(member(guest).blessings.pending[0].id, pending.id);
		admit(host); admit(guest); assert.equal(member(guest).team.length, 2);
	});
	for (const path of ['floor', 'hatchery']) for (const failure of ['account', 'session']) {
		it(`rolls back ${path} hatching and both unlock records if the ${failure} write fails`, () => {
			addEgg(host, 13); addEgg(guest, 13);
			if (path === 'floor') {
				rest(12); manager.coop.command(host, { action: 'finishroute' });
			} else {
				enter('hatchhouse'); choose(host, 'hatch');
			}
			const saved = session(), accounts = [store.get(host.id), store.get(guest.id)];
			const changeAccount = store.change;
			if (failure === 'account') store.change = function (userid, ...args) {
				if (userid === guest.id) throw new Error('egg account write failed');
				return changeAccount.call(this, userid, ...args);
			};
			else store.db.exec("CREATE TEMP TRIGGER egg_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'egg session write failed'); END;");
			const finish = () => path === 'floor' ? manager.coop.command(guest, { action: 'finishroute' }) : choose(guest, 'hatch');
			try {
				assert.throws(finish, /egg .* write failed/); assert.deepEqual(session(), saved);
				assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
			} finally {
				store.change = changeAccount;
				if (failure === 'session') store.db.exec('DROP TRIGGER egg_fail');
			}
			finish(); assert.equal(captures(host), 1); assert.equal(captures(guest), 1);
		});
	}
	it('rolls back both pending gifts on a failed common event save', () => {
		enter('grassegg'); choose(host, 'egg'); const saved = session();
		store.db.exec("CREATE TEMP TRIGGER egg_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'egg write failed'); END;");
		try {
			assert.throws(() => choose(guest, 'egg'), /egg write failed/); assert.deepEqual(session(), saved);
		} finally { store.db.exec('DROP TRIGGER egg_fail'); }
		choose(guest, 'egg'); assert.equal(member(host).blessings.pending.length, 1); assert.equal(member(guest).blessings.pending.length, 1);
	});
	it('trades an unrevealed egg without rerolling it and grants its unlock only to the hatching owner', () => {
		const eggId = addEgg(host, 13); rest(12);
		change(shared => { shared.adventure.members[host.id].money = 10000; });
		const egg = member(host).team[1], requested = member(guest).team[0].id;
		assert.throws(() => manager.coop.command(host, { action: 'proposetrade', member: eggId, partnerMember: requested }), /已孵化/);
		change(shared => {
			const own = shared.adventure.members[guest.id];
			own.team.push({ ...structuredClone(own.team[0]), id: crypto.randomUUID() });
		});
		manager.coop.command(host, { action: 'proposetrade', member: eggId, partnerMember: requested });
		const proposal = view(guest).tradeProposal;
		assert.equal(proposal.offeredPokemon, 'Egg'); assert(!JSON.stringify(proposal).includes('Magikarp'));
		const send = guest.send, packets = []; guest.send = packet => packets.push(packet);
		try { manager.coop.command(guest, { action: 'respondtrade', id: proposal.id, accept: true }); } finally { guest.send = send; }
		assert.deepEqual(member(guest).team[0].egg, egg.egg); assert.equal(member(guest).team[0].id, eggId);
		assert(!packets.join(' ').includes('Magikarp')); assert(member(guest).notices.at(-1).includes('宝可梦蛋'));
		assert.equal(captures(host), 0); assert.equal(captures(guest), 0);
		advance(); assert.equal(captures(host), 0); assert.equal(captures(guest), 1);
		assert.equal(member(guest).team[0].set.shiny, true);
	});
	it('revalidates the last hatched partner before accepting a stale egg exchange', () => {
		const eggId = addEgg(host, 20); rest();
		change(shared => {
			shared.adventure.members[host.id].money = 10000;
			const own = shared.adventure.members[guest.id];
			own.team.push({ ...structuredClone(own.team[0]), id: crypto.randomUUID() });
		});
		manager.coop.command(host, { action: 'proposetrade', member: eggId, partnerMember: member(guest).team[0].id });
		const proposal = view(guest).tradeProposal;
		change(shared => { shared.adventure.members[guest.id].team.pop(); });
		const saved = session();
		assert.throws(() => manager.coop.command(guest, { action: 'respondtrade', id: proposal.id, accept: true }), /已孵化/);
		assert.deepEqual(session(), saved);
	});
});
