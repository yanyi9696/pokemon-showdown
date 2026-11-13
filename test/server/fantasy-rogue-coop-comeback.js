'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { content } = require('../fixtures/fantasy-rogue');
const { initializeExperience } = require('../../dist/server/fantasy-rogue/progression');

describe('Fantasy Rogue cooperative comeback ownership and shared dialogue', () => {
	let store, engine, manager, host, guest, created, oldConfig;
	const saved = () => store.coopSessionForUser(host.id);
	const member = user => saved().adventure.members[user.id];
	const view = (user = host) => manager.coop.view(user).session.adventure;
	const cmd = (user, action, extra = {}) => manager.coop.command(user, { action, ...extra });
	const both = (action, extra = {}) => { cmd(host, action, extra); cmd(guest, action, extra); };
	const choose = (user, value, visit = view(user).comeback.visit) => cmd(user, 'comeback', { visit, value });
	function change(update) {
		const session = saved(), revision = session.revision;
		update(session); session.revision++; store.updateCoopSession(session, revision);
	}
	function rebuild() {
		manager = new RogueManager(engine, () => ({ enabled: true,
			createRogueBattle(user, trainer, team, rogue) { created = rogue; return { roomid: 'battle-comeback-fixture' }; },
		}));
	}
	function startBattle() {
		for (const user of [host, guest]) cmd(user, 'selectbattle', { members: [member(user).team[0].id] });
	}
	function settle(won = false, dead = [host, guest], options = {}) {
		const result = { encounterId: created.state.encounterId, won,
			team: structuredClone(created.state.team), partnerTeam: structuredClone(created.state.partner.team),
			bag: { ...created.state.bag }, partnerBag: { ...created.state.partnerBag }, ...options };
		for (const user of dead) for (const mon of user === host ? result.team : result.partnerTeam) mon.hp = 0;
		created.onResult(result);
		return result;
	}
	function answer(value) {
		while (view().comeback) {
			const offer = view().comeback;
			both('comeback', { visit: offer.visit, value: offer.choosing ? value : offer.answer ? 'continue' : 'next' });
		}
	}
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1'; Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content()); rebuild();
		host = makeUser('Comeback Host', '127.28.1.1'); guest = makeUser('Comeback Guest', '127.28.1.2');
		cmd(host, 'invite', { target: guest.name, difficulty: 0 });
		cmd(guest, 'accept', { id: store.coopInvitations(guest.id)[0].id });
		both('selectstarters', { starters: ['bulbasaur'] });
		engine.content.story = true;
		change(session => {
			for (const own of Object.values(session.adventure.members)) {
				own.bag.revive = 3; own.team.forEach(initializeExperience);
			}
		});
		both('selectarea', { value: 'grass' }); startBattle();
	});
	afterEach(() => {
		for (const user of [host, guest]) { user?.disconnectAll(); user?.destroy(); }
		store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	for (const ownerSide of ['host', 'guest']) it(`requires joint consent, buffs only ${ownerSide}, and retains the other owner eligibility`, () => {
		const owner = ownerSide === 'host' ? host : guest, partner = owner === host ? guest : host;
		// The partner still has a healthy full-party member after the selected battler faints.
		change(session => {
			const reserve = structuredClone(session.adventure.members[partner.id].team[0]);
			reserve.id = randomUUID(); session.adventure.members[partner.id].team.push(reserve);
		});
		settle(); assert.equal(view().comeback.owner, owner.id);
		const first = view().comeback.visit;
		choose(host, 'next'); rebuild(); assert.equal(view(guest).comeback.partnerChoice, 'next');
		choose(guest, 'next'); assert.notEqual(view().comeback.visit, first);
		assert.throws(() => choose(host, 'next', first), /已变化/);
		choose(host, 'yes'); choose(guest, 'no'); assert(!member(owner).comeback.accepted);
		choose(guest, ''); assert.equal(view(guest).comeback.ownChoice, undefined);
		choose(guest, 'yes'); assert(member(owner).comeback.accepted); assert.equal(member(partner).comeback, undefined);
		assert.equal(member(owner).team[0].hp, 0, 'assistance does not revive');
		assert.throws(() => cmd(host, 'retrybattle'), /再启程/);
		answer('yes'); assert.equal(view(owner).ownComeback.remaining, 10);
		cmd(owner, 'useitem', { id: randomUUID(), value: 'revive', member: member(owner).team[0].id });
		cmd(partner, 'useitem', { id: randomUUID(), value: 'revive', member: member(partner).team[0].id });
		both('retrybattle'); startBattle();
		assert.equal(created.state.comebackCard, owner === host);
		assert.equal(created.state.partner.comebackCard, owner === guest);
		settle(false, [owner]); assert.equal(view().comeback, null, 'an accepted owner cannot accept twice');
	});
	it('queues both eligible owners and never reuses first-owner votes for the second', () => {
		settle(); const oldKey = view().comeback.visit;
		for (const value of ['next', 'yes', 'continue']) both('comeback', { visit: view().comeback.visit, value });
		assert.equal(view().comeback.owner, guest.id); assert.equal(view().comeback.ownChoice, undefined);
		assert.throws(() => choose(host, 'next', oldKey), /已变化/);
		answer('no'); assert(member(host).comeback.accepted); assert.equal(member(guest).comeback.declines, 1);
	});
	it('allows decline, a later defeat offer, and then one permanent acceptance per owner', () => {
		settle(false, [host]); answer('no'); assert.equal(member(host).comeback.declines, 1);
		cmd(host, 'useitem', { id: randomUUID(), value: 'revive', member: member(host).team[0].id });
		both('retrybattle'); startBattle(); settle(false, [host]);
		assert(view().comeback.choosing); answer('yes'); assert(member(host).comeback.accepted);
	});
	it('clears partial votes on delegation changes and fences stale or unauthorized choices', () => {
		settle(false, [host]); choose(host, 'next');
		cmd(host, 'delegate', { value: 'partner' }); assert.equal(view().comeback.ownChoice, undefined);
		assert.throws(() => choose(host, 'next'), /移交/);
		choose(guest, 'next'); cmd(guest, 'delegate', { value: 'revoke' });
		assert.throws(() => choose(host, 'forged'), /请选择/); answer('yes');
	});
	it('rolls back an agreed reward on storage failure and ignores a duplicate defeat receipt', () => {
		const result = settle(false, [guest]); both('comeback', { visit: view().comeback.visit, value: 'next' });
		choose(host, 'yes'); const before = saved(), update = store.updateCoopSession;
		try {
			store.updateCoopSession = (...args) => { update.apply(store, args); throw new Error('comeback write failed'); };
			assert.throws(() => choose(guest, 'yes'), /comeback write failed/); assert.deepEqual(saved(), before);
		} finally { store.updateCoopSession = update; }
		choose(guest, 'yes'); answer('yes'); const after = saved();
		created.onResult(result); assert.deepEqual(saved(), after);
	});
	it('doubles only the owner battle experience and never credits the same defeat twice', () => {
		engine.content.progression = true;
		settle(false, [guest]); answer('yes');
		cmd(guest, 'useitem', { id: randomUUID(), value: 'revive', member: member(guest).team[0].id });
		both('retrybattle'); startBattle();
		const before = [host, guest].map(user => member(user).team[0].experience);
		const ids = [host, guest].map(user => member(user).team[0].id);
		const result = settle(true, [], { defeated: [{ id: 'xp-once', species: 'Magikarp', level: 10,
			participants: ids, eligible: ids, captured: false }] });
		const gains = [host, guest].map((user, index) => member(user).team[0].experience - before[index]);
		assert(gains[0] > 0); assert(Math.abs(gains[1] - 2 * gains[0]) <= 1);
		assert.deepEqual(member(guest).comeback.battleFloors, [1]); assert.equal(member(host).comeback, undefined);
		const after = saved(); created.onResult(result); assert.deepEqual(saved(), after);
	});
	it('pays only the owner once on a peaceful floor and expires after ten inclusive floors', () => {
		settle(false, [host]); answer('yes');
		change(session => {
			const a = session.adventure;
			a.phase = 'area-selection'; a.floor = 9;
			delete a.battleResult; delete a.node;
			a.routeChoices = structuredClone(engine.content.floors[9]);
		});
		both('selectarea', { value: 'center' });
		both('mentorcard', { visit: view().mentor.key, value: 'balanced' });
		const before = [host, guest].map(user => member(user).team[0].experience);
		both('finishroute'); assert.equal(saved().adventure.floor, 10);
		assert(member(host).team[0].experience > before[0]); assert.equal(member(guest).team[0].experience, before[1]);
		const after = saved();
		manager.coop.view(host); manager.coop.view(guest); assert.deepEqual(saved(), after);
		change(session => { session.adventure.floor = 10; }); assert.equal(view().ownComeback.remaining, 1);
		change(session => { session.adventure.floor = 11; }); assert.equal(view().ownComeback, undefined);
	});
	for (const condition of ['no-resources', 'healthy-reserve', 'retreat', 'win', 'no-healing']) it(`does not offer for ${condition}`, () => {
		change(session => {
			const own = session.adventure.members[host.id];
			if (condition === 'no-resources') {
				own.bag = {}; own.money = 0; created.state.bag = {};
			}
			if (condition === 'healthy-reserve') {
				const reserve = structuredClone(own.team[0]); reserve.id = randomUUID(); own.team.push(reserve);
			}
			if (condition === 'no-healing') session.adventure.node.noHealing = true;
		});
		settle(condition === 'win', [host], condition === 'retreat' ? { coopExit: 'retreat' } : {});
		assert.equal(view().comeback, null);
	});
});

