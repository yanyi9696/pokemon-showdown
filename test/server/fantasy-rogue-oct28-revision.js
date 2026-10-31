'use strict';
const assert = require('assert').strict;
const { Battle, Dex } = require('../../dist/sim');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const b = require('../../dist/server/fantasy-rogue/blessings');
const { blessing, FANTASY_BLESSING_ITEMS, ROGUE_BLESSINGS } = require('../../dist/sim/rogue-blessing-data');
const { affectionBenefits, affectionResidual } = require('../../dist/sim/rogue-affection');
const { changeFriendship } = require('../../dist/server/fantasy-rogue/friendship');
const { roguePowerModifiers, blessingAfterAction } = require('../../dist/sim/fantasy-rogue-blessings');
const { summitEncounter } = require('../../dist/server/fantasy-rogue/final-bosses');
const { bossRoster } = require('../../dist/server/fantasy-rogue/story');
const { repairSavedEncounters } = require('../../dist/server/fantasy-rogue/encounter-repair');
const { loadedDiceEventWeight } = require('../../dist/server/fantasy-rogue/luck-events');
const { chooseEvent } = require('../../dist/server/fantasy-rogue/events');
const { blessingAvailabilityNotes } = require('../../dist/server/fantasy-rogue/blessing-text');
const { blessingMoveWeight } = require('../../dist/server/fantasy-rogue/blessing-move-weight');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue October 28 blessing revision', function () {
	this.timeout(30000);
	let content, battle;
	before(() => { content = createPreviewContent(); });
	afterEach(() => { if (battle) battle.destroy(); battle = null; });
	const owned = id => ({ ...blessing(id), floor: 1 });
	function setup(floor = 1, names = ['Mew', 'Pikachu']) {
		const run = { id: 'oct28', contentVersion: content.version, floor, phase: 'blessing', encounter: 0, attempt: 0,
			boosts: stats(0), bag: {}, money: 0, caught: [], startingSlots: 2,
			team: names.map(name => createRoguePokemon(set(name, 'No Ability', 50, ['Tackle']), stats(0))) };
		const account = { revision: 1, points: 0, slots: 2, boosts: stats(0), captures: {}, unlocked: [], run };
		b.normalizeBlessings(run); return { run, account };
	}
	function choose(pair, id, random = () => 0) {
		const def = blessing(id), { run, account } = pair;
		run.blessings.round = { floor: run.floor, tier: def.tier, remaining: 1,
			options: [{ id, refreshes: 1, chosen: false }], familiesSeen: [def.family] };
		b.handleBlessingCommand(account, run, content, { action: 'blessing', slot: 0 }, random);
	}
	function fight(ids = [], value = 0, species = 'Mew', foeAbility = 'No Ability') {
		const { run } = setup(1, [species]); run.blessings.owned = ids.map(owned);
		run.team[0].bond = value;
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'oct28', team: run.team, blessings: run.blessings,
				boosts: stats(0), bag: {}, balls: [], catchable: false },
			p1: { team: run.team.map(mon => mon.set) }, p2: { team: [set('Blissey', foeAbility, 100, ['Splash'])] } });
		battle.makeChoices('team 1', 'team 1');
		battle.randomizer = n => n;
		return battle.p1.active[0];
	}
	it('soft-weights current unlocked move pools, including memory and emblems but not future learnsets, eggs or box', () => {
		const { run } = setup(50, ['Scyther']);
		run.team[0].moveMemory = [{ id: 'tackle', pp: 35, maxpp: 35 }];
		const weight = id => b.blessingCandidates(run, content).find(def => def.id === id)?.appearanceWeight;
		assert.equal(weight('ascent'), 20); assert.equal(weight('bugchoir'), 20);
		run.box = [{ ...run.team[0], set: { ...run.team[0].set, moves: ['Air Slash'] } }];
		assert.equal(weight('ascent'), 20);
		run.team[0].moveMemory.push({ id: 'airslash', pp: 0, maxpp: 15 });
		assert.equal(weight('ascent'), 100, 'unlocked, unequipped and depleted PP still count');
		run.team[0].blessingMoves = ['bugbuzz']; assert.equal(weight('bugchoir'), 100);
		run.team[0].egg = {}; assert.equal(weight('ascent'), 20); assert.equal(weight('bugchoir'), 20);
		assert(!blessingAvailabilityNotes(blessing('ascent')).some(text => /权重|概率|招式池/.test(text)));
	});
	it('applies the same soft preference to each explicit move-family blessing', () => {
		for (const [id, move] of [
			['emissarywater', 'watergun'], ['typelinkfire', 'ember'], ['ascent', 'airslash'],
			['veteransniper', 'snipe shot'], ['sound', 'growl'], ['multihit', 'bulletseed'],
			['bugchoir', 'bugbuzz'], ['explosionart', 'explosion'], ['seeds', 'leechseed'],
			['detect', 'detect'], ['swords', 'sacredsword'], ['railgun', 'zapcannon'],
			['hazards', 'stealthrock'], ['hoopa', 'lick'], ['meltan', 'thundershock'],
		]) {
			assert.equal(blessingMoveWeight(blessing(id), []), 0.2, id);
			assert.equal(blessingMoveWeight(blessing(id), [Dex.mod('gen9fantasy').moves.get(move)]), 1, id);
		}
		assert.equal(blessingMoveWeight(blessing('weakness'), []), 1);
	});
	it('uses boss levels for all six summit members, repairs old guard offsets once, and keeps previews consistent', () => {
		const { run } = setup(200); run.blessings.levels = 14; run.blessings.bossLevels = 30;
		const node = { id: 'summit', kind: 'boss', name: '峰顶', encounters: [summitEncounter()], reward: { money: 0, items: {} } };
		run.node = structuredClone(node); run.bossPreviews = { 200: structuredClone(node) };
		const levels = [130, 130, 130, 130, 130, 130];
		assert.deepEqual(bossRoster(run, 200).levels, levels);
		b.prepareBlessingEncounter(run, () => 0);
		assert.deepEqual(run.node.encounters[0].team.map(mon => mon.level), levels);
		assert.equal(run.node.encounters[0].boss.mewtwoY.level, 100, 'phase template is scaled from the live Mewtwo');
		assert(!run.node.encounters[0].escortCount, 'do not disable summit guard AI or transformations');
		run.phase = 'ready'; const encounter = run.node.encounters[0];
		encounter.team.forEach((mon, i) => { mon.level = i === 5 ? 130 : 114; });
		encounter.blessingLevelOffsets = [14, 14, 14, 14, 14, 30];
		repairSavedEncounters(run); repairSavedEncounters(run);
		assert.deepEqual(encounter.team.map(mon => mon.level), levels);
	});
	it('gives all eighteen emissaries move power only, irrespective of the user Pokemon type', () => {
		const ids = ROGUE_BLESSINGS.filter(def => def.family === 'emissary').map(def => def.id);
		const own = fight(ids), foe = battle.p2.active[0];
		for (const type of Object.keys(require('../../dist/sim/rogue-blessing-data').BLESSING_TYPES)) {
			const move = battle.dex.getActiveMove({ name: 'Tackle', type, basePower: 100, category: 'Physical' });
			assert.equal(battle.runEvent('BasePower', own, foe, move, 100), 110, type);
			assert(roguePowerModifiers(own, move).some(mod => mod.factor === 1.1));
		}
		const { run } = setup(); run.blessings.owned = ids.map(owned);
		const hp = run.team[0].maxhp; b.syncBlessingParty(run); assert.equal(run.team[0].maxhp, hp);
		run.team[0].set.happiness = 70; changeFriendship(run.team[0], 3, run); assert.equal(run.team[0].set.happiness, 73);
	});
	it('allows later recruits to accumulate affection after full friendship, retaining the starter-only friendship bonus', () => {
		const pair = setup(); pair.run.team[0].initialPartner = true; choose(pair, 'bond');
		const { run, account } = pair;
		for (const mon of run.team) mon.set.happiness = 100;
		changeFriendship(run.team[0], 2, run); changeFriendship(run.team[1], 2, run);
		assert.equal(run.team[0].set.happiness, 103); assert.equal(run.team[1].set.happiness, 102);
		run.team.push(createRoguePokemon(set('Eevee', 'Run Away', 5), stats(0)));
		for (const mon of run.team) mon.set.happiness = 255;
		for (let floor = 2; floor <= 11; floor++) { run.floor = floor; b.completeBlessingFloor(account, run, content, () => 0); }
		assert(run.team.every(mon => mon.bond === 100));
		const loaded = JSON.parse(JSON.stringify(run)); b.normalizeBlessings(loaded);
		assert(loaded.team.every(mon => mon.bond === 100));
		assert.equal(b.blessingExperience(run, run.team[2]), 1.2);
	});
	it('implements staged affection EXP, survival, cure, accuracy and exact critical probability multipliers', () => {
		assert.deepEqual([0, 20, 40, 60, 80, 100].map(n => affectionBenefits(n).endure), [0, 0, 10, 15, 20, 25]);
		const own = fight(['bond'], 100), foe = battle.p2.active[0], rolls = [];
		battle.randomChance = (numerator, denominator) => { rolls.push([numerator, denominator]); return true; };
		battle.actions.getDamage(own, foe, 'tackle'); assert(rolls.some(([n, d]) => n === 2 && d === 24));
		battle.damage(own.maxhp * 2, own, foe, battle.dex.moves.get('tackle')); assert.equal(own.hp, 1);
		battle.damage(5, own, foe, battle.dex.moves.get('tackle')); assert.equal(own.hp, 1, 'can endure subsequent hits at 1 HP');
		assert(rolls.some(([n, d]) => n === 25 && d === 100));
		assert.equal(battle.runEvent('Accuracy', own, foe, battle.dex.moves.get('tackle'), 100), 90);
		assert.equal(battle.runEvent('Accuracy', own, foe, battle.dex.moves.get('swift'), true), true);
		own.setStatus('par', foe); affectionResidual(battle); assert.equal(own.status, '');
		assert(rolls.some(([n, d]) => n === 20 && d === 100));
		battle.damage(5, own, own, battle.dex.items.get('lifeorb')); assert.equal(own.hp, 0, 'no survival for self costs');
	});
	it('keeps non-Rogue and enemy Pokemon outside affection benefits, and respects No Guard', () => {
		const own = fight(['bond'], 100, 'Mew', 'No Guard'), foe = battle.p2.active[0];
		assert.equal(battle.runEvent('Accuracy', own, foe, battle.dex.moves.get('tackle'), 100), true);
		assert.equal(battle.runEvent('Accuracy', foe, own, battle.dex.moves.get('tackle'), 100), true);
		foe.ability = 'noability';
		assert.equal(battle.runEvent('Accuracy', foe, own, battle.dex.moves.get('tackle'), 100), 100);
		battle.destroy();
		battle = new Battle({ formatid: 'gen9customgame', seed: [1, 2, 3, 4],
			p1: { team: [set('Mew', 'No Ability', 50, ['Tackle'])] },
			p2: { team: [set('Blissey', 'No Ability', 100, ['Splash'])] } });
		battle.makeChoices('team 1', 'team 1');
		const rolls = [];
		battle.randomChance = (n, d) => { rolls.push([n, d]); return true; };
		battle.actions.getDamage(battle.p1.active[0], battle.p2.active[0], 'tackle');
		assert(rolls.some(([n, d]) => n === 1 && d === 24), 'ordinary battles retain their original critical chance');
	});
	it('adds the silver Pandora fantasy item and a Tera Hollow elite-quality gift, then only one shard choice', () => {
		let pair = setup(); choose(pair, 'pandorasilver');
		assert.equal(FANTASY_BLESSING_ITEMS.reduce((n, id) => n + (pair.run.bag[id] || 0), 0), 1);
		pair = setup(); pair.run.difficulty = 5; pair.run.difficultyRulesVersion = 5;
		choose(pair, 'reservetera', n => Math.floor(n / 2));
		const gift = pair.run.blessings.pending.find(p => p.kind === 'gift'); assert(gift);
		const biome = require('../../dist/server/fantasy-rogue/biome-data').RogueBiomes.find(entry => entry.id === 'biome14');
		assert(biome.tiers[0].some(slot => slot.species.includes(gift.pokemon.set.species)));
		assert.deepEqual(Object.values(gift.pokemon.set.ivs), [31, 31, 31, 31, 31, 31], 'tier-five elite distribution at the median roll');
		pair.run.floor = 100; b.completeBlessingFloor(pair.account, pair.run, content, () => 0);
		assert.equal(pair.run.blessings.pending.filter(p => p.kind === 'tera').length, 1);
	});
	it('weights eligible coin/die events more often without removing stage gates', () => {
		const { run } = setup(20);
		assert.equal(loadedDiceEventWeight(run, 'meowthcoin'), 1);
		run.blessings.owned.push(owned('dice'));
		assert.equal(loadedDiceEventWeight(run, 'meowthcoin'), 2);
		assert.equal(loadedDiceEventWeight(run, 'dice'), 2); assert.equal(loadedDiceEventWeight(run, 'forest'), 1);
		for (let i = 0; i < 100; i++) assert.notEqual(chooseEvent(run, n => i % n), 'clefairydice');
	});
	it('only lowers accuracy when Spinda successfully establishes a new confusion', () => {
		const own = fight(['spindance'], 0, 'Spinda'), foe = battle.p2.active[0];
		assert(foe.volatiles.confusion); assert.equal(foe.boosts.accuracy, -1);
		require('../../dist/sim/rogue-spinda').spindaHit(own, foe);
		assert.equal(foe.boosts.accuracy, -1, 'refresh does not stack');
		foe.removeVolatile('confusion'); foe.ability = 'owntempo';
		assert(!foe.addVolatile('confusion', own)); assert.equal(foe.boosts.accuracy, -1);
		foe.ability = 'noability'; assert(foe.addVolatile('confusion', own)); assert.equal(foe.boosts.accuracy, -2);
	});
	it('raises all four offensive and defensive stats per style grade, starting at F and spending S', () => {
		const own = fight(['style']), base = ['atk', 'def', 'spa', 'spd'].map(key => own.getStat(key));
		const foe = battle.p2.active[0];
		for (let i = 0; i < 6; i++) {
			const move = battle.dex.getActiveMove(i % 2 ? 'watergun' : 'tackle');
			move.rogueHitTargets = [foe.set.fantasyRogueId || foe.getSlot()]; blessingAfterAction(battle, own, move);
		}
		for (const [i, key] of ['atk', 'def', 'spa', 'spd'].entries()) assert.equal(own.getStat(key), Math.floor(base[i] * 1.6));
		require('../../dist/sim/fantasy-rogue-blessings').spendBlessingZ(own);
		for (const [i, key] of ['atk', 'def', 'spa', 'spd'].entries()) assert.equal(own.getStat(key), base[i]);
	});
	it('grants fifty initial Meltan candy and twenty per Steel defeat even without the blessing', () => {
		const pair = setup(); choose(pair, 'meltan'); assert.equal(pair.run.blessings.candy, 50);
		const standalone = setup(30, ['Meltan']);
		const result = { won: true, encounterId: 'steel', defeated: [{ id: 'magnemite', species: 'Magnemite', participants: [] }] };
		b.settleBlessingBattle(standalone.account, standalone.run, content, result, () => 0);
		b.settleBlessingBattle(standalone.account, standalone.run, content, result, () => 0);
		assert.equal(standalone.run.blessings.candy, 20);
	});
	it('allows Regi and other emblems in both selection orders, pays five milestones once, and migrates old payouts', () => {
		const pair = setup(100); const { run, account } = pair;
		run.blessings.owned = [owned('typexpwater')]; assert(b.blessingCandidates(run, content).some(def => def.id === 'regis'));
		run.blessings.owned = [owned('regis')]; assert(b.blessingCandidates(run, content).some(def => def.id === 'typelinkfire'));
		const names = ['Regirock', 'Regice', 'Registeel', 'Regieleki', 'Regidrago'];
		run.node = { kind: 'elite', encounters: [] };
		for (const [i, species] of names.entries()) {
			const result = { won: true, encounterId: 'regi' + i, defeated: [{ id: species, species, captured: i % 2 === 0, participants: [] }] };
			b.settleBlessingBattle(account, run, content, result, () => 0);
			assert.equal(run.blessings.shards, (i + 1) * 10);
			b.settleBlessingBattle(account, run, content, result, () => 0); assert.equal(run.blessings.shards, (i + 1) * 10);
		}
		assert.equal(run.blessings.pending.filter(p => p.kind === 'toolbox').length, 1);
		const old = setup(170); old.run.blessings.owned = [owned('regis')];
		old.run.blessings.regis = names; old.run.blessings.regiReward = true; delete old.run.blessings.regiBonusMilestones;
		b.settleBlessingBattle(old.account, old.run, content, { won: true, encounterId: 'old', defeated: [] }, () => 0);
		assert.equal(old.run.blessings.shards, 0); assert.equal(old.run.blessings.pending.length, 0);
	});
});
