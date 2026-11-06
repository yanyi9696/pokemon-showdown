'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { chooseEventOption, eventView } = require('../../dist/server/fantasy-rogue/events');
const expedition = require('../../dist/server/fantasy-rogue/expedition-events');
const { journeyCoins } = require('../../dist/server/fantasy-rogue/early-balance');
const { Battle } = require('../../dist/sim/battle');
const { Teams } = require('../../dist/sim/teams');
const { Dex } = require('../../dist/sim/dex');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op silhouette quiz and relic puzzles', () => {
	let oldConfig, store, engine, manager, host, guest, created, preview;
	let serial = 0;
	before(() => { preview = createPreviewContent(); });
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true;
		fixture.items = [...fixture.items, ...preview.items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-puzzle-fixture' };
		} }));
		host = makeUser(`Puzzle Host ${++serial}`, `127.0.91.${serial}`);
		guest = makeUser(`Puzzle Guest ${serial}`, `127.0.92.${serial}`);
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
			for (const user of [host, guest]) {
				const state = shared.adventure.members[user.id];
				state.blessings.round = structuredClone(round); state.money = user === host ? 2000 : 3000;
				state.bag = { pokeball: 10 };
			}
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
	const view = (user = host) => manager.coop.view(user).session.adventure.coopEvent;
	const choose = (user, value, visit = view().key) => manager.coop.command(user, { action: 'eventchoice', value, visit });
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter(id, floor = 70) {
		change(shared => {
			shared.adventure.floor = floor;
			shared.adventure.routeChoices = [{ id: 'puzzleroute', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(other => other !== id)
				.map(other => ({ id: other, floor: 1 }));
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'puzzleroute' });
		assert.equal(view().id, id);
	}
	function agree(choice) {
		const key = view().key;
		choose(host, choice, key); choose(guest, choice, key);
	}
	function finish() {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
	}
	function question(species = 'Bulbasaur') {
		assert(Dex.mod('gen9fantasy').species.get(species).exists);
		enter('identityquiz'); agree('enter');
		change(shared => {
			const state = { step: 'name', target: species, answers: ['Bulbasaur', 'Charmander', 'Squirtle', 'Pikachu'] };
			state.answers[0] = Dex.mod('gen9fantasy').species.get(species).baseSpecies;
			shared.adventure.node.event.expedition = structuredClone(state);
			for (const user of [host, guest]) shared.adventure.members[user.id].coopEvent.expedition = structuredClone(state);
		});
	}
	function quizChallenge() {
		question('Raticate-Fantasy'); agree('answer:0');
		assert.equal(member(host).coopEvent.expedition.step, 'type');
		agree('type:Normal'); agree('confirmtypes'); agree('fight');
		assert.equal(session().adventure.phase, 'battle-selection');
		assert.equal(session().adventure.node.encounters[0].team.length, 2);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
	}
	function settle(won = true, retreat = false) {
		const state = created.rogue.state;
		const result = { encounterId: state.encounterId, won, turns: 1, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag },
			defeated: [], ...(retreat ? { coopExit: 'retreat' } : {}) };
		created.rogue.onResult(result); return result;
	}
	function relicTeam() {
		change(shared => {
			Object.assign(shared.adventure.members[host.id].team[0].set, {
				species: 'Charizard', ability: 'Blaze', moves: ['Flamethrower'],
			});
			Object.assign(shared.adventure.members[guest.id].team[0].set, {
				species: 'Gyarados', ability: 'Intimidate', moves: ['Waterfall', 'Bounce'],
			});
		});
	}
	for (const id of ['identityquiz', 'relicpuzzle']) {
		it(`selects ${id} through the real pool and preserves identical visible steps across reconnects`, () => {
			enter(id); const before = session(), shown = view();
			assert.deepEqual(shown.branchOptions, view(guest).branchOptions);
			assert.deepEqual(shown.paragraphs, view(guest).paragraphs);
			manager.coop.view(host); manager.coop.view(guest); assert.deepEqual(session(), before);
			assert.deepEqual(new RogueManager(engine).coop.view(host).session.adventure.coopEvent, shown);
			assert(!JSON.stringify(shown).includes('expedition')); assert(!JSON.stringify(shown).includes('activity'));
		});
		it(`requires the current visit, agreement and cancellation before leaving ${id}`, () => {
			enter(id); const before = session().adventure.members;
			assert.throws(() => manager.coop.command(host, { action: 'eventchoice', value: 'leave' }), /活动进度已变化/);
			choose(host, 'leave'); assert(!member(host).coopEvent.settled);
			manager.coop.command(host, { action: 'cancelevent', visit: view().key }); assert.equal(view().ownChoice, null);
			agree('leave');
			for (const user of [host, guest]) {
				assert.equal(member(user).money, before[user.id].money); assert.deepEqual(member(user).bag, before[user.id].bag);
			}
			assert.throws(() => choose(host, 'leave', 'earlier-visit'), /活动进度已变化/);
			finish(); assert.equal(session().adventure.floor, 71);
		});
	}
	for (const poor of ['host', 'guest']) it(`does not enroll or debit either player when ${poor} cannot pay`, () => {
		enter('identityquiz'); const user = poor === 'host' ? host : guest;
		change(shared => { shared.adventure.members[user.id].money = 289; });
		const before = session(); assert(view().branchOptions.find(option => option.id === 'enter').disabled);
		assert.throws(() => choose(host, 'enter'), /共同分支/); assert.deepEqual(session(), before);
		agree('leave'); assert.equal(member(user).money, 289);
	});
	it('charges the native fee to both wallets once and draws only one persistent common question', () => {
		enter('identityquiz'); const key = view().key, random = crypto.randomInt;
		const expectedCalls = [], actualCalls = [];
		const expectedQuestion = expedition.rollIdentityQuestion({ floor: 70 }, max => { expectedCalls.push(max); return 0; });
		try {
			crypto.randomInt = max => { actualCalls.push(max); return 0; };
			choose(host, 'enter'); assert.equal(member(host).money, 2000); assert.equal(actualCalls.length, 0);
			choose(guest, 'enter'); assert.deepEqual(actualCalls, expectedCalls);
			assert.equal(member(host).money, 1710); assert.equal(member(guest).money, 2710);
			assert.deepEqual(member(host).coopEvent.expedition, member(guest).coopEvent.expedition);
			assert.deepEqual(member(host).coopEvent.expedition, { ...expectedQuestion, step: 'name' });
			assert.equal(view().silhouette, member(host).coopEvent.expedition.target);
			assert.deepEqual(view().branchOptions, view(guest).branchOptions);
			assert.throws(() => choose(host, 'enter', key), /活动进度已变化/);
			manager = new RogueManager(engine); manager.coop.view(host); assert.deepEqual(actualCalls, expectedCalls);
			assert.equal(member(host).shoppingSpend, undefined);
		} finally { crypto.randomInt = random; }
	});
	it('rechecks both balances after the first vote and never draws an unpaid question', () => {
		enter('identityquiz'); choose(host, 'enter');
		change(shared => { shared.adventure.members[guest.id].money = 0; });
		const before = session(); assert.throws(() => choose(guest, 'enter'), /共同分支/);
		assert.deepEqual(session(), before); assert.deepEqual(member(host).coopEvent.expedition, {});
	});
	for (const correct of [true, false]) it(`settles a ${correct ? 'correct' : 'wrong'} ordinary answer without another debit`, () => {
		question(); const key = view().key;
		agree(correct ? 'answer:0' : 'answer:1');
		assert(view().branchResolved); assert(!view().silhouette);
		for (const [i, user] of [host, guest].entries()) {
			assert.equal(member(user).money, 2000 + i * 1000 - 290 + (correct ? 580 : 0));
			assert.equal(member(user).bag.superpotion || 0, correct ? 2 : 0);
		}
		const saved = session(); assert.throws(() => choose(host, 'answer:0', key), /活动进度已变化/);
		assert.deepEqual(session(), saved); finish(); assert.equal(session().adventure.floor, 71);
	});
	it('shares fantasy type selections, rejects stale or duplicate types and permits leaving the challenge', () => {
		question('Raticate-Fantasy'); agree('answer:0'); const first = view().key;
		agree('type:Poison'); assert(!view().branchResolved);
		assert.throws(() => choose(guest, 'type:Water', first), /活动进度已变化/);
		assert.throws(() => choose(host, 'type:Poison'), /共同分支/);
		agree('type:Water'); assert(view().branchOptions.filter(option => option.id.startsWith('type:')).every(o => o.disabled));
		agree('confirmtypes'); assert.equal(member(host).coopEvent.expedition.step, 'fight');
		agree('leave'); assert.equal(member(host).money, 1710); assert.equal(member(guest).money, 2710);
		assert.equal(member(host).bag.ether, undefined); finish();
	});
	it('clears unpaid and answer votes on delegation changes while allowing the controller to act for both', () => {
		enter('identityquiz'); choose(host, 'enter');
		manager.coop.command(host, { action: 'delegate', value: 'partner' }); assert.equal(view().ownChoice, null);
		assert.throws(() => choose(host, 'enter'), /移交/);
		choose(guest, 'enter'); assert.equal(member(host).money, 1710);
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		choose(guest, 'answer:0'); assert(!view().branchResolved);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert.equal(view(guest).ownChoice, null); assert.equal(view().partnerChoice, null);
	});
	it('preserves the paid question and current preselection through pause and resume', () => {
		question(); choose(host, 'answer:0'); const key = view().key;
		manager.coop.command(guest, { action: 'leave', id: session().id });
		manager = new RogueManager(engine); manager.coop.command(guest, { action: 'resume', id: session().id });
		assert.equal(view().key, key); assert.equal(view().ownChoice, 'answer:0');
		choose(guest, 'answer:0'); assert.equal(member(host).money, 2290); assert.equal(member(guest).money, 3290);
	});
	for (const won of [true, false]) it(`settles a quiz challenge ${won ? 'win' : 'loss'} once and returns to the same event`, () => {
		quizChallenge(); assert(!created.rogue.state.catchable); assert(!created.rogue.wild);
		const result = settle(won); assert(session().adventure.battleResult.eventResolved);
		for (const [i, user] of [host, guest].entries()) {
			assert.equal(member(user).money, 2000 + i * 1000 - 290 + (won ? 870 : 0));
			assert.equal(member(user).bag.ether || 0, won ? 2 : 0);
		}
		const saved = session(); created.rogue.onResult(result); assert.deepEqual(session(), saved);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
		assert.equal(session().adventure.phase, 'route-interaction'); finish();
	});
	it('preserves the paid challenge, enemy roster and consumed items on retreat without paying a prize', () => {
		quizChallenge(); const roster = structuredClone(session().adventure.node.encounters);
		created.rogue.state.partnerBag.pokeball--; settle(false, true);
		assert(!session().adventure.battleResult.eventResolved); assert.equal(member(guest).bag.pokeball, 9);
		assert.equal(member(host).money, 1710); assert.equal(member(host).bag.ether, undefined);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'retrybattle' });
		assert.deepEqual(session().adventure.node.encounters, roster); assert(!member(host).coopEvent.settled);
	});
	it('runs the quiz fight through the native four-seat simulator and awards both real winners', () => {
		quizChallenge(); const state = structuredClone(created.rogue.state);
		const opponents = [Teams.unpack(created.trainer.packedTeam), Teams.unpack(created.rogue.cooperative.foe)];
		assert.equal(opponents.flat().length, 2);
		const battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: host.name, team: state.team.map(mon => mon.set) }, p2: { name: 'Quiz A', team: opponents[0] },
			p3: { name: guest.name, team: state.partner.team.map(mon => mon.set) }, p4: { name: 'Quiz B', team: opponents[1] },
		});
		try {
			for (const side of battle.sides) battle.choose(side.id, 'team 1');
			assert.equal(battle.gameType, 'multi'); assert.equal(battle.p1.active.length, 1);
			for (const side of [battle.p2, battle.p4]) battle.damage(side.active[0].hp, side.active[0]);
			battle.faintMessages(); assert(battle.ended);
			const result = rogueBattleResult(battle); assert(result.won);
			created.rogue.onResult(result); assert(session().adventure.battleResult.eventResolved);
			assert.equal(member(host).bag.ether, 2); assert.equal(member(guest).bag.ether, 2);
		} finally { battle.destroy(); }
	});
	it('uses either party move type for relics, pays both rewards, and keeps both original teams intact', () => {
		relicTeam(); enter('relicpuzzle'); const teams = [member(host).team, member(guest).team];
		for (const type of ['Fire', 'Water', 'Flying']) assert(!view().branchOptions.find(o => o.id === 'type:' + type).disabled);
		for (const type of ['Fire', 'Water', 'Flying']) agree('type:' + type);
		assert(view().branchResolved); assert.deepEqual([member(host).team, member(guest).team], teams);
		for (const [i, user] of [host, guest].entries()) {
			assert.equal(member(user).bag.rarecandy, 1); assert.equal(member(user).bag.oranberry, 3);
			assert.equal(member(user).money, 2000 + i * 1000 + journeyCoins(70, 450));
			assert.deepEqual(member(user).rareCandyEvents, ['relicpuzzle']);
		}
		finish(); assert.equal(session().adventure.floor, 71);
	});
	it('falls back to the original normal prize after help or mistakes instead of granting a perfect candy', () => {
		relicTeam(); enter('relicpuzzle');
		agree('type:Water'); agree('help'); agree('type:Flying');
		for (const user of [host, guest]) {
			assert.equal(member(user).bag.rarecandy, undefined); assert.equal(member(user).bag.ether, 1);
			assert.equal(member(user).bag.oranberry, 1); assert.equal(member(user).rareCandyEvents, undefined);
		}
	});
	it('retains personal once-per-run relic claims through route changes, reconnect and a repeat visit', () => {
		relicTeam(); enter('relicpuzzle'); for (const type of ['Fire', 'Water', 'Flying']) agree('type:' + type);
		finish(); manager = new RogueManager(engine);
		assert.deepEqual(member(host).rareCandyEvents, ['relicpuzzle']);
		enter('relicpuzzle', 72); for (const type of ['Fire', 'Water', 'Flying']) agree('type:' + type);
		for (const user of [host, guest]) {
			assert.equal(member(user).bag.rarecandy, 1); assert.equal(member(user).bag.ether, 1);
			assert.deepEqual(member(user).rareCandyEvents, ['relicpuzzle']);
		}
	});
	it('does not overwrite the partner claim when only one member has earned the perfect prize before', () => {
		relicTeam(); change(shared => { shared.adventure.members[host.id].rareCandyEvents = ['relicpuzzle']; });
		enter('relicpuzzle'); for (const type of ['Fire', 'Water', 'Flying']) agree('type:' + type);
		assert.equal(member(host).bag.rarecandy, undefined); assert.equal(member(host).bag.ether, 1);
		assert.equal(member(guest).bag.rarecandy, 1); assert.equal(member(guest).bag.ether, undefined);
	});
	it('rechecks move ownership after a preselection and excludes eggs and permanent losses in both modes', () => {
		relicTeam(); enter('relicpuzzle'); choose(host, 'type:Fire');
		change(shared => { shared.adventure.members[host.id].team[0].set.moves = ['Scratch']; });
		const saved = session(); assert.throws(() => choose(guest, 'type:Fire'), /共同分支/);
		assert.deepEqual(session(), saved);
		change(shared => {
			const team = shared.adventure.members[host.id].team;
			team.push({ ...structuredClone(team[0]), id: 'dead', nuzlockeDead: true,
				set: { ...team[0].set, moves: ['Flamethrower'] } });
			team.push({ ...structuredClone(team[0]), id: 'egg', egg: { found: 1, hatch: 99 },
				set: { ...team[0].set, moves: ['Thunderbolt'] } });
		});
		assert(view().branchOptions.find(o => o.id === 'type:Fire').disabled);
		assert(view().branchOptions.find(o => o.id === 'type:Electric').disabled);
		const solo = structuredClone(store.get(host.id).run);
		solo.phase = 'event'; solo.team = member(host).team;
		solo.node = { id: 'solo', kind: 'event', name: '遗迹', encounters: [], reward: { money: 0, items: {} },
			event: { id: 'relicpuzzle', stage: 'choice', key: 'solo-visit', activity: {} } };
		assert.throws(() => chooseEventOption(store.get(host.id), solo, engine.content, () => 0,
			'solo-visit', 'type:Fire'), /无法选择/);
		assert(eventView(solo).options.find(o => o.id === 'type:Fire').disabled);
		agree('help'); assert.equal(member(host).coopEvent.activity.index, 1);
	});
	for (const id of ['identityquiz', 'relicpuzzle']) it(`rolls back both ${id} inventories, rewards and votes on a failed write`, () => {
		if (id === 'relicpuzzle') relicTeam(); enter(id);
		if (id === 'relicpuzzle') { agree('type:Fire'); agree('type:Water'); }
		const choice = id === 'identityquiz' ? 'enter' : 'type:Flying';
		choose(host, choice); const saved = session(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec("CREATE TEMP TRIGGER puzzle_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'puzzle write failed'); END;");
		try {
			assert.throws(() => choose(guest, choice), /puzzle write failed/);
			assert.deepEqual(session(), saved); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		} finally { store.db.exec('DROP TRIGGER puzzle_fail'); }
		choose(guest, choice);
		if (id === 'relicpuzzle') assert.equal(member(guest).bag.rarecandy, 1);
		else assert.equal(member(guest).money, 2710);
	});
});
