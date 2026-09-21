'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { Teams } = require('../../dist/sim/teams');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent, PreviewBosses } = require('../../dist/server/fantasy-rogue/preview-content');
const { validateContent, fixedFloor } = require('../../dist/server/fantasy-rogue/content');
const { initializeExperience, gainExperience } = require('../../dist/server/fantasy-rogue/progression');
const { experienceAtLevel, experienceYield, captureThresholds, rogueSpeciesData } = require('../../dist/sim/fantasy-rogue-rules');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');

describe('Fantasy Rogue playable preview', () => {
	let store, engine, battle;
	const user = 'previewtester';
	const account = () => store.get(user);
	const cmd = (action, details = {}) => engine.command(user, { id: randomUUID(), revision: account().revision, action, ...details });
	const start = () => { cmd('start', { starters: ['bulbasaur'] }); cmd('select', { value: 'wild0' }); };
	const learnAll = () => {
		while (account().run.pendingMoves?.length) cmd('learn', { member: account().run.pendingMoves[0].member, value: 'skip' });
	};
	function nativeBattle(fullParty = false) {
		start();
		if (fullParty) store.change(user, saved => {
			while (saved.run.team.length < 6) {
				const mon = createRoguePokemon(saved.run.team[0].set, saved.run.boosts, `old:member:${saved.run.team.length}`);
				initializeExperience(mon); saved.run.team.push(mon);
			}
		});
		cmd('battle');
		const run = account().run;
		const state = engine.battleState(user);
		battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: state,
			p1: { name: 'Human', team: Teams.pack(run.team.map(mon => mon.set)) },
			p2: { name: 'Wild', team: Teams.pack(run.node.encounters[0].team) } });
		battle.choose('p1', 'team ' + run.team.map((mon, i) => i + 1).join(''));
		battle.choose('p2', 'team 1');
		return run;
	}
	beforeEach(() => { store = new RogueStore(':memory:'); engine = new RogueEngine(store, createPreviewContent()); });
	afterEach(() => {
		battle?.destroy(); battle = undefined; store.close();
	});
	it('validates all 200 floors, the 27 initial starters, shops and fixed boss schedule', () => {
		const content = validateContent(createPreviewContent());
		assert.equal(content.starters.filter(starter => starter.availableInitially).length, 27);
		for (let floor = 1; floor <= 200; floor++) {
			assert.equal(content.floors[floor].length, fixedFloor(floor) ? 1 : 3);
			if (fixedFloor(floor) === 'boss') assert.equal(content.floors[floor][0].name, PreviewBosses[floor]?.name || '幻想精英');
		}
		assert.equal(content.items.find(item => item.id === 'pokeball').multiplier, 1);
		assert.equal(content.items.find(item => item.id === 'expcandyl').amount, 10000);
	});
	it('uses all six original growth tables and scaled full/half experience', () => {
		assert.deepEqual([1, 2, 3, 4, 5, 6].map(group => experienceAtLevel(group, 100)),
			[1250000, 1000000, 800000, 1059860, 600000, 1640000]);
		for (const group of [1, 2, 3, 4, 5, 6]) assert.equal(experienceAtLevel(group, 1), 0);
		assert.equal(experienceYield(64, 5, 5, true), 65);
		assert.equal(experienceYield(64, 5, 5, false), 33);
		assert(experienceYield(64, 10, 5, true) > experienceYield(64, 10, 15, true));
		assert.equal(rogueSpeciesData('Mewtwo-Fantasy').growth, rogueSpeciesData('Mewtwo').growth);
	});
	it('uses HP, status, ball and actual species-count thresholds for captures', () => {
		const full = captureThresholds(45, 100, 100, '', 1, 0);
		const low = captureThresholds(45, 100, 1, '', 1, 0);
		const ultra = captureThresholds(45, 100, 1, 'slp', 2, 31);
		assert(low.shake > full.shake); assert(ultra.shake > low.shake);
		assert.equal(full.critical, 0); assert(ultra.critical > 0);
		assert(captureThresholds(255, 100, 1, 'slp', 1, 0).guaranteed);
		assert.equal(full.shake, Math.floor(65536 * (15 / 255) ** (3 / 16)));
	});
	it('collects real participant/defeat records and awards experience only once on settlement', () => {
		const run = nativeBattle();
		battle.p2.active[0].hp = 1;
		battle.choose('p1', 'move 1'); battle.choose('p2', 'move 1');
		assert(battle.ended);
		const result = rogueBattleResult(battle);
		assert.equal(result.defeated.length, 1);
		assert.deepEqual(result.defeated[0].participants, [run.team[0].id]);
		assert.deepEqual(result.defeated[0].eligible, [run.team[0].id]);
		engine.settle(user, run.battle.token, result);
		assert(account().run.team[0].experience > run.team[0].experience);
		const settled = account();
		engine.settle(user, run.battle.token, result);
		assert.deepEqual(account(), settled);
		assert.equal(account().points, 0);
	});
	it('preserves damage, status and existing PP through candy levels, evolution and learning', () => {
		start();
		store.change(user, saved => {
			const mon = saved.run.team[0];
			mon.hp -= 3; mon.status = 'par'; mon.pp[0].pp = 1;
			saved.run.bag.expcandym = 1;
		});
		const before = account().run.team[0];
		cmd('use', { value: 'expcandym', member: before.id });
		const after = account().run.team[0];
		assert.equal(after.set.species, 'Ivysaur');
		assert.equal(after.maxhp - after.hp, 3); assert.equal(after.status, 'par');
		assert.equal(after.pp.find(move => move.id === before.pp[0].id).pp, 1);
		assert(account().run.pendingMoves.length);
		assert.throws(() => cmd('battle'), /待学习/);
		cmd('learn', { member: before.id, value: '1' }); learnAll();
		assert.equal(account().run.bag.expcandym, 0);
		cmd('battle');
		const ticket = account().run.battle;
		const lost = account().run;
		lost.team[0].hp = 0;
		engine.settle(user, ticket.token, { encounterId: ticket.encounterId, won: false, team: lost.team, bag: lost.bag });
		assert.equal(account().run.team[0].set.level, after.set.level);
		assert.equal(account().run.team[0].experience, after.experience);
		assert.equal(account().run.team[0].hp, 0);
		assert.equal(account().run.bag.expcandym, 0);
	});
	it('does not revive fainted members during growth or exceed level 100', () => {
		start();
		store.change(user, saved => {
			const mon = saved.run.team[0]; mon.hp = 0;
			gainExperience(saved.run, mon, 2000000);
		});
		const mon = account().run.team[0];
		assert.equal(mon.hp, 0); assert.equal(mon.set.level, 100);
		assert.equal(mon.experience, experienceAtLevel(4, 100));
	});
	it('captures with a full party, persists a replacement choice, and preserves permanent catches on release', () => {
		const run = nativeBattle(true);
		battle.randomChance = () => true;
		assert(battle.choose('p1', 'rogueball pokeball'));
		battle.choose('p2', 'move 1');
		const result = rogueBattleResult(battle);
		assert(result.captured);
		engine.capture(user, run.battle.token, result.captured);
		engine.settle(user, run.battle.token, result);
		assert.equal(account().run.phase, 'settlement');
		assert.equal(account().run.team.length, 6);
		assert.equal(account().run.pendingCapture.id, result.captured.id);
		const permanent = structuredClone(account().captures);
		assert.throws(() => cmd('battle'));
		cmd('replace', { value: 'release' }); learnAll();
		assert.deepEqual(account().captures, permanent);
		assert.equal(account().run.phase, 'ready');
		assert.equal(account().run.team.length, 6);
	});
	it('advances the whole 200-floor state machine without skipping mandatory centers or duplicating points', () => {
		cmd('start', { starters: ['bulbasaur'] });
		let points = 0;
		for (let floor = 1; floor <= 200; floor++) {
			if (account().run.phase === 'choose') cmd('select', { value: 'wild0' });
			if (account().run.phase === 'rest') {
				cmd('heal'); cmd('heal'); assert.equal(account().points, points);
				cmd('continue');
			} else {
				if (account().run.node.kind === 'boss') points++;
				const count = account().run.node.encounters.length;
				for (let i = 0; i < count; i++) {
					cmd('battle'); const run = account().run;
					engine.settle(user, run.battle.token, { encounterId: run.battle.encounterId, won: true, team: run.team, bag: run.bag });
				}
			}
			assert.equal(account().points, points);
		}
		assert.equal(account().run.phase, 'complete');
		assert.equal(points, 23);
		cmd('upgrade', { value: 'hp' });
		assert.equal(account().points, points - 1);
	});
	it('replaces a member whose stable id contains colons without changing the capture ledger', () => {
		const run = nativeBattle(true);
		battle.randomChance = () => true;
		battle.choose('p1', 'rogueball pokeball'); battle.choose('p2', 'move 1');
		const result = rogueBattleResult(battle);
		engine.settle(user, run.battle.token, result);
		const permanent = account().captures;
		cmd('replace', { value: 'old:member:2' }); learnAll();
		assert.equal(account().run.team[2].id, result.captured.id);
		assert.deepEqual(account().captures, permanent);
		assert.equal(account().run.team.length, 6);
	});
	it('finishes floor learning before taking the next floor checkpoint', () => {
		start();
		store.change(user, saved => { saved.run.encounter = 2; });
		cmd('battle');
		const run = account().run;
		const member = run.team[0].id;
		engine.settle(user, run.battle.token, {
			encounterId: run.battle.encounterId, won: true, team: run.team, bag: run.bag,
			defeated: [{ species: 'Chansey', level: 50, participants: [member], eligible: [member] }],
		});
		assert.equal(account().run.floor, 1); assert.equal(account().points, 0);
		assert.equal(account().run.phase, 'settlement');
		const learned = account().run.pendingMoves[0].move;
		cmd('learn', { member, value: '0' }); learnAll();
		assert.equal(account().run.floor, 2); assert.equal(account().points, 0);
		assert.equal(account().run.checkpoint.team[0].set.moves[0], learned);
		const checkpoint = structuredClone(account().run.checkpoint);
		cmd('select', { value: 'wild0' }); cmd('battle');
		const ticket = account().run.battle;
		const lost = account().run;
		lost.team[0].hp = 0;
		engine.settle(user, ticket.token, { encounterId: ticket.encounterId, won: false, team: lost.team, bag: lost.bag });
		checkpoint.team[0].hp = 0;
		assert.deepEqual(account().run.team, checkpoint.team);
	});
});
