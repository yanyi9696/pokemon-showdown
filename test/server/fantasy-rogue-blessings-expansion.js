'use strict';
const { commandAfterOpening } = require('../fixtures/fantasy-rogue');
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {Battle} = require('../../dist/sim/battle');
const {Dex} = require('../../dist/sim/dex');
const {blessing} = require('../../dist/sim/rogue-blessing-data');
const {createRoguePokemon, initializeExperience} = require('../../dist/server/fantasy-rogue/progression');
const {rogueBattleResult, throwRogueBall} = require('../../dist/sim/fantasy-rogue');
const {sharedRogueItems} = require('../../dist/sim/fantasy-rogue-items');
const {eeveeZAvailable} = require('../../dist/sim/fantasy-rogue-blessings');
const {set, stats} = require('../fixtures/fantasy-rogue');
const blessings = require('../../dist/server/fantasy-rogue/blessings');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {storyView} = require('../../dist/server/fantasy-rogue/story');
const {beginShopChallenge} = require('../../dist/server/fantasy-rogue/shop-challenge');
const owned = id => ({...blessing(id), floor: 50});

describe('Fantasy Rogue expanded blessings', function () {
	this.timeout(30000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function begin(ids, ours, foes = [set('Blissey', 'Natural Cure', 100, ['Splash'])], extra = {}) {
		battle?.destroy();
		const team = ours.map(s => createRoguePokemon(s, stats(0)));
		const state = {encounterId: 'expansion', team, boosts: stats(0), bag: {}, balls: [], catchable: false,
			blessings: {owned: ids.map(owned)}, ...extra};
		battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: {name: 'Player', team: team.map(mon => mon.set)}, p2: {name: 'Opponent', team: foes}});
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		return state;
	}
	function turn(a = 'move 1', b = 'move 1') { assert(battle.choose('p1', a)); assert(battle.choose('p2', b)); }
	const mice = items => ['Pikachu', 'Raichu', 'Plusle', 'Minun', 'Pachirisu', 'Dedenne'].map((name, i) =>
		({...set(name, 'Run Away', 80, ['Tackle', 'Splash']), item: items[i] || ''}));
	it('keeps stable IDs for renamed blessings and assigns the revised silver tiers', () => {
		assert.equal(blessing('secondchoice').name, '别那么讲究');
		assert.equal(blessing('rocketcatch').tier, 'silver');
		assert.equal(blessing('medic').tier, 'silver');
	});
	it('does not give Natural Cure to the silver medical blessing', () => {
		begin(['medic'], [set('Snorlax', 'Immunity')]);
		assert(!battle.p1.active[0].hasAbility('naturalcure'));
	});
	it('rest in ball grants both switch-out abilities to each member', () => {
		begin(['restinball'], [set('Snorlax', 'Immunity', 50, ['Splash']), set('Pikachu', 'Static', 50, ['Splash'])]);
		const a = battle.p1.active[0]; a.hp = Math.floor(a.maxhp / 2); a.setStatus('brn');
		const before = a.hp; turn('switch 2');
		assert.equal(a.status, ''); assert(a.hp > before);
		assert(battle.p1.active[0].hasAbility('regenerator'));
	});
	it('shares distinct equipment and applies Light Ball to a non-Pikachu family member', () => {
		begin(['mousefamily'], mice(['', 'lightball', 'choiceband', 'choiceband', 'leftovers', '']));
		const a = battle.p1.active[0], b = battle.p1.pokemon[1];
		assert(a.hasItem('leftovers')); assert.equal(sharedRogueItems(a).length, 3);
		assert.equal(a.getStat('atk'), Math.floor(a.storedStats.atk * 3));
		turn('switch 2');
		assert.equal(b.getStat('spa'), b.storedStats.spa * 2);
		assert.equal(a.item, ''); assert.equal(b.item, 'lightball');
	});
	it('spends a shared Focus Sash only once for the whole family', () => {
		begin(['mousefamily'], mice(['', 'focussash', '', '', '', '']), [set('Mewtwo', 'Pressure', 100, ['Psychic'])]);
		battle.randomizer = damage => damage;
		const a = battle.p1.active[0];
		battle.actions.tryMoveHit(a, battle.p2.active[0], battle.dex.getActiveMove('fissure'));
		assert.equal(a.hp, 1);
		assert(!battle.p1.pokemon.some(p => p.hasItem('focussash')));
		assert.equal(rogueBattleResult(battle).team[1].set.item, '');
	});
	it('does not share a Mega Stone or a Z Crystal', () => {
		begin(['mousefamily'], mice(['', 'charizarditex', 'eeviumz', '', '', '']));
		assert(!battle.p1.active[0].hasItem('charizarditex'));
		assert(!battle.p1.active[0].hasItem('eeviumz'));
	});
	it('shares berry consumption and does not eat an unrelated carried item', () => {
		begin(['mousefamily'], mice(['leftovers', 'sitrusberry', '', '', '', '']));
		const a = battle.p1.active[0]; a.hp = Math.floor(a.maxhp / 3);
		const before = a.hp; battle.runEvent('Update', a);
		assert(a.hp > before); assert.equal(a.item, 'leftovers');
		assert.equal(battle.p1.pokemon[1].item, '');
		assert(!a.hasItem('sitrusberry'));
	});
	it('renews only the first shared consumable without replacing the real equipment', () => {
		begin(['mousefamily', 'renewable'], mice(['leftovers', 'sitrusberry', '', '', '', '']));
		const a = battle.p1.active[0];
		for (let i = 0; i < 2; i++) {
			a.hp = Math.floor(a.maxhp / 3); battle.runEvent('Update', a);
			assert(a.hp > a.maxhp / 3); assert.equal(a.item, 'leftovers');
			assert.equal(battle.p1.pokemon[1].item, i === 0 ? 'sitrusberry' : '');
		}
		assert.equal(rogueBattleResult(battle).team[1].set.item, '');
	});
	it('retains ordinary held items and respects Magic Room when sharing', () => {
		begin(['mousefamily'], mice(['', 'lightball', '', '', '', '']));
		const a = battle.p1.active[0]; battle.field.addPseudoWeather('magicroom', a);
		assert.equal(a.getStat('atk'), a.storedStats.atk);
	});
	it('shared Choice Band locks the move even when the active member holds Leftovers', () => {
		begin(['mousefamily'], mice(['leftovers', 'choiceband']));
		turn();
		assert.equal(battle.p1.active[0].volatiles.choicelock.move, 'tackle');
		assert(battle.p1.activeRequest.active[0].moves.find(m => m.id === 'splash').disabled);
	});
	it('pops a shared Air Balloon for the whole team without removing the active item', () => {
		begin(['mousefamily'], mice(['leftovers', 'airballoon']), [set('Blissey', 'Natural Cure', 50, ['Tackle'])]);
		const a = battle.p1.active[0]; assert(!a.isGrounded()); turn('move 2');
		assert(a.isGrounded()); assert.equal(a.item, 'leftovers');
		assert.equal(battle.p1.pokemon[1].item, '');
	});
	it('gates Mega and ordinary Z moves but allows the per-member Eevee family action', () => {
		begin([], [{...set('Charizard', 'Blaze', 60, ['Flamethrower']), item: 'charizarditex'}]);
		assert(!battle.p1.active[0].canMegaEvo);
		begin([], [{...set('Pikachu', 'Static', 60, ['Thunderbolt']), item: 'electriumz'}]);
		assert(!battle.actions.canZMove(battle.p1.active[0]));
		begin(['eeveefamily'], ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon'].map(name => set(name, 'Run Away', 60, ['Splash'])));
		assert(eeveeZAvailable(battle.p1.active[0])); turn('rogueeeveez move 1');
		assert.equal(battle.p1.active[0].boosts.atk, 2); assert(!eeveeZAvailable(battle.p1.active[0]));
		assert.equal(battle.p1.active[0].lastMove.id, 'splash', 'the regular move still resolves in the same turn');
		assert(!battle.p1.zMoveUsed); turn('switch 2'); assert(eeveeZAvailable(battle.p1.active[0]));
	});
	it('unlocks both ordinary mechanics when campaign permission is present', () => {
		begin([], [{...set('Charizard', 'Blaze', 60, ['Flamethrower']), item: 'charizarditex'}], undefined,
			{systems: {player: {mega: true, z: true}}});
		assert(battle.p1.active[0].canMegaEvo);
		begin([], [{...set('Pikachu', 'Static', 60, ['Thunderbolt']), item: 'electriumz'}], undefined,
			{systems: {player: {mega: true, z: true}}});
		assert(battle.actions.canZMove(battle.p1.active[0]));
	});
	it('separates G-Mega unlock from ordinary Mega and still requires the wishing star', () => {
		const mon = {...set('Melmetal-Fantasy', 'Iron Fist', 60, ['Splash']), item: 'gmegawishingstar'};
		begin([], [mon], undefined, {systems: {player: {mega: true, z: false}}});
		assert(!battle.p1.active[0].canMegaEvo, 'ordinary Mega permission must not unlock G-Mega');
		begin([], [mon], undefined, {systems: {player: {mega: false, gmega: true, z: false}}});
		assert.equal(battle.p1.active[0].canMegaEvo, 'Melmetal-G-Mega-Fantasy');
		turn('move 1 mega'); assert.equal(battle.p1.active[0].species.name, 'Melmetal-G-Mega-Fantasy');
		begin([], [{...mon, item: ''}], undefined, {systems: {player: {mega: true, gmega: true, z: false}}});
		assert(!battle.p1.active[0].canMegaEvo);
	});
	it('ascent lifts after a cutting hit and allows a different freely selected landing move', () => {
		begin(['ascent'], [set('Scyther', 'Swarm', 80, ['Aerial Ace', 'Slash', 'Tackle', 'Splash'])]);
		turn('move 2'); assert(battle.p1.active[0].isSemiInvulnerable());
		turn('move 3'); assert(!battle.p1.active[0].isSemiInvulnerable());
		assert.equal(battle.p1.active[0].lastMove.id, 'tackle');
	});
	it('enhanced Life Orb charges only a successful damaging attack and respects Magic Guard', () => {
		for (const ability of ['Immunity', 'Magic Guard']) {
			begin(['lifepower'], [{ ...set('Snorlax', ability, 50, ['Tackle', 'Splash']), item: 'Life Orb' }]);
			const a = battle.p1.active[0], hp = a.hp; turn('move 2'); assert.equal(a.hp, hp);
			turn('move 1'); assert.equal(a.hp, ability === 'Magic Guard' ? hp : hp - Math.floor(a.maxhp / 5));
		}
	});
	it('captures an NPC member and continues until all opponents have been defeated or captured', () => {
		begin(['rocketcatch'], [set('Snorlax', 'Immunity', 50, ['Splash'])],
			[set('Pikachu', 'Static', 30, ['Splash']), set('Eevee', 'Run Away', 30, ['Splash'])],
			{catchable: true, allowReplacement: true, bag: {pokeball: 2}, balls: [{id: 'pokeball', name: '精灵球', chance: 1}]});
		turn('rogueball pokeball'); assert(!battle.ended); assert.equal(battle.p2.pokemonLeft, 1);
		assert.equal(battle.requestState, 'switch'); assert(battle.choose('p2', 'switch 2'));
		turn('rogueball pokeball'); assert(battle.ended);
		const result = rogueBattleResult(battle); assert.equal(result.captures.length, 2);
		assert.equal(new Set(result.captures.map(mon => mon.id)).size, 2);
	});
	it('failed NPC captures boost a real stage immediately and queue reserves until their switch-in', () => {
		begin(['rocketcatch'], [set('Snorlax', 'Immunity', 50, ['Splash'])],
			[set('Pikachu', 'Static', 30, ['Splash']), set('Eevee', 'Run Away', 30, ['Splash'])],
			{npcCapture: true, catchable: true, allowReplacement: true, bag: {pokeball: 5}, balls: [{id: 'pokeball', name: '精灵球', chance: 0}]});
		const lead = battle.p2.active[0], reserve = battle.p2.pokemon[1];
		const base = {...lead.storedStats};
		battle.sample = () => 'spa';
		turn('rogueball pokeball');
		assert.equal(lead.boosts.spa, 2); assert.deepEqual(lead.storedStats, base);
		assert.equal(reserve.boosts.spa, 0); assert.equal(reserve.m.rogueCaptureRage.spa, 2);
		assert(battle.log.some(line => line.startsWith('|-boost|p2a:') && line.includes('|spa|2')));
		turn('rogueball pokeball'); assert.equal(lead.boosts.spa, 4);
		turn('move 1', 'switch 2');
		assert.equal(reserve.boosts.spa, 4); assert(!reserve.m.rogueCaptureRage);
		turn('move 1', 'switch 2');
		assert.equal(lead.boosts.spa, 0, 'switching resets ordinary boosts; no permanent stat modifier');
	});
	it('does not provoke wild Pokemon after a failed capture or trainers after a successful capture', () => {
		begin(['rocketcatch'], [set('Snorlax', 'Immunity', 50, ['Splash'])], undefined,
			{catchable: true, allowReplacement: true, bag: {pokeball: 1}, balls: [{id: 'pokeball', name: '精灵球', chance: 0}]});
		turn('rogueball pokeball'); assert(Object.values(battle.p2.active[0].boosts).every(v => v === 0));
		begin(['rocketcatch'], [set('Snorlax', 'Immunity', 50, ['Splash'])],
			[set('Pikachu', 'Static', 30, ['Splash']), set('Eevee', 'Run Away', 30, ['Splash'])],
			{npcCapture: true, catchable: true, allowReplacement: true, bag: {pokeball: 1}, balls: [{id: 'pokeball', name: '精灵球', chance: 1}]});
		turn('rogueball pokeball'); assert(!battle.p2.pokemon[1].m.rogueCaptureRage);
	});
});

