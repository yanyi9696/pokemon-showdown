'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {stats, set, content} = require('../fixtures/fantasy-rogue');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
const {rogueCodex, codexContentVersion} = require('../../dist/server/fantasy-rogue/codex');
const {RIVALS} = require('../../dist/server/fantasy-rogue/rival-data');
const {BEGINNER_GUIDE} = require('../../dist/server/fantasy-rogue/beginner-guide');
const {needsOnboarding} = require('../../dist/server/fantasy-rogue/onboarding');
const {normalizeBlessings, syncBlessingParty, migrateGodrobeGift} = require('../../dist/server/fantasy-rogue/blessings');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {assignedExtraAbilities} = require('../../dist/sim/rogue-blessing-permanent');
const {blessing} = require('../../dist/sim/rogue-blessing-data');
const {grantCompanion, recordCompanionPreference} = require('../../dist/server/fantasy-rogue/companions');
const {TRAVELLERS} = require('../../dist/server/fantasy-rogue/traveller-profiles');
const t = require('../../dist/server/fantasy-rogue/travellers');
const {beginSocialEvent, socialCandidates, chooseSocialEvent, settleSocialEvent} = require('../../dist/server/fantasy-rogue/social-events');
const {beginRival, expireRival, chooseRival, rivalView} = require('../../dist/server/fantasy-rogue/rivals');
const {grantJourneyGrowth, syncGrowthParty} = require('../../dist/server/fantasy-rogue/growth');
const {opposingCompanion} = require('../../dist/server/fantasy-rogue/companion-rematches');
const {storyView} = require('../../dist/server/fantasy-rogue/story');
function run(floor = 60) {
	const r = {id: randomUUID(), floor, phase: 'event', team: [createRoguePokemon(set('Bulbasaur', 'Overgrow', 35), stats(0))],
		money: 1000, bag: {}, boosts: stats(0), encounter: 0, caught: [],
		node: {id: 'event', kind: 'event', name: '旅途', reward: {money: 20, items: {potion: 1}}, encounters: []}};
	normalizeBlessings(r);
	return r;
}
describe('Fantasy Rogue live catalogs, shared companion slots and additive rewards', function () {
	this.timeout(20000);
	it('generates all eight chapters per rival from the live roster with separate discovery and portraits', () => {
		const local = rogueCodex(undefined, 'events', true).entries;
		for (const [id, rival] of Object.entries(RIVALS)) {
			const chapters = local.filter(e => e.id.startsWith(`rival:${id}:`));
			assert.equal(chapters.length, 8, id);
			for (let i = 1; i <= 8; i++) {
				const e = chapters.find(c => c.id === `rival:${id}:${i}`);
				assert.equal(e.name, `与${rival.name}的相遇·其${'一二三四五六七八'[i - 1]}`);
				assert.equal(e.portrait, id); assert(e.replay && e.unlocked);
			}
		}
		const account = {discoveries: {events: ['rival:kieran:2'], trainers: [], blessings: []}};
		const visible = rogueCodex(account, 'events').entries.filter(e => e.category === 'adventure' && e.unlocked);
		assert.deepEqual(visible.map(e => e.id), ['rival:kieran:2']);
		assert(rogueCodex(account, 'events').entries.filter(e => !e.unlocked).every(e => !e.replay && e.text === '？？？'));
		const r = run(1); r.node.kind = 'adventure'; beginRival(r, () => 0);
		assert.equal(r.node.name, local.find(e => e.id === `rival:${r.rival.id}:1`).name);
		assert.match(codexContentVersion(), /^[a-f0-9]{16}$/);
		assert.equal(codexContentVersion(), codexContentVersion());
	});
	it('archives all recruitable people and the same guide used by onboarding', () => {
		const entries = rogueCodex(undefined, 'events', true).entries;
		for (const p of Object.values(TRAVELLERS)) {
			const e = entries.find(c => c.portrait === p.id && c.roles);
			assert(e && e.roles.includes('companion'), p.id);
			assert(e.text.includes('15') && e.text.includes(p.gifts[0].name), p.id);
		}
		assert.deepEqual(rogueCodex(undefined, 'guide').guide.beginner, BEGINNER_GUIDE);
		const account = {captures: {}, cards: [], adventures: 0};
		assert(needsOnboarding(account));
		account.onboardingSeen = true; assert(!needsOnboarding(account));
		delete account.onboardingSeen; account.run = run(); assert(!needsOnboarding(account));
		assert(BEGINNER_GUIDE.some(e => e.text.includes('乌栗与丹瑜各有一次')));
		assert(BEGINNER_GUIDE.some(e => e.text.includes('15 次偏好选择')));
	});
	it('shares two slots across blessing, rival, Carmine and event companions and preserves departed rewards', () => {
		const r = run(); r.rival = {id: 'kieran', affection: 9, completed: 4, lastFloor: 40, carmine: {affection: 8}};
		grantCompanion(r, 'liko'); const c = r.blessings.companions[0];
		c.ability = 'flowergift'; c.rewarded = true; c.preferences = 15; r.bag.miracleseed = 1;
		syncBlessingParty(r);
		t.requestCompanion(r, {id: 'kieran', origin: 'rival', until: 66});
		assert.equal(t.travellingRoster(r).length, 2);
		t.requestCompanion(r, {id: 'carmine', origin: 'carmine', until: 67});
		assert.equal(t.travellingRoster(r).length, 2); assert.equal(r.companionInvitations.length, 1);
		assert(assignedExtraAbilities(r.team[0], r.team, r.blessings).includes('flowergift'));
		r.phase = 'choose';
		t.chooseCompanionInvitation(r, r.companionInvitations[0].key, 'liko');
		assert(c.away && c.rewarded && c.preferences === 15);
		assert.equal(r.bag.miracleseed, 1);
		assert(!assignedExtraAbilities(r.team[0], r.team, r.blessings).includes('flowergift'));
		assert.equal(r.dialogue.resume, 'choose');
		assert.deepEqual(t.travellingRoster(r).map(c => c.id), ['kieran', 'carmine']);
		t.requestCompanion(r, {id: 'brock', origin: 'event'});
		const invite = r.companionInvitations[0];
		t.chooseCompanionInvitation(r, invite.key, 'kieran');
		assert(r.rival.away && r.rival.temporaryUsed);
		assert.equal(r.bag[TRAVELLERS.kieran.gifts[0].id], 1);
		assert.throws(() => t.chooseCompanionInvitation(r, invite.key, 'kieran'), /更新/);
		assert.equal(t.travellingRoster(r).length, 2);
		assert.equal(opposingCompanion(r, {id: 'brock'}), 'brock');
	});
	it('restores the interrupted preparation phase after the replacement farewell through saved commands', () => {
		const store = new RogueStore(':memory:'), engine = new RogueEngine(store, content(), () => 0), user = 'slots';
		const cmd = (action, extra = {}) => engine.command(user, {id: randomUUID(), revision: store.get(user).revision, action, ...extra});
		try {
			cmd('start', {starters: ['bulbasaur']});
			store.change(user, a => {
				a.run.phase = 'choose'; delete a.run.story; delete a.run.dialogue;
				t.requestCompanion(a.run, {id: 'brock', origin: 'event'});
				t.requestCompanion(a.run, {id: 'viola', origin: 'event'});
				t.requestCompanion(a.run, {id: 'sabrina', origin: 'event'});
			});
			const key = store.get(user).run.companionInvitations[0].key;
			assert.throws(() => cmd('battle'), /同行邀请/);
			const command = {id: randomUUID(), revision: store.get(user).revision, action: 'companioninvite', member: key, value: 'brock'};
			engine.command(user, command); const saved = store.get(user);
			engine.command(user, command); assert.deepEqual(store.get(user), saved);
			assert.equal(saved.run.phase, 'story');
			cmd('storyskip', {value: storyView(saved, true, true).key});
			assert.equal(store.get(user).run.phase, 'choose');
			assert.deepEqual(t.travellingRoster(store.get(user).run).map(c => c.id), ['viola', 'sabrina']);
		} finally { store.close(); }
	});
	it('migrates old over-cap parties by prompting, retaining progress and previously granted items', () => {
		const r = run(); r.blessings.companions = [{id: 'poppy', preferences: 12}];
		r.socialCompanions = [{id: 'brock', origin: 'event', preferences: 7, counted: []}, {id: 'viola', origin: 'event', preferences: 11, counted: []}];
		r.rival = {id: 'kieran', completed: 8, affection: 20, permanent: true, carmine: {affection: 12, permanent: true}};
		t.normalizeTravellers(r);
		assert.equal(t.travellingRoster(r).length, 2);
		assert.equal(r.companionInvitations.length, 3);
		assert.equal(r.socialCompanions.find(c => c.id === 'viola').preferences, 11);
		const before = JSON.stringify(r); t.normalizeTravellers(r); assert.equal(JSON.stringify(r), before);
	});
	it('counts permanent preferences once per choice and ignores temporary rivals', () => {
		const r = run(); t.requestCompanion(r, {id: 'brock', origin: 'event'});
		r.rival = {id: 'kieran', completed: 4, affection: 9};
		t.requestCompanion(r, {id: 'kieran', origin: 'rival', until: 66});
		const options = [{id: 'meet', name: '接近宝可梦', preference: 'pokemon'}, {id: 'fight', name: '认真对战', preference: 'battle'}];
		for (let i = 0; i < 15; i++) {
			r.node.event = {key: 'choice' + i, id: 'travellermeeting'};
			recordCompanionPreference(r, options, 'meet', () => 0);
			recordCompanionPreference(r, options, 'meet', () => 0);
		}
		assert.equal(r.socialCompanions[0].preferences, 15); assert.equal(r.bag.hardstone, 1);
		assert(!r.socialCompanions.some(c => c.id === 'kieran'));
		t.requestCompanion(r, {id: 'kieran', origin: 'rival', permanent: true});
		t.recordSocialPreference(r, options, 'fight', 'newchoice');
		assert.equal(r.socialCompanions.find(c => c.id === 'kieran').preferences, 1);
	});
	it('leaves ended adventures alone and retains names for preview-only companions in challenge dialogue', () => {
		for (const phase of ['complete', 'defeated', 'postgame']) {
			const r = run(); r.phase = phase;
			r.blessings.companions = ['poppy', 'iris', 'guzma'].map(id => ({id, preferences: 15, rewarded: true}));
			const before = JSON.stringify(r); t.normalizeTravellers(r); assert.equal(JSON.stringify(r), before);
		}
		const r = run(); grantCompanion(r, 'sada');
		r.node.encounters = [{name: '奥琳 AI', team: [set('Magikarp')]}];
		require('../../dist/server/fantasy-rogue/companion-rematches').deferCompanionChallenge(r, 'sada');
		assert(r.dialogue.pages.every(page => page.speaker === '奥琳 AI'));
	});
	it('lets Kieran and Carmine each join temporarily once, auto-pays farewell, and still permits permanent invitations', () => {
		const r = run(); r.rival = {id: 'kieran', completed: 4, affection: 8, lastFloor: 30, carmine: {affection: 8}};
		t.requestCompanion(r, {id: 'kieran', origin: 'rival', until: 61});
		assert(expireRival(r, 62)); assert(!expireRival(r, 62));
		assert.equal(r.bag[TRAVELLERS.kieran.gifts[0].id], 1);
		r.node.event = {id: 'rivalstory', key: 'invite', stage: 'choice', rival: {chapter: 5, step: 'invite'}};
		assert.deepEqual(rivalView(r).options.map(o => o.id), ['joincarmine', 'solo']);
		chooseRival(r, content(), () => 0, 'joincarmine');
		assert(r.rival.carmine.temporaryUsed); assert(!r.rival.temporaryUntil);
		r.floor = 66; expireRival(r);
		assert.equal(r.bag[TRAVELLERS.carmine.gifts[0].id], 1);
		t.requestCompanion(r, {id: 'kieran', origin: 'rival', permanent: true});
		assert(r.rival.permanent); assert.equal(t.travellingRoster(r).length, 1);
	});
	it('provides gift, recruitment and battle outcomes with a complete portrait-backed candidate list', () => {
		for (const mode of ['gift', 'invite', 'battle']) {
			const r = run(), pool = socialCandidates(r), id = mode === 'battle' ? 'flannery' : 'brock';
			assert(pool.some(p => p.id === id));
			beginSocialEvent(r, n => n === pool.length ? pool.findIndex(p => p.id === id) : 0);
			assert.equal(r.dialogue.pages[0].portrait, id);
			chooseSocialEvent(r, mode === 'battle' ? 'battle' : 'pokemon', () => 0);
			if (mode === 'battle') {
				assert.equal(r.phase, 'ready'); assert(r.node.encounters[0].team.length);
				r.team[0].hp = 0; settleSocialEvent(r, true);
				assert.equal(r.team[0].hp, r.team[0].maxhp);
				assert.equal(r.node.event.social.step, 'invite');
			} else {
				chooseSocialEvent(r, mode === 'invite' ? 'pokemon' : 'reward', () => 0);
				if (mode === 'gift') { assert.equal(r.bag.potion, 1); assert(r.node.event.settled); }
				else { chooseSocialEvent(r, 'join', () => 0); assert.equal(t.travellingRoster(r)[0].id, 'brock'); }
			}
		}
	});
	it('updates the blood robe recipient once while preserving a trained legacy Seviper and all inventory', () => {
		const r = run(), a = {captures: {}, unlocked: []}, config = createPreviewContent();
		r.team[0] = createRoguePokemon(set('Seviper', 'Shed Skin', 50), stats(0));
		r.team[0].training = {offense: 500}; normalizeBlessings(r); const old = JSON.stringify(r.team[0]);
		r.blessings.owned.push({...blessing('godrobe'), floor: 50});
		migrateGodrobeGift(a, r, config, () => 0);
		assert.equal(JSON.stringify(r.team[0]), old);
		assert.equal(r.blessings.pending[0].pokemon.set.species, 'Zangoose');
		const count = r.blessings.pending.length; migrateGodrobeGift(a, r, config, () => 0);
		assert.equal(r.blessings.pending.length, count);
		assert(!assignedExtraAbilities(r.team[0], r.team, r.blessings).includes('sharpness'));
		const cat = r.blessings.pending[0].pokemon; r.team.push(cat); syncBlessingParty(r);
		assert(assignedExtraAbilities(cat, r.team, r.blessings).includes('sharpness'));
	});
	for (const [floor, amount] of [[10, 50], [60, 75], [100, 100], [170, 150]]) {
		it(`adds ${amount / 100}% training at floor ${floor} without reducing or re-paying any existing reward`, () => {
			const r = run(floor); r.node.kind = 'elite'; r.team[0].hp -= 7; r.team[0].pp[0].pp = 1;
			r.lastReward = {floor, name: '获胜', money: 500, items: {expcandym: 2}, points: 0};
			const before = {bag: {...r.bag}, money: r.money, hp: r.team[0].hp, pp: r.team[0].pp[0].pp};
			grantJourneyGrowth(r, () => 0);
			assert.equal(r.growth.offense, amount);
			assert.deepEqual(r.bag, before.bag); assert.equal(r.money, before.money);
			assert.equal(r.team[0].hp, before.hp); assert.equal(r.team[0].pp[0].pp, before.pp);
			assert.equal(r.lastReward.money, 500); assert.equal(r.lastReward.items.expcandym, 2);
			assert.match(r.lastReward.effect, /额外获得/);
			const saved = JSON.parse(JSON.stringify(r));
			grantJourneyGrowth(saved, () => { throw Error('must not reroll'); });
			assert.equal(saved.growth.offense, amount);
			const late = createRoguePokemon(set('Pikachu', 'Static', 50), stats(0));
			saved.team.push(late); syncGrowthParty(saved);
			assert.equal(late.statModifiers.training.atk, amount / 10000);
		});
	}
	it('does not award free training for failed, skipped or trade events, and caps only this new bonus source', () => {
		for (const kind of ['wild', 'boss', 'trade']) {
			const r = run(); r.node.kind = kind;
			grantJourneyGrowth(r, () => 0); assert(!r.growth);
		}
		for (const event of [
			{settled: true, trainingAidBlocked: true}, {settled: true, journeyBattleWon: false}, {settled: false},
		]) {
			const r = run(); r.node.event = event; grantJourneyGrowth(r, () => 0); assert(!r.growth);
		}
		const r = run(180); r.journeyGrowth = {offense: 1990, defense: 2000};
		r.growth = {offense: 5000, defense: 6000, experience: 0}; r.node.kind = 'trainer';
		grantJourneyGrowth(r, () => 0); assert.equal(r.journeyGrowth.offense, 2000); assert.equal(r.growth.offense, 5010);
		r.node = {...r.node, journeyGrowthResolved: false};
		grantJourneyGrowth(r, () => 0); assert.equal(r.growth.offense, 5010);
	});
});
