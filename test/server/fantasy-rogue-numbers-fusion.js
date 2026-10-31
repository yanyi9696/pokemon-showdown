'use strict';
const assert = require('assert').strict;
const {Battle} = require('../../dist/sim/battle');
const {Dex} = require('../../dist/sim/dex');
const {blessing} = require('../../dist/sim/rogue-blessing-data');
const {syncBlessingParty, completeBlessingFloor, settleBlessingBattle, blessingCandidates} = require('../../dist/server/fantasy-rogue/blessings');
const {createRoguePokemon, gainExperience} = require('../../dist/server/fantasy-rogue/progression');
const {editFusion} = require('../../dist/server/fantasy-rogue/fusion');
const {partyEvolutions} = require('../../dist/server/fantasy-rogue/party-evolution');
const {rogueCodex} = require('../../dist/server/fantasy-rogue/codex');
const {stats, set, content} = require('../fixtures/fantasy-rogue');
describe('Fantasy Rogue numbers, fusion and codex boundaries', function () {
	this.timeout(30000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function party(sets, ids) {
		const run = {id: 'numbers', floor: 50, phase: 'ready', money: 0, bag: {}, boosts: stats(0), notices: [],
			team: sets.map(s => createRoguePokemon(s, stats(0)))};
		syncBlessingParty(run); run.blessings.owned = ids.map(id => ({...blessing(id), floor: 1}));
		syncBlessingParty(run); return run;
	}
	function begin(run, foe = set('Blissey', 'Natural Cure', 100, ['Splash']), send) {
		battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			...(send ? {send} : {}),
			fantasyRogue: {encounterId: 'number-test', team: structuredClone(run.team), blessings: structuredClone(run.blessings),
				boosts: stats(0), bag: {}, balls: [], catchable: false},
			p1: {team: run.team.map(m => m.set)}, p2: {team: [foe]}});
		battle.makeChoices('team 1', 'team 1'); battle.randomizer = n => n; return battle.p1.active[0];
	}
	for (const family of ['bignumber', 'supernumber']) {
		it(`sends the ${family} control in fresh move requests and removes availability after use`, () => {
			const requests = [];
			begin(party([set('Mew', 'Synchronize', 100, ['Splash'])], [family]), undefined, (type, payload) => {
				if (type === 'sideupdate' && payload.startsWith('p1\n|request|')) requests.push(JSON.parse(payload.slice(12)));
			});
			assert(!requests.find(request => request.teamPreview).fantasyRogue.number);
			assert.equal(requests.at(-1).fantasyRogue.number?.available, true);
			battle.makeChoices('move splash', 'move splash');
			assert.equal(requests.at(-1).fantasyRogue.number?.available, true);
			battle.makeChoices(`roguenumber ${family === 'supernumber' ? 'all' : 'spa'} move splash`, 'move splash');
			assert.equal(requests.at(-1).fantasyRogue.number?.available, false);
		});
	}
	it('only marks actual Fantasy gameplay adjustments and leaves the ordinary dex untouched', () => {
		const d = Dex.mod('gen9fantasy'), base = Dex.mod('gen9');
		for (const id of ['poisonpuppeteer', 'disguise', 'beastboost', 'imposter', 'illusion']) {
			assert.equal(d.abilities.get(id).name, base.abilities.get(id).name);
		}
		assert.equal(d.abilities.get('cutecharm').name, 'Cute Charm+');
		assert.equal(base.abilities.get('cutecharm').name, 'Cute Charm');
		assert.equal(d.moves.get('razorwind').name, 'Razor Wind🔄');
		assert.equal(d.moves.get('transform').name, 'Transform');
		const guide = rogueCodex(undefined, 'guide', true).guide.modules;
		for (const id of ['strawberrysweet', 'electirizer', 'protector', 'leaderscrest']) assert(!guide.items.some(i => i.id === id));
		assert(guide.items.some(i => i.id === 'fantasyprotector'));
		assert(!guide.abilities.some(i => i.id === 'poisonpuppeteer'));
	});
	it('doubles only the chosen stat for one turn; undo is free and the second activation is rejected', () => {
		const run = party([set('Mew', 'Synchronize', 100, ['Splash'])], ['bignumber']);
		const mon = begin(run), before = mon.getStat('atk'), defense = mon.getStat('def');
		battle.choose('p1', 'roguenumber atk move splash');
		assert(!battle.fantasyRogue.numberUses?.p1);
		battle.undoChoice('p1');
		assert(!battle.fantasyRogue.numberUses?.p1);
		let seen;
		battle.onEvent('BeforeMove', battle.format, function (p) { if (p === mon) seen = [p.getStat('atk'), p.getStat('def')]; });
		battle.makeChoices('roguenumber atk move splash', 'move splash');
		assert.deepEqual(seen, [before * 2, defense]);
		assert.equal(mon.getStat('atk'), before);
		assert(battle.fantasyRogue.numberUses.p1);
		assert.equal(battle.choose('p1', 'roguenumber atk move splash'), false);
	});
	it('allows Super Number in direct offers and counts boosts and items toward thresholds', () => {
		const run = party([set('Slaking', 'Truant', 100, ['Splash'])], ['supernumber']);
		const offers = party([set('Mew')], []); offers.floor = 100;
		assert(blessingCandidates(offers, content()).some(x => x.id === 'supernumber'));
		run.team[0].set.item = 'Choice Band'; run.team[0].set.level = 300;
		const mon = begin(run); mon.boosts.atk = 6;
		battle.makeChoices('roguenumber all move splash', 'move splash');
		assert(battle.fantasyRogue.blessingProgress.numberPrize);
	});
	it('checks number thresholds safely for move-dependent abilities such as Overgrow', () => {
		const run = party([set('Venusaur', 'Overgrow', 100, ['Growth'])], ['bignumber']);
		const mon = begin(run); mon.hp = Math.floor(mon.maxhp / 4);
		assert.doesNotThrow(() => battle.makeChoices('roguenumber spa move growth', 'move splash'));
		assert(battle.fantasyRogue.numberUses.p1);
		assert(!battle.fantasyRogue.blessingProgress.numberUpgrade);
	});
	for (const [attack, expected] of [[1500, false], [2499, false], [2500, true]]) {
		it(`uses the new 5000 threshold at an actual doubled stat of ${attack * 2}`, () => {
			const mon = begin(party([set('Mew', 'Synchronize', 100, ['Splash'])], ['bignumber']));
			mon.storedStats.atk = attack;
			battle.makeChoices('roguenumber atk move splash', 'move splash');
			assert.equal(!!battle.fantasyRogue.blessingProgress.numberUpgrade, expected);
		});
	}
	it('includes Swords Dance stages, Huge Power, Choice Band and permanent training in the real threshold', () => {
		const run = party([set('Mawile-Mega', 'Huge Power', 100, ['Splash'])], ['bignumber']);
		run.team[0].set.nature = 'Adamant'; run.team[0].set.evs.atk = 252;
		run.team[0].set.item = 'Choice Band'; run.growth = { offense: 2500, defense: 0, experience: 0 };
		syncBlessingParty(run);
		const mon = begin(run); mon.boosts.atk = 2;
		const { rogueStatSnapshot } = require('../../dist/sim/fantasy-rogue-blessings');
		const before = rogueStatSnapshot(mon).atk;
		let actual;
		battle.onEvent('BeforeMove', battle.format, p => { if (p === mon) actual = rogueStatSnapshot(p).atk; });
		battle.makeChoices('roguenumber atk move splash', 'move splash');
		assert(actual >= 5000, String(actual)); assert(Math.abs(actual - before * 2) <= 4);
		assert(battle.fantasyRogue.blessingProgress.numberUpgrade);
	});
	it('multiplies all five stats by five for one turn without multiplying HP', () => {
		const mon = begin(party([set('Mew', 'Synchronize', 100, ['Splash'])], ['supernumber']));
		const keys = ['atk', 'def', 'spa', 'spd', 'spe'], before = keys.map(k => mon.getStat(k)), hp = mon.maxhp;
		let actual;
		battle.onEvent('BeforeMove', battle.format, p => { if (p === mon) actual = keys.map(k => p.getStat(k)); });
		battle.makeChoices('roguenumber all move splash', 'move splash');
		assert.deepEqual(actual, before.map(n => n * 5)); assert.equal(mon.maxhp, hp);
		assert.deepEqual(keys.map(k => mon.getStat(k)), before);
	});
	it('level 100 is not a limit for the solo partner and floor growth cannot be claimed twice', () => {
		const run = party([set('Mew', 'Synchronize', 100, ['Splash'])], ['sololeveling']);
		const account = {run, captures: {}, unlocked: [], revision: 1};
		completeBlessingFloor(account, run, content(), () => 0);
		assert.equal(run.team[0].set.level, 101);
		completeBlessingFloor(account, run, content(), () => 0);
		assert.equal(run.team[0].set.level, 101);
		gainExperience(run, run.team[0], 1000000); assert(run.team[0].set.level > 101);
	});
	it('settles upgrades without level charges and pays the large-number prize only once', () => {
		const run = party([set('Mew')], ['bignumber']), account = {run};
		const costs = [run.blessings.bossLevels, run.blessings.levels];
		const result = {encounterId: 'threshold-upgrade', won: false, blessingProgress: {numberUpgrade: true, insight: {}}};
		settleBlessingBattle(account, run, content(), result, () => 0, true);
		assert.equal(run.blessings.owned[0].id, 'bignumber', 'escaping must not settle the threshold');
		settleBlessingBattle(account, run, content(), result, () => 0);
		assert.equal(run.blessings.owned[0].id, 'supernumber');
		assert.deepEqual([run.blessings.bossLevels, run.blessings.levels], costs);
		assert(account.discoveries.blessings.includes('supernumber'));
		const prize = {encounterId: 'threshold-prize', won: false, blessingProgress: {numberPrize: true, insight: {}}};
		settleBlessingBattle(account, run, content(), prize, () => 0);
		assert.equal(run.money, 0); assert.equal(run.bag.bottlecap, 1); assert.equal(run.bag.maxelixir, 1);
		assert(run.blessings.numberPrizeClaimed);
		const after = structuredClone(run.bag);
		settleBlessingBattle(account, run, content(), prize, () => 0); assert.deepEqual(run.bag, after);
		const restored = JSON.parse(JSON.stringify(run));
		settleBlessingBattle({ run: restored }, restored, content(), { ...prize, encounterId: 'another-battle' }, () => 1);
		assert.deepEqual(restored.bag, after); assert.equal(restored.money, 0);
	});
	it('offers varied fixed-value prizes at every floor and a fresh prize in a new run', () => {
		const { NUMBER_PRIZES } = require('../../dist/server/fantasy-rogue/number-prizes');
		const full = require('../../dist/server/fantasy-rogue/preview-content').createPreviewContent();
		for (const [index, prize] of NUMBER_PRIZES.entries()) {
			assert.equal(Object.entries(prize.items).reduce((sum, [id, count]) => {
				const item = full.items.find(i => i.id === id); assert(item, id);
				return sum + (item.sellPrice || item.price) * count;
			}, 0), 7600);
			for (const floor of [10, 100, 150, 200]) {
				const run = party([set('Mew')], ['supernumber']); run.floor = floor;
				settleBlessingBattle({ run }, run, full, { encounterId: 'prize', won: true,
					blessingProgress: { numberPrize: true, insight: {} } }, () => index);
				assert.deepEqual(run.bag, prize.items); assert.equal(run.money, 0);
			}
		}
	});
	it('keeps the sealed partner in placement when splitting a full party', () => {
		const run = party([set('Mew'), set('Charizard', 'Blaze')], ['potara']);
		const [a, b] = run.team;
		editFusion(run, {action: 'fusion', fusionStats: ['hp', 'atk', 'def'], member: a.id, value: b.id, fusionAbility: 'blaze', appearance: a.id});
		run.team.push(...Array.from({length: 5}, () => createRoguePokemon(set('Bulbasaur'), stats(0))));
		editFusion(run, {action: 'unfusion', member: a.id});
		assert.equal(run.team.length, 6); assert.equal(run.blessings.pending[0].pokemon.id, b.id);
	});
	for (const [species, ability] of [['Mimikyu', 'Disguise'], ['Eiscue', 'Ice Face']]) {
		it(`does not let a fused ${ability} repeatedly block damage with a frozen appearance`, () => {
			const run = party([set(species, ability, 100, ['Splash']), set('Snorlax', 'Immunity', 100, ['Splash'])], ['potara']);
			const [a, b] = run.team;
			editFusion(run, {action: 'fusion', fusionStats: ['hp', 'atk', 'def'], member: a.id, value: b.id, fusionAbility: ability, appearance: a.id});
			const mon = begin(run), foe = battle.p2.active[0], move = battle.dex.getActiveMove('ironhead');
			const hp = mon.hp;
			battle.damage(10, mon, foe, move); battle.eachEvent('Update');
			assert.equal(mon.species.name, species);
			assert.equal(mon.m.rogueFusionSpentShell, Dex.toID(ability));
			const after = mon.hp; assert(after > hp - 100);
			battle.damage(10, mon, foe, move); assert.equal(mon.hp, after - 10);
		});
	}
	it('fuses the higher level and split stats, freezes forms, then restores without item duplication or free XP', () => {
		const run = party([set('Scyther', 'Technician', 30, ['Quick Attack']), set('Charizard', 'Blaze', 60, ['Flamethrower'])], ['potara']);
		const [a, b] = structuredClone(run.team);
		const command = {action: 'fusion', fusionStats: ['hp', 'atk', 'def'], member: a.id, value: b.id, fusionAbility: 'blaze', appearance: b.id};
		editFusion(run, command); const fused = run.team[0];
		assert.equal(run.team.length, 1); assert.equal(fused.set.level, 60);
		assert.deepEqual(fused.fusion.types, ['Bug', 'Flying']);
		assert.equal(fused.fusion.baseStats.atk, 110); assert.equal(fused.fusion.baseStats.spa, 109);
		assert(fused.blessingMoves.includes('flamethrower')); assert(fused.blessingMoves.includes('xscissor'));
		assert.deepEqual(partyEvolutions(fused), []);
		const mon = begin(run); assert.deepEqual(mon.getTypes(), ['Bug', 'Flying']);
		assert.equal(mon.formeChange('Charizard-Mega-X'), false);
		gainExperience(run, fused, 5000); fused.set.item = ''; fused.hp = Math.floor(fused.maxhp / 2);
		editFusion(run, {action: 'unfusion', member: fused.id});
		assert.equal(run.team.length, 2); assert.equal(run.team[0].set.species, a.set.species);
		assert.equal(run.team[1].set.level, b.set.level); assert.equal(run.team[0].set.item, '');
		assert(run.team[0].set.level < 60); assert(run.team[0].hp < run.team[0].maxhp);
		assert.throws(() => editFusion(run, command), /10 层/);
		run.floor += 10; run.pendingMoves = []; editFusion(run, command); assert.equal(run.team.length, 1);
	});
	it('Spinda confuses on entry and only wakes with full HP after two protected turns', () => {
		const run = party([set('Spinda', 'Own Tempo', 100, ['Splash'])], ['spindance']);
		const mon = begin(run), foe = battle.p2.active[0];
		assert(foe.volatiles.confusion);
		battle.damage(mon.hp + 100, mon, foe, battle.dex.getActiveMove('tackle'));
		assert.equal(mon.hp, 1); assert(mon.volatiles.roguespindasleep);
		battle.makeChoices('move splash', 'move splash'); assert.equal(mon.hp, 1);
		battle.makeChoices('move splash', 'move splash'); assert.equal(mon.hp, 1);
		battle.makeChoices('move splash', 'move splash'); assert.equal(mon.hp, mon.maxhp);
		battle.damage(mon.hp + 100, mon, foe, battle.dex.getActiveMove('tackle')); assert.equal(mon.hp, 0);
	});
	it('Spinda cannot survive a second opposing hit during its near-death sleep', () => {
		const mon = begin(party([set('Spinda', 'Own Tempo', 100, ['Splash'])], ['spindance']));
		const foe = battle.p2.active[0], move = battle.dex.getActiveMove('tackle');
		battle.damage(mon.hp + 1, mon, foe, move); assert.equal(mon.hp, 1);
		battle.damage(1, mon, foe, move); assert.equal(mon.hp, 0);
	});
});
