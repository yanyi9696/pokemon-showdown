'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon, initializeExperience } = require('../../dist/server/fantasy-rogue/progression');
const { challengeNode, offerOptionalChallenge, chooseChallengePrize } = require('../../dist/server/fantasy-rogue/optional-challenges');
const { offerCoopChallenge } = require('../../dist/server/fantasy-rogue/coop-challenges');
const { OPTIONAL_CHALLENGES } = require('../../dist/server/fantasy-rogue/challenge-data');
const { Battle } = require('../../dist/sim/battle');
const { Teams } = require('../../dist/sim/teams');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { captureCoopCheckpoint } = require('../../dist/sim/rogue-coop-checkpoint');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative optional challenge routes', () => {
	let oldConfig, store, engine, manager, host, guest, created, serial = 0;
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = (user = host) => manager.coop.view(user).session.adventure;
	const challenge = (user = host) => view(user).coopChallenge;
	function change(update) {
		const s = session(), revision = s.revision;
		update(s); s.revision++; store.updateCoopSession(s, revision);
	}
	function newManager() {
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-challenge-fixture' };
		} }));
	}
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content()); newManager();
		host = makeUser(`Trial Host ${++serial}`, `127.3.1.${serial}`);
		guest = makeUser(`Trial Guest ${serial}`, `127.3.2.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.id, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(s => {
			for (const [index, user] of [host, guest].entries()) {
				const m = s.adventure.members[user.id];
				m.team = (index ? ['Pikachu', 'Squirtle', 'Pidgey'] : ['Bulbasaur', 'Charmander', 'Machop']).map(species => {
					const mon = createRoguePokemon(set(species, '', 25, ['Splash']), stats(0)); initializeExperience(mon); return mon;
				});
				m.money = 2000; m.bag = { potion: 6 }; m.pendingMoves = [];
			}
		});
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	function enter(id = 'starmaster', floor = 91) {
		change(s => {
			const a = s.adventure; a.floor = floor; a.phase = 'area-selection';
			s.areaSelections = { [host.id]: null, [guest.id]: null };
			a.routeChoices = [challengeNode(id, floor)]; a.challengeHistory = [{ id, floor }];
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'challenge:' + id });
		assert.equal(session().adventure.phase, 'route-interaction'); assert.equal(challenge().id, id);
	}
	function choose(user, value, options = {}) {
		return manager.coop.command(user, { action: 'challenge', visit: challenge(user).key, value, ...options });
	}
	function agree(value) { choose(host, value); choose(guest, value); }
	function start(native = false) {
		agree('accept');
		if (native) manager.coop.command(host, { action: 'preparebattle', visit: view().battleSelectionKey });
		else for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		assert.equal(created.rogue.state.catchable, false); assert(created.rogue.optionalChallenge);
	}
	function outcome(won = true) {
		const state = created.rogue.state;
		return { encounterId: state.encounterId, won, turns: 3, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag }, defeated: [] };
	}
	function back() {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
		assert.equal(session().adventure.phase, 'route-interaction');
	}
	function win() {
		enter(); start(); created.rogue.onResult(outcome());
		back();
	}
	function battleFromState() {
		const state = structuredClone(created.rogue.state);
		return new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: host.name, team: state.team.map(mon => mon.set) },
			p2: { name: 'Trial A', team: Teams.unpack(created.trainer.packedTeam) },
			p3: { name: guest.name, team: state.partner.team.map(mon => mon.set) },
			p4: { name: 'Trial B', team: Teams.unpack(created.rogue.cooperative.foe) },
		});
	}
	it('uses the native chance, spacing, fixed-floor exclusions and protected routes', () => {
		for (const floor of [4, 5, 11, 20, 49, 50, 51, 61, 100, 101, 151, 161, 199, 200]) {
			for (const roll of [0, 7, 8, 15, 16, 99]) {
				const a = structuredClone(session().adventure); a.floor = floor;
				a.routeChoices = [{ id: 'wild', kind: 'wild', encounters: [], reward: { money: 0, items: {} } }];
				const run = { ...a.members[host.id], floor, choices: structuredClone(a.routeChoices) };
				let ownCalls = 0, nativeCalls = 0;
				const entries = [host, guest].map(user => ({ userid: user.id, run: { ...run, ...a.members[user.id] } }));
				offerCoopChallenge(a, entries, max => (++ownCalls === 1 ? roll : 0) % max);
				offerOptionalChallenge(run, max => (++nativeCalls === 1 ? roll : 0) % max);
				assert.equal(a.routeChoices[0].id, run.choices[0].id); assert.equal(ownCalls, nativeCalls);
			}
		}
		const a = structuredClone(session().adventure); a.floor = 91;
		a.routeChoices = [{ id: 'wild', kind: 'wild', encounters: [] }];
		const entries = [host, guest].map(user => ({ userid: user.id, run: { ...a.members[user.id], floor: 91 } }));
		entries[1].run.blessings = { owned: [{ family: 'battletask' }] };
		offerCoopChallenge(a, entries, () => 0); assert.equal(a.routeChoices[0].id, 'wild');
		delete entries[1].run.blessings;
		a.challengeHistory = [{ id: 'starmaster', floor: 89 }];
		offerCoopChallenge(a, entries, () => 0); assert.equal(a.routeChoices[0].id, 'wild');
	});
	it('requires common consent and preserves the shared offer through cancellation and reconnect', () => {
		enter(); const saved = session(), key = challenge().key;
		assert.deepEqual(challenge().prizes.map(p => [p.id, p.items, p.money]), challenge(guest).prizes.map(p => [p.id, p.items, p.money]));
		assert.deepEqual(session(), saved, 'view must not mutate or reroll');
		choose(host, 'accept'); choose(guest, 'skip'); assert.equal(challenge().stage, 'offer');
		choose(guest, 'cancel'); newManager(); assert.equal(challenge(guest).partnerChoice, 'accept');
		choose(guest, 'accept'); assert.equal(session().adventure.phase, 'battle-selection');
		assert.notEqual(challenge().key, key);
		assert.throws(() => choose(host, 'skip', { visit: key }));
	});
	it('skips with no resources or permanent growth and requires both players to leave', () => {
		enter(); const before = session().adventure.members;
		agree('skip'); choose(host, 'leave'); assert.equal(session().adventure.floor, 91);
		choose(guest, 'leave'); assert.equal(session().adventure.floor, 92);
		for (const user of [host, guest]) {
			assert.equal(member(user).money, before[user.id].money); assert.deepEqual(member(user).bag, before[user.id].bag);
			assert.deepEqual(member(user).growth, before[user.id].growth);
		}
	});
	it('rejects early prizes, direct floor completion and bypassing the offer via Team Preview', () => {
		enter(); const before = session();
		assert.throws(() => choose(host, 'prize:supplies'));
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }));
		assert.throws(() => manager.coop.command(host, { action: 'preparebattle', visit: view().battleSelectionKey }));
		assert.deepEqual(session(), before);
	});
	it('uses real native Multi preview, checkpoints and one shared victory without changing full parties', () => {
		enter(); const parties = [host, guest].map(user => member(user).team); start(true);
		const battle = battleFromState();
		try {
			for (const side of battle.sides) assert(battle.choose(side.id, 'team 12'));
			created.rogue.onCheckpoint(captureCoopCheckpoint(battle));
			for (const side of [battle.p2, battle.p4]) for (const mon of side.pokemon) mon.faint();
			battle.faintMessages(); assert(battle.ended);
			const result = rogueBattleResult(battle); assert(result.won); created.rogue.onResult(result);
			const saved = session(); created.rogue.onResult(result); assert.deepEqual(session(), saved);
			for (const [index, user] of [host, guest].entries()) assert.deepEqual(member(user).team.map(m => m.id), parties[index].map(m => m.id));
			back(); assert.equal(challenge().stage, 'won');
		} finally { battle.destroy(); }
	});
	for (const failed of ['loss', 'retreat', 'late-win-retreat']) it(`keeps costs but rejects farming on ${failed}`, () => {
		engine.content.progression = 'mainline7'; enter(); start();
		const before = session(), result = outcome(failed === 'late-win-retreat');
		if (failed !== 'loss') result.coopExit = 'retreat';
		for (const team of [result.team, result.partnerTeam]) {
			team[0].hp = 7; team[0].pp[0].pp = 3;
			team[0].set.level = 99; team[0].experience = 1000000;
			team[0].set.item = 'Leftovers'; team[0].evolutionProgress = { steps: 9999 };
		}
		result.bag.potion--; result.partnerBag.potion -= 2; result.bag.rarecandy = 5;
		result.defeated = [{ id: 'defeated-1', species: 'Magikarp', level: 90, captured: false,
			participants: result.team.map(m => m.id), eligible: result.team.map(m => m.id) }];
		created.rogue.onResult(result);
		for (const user of [host, guest]) {
			const m = member(user), old = before.adventure.members[user.id];
			assert.equal(m.team[0].hp, 7); assert.equal(m.team[0].pp[0].pp, 3); assert.equal(m.team[0].set.level, 25);
			assert.equal(m.team[0].experience, old.team[0].experience); assert.equal(m.team[0].set.item, '');
			assert.deepEqual(m.team[0].evolutionProgress, old.team[0].evolutionProgress);
			assert(!m.bag.rarecandy); assert.deepEqual(m.pendingMoves, []);
		}
		assert.equal(member(host).bag.potion, 5); assert.equal(member(guest).bag.potion, 4);
		assert.equal(challenge().stage, 'paused'); assert(!session().adventure.battleResult.won);
		assert.throws(() => manager.coop.command(host, { action: 'retrybattle' }));
		back(); const prizes = challenge().prizes, opponents = session().adventure.node.encounters;
		agree('retry'); manager.coop.command(host, { action: 'preparebattle', visit: view().battleSelectionKey });
		assert.deepEqual(challenge().prizes, prizes); assert.deepEqual(session().adventure.node.encounters, opponents);
		assert.equal(created.rogue.state.team[0].hp, 7);
	});
	it('claims the same resource prize once per player and leaves personal solo saves untouched', () => {
		const personal = [host, guest].map(user => store.get(user.id).run); win();
		const before = session(), prize = challenge().prizes.find(p => p.id === 'supplies'), key = challenge().key;
		choose(host, 'prize:supplies'); choose(guest, 'prize:mint'); assert.equal(challenge().stage, 'won');
		choose(guest, 'prize:supplies'); assert.equal(challenge().stage, 'claimed');
		for (const user of [host, guest]) {
			assert.equal(member(user).money, before.adventure.members[user.id].money + prize.money);
			for (const [id, amount] of Object.entries(prize.items)) assert.equal(member(user).bag[id], (before.adventure.members[user.id].bag[id] || 0) + amount);
			assert.equal(member(user).growth.offense, 100); assert.equal(member(user).growth.defense, 100);
		}
		assert.deepEqual([host, guest].map(user => store.get(user.id).run), personal);
		const saved = session(); assert.throws(() => choose(host, 'prize:supplies', { visit: key })); assert.deepEqual(session(), saved);
		agree('leave'); assert.equal(session().adventure.floor, 92); assert(!session().adventure.coopChallenge);
	});
	it('gives each player a separate chosen star target and rejects foreign targets', () => {
		win(); agree('prize:star'); const key = challenge().key;
		assert.throws(() => choose(host, 'target', { member: member(guest).team[0].id }));
		choose(host, 'target', { member: member(host).team[0].id }); assert.equal(member(host).team[0].stars || 1, 1);
		newManager(); assert.equal(challenge(guest).partnerTarget, member(host).team[0].id);
		choose(guest, 'target', { member: member(guest).team[1].id });
		assert.equal(member(host).team[0].stars, 2); assert.equal(member(guest).team[1].stars, 2);
		assert.equal(member(guest).team[0].stars || 1, 1); assert.equal(challenge().stage, 'claimed');
		assert.throws(() => choose(guest, 'target', { member: member(guest).team[2].id, visit: key }));
	});
	it('allows backing out if a star target changed and hides unavailable shared star rewards', () => {
		win(); agree('prize:star'); const id = member(host).team[0].id;
		choose(host, 'target', { member: id });
		change(s => { s.adventure.members[host.id].team[0].stars = 5; });
		choose(guest, 'target', { member: member(guest).team[0].id }); assert.equal(challenge().stage, 'won');
		assert(!challenge().ownTargets.some(t => t.member === id));
		agree('back'); assert(!challenge().selected);
		agree('prize:supplies'); assert.equal(challenge().stage, 'claimed');
	});
	it('supports delegated choices and independent targets while revocation restores personal control', () => {
		win(); choose(host, 'prize:supplies'); manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert(!challenge().ownChoice); assert.throws(() => choose(host, 'prize:star'));
		choose(guest, 'prize:star'); choose(guest, 'target', { owner: host.id, member: member(host).team[0].id });
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		assert.throws(() => choose(guest, 'target', { owner: host.id, member: member(host).team[1].id }));
		choose(guest, 'target', { member: member(guest).team[1].id }); assert.equal(challenge().stage, 'claimed');
	});
	it('rolls back both resource grants and progress when the final session write fails', () => {
		win(); choose(host, 'prize:supplies'); const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec("CREATE TEMP TRIGGER trial_write_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'trial write failed'); END;");
		try { assert.throws(() => choose(guest, 'prize:supplies'), /trial write failed/); } finally { store.db.exec('DROP TRIGGER trial_write_fail'); }
		assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		choose(guest, 'prize:supplies'); assert.equal(challenge().stage, 'claimed');
	});
	it('keeps star and personal training allocations equivalent to their native prize handlers', () => {
		win(); const s = session(), a = s.adventure, state = a.coopChallenge;
		assert(state.prizes.some(prize => prize.id === 'training'));
		const expected = [host, guest].map(user => {
			const m = structuredClone(a.members[user.id]), prize = state.personal[user.id].find(p => p.training);
			const run = { ...m, id: 'reference', floor: 91, phase: 'event', node: structuredClone(a.node) };
			run.node.challenge.prizes = [prize]; chooseChallengePrize(run, 'training'); return run;
		});
		agree('prize:training');
		for (const [index, user] of [host, guest].entries()) {
			assert.deepEqual(member(user).team, expected[index].team); assert.deepEqual(member(user).pendingMoves, expected[index].pendingMoves);
		}
	});
	it('disables shared star selection when either party no longer has an eligible target', () => {
		win(); change(s => { for (const mon of s.adventure.members[guest.id].team) mon.stars = 5; });
		assert(challenge().prizes.find(p => p.id === 'star').disabled);
		assert.throws(() => choose(host, 'prize:star')); agree('prize:mint'); assert.equal(challenge().stage, 'claimed');
	});
	it('recovers the same native battle and reward pool without discarding injuries', () => {
		enter(); start(true); const prizes = challenge().prizes, battle = battleFromState();
		try {
			for (const side of battle.sides) assert(battle.choose(side.id, 'team 12'));
			battle.damage(5, battle.p3.pokemon[0]); created.rogue.onCheckpoint(captureCoopCheckpoint(battle));
			newManager(); for (const user of [host, guest]) manager.coop.command(user, { action: 'recoverbattle' });
			const restored = Battle.fromJSON(created.rogue.resumeCheckpoint.state);
			try {
				assert.equal(restored.p3.pokemon[0].hp, battle.p3.pokemon[0].hp);
				assert.deepEqual(challenge().prizes, prizes); assert.equal(restored.p2.pokemon.length + restored.p4.pokemon.length, 4);
			} finally { restored.destroy(); }
		} finally { battle.destroy(); }
	});
	it('rolls battle settlement back before exposing a prize if the session write fails', () => {
		enter(); start(); const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec("CREATE TEMP TRIGGER trial_result_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'trial result failed'); END;");
		try { assert.throws(() => created.rogue.onResult(outcome()), /trial result failed/); } finally { store.db.exec('DROP TRIGGER trial_result_fail'); }
		assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		created.rogue.onResult(outcome()); assert.equal(challenge().stage, 'won');
	});
	it('persists both native subway companions for each player and keeps existing personal companions', () => {
		change(s => { s.adventure.members[host.id].socialCompanions = [{ id: 'riley', origin: 'event', preferences: 2, counted: [] }]; });
		enter('battlemetro'); start(); created.rogue.onResult(outcome());
		back(); agree('prize:supplies');
		assert.deepEqual(view().travellingRoster.map(p => p.id), ['riley', 'ingo']);
		assert.deepEqual(view(guest).travellingRoster.map(p => p.id), ['ingo', 'emmet']);
		const invitation = view().companionInvitation; assert.equal(invitation.id, 'emmet');
		assert.throws(() => choose(host, 'leave'), /同行邀请/);
		const before = session(); assert.throws(() => manager.coop.command(guest, {
			action: 'companioninvite', owner: host.id, visit: invitation.key, value: 'riley',
		})); assert.deepEqual(session(), before);
		manager.coop.command(host, { action: 'companioninvite', visit: invitation.key, value: 'riley' });
		assert.deepEqual(view().travellingRoster.map(p => p.id), ['ingo', 'emmet']);
		assert(member(host).socialCompanions.find(c => c.id === 'riley').away);
		assert(member(host).notices.some(text => text.includes('亚玄')));
		assert.throws(() => manager.coop.command(host, { action: 'companioninvite', visit: invitation.key, value: 'decline' }));
		newManager(); assert.deepEqual(view().travellingRoster.map(p => p.id), ['ingo', 'emmet']);
		agree('leave'); assert.equal(session().adventure.floor, 92);
		assert.deepEqual(view().travellingRoster.map(p => p.id), ['ingo', 'emmet']);
	});
	it('can decline a full-party companion invitation and preserves it on transaction failure', () => {
		change(s => {
			s.adventure.members[host.id].socialCompanions = ['ingo', 'emmet'].map(id => ({ id, origin: 'event', preferences: 0, counted: [] }));
		});
		enter('auraguard'); start(); created.rogue.onResult(outcome());
		back(); agree('prize:supplies');
		const invitation = view().companionInvitation; assert.equal(invitation.id, 'riley');
		const before = session();
		store.db.exec("CREATE TEMP TRIGGER invite_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'invite failed'); END;");
		try { assert.throws(() => manager.coop.command(host, { action: 'companioninvite', visit: invitation.key, value: 'decline' }), /invite failed/); } finally { store.db.exec('DROP TRIGGER invite_fail'); }
		assert.deepEqual(session(), before);
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		manager.coop.command(guest, { action: 'companioninvite', owner: host.id, visit: invitation.key, value: 'decline' });
		assert(!view().companionInvitation); assert.deepEqual(view().travellingRoster.map(p => p.id), ['ingo', 'emmet']);
	});
	for (const def of OPTIONAL_CHALLENGES) it(`opens ${def.id} as a challenge without an ordinary-event reroll`, () => {
		enter(def.id, Math.max(91, def.from));
		assert.equal(challenge().name, def.name); assert.deepEqual(challenge().team.map(mon => mon.species), def.team.map(entry => entry[0]));
		assert(!session().adventure.node.event); assert.equal(challenge().stage, 'offer');
	});
});
