'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon, initializeExperience } = require('../../dist/server/fantasy-rogue/progression');
const { greninjaCandidates, greninjaEventEligible } = require('../../dist/server/fantasy-rogue/greninja-training');
const { chooseEvent } = require('../../dist/server/fantasy-rogue/events');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { content, set, stats, firstEventRoute } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op Greninja departure and return', () => {
	let oldConfig, store, engine, manager, host, guest, preview;
	let serial = 0;
	before(() => { preview = createPreviewContent(); });
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true;
		fixture.items = [...fixture.items, ...preview.items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		fixture.unlocks.greninjafantasy = structuredClone(preview.unlocks.greninjafantasy);
		const starter = fixture.unlocks.greninjafantasy.starter;
		if (!fixture.starters.some(entry => entry.id === starter)) {
			fixture.starters.push(structuredClone(preview.starters.find(entry => entry.id === starter)));
		}
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true }));
		host = makeUser(`Forest Host ${++serial}`, `127.0.89.${serial}`);
		guest = makeUser(`Forest Guest ${serial}`, `127.0.90.${serial}`);
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
	const event = user => manager.coop.view(user).session.adventure.coopEvent;
	const choose = (user, value, visit = event(user).key, owner) =>
		manager.coop.command(user, { action: 'eventchoice', value, visit, owner });
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function addFrog(user, level = 40) {
		const frog = createRoguePokemon(set('Greninja-Fantasy', 'Anticipation', level, ['Water Shuriken']), stats(0));
		initializeExperience(frog); frog.training = { offense: 400 };
		frog.hp--; frog.pp[0].pp--;
		change(shared => { shared.adventure.members[user.id].team.push(frog); });
		return frog;
	}
	function enter(id, floor = 80) {
		change(shared => {
			shared.adventure.floor = floor; shared.adventure.phase = 'area-selection';
			shared.areaSelections = { [host.id]: null, [guest.id]: null };
			shared.adventure.routeChoices = [{ id: 'forest-route', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(other => other !== id)
				.map(other => ({ id: other, floor: 1 }));
		});
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'forest-route' });
		});
		assert.equal(event(host).id, id);
	}
	function agree(choice) {
		const key = event(host).key; choose(host, choice, key); choose(guest, choice, key);
	}
	function depart(user = guest, level = 40) {
		const frog = addFrog(user, level); enter('greninjatraining'); agree('participate');
		choose(user, `train:${frog.id}`); return frog;
	}
	it('allows a guest-only candidate, shares the visit, and removes only the owned partner', () => {
		const frog = addFrog(guest), solo = [store.get(host.id).run, store.get(guest.id).run];
		enter('greninjatraining'); const oldKey = event(host).key;
		assert.deepEqual(event(host).branchOptions, event(guest).branchOptions);
		assert.throws(() => choose(host, 'participate', 'old-visit'), /已变化/);
		choose(host, 'participate'); assert.equal(member(guest).team.length, 2);
		manager.coop.command(host, { action: 'cancelevent', visit: oldKey });
		agree('participate'); assert(event(host).ownComplete); assert(!event(guest).ownComplete);
		assert.throws(() => choose(guest, `train:${frog.id}`, oldKey), /已变化/);
		const beforeDeparture = member(guest).team.find(mon => mon.id === frog.id);
		choose(guest, `train:${frog.id}`);
		assert.equal(member(host).team.length, 1); assert.equal(member(guest).team.length, 1);
		const away = member(guest).greninjaTraining.member;
		for (const [key, value] of Object.entries(beforeDeparture)) assert.deepEqual(away[key], value, key);
		assert(Number.isSafeInteger(away.joinOrder), 'native blessing initialization supplies join order');
		assert.equal(member(host).greninjaTraining, undefined);
		assert.deepEqual([store.get(host.id).run, store.get(guest.id).run], solo);
		const saved = session(); assert.throws(() => choose(guest, `train:${frog.id}`)); assert.deepEqual(session(), saved);
	});
	it('keeps two owners separate and rejects foreign or stale personal targets', () => {
		const a = addFrog(host), b = addFrog(guest); enter('greninjatraining'); agree('participate');
		assert.throws(() => choose(host, `train:${b.id}`), /个人目标/);
		assert.throws(() => choose(host, `train:${b.id}`, event(guest).key, guest.id), /本人|操作权/);
		choose(host, `train:${a.id}`); choose(guest, `train:${b.id}`);
		assert.equal(member(host).greninjaTraining.member.id, a.id); assert.equal(member(guest).greninjaTraining.member.id, b.id);
	});
	it('permits both a common refusal and a personal refusal after agreeing to visit', () => {
		addFrog(host); addFrog(guest);
		enter('greninjatraining'); agree('leave');
		assert.equal(member(host).team.length, 2); assert.equal(member(guest).team.length, 2);
		enter('greninjatraining', 81); agree('participate');
		choose(host, 'leave'); choose(guest, 'leave');
		assert.equal(member(host).greninjaTraining, undefined); assert.equal(member(guest).greninjaTraining, undefined);
		assert(event(host).ownComplete && event(guest).ownComplete);
	});
	it('lets the delegate choose either personal target and immediately honors revocation', () => {
		const frog = addFrog(host); enter('greninjatraining'); choose(host, 'participate');
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.equal(event(guest).partnerChoice, null); choose(guest, 'participate');
		const hostKey = event(host).key;
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		assert.throws(() => choose(guest, `train:${frog.id}`, hostKey, host.id), /本人|操作权/);
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		choose(guest, `train:${frog.id}`, hostKey, host.id); assert.equal(member(host).team.length, 1);
	});
	it('never counts a teammate fighter as the personal party backup', () => {
		const frog = addFrog(host); const run = { id: 'own', floor: 80, phase: 'event', team: [frog], bag: {} };
		const other = { ...run, id: 'other', team: member(guest).team };
		assert.throws(() => chooseEvent(run, () => 0, new Set(['greninjatraining']), [other]), /没有可用事件/);
	});
	for (const lock of ['fusion', 'formFusion', 'dead', 'backupDead', 'eggBackup', 'faintedBackup', 'pendingMove', 'soloEvent']) {
		it(`prevents departure when ${lock} would violate existing party protections`, () => {
			const frog = addFrog(host), backup = member(host).team[0];
			const run = { id: 'locks', floor: 80, phase: 'event', team: [frog, backup], bag: {} };
			if (lock === 'fusion' || lock === 'formFusion') frog[lock] = {};
			if (lock === 'dead') frog.nuzlockeDead = true;
			if (lock === 'backupDead') backup.nuzlockeDead = true;
			if (lock === 'eggBackup') backup.egg = {};
			if (lock === 'faintedBackup') backup.hp = 0;
			if (lock === 'pendingMove') run.pendingMoves = [{ member: frog.id, move: 'protect' }];
			if (lock === 'soloEvent') run.node = { event: { activity: { member: frog.id } } };
			assert.equal(greninjaCandidates(run).length, 0);
		});
	}
	it('rechecks the remaining healthy partner when committing a personal departure', () => {
		const frog = addFrog(host); enter('greninjatraining'); agree('participate');
		change(shared => { shared.adventure.members[host.id].team[0].hp = 0; });
		assert.throws(() => choose(host, `train:${frog.id}`), /个人目标/);
		choose(host, 'leave'); assert.equal(member(host).team.length, 2);
	});
	it('persists the exact member, waits five floors, and returns it only to its owner with shared gifts', () => {
		const frog = depart(); const trip = member(guest).greninjaTraining;
		assert(!greninjaEventEligible({ floor: 84, greninjaTraining: trip }, 'greninjareturn'));
		assert(greninjaEventEligible({ floor: 85, greninjaTraining: trip }, 'greninjareturn'));
		manager.coop.command(guest, { action: 'leave', id: session().id }); assert.equal(session().status, 'paused');
		manager = new RogueManager(new RogueEngine(store, engine.content), () => ({ enabled: true }));
		assert.deepEqual(member(guest).greninjaTraining, trip);
		manager.coop.command(guest, { action: 'resume', id: session().id }); assert.equal(session().status, 'active');
		change(shared => { shared.adventure.members[host.id].systems.mega = true; });
		enter('greninjareturn', 87); const before = session().adventure.members;
		choose(host, 'welcome'); assert.equal(member(guest).team.length, 1);
		choose(guest, 'welcome'); const returned = member(guest).team.find(mon => mon.id === frog.id);
		assert(returned); assert.equal(returned.set.level, 47); assert.deepEqual(returned.training, frog.training);
		assert.equal(returned.pp[0].pp, frog.pp[0].pp); assert.equal(returned.maxhp - returned.hp, frog.maxhp - frog.hp);
		assert(!member(host).team.some(mon => mon.id === frog.id)); assert(member(guest).greninjaTraining.returned);
		assert.equal(member(guest).greninjaTraining.member, undefined); assert(member(host).systems.mega);
		for (const user of [host, guest]) {
			assert(member(user).systems.z); assert.equal(member(user).bag.greninjaashz - (before[user.id].bag.greninjaashz || 0), 1);
		}
		const saved = session(); assert.throws(() => choose(host, 'welcome')); assert.deepEqual(session(), saved);
	});
	it('returns both trained members once but grants one common item to each player', () => {
		const a = addFrog(host), b = addFrog(guest, 98); enter('greninjatraining'); agree('participate');
		choose(host, `train:${a.id}`); choose(guest, `train:${b.id}`);
		enter('greninjareturn', 86); agree('welcome');
		assert.equal(member(host).team.find(mon => mon.id === a.id).set.level, 46);
		assert.equal(member(guest).team.find(mon => mon.id === b.id).set.level, 100);
		for (const user of [host, guest]) {
			assert.equal(member(user).bag.greninjaashz, 1);
			assert(!greninjaEventEligible({ phase: 'event', team: member(user).team, greninjaTraining: member(user).greninjaTraining }, 'greninjatraining'));
		}
	});
	it('keeps a later departure away when the other owner is already ready to return', () => {
		const a = addFrog(host), b = addFrog(guest); enter('greninjatraining'); agree('participate');
		choose(host, `train:${a.id}`); choose(guest, 'leave');
		enter('greninjatraining', 84); agree('participate'); choose(guest, `train:${b.id}`);
		enter('greninjareturn', 85); agree('welcome');
		assert(member(host).greninjaTraining.returned); assert.equal(member(guest).greninjaTraining.member.id, b.id);
		assert.equal(member(guest).greninjaTraining.floor, 84);
		for (const user of [host, guest]) change(shared => { shared.adventure.members[user.id].pendingMoves = []; });
		enter('greninjareturn', 89); agree('welcome'); assert(member(guest).greninjaTraining.returned);
	});
	it('keeps a full-party return pending until an explicitly confirmed release, with the original ID and equipment', () => {
		const frog = depart();
		change(shared => {
			const own = shared.adventure.members[guest.id]; own.greninjaTraining.member.set.item = 'leftovers';
			while (own.team.length < 6) {
				const mon = structuredClone(own.team[0]); mon.id = crypto.randomUUID(); own.team.push(mon);
			}
		});
		enter('greninjareturn', 85); agree('welcome');
		assert.equal(member(guest).team.length, 6); assert.equal(member(guest).pendingCaptures[0].id, frog.id);
		assert(!member(guest).pendingMoves.some(move => move.member === frog.id));
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /先安置/);
		const remove = member(guest).team[0].id;
		assert.throws(() => manager.coop.command(guest, { action: 'replace', id: frog.id, member: remove }), /确认/);
		manager.coop.command(guest, { action: 'replace', id: frog.id, member: remove, confirmed: true });
		assert.equal(member(guest).team.length, 6); assert.equal(member(guest).pendingCaptures.length, 0);
		assert.equal(member(guest).team.find(mon => mon.id === frog.id).set.item, 'leftovers');
		assert(!member(host).team.some(mon => mon.id === frog.id));
	});
	for (const step of ['departure', 'return']) it(`rolls back the complete ${step} when session persistence fails`, () => {
		let frog;
		if (step === 'departure') {
			frog = addFrog(host); enter('greninjatraining'); agree('participate');
		} else {
			depart(); enter('greninjareturn', 85); choose(host, 'welcome');
		}
		const before = session(), accounts = [store.get(host.id), store.get(guest.id)], update = store.updateCoopSession;
		store.updateCoopSession = () => { throw Error('injected persistence fault'); };
		try {
			assert.throws(() => step === 'departure' ? choose(host, `train:${frog.id}`) : choose(guest, 'welcome'), /persistence fault/);
		} finally { store.updateCoopSession = update; }
		assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
	});
	it('rejects an overflowing shared gift without losing the away member', () => {
		depart(); enter('greninjareturn', 85); choose(host, 'welcome');
		change(shared => { shared.adventure.members[host.id].bag.greninjaashz = Number.MAX_SAFE_INTEGER; });
		const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		assert.throws(() => choose(guest, 'welcome'), /可保存范围/);
		assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
	});
});
