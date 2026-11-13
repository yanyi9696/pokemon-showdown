'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { Battle } = require('../../dist/sim/battle');
const { Teams } = require('../../dist/sim/teams');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { mysteryBallAtFloor, rollMysteryBallOutcome } = require('../../dist/server/fantasy-rogue/events');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { content, set, stats, firstEventRoute } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue shared mystery ball event', () => {
	let oldConfig, store, engine, manager, host, guest, created, items;
	let serial = 0;
	before(() => { items = createPreviewContent().items; });
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true; fixture.wildTreasures = true;
		fixture.items = [...fixture.items, ...items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		fixture.items.find(item => item.id === 'pokeball').multiplier = 1;
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-mystery-fixture' };
		} }));
		host = makeUser(`Ball Host ${++serial}`, `127.0.55.${serial}`);
		guest = makeUser(`Ball Guest ${serial}`, `127.0.56.${serial}`);
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
	const choose = (user, value) => manager.coop.command(user, { action: 'eventchoice', value });
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter() {
		change(shared => {
			shared.adventure.floor = 56;
			shared.adventure.routeChoices = [{ id: 'mysteryroute', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(id => id !== 'mysteryball')
				.map(id => ({ id, floor: 1 }));
		});
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'mysteryroute' });
		});
		assert.equal(member(host).coopEvent.id, 'mysteryball');
		assert.deepEqual(member(host).coopEvent, member(guest).coopEvent);
		assert(['pokeball', 'greatball', 'ultraball'].includes(member(host).coopEvent.ball));
	}
	function rolled(value, action) {
		const original = crypto.randomInt; let first = true;
		try {
			crypto.randomInt = max => {
				if (max === 100 && first) { first = false; return value; }
				return 0;
			};
			return action();
		} finally { crypto.randomInt = original; }
	}
	function agree(choice, roll) {
		choose(host, choice); rolled(roll, () => choose(guest, choice));
	}
	function finishBoth() {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
	}
	function claim(user, value = 'join', confirmed = false) {
		const pending = member(user).blessings.pending[0];
		manager.coop.command(user, { action: 'blessingreward', member: pending.id, value, confirmed });
	}
	it('retains the original ball tiers, outcome boundaries and gift/battle levels', () => {
		for (const [floor, first, second] of [[21, 85, 99], [56, 60, 90], [121, 40, 75]]) {
			assert.equal(mysteryBallAtFloor(floor, () => first - 1), 'pokeball');
			assert.equal(mysteryBallAtFloor(floor, () => first), 'greatball');
			assert.equal(mysteryBallAtFloor(floor, () => second), 'ultraball');
		}
		enter();
		for (const [roll, kind] of [[0, 'gift'], [39, 'gift'], [40, 'empty'], [59, 'empty'],
			[60, 'grumpy'], [69, 'grumpy'], [70, 'battle'], [99, 'battle']]) {
			let first = true;
			const outcome = rollMysteryBallOutcome(manager.coop.eventRun(session().adventure, host.id), engine.content,
				max => {
					if (max === 100 && first) { first = false; return roll; }
					return 0;
				}, 'open');
			assert.equal(outcome.kind, kind);
			if (kind === 'gift') assert.equal(outcome.pokemon.set.level, 25);
			if (kind === 'battle') assert.equal(outcome.team[0].level, 31);
		}
	});
	for (const [choice, roll, kind] of [['open', 40, 'empty'], ['open', 60, 'grumpy'],
		['leave', 0, 'supplies'], ['leave', 99, 'leave']]) {
		it(`shares and persists the ${kind} outcome without duplicate rewards`, () => {
			enter(); const before = session().adventure.members;
			agree(choice, roll);
			const first = member(host), second = member(guest);
			assert.equal(first.coopEvent.mysteryBallOutcome.kind, kind);
			assert.deepEqual(first.coopEvent.mysteryBallOutcome, second.coopEvent.mysteryBallOutcome);
			assert.equal(first.money - before[host.id].money, second.money - before[guest.id].money);
			assert.deepEqual(first.bag, second.bag);
			if (kind === 'empty') assert.equal(first.bag[first.coopEvent.ball], (before[host.id].bag[first.coopEvent.ball] || 0) + 1);
			const saved = session(); manager = new RogueManager(engine);
			assert.throws(() => choose(host, choice), /已变化/); assert.deepEqual(session(), saved);
			finishBoth(); assert.equal(session().adventure.floor, 57);
		});
	}
	it('grants matching distinct gifts with personal boosts and permanent records, preserving paused solo saves', () => {
		enter();
		change(shared => {
			shared.adventure.members[guest.id].boosts = stats(10);
			shared.adventure.members[guest.id].blessings.nextJoin = 40;
		});
		for (const user of [host, guest]) store.change(user.id, account => { account.run.difficulty = 'easy'; });
		const accounts = [store.get(host.id), store.get(guest.id)], before = session().adventure.members;
		agree('open', 0);
		assert.equal(session().adventure.phase, 'blessing-reward');
		assert.equal(session().adventure.coopBlessingResume, 'event');
		const gifts = [member(host).blessings.pending[0].pokemon, member(guest).blessings.pending[0].pokemon];
		assert.deepEqual(gifts[0].set, gifts[1].set); assert.notEqual(gifts[0].id, gifts[1].id);
		assert(gifts[1].maxhp > gifts[0].maxhp);
		assert.equal(gifts[0].joinOrder, before[host.id].blessings.nextJoin);
		assert.equal(gifts[1].joinOrder, 40);
		const starter = engine.content.unlocks[toID(gifts[0].set.species)].starter;
		for (const [i, user] of [host, guest].entries()) {
			const account = store.get(user.id);
			assert.equal(account.captures[starter], (accounts[i].captures[starter] || 0) + 1);
			assert(account.caughtSpecies.includes(toID(gifts[i].set.species)));
			assert(account.starterTraits[starter].natures.includes(toID(gifts[i].set.nature)));
			assert.deepEqual(account.run, accounts[i].run);
			claim(user);
		}
		assert.equal(session().adventure.phase, 'route-interaction');
		assert.equal(member(host).team.length, 2); assert.equal(member(guest).team.length, 2);
		finishBoth(); assert.equal(session().adventure.floor, 57);
	});
	it('requires a confirmed release for a full party and lets each player place their gift independently', () => {
		enter(); change(shared => {
			for (const user of [host, guest]) while (shared.adventure.members[user.id].team.length < 6) {
				shared.adventure.members[user.id].team.push(createRoguePokemon(set(), stats(0)));
			}
		});
		agree('open', 0);
		assert.throws(() => claim(host), /放生|队伍|选择/);
		const oldId = member(host).team[1].id, newId = member(host).blessings.pending[0].pokemon.id;
		assert.throws(() => claim(host, oldId), /确认/);
		claim(host, oldId, true);
		assert.equal(member(host).team.length, 6); assert(member(host).team.some(mon => mon.id === newId));
		assert(!member(host).team.some(mon => mon.id === oldId));
		assert.equal(session().adventure.phase, 'blessing-reward');
		claim(guest, 'release'); assert.equal(member(guest).team.length, 6);
		finishBoth(); assert.equal(session().adventure.floor, 57);
	});
	for (const failure of ['second-account', 'final-session']) {
		it(`rolls back both gift records after ${failure} fails and permits one clean retry`, () => {
			enter(); choose(host, 'open');
			const accounts = [store.get(host.id), store.get(guest.id)], before = session();
			const changeAccount = store.change, update = store.updateCoopSession, send = host.send;
			let notices = 0;
			try {
				host.send = data => { if (String(data).includes('fantasyroguecoopnotice')) notices++; };
				store.change = function (userid, ...args) {
					const result = changeAccount.call(this, userid, ...args);
					if (failure === 'second-account' && userid === guest.id) throw new Error('gift save failed');
					return result;
				};
				store.updateCoopSession = function (...args) {
					const result = update.apply(this, args);
					if (failure === 'final-session') throw new Error('gift save failed');
					return result;
				};
				assert.throws(() => rolled(0, () => choose(guest, 'open')), /gift save failed/);
				assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
				assert.equal(notices, 0);
			} finally { store.change = changeAccount; store.updateCoopSession = update; host.send = send; }
			rolled(0, () => choose(guest, 'open'));
			for (const user of [host, guest]) assert.equal(member(user).blessings.pending.length, 1);
			assert.throws(() => choose(guest, 'open'), /没有可处理/);
		});
	}
	it('creates a catchable shared wild battle and pays the same additional event supplies once', () => {
		enter(); agree('open', 70);
		assert.equal(session().adventure.phase, 'battle-selection');
		assert.equal(session().adventure.node.spiritPrepared, true);
		assert.equal(session().adventure.node.encounters[0].team[0].shiny, true);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		const state = created.rogue.state;
		assert.equal(state.catchable, true); assert.equal(state.wild, true); assert.equal(created.rogue.wild, true);
		assert.equal(state.opponentCount, 2);
		const before = session().adventure.members;
		const result = { encounterId: state.encounterId, won: true, turns: 1,
			team: state.team, partnerTeam: state.partner.team, bag: state.bag, partnerBag: state.partnerBag, defeated: [] };
		created.rogue.onResult(result);
		const first = member(host), second = member(guest);
		assert.deepEqual(first.coopEvent.battleSupplies, second.coopEvent.battleSupplies);
		assert.deepEqual(first.bag, second.bag);
		assert.equal(first.money - before[host.id].money, second.money - before[guest.id].money);
		const saved = session(); created.rogue.onResult(result); assert.deepEqual(session(), saved);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
		finishBoth(); assert.equal(session().adventure.floor, 57);
	});
	it('negotiates capture in the event, records a real p3 catch and refuses an uncatchable trainer branch', () => {
		enter(); agree('open', 70);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		const state = structuredClone(created.rogue.state);
		state.balls.find(ball => ball.id === 'pokeball').chance = 1;
		const opponents = [Teams.unpack(created.trainer.packedTeam), Teams.unpack(created.rogue.cooperative.foe)];
		for (const team of opponents) for (const mon of team) mon.moves = ['Splash'];
		const battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: host.name, team: state.team.map(mon => mon.set) }, p2: { name: 'Wild A', team: opponents[0] },
			p3: { name: guest.name, team: state.partner.team.map(mon => mon.set) }, p4: { name: 'Wild B', team: opponents[1] },
		});
		const getRoom = Rooms.get;
		try {
			for (const side of battle.sides) battle.choose(side.id, 'team 1');
			const target = { key: 'p4:0', id: battle.p4.active[0].set.fantasyRogueId, name: battle.p4.active[0].species.name };
			let started = 0;
			Rooms.get = id => id === 'battle-coop-mystery-fixture' ? { battle: {
				getCoopCaptureTarget: key => { assert.equal(key, target.key); return target; }, canStartCoopCapture: () => true,
				beginCoopCapture: (owner, ball, key, targetId) => {
					assert.equal(owner, guest.id); assert.equal(key, target.key); assert.equal(targetId, target.id);
					started++; battle.fantasyRogue.coopCapture = { ownerSide: 'p3', ball, targetSide: 'p4', targetSlot: 0, targetId };
				},
			} } : getRoom.call(Rooms, id);
			manager.coop.command(guest, { action: 'proposecapture', captureTarget: target.key, ball: 'pokeball' });
			assert.equal(started, 0);
			manager.coop.command(host, { action: 'respondcapture', id: session().adventure.captureProposal.id, value: 'accept' });
			assert.equal(started, 1);
			battle.makeChoices('pass', 'move 1', 'rogueball pokeball', 'move 1');
			const result = rogueBattleResult(battle);
			assert.equal(result.captures.length, 1); assert.equal(result.captureOwners[result.captures[0].id], 'p3');
			const accounts = [store.get(host.id), store.get(guest.id)], captured = result.captures[0];
			created.rogue.onCapture(captured, result);
			assert.equal(member(host).team.length, 1); assert.equal(member(guest).team.length, 2);
			assert.deepEqual(store.get(host.id), accounts[0]);
			assert.equal(member(guest).bag.pokeball, state.partnerBag.pokeball - 1);
			const starter = engine.content.unlocks[toID(captured.set.species)].starter;
			assert.equal(store.get(guest.id).captures[starter], (accounts[1].captures[starter] || 0) + 1);
			change(shared => { shared.adventure.node.encounters[0].catchable = false; });
			assert.throws(() => manager.coop.command(host, { action: 'proposecapture', captureTarget: target.key, ball: 'pokeball' }),
				/没有可共同捕捉/);
		} finally { Rooms.get = getRoom; battle.destroy(); }
	});
	for (const restriction of ['uncatchable', 'trainer', 'challenge']) {
		it(`keeps ${restriction} event opponents outside capture and wild AI handling`, () => {
			enter(); agree('open', 70);
			change(shared => {
				const node = shared.adventure.node;
				if (restriction === 'uncatchable') node.encounters[0].catchable = false;
				if (restriction === 'trainer') node.encounters[0].trainer = { id: 'test-trainer', name: '训练家', avatar: '1' };
				if (restriction === 'challenge') node.challenge = { tier: 'gold', cleared: false };
			});
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
			assert.equal(created.rogue.state.catchable, false); assert.equal(created.rogue.wild, false);
			assert.throws(() => manager.coop.command(host, { action: 'proposecapture', captureTarget: 'p2:0', ball: 'pokeball' }),
				/没有可共同捕捉/);
		});
	}
});
