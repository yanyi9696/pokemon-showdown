'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Dex } = require('../../dist/sim/dex');
const { Battle } = require('../../dist/sim/battle');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { prepareTrade, tradeKind, shopStock } = require('../../dist/server/fantasy-rogue/trading');
const { rogueCodex } = require('../../dist/server/fantasy-rogue/codex');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { rogueBallMultiplier } = require('../../dist/sim/rogue-balls');
const { rogueCaptureChance, throwRogueBall } = require('../../dist/sim/fantasy-rogue');
const tracks = require('../../dist/server/fantasy-rogue/legendary-tracks');
const events = require('../../dist/server/fantasy-rogue/events');
const companions = require('../../dist/server/fantasy-rogue/companions');
const { assignedExtraAbilities } = require('../../dist/sim/rogue-blessing-permanent');
const { syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { stats, set, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue specialist shops, legend tracks and streamer companions', function () {
	this.timeout(20000);
	let content, battle, store;
	before(() => { content = createPreviewContent(); });
	afterEach(() => {
		battle?.destroy(); battle = null;
		store?.close(); store = null;
	});
	function run(floor = 51, kind = 'event') {
		const r = { id: 'market', floor, phase: 'event', money: 50000, bag: {}, boosts: stats(0), encounter: 0,
			team: [createRoguePokemon(set('Pikachu', 'Static', 40), stats(0))],
			node: { id: 'market-node', name: '测试', kind, encounters: [], reward: { money: 0, items: {} } } };
		syncBlessingParty(r); return r;
	}
	it('offers discounted balls from floor one, keeps stock on reload and gates scarce crowns', () => {
		for (const floor of [1, 51, 121, 199]) {
			const r = run(floor, 'trade'); r.node.trade = { kind: 'balls', stock: [], purchases: 0 };
			prepareTrade(r, content, () => 0);
			assert.equal(r.node.trade.stock.length, 24);
			assert(r.node.trade.stock.every(i => Dex.items.get(i.id).isPokeball));
			for (const item of r.node.trade.stock) {
				assert(item.price < content.items.find(i => i.id === item.id).price); assert.equal(item.remaining, 15);
			}
			const saved = structuredClone(r);
			prepareTrade(r, content, () => { throw new Error('rerolled'); }); assert.deepEqual(r, saved);
			r.node.trade = { kind: 'crowns', stock: [], purchases: 0 }; prepareTrade(r, content, () => 0);
			assert.equal(r.node.trade.stock.length, floor >= 121 ? 2 : 1);
		}
		assert.equal(tradeKind(1, () => 0), 'mushroom'); assert.equal(tradeKind(1, () => 10), 'balls');
		assert.notEqual(tradeKind(50, () => 30), 'crowns'); assert.equal(tradeKind(51, () => 30), 'crowns');
		const r = run(99, 'rest');
		for (const id of ['metronome', 'shellbell', 'covertcloak', 'clearamulet']) {
			const item = shopStock(content, r).find(i => i.id === id); assert(item); assert.equal(item.category, '对战影响道具');
		}
		r.floor = 98; assert(!shopStock(content, r).some(i => i.id === 'metronome'));
	});
	it('spends crowns once, protects maxed stats and rebuilds the chosen partner', () => {
		store = new RogueStore(':memory:'); const engine = new RogueEngine(store, content, () => 0), user = 'crownqa';
		const cmd = (action, more = {}) => commandAfterOpening(engine, user, { id: randomUUID(), revision: store.get(user).revision, action, ...more });
		cmd('start', { starters: ['bulbasaur'] });
		store.change(user, a => {
			a.run.phase = 'choose'; a.run.bag.bottlecap = 2;
			a.run.bag.goldbottlecap = 1; a.run.team[0].set.ivs = stats(20);
		});
		const manager = new RogueManager(engine);
		const oldAccess = Config.fantasyrogue; Config.fantasyrogue = { enabled: true, publicAccess: true };
		const publicState = manager.state({ id: user, named: true, registered: true, connected: true });
		Config.fantasyrogue = oldAccess;
		assert.equal(publicState.items.find(i => i.id === 'metronome').category, '对战影响道具');
		assert(!publicState.items.some(i => i.id.startsWith('roguetypeball')));
		const mon = store.get(user).run.team[0];
		assert.throws(() => cmd('use', { value: 'bottlecap', member: mon.id, slot: 6 }));
		cmd('use', { value: 'bottlecap', member: mon.id, slot: 1 });
		assert.equal(store.get(user).run.team[0].set.ivs.atk, 31);
		assert.equal(store.get(user).run.team[0].set.ivs.def, 20);
		assert.throws(() => cmd('use', { value: 'bottlecap', member: mon.id, slot: 1 }), /上限/);
		assert.equal(store.get(user).run.bag.bottlecap, 1);
		cmd('use', { value: 'goldbottlecap', member: mon.id });
		assert.deepEqual(store.get(user).run.team[0].set.ivs, stats(31)); assert.equal(store.get(user).run.bag.goldbottlecap, 0);
	});
	it('uses conditional ball multipliers for both advertised and actual capture, including heal balls', () => {
		const player = createRoguePokemon(set('Mew', 'Synchronize', 50), stats(0));
		const balls = content.items.filter(i => i.kind === 'ball').map(i => ({ id: i.id, name: i.name, multiplier: i.multiplier, rule: i.ballRule }));
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'balls', team: [player], boosts: stats(0), bag: { healball: 2 }, balls, catchable: true },
			p1: { team: [player.set] }, p2: { team: [set('Magikarp', 'Swift Swim', 20)] } });
		battle.makeChoices('team 1', 'team 1');
		const ball = id => balls.find(b => b.id === id), target = battle.p2.active[0];
		target.setType('Bug'); assert.equal(rogueBallMultiplier(battle, ball('netball')), 3.5);
		target.setType('Fire'); assert.equal(rogueBallMultiplier(battle, ball('netball')), 1);
		target.setType('Water'); assert.equal(rogueBallMultiplier(battle, ball('netball')), 3.5);
		assert(rogueCaptureChance(battle, ball('netball')) > rogueCaptureChance(battle, ball('pokeball')));
		assert.equal(rogueBallMultiplier(battle, ball('quickball')), 5); battle.turn = 2;
		assert.equal(rogueBallMultiplier(battle, ball('quickball')), 1); battle.turn = 11;
		assert.equal(rogueBallMultiplier(battle, ball('timerball')), 4);
		target.status = 'slp'; target.hp = 1;
		assert.equal(rogueBallMultiplier(battle, ball('dreamball')), 4);
		battle.randomChance = () => true; throwRogueBall(battle, 'healball');
		assert.equal(battle.fantasyRogue.captured.hp, battle.fantasyRogue.captured.maxhp);
		assert.equal(battle.fantasyRogue.captured.status, ''); assert(battle.fantasyRogue.captured.pp.every(m => m.pp === m.maxpp));
		assert(battle.fantasyRogue.caughtSpeciesIds.includes('magikarp'));
		assert.equal(rogueBallMultiplier(battle, ball('repeatball')), 3.5);
	});
	it('scales the rare pool, registers every target for capture and supports success and disappearance', () => {
		assert.equal(tracks.legendaryTrackPool(50).length, 0);
		assert(tracks.legendaryTrackPool(101).length > tracks.legendaryTrackPool(51).length);
		for (const tag of ['Sub-Legendary', 'Restricted Legendary', 'Mythical', 'Ultra Beast', 'Paradox']) {
			assert(tracks.legendaryTrackPool(151).some(e => Dex.species.get(e.species).tags.includes(tag)), tag);
		}
		for (const entry of tracks.legendaryTrackPool(199)) assert(content.unlocks[Dex.toID(entry.species)], entry.species);
		const r = run(); tracks.beginLegendaryTracks(r, () => 0); const saved = JSON.stringify(r);
		tracks.legendaryTracksView(r); assert.equal(JSON.stringify(r), saved);
		events.chooseEventOption({}, r, content, () => 99, r.node.event.key, 'investigate');
		assert(!events.eventView(r).options.some(o => o.id === 'leave'));
		const old = r.node.event.key; events.chooseEventOption({}, r, content, () => 0, old, 'site:0');
		assert.equal(r.phase, 'ready'); assert(r.node.encounters[0].catchable);
		assert.throws(() => events.chooseEventOption({}, r, content, () => 0, old, 'site:0'));
		tracks.settleLegendaryTracks(r, true); assert(r.node.event.settled);
		const fail = run(); tracks.beginLegendaryTracks(fail, () => 0); tracks.chooseLegendaryTracks(fail, 'investigate', () => 0);
		tracks.chooseLegendaryTracks(fail, 'site:1', () => 0); assert(fail.node.event.settled); assert.equal(fail.node.encounters.length, 0);
	});
	it('counts one preference per story, pays once, and accumulates 25% without doubling small drops', () => {
		const r = run(); companions.grantCompanion(r, 'iono');
		const c = r.blessings.companions[0]; c.ability = 'galvanize';
		assert(assignedExtraAbilities(r.team[0], r.team, r.blessings).includes('galvanize'));
		const options = [{ id: 'investigate', name: '探索' }, { id: 'fight', name: '对战' }];
		for (let i = 0; i < 26; i++) {
			r.node.event = { id: 'exclusiveclue', key: 'story' + i, stage: 'choice' };
			companions.recordCompanionPreference(r, options, 'fight', () => 0);
			r.node.event.key += 'branch'; companions.recordCompanionPreference(r, options, 'fight', () => 0);
		}
		assert(companions.companionView(r, options)[0].smile);
		assert.equal(c.preferences, 26); assert.deepEqual(r.trainerBonds.iono.gifts, [50]); assert.equal(r.bag.magnet, 1);
		r.bag.potion = 0;
		for (let i = 0; i < 10; i++) {
			const before = { money: r.money, bag: { ...r.bag }, shards: r.blessings.shards };
			r.money += 100; r.bag.potion++; r.blessings.shards++;
			companions.boostCompanionEventRewards(r, before);
		}
		assert.equal(r.bag.potion, 12); assert.equal(c.rewardRemainder.potion, 5);
		r.node.kind = 'trade'; r.node.event.key = 'auction'; r.node.event.companionKey = 'auction';
		companions.recordCompanionPreference(r, options, 'investigate', () => 0); assert.equal(c.preferences, 26);
		const before = { money: r.money, bag: { ...r.bag } }; r.bag.potion += 10;
		companions.boostCompanionEventRewards(r, before); assert.equal(r.bag.potion, 22);
	});
	it('boosts loot and completion money inside a recommended event, but never pays a battle twice', () => {
		store = new RogueStore(':memory:'); const engine = new RogueEngine(store, content, () => 0), user = 'streamerlootqa';
		const cmd = (action, more = {}) => commandAfterOpening(engine, user, { id: randomUUID(), revision: store.get(user).revision, action, ...more });
		cmd('start', { starters: ['bulbasaur'] });
		store.change(user, a => {
			a.run.floor = 51; a.run.phase = 'ready'; a.run.encounter = 0;
			companions.grantCompanion(a.run, 'iono');
			a.run.node = { id: 'tracks', kind: 'event', name: '足迹', reward: { money: 0, items: {} },
				event: { id: 'legendarytracks', key: 'track', stage: 'battle', streamerBonus: 'iono',
					tracks: { species: 'Articuno', answer: 0, tried: [], sites: ['山巅'] } },
				encounters: [{ key: 'wild', name: '身影', catchable: true, team: [set('Articuno', 'Pressure', 26)] }],
				wildLoot: [{ potion: 10 }] };
		});
		cmd('battle'); const before = store.get(user).run;
		const result = { encounterId: before.battle.encounterId, won: true, team: before.team, bag: before.bag };
		engine.settle(user, before.battle.token, result);
		assert.equal(store.get(user).run.bag.potion, (before.bag.potion || 0) + 12);
		assert.equal(store.get(user).run.lastReward.items.potion, 12);
		const after = store.get(user); engine.settle(user, before.battle.token, result); assert.deepEqual(store.get(user), after);
		const aidRun = structuredClone(after.run); require('../../dist/server/fantasy-rogue/early-balance').grantEventTraining(aidRun);
		const expected = aidRun.money - after.run.money;
		cmd('continue'); assert.equal(store.get(user).run.money, after.run.money + Math.floor(expected * 1.25));
	});
	it('lists auction only under trade and preserves an older auction discovery', () => {
		const rows = rogueCodex({ discoveries: { events: ['auction'], blessings: [] } }, 'events').entries;
		assert(!rows.some(e => e.id === 'auction'));
		const row = rows.find(e => e.id === 'trade:auction'); assert.equal(row.name, '落槌之前'); assert(row.unlocked && row.replay);
		assert(blessing('catcher').text.includes('1.5 倍')); assert(!blessing('catcher').text.includes('50%'));
	});
});
