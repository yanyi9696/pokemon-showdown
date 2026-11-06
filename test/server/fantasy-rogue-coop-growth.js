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
const { recordRogueDefeat } = require('../../dist/sim/fantasy-rogue');
const { battleDragonKing } = require('../../dist/sim/fantasy-rogue-blessings');
const { captureCoopCheckpoint } = require('../../dist/sim/rogue-coop-checkpoint');
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
		assert(gain(host) > gain(guest) * 3);
		assert.equal(saved[host.id].team[1].experience, before[host.id].team[1].experience, 'unselected reserve gains no XP');
		assert.equal(saved[host.id].team[0].set.evs.spe, captured ? 0 : saved[guest.id].team[0].set.evs.spe * 2);
	});
	it('keeps unboosted legacy member states valid', () => {
		const session = configure(member => { delete member.blessings; delete member.growth; });
		verifySettlement(session, result());
	});
	function capturedResult() {
		const outcome = result(true);
		const mon = createRoguePokemon(set('Magikarp', 'Swift Swim', 12, ['Splash']), stats(0));
		outcome.captures = [mon]; outcome.captureOwners = { [mon.id]: 'p3' };
		outcome.partnerBag.pokeball--;
		return outcome;
	}
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
