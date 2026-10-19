'use strict';
const { commandAfterOpening } = require('../fixtures/fantasy-rogue');
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { ROGUE_STORY, ROGUE_START_CARDS, storyView, cardBiasedSpecies } = require('../../dist/server/fantasy-rogue/story');
const { recordClear } = require('../../dist/server/fantasy-rogue/legacy');
const { buildRogueDuelState } = require('../../dist/server/fantasy-rogue/duels');
const { Battle } = require('../../dist/sim/battle');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { activeRogueSpirits, rogueSpirit } = require('../../dist/sim/fantasy-rogue-spirits');
const { set, stats } = require('../fixtures/fantasy-rogue');
const { PRNG } = require('../../dist/sim/prng');
const { prepareSpiritNode } = require('../../dist/server/fantasy-rogue/spirits');
const { createBiomeRoutes } = require('../../dist/server/fantasy-rogue/biome-routes');
const { MajorLegendaryPool } = require('../../dist/server/fantasy-rogue/biome-pools');

describe('Fantasy Rogue story and legacy cards', function () {
	this.timeout(15000);
	let store, engine;
	const user = 'storytester';
	const account = () => store.get(user);
	const cmd = (action, extra = {}) => commandAfterOpening(engine, user, { id: randomUUID(), revision: account().revision, action, ...extra });
	const view = () => storyView(account(), true, engine.localSpirits);
	const advance = () => cmd('storynext', { value: view().key });
	const skip = () => cmd('storyskip', { value: view().key });
	beforeEach(() => {
		store = new RogueStore(':memory:');
		engine = new RogueEngine(store, { ...createPreviewContent(), story: true }, () => 0);
	});
	afterEach(() => store.close());
	function readOpening() { for (let n = 0; n < ROGUE_STORY.opening.length; n++) advance(); }
	function start() {
		readOpening(); cmd('start', { starters: ['bulbasaur'] });
		while (view()?.key) advance();
		cmd('startcard', { value: 'electric' });
		while (view()?.key) advance();
	}
	function complete() {
		store.change(user, a => {
			a.run.floor = 200; a.run.phase = 'choose';
			delete a.run.choices; delete a.run.node;
		});
		cmd('select', { value: 'boss' });
		while (view()?.stage === 'bossintro') advance();
		cmd('battle');
		const run = account().run;
		const result = { encounterId: run.battle.encounterId, won: true, team: run.team, bag: run.bag };
		engine.settle(user, run.battle.token, result);
		engine.settle(user, run.battle.token, result);
		assert.equal(view().stage, 'interlude'); skip();
		if (account().run.phase === 'postgame') { skip(); cmd('godchallenge', { value: 'decline' }); }
	}
	it('requires the first prologue, persists every page, and makes repeated requests idempotent', () => {
		assert.throws(() => cmd('start', { starters: ['bulbasaur'] }), /开场/);
		assert.throws(skip, /首次/);
		const request = { id: randomUUID(), revision: 0, action: 'storynext', value: view().key };
		engine.command(user, request); engine.command(user, request);
		assert.equal(view().index, 1);
		assert.throws(() => cmd('storynext', { value: request.value }), /进度/);
		engine.migrate(user); assert.equal(view().index, 1);
		for (let n = 1; n < ROGUE_STORY.opening.length; n++) advance();
		cmd('start', { starters: ['bulbasaur'] });
		assert.equal(account().run.phase, 'story'); assert(!account().run.choices);
		assert.throws(skip, /首次/);
		while (view()?.key) advance();
		assert.equal(view().stage, 'cards'); assert.equal(view().cards.length, 19);
		assert.throws(() => cmd('startcard', { value: 'bad' }), /卡片/);
		cmd('startcard', { value: 'fire' });
		assert.equal(view().stage, 'portal');
		while (view()?.key) advance();
		assert.equal(account().run.phase, 'choose');
		assert.equal(account().run.startCard, 'fire');
		assert.throws(() => cmd('startcard', { value: 'water' }), /卡片/);
		const choices = account().run.choices;
		engine.migrate(user); assert.deepEqual(account().run.choices, choices);
	});
	it('allows second-run and local skips without bypassing spirit or card decisions', () => {
		engine = new RogueEngine(store, { ...createPreviewContent(), story: true }, () => 0, true);
		skip(); cmd('start', { starters: ['bulbasaur'], useSpirit: true, testSpirit: 'kyogre' });
		assert.equal(account().run.story.stage, 'spiritEffect');
		assert.throws(() => cmd('startcard', { value: 'all' }), /卡片/);
		cmd('spiritack'); assert.equal(view().stage, 'cards');
		cmd('startcard', { value: 'all' }); assert.equal(account().run.phase, 'choose');
		cmd('abandon');
		engine = new RogueEngine(store, { ...createPreviewContent(), story: true }, () => 0);
		skip(); cmd('start', { starters: ['bulbasaur'] });
		assert.equal(view().stage, 'cards');
	});
	it('shows the spirit apparition before effects and never retrofits an ongoing legacy adventure', () => {
		store.change(user, a => { a.spiritUnlocked = true; });
		readOpening(); cmd('start', { starters: ['bulbasaur'], useSpirit: true });
		assert.equal(view().stage, 'spirit');
		assert.throws(() => cmd('spiritack'), /剧情/);
		advance(); assert.equal(account().run.story.stage, 'spiritEffect');
		cmd('spiritack'); assert.equal(view().stage, 'climb');
		store.change(user, a => {
			delete a.run.story; a.run.phase = 'choose'; delete a.run.startCard;
		});
		engine.migrate(user);
		assert(!view()); assert(!account().run.startCard);
	});
	it('records a clear once, keeps it immutable, defaults to private, and reopens the next prologue', () => {
		start(); complete();
		assert.equal(account().cards.length, 1); assert.equal(view().stage, 'ending');
		const card = account().cards[0];
		assert.equal(card.snapshot.startCard, 'electric'); assert.deepEqual(card.snapshot.blessings, []);
		assert.equal(store.gallery().length, 0);
		store.change(user, a => { a.run.team[0].hp = 0; a.run.boosts.hp = 9; });
		engine.migrate(user); assert.deepEqual(account().cards[0], card);
		assert.throws(() => cmd('newstory'), /终章/);
		skip(); cmd('publishcard', { member: card.id, value: 'public' });
		assert.equal(store.gallery()[0].id, card.id);
		cmd('publishcard', { member: card.id, value: 'private' }); assert.equal(store.gallery().length, 0);
		cmd('newstory'); assert.equal(view().stage, 'opening'); assert(view().canSkip);
	});
	it('never overwrites one of three cards until an explicit replacement and blocks ownership spoofing', () => {
		start();
		store.change(user, a => {
			for (let i = 0; i < 3; i++) {
				a.run.id = randomUUID(); delete a.run.clearRecorded; recordClear(a, a.run);
			}
			a.run.id = randomUUID(); delete a.run.clearRecorded;
		});
		const previous = account().cards;
		complete(); assert.equal(account().cards.length, 3); assert(account().pendingClear);
		skip(); assert.throws(() => cmd('newstory'), /保存/);
		assert.throws(() => cmd('saveclear', { value: 'another-id' }), /替换/);
		assert.throws(() => cmd('publishcard', { member: 'another-id', value: 'public' }), /不属于/);
		const next = account().pendingClear;
		cmd('saveclear', { value: previous[1].id });
		assert.equal(account().cards.length, 3); assert.equal(account().cards[1].id, next.id);
		assert.equal(store.card(previous[1].id), undefined); assert(!account().pendingClear);
		cmd('newstory');
	});
	it('gently weights final-form types without inventing species or double-counting dual types', () => {
		assert.equal(ROGUE_START_CARDS.length, 19);
		const rng = new PRNG([12, 34, 56, 78]);
		const random = n => rng.random(n);
		let electric = 0;
		for (let i = 0; i < 20000; i++) {
			const name = cardBiasedSpecies(() => random(2) ? 'Pikachu' : 'Squirtle', 'electric', random);
			if (name === 'Pikachu') electric++;
		}
		assert(Math.abs(electric / 20000 - 5 / 9) < 0.015);
		for (let i = 0; i < 100; i++) assert.equal(cardBiasedSpecies(() => 'Squirtle', 'fire', random), 'Squirtle');
	});
	it('fills a freed collection slot without replacing another card or duplicating the pending clear', () => {
		start();
		store.change(user, a => {
			for (let i = 0; i < 3; i++) {
				a.run.id = randomUUID(); delete a.run.clearRecorded; recordClear(a, a.run);
			}
			a.run.id = randomUUID(); delete a.run.clearRecorded;
		});
		complete();
		const old = account().cards.map(card => card.id), pending = account().pendingClear.id;
		cmd('deletecard', { member: old[0] }); cmd('saveclear');
		assert.deepEqual(account().cards.map(card => card.id), [old[1], old[2], pending]);
		assert(!account().pendingClear); assert.equal(store.card(old[0]), undefined);
		assert.throws(() => cmd('saveclear'), /没有待保存/);
	});
	it('adds exactly one shiny roll per thousand only for catchable wild encounters', () => {
		for (const [spirit, base] of [[undefined, 2], ['hooh', 20]]) {
			for (const [startCard, limit] of [[undefined, base], ['all', base + 1], ['fire', base]]) {
				for (const roll of [limit - 1, limit]) {
					const node = { encounters: [
						{ catchable: true, team: [{ shiny: false }] },
						{ catchable: false, team: [{ shiny: false }] },
						{ catchable: true, trainer: { id: 'test' }, team: [{ shiny: false }] },
						{ catchable: true, team: [{ shiny: true }] },
					], reward: { items: {} } };
					prepareSpiritNode({ spiritVersion: 1, spirit, startCard }, node, {}, () => roll);
					assert.deepEqual(node.encounters.map(e => e.team[0].shiny), [roll < limit, false, false, true]);
				}
			}
		}
	});
	it('keeps the elite major-legendary branch exact even while the type card redraws candidates', () => {
		const template = { id: 'elite', name: '', kind: 'elite', encounters: [], reward: { money: 0, items: {} } };
		for (const spirit of [undefined, 'mew']) {
			for (const [floor, chance] of [[161, 25], [181, 50]]) {
				let majors = 0;
				for (let roll = 0; roll < 100; roll++) {
					let calls = 0;
					const random = max => {
						calls++;
						return calls === 2 ? roll : max === 5 ? 4 : 0;
					};
					const [route] = createBiomeRoutes(floor, [template], name => name, random, spirit, 'fire');
					assert(calls > 100, 'exercise rejected candidates inside the chosen branch');
					if (MajorLegendaryPool.includes(route.encounters[0].team[0].species)) majors++;
				}
				assert.equal(majors, chance + (spirit ? 25 : 0));
			}
		}
	});
});

