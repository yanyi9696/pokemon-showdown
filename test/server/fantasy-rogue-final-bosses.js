'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { Dex, toID } = require('../../dist/sim/dex');
const { Teams } = require('../../dist/sim/teams');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { summitEncounter, arceusEncounter, ARCEUS_PHYSICAL_MOVES } = require('../../dist/server/fantasy-rogue/final-bosses');
const { ARCEUS_LIFE_TYPES, rogueBossChoice } = require('../../dist/sim/rogue-bosses');
const { storyView } = require('../../dist/server/fantasy-rogue/story');
const { prepareSpiritNode } = require('../../dist/server/fantasy-rogue/spirits');
const { prepareBlessingEncounter } = require('../../dist/server/fantasy-rogue/blessings');
const { stats, set, commandAfterOpening } = require('../fixtures/fantasy-rogue');

function native(encounter) {
	const team = [createRoguePokemon(set('Blissey', 'Natural Cure', 100,
		['Quick Attack', 'Tackle', 'Protect', 'Roar']), stats(0), 'hero')];
	const battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
		fantasyRogue: { encounterId: 'finaltest', team, boosts: stats(0), bag: {}, balls: [],
			catchable: false, boss: structuredClone(encounter.boss) },
		p1: { name: 'Player', team: Teams.pack(team.map(mon => mon.set)) },
		p2: { name: 'Boss', team: Teams.pack(encounter.team) },
	});
	battle.choose('p1', 'team 1');
	battle.choose('p2', rogueBossChoice(battle.p2.activeRequest));
	// Isolate phase timing from player survival, without changing boss stats or move behavior.
	battle.p1.active[0].hp = battle.p1.active[0].maxhp = 99999;
	return battle;
}
function deplete(battle) {
	const mon = battle.p2.active[0];
	mon.faint(battle.p1.active[0], battle.dex.moves.get('tackle'));
	battle.faintMessages();
}

