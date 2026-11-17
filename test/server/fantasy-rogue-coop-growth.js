'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon, initializeExperience } = require('../../dist/server/fantasy-rogue/progression');
const { awardBattleExperience } = require('../../dist/server/fantasy-rogue/battle-growth');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { Battle } = require('../../dist/sim/battle');
const { recordRogueDefeat, rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { battleDragonKing } = require('../../dist/sim/fantasy-rogue-blessings');
const { captureCoopCheckpoint } = require('../../dist/sim/rogue-coop-checkpoint');
const { applyRogueGrowth } = require('../../dist/sim/rogue-growth');
const { content, set } = require('../fixtures/fantasy-rogue');
const stats = value => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });

describe('Fantasy Rogue co-op personal growth context', () => {
	let previous, store, engine, manager, host, guest, created, battle;
	let serial = 0;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true;
		Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:');
		const data = content(); data.progression = 'mainline7';
		for (const item of data.items) if (item.kind === 'ball') item.multiplier = 1;
		engine = new RogueEngine(store, data);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue };
			return { roomid: 'battle-coop-growth-fixture' };
		} }));
		host = makeUser(`Growth Host ${++serial}`, `127.0.43.${serial}`);
		guest = makeUser(`Growth Guest ${serial}`, `127.0.44.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
	});
	afterEach(() => {
		battle?.destroy(); battle = undefined;
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = previous.local; Config.bindaddress = previous.bind; Config.fantasyrogue = previous.rogue;
	});
	function configure(callback, dragon = false) {
		const session = store.coopSessionForUser(host.id), expected = session.revision;
		for (const user of [host, guest]) {
			const member = session.adventure.members[user.id];
			member.team = (dragon ? [set('Dragonite', 'Inner Focus', 40), set('Dragonair', 'Shed Skin', 35),
				set('Dratini', 'Shed Skin', 30)] : [set('Machop', 'Guts', 20), set('Machop', 'Guts', 20)])
				.map(entry => createRoguePokemon(entry, stats(0)));
			for (const mon of member.team) initializeExperience(mon);
			member.blessings = normalizeBlessings({ floor: 1, team: member.team, box: [], bag: {}, boosts: stats(0) });
			callback(member, user);
		}
		session.revision++;
		store.updateCoopSession(session, expected);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'grass' });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle',
			members: session.adventure.members[user.id].team.slice(0, dragon ? 2 : 1).map(mon => mon.id) });
		return store.coopSessionForUser(host.id);
	}
	const owned = id => ({ ...blessing(id), floor: 1 });
	it('does not apply the solo Latios experience bonus to either cooperative owner', () => {
		const session = store.coopSessionForUser(host.id), revision = session.revision;
		session.adventure.spirit = 'latios'; session.adventure.spiritVersion = 1; session.revision++;
		store.updateCoopSession(session, revision);
		const shared = configure(() => {});
		verifySettlement(shared, result());
	});
	it('round trips a native four-seat knockout through the real XP transaction and checkpoint replay', () => {
		const shared = configure(member => {
			member.team[0] = createRoguePokemon(set('Machop', 'Guts', 20, ['Tackle']), stats(0));
			initializeExperience(member.team[0]);
		});
		const state = structuredClone(created.rogue.state), messages = [];
		state.liveProgression = true;
		const foes = () => [set('Magikarp', 'Swift Swim', 5, ['Splash']), set('Magikarp', 'Swift Swim', 5, ['Splash'])];
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', fantasyRogue: state, seed: [1, 2, 3, 4],
			p1: { name: host.name, team: state.team.map(mon => mon.set) },
			p3: { name: guest.name, team: state.partner.team.map(mon => mon.set) },
			p2: { name: 'Wild A', team: foes() }, p4: { name: 'Wild B', team: foes() },
			send(type, payload) { if (type === 'fantasyrogueprogress') messages.push(JSON.parse(payload)); } });
		battle.makeChoices('team 1', 'team 12', 'team 1', 'team 12');
		battle.p2.active[0].hp = 1; battle.p4.active[0].hp = 1;
		battle.makeChoices('move tackle 1', 'move splash', 'move tackle 2', 'move splash');
		assert.equal(messages.length, 1); assert.equal(messages[0].sequence, 2);
		const outcome = rogueBattleResult(battle, false), checkpoint = captureCoopCheckpoint(battle);
		const ack = progress(shared, outcome);
		assert.equal(ack.paused, false);
		const saved = store.coopSessionForUser(host.id);
		battle.destroy(); battle = Battle.fromJSON(checkpoint.state);
		applyRogueGrowth(battle, progress(shared, outcome));
		assert.deepEqual(store.coopSessionForUser(host.id), saved, 'replayed progress is not another award');
		assert.equal(battle.fantasyRogue.growthRevision, ack.revision);
		assert.equal(battle.fantasyRogue.team[0].experience, ack.team[0].experience);
		assert.equal(battle.fantasyRogue.partner.team[0].experience, ack.partner.team[0].experience);
		assert(battle.p2.activeRequest.forceSwitch); assert(battle.p4.activeRequest.forceSwitch);
		battle.makeChoices('pass', 'switch 2', 'pass', 'switch 2');
		assert(!battle.p1.activeRequest.wait); assert(!battle.p3.activeRequest.wait);
		created.rogue.onResult({ ...rogueBattleResult(battle, false), coopExit: 'retreat' });
		for (const user of [host, guest]) assert.equal(store.coopSessionForUser(host.id).adventure.members[user.id]
			.team[0].experience, saved.adventure.members[user.id].team[0].experience);
	});
	function progress(shared, outcome, sequence = outcome.defeated.length) {
		return manager.coop.progressBattle(shared.id, shared.adventure.battleToken,
			shared.adventure.battleLease, sequence, outcome);
	}
	for (const exit of ['win', 'retreat']) it(`returns knocked-off equipment to the correct co-op owner on ${exit} after reconnect`, () => {
		const shared = configure((member, user) => {
			member.team[0] = createRoguePokemon({ ...set('Snorlax', 'Immunity', 50, ['Thief', 'Splash']),
				item: user === host ? 'Choice Band' : 'Assault Vest' }, stats(0));
			initializeExperience(member.team[0]);
		});
		const state = created.rogue.state;
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', fantasyRogue: state, seed: [1, 2, 3, 4],
			p1: { name: host.name, team: state.team.map(mon => mon.set) },
			p3: { name: guest.name, team: state.partner.team.map(mon => mon.set) },
			p2: { team: [{ ...set('Mew', 'Synchronize', 5, ['Knock Off']), item: 'Leftovers' }] },
			p4: { team: [set('Mew', 'Synchronize', 5, ['Knock Off'])] } });
		battle.makeChoices('team 1', 'team 1', 'team 1', 'team 1');
		battle.actions.useMove('knockoff', battle.p2.active[0], { target: battle.p1.active[0] });
		battle.actions.useMove('knockoff', battle.p4.active[0], { target: battle.p3.active[0] });
		assert.equal(battle.p1.active[0].item, ''); assert.equal(battle.p3.active[0].item, '');
		battle.p2.active[0].hp = battle.p2.active[0].maxhp = 9999;
		battle.actions.useMove('thief', battle.p1.active[0], { target: battle.p2.active[0] });
		const checkpoint = JSON.parse(JSON.stringify(captureCoopCheckpoint(battle)));
		battle.destroy(); battle = Battle.fromJSON(checkpoint.state);
		assert.equal(battle.p1.active[0].item, 'leftovers'); assert.equal(battle.p3.active[0].item, '');
		assert.deepEqual(rogueBattleResult(battle).knockedOffItems, checkpoint.result.knockedOffItems);
		battle.win(exit === 'win' ? battle.p1 : battle.p2);
		const outcome = rogueBattleResult(battle);
		if (exit === 'retreat') outcome.coopExit = 'retreat';
		if (exit === 'win') {
			const before = store.coopSessionForUser(host.id), update = store.updateCoopSession;
			try {
				store.updateCoopSession = (...args) => { update.apply(store, args); throw new Error('injected settlement failure'); };
				assert.throws(() => manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome), /injected settlement failure/);
				assert.deepEqual(store.coopSessionForUser(host.id), before, 'failed transaction must not return any item');
			} finally { store.updateCoopSession = update; }
		}
		manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome);
		const saved = store.coopSessionForUser(host.id), a = saved.adventure.members[host.id], b = saved.adventure.members[guest.id];
		assert.equal(a.team[0].set.item, 'leftovers'); assert.equal(a.bag.choiceband, 1);
		assert.equal(b.team[0].set.item, 'assaultvest'); assert.equal(b.bag.choiceband, undefined);
		assert.deepEqual(a.team[1], shared.adventure.members[host.id].team[1]);
		assert.deepEqual(b.team[1], shared.adventure.members[guest.id].team[1]);
		manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome);
		assert.deepEqual(store.coopSessionForUser(host.id), saved, 'duplicate delivery cannot return items again');
	});
	function growthCommand(user, action, fields = {}) {
		const view = manager.coop.view(user).session.adventure;
		return manager.coop.command(user, { action, visit: view.liveGrowth?.key, ...fields });
	}
	function skipMoves(user) {
		for (let count = 0; count < 50; count++) {
			const pending = store.coopSessionForUser(user.id).adventure.members[user.id].pendingMoves?.[0];
			if (!pending) return;
			growthCommand(user, 'learn', { member: pending.member, move: pending.move, value: 'skip' });
		}
		assert.fail('learning queue did not drain');
	}
	function startLearning(species = 'Bulbasaur', level = 5) {
		const shared = configure(member => {
			member.team[0] = createRoguePokemon(set(species, 'Run Away', level, ['Tackle', 'Growl', 'Splash', 'Protect']), stats(0));
			initializeExperience(member.team[0]);
		});
		const outcome = { ...result(), won: false };
		outcome.defeated[0].species = 'Blissey'; outcome.defeated[0].level = 90;
		progress(shared, outcome);
		return shared;
	}
	it('allows only fresh personal growth decisions and waits until both owners finish', () => {
		startLearning();
		let view = manager.coop.view(host).session.adventure;
		assert(view.pendingMove && view.partnerPendingMove && view.liveGrowth);
		assert.equal(view.liveGrowth.evolutions[0].shiny, false);
		const command = { action: 'learn', visit: view.liveGrowth.key, member: view.pendingMove.member,
			move: view.pendingMove.move, value: 'skip' };
		const before = store.coopSessionForUser(host.id);
		assert.throws(() => manager.coop.command(guest, { ...command, owner: host.id }), /自己的/);
		assert.throws(() => manager.coop.command(host, { ...command, visit: 'stale' }), /提示已变化/);
		assert.throws(() => growthCommand(host, 'evolve', { member: command.member, value: 'ivysaur' }), /待学习/);
		assert.deepEqual(store.coopSessionForUser(host.id), before);
		manager.coop.command(host, command);
		assert.throws(() => manager.coop.command(host, command), /提示已变化/);
		assert(store.get(host.id).starterTraits.bulbasaur.moves.includes(command.move));
		skipMoves(host);
		view = manager.coop.view(host).session.adventure;
		for (const mon of view.liveGrowth.evolutions) growthCommand(host, 'evolutionnotice', { member: mon.member });
		assert(store.coopSessionForUser(host.id).adventure.battleGrowth.paused, 'guest still has decisions');
		skipMoves(guest);
		view = manager.coop.view(guest).session.adventure;
		for (const mon of view.liveGrowth.evolutions) growthCommand(guest, 'evolutionnotice', { member: mon.member });
		assert.equal(store.coopSessionForUser(host.id).adventure.battleGrowth.paused, false);
		assert.equal(manager.coop.view(host).session.adventure.liveGrowth, null);
		assert.throws(() => growthCommand(host, 'evolutionnotice', { member: command.member }), /提示已变化/);
	});
	it('uses delegated learning and lets either player revoke before stale partner input', () => {
		startLearning();
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		const view = manager.coop.view(host).session.adventure, pending = view.partnerPendingMove;
		const command = { action: 'learn', owner: guest.id, member: pending.member, move: pending.move,
			value: 'skip', visit: view.liveGrowth.key };
		assert.throws(() => manager.coop.command(guest, { ...command, owner: guest.id }), /操作权/);
		manager.coop.command(host, command);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.throws(() => manager.coop.command(host, command), /自己的/);
	});
	it('evolves during the safe pause without healing or admitting a new Shedinja to battle', () => {
		startLearning('Nincada', 19); skipMoves(host);
		const view = manager.coop.view(host).session.adventure, id = view.liveGrowth.evolutions[0].member;
		const before = store.coopSessionForUser(host.id), original = before.adventure.members[host.id];
		assert(view.liveGrowth.evolutions[0].options.some(option => option.species === 'Ninjask'));
		assert.throws(() => growthCommand(host, 'evolve', { member: id, value: 'shedinja' }), /满足条件/);
		growthCommand(host, 'evolve', { member: id, value: 'ninjask' });
		const saved = store.coopSessionForUser(host.id), member = saved.adventure.members[host.id];
		assert.equal(member.team[0].set.species, 'Ninjask'); assert.equal(member.team.at(-1).set.species, 'Shedinja');
		assert.equal(member.team.length, original.team.length + 1);
		assert.equal(member.bag.pokeball, original.bag.pokeball - 1);
		assert.equal(member.team[0].maxhp - member.team[0].hp, original.team[0].maxhp - original.team[0].hp);
		assert.deepEqual(saved.battleSelections, before.battleSelections);
		const { coopGrowthAcknowledgement } = require('../../dist/server/fantasy-rogue/coop-growth');
		assert.equal(coopGrowthAcknowledgement(saved).team.length, 1);
	});
	it('rolls a failed evolution save back before notifying either owner', () => {
		startLearning(); skipMoves(host);
		const view = manager.coop.view(host).session.adventure, shared = store.coopSessionForUser(host.id);
		const accounts = [host, guest].map(user => store.get(user.id)), update = store.updateCoopSession;
		const command = { action: 'evolve', visit: view.liveGrowth.key,
			member: view.liveGrowth.evolutions[0].member, value: 'ivysaur' };
		try {
			store.updateCoopSession = (...args) => { update.apply(store, args); throw new Error('evolution write failed'); };
			// Wrap the injected post-commit fault just as normal write failures are covered by the transaction boundary.
			assert.throws(() => manager.coop.command(host, command), /evolution write failed/);
			assertUnchanged(shared, accounts);
		} finally { store.updateCoopSession = update; }
		manager.coop.command(host, command);
		assert.equal(store.coopSessionForUser(host.id).adventure.members[host.id].team[0].set.species, 'Ivysaur');
	});
	it('commits both live XP receipts once, preserving private bonuses and untouched reserves', () => {
		const shared = configure((member, user) => {
			if (user === host) member.growth = { offense: 0, defense: 0, experience: 2500 };
		});
		const accounts = [host, guest].map(user => store.get(user.id)), outcome = { ...result(), won: false };
		const expected = [host, guest].map((user, index) => expectedGrowth(shared.adventure, user.id, outcome, !!index));
		const ack = progress(shared, outcome), saved = store.coopSessionForUser(host.id);
		assert.equal(ack.sequence, 1); assert.equal(ack.revision, 1);
		for (const [index, user] of [host, guest].entries()) {
			const member = saved.adventure.members[user.id], before = shared.adventure.members[user.id];
			assert.deepEqual(member.team.map(mon => [mon.experience, mon.set.evs, mon.set.level]),
				expected[index].team.map(mon => [mon.experience, mon.set.evs, mon.set.level]));
			assert.deepEqual(member.experienceReceipts, expected[index].experienceReceipts);
			assert.deepEqual(member.team[1], before.team[1]);
			assert.deepEqual(store.get(user.id).run, accounts[index].run);
			assert.deepEqual((index ? ack.partner : ack).team, [member.team[0]]);
		}
		assert.deepEqual(progress(shared, outcome), ack);
		assert.deepEqual(store.coopSessionForUser(host.id), saved);
		created.rogue.onResult({ ...outcome, won: true });
		const final = store.coopSessionForUser(host.id);
		for (const user of [host, guest]) assert.equal(final.adventure.members[user.id].team[0].experience,
			saved.adventure.members[user.id].team[0].experience, 'final stale snapshot cannot erase or duplicate awarded XP');
		assert.equal(final.adventure.battleGrowth, undefined);
	});
	it('rejects wrong room ownership, mismatched parties and stale progression without partial writes', () => {
		const shared = configure(() => {}), outcome = { ...result(), won: false };
		const accounts = [host, guest].map(user => store.get(user.id));
		assert.equal(manager.coop.progressBattle(shared.id, shared.adventure.battleToken, 'old-room', 1, outcome), undefined);
		assert.throws(() => progress(shared, outcome, 2), /不匹配/);
		assert.throws(() => progress(shared, { ...outcome, partnerTeam: outcome.team }), /不匹配/);
		assertUnchanged(shared, accounts);
		progress(shared, outcome);
		const saved = store.coopSessionForUser(host.id);
		const second = { ...outcome, defeated: [...outcome.defeated, { ...outcome.defeated[0], id: 'second' }] };
		assert.throws(() => progress(shared, second), /尚未应用/);
		assert.deepEqual(store.coopSessionForUser(host.id), saved);
	});
	for (const fault of ['session', 'guest']) it(`atomically rolls both live owners back on ${fault} write failure`, () => {
		const shared = configure(() => {}), outcome = { ...result(), won: false };
		const accounts = [host, guest].map(user => store.get(user.id));
		const update = store.updateCoopSession, change = store.change;
		try {
			if (fault === 'session') store.updateCoopSession = (...args) => {
				update.apply(store, args); throw new Error('live write failed');
			};
			else store.change = (...args) => {
				const saved = change.apply(store, args);
				if (args[0] === guest.id) throw new Error('live write failed');
				return saved;
			};
			assert.throws(() => progress(shared, outcome), /live write failed/);
			assertUnchanged(shared, accounts);
		} finally { store.updateCoopSession = update; store.change = change; }
		assert.equal(progress(shared, outcome).revision, 1);
	});
	it('awards only a fresh second receipt and preserves current damage when retreat races its acknowledgement', () => {
		const shared = configure(() => {}), first = { ...result(), won: false };
		const ack = progress(shared, first);
		const second = { ...first, team: ack.team, partnerTeam: ack.partner.team, growthRevision: ack.revision,
			defeated: [...first.defeated, { ...first.defeated[0], id: 'second' }] };
		second.team[0].hp -= 7; second.partnerTeam[0].hp -= 9;
		const next = progress(shared, second), saved = store.coopSessionForUser(host.id);
		assert.equal(next.revision, 2); assert.equal(next.sequence, 2);
		assert(next.team[0].experience > ack.team[0].experience);
		created.rogue.onResult({ ...second, coopExit: 'retreat' });
		const final = store.coopSessionForUser(host.id);
		for (const [index, user] of [host, guest].entries()) {
			const mon = final.adventure.members[user.id].team[0];
			assert.equal(mon.experience, saved.adventure.members[user.id].team[0].experience);
			assert.equal(mon.maxhp - mon.hp, index ? 9 : 7);
		}
	});
	function result(captured = false) {
		const state = created.rogue.state;
		const ids = [...state.team, ...state.partner.team].map(mon => mon.id);
		return { encounterId: state.encounterId, won: true, turns: 2, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag },
			defeated: [{ id: 'defeated-1', species: 'Magikarp', level: 40, captured,
				participants: ids, eligible: ids, killer: ids[0] }] };
	}
	function expectedGrowth(adventure, userid, outcome, partner = false) {
		const member = structuredClone(adventure.members[userid]);
		const run = { ...member, id: 'reference', floor: adventure.floor, node: adventure.node, phase: 'settlement',
			notices: [], pendingMoves: [], experienceReceipts: [] };
		awardBattleExperience(run, { ...outcome, defeated: outcome.defeated.map(defeated => ({ ...defeated,
			dragonKing: partner ? defeated.partnerDragonKing : defeated.dragonKing })) });
		return run;
	}
	function verifySettlement(session, outcome) {
		const personal = [host, guest].map(user => structuredClone(store.get(user.id).run));
		const expected = [host, guest].map((user, index) => expectedGrowth(session.adventure, user.id, outcome, !!index));
		created.rogue.onResult(outcome);
		const saved = store.coopSessionForUser(host.id);
		for (const [index, user] of [host, guest].entries()) {
			const member = saved.adventure.members[user.id];
			assert.deepEqual(member.team.map(mon => [mon.id, mon.experience, mon.set.evs, mon.set.level]),
				expected[index].team.map(mon => [mon.id, mon.experience, mon.set.evs, mon.set.level]));
			assert.deepEqual(member.pendingMoves, expected[index].pendingMoves);
			assert.deepEqual(member.experienceReceipts, expected[index].experienceReceipts);
			assert.deepEqual(store.get(user.id).run, personal[index], 'personal solo run is untouched');
		}
		created.rogue.onResult(outcome);
		assert.deepEqual(store.coopSessionForUser(host.id).adventure, saved.adventure, 'duplicate result does not award twice');
		return saved;
	}

	for (const captured of [false, true]) it(`applies each owner's stacked bonuses to ${captured ? 'capture' : 'defeat'} XP`, () => {
		const session = configure((member, user) => {
			if (user === guest) return;
			member.growth = { offense: 0, defense: 0, experience: 2500 };
			member.blessings.owned.push(owned('sololeveling'), { id: 'typexpfighting', family: 'typexp', type: 'Fighting', floor: 1 });
			member.blessings.companions = [{ id: 'bea', away: false }];
		});
		const before = session.adventure.members, saved = verifySettlement(session, result(captured)).adventure.members;
		const gain = user => saved[user.id].team[0].experience - before[user.id].team[0].experience;
		assert(gain(host) > gain(guest) * 2 && gain(host) < gain(guest) * 3, 'type XP, growth and companion remain; solo no longer adds 50%');
		assert.equal(saved[host.id].team[1].experience, before[host.id].team[1].experience, 'unselected reserve gains no XP');
		assert.equal(saved[host.id].team[0].set.evs.spe, captured ? 0 : saved[guest.id].team[0].set.evs.spe * 2);
	});
	it('keeps unboosted legacy member states valid', () => {
		const session = configure(member => { delete member.blessings; delete member.growth; });
		verifySettlement(session, result());
	});
	it('discards battle-only full-party contexts while preserving each owner growth and effects', () => {
		const shared = configure(() => {}), outcome = result();
		engine.content.blessings = true;
		const effects = owner => ({ ...structuredClone(shared.adventure.members[owner].blessings),
			party: [{ id: 'reserve-context', species: 'Mew', types: ['Psychic'], moves: ['splash'] }],
			partyRoles: { species: { hoopa: 'reserve-context' }, robes: { godrobe: '', puregodrobe: '' }, sniper: '', dogs: 0 },
			unityParty: [{ id: 'reserve-context', types: ['Psychic'] }] });
		outcome.blessingEffects = effects(host.id); outcome.partnerBlessingEffects = effects(guest.id);
		const saved = verifySettlement(shared, outcome);
		for (const user of [host, guest]) {
			assert.equal(saved.adventure.members[user.id].blessings.party, undefined);
			assert.equal(saved.adventure.members[user.id].blessings.unityParty, undefined);
			assert.equal(saved.adventure.members[user.id].blessings.partyRoles, undefined);
		}
	});
	it('supplies roles for the full owner party before constructing its selected battle team', () => {
		const shared = configure(member => {
			member.team = [20, 40].map(level => createRoguePokemon(set('Golduck', 'Run Away', level, ['Splash']), stats(0)));
			member.blessings.owned.push(owned('duck'));
		});
		for (const [user, effects, team] of [[host, created.rogue.state.blessings, created.rogue.state.team],
			[guest, created.rogue.state.partner.blessings, created.rogue.state.partner.team]]) {
			assert.equal(team.length, 1);
			assert.equal(effects.partyRoles.species['psyduck|golduck'], shared.adventure.members[user.id].team[1].id);
			assert.notEqual(effects.partyRoles.species['psyduck|golduck'], team[0].id);
		}
	});
	function capturedResult() {
		const outcome = result(true);
		const mon = createRoguePokemon(set('Magikarp', 'Swift Swim', 12, ['Splash']), stats(0));
		outcome.captures = [mon]; outcome.captureOwners = { [mon.id]: 'p3' };
		outcome.partnerBag.pokeball--;
		return outcome;
	}
	function mouseBattle() {
		const shared = configure(member => {
			member.team = ['Pikachu', 'Raichu', 'Plusle', 'Minun', 'Pachirisu', 'Dedenne'].map((species, index) =>
				createRoguePokemon({ ...set(species, 'Run Away', 30, ['Splash']), item: index === 4 ? 'sitrusberry' : '' }, stats(0)));
			member.blessings.owned.push(owned('mousefamily'));
		});
		const state = created.rogue.state;
		assert.equal(state.blessings.party[4].item, 'sitrusberry');
		assert.equal(state.partner.blessings.party[4].item, 'sitrusberry');
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', fantasyRogue: state, seed: [1, 2, 3, 4],
			p1: { name: host.name, team: state.team.map(mon => mon.set) },
			p3: { name: guest.name, team: state.partner.team.map(mon => mon.set) },
			p2: { name: 'Enemy A', team: [set('Blissey', 'Run Away', 30, ['Splash'])] },
			p4: { name: 'Enemy B', team: [set('Blissey', 'Run Away', 30, ['Splash'])] } });
		battle.makeChoices('team 1', 'team 1', 'team 1', 'team 1');
		return shared;
	}
	it('keeps committed growth through a stale capture packet without awarding unselected new members', () => {
		const shared = configure(() => {}), first = { ...result(), won: false };
		progress(shared, first);
		const trained = store.coopSessionForUser(host.id), capture = { ...capturedResult(), won: false };
		capture.defeated[0].id = 'captured-second';
		manager.coop.recordCapture(shared.id, shared.adventure.battleToken, capture.captures[0], capture);
		const saved = store.coopSessionForUser(host.id);
		for (const user of [host, guest]) assert.equal(saved.adventure.members[user.id].team[0].experience,
			trained.adventure.members[user.id].team[0].experience);
		assert.equal(saved.adventure.members[guest.id].team.length, 3);
		const repeated = progress(shared, first);
		assert.equal(repeated.partner.team.length, 1, 'capture must not expand the original battle selection');
		assert.equal(repeated.partner.bag.pokeball, capture.partnerBag.pokeball);
		const baseline = structuredClone(capture.captures[0]); initializeExperience(baseline);
		assert.equal(saved.adventure.members[guest.id].team[2].experience, baseline.experience);
	});
	function mouseResult(side, extra = {}) {
		const mon = battle[side].active[0]; mon.hp = Math.floor(mon.maxhp / 3); battle.runEvent('Update', mon);
		assert(mon.hp > mon.maxhp / 3);
		return { ...rogueBattleResult(battle), won: true, ...extra };
	}
	for (const side of ['p1', 'p3']) it(`saves ${side} native reserve item consumption once without affecting its partner`, () => {
		const shared = mouseBattle(), outcome = mouseResult(side);
		const saved = manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome);
		for (const [index, user] of [host, guest].entries()) {
			assert.equal(saved.adventure.members[user.id].team[4].set.item, side === (index ? 'p3' : 'p1') ? '' : 'sitrusberry');
			assert.equal(saved.adventure.members[user.id].blessings.party, undefined);
		}
		const committed = store.coopSessionForUser(host.id);
		manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome);
		assert.deepEqual(store.coopSessionForUser(host.id), committed);
	});
	it('rolls reserve item costs back when the final session write fails', () => {
		const shared = mouseBattle(), outcome = mouseResult('p3'), original = store.updateCoopSession;
		const accounts = [host, guest].map(user => store.get(user.id));
		try {
			store.updateCoopSession = (...args) => { original.apply(store, args); throw new Error('reserve write failed'); };
			assert.throws(() => manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome), /reserve write failed/);
			assertUnchanged(shared, accounts);
		} finally { store.updateCoopSession = original; }
		assert.equal(manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome)
			.adventure.members[guest.id].team[4].set.item, '');
	});
	it('saves reserve costs alongside a mid-battle capture and does not refund them on retreat', () => {
		const shared = mouseBattle(), capture = capturedResult();
		const outcome = mouseResult('p3', { captures: capture.captures, captureOwners: capture.captureOwners });
		manager.coop.recordCapture(shared.id, shared.adventure.battleToken, capture.captures[0], outcome);
		assert.equal(store.coopSessionForUser(host.id).adventure.members[guest.id].team[4].set.item, '');
		outcome.coopExit = 'retreat'; outcome.won = false;
		const saved = manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome);
		assert.equal(saved.adventure.members[guest.id].team[4].set.item, '');
		assert.equal(saved.adventure.members[host.id].team[4].set.item, 'sitrusberry');
	});
	it('ignores a stale reserve receipt for a different owner or item', () => {
		const shared = mouseBattle(), outcome = mouseResult('p3');
		outcome.partnerBlessingEffects.party[4].consumedItem = 'oranberry';
		outcome.partnerBlessingEffects.party.push({ id: shared.adventure.members[host.id].team[4].id,
			item: '', consumedItem: 'sitrusberry' });
		const saved = manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome);
		for (const user of [host, guest]) assert.equal(saved.adventure.members[user.id].team[4].set.item, 'sitrusberry');
	});
	function assertUnchanged(shared, accounts) {
		assert.deepEqual(store.coopSessionForUser(host.id), shared);
		for (const [index, user] of [host, guest].entries()) assert.deepEqual(store.get(user.id), accounts[index]);
	}
	it('rolls capture unlocks and receipts back with a failed session write, notifying only after commit', () => {
		const shared = configure(() => {}), outcome = capturedResult(), mon = outcome.captures[0];
		const accounts = [host, guest].map(user => store.get(user.id));
		const original = store.updateCoopSession, send = host.send;
		let notices = 0;
		try {
			host.send = message => {
				if (String(message).includes('captureResolved')) {
					notices++;
					assert.equal(store.get(guest.id).captures.magikarp, 1);
					assert(store.coopSessionForUser(host.id).adventure.captureReceipts.includes(`${shared.adventure.battleToken}:${mon.id}`));
				}
			};
			store.updateCoopSession = (...args) => { original.apply(store, args); throw new Error('capture write failed'); };
			assert.throws(() => manager.coop.recordCapture(shared.id, shared.adventure.battleToken, mon, outcome), /capture write failed/);
			assertUnchanged(shared, accounts); assert.equal(notices, 0);
			store.updateCoopSession = original;
			manager.coop.recordCapture(shared.id, shared.adventure.battleToken, mon, outcome);
			manager.coop.recordCapture(shared.id, shared.adventure.battleToken, mon, outcome);
			assert.equal(notices, 1); assert.equal(store.get(guest.id).captures.magikarp, 1);
		} finally { store.updateCoopSession = original; host.send = send; }
	});
	it('rejects a bad capture snapshot without leaving a personal unlock behind', () => {
		const shared = configure(() => {}), outcome = capturedResult();
		const accounts = [host, guest].map(user => store.get(user.id));
		outcome.partnerTeam[0].id = 'foreign-member';
		assert.throws(() => manager.coop.recordCapture(shared.id, shared.adventure.battleToken,
			outcome.captures[0], outcome), /快照/);
		assertUnchanged(shared, accounts);
	});
	for (const failAt of ['session', 'guest-account']) {
		it(`rolls both battle blessing discoveries and growth back after a ${failAt} failure`, () => {
			const shared = configure(member => member.blessings.owned.push(owned('bignumber')));
			engine.content.blessings = true;
			const outcome = result();
			outcome.blessingProgress = { kos: [], swords: 0, insight: {}, numberUpgrade: true };
			outcome.partnerBlessingProgress = { kos: [], swords: 0, insight: {}, numberUpgrade: true };
			const accounts = [host, guest].map(user => store.get(user.id));
			const originalUpdate = store.updateCoopSession, originalChange = store.change, send = host.send;
			let notices = 0;
			try {
				host.send = message => {
					if (String(message).includes('battleResult')) {
						notices++;
						assert(store.coopSessionForUser(host.id).adventure.battleResult);
						assert(store.get(guest.id).discoveries.blessings.includes('supernumber'));
					}
				};
				if (failAt === 'session') {
					store.updateCoopSession = (...args) => { originalUpdate.apply(store, args); throw new Error('battle write failed'); };
				} else {
					store.change = (...args) => {
						const saved = originalChange.apply(store, args);
						if (args[0] === guest.id) throw new Error('battle write failed');
						return saved;
					};
				}
				assert.throws(() => manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome), /battle write failed/);
				assertUnchanged(shared, accounts); assert.equal(notices, 0);
				store.updateCoopSession = originalUpdate; store.change = originalChange;
				const saved = manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome);
				assert.equal(saved.adventure.phase, 'settlement');
				for (const user of [host, guest]) {
					assert(store.get(user.id).discoveries.blessings.includes('supernumber'));
					assert(saved.adventure.members[user.id].team[0].experience > shared.adventure.members[user.id].team[0].experience);
				}
				const afterAccounts = [host, guest].map(user => store.get(user.id));
				const persisted = store.coopSessionForUser(host.id);
				manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome);
				assertUnchanged(persisted, afterAccounts); assert.equal(notices, 1);
			} finally { store.updateCoopSession = originalUpdate; store.change = originalChange; host.send = send; }
		});
	}
	for (const alreadyRecorded of [false, true]) {
		it(`keeps ${alreadyRecorded ? 'committed' : 'replayed'} captures consistent when final battle saving fails`, () => {
			const shared = configure(() => {}), outcome = capturedResult(), mon = outcome.captures[0];
			if (alreadyRecorded) manager.coop.recordCapture(shared.id, shared.adventure.battleToken, mon, outcome);
			const before = store.coopSessionForUser(host.id), accounts = [host, guest].map(user => store.get(user.id));
			const original = store.updateCoopSession, send = host.send;
			let notices = 0;
			try {
				host.send = message => { if (String(message).includes('fantasyroguecoopnotice')) notices++; };
				store.updateCoopSession = (...args) => {
					const saved = original.apply(store, args);
					if (args[0].adventure.battleResult) throw new Error('final write failed');
					return saved;
				};
				assert.throws(() => manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome), /final write failed/);
				assertUnchanged(before, accounts); assert.equal(notices, 0);
				store.updateCoopSession = original;
				const saved = manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome);
				assert.equal(store.get(guest.id).captures.magikarp, 1);
				assert.equal(saved.adventure.captureReceipts.filter(receipt => receipt.endsWith(mon.id)).length, 1);
				assert.equal(saved.adventure.members[guest.id].team.filter(entry => entry.id === mon.id).length, 1);
				assert.equal(notices, 1, 'no tentative capture notification escapes the enclosing battle transaction');
			} finally { store.updateCoopSession = original; host.send = send; }
		});
	}
	it('awards eligible defeats on a loss once, including duplicated receipts in the same result', () => {
		const session = configure(member => { member.growth = { offense: 0, defense: 0, experience: 1500 }; });
		const outcome = result(); outcome.won = false;
		outcome.defeated.push(structuredClone(outcome.defeated[0]));
		const saved = verifySettlement(session, outcome);
		for (const user of [host, guest]) assert.equal(saved.adventure.members[user.id].experienceReceipts.length, 1);
	});
	it('commits an upgrade move and its permanent discovery together, preserving the pending choice on failure', () => {
		const shared = configure(member => {
			member.team = [createRoguePokemon(set(), stats(0))];
			initializeExperience(member.team[0]);
		});
		const outcome = result(); outcome.defeated = [];
		manager.coop.settleBattle(shared.id, shared.adventure.battleToken, outcome);
		const prepared = store.coopSessionForUser(host.id), revision = prepared.revision;
		const mon = prepared.adventure.members[host.id].team[0];
		prepared.adventure.members[host.id].pendingMoves = [{ member: mon.id, move: 'razorleaf' }];
		prepared.revision++; store.updateCoopSession(prepared, revision);
		const before = store.coopSessionForUser(host.id), accounts = [host, guest].map(user => store.get(user.id));
		const changeAccount = store.change;
		const command = { action: 'learn', member: mon.id, value: '0' };
		try {
			store.change = (...args) => { changeAccount.apply(store, args); throw new Error('move write failed'); };
			assert.throws(() => manager.coop.command(host, command), /move write failed/);
			assertUnchanged(before, accounts);
		} finally { store.change = changeAccount; }
		manager.coop.command(host, command);
		const saved = store.coopSessionForUser(host.id).adventure.members[host.id];
		assert.equal(saved.pendingMoves.length, 0); assert.equal(saved.team[0].set.moves[0], 'razorleaf');
		assert(store.get(host.id).starterTraits.bulbasaur.moves.includes('razorleaf'));
		assert.deepEqual(store.get(host.id).run, accounts[0].run);
		assert.deepEqual(store.get(guest.id), accounts[1]);
		assert.throws(() => manager.coop.command(host, command), /待学习招式/);
	});
	for (const oldReceipt of [false, true]) it(`uses the partner king ${oldReceipt ? 'fallback for an old receipt' : 'recorded at defeat'}`, () => {
		const session = configure(member => {
			member.blessings.owned.push(owned('dragonking'));
			member.blessings.companions = [{ id: 'iris', away: false }];
			member.blessings.dragonKing = { member: member.team[0].id, ability: 'drizzle' };
		}, true);
		const outcome = result(), members = session.adventure.members;
		outcome.defeated[0].dragonKing = members[host.id].team[0].id;
		if (!oldReceipt) outcome.defeated[0].partnerDragonKing = members[guest.id].team[1].id;
		verifySettlement(session, outcome);
	});
	it('preserves an explicitly absent partner king instead of using the current saved king', () => {
		const session = configure(member => {
			member.blessings.owned.push(owned('dragonking'));
			member.blessings.dragonKing = { member: member.team[0].id, ability: 'drizzle' };
		}, true);
		const outcome = result();
		outcome.defeated[0].dragonKing = session.adventure.members[host.id].team[0].id;
		outcome.defeated[0].partnerDragonKing = '';
		verifySettlement(session, outcome);
	});
	it('records both native kings at the moment of defeat without reading the other member as the king', () => {
		configure(member => {
			member.blessings.owned.push(owned('dragonking'));
			member.blessings.dragonKing = { member: member.team[0].id, ability: 'drizzle' };
		}, true);
		const state = created.rogue.state;
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', fantasyRogue: state, seed: [1, 2, 3, 4],
			p1: { team: state.team.map(mon => mon.set) }, p3: { team: state.partner.team.map(mon => mon.set) },
			p2: { team: [set('Magikarp', 'Swift Swim', 40, ['Splash'])] },
			p4: { team: [set('Magikarp', 'Swift Swim', 40, ['Splash'])] } });
		battle.makeChoices('team 12', 'team 1', 'team 12', 'team 1');
		const hostKing = battleDragonKing(battle.p1), guestKing = battleDragonKing(battle.p3);
		assert.notEqual(hostKing.member, guestKing.member);
		recordRogueDefeat(battle, battle.p2.active[0]);
		const defeat = battle.fantasyRogue.defeated.at(-1);
		assert.equal(defeat.dragonKing, hostKing.member);
		assert.equal(defeat.partnerDragonKing, guestKing.member);
		const oldKing = guestKing.member;
		guestKing.member = state.partner.team[1].id;
		recordRogueDefeat(battle, battle.p4.active[0], true);
		assert.equal(defeat.partnerDragonKing, oldKing, 'later succession does not change the old receipt');
		assert.equal(battle.fantasyRogue.defeated.at(-1).partnerDragonKing, guestKing.member);
		const checkpoint = JSON.parse(JSON.stringify(captureCoopCheckpoint(battle)));
		const restored = Battle.fromJSON(checkpoint.state);
		try {
			assert.deepEqual(restored.fantasyRogue.defeated, checkpoint.result.defeated);
			assert.equal(restored.fantasyRogue.defeated[0].partnerDragonKing, oldKing);
		} finally { restored.destroy(); }
	});
});
