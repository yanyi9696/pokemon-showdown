'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { makeUser } = require('../users-utils');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative capture', () => {
	for (const firstTarget of ['p2', 'p4']) {
		for (const secondOwner of ['p1', 'p3']) {
			it(`lets ${secondOwner} catch the remaining wild opponent after ${firstTarget} is captured`, () => {
				const host = createRoguePokemon(set('Bulbasaur', 'Overgrow', 5, ['Splash']), stats(0));
				const guest = createRoguePokemon(set('Squirtle', 'Torrent', 5, ['Splash']), stats(0));
				const wild = species => ({ ...set(species, 'Swift Swim', 5, ['Splash']), fantasyRogueId: `wild-${species}` });
				const battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: {
					encounterId: 'sequential-capture', team: [host], partner: { team: [guest], boosts: stats(0) },
					boosts: stats(0), bag: { pokeball: 2 }, partnerBag: { pokeball: 1 },
					balls: [{ id: 'pokeball', name: '精灵球', chance: 1 }], catchable: true, wild: true,
					cooperative: { opponentOffset: 1 }, opponentCount: 2, opponentSlots: [0, 1],
					coopCaptureCapacity: { p1: true, p3: true }, coopCaptureSlots: { p1: 2, p3: 1 },
				}, p1: { name: 'Host', team: [host.set] }, p2: { name: 'Wild A', team: [wild('Magikarp')] },
				p3: { name: 'Guest', team: [guest.set] }, p4: { name: 'Wild B', team: [wild('Goldeen')] } });
				try {
					for (const slot of ['p1', 'p2', 'p3', 'p4']) battle.choose(slot, 'team 1');
					const authorize = (ownerSide, targetSide) => {
						battle.fantasyRogue.coopCapture = { ownerSide, ball: 'pokeball', targetSide, targetSlot: 0,
							targetId: battle[targetSide].active[0].set.fantasyRogueId };
					};
					authorize('p1', firstTarget);
					battle.makeChoices('rogueball pokeball', 'move 1', 'pass', 'move 1');
					assert.equal(battle.ended, false);
					const lastTarget = firstTarget === 'p2' ? 'p4' : 'p2';
					authorize(secondOwner, lastTarget);
					battle.fantasyRogue.coopCapture.targetId = 'stale-target';
					assert.equal(battle.choose(secondOwner, 'rogueball pokeball'), false, 'stale authorization must be rejected');
					assert.equal(battle.fantasyRogue.bag.pokeball, 1);
					assert.equal(battle.fantasyRogue.partnerBag.pokeball, 1);
					authorize(secondOwner, lastTarget);
					assert.equal(battle.choose(secondOwner, 'rogueball pokeball'), true, 'the authorized living target is catchable');
					battle.choose(secondOwner === 'p1' ? 'p3' : 'p1', 'pass');
					battle.choose(lastTarget, 'move 1');
					const result = require('../../dist/sim/fantasy-rogue').rogueBattleResult(battle);
					assert.equal(result.captures.length, 2);
					assert.equal(result.captureOwners[result.captures[1].id], secondOwner);
					assert.equal(result.bag.pokeball, secondOwner === 'p1' ? 0 : 1);
					assert.equal(result.partnerBag.pokeball, secondOwner === 'p3' ? 0 : 1);
					assert.equal(battle.ended, true);
				} finally {
					battle.destroy();
				}
			});
		}
	}

	it('lets p3 catch a selected p4 wild target with its own ball while p1 passes', () => {
		const hostMon = createRoguePokemon(set('Bulbasaur', 'Overgrow', 5, ['Splash']), stats(0));
		const guestMon = createRoguePokemon(set('Squirtle', 'Torrent', 5, ['Splash']), stats(0));
		const p2Target = set('Magikarp', 'Swift Swim', 5, ['Splash']); p2Target.fantasyRogueId = 'wild-p2';
		const p4Target = set('Caterpie', 'Shield Dust', 5, ['Splash']); p4Target.fantasyRogueId = 'wild-p4';
		const state = {
			encounterId: 'coop-capture-test', team: [hostMon], partner: { team: [guestMon], boosts: stats(0) },
			boosts: stats(0), bag: {}, partnerBag: { pokeball: 1 },
			balls: [{ id: 'pokeball', name: '精灵球', chance: 1 }], catchable: true, wild: true,
			cooperative: { opponentOffset: 1 }, opponentCount: 2, opponentSlots: [0, 1],
			coopCaptureCapacity: { p1: false, p3: true }, coopCaptureSlots: { p1: 0, p3: 1 },
		};
		const battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: 'Host', team: [hostMon.set] }, p2: { name: 'Wild A', team: [p2Target] },
			p3: { name: 'Guest', team: [guestMon.set] }, p4: { name: 'Wild B', team: [p4Target] },
		});
		try {
			for (const slot of ['p1', 'p2', 'p3', 'p4']) battle.choose(slot, 'team 1');
			battle.fantasyRogue.coopCapture = { ownerSide: 'p3', ball: 'pokeball', targetSide: 'p4', targetSlot: 0,
				targetId: battle.p4.active[0].set.fantasyRogueId };
			battle.makeChoices('pass', 'move 1', 'rogueball pokeball', 'move 1');
			const result = require('../../dist/sim/fantasy-rogue').rogueBattleResult(battle);
			assert.equal(result.captures?.length, 1);
			assert.equal(result.captures[0].set.species, 'Caterpie');
			assert.equal(result.captureOwners[result.captures[0].id], 'p3');
			assert.equal(result.partnerBag.pokeball, 0);
			assert.equal(result.bag.pokeball, undefined);
			assert.equal(battle.fantasyRogue.coopCaptureCapacity.p3, false);
			assert.equal(battle.ended, false, 'capturing p4 must leave the other wild opponent in battle');
		} finally {
			battle.destroy();
		}
	});

	it('negotiates ownership, allows a teammate to yield, and immediately saves the capture to p3', () => {
		const oldLocal = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-coop-capture-'));
		const filename = path.join(directory, 'cooperative.db');
		const store = new RogueStore(filename), engine = new RogueEngine(store, content());
		let host, guest, oldRoomsGet;
		try {
			host = makeUser('Coop Capture Host', '127.0.11.1');
			guest = makeUser('Coop Capture Guest', '127.0.12.1');
			let created;
			const manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue, cooperativeGuest) {
				created = { user, trainer, team, rogue, cooperativeGuest };
				return { roomid: 'battle-rogue-coop-capture-test' };
			} }));
			for (const user of [host, guest]) engine.command(user.id, {
				id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
			}, user.name);
			manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
			manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
			manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] });
			manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });
			const hostMember = manager.coop.view(host).session.adventure.team[0].id;
			const guestMember = manager.coop.view(guest).session.adventure.team[0].id;
			manager.coop.command(host, { action: 'selectarea', value: 'grass' });
			manager.coop.command(guest, { action: 'selectarea', value: 'grass' });
			manager.coop.command(host, { action: 'selectbattle', members: [hostMember] });
			manager.coop.command(guest, { action: 'selectbattle', members: [guestMember] });

			const target = { key: 'p4:0', id: 'wild-caterpie', name: 'Caterpie' };
			const starts = [];
			const fakeBattle = {
				getCoopCaptureTarget: key => key === target.key ? target : null,
				canStartCoopCapture: (userid, ball, key, id) =>
					[host.id, guest.id].includes(userid) && ball === 'pokeball' && key === target.key && id === target.id,
				beginCoopCapture: (...args) => starts.push(args),
			};
			oldRoomsGet = Rooms.get;
			Rooms.get = function (id) {
				if (id === 'battle-rogue-coop-capture-test') return { battle: fakeBattle };
				return oldRoomsGet.call(Rooms, id);
			};
			manager.coop.command(host, { action: 'proposecapture', ball: 'pokeball', captureTarget: target.key });
			let proposal = manager.coop.view(guest).session.adventure.captureProposal;
			assert.equal(proposal.targetName, 'Caterpie');
			manager.coop.command(guest, { action: 'respondcapture', id: proposal.id, value: 'contest' });
			proposal = manager.coop.view(host).session.adventure.captureProposal;
			assert.equal(proposal.state, 'contested');
			manager.coop.command(host, { action: 'respondcapture', id: proposal.id, value: 'keep' });
			proposal = manager.coop.view(guest).session.adventure.captureProposal;
			assert.equal(proposal.state, 'returned');
			manager.coop.command(guest, { action: 'respondcapture', id: proposal.id, value: 'accept' });
			assert.deepEqual(starts[0], [host.id, 'pokeball', target.key, target.id]);

			manager.coop.command(host, { action: 'proposecapture', ball: 'pokeball', captureTarget: target.key });
			proposal = manager.coop.view(guest).session.adventure.captureProposal;
			manager.coop.command(guest, { action: 'respondcapture', id: proposal.id, value: 'contest' });
			proposal = manager.coop.view(host).session.adventure.captureProposal;
			manager.coop.command(host, { action: 'respondcapture', id: proposal.id, value: 'give', ball: 'pokeball' });
			assert.deepEqual(starts[1], [guest.id, 'pokeball', target.key, target.id]);

			const captured = createRoguePokemon(set('Magikarp', 'Swift Swim', 5, ['Splash']), stats(0),
				created.rogue.state.encounterId);
			captured.set.shiny = true; captured.set.pokeball = 'pokeball';
			captured.set.nature = 'Jolly'; captured.set.ability = 'Rattled';
			store.change(guest.id, saved => { saved.run.startingBuilds = {}; });
			const personalRun = structuredClone(store.get(guest.id).run);
			const result = {
				encounterId: created.rogue.state.encounterId, won: true, turns: 2,
				team: structuredClone(created.rogue.state.team), partnerTeam: structuredClone(created.rogue.state.partner.team),
				bag: { pokeball: 10 }, partnerBag: { pokeball: 8 }, captures: [captured], captureOwners: { [captured.id]: 'p3' },
			};
			created.rogue.onCapture(captured, result);
			let view = manager.coop.view(guest).session.adventure;
			assert.equal(view.team.length, 2, 'capture is immediately added to its owner\'s party');
			assert.equal(manager.coop.view(host).session.adventure.team.length, 1, 'the other owner does not receive it');
			const account = store.get(guest.id);
			assert(account.caughtSpecies.includes('magikarp'));
			assert.equal(account.captures.magikarp, 1);
			assert(account.unlocked.includes('magikarp'));
			assert.equal(account.starterTraits.magikarp.shiny, true);
			assert(account.starterTraits.magikarp.natures.includes('jolly'));
			assert(account.starterTraits.magikarp.abilities.includes('rattled'));
			assert(account.starterTraits.magikarp.moves.includes('splash'));
			assert.equal(account.starterTraits.magikarp.ivs.max.atk, 31);
			assert.deepEqual(account.run, personalRun, 'the solo build cannot suppress or absorb co-op unlocks');
			created.rogue.onResult(result);
			view = manager.coop.view(guest).session.adventure;
			assert.equal(view.phase, 'settlement');
			assert.equal(view.team.length, 2, 'battle settlement does not duplicate the immediate capture');
		} finally {
			if (oldRoomsGet) Rooms.get = oldRoomsGet;
			host?.disconnectAll();
			guest?.disconnectAll();
			host?.destroy();
			guest?.destroy();
			store.close();
			fs.rmSync(directory, { recursive: true, force: true });
			Config.fantasyailocal = oldLocal.local; Config.bindaddress = oldLocal.bind; Config.fantasyrogue = oldLocal.rogue;
		}
	});
});
