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
const { Battle } = require('../../dist/sim/battle');
const { Teams } = require('../../dist/sim/teams');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { content, firstEventRoute } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op flute, Ditto observation and doctor gifts', () => {
	let oldConfig, store, engine, manager, host, guest, created, preview;
	let serial = 0;
	before(() => { preview = createPreviewContent(); });
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true;
		fixture.items = [...fixture.items, ...preview.items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		fixture.unlocks.snorlax = structuredClone(preview.unlocks.snorlax);
		fixture.starters.push(structuredClone(preview.starters.find(entry => entry.id === fixture.unlocks.snorlax.starter)));
		fixture.items.find(item => item.id === 'pokeball').multiplier = 1;
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-activity-fixture' };
		} }));
		host = makeUser(`Activity Host ${++serial}`, `127.0.83.${serial}`);
		guest = makeUser(`Activity Guest ${serial}`, `127.0.84.${serial}`);
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
	const choose = (user, value, visit = event(user).key) =>
		manager.coop.command(user, { action: 'eventchoice', value, visit });
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter(id, floor = 60, random) {
		change(shared => {
			shared.adventure.floor = floor;
			shared.adventure.routeChoices = [{ id: 'activityroute', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(other => other !== id)
				.map(other => ({ id: other, floor: 1 }));
			for (const user of [host, guest]) {
				const state = shared.adventure.members[user.id];
				state.money = user === host ? 10 : 1200;
				state.bag = { pokeball: user === host ? 5 : 12 };
			}
		});
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'activityroute' });
		}, random);
		assert.equal(event(host).id, id);
	}
	function agree(choice) {
		const key = event(host).key;
		choose(host, choice, key); choose(guest, choice, key);
	}
	function awaken() {
		enter('pokeflute');
		const notes = member(host).coopEvent.activity.pattern.map(note => ['低音', '中音', '高音'].indexOf(note));
		agree('listen'); for (const note of notes) agree(`note:${note}`);
		assert.equal(member(host).coopEvent.activity.step, 'awake');
	}
	function startBattle() {
		awaken(); agree('challenge');
		assert.equal(session().adventure.phase, 'battle-selection');
		assert.equal(session().adventure.node.encounters[0].team.length, 1);
		assert.equal(session().adventure.node.encounters[0].team[0].species, 'Snorlax');
		assert.deepEqual(member(host).coopEvent, member(guest).coopEvent);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
	}
	function settle(won = true, retreat = false) {
		const state = created.rogue.state;
		const result = { encounterId: state.encounterId, won, turns: 1, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag },
			defeated: [], ...(retreat ? { coopExit: 'retreat' } : {}) };
		created.rogue.onResult(result); return result;
	}
	function supplies(before) {
		for (const user of [host, guest]) {
			const state = member(user), prior = before[user.id];
			assert.equal(state.bag.ether, (prior.bag.ether || 0) + 1);
			assert.equal(state.bag.oranberry, (prior.bag.oranberry || 0) + 2);
			assert.equal(state.money - prior.money, journeyCoins(60, 400));
			assert.equal(state.coopEvent.settled, true);
		}
	}
	for (const id of ['pokeflute', 'dittoshow', 'blackjack']) {
		it(`generates ${id} through the real route pool with one persistent common state`, () => {
			enter(id);
			const first = event(host), saved = session();
			assert.deepEqual(first.paragraphs, event(guest).paragraphs);
			assert.deepEqual(first.branchOptions, event(guest).branchOptions);
			assert.equal(first.activity, undefined); assert.equal(first.expedition, undefined);
			for (let i = 0; i < 3; i++) manager.coop.view(host);
			assert.deepEqual(session(), saved);
			const replay = new RogueManager(engine, () => ({ enabled: true }));
			assert.deepEqual(replay.coop.view(host).session.adventure.coopEvent, first);
		});
		it(`requires agreement to leave ${id} and gives no gift on decline`, () => {
			enter(id); const before = session().adventure.members;
			choose(host, 'leave'); assert(!member(host).coopEvent.settled);
			manager.coop.command(host, { action: 'cancelevent', visit: event(host).key });
			assert.equal(event(host).ownChoice, null);
			agree('leave');
			for (const user of [host, guest]) {
				assert.deepEqual(member(user).bag, before[user.id].bag);
				assert.equal(member(user).money, before[user.id].money);
				manager.coop.command(user, { action: 'finishroute' });
			}
			assert.equal(session().adventure.floor, 61);
		});
	}
	it('retains the native floor 60 flute eligibility', () => {
		const run = { floor: 59, team: member(host).team, eventHistory: [] };
		assert.notEqual(chooseEvent(run, () => 0, new Set(['pokeflute', 'dittoshow'])), 'pokeflute');
		run.floor = 60;
		assert.equal(chooseEvent(run, () => 0, new Set(['pokeflute'])), 'pokeflute');
	});
	it('advances each flute note only after consensus and rejects stale votes and stale cancellation', () => {
		enter('pokeflute'); const initial = event(host).key;
		const note = ['低音', '中音', '高音'].indexOf(member(host).coopEvent.activity.pattern[0]);
		assert.throws(() => choose(host, `note:${note}`), /共同分支/);
		agree('listen');
		assert.throws(() => choose(host, 'listen', initial), /进度已变化/);
		assert.throws(() => manager.coop.command(host, { action: 'cancelevent', visit: initial }), /进度已变化/);
		const key = event(host).key;
		choose(host, `note:${note}`); choose(guest, 'leave');
		assert.equal(member(host).coopEvent.activity.index, 0);
		choose(guest, `note:${note}`);
		assert.equal(member(host).coopEvent.activity.index, 1);
		assert.equal(event(host).ownChoice, null); assert.equal(event(guest).ownChoice, null);
		assert.throws(() => choose(guest, `note:${note}`, key), /进度已变化/);
		assert.equal(event(host).key, event(guest).key);
	});
	it('finishes a wrong flute note without reward or allowing a retry', () => {
		enter('pokeflute'); const before = session().adventure.members;
		const wrong = (['低音', '中音', '高音'].indexOf(member(host).coopEvent.activity.pattern[0]) + 1) % 3;
		agree('listen'); agree(`note:${wrong}`);
		assert(member(host).coopEvent.settled);
		assert.deepEqual(member(host).bag, before[host.id].bag);
		assert.deepEqual(member(guest).bag, before[guest.id].bag);
		assert.throws(() => choose(host, 'listen'), /选项已变化/);
	});
	it('gives each player the original flute thanks once while keeping wallets separate', () => {
		awaken(); const before = session().adventure.members, solo = store.get(host.id).run;
		agree('thanks'); supplies(before);
		assert.deepEqual(store.get(host.id).run, solo);
		const saved = session(); assert.throws(() => choose(host, 'thanks'), /选项已变化/);
		assert.deepEqual(session(), saved);
	});
	for (const correct of [true, false]) it(`settles the common Ditto ${correct ? 'correct' : 'wrong'} observation`, () => {
		enter('dittoshow'); const before = session().adventure.members;
		const index = member(host).coopEvent.activity.index;
		agree(`identify:${correct ? index : (index + 1) % 3}`);
		if (correct) supplies(before);
		else for (const user of [host, guest]) {
			assert.deepEqual(member(user).bag, before[user.id].bag);
			assert.equal(member(user).money, before[user.id].money);
		}
	});
	it('shares Smeargle demonstrations, requires agreement and gives each owner exactly one selected TM', () => {
		enter('dittoshow', 60, n => n === 100 ? 99 : 0);
		assert.equal(member(host).coopEvent.activity.step, 'smeargle');
		const before = structuredClone(session().adventure.members), first = event(host);
		assert.deepEqual(first.observation, event(guest).observation);
		assert.deepEqual(first.branchOptions.map(o => o.id), ['astonished']);
		assert(!JSON.stringify(first).includes('"index"'));
		agree('astonished');
		assert(event(host).paragraphs.join('').includes('没办法判断'));
		assert(event(host).branchOptions.some(o => o.id === 'machine:protect'));
		const step = event(host).key;
		choose(host, 'machine:protect'); choose(guest, 'machine:icebeam');
		assert.equal(member(host).bag.roguetmprotect, undefined);
		const reconnect = new RogueManager(engine, () => ({ enabled: true }));
		assert.deepEqual(reconnect.coop.view(guest).session.adventure.coopEvent, event(guest));
		choose(guest, 'machine:protect');
		for (const user of [host, guest]) {
			assert.equal(member(user).bag.roguetmprotect, 1);
			assert.equal(member(user).bag.roguetmicebeam, undefined);
			assert.equal(member(user).money, before[user.id].money);
			assert.deepEqual(member(user).team, before[user.id].team);
			assert(member(user).coopEvent.settled);
			assert.throws(() => choose(user, 'machine:protect', step), /进度已变化|选项已变化/);
			manager.coop.command(user, { action: 'finishroute' });
		}
		assert.equal(session().adventure.floor, 61);
	});
	it('preserves shared specimen history and avoids the previous normal trio', () => {
		enter('dittoshow');
		const first = event(host).observation.map(model => model.species);
		assert.deepEqual(session().adventure.coopEventHistory.at(-1).observation, first);
		agree('leave');
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		enter('dittoshow', 62);
		// enter() deliberately creates a fresh route history; install a prior saved specimen record before native initialization.
		const { beginCoopActivity } = require('../../dist/server/fantasy-rogue/coop-activities');
		const run = { floor: 62, eventHistory: [{ id: 'dittoshow', floor: 60, observation: first }, { id: 'dittoshow', floor: 62 }],
			node: { event: { id: 'dittoshow', stage: 'choice' } } };
		beginCoopActivity(run, () => 0);
		assert(!run.node.event.activity.observation.some(model => first.includes(model.species)));
	});
	it('rolls back both selected TMs on a session write failure and allows one safe retry', () => {
		enter('dittoshow', 60, n => n === 100 ? 99 : 0); agree('astonished'); choose(host, 'machine:protect');
		const before = session();
		store.db.exec("CREATE TEMP TRIGGER ditto_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'ditto write failed'); END;");
		try {
			assert.throws(() => choose(guest, 'machine:protect'), /ditto write failed/);
			assert.deepEqual(session(), before);
		} finally { store.db.exec('DROP TRIGGER ditto_fail'); }
		choose(guest, 'machine:protect');
		assert.equal(member(host).bag.roguetmprotect, 1); assert.equal(member(guest).bag.roguetmprotect, 1);
	});
	for (const [key, item, count] of [['revive', 'revive', 2], ['capsule', 'abilitycapsule', 1], ['patch', 'abilitypatch', 1]]) {
		it(`shares the doctor's ${key} branch and gives the native quantity to both players`, () => {
			enter('blackjack'); const before = session().adventure.members;
			assert.throws(() => choose(host, `doctor:${key}`), /共同分支/);
			agree('talk'); assert(!event(host).branchResolved);
			assert.deepEqual(event(host).branchOptions.map(option => option.id), ['doctor:revive', 'doctor:capsule', 'doctor:patch']);
			agree(`doctor:${key}`);
			for (const user of [host, guest]) {
				assert.equal(member(user).bag[item], count);
				assert.equal(member(user).money, before[user.id].money);
				assert(member(user).coopEvent.settled);
			}
		});
	}
	it('supports reversible delegation for every shared step without owner overrides', () => {
		enter('blackjack');
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		choose(host, 'talk'); assert.equal(member(guest).coopEvent.expedition.step, 'reply');
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		choose(host, 'doctor:patch'); assert.equal(member(guest).bag.abilitypatch, undefined);
		choose(guest, 'doctor:patch'); assert.equal(member(guest).bag.abilitypatch, 1);
	});
	it('refuses missing visits, forged answers and mismatched private puzzle state', () => {
		enter('dittoshow');
		assert.throws(() => manager.coop.command(host, { action: 'eventchoice', value: 'identify:0' }), /进度已变化/);
		assert.throws(() => choose(host, 'identify:3'), /共同分支/);
		change(shared => {
			shared.adventure.members[guest.id].coopEvent.activity.index =
				(shared.adventure.members[host.id].coopEvent.activity.index + 1) % 3;
		});
		assert.equal(event(host).branchOptions.length, 0);
		assert.throws(() => choose(host, 'identify:0'), /共同分支/);
	});
	it('rolls back both gifts, progress and notifications on a failed session write', () => {
		enter('blackjack'); agree('talk'); choose(host, 'doctor:patch');
		const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		const send = host.send;
		let notified = 0; host.send = () => { notified++; };
		store.db.exec("CREATE TEMP TRIGGER activity_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'activity write failed'); END;");
		try {
			assert.throws(() => choose(guest, 'doctor:patch'), /activity write failed/);
			assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
			assert.equal(notified, 0);
		} finally { store.db.exec('DROP TRIGGER activity_fail'); host.send = send; }
		choose(guest, 'doctor:patch'); assert.equal(member(host).bag.abilitypatch, 1);
	});
	it('rejects overflowing inventory without crediting the other player', () => {
		enter('blackjack'); agree('talk');
		change(shared => { shared.adventure.members[guest.id].bag.abilitypatch = Number.MAX_SAFE_INTEGER; });
		choose(host, 'doctor:patch'); const saved = session();
		assert.throws(() => choose(guest, 'doctor:patch'), /超出可保存范围/);
		assert.deepEqual(session(), saved);
	});
	it('initializes the flute melody once and does not reveal a raw answer field', () => {
		const random = crypto.randomInt; let notes = 0;
		try {
			crypto.randomInt = max => max === 3 ? notes++ % 3 : 0;
			enter('pokeflute', 60, crypto.randomInt); assert.equal(notes, 3);
			assert.deepEqual(member(host).coopEvent.activity.pattern, ['低音', '中音', '高音']);
			agree('listen'); agree('note:0'); assert.equal(notes, 3);
			const visible = JSON.stringify(event(guest));
			assert(!visible.includes('pattern')); assert(!visible.includes('activity'));
		} finally { crypto.randomInt = random; }
	});
	for (const won of [true, false]) it(`settles the flute challenge ${won ? 'win' : 'loss'} without double rewards`, () => {
		startBattle(); const before = session().adventure.members;
		const result = settle(won);
		assert(session().adventure.battleResult.eventResolved);
		if (won) supplies(before);
		else for (const user of [host, guest]) assert.deepEqual(member(user).bag, before[user.id].bag);
		const saved = session(); created.rogue.onResult(result); assert.deepEqual(session(), saved);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
		assert.equal(session().adventure.phase, 'route-interaction');
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 61);
	});
	it('keeps the flute challenge and consumed resources when retreating before retry', () => {
		startBattle(); const before = session().adventure.members;
		created.rogue.state.partnerBag.pokeball--;
		settle(false, true);
		assert(!session().adventure.battleResult.eventResolved);
		assert.equal(member(guest).bag.pokeball, before[guest.id].bag.pokeball - 1);
		assert.equal(member(host).bag.ether, undefined);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'retrybattle' });
		assert.equal(session().adventure.phase, 'battle-selection');
		assert.equal(session().adventure.node.encounters[0].team.length, 1);
		assert(!member(host).coopEvent.settled);
	});
	for (const seat of ['p2', 'p4']) it(`negotiates a real ${seat} flute capture and settles gifts without duplicating the catch`, () => {
		startBattle();
		const state = structuredClone(created.rogue.state);
		assert(state.catchable); assert(created.rogue.wild);
		// The existing Multi adapter expands a single wild set to two opponents.
		assert.equal(state.opponentCount, 2);
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
			const target = { key: `${seat}:0`, id: battle[seat].active[0].set.fantasyRogueId, name: 'Snorlax' };
			let started = 0;
			Rooms.get = id => id === 'battle-coop-activity-fixture' ? { battle: {
				getCoopCaptureTarget: key => { assert.equal(key, target.key); return target; }, canStartCoopCapture: () => true,
				beginCoopCapture: (owner, ball, key, targetId) => {
					assert.equal(owner, guest.id); assert.equal(key, target.key); assert.equal(targetId, target.id);
					started++; battle.fantasyRogue.coopCapture = { ownerSide: 'p3', ball, targetSide: seat, targetSlot: 0, targetId };
				},
			} } : getRoom.call(Rooms, id);
			manager.coop.command(guest, { action: 'proposecapture', captureTarget: target.key, ball: 'pokeball' });
			assert.equal(started, 0);
			manager.coop.command(host, { action: 'respondcapture', id: session().adventure.captureProposal.id, value: 'accept' });
			assert.equal(started, 1);
			battle.makeChoices('pass', 'move 1', 'rogueball pokeball', 'move 1');
			assert(!battle.log.some(line => /^\|move\|p[13]/.test(line)));
			const result = rogueBattleResult(battle), captured = result.captures[0];
			assert.equal(result.captures.length, 1); assert.equal(result.captureOwners[captured.id], 'p3');
			const accounts = [store.get(host.id), store.get(guest.id)], before = session().adventure.members;
			created.rogue.onCapture(captured, result);
			assert.equal(member(host).team.length, 1); assert.equal(member(guest).team.length, 2);
			assert.equal(member(guest).bag.pokeball, state.partnerBag.pokeball - 1);
			assert.equal(member(host).bag.pokeball, state.bag.pokeball);
			const remaining = battle[seat === 'p2' ? 'p4' : 'p2'].active[0];
			battle.damage(remaining.hp, remaining); battle.faintMessages();
			assert(battle.ended);
			const final = rogueBattleResult(battle); assert(final.won);
			created.rogue.onResult(final); supplies(before);
			assert.equal(member(guest).team.length, 2);
			const starter = engine.content.unlocks.snorlax.starter;
			assert.equal(store.get(guest.id).captures[starter], (accounts[1].captures[starter] || 0) + 1);
			assert.equal(store.get(host.id).captures[starter] || 0, accounts[0].captures[starter] || 0);
			const saved = session(); created.rogue.onCapture(captured, result); created.rogue.onResult(final);
			assert.deepEqual(session(), saved);
		} finally { Rooms.get = getRoom; battle.destroy(); }
	});
});
