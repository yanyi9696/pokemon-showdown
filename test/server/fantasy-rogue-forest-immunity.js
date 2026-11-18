'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { PRNG } = require('../../dist/sim/prng');
const { makeEncounterSet } = require('../../dist/server/fantasy-rogue/encounter-sets');
const { simulateForestBattle } = require('../../dist/server/fantasy-rogue/event-battle');
const { forestTeams } = require('../../dist/server/fantasy-rogue/events');
const { forestSpeciesPool, forestEncounterSet } = require('../../dist/server/fantasy-rogue/forest-teams');
const { eventSpeciesPool } = require('../../dist/server/fantasy-rogue/event-teams');
const { minimumEvolutionLevel } = require('../../dist/server/fantasy-rogue/evolution');
const { levelMoves } = require('../../dist/server/fantasy-rogue/progression');
const { eventPacingWeight } = require('../../dist/server/fantasy-rogue/event-pacing');
const { Dex } = require('../../dist/sim/dex');

describe('Fantasy Rogue forest spectator type immunity', function () {
	this.timeout(20000);
	const set = (species, moves) => ({ ...makeEncounterSet(species, 3), ...(moves ? { moves } : {}) });
	function native(target) {
		const format = new Format({ name: 'Forest immunity QA', mod: 'gen9fantasy', gameType: 'singles', ruleset: [] });
		return new Battle({ format, formatid: format.id, seed: [1, 2, 3, 4],
			p1: { team: [set('Pumpkaboo')] }, p2: { team: [set(target, ['Growl'])] } });
	}
	it('keeps Normal immunity after successful Trick-or-Treat instead of treating added Ghost as replacement', () => {
		const battle = native('Zigzagoon');
		try {
			battle.makeChoices('move trickortreat', 'move growl');
			const target = battle.p2.active[0]; assert.deepEqual(target.getTypes(), ['Normal', 'Ghost']);
			assert(battle.log.some(line => line.includes('|typeadd|Ghost|')));
			const hp = target.hp;
			battle.makeChoices('move astonish', 'move growl'); assert.equal(target.hp, hp);
			assert(battle.log.some(line => line.startsWith('|-immune|p2a: Zigzagoon')));
		} finally { battle.destroy(); }
	});
	it('damages a non-Normal target after adding Ghost and preserves the native super-effective log', () => {
		const battle = native('Pikachu');
		try {
			battle.makeChoices('move trickortreat', 'move growl');
			const target = battle.p2.active[0]; assert.deepEqual(target.getTypes(), ['Electric', 'Ghost']);
			const hp = target.hp; battle.makeChoices('move astonish', 'move growl');
			assert(target.hp < hp); assert(battle.log.some(line => line.startsWith('|-supereffective|p2a: Pikachu')));
		} finally { battle.destroy(); }
	});
	it('preserves repeated type-add failure and restoring the base type on switching', () => {
		const battle = native('Zigzagoon');
		try {
			battle.makeChoices('move trickortreat', 'move growl');
			battle.makeChoices('move trickortreat', 'move growl');
			assert(battle.log.some(line => line.startsWith('|-fail|p1a: Pumpkaboo')));
			battle.p2.active[0].clearVolatile();
			assert.deepEqual(battle.p2.active[0].getTypes(), ['Normal']);
			const move = battle.dex.moves.get('trickortreat');
			assert.equal(move.accuracy, 100); assert.equal(move.category, 'Status');
		} finally { battle.destroy(); }
	});
	it('retains Sand Attack accuracy loss and real Trick-or-Treat misses', () => {
		const battle = native('Zigzagoon');
		try {
			battle.p2.active[0].moveSlots = [{ move: 'Sand Attack', id: 'sandattack', pp: 24, maxpp: 24,
				target: 'normal', disabled: false, disabledSource: '', used: false }];
			battle.makeRequest('move');
			for (let turn = 0; turn < 18; turn++) battle.makeChoices('move trickortreat', 'move sandattack');
			assert.equal(battle.p1.active[0].boosts.accuracy, -6);
			assert(battle.log.some(line => line.startsWith('|-miss|p1a: Pumpkaboo|p2a: Zigzagoon')));
		} finally { battle.destroy(); }
	});
	it('keeps the no-voluntary-switch AI even in the reported low-level mutual immunity', () => {
		const teams = [['Pumpkaboo', 'Bulbasaur', 'Squirtle'], ['Zigzagoon', 'Caterpie', 'Pidgey']]
			.map(team => team.map(species => set(species)));
		const original = structuredClone(teams), replay = simulateForestBattle(teams, () => 1);
		let turn = 0, firstDamage, firstReplacement;
		const fainted = new Set();
		for (const line of replay.log) {
			if (line.startsWith('|turn|')) turn = Number(line.split('|')[2]);
			if (line.startsWith('|faint|')) fainted.add(line.split('|')[2].slice(0, 2));
			if (turn > 0 && line.startsWith('|switch|')) {
				const side = line.split('|')[2].slice(0, 2);
				assert(fainted.has(side), 'only replace a fainted member'); fainted.delete(side);
				if (firstReplacement === undefined) firstReplacement = turn;
			}
			if (firstDamage === undefined && line.startsWith('|-damage|')) firstDamage = turn;
		}
		assert(firstReplacement > firstDamage); assert.notEqual(replay.winner, null);
		assert.deepEqual(teams, original);
	});
	it('keeps the PP/Struggle rules when neither side has a reserve that can attack', () => {
		const replay = simulateForestBattle([[set('Pumpkaboo')], [set('Zigzagoon')]], () => 1);
		assert(replay.log.some(line => line.includes('|Astonish|')));
		assert(replay.log.some(line => line.includes('|Struggle|')));
		assert(replay.log.some(line => line.startsWith('|win|')));
		assert.equal(replay.log.filter(line => line.startsWith('|switch|')).length, 2);
	});
	it('does not switch away from an available damaging move', () => {
		const replay = simulateForestBattle([[set('Pikachu', ['Thunderbolt']), set('Squirtle')],
			[set('Magikarp', ['Splash'])]], () => 1);
		assert.equal(replay.winner, 0);
		assert.equal(replay.log.filter(line => line.startsWith('|switch|p1')).length, 1);
	});
	it('finishes generated forest encounters across levels and seeds without invalid choices', () => {
		for (const level of [3, 5, 15, 40, 80]) for (let seed = 1; seed <= 6; seed++) {
			const random = new PRNG([seed, level, 18, 11]), teams = forestTeams(level, n => random.random(n));
			const copy = structuredClone(teams), replay = simulateForestBattle(teams, n => random.random(n));
			assert(replay.log.some(line => line.startsWith('|win|') || line === '|tie|'));
			assert(!replay.log.some(line => /\|error\||Invalid choice/.test(line)));
			assert.deepEqual(teams, copy);
		}
	});
	it('expands the spectator pool without changing other event casts and respects evolution levels', () => {
		for (const level of [3, 5, 15, 25, 40, 60, 80, 100]) {
			const original = eventSpeciesPool('forest', level), expanded = forestSpeciesPool(level);
			assert(original.every(name => expanded.includes(name)));
			assert(expanded.length >= original.length + 40);
			for (const name of expanded) assert(minimumEvolutionLevel(name) <= level, `${name} Lv.${level}`);
		}
		assert(forestSpeciesPool(3).includes('Rookidee'));
		assert(!forestSpeciesPool(3).includes('Corviknight'));
		assert(forestSpeciesPool(40).includes('Corviknight'));
		assert(!forestSpeciesPool(40).includes('Rookidee'));
	});
	it('gives every eligible level and species two attack types whenever the level-up learnset allows it', () => {
		const dex = Dex.mod('gen9fantasy'), quality = { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
		for (let level = 3; level <= 100; level++) for (const species of forestSpeciesPool(level)) {
			const ordinary = makeEncounterSet(species, level, quality), next = forestEncounterSet(species, level, quality);
			const legal = levelMoves(species).filter(entry => entry.level <= level).map(entry => entry.move);
			const types = ids => new Set(ids.map(id => dex.moves.get(id)).filter(m => m.category !== 'Status').map(m => m.type));
			assert(next.moves.every(id => legal.includes(id)), `${species} Lv.${level}: ${next.moves}`);
			assert(next.moves.length <= 4); assert.equal(new Set(next.moves).size, next.moves.length);
			assert.equal(next.item, ''); assert.equal(next.level, level);
			if (types(legal).size >= 2) assert(types(next.moves).size >= 2, `${species} Lv.${level}`);
			else assert.deepEqual(next.moves, ordinary.moves);
			assert.deepEqual(makeEncounterSet(species, level, quality), ordinary);
		}
		assert.deepEqual(forestEncounterSet('Pumpkaboo', 3, quality).moves, ['astonish', 'trickortreat']);
	});
	it('uses the existing highest forest pacing weight on every floor without raising other events', () => {
		for (let floor = 1; floor <= 200; floor++) assert.equal(eventPacingWeight(floor, 'forest'), 1.8);
		assert.equal(eventPacingWeight(1, 'identityquiz'), 1.8);
		assert.equal(eventPacingWeight(50, 'identityquiz'), 1);
	});
});
