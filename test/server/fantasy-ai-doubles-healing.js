'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');
const { enumerateDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-actions');

describe('Fantasy doubles ally healing decisions', () => {
	let battle;
	afterEach(() => battle?.destroy());
	function observe(move, species = 'Comfey', ability = 'Triage', target = 'Snorlax') {
		const mon = (name, moves, power) => ({ species: name, ability: power || 'Pressure', level: 50, moves });
		battle = new Battle({ format: new Format({ name: 'Healing decisions', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
			seed: [1, 2, 3, 4], strictChoices: true,
			p1: { team: [mon('Blastoise', ['Splash']), mon('Snorlax', ['Splash'])] },
			p2: { team: [mon(species, [move, 'Splash'], ability), mon(target, ['Tackle', 'Protect'])] },
		});
		const request = structuredClone(battle.p2.activeRequest);
		for (const active of request.active) delete active.canTerastallize;
		request.side.pokemon[1].condition = '20/100';
		return { ownSide: 'p2', difficulty: 'normal', request, publicLog: [
			'|switch|p2a: healer|' + species + ', L50|100/100',
			'|switch|p2b: ally|' + target + ', L50|20/100',
			'|switch|p1a: foe|Blastoise, L50|20/100',
			'|switch|p1b: foe2|Snorlax, L50|100/100', '|turn|1',
		] };
	}
	function score(o, choice) {
		const result = rankDoublesChoices(o, 'gen9fantasy', [], false).find(entry => entry.choice === choice);
		assert(result, choice); return result;
	}
	for (const [move, species, ability] of [['Floral Healing', 'Comfey', 'Triage'], ['Heal Pulse', 'Audino', 'Regenerator']]) {
		it(`values ${move} for a wounded ally, penalizes healing the enemy and skips a full ally`, () => {
			const o = observe(move, species, ability), ally = 'move 1 -2, move 1 1', idle = 'move 2, move 1 1';
			assert(score(o, ally).score > score(o, idle).score + 15);
			assert(score(o, ally).reasons.includes('heal-ally'));
			assert(score(o, 'move 1 1, move 1 1').score < score(o, idle).score);
			o.request.side.pokemon[1].condition = '100/100'; o.publicLog.push('|-heal|p2b: ally|100/100');
			assert(score(o, ally).score < score(o, idle).score);
		});
		it(`does not credit blocked ${move} healing`, () => {
			const o = observe(move, species, ability), ally = 'move 1 -2, move 1 1';
			const before = score(o, ally).score;
			o.publicLog.push('|-start|p2b: ally|move: Heal Block');
			assert(score(o, ally).score < before - 15); assert(!score(o, ally).reasons.includes('heal-ally'));
		});
	}
	it('treats Pollen Puff on an ally as healing and on an enemy as damage', () => {
		const o = observe('Pollen Puff', 'Amoonguss', 'Regenerator');
		assert(score(o, 'move 1 -2, move 1 1').reasons.includes('heal-ally'));
		assert(!score(o, 'move 1 1, move 1 1').reasons.includes('heal-ally'));
	});
	it('does not count a Good as Gold ally as a successful Heal Pulse target', () => {
		const o = observe('Heal Pulse', 'Audino', 'Regenerator', 'Gholdengo');
		o.request.side.pokemon[1].ability = 'goodasgold'; o.request.side.pokemon[1].baseAbility = 'goodasgold';
		assert(!score(o, 'move 1 -2, move 1 1').reasons.includes('heal-ally'));
	});
	it('coordinates healing with an attacking partner rather than healing into its Protect', () => {
		const o = observe('Floral Healing');
		const commands = ['move 1 -2, move 1 1', 'move 1 -2, move 2'];
		const candidates = enumerateDoublesChoices(o.request, { allowSwitch: false, foes: [1, 2] })
			.filter(candidate => commands.includes(candidate.choice));
		assert.equal(candidates.length, 2);
		const ranked = rankDoublesChoices(o, 'gen9fantasy', [], false, candidates, true);
		assert.equal(ranked.length, 2);
		assert.equal(ranked[0].choice, commands[0]);
		assert(ranked[0].jointTurn);
		assert(ranked[0].score > ranked[1].score);
		assert.deepEqual(ranked[0].mechanics.turnFailures, []);
	});
});
