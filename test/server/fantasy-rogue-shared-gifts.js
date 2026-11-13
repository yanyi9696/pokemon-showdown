'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { drawBlessingGift, blessingGiftSpecies, normalizeBlessings, sharedBlessingCandidates } = require('../../dist/server/fantasy-rogue/blessings');
const { withSharedRewardRolls } = require('../../dist/server/fantasy-rogue/shared-reward-rolls');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { toID } = require('../../dist/sim/dex');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue shared gift creation', () => {
	const data = createPreviewContent();
	function run(boost = 0) {
		const value = { floor: 1, boosts: stats(boost), bag: {}, caught: [], team: [createRoguePokemon(set(), stats(boost))] };
		normalizeBlessings(value); return value;
	}
	const never = () => { throw new Error('The second recipient must not reroll a common partner'); };
	it('shares species and rolled traits while retaining private IDs, join order and growth', () => {
		const a = run(), b = run(25), owners = [a, b], rolls = new Map(), draws = [];
		a.echo = { shiny: 0 }; b.echo = { shiny: 4 }; b.blessings.nextJoin = 80;
		const options = { pool: ['Bulbasaur', 'Charmander', 'Squirtle'], stars: 2 };
		const x = withSharedRewardRolls(a, rolls, () => drawBlessingGift(a, data, max => { draws.push(max); return 0; }, options), owners);
		const y = withSharedRewardRolls(b, rolls, () => drawBlessingGift(b, data, never, options), owners);
		assert.deepEqual(x.set, y.set); assert.notEqual(x.id, y.id); assert.equal(y.joinOrder, 80);
		assert.equal(x.stars, 2); assert.equal(y.stars, 2); assert(y.maxhp > x.maxhp);
		assert(x.set.shiny); assert(draws.includes(10000), 'the larger shared shiny bonus participates in the one roll');
		x.set.moves.push('Splash'); assert(!y.set.moves.includes('Splash'));
	});
	it('requires a new partner for both recipients, not just the host', () => {
		const a = run(), b = run(), rolls = new Map(), owners = [a, b];
		a.blessings.caught = ['bulbasaur']; b.blessings.caught = ['charmander'];
		const options = { pool: ['Bulbasaur', 'Charmander', 'Squirtle'], uncaught: true };
		const x = withSharedRewardRolls(a, rolls, () => drawBlessingGift(a, data, () => 0, options), owners);
		const y = withSharedRewardRolls(b, rolls, () => drawBlessingGift(b, data, never, options), owners);
		assert.equal(x.set.species, 'Squirtle'); assert.equal(y.set.species, 'Squirtle');
	});
	it('does not offer a common uncaught gift when the individual pools have no intersection', () => {
		const a = run(), b = run(), pool = blessingGiftSpecies(a, data).map(toID);
		assert(pool.length > 2);
		a.blessings.caught = pool.slice(1); b.blessings.caught = pool.filter(id => id !== pool[1]);
		assert.equal(blessingGiftSpecies(a, data, { uncaught: true }).length, 1);
		assert.equal(blessingGiftSpecies(b, data, { uncaught: true }).length, 1);
		assert(!sharedBlessingCandidates([a, b], data).some(candidate => candidate.family === 'friend'));
	});
	it('leaves personal transformations and solo rolls independent', () => {
		const a = run(), b = run(), rolls = new Map(), owners = [a, b];
		const x = withSharedRewardRolls(a, rolls, () => drawBlessingGift(a, data, () => 0,
			{ species: 'Bulbasaur', personal: true }), owners);
		const y = withSharedRewardRolls(b, rolls, () => drawBlessingGift(b, data, max => max - 1,
			{ species: 'Charmander', personal: true }), owners);
		assert.equal(x.set.species, 'Bulbasaur'); assert.equal(y.set.species, 'Charmander'); assert.equal(rolls.size, 0);
		assert.notDeepEqual(drawBlessingGift(a, data, () => 0, { species: 'Eevee' }).set.ivs,
			drawBlessingGift(a, data, max => max - 1, { species: 'Eevee' }).set.ivs);
	});
});

