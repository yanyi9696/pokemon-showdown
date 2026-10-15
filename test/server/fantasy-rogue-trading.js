'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { tradeRouteTemplates, TRADE_NAMES, machineMoves, tradeItem, prepareTrade } = require('../../dist/server/fantasy-rogue/trading');
const { inventoryItem } = require('../../dist/server/fantasy-rogue/team');
const { syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { rogueCodex } = require('../../dist/server/fantasy-rogue/codex');
const { Battle } = require('../../dist/sim/battle');

describe('Fantasy Rogue trade routes and purchased training items', function () {
	this.timeout(20000);
	let store, engine, content;
	const account = () => store.get('tradetester');
	const cmd = (action, details = {}) => engine.command('tradetester', { id: randomUUID(), revision: account().revision, action, ...details });
	beforeEach(() => {
		store = new RogueStore(':memory:'); content = createPreviewContent();
		engine = new RogueEngine(store, content, () => 0);
		cmd('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());
	function enter(kind, spirit) {
		store.change('tradetester', a => {
			a.run.floor = 21; a.run.phase = 'choose'; a.run.money = 50000;
			a.run.spirit = spirit; a.run.spiritVersion = 1;
			a.run.choices = [{ id: 'trade', name: TRADE_NAMES[kind], kind: 'trade', trade: { kind, stock: [], purchases: 0 },
				encounters: [], reward: { money: 0, items: {} } }];
		});
		cmd('select', { value: 'trade' });
		assert.equal(account().run.phase, 'rest');
	}
	for (const kind of ['mint', 'candy', 'machine']) it(`saves ${kind} stock, refuses off-menu purchases and grants discovery only on entry`, () => {
		assert(!rogueCodex(account(), 'events').entries.find(e => e.id === `trade:${kind}`).unlocked);
		enter(kind);
		const stock = account().run.node.trade.stock;
		assert(stock.length && stock.length <= 3);
		const run = account().run; prepareTrade(run, content, () => { throw new Error('must not reroll'); });
		assert.deepEqual(run.node.trade.stock, stock);
		assert.throws(() => cmd('buy', { value: 'masterball' }));
		assert.throws(() => cmd('heal'), /休整中心/);
		const item = stock[0], before = account().run.money;
		const request = { id: randomUUID(), revision: account().revision, action: 'buy', value: item.id };
		engine.command('tradetester', request); engine.command('tradetester', request);
		assert.equal(account().run.money, before - item.price);
		assert.equal(account().run.node.trade.stock[0].remaining, 0);
		assert.throws(() => cmd('buy', { value: item.id }));
		assert(inventoryItem(content, item.id));
		cmd('continue');
		assert.equal(account().run.floor, 22);
		assert(rogueCodex(account(), 'events').entries.find(e => e.id === `trade:${kind}`).replay);
	});
	it('mints change stat nature in the party and real battle without changing original nature or refilling PP', () => {
		enter('mint');
		const item = account().run.node.trade.stock[0]; cmd('buy', { value: item.id });
		store.change('tradetester', a => {
			const m = a.run.team[0];
			m.pp[0].pp = 1;
			m.moveMemory.find(p => p.id === m.pp[0].id).pp = 1;
		});
		const old = account().run.team[0];
		cmd('use', { value: item.id, member: old.id });
		const run = account().run, mon = run.team[0];
		assert.equal(mon.set.nature, old.set.nature); assert.equal(mon.mintNature, item.nature);
		assert.equal(mon.pp[0].pp, 1); assert.equal(mon.hp, old.hp);
		const expected = createRoguePokemon({ ...mon.set, nature: item.nature }, run.boosts);
		assert.deepEqual(mon.stats, expected.stats);
		syncBlessingParty(run); assert.equal(mon.statModifiers.nature, item.nature);
		const battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: { encounterId: 'mint-test', team: run.team,
			boosts: run.boosts, bag: run.bag, balls: [], catchable: false },
		p1: { team: [mon.set] }, p2: { team: [old.set] } });
		try { assert.equal(battle.p1.pokemon[0].baseStoredStats.atk, expected.stats.atk); } finally { battle.destroy(); }
	});
	it('TM learning consumes once, respects legality, preserves equipped moves and persists after leaving', () => {
		enter('machine'); const item = account().run.node.trade.stock[0];
		cmd('buy', { value: item.id }); cmd('continue');
		const before = account().run.team[0]; assert(machineMoves(before).includes(item.move));
		cmd('use', { value: item.id, member: before.id });
		const mon = account().run.team[0];
		assert.deepEqual(mon.set.moves, before.set.moves); assert.deepEqual(mon.pp, before.pp);
		assert(mon.moveMemory.some(m => m.id === item.move));
		assert(!machineMoves(mon).includes(item.move)); assert.equal(account().run.bag[item.id], 0);
		store.change('tradetester', a => { a.run.bag[item.id] = 1; a.run.bag.roguetmspore = 1; });
		assert.throws(() => cmd('use', { value: item.id, member: before.id }), /已经掌握/);
		assert.throws(() => cmd('use', { value: 'roguetmspore', member: before.id }), /不能通过/);
		assert.equal(account().run.bag[item.id], 1); assert.equal(account().run.bag.roguetmspore, 1);
	});
	it('keeps fixed rest and rewards intact and uses the three actual shop types', () => {
		const original = content.floors[1]; let turn = 0;
		const options = tradeRouteTemplates(original, n => n === 100 ? 99 : turn++ % n);
		assert.equal(options[0].kind, 'trade'); assert.equal(options[1].kind, 'trade');
		assert.equal(options[2].kind, 'reward');
		assert.equal(tradeRouteTemplates(content.floors[9], () => 99)[0].kind, 'rest');
		assert.equal(tradeItem('roguemintnonsense'), undefined);
	});
	it('counts Calyrex once for leaving trade and shares the Yveltal payment and zero-cost-shop challenge rules', () => {
		enter('mint', 'mewtwo'); cmd('continue'); assert.equal(account().run.boosts.spa, 1);
		enter('mint', 'yveltal'); const item = account().run.node.trade.stock[0], old = account().run;
		cmd('buyhp', { value: item.id, member: old.team[0].id });
		assert.equal(account().run.money, old.money); assert(account().run.team[0].hp < old.team[0].hp);
		assert.throws(() => cmd('buyhp', { value: item.id, member: old.team[0].id }));
		store.change('tradetester', a => { a.run.blessings.owned.push({ id: 'shopraid', family: 'shopraid', tier: 'silver' }); });
		cmd('shopchallenge'); const challenge = account().run.node.shopChallenge;
		assert(!challenge.rewards[item.id]);
		assert(Object.keys(challenge.rewards).every(id => old.node.trade.stock.some(i => i.id === id)));
	});
});
