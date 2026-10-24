'use strict';
const assert = require('assert').strict;
const { Dex } = require('../../dist/sim/dex');
const { Battle } = require('../../dist/sim/battle');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon, evolveMember, rebuildMember } = require('../../dist/server/fantasy-rogue/progression');
const { compoundFinals, compoundPoints } = require('../../dist/sim/rogue-compound');
const { compoundView } = require('../../dist/server/fantasy-rogue/compound');
const { partyEvolutions } = require('../../dist/server/fantasy-rogue/party-evolution');
const b = require('../../dist/server/fantasy-rogue/blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { recordClear } = require('../../dist/server/fantasy-rogue/legacy');
const { buildRogueDuelState } = require('../../dist/server/fantasy-rogue/duels');
const { recycleItems, recycleOffers, baseRecyclePrice } = require('../../dist/server/fantasy-rogue/buyback');
const { tradeKind, prepareTrade, shopStock } = require('../../dist/server/fantasy-rogue/trading');
const { inventoryItem, editParty } = require('../../dist/server/fantasy-rogue/team');
const h = require('../../dist/server/fantasy-rogue/honeymoon');
const { eventView, chooseEventOption, settleEventBattle, chooseEvent } = require('../../dist/server/fantasy-rogue/events');
const { stats, set } = require('../fixtures/fantasy-rogue');

describe('Rogue full-price recycling, honeymoon progression and Compound V', function () {
	this.timeout(20000);
	let content;
	before(() => { content = createPreviewContent(); });
	function campaign(names = ['Paras', 'Beedrill']) {
		const run = { id: 'honeymoon-compound', floor: 100, phase: 'event', boosts: stats(5), money: 9000, bag: {}, encounter: 0,
			owner: { id: 'tester', name: 'Tester' }, contentVersion: content.version, caught: [],
			team: names.map(name => createRoguePokemon(set(name, Dex.mod('gen9fantasy').species.get(name).abilities[0], 50), stats(5))),
			node: { id: 'event', kind: 'event', name: '测试', encounters: [], reward: { money: 0, items: {} } } };
		b.syncBlessingParty(run);
		const account = { revision: 1, points: 0, slots: 3, boosts: stats(5), captures: {}, unlocked: [], run };
		return { run, account };
	}
	function own(run, id) { run.blessings.owned.push({ ...blessing(id), floor: run.floor }); }
	function grant(account, run, id) {
		run.phase = 'blessing';
		run.blessings.round = { floor: run.floor, tier: blessing(id).tier, remaining: 1, options: [{ id, chosen: false, refreshes: 1 }], familiesSeen: [] };
		b.handleBlessingCommand(account, run, content, { action: 'blessing', slot: 0 }, () => 0);
	}
	function resolve(account, run, value, evs) {
		b.handleBlessingCommand(account, run, content, { action: 'blessingreward', member: run.blessings.pending[0].id, value, evs }, () => 0);
	}
	function event(run, id) { run.phase = 'event'; run.node.event = { id, key: id, stage: 'choice' }; }
	it('opens buyback only from floor 80, using base prices without spirit or auction markups', () => {
		assert.notEqual(tradeKind(79, () => 0), 'buyback');
		assert.equal(tradeKind(80, () => 0), 'buyback');
		const { run } = campaign(); run.phase = 'rest'; run.spirit = 'meowth';
		run.node.kind = 'trade'; run.node.trade = { kind: 'buyback', stock: [], purchases: 0 };
		run.bag = { potion: 3, tinymushroom: 2, roguetmthunderbolt: 1, rogueemblemfire: 1, leftovers: 1 };
		run.team[0].set.item = 'leftovers';
		prepareTrade(run, content, () => 0); assert.deepEqual(shopStock(content, run), []);
		const offers = recycleOffers(run, content);
		assert.equal(offers.find(i => i.id === 'potion').recyclePrice, content.items.find(i => i.id === 'potion').price);
		assert.equal(offers.find(i => i.id === 'tinymushroom').recyclePrice, 150);
		assert.equal(offers.find(i => i.id === 'roguetmthunderbolt').recyclePrice, 2500);
		assert.equal(baseRecyclePrice(inventoryItem(content, 'rogueemblemfire')), 4000);
		const before = JSON.stringify(run);
		for (const count of [0, -1, 1.5, 4, Infinity]) assert.throws(() => recycleItems(run, content, 'potion', count), /数量/);
		assert.equal(JSON.stringify(run), before);
		const total = offers.reduce((sum, i) => sum + i.recyclePrice * run.bag[i.id], 0), money = run.money;
		recycleItems(run, content, 'all'); assert.equal(run.money, money + total);
		assert.equal(run.team[0].set.item, 'leftovers');
		assert.throws(() => recycleItems(run, content, 'all'), /没有/);
	});
	it('keeps ordinary treasure exchange restricted and preserves collector premiums', () => {
		const { run } = campaign(); run.phase = 'rest'; run.bag = { potion: 5, tinymushroom: 5 };
		run.node.trade = { kind: 'mushroom', stock: [], purchases: 0 };
		assert.throws(() => recycleItems(run, content, 'potion'), /没有/);
		const money = run.money; recycleItems(run, content, 'tinymushroom', 2);
		assert.equal(run.money - money, 374); assert.equal(run.bag.tinymushroom, 3);
	});
	it('persists region choice, gates return by eight floors and supports a later adventure', () => {
		const { run, account } = campaign(); run.floor = 80;
		assert(!h.honeymoonEligible(run, 'honeymoonreturn'));
		event(run, 'honeymoon');
		chooseEventOption(account, run, content, () => 0, 'honeymoon', 'region:alola');
		assert.equal(account.honeymoon.region, 'alola');
		assert(!h.honeymoonEligible(run, 'honeymoon'));
		run.floor = 87; assert(!h.honeymoonEligible(run, 'honeymoonreturn'));
		run.floor = 88; assert(h.honeymoonEligible(run, 'honeymoonreturn'));
		const next = { ...run, id: 'new-run', floor: 80, honeymoon: structuredClone(account.honeymoon) };
		assert(h.honeymoonEligible(next, 'honeymoonreturn'));
		event(next, 'honeymoonreturn'); h.prepareHoneymoon(next, () => 99);
		assert(eventView(next).paragraphs.join('').includes('阿罗拉'));
		chooseEventOption(account, next, content, () => 0, 'honeymoonreturn', 'honeymoongift');
		assert(account.honeymoon.returned); const money = next.money;
		assert.throws(() => chooseEventOption(account, next, content, () => 0, 'honeymoonreturn', 'honeymoongift'), /已更新/);
		assert.equal(next.money, money);
	});
	it('cannot generate locked honeymoon events when all other events were seen', () => {
		const { run } = campaign(); run.floor = 79;
		for (let n = 0; n < 100; n++) assert(!chooseEvent(run, max => n % max).startsWith('honeymoon'));
	});
	for (const won of [true, false]) it(`fully restores and grants souvenirs once after a ${won ? 'win' : 'loss'}`, () => {
		const { run, account } = campaign(); run.honeymoon = { region: 'hisui', run: run.id, floor: 80 }; account.honeymoon = { ...run.honeymoon };
		event(run, 'honeymoonreturn'); h.prepareHoneymoon(run, () => 0);
		chooseEventOption(account, run, content, () => 0, 'honeymoonreturn', 'honeymoonbattle');
		assert.equal(run.node.encounters[0].team.length, 3); assert(!run.node.encounters[0].catchable);
		assert(run.node.encounters[0].team.every(s => h.HONEYMOON_REGIONS.hisui.team.includes(s.species)));
		for (const mon of run.team) { mon.hp = 0; mon.status = 'tox'; mon.statuses = { tox: {} }; mon.pp[0].pp = 0; }
		const money = run.money;
		settleEventBattle(run, content, () => 0, false, true, account);
		assert.equal(run.money, money); assert.equal(run.node.event.stage, 'battle');
		settleEventBattle(run, content, () => 0, won, false, account);
		assert(run.team.every(m => m.hp === m.maxhp && !m.status && !m.statuses && m.pp.every(p => p.pp === p.maxpp)));
		assert(run.node.event.result.join('').includes('这是带给你的特产')); assert(account.honeymoon.returned);
		const saved = JSON.stringify(run); settleEventBattle(run, content, () => 0, won, false, account); assert.equal(JSON.stringify(run), saved);
	});
	it('requires an evolution chain with an eligible reachable final form', () => {
		const { run } = campaign(['Paras', 'Parasect', 'Luvdisc', 'Bulbasaur', 'Wurmple']);
		assert.deepEqual(compoundFinals(run.team[0]), ['Parasect']);
		assert.deepEqual(compoundFinals(run.team[1]), ['Parasect']);
		assert.deepEqual(compoundFinals(run.team[2]), []); assert.deepEqual(compoundFinals(run.team[3]), []);
		assert.deepEqual(compoundFinals(run.team[4]), ['Beautifly', 'Dustox']);
		assert(!b.blessingCandidates(campaign(['Luvdisc']).run, content).some(x => x.family === 'compound'));
	});
	for (const id of ['compoundgold', 'compoundprismatic']) it(`${id} validates allocation, locks branches and survives evolution`, () => {
		const { run, account } = campaign(['Wurmple']); const mon = run.team[0]; mon.extraAbilities = ['hugepower'];
		grant(account, run, id); resolve(account, run, mon.id); resolve(account, run, 'Dustox');
		const reward = run.blessings.pending[0], view = compoundView(run, reward), points = compoundPoints('Dustox', blessing(id).tier);
		assert.equal(view.compound.points, points); const before = JSON.stringify(mon);
		assert.throws(() => resolve(account, run, 'allocate', { ...stats(0), atk: points - 1 }), /恰好/);
		assert.throws(() => resolve(account, run, 'allocate', { ...stats(0), atk: points + 1, def: -1 }), /恰好/);
		assert.equal(JSON.stringify(mon), before);
		resolve(account, run, 'allocate', { ...stats(0), hp: 20, atk: points - 20 });
		assert.equal(mon.set.ability, 'Power of Alchemy'); assert.deepEqual(mon.extraAbilities, ['hugepower']);
		assert.equal(mon.statModifiers.baseStats.atk, points - 20);
		assert.throws(() => evolveMember(run, mon, 'Silcoon'), /锁定/);
		assert(!partyEvolutions(mon, run).find(x => x.species === 'Silcoon').ready);
		evolveMember(run, mon, 'Cascoon'); evolveMember(run, mon, 'Dustox');
		assert.equal(mon.set.ability, 'Power of Alchemy'); assert.equal(compoundFinals(mon).length, 0);
		const bst = Dex.mod('gen9fantasy').species.get('Dustox').bst + Object.values(mon.compound.bonus).reduce((a, n) => a + n, 0);
		assert.equal(bst, id === 'compoundgold' ? 525 : 650);
		run.phase = 'ready'; run.pendingMoves = [];
		assert.throws(() => editParty(run, { action: 'ability', member: mon.id, value: 'shielddust' }, content), /固定/);
		const copy = JSON.parse(JSON.stringify(run)); b.syncBlessingParty(copy); assert.deepEqual(copy.team[0].stats, mon.stats);
	});
	it('disables Compound V points above 500 BST after Mega Evolution while keeping the ability locked', () => {
		const { run, account } = campaign(['Sharpedo']); grant(account, run, 'compoundgold'); resolve(account, run, run.team[0].id);
		resolve(account, run, 'allocate', { ...stats(0), hp: 20, atk: compoundPoints('Sharpedo', 'gold') - 20 });
		const saved = run.team[0], battle = new Battle({ formatid: 'gen9fantasyrogue', deserialized: true });
		try {
			battle.setPlayer('p1', { name: 'Player', team: [{ ...saved.set, fantasyRogueStats: run.boosts, fantasyRogueModifiers: saved.statModifiers }] });
			const mon = battle.p1.pokemon[0]; assert.equal(mon.baseStoredStats.atk, saved.stats.atk);
			mon.formeChange('Sharpedo-Mega', battle.dex.items.get('Sharpedonite'), true);
			assert.equal(mon.ability, 'powerofalchemy'); assert.equal(mon.baseAbility, 'powerofalchemy');
			assert(mon.species.bst > 500);
			const unboostedMega = createRoguePokemon({ ...saved.set, species: 'Sharpedo-Mega' }, run.boosts);
			assert.equal(mon.baseStoredStats.atk, unboostedMega.stats.atk);
			assert.equal(mon.maxhp, unboostedMega.maxhp);
			for (const ability of ['Swarm', 'Adaptability', 'Truant', '']) assert.equal(mon.setAbility(ability, mon, true, true), false);
			assert.equal(mon.ability, 'powerofalchemy'); assert(mon.getAbility().flags.failskillswap);
			mon.formeChange('Sharpedo', null, true);
			assert.equal(mon.baseStoredStats.atk, saved.stats.atk); assert.equal(mon.maxhp, saved.maxhp);
		} finally { battle.destroy(); }
	});
	it('keeps allocated points for Mega forms whose original BST remains at most 500', () => {
		const {run, account} = campaign(['Beedrill']); grant(account, run, 'compoundgold'); resolve(account, run, run.team[0].id);
		resolve(account, run, 'allocate', {...stats(0), atk: compoundPoints('Beedrill', 'gold')});
		const saved = run.team[0], battle = new Battle({formatid: 'gen9fantasyrogue', deserialized: true});
		try {
			battle.setPlayer('p1', {name: 'Player', team: [{...saved.set, fantasyRogueStats: run.boosts, fantasyRogueModifiers: saved.statModifiers}]});
			const mon = battle.p1.pokemon[0]; mon.formeChange('Beedrill-Mega', battle.dex.items.get('Beedrillite'), true);
			assert(mon.species.bst <= 500);
			assert(mon.baseStoredStats.atk > createRoguePokemon({...saved.set, species: 'Beedrill-Mega'}, run.boosts).stats.atk);
		} finally {battle.destroy();}
	});
	for (const move of ['Skill Swap', 'Simple Beam', 'Worry Seed', 'Entrainment', 'Gastro Acid']) {
		it(`keeps Compound V's main ability through an actual ${move} turn`, () => {
			const {run, account} = campaign(['Paras']); grant(account, run, 'compoundgold'); resolve(account, run, run.team[0].id);
			resolve(account, run, 'allocate', {...stats(0), atk: compoundPoints('Parasect', 'gold')});
			run.team[0].set.moves = ['Splash'];
			const state = {encounterId: 'compound-ability', team: structuredClone(run.team), boosts: run.boosts,
				bag: {}, balls: [], catchable: false, blessings: structuredClone(run.blessings)};
			const battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
				p1: {name: 'Player', team: state.team.map(m => m.set)}, p2: {name: 'Foe', team: [set('Mew', 'Synchronize', 50, [move])]}});
			try {
				battle.makeChoices('team 1', 'team 1'); battle.makeChoices('move 1', 'move 1');
				assert.equal(battle.p1.active[0].ability, 'powerofalchemy');
				assert.equal(battle.p2.active[0].ability, 'synchronize');
				assert(!battle.p1.active[0].volatiles.gastroacid);
				battle.p1.active[0].transformInto(battle.p2.active[0]);
				assert.equal(battle.p1.active[0].ability, 'powerofalchemy');
			} finally {battle.destroy();}
		});
	}
	it('archives ordinary training and blessing sources without mutating the live team', () => {
		const { run, account } = campaign(); grant(account, run, 'compoundgold'); resolve(account, run, run.team[0].id);
		resolve(account, run, 'allocate', { ...stats(0), atk: compoundPoints('Parasect', 'gold') });
		for (const id of ['mushroomsynthesis', 'hpgrowth', 'powerchoice', 'insight']) own(run, id);
		const mon = run.team[0]; run.blessings.owned.find(x => x.id === 'powerchoice').target = mon.id;
		mon.set.item = 'leftovers'; mon.training = { offense: 5000 }; mon.mushroomTraining = { offense: 350, defense: 200 };
		mon.bonusHP = 28; mon.insight = { points: 30, gain: 4 }; mon.extraAbilities = ['hugepower', 'moldbreaker']; mon.blessingExtraAbilities = ['hugepower'];
		run.growth = { offense: 8000, defense: 4000, experience: 2000 }; run.eventBuff = { battles: 3 }; run.mentorCard = { floor: 200, kind: 'guard' };
		b.syncBlessingParty(run); const before = JSON.stringify(run.team), expectedSet = structuredClone(mon.set);
		run.floor = 200; run.phase = 'complete'; recordClear(account, run);
		const card = account.cards[0], second = structuredClone(card); second.owner = 'other'; second.id = 'other';
		const snapshot = card.snapshot;
		assert.equal(JSON.stringify(run.team), before); assert.deepEqual(snapshot.boosts, run.boosts);
		assert.deepEqual(snapshot.growth, run.growth); assert(snapshot.eventBuff);
		assert.deepEqual(snapshot.team[0].set, expectedSet);
		assert.deepEqual(snapshot.team[0], { ...mon, difficulty: { tier: 0, floor: 200, card: true } });
		const detail = snapshot.memberDetails[mon.id];
		assert.deepEqual(detail.final, mon.stats); assert(detail.baseline.atk < mon.stats.atk);
		assert.equal(detail.delta.atk, mon.stats.atk - detail.baseline.atk);
		assert(detail.sources.some(s => s.name === '全队永久训练'));
		assert(detail.sources.some(s => s.name === '个人永久训练'));
		assert.deepEqual(detail.extraAbilities.map(a => a.id).sort(), ['hugepower', 'moldbreaker']);
		const duel = buildRogueDuelState(card, second); assert.deepEqual(duel.team[0].stats, mon.stats);
		mon.stats.atk++; assert.notEqual(snapshot.memberDetails[mon.id].final.atk, mon.stats.atk);
	});
	it('retains boxed boosts, companion choices and tower effects in the archive and duels', () => {
		const {run, account} = campaign(['Paras', 'Dragonite']);
		grant(account, run, 'compoundgold'); resolve(account, run, run.team[0].id);
		resolve(account, run, 'allocate', {...stats(0), def: compoundPoints('Parasect', 'gold')});
		run.box = [run.team.shift()]; own(run, 'dragonking'); b.syncBlessingParty(run);
		run.blessings.dragonKing.ability = 'drizzle';
		run.blessings.companions[0].preferences = 12;
		run.spirit = 'kyogre'; run.floor = 200; run.phase = 'complete';
		recordClear(account, run);
		const card = account.cards[0], other = structuredClone(card); other.id = 'other'; other.owner = 'other';
		assert.equal(card.snapshot.box[0].statModifiers.baseStats.def, compoundPoints('Parasect', 'gold'));
		assert.equal(card.snapshot.blessingEffects.dragonKing.ability, 'drizzle');
		assert.equal(card.snapshot.spirit, 'kyogre'); assert(!card.snapshot.hazards);
		assert.equal(buildRogueDuelState(card, other).spirit.id, 'kyogre');
		assert.equal(card.snapshot.blessingEffects.companions[0].preferences, 12);
		assert(card.snapshot.memberDetails[run.team[0].id].extraAbilities.some(a => a.id === 'drizzle'));
		assert.equal(run.spirit, 'kyogre');
	});
});
