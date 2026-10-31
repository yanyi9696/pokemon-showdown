'use strict';
const assert = require('assert').strict;
const { Battle, Dex } = require('../../dist/sim');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { rogueAbilityInfo, roguePowerModifiers } = require('../../dist/sim/fantasy-rogue-blessings');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { set, stats } = require('../fixtures/fantasy-rogue');
describe('Fantasy Rogue authoritative effect display and consumable persistence', function () {
	this.timeout(30000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function begin(ids = [], options = {}) {
		battle?.destroy();
		const team = [createRoguePokemon(options.set || set('Mew', 'Synchronize', 30, ['Cut', 'Tackle']), stats(0))];
		if (options.prepare) options.prepare(team[0]);
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: {
			encounterId: 'display', team, boosts: stats(0), bag: {}, balls: [], catchable: false,
			blessings: { owned: ids.map(id => ({ ...blessing(id), floor: 50 })), ...options.effects }, ...options.state,
		}, p1: { team: team.map(p => p.set) }, p2: { team: [set('Blissey', 'Natural Cure', 100, ['Splash'])] } });
		battle.makeChoices('team 1', 'team 1'); return battle.p1.active[0];
	}
	it('shows 20% on the landing move and blocks both landing and following turns before the next leap', () => {
		const mon = begin(['ascent']); battle.makeChoices('move 1', 'move 1'); assert(mon.volatiles.rogueascent);
		assert.equal(rogueAbilityInfo(mon).moves.cut.power.find(m => m.source === '登龙').factor, 1.2);
		battle.makeChoices('move 1', 'move 1'); assert(!mon.volatiles.rogueascent);
		battle.makeChoices('move 1', 'move 1'); assert(!mon.volatiles.rogueascent);
		battle.makeChoices('move 1', 'move 1'); assert(mon.volatiles.rogueascent);
		assert(battle.log.some(line => line.includes('威力提升 20%')));
	});
	it('uses the same ordered blessing multipliers for previews and actual base-power events', () => {
		const mon = begin(['speedpower', 'entrance', 'bugchoir'], { set: set('Mew', 'Synchronize', 50, ['Bug Buzz']) });
		const move = battle.dex.getActiveMove('bugbuzz');
		const modifiers = roguePowerModifiers(mon, move, true), expected = modifiers.reduce((n, m) => n * (m.factor || 1) + (m.add || 0), move.basePower);
		assert.equal(battle.runEvent('BasePower', mon, battle.p2.active[0], move, move.basePower), Math.floor(expected));
		assert(modifiers.some(m => m.source === '林间大合唱' && m.add === 10));
		assert.equal(modifiers.find(m => m.source === '天下武功，唯快不破').factor, 1 + mon.getStat('spe') / 2000);
	});
	it('keeps damage modifiers separate and shows boss-card, permanent-training and extra-ability values exactly once', () => {
		const mon = begin(['lifepower', 'ordinary'], { set: { ...set('Mew', 'Huge Power', 50, ['Tackle']), item: 'Life Orb' },
			prepare: saved => { saved.statModifiers = { training: { atk: 0.2, def: 0.1 } }; },
			state: { mentorCard: 'balanced', mentorTier: 'gym' } });
		const info = rogueAbilityInfo(mon);
		assert.equal(info.stats.atk, mon.getStat('atk')); assert.equal(info.stats.def, mon.getStat('def'));
		assert.equal(info.stats.spe, mon.getStat('spe')); assert.equal(info.maxhp, mon.maxhp);
		assert.equal(info.mentor.offense, 60); assert.equal(info.training.atk, 0.2);
		assert(!info.moves.tackle.damage.some(s => s.includes('首领卡')));
		assert(info.statSources.some(s => s.includes('首领卡') && s.includes('60%')));
		assert(info.moves.tackle.damage.some(s => s.includes('自损一千，伤敌一万') && s.includes('1.6'))); assert(!info.moves.tackle.power.length);
	});
	it('includes the current Z move and keeps Technician eligibility independent of later blessing multipliers', () => {
		const mon = begin(['speedpower', 'bugchoir'], { set: { ...set('Mew', 'Technician', 50, ['Tackle', 'Bug Buzz']), item: 'buginiumz' }, state: { systems: { player: { z: true } } } });
		const move = battle.dex.getActiveMove('tackle'), factor = 1 + mon.getStat('spe') / 2000;
		assert.equal(battle.runEvent('BasePower', mon, battle.p2.active[0], move, move.basePower), battle.modify(Math.floor(move.basePower * factor), 1.5));
		const variant = rogueAbilityInfo(mon).moves.savagespinout;
		assert(variant); assert(variant.power.some(m => m.source === '天下武功，唯快不破'));
		assert(!variant.power.some(m => m.source === '林间大合唱'));
	});
	it('retains native Huge Power after a fractional blessing stat boost', () => {
		const mon = begin(['kid'], { set: { ...set('Bulbasaur', 'Huge Power', 50, ['Tackle']), item: 'eviolite' } });
		assert.equal(mon.getStat('atk'), Math.floor(mon.storedStats.atk * 1.3) * 2);
		assert.equal(rogueAbilityInfo(mon).stats.atk, mon.getStat('atk'));
	});
	it('keeps Max move modifiers visible after Dynamax has already started', () => {
		const mon = begin(['speedpower']);
		mon.addVolatile('dynamax'); mon.side.dynamaxUsed = true;
		assert(mon.volatiles.dynamax);
		assert(rogueAbilityInfo(mon).moves.maxstrike.power.some(m => m.source === '天下武功，唯快不破'));
	});
	it('can read each official/custom stat-modifying ability without a current move or changing RNG', () => {
		const dex = Dex.mod('gen9fantasy');
		const abilities = dex.abilities.all().filter(a => ['onModifyAtk', 'onModifySpA', 'onModifyDef', 'onModifySpD', 'onModifySpe'].some(k => a[k]));
		for (const ability of abilities) {
			const mon = begin([], { set: set('Mew', ability.name, 50, ['Tackle']) });
			const seed = battle.prng.getSeed().slice();
			assert.doesNotThrow(() => rogueAbilityInfo(mon), ability.name);
			assert.deepEqual(battle.prng.getSeed(), seed, ability.name);
		}
	});
	it('persists normal consumption and only waives the first use with renewable', () => {
		for (const renewable of [false, true]) for (const item of ['oranberry', 'normalgem']) {
			const mon = begin(renewable ? ['renewable'] : [], { set: { ...set('Mew', 'Synchronize', 50, ['Tackle']), item } });
			if (item === 'oranberry') {
				mon.hp = Math.floor(mon.maxhp / 2); battle.runEvent('Update', mon);
			} else battle.makeChoices('move 1', 'move 1');
			assert.equal(rogueBattleResult(battle).team[0].set.item, renewable ? item : '', `${item}, renewable=${renewable}`);
			if (item === 'oranberry') {
				mon.hp = Math.floor(mon.maxhp / 2); battle.runEvent('Update', mon);
			} else battle.makeChoices('move 1', 'move 1');
			assert.equal(rogueBattleResult(battle).team[0].set.item, '', `${item} must be spent by the second use`);
		}
	});
});