describe('Fantasy Rogue continuous summit and nineteen-life challenge', function () {
	this.timeout(15000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	it('keeps the authored guard team and the seventh export only as Mewtwo Y', () => {
		const encounter = summitEncounter();
		assert.deepEqual(encounter.team.map(mon => mon.species), ['Koraidon-Fantasy', 'Miraidon-Fantasy',
			'Calyrex-Fantasy', 'Xerneas-Fantasy', 'Lugia-Fantasy', 'Mewtwo-Fantasy']);
		assert.equal(encounter.boss.mewtwoY.item, 'Mewtwonite Y');
		assert.equal(encounter.team[4].moves[0], 'Scald');
		battle = native(encounter);
		assert.equal(battle.p2.active[0].species.name, 'Koraidon-Fantasy');
		assert.equal(battle.choose('p2', 'switch 6'), false, 'commander must wait');
		for (let i = 0; i < 5; i++) {
			deplete(battle);
			battle.checkFainted();
			battle.makeRequest('switch');
			assert.equal(rogueBossChoice(battle.p2.activeRequest), `switch ${i + 2}`);
			battle.choose('p2', rogueBossChoice(battle.p2.activeRequest));
			assert.equal(battle.p2.active[0].set.species, encounter.team[i + 1].species);
		}
	});
	for (const beforeMove of [true, false]) {
		it(`revives X into Y ${beforeMove ? 'before' : 'after'} its action without losing or duplicating that action`, () => {
			const full = summitEncounter();
			battle = native({ ...full, team: [full.team[5]] });
			const mon = battle.p2.active[0];
			mon.hp = 1; mon.boosts.atk = 3; mon.boosts.def = -2;
			battle.makeChoices(beforeMove ? 'move 1' : 'move 2', 'move 1');
			assert.equal(mon.species.id, 'mewtwomegayfantasy');
			assert.equal(mon.item, 'mewtwonitey');
			assert.equal(mon.set.nature, 'Timid');
			assert.deepEqual(mon.set.evs, { ...stats(0), hp: 4, spa: 252, spe: 252 });
			assert.deepEqual(mon.baseMoves, ['suckerpunch', 'punishment', 'psystrike', 'icebeam']);
			assert.deepEqual(mon.boosts, { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 });
			assert.equal(mon.fainted, false); assert.equal(battle.p2.pokemonLeft, 1);
			const actions = battle.log.filter(line => line.startsWith('|move|p2'));
			assert.equal(actions.length, 1, battle.log.join('\n'));
			const megaX = battle.log.findIndex(line => line.includes('|-mega|') && line.includes('Mewtwonite X'));
			assert(megaX >= 0, 'must first Mega Evolve to X');
			const megaY = battle.log.findIndex(line => line.includes('|-mega|') && line.includes('Mewtwonite Y'));
			const action = battle.log.findIndex(line => line.startsWith('|move|p2'));
			assert(beforeMove ? action > megaY : action < megaY);
			deplete(battle); assert.equal(battle.winner, 'Player');
		});
	}
	it('moves through all eighteen distinct types, retains positive boosts, clears negative effects, and gives Legend No Retreat once', () => {
		battle = native(arceusEncounter());
		const mon = battle.p2.active[0], seen = [];
		assert.equal(mon.species.name, 'Arceus');
		assert.deepEqual(mon.set.evs, stats(252)); assert.equal(mon.set.nature, 'Hardy');
		for (let phase = 0; phase < 18; phase++) {
			seen.push(mon.species.types[0]);
			mon.boosts.atk = 2; mon.boosts.def = -2;
			mon.setStatus('par'); mon.addVolatile('leechseed', battle.p1.active[0]);
			deplete(battle);
			assert.equal(mon.fainted, false); assert.equal(battle.ended, false);
			assert.equal(mon.hp, mon.maxhp); assert.equal(mon.status, '');
			assert(!mon.volatiles.leechseed); assert.equal(mon.boosts.atk, phase === 17 ? 3 : 2);
			assert.equal(mon.boosts.def, phase === 17 ? 1 : 0);
			assert.equal(mon.baseMoves[2], (phase + 1) % 2 ? 'workup' : 'cosmicpower');
			const type = phase === 17 ? 'Legend' : mon.species.types[0];
			assert.equal(mon.baseMoves[3], toID(ARCEUS_PHYSICAL_MOVES[type]));
		}
		assert.deepEqual(seen.sort(), [...ARCEUS_LIFE_TYPES].sort());
		assert.equal(mon.species.id, 'arceuslegendfantasy'); assert.equal(mon.item, 'legendplate');
		assert.equal(mon.ability, 'chuanshuozhili');
		assert.equal(battle.log.filter(line => line.startsWith('|move|p2') && line.includes('|No Retreat|')).length, 1);
		assert.equal(battle.p2.pokemonLeft, 1);
		deplete(battle); assert.equal(battle.winner, 'Player');
	});
	it('keeps the pending normal action when entering Legend and restores the phase after serialization', () => {
		battle = native(arceusEncounter());
		for (let i = 0; i < 17; i++) deplete(battle);
		const saved = battle.toJSON(); battle.destroy(); battle = Battle.fromJSON(saved);
		const mon = battle.p2.active[0]; mon.hp = 1;
		battle.p1.active[0].setAbility('scrappy');
		const start = battle.log.length;
		battle.makeChoices('move 1', 'move 1');
		assert.equal(mon.species.id, 'arceuslegendfantasy');
		const actions = battle.log.slice(start).filter(line => line.startsWith('|move|p2'));
		assert.equal(actions.length, 2, battle.log.slice(start).join('\n'));
		assert(actions[0].includes('|No Retreat|'));
		assert.equal(battle.fantasyRogue.boss.phase, 18);
	});
	it('handles residual KOs and multi-hit attacks without skipping bars or granting another action', () => {
		const full = summitEncounter();
		battle = native({ ...full, team: [full.team[5]] });
		let mon = battle.p2.active[0];
		mon.hp = 1; mon.setStatus('brn');
		battle.makeChoices('move 3', 'move 4');
		assert.equal(mon.species.id, 'mewtwomegayfantasy'); assert.equal(mon.status, '');
		assert.equal(battle.log.filter(line => line.startsWith('|move|p2')).length, 1);
		battle.destroy(); battle = native(arceusEncounter()); mon = battle.p2.active[0];
		mon.hp = 1;
		const attack = battle.dex.getActiveMove('bulletseed'); attack.accuracy = true; attack.multihit = 5;
		battle.actions.useMove(attack, battle.p1.active[0], { target: mon }); battle.faintMessages();
		assert.equal(battle.fantasyRogue.boss.phase, 1); assert.equal(mon.hp, mon.maxhp);
	});
	it('applies the boss blessing and Mew level bonuses to both challenges and both Mewtwo phases', () => {
		for (const encounter of [summitEncounter(), arceusEncounter()]) {
			const run = { floor: 200, spirit: 'mew', spiritVersion: 1,
				blessings: { owned: [], levels: 60, bossLevels: 100 },
				node: { kind: 'boss', encounters: [encounter], reward: { money: 0, items: {} } } };
			prepareSpiritNode(run, run.node, {}, () => 0); prepareBlessingEncounter(run, () => 0);
			assert(encounter.team.every(mon => mon.level === 205));
			if (encounter.boss.kind === 'summit') {
				battle = native({ ...encounter, team: [encounter.team[5]] });
				deplete(battle); assert.equal(battle.p2.active[0].level, 205);
				assert.equal(battle.p2.active[0].set.level, 205);
				assert.equal(battle.p2.active[0].species.id, 'mewtwomegayfantasy');
			}
		}
	});
});

describe('Fantasy Rogue post-clear snapshot and optional challenge settlement', function () {
	this.timeout(20000);
	let store, engine, content;
	const user = 'finalqatester';
	const account = () => store.get(user);
	const cmd = (action, extra = {}) => commandAfterOpening(engine, user, { id: randomUUID(), revision: account().revision, action, ...extra });
	before(() => { content = createPreviewContent(); });
	beforeEach(() => {
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content, () => 0);
		cmd('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());
	function complete() {
		store.change(user, a => {
			const run = a.run;
			run.floor = 200; run.phase = 'reward'; run.node = structuredClone(content.floors[200][0]);
			run.team[0].hp = 0; run.team[0].status = 'brn';
			for (const slot of run.team[0].pp) slot.pp = 0;
		});
		cmd('continue');
		assert.equal(account().run.phase, 'postgame');
		assert.equal(account().cards.length, 1);
		const card = account().cards[0];
		for (const mon of card.snapshot.team) {
			assert.equal(mon.hp, mon.maxhp); assert.equal(mon.status, '');
			assert(mon.pp.every(slot => slot.pp === slot.maxpp));
		}
		const view = storyView(account(), false, true);
		assert.equal(view.stage, 'godinvite');
		assert.throws(() => cmd('godchallenge', { value: 'accept' }), /邀请/);
		cmd('storyskip', { value: view.key });
		return card;
	}
	for (const won of [true, false]) {
		it(`${won ? 'wins for twenty points' : 'loses without losing the clear'} and never rewrites the card or carries challenge growth back`, () => {
			store.change(user, a => {
				a.run.growth = {offense: 2000, defense: 1200, experience: 500};
				a.run.team[0].training = {offense: 600, defense: 400};
			});
			const card = complete(), points = account().points, beforeChallenge = structuredClone(account().run.team);
			cmd('godchallenge', { value: 'accept' });
			const run = account().run, state = engine.battleState(user);
			assert.equal(state.boss.kind, 'arceus'); assert.equal(state.progression, false); assert.equal(state.catchable, false);
			const changed = structuredClone(run.team); changed[0].hp = 0; changed[0].set.level = 999;
			changed[0].training.offense = 6000;
			const result = { won, encounterId: run.battle.encounterId, team: changed, bag: {} };
			engine.settle(user, run.battle.token, result); engine.settle(user, run.battle.token, result);
			assert.equal(account().points, points + (won ? 20 : 0));
			assert.equal(account().run.phase, 'complete'); assert.equal(account().run.postgame.stage, won ? 'won' : 'lost');
			assert.deepEqual(account().cards[0], card); assert.deepEqual(account().run.team, beforeChallenge);
			assert.deepEqual(card.snapshot.team, beforeChallenge.map(mon => ({
				...mon, difficulty: { tier: 0, floor: 200, card: true },
			})));
			assert.deepEqual(account().run.growth, card.snapshot.growth);
			assert.equal(card.snapshot.team[0].training.offense, 600);
			assert.throws(() => cmd('godchallenge', { value: 'accept' }));
		});
	}
	it('declines safely and recovers a missing room back to the already recorded invitation', () => {
		const card = complete(), points = account().points;
		cmd('godchallenge', { value: 'accept' });
		engine.recover(user, account().run.battle.token);
		assert.equal(account().run.phase, 'postgame'); assert.equal(account().cards.length, 1);
		cmd('godchallenge', { value: 'decline' });
		assert.equal(account().run.phase, 'complete'); assert.equal(account().points, points);
		assert.deepEqual(account().cards[0], card);
	});
	it('charges each stat independently, preserves historical purchases and rejects an unaffordable next level', () => {
		cmd('abandon');
		store.change(user, a => { a.boosts.hp = 4; a.points = 5; });
		engine.migrate(user); assert.equal(account().points, 5);
		const request = { id: randomUUID(), revision: account().revision, action: 'upgrade', value: 'hp' };
		engine.command(user, request); engine.command(user, request);
		assert.equal(account().boosts.hp, 5); assert.equal(account().points, 0);
		assert.throws(() => cmd('upgrade', { value: 'hp' }), /6 点/);
		store.change(user, a => { a.points = 1; });
		cmd('upgrade', { value: 'atk' }); assert.equal(account().boosts.atk, 1); assert.equal(account().points, 0);
	});
});
