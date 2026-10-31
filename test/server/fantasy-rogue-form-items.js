'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { Dex } = require('../../dist/sim/dex');
const { Format } = require('../../dist/sim/dex-formats');
const { TeamValidator } = require('../../dist/sim/team-validator');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { rogueStarterSpecies } = require('../../dist/sim/fantasy-rogue-rules');
const { createRoguePokemon, initializeExperience, gainExperience } = require('../../dist/server/fantasy-rogue/progression');
const { makeEncounterSet } = require('../../dist/server/fantasy-rogue/encounter-sets');
const { syncBlessingParty, handleBlessingCommand, blessingCandidates, prepareBlessingEncounter, settleBlessingBattle } = require('../../dist/server/fantasy-rogue/blessings');
const { formItemOptions, useFormItem } = require('../../dist/server/fantasy-rogue/form-items');
const { suitableExclusiveItems } = require('../../dist/server/fantasy-rogue/exclusive-items');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { migrateZygardeStarter } = require('../../dist/server/fantasy-rogue/starter-traits');
const { editFusion } = require('../../dist/server/fantasy-rogue/fusion');
const { compoundFinals, compoundPoints } = require('../../dist/sim/rogue-compound');
const { evolveMember } = require('../../dist/server/fantasy-rogue/progression');
const { clearMemberDetails } = require('../../dist/server/fantasy-rogue/clear-details');
const { stats, set } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue form items and new species blessings', function () {
	this.timeout(60000);
	let content, battle;
	before(() => { content = createPreviewContent(); });
	afterEach(() => { battle?.destroy(); battle = null; });
	function run(names, floor = 50) {
		const r = { id: 'forms', floor, phase: 'ready', bag: {}, boosts: stats(0), money: 1000, caught: [], notices: [],
			team: names.map(name => createRoguePokemon(makeEncounterSet(name, 50, 31), stats(0))) };
		for (const mon of r.team) initializeExperience(mon);
		syncBlessingParty(r); return r;
	}
	function claim(r, id, random = () => 0, sourceContent = content) {
		const account = { run: r, captures: {}, unlocked: [] }; r.phase = 'blessing';
		r.blessings.round = { floor: r.floor, tier: blessing(id).tier, remaining: 1,
			options: [{ id, refreshes: 1, chosen: false }], familiesSeen: [id] };
		handleBlessingCommand(account, r, sourceContent, { action: 'blessing', slot: 0 }, random);
		return account;
	}
	function use(r, species, donor) {
		const mon = r.team[0], option = formItemOptions(r, mon).find(o => o.species === species && (!donor || o.donor === donor));
		assert(option, species); useFormItem(r, mon.id, option.id); return mon;
	}
	function begin(r, foes = [set('Snorlax', 'Immunity', 100, ['Splash'])]) {
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'form-battle', team: r.team, blessings: r.blessings, systems: { player: { mega: false, gmega: !!r.gmegaUnlocked, z: false } },
				boosts: stats(0), bag: {}, balls: [], catchable: false },
			p1: { team: r.team.map(p => p.set) }, p2: { team: foes } });
		battle.makeChoices('team 1', 'team 1'); battle.randomizer = n => n; return battle.p1.active[0];
	}
	for (const [base, donorName, form, item] of [
		['Kyurem', 'Reshiram', 'Kyurem-White', 'dnasplicers'], ['Kyurem', 'Zekrom', 'Kyurem-Black', 'dnasplicers'],
		['Calyrex', 'Glastrier', 'Calyrex-Ice', 'reinsofunity'], ['Calyrex', 'Spectrier', 'Calyrex-Shadow', 'reinsofunity'],
		['Necrozma', 'Solgaleo', 'Necrozma-Dusk-Mane', 'nsolarizer'], ['Necrozma', 'Lunala', 'Necrozma-Dawn-Wings', 'nlunarizer'],
	]) it(`seals and restores ${donorName} with reusable ${item}`, () => {
		let r = run([base, donorName]); r.bag[item] = 1;
		const donor = JSON.parse(JSON.stringify(r.team[1])); use(r, form, donor.id);
		assert.equal(r.team.length, 1); assert.equal(r.team[0].formFusion.donor.id, donor.id);
		r = JSON.parse(JSON.stringify(r)); const mon = r.team[0];
		gainExperience(r, mon, 50000); const level = mon.set.level, xp = mon.experience;
		use(r, base); assert.deepEqual(r.team[1], donor);
		assert.equal(mon.set.level, level); assert.equal(mon.experience, xp); assert.equal(r.bag[item], 1);
		assert.equal(mon.formFusion, undefined); assert(Object.values(Dex.mod('gen9fantasy').species.get(base).abilities).includes(mon.set.ability));
	});
	it('requires inventory, space and a living donor; protects the saved sealed partner', () => {
		const r = run(['Kyurem', 'Reshiram']); assert.equal(formItemOptions(r, r.team[0]).length, 0);
		r.bag.dnasplicers = 1; r.team[1].hp = 0; assert.equal(formItemOptions(r, r.team[0]).length, 0);
		r.team[1].hp = 1; use(r, 'Kyurem-White');
		while (r.team.length < 6) r.team.push(createRoguePokemon(makeEncounterSet('Pikachu', 50, 31), stats(0)));
		assert.throws(() => useFormItem(r, r.team[0].id, 'separate'), /留出位置/);
		assert(r.team[0].formFusion); r.box = []; useFormItem(r, r.team[0].id, 'separate');
		assert.equal(r.box[0].set.species, 'Reshiram');
	});
	it('switches Zygarde, genies, Hoopa, Deoxys and Rotom and removes obsolete appliance moves', () => {
		for (const [base, item, form] of [['Zygarde-10%', 'zygardecube', 'Zygarde'], ['Landorus', 'revealglass', 'Landorus-Therian'],
			['Hoopa', 'prisonbottle', 'Hoopa-Unbound'], ['Deoxys', 'meteorite', 'Deoxys-Speed'], ['Rotom', 'rotomcatalog', 'Rotom-Wash']]) {
			const r = run([base]); r.bag[item] = 1; const mon = use(r, form);
			assert(Object.values(Dex.mod('gen9fantasy').species.get(form).abilities).includes(mon.set.ability));
			if (item === 'zygardecube') assert.equal(mon.set.ability, 'Power Construct');
			if (base === 'Rotom') {
				assert(mon.set.moves.includes('hydropump')); use(r, 'Rotom-Heat');
				assert(!mon.moveMemory.some(m => m.id === 'hydropump')); assert(mon.set.moves.includes('overheat'));
			}
			assert(suitableExclusiveItems(base).some(entry => entry.id === item));
		}
	});
	it('only offers Shaymin Sky during daylight without freezing', () => {
		const r = run(['Shaymin'], 1); r.bag.gracidea = 1;
		assert(formItemOptions(r, r.team[0]).some(o => o.species === 'Shaymin-Sky'));
		r.team[0].status = 'frz'; assert.equal(formItemOptions(r, r.team[0]).length, 0);
	});
	it('consumes each nectar and permits only its corresponding Oricorio style', () => {
		const r = run(['Oricorio']);
		for (const [item, form] of [['yellownectar', 'Oricorio-Pom-Pom'], ['pinknectar', "Oricorio-Pa'u"],
			['purplenectar', 'Oricorio-Sensu'], ['rednectar', 'Oricorio']]) {
			r.bag[item] = 1; use(r, form); assert.equal(r.bag[item], 0);
			assert(!formItemOptions(r, r.team[0]).some(option => option.item === item));
			assert(suitableExclusiveItems('Oricorio').some(entry => entry.id === item));
		}
	});
	it('archives unavailable appliance moves without resetting their spent PP on toggling or reload', () => {
		let r = run(['Rotom']); r.bag.rotomcatalog = 1; let mon = use(r, 'Rotom-Wash');
		for (const slot of [...mon.pp, ...mon.moveMemory]) if (slot.id === 'hydropump') slot.pp = 1;
		use(r, 'Rotom-Heat');
		assert(!mon.seenMoves.includes('hydropump')); assert(!mon.moveMemory.some(m => m.id === 'hydropump'));
		r = JSON.parse(JSON.stringify(r)); mon = use(r, 'Rotom-Wash');
		assert.equal(mon.pp.find(m => m.id === 'hydropump').pp, 1);
		assert(!mon.moveMemory.some(m => m.id === 'overheat'));
	});
	for (const [donor, form, replacements] of [['Reshiram', 'Kyurem-White', ['fusionflare', 'iceburn']],
		['Zekrom', 'Kyurem-Black', ['fusionbolt', 'freezeshock']]]) {
		it(`converts Kyurem's signature moves and restores them when separating ${donor}`, () => {
			const r = run(['Kyurem', donor]); r.bag.dnasplicers = 1;
			const mon = r.team[0]; mon.set.moves = ['scaryface', 'glaciate'];
			mon.pp = mon.moveMemory = ['scaryface', 'glaciate'].map(id => ({ id, maxpp: Dex.moves.get(id).pp, pp: Dex.moves.get(id).pp - 2 }));
			mon.seenMoves = ['scaryface', 'glaciate']; use(r, form);
			assert.deepEqual(mon.set.moves, replacements);
			for (const slot of mon.pp) assert.equal(slot.pp, slot.maxpp - 2);
			use(r, 'Kyurem'); assert.deepEqual(mon.set.moves, ['scaryface', 'glaciate']);
			for (const slot of mon.pp) assert.equal(slot.pp, slot.maxpp - 2);
			assert(!mon.seenMoves.some(id => replacements.includes(id)));
		});
	}
	it('migrates Zygarde starter unlocks once without changing an active party', () => {
		const r = run(['Zygarde']); const account = { run: r, unlocked: ['zygarde'], captures: { zygarde: 10 } };
		for (const name of ['Zygarde', 'Zygarde-10%', 'Zygarde-Complete']) assert.equal(rogueStarterSpecies(name).id, 'zygarde10');
		migrateZygardeStarter(account); migrateZygardeStarter(account);
		assert.deepEqual(account.unlocked, ['zygarde10']); assert.deepEqual(account.captures, { zygarde10: 10 });
		assert.equal(r.team[0].set.species, 'Zygarde');
		assert(content.starters.filter(s => s.set.species.startsWith('Zygarde')).every(s => s.set.species === 'Zygarde-10%'));
	});
	it('gates legendary blessings and gifts the actual form items and G-Mega permission', () => {
		const ordinary = run(['Pikachu']);
		assert(!blessingCandidates(ordinary, content).some(b => ['galarlegend', 'originaldragon'].includes(b.id)));
		const r = run(['Eternatus']); claim(r, 'galarlegend');
		assert.equal(r.bag.gmegawishingstar, 1); assert(r.gmegaUnlocked);
		r.team[0].set.item = 'G-Mega Wishing Star'; r.team[0].set.moves = ['dragonpulse'];
		const mon = begin(r); assert(battle.p1.activeRequest.active[0].canGMegaEvo); battle.makeChoices('move 1 mega', 'move 1');
		assert.equal(mon.species.name, 'Eternatus-Eternamax'); assert.equal(mon.ability, 'pohuaiyu');
	});
	it('charges each legendary once on victory and supports ordinary and original fusion independently', () => {
		let r = run(['Kyurem', 'Reshiram']); const account = claim(r, 'originaldragon'); assert.equal(r.bag.dnasplicers, 1);
		r.phase = 'ready'; use(r, 'Kyurem-White'); use(r, 'Kyurem');
		for (const [index, name] of ['Reshiram', 'Zekrom'].entries()) {
			r.node = { id: 'elite', name: 'elite', kind: 'elite', encounters: [] }; prepareBlessingEncounter(r, () => 0);
			assert.equal(r.node.encounters[0].team[0].species, name); assert(r.node.encounters[0].catchable);
			const result = { encounterId: `charge${index}`, won: true, defeated: [], captures: [], team: r.team };
			settleBlessingBattle(account, r, content, result, () => 0, true); assert.equal(r.blessings.dragonCharges?.length || 0, index);
			settleBlessingBattle(account, r, content, result, () => 0); settleBlessingBattle(account, r, content, result, () => 0);
			assert.equal(r.blessings.dragonCharges.length, index + 1);
		}
		r = JSON.parse(JSON.stringify(r)); const mon = use(r, 'Kyurem-Original');
		assert.equal(r.team.length, 2); assert.equal(mon.set.ability, 'Original Dragon'); assert.equal(r.blessings.dragonCharges.length, 0);
		use(r, 'Kyurem'); use(r, 'Kyurem-Original');
		assert.deepEqual(Object.values(Dex.mod('gen9fantasy').species.get('Kyurem-Original').baseStats), [125, 170, 100, 170, 100, 95]);
		const validator = new TeamValidator(new Format({ ...Dex.formats.get('gen9nationaldex'), name: 'Triple Dragon', mod: 'gen9fantasy' }));
		for (const move of ['blueflare', 'boltstrike', 'glaciate']) assert.equal(validator.checkCanLearn(Dex.moves.get(move), Dex.mod('gen9fantasy').species.get('Kyurem-Original')), null, move);
	});
	it('reorganizes each member with a shared type and preserves cultivation, held items and level', () => {
		const r = run(['Gyarados', 'Gengar']); r.team[0].training = { offense: 500 }; r.team[0].set.item = 'Leftovers';
		const old = structuredClone(r.team); claim(r, 'reorganizer');
		const dex = Dex.mod('gen9fantasy');
		for (const [i, mon] of r.team.entries()) {
			assert(dex.species.get(mon.set.species).types.some(t => dex.species.get(old[i].set.species).types.includes(t)));
			assert.equal(mon.set.level, old[i].set.level); assert.deepEqual(mon.set.ivs, old[i].set.ivs); assert.deepEqual(mon.set.evs, old[i].set.evs);
			assert.equal(mon.set.item, old[i].set.item); assert.deepEqual(mon.training, old[i].training);
			assert(Object.values(dex.species.get(mon.set.species).abilities).includes(mon.set.ability));
		}
		assert(r.team.some(p => p.stars >= 2));
		for (const floor of [1, 100, 150]) assert(!blessingCandidates(run(['Pikachu'], floor), content).some(b => b.id === 'reorganizer'));
	});
	it('upgrades an actual eligible star rank, including two to three, without exceeding five', () => {
		for (const selected of [0, 1]) {
			const r = run(['Gyarados', 'Gengar', 'Pikachu']);
			r.team.forEach((mon, i) => { mon.stars = [2, 4, 5][i]; });
			claim(r, 'reorganizer', n => Math.min(selected, n - 1));
			assert.deepEqual(r.team.map(mon => mon.stars), selected ? [2, 5, 5] : [3, 4, 5]);
		}
		const capped = run(['Pikachu']); capped.team[0].stars = 5;
		assert(!blessingCandidates(capped, content).some(b => b.id === 'reorganizer'));
	});
	it('requires an eligible non-fused, non-egg partner below the star cap', () => {
		for (const field of ['egg', 'fusion', 'formFusion']) {
			const r = run(['Pikachu']); r.team[0][field] = {};
			assert(!blessingCandidates(r, content).some(b => b.id === 'reorganizer'), field);
			r.team.push(run(['Gengar']).team[0]);
			assert(blessingCandidates(r, content).some(b => b.id === 'reorganizer'), field);
			r.team[1].stars = 5;
			assert(!blessingCandidates(r, content).some(b => b.id === 'reorganizer'), field);
		}
	});
	it('preserves eggs, form-fusion donors and Potara partners while rerolling the remaining party', () => {
		const r = run(['Kyurem', 'Reshiram', 'Pikachu', 'Gengar', 'Squirtle', 'Pichu']);
		r.bag.dnasplicers = 1; use(r, 'Kyurem-White');
		r.blessings.owned.push({ ...blessing('potara'), floor: 1 });
		const first = r.team[1], second = r.team[2];
		editFusion(r, { action: 'fusion', member: first.id, value: second.id, appearance: first.id,
			fusionAbility: first.set.ability, fusionStats: ['hp', 'def', 'spd'] });
		r.team[3].egg = { found: 49, hatch: 59 };
		syncBlessingParty(r);
		const before = structuredClone(r.team);
		assert(blessingCandidates(r, content).some(b => b.id === 'reorganizer'));
		claim(r, 'reorganizer');
		for (const index of [0, 1, 3]) assert.deepEqual(r.team[index], before[index]);
		assert.equal(r.team[2].stars, 2);
		assert.equal(r.caught.length, 1);
		assert.equal(r.blessings.pending.length, 0);
	});
	for (const species of ['Gyarados', 'Wartortle']) {
		it(`retains Compound V allocation after reorganizing into ${species}, including evolution and reconnection`, () => {
			const r = run(['Sharpedo']), mon = r.team[0];
			const account = claim(r, 'compoundgold');
			const resolve = (value, evs) => handleBlessingCommand(account, r, content,
				{ action: 'blessingreward', member: r.blessings.pending[0].id, value, evs }, () => 0);
			resolve(mon.id);
			const bonus = { ...stats(0), hp: 20, atk: compoundPoints('Sharpedo', 'gold') - 20 };
			resolve('allocate', bonus);
			const id = Dex.toID(species);
			claim(r, 'reorganizer', () => 0, { ...content, unlocks: { [id]: content.unlocks[id] } });
			assert.equal(mon.set.species, species);
			assert.deepEqual(mon.compound.bonus, bonus);
			assert(mon.compound.reorganized);
			assert.equal(mon.set.ability, 'Power of Alchemy');
			assert.equal(r.blessings.pending.length, 0);
			assert.deepEqual(compoundFinals(mon), []);
			if (species === 'Wartortle') {
				r.phase = 'ready'; evolveMember(r, mon, 'Blastoise'); syncBlessingParty(r);
			}
			assert(Dex.mod('gen9fantasy').species.get(mon.set.species).bst > 500);
			const restored = JSON.parse(JSON.stringify(r)); syncBlessingParty(restored);
			assert.deepEqual(restored.team[0].stats, mon.stats);
			const active = begin(restored);
			assert.equal(active.storedStats.atk, mon.stats.atk);
			assert.equal(active.maxhp, mon.maxhp);
			const ordinary = createRoguePokemon(mon.set, r.boosts, mon.id, mon.stars);
			assert(mon.stats.atk > ordinary.stats.atk);
			assert(mon.maxhp > ordinary.maxhp);
			const detail = clearMemberDetails(mon, r).sources.find(source => source.name === '五号化合物');
			assert(detail.text.includes('重组后保留原分配'));
			assert(!detail.text.includes('超过 500 时停用'));
		});
	}
	it('uses Original Dragon to change only the second type and ignore target abilities', () => {
		const r = run(['Kyurem-Original']); r.team[0].set.moves = ['flamethrower', 'thunderbolt', 'icebeam'];
		const mon = begin(r, [set('Snorlax', 'Flash Fire', 100, ['Splash'])]);
		const foe = battle.p2.active[0], effectiveness = type => mon.runEffectiveness(battle.dex.getActiveMove(type));
		assert.equal(effectiveness('dragonpulse'), 0); assert.equal(effectiveness('moonblast'), 0);
		assert.equal(effectiveness('icebeam'), -1, 'Remove only the Dragon weakness, keep Ice resistance');
		assert.equal(effectiveness('closecombat'), 1, 'Ice still has its own weaknesses');
		const hp = foe.hp; battle.makeChoices('move 1', 'move 1');
		assert(foe.hp < hp, 'Flash Fire cannot block the move'); assert.deepEqual(mon.getTypes(), ['Dragon', 'Fire']);
		battle.makeChoices('move 2', 'move 1'); assert.deepEqual(mon.getTypes(), ['Dragon', 'Electric']);
		battle.makeChoices('move 3', 'move 1'); assert.deepEqual(mon.getTypes(), ['Dragon', 'Ice']);
		assert(!Dex.species.get('Eternatus-Eternamax').isGMega, 'Ordinary formats keep their existing form rules');
	});
	it('lets the player choose an absent Sword of Justice', () => {
		const r = run(['Cobalion']), account = claim(r, 'swords'); const pending = r.blessings.pending[0];
		assert.deepEqual(pending.options, ['Terrakion', 'Virizion']);
		handleBlessingCommand(account, r, content, { action: 'blessingreward', member: pending.id, value: 'Virizion' }, () => 0);
		assert.equal(r.blessings.pending[0].pokemon.set.species, 'Virizion');
	});
	for (const ability of ['Intimidate', 'Zhenshe']) {
		for (const immunity of ['Inner Focus', 'Scrappy']) for (const fierce of [false, true]) {
			it(`${ability} respects ${immunity} unless Fierce is active (${fierce})`, () => {
				const r = run(['Gyarados']); r.team[0].set.ability = ability;
				if (fierce) r.blessings.owned.push({ ...blessing('fierce'), floor: 50 });
				syncBlessingParty(r);
				begin(r, [set('Snorlax', immunity, 100, ['Splash'])]); const foe = battle.p2.active[0];
				assert.equal(foe.boosts.atk, fierce ? -1 : 0); assert.equal(foe.boosts.spa, fierce ? -1 : 0);
			});
		}
	}
});
