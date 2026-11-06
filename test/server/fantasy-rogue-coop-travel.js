'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon, initializeExperience } = require('../../dist/server/fantasy-rogue/progression');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { content, set } = require('../fixtures/fantasy-rogue');
const stats = value => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });

describe('Fantasy Rogue shared travel memories', () => {
	let oldConfig, store, engine, manager, host, guest, created, preview;
	let serial = 0;
	before(() => { preview = createPreviewContent(); });
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content();
		fixture.blessings = true; fixture.progression = true; fixture.wildTreasures = true;
		fixture.items = [...fixture.items, ...preview.items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		for (const item of fixture.items) if (item.kind === 'ball') item.multiplier ||= 1;
		fixture.starters = [...fixture.starters, ...preview.starters.filter(entry => !fixture.starters.some(s => s.id === entry.id))];
		fixture.unlocks = { ...preview.unlocks, ...fixture.unlocks };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-travel-fixture' };
		} }));
		host = makeUser(`Travel Host ${++serial}`, `127.0.59.${serial}`);
		guest = makeUser(`Travel Guest ${serial}`, `127.0.60.${serial}`);
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
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = user => manager.coop.view(user).session.adventure.coopEvent;
	const choose = (user, value, owner) => manager.coop.command(user, { action: 'eventchoice', value, owner });
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter() {
		change(shared => {
			shared.adventure.floor = 56;
			shared.adventure.routeChoices = [{ id: 'travelroute', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(id => id !== 'travel')
				.map(id => ({ id, floor: 1 }));
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'travelroute' });
		assert.equal(member(host).coopEvent.id, 'travel');
	}
	function agree(choice) { choose(host, choice); choose(guest, choice); }
	function path(branch = 'path') {
		agree('postcard:alola'); agree('enter'); agree(branch);
	}
	function claim(user, value = 'join', confirmed = false) {
		manager.coop.command(user, { action: 'blessingreward', member: member(user).blessings.pending[0].id, value, confirmed });
	}
	function finish() {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 57);
	}
	function start() {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		const state = created.rogue.state;
		return { encounterId: state.encounterId, won: true, turns: 1, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag }, defeated: [] };
	}
	it('requires fresh consensus for postcards, confirmation and paths, preserving personal evolution stamps', () => {
		enter(); assert(!view(host).branchOptions.some(option => option.id === 'leave'));
		choose(host, 'postcard:alola'); choose(guest, 'postcard:galar');
		assert(!member(host).coopEvent.service); assert.equal(view(host).partnerChoice, 'postcard:galar');
		manager.coop.command(guest, { action: 'cancelevent' }); choose(guest, 'postcard:alola');
		assert.equal(view(host).ownChoice, null); assert.equal(view(host).branchResolved, false);
		assert(member(guest).team[0].evolutionProgress.scenes.includes('region:alola'));
		agree('back'); agree('postcard:hisui'); agree('enter');
		choose(host, 'road'); choose(guest, 'path');
		assert.equal(session().adventure.phase, 'route-interaction'); assert.equal(member(host).coopEvent.service.step, 'paths');
		assert.deepEqual(view(host).branchOptions, view(guest).branchOptions);
	});
	it('shares one gift template with unique identities and own boosts, preserving both paused solo saves', () => {
		enter(); change(shared => { shared.adventure.members[guest.id].boosts = stats(10); });
		const solo = [store.get(host.id).run, store.get(guest.id).run]; path();
		const gifts = [member(host).coopEvent.service.partner, member(guest).coopEvent.service.partner];
		assert.deepEqual(gifts[0].set, gifts[1].set); assert.notEqual(gifts[0].id, gifts[1].id);
		assert(gifts[1].maxhp > gifts[0].maxhp); assert.equal(view(host).branchResolved, true);
		for (const [i, user] of [host, guest].entries()) {
			const starter = engine.content.unlocks[toID(gifts[i].set.species)].starter;
			const before = store.get(user.id).captures[starter] || 0;
			choose(user, 'adopt'); assert.equal(session().adventure.phase, 'blessing-reward');
			assert.equal(store.get(user.id).captures[starter], before + 1);
			assert.deepEqual(store.get(user.id).run, solo[i]); claim(user);
			assert.equal(session().adventure.phase, 'route-interaction');
			assert(member(user).team.some(mon => mon.id === gifts[i].id));
		}
		assert.throws(() => choose(host, 'adopt'), /已变化/); finish();
	});
	it('requires release confirmation when a travel gift is admitted to a full party', () => {
		enter(); change(shared => {
			while (shared.adventure.members[host.id].team.length < 6) {
				shared.adventure.members[host.id].team.push(createRoguePokemon(set(), stats(0)));
			}
		});
		path(); choose(host, 'adopt'); const old = member(host).team[1].id;
		assert.throws(() => claim(host), /放生|队伍|选择/);
		assert.throws(() => claim(host, old), /确认/); claim(host, old, true);
		assert.equal(member(host).team.length, 6); assert(!member(host).team.some(mon => mon.id === old));
	});
	it('keeps independent target previews, changes only the selected form and supports revocable delegation', () => {
		enter(); change(shared => {
			const mon = createRoguePokemon(set('Vulpix', 'Flash Fire', 28, ['Ember', 'Protect']), stats(0));
			initializeExperience(mon); mon.hp = 20; mon.pp[1].pp = 3;
			shared.adventure.members[host.id].team = [mon];
		});
		path(); const before = member(host).team[0];
		assert.equal(member(host).coopEvent.service.step, 'professor');
		assert.equal(member(guest).coopEvent.service.step, 'adopt');
		const swap = view(host).options.find(option => option.id.startsWith('swap:')).id;
		assert.throws(() => choose(guest, swap, host.id), /移交|自己|权限|本人|指定/);
		choose(host, swap); assert.equal(view(host).preview.before, 'Vulpix'); assert.equal(view(host).preview.after, 'Vulpix-Alola');
		assert(view(host).preview.removed.includes('ember'));
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.equal(view(guest).partnerPreview.after, 'Vulpix-Alola');
		choose(guest, 'confirm', host.id);
		const after = member(host).team[0];
		assert.equal(after.id, before.id); assert.equal(after.set.species, 'Vulpix-Alola');
		assert.equal(after.set.level, before.set.level); assert.deepEqual(after.set.ivs, before.set.ivs);
		assert.equal(after.pp.find(move => move.id === 'protect').pp, 3);
		assert(after.hp > 0); assert.equal(view(guest).partnerExchange.before, 'Vulpix');
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		assert.equal(view(guest).partnerPreview, undefined);
	});
	for (const won of [true, false]) {
		it(`restores each owner's resources on ${won ? 'victory' : 'defeat'}, retains only actual experience, and settles once`, () => {
			enter(); path('road');
			change(shared => {
				for (const [i, user] of [host, guest].entries()) {
					const state = shared.adventure.members[user.id], mon = state.team[0];
					mon.hp = 7 + i; mon.status = 'psn'; mon.set.item = 'oranberry';
					mon.pp[0].pp = 2;
					state.money = 101 + i * 100; state.bag = { pokeball: 3 + i, potion: 2 };
					state.growth = { offense: 0, defense: 0, experience: i * 2000 };
				}
			});
			const before = session().adventure.members, result = start(); result.won = won;
			assert(created.rogue.state.catchable); assert(created.rogue.state.wild);
			for (const team of [result.team, result.partnerTeam]) {
				team[0].hp = 0; team[0].status = ''; team[0].set.item = '';
				team[0].pp[0].pp = 0;
				team[0].set.evs.atk = 99; team[0].set.happiness = 255;
			}
			result.bag = {}; result.partnerBag = {};
			result.defeated = [{ species: 'Rattata-Alola', level: 24,
				eligible: [result.team[0].id, result.partnerTeam[0].id], participants: [result.team[0].id, result.partnerTeam[0].id] }];
			created.rogue.onResult(result);
			for (const user of [host, guest]) {
				const old = before[user.id], now = member(user), mon = now.team[0];
				assert.equal(mon.hp, old.team[0].hp); assert.equal(mon.status, 'psn'); assert.equal(mon.set.item, 'oranberry');
				assert.equal(mon.pp[0].pp, 2); assert.deepEqual(mon.set.evs, old.team[0].set.evs);
				assert.equal(mon.set.happiness, old.team[0].set.happiness); assert.deepEqual(now.bag, old.bag);
				assert.equal(now.money, old.money); assert.deepEqual(now.growth, old.growth);
				assert(mon.experience > old.team[0].experience); assert(!now.coopEvent.memory);
			}
			assert(member(guest).team[0].experience > member(host).team[0].experience);
			const settled = session(); created.rogue.onResult(result); assert.deepEqual(session(), settled);
			assert.equal(settled.adventure.battleResult.eventResolved, true);
			for (const user of [host, guest]) {
				while (member(user).pendingMoves?.length) manager.coop.command(user,
					{ action: 'learn', member: member(user).pendingMoves[0].member, value: 'skip' });
			}
			for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
			finish();
		});
	}
	it('keeps a committed p3 capture while refunding only the owner inventory, even if the final packet omits captures', () => {
		enter(); path('road'); const result = start(), shared = session();
		const captured = createRoguePokemon(shared.adventure.node.encounters[0].team[0], stats(0), `${result.encounterId}:foe:0`);
		result.captureOwners = { [captured.id]: 'p3' }; result.captures = [captured]; result.partnerBag.pokeball--;
		manager.coop.recordCapture(shared.id, shared.adventure.battleToken, captured, result);
		const captureCount = store.get(guest.id).captures[engine.content.unlocks[toID(captured.set.species)].starter];
		delete result.captures; created.rogue.onResult(result);
		assert.equal(member(host).team.length, 1); assert.equal(member(guest).team.length, 2);
		assert(member(guest).team.some(mon => mon.id === captured.id));
		assert.equal(member(guest).bag.pokeball, 10);
		assert.equal(store.get(guest.id).captures[engine.content.unlocks[toID(captured.set.species)].starter], captureCount);
	});
	it('retains retreat losses, keeps the same opponent, and snapshots the next attempt after preparation', () => {
		enter(); path('road'); const result = start(), opponent = session().adventure.node.encounters;
		result.won = false; result.coopExit = 'retreat'; result.team[0].hp = 1;
		result.partnerBag.pokeball--;
		created.rogue.onResult(result);
		assert.equal(member(host).team[0].hp, 1); assert.equal(member(guest).bag.pokeball, 9);
		assert.equal(session().adventure.battleResult.eventResolved, false); assert(!member(host).coopEvent.memory);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'retrybattle' });
		assert.deepEqual(session().adventure.node.encounters, opponent);
		const retry = start(); assert.equal(member(host).coopEvent.memory.team[0].hp, 1);
		assert.equal(member(guest).coopEvent.memory.bag.pokeball, 9); retry.team[0].hp = 0;
		created.rogue.onResult(retry); assert.equal(member(host).team[0].hp, 1);
	});
	it('rolls back a gift and permanent unlock if the session write fails', () => {
		enter(); path(); const before = session(), account = store.get(host.id), update = store.updateCoopSession;
		try {
			store.updateCoopSession = (...args) => { update.apply(store, args); throw new Error('travel gift save failed'); };
			assert.throws(() => choose(host, 'adopt'), /travel gift save failed/);
		} finally { store.updateCoopSession = update; }
		assert.deepEqual(session(), before); assert.deepEqual(store.get(host.id), account);
	});
	it('rolls back restored resources and experience together if battle settlement cannot be saved', () => {
		enter(); path('road'); const result = start(), before = session(), update = store.updateCoopSession;
		try {
			store.updateCoopSession = (...args) => { update.apply(store, args); throw new Error('travel result save failed'); };
			assert.throws(() => manager.coop.settleBattle(before.id, before.adventure.battleToken, result), /travel result save failed/);
		} finally { store.updateCoopSession = update; }
		assert.deepEqual(session(), before);
	});
});
