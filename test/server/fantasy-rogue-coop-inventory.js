'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { Dex } = require('../../dist/sim/dex');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon, initializeExperience } = require('../../dist/server/fantasy-rogue/progression');
const { normalizeBlessings, syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { experienceAtLevel, rogueSpeciesData } = require('../../dist/sim/fantasy-rogue-rules');
const { content, set } = require('../fixtures/fantasy-rogue');
const stats = value => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });

describe('Fantasy Rogue co-op personal inventory use', () => {
	let store, engine, manager, host, guest, oldConfig;
	let serial = 0;
	const items = createPreviewContent().items;
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const data = content();
		data.items = [...items, ...data.items.filter(item => !items.some(entry => entry.id === item.id))
			.map(item => ({ ...item, ...(item.kind === 'ball' ? { multiplier: 1 } : {}) }))];
		data.progression = 'mainline7';
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, data); manager = new RogueManager(engine);
		host = makeUser(`Inventory Host ${++serial}`, `127.0.49.${serial}`);
		guest = makeUser(`Inventory Guest ${serial}`, `127.0.50.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = user => manager.coop.view(user).session.adventure;
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function prepare(bag, level = 40, user = host, species = 'Bulbasaur', moves) {
		change(shared => {
			const state = shared.adventure.members[user.id];
			const mon = createRoguePokemon({ ...set(species, Dex.mod('gen9fantasy').species.get(species).abilities[0], level, moves),
				ivs: stats(15) }, stats(0));
			initializeExperience(mon); state.team = [mon]; state.bag = { ...bag };
			delete state.pendingMoves;
		});
		return member(user).team[0].id;
	}
	function use(user, value, extra = {}) {
		const owner = extra.owner === guest.id ? guest : user;
		const command = { action: 'use', id: randomUUID(), member: member(owner).team[0].id, value, ...extra };
		manager.coop.command(user, command); return command;
	}
	function equip(value, action = 'equip', extra = {}) {
		return manager.coop.command(host, { action, member: member(host).team[0].id, value, ...extra });
	}
	const mega = 'rogueuniversalmegastone', gmega = 'rogueuniversalwishingstar', z = 'rogueuniversalpsychicz';
	const bonuses = { [mega]: { hp: 0, atk: 30, def: 30, spa: 20, spd: 20, spe: 0 },
		[gmega]: { hp: 40, atk: 20, def: 10, spa: 10, spd: 10, spe: 10 },
		[z]: { hp: 0, atk: 20, def: 20, spa: 10, spd: 0, spe: 0 } };
	function configure(user, item = mega, extra = {}) {
		const owner = extra.owner === guest.id ? guest : user;
		return manager.coop.command(user, { action: 'configureuniversal', member: member(owner).team[0].id,
			value: item, evs: bonuses[item], ...extra });
	}
	function unlock(user = host) {
		change(shared => { shared.adventure.members[user.id].systems = { mega: true, gmega: true, z: true, tera: true }; });
	}
	function forme(user, value, extra = {}) {
		const owner = extra.owner === guest.id ? guest : user;
		const command = { action: 'forme', id: randomUUID(), member: member(owner).team[0].id, value, ...extra };
		manager.coop.command(user, command); return command;
	}
	function addDonor(user, species) {
		const mon = createRoguePokemon(set(species, Dex.mod('gen9fantasy').species.get(species).abilities[0], 50), stats(0));
		mon.hp--; mon.pp[0].pp = 1; mon.set.shiny = true;
		mon.moveMemory.find(slot => slot.id === mon.pp[0].id).pp = 1;
		change(shared => {
			const state = shared.adventure.members[user.id]; state.team.push(mon);
			const run = { ...state, floor: shared.adventure.floor };
			syncBlessingParty(run); state.team = run.team; state.blessings = run.blessings;
		});
		return member(user).team.find(entry => entry.id === mon.id);
	}
	for (const [base, donorSpecies, target, item] of [
		['Kyurem', 'Reshiram', 'Kyurem-White', 'dnasplicers'], ['Kyurem', 'Zekrom', 'Kyurem-Black', 'dnasplicers'],
		['Calyrex', 'Glastrier', 'Calyrex-Ice', 'reinsofunity'], ['Calyrex', 'Spectrier', 'Calyrex-Shadow', 'reinsofunity'],
		['Necrozma', 'Solgaleo', 'Necrozma-Dusk-Mane', 'nsolarizer'], ['Necrozma', 'Lunala', 'Necrozma-Dawn-Wings', 'nlunarizer'],
	]) {
		it(`joins and separates the owner’s ${target} without losing or copying the sealed partner`, () => {
			prepare({ [item]: 1 }, 50, guest, base);
			const donor = addDonor(guest, donorSpecies), other = member(host), solo = store.get(guest.id).run;
			const option = view(guest).inventory.members[0].formOptions.find(entry => entry.species === target);
			assert(option.ready); assert.equal(option.donor, donor.id); assert.equal(option.donorSpecies, donorSpecies);
			const command = forme(guest, option.id);
			assert.equal(member(guest).team.length, 1); assert.equal(member(guest).team[0].set.species, target);
			assert.deepEqual(member(guest).team[0].formFusion.donor, donor); assert.equal(member(guest).bag[item], 1);
			const fused = session(); manager.coop.command(guest, command); assert.deepEqual(session(), fused);
			const returning = view(guest).inventory.members[0].formOptions[0];
			assert.equal(returning.returningSpecies, donorSpecies); assert.equal(returning.id, 'separate');
			const separate = forme(guest, 'separate');
			assert.equal(member(guest).team[0].set.species, base); assert.deepEqual(member(guest).team[1], donor);
			assert.equal(member(guest).bag[item], 1); assert.deepEqual(member(host), other);
			assert.deepEqual(store.get(guest.id).run, solo);
			const separated = session(); manager.coop.command(guest, separate); assert.deepEqual(session(), separated);
		});
	}
	it('retains damage, original appliance PP and legal moves when a co-op Rotom changes appliances twice', () => {
		prepare({ rotomcatalog: 1 }, 50, host, 'Rotom-Heat', ['thunderbolt', 'overheat']);
		change(shared => {
			const mon = shared.adventure.members[host.id].team[0]; mon.hp -= 17;
			for (const memory of [mon.pp, mon.moveMemory]) memory.find(slot => slot.id === 'overheat').pp = 1;
		});
		const before = member(host).team[0];
		forme(host, 'rotomcatalog:rotomwash');
		let mon = member(host).team[0]; assert.equal(mon.set.species, 'Rotom-Wash');
		assert(mon.set.moves.includes('hydropump')); assert(!mon.set.moves.includes('overheat'));
		assert.equal(mon.maxhp - mon.hp, 17); assert.equal(mon.id, before.id);
		forme(host, 'rotomcatalog:rotomheat'); mon = member(host).team[0];
		assert.equal(mon.pp.find(slot => slot.id === 'overheat').pp, 1);
		assert.equal(member(host).bag.rotomcatalog, 1); assert.equal(mon.set.level, before.set.level);
	});
	it('consumes exactly one personal nectar and preserves normal shape, time and frozen conditions', () => {
		prepare({ yellownectar: 1 }, 50, host, 'Oricorio');
		const option = view(host).inventory.members[0].formOptions[0]; assert(option.consumed);
		const command = forme(host, option.id);
		assert.equal(member(host).team[0].set.species, 'Oricorio-Pom-Pom'); assert.equal(member(host).bag.yellownectar, 0);
		manager.coop.command(host, command); assert.equal(member(host).bag.yellownectar, 0);
		prepare({ gracidea: 1 }, 50, host, 'Shaymin');
		change(shared => { shared.adventure.floor = 4; });
		assert.equal(view(host).inventory.members[0].formOptions.length, 0);
		assert.throws(() => forme(host, 'gracidea:shayminsky'), /形态变化/);
		change(shared => { shared.adventure.floor = 1; shared.adventure.members[host.id].team[0].status = 'frz'; });
		assert.equal(view(host).inventory.members[0].formOptions.length, 0);
		change(shared => { delete shared.adventure.members[host.id].team[0].status; });
		forme(host, 'gracidea:shayminsky'); assert.equal(member(host).team[0].set.species, 'Shaymin-Sky');
	});
	it('never borrows a teammate’s fusion donor, and requires room in the six-member party before separating', () => {
		prepare({ dnasplicers: 1 }, 50, host, 'Kyurem');
		const foreign = addDonor(guest, 'Reshiram');
		assert.equal(view(host).inventory.members[0].formOptions.length, 0);
		assert.throws(() => forme(host, `dnasplicers:${foreign.id}`), /本人道具或伙伴/);
		const donor = addDonor(host, 'Reshiram'); forme(host, `dnasplicers:${donor.id}`);
		for (let i = 0; i < 5; i++) addDonor(host, 'Bulbasaur');
		const before = session();
		assert.equal(view(host).inventory.members[0].formOptions[0].ready, false);
		assert.throws(() => forme(host, 'separate'), /队伍已满/); assert.deepEqual(session(), before);
		assert.equal(member(host).box.length, 0);
	});
	it('checks current personal event activity and delegation before changing forms', () => {
		prepare({ meteorite: 1 }, 50, guest, 'Deoxys');
		assert.throws(() => forme(host, 'meteorite:deoxysspeed', { owner: guest.id }), /只能提交自己/);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		change(shared => {
			const state = shared.adventure.members[guest.id];
			state.coopEvent = { id: 'martial', stage: 'training', activity: { member: state.team[0].id }, key: 'personal-activity' };
		});
		assert(view(host).partnerInventory.members[0].formOptions.every(option => !option.ready));
		assert.throws(() => forme(host, 'meteorite:deoxysspeed', { owner: guest.id }), /当前伙伴的事件/);
		change(shared => { shared.adventure.members[guest.id].coopEvent.settled = true; });
		forme(host, 'meteorite:deoxysspeed', { owner: guest.id });
		assert.equal(member(guest).team[0].set.species, 'Deoxys-Speed');
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.throws(() => forme(host, 'meteorite:deoxys', { owner: guest.id }), /只能提交自己/);
	});
	it('rolls back consumable form cost, changed species and receipt if account persistence fails', () => {
		prepare({ yellownectar: 1 }, 50, host, 'Oricorio');
		const before = session(), account = store.get(host.id), original = store.change;
		store.change = function (userid, update) {
			return original.call(this, userid, saved => { update(saved); throw new Error('injected forme failure'); });
		};
		try { assert.throws(() => forme(host, 'yellownectar:oricoriopompom'), /injected forme failure/); } finally { store.change = original; }
		assert.deepEqual(session(), before); assert.deepEqual(store.get(host.id), account);
	});
	function prepareFantasy(user = host, species = 'Urshifu', moves = ['wickedblow', 'closecombat']) {
		engine.content.blessings = true;
		change(shared => {
			const state = shared.adventure.members[user.id];
			state.team = [createRoguePokemon(set(species, Dex.mod('gen9fantasy').species.get(species).abilities[0], 50, moves), stats(0))];
			state.blessings = normalizeBlessings({ floor: 70, team: state.team, box: [], bag: {}, boosts: stats(0) });
			state.blessings.shards = 100; delete state.pendingMoves;
		});
	}
	function fantasize(user = host, target = 'Urshifu-Fantasy', extra = {}) {
		const owner = extra.owner === guest.id ? guest : user;
		const command = { action: 'fantasize', id: randomUUID(), member: member(owner).team[0].id,
			value: target, confirmed: true, ...extra };
		manager.coop.command(user, command); return command;
	}
	for (const [species, target, original, replacement] of [
		['Urshifu', 'Urshifu-Fantasy', 'wickedblow', 'dianshanxunji'],
		['Urshifu', 'Urshifu-2-Fantasy', 'wickedblow', 'cunjinbengji'],
		['Urshifu-Rapid-Strike', 'Urshifu-Rapid-Strike-Fantasy', 'surgingstrikes', 'yishunqianji'],
		['Urshifu-Rapid-Strike', 'Urshifu-Rapid-Strike-2-Fantasy', 'surgingstrikes', 'xingyihuanda'],
	]) {
		it(`confirms ${target} and replaces the signature using only the owner’s fragments and saved PP`, () => {
			prepareFantasy(guest, species, [original, 'closecombat']);
			change(shared => {
				const mon = shared.adventure.members[guest.id].team[0]; mon.hp--; mon.set.shiny = true;
				for (const memory of [mon.pp, mon.moveMemory]) memory.find(slot => slot.id === original).pp = 2;
			});
			const before = member(guest).team[0], other = member(host), solo = store.get(guest.id).run;
			assert.equal(view(guest).inventory.fantasyShards, 100);
			assert.equal(view(guest).inventory.members[0].fantasyOptions.length, 2);
			assert(view(guest).inventory.members[0].fantasyOptions.every(option => option.lostMoves.includes(original)));
			assert.throws(() => fantasize(guest, target, { confirmed: false }), /确认/);
			assert.equal(member(guest).blessings.shards, 100);
			const command = fantasize(guest, target), mon = member(guest).team[0];
			assert.equal(mon.set.species, target); assert.equal(mon.id, before.id); assert(mon.set.shiny);
			assert.equal(mon.set.level, before.set.level); assert.deepEqual(mon.set.ivs, before.set.ivs);
			assert(!mon.set.moves.includes(original)); assert(!mon.moveMemory.some(move => move.id === original));
			assert(mon.set.moves.includes(replacement)); assert(mon.set.moves.includes('closecombat'));
			const prior = before.pp.find(slot => slot.id === original), current = mon.pp.find(slot => slot.id === replacement);
			assert.equal(current.pp, Math.max(0, current.maxpp - (prior.maxpp - prior.pp)));
			assert.equal(member(guest).blessings.shards, 0); assert.deepEqual(member(host), other);
			assert.deepEqual(store.get(guest.id).run, solo);
			const saved = session(); manager.coop.command(guest, command); assert.deepEqual(session(), saved);
		});
	}
	it('rejects fantasy conversion without enough personal shards, a living eligible member or an explicit valid branch', () => {
		prepareFantasy();
		assert.throws(() => fantasize(host, 'Urshifu-Fantasy', { member: member(guest).team[0].id }), /本人存活伙伴/);
		assert.throws(() => fantasize(host, 'Urshifu-Rapid-Strike-Fantasy'), /幻想分支/);
		change(shared => { shared.adventure.members[host.id].blessings.shards = 99; });
		let before = session(); assert.throws(() => fantasize(), /100 幻想碎片/); assert.deepEqual(session(), before);
		prepareFantasy(); change(shared => { shared.adventure.members[host.id].team[0].hp = 0; });
		assert.equal(view(host).inventory.members[0].fantasyReady, false);
		assert.throws(() => fantasize(), /存活伙伴/);
		prepareFantasy(host, 'Urshifu', ['closecombat']);
		assert.throws(() => fantasize(host, 'Urshifu-Fantasy', { confirmed: false }), /确认/);
		change(shared => {
			shared.adventure.phase = 'battle-selection'; shared.adventure.encounter = 1;
			shared.adventure.node = { id: 'locked', name: '连续战斗', kind: 'wild', noHealing: true,
				encounters: [], reward: { money: 0, items: {} } };
		});
		before = session(); assert.throws(() => fantasize(), /连续战斗/); assert.deepEqual(session(), before);
	});
	it('honors delegated fantasy ownership and rejects a fresh request after control is revoked', () => {
		prepareFantasy(guest);
		assert.throws(() => fantasize(host, 'Urshifu-Fantasy', { owner: guest.id }), /只能提交自己/);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		const other = member(host);
		fantasize(host, 'Urshifu-2-Fantasy', { owner: guest.id });
		assert.equal(member(guest).team[0].set.species, 'Urshifu-2-Fantasy'); assert.deepEqual(member(host), other);
		prepareFantasy(guest); manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.throws(() => fantasize(host, 'Urshifu-Fantasy', { owner: guest.id }), /只能提交自己/);
	});
	it('rolls back personal fragments, species, PP, receipt and account records on a failed fantasy save', () => {
		prepareFantasy();
		const before = session(), account = store.get(host.id), original = store.change;
		store.change = function (userid, update) {
			return original.call(this, userid, saved => { update(saved); throw new Error('injected fantasy failure'); });
		};
		try { assert.throws(() => fantasize(), /injected fantasy failure/); } finally { store.change = original; }
		assert.deepEqual(session(), before); assert.deepEqual(store.get(host.id), account);
		fantasize(); assert.equal(member(host).blessings.shards, 0);
	});
	it('exposes only owned universal items with each member’s own system, species and type eligibility', () => {
		prepare({ [mega]: 1, [gmega]: 1, [z]: 1 }, 50, host, 'Mew');
		assert(view(host).inventory.members[0].universalOptions.every(option => !option.eligible));
		assert.throws(() => configure(host), /系统/);
		unlock();
		assert(view(host).inventory.members[0].universalOptions.every(option => option.eligible));
		assert.equal(view(guest).inventory.members[0].universalOptions.length, 0);
		prepare({ [mega]: 1, [gmega]: 1, [z]: 1 }, 50, host, 'Pikachu');
		const options = view(host).inventory.members[0].universalOptions;
		assert.equal(options.find(option => option.id === mega).eligible, false);
		assert.equal(options.find(option => option.id === z).eligible, false);
		assert.equal(options.find(option => option.id === gmega).eligible, true);
		assert.throws(() => configure(host, mega), /最终形态/);
		configure(host, gmega); assert.equal(member(host).team[0].set.item, gmega);
	});
	it('saves exact manual configurations, returns the old item and permits a held item to be reconfigured without another copy', () => {
		for (const item of [mega, gmega, z]) {
			prepare({ [item]: 1 }, 50, host, 'Mew'); unlock();
			change(shared => { shared.adventure.members[host.id].team[0].set.item = 'Leftovers'; });
			const partner = member(guest), solo = store.get(host.id).run;
			configure(host, item, { aura: 'def' });
			assert.deepEqual(member(host).team[0].universalEvolution.bonus, bonuses[item]);
			assert.equal(member(host).bag[item], 0); assert.equal(member(host).bag.leftovers, 1);
			assert.equal(view(host).inventory.members[0].universalOptions[0].configuration.item, item);
			configure(host, item, { aura: 'def', evs: {
				...bonuses[item], atk: bonuses[item].atk - 5, spe: bonuses[item].spe + 5,
			} });
			assert.equal(member(host).bag[item], 0); assert.equal(member(host).bag.leftovers, 1);
			assert.equal(member(host).team[0].universalEvolution.bonus.spe, bonuses[item].spe + 5);
			assert.deepEqual(member(guest), partner); assert.deepEqual(store.get(host.id).run, solo);
		}
	});
	it('rejects forged totals, fixed HP, fractions, missing stock and non-highest or missing aura atomically', () => {
		prepare({ [mega]: 1, [z]: 1 }, 50, host, 'Mew'); unlock();
		const before = session();
		for (const evs of [{ ...bonuses[mega], hp: 1 }, { ...bonuses[mega], atk: 31, def: 29 },
			{ ...bonuses[mega], spe: 1 }, { ...bonuses[mega], atk: 29.5, spe: 0.5 }]) {
			assert.throws(() => configure(host, mega, { evs }), /种族点/); assert.deepEqual(session(), before);
		}
		assert.throws(() => configure(host, z), /最高/);
		assert.throws(() => configure(host, z, { aura: 'spe' }), /最高/);
		assert.throws(() => configure(host, gmega), /背包/);
		assert.deepEqual(session(), before);
		configure(host, z, { aura: 'def' }); assert.equal(member(host).team[0].universalEvolution.aura, 'def');
	});
	it('checks current delegation and clears only the configured owner’s ready selection', () => {
		prepare({ [mega]: 1 }, 50, guest, 'Mew'); unlock(guest);
		assert.throws(() => configure(host, mega, { owner: guest.id }), /只能提交自己/);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert(view(host).partnerInventory.members[0].universalOptions[0].eligible);
		change(shared => {
			shared.adventure.phase = 'battle-selection';
			for (const user of [host, guest]) shared.battleSelections[user.id] = [shared.adventure.members[user.id].team[0].id];
		});
		configure(host, mega, { owner: guest.id });
		assert.equal(member(guest).team[0].set.item, mega);
		assert.deepEqual(session().battleSelections[guest.id], []);
		assert.equal(session().battleSelections[host.id].length, 1);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.throws(() => configure(host, mega, { owner: guest.id }), /只能提交自己/);
	});
	it('keeps universal configuration behind continuous-battle, active-battle and fainted-member guards', () => {
		prepare({ [mega]: 1 }, 50, host, 'Mew'); unlock();
		change(shared => {
			shared.adventure.phase = 'battle-selection'; shared.adventure.encounter = 1;
			shared.adventure.node = { id: 'locked', name: '连续战斗', kind: 'wild', noHealing: true,
				encounters: [], reward: { money: 0, items: {} } };
		});
		const before = session();
		assert.throws(() => configure(host), /完成当前战斗结算/); assert.deepEqual(session(), before);
		change(shared => { shared.adventure.phase = 'battle'; });
		assert.throws(() => configure(host), /共同战斗之外/);
		change(shared => {
			shared.adventure.phase = 'battle-selection'; shared.adventure.encounter = 0;
			shared.adventure.members[host.id].team[0].hp = 0;
		});
		assert.equal(view(host).inventory.members[0].universalOptions[0].eligible, false);
		assert.throws(() => configure(host), /存活伙伴/);
	});

	it('consumes candy from the owner only, caps consumption at the actual level limit and deduplicates retries', () => {
		prepare({ expcandys: 1000 }, 99);
		const before = member(host).team[0], other = member(guest), solo = store.get(host.id).run;
		const xp = items.find(item => item.id === 'expcandys').amount;
		const cap = experienceAtLevel(rogueSpeciesData(before.set.species).growth, 100);
		const consumed = Math.ceil((cap - before.experience) / xp);
		const request = use(host, 'expcandys', { count: 1000 });
		assert.equal(member(host).team[0].set.level, 100);
		assert.equal(member(host).bag.expcandys, 1000 - consumed);
		const settled = session(); manager.coop.command(host, request); assert.deepEqual(session(), settled);
		assert.deepEqual(member(guest), other); assert.deepEqual(store.get(host.id).run, solo);
		assert.throws(() => use(host, 'expcandys'), /不可用/);
	});
	it('creates level-up choices and blocks further supplies until the player resolves them', () => {
		prepare({ rarecandy: 3 }, 8);
		change(shared => { shared.adventure.members[host.id].team[0].set.moves = ['tackle', 'growl', 'protect', 'rest']; });
		const request = use(host, 'rarecandy');
		assert.equal(member(host).team[0].set.level, 9);
		assert.equal(member(host).bag.rarecandy, 2);
		assert(member(host).pendingMoves.length > 0);
		assert(view(host).inventory.suppliesLocked.includes('待学招式'));
		manager.coop.command(host, request); assert.equal(member(host).bag.rarecandy, 2);
		assert.throws(() => use(host, 'rarecandy'), /待学招式/);
	});
	it('teaches a legal machine move and atomically unlocks it despite a paused solo build', () => {
		prepare({ roguetmbodyslam: 2, roguetmthunderbolt: 1 });
		store.change(host.id, account => { account.run.startingBuilds = {}; account.run.difficulty = 'easy'; });
		const solo = store.get(host.id).run;
		assert.throws(() => use(host, 'roguetmthunderbolt'), /不可用/);
		use(host, 'roguetmbodyslam');
		assert.equal(member(host).bag.roguetmbodyslam, 1);
		assert(member(host).team[0].moveMemory.some(move => move.id === 'bodyslam'));
		assert(store.get(host.id).starterTraits.bulbasaur.moves.includes('bodyslam'));
		assert.deepEqual(store.get(host.id).run, solo);
		manager.coop.command(host, { action: 'setmove', member: member(host).team[0].id, value: 'bodyslam', slot: 0 });
		assert.equal(member(host).team[0].set.moves[0], 'bodyslam');
		assert.throws(() => use(host, 'roguetmbodyslam'), /不可用/);
	});
	it('retains mint nature, IV selection, effort limits and ability item rules', () => {
		prepare({ roguemintmodest: 2, bottlecap: 3, goldbottlecap: 1, carbos: 3, abilitypatch: 2 });
		use(host, 'roguemintmodest');
		let mon = member(host).team[0]; assert.equal(mon.set.nature, 'Hardy'); assert.equal(mon.mintNature, 'Modest');
		assert.throws(() => use(host, 'roguemintmodest'), /不可用/);
		assert.throws(() => use(host, 'bottlecap', { slot: 6 }), /请选择/);
		use(host, 'bottlecap', { slot: 5 });
		assert.equal(member(host).team[0].set.ivs.spe, 31); assert.equal(member(host).team[0].set.ivs.atk, 15);
		assert.throws(() => use(host, 'bottlecap', { slot: 5 }), /上限/);
		use(host, 'goldbottlecap'); assert.deepEqual(member(host).team[0].set.ivs, stats(31));
		use(host, 'carbos'); assert.equal(member(host).team[0].set.evs.spe, 10);
		use(host, 'abilitypatch'); mon = member(host).team[0];
		assert.equal(mon.set.ability, 'Chlorophyll'); assert.equal(mon.abilityPool[0].id, 'chlorophyll');
		const before = session();
		assert.throws(() => use(host, 'carbos', { count: 2 }), /仅经验糖果/); assert.deepEqual(session(), before);
	});
	it('keeps tonic effects on the selected member and records their account discovery atomically', () => {
		prepare({ roguewine: 2, roguecephalosporin: 1 });
		use(host, 'roguewine'); assert.equal(member(host).team[0].tonics.wine, true);
		assert.throws(() => use(host, 'roguewine'), /不可用/);
		use(host, 'roguecephalosporin'); assert.equal(store.get(host.id).tonicSecret, true);
		assert(!store.get(guest.id).tonicSecret); assert(!member(guest).team[0].tonics);
	});
	it('transfers held items and emblems only within the owner inventory and preserves immutable equipment', () => {
		prepare({ leftovers: 1, lifeorb: 1, rogueemblemfire: 1, rogueuniversalmegastone: 1 });
		equip('leftovers'); equip('lifeorb');
		assert.equal(member(host).bag.leftovers, 1); assert.equal(member(host).bag.lifeorb, 0);
		assert.equal(member(host).team[0].set.item, 'lifeorb');
		equip('rogueemblemfire', 'equipemblem', { slot: 0 });
		assert.equal(member(host).team[0].emblem, 'rogueemblemfire');
		assert.equal(member(host).team[0].emblemSlot, 0);
		equip('', 'equipemblem'); assert.equal(member(host).bag.rogueemblemfire, 1);
		assert.throws(() => equip('rogueuniversalmegastone'), /分配种族点/);
		const inv = view(host).inventory;
		assert(!inv.members[0].equipment.includes('rogueuniversalmegastone'));
		change(shared => {
			const state = shared.adventure.members[host.id]; state.team[0].set.item = 'eviolite';
			state.blessings = normalizeBlessings({ floor: 60, team: state.team, box: [], bag: state.bag, boosts: stats(0) });
			state.blessings.owned.push({ ...blessing('kid'), floor: 60 });
		});
		assert.throws(() => equip(''), /不可取下/);
	});
	it('respects owner delegation, revocation and invalidates the changed player’s readiness', () => {
		prepare({ roguemintmodest: 2 }, 40, guest);
		assert.throws(() => use(host, 'roguemintmodest', { owner: guest.id }), /只能提交自己/);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert(view(host).partnerInventory);
		change(shared => {
			shared.adventure.phase = 'battle-selection';
			for (const user of [host, guest]) shared.battleSelections[user.id] = [shared.adventure.members[user.id].team[0].id];
		});
		use(host, 'roguemintmodest', { owner: guest.id });
		assert.equal(member(guest).bag.roguemintmodest, 1);
		assert.deepEqual(session().battleSelections[guest.id], []);
		assert.equal(session().battleSelections[host.id].length, 1);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.equal(view(host).partnerInventory, undefined);
		assert.throws(() => use(host, 'roguemintmodest', { owner: guest.id }), /只能提交自己/);
	});
	it('blocks supplies during continuous encounter locks and leaves inventory untouched on invalid commands', () => {
		prepare({ expcandys: 10, roguemintmodest: 1, leftovers: 1 });
		for (const count of [0, -1, 0.5, 11]) assert.throws(() => use(host, 'expcandys', { count }), /数量/);
		assert.throws(() => use(host, 'expcandys', { member: member(guest).team[0].id }), /不可用/);
		change(shared => {
			shared.adventure.phase = 'battle-selection'; shared.adventure.encounter = 1;
			shared.adventure.node = { id: 'locked', name: '连续战斗', kind: 'wild', noHealing: true,
				encounters: [], reward: { money: 0, items: {} } };
		});
		assert(view(host).inventory.suppliesLocked.includes('连续战斗'));
		const before = session(); assert.throws(() => use(host, 'roguemintmodest'), /连续战斗/);
		assert.deepEqual(session(), before);
		equip('leftovers'); assert.equal(member(host).team[0].set.item, 'leftovers');
		change(shared => { shared.adventure.phase = 'battle'; });
		assert.equal(view(host).inventory, null);
		assert.throws(() => use(host, 'roguemintmodest'), /共同战斗之外/);
	});
	it('rolls back consumption, pending moves, receipts and unlocks if account persistence fails', () => {
		prepare({ roguetmbodyslam: 2 });
		const before = session(), account = store.get(host.id), original = store.change;
		store.change = function (userid, update) {
			return original.call(this, userid, saved => { update(saved); throw new Error('injected inventory failure'); });
		};
		try { assert.throws(() => use(host, 'roguetmbodyslam'), /injected inventory/); } finally { store.change = original; }
		assert.deepEqual(session(), before); assert.deepEqual(store.get(host.id), account);
		use(host, 'roguetmbodyslam'); assert.equal(member(host).bag.roguetmbodyslam, 1);
		manager = new RogueManager(new RogueEngine(store, engine.content));
		assert.equal(member(host).bag.roguetmbodyslam, 1);
	});
	it('confirms level evolution with stable identity and training, without healing damage or spent PP', () => {
		prepare({}, 16);
		change(shared => {
			const mon = shared.adventure.members[host.id].team[0];
			mon.hp = 1; mon.pp[0].pp = 2; mon.set.shiny = true;
			mon.set.happiness = 200;
		});
		const before = member(host).team[0], solo = store.get(host.id).run, partner = member(guest);
		const options = view(host).inventory.members[0].evolutions;
		assert(options.find(option => option.species === 'Ivysaur').ready);
		const request = use(host, 'ivysaur', { action: 'evolve' });
		const mon = member(host).team[0];
		assert.equal(mon.set.species, 'Ivysaur'); assert.equal(mon.id, before.id);
		assert.equal(mon.experience, before.experience); assert.deepEqual(mon.set.ivs, before.set.ivs);
		assert.equal(mon.set.shiny, true); assert.equal(mon.set.happiness, 200);
		assert.equal(mon.maxhp - mon.hp, before.maxhp - before.hp);
		assert.equal(mon.moveMemory.find(move => move.id === 'tackle').pp, 2);
		assert.deepEqual(store.get(host.id).run, solo); assert.deepEqual(member(guest), partner);
		const saved = session(); manager.coop.command(host, request); assert.deepEqual(session(), saved);
	});
	it('consumes a chosen evolution stone only once from the delegated owner', () => {
		prepare({ waterstone: 2 }, 30, guest, 'Eevee');
		assert.throws(() => use(host, 'vaporeon', { action: 'evolve', owner: guest.id }), /只能提交自己/);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		const hostBefore = member(host);
		const request = use(host, 'vaporeon', { action: 'evolve', owner: guest.id });
		assert.equal(member(guest).team[0].set.species, 'Vaporeon'); assert.equal(member(guest).bag.waterstone, 1);
		manager.coop.command(host, request); assert.equal(member(guest).bag.waterstone, 1);
		assert.deepEqual(member(host), hostBefore);
	});
	it('uses personal special evolution currencies and obeys the spare-slot Shedinja rule', () => {
		prepare({}, 30, host, 'Meltan');
		change(shared => {
			const state = shared.adventure.members[host.id];
			state.blessings = normalizeBlessings({ floor: 60, team: state.team, box: [], bag: state.bag, boosts: stats(0) });
			state.blessings.candy = 400;
		});
		use(host, 'melmetal', { action: 'evolve' });
		assert.equal(member(host).team[0].set.species, 'Melmetal'); assert.equal(member(host).blessings.candy, 0);
		prepare({}, 20, host, 'Gimmighoul');
		change(shared => { shared.adventure.members[host.id].money = 80000; });
		const otherMoney = member(guest).money;
		use(host, 'gholdengo', { action: 'evolve' });
		assert.equal(member(host).team[0].set.species, 'Gholdengo'); assert.equal(member(host).money, 0);
		assert.equal(member(guest).money, otherMoney);
		prepare({ pokeball: 1 }, 20, host, 'Nincada');
		use(host, 'ninjask', { action: 'evolve' });
		assert.deepEqual(member(host).team.map(mon => mon.set.species), ['Ninjask', 'Shedinja']);
		assert.equal(member(host).bag.pokeball, 0);
		prepare({ pokeball: 1 }, 20, host, 'Nincada');
		change(shared => {
			shared.adventure.members[host.id].team.push(...Array.from({ length: 5 }, () => createRoguePokemon(set(), stats(0))));
		});
		use(host, 'ninjask', { action: 'evolve' });
		assert.equal(member(host).team.length, 6); assert.equal(member(host).bag.pokeball, 1);
		assert(!member(host).team.some(mon => mon.set.species === 'Shedinja'));
	});
	it('rejects unmet evolution conditions, missing stones, fainted targets and the Kid final-form lock', () => {
		prepare({}, 15);
		assert.throws(() => use(host, 'ivysaur', { action: 'evolve' }), /没有满足条件/);
		prepare({}, 30, host, 'Eevee');
		assert.equal(view(host).inventory.members[0].evolutions.find(option => option.species === 'Vaporeon').ready, false);
		const before = session();
		assert.throws(() => use(host, 'vaporeon', { action: 'evolve' }), /没有满足条件/); assert.deepEqual(session(), before);
		prepare({}, 16);
		change(shared => { shared.adventure.members[host.id].team[0].hp = 0; });
		assert.throws(() => use(host, 'ivysaur', { action: 'evolve' }), /没有满足条件/);
		prepare({}, 32, host, 'Ivysaur');
		change(shared => {
			const state = shared.adventure.members[host.id]; state.team[0].set.item = 'eviolite';
			state.blessings = normalizeBlessings({ floor: 60, team: state.team, box: [], bag: {}, boosts: stats(0) });
			state.blessings.owned.push({ ...blessing('kid'), floor: 60 });
		});
		assert.equal(view(host).inventory.members[0].evolutions.find(option => option.species === 'Venusaur').ready, false);
		assert.throws(() => use(host, 'venusaur', { action: 'evolve' }), /没有满足条件/);
	});
	it('rolls back evolution, resource cost and duplicate receipt if account persistence fails', () => {
		prepare({ waterstone: 1 }, 30, host, 'Eevee');
		const before = session(), account = store.get(host.id), original = store.change;
		store.change = function (userid, update) {
			return original.call(this, userid, saved => { update(saved); throw new Error('injected evolution failure'); });
		};
		try { assert.throws(() => use(host, 'vaporeon', { action: 'evolve' }), /injected evolution/); } finally { store.change = original; }
		assert.deepEqual(session(), before); assert.deepEqual(store.get(host.id), account);
		use(host, 'vaporeon', { action: 'evolve' }); assert.equal(member(host).bag.waterstone, 0);
	});
});
