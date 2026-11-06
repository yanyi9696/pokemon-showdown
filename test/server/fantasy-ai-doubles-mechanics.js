'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { DoublesDamageModel } = require('../../dist/server/fantasy-ai/doubles-mechanics');

describe('Fantasy doubles isolated native damage model', () => {
	const battles = [];
	afterEach(() => { for (const battle of battles.splice(0)) battle.destroy(); });
	const set = (species, moves = ['Splash'], extra = {}) => ({
		species, moves, ability: '', level: 50,
		evs: { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 }, nature: 'Serious', ...extra,
	});
	function create(attacker, target = set('Blastoise'), partner = set('Magikarp'), second = set('Blastoise')) {
		const battle = new Battle({
			format: new Format({ name: 'Native damage reference', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
			seed: [1, 2, 3, 4], strictChoices: true,
			p1: { team: [attacker, partner] }, p2: { team: [target, second] },
		});
		battles.push(battle);
		return battle;
	}
	function snapshot(battle) {
		return {
			mod: 'gen9fantasy', turn: battle.turn,
			pokemon: battle.sides.flatMap(side => side.pokemon.map((mon, index) => ({
				id: `${side.id}${index ? 'b' : 'a'}`, side: side.id, position: `${side.id}${index ? 'b' : 'a'}`,
				species: mon.species.name, level: mon.level, health: mon.hp / mon.maxhp,
				stats: { hp: mon.maxhp, ...mon.storedStats }, ability: mon.ability, item: mon.item,
				moves: mon.moves.slice(), types: mon.types.slice(), teraType: mon.teraType,
				terastallized: mon.terastallized, status: mon.status, boosts: { ...mon.boosts },
				volatiles: Object.keys(mon.volatiles), activeActions: mon.activeMoveActions,
				lastMove: mon.lastMove?.id,
			}))),
			weather: battle.field.weather, terrain: battle.field.terrain, trickRoom: false,
			conditions: { p1: Object.keys(battle.p1.sideConditions), p2: Object.keys(battle.p2.sideConditions) },
		};
	}
	function nativeHit(battle, roll = 100, choice = 'move 1 1, move 1') {
		const before = battle.p2.active.map(mon => mon.hp);
		let after;
		const runMove = battle.actions.runMove.bind(battle.actions);
		battle.actions.runMove = (...args) => {
			const result = runMove(...args);
			if (args[1] === battle.p1.active[0]) after = battle.p2.active.map(mon => mon.hp);
			return result;
		};
		battle.randomizer = base => Math.floor(base * roll / 100);
		// Test reference: ordinary critical hits off, accuracy hits on. The policy never receives this Battle.
		battle.randomChance = (numerator, denominator) => denominator !== 24 && numerator > 0;
		battle.makeChoices(choice, 'move 1, move 1');
		// Snapshot at the move boundary; end-of-turn burn/weather is not move damage.
		return battle.p2.active.map((mon, i) => (before[i] - after[i]) / mon.maxhp);
	}
	function expectNative(attacker, target, field, choice, moveID, chance = 1, transform = '') {
		const low = create(attacker, target), high = create(attacker, target);
		if (field) { field(low); field(high); }
		const model = new DoublesDamageModel(snapshot(low));
		const estimate = model.project('p1a', moveID, 'p2a', transform);
		assert.deepEqual(model.diagnostics.failures, []);
		const a = nativeHit(low, 85, choice), b = nativeHit(high, 100, choice);
		for (let i = 0; i < 2; i++) {
			const actual = estimate.damage[`p2${i ? 'b' : 'a'}`] || 0;
			assert(Math.abs(actual - (a[i] + b[i]) / 2 * chance) < 1e-8,
				`${moveID} target ${i}: projected ${actual}, native ${(a[i] + b[i]) / 2 * chance}`);
		}
		return estimate;
	}

	it('uses native weather-dependent type/power and Life Orb damage without changing the source battle', () => {
		const attacker = set('Castform', ['Weather Ball'], { item: 'Life Orb' });
		const result = expectNative(attacker, set('Blastoise'), battle => battle.field.setWeather('raindance', battle.p1.active[0]),
			'move 1 1, move 1', 'weatherball');
		assert(result.selfDamage > 0);
	});

	it('discovers Expanding Force spread targeting and Psychic Terrain power in the engine', () => {
		const result = expectNative(set('Indeedee-F', ['Expanding Force']), set('Blastoise'),
			battle => battle.field.setTerrain('psychicterrain', battle.p1.active[0]), 'move 1 1, move 1', 'expandingforce');
		assert(result.damage.p2a > 0 && result.damage.p2b > 0);
	});

	it('applies spread accuracy to each opponent separately, not the product of both hit chances', () => {
		expectNative(set('Tyranitar', ['Rock Slide']), set('Blastoise'), null, 'move 1, move 1', 'rockslide', 0.9);
	});

	it('treats fixed damage as HP loss rather than base power', () => {
		const result = expectNative(set('Charizard', ['Dragon Rage']), set('Blastoise'), null,
			'move 1 1, move 1', 'dragonrage');
		const target = create(set('Charizard'), set('Blastoise')).p2.active[0];
		assert.equal(result.damage.p2a * target.maxhp, 40);
	});

	it('respects Water Absorb and uses native Mold Breaker suppression', () => {
		for (const ability of ['', 'Mold Breaker']) {
			const result = expectNative(set('Gyarados', ['Waterfall'], { ability }),
				set('Vaporeon', ['Splash'], { ability: 'Water Absorb' }), null,
				'move 1 1, move 1', 'waterfall');
			assert.equal((result.damage.p2a || 0) > 0, !!ability);
		}
	});

	it('retains pre-Tera STAB and applies the native 2x matching original type bonus', () => {
		for (const move of ['flamethrower', 'airslash']) {
			expectNative(set('Charizard', [move], { teraType: 'Fire' }), set('Blastoise'), null,
				'move 1 1 terastallize, move 1', move, move === 'airslash' ? 0.95 : 1, 'terastallize');
			expectNative(set('Charizard', [move], { teraType: 'Fire' }), set('Blastoise'),
				battle => battle.actions.terastallize(battle.p1.active[0]), 'move 1 1, move 1', move,
				move === 'airslash' ? 0.95 : 1);
		}
	});

	it('includes native ally damage and leaves an immune Flying partner untouched', () => {
		const battle = create(set('Garchomp', ['Earthquake']), set('Blastoise'), set('Talonflame'));
		const model = new DoublesDamageModel(snapshot(battle));
		const result = model.project('p1a', 'earthquake');
		assert.deepEqual(model.diagnostics.failures, []);
		assert(result.damage.p2a > 0 && result.damage.p2b > 0);
		assert.equal(result.damage.p1b || 0, 0);
	});

	it('re-triggers Mega Drought and uses the changed native form for the same-turn Solar Beam', () => {
		const result = expectNative(set('Charizard', ['Solar Beam'], { item: 'Charizardite Y', ability: 'Blaze' }),
			set('Blastoise'), null, 'move 1 1 mega, move 1', 'solarbeam', 1, 'mega');
		assert(result.damage.p2a > 0);
		assert.equal(result.charging, false);
	});

	it('derives Z-move power from the base move rather than the placeholder Z-move Dex power', () => {
		const result = expectNative(set('Charizard', ['Fly'], { item: 'Flyinium Z' }), set('Blastoise'), null,
			'move 1 1 zmove, move 1', 'fly', 1, 'zmove');
		assert(result.damage.p2a > 0);
		assert.equal(result.charging, false);
	});

	it('labels conditional priority damage as a hypothetical reply instead of always declaring it ineffective', () => {
		const battle = create(set('Absol', ['Sucker Punch']), set('Blastoise', ['Water Gun']));
		const model = new DoublesDamageModel(snapshot(battle));
		const result = model.project('p1a', 'suckerpunch', 'p2a');
		assert.deepEqual(model.diagnostics.failures, []);
		assert.equal(result.conditional, true);
		assert(result.damage.p2a > 0);
	});

	it('restores a charged second turn and keeps its public target without requiring a new target choice', () => {
		const battle = create(set('Leafeon', ['Solar Blade']));
		battle.makeChoices('move 1 2, move 1', 'move 1, move 1');
		const input = snapshot(battle);
		input.pokemon[0].chargeMove = 'solarblade';
		input.pokemon[0].lastTarget = 'p2b';
		const model = new DoublesDamageModel(input);
		const result = model.project('p1a', 'solarblade');
		assert.deepEqual(model.diagnostics.failures, []);
		assert.equal(result.damage.p2a || 0, 0);
		assert(result.damage.p2b > 0);
		assert.equal(result.charging, false);
	});

	it('owns its input, caches repeated projections and never advances the real battle RNG or HP', () => {
		const battle = create(set('Charizard', ['Flamethrower']));
		const before = JSON.stringify(battle.toJSON());
		const input = snapshot(battle), inputBefore = structuredClone(input);
		const model = new DoublesDamageModel(input);
		const first = model.project('p1a', 'flamethrower', 'p2a');
		assert.deepEqual(input, inputBefore);
		input.pokemon[0].stats.spa = 99999;
		assert.strictEqual(model.project('p1a', 'flamethrower', 'p2a'), first);
		assert.equal(model.diagnostics.probes, 2);
		assert.equal(JSON.stringify(battle.toJSON()), before);
	});
});
