'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {Battle} = require('../../dist/sim/battle');
const {Dex} = require('../../dist/sim/dex');
const {blessing, ROGUE_BLESSINGS} = require('../../dist/sim/rogue-blessing-data');
const {blessingSpeciesID, rogueStarterSlotCost} = require('../../dist/sim/rogue-species-identity');
const {strongestBlessingMember} = require('../../dist/sim/rogue-blessing-permanent');
const {lateBloomerSynergy} = require('../../dist/sim/rogue-late-bloomers');
const {createRoguePokemon, initializeExperience, rebuildMember} = require('../../dist/server/fantasy-rogue/progression');
const {experienceAtLevel, rogueSpeciesData} = require('../../dist/sim/fantasy-rogue-rules');
const {syncBlessingParty, blessingExperience, handleBlessingCommand, blessingCandidates} = require('../../dist/server/fantasy-rogue/blessings');
const {changeFriendship} = require('../../dist/server/fantasy-rogue/friendship');
const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {nextShopGrade, recordShoppingSpend} = require('../../dist/server/fantasy-rogue/shopping-upgrade');
const {shopStock, prepareTrade} = require('../../dist/server/fantasy-rogue/trading');
const {catchupRoutes, dueCatchup, lateRewardScale} = require('../../dist/server/fantasy-rogue/late-support');
const {prepareRewardScene, chooseReward, rewardRecovery} = require('../../dist/server/fantasy-rogue/reward-scenes');
const {journeyGrowthAmount, personalRewardGrowth, grantJourneyGrowth} = require('../../dist/server/fantasy-rogue/growth');
const {rogueCodex} = require('../../dist/server/fantasy-rogue/codex');
const {stats, set, content, commandAfterOpening} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue late support and species blessings', function () {
	this.timeout(60000);
	let battle, preview;
	before(() => { preview = createPreviewContent(); });
	afterEach(() => { battle?.destroy(); battle = null; });
	function run(ids = [], names = ['Hydreigon', 'Bulbasaur']) {
		const r = {id: 'late', floor: 81, phase: 'ready', bag: {}, money: 30000, boosts: stats(0), notices: [], caught: [],
			team: names.map(name => createRoguePokemon(set(name, Dex.mod('gen9fantasy').species.get(name).abilities[0], 50, ['Splash', 'Dark Pulse', 'Flamethrower', 'Thunderbolt']), stats(0)))};
		syncBlessingParty(r); r.blessings.owned = ids.map(id => ({...blessing(id), floor: 1})); syncBlessingParty(r); return r;
	}
	function begin(r) {
		battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: {encounterId: 'late-test', team: structuredClone(r.team), blessings: structuredClone(r.blessings), boosts: stats(0), bag: {}, balls: [], catchable: false},
			p1: {team: r.team.map(p => p.set)}, p2: {team: [set('Blissey', 'Natural Cure', 100, ['Splash'])]}});
		battle.makeChoices('team 1', 'team 1'); battle.randomizer = n => n; return battle.p1.active[0];
	}
	it('charges legendary slots only when choosing starters and includes Fantasy identities', () => {
		for (const name of ['Pikachu', 'Kartana', 'Iron Valiant']) assert.equal(rogueStarterSlotCost(name), 1, name);
		for (const name of ['Mew', 'Zapdos', 'Zeraora', 'Mew-Fantasy']) assert.equal(rogueStarterSlotCost(name), 4, name);
		for (const name of ['Mewtwo', 'Kyogre', 'Zacian', 'Cosmog', 'Regigigas']) assert.equal(rogueStarterSlotCost(name), 6, name);
		const store = new RogueStore(':memory:'), c = content(), engine = new RogueEngine(store, c, () => 0), user = 'slots';
		try {
			store.change(user, a => {a.slots = 4; a.unlocked.push('mew'); a.captures.mew = 10;});
			const command = () => ({id: randomUUID(), revision: store.get(user).revision, action: 'start', starters: ['mew', 'bulbasaur']});
			assert.throws(() => engine.command(user, command()), /名额/);
			store.change(user, a => {a.slots = 5;}); commandAfterOpening(engine, user, command());
			assert.equal(store.get(user).run.team.length, 2);
		} finally {store.close();}
	});
	it('selects the strongest ordinary or Fantasy form through a single species identity', () => {
		for (const name of ['Hydreigon', 'Excadrill', 'Zangoose', 'Melmetal', 'Meloetta', 'Golduck']) {
			const fantasy = Dex.mod('gen9fantasy').species.get(name + '-Fantasy'); if (!fantasy.exists) continue;
			assert.equal(blessingSpeciesID(fantasy.name), blessingSpeciesID(name));
			const r = run([], [name, fantasy.name]); r.team[1].set.level = 51;
			assert.equal(strongestBlessingMember(r.team, name).id, r.team[1].id);
		}
	});
	it('retains early growth and increases late rewards without stepping backwards', () => {
		assert.equal(journeyGrowthAmount(39), 0); assert.equal(journeyGrowthAmount(40), 115); assert.equal(journeyGrowthAmount(80), 115);
		for (let f = 81; f <= 200; f++) {
			assert(journeyGrowthAmount(f) >= journeyGrowthAmount(f - 1)); assert(personalRewardGrowth(f) >= personalRewardGrowth(f - 1));
			assert(lateRewardScale(f) >= lateRewardScale(f - 1));
		}
		const r = run(); r.node = {kind: 'trainer'}; r.journeyGrowth = {offense: 2000, defense: 2000};
		grantJourneyGrowth(r, () => 0); assert(r.journeyGrowth.offense > 2000);
		assert(!rewardRecovery(80).ether); assert.equal(rewardRecovery(81).ether, 1); assert.equal(rewardRecovery(141).elixir, 1);
	});
	it('keeps catch-up available when skipped and consumes it only after a persisted reward claim', () => {
		let r = run(); r.floor = 80; r.catchupCheckpoint = 58;
		const routes = [{id: 'rival', kind: 'event'}, {id: 'wild', kind: 'wild'}, {id: 'shop', kind: 'trade'}], reward = {id: 'gift', kind: 'reward'};
		assert.deepEqual(catchupRoutes(r, routes, [reward]), routes);
		r.floor = 82; assert.equal(dueCatchup(r), 82);
		assert.deepEqual(catchupRoutes(r, routes, [reward]).map(n => n.id), ['rival', 'wild', 'gift']);
		r.floor = 84; r.phase = 'reward'; r.node = structuredClone(reward); prepareRewardScene(r, () => 99);
		assert.equal(r.node.rewardScene.id, 'catchup'); assert.equal(r.catchupCheckpoint, 58);
		r = structuredClone(r);
		// Floor 84's catch-up target is 54: do not turn the lesson into over-level farming.
		chooseReward(r, preview, () => 0, 'catchup'); assert.deepEqual(r.team.map(p => p.set.level), [54, 54]);
		assert.equal(r.catchupCheckpoint, 82); assert(!dueCatchup(r)); assert.throws(() => chooseReward(r, preview, () => 0, 'catchup'));
		r.floor = 96; assert.equal(dueCatchup(r), 96);
	});
	it('opens exactly the next shop grade with standard prices and supplies proper late PP items', () => {
		const plain = run(), upgraded = run(['shoppingupgrade']); plain.floor = upgraded.floor = 49;
		plain.node = upgraded.node = {kind: 'rest'};
		assert.equal(nextShopGrade(plain, [30, 50, 100, 150]), 49); assert.equal(nextShopGrade(upgraded, [30, 50, 100, 150]), 50);
		const stock = shopStock(preview, upgraded), ordinary = shopStock(preview, plain);
		assert(stock.some(i => i.id === 'expcandym')); assert(!ordinary.some(i => i.id === 'expcandym'));
		for (const item of stock) { const before = ordinary.find(i => i.id === item.id); if (before) assert.equal(item.price, before.price); }
		plain.floor = 81; assert(shopStock(preview, plain).some(i => i.id === 'maxether' && i.amount >= 999));
		plain.floor = 141; assert(shopStock(preview, plain).some(i => i.id === 'maxelixir' && !i.singleMove));
		upgraded.node = {kind: 'trade', trade: {kind: 'candy', stock: [], purchases: 0}}; prepareTrade(upgraded, preview, () => 0);
		assert(upgraded.node.trade.stock.some(i => i.id === 'expcandym'));
	});
	it('pays repeated shopping XP intervals, retaining progress across save reloads', () => {
		let r = run(['shoppingupgrade'], ['Bulbasaur']); const mon = r.team[0]; initializeExperience(mon);
		const before = mon.experience, growth = rogueSpeciesData(mon.set.species).growth;
		const bonus = Math.floor((experienceAtLevel(growth, 51) - experienceAtLevel(growth, 50)) / 4);
		recordShoppingSpend(r, 2999); assert.equal(mon.experience, before); recordShoppingSpend(r, 1); assert.equal(mon.experience, before + bonus);
		r = structuredClone(r); recordShoppingSpend(r, 6000); assert.equal(r.team[0].experience, before + bonus * 3);
		assert.equal(r.shoppingSpend.rewards, 3); recordShoppingSpend(r, -100); assert.equal(r.shoppingSpend.total, 9000);
	});
	it('records real store and camp purchases once, not selling or HP payments', () => {
		const store = new RogueStore(':memory:'), c = content(), user = 'shopping';
		c.items.push({id: 'potion', name: '伤药', kind: 'heal', price: 100, shopFloor: 1, amount: 20});
		c.items.push({id: 'nugget', name: '金珠', kind: 'treasure', price: 0, shopFloor: false, sellPrice: 100});
		const engine = new RogueEngine(store, c, () => 0);
		const cmd = (action, data = {}) => engine.command(user, {id: randomUUID(), revision: store.get(user).revision, action, ...data});
		try {
			commandAfterOpening(engine, user, {id: randomUUID(), revision: store.get(user).revision, action: 'start', starters: ['bulbasaur']});
			store.change(user, a => {Object.assign(a.run, {floor: 81, phase: 'rest', money: 30000, node: {kind: 'rest'}}); syncBlessingParty(a.run); a.run.blessings.owned = [{...blessing('shoppingupgrade'), floor: 1}];});
			const purchase = {id: randomUUID(), revision: store.get(user).revision, action: 'buy', value: 'potion', count: 30};
			engine.command(user, purchase); assert.equal(store.get(user).run.shoppingSpend.total, 3000);
			engine.command(user, purchase); assert.equal(store.get(user).run.shoppingSpend.total, 3000);
			store.change(user, a => {a.run.pendingMoves = []; a.run.bag.nugget = 1;});
			cmd('sell', {value: 'nugget', count: 1}); assert.equal(store.get(user).run.shoppingSpend.total, 3000);
			store.change(user, a => {a.run.spirit = 'yveltal';});
			cmd('buyhp', {value: 'potion', member: store.get(user).run.team[0].id}); assert.equal(store.get(user).run.shoppingSpend.total, 3000);
			store.change(user, a => {delete a.run.spirit; a.run.floor = 81; a.run.node = {kind: 'trade', trade: {kind: 'growth', stock: [], purchases: 0}};});
			cmd('buygrowth', {value: 'master', trainingMembers: [store.get(user).run.team[0].id], trainingStats: ['atk']});
			assert.equal(store.get(user).run.shoppingSpend.total, 3450);
		} finally {store.close();}
	});
	it('only upgrades when the chosen gifted pseudo-legend reaches its final evolution', () => {
		const r = run([], ['Hydreigon']); r.floor = 1; const account = {run: r, captures: {}, unlocked: []};
		r.phase = 'blessing'; r.blessings.round = {floor: 1, tier: 'gold', remaining: 1, options: [{id: 'youngprodigy', refreshes: 1, chosen: false}], familiesSeen: ['youngprodigy']};
		handleBlessingCommand(account, r, preview, {action: 'blessing', slot: 0}, () => 0);
		const pending = r.blessings.pending.find(p => p.blessing === 'youngprodigy'); assert.equal(pending.options.length, 10);
		handleBlessingCommand(account, r, preview, {action: 'blessingreward', member: pending.id, value: 'Gible'}, () => 0);
		const gift = r.blessings.pending.find(p => p.kind === 'gift');
		handleBlessingCommand(account, r, preview, {action: 'blessingreward', member: gift.id, value: 'join'}, () => 0);
		const young = r.blessings.owned.find(b => b.family === 'youngprodigy'), gifted = r.team.find(p => p.id === young.target);
		assert(gifted); assert.equal(blessingSpeciesID(gifted.set.species), 'gible');
		assert.equal(blessingExperience(r, gifted), 2); assert.equal(blessingExperience(r, r.team[0]), 1);
		syncBlessingParty(r); assert(r.blessings.owned.some(b => b.family === 'youngprodigy'));
		const costs = [r.blessings.levels, r.blessings.bossLevels]; gifted.set.species = 'Garchomp'; gifted.set.level = 48;
		rebuildMember(gifted, r.boosts); syncBlessingParty(r);
		assert(r.blessings.owned.some(b => b.family === 'latebloom')); assert.equal(gifted.stars, 2);
		assert.deepEqual([r.blessings.levels, r.blessings.bossLevels], costs);
	});
	it('counts unique pseudo families, merges regional/Fantasy forms, and applies stats in native battle', () => {
		const r = run(['latebloom'], ['Gible', 'Beldum', 'Deino', 'Goomy', 'Dratini', 'Bagon']);
		const synergy = lateBloomerSynergy(r.team); assert.equal(synergy.count, 6);
		assert.deepEqual(synergy.stats, {atk: .26, def: .26, spa: .26, spd: .26, spe: .26});
		assert(r.team.every(p => p.stars === 2));
		const duplicates = run(['latebloom'], ['Goodra', 'Goodra-Hisui', 'Goodra-Fantasy']); assert.equal(lateBloomerSynergy(duplicates.team).count, 1);
		r.team[0].stars = 3; rebuildMember(r.team[0], r.boosts); syncBlessingParty(r); assert.equal(r.team[0].stars, 3);
		const p = begin(r); assert.equal(p.maxhp, r.team[0].maxhp);
		for (const stat of ['atk', 'def', 'spa', 'spd', 'spe']) assert.equal(p.storedStats[stat], r.team[0].stats[stat]);
	});
	it('keeps all six stats and friendship unchanged by type emissaries', () => {
		const ids = ROGUE_BLESSINGS.filter(b => b.family === 'emissary'); assert.equal(ids.length, 18);
		const grass = ids.find(b => b.type === 'Grass'), poison = ids.find(b => b.type === 'Poison');
		const plain = run([], ['Bulbasaur']), r = run([grass.id, poison.id], ['Bulbasaur']);
		for (const key of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) assert.equal(r.team[0].stats[key], plain.team[0].stats[key]);
		const mon = r.team[0]; mon.set.happiness = 100;
		changeFriendship(mon, 3, r); assert.equal(mon.set.happiness, 103);
		changeFriendship(mon, -3, r); assert.equal(mon.set.happiness, 100);
		const p = begin(r); assert.equal(p.maxhp, mon.maxhp);
		for (const stat of ['atk', 'def', 'spa', 'spd', 'spe']) assert.equal(p.storedStats[stat], mon.stats[stat]);
	});
	it('offers Ghidorah only with Hydreigon and preserves uncapped multiplicative resistance', () => {
		assert(!blessingCandidates(run([], ['Bulbasaur']), preview).some(b => b.id === 'ghidorah'));
		assert(blessingCandidates(run([], ['Hydreigon']), preview).some(b => b.id === 'ghidorah'));
		const r = run(['ghidorah']), p = begin(r);
		assert.deepEqual(p.getTypes(), ['???', 'Dragon']); assert(p.volatiles.rogueghidorah);
		assert.equal(p.runImmunity('Psychic'), false);
		const effectiveness = type => p.runEffectiveness(battle.dex.getActiveMove({name: 'Test', type, category: 'Special', basePower: 80}));
		assert.equal(effectiveness('Electric'), -2); // Dragon + Electric = one quarter.
		assert.equal(effectiveness('Fire'), -2);
		assert.equal(effectiveness('Fighting'), 0); assert.equal(effectiveness('Ground'), 0);
		assert.equal(effectiveness('Dragon'), 1); assert.equal(effectiveness('Ice'), 0); // Dragon weakness + Fire resistance.
		assert.equal(effectiveness('Fairy'), 0);
		p.addType('Grass'); assert.equal(effectiveness('Electric'), -3); // One eighth, no blessing-specific cap.
		const neutral = battle.dex.getActiveMove({name: 'Test', type: 'Normal', category: 'Special', basePower: 80});
		const electric = battle.dex.getActiveMove({name: 'Test', type: 'Electric', category: 'Special', basePower: 80});
		const attacker = battle.p2.active[0]; attacker.setType('Water');
		// Remove STAB for the comparison and measure actual engine damage, including integer rounding.
		neutral.stab = 1; electric.stab = 1;
		const full = battle.actions.getDamage(attacker, p, neutral), reduced = battle.actions.getDamage(attacker, p, electric);
		assert(Math.abs(reduced - Math.floor(full / 8)) <= 1, `${full} -> ${reduced}`);
		battle.fantasyRogue.blessings.evolution = {type: 'Dragon', defense: {Electric: -4}, offense: {}, stats: {}, power: 0, extras: []};
		assert.equal(effectiveness('Electric'), -7);
		attacker.boosts.spa = 6;
		const larger = battle.actions.getDamage(attacker, p, neutral), deeplyResisted = battle.actions.getDamage(attacker, p, electric);
		assert(Math.abs(deeplyResisted - Math.max(1, Math.floor(larger / 128))) <= 1, `${larger} -> ${deeplyResisted}`);
		delete battle.fantasyRogue.blessings.evolution;
		battle.makeChoices('move darkpulse', 'move splash'); assert.equal(p.getTypes()[0], 'Dark'); assert.equal(effectiveness('Electric'), -3);
		battle.makeChoices('move flamethrower', 'move splash'); assert.equal(p.getTypes()[0], 'Fire'); assert.equal(effectiveness('Ground'), -1); // Grass resistance still applies.
	});
	it('keeps first-type changes from adding accidental weaknesses in the inverse world', () => {
		const p = begin(run(['ghidorah'])); battle.fantasyRogue.spirit = {id: 'malamar'};
		const matchups = () => ['Electric', 'Fire', 'Ground', 'Fighting', 'Psychic', 'Dragon'].map(type =>
			p.runEffectiveness(battle.dex.getActiveMove({name: 'Test', type, category: 'Special', basePower: 80})));
		const initial = matchups();
		for (const move of ['darkpulse', 'flamethrower', 'thunderbolt']) {
			battle.makeChoices(`move ${move}`, 'move splash'); assert.deepEqual(matchups(), initial, move);
		}
	});
	it('uses only the strongest Hydreigon, resets its first type on re-entry and publishes all codex entries', () => {
		const r = run(['ghidorah'], ['Hydreigon', 'Hydreigon']); r.team[1].set.level = 51; rebuildMember(r.team[1], r.boosts); syncBlessingParty(r);
		const p = begin(r); assert(!p.volatiles.rogueghidorah);
		battle.makeChoices('switch 2', 'move splash'); const chosen = battle.p1.active[0]; assert(chosen.volatiles.rogueghidorah);
		battle.makeChoices('move thunderbolt', 'move splash'); assert.equal(chosen.getTypes()[0], 'Electric');
		battle.makeChoices('switch 2', 'move splash'); battle.makeChoices('switch 2', 'move splash'); assert.equal(chosen.getTypes()[0], '???');
		const entries = rogueCodex(undefined, 'blessings', true).entries;
		for (const b of ROGUE_BLESSINGS.filter(b => ['emissary', 'ghidorah', 'shoppingupgrade', 'youngprodigy', 'latebloom'].includes(b.family))) assert(entries.some(e => e.id === b.id), b.id);
	});
});
