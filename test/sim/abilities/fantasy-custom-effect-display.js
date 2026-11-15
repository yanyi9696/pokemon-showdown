'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

describe('Custom ability effects and protocol names', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function create(ability, move = 'watergun', options = {}) {
		battle = new Battle({ format: new Format({ name: 'Custom effect regression', mod: 'gen9fantasy', ruleset: [], gameType: 'doubles' }),
			seed: [1, 2, 3, 4], strictChoices: true,
			p1: { team: [{ species: 'Mew', ability, moves: [move], ...options.attacker }, { species: 'Blissey', ability: 'No Ability', moves: ['splash'] }] },
			p2: { team: [{ species: 'Mew', ability: 'No Ability', moves: ['splash'], ...options.defender },
				{ species: 'Vaporeon', ability: 'No Ability', moves: ['splash'] }] },
		});
		battle.randomizer = n => n;
		battle.randomChance = (numerator, denominator) => numerator >= denominator;
		return battle.p1.active[0];
	}
	for (const ability of ['Ji Zhi Neng', 'Ji Guang Xing Zhe', 'Huo Shan Xing Zhe', 'Lei Ting Xing Zhe']) {
		it(`${ability} uses a decodable ability name instead of a translated protocol ID`, () => {
			create(ability, 'watergun', { attacker: { species: 'Metagross' } });
			battle.makeChoices('move 1 1, move 1', 'move 1, move 1');
			const names = battle.log.filter(line => line.startsWith('|-ability|p1a:')).map(line => line.split('|')[3]);
			assert(names.length);
			for (const name of names) assert.equal(battle.dex.abilities.get(name).id, battle.dex.abilities.get(ability).id);
		});
	}
	for (const stealing of [true, false]) {
		it(`Magician's Red ${stealing ? 'steals' : 'destroys'} an item with its real ability identity`, () => {
			const source = create('Mo Shu Shi Zhi Hong', 'ember', { attacker: { item: stealing ? '' : 'Charcoal' }, defender: { item: 'Leftovers' } });
			source.storedStats.spe = 999;
			// Leave an actual pending opponent action for the before-it-moves condition.
			battle.p2.active[0].moveSlots[0].id = 'swordsdance';
			battle.makeChoices('move 1 1, move 1', 'move 1, move 1');
			assert.equal(battle.p2.active[0].item, '');
			const line = battle.log.find(l => l.startsWith(stealing ? '|-item|p1a:' : '|-enditem|p2a:'));
			assert(line.includes('[from] ability: Mo Shu Shi Zhi Hong'), line);
		});
	}
	it('Zheng Fa makes spread Fire attacks super effective against every Water target', () => {
		const source = create('Zheng Fa', 'heatwave');
		battle.randomChance = () => true;
		battle.makeChoices('move 1, move 1', 'move 1, move 1');
		const water = battle.p2.active[1];
		assert.equal(water.getMoveHitData(source.lastMoveUsed).typeMod, 1);
		assert(battle.log.some(line => line === '|-supereffective|p2b: Vaporeon'));
	});
	it('Feng Chao remains effective when supplied as a Rogue extra ability', () => {
		const source = create('No Ability', 'bugbite', { attacker: { species: 'Scyther' } });
		battle.fantasyRogue = {};
		source.addVolatile('ability:fengchao');
		source.hp -= 100;
		const hp = source.hp;
		battle.actions.useMove('bugbite', source, { target: battle.p2.active[0] });
		assert.equal(source.hp - hp, Math.floor(source.baseMaxhp / 8));
		assert(source.lastMoveUsed.fengchaoBoost);
		battle.fantasyRogue = undefined;
	});
});
