'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { set, stats, content } = require('../fixtures/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { useInventoryItem, trainingItemTargets } = require('../../dist/server/fantasy-rogue/inventory-use');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const data = createPreviewContent();
describe('Bulk effort supplies', () => {
	for (const item of data.items.filter(i => i.kind === 'effort')) {
		it(`caps ${item.id}, preserves excess stock and rejects unusable targets`, () => {
			const mon = createRoguePokemon(set(), stats(0));
			const run = { phase: 'ready', floor: 1, team: [mon], bag: { [item.id]: 100 }, boosts: stats(0), notices: [] };
			assert.equal(trainingItemTargets(run, data, item)[0].maxCount, Math.min(100, Math.ceil(252 / item.amount)));
			useInventoryItem({}, run, data, { member: mon.id, value: item.id, count: 10 });
			assert.equal(mon.set.evs[item.stat], item.amount * 10); assert.equal(run.bag[item.id], 90);
			mon.set.evs[item.stat] = 249;
			useInventoryItem({}, run, data, { member: mon.id, value: item.id, count: 80 });
			assert.equal(mon.set.evs[item.stat], 252); assert.equal(run.bag[item.id], 90 - Math.ceil(3 / item.amount));
			const before = structuredClone(run);
			assert.throws(() => useInventoryItem({}, run, data, { member: mon.id, value: item.id, count: 1 }), /上限/);
			assert.deepEqual(run, before); assert.equal(trainingItemTargets(run, data, item).length, 0);
		});
	}
	it('caps total EVs and rejects invalid counts without mutation', () => {
		const mon = createRoguePokemon(set(), stats(0)); mon.set.evs = { ...stats(0), hp: 252, atk: 252, spe: 5 };
		const run = { phase: 'ready', floor: 1, team: [mon], bag: { carbos: 30 }, boosts: stats(0), notices: [] };
		for (const count of [0, -1, 1.5, NaN, Infinity, 31]) {
			const before = structuredClone(run);
			assert.throws(() => useInventoryItem({}, run, data, { member: mon.id, value: 'carbos', count }));
			assert.deepEqual(run, before);
		}
		useInventoryItem({}, run, data, { member: mon.id, value: 'carbos', count: 30 });
		assert.equal(mon.set.evs.spe, 6); assert.equal(run.bag.carbos, 29);
	});
	it('persists one consumption on repeated request and stale revision after reconnect', () => {
		const store = new RogueStore(':memory:'), c = content(); c.items.push(...data.items.filter(i => i.kind === 'effort'));
		const engine = new RogueEngine(store, c), user = 'bulkqa';
		try {
			engine.command(user, { id: randomUUID(), revision: store.get(user).revision, action: 'start', starters: ['bulbasaur'] });
			store.change(user, a => { a.run.bag.carbos = 30; }); const a = store.get(user);
			const cmd = { id: randomUUID(), revision: a.revision, action: 'use', member: a.run.team[0].id, value: 'carbos', count: 10 };
			engine.command(user, cmd);
			const after = store.get(user); assert.equal(after.run.bag.carbos, 20);
			engine.command(user, cmd); assert.throws(() => engine.command(user, { ...cmd, id: randomUUID() }), /版本|刷新|过期/);
			assert.deepEqual(store.get(user), after);
		} finally { store.close(); }
	});
});
