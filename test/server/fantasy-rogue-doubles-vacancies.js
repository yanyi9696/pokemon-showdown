'use strict';

const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');

describe('Rogue doubles with fewer than two available members', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	const pokemon = () => ({ species: 'Magikarp', ability: 'Swift Swim', moves: ['Splash', 'Tackle'], level: 50 });
	for (const [left, right] of [[1, 2], [2, 1], [1, 1]]) {
		it(`plays ${left} versus ${right} with empty slots, explicit passes and native timer defaults`, () => {
			battle = new Battle({
				format: new Format({ name: 'Vacant doubles reference', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
				seed: [1, 2, 3, 4], strictChoices: true,
				p1: { team: Array.from({ length: left }, pokemon) }, p2: { team: Array.from({ length: right }, pokemon) },
			});
			assert.equal(battle.p1.pokemon.length, left);
			assert.equal(battle.p2.pokemon.length, right);
			assert.equal(battle.p1.active.filter(Boolean).length, left);
			assert.equal(battle.p2.active.filter(Boolean).length, right);
			battle.makeChoices(left === 1 ? 'move 1, pass' : 'move 1, move 1', right === 1 ? 'move 1, pass' : 'move 1, move 1');
			assert.equal(battle.turn, 2);
			battle.makeChoices('default', 'default');
			assert.equal(battle.turn, 3);
			const scored = rankDoublesChoices({
				ownSide: 'p2', difficulty: 'normal', request: battle.p2.activeRequest,
				publicLog: extractChannelMessages(battle.log.join('\n'), [0])[0],
			}, 'gen9fantasy');
			assert(scored.length, 'the joint scorer still handles a solo NPC');
			battle.makeChoices('default', scored[0].choice);
			assert.equal(battle.turn, 4);
			assert.deepEqual(scored[0].mechanics.failures, []);
			assert(scored[0].mechanics.probes > 0, 'vacant slots still use native attack evaluation');
		});
	}
	it('ends normally when the only member faints instead of trying to switch a missing slot', () => {
		battle = new Battle({
			format: new Format({ name: 'Vacant doubles faint', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
			seed: [1, 2, 3, 4], strictChoices: true,
			p1: { team: [pokemon()] },
			p2: { team: [{ species: 'Dragonite', ability: 'Inner Focus', moves: ['Dragon Rage'], level: 100 }, pokemon()] },
		});
		battle.p1.active[0].hp = 1;
		battle.makeChoices('move 1, pass', 'move 1 1, move 1');
		assert(battle.ended);
		assert.equal(battle.p1.pokemonLeft, 0);
	});
	for (const ability of ['Emergency Exit', 'Wimp Out', 'huibizaisheng']) {
		it(`resolves ${ability} while an opposing field slot is vacant`, () => {
			battle = new Battle({
				format: new Format({ name: 'Vacant field withdrawal', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
				seed: [1, 2, 3, 4], strictChoices: true,
				p1: { team: [{ species: 'Dragonite', ability: 'Inner Focus', moves: ['Dragon Rage'], level: 100 }] },
				p2: { team: [{ ...pokemon(), ability }, pokemon(), { ...pokemon(), species: 'Squirtle' }] },
			});
			battle.p2.active[0].hp = Math.floor(battle.p2.active[0].maxhp / 2) + 5;
			battle.makeChoices('move 1 1, pass', 'move 1, move 1');
			assert.deepEqual(battle.p2.activeRequest.forceSwitch, [true, false]);
			battle.makeChoices('', 'switch 3, pass');
			assert.equal(battle.p2.active[0].species.name, 'Squirtle');
		});
	}
});
