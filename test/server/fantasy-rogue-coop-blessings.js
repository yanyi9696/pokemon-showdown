'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { Battle } = require('../../dist/sim/battle');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { battleUnity } = require('../../dist/sim/rogue-unity');
const { roguePowerModifiers } = require('../../dist/sim/fantasy-rogue-blessings');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op blessing rounds', () => {
	let oldConfig, store, engine, manager, host, guest, rogueContent, createdBattle;
	let serial = 0;
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true;
		Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		rogueContent = content(); rogueContent.blessings = true;
		store = new RogueStore(':memory:');
		engine = new RogueEngine(store, rogueContent);
		createdBattle = null;
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue, cooperativeGuest) {
			createdBattle = { user, trainer, team, rogue, cooperativeGuest };
			return { roomid: 'battle-rogue-coop-blessing-test' };
		} }));
		host = makeUser(`Blessing Host ${++serial}`, `127.0.11.${serial}`);
		guest = makeUser(`Blessing Guest ${serial}`, `127.0.12.${serial}`);
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	function startCoop() {
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		manager.coop.command(guest, { action: 'accept', id: invite.id });
		manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] });
		manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });
		assert.equal(manager.coop.view(host).session.adventure.phase, 'blessing-selection');
	}
	function forceRound(ids, refreshes = 1) {
		const session = store.coopSessionForUser(host.id), expected = session.revision;
		const round = { floor: 1, tier: 'silver', remaining: 1, topClearMindEligible: false,
			familiesSeen: [], idsSeen: [...ids], options: ids.map(id => ({ id, tier: 'silver', refreshes, chosen: false })) };
		session.adventure.coopBlessingRound = structuredClone(round);
		for (const userid of [host.id, guest.id]) session.adventure.members[userid].blessings.round = structuredClone(round);
		session.revision++;
		store.updateCoopSession(session, expected);
		return round;
	}
	function roundIDs(user) {
		return manager.coop.view(user).session.adventure.coopBlessing.round.options.map(option => option.id);
	}
	function change(update) {
		const session = store.coopSessionForUser(host.id), revision = session.revision;
		update(session); session.revision++; store.updateCoopSession(session, revision);
	}
	function assertUnchanged(session, accounts) {
		assert.deepEqual(store.coopSessionForUser(host.id), session);
		for (const [index, user] of [host, guest].entries()) assert.deepEqual(store.get(user.id), accounts[index]);
	}
	for (const failAt of ['session', 'guest-account']) {
		it(`rolls both chosen blessings back on ${failAt} failure and notifies only after retry commits`, () => {
			startCoop(); forceRound(['lowhp', 'swapstats', 'supercombo']);
			manager.coop.command(host, { action: 'blessingchoice', slot: 1 });
			const before = store.coopSessionForUser(host.id), accounts = [host, guest].map(user => store.get(user.id));
			const update = store.updateCoopSession, changeAccount = store.change, send = host.send;
			let notices = 0;
			try {
				host.send = message => {
					if (String(message).includes('blessingChoice')) {
						notices++;
						assert.equal(store.coopSessionForUser(host.id).adventure.phase, 'area-selection');
					}
				};
				if (failAt === 'session') {
					store.updateCoopSession = (...args) => { update.apply(store, args); throw new Error('choice write failed'); };
				} else {
					store.change = (...args) => {
						const saved = changeAccount.apply(store, args);
						if (args[0] === guest.id) throw new Error('choice write failed');
						return saved;
					};
				}
				assert.throws(() => manager.coop.command(guest, { action: 'blessingchoice', slot: 1 }), /choice write failed/);
				assertUnchanged(before, accounts); assert.equal(notices, 0);
				store.updateCoopSession = update; store.change = changeAccount;
				manager.coop.command(guest, { action: 'blessingchoice', slot: 1 });
				for (const user of [host, guest]) {
					const state = store.coopSessionForUser(user.id).adventure.members[user.id].blessings;
					assert.equal(state.owned.filter(entry => entry.id === 'swapstats').length, 1);
				}
				assert.equal(notices, 1);
			} finally { store.updateCoopSession = update; store.change = changeAccount; host.send = send; }
		});
	}
	it('saves a selected partner gift and permanent traits together using the co-op source, not a paused solo charm run', () => {
		startCoop();
		store.change(host.id, account => { account.run.difficulty = 'easy'; account.run.startingBuilds = {}; });
		change(session => {
			session.adventure.phase = 'blessing-reward';
			session.adventure.coopBlessingResume = 'opening';
			delete session.adventure.coopBlessingRound;
			for (const user of [host, guest]) {
				const state = session.adventure.members[user.id].blessings;
				delete state.round;
				state.pending = user === host ? [{ id: 'partner-gift', title: '伙伴赠礼', kind: 'starter', options: ['Magikarp'] }] : [];
			}
		});
		const before = store.coopSessionForUser(host.id), accounts = [host, guest].map(user => store.get(user.id));
		const update = store.updateCoopSession, send = guest.send;
		const command = { action: 'blessingreward', member: 'partner-gift', value: 'Magikarp' };
		let notices = 0;
		try {
			guest.send = message => { if (String(message).includes('blessingReward')) notices++; };
			store.updateCoopSession = (...args) => { update.apply(store, args); throw new Error('gift write failed'); };
			assert.throws(() => manager.coop.command(host, command), /gift write failed/);
			assertUnchanged(before, accounts); assert.equal(notices, 0);
			store.updateCoopSession = update;
			manager.coop.command(host, command);
			const account = store.get(host.id), saved = store.coopSessionForUser(host.id);
			const gift = saved.adventure.members[host.id].blessings.pending[0];
			assert.equal(gift.kind, 'gift'); assert.equal(account.captures.magikarp, 1);
			assert(account.starterTraits.magikarp.natures.includes(toID(gift.pokemon.set.nature)));
			assert(account.starterTraits.magikarp.moves.includes('splash'));
			assert.deepEqual(account.run, accounts[0].run);
			assert.deepEqual(store.get(guest.id), accounts[1]); assert.equal(notices, 1);
			assert.throws(() => manager.coop.command(host, command), /步骤已变化/);
			assert.equal(store.get(host.id).captures.magikarp, 1);
		} finally { store.updateCoopSession = update; guest.send = send; }
	});
	for (const action of ['finishroute', 'continuebattle']) {
		it(`atomically completes the floor and its account gift through ${action}`, () => {
			startCoop(); forceRound(['lowhp', 'swapstats', 'supercombo']);
			for (const user of [host, guest]) manager.coop.command(user, { action: 'blessingchoice', slot: 1 });
			const isEvent = action === 'finishroute';
			change(session => {
				const adventure = session.adventure;
				adventure.floor = 50; adventure.encounter = 0;
				adventure.phase = isEvent ? 'route-interaction' : 'settlement';
				adventure.node = { id: 'ending', name: '本层最后节点', kind: isEvent ? 'event' : 'wild',
					encounters: [], reward: { money: 37, items: {} } };
				if (isEvent) {
					adventure.node.event = { id: 'mushrooms', key: 'settled-event', stage: 'result', settled: true };
					adventure.coopEventBranchResolved = true;
				} else {
					adventure.battleResult = { won: true, turns: 1, reward: { money: 0, items: {} } };
				}
				for (const user of [host, guest]) {
					const member = adventure.members[user.id], family = isEvent ? 'eventtask' : 'battletask';
					member.blessings.owned.push({ id: family, family, tier: 'silver', floor: 1, progress: 14 });
					if (isEvent) member.coopEvent = structuredClone(adventure.node.event);
				}
			});
			manager.coop.command(host, { action });
			const before = store.coopSessionForUser(host.id), accounts = [host, guest].map(user => store.get(user.id));
			const update = store.updateCoopSession, random = crypto.randomInt, send = host.send;
			let notices = 0;
			try {
				crypto.randomInt = max => max === 6 ? 5 : 0;
				host.send = message => { if (String(message).includes('fantasyroguecoopnotice')) notices++; };
				store.updateCoopSession = (...args) => { update.apply(store, args); throw new Error('floor write failed'); };
				assert.throws(() => manager.coop.command(guest, { action }), /floor write failed/);
				assertUnchanged(before, accounts); assert.equal(notices, 0);
				store.updateCoopSession = update;
				manager.coop.command(guest, { action });
				const saved = store.coopSessionForUser(host.id);
				assert.equal(saved.adventure.phase, 'blessing-reward');
				assert.equal(saved.adventure.floor, 50);
				for (const user of [host, guest]) {
					const state = saved.adventure.members[user.id].blessings;
					assert.equal(state.completed.filter(floor => floor === 50).length, 1);
					assert.equal(state.pending.filter(reward => reward.kind === 'gift').length, 1);
					assert.equal(store.get(user.id).captures.magikarp, 1);
				}
				assert.equal(notices, 1);
				assert.throws(() => manager.coop.command(guest, { action }));
				assert.equal(store.get(host.id).captures.magikarp, 1);
			} finally { store.updateCoopSession = update; crypto.randomInt = random; host.send = send; }
		});
	}

	it('uses one shared offer and grants it to both only after matching votes', () => {
		startCoop(); forceRound(['lowhp', 'swapstats', 'supercombo']);
		assert.deepEqual(roundIDs(host), roundIDs(guest));
		manager.coop.command(host, { action: 'blessingchoice', slot: 0 });
		assert.equal(store.coopSessionForUser(host.id).adventure.members[host.id].blessings.owned.length, 0);
		manager.coop.command(guest, { action: 'blessingchoice', slot: 2 });
		assert.equal(store.coopSessionForUser(host.id).adventure.members[guest.id].blessings.owned.length, 0);
		manager.coop.command(guest, { action: 'blessingchoice', slot: 1 });
		manager.coop.command(host, { action: 'blessingchoice', slot: 1 });
		const session = store.coopSessionForUser(host.id);
		for (const userid of [host.id, guest.id]) {
			assert(session.adventure.members[userid].blessings.owned.some(entry => entry.id === 'swapstats'));
			assert(!session.adventure.members[userid].blessings.owned.some(entry => entry.id === 'lowhp'));
		}
		assert.equal(session.adventure.phase, 'area-selection');
	});

	it('keeps solo mainline and secret-area story routes out of co-op', () => {
		startCoop();
		const accounts = [host, guest].map(user => structuredClone(store.get(user.id)));
		const session = store.coopSessionForUser(host.id), expected = session.revision;
		session.adventure.phase = 'area-selection';
		const encounter = structuredClone(rogueContent.floors[1][0].encounters[0]);
		session.adventure.routeChoices = [
			{ id: 'secret-mainline', name: '秘闻区域', kind: 'story',
				mainlineScene: 's0-1', encounters: [], reward: { money: 0, items: {} } },
			{ id: 'secret-battle', name: '秘闻对战', kind: 'story',
				encounters: [encounter], reward: { money: 0, items: {} } },
			{ id: 'old-secret', name: '旧版秘闻配置', kind: 'wild',
				mainlineScene: 's0-1', encounters: [encounter], reward: { money: 0, items: {} } },
		];
		session.revision++;
		store.updateCoopSession(session, expected);
		assert.deepEqual(manager.coop.view(host).session.adventure.routeChoices, [], 'secret routes are hidden entirely');
		for (const route of session.adventure.routeChoices) {
			assert.throws(() => manager.coop.command(host, { action: 'selectarea', value: route.id }), /联机冒险不进入秘闻/);
		}
		const legacy = store.coopSessionForUser(host.id), revision = legacy.revision;
		legacy.adventure.node = legacy.adventure.routeChoices[1];
		legacy.adventure.phase = 'battle-selection';
		legacy.revision++;
		store.updateCoopSession(legacy, revision);
		assert.throws(() => manager.coop.command(host, { action: 'selectbattle',
			members: [legacy.adventure.members[host.id].team[0].id] }), /联机冒险不进入秘闻/);
		assert.equal(createdBattle, null);
		for (const [index, user] of [host, guest].entries()) assert.deepEqual(store.get(user.id), accounts[index]);
	});

	it('requires shared cancellable consent to migrate an old secret node without rewards, resource resets or personal story writes', () => {
		startCoop(); forceRound(['lowhp', 'swapstats', 'supercombo']);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'blessingchoice', slot: 1 });
		const session = store.coopSessionForUser(host.id), revision = session.revision;
		session.adventure.node = { id: 'legacy-secret', name: '旧秘闻', kind: 'wild', mainlineScene: 's0-1',
			encounters: [], reward: { money: 99999, items: { potion: 99 } } };
		session.adventure.phase = 'settlement'; session.adventure.battleResult = { won: true };
		for (const [index, member] of Object.values(session.adventure.members).entries()) {
			member.team[0].hp--; member.team[0].status = 'par'; member.money = 137 + index * 100;
			member.bag.pokeball = 2 + index;
		}
		session.revision++; store.updateCoopSession(session, revision);
		const accounts = [store.get(host.id), store.get(guest.id)], members = structuredClone(session.adventure.members);
		const recovery = manager.coop.view(host).session.storyRecovery;
		assert.equal(recovery.available, true);
		assert.throws(() => manager.coop.command(host, { action: 'continuebattle' }), /联机冒险不进入秘闻/);
		manager.coop.command(host, { action: 'recoverroute', id: recovery.key });
		assert.equal(store.coopSessionForUser(host.id).adventure.node.id, 'legacy-secret');
		manager.coop.command(host, { action: 'recoverroute', id: recovery.key, accept: false });
		assert.equal(manager.coop.view(host).session.storyRecovery.selections[host.id], false);
		manager.coop.command(host, { action: 'recoverroute', id: recovery.key });
		manager.coop.command(guest, { action: 'recoverroute', id: recovery.key });
		const migrated = store.coopSessionForUser(host.id);
		assert.equal(migrated.adventure.floor, 1); assert.equal(migrated.adventure.phase, 'area-selection');
		assert.equal(migrated.adventure.node, undefined); assert.equal(migrated.adventure.battleResult, undefined);
		assert.deepEqual(migrated.adventure.members, members);
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		assert.equal(manager.coop.view(host).session.storyRecovery, null);
		assert(migrated.adventure.routeChoices.some(node => node.id === 'grass'));
		assert(!migrated.adventure.routeChoices.some(node => node.kind === 'story' || node.mainlineScene));
		assert.throws(() => manager.coop.command(guest, { action: 'recoverroute', id: recovery.key }), /已失效/);
		assert.equal(createdBattle, null);
	});
	it('repairs secret-only legacy choices while paused under delegated control without rerolling blessings', () => {
		startCoop(); forceRound(['lowhp', 'swapstats', 'supercombo']);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'blessingchoice', slot: 1 });
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		manager.coop.command(host, { action: 'leave', id: store.coopSessionForUser(host.id).id });
		const session = store.coopSessionForUser(host.id), revision = session.revision;
		session.adventure.routeChoices = [{ id: 'old-only-secret', name: '旧秘闻', kind: 'story', encounters: [],
			reward: { money: 0, items: {} } }];
		session.revision++; store.updateCoopSession(session, revision);
		const before = structuredClone(session.adventure.members), recovery = manager.coop.view(guest).session.storyRecovery;
		assert(recovery.available);
		assert.throws(() => manager.coop.command(host, { action: 'recoverroute', id: recovery.key }), /操作权/);
		manager.coop.command(guest, { action: 'recoverroute', id: recovery.key });
		const migrated = store.coopSessionForUser(host.id);
		assert.equal(migrated.status, 'paused'); assert.equal(migrated.adventure.phase, 'area-selection');
		assert.deepEqual(migrated.adventure.members, before);
		assert(migrated.adventure.routeChoices.some(node => node.id === 'grass'));
	});
	it('keeps legacy progress when the content has no ordinary replacement for the same floor', () => {
		startCoop(); forceRound(['lowhp', 'swapstats', 'supercombo']);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'blessingchoice', slot: 1 });
		const session = store.coopSessionForUser(host.id), revision = session.revision;
		const secret = { id: 'no-replacement', name: '旧秘闻', kind: 'story', encounters: [], reward: { money: 0, items: {} } };
		engine.content.floors[1] = [secret]; session.adventure.routeChoices = [secret];
		session.revision++; store.updateCoopSession(session, revision);
		const key = manager.coop.view(host).session.storyRecovery.key;
		manager.coop.command(host, { action: 'recoverroute', id: key });
		const before = store.coopSessionForUser(host.id);
		assert.throws(() => manager.coop.command(guest, { action: 'recoverroute', id: key }), /没有同层普通区域/);
		assert.deepEqual(store.coopSessionForUser(host.id), before);
	});
	it('runs shared milestone blessings after a non-battle route instead of skipping floor completion', () => {
		startCoop(); forceRound(['lowhp', 'swapstats', 'supercombo']);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'blessingchoice', slot: 1 });
		const session = store.coopSessionForUser(host.id), revision = session.revision;
		session.adventure.floor = 50;
		session.adventure.routeChoices = [{ id: 'supplies', name: '旅途补给', kind: 'reward',
			encounters: [], reward: { money: 20, items: {} } }];
		session.revision++;
		store.updateCoopSession(session, revision);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'supplies' });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		const adventure = store.coopSessionForUser(host.id).adventure;
		assert.equal(adventure.floor, 50);
		assert.equal(adventure.phase, 'blessing-selection');
		assert.equal(adventure.coopBlessingRound.floor, 50);
		assert.deepEqual(roundIDs(host), roundIDs(guest));
	});

	it('refreshes a shared slot only after both players vote for the same refresh', () => {
		startCoop();
		const original = forceRound(['lowhp', 'swapstats', 'supercombo']);
		manager.coop.command(host, { action: 'blessingchoice', mode: 'refresh', slot: 0 });
		assert.deepEqual(roundIDs(host), original.options.map(option => option.id));
		manager.coop.command(guest, { action: 'blessingchoice', mode: 'refresh', slot: 0 });
		const hostRound = roundIDs(host), guestRound = roundIDs(guest);
		assert.deepEqual(hostRound, guestRound);
		assert.notEqual(hostRound[0], 'lowhp');
		assert.equal(store.coopSessionForUser(host.id).adventure.phase, 'blessing-selection');
	});

	it('rerolls shared quality once only after matching votes and persists use for both', () => {
		startCoop(); forceRound(['lowhp', 'swapstats', 'supercombo']);
		manager.coop.command(host, { action: 'blessingchoice', mode: 'quality' });
		assert.equal(store.coopSessionForUser(host.id).adventure.members[host.id].blessings.qualityRerolled, undefined);
		manager.coop.command(guest, { action: 'blessingchoice', mode: 'quality' });
		const session = store.coopSessionForUser(host.id);
		assert.notEqual(session.adventure.coopBlessingRound.tier, 'silver');
		assert.deepEqual(roundIDs(host), roundIDs(guest));
		for (const userid of [host.id, guest.id]) assert.equal(session.adventure.members[userid].blessings.qualityRerolled, true);
		assert.throws(() => manager.coop.command(host, { action: 'blessingchoice', mode: 'quality' }), /机会已使用/);
	});

	it('completes personal floor rewards before opening one common milestone round', () => {
		startCoop();
		const session = store.coopSessionForUser(host.id), expected = session.revision;
		session.adventure.floor = 50;
		manager.coop.completeCoopFloor(session, session.adventure);
		session.revision++;
		store.updateCoopSession(session, expected);
		const hostState = manager.coop.view(host).session.adventure;
		const guestState = manager.coop.view(guest).session.adventure;
		assert.equal(hostState.phase, 'blessing-selection');
		assert.deepEqual(hostState.coopBlessing.round.options.map(option => option.id),
			guestState.coopBlessing.round.options.map(option => option.id));
		for (const userid of [host.id, guest.id]) {
			assert(store.coopSessionForUser(userid).adventure.members[userid].blessings.completed.includes(50));
		}
	});

	it('applies all shared types to each owner’s full party in a real four-seat battle', () => {
		startCoop();
		change(session => {
			for (const user of [host, guest]) session.adventure.members[user.id].team = Array.from({ length: 6 }, () =>
				createRoguePokemon(set(user === host ? 'Blaziken' : 'Gyarados', 'Run Away', 50, ['Splash']), stats(0)));
		});
		forceRound(['unity', 'lowhp']);
		manager.coop.command(host, { action: 'blessingchoice', slot: 0 });
		manager.coop.command(guest, { action: 'blessingchoice', slot: 0 });
		assert.equal(manager.coop.view(host).session.adventure.phase, 'area-selection');
		manager.coop.command(host, { action: 'selectarea', value: 'grass' });
		manager.coop.command(guest, { action: 'selectarea', value: 'grass' });
		const adventure = manager.coop.view(host).session.adventure;
		manager.coop.command(host, { action: 'selectbattle', members: adventure.team.slice(0, 3).map(m => m.id) });
		manager.coop.command(guest, { action: 'selectbattle', members: adventure.partnerTeam.slice(0, 3).map(m => m.id) });
		const state = createdBattle.rogue.state;
		assert.equal(state.blessings.unityParty.length, 6); assert.equal(state.partner.blessings.unityParty.length, 6);
		assert.equal(store.coopSessionForUser(host.id).adventure.members[host.id].blessings.unityParty, undefined);
		const battle = new Battle({ formatid: 'gen9fantasyroguecoop', fantasyRogue: structuredClone(state), seed: [1, 2, 3, 4],
			p1: { team: state.team.map(m => m.set) }, p3: { team: state.partner.team.map(m => m.set) },
			p2: { team: [set('Mew', 'Run Away', 50, ['Splash'])] }, p4: { team: [set('Mew', 'Run Away', 50, ['Splash'])] } });
		try {
			battle.makeChoices('team 123', 'team 1', 'team 123', 'team 1');
			const a = battle.p1.active[0], b = battle.p3.active[0];
			assert.deepEqual(battleUnity(a), { types: ['Fire', 'Fighting'], count: 6, active: true });
			assert.deepEqual(battleUnity(b), { types: ['Water', 'Flying'], count: 6, active: true });
			for (const [mon, moves] of [[a, ['flamethrower', 'aurasphere']], [b, ['watergun', 'airslash']]]) {
				for (const id of moves) assert.deepEqual(roguePowerModifiers(mon, battle.dex.getActiveMove(id))
					.filter(m => m.source === '统一队爱好者').map(m => m.factor), [1.5]);
			}
			assert(!battleUnity(battle.p2.active[0]).active); assert(!battleUnity(battle.p4.active[0]).active);
			battle.p3.pokemon[1].setType(['Water']);
			assert.deepEqual(battleUnity(b).types, ['Water']);
			assert.deepEqual(battleUnity(a).types, ['Fire', 'Fighting']);
			// A nonselected owner member still constrains Unity; selected three cannot bypass it.
			battle.fantasyRogue.partner.blessings.unityParty[5].types = ['Normal'];
			assert(!battleUnity(b).active); assert(battleUnity(a).active);
		} finally { battle.destroy(); }
	});
	it('migrates legacy co-op Unity choices atomically and leaves other pending gifts intact', () => {
		startCoop(); forceRound(['lowhp']);
		change(session => {
			const adventure = session.adventure;
			adventure.phase = 'blessing-reward'; adventure.coopBlessingRound.remaining = 0;
			for (const userid of [host.id, guest.id]) {
				const state = adventure.members[userid].blessings;
				state.owned = [{ ...blessing('unity'), floor: 1, type: 'Grass' }];
				state.pending = [{ id: 'old-unity', kind: 'unity', blessing: 'unity', options: ['Grass'] }];
				delete state.round;
			}
			adventure.members[guest.id].blessings.pending.push({ id: 'keep', kind: 'item', title: 'Keep', options: ['oranberry'] });
		});
		const before = store.coopSessionForUser(host.id), update = store.updateCoopSession;
		try {
			store.updateCoopSession = (...args) => { update.apply(store, args); throw new Error('migration write failed'); };
			assert.throws(() => manager.coop.view(host), /migration write failed/);
			assert.deepEqual(store.coopSessionForUser(host.id), before);
		} finally { store.updateCoopSession = update; }
		manager.coop.view(host);
		let saved = store.coopSessionForUser(host.id);
		assert.equal(saved.adventure.phase, 'blessing-reward');
		assert.deepEqual(saved.adventure.members[host.id].blessings.pending, []);
		assert.deepEqual(saved.adventure.members[guest.id].blessings.pending.map(r => r.id), ['keep']);
		change(session => {
			session.adventure.members[guest.id].blessings.pending =
				[{ id: 'old-unity', kind: 'unity', blessing: 'unity', options: ['Grass'] }];
		});
		assert.equal(manager.coop.view(guest).session.adventure.phase, 'area-selection');
		saved = store.coopSessionForUser(host.id);
		manager.coop.view(host); assert.deepEqual(store.coopSessionForUser(host.id), saved);
	});
	it('settles blessing effects and modified loot into each owner’s own result', () => {
		startCoop(); forceRound(['lowhp', 'swapstats', 'supercombo']);
		manager.coop.command(host, { action: 'blessingchoice', slot: 1 });
		manager.coop.command(guest, { action: 'blessingchoice', slot: 1 });
		manager.coop.command(host, { action: 'selectarea', value: 'grass' });
		manager.coop.command(guest, { action: 'selectarea', value: 'grass' });
		const selected = store.coopSessionForUser(host.id), selectedRevision = selected.revision;
		selected.adventure.node.wildLoot = [{ pokeball: 5 }, {}, {}];
		selected.revision++;
		store.updateCoopSession(selected, selectedRevision);
		const adventure = manager.coop.view(host).session.adventure;
		manager.coop.command(host, { action: 'selectbattle', members: [adventure.team[0].id] });
		manager.coop.command(guest, { action: 'selectbattle', members: [adventure.partnerTeam[0].id] });
		assert(createdBattle);
		const battle = createdBattle.rogue.state;
		createdBattle.rogue.onResult({
			encounterId: battle.encounterId, won: true, turns: 1,
			team: structuredClone(battle.team), partnerTeam: structuredClone(battle.partner.team),
			bag: { ...battle.bag }, partnerBag: { ...battle.partnerBag }, defeated: [],
			blessingEffects: { owned: [], companions: [{ id: 'guzma' }], psychic: 21 },
			partnerBlessingEffects: { owned: [], companions: [], psychic: 37 },
			blessingProgress: { kos: [], swords: 0, insight: {} },
			partnerBlessingProgress: { kos: [], swords: 0, insight: {} },
		});
		const hostResult = manager.coop.view(host).session.adventure.battleResult;
		const guestResult = manager.coop.view(guest).session.adventure.battleResult;
		assert.deepEqual(hostResult.reward.items, { pokeball: 6 });
		assert.deepEqual(hostResult.partnerReward.items, { pokeball: 5 });
		assert.deepEqual(guestResult.reward, hostResult.reward);
		assert.deepEqual(guestResult.partnerReward, hostResult.partnerReward);
		const settled = store.coopSessionForUser(host.id).adventure.members;
		assert.equal(settled[host.id].blessings.psychic, 21);
		assert.equal(settled[guest.id].blessings.psychic, 37);
	});
});
