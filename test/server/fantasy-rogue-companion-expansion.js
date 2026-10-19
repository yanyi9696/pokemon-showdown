'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { Dex } = require('../../dist/sim/dex');
const { Format } = require('../../dist/sim/dex-formats');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { COMPANIONS, companionAvailable, companionAppearance, companionGiftOptions } = require('../../dist/sim/rogue-companions');
const { companionZRequest } = require('../../dist/sim/rogue-companion-z');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { rogueAbilityInfo } = require('../../dist/sim/fantasy-rogue-blessings');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const c = require('../../dist/server/fantasy-rogue/companions');
const { blessingDisplay } = require('../../dist/server/fantasy-rogue/blessing-text');
const { trainerCodex } = require('../../dist/server/fantasy-rogue/trainer-codex');
const { recordClear } = require('../../dist/server/fantasy-rogue/legacy');
const { buildRogueDuelState } = require('../../dist/server/fantasy-rogue/duels');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { stats, set, content, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue new companion roles, gifts and independent Z moves', function () {
	this.timeout(20000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function party(id, sets) {
		const run = { id: randomUUID(), floor: 60, phase: 'ready', money: 1000, bag: {}, boosts: stats(0),
			encounter: 0, contentVersion: 'test', team: sets.map(s => createRoguePokemon(s, stats(0))) };
		syncBlessingParty(run);
		run.blessings.owned.push({ ...blessing(COMPANIONS[id].family), floor: 50 });
		c.grantCompanion(run, id);
		return run;
	}
	function assign(run, index = 0) {
		const id = run.blessings.companions[0].id;
		c.companionCommand(run, { member: id, value: 'z:' + run.team[index].id }, () => 0, []);
	}
	function begin(run, foes = [set('Blissey', 'Natural Cure', 100, ['Splash'])], doubles = false) {
		const format = new Format({ ...Dex.formats.get('gen9fantasyrogue'), gameType: doubles ? 'doubles' : 'singles' });
		battle = new Battle({ format, seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'extra-z', team: structuredClone(run.team), boosts: stats(0), bag: {}, balls: [],
				systems: { player: { z: true } }, catchable: false, blessings: structuredClone(run.blessings) },
			p1: { team: run.team.map(m => m.set) }, p2: { team: foes } });
		battle.makeChoices('team ' + run.team.map((_, i) => i + 1).join(''), 'team ' + foes.map((_, i) => i + 1).join(''));
		battle.randomizer = damage => damage;
		return battle.p1.active[0];
	}
	it('gates the five families by actual types and keeps every companion mutually exclusive', () => {
		const cases = [['companionband', 'Poochyena'], ['companionlacey', 'Clefairy'], ['companionkahili', 'Pidgey'],
			['companionliko', 'Bulbasaur'], ['companiongiovanni', 'Abra']];
		for (const [family, species] of cases) {
			assert(!companionAvailable(family, []));
			const team = [createRoguePokemon(set(species), stats(0))];
			assert(companionAvailable(family, team));
			assert(!companionAvailable(family, team, { owned: [{ family: 'companionai' }] }));
			if (family !== 'companionband') assert.equal(companionAppearance(family, team.concat(team)), 2);
		}
		assert.equal(companionAppearance('companionband', [createRoguePokemon(set('Drapion'), stats(0))]), 1);
		assert.equal(companionAppearance('companionband', ['Poochyena', 'Ekans'].map(s => createRoguePokemon(set(s), stats(0)))), 2);
		const run = party('marnie', [set('Ekans')]);
		assert(!run.blessings.companions[0].member); // Choosing either trainer remains valid; assignment waits.
	});
	it('guarantees a type item at 15 preferences, with Acerola choosing one and no repeat rewards', () => {
		for (const id of Object.keys(COMPANIONS).filter(id => !['sada', 'turo', 'lana', 'olivia'].includes(id))) {
			const run = party(id, [set()]); run.phase = 'event';
			const companion = run.blessings.companions[0]; companion.preferences = 14;
			run.node = { kind: 'event', event: { key: 'gift', id: 'test' } };
			const options = [{ id: 'home', name: '回乡看看', region: COMPANIONS[id].region }];
			c.recordCompanionPreference(run, options, 'home', () => 0);
			const gifts = companionGiftOptions(id);
			if (id === 'acerola') {
				assert(companion.giftPending); assert.deepEqual(run.bag, {});
				assert.equal(c.companionView(run, options)[0].giftOptions.length, 2);
				c.companionCommand(run, { member: id, value: 'gift:silkscarf' }, () => 0, options);
				assert.equal(run.bag.silkscarf, 1);
				assert.throws(() => c.companionCommand(run, { member: id, value: 'gift:spelltag' }, () => 0, options));
			} else assert.equal(run.bag[gifts[0].id], 1);
			const before = { ...run.bag };
			c.recordCompanionPreference(run, options, 'home', () => 0);
			assert.deepEqual(run.bag, before); assert.equal(run.money, 1000);
			assert(run.notices.some(s => s.includes('同行训练家的赠礼')));
		}
	});
	it('consults on encounter and route choices, with homeland and choice type in one consistent sentence', () => {
		const run = party('iono', [set('Pikachu')]); run.phase = 'event';
		run.node = { kind: 'trainer', event: { id: 'police', key: 'police' } };
		const options = [{ id: 'home', name: '前往帕底亚', region: 'paldea' }, { id: 'fight', name: '发起对战' }];
		c.companionCommand(run, { member: 'iono', value: 'advice' }, () => 0, options);
		assert.equal(c.companionView(run, options)[0].recommended, 'home');
		c.recordCompanionPreference(run, options, 'home', () => 0);
		assert.equal(run.blessings.companions[0].preferences, 1);
		run.phase = 'choose'; delete run.node;
		run.choices = [{ id: 'wild', name: '海岸', kind: 'wild' }, { id: 'reward', name: '补给', kind: 'reward' }];
		c.companionCommand(run, { member: 'iono', value: 'advice' }, () => 0, []);
		assert.equal(c.companionView(run)[0].recommended, 'wild');
		c.recordCompanionPreference(run, [], 'wild', () => 0); run.phase = 'ready';
		assert(c.companionView(run)[0].smile);
		for (const family of new Set(Object.values(COMPANIONS).map(c => c.family))) {
			const text = blessingDisplay(blessing(family), 50).text;
			assert(text.includes('遭遇')); assert(!text.includes('也偏好'));
			if (family !== 'companionai') assert(text.includes('同行训练家的赠礼'));
		}
	});
	it('restricts new experience and floor pickup benefits and prevents replayed pickups', () => {
		const run = party('kahili', [set('Pidgey'), set('Abra')]);
		assert.equal(c.companionExperience(run, run.team[0], { species: 'Magikarp' }), 1.3);
		assert.equal(c.companionExperience(run, run.team[1], { species: 'Magikarp' }), 1);
		run.blessings.companions = []; c.grantCompanion(run, 'giovanni');
		assert.equal(c.companionExperience(run, run.team[1], { killer: run.team[1].id }), 1.2);
		assert.equal(c.companionExperience(run, run.team[1], { killer: run.team[0].id }), 1);
		assert.equal(c.companionExperience(run, run.team[1], { killer: run.team[1].id, captured: true }), 1);
		const grass = party('liko', [set('Bulbasaur'), set('Oddish'), set('Abra')]);
		c.deliverCompanionPickup(grass, () => 0); assert.equal(grass.bag.tinymushroom, 2);
		c.deliverCompanionPickup(grass, () => 0); assert.equal(grass.bag.tinymushroom, 2);
		grass.floor++; c.deliverCompanionPickup(grass, () => 0); assert.equal(grass.bag.tinymushroom, 4);
	});
	it('lists all portrait identities and preserves multiple roles for the same character', () => {
		const people = trainerCodex();
		assert.equal(new Set(people.map(p => p.portrait)).size, people.length);
		const get = id => people.find(p => p.portrait === id);
		for (const id of Object.keys(COMPANIONS)) assert(get(id)?.roles.includes('companion'));
		assert(get('bea').roles.includes('gym'));
		assert(get('lacey').roles.includes('elitefour'));
		assert(get('giovanni').roles.includes('antagonist'));
		for (const id of ['mewtwo', 'maxie', 'clover', 'coin', 'jenny', 'rocket', 'steven']) assert(get(id));
	});
	it('assigns any matching move holder, rejects wrong moves/types, and cannot reassign the opportunity', () => {
		const run = party('marnie', [set('Umbreon', 'Synchronize', 80, ['Snarl']), set('Poochyena', 'Run Away', 20, ['Snarl'])]);
		assign(run, 1); assert.equal(run.blessings.companionZ.member, run.team[1].id);
		assert.throws(() => assign(run));
		const wrong = party('lacey', [set('Mew', 'Synchronize', 50, ['Play Rough']), set('Clefairy', 'Cute Charm', 50, ['Tackle'])]);
		assert.throws(() => assign(wrong)); assert.throws(() => assign(wrong, 1));
	});
	for (const [id, species, ability, move, expectedType] of [['marnie', 'Umbreon', 'Synchronize', 'Snarl', 'Dark'], ['roxie', 'Muk', 'Stench', 'Sludge Wave', 'Poison']]) {
		it(`${id} releases a 185-power sound Z, consumes base PP once and leaves normal Z available`, () => {
			const run = party(id, [set(species, ability, 50, [move, 'Tackle'])]); assign(run);
			const mon = begin(run), def = companionZRequest(mon), pp = mon.moveSlots[0].pp;
			const data = battle.dex.moves.get(def.move);
			assert.equal(data.basePower, 185); assert.equal(data.type, expectedType); assert.equal(data.category, 'Special');
			assert(data.flags.sound);
			assert.equal(rogueAbilityInfo(mon).moves[def.move].source, def.source);
			battle.makeChoices('roguecompanionz 1', 'move splash');
			assert.equal(mon.moveSlots[0].pp, pp - 1); assert(!battle.p1.zMoveUsed);
			assert.equal(mon.lastMove.id, def.move); assert(rogueBattleResult(battle).companionZUsed);
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe']) assert.equal(mon.boosts[stat], 1);
			assert(!companionZRequest(mon)); assert(battle.fantasyRogue.companionZUsed.p1);
			assert(!battle.choose('p1', 'roguecompanionz 1'));
		});
	}
	it('uses a spread physical Fairy Z without doubling the five-stat boost', () => {
		const run = party('lacey', [set('Azumarill', 'Thick Fat', 30, ['Play Rough']), set('Magikarp', 'Swift Swim', 30, ['Splash'])]); assign(run);
		const mon = begin(run, [set('Blissey', 'Natural Cure', 100, ['Splash']), set('Blissey', 'Natural Cure', 100, ['Splash'])], true);
		const hp = battle.p2.active.map(m => m.hp);
		battle.makeChoices('roguecompanionz 1, move splash', 'move splash, move splash');
		for (const [i, foe] of battle.p2.active.entries()) assert(foe.hp < hp[i]);
		for (const stat of ['atk', 'def', 'spa', 'spd', 'spe']) assert.equal(mon.boosts[stat], 1);
	});
	it('actually releases a regular Z and companion Z in either order without sharing their limit', () => {
		for (const normalFirst of [true, false]) {
			const run = party('marnie', [{ ...set('Umbreon', 'Synchronize', 30, ['Snarl', 'Tackle']), item: 'Normalium Z' }]); assign(run);
			const mon = begin(run);
			const normal = 'move tackle zmove', extra = 'roguecompanionz 1';
			battle.makeChoices(normalFirst ? normal : extra, 'move splash');
			assert.equal(!!battle.p1.zMoveUsed, normalFirst);
			assert.equal(!!companionZRequest(mon), normalFirst);
			battle.makeChoices(normalFirst ? extra : normal, 'move splash');
			assert(battle.p1.zMoveUsed); assert(battle.fantasyRogue.companionZUsed.p1);
			assert.equal(mon.moveSlots[0].pp, 14); assert.equal(mon.moveSlots[1].pp, 34);
			battle.destroy(); battle = null;
		}
	});
	it('does not spend a sleeping turn, but spends a blocked actual release without awarding hit boosts', () => {
		const run = party('roxie', [set('Muk', 'Stench', 50, ['Sludge Wave', 'Tackle'])]); assign(run);
		const mon = begin(run, [set('Steelix', 'Sturdy', 100, ['Splash'])]);
		mon.setStatus('slp'); mon.statusState.time = 3;
		const pp = mon.moveSlots[0].pp;
		battle.makeChoices('roguecompanionz 1', 'move splash');
		assert(companionZRequest(mon)); assert.equal(mon.moveSlots[0].pp, pp);
		mon.cureStatus(); battle.p1.zMoveUsed = true;
		battle.makeChoices('roguecompanionz 1', 'move splash');
		assert(battle.fantasyRogue.companionZUsed.p1); assert.equal(mon.moveSlots[0].pp, pp - 1);
		assert.equal(mon.boosts.atk, 0); assert(battle.p1.zMoveUsed);
	});
	it('carries the grant into engine battles, refunds on escape and commits only a completed challenge', () => {
		const store = new RogueStore(':memory:');
		try {
			const data = content(); data.blessings = true;
			const engine = new RogueEngine(store, data, () => 0), user = 'extrazengine';
			const cmd = (action, extra = {}) => commandAfterOpening(engine, user, { action, id: randomUUID(), revision: store.get(user).revision, ...extra });
			cmd('start', { starters: ['bulbasaur'] }); cmd('select', { value: 'grass' });
			store.change(user, a => {
				const next = party('marnie', [set('Umbreon', 'Synchronize', 30, ['Snarl'])]); assign(next);
				a.run.blessings = next.blessings; a.run.team = next.team;
				c.companionCommand(a.run, { member: 'marnie', value: 'ability:darkaura' }, () => 0, []);
			});
			cmd('battle');
			const state = engine.battleState(user); assert(state.blessings.companionZ);
			const run = store.get(user).run, result = { encounterId: run.battle.encounterId, won: false, companionZUsed: true,
				team: structuredClone(run.team), bag: { ...run.bag } };
			result.team[0].hp--; result.team[0].pp[0].pp--;
			cmd('retreat'); engine.settle(user, run.battle.token, result);
			let restored = store.get(user).run;
			assert(!restored.blessings.companionZ.spent);
			assert.equal(restored.team[0].hp, result.team[0].hp);
			assert.equal(restored.team[0].pp[0].pp, result.team[0].pp[0].pp);
			cmd('battle'); restored = store.get(user).run;
			assert(engine.battleState(user).blessings.companionZ);
			engine.settle(user, restored.battle.token, { ...result, encounterId: restored.battle.encounterId });
			assert(store.get(user).run.blessings.companionZ.spent);
		} finally { store.close(); }
	});
	it('archives the spent tower opportunity while giving both PVP sides a fresh independent use', () => {
		const cards = ['left', 'right'].map(id => {
			const run = party('marnie', [set('Umbreon', 'Synchronize', 100, ['Snarl'])]); assign(run);
			run.owner = { id, name: id }; run.floor = 200; run.blessings.companionZ.spent = true;
			const account = { cards: [] }; recordClear(account, run); return account.cards[0];
		});
		const before = JSON.stringify(cards), state = buildRogueDuelState(...cards);
		assert(state.blessings.companionZ.spent); assert(state.duel.blessings.companionZ.spent);
		battle = new Battle({ formatid: 'gen9fantasyrogueduel', fantasyRogue: state,
			p1: { team: state.team.map(m => m.set) }, p2: { team: state.duel.team.map(m => m.set) } });
		battle.makeChoices('team 1', 'team 1');
		assert(companionZRequest(battle.p1.active[0])); assert(companionZRequest(battle.p2.active[0]));
		battle.makeChoices('roguecompanionz 1', 'roguecompanionz 1');
		assert(battle.fantasyRogue.companionZUsed.p1); assert(battle.fantasyRogue.companionZUsed.p2);
		assert.equal(JSON.stringify(cards), before);
	});
});