describe('Fantasy Rogue archived PVP effects', function () {
	this.timeout(15000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function card(owner, spirit, stars = 1, boosts = stats(0)) {
		const team = [createRoguePokemon({ ...set('Bulbasaur', 'Overgrow', 40, ['Tackle', 'Synthesis']), happiness: 200 }, boosts, owner + ':mon', stars)];
		team[0].stars = stars;
		const account = {};
		recordClear(account, { id: randomUUID(), owner: { id: owner, name: owner }, team, boosts, bag: {}, money: 123,
			floor: 200, contentVersion: 'test', spirit, teraUnlocked: true, encounter: 1,
			node: { encounters: [{ spiritHazards: ['reflect', 'spikes'] }] } });
		return account.cards[0];
	}
	function begin(a, b) {
		const state = buildRogueDuelState(a, b);
		battle = new Battle({ formatid: 'gen9fantasyrogueduel', fantasyRogue: state,
			p1: { name: 'A', team: state.team.map(mon => mon.set) }, p2: { name: 'B', team: state.duel.team.map(mon => mon.set) } });
		battle.makeChoices('team 1', 'team 1');
		return state;
	}
	it('recreates both final stat blocks, star multipliers, abilities and base PP without mutating archives', () => {
		const a = card('a', 'zygarde', 4, stats(10)), b = card('b', 'zygarde', 2, stats(4));
		a.snapshot.team[0].hp = 0; a.snapshot.team[0].pp[0].pp = 0; a.snapshot.team[0].status = 'psn';
		const before = structuredClone(a);
		begin(a, b);
		for (const [side, saved] of [[battle.p1, a], [battle.p2, b]]) {
			assert.deepEqual({ ...side.pokemon[0].baseStoredStats, hp: side.pokemon[0].maxhp }, saved.snapshot.team[0].stats);
			assert.equal(side.pokemon[0].hp, side.pokemon[0].maxhp);
			assert.equal(side.pokemon[0].status, ''); assert.equal(side.pokemon[0].moveSlots[0].pp, 35);
			assert.equal(side.pokemon[0].ability, 'overgrow'); assert.equal(side.fantasyRogueTera, true);
			assert.equal(side.choose('rogueball pokeball'), false);
		}
		assert.deepEqual(a, before);
	});
	it('rejects spirit group mismatches, unimplemented blessings, stale rules and corrupted final stats', () => {
		const a = card('a'), b = card('b', 'kyogre');
		assert.throws(() => buildRogueDuelState(a, b), /相同塔灵/);
		delete b.snapshot.spirit;
		b.snapshot.blessings.push({ id: 'future', text: 'test' });
		assert.throws(() => buildRogueDuelState(a, b), /祝福/);
		b.snapshot.blessings = []; b.snapshot.team[0].stats.atk++;
		assert.throws(() => buildRogueDuelState(a, b), /最终数值/);
		b.rulesVersion = 'old'; assert.throws(() => buildRogueDuelState(a, b), /规则版本/);
	});
	for (const [spirit, expected] of [['darkrai', 40], ['regigigas', 20], [undefined, 20]]) {
		it(`applies direct damage effects symmetrically for ${spirit || 'no spirit'}`, () => {
			begin(card('a', spirit), card('b', spirit));
			for (const side of battle.sides) {
				const target = side.foe.active[0], before = target.hp;
				battle.damage(20, target, side.active[0], battle.dex.moves.get('tackle'));
				assert.equal(before - target.hp, expected);
			}
		});
	}
	it('restores Yveltal recovery for each player and inverse immunities for Giratina', () => {
		begin(card('a', 'yveltal'), card('b', 'yveltal'));
		for (const side of battle.sides) {
			const source = side.active[0]; source.hp -= 30;
			const before = source.hp;
			battle.runEvent('DamagingHit', side.foe.active[0], source, battle.dex.moves.get('tackle'), 20);
			assert.equal(source.hp - before, 10);
		}
		battle.destroy(); begin(card('a', 'malamar'), card('b', 'malamar'));
		assert.equal(battle.runEvent('NegateImmunity', battle.p1.active[0]), false);
		assert.equal(battle.singleEvent('Effectiveness', battle.format, null, battle.p1.active[0], 'Ghost', battle.dex.moves.get('tackle'), 0), 1);
	});
	it('preserves both Hoopa ally/foe pairs without randomizing or losing the opponent-facing effects', () => {
		const a = card('a', 'hoopamischief'), b = card('b', 'hoopamischief');
		a.snapshot.hazards = ['spikes', 'reflect'];
		b.snapshot.hazards = ['suilinggang', 'spikes'];
		begin(a, b);
		assert.equal(battle.p1.sideConditions.spikes.layers, 2);
		assert(battle.p2.sideConditions.suilinggang);
		assert.equal(battle.p2.sideConditions.reflect.duration, 5);
		assert.deepEqual(a.snapshot.hazards, ['spikes', 'reflect']);
	});
	for (const spirit of activeRogueSpirits()) {
		it(`restores ${spirit.name} in a real two-human simulator battle`, () => {
			begin(card('a', spirit.id), card('b', spirit.id));
			assert.equal(battle.fantasyRogue.spirit.id, spirit.id);
			if (spirit.weather) assert.equal(battle.field.weather, spirit.weather);
			if (spirit.terrain) assert.equal(battle.field.terrain, spirit.terrain);
			if (spirit.id === 'castform') assert(battle.field.weather || battle.field.terrain);
			if (spirit.id === 'tornadus') assert(battle.p1.sideConditions.tailwind && battle.p2.sideConditions.tailwind);
			if (spirit.id === 'hoopamischief') assert(battle.p1.sideConditions.reflect && battle.p2.sideConditions.reflect);
			if (spirit.id === 'zygardeorder') { assert.equal(battle.randomChance(1, 2), true); assert.equal(battle.randomChance(1, 3), false); }
			assert(rogueSpirit(spirit.id).enabled);
			battle.makeChoices('move 1', 'move 1'); assert(battle.turn >= 2);
		});
	}
});
