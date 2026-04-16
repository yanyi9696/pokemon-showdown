'use strict';

const assert = require('./../../assert');
const common = require('./../../common');
const Dex = require('./../../../dist/sim').Dex;

let battle;

describe('Huo Shan Xing Zhe', () => {
	afterEach(() => {
		if (battle) battle.destroy();
	});

	it('should allow Sea of Fire to coexist with terrain', () => {
		battle = common.gen(9).createBattle([
			[
				{species: 'Sunkern', ability: 'chlorophyll', moves: ['grassyterrain']},
			],
			[
				{species: 'Charmander', ability: 'blaze', moves: ['splash']},
			],
		]);

		battle.makeChoices('move grassyterrain', 'move splash');
		assert(battle.field.isTerrain('grassyterrain'));

		const huoshanxingzhe = Dex.mod('gen9fantasy').abilities.get('huoshanxingzhe');
		huoshanxingzhe.onStart.call(battle, battle.p2.active[0]);

		assert(battle.field.isTerrain('grassyterrain'));
		assert(battle.p1.sideConditions['seaoffire']);
	});
});
