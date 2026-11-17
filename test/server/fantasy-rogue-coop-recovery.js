'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { emergencyCost } = require('../../dist/server/fantasy-rogue/early-balance');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative personal recovery', () => {
	let store, manager, host, guest, oldConfig;
	let serial = 0;
	const saved = () => store.coopSessionForUser(host.id);
	const own = (user = host) => saved().adventure.members[user.id];
	function edit(change) {
		const session = saved(), revision = session.revision;
		change(session.adventure, session);
		session.revision++;
		store.updateCoopSession(session, revision);
	}
	function use(value, extra = {}, user = host) {
		return manager.coop.command(user, { action: 'useitem', id: randomUUID(), value,
			member: own(user).team[0].id, ...extra });
	}
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content();
		fixture.items.push(
			{ id: 'potion', name: '伤药', kind: 'heal', price: 20, amount: 5 },
			{ id: 'antidote', name: '解毒药', kind: 'cure', price: 20, cureStatuses: ['psn', 'tox'] },
			{ id: 'ether', name: '单招式 PP 回复', kind: 'ether', price: 20, amount: 5, singleMove: true }
		);
		store = new RogueStore(':memory:');
		manager = new RogueManager(new RogueEngine(store, fixture), () => ({ enabled: true }));
		host = makeUser(`Recover Host ${++serial}`, `127.1.5.${serial}`);
		guest = makeUser(`Recover Guest ${serial}`, `127.1.6.${serial}`);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		edit(adventure => {
			for (const member of Object.values(adventure.members)) {
				member.bag = { revive: 2, potion: 2, antidote: 1, ether: 2 };
				member.money = 5000;
			}
		});
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	it('counts only consumed bulk healing items in the owner history, once per request', () => {
		edit(adventure => {
			adventure.collapse = ['medicine'];
			const member = adventure.members[host.id]; member.bag.potion = 10; member.team[0].hp = 1;
		});
		const before = own(), partner = structuredClone(own(guest)), id = randomUUID();
		use('potion', { id, count: 10 });
		const after = own(), count = before.bag.potion - after.bag.potion;
		assert(count > 0); assert.equal(after.team[0].hp, after.team[0].maxhp);
		const history = Object.values(store.get(host.id).collapseHistory);
		assert.equal(history.reduce((n, entry) => n + (entry.triggers.medicine || 0), 0), count);
		use('potion', { id, count: 10 }); assert.deepEqual(own(), after); assert.deepEqual(own(guest), partner);
		assert.deepEqual(Object.values(store.get(host.id).collapseHistory), history);
	});
	it('revives from the private bag once and preserves the partner, PP and personal solo saves', () => {
		for (const user of [host, guest]) manager.engine.command(user.id, {
			action: 'start', id: randomUUID(), revision: store.get(user.id).revision, starters: ['bulbasaur'],
		}, user.name);
		edit(adventure => {
			const mon = adventure.members[host.id].team[0];
			mon.hp = 0; mon.pp[0].pp = 0;
			mon.status = 'psn'; mon.statuses = { psn: {} };
			adventure.phase = 'settlement'; adventure.battleResult = { won: false };
			adventure.retrySelections = { [host.id]: true, [guest.id]: true };
		});
		const partner = structuredClone(own(guest)), accounts = [store.get(host.id).run, store.get(guest.id).run];
		const before = saved();
		const view = manager.coop.view(host).session.adventure.recovery;
		assert.equal(view.emergency, false, 'available revival items take precedence over paid emergency');
		assert.equal(view.items.find(item => item.id === 'revive').targets[0].member, own().team[0].id);
		assert.deepEqual(saved(), before, 'rendering recovery options must not mutate the saved party');
		const id = randomUUID();
		use('revive', { id });
		const mon = own().team[0];
		assert.equal(mon.hp, Math.floor(mon.maxhp / 2)); assert.equal(mon.status, '');
		assert.equal(mon.statuses, undefined); assert.equal(mon.pp[0].pp, 0);
		assert.equal(own().bag.revive, 1); assert.equal(own().money, 5000);
		assert.deepEqual(own(guest), partner);
		assert.deepEqual(saved().adventure.retrySelections, { [guest.id]: true });
		const recovered = saved();
		use('revive', { id });
		assert.deepEqual(saved(), recovered, 'replayed request does not consume a second item or bump revision');
		assert.deepEqual([store.get(host.id).run, store.get(guest.id).run], accounts);
	});
	it('heals, cures and restores only the selected move PP using the shared single-player effects', () => {
		edit(adventure => {
			const mon = adventure.members[host.id].team[0];
			mon.hp = 1; mon.status = 'psn';
			mon.pp[0].pp = 0; mon.pp[1].pp = 0;
			mon.moveMemory.find(move => move.id === mon.pp[0].id).pp = 0;
		});
		use('potion'); assert.equal(own().team[0].hp, 6); assert.equal(own().bag.potion, 1);
		use('antidote'); assert.equal(own().team[0].status, ''); assert.equal(own().bag.antidote, 0);
		const before = saved();
		assert.throws(() => use('ether', { slot: 99 }), /请选择需要恢复 PP/);
		assert.deepEqual(saved(), before);
		use('ether', { slot: 0 });
		const mon = own().team[0];
		assert.equal(mon.pp[0].pp, 5); assert.equal(mon.pp[1].pp, 0);
		assert.equal(mon.moveMemory.find(move => move.id === mon.pp[0].id).pp, 5);
		assert.equal(own().bag.ether, 1);
	});
	it('requires an explicit paid emergency and charges only the chosen owner at the existing floor price', () => {
		edit(adventure => {
			adventure.floor = 45;
			const member = adventure.members[host.id];
			member.bag.revive = 0; member.team[0].hp = 0; member.team[0].pp[0].pp = 0;
		});
		const before = saved(), partner = structuredClone(own(guest));
		const quote = manager.coop.view(host).session.adventure.recovery;
		assert.equal(quote.emergency, true); assert.equal(quote.cost, emergencyCost(45));
		assert.deepEqual(saved(), before, 'viewing a wipe must not automatically spend any money');
		const command = { action: 'emergency', id: randomUUID() };
		manager.coop.command(host, command);
		assert.equal(own().money, 5000 - emergencyCost(45));
		const mon = own().team[0];
		assert.equal(mon.hp, mon.maxhp); assert.equal(mon.pp[0].pp, mon.pp[0].maxpp);
		const result = saved(); manager.coop.command(host, command); assert.deepEqual(saved(), result);
		assert.deepEqual(own(guest), partner);
	});
	it('rejects unaffordable emergency and all recovery during a battle or a no-healing stretch', () => {
		edit(adventure => {
			const member = adventure.members[host.id];
			member.bag.revive = 0; member.money = 0; member.team[0].hp = 0;
		});
		let before = saved();
		assert.throws(() => manager.coop.command(host, { action: 'emergency', id: randomUUID() }), /余额不足/);
		assert.deepEqual(saved(), before);
		edit(adventure => { adventure.phase = 'battle'; });
		before = saved();
		assert.equal(manager.coop.view(host).session.adventure.recovery, null);
		assert.throws(() => use('potion'), /共同战斗之外/); assert.deepEqual(saved(), before);
		edit(adventure => {
			adventure.phase = 'battle-selection'; adventure.encounter = 1;
			adventure.node = { id: 'locked', kind: 'wild', noHealing: true, encounters: [], reward: { money: 0, items: {} } };
		});
		before = saved();
		assert.equal(manager.coop.view(host).session.adventure.recovery.locked, true);
		assert.throws(() => use('potion'), /连续战斗/); assert.deepEqual(saved(), before);
	});
	it('enforces delegated ownership and invalidates only the recovered owner’s selected party', () => {
		edit((adventure, session) => {
			adventure.phase = 'battle-selection';
			for (const user of [host, guest]) {
				adventure.members[user.id].team[0].hp = 1;
				session.battleSelections[user.id] = [adventure.members[user.id].team[0].id];
			}
		});
		const target = own(guest).team[0].id;
		let before = saved();
		assert.throws(() => use('potion', { owner: guest.id, member: target }), /操作权|队伍|玩家/);
		assert.deepEqual(saved(), before);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert.deepEqual(saved().battleSelections[host.id], []);
		assert.deepEqual(saved().battleSelections[guest.id], []);
		assert.deepEqual(saved().battlePreviews[guest.id], [target]);
		// Control changes preserve drafts, but a fresh confirmation is required before recovery is tested.
		manager.coop.command(host, { action: 'selectbattle', members: [own().team[0].id],
			visit: manager.coop.view(host).session.adventure.battleSelectionKey });
		before = saved();
		assert.throws(() => use('potion', {}, guest), /操作权/); assert.deepEqual(saved(), before);
		assert(manager.coop.view(host).session.adventure.partnerRecovery);
		const hostBefore = structuredClone(own());
		use('potion', { owner: guest.id, member: target });
		assert.deepEqual(own(), hostBefore); assert.equal(own(guest).bag.potion, 1);
		assert.equal(own(guest).team[0].hp, 6);
		assert.deepEqual(saved().battleSelections[guest.id], []);
		assert.equal(saved().battlePreviews[guest.id], undefined);
		assert.deepEqual(saved().battleSelections[host.id], [own().team[0].id]);
	});
	it('does not consume items for healthy, foreign, egg, dead, or pending-learning targets', () => {
		for (const mutate of [
			adventure => { adventure.members[host.id].team[0].hp = own().team[0].maxhp; },
			adventure => { adventure.members[host.id].team[0].egg = { steps: 1 }; },
			adventure => { adventure.members[host.id].team[0].nuzlockeDead = true; },
			adventure => { adventure.members[host.id].pendingMoves = [{ member: own().team[0].id, move: 'tackle' }]; },
		]) {
			edit(adventure => {
				const member = adventure.members[host.id], mon = member.team[0];
				delete mon.egg; delete mon.nuzlockeDead;
				member.pendingMoves = []; mon.hp = 1;
				mutate(adventure);
			});
			const before = saved();
			assert.throws(() => use('potion')); assert.deepEqual(saved(), before);
		}
		edit(adventure => { adventure.members[host.id].pendingMoves = []; });
		const before = saved();
		assert.throws(() => use('revive', { member: own(guest).team[0].id })); assert.deepEqual(saved(), before);
	});
	it('preserves trade targets and reserved fees until the pending trade is resolved', () => {
		edit(adventure => {
			const member = adventure.members[host.id];
			member.team[0].hp = 1;
			adventure.tradeProposal = { id: randomUUID(), fromUser: host.id, toUser: guest.id,
				fromMember: member.team[0].id, toMember: adventure.members[guest.id].team[0].id,
				fee: 4000, createdAt: Date.now(), expiresAt: Date.now() + 60000 };
		});
		let before = saved();
		assert.throws(() => use('potion'), /交换请求/); assert.deepEqual(saved(), before);
		edit(adventure => {
			const member = adventure.members[host.id];
			member.team[0].hp = 0; member.bag.revive = 0;
		});
		before = saved();
		assert.throws(() => manager.coop.command(host, { action: 'emergency', id: randomUUID() }), /预留的交换费用/);
		assert.deepEqual(saved(), before);
	});
	it('does not treat eggs or permanently lost members as healthy retry or battle selections', () => {
		for (const flag of ['egg', 'nuzlockeDead']) {
			edit(adventure => {
				const mon = adventure.members[host.id].team[0];
				delete mon.egg; delete mon.nuzlockeDead; mon[flag] = flag === 'egg' ? { steps: 1 } : true;
				adventure.phase = 'settlement'; adventure.battleResult = { won: false };
			});
			assert.equal(manager.coop.view(host).session.adventure.canRetryBattle, false);
			assert.throws(() => manager.coop.command(host, { action: 'retrybattle' }), /没有可出战/);
			edit(adventure => { adventure.phase = 'battle-selection'; });
			const before = saved();
			assert.throws(() => manager.coop.command(host, { action: 'selectbattle', members: [own().team[0].id] }));
			assert.deepEqual(saved(), before);
		}
	});
});
