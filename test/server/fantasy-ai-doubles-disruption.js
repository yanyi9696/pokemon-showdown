'use strict';

const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');
const mon = (species, moves, ability = '', extra = {}) => ({ species, moves, ability, level: 50, ...extra });

describe('Fantasy doubles support prerequisites', () => {
	let battle;
	afterEach(() => battle?.destroy());
	function create(own, foes = [mon('Blissey', ['Splash']), mon('Chansey', ['Splash'])]) {
		battle = new Battle({
			format: new Format({ name: 'Support prerequisites', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
			strictChoices: true, seed: [1, 2, 3, 4], p1: { team: foes }, p2: { team: own },
		});
		for (const side of battle.sides) for (const active of side.activeRequest.active) delete active.canTerastallize;
	}
	function rank(extraLog = []) {
		return rankDoublesChoices({ ownSide: 'p2', difficulty: 'normal', request: structuredClone(battle.p2.activeRequest),
			publicLog: [...extractChannelMessages(battle.log.join('\n'), [0])[0], ...extraLog] },
		'gen9fantasy', [], false);
	}
	const score = (choice, extraLog = []) => rank(extraLog).find(entry => entry.choice === choice);
	const splash = () => mon('Magikarp', ['Splash']);
	for (const [species, ability, item] of [
		['Amoonguss', 'Regenerator', ''], ['Blastoise', 'Overcoat', ''], ['Blastoise', 'Torrent', 'Safety Goggles'],
	]) it(`avoids powder into the disclosed immunity of ${species}/${ability}/${item}`, () => {
		create([mon('Amoonguss', ['Spore', 'Pollen Puff'], 'Regenerator'), splash()],
			[mon(species, ['Splash'], ability, { item }), splash()]);
		const known = [`|-ability|p1a: ${species}|${ability}`, ...(item ? [`|-item|p1a: ${species}|${item}`] : [])];
		assert(score('move 1 1, move 1', known).reasons.includes('powder-move-blocked'));
		assert(!rank(known)[0].choice.startsWith('move 1 1,'));
		battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
		assert.equal(battle.p1.active[0].status, '');
	});
	it('retains powder after a disclosed Overcoat bypass or suppressed Safety Goggles', () => {
		create([mon('Amoonguss', ['Spore'], 'Mold Breaker'), splash()],
			[mon('Blastoise', ['Splash'], 'Overcoat'), splash()]);
		assert(!score('move 1 1, move 1', ['|-ability|p1a: Blastoise|Overcoat']).reasons.includes('powder-move-blocked'));
		battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
		assert.equal(battle.p1.active[0].status, 'slp');
		battle.destroy();
		create([mon('Amoonguss', ['Spore'], 'Regenerator'), splash()],
			[mon('Blastoise', ['Splash'], 'Torrent', { item: 'Safety Goggles' }), splash()]);
		battle.field.addPseudoWeather('magicroom', battle.p2.active[0]);
		const unshielded = score('move 1 1, move 1', ['|-item|p1a: Blastoise|Safety Goggles']);
		assert(!unshielded.reasons.includes('powder-move-blocked'));
		assert(!unshielded.reasons.includes('status-immunity'));
		battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
		assert.equal(battle.p1.active[0].status, 'slp');
	});

	it('does not prefer an Aurora Veil that the native engine rejects outside snow', () => {
		create([mon('Ninetales-Alola', ['Aurora Veil', 'Ice Beam'], 'Snow Cloak'), splash()]);
		const ranked = rank();
		battle.makeChoices('move 1, move 1', 'move 1, move 1');
		assert.equal(battle.p2.sideConditions.auroraveil, undefined);
		assert(battle.log.some(line => line.startsWith('|-fail|p2a:')));
		assert(ranked[0].choice.startsWith('move 2 '), ranked[0].choice);
	});
	it('retains Aurora Veil in actual snow and does not ban a same-turn ally snow setup', () => {
		create([mon('Ninetales-Alola', ['Aurora Veil', 'Ice Beam'], 'Snow Warning'), splash()]);
		assert(score('move 1, move 1').reasons.includes('team-support'));
		battle.makeChoices('move 1, move 1', 'move 1, move 1');
		assert(battle.p2.sideConditions.auroraveil);
		battle.destroy();
		create([mon('Ninetales-Alola', ['Aurora Veil'], 'Snow Cloak', { ivs: { spe: 0 }, nature: 'Quiet' }),
			mon('Crobat', ['Snowscape'], 'Inner Focus', { evs: { spe: 252 }, nature: 'Timid' })]);
		assert(score('move 1, move 1').reasons.includes('team-support'));
		battle.makeChoices('move 1, move 1', 'move 1, move 1');
		assert(battle.p2.sideConditions.auroraveil);
	});
	it('does not reward Prankster Taunt into a Dark target, while ordinary Taunt remains usable', () => {
		create([mon('Whimsicott', ['Taunt', 'Moonblast'], 'Prankster'), splash()],
			[mon('Umbreon', ['Splash']), splash()]);
		assert(score('move 1 1, move 1').reasons.includes('status-move-blocked'));
		battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
		assert.equal(battle.p1.active[0].volatiles.taunt, undefined);
		battle.destroy();
		create([mon('Whimsicott', ['Taunt'], 'Infiltrator'), splash()], [mon('Umbreon', ['Splash']), splash()]);
		assert(!score('move 1 1, move 1').reasons.includes('status-move-blocked'));
		battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
		assert(battle.p1.active[0].volatiles.taunt);
	});
	it('accounts for Prankster priority in Psychic Terrain without blocking airborne targets', () => {
		create([mon('Whimsicott', ['Taunt'], 'Prankster'), splash()],
			[mon('Indeedee-F', ['Splash'], 'Psychic Surge'), mon('Charizard', ['Splash'])]);
		assert(score('move 1 1, move 1').reasons.includes('status-move-blocked'));
		assert(!score('move 1 2, move 1').reasons.includes('status-move-blocked'));
		battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
		assert.equal(battle.p1.active[0].volatiles.taunt, undefined);
	});
	it('avoids betting on an unseen last move for Encore, and values a revealed repeatable status move', () => {
		create([mon('Whimsicott', ['Encore', 'Moonblast'], 'Prankster'), splash()]);
		const opening = score('move 1 1, move 1');
		assert(opening.reasons.includes('unproven-lock-target'));
		assert(!opening.reasons.includes('disruption'));
		battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
		assert.equal(battle.p1.active[0].volatiles.encore, undefined);
		const revealed = score('move 1 1, move 1');
		assert(revealed.reasons.includes('disruption'));
		battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
		assert(battle.p1.active[0].volatiles.encore);
	});
	it('rejects a known unrepeatable Encore target and duplicate disruption already in effect', () => {
		create([mon('Whimsicott', ['Encore', 'Taunt'], 'Prankster'), splash()]);
		const unusable = score('move 1 1, move 1', ['|move|p1a: Blissey|Encore|p2a: Whimsicott', '|turn|2']);
		assert(!unusable.reasons.includes('disruption'));
		assert(unusable.reasons.includes('unproven-lock-target'));
		const duplicate = score('move 2 1, move 1', ['|-start|p1a: Blissey|Taunt']);
		assert(duplicate.reasons.includes('status-already-active'));
		assert(duplicate.score < score('move 2 1, move 1').score);
	});
	it('rewards Helping Hand only when the partner has a damaging action', () => {
		create([mon('Clefairy', ['Helping Hand', 'Splash']), mon('Garchomp', ['Protect', 'Dragon Claw'])]);
		const idle = score('move 1 -2, move 1'), attack = score('move 1 -2, move 2 1');
		assert(idle.reasons.includes('helping-hand-no-attack'));
		assert(idle.score < score('move 2, move 1').score);
		assert(attack.reasons.includes('helping-hand-synergy'));
	});
	it('uses disclosed blocking abilities, preserving Mold Breaker and Mycelium Might bypasses', () => {
		for (const [defender, ability, attacker, bypass] of [
			['Gholdengo', 'Good as Gold', 'Pangoro', 'Mold Breaker'],
			['Espeon', 'Magic Bounce', 'Toedscruel', 'Mycelium Might'],
		]) {
			create([mon('Whimsicott', ['Taunt'], 'Prankster'), splash()], [mon(defender, ['Splash'], ability), splash()]);
			const known = [`|-ability|p1a: ${defender}|${ability}`];
			assert(score('move 1 1, move 1', known).reasons.includes('status-move-blocked'));
			battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
			assert.equal(battle.p1.active[0].volatiles.taunt, undefined);
			battle.destroy();
			create([mon(attacker, ['Taunt'], bypass), splash()], [mon(defender, ['Splash'], ability), splash()]);
			assert(!score('move 1 1, move 1', known).reasons.includes('status-move-blocked'));
			battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
			assert(battle.p1.active[0].volatiles.taunt);
			battle.destroy();
			battle = null;
		}
	});
	it('does not count Helping Hand damage amplification when the ally has Good as Gold', () => {
		create([mon('Clefairy', ['Helping Hand']), mon('Gholdengo', ['Make It Rain'], 'Good as Gold')]);
		const candidate = score('move 1 -2, move 1');
		assert(candidate.reasons.includes('status-move-blocked'));
		assert(!candidate.reasons.includes('helping-hand-synergy'));
		battle.makeChoices('move 1, move 1', 'move 1 -2, move 1');
		assert(battle.log.some(line => line.startsWith('|-immune|p2b:') && line.includes('Good as Gold')));
	});
	it('does not invent Prankster immunity after publicly visible ability suppression', () => {
		create([mon('Whimsicott', ['Taunt'], 'Prankster'), splash()],
			[mon('Umbreon', ['Splash']), mon('Weezing', ['Splash'], 'Neutralizing Gas')]);
		assert(!score('move 1 1, move 1').reasons.includes('status-move-blocked'));
		battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
		assert(battle.p1.active[0].volatiles.taunt);
		battle.destroy();
		create([mon('Whimsicott', ['Taunt'], 'Prankster'), splash()], [mon('Umbreon', ['Splash']), splash()]);
		battle.p2.active[0].addVolatile('gastroacid', battle.p1.active[0]);
		assert(!score('move 1 1, move 1').reasons.includes('status-move-blocked'));
		battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
		assert(battle.p1.active[0].volatiles.taunt);
	});
	it('preserves a disclosed Ability Shield against Mold Breaker and observes Magic Room', () => {
		create([mon('Pangoro', ['Taunt'], 'Mold Breaker'), splash()],
			[mon('Gholdengo', ['Splash'], 'Good as Gold', { item: 'Ability Shield' }), splash()]);
		const known = ['|-ability|p1a: Gholdengo|Good as Gold', '|-item|p1a: Gholdengo|Ability Shield'];
		assert(score('move 1 1, move 1', known).reasons.includes('status-move-blocked'));
		battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
		assert.equal(battle.p1.active[0].volatiles.taunt, undefined);
		battle.field.addPseudoWeather('magicroom', battle.p2.active[0]);
		assert(!score('move 1 1, move 1', ['|-ability|p1a: Gholdengo|Good as Gold'])
			.reasons.includes('status-move-blocked'));
		battle.makeChoices('move 1, move 1', 'move 1 1, move 1');
		assert(battle.p1.active[0].volatiles.taunt);
	});
	it('does not count a disabled Choice Scarf when deciding whether Tailwind changes move order', () => {
		create([mon('Tornadus', ['Tailwind', 'Splash'], 'Prankster', { evs: { spe: 252 }, nature: 'Timid' }),
			mon('Metagross', ['Iron Head'], 'Clear Body', { item: 'Choice Scarf', evs: { spe: 32 }, nature: 'Serious' })],
		[mon('Charizard', ['Splash']), mon('Charizard', ['Splash'])]);
		assert(!score('move 1, move 1 1').reasons.includes('speed-control-tailwind'));
		battle.field.addPseudoWeather('magicroom', battle.p2.active[0]);
		assert(battle.p2.active[1].getStat('spe') < battle.p1.active[0].getStat('spe'));
		assert(score('move 1, move 1 1').reasons.includes('speed-control-tailwind'));
	});
	it('recognizes native Snowscape for Slush Rush and avoids unnecessary Tailwind value', () => {
		create([mon('Tornadus', ['Tailwind', 'Splash'], 'Prankster', { evs: { spe: 252 }, nature: 'Timid' }),
			mon('Beartic', ['Slash'], 'Slush Rush', { evs: { spe: 252 }, nature: 'Jolly' })],
		[mon('Charizard', ['Splash']), mon('Charizard', ['Splash'])]);
		const before = score('move 1, move 1 1').score - score('move 2, move 1 1').score;
		assert(before > 0);
		battle.field.setWeather('snowscape', battle.p2.active[1]);
		assert(battle.p2.active[1].getStat('spe') > battle.p1.active[0].getStat('spe'));
		const after = score('move 1, move 1 1').score - score('move 2, move 1 1').score;
		assert.equal(after, 0);
	});
});
