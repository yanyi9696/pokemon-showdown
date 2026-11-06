'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op adventure outcomes and fishing', () => {
	let oldConfig, store, engine, manager, host, guest, created, preview;
	let serial = 0, oldNow, now, oldRandom;
	before(() => { preview = createPreviewContent(); });
	beforeEach(() => {
		oldNow = Date.now; now = oldNow(); Date.now = () => now;
		oldRandom = crypto.randomInt;
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true;
		fixture.items = [...fixture.items, ...preview.items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		for (const id of ['rockruffdusk', 'kubfu', 'magikarp', 'dratini', 'suicune']) {
			fixture.unlocks[id] = structuredClone(preview.unlocks[id]);
			if (!fixture.starters.some(entry => entry.id === fixture.unlocks[id].starter)) {
				fixture.starters.push(structuredClone(preview.starters.find(entry => entry.id === fixture.unlocks[id].starter)));
			}
		}
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-activity-battles-fixture' };
		} }));
		host = makeUser(`Adventure Host ${++serial}`, `127.0.85.${serial}`);
		guest = makeUser(`Adventure Guest ${serial}`, `127.0.86.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: crypto.randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(shared => {
			const round = { floor: 1, tier: 'silver', remaining: 1, familiesSeen: [], idsSeen: ['swapstats'],
				options: [{ id: 'swapstats', tier: 'silver', refreshes: 1, chosen: false }] };
			shared.adventure.coopBlessingRound = round;
			for (const user of [host, guest]) shared.adventure.members[user.id].blessings.round = structuredClone(round);
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'blessingchoice', slot: 0 });
	});
	afterEach(() => {
		Date.now = oldNow; crypto.randomInt = oldRandom;
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const event = user => manager.coop.view(user).session.adventure.coopEvent;
	const choose = (user, value, visit = event(user).key) => manager.coop.command(user, { action: 'eventchoice', value, visit });
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter(id, floor = 61) {
		change(shared => {
			shared.adventure.floor = floor; shared.adventure.phase = 'area-selection';
			for (const user of [host, guest]) shared.adventure.members[user.id].money = 3000;
			shared.areaSelections = { [host.id]: null, [guest.id]: null };
			shared.adventure.routeChoices = [{ id: 'activityroute', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(other => other !== id)
				.map(other => ({ id: other, floor: 1 }));
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'activityroute' });
		assert.equal(event(host).id, id);
	}
	function agree(choice) {
		const key = event(host).key; choose(host, choice, key); choose(guest, choice, key);
	}
	function startBattle() {
		assert.equal(session().adventure.phase, 'battle-selection');
		assert.deepEqual(member(host).coopEvent, member(guest).coopEvent);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		assert(created.rogue.cooperative);
	}
	function result(won = true, turns = 1, retreat = false) {
		const state = created.rogue.state;
		return { encounterId: state.encounterId, won, turns, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag },
			defeated: [], ...(retreat ? { coopExit: 'retreat' } : {}) };
	}
	function settle(won = true, turns = 1, retreat = false) {
		const outcome = result(won, turns, retreat); created.rogue.onResult(outcome); return outcome;
	}
	function admit(user, value = 'join', confirmed = false) {
		const pending = member(user).blessings.pending[0];
		return manager.coop.command(user, { action: 'blessingreward', member: pending.id, value, confirmed });
	}
	function fixed(random, work) {
		crypto.randomInt = random;
		try { return work(); } finally { crypto.randomInt = oldRandom; }
	}
	function fishing() { enter('fishing'); agree('fishstart'); }
	function readyFish(hits = 1) {
		change(shared => {
			const fish = shared.adventure.members[host.id].coopEvent.fishing;
			fish.hits = hits; fish.started = now - 30000;
			shared.adventure.members[guest.id].coopEvent.fishing = structuredClone(fish);
			shared.adventure.node.event.fishing = structuredClone(fish);
		});
	}
	for (const id of ['bandits', 'dice', 'fishing']) it(`offers ${id} through the real event pool and rejects stale votes`, () => {
		enter(id); const saved = session(), visible = event(host);
		assert.deepEqual(visible.branchOptions, event(guest).branchOptions);
		assert.deepEqual(session(), saved);
		assert.throws(() => choose(host, visible.branchOptions[0].id, 'stale'), /已变化/);
		choose(host, visible.branchOptions[0].id);
		assert.equal(session().adventure.phase, 'route-interaction');
		manager.coop.command(host, { action: 'cancelevent', visit: visible.key });
		assert.equal(event(host).ownChoice, null);
	});
	for (const face of [1, 3, 6]) it(`rolls one shared ${face} with separate entry payments and no repeated payout`, () => {
		enter('dice'); const before = session().adventure.members;
		const solo = [store.get(host.id).run, store.get(guest.id).run];
		let rolls = 0;
		fixed(max => {
			if (max === 6) { rolls++; return face - 1; }
			return 0;
		}, () => agree('roll'));
		assert.equal(rolls, 1);
		assert(member(host).coopEvent.result[0].includes(`${face} 点`));
		assert.deepEqual(member(host).coopEvent.result, member(guest).coopEvent.result);
		assert.equal(before[host.id].money - member(host).money, before[guest.id].money - member(guest).money);
		assert.deepEqual(member(host).bag, member(guest).bag);
		assert.deepEqual([store.get(host.id).run, store.get(guest.id).run], solo);
		const saved = session(); assert.throws(() => choose(host, 'roll')); assert.deepEqual(session(), saved);
	});
	it('rechecks both balances after the first purchase vote and never charges one player alone', () => {
		enter('dice'); choose(host, 'buy');
		change(shared => { shared.adventure.members[guest.id].money = 0; });
		const before = session(); assert(event(guest).branchOptions.find(o => o.id === 'buy').disabled);
		assert.throws(() => choose(guest, 'buy'), /共同分支/); assert.deepEqual(session(), before);
		agree('leave'); assert.equal(member(host).money, before.adventure.members[host.id].money);
	});
	it('shares a bought prize but charges each player the original price', () => {
		const { eventCost, eventRewardBudget } = require('../../dist/server/fantasy-rogue/early-balance');
		enter('dice'); const before = session().adventure.members; agree('buy');
		const prize = Math.round(Math.round(eventRewardBudget(61) / 50) * 50 * 1.15);
		for (const user of [host, guest]) {
			const treasureValue = preview.items.filter(item => item.kind === 'treasure').reduce((total, item) =>
				total + ((member(user).bag[item.id] || 0) - (before[user.id].bag[item.id] || 0)) * item.sellPrice, 0);
			assert.equal(member(user).money - before[user.id].money + treasureValue, prize - eventCost(61));
		}
		assert.deepEqual(member(host).bag, member(guest).bag);
	});
	for (const id of ['bandits', 'dice']) it(`uses either owner's loaded dice once for the shared ${id} result`, () => {
		enter(id);
		change(shared => { shared.adventure.members[guest.id].blessings.owned.push({ id: 'dice', family: 'dice', tier: 'gold' }); });
		const before = member(host).money;
		fixed(() => { throw Error('A loaded result must not reroll'); }, () => agree(id === 'dice' ? 'roll' : 'coin'));
		assert(member(host).coopEvent.settled && member(guest).coopEvent.settled);
		if (id === 'bandits') assert.equal(member(host).money, before);
		else assert(member(host).coopEvent.result[0].includes('6 点'));
	});
	it('applies a shared lost coin to each personal balance without going negative', () => {
		enter('bandits'); change(shared => { shared.adventure.members[guest.id].money = 10; });
		const before = member(host).money;
		fixed(max => max - 1, () => agree('coin'));
		assert.equal(member(guest).money, 0); assert(member(host).money < before);
		assert(member(host).coopEvent.result[0].includes('反面'));
	});
	it('creates one common bandit battle, offers identical fragments and settles them exactly once', () => {
		enter('bandits'); agree('fight'); startBattle();
		assert.equal(created.rogue.state.catchable, false);
		assert.equal(created.rogue.state.opponentCount, 3);
		const outcome = settle();
		assert.equal(member(host).coopEvent.stage, 'fragments');
		assert.deepEqual(member(host).coopEvent.fragmentOffer, member(guest).coopEvent.fragmentOffer);
		const saved = session(); created.rogue.onResult(outcome); assert.deepEqual(session(), saved);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
		const before = [member(host).blessings.shards, member(guest).blessings.shards];
		const amount = member(host).coopEvent.fragmentOffer.amount; agree('fragments');
		for (const [i, user] of [host, guest].entries()) assert.equal(member(user).blessings.shards, before[i] + amount);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 62);
	});
	it('falls back to shared loot if personal fragment caps have no common valid award', () => {
		enter('bandits'); change(shared => { shared.adventure.members[guest.id].eventFragments = { '51': 31 }; });
		agree('fight'); startBattle(); settle();
		for (const user of [host, guest]) {
			assert.equal(member(user).coopEvent.stage, 'result'); assert.equal(member(user).coopEvent.fragmentOffer, undefined);
		}
		assert.deepEqual(member(host).bag, member(guest).bag);
	});
	it('leaves a defeated bandit event with personal losses, but preserves an escaped encounter for retry', () => {
		enter('bandits'); agree('fight'); startBattle();
		const before = session().adventure.members, enemy = session().adventure.node.encounters;
		settle(false, 2, true);
		assert.equal(session().adventure.battleResult.eventResolved, false);
		assert.equal(member(host).money, before[host.id].money);
		assert.deepEqual(member(guest).bag, before[guest.id].bag);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'retrybattle' });
		assert.deepEqual(session().adventure.node.encounters, enemy);
		startBattle(); settle(false);
		assert(session().adventure.battleResult.eventResolved);
		assert(member(host).money < before[host.id].money);
		assert(member(host).coopEvent.settled && member(guest).coopEvent.settled);
	});
	it('shares the server clock and counts simultaneous pulls only once without client score or timestamp trust', () => {
		fishing(); const visit = event(host).key, fish = member(host).coopEvent.fishing;
		assert.deepEqual(event(host).fishing, event(guest).fishing);
		now = fish.started + Math.round(fish.center * 1200);
		manager.coop.command(host, { action: 'eventchoice', value: 'fishtap', visit, now: now + 999999, hits: 6 });
		choose(guest, 'fishtap', visit);
		assert.equal(member(host).coopEvent.fishing.hits, 1);
		assert.equal(event(host).key, visit);
		assert.deepEqual(member(host).coopEvent.fishing, member(guest).coopEvent.fishing);
		assert.throws(() => agree('fishfinish'), /共同分支/);
		const saved = session(); assert(event(host).fishing.started === fish.started); assert.deepEqual(session(), saved);
	});
	it('shares a missed pull and prevents retrying during its cooldown', () => {
		fishing(); now += 10; choose(host, 'fishtap');
		const after = member(host).coopEvent.fishing;
		assert.equal(after.misses, 1); now += 500; choose(guest, 'fishtap');
		assert.deepEqual(member(guest).coopEvent.fishing, after);
	});
	it('completes six alternating live pulls and rejects the second final packet without a second reward', () => {
		const { fishingFrame, fishingWidth } = require('../../dist/server/fantasy-rogue/event-adventures');
		fishing(); const visit = event(host).key;
		fixed(() => 0, () => {
			for (let i = 0; i < 6; i++) {
				const fish = member(host).coopEvent.fishing;
				now = Math.max(now + 1000, fish.lastTap + 1000);
				let guard = 0;
				while (Math.abs(fishingFrame(fish, now).cursor - fish.center) > fishingWidth(fish.hits) / 2) {
					now += 10; assert(++guard < 250);
				}
				assert(fishingFrame(fish, now).progress < 1);
				choose(i % 2 ? guest : host, 'fishtap', visit);
				assert.equal(member(host).coopEvent.fishing.hits, i + 1);
				assert.deepEqual(member(host).coopEvent.fishing, member(guest).coopEvent.fishing);
			}
		});
		assert(member(host).coopEvent.settled && member(guest).coopEvent.settled);
		const saved = session(); assert.throws(() => choose(host, 'fishtap', visit), /已变化/);
		assert.deepEqual(session(), saved);
	});
	it('requires consensus for expired zero-hit consolation and preserves the native amount', () => {
		const { journeyCoins } = require('../../dist/server/fantasy-rogue/early-balance');
		fishing(); now += 14000; const before = member(host).money;
		assert.throws(() => choose(host, 'fishtap'), /共同分支/);
		choose(host, 'fishfinish'); assert.equal(member(host).money, before);
		choose(guest, 'fishfinish');
		assert.equal(member(host).money - before, journeyCoins(61, 222));
		assert.equal(member(host).money, member(guest).money);
	});
	it('shares a treasure catch and an active Lana bonus from either owner', () => {
		fishing(); readyFish(2);
		change(shared => { shared.adventure.members[guest.id].blessings.companions = [{ id: 'lana' }]; });
		fixed(() => 0, () => agree('fishfinish'));
		assert.deepEqual(member(host).bag, member(guest).bag);
		assert(member(host).notices.some(text => text.includes('水莲')));
		assert(member(guest).notices.some(text => text.includes('水莲')));
	});
	it('grants a shared free catch with unique IDs, individual boosts, unlocks and full-party admission', () => {
		fishing(); readyFish(1);
		change(shared => {
			const state = shared.adventure.members[guest.id]; state.boosts.atk = 5;
			while (state.team.length < 6) {
				const mon = structuredClone(state.team[0]); mon.id = crypto.randomUUID(); state.team.push(mon);
			}
		});
		const accounts = [store.get(host.id), store.get(guest.id)];
		fixed(max => max === 100 ? 99 : max - 1, () => agree('fishfinish'));
		const rewards = [host, guest].map(user => member(user).blessings.pending.find(p => p.pokemon));
		assert(rewards.every(Boolean));
		assert.deepEqual(rewards[0].pokemon.set, rewards[1].pokemon.set);
		assert.notEqual(rewards[0].pokemon.id, rewards[1].pokemon.id);
		assert.equal(member(guest).team.length, 6);
		for (const [i, user] of [host, guest].entries()) assert.notDeepEqual(store.get(user.id).captures, accounts[i].captures);
		admit(host);
		const replaced = member(guest).team[0].id;
		assert.throws(() => admit(guest, replaced), /确认|放生/);
		assert.equal(member(guest).team.length, 6);
		admit(guest, replaced, true); assert.equal(member(guest).team.length, 6);
		assert(!member(guest).team.some(mon => mon.id === replaced));
	});
	it('uses one saved elite encounter and keeps both players in the native doubles capture flow', () => {
		fishing(); readyFish(1); let hundreds = 0;
		fixed(max => max === 100 ? (++hundreds === 1 ? 99 : 0) : max - 1, () => agree('fishfinish'));
		assert.equal(session().adventure.phase, 'battle-selection');
		const enemy = structuredClone(session().adventure.node.encounters[0].team);
		startBattle(); assert.equal(created.rogue.state.catchable, true);
		assert.equal(created.rogue.state.fishingElite, true);
		const { Teams } = require('../../dist/sim/teams');
		const opponents = [...Teams.unpack(created.trainer.packedTeam), ...Teams.unpack(created.rogue.cooperative.foe)];
		assert.equal(opponents.length, 2, 'the existing co-op encounter splitter fills both enemy seats');
		for (const mon of opponents) {
			assert.equal(mon.species, enemy[0].species);
			for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
				assert.equal(mon.ivs?.[stat] ?? 31, enemy[0].ivs[stat]);
			}
			assert.equal(!!mon.shiny, !!enemy[0].shiny);
		}
		assert(created.rogue.state.partner); assert(created.rogue.cooperative);
		const before = member(host).money; settle();
		assert(session().adventure.battleResult.eventResolved); assert(member(host).money > before);
		assert.equal(member(host).money, member(guest).money);
	});
	it('rolls back a shared catch and both account unlocks when persistence fails', () => {
		fishing(); readyFish(1); choose(host, 'fishfinish');
		const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		const original = store.updateCoopSession;
		store.updateCoopSession = () => { throw Error('injected persistence fault'); };
		try {
			assert.throws(() => fixed(max => max === 100 ? 99 : max - 1, () => choose(guest, 'fishfinish')), /persistence fault/);
		} finally { store.updateCoopSession = original; }
		assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
	});
	it('honors delegation for pulls and resets stale common votes on revoke', () => {
		fishing(); manager.coop.command(host, { action: 'delegate', value: 'partner' });
		now += 10; assert.throws(() => choose(host, 'fishtap'), /操作权/); choose(guest, 'fishtap');
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		now += 20000; choose(guest, 'fishfinish');
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		assert.equal(event(host).partnerChoice, null); choose(host, 'fishfinish');
		assert(!member(host).coopEvent.settled); choose(guest, 'fishfinish'); assert(member(host).coopEvent.settled);
	});
	it('rejects overflowing rewards atomically', () => {
		fishing(); now += 14000;
		change(shared => { shared.adventure.members[guest.id].money = Number.MAX_SAFE_INTEGER; });
		choose(host, 'fishfinish'); const saved = session();
		assert.throws(() => choose(guest, 'fishfinish'), /可保存范围/); assert.deepEqual(session(), saved);
	});
});
