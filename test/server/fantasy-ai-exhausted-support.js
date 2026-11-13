'use strict';

const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { enumerateDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-actions');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');
const { prepareMultiChoices } = require('../../dist/server/fantasy-ai/multi-policy');

describe('Fantasy AI exhausted ally support', () => {
	let battle;
	afterEach(() => battle?.destroy());
	const mon = (species, moves) => ({ species, moves, level: 50 });
	const log = () => extractChannelMessages(battle.log.join('\n'), [0])[0];
	function start(slot = 0, reserve = false) {
		const team = [mon('Cresselia', ['Psychic', 'Helping Hand']), mon('Magikarp', ['Splash'])];
		if (slot) team.reverse();
		if (reserve) team.push(mon('Pikachu', ['Thunderbolt']));
		battle = new Battle({ format: new Format({ name: 'Exhausted support', mod: 'gen9fantasy',
			gameType: 'doubles', ruleset: [] }), strictChoices: true, seed: [1, 2, 3, 4],
		p1: { team: [mon('Snorlax', ['Splash']), mon('Blissey', ['Splash'])] }, p2: { team } });
		battle.p2.active[1 - slot].faint(); battle.faintMessages();
		const actor = battle.p2.active[slot];
		actor.moveSlots[0].pp = 0;
		battle.makeRequest('move');
		for (const active of battle.p2.activeRequest.active) delete active.canTerastallize;
		return actor;
	}
	for (const slot of [0, 1]) it(`keeps the final legal support move in doubles slot ${slot + 1}`, () => {
		const actor = start(slot), request = battle.p2.activeRequest;
		const before = JSON.stringify(request), pp = actor.moveSlots[1].pp;
		const ranked = rankDoublesChoices({ difficulty: 'normal', ownSide: 'p2', request, publicLog: log() },
			'gen9fantasy', [], true, undefined, true);
		assert(ranked.length);
		assert.equal(ranked[0].choice, slot ? 'pass, move 2 -1' : 'move 2 -2, pass');
		assert.equal(JSON.stringify(request), before);
		assert(!ranked.some(choice => choice.choice.includes('struggle')));
		assert(battle.p2.choose(ranked[0].choice)); assert(battle.p1.choose('move 1, move 1'));
		battle.commitChoices();
		assert.equal(battle.turn, 2);
		assert.equal(actor.moveSlots[1].pp, pp - 1);
	});
	it('continues excluding empty-target support when an attack is available', () => {
		const actor = start(); actor.moveSlots[0].pp = 1; battle.makeRequest('move');
		const choices = enumerateDoublesChoices(battle.p2.activeRequest);
		assert(choices.length);
		assert(choices.every(choice => choice.actions[0].move === 'psychic'));
	});
	it('switches to a usable reserve instead of spending ally-only support PP', () => {
		start(0, true);
		const choices = enumerateDoublesChoices(battle.p2.activeRequest);
		assert.deepEqual(choices.map(choice => choice.choice), ['switch 3, pass']);
		assert(battle.p2.choose(choices[0].choice));
	});
	it('retains the legal support move when reserve switching is disallowed', () => {
		start(0, true);
		const choices = enumerateDoublesChoices(battle.p2.activeRequest, { allowSwitch: false });
		assert.deepEqual(choices.map(choice => choice.choice), ['move 2 -2, pass']);
		assert(battle.p2.choose(choices[0].choice));
	});
	for (const seat of ['p2', 'p4']) it(`handles an exhausted last enemy in native Multi seat ${seat}`, () => {
		battle = new Battle({ format: new Format({ name: 'Multi exhausted support', mod: 'gen9fantasy',
			gameType: 'multi', ruleset: [] }), strictChoices: true, seed: [1, 2, 3, 4],
		...Object.fromEntries(['p1', 'p2', 'p3', 'p4'].map(id => [id, { team: [id === seat ?
			mon('Cresselia', ['Psychic', 'Helping Hand']) : mon('Magikarp', ['Splash'])] }])) });
		// The controller retains a waiting/fainted seat's last request and marks that seat fixed.
		const latest = structuredClone({ p2: battle.p2.activeRequest, p4: battle.p4.activeRequest });
		const partner = seat === 'p2' ? 'p4' : 'p2';
		battle[partner].active[0].faint(); battle.faintMessages();
		const actor = battle[seat].active[0]; actor.moveSlots[0].pp = 0;
		battle.makeRequest('move');
		const request = battle[seat].activeRequest;
		delete request.active[0].canTerastallize;
		latest[seat] = request;
		const prepared = prepareMultiChoices(latest, log(), { fixed: { [partner]: null } });
		assert(prepared);
		const ranked = rankDoublesChoices(prepared.observation, 'gen9fantasy', [], false, prepared.candidates, true);
		assert(ranked.length);
		const choice = prepared.commands.get(ranked[0].choice)[seat];
		assert.equal(choice, seat === 'p2' ? 'move 2 -2' : 'move 2 -1');
		assert(battle[seat].choose(choice));
		assert(battle.p1.choose('move 1')); assert(battle.p3.choose('move 1'));
		battle.commitChoices();
		assert.equal(battle.turn, 2);
	});
});
