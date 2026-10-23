'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { hasRogueStatus, savedRogueStatuses } = require('../../dist/sim/fantasy-rogue-status');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue status stacking through actual moves', () => {
	let battle;
	afterEach(() => { battle?.destroy(); });
	function begin({ species = 'Blissey', ability = 'Healer', item = '', terrain, blessed = true,
		moves = ['Stun Spore', 'Sleep Powder', 'Glare', 'Splash'], bench = false } = {}) {
		const team = [createRoguePokemon(set('Mew', 'No Guard', 50, moves), stats(0))];
		const foes = [{ ...set(species, ability, 50, ['Splash']), item }];
		if (bench) foes.push(set('Magikarp', 'Swift Swim', 50, ['Splash']));
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'stackstatus:test', team, boosts: stats(0), bag: {}, balls: [],
				catchable: false, blessings: { owned: blessed ? [{ ...blessing('stackstatus'), floor: 50 }] : [] },
				environment: terrain ? { terrain, name: terrain } : undefined },
			p1: { name: 'Player', team: team.map(mon => mon.set) },
			p2: { name: 'Foe', team: foes },
		});
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		return battle.p2.active[0];
	}
	function turn(move, foe = 'move 1') {
		assert(battle.choose('p1', `move ${move}`));
		assert(battle.choose('p2', foe));
	}
	it('keeps paralysis and its speed penalty when Sleep Powder puts a paralyzed target to sleep', () => {
		const target = begin();
		turn(1);
		assert(hasRogueStatus(target, 'par'));
		const speed = target.getStat('spe');
		turn(2);
		assert(hasRogueStatus(target, 'par'), battle.log.join('\n'));
		assert(hasRogueStatus(target, 'slp'), battle.log.join('\n'));
		assert.equal(target.getStat('spe'), speed);
		assert(battle.log.some(line => line.startsWith('|cant|p2a:') && line.includes('|slp')));
	});
	for (const paralyzed of [false, true]) it(`blocks new sleep on grounded targets in Electric Terrain (${paralyzed ? 'stacked' : 'first'} status)`, () => {
		const target = begin({ terrain: 'electricterrain' });
		assert.equal(battle.field.terrain, 'electricterrain');
		if (paralyzed) turn(1);
		turn(2);
		assert(!hasRogueStatus(target, 'slp'), battle.log.join('\n'));
		assert.equal(hasRogueStatus(target, 'par'), paralyzed);
		assert(battle.log.some(line => line.includes('|move: Electric Terrain')));
	});
	it('keeps Grass immunity to powder moves', () => {
		const target = begin({ species: 'Weepinbell', ability: 'Chlorophyll' });
		turn(2);
		assert(!hasRogueStatus(target, 'slp'), battle.log.join('\n'));
		assert(battle.log.some(line => line.startsWith('|-immune|p2a:')));
	});
	it('reports the remaining paralysis to the client after stacked sleep ends', () => {
		const target = begin();
		turn(1); turn(2);
		target.m.rogueStatusStack.slp.time = 1;
		const start = battle.log.length;
		turn(4);
		assert(!hasRogueStatus(target, 'slp'));
		assert(hasRogueStatus(target, 'par'));
		assert.equal(target.status, 'par');
		const updates = battle.log.slice(start);
		const cured = updates.findIndex(line => line.startsWith('|-curestatus|p2a:') && line.includes('|slp'));
		assert(cured >= 0, updates.join('\n'));
		assert(updates.slice(cured + 1).some(line => line.startsWith('|-status|p2a:') &&
			line.endsWith('|par|[silent]')), updates.join('\n'));
	});
	it('keeps an existing primary status when a different stacked status clears', () => {
		const target = begin({ moves: ['Will-O-Wisp', 'Sleep Powder', 'Glare', 'Splash'] });
		turn(1); turn(2);
		target.m.rogueStatusStack.slp.time = 4;
		turn(3);
		assert.equal(target.status, 'par');
		target.m.rogueStatusStack.slp.time = 1;
		const start = battle.log.length;
		turn(4);
		assert.equal(target.status, 'par');
		assert.deepEqual(Object.keys(savedRogueStatuses(target)).sort(), ['brn', 'par']);
		const updates = battle.log.slice(start).filter(line => line.startsWith('|-status|p2a:'));
		assert.equal(updates.length, 1);
		assert(updates[0].endsWith('|par|[silent]'), updates.join('\n'));
	});
	it('preserves stacked sleep counters and paralysis through serialization and switching', () => {
		let target = begin({ bench: true });
		turn(2); target.statusState.time = 4; turn(1);
		assert(hasRogueStatus(target, 'slp') && hasRogueStatus(target, 'par'));
		const saved = savedRogueStatuses(target);
		const snapshot = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(snapshot);
		target = battle.p2.active[0];
		assert.deepEqual(savedRogueStatuses(target), saved);
		turn(4, 'switch 2');
		const start = battle.log.length;
		turn(4, 'switch 2');
		assert.equal(battle.p2.active[0], target);
		assert.deepEqual(savedRogueStatuses(target), saved);
		assert(battle.log.slice(start).some(line => line.startsWith('|-start|p2a:') && line.includes('|rogueslp')),
			battle.log.slice(start).join('\n'));
	});
	it('does not stack statuses without the blessing', () => {
		const target = begin({ blessed: false });
		turn(1); turn(2);
		assert(hasRogueStatus(target, 'par')); assert(!hasRogueStatus(target, 'slp'));
	});
	for (const species of ['Togekiss', 'Rotom']) it(`allows sleep on an ungrounded ${species} in Electric Terrain`, () => {
		const target = begin({ terrain: 'electricterrain', species, ability: species === 'Rotom' ? 'Levitate' : 'Serene Grace' });
		assert(!target.isGrounded()); turn(1); turn(2);
		assert(hasRogueStatus(target, 'par') && hasRogueStatus(target, 'slp'), battle.log.join('\n'));
	});
	for (const protection of ['Insomnia', 'Overcoat', 'Safety Goggles', 'mistyterrain', 'safeguard']) {
		it(`does not bypass ${protection} with Sleep Powder`, () => {
			const target = begin({ ability: ['Insomnia', 'Overcoat'].includes(protection) ? protection : 'Healer',
				item: protection === 'Safety Goggles' ? protection : '', terrain: protection === 'mistyterrain' ? protection : undefined });
			if (protection === 'safeguard') target.side.addSideCondition('safeguard', target);
			turn(2);
			assert(!hasRogueStatus(target, 'slp'), battle.log.join('\n'));
		});
	}
	for (const [species, move, status] of [['Pikachu', 'Glare', 'par'], ['Steelix', 'Toxic', 'tox'], ['Ninetales', 'Will-O-Wisp', 'brn']]) {
		it(`bypasses ${species}'s type immunity to ${status}, with no change to move immunity`, () => {
			const target = begin({ species, ability: 'Run Away', moves: [move] });
			turn(1); assert(hasRogueStatus(target, status), battle.log.join('\n'));
		});
	}
	it('keeps Ground immunity to Thunder Wave, while Glare can still cause paralysis', () => {
		const target = begin({ species: 'Sandshrew', ability: 'Sand Veil', moves: ['Thunder Wave', 'Glare'] });
		turn(1); assert(!hasRogueStatus(target, 'par'), battle.log.join('\n'));
		turn(2); assert(hasRogueStatus(target, 'par'), battle.log.join('\n'));
	});
});
