'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { prepareCoopMasterBallRoutes } = require('../../dist/server/fantasy-rogue/coop-master-ball');
const { Battle } = require('../../dist/sim/battle');
const { Teams } = require('../../dist/sim/teams');
const { captureCoopCheckpoint } = require('../../dist/sim/rogue-coop-checkpoint');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { content, set } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative Master Ball route and irreversible stock', () => {
	let oldConfig, store, engine, manager, host, guest, created;
	let serial = 0;
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = (user = host) => manager.coop.view(user).session.adventure;
	function change(update) {
		const s = session(), revision = s.revision;
		update(s); s.revision++; return store.updateCoopSession(s, revision);
	}
	function newManager() {
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-master-fixture' };
		} }));
	}
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const data = content(); data.items.push({ id: 'masterball', name: '大师球', kind: 'ball', price: 0, multiplier: 1 });
		data.starters.push({ id: 'mewtwo', set: set('Mewtwo', 'Pressure', 5, ['Confusion']), availableInitially: false });
		data.unlocks.mewtwo = { starter: 'mewtwo', captures: 10 };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, data); newManager();
		host = makeUser(`Master Host ${++serial}`, `127.0.100.${serial}`);
		guest = makeUser(`Master Guest ${serial}`, `127.0.101.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, { id: randomUUID(), revision: store.get(user.id).revision,
			action: 'start', starters: ['bulbasaur'] }, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	function enter(id = 'masterballgift') {
		if (id === 'masterballgift') change(s => { prepareCoopMasterBallRoutes(s.adventure, () => 0); });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: id });
		assert.equal(view().coopEvent.id, 'masterballgift');
	}
	function choose(user, value, visit = view(user).coopEvent.key) {
		return manager.coop.command(user, { action: 'eventchoice', value, visit });
	}
	function agree(value) { choose(host, value); choose(guest, value); }
	function claim() {
		enter(); agree('promise');
		enter('masterballreward'); agree('claim');
	}
	function startWild() {
		change(s => {
			s.adventure.routeChoices = [{ id: 'masterwild', name: '大师球野生验收', kind: 'wild', reward: { money: 0, items: {} },
				encounters: [{ name: '野生双打', team: [set('Mewtwo', 'Pressure', 80, ['Splash']),
					set('Magikarp', 'Swift Swim', 5, ['Splash'])], catchable: true, style: 'balanced', catchChances: {} }] }];
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'masterwild' });
		manager.coop.command(host, { action: 'preparebattle', visit: view().battleSelectionKey });
		const state = structuredClone(created.rogue.state);
		assert(state.catchable); assert(state.wild);
		const battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: host.name, team: state.team.map(mon => mon.set) },
			p2: { name: 'Wild A', team: Teams.unpack(created.trainer.packedTeam) },
			p3: { name: guest.name, team: state.partner.team.map(mon => mon.set) },
			p4: { name: 'Wild B', team: Teams.unpack(created.rogue.cooperative.foe) },
		});
		for (const side of battle.sides) assert(battle.choose(side.id, 'team 1'));
		created.rogue.onCheckpoint(captureCoopCheckpoint(battle)); return battle;
	}
	function throwBall(battle, owner) {
		battle.fantasyRogue.coopCapture = { ownerSide: owner === host ? 'p1' : 'p3', ball: 'masterball',
			targetSide: 'p2', targetSlot: 0, targetId: battle.p2.active[0].set.fantasyRogueId };
		battle.makeChoices(owner === host ? 'rogueball masterball' : 'pass', 'move 1',
			owner === guest ? 'rogueball masterball' : 'pass', 'move 1');
		const cp = captureCoopCheckpoint(battle); assert.equal(cp.result.captures.length, 1);
		assert.equal(cp.result.captures[0].set.species, 'Mewtwo'); return cp;
	}
	it('uses the native 0.05% threshold at every optional floor/tier, one roll per floor and one offer per run', () => {
		for (const floor of [1, 61, 121, 161, 197]) for (const difficulty of [0, 1, 2, 3, 4, 5]) {
			const a = structuredClone(session().adventure); a.floor = floor; a.difficulty = difficulty;
			const routes = structuredClone(a.routeChoices); let calls = 0;
			prepareCoopMasterBallRoutes(a, max => {
				assert.equal(max, 10000); calls++; return 5;
			});
			assert.equal(a.masterBallQuest, undefined); assert.deepEqual(a.routeChoices, routes);
			prepareCoopMasterBallRoutes(a, () => { throw new Error('must not reroll this floor'); }); assert.equal(calls, 1);
			a.floor = floor + 1; prepareCoopMasterBallRoutes(a, () => 4);
			assert.equal(a.masterBallQuest.stage, 'offer'); assert.equal(a.routeChoices.length, routes.length + 1);
			prepareCoopMasterBallRoutes(a, () => { throw new Error('one offer per run'); });
			assert.equal(a.routeChoices.filter(n => n.id === 'masterballgift').length, 1);
		}
	});
	it('does not add the extra route on fixed floors or without ordinary choices', () => {
		for (const floor of [10, 20, 50, 100, 150, 200]) {
			const a = structuredClone(session().adventure); a.floor = floor;
			prepareCoopMasterBallRoutes(a, () => { throw new Error('fixed floor must not roll'); }); assert(!a.masterBallQuest);
		}
		const a = structuredClone(session().adventure); a.routeChoices = [];
		prepareCoopMasterBallRoutes(a, () => { throw new Error('no routes must not roll'); });
	});
	it('adds the rare route through normal shared floor advancement and never rolls again while viewing it', () => {
		change(s => {
			s.adventure.floor = 2;
			s.adventure.routeChoices = [{ id: 'rest-test', kind: 'rest', name: '休整', encounters: [], reward: { money: 0, items: {} } }];
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'rest-test' });
		manager.coop.command(host, { action: 'finishroute' });
		const rng = crypto.randomInt; engine.content.events = true;
		crypto.randomInt = max => max === 10000 ? 0 : rng(max);
		try { manager.coop.command(guest, { action: 'finishroute' }); } finally { crypto.randomInt = rng; }
		assert.equal(session().adventure.floor, 3); assert.equal(session().adventure.masterBallQuest.stage, 'offer');
		assert.equal(session().adventure.routeChoices.filter(node => node.id === 'masterballgift').length, 1);
		const saved = session(); view(); view(guest);
		assert.deepEqual(session(), saved);
	});
	it('persists shared dialogue, supports changing votes, and returns the treasure alongside unchanged routes on the same floor', () => {
		const original = session().adventure.routeChoices; enter(); const before = session(), key = view().coopEvent.key;
		assert.deepEqual(view().coopEvent.branchOptions, view(guest).coopEvent.branchOptions); assert.deepEqual(session(), before);
		choose(host, 'promise'); choose(guest, 'discovery'); assert.equal(session().adventure.phase, 'route-interaction');
		manager.coop.command(guest, { action: 'cancelevent', visit: view(guest).coopEvent.key });
		assert.equal(view(guest).coopEvent.ownChoice, null); choose(guest, 'promise');
		assert.equal(session().adventure.floor, 1); assert.equal(session().adventure.phase, 'area-selection');
		assert.deepEqual(session().adventure.routeChoices.filter(n => n.id !== 'masterballreward'), original);
		assert.equal(member(host).bag.masterball, undefined); assert.equal(store.get(host.id).masterBalls, undefined);
		enter('masterballreward'); assert.throws(() => choose(host, 'claim', key), /已经更新/);
		assert.equal(view().coopEvent.sideRoute, true);
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /馈赠/);
	});
	it('grants each player one ball only after common claim, records both receipts and preserves solo saves and the current floor', () => {
		const solos = [store.get(host.id).run, store.get(guest.id).run], original = session().adventure.routeChoices;
		enter(); agree('discovery'); enter('masterballreward');
		const key = view().coopEvent.key;
		choose(host, 'claim'); assert(!member(host).bag.masterball); assert(!member(guest).bag.masterball);
		newManager(); assert.equal(view().coopEvent.ownChoice, 'claim'); choose(guest, 'claim');
		for (const user of [host, guest]) {
			assert.equal(member(user).bag.masterball, 1); assert.deepEqual(member(user).masterBallLedger, { remaining: 1, used: 0 });
			assert.equal(store.get(user.id).masterBalls.obtained.length, 1); assert.equal(store.get(user.id).masterBalls.used, 0);
		}
		assert.deepEqual([store.get(host.id).run, store.get(guest.id).run], solos);
		assert.equal(session().adventure.floor, 1); assert.deepEqual(session().adventure.routeChoices, original);
		const saved = session(); assert.throws(() => choose(guest, 'claim', key)); assert.deepEqual(session(), saved);
	});
	it('clears unconfirmed votes on control transfer, permits delegated agreement and honors revocation', () => {
		enter(); choose(host, 'promise'); manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.equal(view().coopEvent.ownChoice, null); assert.throws(() => choose(host, 'promise'), /操作权/);
		choose(guest, 'discovery'); manager.coop.command(guest, { action: 'selectarea', value: 'masterballreward' });
		manager.coop.command(host, { action: 'delegate', value: 'revoke' }); choose(guest, 'claim');
		assert(!member(guest).bag.masterball); choose(host, 'claim'); assert.equal(member(guest).bag.masterball, 1);
	});
	it('allows an ordinary route to be selected instead without granting or rerolling the missed one-off gift', () => {
		change(s => { prepareCoopMasterBallRoutes(s.adventure, () => 0); });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'grass' });
		assert.equal(session().adventure.phase, 'battle-selection'); assert(!member(host).bag.masterball);
		const a = structuredClone(session().adventure); a.floor = 3;
		a.routeChoices = content().floors[3]; prepareCoopMasterBallRoutes(a, () => { throw Error('cannot reroll'); });
		assert(!a.routeChoices.some(n => n.id === 'masterballgift'));
	});
	it('rolls back both grants and personal records if the second account or common save cannot be written', () => {
		enter(); agree('promise');
		enter('masterballreward'); choose(host, 'claim');
		const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec("CREATE TEMP TRIGGER master_write_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'master write failed'); END;");
		try { assert.throws(() => choose(guest, 'claim'), /master write failed/); } finally { store.db.exec('DROP TRIGGER master_write_fail'); }
		assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		choose(guest, 'claim'); assert.equal(member(host).bag.masterball, 1);
	});
	it('rejects an already-receipted teammate without leaving a partial gift on the other account', () => {
		enter(); agree('promise');
		enter('masterballreward'); choose(host, 'claim');
		store.change(guest.id, account => {
			account.masterBalls = { obtained: [{ run: session().adventure.id + ':' + guest.id, floor: 1, at: Date.now() }], used: 0 };
		});
		const saved = session(), accounts = [store.get(host.id), store.get(guest.id)];
		assert.throws(() => choose(guest, 'claim'), /已领取/);
		assert.deepEqual(session(), saved); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
	});
	it('rejects missing claim receipts and invalid quantities instead of inventing a valid ledger', () => {
		const saved = session();
		assert.throws(() => change(s => { s.adventure.members[host.id].masterBallLedger = { remaining: 1, used: 0 }; }), /凭据/);
		assert.deepEqual(session(), saved); claim();
		const granted = session();
		assert.throws(() => change(s => { s.adventure.members[host.id].bag.masterball = -1; }), /库存/);
		assert.deepEqual(session(), granted);
	});
	for (const seat of ['host', 'guest']) it(`uses ${seat}'s ball on a full-health legendary and persists stock at the first real checkpoint`, () => {
		claim(); const owner = seat === 'host' ? host : guest, other = owner === host ? guest : host;
		const battle = startWild();
		try {
			const cp = throwBall(battle, owner); created.rogue.onCheckpoint(cp);
			assert.equal(member(owner).bag.masterball, undefined); assert.equal(member(other).bag.masterball, 1);
			assert.equal(store.get(owner.id).masterBalls.used, 1); assert.equal(store.get(other.id).masterBalls.used, 0);
			assert.equal(store.get(owner.id).captures.mewtwo, 1); assert.equal(store.get(other.id).captures.mewtwo, undefined);
			const before = session(); created.rogue.onCheckpoint(cp); assert.deepEqual(session(), before);
			created.rogue.onResult({ ...rogueBattleResult(battle), won: false, coopExit: 'retreat' });
			assert.equal(store.get(owner.id).masterBalls.used, 1); assert(!member(owner).bag.masterball);
		} finally { battle.destroy(); }
	});
	it('does not restore spent stock from bags, travel memories, stale ledgers or saved simulator state', () => {
		claim(); const battle = startWild();
		try {
			created.rogue.onCheckpoint(throwBall(battle, guest));
			change(s => {
				const a = s.adventure, m = a.members[guest.id]; m.bag.masterball = 7;
				m.masterBallLedger = { remaining: 1, used: 0 };
				m.coopEvent = { id: 'travel', key: 'memory', stage: 'battle', memory: { team: [], money: 0, bag: { masterball: 1 } } };
				a.battleCheckpoint.result.partnerBag.masterball = 1; a.battleCheckpoint.state.fantasyRogue.partnerBag.masterball = 1;
			});
			const a = session().adventure;
			assert.deepEqual(member(guest).masterBallLedger, { remaining: 0, used: 1 }); assert(!member(guest).bag.masterball);
			assert(!member(guest).coopEvent.memory.bag.masterball); assert(!a.battleCheckpoint.result.partnerBag.masterball);
			assert(!a.battleCheckpoint.state.fantasyRogue.partnerBag.masterball); assert.equal(store.get(guest.id).masterBalls.used, 1);
		} finally { battle.destroy(); }
	});
	it('recovers a consumed ball and uncommitted capture from the trusted checkpoint after an interrupted callback', () => {
		claim(); const battle = startWild();
		try {
			const cp = throwBall(battle, guest), record = manager.coop.recordCapture;
			manager.coop.recordCapture = () => { throw new Error('interrupted capture write'); };
			try { assert.throws(() => created.rogue.onCheckpoint(cp), /interrupted capture write/); } finally { manager.coop.recordCapture = record; }
			assert.equal(store.get(guest.id).masterBalls.used, 1); assert(!store.get(guest.id).captures.mewtwo);
			newManager(); for (const user of [host, guest]) manager.coop.command(user, { action: 'recoverbattle' });
			assert.equal(store.get(guest.id).captures.mewtwo, 1); assert(!member(guest).bag.masterball);
			assert.equal(store.get(guest.id).masterBalls.used, 1);
			const restored = Battle.fromJSON(created.rogue.resumeCheckpoint.state);
			try { assert(!restored.fantasyRogue.partnerBag.masterball); } finally { restored.destroy(); }
		} finally { battle.destroy(); }
	});
	it('rolls back consumption and the checkpoint together on a failed session write', () => {
		claim(); const battle = startWild();
		try {
			const cp = throwBall(battle, host), saved = session(), account = store.get(host.id);
			store.db.exec("CREATE TEMP TRIGGER master_spend_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'spend failed'); END;");
			try { assert.throws(() => created.rogue.onCheckpoint(cp), /spend failed/); } finally { store.db.exec('DROP TRIGGER master_spend_fail'); }
			assert.deepEqual(session(), saved); assert.deepEqual(store.get(host.id), account);
			created.rogue.onCheckpoint(cp); assert.equal(store.get(host.id).masterBalls.used, 1);
		} finally { battle.destroy(); }
	});
	it('keeps all earlier Master Ball usage records while a new co-op adventure starts with no inherited stock', () => {
		claim(); const id = session().adventure.id;
		change(s => { s.status = 'abandoned'; });
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		assert.notEqual(session().adventure.id, id);
		for (const user of [host, guest]) {
			assert(!member(user).bag.masterball); assert(!member(user).masterBallLedger);
			assert.equal(store.get(user.id).masterBalls.obtained.length, 1);
		}
	});
});
