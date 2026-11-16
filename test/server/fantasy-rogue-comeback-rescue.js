'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { offerComeback, chooseComeback, comebackView } = require('../../dist/server/fantasy-rogue/comeback');
const { content, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue free elder aid and stranded-party rescue', () => {
	let store, engine;
	const user = 'elderrescueqa';
	const account = () => store.get(user);
	const run = () => account().run;
	const change = update => store.change(user, a => update(a.run, a));
	const cmd = (action, extra = {}) => engine.command(user, {
		id: randomUUID(), revision: account().revision, action, ...extra,
	});
	function strand(r) {
		r.money = 0; r.bag = {}; r.box = [];
		r.startCard = 'Fire';
		for (const mon of r.team) {
			mon.hp = 0; mon.status = 'psn'; mon.statusState = { toxicTurns: 2 };
			for (const pp of [...mon.pp, ...(mon.moveMemory || []), ...(mon.blessingPP || [])]) pp.pp = 0;
		}
	}
	beforeEach(() => {
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content(), () => 0);
		commandAfterOpening(engine, user, { id: randomUUID(), revision: account().revision,
			action: 'start', starters: ['bulbasaur'] });
		cmd('select', { value: 'grass' });
		engine.content.story = true;
	});
	afterEach(() => store.close());
	it('accepts aid for free, restores the full party and preserves persistent progression and inventory', () => {
		const r = run(); strand(r);
		r.money = 3210; r.bag.revive = 2;
		const second = structuredClone(r.team[0]); second.id = randomUUID(); r.team.push(second);
		const egg = structuredClone(second); egg.id = randomUUID(); egg.egg = { steps: 3 };
		r.team.push(egg);
		const before = structuredClone(r);
		assert(offerComeback(r, engine.content)); const key = r.comeback.pending.key;
		chooseComeback(r, key, 'next'); chooseComeback(r, key, 'yes');
		assert.equal(r.money, before.money); assert.deepEqual(r.bag, before.bag);
		for (const [index, mon] of r.team.slice(0, 2).entries()) {
			assert.equal(mon.hp, mon.maxhp); assert.equal(mon.status, ''); assert.deepEqual(mon.statusState, {});
			assert(mon.pp.every(pp => pp.pp === pp.maxpp));
			assert(mon.moveMemory.every(pp => pp.pp === pp.maxpp));
			for (const key of ['id', 'set', 'experience', 'stats', 'maxhp']) assert.deepEqual(mon[key], before.team[index][key]);
		}
		assert.deepEqual(egg, before.team[2]); assert(!r.startCard);
		assert.equal(r.comeback.expires, r.floor + 9);
		chooseComeback(r, key, 'continue'); assert(!offerComeback(r, engine.content));
	});
	it('automatically rescues an old stranded run on reload and can start the same encounter again', () => {
		change(r => { strand(r); r.comeback = { declines: 1 }; });
		const before = run(); engine.migrate(user);
		const rescued = run(), view = comebackView(rescued);
		assert.equal(rescued.phase, 'ready'); assert.equal(rescued.money, 0);
		assert.equal(rescued.team[0].hp, rescued.team[0].maxhp);
		assert.equal(view.answer, 'yes'); assert.equal(view.choosing, false);
		assert(view.text.includes('不愿受惠于人')); assert(view.text.includes('我也有我的坚持'));
		assert.equal(rescued.comeback.declines, 1);
		assert.deepEqual(rescued.node, before.node); assert.deepEqual(rescued.bag, before.bag);
		engine.migrate(user); assert.deepEqual(run().comeback, rescued.comeback);
		assert.equal(run().notices.length, rescued.notices.length);
		const command = { id: randomUUID(), revision: account().revision,
			action: 'comeback', member: view.key, value: 'continue' };
		engine.command(user, command); const after = account(); engine.command(user, command);
		assert.deepEqual(account(), after, 'duplicate dismissal must not reapply aid');
		cmd('battle'); assert.equal(run().phase, 'battle'); assert(run().battle);
		assert.equal(run().encounter, before.encounter); assert.equal(run().money, 0);
	});
	it('rescues a genuine defeat without charging the failed emergency quote', () => {
		change(r => { r.money = 0; r.bag = {}; });
		cmd('battle');
		const r = run(), result = { encounterId: r.battle.encounterId, won: false, team: r.team, bag: {} };
		for (const mon of result.team) mon.hp = 0;
		engine.settle(user, r.battle.token, result);
		assert.equal(run().comeback.pending.answer, 'yes'); assert(run().team.every(mon => mon.hp === mon.maxhp));
		assert.equal(run().money, 0); assert(!run().emergencyRecovery); assert(!run().failure);
		const after = account(); engine.settle(user, r.battle.token, result); assert.deepEqual(account(), after);
	});
	it('follows a persisted refusal with automatic aid when no recovery remains', () => {
		change(r => {
			strand(r); r.bag.revive = 1; assert(offerComeback(r, engine.content));
			chooseComeback(r, r.comeback.pending.key, 'next'); chooseComeback(r, r.comeback.pending.key, 'no');
			r.bag = {};
		});
		cmd('comeback', { member: run().comeback.pending.key, value: 'continue' });
		assert.equal(run().comeback.pending.answer, 'yes'); assert.equal(run().comeback.declines, 1);
		assert.equal(run().team[0].hp, run().team[0].maxhp); assert.equal(run().money, 0);
	});
	it('honors an old accepted farewell for free without renewing its buff or paying its emergency quote', () => {
		change(r => {
			strand(r); r.money = 10000;
			r.comeback = { accepted: true, floor: 1, expires: 10, completed: [], battleFloors: [],
				pending: { key: 'oldyes', floor: 1, page: 1, answer: 'yes' } };
			r.emergencyRecovery = { cost: 1900, paid: false };
			delete r.startCard;
		});
		engine.migrate(user); const before = run().comeback;
		cmd('comeback', { member: 'oldyes', value: 'continue' });
		assert.equal(run().money, 10000); assert.equal(run().team[0].hp, run().team[0].maxhp);
		assert.equal(run().comeback.expires, before.expires); assert.deepEqual(run().comeback.completed, before.completed);
		assert(!run().emergencyRecovery); assert(!run().comeback.pending);
	});
	it('rolls back the entire rescue if persistence fails and retries it exactly once', () => {
		change(strand); const before = account(), checkFailure = engine.checkFailure;
		try {
			engine.checkFailure = r => { checkFailure.call(engine, r); throw new Error('rescue interrupted'); };
			assert.throws(() => engine.migrate(user), /rescue interrupted/); assert.deepEqual(account(), before);
		} finally { engine.checkFailure = checkFailure; }
		engine.migrate(user); assert(run().comeback.accepted); assert.equal(run().team[0].hp, run().team[0].maxhp);
		const { rogueSaveCompatibilityIssues } = require('../../dist/server/fantasy-rogue/save-compatibility');
		assert.deepEqual(rogueSaveCompatibilityIssues(account()), []);
		const after = run(); engine.migrate(user); assert.deepEqual(run(), after);
	});
	for (const path of ['revive', 'money', 'box', 'capture', 'reward', 'learning', 'event', 'shop']) {
		it(`does not consume the remaining chance while a ${path} recovery path is available`, () => {
			change(r => {
				const healthy = structuredClone(r.team[0]); strand(r);
				if (path === 'revive') r.bag.revive = 1;
				if (path === 'money') r.money = 10000;
				if (path === 'box') r.box = [healthy];
				if (path === 'capture') r.pendingCaptures = [healthy];
				if (path === 'reward') r.phase = 'reward';
				if (path === 'learning') r.pendingMoves = [{ member: r.team[0].id, move: 'sleeppowder' }];
				if (path === 'event') { r.phase = 'event'; r.node.event = { id: 'room', key: randomUUID(), stage: 'choice' }; }
				if (path === 'shop') {
					r.phase = 'rest'; r.node = structuredClone(engine.content.floors[9][0]); r.money = 20;
				}
			});
			engine.migrate(user); assert(!run().comeback?.accepted); assert.notEqual(run().phase, 'defeated');
			assert.equal(run().team[0].hp, 0);
		});
	}
	for (const rule of ['used', 'nuzlocke', 'no-healing', 'postgame']) {
		it(`does not bypass ${rule} restrictions`, () => {
			change(r => {
				strand(r);
				if (rule === 'used') r.comeback = { accepted: true, floor: 1, expires: 10 };
				if (rule === 'nuzlocke') r.nuzlocke = { version: 1, encounters: {}, dead: [] };
				if (rule === 'no-healing') {
					r.node.noHealing = true; r.phase = 'failed'; r.encounter = 1;
				}
				if (rule === 'postgame') {
					r.phase = 'postgame'; r.postgame = { stage: 'offer',
						before: structuredClone({ team: r.team, bag: r.bag, money: r.money }),
						node: structuredClone(r.node), encounter: 0 };
				}
			});
			engine.migrate(user); assert.equal(run().team[0].hp, 0); assert(!run().comeback?.pending);
			if (rule === 'used' || rule === 'nuzlocke') assert.equal(run().phase, 'defeated');
		});
	}
});
