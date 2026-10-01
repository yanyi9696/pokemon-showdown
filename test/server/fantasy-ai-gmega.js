'use strict';

const assert = require('assert').strict;
const { Battle, Dex, Teams } = require('../../dist/sim');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { captureInitialTeam, captureInitialMoves } = require('../../dist/server/fantasy-ai/initial-snapshot');
const { enumerateRequestChoices } = require('../../dist/server/fantasy-ai/actions');
const { readBattleMemory } = require('../../dist/server/fantasy-ai/memory');
const { WorldBuilder } = require('../../dist/server/fantasy-ai/world');
const { reconstructWorld } = require('../../dist/server/fantasy-ai/reconstruction');
const { possibleMegaForms } = require('../../dist/server/fantasy-ai/matchup');

describe('Fantasy AI independent G-Mega opportunity', function () {
	this.timeout(20000);
	const seed = 'gen5,0011001200130014';
	const format = 'gen9fcag';
	const dex = Dex.forFormat(format);
	let battle;
	afterEach(() => battle?.destroy());
	for (const gmega of [
		{ species: 'Gengar-Fantasy', item: 'G-Mega Wishing Star', moves: ['Splash'] },
		{ species: 'Urshifu-Fantasy', moves: ['Splash', 'Ren Zhen Ou Da'] },
		{ species: 'Urshifu-Rapid-Strike-Fantasy', moves: ['Splash', 'Yi Shun Qian Ji'] },
	]) {
		for (const gmegaFirst of [true, false]) {
			for (const difficulty of ['normal', 'hard']) {
				it(`${difficulty}: retains the other opportunity after ${gmegaFirst ? gmega.species : 'ordinary Mega'}`, () => {
					const regular = { species: 'Charizard', item: 'Charizardite X', moves: ['Splash'] };
					const team = [
						...(gmegaFirst ? [gmega, regular] : [regular, gmega]),
						{ species: 'Orbeetle-Fantasy', item: 'G-Mega Wishing Star', moves: ['Splash'] },
						{ species: 'Blastoise', item: 'Blastoisinite', moves: ['Splash'] },
						{ species: 'Mew', moves: ['Splash'] }, { species: 'Pikachu', moves: ['Splash'] },
					];
					const opponent = ['Blissey', 'Crobat', 'Raikou', 'Entei', 'Starmie', 'Flygon']
						.map(species => ({ species, ability: dex.species.get(species).abilities['0'],
							moves: ['Protect'], evs: { hp: 4 } }));
					battle = new Battle({ formatid: format, seed, p1: { team }, p2: { team: opponent } });
					const trainer = { format, packedTeam: Teams.pack(team) };
					const initialOpponent = captureInitialTeam(battle, 'p2');
					const opponentMoves = captureInitialMoves(battle, 'p2');
					battle.makeChoices();
					battle.makeChoices('move splash mega', 'move 1');
					battle.makeChoices('switch 2', 'move 1');
					const view = new InformationView({ ownSide: 'p1', difficulty, initialOpponent, opponentMoves });
					view.receiveUpdate(battle.log.join('\n'));
					const observation = view.observe(battle.p1.activeRequest);
					assert.equal(!!observation.request.active[0].canGMegaEvo, !gmegaFirst);
					const memory = readBattleMemory(observation.publicLog, dex);
					assert.equal(memory.sides.p1.resources.gmega, gmegaFirst);
					assert.equal(memory.sides.p1.resources.mega, !gmegaFirst);
					assert(enumerateRequestChoices(observation.request, memory.sides.p1.resources).includes('move 1 mega'));
					const world = new WorldBuilder(trainer).build(observation)[0];
					const copy = reconstructWorld(world, seed);
					try {
						assert(copy.p1.active[0].canMegaEvo);
						const spareG = copy.p1.pokemon.find(mon => mon.species.id === 'orbeetlefantasy');
						const spareMega = copy.p1.pokemon.find(mon => mon.species.id === 'blastoise');
						assert.equal(!!spareG.canMegaEvo, !gmegaFirst);
						assert.equal(!!spareMega.canMegaEvo, gmegaFirst);
						copy.makeChoices('move splash mega', 'move 1');
						assert(copy.p1.active[0].species.isMega);
					} finally { copy.destroy(); }
					const profile = world.teams.p1[0].profile;
					const target = world.teams.p2[0].profile;
					assert.equal(possibleMegaForms(format, profile, target, memory, 'p1').length, 1);
					memory.sides.p1.resources.mega = memory.sides.p1.resources.gmega = true;
					assert(!enumerateRequestChoices(observation.request, memory.sides.p1.resources).includes('move 1 mega'));
					assert.equal(possibleMegaForms(format, profile, target, memory, 'p1').length, 0);
				});
			}
		}
	}
});
