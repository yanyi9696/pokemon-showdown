'use strict';
const assert = require('assert').strict;
const {Battle} = require('../../dist/sim/battle');
const {Dex} = require('../../dist/sim/dex');
const {blessing} = require('../../dist/sim/rogue-blessing-data');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {syncBlessingParty, completeBlessingFloor, blessingExperience, blessingView, handleBlessingCommand} = require('../../dist/server/fantasy-rogue/blessings');
const {editFusion} = require('../../dist/server/fantasy-rogue/fusion');
const {buyGrowth, growthOffers} = require('../../dist/server/fantasy-rogue/growth');
const {offerComeback, chooseComeback, completeComebackFloor, comebackExperience} = require('../../dist/server/fantasy-rogue/comeback');
const {coverageMoves, grantCoverage, claimCoverage} = require('../../dist/server/fantasy-rogue/coverage');
const {prepareRewardScene, chooseReward} = require('../../dist/server/fantasy-rogue/reward-scenes');
const {rogueCodex} = require('../../dist/server/fantasy-rogue/codex');
const {stats, set, content} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue October 22 balance and recovery', function () {
	this.timeout(30000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function run(families = [], sets = [set('Mew', 'Synchronize', 50, ['Splash'])]) {
		const r = {id: 'balance', floor: 51, phase: 'ready', team: sets.map(s => createRoguePokemon(s, stats(0))),
			bag: {}, money: 10000, boosts: stats(0), notices: [], startCard: 'Fire'};
		syncBlessingParty(r); r.blessings.owned = families.map(id => ({...blessing(id), floor: 1})); syncBlessingParty(r); return r;
	}
	it('makes Potara prismatic and accepts any three distinct base-stat sources', () => {
		assert.equal(blessing('potara').tier, 'prismatic');
		const keys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
		for (let a = 0; a < 4; a++) for (let b = a + 1; b < 5; b++) for (let c = b + 1; c < 6; c++) {
			const r = run(['potara'], [set('Scyther', 'Technician', 30), set('Charizard', 'Blaze', 60)]), [first, second] = r.team;
			const chosen = [keys[a], keys[b], keys[c]], command = {action: 'fusion', member: first.id, value: second.id, fusionAbility: 'blaze', appearance: first.id, fusionStats: chosen};
			assert.throws(() => editFusion(r, {...command, fusionStats: ['hp', 'hp', 'atk']}), /三项/);
			assert.equal(r.team.length, 2); editFusion(r, command);
			for (const key of keys) assert.equal(r.team[0].fusion.baseStats[key], Dex.mod('gen9fantasy').species.get(chosen.includes(key) ? 'Scyther' : 'Charizard').baseStats[key]);
		}
	});
	it('gives solo battle XP +50% and exactly one late level per two completed floors, across reloads', () => {
		let r = run(['sololeveling'], [set('Mew', 'Synchronize', 100, ['Splash'])]);
		assert.equal(blessingExperience(r, r.team[0]), 1.5);
		completeBlessingFloor({run: r}, r, content(), () => 0); assert.equal(r.team[0].set.level, 101);
		r.floor++; completeBlessingFloor({run: r}, r, content(), () => 0); assert.equal(r.team[0].set.level, 101);
		r = structuredClone(r); completeBlessingFloor({run: r}, r, content(), () => 0); assert.equal(r.blessings.soloLateFloors, 1);
		r.floor++; completeBlessingFloor({run: r}, r, content(), () => 0); assert.equal(r.team[0].set.level, 102);
	});
	it('shares entry stats with the bench, stacks on switches and resets in a new battle', () => {
		const r = run(['entrance'], [set('Mew', 'Synchronize', 50, ['Splash']), set('Mew', 'Synchronize', 50, ['Splash'])]);
		const begin = () => { battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: {encounterId: 'entry', team: r.team, blessings: r.blessings, boosts: stats(0), bag: {}, balls: [], catchable: false},
			p1: {team: r.team.map(p => p.set)}, p2: {team: [set('Mew', 'Synchronize', 50, ['Splash'])]}}); battle.makeChoices('team 12', 'team 1'); };
		begin(); const base = battle.p2.active[0].getStat('atk');
		assert.equal(battle.p1.pokemon[1].getStat('atk'), Math.floor(base * 1.05));
		battle.makeChoices('switch 2', 'move splash');
		for (const p of battle.p1.pokemon) for (const stat of ['atk', 'def', 'spa', 'spd', 'spe']) assert.equal(p.getStat(stat), Math.floor(base * 1.1));
		assert.equal(battle.p2.active[0].getStat('atk'), base);
		battle.destroy(); begin(); assert.equal(battle.p1.active[0].getStat('atk'), Math.floor(base * 1.05));
	});
	it('keeps sound tutoring independent, rejects non-sound/duplicate claims and admits later members', () => {
		const r = run(['sound', 'inheritmoves']); const account = {run: r, starterMoves: {}};
		const mon = r.team[0], entry = blessingView(r).soundLearning[0]; assert(entry.moves.length);
		assert.throws(() => handleBlessingCommand(account, r, content(), {action: 'learnbonus', member: mon.id, slot: 1, value: 'earthquake'}, () => 0), /声音/);
		handleBlessingCommand(account, r, content(), {action: 'learnbonus', member: mon.id, slot: 1, value: entry.moves[0]}, () => 0);
		assert(!blessingView(r).soundLearning.some(e => e.member === mon.id));
		assert(blessingView(r).learning.some(e => e.member === mon.id));
		// Explicit source selection must not silently consume the other blessing's opportunity.
		assert.throws(() => handleBlessingCommand(account, r, content(), {action: 'learnbonus', member: mon.id, slot: 1, value: entry.moves[1]}, () => 0));
		r.team.push(createRoguePokemon(set('Mew'), stats(0))); assert(blessingView(r).soundLearning.some(e => e.member === r.team[1].id));
	});
	it('applies the comeback card to own damage and defenses, without amplifying fixed damage or HP', () => {
		const {rogueEventDamage} = require('../../dist/sim/fantasy-rogue');
		const r = run([], [set('Mew', 'Synchronize', 50, ['Psychic', 'Seismic Toss'])]);
		battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: {encounterId: 'comeback', team: r.team, blessings: r.blessings, boosts: stats(0), bag: {}, balls: [], catchable: false, comebackCard: true},
			p1: {team: r.team.map(p => p.set)}, p2: {team: [set('Mew', 'Synchronize', 50, ['Splash'])]}});
		battle.makeChoices('team 1', 'team 1'); const own = battle.p1.active[0], foe = battle.p2.active[0];
		assert.equal(own.maxhp, foe.maxhp); assert.equal(own.getStat('atk'), foe.getStat('atk'));
		for (const stat of ['def', 'spd']) assert.equal(own.getStat(stat), Math.floor(foe.getStat(stat) * 1.25));
		assert.equal(rogueEventDamage(100, foe, own, battle.dex.moves.get('psychic')), 125);
		assert.equal(rogueEventDamage(100, own, foe, battle.dex.moves.get('psychic')), 100);
		assert.equal(rogueEventDamage(50, foe, own, battle.dex.moves.get('seismictoss')), 50);
	});
	it('charges batch camp price once, affects selected stats/partners only and cannot heal', () => {
		const r = run([], [set('Mew'), set('Charmander', 'Blaze')]); r.phase = 'rest'; r.node = {kind: 'trade', trade: {kind: 'growth', purchases: 0, stock: []}};
		const tiers = growthOffers(r); assert(tiers[2].amount / tiers[2].price > tiers[1].amount / tiers[1].price);
		const mon = r.team[0], before = {...mon.stats}; mon.hp = 0; mon.pp[0].pp = 1;
		const command = {value: 'master', trainingMembers: [mon.id], trainingStats: ['atk', 'spe']};
		buyGrowth(r, command); assert.equal(r.money, 9100); assert.equal(mon.stats.hp, before.hp);
		assert.equal(mon.stats.atk, Math.floor(before.atk * 1.15)); assert.equal(mon.stats.spe, Math.floor(before.spe * 1.15));
		assert.equal(mon.stats.def, before.def); assert.equal(mon.hp, 0); assert.equal(mon.pp[0].pp, 1); assert(!r.team[1].campTraining);
		assert.throws(() => buyGrowth(r, command), /已完成/); assert.equal(r.money, 9100);
	});
	it('preserves the elder opportunity after no, replaces the card only after yes and never revives', () => {
		const r = run(); r.team[0].hp = 0; r.bag.revive = 1;
		assert(offerComeback(r, content())); let key = r.comeback.pending.key;
		assert(!offerComeback(r, content())); chooseComeback(r, key, 'next'); chooseComeback(r, key, 'no'); chooseComeback(r, key, 'continue');
		assert(!r.comeback.accepted); assert.equal(r.startCard, 'Fire'); assert.equal(r.team[0].hp, 0);
		assert(offerComeback(r, content())); key = r.comeback.pending.key;
		assert.equal(r.comeback.pending.page, 1); chooseComeback(r, key, 'yes'); chooseComeback(r, key, 'continue');
		assert(!r.startCard); assert.equal(r.team[0].hp, 0); assert.equal(r.bag.revive, 1); assert.equal(r.money, 10000);
		assert(!offerComeback(r, content())); assert.equal(comebackExperience(r), 2);
	});
	it('pays noncombat experience once per floor and expires after ten inclusive floors', () => {
		const r = run(); r.comeback = {accepted: true, floor: 51, expires: 60, battleFloors: [52]};
		require('../../dist/server/fantasy-rogue/progression').initializeExperience(r.team[0]); const before = r.team[0].experience; completeComebackFloor(r); const after = r.team[0].experience; assert(after > before);
		completeComebackFloor(r); assert.equal(r.team[0].experience, after);
		r.floor = 52; completeComebackFloor(r); assert.equal(r.team[0].experience, after);
		r.floor = 60; assert.equal(comebackExperience(r), 2); r.floor = 61; assert.equal(comebackExperience(r), 1);
		completeComebackFloor(r); assert.equal(r.team[0].experience, after);
	});
	it('pauses paid emergency care behind a persisted elder dialogue, and declining does not re-open on refresh', () => {
		const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
		const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
		const {commandAfterOpening} = require('../fixtures/fantasy-rogue');
		const {randomUUID} = require('crypto');
		const store = new RogueStore(':memory:'), c = content(), engine = new RogueEngine(store, c, () => 0), user = 'elderqa';
		const cmd = (action, data = {}) => engine.command(user, {id: randomUUID(), revision: store.get(user).revision, action, ...data});
		try {
			commandAfterOpening(engine, user, {id: randomUUID(), revision: store.get(user).revision, action: 'start', starters: ['bulbasaur']});
			engine.content.story = true;
			store.change(user, a => { const r = a.run; r.phase = 'ready'; r.money = 10000; r.team[0].hp = 0; r.bag.revive = 1; engine.autoEmergency(r); });
			let r = store.get(user).run; assert(r.comeback.pending); assert.equal(r.team[0].hp, 0); assert.equal(r.money, 10000);
			assert.throws(() => cmd('use', {member: r.team[0].id, value: 'revive'}), /老人/);
			const key = r.comeback.pending.key; cmd('comeback', {member: key, value: 'next'}); cmd('comeback', {member: key, value: 'no'}); cmd('comeback', {member: key, value: 'continue'});
			engine.migrate(user); engine.migrate(user); assert(!store.get(user).run.comeback.pending); assert(!store.get(user).run.comeback.accepted);
			cmd('use', {member: r.team[0].id, value: 'revive'});
			store.change(user, a => {a.run.team[0].hp = 0; engine.autoEmergency(a.run);});
			r = store.get(user).run; assert(r.comeback.pending); assert.equal(r.money, 10000);
			assert.equal(r.comeback.pending.page, 1); cmd('comeback', {member: r.comeback.pending.key, value: 'yes'}); cmd('comeback', {member: r.comeback.pending.key, value: 'continue'});
			r = store.get(user).run; assert(r.team[0].hp > 0); assert(r.money < 10000); assert(r.emergencyRecovery.paid); assert(r.comeback.accepted);
		} finally { store.close(); }
	});
	it('keeps coverage legal, excludes STAB/status moves and consumes one voucher', () => {
		const r = run(), p = r.team[0], choices = coverageMoves(p); assert(choices.includes('earthquake')); assert(!choices.includes('psychic')); assert(!choices.includes('protect'));
		grantCoverage(r, 'test'); grantCoverage(r, 'test'); assert.equal(r.coverageLessons.remaining, 1);
		claimCoverage({run: r}, r, content(), p.id, 'earthquake'); assert.equal(r.coverageLessons.remaining, 0);
		assert.throws(() => claimCoverage({run: r}, r, content(), p.id, 'flamethrower'));
		assert(rogueCodex(undefined, 'events', true).entries.some(e => e.id === 'coverageworkshop'));
	});
	it('adds PP restoration with supplies, without restoring HP or allowing a duplicate claim', () => {
		const r = run(); r.floor = 81; r.phase = 'reward'; r.node = {kind: 'reward', rewardScene: {id: 'pprest', key: 'pp'}, reward: {money: 0, items: {}}};
		r.team[0].pp[0].pp = 0; r.team[0].hp = 1;
		const c = content(); c.items.push({id: 'ether', name: 'PP 单项小补剂', kind: 'pp', amount: 10});
		chooseReward(r, c, () => 0, 'pprest'); assert.equal(r.team[0].pp[0].pp, r.team[0].pp[0].maxpp); assert.equal(r.team[0].hp, 1);
		assert.equal(r.node.reward.items.ether, 4); assert.throws(() => chooseReward(r, c, () => 0, 'pprest'));
	});
});
