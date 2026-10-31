'use strict';

const assert = require('assert').strict;
const { Dex } = require('../../dist/sim/dex');
const { Battle } = require('../../dist/sim/battle');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { randomUUID } = require('crypto');
const { experienceAtLevel, rogueSpeciesData } = require('../../dist/sim/fantasy-rogue-rules');
const { createRoguePokemon, initializeExperience, levelMoves, gainExperience, rebuildMember, rememberPastLevelMoves } =
	require('../../dist/server/fantasy-rogue/progression');
const { makeEncounterSet } = require('../../dist/server/fantasy-rogue/encounter-sets');
const { drawBlessingGift } = require('../../dist/server/fantasy-rogue/blessings');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { stats, content, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue level move memory for acquired partners', () => {
	const create = (species, level) => createRoguePokemon(makeEncounterSet(species, level), stats(0));
	for (const [species, learned, future] of [
		['Kubfu', 'focusenergy', 'closecombat'],
		['Zapdos', 'thunderwave', 'thunder'],
		['Mewtwo', 'lifedew', 'psystrike'],
		['Dragonite-Fantasy', 'extremespeed', 'outrage'],
	]) {
		it(`remembers earlier level moves for ${species} without changing its equipped set or PP`, () => {
			const mon = create(species, 40), equipped = [...mon.set.moves];
			mon.pp[0].pp = 1;
			initializeExperience(mon);
			assert(mon.moveMemory.some(move => move.id === learned && move.pp > 0), learned);
			assert(!mon.moveMemory.some(move => move.id === future), future);
			assert.deepEqual(mon.set.moves, equipped);
			assert.equal(mon.moveMemory.find(move => move.id === mon.pp[0].id).pp, 1);
			const before = JSON.stringify(mon);
			initializeExperience(mon); rebuildMember(mon, stats(0)); initializeExperience(mon);
			assert.equal(JSON.stringify(mon), before);
		});
	}
	it('uses the corresponding regional level learnset and keeps Fantasy teaching separate', () => {
		assert.deepEqual(levelMoves('Typhlosion-Hisui-Fantasy'), levelMoves('Typhlosion-Hisui'));
		const mon = create('Dragonite-Fantasy', 100);
		initializeExperience(mon);
		assert(mon.moveMemory.some(move => move.id === 'outrage'));
		assert(!mon.moveMemory.some(move => move.id === 'chuanyun'), 'custom tutor move is not a free level move');
		assert(!mon.moveMemory.some(move => move.id === 'protect'), 'TM-only moves still need teaching');
		assert(!levelMoves('Urshifu-Fantasy').some(move => ['wickedblow', 'suckerpunch'].includes(move.move)));
	});
	it('continues offering new level moves after a Fantasy partner gains a level', () => {
		const mon = create('Dragonite-Fantasy', 40);
		initializeExperience(mon);
		const run = { team: [mon], boosts: stats(0), notices: [], floor: 80, bag: {} };
		const amount = experienceAtLevel(rogueSpeciesData(mon.set.species).growth, 41) - mon.experience;
		gainExperience(run, mon, amount);
		assert.equal(mon.set.level, 41);
		assert(mon.moveMemory.some(move => move.id === 'outrage'));
		assert(run.pendingMoves.some(move => move.member === mon.id && move.move === 'outrage'));
	});
	it('preserves spent PP in archived form moves and keeps illegal signatures out of memory', () => {
		const mon = create('Kyurem-White', 100);
		// Make this an archived move, regardless of the wild set's preferred coverage.
		mon.set.moves = ['iceburn'];
		mon.pp = [{ id: 'iceburn', pp: 5, maxpp: 5 }];
		mon.moveMemory = [];
		mon.formMoveMemory = [{ id: 'icebeam', pp: 2, maxpp: Dex.moves.get('icebeam').pp }];
		initializeExperience(mon);
		assert(!mon.moveMemory.some(move => move.id === 'glaciate'));
		assert(mon.moveMemory.some(move => move.id === 'icebeam' && move.pp === 2));
		assert(mon.moveMemory.some(move => move.id === 'iceburn'));
	});
	it('does not expose an unhatched egg learnset or add unrelated moves to a Potara fusion', () => {
		for (const field of ['egg', 'fusion']) {
			const mon = create('Kubfu', 40);
			mon[field] = {};
			const memory = structuredClone(mon.moveMemory);
			rememberPastLevelMoves(mon);
			assert.deepEqual(mon.moveMemory, memory);
		}
	});
	it('seeds the Kubfu reward used by the martial artist with its earlier legal level moves', () => {
		const run = { floor: 80, boosts: stats(0), team: [], bag: {}, money: 0 };
		const mon = drawBlessingGift(run, createPreviewContent(), () => 0, { species: 'Kubfu', level: 40 });
		assert.equal(mon.set.species, 'Kubfu');
		assert.equal(mon.set.moves.length, 4);
		assert(mon.moveMemory.some(move => move.id === 'focusenergy'));
		assert(mon.moveMemory.some(move => move.id === 'detect'));
	});
	it('retains a caught legendary level learnset through actual battle settlement and reload', () => {
		const store = new RogueStore(':memory:'), config = content(), userid = 'caughtmemory';
		config.progression = true;
		for (const item of config.items) if (item.kind === 'ball') item.multiplier = 1;
		config.starters.push({ id: 'mewtwo', set: makeEncounterSet('Mewtwo', 5), availableInitially: false });
		config.unlocks.mewtwo = { starter: 'mewtwo', captures: 10 };
		config.floors[1][0].kind = 'elite';
		config.floors[1][0].encounters = [{ name: 'Wild', team: [makeEncounterSet('Mewtwo', 40)],
			style: 'balanced', catchable: true, catchChances: { pokeball: 1 } }];
		const engine = new RogueEngine(store, config, () => 0);
		let battle;
		try {
			const command = (action, data = {}) => commandAfterOpening(engine, userid,
				{ id: randomUUID(), revision: store.get(userid).revision, action, ...data });
			command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' }); command('battle');
			const run = store.get(userid).run;
			battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: engine.battleState(userid),
				p1: { name: userid, team: run.team.map(mon => mon.set) }, p2: { name: 'Wild', team: run.node.encounters[0].team } });
			battle.makeChoices('team 1', 'team 1'); battle.makeChoices('rogueball pokeball', 'move 1');
			assert(battle.ended);
			const result = rogueBattleResult(battle);
			engine.capture(userid, run.battle.token, result.captured);
			engine.settle(userid, run.battle.token, result);
			for (let i = 0; i < 100 && store.get(userid).run.pendingMoves?.length; i++) {
				command('learn', { member: store.get(userid).run.pendingMoves[0].member, value: 'skip' });
			}
			assert.equal(store.get(userid).run.floor, 2);
			engine.migrate(userid);
			const caught = store.get(userid).run.team.find(mon => mon.set.species === 'Mewtwo');
			assert(caught.moveMemory.some(move => move.id === 'lifedew' && move.pp > 0));
			assert(!caught.moveMemory.some(move => move.id === 'psystrike'));
		} finally { battle?.destroy(); store.close(); }
	});
	it('repairs retained party, box, checkpoint and pending captures idempotently without healing', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, createPreviewContent(), () => 0), userid = 'memoryrepair';
			commandAfterOpening(engine, userid, { id: 'memory-start-001', revision: 0, action: 'start', starters: ['bulbasaur'] });
			store.change(userid, account => {
				const mon = create('Zapdos', 40);
				mon.hp -= 7; mon.status = 'brn'; mon.pp[0].pp = 0;
				// Legacy history proves this move was used, but its remaining PP was not stored.
				mon.seenMoves = [...mon.set.moves, 'thunderwave'];
				const run = account.run;
				run.team = [mon]; run.box = [structuredClone(mon)];
				run.checkpoint.team = [structuredClone(mon)]; run.checkpoint.box = [structuredClone(mon)];
				run.pendingCaptures = [structuredClone(mon)]; run.pendingCapture = structuredClone(mon);
			});
			const old = store.get(userid).run.team[0];
			engine.migrate(userid);
			const run = store.get(userid).run;
			for (const mon of [...run.team, ...run.box, ...run.checkpoint.team, ...run.checkpoint.box,
				...run.pendingCaptures, run.pendingCapture]) {
				assert(mon.moveMemory.some(move => move.id === 'thunderwave' && move.pp === 0));
				assert(mon.moveMemory.some(move => move.id === 'lightscreen' && move.pp === Dex.moves.get('lightscreen').pp));
				assert.equal(mon.hp, old.hp); assert.equal(mon.status, 'brn'); assert.equal(mon.pp[0].pp, 0);
				assert.deepEqual(mon.set.moves, old.set.moves);
			}
			engine.migrate(userid);
			assert.deepEqual(store.get(userid).run.team, run.team);
		} finally { store.close(); }
	});
});
