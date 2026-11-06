'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { splitCoopOpponents } = require('../../dist/server/fantasy-rogue/coop-team');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { captureCoopCheckpoint, validCoopCheckpoint } = require('../../dist/sim/rogue-coop-checkpoint');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue Multi opponent partition', () => {
	const battles = [];
	afterEach(() => { for (const battle of battles.splice(0)) battle.destroy(); });
	for (const count of [2, 4, 6]) it(`preserves the authored first pair and distinct original IDs for ${count} opponents`, () => {
		const team = Array.from({ length: count }, (_, i) => ({ ...set('Magikarp', 'Swift Swim', 10, ['Splash']), name: `Foe${i}` }));
		const before = JSON.stringify(team), partition = splitCoopOpponents(team);
		assert.equal(partition.first[0].name, 'Foe0');
		assert.equal(partition.second[0].name, 'Foe1');
		assert.equal(partition.first.length, count / 2);
		assert.equal(partition.second.length, count / 2);
		assert.equal(JSON.stringify(team), before);
		const battle = native(partition);
		assert.equal(battle.p2.active[0].set.fantasyRogueId, 'partition:foe:0');
		assert.equal(battle.p4.active[0].set.fantasyRogueId, 'partition:foe:1');
		for (const [i, pokemon] of [...battle.p2.pokemon, ...battle.p4.pokemon].entries()) {
			assert.equal(pokemon.set.fantasyRogueId, `partition:foe:${partition.opponentSlots[i]}`);
			assert.equal(pokemon.set.name, `Foe${partition.opponentSlots[i]}`);
		}
	});
	function native(partition, stars) {
		const lead = createRoguePokemon(set('Bulbasaur', 'Overgrow', 10, ['Growl']), stats(0), 'human');
		const partner = createRoguePokemon(set('Pikachu', 'Static', 10, ['Growl']), stats(0), 'partner');
		const battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], strictChoices: true,
			fantasyRogue: { encounterId: 'partition', persistCoop: true, team: [lead], partner: { team: [partner], boosts: stats(0) },
				boosts: stats(0), bag: {}, balls: [], catchable: false,
				opponentSlots: partition.opponentSlots, opponentStars: stars,
				cooperative: { opponentOffset: partition.opponentOffset } },
			p1: { name: 'Host', team: [lead.set] }, p2: { name: 'NPC', team: partition.first },
			p3: { name: 'Guest', team: [partner.set] }, p4: { name: 'NPC partner', team: partition.second },
		});
		battles.push(battle);
		for (const side of battle.sides) battle.choose(side.id, `team ${side.pokemon.map((_, i) => i + 1).join('')}`);
		return battle;
	}
	it('maps a selected opening pair back to original capture IDs and stars without changing any set', () => {
		const slots = [0, 2, 3, 5], stars = [1, 2, 3, 4, 1, 5];
		const team = slots.map(index => ({ ...set('Magikarp', 'Swift Swim', 10, ['Splash']), name: `Foe${index}` }));
		const before = structuredClone(team), partition = splitCoopOpponents(team, slots, [2, 3, 0, 1]);
		assert.deepEqual(partition.opponentSlots, [3, 0, 5, 2]);
		assert.deepEqual(team, before);
		const battle = native(partition, stars);
		assert.equal(battle.p2.active[0].set.fantasyRogueId, 'partition:foe:3');
		assert.equal(battle.p4.active[0].set.fantasyRogueId, 'partition:foe:5');
		assert.equal(battle.p2.active[0].set.fantasyRogueScale, 2);
		assert.equal(battle.p4.active[0].set.fantasyRogueScale, 3);
		assert.throws(() => splitCoopOpponents(team, slots, [2, 2, 0, 1]), /完整队伍排列/);
	});
	it('preserves holes from captured opponents and keeps star multipliers attached to the original encounter index', () => {
		const slots = [0, 2, 3, 5], stars = [1, 2, 3, 4, 1, 5];
		const team = slots.map(i => ({ ...set('Magikarp', 'Swift Swim', 10, ['Splash']), name: `Foe${i}` }));
		const partition = splitCoopOpponents(team, slots);
		assert.deepEqual(partition.opponentSlots, [0, 3, 2, 5]);
		const battle = native(partition, stars);
		for (const pokemon of [...battle.p2.pokemon, ...battle.p4.pokemon]) {
			const index = Number(pokemon.set.fantasyRogueId.split(':').pop());
			assert.equal(pokemon.set.name, `Foe${index}`);
			assert.equal(pokemon.set.fantasyRogueScale, [1, 1, 1.2, 1.5, 2, 3][stars[index]]);
		}
	});
	it('restores a legacy contiguous checkpoint without silently reassigning either NPC party', () => {
		const team = Array.from({ length: 6 }, (_, i) => ({ ...set('Magikarp', 'Swift Swim', 10, ['Splash']), name: `Foe${i}` }));
		const legacy = { first: team.slice(0, 3), second: team.slice(3), opponentSlots: [0, 1, 2, 3, 4, 5], opponentOffset: 3 };
		const battle = native(legacy);
		battle.p4.active[0].hp -= 2;
		const checkpoint = captureCoopCheckpoint(battle);
		assert(validCoopCheckpoint(checkpoint, 'partition'));
		const restored = Battle.fromJSON(checkpoint.state); battles.push(restored);
		assert.equal(restored.p4.active[0].set.name, 'Foe3');
		assert.equal(restored.p4.active[0].set.fantasyRogueId, 'partition:foe:3');
		assert.equal(restored.p4.active[0].hp, battle.p4.active[0].hp);
		assert.deepEqual(restored.fantasyRogue.opponentSlots, legacy.opponentSlots);
		assert.deepEqual(restored.p2.pokemon.map(mon => mon.set.name), ['Foe0', 'Foe1', 'Foe2']);
	});
	it('rejects a mismatched or duplicate capture-ID mapping', () => {
		assert.throws(() => splitCoopOpponents(['a', 'b'], [0]), /编号不一致/);
		assert.throws(() => splitCoopOpponents(['a', 'b'], [0, 0]), /编号不一致/);
	});
});
