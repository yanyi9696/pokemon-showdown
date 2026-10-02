'use strict';

const assert = require('../../assert');
const { Battle } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

describe('Ji Sheng (Fantasy)', () => {
	let battle;

	afterEach(() => {
		battle?.destroy();
		battle = null;
	});

	function createBattle(hasReserve = true) {
		battle = new Battle({
			format: new Format({ name: 'Fantasy Ji Sheng test', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
			strictChoices: true,
			seed: [1, 2, 3, 4],
		});
		const team = [
			{ species: 'Mew', ability: 'Synchronize', moves: ['jisheng', 'splash'] },
			{ species: 'Snorlax', ability: 'Immunity', moves: ['splash'] },
		];
		if (hasReserve) team.push({ species: 'Blissey', ability: 'Natural Cure', moves: ['splash'] });
		battle.setPlayer('p1', { team });
		battle.setPlayer('p2', { team: [
			{ species: 'Magikarp', ability: 'Swift Swim', moves: ['splash'] },
			{ species: 'Magikarp', ability: 'Swift Swim', moves: ['splash'] },
		] });
		return battle.p1.active;
	}

	for (const hasReserve of [true, false]) {
		for (const hp of ['1 HP', 'below cost', 'exact cost']) {
			it(`should continue after fainting an ally at ${hp} ${hasReserve ? 'with' : 'without'} a replacement`, () => {
				const [source, target] = createBattle(hasReserve);
				const cost = Math.floor(target.maxhp / 4);
				target.hp = hp === '1 HP' ? 1 : cost - (hp === 'below cost' ? 1 : 0);

				battle.makeChoices('move jisheng -2, move splash', 'move splash, move splash');

				assert.fainted(target);
				assert.equal(source.volatiles['parasite'], undefined);
				assert.equal(target.volatiles['parasitized'], undefined);
				assert(!battle.log.some(line => line.startsWith('|-boost|p1b:')));
				assert(!battle.log.some(line => line.includes('被保护起来了')));
				if (hasReserve) {
					assert.deepEqual(battle.p1.activeRequest.forceSwitch, [false, true]);
					battle.makeChoices('pass, switch 3');
					assert.species(battle.p1.active[1], 'Blissey');
				}
				assert.equal(battle.requestState, 'move');
				assert(!battle.p1.activeRequest.side.pokemon[0].commanding);
				const turn = battle.turn;
				battle.makeChoices(hasReserve ? 'move splash, move splash' : 'move splash, pass', 'move splash, move splash');
				assert.equal(battle.turn, turn + 1);
			});
		}
	}

	for (const hp of ['full HP', '1 HP above cost']) {
		it(`should preserve the damage, boosts and linked states for an ally at ${hp}`, () => {
			const [source, target] = createBattle();
			const cost = Math.floor(target.maxhp / 4);
			target.hp = hp === 'full HP' ? target.maxhp : cost + 1;
			const initialHP = target.hp;

			battle.makeChoices('move jisheng -2, move splash', 'move splash, move splash');

			assert.equal(target.hp, initialHP - cost);
			assert.equal(target.boosts.atk, 1);
			assert.equal(target.boosts.spa, 1);
			assert.equal(target.boosts.spe, 1);
			assert.equal(source.volatiles['parasite'].parasiteTarget, target);
			assert.equal(target.volatiles['parasitized'].parasiteSource, source);
			assert(battle.p1.activeRequest.side.pokemon[0].commanding);
			battle.makeChoices('pass, move splash', 'move splash, move splash');
			assert.equal(battle.turn, 3);
		});
	}

	it('should release the user when the surviving host later faints from residual damage', () => {
		const [source, target] = createBattle();
		target.hp = Math.floor(target.maxhp / 4) + 1;
		target.setStatus('brn');

		battle.makeChoices('move jisheng -2, move splash', 'move splash, move splash');

		assert.fainted(target);
		assert.equal(source.volatiles['parasite'], undefined);
		battle.makeChoices('pass, switch 3');
		assert(!battle.p1.activeRequest.side.pokemon[0].commanding);
		battle.makeChoices('move splash, move splash', 'move splash, move splash');
		assert.equal(battle.turn, 3);
	});
});
