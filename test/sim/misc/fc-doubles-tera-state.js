'use strict';

const assert = require('assert').strict;
const { Battle, Teams, TeamValidator } = require('../../../dist/sim');

describe('FC Champions Doubles Tera state', () => {
	const formatid = 'gen9fcchampionsdoublesgi';
	const entries = [
		['Mewtwo', 'Pressure', 'Psychic', 'Fairy'],
		['Groudon', 'Drought', 'Ground', 'Water'],
		['Charizard', 'Blaze', 'Fire', 'Normal'],
		['Amoonguss', 'Regenerator', 'Grass', 'Dark'],
		['Pelipper', 'Drizzle', 'Water', 'Electric'],
		['Rillaboom', 'Grassy Surge', 'Grass', 'Stellar'],
	];
	const battles = [];
	afterEach(() => {
		for (const battle of battles.splice(0)) battle.destroy();
	});

	function prepare(explicit) {
		const original = entries.map(([species, ability, , teraType]) => ({
			species, ability, moves: ['Protect'], evs: { hp: 4, spa: 252, spe: 252 },
			...(explicit ? { teraType } : {}),
		}));
		const packed = Teams.pack(original);
		const team = Teams.unpack(packed);
		assert.equal(new TeamValidator(formatid).validateTeam(team), null);
		return { packed, team, expected: entries.map(row => row[explicit ? 3 : 2]) };
	}

	function create(team) {
		const battle = new Battle({
			formatid, strictChoices: true, seed: 'gen5,1,2,3,4',
			p1: { name: 'FCTestA', team: Teams.unpack(Teams.pack(team)) },
			p2: { name: 'FCTestB', team: Teams.unpack(Teams.pack(team)) },
		});
		battles.push(battle);
		return battle;
	}

	function verifyRequest(battle, expected) {
		for (const side of [battle.p1, battle.p2]) {
			assert.deepEqual(side.pokemon.map(mon => mon.teraType), expected);
			assert.deepEqual(side.getRequestData().pokemon.map(mon => mon.teraType), expected);
			assert.deepEqual(side.activeRequest.side.pokemon.map(mon => mon.teraType), expected);
		}
	}

	for (const explicit of [false, true]) {
		it(`keeps ${explicit ? 'chosen' : 'default'} Tera types through three consecutive six-pick-four battles`, () => {
			const { packed, team, expected } = prepare(explicit);
			for (let game = 0; game < 3; game++) {
				const battle = create(team);
				verifyRequest(battle, expected);
				battle.makeChoices('team 1234', 'team 1234');
				verifyRequest(battle, expected.slice(0, 4));
				assert.equal(battle.p1.activeRequest.active[0].canTerastallize, expected[0]);
				battle.makeChoices('move 1 terastallize, move 1', 'move 1, move 1');
				assert.equal(battle.p1.active[0].terastallized, expected[0]);
				assert.deepEqual(battle.p1.active[0].getTypes(), [expected[0]]);
				battle.win('p1');
			}
			const reloaded = Teams.unpack(packed);
			assert.equal(new TeamValidator(formatid).validateTeam(reloaded), null);
			assert.deepEqual(reloaded.map(mon => mon.teraType), expected);
		});
	}

	for (const alreadyTera of [false, true]) {
		it(`preserves requests after restoring a battle ${alreadyTera ? 'after' : 'before'} Terastallization`, () => {
			const { team, expected } = prepare(true);
			const battle = create(team);
			battle.makeChoices('team 1234', 'team 1234');
			if (alreadyTera) battle.makeChoices('move 1 terastallize, move 1', 'move 1, move 1');
			const restored = Battle.fromJSON(JSON.stringify(battle));
			battles.push(restored);
			restored.restart(battle.send);
			verifyRequest(restored, expected.slice(0, 4));
			assert.deepEqual(restored.p1.activeRequest, battle.p1.activeRequest);
			const choice = alreadyTera ? 'move 1, move 1' : 'move 1 terastallize, move 1';
			battle.makeChoices(choice, 'move 1, move 1');
			restored.makeChoices(choice, 'move 1, move 1');
			assert.equal(restored.p1.active[0].terastallized, 'Fairy');
			assert.deepEqual(restored.p1.active[0].getTypes(), ['Fairy']);
			assert.deepEqual(restored.p1.activeRequest, battle.p1.activeRequest);
		});
	}
});
