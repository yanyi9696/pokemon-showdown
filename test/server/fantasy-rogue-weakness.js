'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { weaknessProfile } = require('../../dist/sim/rogue-weakness');
const { rogueAbilityInfo } = require('../../dist/sim/fantasy-rogue-blessings');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { syncBlessingParty, blessingView, blessingCandidates, handleBlessingCommand } = require('../../dist/server/fantasy-rogue/blessings');
const { rogueCodex } = require('../../dist/server/fantasy-rogue/codex');
const { set, stats, content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue individual weaknesses and team armor', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function party(names = ['Aggron', 'Charizard', 'Snorlax'], ids = ['weakness', 'weaknessarmor']) {
		const run = { id: 'weakness-test', floor: 50, phase: 'ready', bag: {}, money: 0, boosts: stats(0),
			team: names.map(name => createRoguePokemon(set(name, 'Run Away', 50, ['Splash']), stats(0))) };
		syncBlessingParty(run);
		run.blessings.owned = ids.map(id => ({ ...blessing(id), floor: 1 }));
		syncBlessingParty(run);
		return run;
	}
	function begin(run) {
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'weakness-test', team: structuredClone(run.team), boosts: stats(0),
				bag: {}, balls: [], catchable: false, blessings: structuredClone(run.blessings) },
			p1: { team: run.team.map(mon => mon.set) },
			p2: { team: [set('Mew', 'Run Away', 50, ['Splash', 'Low Kick', 'Dragon Rage'])] } });
		battle.makeChoices('team ' + run.team.map((_, index) => index + 1).join(''), 'team 1');
		battle.randomizer = value => value;
		return battle.p1.active[0];
	}
	function damage(type, id = 'swift') {
		const source = battle.p2.active[0], target = battle.p1.active[0];
		const move = battle.dex.getActiveMove(id);
		move.type = type;
		move.willCrit = false;
		battle.setActiveMove(move, source, target);
		const result = battle.actions.getDamage(source, target, move);
		battle.clearActiveMove();
		return result;
	}
	function without(family, action) {
		const owned = battle.fantasyRogue.blessings.owned;
		battle.fantasyRogue.blessings.owned = owned.filter(entry => entry.family !== family);
		try { return action(); } finally { battle.fantasyRogue.blessings.owned = owned; }
	}
	function damageRatio(type, factor) {
		const reduced = damage(type), original = without('weakness', () => damage(type));
		assert(Math.abs(reduced - Math.floor(original * factor)) <= 1, `${type}: ${reduced} / ${original}`);
	}
	it('publishes both gold blessings in normal pools and the codex', () => {
		assert.equal(blessing('weakness').tier, 'gold');
		assert.equal(blessing('weaknessarmor').tier, 'gold');
		const run = party(undefined, []), candidates = blessingCandidates(run, content());
		for (const id of ['weakness', 'weaknessarmor']) {
			assert.equal(candidates.find(entry => entry.id === id).appearanceWeight, 100);
			const entry = rogueCodex(undefined, 'blessings', true).entries.find(entry => entry.id === id);
			assert(entry.text.includes(blessing(id).text));
			assert.equal(entry.tier, blessing(id).tier);
		}
	});
	it('counts double and quadruple type weaknesses per recipient, not across the party', () => {
		const mon = begin(party(undefined, ['weakness']));
		assert.deepEqual(weaknessProfile(mon.getTypes()), { points: 5, quadruple: 2 });
		// Aggron: Fighting x4, Ground x4, Water x2. Half of each extra bonus remains.
		damageRatio('Fighting', 2.5 / 4);
		damageRatio('Water', 1.5 / 2);
		const before = damage('Water');
		battle.p1.pokemon[1].setType(['Grass', 'Ice']);
		assert.equal(damage('Water'), before);
		assert(rogueAbilityInfo(mon).statSources.some(text => text.includes('自身折算 5 个弱点')));
	});
	it('leaves neutral, resisted, fixed damage and natural immunity alone', () => {
		const mon = begin(party(undefined, ['weakness']));
		for (const type of ['Fire', 'Ice', 'Normal']) damageRatio(type, 1);
		assert.equal(damage('Dragon', 'dragonrage'), 40);
		assert.equal(damage('Fighting', 'seismictoss'), 50);
		assert.equal(mon.runImmunity('Poison'), false);
		assert.equal(damage('Poison'), false);
	});
	it('removes the entire extra bonus at ten weighted weaknesses, without going below neutral', () => {
		const mon = begin(party(undefined, ['weakness']));
		// Three types are possible through added-type effects; exercise the cap in the native damage pipeline.
		mon.setType(['Bug', 'Grass', 'Ice']);
		assert.equal(weaknessProfile(mon.getTypes()).points, 10);
		damageRatio('Fire', 1 / 8);
		damageRatio('Flying', 1 / 4);
		damageRatio('Poison', 1 / 2);
		mon.setType(['Dark', 'Grass', 'Ice']);
		assert.equal(weaknessProfile(mon.getTypes()).points, 11);
		damageRatio('Fighting', 1 / 4);
		mon.setType(['Normal']);
		damageRatio('Fighting', 1.9 / 2);
	});
	it('adds both defenses only to qualifying allies, counting each quadruple matchup once', () => {
		const mon = begin(party(undefined, ['weaknessarmor']));
		for (const ally of battle.p1.pokemon) {
			const factor = ally === battle.p1.pokemon[2] ? 1 : 1.3;
			for (const stat of ['def', 'spd']) {
				assert.equal(ally.getStat(stat), Math.floor(ally.storedStats[stat] * factor));
			}
			for (const stat of ['atk', 'spa', 'spe']) assert.equal(ally.getStat(stat), ally.storedStats[stat]);
		}
		assert.equal(battle.p2.active[0].getStat('def'), battle.p2.active[0].storedStats.def);
		assert(rogueAbilityInfo(mon).statSources.some(text => text.includes('全队共 3 个四倍弱点，双防 +30%')));
		const view = blessingView(party(undefined, ['weaknessarmor']));
		assert(view.owned[0].text.includes('当前队伍共有 3 个四倍弱点'));
		const eggs = party(['Aggron', 'Charizard', 'Parasect'], ['weaknessarmor']);
		eggs.team[2].egg = { found: 49, hatch: 59 };
		assert(blessingView(eggs).owned[0].text.includes('当前队伍共有 3 个四倍弱点'));
	});
	it('recalculates armor after changing types or Terastallizing and composes with held items', () => {
		const mon = begin(party(undefined, ['weaknessarmor']));
		mon.item = 'assaultvest';
		const base = mon.storedStats.spd;
		assert.equal(mon.getStat('spd'), battle.modify(Math.floor(base * 1.3), 1.5));
		battle.p1.pokemon[1].terastallized = 'Normal';
		assert.equal(mon.getStat('def'), Math.floor(mon.storedStats.def * 1.2));
		mon.terastallized = 'Normal';
		assert.equal(mon.getStat('def'), mon.storedStats.def);
		assert.equal(mon.getStat('spd'), battle.modify(base, 1.5));
	});
	it('keeps both effects after a battle save and restore, without persisting boosted base stats', () => {
		const run = party();
		const mon = begin(run), defense = mon.getStat('def'), hit = damage('Fighting');
		const snapshot = JSON.stringify(battle.toJSON());
		battle.destroy(); battle = Battle.fromJSON(snapshot); battle.randomizer = value => value;
		assert.equal(battle.p1.active[0].getStat('def'), defense);
		assert.equal(damage('Fighting'), hit);
		assert.equal(run.team[0].stats.def, battle.p1.active[0].storedStats.def);
	});
	it('preserves existing silver acquisition costs without offering the new gold copy twice', () => {
		const run = party(undefined, ['weakness']);
		run.blessings.owned[0].tier = 'silver';
		run.blessings.levels = 10;
		run.blessings.bossLevels = 15;
		syncBlessingParty(run);
		const restored = JSON.parse(JSON.stringify(run));
		syncBlessingParty(restored);
		assert.equal(restored.blessings.levels, 10);
		assert.equal(restored.blessings.bossLevels, 15);
		assert(!blessingCandidates(restored, content()).some(entry => entry.id === 'weakness'));
		assert.equal(restored.blessings.owned[0].tier, 'silver');
		assert.equal(blessingView(restored).owned[0].tier, 'gold');
	});
	it('grants one policy on acquisition without retroactively adding level costs', () => {
		const run = party(['Aggron'], []);
		run.phase = 'blessing';
		run.blessings.round = { floor: 50, tier: 'gold', remaining: 1, familiesSeen: [], topClearMindEligible: false,
			options: [{ id: 'weakness', refreshes: 1, chosen: false }] };
		handleBlessingCommand({ discoveries: { blessings: [], events: [], trainers: [] } }, run, content(), { action: 'blessing', slot: 0 }, () => 0);
		assert.equal(run.bag.weaknesspolicy, 1);
		assert.equal(run.blessings.levels, 0);
		assert.equal(run.blessings.bossLevels, 0);
		assert.deepEqual(run.blessings.deferredLevels, [{ floor: 50, startsAt: 61, normal: 5, boss: 10 }]);
	});
	it('returns a physically consumed policy to the result bag, once per snapshot', () => {
		const run = party(['Aggron'], ['weakness']); run.team[0].set.item = 'Weakness Policy';
		const mon = begin(run);
		battle.makeChoices('move 1', 'move 2');
		assert.equal(mon.item, ''); assert.equal(mon.boosts.atk, 2);
		assert.equal(rogueBattleResult(battle).bag.weaknesspolicy, 1);
		assert.equal(rogueBattleResult(battle).bag.weaknesspolicy, 1);
		assert.equal(battle.fantasyRogue.bag.weaknesspolicy, undefined);
		const json = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(json);
		assert.equal(rogueBattleResult(battle).bag.weaknesspolicy, 1);
	});
	it('does not count removed, transferred, enemy or unconsumed policies', () => {
		const run = party(['Aggron', 'Charizard', 'Snorlax'], ['weakness']);
		for (const mon of run.team) mon.set.item = 'Weakness Policy';
		const mon = begin(run);
		mon.takeItem(battle.p2.active[0]);
		const enemy = battle.p2.active[0]; enemy.setItem('weaknesspolicy'); enemy.useItem();
		assert.equal(rogueBattleResult(battle).bag.weaknesspolicy, undefined);
	});
	it('does not issue refunds when renewable resources prevents consumption', () => {
		const run = party(['Aggron'], ['weakness', 'renewable']); run.team[0].set.item = 'Weakness Policy';
		const mon = begin(run); assert(mon.useItem());
		assert.equal(mon.item, 'weaknesspolicy');
		assert.equal(rogueBattleResult(battle).bag.weaknesspolicy, undefined);
	});
	it('counts physical shared-family policies, not the number of virtual beneficiaries', () => {
		const run = party(['Pikachu', 'Raichu', 'Pachirisu', 'Emolga', 'Dedenne', 'Pawmot'], ['weakness', 'mousefamily']);
		for (const mon of run.team.slice(0, 2)) mon.set.item = 'Weakness Policy';
		const mon = begin(run); assert(mon.useItem());
		assert.equal(rogueBattleResult(battle).bag.weaknesspolicy, 2);
		assert.equal(battle.p1.pokemon[1].item, '');
	});
});
