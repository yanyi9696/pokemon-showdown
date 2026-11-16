'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID, createHash } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { content, set, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue persisted learning recovery', function () {
	this.timeout(20000);
	const userid = 'learningrecoveryqa';
	let store, engine, data, dir, originalConfig;
	const account = () => store.get(userid);
	const request = (action, details = {}) => ({ id: randomUUID(), revision: account().revision, action, ...details });
	const cmd = (action, details) => engine.command(userid, request(action, details));
	const choice = () => ({ member: account().run.pendingMoves[0].member, move: account().run.pendingMoves[0].move });
	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-learning-'));
		store = new RogueStore(path.join(dir, 'original.db'));
		data = content(); data.progression = true;
		for (const item of data.items) if (item.kind === 'ball') item.multiplier = 1;
		data.items.push({ id: 'rarecandy', name: '神奇糖果', kind: 'rarecandy', price: 0 });
		data.items.push({ id: 'expcandys', name: '经验糖果S', kind: 'candy', price: 0, amount: 800 });
		engine = new RogueEngine(store, data, () => 0);
		commandAfterOpening(engine, userid, request('start', { starters: ['bulbasaur'], difficulty: 0 }));
		cmd('select', { value: 'grass' });
		store.change(userid, a => {
			a.run.team = [createRoguePokemon(set('Bulbasaur', 'Overgrow', 8, ['Tackle', 'Growl', 'Vine Whip', 'Growth']), a.run.boosts)];
			a.run.bag.rarecandy = 12;
			a.run.bag.expcandys = 12;
		});
		originalConfig = Config.fantasyrogue;
		Config.fantasyrogue = { enabled: true, betaAccounts: [userid], publicAccess: false };
	});
	afterEach(() => {
		store.close(); Config.fantasyrogue = originalConfig;
		fs.rmSync(dir, { recursive: true, force: true });
	});
	function grow(count = 1) {
		const command = request('use', { value: count === 1 ? 'rarecandy' : 'expcandys', member: account().run.team[0].id, count });
		engine.command(userid, command);
		assert(account().run.pendingMoves.length > 0);
		assert.equal(account().run.pendingMoves[0].move, 'leechseed');
		return command;
	}
	it('generates, persists and sends the pending choice, then accepts the original client protocol', () => {
		grow();
		const user = { id: userid, name: userid, named: true, registered: true, connected: true };
		const view = new RogueManager(engine).state(user);
		assert.deepEqual(view.run.pendingMoves, account().run.pendingMoves);
		const before = account();
		cmd('learn', { member: choice().member, value: '1' });
		assert.equal(account().run.team[0].set.moves[1], 'leechseed');
		assert.equal(account().run.pendingMoves.length, 0);
		assert.deepEqual(account().run.bag, before.run.bag); assert.equal(account().run.money, before.run.money);
		cmd('battle'); assert.equal(account().run.phase, 'battle');
	});
	it('reopens a copy of a stuck version-3 save without erasing progress, and resumes after learning', () => {
		grow(); const before = account(); assert.equal(before.saveVersion, 3);
		store.close();
		const source = path.join(dir, 'original.db'), copy = path.join(dir, 'recovered.db');
		const hash = () => createHash('sha256').update(fs.readFileSync(source)).digest('hex');
		const sourceHash = hash(); fs.copyFileSync(source, copy);
		store = new RogueStore(copy); engine = new RogueEngine(store, data, () => 0);
		engine.migrate(userid);
		const reopened = account();
		for (const field of ['id', 'floor', 'phase', 'team', 'bag', 'money', 'pendingMoves']) {
			assert.deepEqual(reopened.run[field], before.run[field], field);
		}
		assert.equal(reopened.points, before.points);
		cmd('learn', { ...choice(), value: 'skip' });
		assert.equal(account().run.pendingMoves.length, 0);
		assert.deepEqual(account().run.team[0].set.moves, before.run.team[0].set.moves);
		cmd('battle'); assert.equal(account().run.phase, 'battle'); assert.equal(hash(), sourceHash);
	});
	it('processes repeated candy and learning requests only once across a process restart', () => {
		const candy = grow(10), afterCandy = account();
		assert(afterCandy.run.pendingMoves.length >= 2);
		engine.command(userid, candy); assert.deepEqual(account(), afterCandy);
		const command = request('learn', { ...choice(), value: '0' });
		engine.command(userid, command); const afterLearn = account();
		for (let i = 0; i < 5; i++) engine.command(userid, command);
		assert.deepEqual(account(), afterLearn);
		store.close(); store = new RogueStore(path.join(dir, 'original.db')); engine = new RogueEngine(store, data, () => 0);
		engine.command(userid, command); assert.deepEqual(account(), afterLearn);
		assert.throws(() => engine.command(userid, { ...command, value: 'skip' }), /重复请求内容不一致/);
		assert.throws(() => engine.command(userid, { ...command, id: randomUUID() }), /存档已更新/);
		assert.throws(() => cmd('learn', { member: command.member, move: command.move, value: '0' }), /待学习招式已变化/);
		assert.deepEqual(account(), afterLearn, 'a stale choice must not consume the next queued move');
		while (account().run.pendingMoves.length) cmd('learn', { ...choice(), value: 'skip' });
		assert.deepEqual(account().run.bag, afterCandy.run.bag);
		assert.equal(account().run.team[0].experience, afterCandy.run.team[0].experience);
		assert.equal(account().run.money, afterCandy.run.money);
	});
});