describe('Fantasy Rogue expanded blessing campaign', function () {
	this.timeout(30000);
	let content;
	before(() => { content = createPreviewContent(); content.blessings = true; });
	function setup(floor = 50) {
		const run = {id: 'expanded', contentVersion: content.version, floor, phase: 'blessing', encounter: 0, attempt: 0,
			team: [createRoguePokemon(set(), stats(0))], boosts: stats(0), bag: {}, money: 0, caught: [], startingSlots: 1};
		const account = {revision: 1, points: 0, slots: 1, boosts: stats(0), captures: {}, unlocked: [], run};
		blessings.normalizeBlessings(run); return {run, account};
	}
	it('reduces only last-run selections, without changing unrelated candidates', () => {
		const {run} = setup(); run.previousBlessings = ['medic'];
		const pool = blessings.blessingCandidates(run, content);
		assert.equal(pool.find(entry => entry.id === 'medic').appearanceWeight, 20);
		assert.equal(pool.find(entry => entry.id === 'lowhp').appearanceWeight, 100);
	});
	it('gives every individual one legal learning credit and retains a fifth move slot', () => {
		const {run, account} = setup(); run.phase = 'ready'; run.blessings.owned.push(owned('learnall'));
		const mon = run.team[0];
		const move = blessings.blessingLearnChoices(mon)[0]; assert(move);
		blessings.handleBlessingCommand(account, run, content, {action: 'learnbonus', member: mon.id, value: move}, () => 0);
		assert(mon.moveMemory.some(entry => entry.id === move));
		assert.throws(() => blessings.handleBlessingCommand(account, run, content, {action: 'learnbonus', member: mon.id, value: blessings.blessingLearnChoices(mon)[0]}, () => 0));
		const next = createRoguePokemon(set('Pikachu', 'Static', 50), stats(0)); run.team.push(next);
		assert(blessings.blessingView(run).learning.some(entry => entry.member === next.id));
	});
	it('selects exactly one strongest duck and keeps its display stats consistent', () => {
		const {run} = setup(); run.blessings.owned.push(owned('duck'));
		run.team = [createRoguePokemon(set('Psyduck', 'Damp', 50), stats(0)), createRoguePokemon(set('Golduck', 'Damp', 60), stats(0))];
		blessings.syncBlessingParty(run);
		assert(!run.team[0].statModifiers.extraType); assert.equal(run.team[1].statModifiers.extraType, 'Psychic');
		assert.deepEqual(run.team[1].statModifiers.baseStats, {spa: 20, spe: 20});
	});
	it('grants a locked system before the floor100 battle and only once', () => {
		const {run} = setup(100); run.teraUnlocked = true; run.phase = 'story';
		blessings.gymSystemGift(run); const reward = run.blessings.pending[0];
		assert.deepEqual(reward.options, ['mega', 'gmega', 'z']); assert.equal(run.phase, 'blessing');
		const restored = JSON.parse(JSON.stringify(run));
		blessings.grantSystem(restored, 'mega', '赠礼');
		assert(restored.megaUnlocked); assert(restored.blessings.pending[1].options.includes('charizarditex'));
	});
	it('uses distinct dialogue for the ten gym leaders and supports reloading the current page', () => {
		const {run, account} = setup(100); run.story = {stage: 'gymgift', page: 0};
		const lines = new Set();
		for (const id of ['brock', 'sabrina', 'flannery', 'roxie', 'viola', 'acerola', 'nessa', 'bea', 'iono', 'larry']) {
			run.node = {encounters: [{trainer: {id, name: id}}]};
			lines.add(storyView(account, true, false).text);
		}
		assert.equal(lines.size, 10); run.story.page = 1;
		assert.equal(storyView(JSON.parse(JSON.stringify(account)), true, false).index, 1);
	});
	it('builds themed shop teams, saves rewards and refuses a second challenge', () => {
		for (const [name, avatar] of [['宝可梦中心', 'nurse'], ['旅行商店', 'gentleman']]) {
			const {run} = setup(99); run.phase = 'rest'; run.blessings.owned.push(owned('shopraid'));
			run.node = {name, kind: 'rest', encounters: [], reward: {money: 0, items: {}}};
			beginShopChallenge(run, content, () => 0);
			assert.equal(run.node.encounters[0].trainer.avatar, avatar);
			assert.equal(Object.keys(run.node.shopChallenge.rewards).length, 3);
			assert.throws(() => beginShopChallenge(run, content, () => 0));
		}
	});
	it('grants the G-Mega reservation after clearing 100 and cannot duplicate its wishing star', () => {
		const {run, account} = setup(99); run.blessings.owned.push(owned('reservegmega'));
		blessings.completeBlessingFloor(account, run, content, () => 0); assert(!run.gmegaUnlocked);
		run.floor = 100; blessings.completeBlessingFloor(account, run, content, () => 0);
		assert(run.gmegaUnlocked); assert.equal(run.bag.gmegawishingstar, 1);
		assert(!run.megaUnlocked);
		blessings.completeBlessingFloor(account, run, content, () => 0);
		assert.equal(run.bag.gmegawishingstar, 1);
	});
	it('offers G-Mega at the gym and grants its item while remaining in the preparation phase', () => campaign(({store, account, command}) => {
		store.change('expansionqa', saved => {
			saved.run.floor = 99; saved.run.phase = 'rest'; saved.run.node = structuredClone(content.floors[99][0]);
		});
		command('continue');
		while (account().run.story) command('storynext', {value: storyView(account(), false, false).key});
		const reward = account().run.blessings.pending[0];
		assert.deepEqual(reward.options, ['mega', 'gmega', 'z', 'tera']);
		command('blessingreward', {member: reward.id, value: 'gmega'});
		const run = account().run;
		assert(run.gmegaUnlocked); assert.equal(run.bag.gmegawishingstar, 1);
		assert.equal(run.phase, 'ready'); assert(!run.battle); assert(!run.megaUnlocked);
		command('equip', {member: run.team[0].id, value: 'gmegawishingstar'});
		assert.equal(account().run.team[0].set.item, 'gmegawishingstar');
	}));
	function campaign(fn) {
		const store = new RogueStore(':memory:');
		const engine = new RogueEngine(store, content, () => 0);
		const account = () => store.get('expansionqa');
		const command = (action, data = {}) => commandAfterOpening(engine, 'expansionqa', {
			id: randomUUID(), revision: account().revision, action, ...data,
		});
		try { command('start', {starters: ['bulbasaur']}); fn({store, engine, account, command}); }
		finally { store.close(); }
	}
	it('persists the complete floor100 conversation, grants exactly one item and survives gym defeat', () => campaign(({store, engine, account, command}) => {
		store.change('expansionqa', saved => {
			saved.run.floor = 99; saved.run.phase = 'rest'; saved.run.node = structuredClone(content.floors[99][0]);
			saved.run.teraUnlocked = true;
		});
		command('continue'); assert.equal(account().run.phase, 'story');
		assert.throws(() => command('battle'));
		const page = storyView(account(), false, false);
		command('storynext', {value: page.key});
		assert.throws(() => command('storynext', {value: page.key}));
		command('storynext', {value: storyView(account(), false, false).key});
		let reward = account().run.blessings.pending[0]; assert.deepEqual(reward.options, ['mega', 'gmega', 'z']);
		command('blessingreward', {member: reward.id, value: 'z'});
		assert(account().run.zUnlocked); assert.equal(account().run.phase, 'blessing');
		reward = account().run.blessings.pending[0]; assert(reward.options.includes('normaliumz'));
		command('blessingreward', {member: reward.id, value: 'normaliumz'});
		assert.throws(() => command('blessingreward', {member: reward.id, value: 'normaliumz'}));
		assert.equal(account().run.bag.normaliumz, 1); assert.equal(account().run.phase, 'ready');
		assert(!account().run.battle, 'claiming a system must allow preparation before manually entering battle');
		command('equip', {member: account().run.team[0].id, value: 'normaliumz'});
		assert.equal(account().run.team[0].set.item, 'normaliumz');
		assert.equal(account().run.floor, 100); command('battle');
		let run = account().run; assert(engine.battleState('expansionqa').systems.player.z);
		engine.settle('expansionqa', run.battle.token, {encounterId: run.battle.encounterId, won: false, team: run.team, bag: run.bag});
		run = account().run; assert(run.gymGiftReceived); assert(run.zUnlocked); assert.equal(run.bag.normaliumz, 0);
		assert.equal(run.phase, 'ready');
	}));
	it('closes a challenged shop after victory or defeat and awards victory stock only once', () => {
		for (const won of [false, true]) campaign(({store, engine, account, command}) => {
			store.change('expansionqa', saved => {
				saved.run.floor = 9; saved.run.phase = 'rest'; saved.run.node = structuredClone(content.floors[9][0]);
				saved.run.blessings.owned.push(owned('shopraid'), owned('rocketcatch'));
			});
			const bag = {...account().run.bag}; command('shopchallenge');
			const run = account().run; assert.equal(run.phase, 'battle'); assert(engine.battleState('expansionqa').npcCapture);
			assert(engine.battleState('expansionqa').catchable);
			const result = {encounterId: run.battle.encounterId, won, team: run.team, bag: run.bag};
			engine.settle('expansionqa', run.battle.token, result);
			const after = account(); assert.equal(after.run.floor, 10);
			for (const [id, count] of Object.entries(run.node.shopChallenge.rewards)) {
				assert.equal(after.run.bag[id] || 0, (bag[id] || 0) + (won ? count : 0));
			}
			engine.settle('expansionqa', run.battle.token, result); assert.deepEqual(account(), after);
			assert.throws(() => command('shopchallenge'));
		});
	});
});
