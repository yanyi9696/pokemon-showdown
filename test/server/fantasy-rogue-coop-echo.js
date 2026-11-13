'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { emptyEchoUpgrades } = require('../../dist/sim/rogue-echo');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative personal echo snapshot', () => {
	it('snapshots each unlocked account on start, restores it, and sends only that owner\'s upgrades to battle', () => {
		const before = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const store = new RogueStore(':memory:');
		const host = makeUser('Echo Coop Host', '127.23.1.1'), guest = makeUser('Echo Coop Guest', '127.23.1.2');
		let created;
		const build = () => new RogueManager(new RogueEngine(store, content()), () => ({ enabled: true,
			createRogueBattle(user, trainer, team, rogue) { created = rogue.state; return { roomid: 'battle-echo-fixture' }; },
		}));
		try {
			const upgrades = [
				{ ...emptyEchoUpgrades(), types: ['Water'], catch: 1, systems: ['mega'] },
				{ ...emptyEchoUpgrades(), types: ['Fire'], guard: true, catch: 5, systems: ['z', 'tera'] },
			];
			for (const [index, user] of [host, guest].entries()) store.change(user.id, account => {
				account.echo = { unlocked: true, points: 0, earned: 100, upgrades: structuredClone(upgrades[index]) };
			});
			let manager = build();
			manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
			manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
			for (const [index, user] of [host, guest].entries()) {
				assert.deepEqual(store.coopSessionForUser(host.id).adventure.members[user.id].echo, upgrades[index]);
				store.change(user.id, account => { account.echo.upgrades = emptyEchoUpgrades(); });
			}
			manager = build();
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'grass' });
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle',
				members: [manager.coop.view(user).session.adventure.team[0].id] });
			assert.deepEqual(created.echo, upgrades[0]); assert.deepEqual(created.partner.echo, upgrades[1]);
			assert(created.systems.player.mega); assert(!created.systems.player.z);
			assert(created.systems.partner.z); assert(!created.systems.partner.mega); assert(created.tera.partner);
			created.partner.echo.types.push('Grass');
			assert.deepEqual(store.coopSessionForUser(host.id).adventure.members[guest.id].echo, upgrades[1]);
		} finally {
			host.disconnectAll(); guest.disconnectAll();
			host.destroy(); guest.destroy(); store.close();
			Config.fantasyailocal = before.local; Config.bindaddress = before.bind; Config.fantasyrogue = before.rogue;
		}
	});
});

describe('Fantasy Rogue cooperative shared wild shiny roll', () => {
	for (const [levels, roll, shiny] of [
		[[1, 5], 29, true], [[5, 1], 29, true], [[1, 5], 30, false],
		[[1, 1], 21, true], [[1, 1], 22, false], [[0, 0], 1, true], [[0, 0], 2, false],
	]) it(`uses opening levels ${levels} at roll ${roll}, and never rerolls saved choices`, () => {
		const before = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const store = new RogueStore(':memory:'), random = crypto.randomInt;
		const host = makeUser('Shiny Coop Host', '127.23.2.1'), guest = makeUser('Shiny Coop Guest', '127.23.2.2');
		const data = content(), users = [host, guest];
		const trainer = structuredClone(data.floors[1][0]); trainer.id = 'uncatchable';
		trainer.encounters.forEach(encounter => {
			encounter.catchable = false;
		});
		const guaranteed = structuredClone(data.floors[1][0]); guaranteed.id = 'guaranteed';
		guaranteed.encounters.forEach(encounter => { encounter.team[0].shiny = true; });
		data.floors[1] = [data.floors[1][0], trainer, guaranteed];
		let rolls = 0, created;
		const build = () => new RogueManager(new RogueEngine(store, data), () => ({ enabled: true,
			createRogueBattle(user, opponent, team, rogue) { created = rogue; return { roomid: 'battle-shiny-fixture' }; },
		}));
		try {
			for (const [i, user] of users.entries()) store.change(user.id, account => {
				account.echo = { unlocked: true, points: 0, earned: 100,
					upgrades: { ...emptyEchoUpgrades(), shiny: levels[i], catch: i + 1 } };
			});
			let manager = build();
			manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
			manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
			crypto.randomInt = max => {
				if (max !== 1000 && max !== 10000) return 0;
				assert.equal(max, levels.some(Boolean) ? 10000 : 1000); rolls++; return roll;
			};
			for (const user of users) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
			assert.equal(rolls, 3);
			const saved = store.coopSessionForUser(host.id).adventure;
			for (const node of saved.routeChoices) {
				assert(node.spiritPrepared);
				for (const encounter of node.encounters) assert.equal(!!encounter.team[0].shiny,
					node.id === 'guaranteed' || (node.id !== 'uncatchable' && shiny));
			}
			crypto.randomInt = max => {
				assert(![1000, 10000].includes(max), 'Saved shared encounters must not reroll'); return 0;
			};
			for (const user of users) store.change(user.id, account => { account.echo.upgrades.shiny = 5; });
			manager = build();
			for (const user of users) manager.coop.view(user);
			assert.deepEqual(store.coopSessionForUser(host.id).adventure, saved);
			for (const user of users) manager.coop.command(user, { action: 'selectarea', value: 'grass' });
			assert.deepEqual(store.coopSessionForUser(host.id).adventure.node, saved.routeChoices[0]);
			for (const user of users) manager.coop.command(user, { action: 'selectbattle',
				members: [manager.coop.view(user).session.adventure.team[0].id] });
			assert(created);
			assert.equal(created.state.echo.shiny, levels[0]);
			assert.equal(created.state.partner.echo.shiny, levels[1]);
			assert.equal(created.state.echo.catch, 1); assert.equal(created.state.partner.echo.catch, 2);
		} finally {
			crypto.randomInt = random;
			for (const user of users) { user.disconnectAll(); user.destroy(); }
			store.close();
			Config.fantasyailocal = before.local; Config.bindaddress = before.bind; Config.fantasyrogue = before.rogue;
		}
	});
});
