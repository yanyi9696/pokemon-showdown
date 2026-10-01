'use strict';

const assert = require('assert').strict;
const { Battle, Dex } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');
const { readBattleMemory } = require('../../../dist/server/fantasy-ai/memory');

const dex = Dex.mod('gen9fantasy');
const star = dex.items.get('gmegawishingstar');
const gmegas = star.megaEvolves.map((species, i) => ({
	species, item: star.name, moves: ['Splash'], target: star.megaStone[i],
})).concat([
	{ species: 'Urshifu-Fantasy', moves: ['Splash', 'Ren Zhen Ou Da'], target: 'Urshifu-G-Mega-Fantasy' },
	{ species: 'Urshifu-Rapid-Strike-Fantasy', moves: ['Splash', 'Yi Shun Qian Ji'],
		target: 'Urshifu-Rapid-Strike-G-Mega-Fantasy' },
]);
const regular = { species: 'Charizard', item: 'Charizardite X', moves: ['Splash'] };

describe('Fantasy independent G-Mega opportunity', function () {
	this.timeout(10000);
	let battle;
	afterEach(() => battle?.destroy());
	function create(team, gameType = 'singles', opponent = [{ species: 'Blissey', moves: ['Splash'] }]) {
		battle = new Battle({
			format: new Format({ name: 'Fantasy G-Mega test', mod: 'gen9fantasy', ruleset: [], gameType }),
			strictChoices: true, seed: [1, 2, 3, 4],
			p1: { team }, p2: { team: opponent },
		});
	}
	for (const gmega of gmegas) {
		for (const gmegaFirst of [true, false]) {
			it(`allows ${gmega.species} ${gmegaFirst ? 'before' : 'after'} ordinary Mega`, () => {
				create(gmegaFirst ? [gmega, regular] : [regular, gmega]);
				const [first, second] = battle.p1.pokemon;
				assert.equal(!!battle.p1.activeRequest.active[0].canGMegaEvo, gmegaFirst);
				battle.makeChoices('move 1 mega', 'move 1');
				assert.equal(first.species.name, gmegaFirst ? gmega.target : 'Charizard-Mega-X');
				assert.equal(first.canMegaEvo, null);
				assert(second.canMegaEvo);
				const memory = readBattleMemory(battle.log, dex);
				assert.equal(memory.sides.p1.resources.gmega, gmegaFirst);
				assert.equal(memory.sides.p1.resources.mega, !gmegaFirst);
				assert.equal(memory.sides.p2.resources.gmega, false);
				battle.makeChoices('switch 2', 'move 1');
				assert.equal(!!battle.p1.activeRequest.active[0].canGMegaEvo, !gmegaFirst);
				battle.makeChoices('move 1 mega', 'move 1');
				assert.equal(second.species.name, gmegaFirst ? 'Charizard-Mega-X' : gmega.target);
				assert.equal(second.canMegaEvo, null);
				assert.throws(() => battle.choose('p1', 'move 1 mega'));
			});
		}
	}
	for (const team of [[gmegas[0], gmegas[9]], [gmegas[9], gmegas[0]], [regular, regular]]) {
		it(`rejects a second use of the ${team[0] === regular ? 'ordinary' : 'G-Mega'} opportunity`, () => {
			create(team);
			battle.makeChoices('move 1 mega', 'move 1');
			assert.equal(battle.p1.pokemon[1].canMegaEvo, null);
			battle.makeChoices('switch 2', 'move 1');
			assert.equal(battle.p1.activeRequest.active[0].canMegaEvo, undefined);
			assert.throws(() => battle.choose('p1', 'move 1 mega'));
		});
	}
	for (const team of [[regular, gmegas[0]], [gmegas[0], regular]]) {
		it(`allows both opportunities in one doubles turn with ${team[0].species} first`, () => {
			create(team, 'doubles', [{ species: 'Blissey', moves: ['Splash'] }, { species: 'Mew', moves: ['Splash'] }]);
			assert(battle.choose('p1', 'move splash mega, move splash mega'));
			assert.equal(battle.p1.choice.mega, true);
			assert.equal(battle.p1.choice.gmega, true);
			battle.choose('p2', 'move splash, move splash');
			assert(battle.p1.active.every(mon => mon.species.isMega));
			assert.equal(battle.p1.active.filter(mon => mon.species.isGMega).length, 1);
		});
	}
	for (const team of [[gmegas[0], gmegas[9]], [regular, regular]]) {
		it(`rejects two ${team[0] === regular ? 'ordinary' : 'G-Mega'} choices in the same doubles turn`, () => {
			create(team, 'doubles', [{ species: 'Blissey', moves: ['Splash'] }, { species: 'Mew', moves: ['Splash'] }]);
			assert.throws(() => battle.choose('p1', 'move splash mega, move splash mega'));
			battle.makeChoices('move splash mega, move splash', 'move splash, move splash');
			assert.equal(battle.p1.active[1].canMegaEvo, null);
		});
	}
	it('preserves both opportunity states across switching and battle serialization', () => {
		battle = new Battle({
			formatid: 'gen9fcag', strictChoices: true, seed: [1, 2, 3, 4],
			p1: { team: [gmegas[0], gmegas[9], regular] },
			p2: { team: [{ species: 'Blissey', moves: ['Splash'] }] },
		});
		battle.makeChoices();
		battle.makeChoices('move 1 mega', 'move 1');
		const restored = Battle.fromJSON(JSON.parse(JSON.stringify(battle.toJSON())));
		battle.destroy();
		battle = restored;
		assert.equal(battle.p1.pokemon[1].canMegaEvo, null);
		assert.equal(battle.p1.pokemon[2].canMegaEvo, 'Charizard-Mega-X');
		battle.makeChoices('switch 3', 'move 1');
		battle.makeChoices('move 1 mega', 'move 1');
		assert.equal(battle.p1.active[0].species.name, 'Charizard-Mega-X');
	});
	it('keeps the opponent G-Mega opportunity independent', () => {
		create([gmegas[0]], 'singles', [gmegas[9]]);
		battle.makeChoices('move 1 mega', 'move 1');
		assert(battle.p2.activeRequest.active[0].canGMegaEvo);
		battle.makeChoices('move 1', 'move 1 mega');
		assert(battle.p1.active[0].species.isGMega);
		assert(battle.p2.active[0].species.isGMega);
	});
});
