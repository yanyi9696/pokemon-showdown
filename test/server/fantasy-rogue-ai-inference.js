'use strict';

const assert = require('assert').strict;
const { Battle, Dex } = require('../../dist/sim');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { HypothesisBuilder } = require('../../dist/server/fantasy-ai/hypotheses');
const { readBattleMemory } = require('../../dist/server/fantasy-ai/memory');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue AI inference', () => {
	let battle;
	afterEach(() => battle?.destroy());
	for (const version of [1, 2]) it(`retains difficulty version ${version} while inferring enemy stats`, () => {
		const member = createRoguePokemon(set('Mew', 'Synchronize', 50, ['Splash']), stats(0));
		battle = new Battle({ formatid: 'gen9fantasyrogue',
			fantasyRogue: { encounterId: 'inference-version', team: [member], boosts: stats(0), bag: {}, balls: [],
				catchable: false, difficulty: { tier: 5, floor: 200, version } },
			p1: { team: [member.set] }, p2: { team: [set('Mew', 'Synchronize', 50, ['Splash'])] } });
		battle.makeChoices('team 1', 'team 1');
		const view = new InformationView({ ownSide: 'p1', difficulty: 'normal', partySize: 1,
			rogueDifficulty: { tier: 5, floor: 200, version } });
		view.receiveUpdate(battle.log.join('\n'));
		const observation = view.observe(battle.p1.activeRequest);
		assert.equal(observation.rogueDifficulty.version, version);
		const memory = readBattleMemory(observation.publicLog, Dex.forFormat('gen9fantasyrogue'));
		const hypotheses = new HypothesisBuilder('gen9fantasyrogue').build(memory.sides.p2.active, observation, memory);
		assert(hypotheses.length);
		assert(hypotheses.every(mon => mon.rogueDifficulty === (version === 1 ? 1.5 : 1)));
	});
	it('includes the public Speed bonus when learning from native move order', () => {
		const boosts = { ...stats(0), spe: 40 };
		const member = createRoguePokemon({ ...set('Mew', 'Synchronize', 100, ['Splash']),
			item: 'Leftovers', nature: 'Timid', evs: { ...stats(0), spe: 252 } }, boosts);
		battle = new Battle({
			formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'test:inference', team: [member], boosts,
				bag: {}, balls: [], catchable: false },
			p1: { team: [member.set] },
			p2: { team: [{ ...set('Mew', 'Synchronize', 100, ['Splash']),
				nature: 'Timid', evs: { ...stats(0), spe: 184 } }] },
		});
		battle.makeChoices('team 1', 'team 1');
		battle.add('-item', battle.p1.active[0], 'Leftovers');
		const builder = new HypothesisBuilder('gen9fantasyrogue');
		const hypotheses = () => {
			const view = new InformationView({ ownSide: 'p2', difficulty: 'normal', partySize: 1, rogueBoosts: boosts });
			view.setOpponentMoves([{ species: 'Mew', moves: ['splash'] }]);
			view.receiveUpdate(battle.log.join('\n'));
			const observation = view.observe(battle.p2.activeRequest);
			const memory = readBattleMemory(observation.publicLog, Dex.forFormat('gen9fantasyrogue'));
			return builder.build(memory.sides.p1.active, observation, memory);
		};
		const ownSpeed = battle.p2.active[0].getStat('spe');
		const before = hypotheses().find(mon => mon.stats.spe > ownSpeed && mon.stats.spe - boosts.spe < ownSpeed);
		assert(before, 'A plausible set must outspeed the AI only because of the public bonus');
		battle.makeChoices('move 1', 'move 1');
		const after = hypotheses().find(mon => mon.stats.spe === before.stats.spe && mon.item === before.item);
		assert(after.probability > before.probability,
			`The observed faster move should support the boosted set: ${before.probability} -> ${after.probability}`);
		assert.equal(after.source, 'prior');
	});
});
