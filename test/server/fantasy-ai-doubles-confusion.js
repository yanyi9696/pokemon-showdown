'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { DoublesDamageModel } = require('../../dist/server/fantasy-ai/doubles-mechanics');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');
const { rankMultiChoices } = require('../../dist/server/fantasy-ai/multi-policy');

describe('Fantasy doubles public confusion and Taunt', () => {
	let battle;
	afterEach(() => battle?.destroy());
	function snapshot() {
		const mon = (id, species = 'Snorlax') => ({ id, side: id.slice(0, 2), position: id,
			species, level: 50, health: 1, moves: ['tackle', 'protect'], types: ['Normal'],
			status: '', boosts: {}, volatiles: [], activeActions: 1 });
		return { mod: 'gen9fantasy', turn: 2, pokemon: ['p1a', 'p1b', 'p2a', 'p2b'].map(id => mon(id)),
			weather: '', terrain: '', trickRoom: false, conditions: { p1: [], p2: [] } };
	}
	const attack = () => [{ actor: 'p1a', kind: 'move', move: 'tackle', target: 'p2a' }];
	it('blocks a taunted status move in native probes while preserving attacks', () => {
		const state = snapshot(); state.pokemon[0].species = 'Comfey'; state.pokemon[1].health = 0.2;
		state.pokemon[0].volatiles.push('taunt');
		const model = new DoublesDamageModel(state);
		assert.deepEqual(model.project('p1a', 'floralhealing', 'p1b').healing, {});
		assert(model.project('p1a', 'tackle', 'p2a').damage.p2a > 0);
		const turn = model.projectTurn([{ actor: 'p1a', kind: 'move', move: 'protect' }]);
		assert.deepEqual(turn.omittedVolatiles, []);
		assert(turn.samples.every(sample => !sample.moves.some(move => move.actor === 'p1a')));
	});
	it('preserves the native Z-status exception to Taunt', () => {
		const state = snapshot();
		Object.assign(state.pokemon[0], { health: 0.2, item: 'normaliumz', moves: ['recover'], volatiles: ['taunt'] });
		const model = new DoublesDamageModel(state);
		assert.deepEqual(model.project('p1a', 'recover', 'p1a').healing, {});
		assert(model.project('p1a', 'recover', 'p1a', 'zmove').healing.p1a > 0);
	});
	it('does not activate confusion when native Taunt has already prevented the move', () => {
		const state = snapshot();
		Object.assign(state.pokemon[0], { health: 0.2, moves: ['recover'], volatiles: ['taunt', 'confusion'] });
		const model = new DoublesDamageModel(state), result = model.project('p1a', 'recover', 'p1a');
		assert.deepEqual(result.healing, {}); assert.equal(result.selfDamage, 0);
		const turn = model.projectTurn([{ actor: 'p1a', kind: 'move', move: 'recover' }]);
		assert(turn.samples.every(sample => Math.abs(sample.pokemon.p1a.health - 0.2) < 0.01));
	});
	for (const [elapsed, minimum, factor] of [[0, 2, 0.67], [1, 2, 0.7525], [2, 2, 0.78], [3, 2, 0.835],
		[4, 2, 1], [1, 3, 0.67]]) {
		it(`weights a confusion attack after ${elapsed} public activations (minimum ${minimum})`, () => {
			const state = snapshot();
			const clean = new DoublesDamageModel(state).project('p1a', 'tackle', 'p2a');
			Object.assign(state.pokemon[0], { volatiles: ['confusion'], confusionActions: elapsed, confusionMinimum: minimum });
			const model = new DoublesDamageModel(state), result = model.project('p1a', 'tackle', 'p2a');
			assert(Math.abs(result.damage.p2a / clean.damage.p2a - factor) < 1e-8);
			assert.equal(result.selfDamage > 0, factor < 1);
			assert.deepEqual(result.omittedVolatiles, []);
			assert.deepEqual(model.diagnostics.failures, []);
		});
	}
	it('weights full-turn normal actions and native self hits without predicting the hidden seed', () => {
		const state = snapshot(); state.pokemon[0].volatiles.push('confusion');
		const before = JSON.stringify(state), model = new DoublesDamageModel(state);
		const single = model.project('p1a', 'tackle', 'p2a'), result = model.projectTurn(attack());
		assert.deepEqual(result.omittedVolatiles, []);
		assert(Math.abs(result.samples.reduce((sum, sample) => sum + sample.probability, 0) - 1) < 1e-8);
		const enemyDamage = result.samples.reduce((sum, sample) => sum + (1 - sample.pokemon.p2a.health) * sample.probability, 0);
		const selfDamage = result.samples.reduce((sum, sample) => sum + (1 - sample.pokemon.p1a.health) * sample.probability, 0);
		assert(Math.abs(enemyDamage - single.damage.p2a) < 1e-8);
		assert(Math.abs(selfDamage - single.selfDamage) < 1e-8);
		assert.equal(JSON.stringify(state), before);
	});
	it('keeps four confused actors bounded and preserves total probability', () => {
		const state = snapshot();
		for (const mon of state.pokemon) Object.assign(mon, { volatiles: ['confusion'], confusionActions: 2 });
		const model = new DoublesDamageModel(state);
		const result = model.projectTurn(state.pokemon.map(mon => ({ actor: mon.id, kind: 'move', move: 'protect' })));
		assert(result.samples.length <= 12);
		assert(Math.abs(result.samples.reduce((sum, sample) => sum + sample.probability, 0) - 1) < 1e-8);
		assert.deepEqual(result.omittedVolatiles, []); assert.deepEqual(model.diagnostics.turnFailures, []);
	});
	function observe(multi, firstMove = 'Tackle') {
		const mon = { species: 'Snorlax', level: 50, moves: [firstMove, 'Protect'] };
		battle = new Battle({ format: new Format({ name: 'Public volatile observation', mod: 'gen9fantasy',
			gameType: multi ? 'multi' : 'doubles', ruleset: [] }), seed: [1, 2, 3, 4],
		p1: { team: multi ? [mon] : [mon, mon] }, p2: { team: multi ? [mon] : [mon, mon] },
		...(multi ? { p3: { team: [mon] }, p4: { team: [mon] } } : {}) });
		for (const side of battle.sides) for (const active of side.activeRequest.active) delete active.canTerastallize;
		return multi ? { p2: battle.p2.activeRequest, p4: battle.p4.activeRequest } : battle.p2.activeRequest;
	}
	it('does not save Fake Out for a later turn after confusion self damage', () => {
		const request = observe(false, 'Fake Out');
		const publicLog = ['|switch|p1a: foe|Snorlax, L50|100/100', '|switch|p1b: foe2|Snorlax, L50|100/100',
			'|switch|p2a: own|Snorlax, L50|100/100', '|switch|p2b: other|Snorlax, L50|100/100', '|turn|1',
			'|-start|p2a: own|confusion', '|-activate|p2a: own|confusion',
			'|-damage|p2a: own|80/100|[from] confusion', '|turn|2'];
		request.side.pokemon[0].condition = '80/100';
		const ranked = rankDoublesChoices({ ownSide: 'p2', difficulty: 'normal', request, publicLog }, 'gen9fantasy', [], false);
		const fakeOut = ranked.filter(entry => entry.choice.startsWith('move 1 '));
		assert(fakeOut.length); assert(fakeOut.every(entry => entry.reasons.includes('fake-out-expired')));
	});
	for (const multi of [false, true]) it(`uses public confusion activations and clears them on switch (${multi ? 'Multi' : 'Doubles'})`, () => {
		const request = observe(multi), slot = multi ? 'p4b' : 'p2b';
		const log = ['|switch|p1a: foe|Snorlax, L50|100/100', '|switch|p2a: own|Snorlax, L50|100/100',
			`|switch|${slot}: other|Snorlax, L50|100/100`, '|turn|1',
			'|move|p1a: foe|Axe Kick|p2a: own', '|-start|p2a: own|confusion', '|-activate|p2a: own|confusion',
			'|turn|2', '|-activate|p2a: own|confusion', '|turn|3'];
		const original = DoublesDamageModel.prototype.project;
		let seen;
		DoublesDamageModel.prototype.project = function (...args) { seen ||= this.snapshot; return original.apply(this, args); };
		try {
			const rank = () => multi ? rankMultiChoices(request, log, 'gen9fantasy', { allowSwitch: false, jointTurns: true }) :
				rankDoublesChoices({ ownSide: 'p2', difficulty: 'normal', request, publicLog: log }, 'gen9fantasy', [], false, undefined, true);
			const ranked = rank(); assert(ranked[0].jointTurn); assert.deepEqual(ranked[0].mechanics.omittedVolatiles, []);
			assert.equal(seen.pokemon.find(mon => mon.id === 'p2a').confusionActions, 2);
			assert.equal(seen.pokemon.find(mon => mon.id === 'p2a').confusionMinimum, 3);
			seen = undefined; log.push('|replace|p2a: own|Zoroark, L50'); rank();
			assert.equal(seen.pokemon.find(mon => mon.id === 'p2a').confusionActions, 2);
			seen = undefined; log.push('|-end|p2a: own|confusion'); rank();
			assert(!seen.pokemon.find(mon => mon.id === 'p2a').volatiles.includes('confusion'));
			assert.equal(seen.pokemon.find(mon => mon.id === 'p2a').confusionActions, undefined);
			seen = undefined; log.push('|-start|p2a: own|confusion'); rank();
			assert.equal(seen.pokemon.find(mon => mon.id === 'p2a').confusionActions, 0);
			seen = undefined; log.push('|-end|p2a: own|confusion', '|move|p1a: foe|Axe Kick|p2a: own',
				'|-heal|p2a: own|100/100|[from] item: Figy Berry', '|-start|p2a: own|confusion'); rank();
			assert.equal(seen.pokemon.find(mon => mon.id === 'p2a').confusionMinimum, 2);
			seen = undefined; log.push('|-end|p2a: own|confusion',
				'|-start|p2a: own|confusion|[from] ability: Poison Puppeteer|[of] p1a: foe'); rank();
			assert.equal(seen.pokemon.find(mon => mon.id === 'p2a').confusionMinimum, 2);
			seen = undefined; log.push('|switch|p2a: replacement|Snorlax, L50|100/100'); rank();
			assert(!seen.pokemon.find(mon => mon.id === 'p2a').volatiles.includes('confusion'));
			assert(!seen.pokemon.find(mon => mon.id === 'p2a').confusionActions);
		} finally { DoublesDamageModel.prototype.project = original; }
	});
});
