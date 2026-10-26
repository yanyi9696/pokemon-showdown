'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { chooseEventOption, eventView, beginEvent } = require('../../dist/server/fantasy-rogue/events');
const { LUCK_EVENT_NAMES, LUCK_EVENT_TEXT } = require('../../dist/server/fantasy-rogue/luck-event-data');
const { rogueCodex } = require('../../dist/server/fantasy-rogue/codex');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { CANDY_SHOP } = require('../../dist/server/fantasy-rogue/early-balance');
const { set, stats, commandAfterOpening, eventRoll } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue coin and die gifts', function () {
	this.timeout(30000);
	let content;
	before(() => { content = createPreviewContent(); });
	const ids = Object.keys(LUCK_EVENT_NAMES);
	function setup(id, floor = id === 'clefairydice' ? 51 : 21, loaded = false) {
		const run = { id: 'luck-test', floor, phase: 'event', money: 0, bag: {}, boosts: stats(0), caught: [],
			team: [createRoguePokemon(set(), stats(0), 'luck:partner')],
			node: { id: 'luck', name: LUCK_EVENT_NAMES[id], kind: 'event', encounters: [], reward: { money: 0, items: {} },
				event: { id, key: `key:${id}`, stage: 'choice' } } };
		normalizeBlessings(run);
		if (loaded) run.blessings.owned.push({ id: 'dice', family: 'dice', tier: 'silver', floor: 1 });
		const account = { run, revision: 0, points: 0, slots: 1, captures: {}, unlocked: [] };
		return { run, account };
	}
	function choose(state, face, choice) {
		const calls = [];
		chooseEventOption(state.account, state.run, content, max => { calls.push(max); return face - 1; },
			state.run.node.event.key, choice || (LUCK_EVENT_TEXT[state.run.node.event.id].kind === 'coin' ? 'coin' : 'roll'));
		return calls;
	}
	function value(run) {
		return run.money + Object.entries(run.bag).reduce((sum, [id, count]) =>
			sum + content.items.find(item => item.id === id).price * count, 0) + run.blessings.shards;
	}
	for (const id of ids) {
		const coin = LUCK_EVENT_TEXT[id].kind === 'coin';
		for (const face of coin ? [1, 2] : [1, 2, 3, 4, 5, 6]) {
			it(`${id} settles natural face ${face}, records the result and removes choices`, () => {
				const state = setup(id);
				assert.deepEqual(choose(state, face), [coin ? 2 : 6]);
				assert.deepEqual(state.run.node.event.luck, { kind: coin ? 'coin' : 'die', face, loaded: false });
				assert(state.run.node.event.settled);
				assert.equal(state.run.node.event.stage, 'result');
				assert.equal(eventView(state.run).options.length, 0);
				assert(value(state.run) > 0);
				assert.equal(state.account.points, 0);
				assert(Object.keys(state.run.bag).every(item => content.items.some(entry => entry.id === item)));
			});
		}
		it(`${id} uses Loaded Dice for its best result without drawing the face again`, () => {
			const natural = setup(id), loaded = setup(id, undefined, true), best = coin ? 1 : 6;
			choose(natural, best);
			assert.deepEqual(choose(loaded, coin ? 2 : 1), []);
			assert.equal(loaded.run.node.event.luck.face, best);
			assert(loaded.run.node.event.luck.loaded);
			assert(loaded.run.node.event.result.some(line => line.includes('【灌铅骰子】生效')));
			assert.equal(loaded.run.money, natural.run.money);
			assert.deepEqual(loaded.run.bag, natural.run.bag);
			assert.equal(loaded.run.blessings.shards, natural.run.blessings.shards);
		});
		it(`${id} gives a strictly better best-face reward at early and late floors`, () => {
			for (const floor of [id === 'clefairydice' ? 51 : 1, 99, 200]) {
				const best = setup(id, floor); choose(best, coin ? 1 : 6);
				for (const face of coin ? [2] : [1, 2, 3, 4, 5]) {
					const other = setup(id, floor); choose(other, face);
					assert(best.run.money >= other.run.money);
					assert(best.run.blessings.shards >= other.run.blessings.shards);
					for (const [item, count] of Object.entries(other.run.bag)) assert(best.run.bag[item] >= count);
					assert(value(best.run) > value(other.run), `${id}:${floor}:${face}`);
				}
			}
		});
		it(`${id} can be declined without rolling or paying and cannot be claimed again`, () => {
			const state = setup(id, undefined, true);
			assert.deepEqual(choose(state, 1, 'leave'), []);
			assert.equal(value(state.run), 0);
			assert.equal(state.run.node.event.luck, undefined);
			assert(state.run.node.event.trainingAidBlocked);
			const saved = JSON.stringify(state);
			assert.throws(() => choose(state, 1), /事件选项/);
			assert.equal(JSON.stringify(state), saved);
		});
		it(`${id} appears through normal event selection and shares a read-only codex`, () => {
			const state = setup(id); delete state.run.node.event;
			const roll = eventRoll(state.run, id); let first = true;
			beginEvent(state.run, () => {
				if (first) { first = false; return roll; }
				return 0;
			});
			assert.equal(state.run.node.event.id, id);
			assert(state.run.eventHistory.some(entry => entry.id === id));
			const saved = JSON.stringify(state.account);
			const entry = rogueCodex(state.account, 'events', true).entries.find(event => event.id === id);
			assert(entry.text.includes('灌铅骰子'));
			assert.deepEqual(entry.replay.pages.start.text, eventView(state.run).paragraphs);
			assert.deepEqual(entry.replay.pages.start.options.map(option => option.label),
				eventView(state.run).options.map(option => option.name));
			const visited = new Set();
			function visit(key) {
				if (visited.has(key)) return;
				visited.add(key);
				const page = entry.replay.pages[key]; assert(page);
				assert(!page.action && !page.reward);
				for (const option of page.options) visit(option.next);
			}
			visit(entry.replay.start);
			assert.equal(visited.size, Object.keys(entry.replay.pages).length);
			assert.equal(JSON.stringify(state.account), saved);
		});
	}
	it('keeps the fragment game out of the early event pool', () => {
		assert.throws(() => eventRoll(setup('clefairydice', 50).run, 'clefairydice'), /unavailable/);
		assert(eventRoll(setup('clefairydice', 51).run, 'clefairydice') >= 0);
	});
	it('never opens a candy grade early, and always quadruples the same base parcel on six', () => {
		for (const floor of [1, 29, 30, 49, 50, 99, 100, 149, 150, 200]) {
			const ordinary = setup('delibirddice', floor), best = setup('delibirddice', floor);
			choose(ordinary, 1); choose(best, 6);
			for (const [id, count] of Object.entries(ordinary.run.bag)) {
				assert(CANDY_SHOP[id].floor <= floor);
				assert.equal(best.run.bag[id], count * 4);
			}
			assert.equal(best.run.bag.ether, 1);
		}
	});
	it('uses the correct potion at the existing supply thresholds', () => {
		for (const [floor, item] of [[28, 'potion'], [29, 'superpotion'], [68, 'superpotion'], [69, 'hyperpotion']]) {
			const state = setup('chanseycoin', floor); choose(state, 1);
			assert.deepEqual(state.run.bag, { [item]: 3, ether: 2, revive: 1 });
		}
	});
	it('pays the declared berries and fragment jackpot', () => {
		const berry = setup('shuckledice', 29); choose(berry, 6);
		assert.deepEqual(berry.run.bag, { sitrusberry: 4, leppaberry: 1, lumberry: 1 });
		for (const [index, amount] of [3, 4, 5, 6, 8, 15].entries()) {
			const state = setup('clefairydice'); choose(state, index + 1);
			assert.equal(state.run.blessings.shards, amount);
			assert.equal(state.run.bag.moonstone || 0, index === 5 ? 1 : 0);
		}
	});
	it('does not let Loaded Dice override the separate held-item conversion roll', () => {
		const state = setup('shuckledice', 29, true); state.run.spirit = 'hoopagift';
		const calls = choose(state, 2);
		assert(calls.length > 0 && calls.every(max => max === 2));
		assert.equal(state.run.node.event.luck.face, 6);
		assert.deepEqual(state.run.bag, { sitrusberry: 4, leppaberry: 1, lumberry: 1 });
	});
	it('rejects stale keys and client-specified outcomes without consuming a roll or changing rewards', () => {
		const state = setup('meowthcoin'), before = JSON.stringify(state);
		for (const [key, choice] of [['old-key', 'coin'], ['key:meowthcoin', 'heads'], ['key:meowthcoin', 'roll']]) {
			assert.throws(() => chooseEventOption(state.account, state.run, content, () => {
				throw new Error('RNG should not run');
			}, key, choice), /事件选项/);
			assert.equal(JSON.stringify(state), before);
		}
	});
	for (const id of ids) it(`${id} persists the result across database reopen, rejects duplicate payouts and continues`, () => {
		const filename = path.join(os.tmpdir(), `rogue-luck-${randomUUID()}.db`), user = 'luckpersistence';
		let store = new RogueStore(filename), engine = new RogueEngine(store, content, () => 0), calls = 0;
		try {
			commandAfterOpening(engine, user, { id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur'] });
			store.change(user, account => {
				const run = account.run, test = setup(id, 51, true).run;
				run.floor = 51; run.phase = 'event'; run.node = test.node;
				delete run.choices;
				run.blessings.owned.push(...test.blessings.owned); run.eventHistory = [{ id, floor: 51 }];
			});
			engine = new RogueEngine(store, content, () => { calls++; return 0; });
			const command = { id: randomUUID(), revision: store.get(user).revision, action: 'event', member: `key:${id}`,
				value: LUCK_EVENT_TEXT[id].kind === 'coin' ? 'coin' : 'roll' };
			engine.command(user, command);
			const saved = store.get(user), count = calls;
			store.close(); store = new RogueStore(filename);
			engine = new RogueEngine(store, content, () => { calls++; return 0; });
			assert.deepEqual(store.get(user), saved);
			assert.equal(eventView(store.get(user).run).options.length, 0);
			engine.command(user, command);
			assert.equal(calls, count);
			assert.deepEqual(store.get(user), saved);
			assert.throws(() => engine.command(user, { ...command, id: randomUUID(), revision: saved.revision }), /事件选项/);
			assert.deepEqual(store.get(user), saved);
			assert(rogueCodex(saved, 'events').entries.find(entry => entry.id === id).unlocked);
			engine.command(user, { id: randomUUID(), revision: saved.revision, action: 'continue' });
			assert.equal(store.get(user).run.floor, 52);
		} finally {
			store.close();
			for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(filename + suffix)) fs.unlinkSync(filename + suffix);
		}
	});
});
