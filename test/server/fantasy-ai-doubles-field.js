'use strict';

const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Dex } = require('../../dist/sim/dex');
const { Format } = require('../../dist/sim/dex-formats');
const { startRogueSpirit, maintainRogueEnvironment } = require('../../dist/sim/fantasy-rogue-spirits');
const { DoublesFieldClock } = require('../../dist/server/fantasy-ai/doubles-field');
const { DoublesDamageModel } = require('../../dist/server/fantasy-ai/doubles-mechanics');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');
const { rankMultiChoices } = require('../../dist/server/fantasy-ai/multi-policy');

describe('Fantasy doubles public field lifetimes', () => {
	const dex = Dex.mod('gen9fantasy');
	const battles = [];
	afterEach(() => { for (const battle of battles.splice(0)) battle.destroy(); });
	const set = (species, moves = ['Splash'], extra = {}) => ({
		species, moves, ability: '', level: 50, nature: 'Serious', ...extra,
	});
	function create(move, extra = {}, spirit) {
		const battle = new Battle({
			format: new Format({ name: 'Field lifetime reference', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [],
				onResidualOrder: 100, onResidual() { if (spirit) maintainRogueEnvironment(this, true); },
			}),
			strictChoices: true, seed: [1, 2, 3, 4],
			p1: { team: [set('Bronzong', [move, 'Splash'], extra), set('Magikarp')] },
			p2: { team: [set('Blastoise'), set('Magikarp')] },
		});
		battles.push(battle);
		if (spirit) { battle.fantasyRogue = { spirit: { id: spirit, floor: 1 } }; startRogueSpirit(battle); }
		return battle;
	}
	const log = battle => extractChannelMessages(battle.log.join('\n'), [0])[0];
	function clock(lines) {
		const result = new DoublesFieldClock(dex);
		for (const line of lines) result.observe(line.split('|'));
		return result;
	}
	function snapshot(battle) {
		return {
			mod: 'gen9fantasy', turn: battle.turn,
			pokemon: battle.sides.flatMap(side => side.active.map((mon, index) => ({
				id: `${side.id}${index ? 'b' : 'a'}`, position: `${side.id}${index ? 'b' : 'a'}`, side: side.id,
				species: mon.species.name, level: mon.level, health: mon.hp / mon.maxhp,
				stats: { hp: mon.maxhp, ...mon.storedStats }, ability: mon.ability, item: mon.item,
				moves: mon.moves.slice(), types: mon.types.slice(), status: mon.status, boosts: { ...mon.boosts },
				volatiles: Object.keys(mon.volatiles), activeActions: mon.activeMoveActions,
			}))),
			weather: battle.field.weather, terrain: battle.field.terrain,
			trickRoom: !!battle.field.pseudoWeather.trickroom, magicRoom: !!battle.field.pseudoWeather.magicroom,
			conditions: { p1: Object.keys(battle.p1.sideConditions), p2: Object.keys(battle.p2.sideConditions) },
			durations: clock(log(battle)).durations,
		};
	}
	function idle(battle, turns = 1) {
		for (let i = 0; i < turns; i++) battle.makeChoices('move 2, move 1', 'move 1, move 1');
	}
	function forecast(battle, edit) {
		const state = snapshot(battle);
		edit?.(state);
		const model = new DoublesDamageModel(state);
		const result = model.projectTurn(state.pokemon.map(mon => ({ actor: mon.id, kind: 'move', move: 'splash' })));
		assert.deepEqual(model.diagnostics.turnFailures, []);
		assert.equal(result.samples.length, 2);
		return result.samples;
	}
	// Intercept only the detached snapshot to verify the real policy wires in public timers.
	function policySnapshot(battle, extra = []) {
		const original = DoublesDamageModel.prototype.project;
		let captured;
		try {
			DoublesDamageModel.prototype.project = function (...args) {
				captured = structuredClone(this.snapshot);
				return original.apply(this, args);
			};
			const request = structuredClone(battle.p1.activeRequest);
			request.active[0].moves.push({ move: 'Tackle', id: 'tackle', target: 'normal', pp: 35, maxpp: 35 });
			rankDoublesChoices({ ownSide: 'p1', difficulty: 'normal', request, publicLog: [...log(battle), ...extra] },
				'gen9fantasy', [], false);
			assert(captured, 'the real tactical policy must create a detached mechanics snapshot');
			return captured;
		} finally { DoublesDamageModel.prototype.project = original; }
	}

	for (const [move, id, duration] of [['Trick Room', 'trickroom', 5], ['Magic Room', 'magicroom', 5],
		['Tailwind', 'tailwind', 4], ['Safeguard', 'safeguard', 5]]) {
		for (const persistent of [false, true]) it(`expires ${move} with Persistent=${persistent} on the native turn`, () => {
			const battle = create(move, { ability: persistent ? 'Persistent' : '' });
			battle.makeChoices('move 1, move 1', 'move 1, move 1');
			idle(battle, duration + (persistent ? 2 : 0) - 2);
			const state = snapshot(battle), actualPolicy = policySnapshot(battle);
			const side = id === 'tailwind' || id === 'safeguard';
			assert.deepEqual(side ? state.durations.sides.p1[id] : state.durations.field[id], [1, 1]);
			assert.deepEqual(actualPolicy.durations, state.durations);
			const predicted = forecast(battle);
			idle(battle);
			for (const sample of predicted) {
				if (side) {
					assert(!battle.p1.sideConditions[id]); assert(!sample.conditions.p1.includes(id));
				} else {
					assert(!battle.field.pseudoWeather[id]); assert.equal(sample[id === 'trickroom' ? 'trickRoom' : 'magicRoom'], false);
				}
			}
		});
	}

	for (const [move, id, key] of [['Rain Dance', 'raindance', 'weather'], ['Grassy Terrain', 'grassyterrain', 'terrain']]) {
		it(`retains both public duration hypotheses for ${move}, without resetting on weather upkeep`, () => {
			const battle = create(move);
			battle.makeChoices('move 1, move 1', 'move 1, move 1'); idle(battle, 3);
			assert.deepEqual(snapshot(battle).durations.field[id], [1, 4]);
			const samples = forecast(battle);
			assert.equal(samples[0][key], ''); assert.equal(samples[1][key], id);
			idle(battle); assert.equal(battle.field[key], '');
		});
	}
	for (const [move, id, item, side] of [
		['Rain Dance', 'raindance', 'Damp Rock', false], ['Grassy Terrain', 'grassyterrain', 'Terrain Extender', false],
		['Reflect', 'reflect', 'Light Clay', true],
	]) it(`discards the short ${move} hypothesis after public survival past turn five`, () => {
		const battle = create(move, { item });
		battle.makeChoices('move 1, move 1', 'move 1, move 1'); idle(battle, 6);
		const state = snapshot(battle);
		assert.deepEqual(side ? state.durations.sides.p1[id] : state.durations.field[id], [1, 1]);
		const samples = forecast(battle); idle(battle);
		for (const sample of samples) {
			if (side) assert(!sample.conditions.p1.includes(id));
			else assert(![sample.weather, sample.terrain].includes(id));
		}
	});

	it('counts the first residual once for weather established before turn one', () => {
		const battle = create('Splash', { ability: 'Drizzle' });
		assert.deepEqual(snapshot(battle).durations.field.raindance, [5, 8]);
		idle(battle, 4);
		assert.deepEqual(snapshot(battle).durations.field.raindance, [1, 4]);
	});
	it('keeps known extender duration fixed at creation even after its owner loses the item', () => {
		const battle = create('Rain Dance');
		const base = log(battle), move = '|move|p1a: Bronzong|Rain Dance|p1a: Bronzong';
		const known = ['|-item|p1a: Bronzong|Damp Rock', move, '|-weather|RainDance',
			'|-enditem|p1a: Bronzong|Damp Rock', '|upkeep|'];
		const state = policySnapshot(battle, known);
		assert.deepEqual(state.durations.field.raindance, [7, 7]);
		assert.deepEqual(log(battle), base, 'ranking cannot mutate the live battle');
		const short = policySnapshot(battle, ['|-item|p1a: Bronzong|Leftovers', move, '|-weather|RainDance']);
		assert.deepEqual(short.durations.field.raindance, [5, 5]);
	});
	it('does not assume an undisclosed opposing extender and respects publicly suppressed items', () => {
		const battle = create('Splash');
		const move = '|move|p2a: Blastoise|Rain Dance|p2a: Blastoise';
		const unknown = policySnapshot(battle, [move, '|-weather|RainDance']);
		assert.deepEqual(unknown.durations.field.raindance, [5, 8]);
		const suppressed = policySnapshot(battle, ['|-item|p2a: Blastoise|Damp Rock',
			'|-fieldstart|move: Magic Room', move, '|-weather|RainDance']);
		assert.deepEqual(suppressed.durations.field.raindance, [5, 5]);
	});
	it('moves Court Change conditions and their remaining duration without transferring unrelated effects', () => {
		const battle = create('Tailwind');
		battle.makeChoices('move 1, move 1', 'move 1, move 1'); idle(battle, 1);
		const state = policySnapshot(battle, ['|-sidestart|p1: Player 1|Lucky Chant',
			'|-sidestart|p1: Player 1|Mat Block', '|-swapsideconditions']);
		assert.deepEqual(state.durations.sides.p2.tailwind, [2, 2]);
		assert(state.conditions.p2.includes('tailwind')); assert(!state.conditions.p1.includes('tailwind'));
		assert(state.conditions.p2.includes('luckychant'));
		assert(state.conditions.p1.includes('matblock')); assert(!state.conditions.p2.includes('matblock'));
	});

	for (const [spirit, id, kind] of [['palkia', 'trickroom', 'trickRoom'], ['groudon', 'sunnyday', 'weather'],
		['kyurem', 'snowscape', 'weather'],
		['tapulele', 'psychicterrain', 'terrain']]) {
		it(`preserves the publicly announced permanent ${spirit} field and clears it on replacement`, () => {
			const battle = create('Trick Room');
			battle.fantasyRogue = { spirit: { id: spirit, floor: 1 } };
			startRogueSpirit(battle);
			delete battle.fantasyRogue;
			idle(battle, 6);
			assert.deepEqual(snapshot(battle).durations.field[id], [0, 0]);
			assert.deepEqual(policySnapshot(battle).durations.field[id], [0, 0]);
			for (const sample of forecast(battle)) assert.equal(sample[kind], kind === 'trickRoom' ? true : id);
			if (kind === 'trickRoom') {
				battle.makeChoices('move 1, move 1', 'move 1, move 1');
				assert(!snapshot(battle).durations.field[id]);
				battle.makeChoices('move 1, move 1', 'move 1, move 1');
				assert.deepEqual(snapshot(battle).durations.field[id], [4, 4]);
			} else {
				const replacement = kind === 'weather' ? '|-weather|RainDance' : '|-fieldstart|move: Grassy Terrain';
				const next = policySnapshot(battle, [replacement]);
				assert(!next.durations.field[id]);
				assert.deepEqual(next.durations.field[kind === 'weather' ? 'raindance' : 'grassyterrain'], [5, 8]);
			}
		});
	}
	it('leaves new fields at full duration when activated after the residual', () => {
		const state = clock(['|upkeep|', '|-sidestart|p1: Player|move: Tailwind', '|turn|8']);
		assert.deepEqual(state.durations.sides.p1.tailwind, [4, 4]);
	});
	it('does not shorten the new alternating tower-spirit Tailwind during the preceding upkeep', () => {
		const battle = create('Splash', {}, 'tornadus');
		idle(battle, 4);
		assert(!battle.p1.sideConditions.tailwind);
		assert.equal(battle.p2.sideConditions.tailwind.duration, 4);
		assert.deepEqual(snapshot(battle).durations.sides.p2.tailwind, [4, 4]);
		idle(battle, 3);
		assert.deepEqual(snapshot(battle).durations.sides.p2.tailwind, [1, 1]);
		const before = JSON.stringify(battle.toJSON()), samples = forecast(battle);
		assert.equal(JSON.stringify(battle.toJSON()), before);
		for (const sample of samples) {
			assert(!sample.conditions.p2.includes('tailwind')); assert(sample.conditions.p1.includes('tailwind'));
		}
		idle(battle);
		assert(!battle.p2.sideConditions.tailwind); assert.equal(battle.p1.sideConditions.tailwind.duration, 4);
	});
	it('uses the announced five turns for Castform weather or terrain refreshed after expiry', () => {
		const battle = create('Splash', {}, 'castform');
		const first = battle.field.weather || battle.field.terrain;
		assert.deepEqual(snapshot(battle).durations.field[first], [5, 5]);
		idle(battle, 5);
		const next = battle.field.weather || battle.field.terrain;
		assert.deepEqual(snapshot(battle).durations.field[next], [5, 5]);
		assert.equal((battle.field.weather ? battle.field.weatherState : battle.field.terrainState).duration, 5);
	});
	it('gives actual native snow protection to Ice types rather than storing an inert weather name', () => {
		const battle = create('Splash', {}, 'kyurem');
		const mon = battle.p1.active[0];
		mon.setType('Ice');
		assert.equal(battle.field.weather, 'snowscape');
		assert(battle.dex.conditions.get(battle.field.weather).exists);
		const snowDefense = mon.getStat('def');
		battle.field.clearWeather();
		assert.equal(snowDefense, Math.floor(mon.getStat('def') * 1.5));
	});
	for (const remaining of [undefined, 3]) it(`repairs legacy inert snow without resetting duration ${remaining}`, () => {
		const battle = create('Splash');
		battle.fantasyRogue = { spirit: { id: 'kyurem', floor: 1 } };
		battle.field.setWeather('snow', battle.p1.active[0]);
		battle.field.weatherState.duration = remaining;
		const hp = battle.p1.active[0].hp;
		maintainRogueEnvironment(battle, true);
		assert.equal(battle.field.weather, 'snowscape');
		assert.equal(battle.field.weatherState.duration, remaining);
		assert.equal(battle.p1.active[0].hp, hp);
		assert.deepEqual(snapshot(battle).durations.field.snowscape, remaining ? [remaining, remaining] : [0, 0]);
	});
	for (const [spirit, move, key, fallback] of [['groudon', 'Rain Dance', 'weather', 'sunnyday'],
		['tapulele', 'Grassy Terrain', 'terrain', 'psychicterrain']]) {
		it(`restores the public ${spirit} default after a temporary override expires in the projection`, () => {
			const battle = create(move, {}, spirit);
			battle.makeChoices('move 1, move 1', 'move 1, move 1'); idle(battle, 3);
			const before = JSON.stringify(battle.toJSON()), samples = forecast(battle);
			assert.equal(JSON.stringify(battle.toJSON()), before);
			assert.equal(samples[0][key], fallback);
			idle(battle); assert.equal(battle.field[key], fallback);
		});
	}
	it('preserves public tower-spirit clocks through the actual four-seat Multi policy adapter', () => {
		const player = name => ({ name, team: [set('Blastoise', ['Splash', 'Tackle'])] });
		const battle = new Battle({
			format: new Format({ name: 'Multi field reference', mod: 'gen9fantasy', gameType: 'multi', ruleset: [],
				onResidualOrder: 100, onResidual() { maintainRogueEnvironment(this, true); },
			}),
			seed: [1, 2, 3, 4], p1: player('Host'), p2: player('Enemy'), p3: player('Guest'), p4: player('Other enemy'),
		});
		battles.push(battle);
		battle.fantasyRogue = { spirit: { id: 'tornadus', floor: 1 } }; startRogueSpirit(battle);
		for (let i = 0; i < 4; i++) battle.makeChoices('move 1', 'move 1', 'move 1', 'move 1');
		assert.equal(battle.p4.sideConditions.tailwind.duration, 4);
		let captured;
		const original = DoublesDamageModel.prototype.project, before = JSON.stringify(battle.toJSON());
		try {
			DoublesDamageModel.prototype.project = function (...args) {
				captured = structuredClone(this.snapshot); return original.apply(this, args);
			};
			const choices = rankMultiChoices({ p2: structuredClone(battle.p2.activeRequest),
				p4: structuredClone(battle.p4.activeRequest) }, log(battle), 'gen9fantasy', { jointTurns: true });
			assert(choices.length);
			assert.equal(captured.durations.environment.id, 'tornadus');
			assert.equal(captured.durations.environment.windSide, 1);
			assert.deepEqual(captured.durations.sides.p2.tailwind, [4, 4]);
			assert.equal(JSON.stringify(battle.toJSON()), before);
		} finally { DoublesDamageModel.prototype.project = original; }
	});
});