describe('Fantasy Rogue common gift transactions', () => {
	let old, store, engine, manager, host, guest;
	beforeEach(() => {
		old = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const data = content(), real = createPreviewContent(); data.blessings = true;
		data.starters = real.starters; data.unlocks = real.unlocks;
		data.items = [...real.items, ...data.items.filter(item => !real.items.some(other => other.id === item.id))];
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, data); manager = new RogueManager(engine);
		host = makeUser('Common Partner Host', '127.99.7.1'); guest = makeUser('Common Partner Guest', '127.99.7.2');
		for (const user of [host, guest]) engine.command(user.id, { id: randomUUID(),
			revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'] });
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
	});
	afterEach(() => {
		for (const user of [host, guest]) { user?.disconnectAll(); user?.destroy(); }
		store?.close(); Config.fantasyailocal = old.local; Config.bindaddress = old.bind;
		Config.fantasyrogue = old.rogue;
	});
	const get = () => store.coopSessionForUser(host.id);
	function prepare(id) {
		const s = get(), revision = s.revision, def = blessing(id), a = s.adventure;
		const round = { floor: 1, tier: def.tier, remaining: 1, topClearMindEligible: false, familiesSeen: [], idsSeen: [id],
			options: [{ id, tier: def.tier, refreshes: 1, chosen: false }] };
		a.coopBlessingRound = structuredClone(round);
		for (const [i, owner] of [host.id, guest.id].entries()) {
			const member = a.members[owner]; member.blessings.round = structuredClone(round);
			member.boosts = stats(i * 20); member.blessings.nextJoin += i * 30;
		}
		s.revision++; store.updateCoopSession(s, revision);
	}
	function agree() {
		manager.coop.command(host, { action: 'blessingchoice', slot: 0 });
		manager.coop.command(guest, { action: 'blessingchoice', slot: 0 });
	}
	for (const id of ['friend', 'mousefamily', 'mushroomsynthesis', 'spiral', 'puregodrobe']) {
		it(`persists matching ${id} partners and keeps each owner's selection separate`, () => {
			prepare(id); const accounts = [store.get(host.id).run, store.get(guest.id).run]; agree();
			const saved = get(), a = saved.adventure.members[host.id], b = saved.adventure.members[guest.id];
			const x = a.blessings.pending.find(reward => reward.kind === 'gift').pokemon;
			const y = b.blessings.pending.find(reward => reward.kind === 'gift').pokemon;
			assert.deepEqual(x.set, y.set); assert.notEqual(x.id, y.id); assert(y.maxhp > x.maxhp);
			assert(a.blessings.caught.includes(toID(x.set.species))); assert(b.blessings.caught.includes(toID(y.set.species)));
			if (id === 'puregodrobe') {
				assert.equal(x.set.species, 'Espurr'); assert.equal(x.set.gender, 'F');
				assert(!a.blessings.caught.includes('meowsticf'), 'do not credit an unevolved gift as the final form');
			}
			if (id === 'mushroomsynthesis' || id === 'spiral') {
				assert.equal(a.blessings.owned.find(entry => entry.family === id).target, x.id);
				assert.equal(b.blessings.owned.find(entry => entry.family === id).target, y.id);
			}
			manager = new RogueManager(engine); manager.coop.command(host, { action: 'refresh' });
			assert.deepEqual(get(), saved);
			assert.deepEqual([store.get(host.id).run, store.get(guest.id).run], accounts);
		});
	}
	for (const id of ['fatesilver', 'fategold', 'fateprismatic']) it(`shares the random ${id} blessing within both players' eligible pools`, () => {
		prepare(id); agree();
		const s = get(), a = s.adventure.members[host.id].blessings, b = s.adventure.members[guest.id].blessings;
		const x = a.owned.find(entry => entry.grantedBy === id), y = b.owned.find(entry => entry.grantedBy === id);
		assert(x); assert(y); assert.equal(x.id, y.id);
		assert.equal(a.levels, b.levels);
		assert.equal(x.tier, blessing(id).tier);
	});
	it('lets a full party replace one member while the other owner independently declines the shared partner', () => {
		prepare('friend'); const s = get(), revision = s.revision;
		const member = s.adventure.members[host.id];
		while (member.team.length < 6) member.team.push(createRoguePokemon(set(), member.boosts));
		const released = member.team[0].id;
		s.revision++; store.updateCoopSession(s, revision); agree();
		const before = get(), a = before.adventure.members[host.id], b = before.adventure.members[guest.id];
		const x = a.blessings.pending.find(reward => reward.kind === 'gift'), y = b.blessings.pending.find(reward => reward.kind === 'gift');
		assert.throws(() => manager.coop.command(host, { action: 'blessingreward', member: x.id, value: released }), /确认/);
		assert.deepEqual(get(), before);
		manager.coop.command(host, { action: 'blessingreward', member: x.id, value: released, confirmed: true });
		assert.deepEqual(get().adventure.members[guest.id], b);
		manager.coop.command(guest, { action: 'blessingreward', member: y.id, value: 'release' });
		const saved = get();
		assert.equal(saved.adventure.members[host.id].team.length, 6);
		assert(saved.adventure.members[host.id].team.some(mon => mon.id === x.pokemon.id));
		assert(!saved.adventure.members[host.id].team.some(mon => mon.id === released));
		assert(!saved.adventure.members[guest.id].team.some(mon => mon.id === y.pokemon.id));
		assert.throws(() => manager.coop.command(host, { action: 'blessingreward', member: x.id, value: 'join' }), /当前没有|已变化/);
		assert.deepEqual(get(), saved);
	});
	it('rolls back both personal unlock records and gifts when the common save fails', () => {
		prepare('friend'); manager.coop.command(host, { action: 'blessingchoice', slot: 0 });
		const before = get(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec("CREATE TEMP TRIGGER partner_gift_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'partner gift failed'); END;");
		try {
			assert.throws(() => manager.coop.command(guest, { action: 'blessingchoice', slot: 0 }), /partner gift failed/);
			assert.deepEqual(get(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		} finally { store.db.exec('DROP TRIGGER partner_gift_fail'); }
		manager.coop.command(guest, { action: 'blessingchoice', slot: 0 });
		assert(get().adventure.members[host.id].blessings.pending.some(reward => reward.kind === 'gift'));
	});
});
