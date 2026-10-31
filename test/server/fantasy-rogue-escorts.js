'use strict';
const assert = require('assert').strict;
const {Dex} = require('../../dist/sim/dex');
const {eliteEscortPool, prepareEliteEscorts} = require('../../dist/server/fantasy-rogue/elite-escorts');
const {minimumEvolutionLevel} = require('../../dist/server/fantasy-rogue/evolution');
const {set} = require('../fixtures/fantasy-rogue');

describe('Fantasy elite escorts', () => {
	it('has ordinary eligible escorts for every type and never admits special species even at level 100', () => {
		const dex = Dex.mod('gen9');
		for (const type of dex.types.names()) for (const level of [10, 29, 30, 50, 100]) {
			if (type === 'Stellar' || type === '???') continue;
			const pool = eliteEscortPool(type, level);
			assert(pool.length >= 2, `${type} ${level}`);
			for (const s of pool) {
				assert(!s.tags.some(t => /Legendary|Mythical|Ultra Beast|Paradox/.test(t)), `${s.name} ${level}`);
				assert(!s.battleOnly && !s.isMega && !s.isPrimal && !/Gmax|Totem/.test(s.forme), `${s.name} ${level}`);
				assert(minimumEvolutionLevel(s.name) <= level, `${s.name} ${level}`);
			}
		}
		for (const name of ['Blacephalon', 'Iron Valiant', 'Mew', 'Heatran', 'Raichu-Alola', 'Scizor']) {
			const s = dex.species.get(name);
			assert(!eliteEscortPool(s.types[0], 10).some(entry => entry.id === s.id), name);
		}
	});
	it('excludes Gmax, Mega and temporary forms without excluding normal regional forms', () => {
		const dex = Dex.mod('gen9');
		for (const name of ['Eevee-Gmax', 'Charizard-Gmax', 'Charizard-Mega-X', 'Raticate-Alola-Totem',
			'Mimikyu-Totem', 'Darmanitan-Zen', 'Wishiwashi-School', 'Palafin-Hero', 'Kyogre-Primal']) {
			const species = dex.species.get(name);
			assert(species.exists, name);
			assert(!eliteEscortPool(species.types[0], 100).some(s => s.id === species.id), name);
		}
		for (const name of ['Eevee', 'Vulpix-Alola', 'Zorua-Hisui', 'Meowth-Galar', 'Wooper-Paldea']) {
			const species = dex.species.get(name);
			assert(eliteEscortPool(species.types[0], 10).some(s => s.id === species.id), name);
		}
		assert(eliteEscortPool('Water', 100).some(s => s.name === 'Rotom-Wash'));
	});
	it('repairs the saved Gmax escort while retaining its applied level cost and valid teammates', () => {
		const valid = set('Girafarig', 'Inner Focus', 25), boss = set('Zorua-Hisui-Fantasy', 'Illusion', 30);
		const run = { floor: 10, encounter: 0, phase: 'ready', node: { kind: 'boss', blessingPrepared: true, encounters: [
			{ escortCount: 2, blessingLevelOffsets: [15, 15, 20], team: [set('Eevee-Gmax', 'Run Away', 25), valid, boss] },
		] } };
		prepareEliteEscorts(run, () => 0, true);
		const encounter = run.node.encounters[0];
		assert.notEqual(encounter.team[0].species, 'Eevee-Gmax');
		assert.equal(encounter.team[0].level, 25);
		assert.deepEqual(encounter.blessingLevelOffsets, [15, 15, 20]);
		assert.strictEqual(encounter.team[1], valid);
		assert.strictEqual(encounter.team[2], boss);
		prepareEliteEscorts(run, () => { throw Error('must not reroll'); }, true);
	});
	it('repairs unplayed cached forecasts as well as the current floor', () => {
		const node = { kind: 'boss', encounters: [{ escortCount: 2,
			team: [set('Eevee-Gmax', 'Run Away', 10), set('Girafarig', 'Inner Focus', 10), set('Zorua-Hisui-Fantasy', 'Illusion', 10)] }] };
		const run = { floor: 9, encounter: 0, phase: 'story', bossPreviews: { 10: structuredClone(node) } };
		const boss = run.bossPreviews[10].encounters[0].team[2];
		prepareEliteEscorts(run, () => 0, true);
		assert.notEqual(run.bossPreviews[10].encounters[0].team[0].species, 'Eevee-Gmax');
		assert.strictEqual(run.bossPreviews[10].encounters[0].team[2], boss);
		prepareEliteEscorts(run, () => { throw Error('must not reroll'); }, true);
		for (const [phase, floor] of [['battle', 9], ['ready', 10], ['ready', 11]]) {
			const saved = { floor, encounter: 0, phase, bossPreviews: { 10: structuredClone(node) } };
			prepareEliteEscorts(saved, () => { throw Error('must not change a started or finished forecast'); }, true);
			assert.deepEqual(saved.bossPreviews[10], node);
		}
	});
	it('repairs invalid unplayed escorts without rerolling the boss or valid companion', () => {
		const valid = set('Litwick', 'Flash Fire', 10), boss = set('Chandelure-Fantasy', 'Shadow Tag', 15);
		const run = {floor: 10, encounter: 0, phase: 'ready', node: {kind: 'boss', encounters: [
			{escortCount: 2, team: [set('Blacephalon', 'Beast Boost', 10), valid, boss]},
		]}};
		prepareEliteEscorts(run, () => 0, true);
		const encounter = run.node.encounters[0];
		assert.equal(encounter.team.length, 3); assert.equal(encounter.escortCount, 2);
		assert.strictEqual(encounter.team[1], valid); assert.strictEqual(encounter.team[2], boss);
		assert(!encounter.team.some(s => s.species === 'Blacephalon'));
		const once = structuredClone(run);
		prepareEliteEscorts(run, () => {throw Error('must not reroll');}, true);
		assert.deepEqual(run, once);
	});
	it('leaves active battles and already-fought encounters untouched', () => {
		const bad = {escortCount: 2, team: [set('Blacephalon'), set('Iron Moth'), set('Chandelure-Fantasy')]};
		for (const [phase, encounter] of [['battle', 0], ['ready', 1]]) {
			const run = {floor: 10, encounter, phase, node: {kind: 'boss', encounters: [structuredClone(bad)]}};
			prepareEliteEscorts(run, () => {throw Error('must not reroll');}, true);
			assert.deepEqual(run.node.encounters[0], bad);
		}
	});
	it('preserves a legacy replacement team with a stale escort counter', () => {
		const run = {floor: 10, encounter: 0, phase: 'ready', node: {kind: 'boss', encounters: [
			{escortCount: 2, team: [set('Butterfree', 'Compound Eyes', 10)]},
		]}};
		const before = structuredClone(run);
		prepareEliteEscorts(run, () => {throw Error('must not invent a boss');}, true);
		assert.deepEqual(run, before);
	});
});
