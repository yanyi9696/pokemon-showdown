'use strict';
const assert = require('assert').strict;
const {Battle} = require('../../dist/sim');
const {randomEncounterIVs} = require('../../dist/server/fantasy-rogue/encounter-sets');
const {lowerToEligibleStage, minimumEvolutionLevel, partyEvolutionLevel} = require('../../dist/server/fantasy-rogue/evolution');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {syncBlessingParty, drawBlessingGift} = require('../../dist/server/fantasy-rogue/blessings');
const {blessing} = require('../../dist/sim/rogue-blessing-data');
const {assignedExtraAbilities} = require('../../dist/sim/rogue-blessing-permanent');
const {rewardChoices, chooseReward} = require('../../dist/server/fantasy-rogue/reward-scenes');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {FantasyEliteBosses} = require('../../dist/server/fantasy-rogue/elite-bosses');
const {set, stats} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue acquisition and healing revision', () => {
	it('makes 25 through 31 progressively rarer, with no forced perfect elite stats', () => {
		for (const elite of [false, true]) {
			const counts = {};
			for (let n = 0; n < (elite ? 300 : 1000); n++) {
				const iv = randomEncounterIVs(() => n, elite).hp;
				counts[iv] = (counts[iv] || 0) + 1;
			}
			for (let iv = 25; iv < 31; iv++) assert(counts[iv] > counts[iv + 1]);
			assert.equal(counts[31], 5);
			let rolls = 0; randomEncounterIVs(() => { rolls++; return 0; }, elite); assert.equal(rolls, 6);
		}
	});
	it('requires level 30 for acquired item/trade evolutions, leaving party evolution gates alone', () => {
		for (const [evolved, base] of [['Trevenant', 'Phantump'], ['Lilligant-Hisui', 'Petilil'], ['Kleavor', 'Scyther'],
			['Scizor', 'Scyther'], ['Vaporeon', 'Eevee'], ['Gengar', 'Gastly']]) {
			assert(minimumEvolutionLevel(evolved) >= 30, evolved);
			assert.equal(lowerToEligibleStage(evolved, 3), base);
			assert.notEqual(lowerToEligibleStage(evolved, 29), evolved);
			assert.equal(lowerToEligibleStage(evolved, 30), evolved);
		}
		assert.equal(partyEvolutionLevel('Scizor'), 20);
		assert.equal(lowerToEligibleStage('Onix-Fantasy', 3), 'Onix-Fantasy');
	});
	it('applies the same minimum to mystery-ball and blessing gifts', () => {
		const content = createPreviewContent();
		for (const level of [3, 5, 29, 30]) for (const species of ['Lilligant-Hisui', 'Trevenant']) {
			const run = {floor: 1, team: [], boosts: stats(0), bag: {}, money: 0};
			syncBlessingParty(run);
			const mon = drawBlessingGift(run, content, () => 0, {species, level, eligibleStage: true});
			assert.equal(mon.set.species, lowerToEligibleStage(species, level));
			assert.equal(mon.set.level, level);
		}
	});
	it('gives arsenal the custom repeated type-change ability both in the party and in battle', () => {
		const mon = createRoguePokemon(set('Mew', 'Synchronize', 50, ['Water Gun', 'Ember']), stats(0));
		const run = {team: [mon], boosts: stats(0), floor: 1, bag: {}, money: 0};
		syncBlessingParty(run); run.blessings.owned = [{...blessing('arsenal'), floor: 1}]; syncBlessingParty(run);
		const abilities = assignedExtraAbilities(mon, run.team, run.blessings);
		assert(abilities.includes('bianhuanziyou')); assert(!abilities.includes('protean'));
		const battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: {encounterId: 'customability', team: [mon], boosts: stats(0), bag: {}, balls: [], catchable: false, blessings: run.blessings},
			p1: {team: [mon.set]}, p2: {team: [set('Blissey', 'Natural Cure', 100, ['Splash'])]}});
		try {
			battle.makeChoices('team 1', 'team 1'); battle.makeChoices('move 1', 'move 1');
			assert.deepEqual(battle.p1.active[0].getTypes(), ['Water']);
			battle.makeChoices('move 2', 'move 1'); assert.deepEqual(battle.p1.active[0].getTypes(), ['Fire']);
		} finally { battle.destroy(); }
	});
	it('always attaches recovery supplies, and adds rather than overwrites a selected recovery bundle', () => {
		const content = createPreviewContent();
		for (const floor of [1, 19, 20, 28, 29, 68, 69, 80, 81, 140, 141, 150]) for (const enhanced of [false, true]) {
			const run = {floor, phase: 'reward', team: [], node: {kind: 'reward', rewardScene: {id: 'chest', key: 'supplies',
				...(enhanced ? {demonstrated: 'partner'} : {})}}};
			const options = rewardChoices(run); assert.equal(options[0].id, 'recovery');
			assert.equal(options[0].items.ether, enhanced ? 2 : 1, 'selected bundle, before the base supplies');
			chooseReward(run, content, () => 0, 'recovery');
			assert.equal(run.node.reward.items.revive || 0, floor >= 20 || enhanced ? 2 : 0);
			assert.equal(run.node.reward.items[floor < 29 ? 'potion' : floor < 69 ? 'superpotion' : 'hyperpotion'], (enhanced ? 6 : 4) - (floor < 20 ? 2 : 0));
			assert.equal(run.node.reward.items.ether, (enhanced ? 2 : 1) + (floor > 80 ? 1 : 0), `ether at floor ${floor}`);
			assert.equal(run.node.reward.items.elixir || 0, floor > 140 ? 2 : 0, `elixir at floor ${floor}`);
			assert.throws(() => chooseReward(run, content, () => 0, 'recovery'));
		}
	});
	it('keeps late base PP supplies when selecting money instead of the extra recovery bundle', () => {
		const content = createPreviewContent();
		for (const [floor, ether, elixir] of [[80, 0, 0], [81, 1, 0], [140, 1, 0], [141, 1, 1]]) {
			const run = { floor, phase: 'reward', team: [], node: { kind: 'reward', rewardScene: { id: 'chest', key: 'base-supplies' } } };
			chooseReward(run, content, () => 0, 'money');
			assert.equal(run.node.reward.items.ether || 0, ether);
			assert.equal(run.node.reward.items.elixir || 0, elixir);
		}
	});
	it('uses the supplied first Onix boss loadout', () => {
		const onix = FantasyEliteBosses[10].candidates.find(s => s.species === 'onixfantasy');
		assert.equal(onix.ability, 'Rock Head'); assert(!onix.item);
		assert.deepEqual(onix.moves, ['Avalanche', 'Stealth Rock', 'Rock Slide']);
	});
});
