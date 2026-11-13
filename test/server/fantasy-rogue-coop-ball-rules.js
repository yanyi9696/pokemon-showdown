'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { rogueCaptureChance, throwRogueBall } = require('../../dist/sim/fantasy-rogue');
const { rogueBallMultiplier, rogueBallCatchRate } = require('../../dist/sim/rogue-balls');
const { captureThresholds, rogueSpeciesData } = require('../../dist/sim/fantasy-rogue-rules');
const { captureCoopCheckpoint } = require('../../dist/sim/rogue-coop-checkpoint');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op capture uses the selected target and actual catcher', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function start(species = 'Ninetales') {
		const host = createRoguePokemon({ ...set('Pikachu', 'Static', 5, ['Splash']), gender: 'M' }, stats(0));
		const guest = createRoguePokemon({ ...set('Ninetales', 'Flash Fire', 100, ['Splash']), gender: 'M' }, stats(0));
		const state = { encounterId: 'ball-owner-target', persistCoop: true,
			team: [host], boosts: stats(0), partner: { team: [guest], boosts: stats(0) },
			bag: { testball: 1 }, partnerBag: { testball: 1 }, balls: [], catchable: true, wild: true,
			cooperative: { opponentOffset: 1 }, opponentCount: 2, opponentSlots: [0, 1],
			coopCaptureCapacity: { p1: true, p3: true }, coopCaptureSlots: { p1: 5, p3: 5 },
			caughtSpecies: 10, partnerCaughtSpecies: 80, caughtSpeciesIds: ['magikarp'], partnerCaughtSpeciesIds: ['ninetales'] };
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: 'Host', team: [host.set] }, p3: { name: 'Guest', team: [guest.set] },
			p2: { name: 'Wild A', team: [{ ...set('Magikarp', 'Swift Swim', 5, ['Splash']), fantasyRogueId: 'wild-a' }] },
			p4: { name: 'Wild B', team: [{ ...set(species, 'Run Away', 20, ['Splash']), gender: 'F', fantasyRogueId: 'wild-b' }] },
		});
		for (const side of battle.sides) battle.choose(side.id, 'team 1');
	}
	const cases = [
		['level', { condition: 'level' }, 'Ninetales', 8],
		['love', { condition: 'love' }, 'Ninetales', 8],
		['repeat', { condition: 'repeat' }, 'Ninetales', 3.5],
		['type', { types: ['Fire'], bonus: 3 }, 'Ninetales', 3],
		['fast', { condition: 'fast' }, 'Ninetales', 4],
		['nest', { condition: 'nest' }, 'Ninetales', 2.1],
		['sleep', { condition: 'sleep' }, 'Ninetales', 4],
		['ultra', { condition: 'ultra' }, 'Nihilego', 5],
		['moon', { condition: 'moon' }, 'Nidoqueen', 4],
		['heavy', { condition: 'heavy' }, 'Snorlax', 1],
	];
	for (const [name, rule, species, multiplier] of cases) it(`${name} ball agrees between p3 preview and actual p4 throw`, () => {
		start(species);
		const target = battle.p4.active[0], catcher = battle.p3.active[0];
		if (name === 'sleep') { target.status = 'slp'; target.statusState.time = 2; }
		const ball = { id: 'testball', name: '测试球', multiplier: 1, rule };
		const state = battle.fantasyRogue; state.balls = [ball];
		const baseRate = rogueSpeciesData(species).catchRate;
		const rate = name === 'heavy' ? Math.min(255, baseRate + 30) : baseRate;
		assert.equal(rogueBallMultiplier(battle, ball, target, catcher), multiplier);
		assert.equal(rogueBallCatchRate(battle, ball, baseRate, target), rate);
		const threshold = captureThresholds(rate, target.maxhp, target.hp, target.status, multiplier, 80);
		const shake = threshold.shake / 65536, critical = threshold.critical / 256;
		const expected = threshold.guaranteed ? 1 : critical * shake + (1 - critical) * shake ** 4;
		assert.equal(rogueCaptureChance(battle, ball, battle.p3, target), expected);
		state.coopCapture = { ownerSide: 'p3', ball: ball.id, targetSide: 'p4', targetSlot: 0, targetId: target.set.fantasyRogueId };
		const serialized = captureCoopCheckpoint(battle); battle.destroy(); battle = Battle.fromJSON(serialized.state);
		const draws = [];
		battle.randomChance = (numerator, denominator) => {
			draws.push([numerator, denominator]); return denominator !== 256;
		};
		throwRogueBall(battle, ball.id);
		assert.deepEqual(draws, [[threshold.critical, 256],
			...threshold.guaranteed ? [] : Array.from({ length: 4 }, () => [threshold.shake, 65536])]);
		assert.equal(battle.fantasyRogue.partnerBag.testball, 0);
		assert.equal(battle.fantasyRogue.bag.testball, 1);
		assert.equal(battle.fantasyRogue.captures[0].set.species, species);
		assert.equal(battle.fantasyRogue.captureOwners[battle.fantasyRogue.captures[0].id], 'p3');
		assert(battle.p2.active[0].hp > 0);
	});
	for (const owner of ['p1', 'p3']) for (const target of ['p2', 'p4']) {
		it(`keeps ${owner}'s collection and level separate when selecting ${target}`, () => {
			start(); const mon = battle[target].active[0], catcher = battle[owner].active[0];
			const repeat = { id: 'repeatball', multiplier: 1, rule: { condition: 'repeat' } };
			const level = { id: 'levelball', multiplier: 1, rule: { condition: 'level' } };
			assert.equal(rogueBallMultiplier(battle, repeat, mon, catcher), (owner === 'p1') === (target === 'p2') ? 3.5 : 1);
			assert.equal(rogueBallMultiplier(battle, level, mon, catcher), owner === 'p1' ? 1 : 8);
		});
	}
	for (const owner of ['p1', 'p3']) it(`uses only ${owner}'s personal catch echo in preview and actual throw`, () => {
		start();
		const ball = { id: 'testball', name: '测试球', chance: 0.2 }, state = battle.fantasyRogue;
		state.balls = [ball];
		state.echo = { types: [], guard: false, shiny: 0, catch: 1, systems: [] };
		state.partner.echo = { types: [], guard: false, shiny: 0, catch: 5, systems: [] };
		const target = battle.p4.active[0], expected = owner === 'p1' ? 220000 : 300000;
		assert.equal(Math.round(rogueCaptureChance(battle, ball, battle[owner], target) * 1000000), expected);
		state.coopCapture = { ownerSide: owner, ball: ball.id, targetSide: 'p4', targetSlot: 0, targetId: target.set.fantasyRogueId };
		const draws = [];
		battle.randomChance = (numerator, denominator) => { draws.push([numerator, denominator]); return false; };
		throwRogueBall(battle, ball.id);
		assert.deepEqual(draws, [[expected, 1000000]]);
		assert.equal(state[owner === 'p1' ? 'bag' : 'partnerBag'].testball, 0);
		assert.equal(state[owner === 'p1' ? 'partnerBag' : 'bag'].testball, 1);
	});
});