describe('Fantasy Rogue native Multi personal comeback modifiers', () => {
	const { Battle } = require('../../dist/sim/battle');
	const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
	const { set, stats } = require('../fixtures/fantasy-rogue');
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	for (const owner of ['p1', 'p3']) it(`keeps ${owner} modifiers through native serialization without affecting the other seats`, () => {
		const team = id => [createRoguePokemon(set('Mew', 'Synchronize', 50, ['Psychic', 'Splash']), stats(0), id)];
		const host = team('host'), guest = team('guest');
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'comeback-native', team: host, boosts: stats(0), bag: {}, balls: [],
				comebackCard: owner === 'p1', partner: { team: guest, boosts: stats(0), comebackCard: owner === 'p3' },
				partnerBag: {}, persistCoop: true, cooperative: { opponentOffset: 1 }, opponentCount: 2 },
			p1: { name: 'Host', team: host.map(mon => mon.set) }, p3: { name: 'Guest', team: guest.map(mon => mon.set) },
			p2: { name: 'Enemy One', team: team('foe1').map(mon => mon.set) }, p4: { name: 'Enemy Two', team: team('foe2').map(mon => mon.set) } });
		for (const side of battle.sides) assert(battle.choose(side.id, 'team'));
		for (let restore = 0; restore < 2; restore++) {
			const reference = battle.p2.active[0];
			for (const side of battle.sides) {
				const mon = side.active[0], factor = side.id === owner ? 1.25 : 1;
				assert.equal(mon.maxhp, reference.maxhp);
				for (const stat of ['def', 'spd']) assert.equal(mon.getStat(stat), Math.floor(reference.getStat(stat) * factor));
				const target = side.id === 'p1' || side.id === 'p3' ? reference : battle.p1.active[0];
				assert.equal(battle.runEvent('ModifyDamage', mon, target, battle.dex.getActiveMove('tackle'), 100), 100 * factor);
				assert.equal(battle.runEvent('ModifyDamage', mon, target, battle.dex.getActiveMove('seismictoss'), 50), 50);
			}
			const serialized = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(serialized);
		}
	});
});
