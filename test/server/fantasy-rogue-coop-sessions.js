'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { randomUUID } = crypto;
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon, rememberMove } = require('../../dist/server/fantasy-rogue/progression');
const { chooseEvent, EVENT_NAMES } = require('../../dist/server/fantasy-rogue/events');
const { Dex } = require('../../dist/sim/dex');
const { teachingMoves } = require('../../dist/server/fantasy-rogue/event-learning');
const { ROGUE_LINKING_CORD_PRICE } = require('../../dist/server/fantasy-rogue/economy');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative invitations and lobby records', () => {
	let oldLocal, store, engine, manager, host, guest, directory, filename, createdBattle;
	let serial = 0;
	beforeEach(() => {
		oldLocal = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true;
		Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-coop-'));
		filename = path.join(directory, 'cooperative.db');
		store = new RogueStore(filename);
		engine = new RogueEngine(store, content());
		createdBattle = null;
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue, cooperativeGuest) {
			createdBattle = { user, trainer, team, rogue, cooperativeGuest };
			return { roomid: 'battle-rogue-coop-test' };
		} }));
		host = makeUser(`Coop Host ${++serial}`, `127.0.9.${serial}`);
		guest = makeUser(`Coop Guest ${serial}`, `127.0.10.${serial}`);
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		assert.equal(path.dirname(directory), os.tmpdir());
		assert(directory.startsWith(path.join(os.tmpdir(), 'rogue-coop-')));
		fs.rmSync(directory, { recursive: true, force: true });
		Config.fantasyailocal = oldLocal.local;
		Config.bindaddress = oldLocal.bind;
		Config.fantasyrogue = oldLocal.rogue;
	});
	function forceSharedEvent(id) {
		const session = store.coopSessionForUser(host.id), revision = session.revision;
		const event = { id, key: randomUUID(), stage: 'choice' };
		session.adventure.node.event = event;
		session.adventure.node.name = EVENT_NAMES[id];
		for (const userid of [host.id, guest.id]) session.adventure.members[userid].coopEvent = structuredClone(event);
		session.revision++;
		store.updateCoopSession(session, revision);
	}
	function openSharedEvent(id, floor, configure) {
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		const session = store.coopSessionForUser(host.id), revision = session.revision;
		session.adventure.floor = floor;
		session.adventure.routeChoices = [{ id: 'event', name: '路途见闻', kind: 'event', encounters: [],
			reward: { money: 0, items: {} } }];
		configure?.(session.adventure);
		session.revision++;
		store.updateCoopSession(session, revision);
		manager.coop.command(host, { action: 'selectarea', value: 'event' });
		manager.coop.command(guest, { action: 'selectarea', value: 'event' });
		// Targeted interaction tests author their event explicitly; random selection has its own test.
		if (id) forceSharedEvent(id);
	}
	function selectEventBattle(choice) {
		manager.coop.command(host, { action: 'eventchoice', value: choice });
		assert.equal(manager.coop.view(host).session.adventure.phase, 'route-interaction');
		manager.coop.command(guest, { action: 'eventchoice', value: choice });
		assert.equal(manager.coop.view(host).session.adventure.phase, 'battle-selection');
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle',
			members: [manager.coop.view(user).session.adventure.team[0].id] });
		assert.equal(createdBattle.cooperativeGuest.user.id, guest.id);
		assert.equal(createdBattle.rogue.state.catchable, false, 'training battles must not allow catching the teacher’s team');
	}
	function settleEventBattle(won) {
		const state = createdBattle.rogue.state;
		const result = { encounterId: state.encounterId, won, turns: 2, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag } };
		if (!won) for (const mon of [...result.team, ...result.partnerTeam]) mon.hp = 0;
		createdBattle.rogue.onResult(result);
		assert.equal(manager.coop.view(host).session.adventure.battleResult.eventResolved, true);
		manager.coop.command(host, { action: 'continuebattle' });
		assert.equal(manager.coop.view(host).session.adventure.phase, 'settlement');
		manager.coop.command(guest, { action: 'continuebattle' });
		assert.equal(manager.coop.view(host).session.adventure.phase, 'route-interaction');
		return result;
	}

	it('queues full-party captures durably and pays the correct owner once after an explicit release', () => {
		openSharedEvent('mushrooms', 40, adventure => {
			const member = adventure.members[host.id];
			while (member.team.length < 6) member.team.push(createRoguePokemon({ ...member.team[0].set, level: 20 }, member.boosts));
		});
		let session = store.coopSessionForUser(host.id), revision = session.revision;
		const hostMember = session.adventure.members[host.id], guestMember = session.adventure.members[guest.id];
		session.adventure.phase = 'battle'; session.adventure.battleToken = 'release-token';
		session.adventure.encounterId = 'release-encounter';
		session.battleSelections = { [host.id]: [hostMember.team[0].id], [guest.id]: [guestMember.team[0].id] };
		session.revision++; store.updateCoopSession(session, revision);
		const captured = createRoguePokemon({ ...hostMember.team[0].set, species: 'Magikarp', name: 'Magikarp',
			ability: 'Swift Swim', moves: ['Splash'], level: 25 }, hostMember.boosts, 'release-encounter:foe:0');
		const result = { encounterId: 'release-encounter', team: [hostMember.team[0]], partnerTeam: guestMember.team,
			bag: hostMember.bag, partnerBag: guestMember.bag, captureOwners: { [captured.id]: 'p1' } };
		manager.coop.recordCapture(session.id, 'release-token', captured, result);
		manager.coop.recordCapture(session.id, 'release-token', captured, result);
		session = store.coopSessionForUser(host.id);
		assert.equal(session.adventure.members[host.id].pendingCaptures.length, 1);
		assert.equal(session.adventure.members[host.id].box.length, 0);
		assert.equal(session.adventure.members[host.id].team.length, 6);
		assert.throws(() => manager.coop.command(host, { action: 'replace', id: captured.id,
			member: hostMember.team[1].id, confirmed: true }), /战斗之外/);
		revision = session.revision; session.adventure.phase = 'settlement';
		session.adventure.battleResult = { won: true, capturedBy: host.id };
		session.revision++; store.updateCoopSession(session, revision);
		const durable = new RogueStore(filename);
		assert.equal(durable.coopSession(session.id).adventure.members[host.id].pendingCaptures[0].id, captured.id);
		durable.close();
		assert.throws(() => manager.coop.command(guest, { action: 'continuebattle' }), /安置满队/);
		assert.throws(() => manager.coop.command(guest, { action: 'replace', owner: host.id, id: captured.id,
			member: hostMember.team[1].id, confirmed: true }), /自己的选择/);
		const privateBefore = structuredClone(store.get(host.id).run), guestBefore = structuredClone(session.adventure.members[guest.id]);
		manager.coop.command(host, { action: 'replace', id: captured.id, member: hostMember.team[1].id, confirmed: true });
		const saved = store.coopSession(session.id), member = saved.adventure.members[host.id];
		assert.equal(member.team[1].id, captured.id); assert.equal(member.team.length, 6);
		assert.equal(member.pendingCaptures.length, 0);
		assert.equal(member.bag.expcandys, (hostMember.bag.expcandys || 0) + 1);
		assert.equal(member.bag.expcandyxs, (hostMember.bag.expcandyxs || 0) + 5);
		assert.deepEqual(saved.adventure.members[guest.id], guestBefore);
		assert.deepEqual(store.get(host.id).run, privateBefore);
		assert.throws(() => manager.coop.command(host, { action: 'replace', id: captured.id,
			member: hostMember.team[2].id, confirmed: true }), /已变化/);
		assert.deepEqual(store.coopSession(session.id), saved);
	});
	it('honors co-op delegation, trade locks and selection invalidation for ordinary releases', () => {
		openSharedEvent('mushrooms', 40, adventure => {
			for (const member of Object.values(adventure.members)) {
				member.team.push(createRoguePokemon({ ...member.team[0].set, level: 50 }, member.boosts));
			}
		});
		let session = store.coopSessionForUser(host.id), revision = session.revision;
		const target = session.adventure.members[guest.id].team[1].id;
		session.adventure.tradeProposal = { id: 'reserved', fromUser: host.id, fromMember: session.adventure.members[host.id].team[1].id, toMember: target, fee: 100, createdAt: Date.now() };
		session.revision++; store.updateCoopSession(session, revision);
		assert.throws(() => manager.coop.command(guest, { action: 'release', member: target, confirmed: true }), /交换请求/);
		session = store.coopSessionForUser(host.id); revision = session.revision;
		delete session.adventure.tradeProposal; session.adventure.phase = 'battle-selection';
		session.battleSelections[guest.id] = [target];
		session.revision++; store.updateCoopSession(session, revision);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert.throws(() => manager.coop.command(guest, { action: 'release', member: target, confirmed: true }), /已移交/);
		manager.coop.command(host, { action: 'release', owner: guest.id, member: target, confirmed: true });
		session = store.coopSessionForUser(host.id);
		assert.equal(session.adventure.members[guest.id].team.length, 1);
		assert.deepEqual(session.battleSelections[guest.id], []);
		assert.throws(() => manager.coop.command(host, { action: 'release', owner: guest.id,
			member: session.adventure.members[guest.id].team[0].id, confirmed: true }), /至少需要/);
	});
	it('lists only eligible online players and requires both accounts to unlock the selected tier', () => {
		const state = manager.coop.command(host, { action: 'search' });
		assert(state.players.some(player => player.userid === guest.id));
		assert(!state.players.some(player => player.userid === host.id));
		store.change(host.id, account => { account.difficulties = { highest: 1, cleared: ['0'], spirits: [] }; });
		assert.throws(() => manager.coop.command(host, {
			action: 'invite', target: guest.name, difficulty: 1,
		}), /对方不符合该档位游玩要求/);
		assert.deepEqual(store.coopInvitations(host.id), []);
	});

	it('accepts an invitation into a persistent lobby without changing either personal save', () => {
		const start = user => engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		start(host); start(guest);
		const hostRun = structuredClone(store.get(host.id).run);
		const guestRun = structuredClone(store.get(guest.id).run);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		assert(invite && invite.fromUser === host.id && invite.toUser === guest.id);
		const response = manager.coop.command(guest, { action: 'accept', id: invite.id });
		assert.equal(response.session.status, 'lobby');
		assert.equal(response.session.difficulty, 0);
		assert.deepEqual(store.get(host.id).run, hostRun);
		assert.deepEqual(store.get(guest.id).run, guestRun);
		assert.equal(manager.coop.view(host).session.id, response.session.id);
		assert.equal(store.coopInvitation(invite.id), undefined);
		assert.throws(() => manager.coop.command(guest, { action: 'accept', id: invite.id }), /已过期或你无权处理/);
		store.close(); store = new RogueStore(filename); engine = new RogueEngine(store, content());
		manager = new RogueManager(engine, () => ({ enabled: true }));
		assert.equal(manager.coop.view(host).session.id, response.session.id);
	});

	it('transfers co-op progression control and lets the receiver commit both route and party choices', () => {
		const start = user => engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		start(host); start(guest);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		manager.coop.command(guest, { action: 'accept', id: invite.id });
		manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] });
		manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });
		const hostMember = manager.coop.view(host).session.adventure.team[0].id;
		const guestMember = manager.coop.view(guest).session.adventure.team[0].id;
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.equal(manager.coop.view(host).session.delegatedTo, guest.id);
		assert.equal(manager.coop.view(host).session.canControl, false);
		assert.equal(manager.coop.view(guest).session.canControl, true);
		assert.throws(() => manager.coop.command(host, { action: 'selectarea', value: 'grass' }), /操作权已移交/);
		manager.coop.command(guest, { action: 'selectarea', value: 'grass' });
		assert.equal(manager.coop.view(guest).session.adventure.phase, 'battle-selection');
		manager.coop.command(guest, { action: 'selectbattle', owner: host.id, members: [hostMember] });
		manager.coop.command(guest, { action: 'selectbattle', owner: guest.id, members: [guestMember] });
		assert.equal(manager.coop.view(guest).session.adventure.phase, 'battle');
		assert.deepEqual(createdBattle.rogue.state.team.map(mon => mon.id), [hostMember]);
		assert.deepEqual(createdBattle.rogue.state.partner.team.map(mon => mon.id), [guestMember]);
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		assert.equal(manager.coop.view(host).session.delegatedTo, null);
		assert.equal(manager.coop.view(host).session.canControl, true);
	});

	it('validates and synchronizes each member\'s own starter selection without touching personal runs', () => {
		const start = user => engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		start(host); start(guest);
		const baseIVs = { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
		store.change(host.id, account => {
			account.starterTraits = { bulbasaur: { shiny: false, natures: ['modest'], genders: [], abilities: [], moves: [],
				ivs: { min: { ...baseIVs }, max: { ...baseIVs } } } };
		});
		const hostRun = structuredClone(store.get(host.id).run), guestRun = structuredClone(store.get(guest.id).run);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		const accepted = manager.coop.command(guest, { action: 'accept', id: invite.id });
		assert(accepted.starters.some(starter => starter.id === 'bulbasaur' && starter.available));
		assert.throws(() => manager.coop.command(host, { action: 'selectstarters', starters: ['not-a-starter'] }), /尚未解锁/);
		assert.throws(() => manager.coop.command(host, {
			action: 'selectstarters', starters: ['bulbasaur'], starterBuilds: { bulbasaur: { shiny: true } },
		}), /闪光/);
		assert.throws(() => manager.coop.command(host, {
			action: 'selectstarters', starters: ['bulbasaur'], starterBuilds: { bulbasaur: { nature: 'adamant' } },
		}), /性格/);
		manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'], starterBuilds: {
			bulbasaur: { nature: 'modest', gender: 'random', ability: 'random', ivs: { ...baseIVs } },
		} });
		manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });
		const hostView = manager.coop.view(host), guestView = manager.coop.view(guest);
		assert.equal(hostView.session.status, 'active');
		assert.equal(hostView.session.adventure.phase, 'area-selection');
		assert.equal(hostView.session.adventure.doubleBattle, true);
		assert.deepEqual(hostView.session.adventure.routeChoices.map(route => route.id), ['grass', 'lake', 'grove']);
		assert.equal(hostView.session.adventure.team.length, 1);
		assert.equal(hostView.session.adventure.partnerTeam.length, 1);
		assert.notEqual(hostView.session.adventure.team[0].id, hostView.session.adventure.partnerTeam[0].id);
		assert.equal(hostView.session.adventure.money, 100);
		assert(!Object.hasOwn(hostView.session.adventure, 'partnerMoney'));
		assert.deepEqual(hostView.session.starterSelection, ['bulbasaur']);
		assert.equal(hostView.session.starterBuildSelection.bulbasaur.nature, 'modest');
		assert.equal(hostView.session.starterBuildSelection.bulbasaur.gender, 'random');
		assert.equal(hostView.session.starterBuildSelection.bulbasaur.ability, 'random');
		assert.equal(hostView.session.starterBuildSelection.bulbasaur.shiny, false);
		assert.deepEqual(hostView.session.partnerStarterSelection, ['bulbasaur']);
		assert.deepEqual(guestView.session.partnerStarterSelection, ['bulbasaur']);
		const hostMemberId = hostView.session.adventure.team[0].id;
		const guestMemberId = guestView.session.adventure.team[0].id;
		assert.throws(() => manager.coop.command(host, { action: 'selectarea', value: 'invalid' }), /当前楼层的选项/);
		manager.coop.command(host, { action: 'selectarea', value: 'grass' });
		let selectionView = manager.coop.view(guest).session.adventure;
		assert.equal(selectionView.areaSelection, null);
		assert.equal(selectionView.partnerAreaSelection, 'grass');
		manager.coop.command(guest, { action: 'selectarea', value: 'lake' });
		selectionView = manager.coop.view(host).session.adventure;
		assert.equal(selectionView.phase, 'area-selection');
		assert.equal(selectionView.areaSelection, 'grass');
		assert.equal(selectionView.partnerAreaSelection, 'lake');
		// Either member can change a preselection to match the partner's route.
		manager.coop.command(host, { action: 'selectarea', value: 'lake' });
		selectionView = manager.coop.view(guest).session.adventure;
		assert.equal(selectionView.phase, 'battle-selection');
		assert.deepEqual(selectionView.selectedRoute, { id: 'lake', name: '测试湖泊', kind: 'wild' });
		assert.throws(() => manager.coop.command(host, { action: 'selectbattle', members: ['not-owned'] }), /自己的健康队伍/);
		manager.coop.command(host, { action: 'selectbattle', members: [hostMemberId] });
		manager.coop.command(guest, { action: 'selectbattle', members: [guestMemberId] });
		let battleView = manager.coop.view(host).session.adventure;
		assert.deepEqual(battleView.partnerBattleSelection, [guestMemberId]);
		assert.equal(battleView.phase, 'battle');
		assert.equal(manager.coop.view(host).session.roomid, 'battle-rogue-coop-test');
		assert.equal(createdBattle.user.id, host.id);
		assert.equal(createdBattle.cooperativeGuest.user.id, guest.id);
		assert.equal(createdBattle.trainer.format, 'gen9fantasyroguecoop');
		assert.deepEqual(createdBattle.rogue.state.team.map(mon => mon.id), [hostMemberId]);
		assert.deepEqual(createdBattle.rogue.state.partner.team.map(mon => mon.id), [guestMemberId]);
		const battleResult = {
			encounterId: createdBattle.rogue.state.encounterId, won: true, turns: 2, bag: {}, partnerBag: {},
			team: structuredClone(createdBattle.rogue.state.team),
			partnerTeam: structuredClone(createdBattle.rogue.state.partner.team),
		};
		battleResult.team[0].hp = 1;
		battleResult.partnerTeam[0].hp = 2;
		createdBattle.rogue.onResult(battleResult);
		battleView = manager.coop.view(host).session.adventure;
		assert.equal(battleView.phase, 'settlement');
		assert.equal(battleView.battleResult.won, true);
		assert.equal(battleView.team[0].hp, 1);
		assert.equal(battleView.partnerTeam[0].hp, 2);
		const settledRevision = manager.coop.view(host).session.revision;
		createdBattle.rogue.onResult(battleResult);
		assert.equal(manager.coop.view(host).session.revision, settledRevision);
		assert.deepEqual(store.get(host.id).run, hostRun);
		assert.deepEqual(store.get(guest.id).run, guestRun);
		store.close(); store = new RogueStore(filename); engine = new RogueEngine(store, content());
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue, cooperativeGuest) {
			createdBattle = { user, trainer, team, rogue, cooperativeGuest };
			return { roomid: 'battle-rogue-coop-test' };
		} }));
		assert.deepEqual(manager.coop.view(host).session.starterSelection, ['bulbasaur']);
		assert.equal(manager.coop.view(host).session.starterBuildSelection.bulbasaur.ability, 'random');
		assert.deepEqual(manager.coop.view(guest).session.partnerStarterSelection, ['bulbasaur']);
		assert.equal(manager.coop.view(host).session.adventure.phase, 'settlement');
		assert.equal(manager.coop.view(host).session.adventure.selectedRoute.id, 'lake');
		assert.deepEqual(manager.coop.view(guest).session.adventure.partnerBattleSelection, [hostMemberId]);
	});

	for (const kind of ['wild', 'trainer', 'reward']) it(`settles ${kind} candy conversion per owner with cap refunds and no duplicate grants`, () => {
		const { rebalanceCandyReward, candyExperience } = require('../../dist/server/fantasy-rogue/candy-rewards');
		const payout = rebalanceCandyReward(181, { expcandyxl: 10 });
		engine.content.floors[182] = structuredClone(engine.content.floors[1]);
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		const personalHost = structuredClone(store.get(host.id).run), personalGuest = structuredClone(store.get(guest.id).run);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		const session = store.coopSessionForUser(host.id), revision = session.revision;
		const node = structuredClone(engine.content.floors[1][0]);
		node.id = `candy-${kind}`; node.kind = kind; node.economyPrepared = true;
		node.encounters = kind === 'reward' ? [] : node.encounters.slice(0, 1);
		node.reward = kind === 'wild' ? { money: 0, items: {} } : { money: 30, ...payout };
		if (kind === 'wild') { node.wildLoot = [payout.items]; node.wildCandyTraining = [payout.candyTraining]; }
		session.adventure.floor = 181; session.adventure.routeChoices = [node];
		session.adventure.members[guest.id].growth = { offense: 12000, defense: 12000, experience: 0 };
		session.revision++; store.updateCoopSession(session, revision);
		manager.coop.command(host, { action: 'selectarea', value: node.id });
		assert.equal(candyExperience(manager.coop.view(host).session.adventure.bag), 0);
		manager.coop.command(guest, { action: 'selectarea', value: node.id });
		if (kind !== 'reward') {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle',
				members: [manager.coop.view(user).session.adventure.team[0].id] });
			const state = createdBattle.rogue.state, onResult = createdBattle.rogue.onResult;
			const result = { encounterId: state.encounterId, won: true, turns: 1,
				team: structuredClone(state.team), partnerTeam: structuredClone(state.partner.team),
				bag: { ...state.bag }, partnerBag: { ...state.partnerBag }, defeated: [] };
			onResult(result);
			const paid = store.coopSessionForUser(host.id);
			onResult(result); assert.deepEqual(store.coopSessionForUser(host.id), paid);
			if (kind === 'trainer') {
				manager.coop.command(host, { action: 'continuebattle' });
				assert.equal(candyExperience(manager.coop.view(host).session.adventure.bag), 0);
				manager.coop.command(guest, { action: 'continuebattle' });
				assert.throws(() => manager.coop.command(guest, { action: 'continuebattle' }), /结算/);
			}
		}
		const paid = store.coopSessionForUser(host.id), own = manager.coop.view(host).session.adventure,
			partner = manager.coop.view(guest).session.adventure;
		assert.equal(candyExperience(own.bag), 243000);
		assert.equal(candyExperience(partner.bag), 270000);
		assert.equal(paid.adventure.members[host.id].growth.offense, 27);
		assert.equal(paid.adventure.members[guest.id].growth.offense, 12000);
		assert.match(own.lastReward.effect, /训练心得/); assert.match(partner.lastReward.effect, /保留为糖果/);
		const reader = new RogueStore(filename);
		try { assert.deepEqual(reader.coopSessionForUser(host.id), paid); } finally { reader.close(); }
		assert.deepEqual(store.get(host.id).run, personalHost); assert.deepEqual(store.get(guest.id).run, personalGuest);
	});

	it('settles battle growth and duplicate shared drops per member, then waits for both continue choices', () => {
		engine.content.progression = 'mainline7';
		engine.content.floors[1][0].wildLoot = [{ pokeball: 2 }, {}, {}];
		const start = user => engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		start(host); start(guest);
		const personalHostRun = structuredClone(store.get(host.id).run);
		const personalGuestRun = structuredClone(store.get(guest.id).run);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		manager.coop.command(guest, { action: 'accept', id: invite.id });
		manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] });
		manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });
		const hostView = manager.coop.view(host).session.adventure;
		const guestView = manager.coop.view(guest).session.adventure;
		const hostMon = hostView.team[0].id, guestMon = guestView.team[0].id;
		const hostExperience = hostView.team[0].experience, guestExperience = guestView.team[0].experience;
		manager.coop.command(host, { action: 'selectarea', value: 'grass' });
		manager.coop.command(guest, { action: 'selectarea', value: 'grass' });
		manager.coop.command(host, { action: 'selectbattle', members: [hostMon] });
		manager.coop.command(guest, { action: 'selectbattle', members: [guestMon] });
		const battle = createdBattle.rogue.state;
		createdBattle.rogue.onResult({
			encounterId: battle.encounterId, won: true, turns: 2, bag: { pokeball: 10 }, partnerBag: { pokeball: 10 },
			team: structuredClone(battle.team), partnerTeam: structuredClone(battle.partner.team),
			defeated: [{ id: 'foe-1', species: 'Magikarp', level: 1, participants: [hostMon, guestMon], eligible: [hostMon, guestMon] }],
		});
		let settledHost = manager.coop.view(host).session.adventure;
		let settledGuest = manager.coop.view(guest).session.adventure;
		assert.equal(settledHost.phase, 'settlement');
		assert(settledHost.team[0].experience > hostExperience);
		assert(settledGuest.team[0].experience > guestExperience);
		assert(Object.values(settledHost.team[0].evs).some(value => value > 0));
		assert.equal(settledHost.bag.pokeball, 12);
		assert.equal(settledGuest.bag.pokeball, 12);
		assert.equal(settledHost.money, 100);
		assert.equal(settledGuest.money, 100);
		assert.equal(settledHost.battleResult.reward.items.pokeball, 2);
		manager.coop.command(host, { action: 'continuebattle' });
		assert.equal(manager.coop.view(host).session.adventure.continueSelection, true);
		assert.equal(manager.coop.view(guest).session.adventure.partnerContinueSelection, true);
		manager.coop.command(guest, { action: 'continuebattle' });
		let continued = manager.coop.view(host).session.adventure;
		assert.equal(continued.phase, 'battle-selection');
		assert.equal(continued.encounter, 1);
		assert.equal(continued.money, 100);
		const settleNext = () => {
			manager.coop.command(host, { action: 'selectbattle', members: [hostMon] });
			manager.coop.command(guest, { action: 'selectbattle', members: [guestMon] });
			const nextBattle = createdBattle.rogue.state;
			createdBattle.rogue.onResult({ encounterId: nextBattle.encounterId, won: true, turns: 1,
				bag: { ...nextBattle.bag }, partnerBag: { ...nextBattle.partnerBag },
				team: structuredClone(nextBattle.team), partnerTeam: structuredClone(nextBattle.partner.team), defeated: [] });
			manager.coop.command(host, { action: 'continuebattle' });
			manager.coop.command(guest, { action: 'continuebattle' });
		};
		settleNext();
		continued = manager.coop.view(host).session.adventure;
		assert.equal(continued.phase, 'battle-selection');
		assert.equal(continued.encounter, 2);
		settleNext();
		continued = manager.coop.view(host).session.adventure;
		assert.equal(continued.phase, 'area-selection');
		assert.equal(continued.floor, 2);
		assert.equal(continued.money, 130);
		assert.equal(manager.coop.view(guest).session.adventure.money, 130);
		assert.equal(continued.bag.pokeball, 12);
		assert.equal(continued.lastReward.money, 30);
		const reloadedStore = new RogueStore(filename);
		assert.deepEqual(reloadedStore.get(host.id).run, personalHostRun);
		assert.deepEqual(reloadedStore.get(guest.id).run, personalGuestRun);
		reloadedStore.close();
	});

	it('supports private paid healing at a shared rest center and waits for both exit confirmations', () => {
		const start = user => engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		start(host); start(guest);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		manager.coop.command(guest, { action: 'accept', id: invite.id });
		manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] });
		manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });
		const session = store.coopSessionForUser(host.id);
		session.adventure.floor = 9;
		session.adventure.routeChoices = [{ id: 'center', name: '宝可梦中心', kind: 'rest', encounters: [],
			reward: { money: 0, items: {} } }];
		const hostMember = session.adventure.members[host.id];
		const guestMoney = session.adventure.members[guest.id].money;
		hostMember.money = 1000;
		hostMember.team[0].hp -= 20;
		hostMember.team[0].status = 'par';
		const editedRevision = session.revision;
		session.revision++;
		store.updateCoopSession(session, editedRevision);
		manager.coop.command(host, { action: 'selectarea', value: 'center' });
		assert.equal(manager.coop.view(host).session.adventure.areaSelection, 'center');
		manager.coop.command(guest, { action: 'selectarea', value: 'center' });
		let view = manager.coop.view(host).session.adventure;
		assert.equal(view.phase, 'route-interaction');
		assert.equal(view.selectedRoute.kind, 'rest');
		assert.equal(view.centerCare.needed, true);
		const careCost = view.centerCare.cost;
		const fullHP = view.team[0].maxhp;
		manager.coop.command(host, { action: 'heal' });
		view = manager.coop.view(host).session.adventure;
		assert.equal(view.team[0].hp, fullHP);
		assert.equal(store.coopSessionForUser(host.id).adventure.members[host.id].team[0].status, '');
		assert.equal(view.money, 1000 - careCost);
		assert.equal(manager.coop.view(guest).session.adventure.money, guestMoney);
		assert.throws(() => manager.coop.command(host, { action: 'heal' }), /无需治疗/);
		const guestPokeballs = manager.coop.view(guest).session.adventure.bag.pokeball;
		const pokeballOffer = view.shopItems.find(item => item.id === 'pokeball');
		assert(pokeballOffer);
		manager.coop.command(host, { action: 'finishroute' });
		assert.equal(manager.coop.view(host).session.adventure.routeExitSelection, true);
		assert.equal(manager.coop.view(guest).session.adventure.partnerRouteExitSelection, true);
		manager.coop.command(host, { action: 'buy', id: 'rest-purchase-test-1', value: 'pokeball' });
		view = manager.coop.view(host).session.adventure;
		assert.equal(view.money, 1000 - careCost - pokeballOffer.price);
		assert.equal(view.bag.pokeball, 11);
		assert.equal(view.routeExitSelection, false);
		assert.equal(manager.coop.view(guest).session.adventure.money, guestMoney);
		assert.equal(manager.coop.view(guest).session.adventure.bag.pokeball, guestPokeballs);
		manager.coop.command(host, { action: 'buy', id: 'rest-purchase-test-1', value: 'pokeball' });
		assert.equal(manager.coop.view(host).session.adventure.bag.pokeball, 11);
		manager.coop.command(host, { action: 'finishroute' });
		assert.equal(manager.coop.view(guest).session.adventure.phase, 'route-interaction');
		manager.coop.command(guest, { action: 'finishroute' });
		view = manager.coop.view(host).session.adventure;
		assert.equal(view.phase, 'area-selection');
		assert.equal(view.floor, 10);
		assert.equal(view.routeExitSelection, false);
	});

	it('trades selected party members only after consent, charges the proposer once, and applies trade evolutions', () => {
		const tradeContent = content();
		tradeContent.progression = 'mainline7';
		for (const item of tradeContent.items) if (item.kind === 'ball') item.multiplier = item.id === 'pokeball' ? 1 : 0.01;
		engine = new RogueEngine(store, tradeContent);
		manager = new RogueManager(engine, () => ({ enabled: true }));
		const start = user => engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		start(host); start(guest);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		manager.coop.command(guest, { action: 'accept', id: invite.id });
		manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] });
		manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });
		let session = store.coopSessionForUser(host.id);
		const hostMember = session.adventure.members[host.id], guestMember = session.adventure.members[guest.id];
		const tradePokemon = (member, species, ability, move) => createRoguePokemon({
			...structuredClone(tradeContent.starters[0].set), species, name: species, ability, moves: [move],
		}, member.boosts, randomUUID());
		hostMember.team[0] = tradePokemon(hostMember, 'Machoke', 'Guts', 'lowkick');
		guestMember.team[0] = tradePokemon(guestMember, 'Haunter', 'Levitate', 'lick');
		hostMember.money = 6000; guestMember.money = 4000;
		hostMember.pendingMoves = [{ member: hostMember.team[0].id, move: 'tackle' }];
		guestMember.pendingMoves = [{ member: guestMember.team[0].id, move: 'growl' }];
		session.adventure.floor = 9;
		session.adventure.routeChoices = [{ id: 'center', name: '宝可梦中心', kind: 'rest', encounters: [],
			reward: { money: 0, items: {} } }];
		const editedRevision = session.revision;
		session.revision++;
		store.updateCoopSession(session, editedRevision);
		manager.coop.command(host, { action: 'selectarea', value: 'center' });
		manager.coop.command(guest, { action: 'selectarea', value: 'center' });
		session = store.coopSessionForUser(host.id);
		const offeredID = session.adventure.members[host.id].team[0].id;
		const requestedID = session.adventure.members[guest.id].team[0].id;
		assert.equal(ROGUE_LINKING_CORD_PRICE, 2500);
		session.adventure.members[host.id].money = ROGUE_LINKING_CORD_PRICE - 1;
		const insufficientRevision = session.revision;
		session.revision++;
		store.updateCoopSession(session, insufficientRevision);
		assert.throws(() => manager.coop.command(host, { action: 'proposetrade', member: offeredID,
			partnerMember: requestedID }), /余额不足/);
		session = store.coopSessionForUser(host.id);
		session.adventure.members[host.id].money = 6000;
		const fundsRevision = session.revision;
		session.revision++;
		store.updateCoopSession(session, fundsRevision);
		const propose = () => manager.coop.command(host, { action: 'proposetrade', member: offeredID,
			partnerMember: requestedID });
		const beforeTrade = () => store.coopSessionForUser(host.id).adventure;
		propose();
		let proposal = manager.coop.view(guest).session.adventure.tradeProposal;
		assert(proposal && !proposal.isProposer);
		assert.equal(proposal.fee, ROGUE_LINKING_CORD_PRICE);
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /先接受、拒绝或撤回/);
		assert.throws(() => manager.coop.command(host, { action: 'respondtrade', id: proposal.id, accept: true }), /不属于你/);
		manager.coop.command(host, { action: 'canceltrade', id: proposal.id });
		assert.equal(beforeTrade().members[host.id].money, 6000);
		propose();
		proposal = manager.coop.view(guest).session.adventure.tradeProposal;
		manager.coop.command(guest, { action: 'respondtrade', id: proposal.id, accept: false });
		assert.equal(beforeTrade().members[host.id].money, 6000);
		assert.equal(beforeTrade().members[host.id].team[0].set.species, 'Machoke');
		propose();
		proposal = manager.coop.view(guest).session.adventure.tradeProposal;
		manager.coop.command(guest, { action: 'respondtrade', id: proposal.id, accept: true });
		let adventure = beforeTrade();
		assert.equal(adventure.members[host.id].team[0].set.species, 'Gengar');
		assert.equal(adventure.members[guest.id].team[0].set.species, 'Machamp');
		assert.equal(adventure.members[host.id].money, 6000 - ROGUE_LINKING_CORD_PRICE);
		assert.equal(adventure.members[guest.id].money, 4000);
		assert.equal(adventure.members[host.id].bag.linkingcord || 0, 0);
		assert.equal(adventure.members[guest.id].bag.linkingcord || 0, 0);
		for (const userid of [host.id, guest.id]) {
			const member = adventure.members[userid];
			assert(member.pendingMoves.every(pending => member.team.some(mon => mon.id === pending.member)));
		}
		manager.coop.command(guest, { action: 'respondtrade', id: proposal.id, accept: true });
		assert.equal(beforeTrade().members[host.id].money, 6000 - ROGUE_LINKING_CORD_PRICE,
			'retrying the accepted request must not charge twice');
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		session = store.coopSessionForUser(host.id);
		const delegatedHostMember = session.adventure.members[host.id].team[0].id;
		const delegatedGuestMember = session.adventure.members[guest.id].team[0].id;
		assert.throws(() => manager.coop.command(host, { action: 'proposetrade', member: delegatedHostMember,
			partnerMember: delegatedGuestMember }), /操作权已移交/);
		const hostBalanceBeforeDelegatedSwap = beforeTrade().members[host.id].money;
		const guestBalanceBeforeDelegatedSwap = beforeTrade().members[guest.id].money;
		manager.coop.command(guest, { action: 'proposetrade', owner: host.id, member: delegatedHostMember,
			partnerMember: delegatedGuestMember });
		proposal = manager.coop.view(guest).session.adventure.tradeProposal;
		manager.coop.command(guest, { action: 'respondtrade', owner: guest.id, id: proposal.id, accept: true });
		assert.equal(beforeTrade().members[host.id].money, hostBalanceBeforeDelegatedSwap - ROGUE_LINKING_CORD_PRICE,
			'delegated trade still charges the account that initiated it');
		assert.equal(beforeTrade().members[guest.id].money, guestBalanceBeforeDelegatedSwap);
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
	});

	it('rolls persisted shared routes, allows withdrawing a route vote, duplicates supply rewards, and shares trade stock', () => {
		const routeContent = content();
		routeContent.events = true;
		routeContent.routePools = { 1: [
			{ id: 'wild', name: '野外', kind: 'wild', encounters: [], reward: { money: 0, items: {} } },
			{ id: 'elite', name: '精英', kind: 'elite', encounters: [], reward: { money: 0, items: {} } },
			{ id: 'trainer', name: '训练家', kind: 'trainer', encounters: [], reward: { money: 0, items: {} } },
			{ id: 'supplies', name: '旅途补给', kind: 'reward', encounters: [], reward: { money: 50, items: { revive: 1 } } },
			{ id: 'event', name: '路途见闻', kind: 'event', encounters: [], reward: { money: 0, items: {} } },
			{ id: 'trade', name: '交易', kind: 'trade', trade: { kind: 'mint', stock: [], purchases: 0 },
				encounters: [], reward: { money: 0, items: {} } },
		] };
		engine = new RogueEngine(store, routeContent, () => 0);
		manager = new RogueManager(engine, () => ({ enabled: true }));
		const start = user => engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		start(host); start(guest);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		manager.coop.command(guest, { action: 'accept', id: invite.id });
		manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] });
		manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });
		let adventure = manager.coop.view(host).session.adventure;
		assert.equal(adventure.routeChoices.length, 3);
		assert.equal(store.coopSessionForUser(host.id).adventure.routeHistory.floor, 1);
		assert(adventure.routeChoices.some(route => route.id === 'supplies'));
		const supplies = adventure.routeChoices.find(route => route.id === 'supplies');
		manager.coop.command(host, { action: 'selectarea', value: supplies.id });
		manager.coop.command(host, { action: 'cancelarea' });
		assert.equal(manager.coop.view(host).session.adventure.areaSelection, null);
		manager.coop.command(host, { action: 'selectarea', value: supplies.id });
		manager.coop.command(guest, { action: 'selectarea', value: supplies.id });
		adventure = manager.coop.view(host).session.adventure;
		assert.equal(adventure.phase, 'route-interaction');
		assert.equal(adventure.money, 150);
		assert.equal(manager.coop.view(guest).session.adventure.money, 150);
		assert.equal(adventure.bag.revive, 1);
		assert.equal(manager.coop.view(guest).session.adventure.bag.revive, 1);
		manager.coop.command(host, { action: 'finishroute' });
		manager.coop.command(guest, { action: 'finishroute' });
		const session = store.coopSessionForUser(host.id);
		session.adventure.routeChoices = [{ id: 'trade', name: '薄荷商店', kind: 'trade', encounters: [],
			trade: { kind: 'mint', stock: [{ id: 'pokeball', name: '测试球', kind: 'ball', price: 25, remaining: 1 }], purchases: 0 },
			reward: { money: 0, items: {} } }];
		const changedAt = session.revision;
		session.revision++;
		store.updateCoopSession(session, changedAt);
		manager.coop.command(host, { action: 'selectarea', value: 'trade' });
		manager.coop.command(guest, { action: 'selectarea', value: 'trade' });
		manager.coop.command(host, { action: 'buy', id: 'coop-trade-stock-1', value: 'pokeball' });
		adventure = manager.coop.view(guest).session.adventure;
		assert.equal(adventure.shopItems.length, 0, 'trade stock is shared between the two members');
		assert.equal(manager.coop.view(host).session.adventure.money, 125);
		assert.equal(adventure.money, 150);
		assert.equal(manager.coop.view(host).session.adventure.bag.pokeball, 11);
		assert.equal(adventure.bag.pokeball, 10);
		assert.throws(() => manager.coop.command(guest, { action: 'buy', id: 'coop-trade-stock-2', value: 'pokeball' }), /当前没有在休整商店出售/);
	});

	it('requires one shared training branch, then settles each player’s own effort target before exit', () => {
		const start = user => engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		start(host); start(guest);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		manager.coop.command(guest, { action: 'accept', id: invite.id });
		manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] });
		manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });
		let session = store.coopSessionForUser(host.id);
		session.adventure.floor = 24;
		session.adventure.routeChoices = [{ id: 'event', name: '路途见闻', kind: 'event', encounters: [],
			reward: { money: 0, items: {} } }];
		for (const userid of [host.id, guest.id]) {
			session.adventure.members[userid].team[0].set.evs.hp = 4;
		}
		const revision = session.revision;
		session.revision++;
		store.updateCoopSession(session, revision);
		manager.coop.command(host, { action: 'selectarea', value: 'event' });
		manager.coop.command(guest, { action: 'selectarea', value: 'event' });
		forceSharedEvent('martial');
		let hostView = manager.coop.view(host).session.adventure;
		assert.equal(hostView.selectedRoute.kind, 'event');
		assert.equal(hostView.coopEvent.id, 'martial');
		assert(hostView.coopEvent.branchOptions.some(option => option.id === 'skill' && !option.disabled));
		manager.coop.command(host, { action: 'eventchoice', value: 'skill' });
		manager.coop.command(guest, { action: 'eventchoice', value: 'leave' });
		hostView = manager.coop.view(host).session.adventure;
		assert.equal(hostView.coopEvent.branchResolved, false, 'different public branches cannot resolve early');
		assert.equal(hostView.coopEvent.partnerChoice, 'leave');
		manager.coop.command(guest, { action: 'eventchoice', value: 'skill' });
		hostView = manager.coop.view(host).session.adventure;
		const guestView = manager.coop.view(guest).session.adventure;
		assert.equal(hostView.coopEvent.branchResolved, true);
		const hostMon = hostView.team[0], guestMon = guestView.team[0];
		manager.coop.command(host, { action: 'eventchoice', value: 'member:' + encodeURIComponent(hostMon.id) });
		manager.coop.command(guest, { action: 'eventchoice', value: 'member:' + encodeURIComponent(guestMon.id) });
		manager.coop.command(host, { action: 'eventchoice', value: 'allocate', evs: {
			hp: 0, atk: 4, def: 0, spa: 0, spd: 0, spe: 0,
		} });
		assert.equal(manager.coop.view(host).session.adventure.coopEvent.ownComplete, true);
		assert.equal(manager.coop.view(host).session.adventure.coopEvent.partnerComplete, false);
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /完成双方的目标步骤/);
		manager.coop.command(guest, { action: 'eventchoice', value: 'allocate', evs: {
			hp: 0, atk: 4, def: 0, spa: 0, spd: 0, spe: 0,
		} });
		manager.coop.command(host, { action: 'finishroute' });
		manager.coop.command(guest, { action: 'finishroute' });
		session = store.coopSessionForUser(host.id);
		assert.equal(session.adventure.floor, 25);
		assert.equal(session.adventure.phase, 'area-selection');
		assert.equal(session.adventure.members[host.id].team[0].set.evs.atk, 4);
		assert.equal(session.adventure.members[guest.id].team[0].set.evs.atk, 4);
	});

	it('settles the shared mushroom branch into each member without changing solo saves', () => {
		const start = user => engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		start(host); start(guest);
		const hostSolo = structuredClone(store.get(host.id).run), guestSolo = structuredClone(store.get(guest.id).run);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		manager.coop.command(guest, { action: 'accept', id: invite.id });
		manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] });
		manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });
		let session = store.coopSessionForUser(host.id);
		session.adventure.floor = 25;
		session.adventure.coopEventHistory = [{ id: 'martial', floor: 23 }, { id: 'tutor', floor: 24 }];
		session.adventure.routeChoices = [{ id: 'event', name: '路途见闻', kind: 'event', encounters: [],
			reward: { money: 0, items: {} } }];
		session.adventure.members[host.id].money = 0;
		session.adventure.members[host.id].growth = { offense: 300, defense: 200, experience: 100 };
		session.adventure.members[guest.id].money = 10000;
		session.adventure.members[guest.id].growth = { offense: 700, defense: 500, experience: 250 };
		const revision = session.revision;
		session.revision++;
		store.updateCoopSession(session, revision);
		manager.coop.command(host, { action: 'selectarea', value: 'event' });
		manager.coop.command(guest, { action: 'selectarea', value: 'event' });
		forceSharedEvent('mushrooms');
		let event = manager.coop.view(host).session.adventure.coopEvent;
		assert.equal(event.id, 'mushrooms');
		assert.equal(event.branchOptions.find(option => option.id === 'trade').disabled, true,
			'a branch costing money is disabled for both when either member cannot pay');
		manager.coop.command(host, { action: 'eventchoice', value: 'leave' });
		assert.equal(manager.coop.view(host).session.adventure.coopEvent.branchResolved, false,
			'one vote cannot resolve a shared branch');
		manager.coop.command(guest, { action: 'eventchoice', value: 'leave' });
		event = manager.coop.view(host).session.adventure.coopEvent;
		assert.equal(event.branchResolved, true);
		assert.equal(event.ownComplete, true);
		assert.equal(event.partnerComplete, true);
		session = store.coopSessionForUser(host.id);
		assert.equal(session.adventure.members[host.id].money, 0);
		assert.equal(session.adventure.members[guest.id].money, 10000);
		assert.deepEqual(session.adventure.members[host.id].growth, { offense: 300, defense: 200, experience: 100 });
		assert.deepEqual(session.adventure.members[guest.id].growth, { offense: 700, defense: 500, experience: 250 });
		assert(session.adventure.members[host.id].blessings);
		assert(session.adventure.members[guest.id].blessings);
		assert.deepEqual(store.get(host.id).run, hostSolo);
		assert.deepEqual(store.get(guest.id).run, guestSolo);
		manager.coop.command(host, { action: 'finishroute' });
		manager.coop.command(guest, { action: 'finishroute' });
		assert.equal(store.coopSessionForUser(host.id).adventure.floor, 26);
	});

	it('uses the original training floor gates and still has an early event after a repeated mushroom visit', () => {
		openSharedEvent(null, 1);
		const early = manager.coop.view(host).session.adventure.coopEvent;
		assert(early?.branchOptions.some(option => !option.disabled), 'an early route offers a usable common event');
		assert(!['martial', 'tutor', 'coverageworkshop', 'pokeflute', 'feathers'].includes(early.id),
			'adding more early events must not open gated training or later activities');
		const allowed = new Set(['martial', 'tutor', 'mushrooms']), run = store.get(host.id).run;
		for (const [floor, expected] of [[1, ['mushrooms']], [19, ['mushrooms']],
			[20, ['martial', 'mushrooms']], [24, ['martial', 'mushrooms']], [25, ['martial', 'mushrooms', 'tutor']]]) {
			run.floor = floor;
			const drawn = new Set(Array.from({ length: 100 }, (_, n) => chooseEvent(run, max => Math.floor(n * max / 100), allowed)));
			assert.deepEqual([...drawn].sort(), expected, `floor ${floor}`);
		}
		run.floor = 2; run.eventHistory = [{ id: 'mushrooms', floor: 1 }];
		assert.equal(chooseEvent(run, () => 0, allowed), 'mushrooms');
	});

	for (const [choice, roll] of [['trade', 74], ['trade', 75], ['taste', 64], ['taste', 65]]) {
		it(`rolls mushroom ${choice}/${roll} once for both players, with independent wallets and no duplicate claim`, () => {
			openSharedEvent('mushrooms', 61, adventure => {
				adventure.members[host.id].money = choice === 'trade' ? 10000 : 1;
				adventure.members[guest.id].money = choice === 'trade' ? 20000 : 10000;
				adventure.members[guest.id].bag.pokeball += 7;
			});
			const before = store.coopSessionForUser(host.id).adventure.members;
			const solo = [host, guest].map(user => structuredClone(store.get(user.id).run));
			let outcomeRolls = 0;
			const original = crypto.randomInt;
			try {
				crypto.randomInt = max => max === 100 ? (++outcomeRolls === 1 ? roll : roll < 65 ? 99 : 0) : 0;
				manager.coop.command(host, { action: 'eventchoice', value: choice });
				assert.equal(outcomeRolls, 0, 'a single vote must not consume a random outcome or resources');
				manager.coop.command(guest, { action: 'eventchoice', value: choice });
			} finally { crypto.randomInt = original; }
			assert.equal(outcomeRolls, 1, 'the shared event must not independently roll for the guest');
			const session = store.coopSessionForUser(host.id), members = session.adventure.members;
			const result = members[host.id].coopEvent.mushroomOutcome;
			assert.deepEqual(result, members[guest.id].coopEvent.mushroomOutcome);
			for (const [index, user] of [host, guest].entries()) {
				const member = members[user.id], previous = before[user.id];
				assert.equal(member.coopEvent.settled, true);
				assert.deepEqual(store.get(user.id).run, solo[index]);
				if (choice === 'trade') {
					assert.equal(result.treasures, roll < 75);
					assert.equal(member.money, previous.money - result.cost + result.money);
					const gained = Object.fromEntries(Object.entries(member.bag)
						.map(([id, count]) => [id, count - (previous.bag[id] || 0)]).filter(([, count]) => count));
					assert.deepEqual(gained, result.items, 'both backpacks receive the same public reward');
					assert.deepEqual(manager.coop.view(user).session.adventure.lastReward.items, gained);
					assert.equal(manager.coop.view(user).session.adventure.lastReward.money, result.money - result.cost);
				} else if (roll < 65) {
					assert.deepEqual(member.team[0].training, { offense: 300, defense: 300 });
					assert.equal(member.money, previous.money);
				} else {
					assert(!member.team[0].training);
					assert(member.money < previous.money && member.money >= 0);
				}
			}
			assert.throws(() => manager.coop.command(host, { action: 'eventchoice', value: choice }), /选项已变化/);
			assert.deepEqual(store.coopSessionForUser(host.id), session);
		});
	}

	it('returns a shared martial battle to per-owner rewards, including reserves, and persists partially claimed grants', () => {
		openSharedEvent('martial', 24, adventure => {
			for (const member of Object.values(adventure.members)) {
				member.team[0].set.evs.hp = 4;
				member.team.push({ ...structuredClone(member.team[0]), id: randomUUID() });
			}
		});
		const solo = [host, guest].map(user => structuredClone(store.get(user.id).run));
		selectEventBattle('power');
		const result = settleEventBattle(true);
		assert.equal(manager.coop.view(host).session.adventure.floor, 24);
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /完成双方的目标步骤/);
		for (const user of [host, guest]) {
			const grants = store.coopSessionForUser(user.id).adventure.members[user.id].coopEvent.service.grants;
			assert.equal(grants.length, 2, 'the unselected reserve also receives one training opportunity');
			for (const grant of grants) {
				manager.coop.command(user, { action: 'eventchoice', value: 'member:' + grant.member });
				manager.coop.command(user, { action: 'eventchoice', value: 'allocate',
					evs: { hp: 4, atk: grant.amount, def: 0, spa: 0, spd: 0, spe: 0 } });
				const settled = store.coopSessionForUser(host.id);
				createdBattle.rogue.onResult(result);
				assert.deepEqual(store.coopSessionForUser(host.id), settled, 'late duplicate battle callbacks cannot restore claimed grants');
			}
			if (user === host) {
				assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /完成双方的目标步骤/);
				// Reopen only the isolated test database, preserving the half-completed event.
				store.close(); store = new RogueStore(filename); engine = new RogueEngine(store, content());
				manager = new RogueManager(engine, () => ({ enabled: true }));
				assert.equal(manager.coop.view(host).session.adventure.coopEvent.ownComplete, true);
				assert.equal(manager.coop.view(host).session.adventure.coopEvent.partnerComplete, false);
				// Use the reloaded coordinator for an equivalent delayed callback.
				const session = store.coopSessionForUser(host.id);
				createdBattle.rogue.onResult = value => manager.coop.settleBattle(session.id, session.adventure.battleToken, value);
			}
		}
		for (const [index, user] of [host, guest].entries()) {
			const member = store.coopSessionForUser(user.id).adventure.members[user.id];
			assert(member.team.every(mon => mon.set.evs.hp === 4 && mon.set.evs.atk === 8));
			assert.deepEqual(store.get(user.id).run, solo[index]);
			manager.coop.command(user, { action: 'finishroute' });
		}
		assert.equal(store.coopSessionForUser(host.id).adventure.floor, 25);
	});

	it('ends a lost teacher challenge without granting rewards or trapping fainted teams in the battle result', () => {
		openSharedEvent('martial', 24);
		selectEventBattle('power'); settleEventBattle(false);
		const event = manager.coop.view(host).session.adventure.coopEvent;
		assert(event.ownComplete && event.partnerComplete);
		assert.throws(() => manager.coop.command(host, { action: 'retrybattle' }), /共同战斗结算/);
		for (const user of [host, guest]) {
			assert.equal(manager.coop.view(user).session.adventure.team[0].hp, 0);
			assert(!store.coopSessionForUser(user.id).adventure.members[user.id].coopEvent.service.grants);
			manager.coop.command(user, { action: 'finishroute' });
		}
		assert.equal(store.coopSessionForUser(host.id).adventure.floor, 25);
	});

	it('lets either teammate demonstrate a fantasy move, then awards each owner one legal lesson per partner', () => {
		const fantasy = Dex.mod('gen9fantasy').moves.all().find(move => move.exists && !move.isZ && !move.isMax &&
			!move.id.startsWith('rogue') && !Dex.mod('gen9').moves.get(move.id).exists);
		assert(fantasy);
		openSharedEvent('tutor', 25, adventure => {
			rememberMove(adventure.members[guest.id].team[0], fantasy.id);
		});
		assert.equal(manager.coop.view(host).session.adventure.coopEvent.branchOptions.find(option => option.id === 'fantasy').disabled, false);
		const balances = [host, guest].map(user => manager.coop.view(user).session.adventure.money);
		const solo = [host, guest].map(user => structuredClone(store.get(user.id).run));
		selectEventBattle('fantasy'); settleEventBattle(true);
		for (const [index, user] of [host, guest].entries()) {
			const view = manager.coop.view(user).session.adventure;
			manager.coop.command(user, { action: 'eventchoice', value: 'member:' + view.team[0].id });
			const picker = manager.coop.view(user).session.adventure.coopEvent.picker.options;
			const chosen = picker.find(option => !option.disabled);
			assert(chosen);
			manager.coop.command(user, { action: 'eventchoice', value: chosen.id });
			const member = store.coopSessionForUser(user.id).adventure.members[user.id];
			assert(member.team[0].moveMemory.some(slot => slot.id === chosen.id.slice(5)));
			assert(store.get(user.id).starterTraits.bulbasaur.moves.includes(chosen.id.slice(5)));
			assert.equal(member.money, balances[index], 'battle reward lessons are free');
			assert.deepEqual(store.get(user.id).run, solo[index]);
		}
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(store.coopSessionForUser(host.id).adventure.floor, 26);
	});

	it('teaches a separately targeted move to each member and charges only that member', () => {
		const start = user => engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		start(host); start(guest);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		manager.coop.command(guest, { action: 'accept', id: invite.id });
		manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] });
		manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });
		let session = store.coopSessionForUser(host.id);
		session.adventure.floor = 25;
		session.adventure.routeChoices = [{ id: 'event', name: '路途见闻', kind: 'event', encounters: [],
			reward: { money: 0, items: {} } }];
		session.adventure.members[host.id].money = 10000;
		session.adventure.members[guest.id].money = 20000;
		const initialRevision = session.revision;
		session.revision++;
		store.updateCoopSession(session, initialRevision);
		manager.coop.command(host, { action: 'selectarea', value: 'event' });
		manager.coop.command(guest, { action: 'selectarea', value: 'event' });
		// Force the authored tutor branch so this regression is deterministic regardless of the event roll.
		session = store.coopSessionForUser(host.id);
		const tutor = { id: 'tutor', key: randomUUID(), stage: 'choice' };
		session.adventure.node.name = '旅行教学'; session.adventure.node.event = tutor;
		for (const userid of [host.id, guest.id]) session.adventure.members[userid].coopEvent = structuredClone(tutor);
		const eventRevision = session.revision;
		session.revision++;
		store.updateCoopSession(session, eventRevision);
		manager.coop.command(host, { action: 'eventchoice', value: 'ask' });
		manager.coop.command(guest, { action: 'eventchoice', value: 'ask' });
		let eventView = manager.coop.view(host).session.adventure.coopEvent;
		const hostTarget = eventView.options.find(option => option.id.startsWith('member:'));
		eventView = manager.coop.view(guest).session.adventure.coopEvent;
		const guestTarget = eventView.options.find(option => option.id.startsWith('member:'));
		assert(hostTarget && guestTarget);
		manager.coop.command(host, { action: 'eventchoice', value: hostTarget.id });
		manager.coop.command(guest, { action: 'eventchoice', value: guestTarget.id });
		const hostPicker = manager.coop.view(host).session.adventure.coopEvent.picker.options[0];
		const guestPicker = manager.coop.view(guest).session.adventure.coopEvent.picker.options[0];
		assert(hostPicker && guestPicker);
		assert(teachingMoves(store.coopSessionForUser(host.id).adventure.members[host.id].team[0]).includes(hostPicker.id.slice(5)));
		manager.coop.command(host, { action: 'eventchoice', value: hostPicker.id });
		manager.coop.command(guest, { action: 'eventchoice', value: guestPicker.id });
		session = store.coopSessionForUser(host.id);
		assert(session.adventure.members[host.id].money < 10000);
		assert(session.adventure.members[guest.id].money < 20000);
		assert(session.adventure.members[host.id].coopEvent.settled);
		assert(session.adventure.members[guest.id].coopEvent.settled);
		const taught = hostPicker.id.slice(5);
		assert(store.get(host.id).starterTraits.bulbasaur.moves.includes(taught));
		assert(!store.get(guest.id).starterTraits?.bulbasaur?.moves.includes(taught) ||
			store.get(guest.id).starterTraits.bulbasaur.moves.includes(guestPicker.id.slice(5)));
	});

	it('authorizes cancel and decline by invitation role and removes the persistent record', () => {
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		assert.throws(() => manager.coop.command(host, { action: 'decline', id: invite.id }), /无权处理/);
		manager.coop.command(guest, { action: 'decline', id: invite.id });
		assert.equal(store.coopInvitation(invite.id), undefined);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const cancelled = store.coopInvitations(guest.id)[0];
		manager.coop.command(host, { action: 'cancel', id: cancelled.id });
		assert.equal(store.coopInvitation(cancelled.id), undefined);
	});

	it('records a co-op 200-floor clear for both owners without writing mainline progress or replacing solo saves', () => {
		const start = user => engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		start(host); start(guest);
		const hostRun = structuredClone(store.get(host.id).run);
		const guestRun = structuredClone(store.get(guest.id).run);
		store.change(host.id, account => {
			account.difficulties = { highest: 0, cleared: [], spirits: [] };
			account.mainline = { version: 1, completed: ['s0-1'], pity: {} };
		});
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		manager.coop.command(guest, { action: 'accept', id: invite.id });
		manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] });
		manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });

		let session = store.coopSessionForUser(host.id);
		const adventure = session.adventure;
		adventure.floor = 200;
		adventure.phase = 'settlement';
		adventure.battleResult = { won: true };
		adventure.node = { id: 'summit', name: '塔顶最终战', kind: 'boss', encounters: [
			{ name: '塔顶最终战', team: [], catchable: false },
		], reward: { money: 0, items: {} } };
		const expectedRevision = session.revision;
		session.revision++;
		store.updateCoopSession(session, expectedRevision);
		manager.coop.command(host, { action: 'continuebattle' });
		manager.coop.command(guest, { action: 'continuebattle' });

		session = store.coopSession(session.id);
		assert.equal(session.status, 'complete');
		assert.equal(session.adventure.phase, 'complete');
		const completedRevision = session.revision;
		session.revision++;
		session.updatedAt++;
		store.updateCoopSession(session, completedRevision);
		for (const [user, partner, beforeRun] of [
			[host, guest.name, hostRun], [guest, host.name, guestRun],
		]) {
			const history = store.history(user.id);
			assert.equal(history.total, 1);
			assert.equal(history.records[0].outcome, 'complete');
			assert.equal(history.records[0].floor, 200);
			assert.deepEqual(history.records[0].cooperative, { partnerName: partner });
			assert.deepEqual(store.get(user.id).run, beforeRun);
		}
		const hostAccount = store.get(host.id), guestAccount = store.get(guest.id);
		assert.deepEqual(hostAccount.difficulties.cleared, ['0']);
		assert.equal(hostAccount.difficulties.highest, 1, 'pre-existing chapter completion should satisfy the original paired unlock condition');
		assert.deepEqual(hostAccount.mainline.completed, ['s0-1']);
		assert.deepEqual(guestAccount.difficulties.cleared, ['0']);
		assert.equal(guestAccount.difficulties.highest, 0, 'a co-op clear alone must not unlock the next tier');
		assert.equal(guestAccount.mainline, undefined, 'co-op completion must not create mainline or secret-area progress');
	});
});
