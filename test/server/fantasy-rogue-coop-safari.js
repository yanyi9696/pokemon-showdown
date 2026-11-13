'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { rollSafariChoice } = require('../../dist/server/fantasy-rogue/journey-safari');
const { chooseJourneyActivity } = require('../../dist/server/fantasy-rogue/journey-activities');
const { content, set, stats, firstEventRoute } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue shared safari capture ownership', () => {
	let oldConfig, store, engine, manager, host, guest, soloSaves, serial = 0;
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = (user = host) => manager.coop.view(user).session.adventure;
	const event = (user = host) => view(user).coopEvent;
	const proposal = () => session().adventure.captureProposal;
	function change(update) {
		const s = session(), revision = s.revision;
		update(s); s.revision++; store.updateCoopSession(s, revision);
	}
	function newManager() { manager = new RogueManager(engine); }
	function random(value, fn) {
		const original = crypto.randomInt;
		crypto.randomInt = max => Math.min(value, max - 1);
		try { return fn(); } finally { crypto.randomInt = original; }
	}
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content()); newManager();
		host = makeUser(`Safari Host ${++serial}`, `127.0.98.${serial}`);
		guest = makeUser(`Safari Guest ${serial}`, `127.0.99.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: crypto.randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		soloSaves = Object.fromEntries([host, guest].map(user => [user.id, store.get(user.id).run]));
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(s => {
			for (const m of Object.values(s.adventure.members)) m.team.forEach((mon, index) => { mon.joinOrder = index; });
		});
		// This fixture skips the opening selection but exercises native gift admission afterwards.
		engine.content.blessings = true;
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	function enter() {
		change(s => {
			const a = s.adventure; a.floor = 61; a.phase = 'area-selection';
			s.areaSelections = { [host.id]: null, [guest.id]: null };
			a.routeChoices = [{ id: 'safari', name: '共同狩猎', kind: 'event', encounters: [], reward: { money: 0, items: {} } }];
			a.coopEventHistory = Object.keys(EVENT_NAMES).filter(id => id !== 'safaripark').map(id => ({ id, floor: 1 }));
		});
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'safari' });
		});
		assert.equal(event().id, 'safaripark');
	}
	function knownTargets() {
		enter(); change(s => {
			for (const e of [s.adventure.node.event, ...Object.values(s.adventure.members).map(m => m.coopEvent)]) {
				e.activity.safari = ['Magikarp', 'Gyarados', 'Magikarp'];
			}
		});
	}
	function choose(user, value, visit = event(user).key) {
		return manager.coop.command(user, { action: 'eventchoice', value, visit });
	}
	function agree(value) {
		const key = event().key; choose(host, value, key); choose(guest, value, key);
	}
	function ask(user = host, owner, key = event().key, ball = 'safariball') {
		return manager.coop.command(user, { action: 'proposecapture', captureTarget: key, ball, owner });
	}
	function respond(user, value, id = proposal().id, ball = 'safariball') {
		return manager.coop.command(user, { action: 'respondcapture', id, value, ball });
	}
	function admit(user, value = 'join', confirmed = false) {
		return manager.coop.command(user, { action: 'blessingreward', member: member(user).blessings.pending[0].id, value, confirmed });
	}
	for (const catcher of ['host', 'guest']) for (const roll of [29, 30]) {
		it(`shares the higher non-catcher shiny level with ${catcher}, boundary ${roll}`, () => {
			const { emptyEchoUpgrades } = require('../../dist/sim/rogue-echo');
			knownTargets();
			const owner = catcher === 'host' ? host : guest, other = owner === host ? guest : host;
			change(s => {
				for (const user of [host, guest]) s.adventure.members[user.id].echo = {
					...emptyEchoUpgrades(), shiny: user === owner ? 1 : 5, catch: user === owner ? 2 : 4,
				};
			});
			const before = [host, guest].map(user => member(user).echo), original = crypto.randomInt;
			let rolls = 0;
			try {
				crypto.randomInt = max => {
					if (max === 10000) { rolls++; return roll; }
					return 0;
				};
				ask(owner); respond(other, 'accept');
			} finally { crypto.randomInt = original; }
			assert.equal(rolls, 1);
			const gift = member(owner).blessings.pending.find(p => p.pokemon);
			assert.equal(!!gift.pokemon.set.shiny, roll === 29);
			assert(!member(other).blessings.pending.some(p => p.pokemon));
			assert.deepEqual([host, guest].map(user => member(user).echo), before);
			const saved = session(); newManager();
			view(host); view(guest); assert.deepEqual(session(), saved);
		});
	}
	it('rolls three shared targets once through the real pool, with no future-target leak or direct ball option', () => {
		enter(); const saved = session(), a = saved.adventure.node.event.activity;
		assert.equal(a.balls, 3); assert.equal(a.index, 0); assert.equal(a.safari.length, 3);
		assert.deepEqual(member(host).coopEvent, member(guest).coopEvent);
		assert.equal(event().safari.name, a.safari[0]); assert.equal(event().safari.balls, 3);
		assert.equal(event().safari.safari, undefined);
		assert.deepEqual(event().branchOptions.map(o => o.id), ['approach', 'bait', 'next', 'leave']);
		assert.throws(() => choose(host, 'ball')); assert.deepEqual(session(), saved);
	});
	it('requires consensus, changes one common step key, and resets votes before the next choice', () => {
		knownTargets(); const key = event().key;
		choose(host, 'bait'); choose(guest, 'next'); assert.equal(event().key, key);
		choose(guest, 'bait'); assert.notEqual(event().key, key);
		assert.equal(member(host).coopEvent.activity.bait, 1);
		assert.deepEqual(member(host).coopEvent.activity, member(guest).coopEvent.activity);
		assert.equal(event().ownChoice, null); assert.equal(event().partnerChoice, null);
		assert.throws(() => choose(host, 'next', key));
	});
	it('locks common actions while negotiating and clears pre-existing common votes', () => {
		knownTargets(); choose(guest, 'next'); ask();
		const saved = session();
		assert.equal(event().partnerChoice, null); assert.equal(proposal().context, 'safari');
		assert.throws(() => choose(guest, 'leave'), /协商/);
		assert.throws(() => ask(guest), /已有/); assert.deepEqual(session(), saved);
		manager.coop.command(guest, { action: 'cancelcapture', id: proposal().id }); agree('bait');
		assert.equal(member(host).coopEvent.activity.balls, 3);
	});
	for (const recipient of ['host', 'guest']) it(`credits only the negotiated ${recipient} and preserves solo saves`, () => {
		knownTargets(); const owner = recipient === 'host' ? host : guest, other = owner === host ? guest : host;
		const before = session().adventure.members, oldOther = store.get(other.id);
		ask(owner); const id = proposal().id; random(0, () => respond(other, 'accept'));
		assert.equal(view().phase, 'blessing-reward');
		assert.equal(member(owner).blessings.pending.length, 1); assert.equal(member(other).blessings.pending.length, 0);
		assert.equal(store.get(owner.id).captures.magikarp, 1); assert(store.get(owner.id).unlocked.includes('magikarp'));
		assert.deepEqual(store.get(other.id), oldOther);
		for (const user of [host, guest]) {
			assert.deepEqual(member(user).bag, before[user.id].bag);
			assert.equal(member(user).money, before[user.id].money);
			assert.equal(member(user).coopEvent.activity.balls, 2); assert(member(user).coopEvent.settled);
			assert.deepEqual(store.get(user.id).run, soloSaves[user.id]);
		}
		admit(owner); assert.equal(member(owner).team.length, 2); assert.equal(member(other).team.length, 1);
		assert.equal(view().phase, 'route-interaction'); assert.throws(() => respond(other, 'accept', id));
		assert.throws(() => ask()); assert.equal(store.get(owner.id).captures.magikarp, 1);
	});
	it('supports contest, keep, contest again and give, even when the recipient has no personal balls', () => {
		knownTargets(); change(s => { s.adventure.members[guest.id].bag = {}; });
		ask(); respond(guest, 'contest'); assert.equal(proposal().state, 'contested');
		assert.deepEqual(view().captureProposal.handoffBalls, [{ id: 'safariball', name: '共同狩猎用球', count: 3 }]);
		respond(host, 'keep'); assert.equal(proposal().state, 'returned'); respond(guest, 'contest');
		assert.throws(() => respond(host, 'give', proposal().id, 'pokeball'));
		random(0, () => respond(host, 'give')); assert.equal(store.get(guest.id).captures.magikarp, 1);
		assert.equal(store.get(host.id).captures.magikarp, undefined); assert.deepEqual(member(guest).bag, {});
	});
	it('rejects unauthorized responses, forged owners and stale targets without spending any balls', () => {
		knownTargets(); const initial = session(), key = event().key;
		assert.throws(() => ask(host, guest.id)); assert.throws(() => ask(host, undefined, key, 'masterball'));
		assert.throws(() => ask(host, undefined, 'obsolete')); assert.deepEqual(session(), initial);
		ask(); const pending = session();
		assert.throws(() => respond(host, 'accept')); assert.throws(() => respond(guest, 'give'));
		assert.deepEqual(session(), pending); manager.coop.command(host, { action: 'cancelcapture', id: proposal().id });
		agree('next'); assert.throws(() => ask(host, undefined, key)); assert.equal(event().safari.balls, 3);
	});
	it('expires a request without spending balls and lets both players select another target', () => {
		knownTargets(); ask(); const id = proposal().id;
		change(s => { s.adventure.captureProposal.expiresAt = Date.now() - 1; });
		assert.equal(view().captureProposal, null); assert.throws(() => respond(guest, 'accept', id));
		agree('next'); assert.equal(event().safari.name, 'Gyarados'); assert.equal(event().safari.balls, 3);
		assert.equal(proposal(), undefined);
	});
	it('spends exactly one shared ball on a failed catch, changes the target and permits no replay', () => {
		knownTargets(); ask(); const id = proposal().id;
		random(99, () => respond(guest, 'accept'));
		assert.equal(view().phase, 'route-interaction'); assert.equal(event().safari.balls, 2);
		assert.equal(event().safari.name, 'Gyarados'); assert.equal(event().branchResolved, false);
		assert.equal(store.get(host.id).captures.magikarp, undefined); assert.throws(() => respond(guest, 'accept', id));
		assert.deepEqual(member(host).coopEvent.activity, member(guest).coopEvent.activity);
	});
	it('ends after three missed encounters and does not generate a fourth target or a consolation partner', () => {
		knownTargets();
		for (let i = 0; i < 3; i++) { ask(); random(99, () => respond(guest, 'accept')); }
		assert.equal(event().safari, null); assert.equal(event().branchResolved, true);
		assert(member(host).coopEvent.settled); assert(member(guest).coopEvent.settled);
		assert.equal(member(host).coopEvent.activity.balls, 0); assert.equal(member(host).team.length, 1);
		assert.throws(() => ask());
	});
	it('keeps common approach/flee and feed outcomes synchronized without consuming balls', () => {
		knownTargets(); random(99, () => agree('approach'));
		assert.equal(member(host).coopEvent.activity.wary, 1); agree('bait');
		assert.equal(member(host).coopEvent.activity.wary, 0); assert.equal(member(host).coopEvent.activity.bait, 1);
		random(0, () => agree('approach')); assert.equal(event().safari.name, 'Gyarados');
		assert.deepEqual(member(host).coopEvent.activity, member(guest).coopEvent.activity);
		assert.equal(event().safari.balls, 3); agree('next');
		assert.equal(member(host).coopEvent.activity.bait, 0); assert.equal(member(host).coopEvent.activity.wary, 0);
	});
	it('requires both players to leave and retains no gift or personal ball cost', () => {
		knownTargets(); const before = session().adventure.members;
		choose(host, 'leave'); assert.equal(event().ownComplete, false); choose(guest, 'leave');
		for (const user of [host, guest]) {
			assert(member(user).coopEvent.settled); assert.deepEqual(member(user).bag, before[user.id].bag);
			assert.deepEqual(member(user).team, before[user.id].team);
		}
	});
	it('requires confirmed release to admit into a full party and keeps the other player’s six intact', () => {
		knownTargets(); change(s => {
			for (const m of Object.values(s.adventure.members)) {
				m.team = Array.from({ length: 6 }, (_, i) => ({ ...createRoguePokemon(set(), stats(0)), joinOrder: i }));
			}
		});
		const before = session().adventure.members; ask(guest); random(0, () => respond(host, 'accept'));
		assert.throws(() => admit(guest), /放生|已满|上限/);
		assert.throws(() => admit(guest, before[guest.id].team[1].id), /确认/);
		admit(guest, before[guest.id].team[1].id, true);
		assert.equal(member(guest).team.length, 6); assert(member(guest).team.some(mon => mon.set.species === 'Magikarp'));
		assert.deepEqual(member(host).team, before[host.id].team);
	});
	it('clears pending consent on delegation changes and permits the controller to choose the actual owner', () => {
		knownTargets(); ask(); const id = proposal().id;
		manager.coop.command(guest, { action: 'delegate', value: 'partner' }); assert.equal(proposal(), undefined);
		assert.throws(() => respond(host, 'accept', id)); assert.throws(() => ask(guest));
		random(0, () => ask(host, guest.id)); assert.equal(store.get(guest.id).captures.magikarp, 1);
		assert.equal(store.get(host.id).captures.magikarp, undefined);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' }); admit(guest);
	});
	it('keeps the saved proposal and owner across manager reload and rejects actions while paused', () => {
		knownTargets(); ask(guest); const before = session();
		newManager(); assert.deepEqual(session(), before);
		change(s => { s.status = 'paused'; }); assert.throws(() => respond(host, 'accept'));
		change(s => { s.status = 'active'; }); random(0, () => respond(host, 'accept'));
		assert.equal(store.get(guest.id).captures.magikarp, 1);
	});
	it('rejects diverging personal safari state instead of consuming either player’s resources', () => {
		knownTargets(); ask();
		change(s => { s.adventure.members[guest.id].coopEvent.activity.index = 1; });
		const before = session(); assert.equal(event().safari, null);
		assert.throws(() => respond(guest, 'accept'));
		assert.deepEqual(session(), before); manager.coop.command(host, { action: 'cancelcapture', id: proposal().id });
	});
	it('rolls back account unlock, gift, ball, proposal and notifications when the session write fails', () => {
		knownTargets(); ask(); const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		const send = host.send;
		let notified = 0; host.send = () => { notified++; };
		store.db.exec("CREATE TEMP TRIGGER safari_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'safari write failed'); END;");
		try {
			assert.throws(() => random(0, () => respond(guest, 'accept')), /safari write failed/);
			assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
			assert.equal(notified, 0);
		} finally { store.db.exec('DROP TRIGGER safari_fail'); host.send = send; }
		random(0, () => respond(guest, 'accept')); assert.equal(store.get(host.id).captures.magikarp, 1);
	});
	it('preserves the native 35 percent base chance, bait/approach scaling and 85 percent cap', () => {
		const a = { safari: ['Magikarp', 'Gyarados', 'Magikarp'], balls: 3, index: 0 };
		for (const [wary, bait, chance] of [[0, 0, 35], [0, 2, 55], [2, 1, 75], [5, 2, 85]]) {
			let caught = 0;
			for (let n = 0; n < 100; n++) {
				let rolls = 0;
				const result = rollSafariChoice({ ...a, wary, bait }, max => {
					assert.equal(max, 100); rolls++; return n;
				}, 'ball');
				caught += !!result.caught; assert.equal(rolls, 1); assert.equal(result.activity.balls, 2);
			}
			assert.equal(caught, chance);
		}
		assert.equal(a.balls, 3);
	});
	it('keeps solo safari capture and failure behavior after extracting the shared outcome', () => {
		for (const roll of [0, 99]) {
			const account = structuredClone(store.get(host.id)); delete account.run;
			const run = { id: 'solo-safari', floor: 61, team: [createRoguePokemon(set(), stats(0))], boosts: stats(0),
				bag: {}, caught: [], notices: [], pendingMoves: [], money: 0, phase: 'event', node: { kind: 'event',
					event: { id: 'safaripark', key: 'solo', stage: 'choice', activity: {
						safari: ['Magikarp', 'Gyarados', 'Magikarp'], index: 0, balls: 3,
					} } } };
			chooseJourneyActivity(account, run, engine.content, max => Math.min(roll, max - 1), 'ball');
			assert.equal(run.node.event.activity.balls, 2);
			assert.equal(run.node.event.activity.index, roll ? 1 : 0);
			assert.equal(!!run.node.event.settled, !roll);
			assert.equal(account.captures.magikarp || 0, roll ? 0 : 1);
		}
	});
});
