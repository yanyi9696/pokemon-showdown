'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { enumerateDoublesChoices, combineDoublesActions } = require('../../dist/server/fantasy-ai/doubles-actions');

describe('Fantasy doubles native action enumeration', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	const mon = (species, moves, item = '') => ({ species, moves, item });
	function start(team, extra = {}) {
		battle = new Battle({ format: new Format({ name: 'Doubles action tests', mod: 'gen9fantasy', gameType: 'doubles',
			ruleset: [], ...extra }), strictChoices: true, seed: [1, 2, 3, 4],
		p1: { team }, p2: { team: [mon('Snorlax', ['Splash']), mon('Blissey', ['Splash'])] } });
		return battle.p1.activeRequest;
	}
	function nativeAcceptsAll(choices, side = battle.p1) {
		assert(choices.length);
		for (const choice of choices) assert(side.choose(choice.choice), choice.choice);
		side.clearChoice();
	}
	it('generates valid attacks, support targets, targetless spreads and nonduplicated switches', () => {
		const request = start([mon('Gardevoir', ['Moonblast', 'Heal Pulse', 'Helping Hand', 'Protect']),
			mon('Garchomp', ['Earthquake', 'Dragon Claw', 'Swords Dance', 'Protect']), mon('Incineroar', ['Fake Out'])]);
		const choices = enumerateDoublesChoices(request);
		nativeAcceptsAll(choices);
		assert(choices.some(c => c.choice.startsWith('move 2 -2, ')), 'healing partner is available');
		assert(choices.some(c => c.actions[1].move === 'earthquake' && c.actions[1].target === 0),
			'spread move needs no target');
		assert(!choices.some(c => c.choice === 'switch 3, switch 3'));
		assert(!choices.some(c => c.actions.some(a => a.move === 'helpinghand' && a.target > 0)));
	});
	it('omits disabled moves and public fainted targets without forbidding purposeful ally attacks', () => {
		const request = start([mon('Whimsicott', ['Beat Up', 'Tailwind']), mon('Lucario', ['Close Combat', 'Protect'])]);
		request.active[0].moves[1].disabled = true;
		const choices = enumerateDoublesChoices(request, { foes: [2] });
		assert(choices.every(c => c.actions.every(a => a.target !== 1)));
		assert(choices.some(c => c.actions[0].move === 'beatup' && c.actions[0].target === -2));
		assert(!choices.some(c => c.actions[0].move === 'tailwind'));
		nativeAcceptsAll(choices);
	});
	it('supports native four-seat ally locations for both front and back teammates', () => {
		battle = new Battle({ format: new Format({ name: 'Multi action tests', mod: 'gen9fantasy', gameType: 'multi', ruleset: [] }),
			strictChoices: true, seed: [1, 2, 3, 4],
			...Object.fromEntries(['p1', 'p2', 'p3', 'p4'].map(id => [id, { team: [mon('Indeedee-F',
				['Heal Pulse', 'Helping Hand', 'Psychic', 'Protect'])] }])) });
		for (const id of ['p1', 'p2', 'p3', 'p4']) {
			const side = battle.getSide(id), choices = enumerateDoublesChoices(side.activeRequest, { allyAlive: true });
			const loc = ['p3', 'p4'].includes(id) ? -1 : -2;
			assert(choices.some(c => c.actions[0].move === 'helpinghand' && c.actions[0].target === loc));
			nativeAcceptsAll(choices, side);
		}
	});
	it('supports native partial selection rather than silently filling a six-mon team', () => {
		const team = ['Pikachu', 'Eevee', 'Snorlax', 'Gardevoir', 'Garchomp', 'Amoonguss'].map(s => mon(s, ['Protect']));
		const request = start(team, { ruleset: ['Team Preview', 'Picked Team Size = 4'] });
		const choices = enumerateDoublesChoices(request);
		assert.equal(choices.length, 360);
		assert(choices.every(c => c.choice.length === 9));
		nativeAcceptsAll(choices);
	});
	for (const [species, move] of [['Sceptile', 'Solar Blade'], ['Archaludon', 'Electro Shot'], ['Lunatone', 'Meteor Beam']]) {
		it(`uses the native locked command without a target on the second turn of ${move}`, () => {
			start([mon(species, [move, 'Protect']), mon('Eevee', ['Splash'])]);
			battle.makeChoices('move 1 1, move 1', 'move 1, move 1');
			const request = battle.p1.activeRequest;
			assert.equal(request.active[0].moves.length, 1);
			assert.equal(request.active[0].moves[0].target, undefined);
			const choices = enumerateDoublesChoices(request);
			assert(choices.every(choice => choice.actions[0].command === 'move 1'));
			nativeAcceptsAll(choices);
			battle.makeChoices(choices[0].choice, 'move 1, move 1');
			assert.equal(battle.turn, 3);
		});
	}
	it('uses exactly one reserve when both active slots faint and only one replacement survives', () => {
		start([mon('Pikachu', ['Protect']), mon('Eevee', ['Protect']), mon('Snorlax', ['Protect'])]);
		for (const p of battle.p1.active) p.faint();
		battle.faintMessages();
		for (const p of battle.p1.active) p.switchFlag = true;
		battle.makeRequest('switch');
		const choices = enumerateDoublesChoices(battle.p1.activeRequest);
		assert.deepEqual(choices.map(c => c.choice).sort(), ['pass, switch 3', 'switch 3, pass']);
		nativeAcceptsAll(choices);
	});
	it('shares Mega, Tera and Z opportunities between the two active slots', () => {
		const request = start([mon('Gardevoir', ['Moonblast', 'Protect'], 'Gardevoirite'),
			mon('Gengar', ['Shadow Ball', 'Protect'], 'Gengarite')]);
		const choices = enumerateDoublesChoices(request);
		assert(choices.some(c => c.resources.includes('mega')));
		assert(!choices.some(c => c.resources.filter(r => r === 'mega').length > 1));
		assert(!choices.some(c => c.resources.filter(r => r === 'tera').length > 1));
		nativeAcceptsAll(choices);
	});
	it('prevents Z/aura conflicts while preserving separate G-Mega and Mega opportunities', () => {
		const action = (slot, resource) => ({ slot, kind: 'move', command: 'move 1', resources: resource });
		assert.equal(combineDoublesActions([[action(0, ['zmove'])], [action(1, ['aura', 'zmove'])]]).length, 0);
		assert.equal(combineDoublesActions([[action(0, ['mega'])], [action(1, ['gmega'])]]).length, 1);
	});
	it('uses the Z move target instead of the original spread target and accepts every choice natively', () => {
		const request = start([mon('Garchomp', ['Earthquake', 'Protect'], 'Groundium Z'),
			mon('Tyranitar', ['Rock Slide', 'Protect'], 'Rockium Z')]);
		const choices = enumerateDoublesChoices(request);
		assert(choices.some(c => c.actions[0].transform === 'zmove' && c.actions[0].target === 1));
		assert(!choices.some(c => c.actions.filter(a => a.transform === 'zmove').length > 1));
		nativeAcceptsAll(choices);
	});
	it('keeps the waiting active slot while answering a native Revival Blessing request', () => {
		start([mon('Pawmot', ['Revival Blessing', 'Protect']), mon('Eevee', ['Protect']), mon('Snorlax', ['Protect'])]);
		battle.p1.pokemon[2].faint(); battle.faintMessages();
		battle.makeChoices('move 1, move 1', 'move 1, move 1');
		const request = battle.p1.activeRequest;
		assert(request.forceSwitch);
		const choices = enumerateDoublesChoices(request);
		assert(choices.every(c => c.choice === 'switch 3, pass'));
		nativeAcceptsAll(choices);
	});
	it('does not mutate the native request or read unknown opponent information', () => {
		const request = start([mon('Pikachu', ['Thunderbolt']), mon('Eevee', ['Helping Hand'])]);
		const before = JSON.stringify(request);
		enumerateDoublesChoices(request, { resources: { tera: true }, allowSwitch: false });
		assert.equal(JSON.stringify(request), before);
		assert.deepEqual(enumerateDoublesChoices({ wait: true, side: request.side }), []);
	});
});
