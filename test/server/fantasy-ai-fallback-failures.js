'use strict';

const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { emergencyChoice } = require('../../dist/server/fantasy-ai/fallback');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Single-battle fast AI avoids publicly certain failures', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function start(moves) {
		const player = set('Snorlax', 'Thick Fat', 100, ['Splash']);
		const party = [player, { ...player, species: 'Blissey', ability: 'Natural Cure' }];
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [11, 22, 33, 44],
			fantasyRogue: { encounterId: 'failure-regression', team: party.map(mon => createRoguePokemon(mon, stats(0))),
				boosts: stats(0), bag: {}, balls: [], catchable: false },
			p1: { team: party },
			p2: { team: [set('Slowbro', 'Own Tempo', 50, moves), set('Slowking', 'Own Tempo', 50, moves)] },
		});
		battle.makeChoices('team 12', 'team 12');
	}
	function choice() {
		const view = new InformationView({ ownSide: 'p2', difficulty: 'normal' });
		view.receiveUpdate(extractChannelMessages(battle.log.join('\n'), [0])[0].join('\n'));
		const observation = view.observe(battle.p2.activeRequest);
		assert.equal(observation.fullState, undefined);
		assert.equal(observation.opponentMove, undefined);
		return emergencyChoice(observation, 'gen9fantasyrogue', ['switch 2'], true, true, false);
	}
	for (const status of ['slp', 'brn', 'psn']) {
		it(`does not repeat Yawn against a publicly ${status} target`, () => {
			start(['Yawn', 'Water Gun']);
			battle.p1.active[0].setStatus(status);
			battle.makeRequest('move');
			assert.equal(choice(), 'move 2');
		});
	}
	it('does not repeat Yawn while the first drowsiness is still pending', () => {
		start(['Yawn', 'Water Gun']);
		battle.makeChoices('move 1', 'move 1');
		assert(battle.p1.active[0].volatiles.yawn);
		assert.equal(choice(), 'move 2');
	});
	for (const move of ['Future Sight', 'Doom Desire']) {
		it(`waits for ${move} to land even if both active Pokemon change`, () => {
			start([move, 'Water Gun']);
			assert.equal(choice(), 'move 1');
			battle.makeChoices('move 1', 'move 1');
			assert.equal(choice(), 'move 2');
			battle.makeChoices('switch 2', 'switch 2');
			assert(battle.p1.slotConditions[0].futuremove);
			assert.equal(choice(), 'move 2');
			battle.makeChoices('move 1', 'move 2');
			assert(!battle.p1.slotConditions[0].futuremove);
			assert.equal(choice(), 'move 1');
		});
	}
	it('does not extend the pending duration after a failed repeated Future Sight', () => {
		start(['Future Sight', 'Water Gun']);
		battle.makeChoices('move 1', 'move 1');
		battle.makeChoices('move 1', 'move 1');
		assert(battle.log.some(line => line.startsWith('|-fail|p2')));
		assert.equal(choice(), 'move 2');
		battle.makeChoices('move 1', 'move 2');
		assert.equal(choice(), 'move 1');
	});
});
