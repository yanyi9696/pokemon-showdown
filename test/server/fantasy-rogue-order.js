'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { throwRogueBall, rogueCaptureChance } = require('../../dist/sim/fantasy-rogue');
const { stats, set } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue order spirit', () => {
	let battle;
	function begin(ours = {}, theirs = {}, order = true) {
		const member = createRoguePokemon({ ...set('Mew', 'Synchronize', 50, ['Splash']), ...ours }, stats(0));
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: {
			encounterId: 'order:1', team: [member], boosts: stats(0), bag: { pokeball: 4 }, catchable: true,
			balls: [{ id: 'pokeball', name: '精灵球', multiplier: 1 }], spirit: { id: order ? 'zygardeorder' : 'zygarde', floor: 1 },
		}, p1: { name: 'Player', team: [member.set] }, p2: { name: 'Foe', team: [{ ...member.set, ...theirs }] } });
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
	}
	const turn = (a = 'move 1', b = 'move 1') => { battle.choose('p1', a); battle.choose('p2', b); };
	afterEach(() => { battle?.destroy(); battle = undefined; });
	it('rounds probabilities at 50%, fixes damage and integer durations, and leaves ordinary battles random', () => {
		begin();
		assert.equal(battle.randomChance(49.9, 100), false);
		assert.equal(battle.randomChance(50, 100), true);
		assert.equal(battle.randomChance(0, 100), false);
		assert.equal(battle.randomizer(200), 185);
		assert.equal(battle.random(2, 5), 3);
		assert.equal(battle.random(2, 6), 3);
		battle.fantasyRogue.spirit.id = 'zygarde';
		assert(new Set(Array.from({ length: 40 }, () => battle.randomizer(200))).size > 1);
	});
	it('plays tied moves in alternating side order each turn', () => {
		begin();
		for (let i = 0; i < 4; i++) {
			const start = battle.log.length; turn();
			const moves = battle.log.slice(start).filter(line => line.startsWith('|move|'));
			assert.equal(moves.length, 2);
			assert(moves[0].startsWith(`|move|p${i % 2 + 1}a:`));
		}
	});
	it('preserves guaranteed secondaries without a chance field in older ordinary battles', () => {
		begin({}, {}, false); battle.gen = 8;
		const move = battle.dex.getActiveMove('ember'); move.secondaries = [{ boosts: { def: -1 } }];
		battle.actions.secondaries([battle.p2.active[0]], battle.p1.active[0], move, move);
		assert.equal(battle.p2.active[0].boosts.def, -1);
	});
	it('ignores Serene Grace, misses sub-50 accuracy, and triggers 50% secondaries', () => {
		begin({ ability: 'Serene Grace', moves: ['Thunder', 'Zap Cannon', 'Charge Beam'] }, { species: 'Blissey', ability: 'Natural Cure' });
		turn(); assert.equal(battle.p2.active[0].status, ''); // Thunder 30%, not doubled to 60%.
		turn('move 2'); assert.equal(battle.p2.active[0].status, 'par');
		const move = battle.dex.getActiveMove('ember'); move.secondaries = [{ chance: 50, boosts: { def: -1 } }];
		battle.actions.secondaries([battle.p2.active[0]], battle.p1.active[0], move, move);
		assert.equal(battle.p2.active[0].boosts.def, -1);
		const hp = battle.p2.active[0].hp;
		battle.actions.useMove({ ...battle.dex.getActiveMove('tackle'), accuracy: 49.9 }, battle.p1.active[0], battle.p2.active[0]);
		assert.equal(battle.p2.active[0].hp, hp);
	});
	it('takes the midpoint of sleep and hit counts, including Loaded Dice and Skill Link', () => {
		begin({ moves: ['Bullet Seed'] }, { species: 'Blissey', ability: 'Natural Cure', moves: ['Rest'] });
		turn(); assert(battle.log.some(line => line.includes('|-hitcount|p2a:') && line.endsWith('|3')));
		assert.equal(battle.p2.active[0].status, 'slp');
		// Rest is fixed duration and remains fixed; random sleep is 2 turns (internal counter 3).
		battle.p2.active[0].cureStatus();
		battle.p2.active[0].setStatus('slp', battle.p1.active[0]);
		assert.equal(battle.p2.active[0].statusState.time, 3);
		battle.p1.active[0].setItem('loadeddice');
		turn(); assert(battle.log.some(line => line.includes('|-hitcount|p2a:') && line.endsWith('|4')));
		battle.p1.active[0].setAbility('skilllink');
		battle.p2.active[0].hp = battle.p2.active[0].maxhp;
		turn(); assert(battle.log.some(line => line.includes('|-hitcount|p2a:') && line.endsWith('|5')));
	});
	it('uses final critical stages and the matching power reduction, preserving guaranteed crits and immunity', () => {
		begin(); const source = battle.p1.active[0], target = battle.p2.active[0];
		const damage = (ratio, power = 100, willCrit) => {
			const move = { ...battle.dex.getActiveMove('tackle'), basePower: power, critRatio: ratio, willCrit };
			const amount = battle.actions.getDamage(source, target, move);
			return [amount, target.getMoveHitData(move).crit];
		};
		assert.equal(damage(1)[1], false);
		assert.deepEqual(damage(2), damage(1, 70, true));
		assert.deepEqual(damage(3), damage(1, 85, true));
		assert.deepEqual(damage(4), damage(1, 100, true));
		source.setItem('scopelens'); assert.deepEqual(damage(1), damage(1, 70, true));
		source.setAbility('superluck'); assert.deepEqual(damage(1), damage(1, 85, true));
		source.addVolatile('focusenergy'); assert.deepEqual(damage(1), damage(1, 100, true));
		target.setAbility('battlearmor'); assert.equal(damage(4)[1], false);
	});
	it('keeps both failed and successful ball rolls stochastic and does not change the preview', () => {
		begin(); const ball = battle.fantasyRogue.balls[0];
		const chance = rogueCaptureChance(battle, ball);
		battle.fantasyRogue.spirit.id = 'zygarde'; assert.equal(rogueCaptureChance(battle, ball), chance);
		battle.fantasyRogue.spirit.id = 'zygardeorder';
		let calls = 0;
		battle.prng.randomChance = () => { calls++; return false; };
		throwRogueBall(battle, 'pokeball'); assert(calls > 0); assert(!battle.ended);
		battle.prng.randomChance = () => true;
		throwRogueBall(battle, 'pokeball'); assert(battle.ended); assert.equal(battle.fantasyRogue.bag.pokeball, 2);
	});
});
