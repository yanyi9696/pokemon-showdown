'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { recordStarterTraits, starterTraits } = require('../../dist/server/fantasy-rogue/starter-traits');
const { captureThresholds } = require('../../dist/sim/fantasy-rogue-rules');
const { rogueCaptureChance } = require('../../dist/sim/fantasy-rogue');
const { Battle } = require('../../dist/sim/battle');
const { stats, set } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue starter traits and capture probability', () => {
	let store, engine, battle;
	const user = 'traittester';
	const account = () => store.get(user);
	const cmd = (action, details = {}) => engine.command(user, { id: randomUUID(), revision: account().revision, action, ...details });
	beforeEach(() => { store = new RogueStore(':memory:'); engine = new RogueEngine(store, createPreviewContent(), max => Math.min(3, max - 1)); });
	afterEach(() => {
		battle?.destroy(); battle = undefined; store.close();
	});
	it('unlocks captured ability slots across evolution and seeds all legal move memory without move selection', () => {
		cmd('start', { starters: ['bulbasaur'] }); cmd('select', { value: 'wild0' }); cmd('battle');
		const ticket = account().run.battle;
		const caught = createRoguePokemon({ ...set('Venusaur', 'Chlorophyll', 50, ['Solar Beam']), nature: 'Modest' }, stats(0), ticket.encounterId);
		engine.capture(user, ticket.token, caught);
		assert.deepEqual(starterTraits(account(), 'bulbasaur').abilities, ['chlorophyll']);
		engine.recover(user, ticket.token); cmd('abandon');
		const build = { nature: 'random', ivs: stats(20), ability: 'chlorophyll' };
		assert.throws(() => cmd('start', { starters: ['bulbasaur'], starterBuilds: { bulbasaur: { ...build, ability: 'overgrow' } } }), /特性/);
		cmd('start', { starters: ['bulbasaur'], starterBuilds: { bulbasaur: build } });
		const member = account().run.team[0];
		assert.equal(member.set.ability, 'Chlorophyll');
		assert(!member.set.moves.includes('solarbeam'));
		assert(member.moveMemory.some(move => move.id === 'solarbeam' && move.pp === 10));
		assert(member.seenMoves.includes('solarbeam'));
		cmd('setmove', { member: member.id, slot: 0, value: 'solarbeam' });
		assert.equal(account().run.team[0].set.moves[0], 'solarbeam');
		const saved = account();
		recordStarterTraits(saved, engine.content, { ...set('Butterfree', 'Compound Eyes'), nature: 'Hardy' }, true);
		assert.deepEqual(starterTraits(saved, 'caterpie').abilities, ['shielddust']);
		recordStarterTraits(saved, engine.content, { ...set('Ninetales-Alola', 'Snow Warning'), nature: 'Timid' }, true);
		assert.deepEqual(starterTraits(saved, 'vulpixalola').abilities, ['snowwarning']);
		assert.deepEqual(starterTraits(saved, 'vulpix').abilities, []);
	});
	it('defaults to 20 IVs and random nature, with no nature unlock from starting or duplicate requests', () => {
		const request = { id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur'] };
		engine.command(user, request);
		const first = account();
		assert.deepEqual(first.run.team[0].set.ivs, stats(20));
		assert.equal(first.run.team[0].set.nature, 'Brave');
		assert.deepEqual(starterTraits(first, 'bulbasaur').natures, []);
		engine.command(user, request); assert.deepEqual(account(), first);
	});
	it('records captured evolved partners immediately, once, and preserves traits after abandonment', () => {
		cmd('start', { starters: ['bulbasaur'] }); cmd('select', { value: 'wild0' }); cmd('battle');
		const ticket = account().run.battle;
		const captured = createRoguePokemon({ ...set('Venusaur', 'Overgrow'), nature: 'Modest', ivs: { ...stats(20), atk: 0, spa: 29 } }, stats(0), ticket.encounterId);
		engine.capture(user, ticket.token, captured);
		const once = account(); engine.capture(user, ticket.token, captured); assert.deepEqual(account(), once);
		assert.equal(once.captures.bulbasaur, 1);
		assert.deepEqual(once.starterTraits.bulbasaur.natures, ['modest']);
		assert.equal(once.starterTraits.bulbasaur.ivs.min.atk, 0);
		assert.equal(once.starterTraits.bulbasaur.ivs.max.spa, 29);
		assert.equal(once.starterTraits.bulbasaur.ivs.max.def, 20);
		engine.recover(user, ticket.token); cmd('abandon');
		cmd('start', { starters: ['bulbasaur'], starterBuilds: { bulbasaur: { nature: 'modest', ivs: { ...stats(20), atk: 0, spa: 25 } } } });
		assert.equal(account().run.team[0].set.nature, 'Modest');
		assert.equal(account().run.team[0].set.ivs.spa, 25);
	});
	it('rejects locked natures and out-of-range IVs without creating a run or spending a request', () => {
		const invalid = [
			{ nature: 'adamant', ivs: stats(20) }, { nature: 'random', ivs: { ...stats(20), atk: 21 } },
			{ nature: 'random', ivs: { ...stats(20), hp: 19 } }, { nature: 'random', ivs: { ...stats(20), hp: 20.5 } },
		];
		for (const build of invalid) {
			assert.throws(() => cmd('start', { starters: ['bulbasaur'], starterBuilds: { bulbasaur: build } }), /尚未|范围/);
			assert.equal(account().revision, 0); assert(!account().run);
		}
	});
	it('event IV changes expand only each affected range, do not heal, and do not unlock random starter nature', () => {
		cmd('start', { starters: ['bulbasaur'] });
		const id = account().run.team[0].id;
		store.change(user, saved => { saved.run.team[0].hp -= 3; });
		engine.setEventIVs(user, id, { atk: 29, spe: 0, hp: 31 });
		const saved = account();
		assert.equal(saved.run.team[0].maxhp - saved.run.team[0].hp, 3);
		assert.deepEqual(saved.starterTraits.bulbasaur.natures, []);
		assert.equal(saved.starterTraits.bulbasaur.ivs.max.atk, 29);
		assert.equal(saved.starterTraits.bulbasaur.ivs.min.spe, 0);
		assert.equal(saved.starterTraits.bulbasaur.ivs.max.def, 20);
		cmd('abandon'); cmd('start', { starters: ['bulbasaur'] });
		assert.equal(account().run.team[0].set.ivs.atk, 29); assert.equal(account().run.team[0].set.ivs.spe, 20);
		assert.throws(() => engine.setEventIVs(user, account().run.team[0].id, { atk: 32 }), /0～31/);
		assert.throws(() => cmd('setEventIVs', { member: id, ivs: stats(31) }));
	});
	it('keeps regional starter traits separate and shared only within their own chain', () => {
		const saved = account();
		recordStarterTraits(saved, engine.content, { ...set('Ninetales-Alola', 'Snow Cloak'), nature: 'Timid', ivs: { ...stats(20), spe: 31 } }, true);
		assert.deepEqual(starterTraits(saved, 'vulpixalola').natures, ['timid']);
		assert.deepEqual(starterTraits(saved, 'vulpix').natures, []);
	});
	it('re-locks legacy special starters below ten while preserving the active adventure and current party', () => {
		cmd('start', { starters: ['bulbasaur'] });
		store.change(user, saved => {
			saved.captures = { poipole: 9, ironbundle: 10, meltan: 1 };
			saved.unlocked = ['poipole', 'ironbundle', 'meltan'];
			saved.run.team.push(createRoguePokemon(set('Poipole', 'Beast Boost'), stats(0)));
			delete saved.starterTraits;
		});
		const run = account().run;
		engine.migrate(user);
		assert.deepEqual(account().run, run); assert.deepEqual(account().unlocked, ['ironbundle']);
		const migrated = account(); engine.migrate(user); assert.deepEqual(account(), migrated);
	});
	it('combines special family captures and unlocks exactly on ten', () => {
		cmd('start', { starters: ['bulbasaur'] }); cmd('select', { value: 'wild0' }); cmd('battle');
		const ticket = account().run.battle;
		store.change(user, saved => { saved.captures.poipole = 9; });
		const captured = createRoguePokemon(set('Naganadel', 'Beast Boost'), stats(0), ticket.encounterId);
		engine.capture(user, ticket.token, captured);
		assert.equal(account().captures.poipole, 10); assert(account().unlocked.includes('poipole'));
	});
	it('computes exact four-shake plus critical chance without RNG and sends it only to the player', () => {
		cmd('start', { starters: ['bulbasaur'] }); cmd('select', { value: 'wild0' }); cmd('battle');
		const run = account().run;
		const messages = [];
		battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: engine.battleState(user),
			p1: { name: 'Human', team: run.team.map(mon => mon.set) },
			p2: { name: 'Wild', team: [set('Bulbasaur', 'Overgrow', 5)] }, send: (type, payload) => messages.push([type, payload]) });
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		const ball = battle.fantasyRogue.balls.find(entry => entry.id === 'pokeball');
		const full = rogueCaptureChance(battle, ball);
		const foe = battle.p2.active[0];
		foe.hp = 1; foe.status = 'slp'; battle.fantasyRogue.caughtSpecies = 31;
		const thresholds = captureThresholds(45, foe.maxhp, 1, 'slp', 1, 31);
		const shake = thresholds.shake / 65536, critical = thresholds.critical / 256;
		const expected = critical * shake + (1 - critical) * shake ** 4;
		battle.randomChance = () => { throw new Error('Preview must not consume RNG'); };
		assert.equal(rogueCaptureChance(battle, ball), expected); assert(expected > full);
		assert.equal(rogueCaptureChance(battle, { ...ball, chance: 0.5 }), 0.5);
		battle.p1.emitRequest(battle.p1.activeRequest); battle.p2.emitRequest(battle.p2.activeRequest);
		const requests = messages.filter(([type]) => type === 'sideupdate').map(([, value]) => String(value));
		const player = requests.filter(value => value.startsWith('p1\n|request|')).pop();
		assert.equal(JSON.parse(player.split('|request|')[1]).fantasyRogue.balls[0].chance, expected);
		assert(!JSON.parse(requests.filter(value => value.startsWith('p2\n|request|')).pop().split('|request|')[1]).fantasyRogue);
		foe.hp = 0; assert.equal(rogueCaptureChance(battle, ball), null);
	});
	it('unlocks captured gender and legal moves while excluding moves the starter cannot learn', () => {
		cmd('start', { starters: ['bulbasaur'] }); cmd('select', { value: 'wild0' }); cmd('battle');
		const ticket = account().run.battle;
		const captured = createRoguePokemon({ ...set('Venusaur', 'Overgrow', 50, ['Solar Beam', 'Earthquake']), gender: 'F' }, stats(0), ticket.encounterId);
		engine.capture(user, ticket.token, captured);
		assert.deepEqual(account().starterTraits.bulbasaur.genders, ['F']);
		assert(account().starterTraits.bulbasaur.moves.includes('solarbeam'));
		assert(!account().starterTraits.bulbasaur.moves.includes('earthquake'));
		engine.recover(user, ticket.token); cmd('abandon');
		const build = { nature: 'random', gender: 'F', ivs: stats(20), moves: ['solarbeam', 'tackle'] };
		assert.throws(() => cmd('start', { starters: ['bulbasaur'], starterBuilds: { bulbasaur: { ...build, gender: 'M' } } }), /性别/);
		assert.throws(() => cmd('start', { starters: ['bulbasaur'], starterBuilds: { bulbasaur: { ...build, moves: ['earthquake'] } } }), /招式/);
		assert.throws(() => cmd('start', { starters: ['bulbasaur'], starterBuilds: { bulbasaur: { ...build, moves: ['tackle', 'tackle'] } } }), /招式/);
		cmd('start', { starters: ['bulbasaur'], starterBuilds: { bulbasaur: build } });
		assert.equal(account().run.team[0].set.gender, 'F');
		assert.deepEqual(account().run.team[0].set.moves, ['solarbeam', 'tackle']);
	});
	it('persists level-up learned moves for the next run even after replacement and abandonment', () => {
		cmd('start', { starters: ['bulbasaur'] });
		store.change(user, saved => { saved.run.bag.expcandys = 1; });
		cmd('use', { value: 'expcandys', member: account().run.team[0].id });
		while (account().run.pendingMoves?.length) {
			const pending = account().run.pendingMoves[0];
			cmd('learn', { member: pending.member, value: '0' });
		}
		const moves = account().starterTraits.bulbasaur.moves.slice();
		assert(moves.length > engine.content.starters[0].set.moves.length);
		cmd('abandon');
		assert.deepEqual(account().starterTraits.bulbasaur.moves, moves);
	});
});
