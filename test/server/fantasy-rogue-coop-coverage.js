'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { createRoguePokemon, rememberMove } = require('../../dist/server/fantasy-rogue/progression');
const { content, set } = require('../fixtures/fantasy-rogue');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const stats = value => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });

describe('Fantasy Rogue co-op coverage workshop and move equipment', () => {
	let oldConfig, store, engine, manager, host, guest;
	let serial = 0;
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content()); manager = new RogueManager(engine);
		host = makeUser(`Coverage Host ${++serial}`, `127.0.47.${serial}`);
		guest = makeUser(`Coverage Guest ${serial}`, `127.0.48.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = user => manager.coop.view(user).session.adventure;
	const choose = user => manager.coop.command(user, { action: 'eventchoice', value: 'study' });
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter(floor = 60) {
		change(shared => {
			shared.adventure.floor = floor;
			shared.adventure.routeChoices = [{ id: 'workshop', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(id => id !== 'coverageworkshop')
				.map(id => ({ id, floor: 1 }));
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'workshop' });
	}
	function grant() {
		enter(); choose(host); choose(guest);
	}
	function train(user, action = 'coverage', value = 'bodyslam', owner, slot = 0, target) {
		return manager.coop.command(user, { action, value, slot, owner,
			member: target || member(owner === guest.id ? guest : user).team[0].id });
	}

	it('keeps the floor 60 threshold and grants both rewards once after matching choices', () => {
		enter(59); assert.notEqual(view(host).coopEvent.id, 'coverageworkshop');
		change(shared => { shared.adventure.phase = 'area-selection'; delete shared.adventure.node; });
		enter(); assert.equal(view(host).coopEvent.id, 'coverageworkshop');
		assert.deepEqual(view(host).coopEvent.branchOptions, view(guest).coopEvent.branchOptions);
		choose(host); assert.equal(member(host).coverageLessons, undefined);
		manager.coop.command(host, { action: 'cancelevent' });
		choose(guest); assert.equal(member(guest).coverageLessons, undefined);
		choose(host);
		for (const user of [host, guest]) {
			assert.equal(member(user).coverageLessons.remaining, 1);
			assert.equal(member(user).coverageLessons.claimed.length, 1);
			assert.equal(member(user).coopEvent.settled, true);
		}
		assert.throws(() => choose(host), /变化/);
		assert.equal(member(host).coverageLessons.remaining, 1);
	});
	it('preserves unused lessons across leaving, manager recreation and later party additions', () => {
		grant();
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		manager = new RogueManager(new RogueEngine(store, content()));
		assert.equal(view(host).moveTraining.remaining, 1);
		let added;
		change(shared => {
			added = createRoguePokemon(set(), stats(0));
			shared.adventure.members[host.id].team.push(added);
		});
		train(host, 'coverage', 'bodyslam', undefined, 0, added.id);
		assert.equal(member(host).coverageLessons.remaining, 0);
		assert(member(host).team.find(mon => mon.id === added.id).moveMemory.some(move => move.id === 'bodyslam'));
		assert.equal(member(guest).coverageLessons.remaining, 1);
	});
	it('validates ownership and legal off-type moves, and saves personal unlocks without changing solo progress', () => {
		grant();
		store.change(host.id, account => { account.run.difficulty = 'easy'; account.run.startingBuilds = {}; });
		const before = session(), solo = store.get(host.id).run, guestAccount = store.get(guest.id);
		for (const move of ['protect', 'sludgebomb', 'thunderbolt']) {
			assert.throws(() => train(host, 'coverage', move), /合法/);
		}
		assert.throws(() => train(host, 'coverage', 'bodyslam', undefined, 0, member(guest).team[0].id), /合法/);
		assert.throws(() => train(host, 'coverage', 'bodyslam', guest.id), /只能提交自己/);
		assert.deepEqual(session(), before);
		train(host);
		assert.equal(member(host).coverageLessons.remaining, 0);
		assert(store.get(host.id).starterTraits.bulbasaur.moves.includes('bodyslam'));
		assert.deepEqual(store.get(host.id).run, solo);
		assert.deepEqual(store.get(guest.id), guestAccount);
		assert.throws(() => train(host), /合法/);
		assert.equal(member(host).coverageLessons.remaining, 0);
	});
	it('equips learned moves and swaps their slots without restoring spent PP or HP', () => {
		grant(); train(host);
		change(shared => {
			const mon = shared.adventure.members[host.id].team[0];
			mon.hp = 1; mon.pp[0].pp = 2;
		});
		train(host, 'setmove', 'bodyslam');
		assert.equal(member(host).team[0].set.moves[0], 'bodyslam');
		assert.equal(member(host).team[0].hp, 1);
		train(host, 'setmove', 'tackle');
		assert.equal(member(host).team[0].pp[0].pp, 2);
		train(host, 'setmove', 'growl');
		assert.deepEqual(member(host).team[0].set.moves.map(toID), ['growl', 'tackle']);
		train(host, 'setmove', 'growl');
		assert.equal(member(host).team[0].pp[1].pp, 2);
		assert.throws(() => train(host, 'setmove', 'thunderbolt'), /尚未学会/);
		assert.throws(() => train(host, 'setmove', 'bodyslam', undefined, 5), /位置无效/);
	});
	it('honors the five-move blessing and clears only the edited owner’s readiness', () => {
		grant();
		change(shared => {
			const adventure = shared.adventure, state = adventure.members[host.id];
			state.blessings = normalizeBlessings({ floor: 60, team: state.team, box: [], bag: {}, boosts: stats(0) });
			state.blessings.owned.push({ ...blessing('learnall'), floor: 60 });
			const mon = state.team[0]; mon.set.moves = ['tackle', 'growl', 'vinewhip', 'leechseed'];
			rememberMove(mon, 'bodyslam');
			adventure.phase = 'battle-selection';
			shared.battleSelections = { [host.id]: [mon.id], [guest.id]: [adventure.members[guest.id].team[0].id] };
			for (const key of ['continueSelections', 'retrySelections', 'routeExitSelections']) {
				adventure[key] = { [host.id]: true, [guest.id]: true };
			}
		});
		assert.equal(view(host).moveTraining.maxMoves, 5);
		train(host, 'setmove', 'bodyslam', undefined, 4);
		assert.equal(member(host).team[0].set.moves[4], 'bodyslam');
		assert.deepEqual(session().battleSelections[host.id], []);
		assert.equal(session().battleSelections[guest.id].length, 1);
		for (const key of ['continueSelections', 'retrySelections', 'routeExitSelections']) {
			assert.equal(session().adventure[key][host.id], undefined);
			assert.equal(session().adventure[key][guest.id], true);
		}
	});
	it('uses delegated resources only with current consent and revokes access immediately', () => {
		grant(); manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert(view(host).partnerMoveTraining);
		train(host, 'coverage', 'bodyslam', guest.id);
		assert.equal(member(host).coverageLessons.remaining, 1);
		assert.equal(member(guest).coverageLessons.remaining, 0);
		assert.throws(() => train(guest, 'setmove', 'bodyslam'), /操作权已移交/);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.equal(view(host).partnerMoveTraining, undefined);
		assert.throws(() => train(host, 'setmove', 'bodyslam', guest.id), /只能提交自己/);
		train(guest, 'setmove', 'bodyslam');
	});
	it('locks training during battle, waiting choices, full-party admission and trades', () => {
		grant();
		for (const phase of ['battle', 'battle-starting', 'complete', 'blessing-selection', 'blessing-reward']) {
			change(shared => { shared.adventure.phase = phase; });
			assert.equal(view(host).moveTraining, null);
			assert.throws(() => train(host), /共同战斗之外/);
		}
		change(shared => { shared.adventure.phase = 'route-interaction'; });
		for (const key of ['pendingMoves', 'pendingCaptures', 'tradeProposal']) {
			change(shared => {
				const state = shared.adventure.members[host.id];
				if (key === 'pendingMoves') state.pendingMoves = [{ member: state.team[0].id, move: 'sleeppowder' }];
				if (key === 'pendingCaptures') state.pendingCaptures = [createRoguePokemon(set(), stats(0))];
				if (key === 'tradeProposal') shared.adventure.tradeProposal = { id: 'pending', fromUser: host.id,
					fromMember: state.team[0].id, toMember: shared.adventure.members[guest.id].team[0].id, fee: 0, createdAt: Date.now() };
			});
			const before = session();
			assert(view(host).moveTraining.locked);
			assert.throws(() => train(host), /请先/);
			assert.throws(() => train(host, 'setmove', 'tackle'), /请先/);
			assert.deepEqual(session(), before);
			change(shared => { delete shared.adventure[key]; delete shared.adventure.members[host.id][key]; });
		}
	});
	it('rolls back account, lesson and member changes together when persistence fails', () => {
		grant(); const before = session(), account = store.get(host.id), original = store.change;
		store.change = function (userid, update) {
			return original.call(this, userid, saved => { update(saved); throw new Error('injected coverage write failure'); });
		};
		try { assert.throws(() => train(host), /injected coverage/); } finally { store.change = original; }
		assert.deepEqual(session(), before);
		assert.deepEqual(store.get(host.id), account);
		train(host); assert.equal(member(host).coverageLessons.remaining, 0);
	});
});
