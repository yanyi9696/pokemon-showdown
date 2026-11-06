'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { chooseEvent } = require('../../dist/server/fantasy-rogue/events');
const { journeyCoins } = require('../../dist/server/fantasy-rogue/early-balance');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { Battle } = require('../../dist/sim/battle');
const { Teams } = require('../../dist/sim/teams');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op breeder, martial master and eight-turn activity battles', () => {
	let oldConfig, store, engine, manager, host, guest, created, preview;
	let serial = 0;
	before(() => { preview = createPreviewContent(); });
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true;
		fixture.items = [...fixture.items, ...preview.items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		for (const id of ['rockruffdusk', 'kubfu']) {
			fixture.unlocks[id] = structuredClone(preview.unlocks[id]);
			fixture.starters.push(structuredClone(preview.starters.find(entry => entry.id === fixture.unlocks[id].starter)));
		}
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-activity-battles-fixture' };
		} }));
		host = makeUser(`Act Host ${++serial}`, `127.0.85.${serial}`);
		guest = makeUser(`Act Guest ${serial}`, `127.0.86.${serial}`);
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
	const event = user => manager.coop.view(user).session.adventure.coopEvent;
	const choose = (user, value, visit = event(user).key) => manager.coop.command(user, { action: 'eventchoice', value, visit });
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter(id, floor = 61) {
		change(shared => {
			shared.adventure.floor = floor; shared.adventure.phase = 'area-selection';
			shared.areaSelections = { [host.id]: null, [guest.id]: null };
			shared.adventure.routeChoices = [{ id: 'activityroute', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(other => other !== id)
				.map(other => ({ id: other, floor: 1 }));
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'activityroute' });
		assert.equal(event(host).id, id);
	}
	function agree(choice) {
		const key = event(host).key; choose(host, choice, key); choose(guest, choice, key);
	}
	function start(id) {
		enter(id); agree('accept');
		assert.equal(session().adventure.phase, 'battle-selection');
		assert.deepEqual(member(host).coopEvent, member(guest).coopEvent);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		assert(created.rogue.cooperative); assert.equal(created.rogue.state.catchable, false);
	}
	function result(won = true, turns = 1, retreat = false) {
		const state = created.rogue.state;
		return { encounterId: state.encounterId, won, turns, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag },
			defeated: [], ...(retreat ? { coopExit: 'retreat' } : {}) };
	}
	function settle(won = true, turns = 1, retreat = false) {
		const outcome = result(won, turns, retreat); created.rogue.onResult(outcome); return outcome;
	}
	function admit(user, value = 'join', confirmed = false) {
		const pending = member(user).blessings.pending[0];
		return manager.coop.command(user, { action: 'blessingreward', member: pending.id, value, confirmed });
	}
	for (const id of ['duskbreeder', 'kubfumaster', 'repelwave']) {
		it(`offers ${id} through the real pool, preserves it across reloads and requires consensus`, () => {
			enter(id); const saved = session(), visible = event(host);
			assert.deepEqual(visible.branchOptions, event(guest).branchOptions);
			assert.deepEqual(manager.coop.view(host).session.adventure.coopEvent, visible);
			assert.deepEqual(session(), saved);
			choose(host, 'accept'); assert.equal(session().adventure.phase, 'route-interaction');
			choose(guest, 'leave'); assert.equal(session().adventure.phase, 'route-interaction');
			manager.coop.command(host, { action: 'cancelevent', visit: event(host).key });
			assert.equal(event(host).ownChoice, null);
			choose(host, 'accept'); choose(guest, 'accept');
			assert.equal(session().adventure.phase, 'battle-selection');
			assert.equal(session().adventure.node.encounters[0].team.length, id === 'repelwave' ? 2 : 3);
			assert.throws(() => choose(host, 'accept', visible.key));
		});
		it(`declines ${id} without costs, rewards or claim flags`, () => {
			enter(id); const before = session().adventure.members; agree('leave');
			for (const user of [host, guest]) {
				assert.deepEqual(member(user).bag, before[user.id].bag);
				assert.equal(member(user).money, before[user.id].money);
				assert.equal(member(user).activityClaims, undefined);
				manager.coop.command(user, { action: 'finishroute' });
			}
			assert.equal(session().adventure.floor, 62);
		});
		it(`ends a lost ${id} without awarding a win prize or allowing duplicate settlement`, () => {
			start(id); const before = session().adventure.members;
			const outcome = settle(false);
			assert(session().adventure.battleResult.eventResolved);
			for (const user of [host, guest]) {
				assert.deepEqual(member(user).bag, before[user.id].bag);
				assert.equal(member(user).activityClaims, undefined);
				assert(!member(user).blessings.pending.length);
			}
			const after = session(); created.rogue.onResult(outcome); assert.deepEqual(session(), after);
			for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
			assert.equal(session().adventure.phase, 'route-interaction');
		});
		it(`retreats from ${id} with actual HP, PP and bag costs retained and the same opponents on retry`, () => {
			start(id); const enemies = session().adventure.node.encounters;
			const outcome = result(false, 3, true), mon = outcome.partnerTeam[0];
			mon.hp--; mon.pp[0].pp--; outcome.partnerBag.pokeball--;
			created.rogue.onResult(outcome);
			assert(!session().adventure.battleResult.eventResolved);
			assert.equal(member(guest).team[0].hp, mon.hp); assert.deepEqual(member(guest).team[0].pp, mon.pp);
			assert.equal(member(guest).bag.pokeball, outcome.partnerBag.pokeball);
			assert(!member(host).blessings.pending.length); assert(!member(host).coopEvent.settled);
			for (const user of [host, guest]) manager.coop.command(user, { action: 'retrybattle' });
			assert.equal(session().adventure.phase, 'battle-selection');
			assert.deepEqual(session().adventure.node.encounters, enemies);
		});
	}
	it('keeps native floor gates and excludes a claimed gift only when both players have claimed it', () => {
		const run = { floor: 19, team: member(host).team, eventHistory: [] };
		assert.throws(() => chooseEvent(run, () => 0, new Set(['repelwave'])));
		run.floor = 20; assert.equal(chooseEvent(run, () => 0, new Set(['repelwave'])), 'repelwave');
		run.floor = 50; assert.throws(() => chooseEvent(run, () => 0, new Set(['kubfumaster'])));
		run.floor = 51; assert.equal(chooseEvent(run, () => 0, new Set(['kubfumaster'])), 'kubfumaster');
		for (const id of ['duskbreeder', 'kubfumaster']) {
			run.activityClaims = [id];
			assert.equal(chooseEvent(run, () => 0, new Set([id]), [{ ...run, activityClaims: [] }]), id);
			assert.throws(() => chooseEvent(run, () => 0, new Set([id]), [{ ...run }]));
		}
	});
	for (const [id, species, unlock] of [['duskbreeder', 'Rockruff-Dusk', 'rockruffdusk'], ['kubfumaster', 'Kubfu', 'kubfu']]) {
		it(`awards the same ${species} offer once to both accounts and keeps personal saves and IDs separate`, () => {
			for (const user of [host, guest]) store.change(user.id, account => { account.captures[unlock] = preview.unlocks[unlock].captures - 1; });
			start(id); const before = [store.get(host.id), store.get(guest.id)];
			const outcome = settle();
			assert.equal(session().adventure.phase, 'blessing-reward');
			const offers = [member(host).blessings.pending[0].pokemon, member(guest).blessings.pending[0].pokemon];
			assert.notEqual(offers[0].id, offers[1].id);
			assert.deepEqual(offers[0].set, offers[1].set); assert.equal(offers[0].set.species, species);
			for (const [i, user] of [host, guest].entries()) {
				const account = store.get(user.id);
				assert.equal(account.captures[unlock], before[i].captures[unlock] + 1);
				assert(account.unlocked.includes(unlock)); assert.deepEqual(account.run, before[i].run);
				assert.deepEqual(member(user).activityClaims, [id]);
				admit(user);
			}
			assert.equal(member(host).team[1].set.species, species); assert.equal(member(guest).team[1].set.species, species);
			assert.equal(session().adventure.phase, 'settlement');
			const saved = session(), accounts = [store.get(host.id), store.get(guest.id)];
			created.rogue.onResult(outcome); assert.deepEqual(session(), saved);
			assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
			for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
			for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
			assert.equal(session().adventure.floor, 62);
			for (const user of [host, guest]) assert.deepEqual(member(user).activityClaims, [id]);
		});
	}
	for (const turns of [1, 8, 9]) it(`uses trusted turn ${turns} for the eight-turn victory reward`, () => {
		start('repelwave'); const before = session().adventure.members; settle(true, turns);
		for (const user of [host, guest]) {
			const state = member(user), old = before[user.id];
			assert(state.coopEvent.settled); assert.equal(state.coopEvent.activity.lastTurns, turns);
			assert.equal(state.money - old.money, turns <= 8 ? journeyCoins(61, 405) : 0);
			assert.equal((state.bag.ether || 0) - (old.bag.ether || 0), turns <= 8 ? 1 : 0);
			assert.equal((state.bag.oranberry || 0) - (old.bag.oranberry || 0), turns <= 8 ? 2 : 0);
			assert.equal(state.coopEvent.trainingAidBlocked, turns <= 8 ? undefined : true);
		}
	});
	it('does not grant another gift to a previously rewarded player accompanying an unclaimed partner', () => {
		change(shared => { shared.adventure.members[host.id].activityClaims = ['duskbreeder']; });
		start('duskbreeder'); const account = store.get(host.id); settle();
		assert(!member(host).blessings.pending.length); assert.equal(member(guest).blessings.pending.length, 1);
		assert.deepEqual(store.get(host.id).captures, account.captures);
		assert.deepEqual(member(host).activityClaims, ['duskbreeder']);
	});
	it('retains the native level-three breeder gift when this event appears on the first floor', () => {
		enter('duskbreeder', 1); agree('accept');
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		settle();
		for (const user of [host, guest]) assert.equal(member(user).blessings.pending[0].pokemon.set.level, 3);
	});
	it('rechecks both claim records before accepting an old shared choice', () => {
		enter('duskbreeder'); choose(host, 'accept');
		change(shared => {
			for (const user of [host, guest]) shared.adventure.members[user.id].activityClaims = ['duskbreeder'];
		});
		const saved = session(); assert.throws(() => choose(guest, 'accept'), /共同分支/);
		assert.deepEqual(session(), saved); agree('leave');
		assert.equal(member(host).coopEvent.settled, true);
	});
	it('rolls back both rewards when either inventory would exceed the safe integer range', () => {
		change(shared => { shared.adventure.members[guest.id].bag.oranberry = Number.MAX_SAFE_INTEGER; });
		start('repelwave'); const saved = session(), accounts = [store.get(host.id), store.get(guest.id)];
		assert.throws(() => settle(), /超出可保存范围/);
		assert.deepEqual(session(), saved); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
	});
	it('requires confirmation to release a full-team member before accepting a gifted partner', () => {
		change(shared => {
			const own = shared.adventure.members[host.id];
			while (own.team.length < 6) own.team.push(createRoguePokemon(own.team[0].set, own.boosts, crypto.randomUUID()));
		});
		start('duskbreeder'); settle(); const old = member(host).team;
		assert.throws(() => admit(host), /放生|已满|上限/);
		assert.throws(() => admit(host, old[1].id), /确认/);
		admit(host, old[1].id, true); admit(guest);
		assert.equal(member(host).team.length, 6); assert(!member(host).team.some(mon => mon.id === old[1].id));
		assert(member(host).team.some(mon => mon.set.species === 'Rockruff-Dusk'));
		assert.equal(member(guest).team.length, 2);
	});
	it('rolls back both account unlocks and gifts if persisting the shared result fails', () => {
		start('kubfumaster'); const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec("CREATE TEMP TRIGGER activity_result_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'activity result write failed'); END;");
		try {
			assert.throws(() => settle(), /activity result write failed/);
			assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		} finally { store.db.exec('DROP TRIGGER activity_result_fail'); }
		settle(); assert.equal(member(host).blessings.pending.length, 1); assert.equal(member(guest).blessings.pending.length, 1);
	});
	it('rejects missing, negative and noninteger turn counts without writing either player', () => {
		start('repelwave'); const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		for (const turns of [undefined, -1, 1.5, Infinity]) {
			const outcome = result(); outcome.turns = turns;
			assert.throws(() => created.rogue.onResult(outcome), /可信回合数/);
			assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		}
	});
	it('clears stale common votes when delegated control changes and lets the controller accept once', () => {
		enter('repelwave'); choose(host, 'accept');
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.equal(event(host).ownChoice, null);
		assert.throws(() => choose(host, 'accept'), /操作权/);
		choose(guest, 'accept'); assert.equal(session().adventure.phase, 'battle-selection');
	});
	it('settles a real four-seat eight-turn battle using the simulator result', () => {
		start('repelwave'); const state = structuredClone(created.rogue.state);
		const teams = [state.team.map(mon => mon.set), Teams.unpack(created.trainer.packedTeam),
			state.partner.team.map(mon => mon.set), Teams.unpack(created.rogue.cooperative.foe)];
		for (const team of teams) for (const mon of team) mon.moves = ['Splash'];
		const battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: host.name, team: teams[0] }, p2: { name: 'Guard A', team: teams[1] },
			p3: { name: guest.name, team: teams[2] }, p4: { name: 'Guard B', team: teams[3] },
		});
		try {
			for (const side of battle.sides) battle.choose(side.id, 'team 1');
			while (battle.turn < 8) battle.makeChoices('move 1', 'move 1', 'move 1', 'move 1');
			for (const side of [battle.p2, battle.p4]) for (const mon of side.pokemon) battle.damage(mon.hp, mon);
			battle.faintMessages(); assert(battle.ended);
			const outcome = rogueBattleResult(battle); assert(outcome.won); assert.equal(outcome.turns, 8);
			created.rogue.onResult(outcome);
			for (const user of [host, guest]) assert.equal(member(user).bag.ether, 1);
		} finally { battle.destroy(); }
	});
});
