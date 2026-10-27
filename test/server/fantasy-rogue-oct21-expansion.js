'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {Battle} = require('../../dist/sim/battle');
const {TeamValidator} = require('../../dist/sim/team-validator');
const {Format} = require('../../dist/sim/dex-formats');
const {Dex, toID} = require('../../dist/sim/dex');
const {rogueBattleResult, snapshotRoguePokemon} = require('../../dist/sim/fantasy-rogue');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {createRoguePokemon, initializeExperience, evolveMember} = require('../../dist/server/fantasy-rogue/progression');
const {makeEncounterSet} = require('../../dist/server/fantasy-rogue/encounter-sets');
const {encounterSetProblems} = require('../../dist/server/fantasy-rogue/encounter-legality');
const {partyEvolutions} = require('../../dist/server/fantasy-rogue/party-evolution');
const {evolutionBranch} = require('../../dist/server/fantasy-rogue/evolution-conditions');
const {prepareFloorEnvironment} = require('../../dist/server/fantasy-rogue/floor-environment');
const {normalizeBlessings, syncBlessingParty, handleBlessingCommand, prepareBlessingEncounter, blessingView} = require('../../dist/server/fantasy-rogue/blessings');
const {blessing} = require('../../dist/sim/rogue-blessing-data');
const {petSpecies, dogBoostCount, CAT_ABILITIES, POWER_TRAINING_ITEMS} = require('../../dist/sim/rogue-pets');
const {assignedExtraAbilities} = require('../../dist/sim/rogue-blessing-permanent');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
const {chooseEventOption, eventView} = require('../../dist/server/fantasy-rogue/events');
const {beginJourneyActivity, settleJourneyActivity, activityEligible, SCROLLS} = require('../../dist/server/fantasy-rogue/journey-activities');
const {ACTIVITY_NAMES} = require('../../dist/server/fantasy-rogue/journey-activity-data');
const {rogueCodex} = require('../../dist/server/fantasy-rogue/codex');
const {rewardChoices, chooseReward} = require('../../dist/server/fantasy-rogue/reward-scenes');
const {journeyGrowthAmount, grantJourneyGrowth} = require('../../dist/server/fantasy-rogue/growth');
const {inventoryItem} = require('../../dist/server/fantasy-rogue/team');
const {feedMushroom, mushroomPayoffs} = require('../../dist/server/fantasy-rogue/mushroom-feeding');
const {legalFormMoves} = require('../../dist/server/fantasy-rogue/event-learning');
const {EVOLUTION_HELD_ITEMS} = require('../../dist/server/fantasy-rogue/evolution-supplies');
const {ELITE_BOSS_FLOORS} = require('../../dist/server/fantasy-rogue/content');
const {eliteBossCandidates} = require('../../dist/server/fantasy-rogue/elite-bosses');
const {commandAfterOpening, stats} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue October 21 complete expansion', function () {
	this.timeout(30000);
	let content, battle;
	const dex = Dex.mod('gen9fantasy');
	before(() => { content = createPreviewContent(); });
	afterEach(() => { battle?.destroy(); battle = null; });
	const member = (name, level = 50, id = randomUUID()) => {
		const p = createRoguePokemon(makeEncounterSet(name, level), stats(0), id); initializeExperience(p); return p;
	};
	function run(names = ['Pikachu'], floor = 60) {
		const r = {id: randomUUID(), floor, phase: 'event', team: names.map(n => member(n)), boosts: stats(0), bag: {}, money: 10000,
			caught: [], encounter: 0, node: {id: 'event', kind: 'event', name: '测试', encounters: [], reward: {money: 0, items: {}}}};
		normalizeBlessings(r); return r;
	}
	const account = r => ({run: r, captures: {}, unlocked: [], points: 0});
	function grant(r, id, random = () => 0) {
		r.phase = 'blessing'; r.blessings.round = {floor: r.floor, tier: blessing(id).tier, remaining: 1,
			options: [{id, refreshes: 1}], familiesSeen: []};
		handleBlessingCommand(account(r), r, content, {action: 'blessing', slot: 0}, random); return r;
	}
	function begin(r, foe = makeEncounterSet('Blissey', 100), extra = {}) {
		const state = {encounterId: randomUUID(), team: structuredClone(r.team), boosts: r.boosts, bag: r.bag, balls: [],
			catchable: false, blessings: structuredClone(r.blessings), systems: {player: {mega: true, gmega: true, z: true}}, ...extra};
		battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: {team: r.team.map(m => m.set)}, p2: {team: [foe]}});
		battle.makeChoices('team ' + r.team.map((_, i) => i + 1).join(''), 'team 1'); return battle.p1.active[0];
	}
	function event(r, id) {
		r.phase = 'event'; r.node = {id, kind: 'event', name: ACTIVITY_NAMES[id], encounters: [], reward: {money: 0, items: {}},
			event: {id, key: randomUUID(), stage: 'choice'}};
		beginJourneyActivity(r, () => 0);
	}
	function pick(r, value, random = () => 0) { chooseEventOption(account(r), r, content, random, r.node.event.key, value); }
	const choice = (p, name, context = {}) => partyEvolutions(p, {floor: 60, bag: {}, team: [p], ...context}).find(e => toID(e.species) === toID(name));

	it('marks modified originals, preserves IDs and ordinary formats, and includes every marked effect in the codex', () => {
		assert.equal(dex.abilities.get('cutecharm').name, 'Cute Charm+');
		assert.equal(dex.abilities.get('shellarmor').name, 'Shell Armor+');
		assert.equal(dex.moves.get('recover').name, 'Recover+');
		assert.equal(dex.moves.get('spark').name, 'Spark🔄');
		assert.equal(dex.moves.get('powdersnow').name, 'Powder Snow🔄');
		assert.equal(Dex.mod('gen9').abilities.get('cutecharm').name, 'Cute Charm');
		assert.equal(Dex.mod('gen9').moves.get('recover').name, 'Recover');
		const validator = new TeamValidator(new Format({...Dex.formats.get('gen9nationaldex'), name: 'Fantasy labels', mod: 'gen9fantasy'}));
		const legal = makeEncounterSet('Clefable', 100); legal.ability = 'Cute Charm'; legal.moves = ['moonblast']; legal.evs.hp = 1;
		assert.equal(validator.validateTeam([legal]), null);
		assert(validator.validateTeam([{...legal, ability: 'Rock Head'}])?.length);
		for (const species of dex.species.all().filter(s => s.requiredAbility)) {
			assert.equal(species.requiredAbility, dex.abilities.get(species.requiredAbility).name, species.name);
		}
		const g = rogueCodex(undefined, 'guide', true).guide;
		for (const [key, collection] of [['moves', dex.moves.all()], ['abilities', dex.abilities.all()]]) {
			for (const effect of collection.filter(e => /[+🔄]$/u.test(e.name))) {
				assert(g.modules[key].some(e => e.id === effect.id && e.name === effect.name), effect.name);
			}
		}
		assert(!g.modules.biomes); assert(g.beginner.some(p => p.text.includes('固定首领 +20／+40')));
	});
	it('has working codex entries for every activity, the catch-up reward, ecology, and all three new blessings', () => {
		const rows = rogueCodex(undefined, 'events', true).entries;
		for (const id of Object.keys(ACTIVITY_NAMES)) assert(rows.some(e => e.id === id && e.replay?.pages.start.text.length >= 3), id);
		assert.equal(rows[0].category, 'ecology'); assert.equal(rows.filter(e => e.category === 'ecology').length, 14);
		assert(rows.find(e => e.id === 'reward:catchup').text.includes('落后'));
		const blessings = rogueCodex(undefined, 'blessings', true).entries;
		for (const id of ['dogs', 'cats', 'weighttraining']) assert(blessings.some(e => e.id === id), id);
		assert(blessings.find(e => e.id === 'companionlacey').text.includes('致以，「无瑕之人」'));
	});
	it('covers catchable alternate and Fantasy forms with original-family unlocks', () => {
		for (const s of dex.species.all().filter(s => s.num > 0 && !s.battleOnly && !s.isMega && !s.isNonstandard)) {
			assert(content.unlocks[s.id], s.name);
			const starter = content.starters.find(p => p.id === content.unlocks[s.id].starter);
			assert(starter && !starter.set.species.endsWith('-Totem') && !starter.set.species.includes('-Fantasy'), s.name);
		}
		assert.equal(content.unlocks.togedemarutotem.starter, 'togedemaru');
		assert.equal(content.unlocks.raticatealolatotem.starter, 'rattataalola');
		assert.equal(content.unlocks.swampertfantasy.starter, 'mudkip');
		for (const level of [5, 100]) {
			const giant = makeEncounterSet('Pumpkaboo-Super', level);
			assert(giant.moves.length); assert.deepEqual(encounterSetProblems(giant), []);
		}
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, content, () => 0), user = 'formcaptureqa';
			commandAfterOpening(engine, user, {id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur']});
			for (const species of ['Togedemaru-Totem', 'Swampert-Fantasy']) {
				store.change(user, a => { a.run.phase = 'ready'; a.run.node = {id: 'tera-' + toID(species), kind: 'trainer', name: '太晶个人战',
					encounters: [{name: '太晶宝可梦', team: [makeEncounterSet(species, 35)], style: 'balanced', catchable: true}], reward: {money: 0, items: {}}}; a.run.encounter = 0; });
				engine.command(user, {id: randomUUID(), revision: store.get(user).revision, action: 'battle'});
				const ticket = store.get(user).run.battle, captured = member(species, 35, ticket.encounterId + ':foe:0');
				engine.capture(user, ticket.token, captured); engine.capture(user, ticket.token, captured);
				assert.equal(store.get(user).captures[content.unlocks[toID(species)].starter], 1, species);
			}
		} finally {store.close();}
	});
	for (const [parent, next, move] of [['Lickitung', 'Lickilicky', 'rollout'], ['Tangela', 'Tangrowth', 'ancientpower'],
		['Aipom', 'Ambipom', 'doublehit'], ['Yanma', 'Yanmega', 'ancientpower'], ['Girafarig', 'Farigiraf', 'twinbeam'],
		['Dunsparce', 'Dudunsparce', 'hyperdrill'], ['Piloswine', 'Mamoswine', 'ancientpower'], ['Bonsly', 'Sudowoodo', 'mimic'],
		['Mime Jr.', 'Mr. Mime', 'mimic'], ['Steenee', 'Tsareena', 'stomp'], ['Poipole', 'Naganadel', 'dragonpulse'],
		['Clobbopus', 'Grapploct', 'taunt'], ['Dipplin', 'Hydrapple', 'dragoncheer']]) {
		it(`requires learned ${move} for ${next}, including remembered moves`, () => {
			const p = member(parent, 100, 'regular-branch'); p.evolutionProgress = {branch: 50}; p.set.moves = []; p.moveMemory = [];
			assert(!choice(p, next).ready); p.moveMemory = [{id: move, pp: 1, maxpp: 1}]; assert(choice(p, next).ready);
		});
	}
	it('checks team requirements, Tyrogue stats, tower day/night, postcard region and rain', () => {
		const m = member('Mantyke'); assert(!choice(m, 'Mantine').ready);
		assert(choice(m, 'Mantine', {team: [m, member('Remoraid')]}).ready);
		const p = member('Pancham'); assert(!choice(p, 'Pangoro').ready);
		assert(choice(p, 'Pangoro', {team: [p, member('Poochyena')]}).ready);
		const darkPartner = member('Pikachu'); darkPartner.statModifiers = {extraType: 'Dark'};
		assert(choice(p, 'Pangoro', {team: [p, darkPartner]}).ready);
		const t = member('Tyrogue');
		for (const [atk, def, next] of [[30, 20, 'Hitmonlee'], [20, 30, 'Hitmonchan'], [30, 30, 'Hitmontop']]) {
			t.stats.atk = atk; t.stats.def = def; assert.deepEqual(partyEvolutions(t).filter(e => e.ready).map(e => e.species), [next]);
		}
		const s = member('Sliggoo'); assert(!choice(s, 'Goodra').ready);
		assert(choice(s, 'Goodra', {environment: {floor: 60, weather: 'raindance', name: '下雨'}}).ready);
		const pikachu = member('Pikachu'); assert(!choice(pikachu, 'Raichu-Alola', {bag: {thunderstone: 1}}).ready);
		pikachu.evolutionProgress = {scenes: ['region:alola']}; assert(choice(pikachu, 'Raichu-Alola', {bag: {thunderstone: 1}}).ready);
		const rock = member('Rockruff-Dusk', 25);
		assert(!choice(rock, 'Lycanroc-Dusk', {floor: 1}).ready); assert(choice(rock, 'Lycanroc-Dusk', {floor: 3}).ready);
	});
	it('keeps random branches stable, honors Toxel nature and checks each progress threshold', () => {
		for (const name of ['Wurmple', 'Dunsparce']) {
			const p = member(name, 100); const before = JSON.stringify(p);
			assert.equal(partyEvolutions(p).length, 1); assert.equal(evolutionBranch(p), evolutionBranch(structuredClone(p)));
			assert.equal(JSON.stringify(p), before);
		}
		const toxel = member('Toxel', 30); toxel.set.nature = 'Modest'; assert.equal(partyEvolutions(toxel)[0].species, 'Toxtricity-Low-Key');
		for (const [parent, next, key, amount] of [['Pawmo', 'Pawmot', 'followed', 15], ['Bramblin', 'Brambleghast', 'followed', 15],
			['Rellor', 'Rabsca', 'followed', 15], ['Farfetch’d-Galar', 'Sirfetch’d', 'criticals', 3], ['Basculin-White-Striped', 'Basculegion', 'recoil', 294]]) {
			const p = member(parent); p.set.gender = 'M'; p.evolutionProgress = {[key]: amount - 1};
			assert(!choice(p, next).ready); p.evolutionProgress[key]++; assert(choice(p, next).ready, next);
		}
		for (const [parent, next, move] of [['Primeape', 'Annihilape', 'ragefist'], ['Stantler', 'Wyrdeer', 'psyshieldbash'], ['Qwilfish-Hisui', 'Overqwil', 'barbbarrage']]) {
			const p = member(parent); p.evolutionProgress = {moves: {[move]: 19}}; assert(!choice(p, next).ready);
			p.evolutionProgress.moves[move]++; assert(choice(p, next).ready);
		}
	});
	it('creates Shedinja only alongside Ninjask, with an empty slot and an ordinary Poké Ball', () => {
		for (const [size, balls, extra] of [[1, 1, true], [6, 1, false], [1, 0, false]]) {
			const r = run(Array(size).fill('Nincada')), p = r.team[0]; r.bag = {pokeball: balls};
			assert(!partyEvolutions(p, r).some(e => e.species === 'Shedinja'));
			evolveMember(r, p, 'Ninjask'); const shells = r.team.filter(m => m.set.species === 'Shedinja');
			assert.equal(shells.length, Number(extra)); assert.equal(r.bag.pokeball, balls - Number(extra));
			if (extra) { assert.equal(shells[0].maxhp, 1); assert.equal(shells[0].set.gender, 'N'); assert.deepEqual(encounterSetProblems(shells[0].set), []); }
		}
	});
	it('uses modern evolution stones and offers every missing held evolution supply and correct six Power icons', () => {
		for (const [parent, next, item] of [['Nosepass', 'Probopass', 'thunderstone'], ['Charjabug', 'Vikavolt', 'thunderstone'], ['Crabrawler', 'Crabominable', 'icestone']]) {
			const p = member(parent, 5); assert(choice(p, next, {bag: {[item]: 1}}).ready);
		}
		for (const [name] of EVOLUTION_HELD_ITEMS) {
			const item = inventoryItem(content, toID(name)); assert.equal(item.category, '进化道具'); assert.equal(item.kind, 'held');
			assert(dex.items.get(name).spritenum > 0, name);
		}
		for (const id of POWER_TRAINING_ITEMS) assert(dex.items.get(inventoryItem(content, id).icon).spritenum > 0, id);
	});
	it('saves one per-floor weather/terrain roll independently of ecology and never rerolls on restore', () => {
		const r = run(); let calls = 0; const random = () => {calls++; return 0;};
		prepareFloorEnvironment(r, random); assert.equal(r.environment.weather, 'raindance'); assert.equal(r.environment.terrain, 'electricterrain');
		const copy = structuredClone(r); prepareFloorEnvironment(copy, () => {throw Error('reroll');}); assert.deepEqual(copy.environment, r.environment);
		assert.equal(calls, 4); r.floor++; prepareFloorEnvironment(r, () => 99); assert(!r.environment.weather && !r.environment.terrain);
	});
	it('delays passive growth to 40, catches up by 80 and cushions the 81–100 band without replacing normal rewards', () => {
		for (const floor of [1, 21, 39, 40, 80, 81, 100, 101, 149, 150, 199]) {
			const r = run(['Pikachu'], floor); r.node.event = {settled: true}; const before = {money: r.money, bag: {...r.bag}};
			grantJourneyGrowth(r, () => 0); assert.equal(r.growth?.offense || 0, journeyGrowthAmount(floor));
			assert.equal(r.money, before.money); assert.deepEqual(r.bag, before.bag);
			const snapshot = structuredClone(r); grantJourneyGrowth(r, () => 0); assert.deepEqual(r, snapshot);
			r.node.rewardScene = {id: 'chest'}; assert.equal(rewardChoices(r).some(e => e.id === 'offense'), floor >= 40);
		}
		assert(Math.abs(41 * journeyGrowthAmount(80) / (60 * 75) - 1) < .1);
		assert(journeyGrowthAmount(81) > journeyGrowthAmount(80)); assert(journeyGrowthAmount(101) > 75);
	});
	it('trains every lagging member of a collectively underlevelled party and retains ordinary supplies and level-up confirmations', () => {
		const r = run(['Bulbasaur', 'Charmander', 'Squirtle', 'Caterpie'], 90);
		r.team = ['Bulbasaur', 'Charmander', 'Squirtle', 'Caterpie'].map((n, i) => member(n, [30, 5, 8, 20][i]));
		r.phase = 'reward'; r.node.kind = 'reward'; r.node.rewardScene = {id: 'catchup', key: 'catchup'};
		chooseReward(r, content, () => 0, 'catchup'); assert.deepEqual(r.team.map(p => p.set.level), [35, 10, 13, 25]);
		assert(r.node.reward.money > 0 && r.node.reward.items.revive > 0); assert(r.pendingMoves?.length);
		assert.throws(() => chooseReward(r, content, () => 0, 'catchup')); assert.deepEqual(r.team.map(p => p.set.level), [35, 10, 13, 25]);
	});
	it('provides family-appropriate gifts and six Power items, with much rarer major legends', () => {
		for (const [id, rolls, expected] of [['dogs', 0, undefined], ['dogs', 9900, 'Okidogi'], ['dogs', 9990, undefined], ['cats', 0, undefined]]) {
			let first = true; const r = run(['Pikachu'], 1);
			grant(r, id, n => {if (first && n === 10000) {first = false; return rolls;} return 0;});
			const pet = r.blessings.pending.find(p => p.kind === 'gift').pokemon;
			assert(petSpecies(pet.set.species, id), pet.set.species); if (expected) assert.equal(pet.set.species, expected);
			if (rolls === 9990) assert(['Zacian', 'Zamazenta', 'Zygarde-10%'].includes(pet.set.species));
			if (id === 'cats') for (const item of ['toxicorb', 'flameorb', 'lightball']) assert.equal(r.bag[item], 1);
		}
		const r = grant(run(), 'weighttraining'); for (const id of POWER_TRAINING_ITEMS) assert.equal(r.bag[id], 1);
		r.team[0].set.evs.atk = 252; syncBlessingParty(r); assert(!r.bag.fantasypowerlens);
		Object.assign(r.team[0].set.evs, {spe: 252, hp: 6}); syncBlessingParty(r); syncBlessingParty(r); assert.equal(r.bag.fantasypowerlens, 1);
	});
	it('keeps both cat extras distinct from the native ability, including after an ability change', () => {
		const r = run(['Skitty']); r.phase = 'choose'; r.blessings.owned = [{...blessing('cats'), floor: 1}];
		const p = r.team[0]; p.set.ability = 'Cute Charm+'; syncBlessingParty(r);
		assert.deepEqual(r.blessings.catAbilities[p.id], ['poisonheal', 'woju']);
		assert(!blessingView(r).cats[0].groups[1].some(a => a.id === 'cutecharm'));
		assert.throws(() => handleBlessingCommand(account(r), r, content, {action: 'catability', member: p.id, value: '1:cutecharm'}, () => 0), /原生/);
		p.set.ability = 'Poison Heal'; syncBlessingParty(r); assert.equal(r.blessings.catAbilities[p.id][0], 'dianliao');
	});
	it('counts canine species rather than nicknames or duplicate forms and gives distinct native entry boosts', () => {
		assert(!petSpecies('Rowlet', 'cats')); assert(!petSpecies('Pancham', 'cats')); assert(petSpecies('Zangoose', 'cats'));
		assert(!petSpecies('Landorus', 'cats')); assert(petSpecies('Landorus-Therian', 'cats')); assert(petSpecies('Zeraora-Mega', 'cats'));
		assert(petSpecies('Zygarde-10%', 'dogs')); assert(!petSpecies('Zygarde', 'dogs')); assert(petSpecies('Mewtwo', 'cats'));
		const r = run(['Growlithe', 'Growlithe-Hisui', 'Eevee', 'Riolu', 'Rockruff', 'Houndour']);
		r.blessings.owned = [{...blessing('dogs'), floor: 1}]; syncBlessingParty(r); assert.equal(dogBoostCount(r.team), 4);
		const mon = begin(r); const raised = ['atk', 'def', 'spa', 'spd', 'spe'].filter(s => mon.boosts[s] === 1);
		assert.equal(raised.length, 4); assert.equal(blessingView(r).dogBoosts, 4);
	});
	it('lets each cat choose both extra ability groups, preserves them through Mega and forbids in-battle editing', () => {
		const r = grant(run(['Meowstic-F', 'Zangoose']), 'cats'); r.blessings.pending = []; r.phase = 'ready';
		const p = r.team[0]; p.set.item = 'Meowsticite';
		for (const [group, id] of [[0, 'quickfeet'], [1, 'woju']]) handleBlessingCommand(account(r), r, content,
			{action: 'catability', member: p.id, value: group + ':' + id}, () => 0);
		assert.deepEqual(assignedExtraAbilities(p, r.team, r.blessings).filter(a => ['quickfeet', 'woju'].includes(a)), ['quickfeet', 'woju']);
		assert(assignedExtraAbilities(r.team[1], r.team, r.blessings).includes('poisonheal'));
		assert.throws(() => handleBlessingCommand(account(r), r, content, {action: 'catability', member: p.id, value: '0:hugepower'}, () => 0));
		const mon = begin(r); mon.formeChange('Meowstic-F-Mega', battle.dex.items.get('meowsticite'), true);
		assert(mon.hasAbility('quickfeet') && mon.hasAbility('woju'));
		r.phase = 'battle'; assert.throws(() => handleBlessingCommand(account(r), r, content,
			{action: 'catability', member: p.id, value: '0:poisonheal'}, () => 0));
		assert.equal(CAT_ABILITIES[0].length, 6); assert.equal(CAT_ABILITIES[1].length, 3);
	});
	it('uses Magic Guard and Steel Beam in both Slowbro preparation and Mega pools and Shell Armor+ for Galar Mega', () => {
		for (const form of ['Slowbro-Fantasy', 'Slowbro-Mega-Fantasy']) {
			assert(legalFormMoves(form).includes('steelbeam')); assert(!legalFormMoves(form).includes('flashcannon'));
		}
		assert.equal(dex.species.get('Slowbro-Mega-Fantasy').abilities[0], 'Magic Guard');
		assert.equal(dex.species.get('Slowbro-Galar-Mega-Fantasy').abilities[0], 'Shell Armor+');
		const r = run(['Slowbro-Fantasy']); const mon = begin(r); mon.formeChange('Slowbro-Mega-Fantasy', battle.dex.items.get('slowbronite'), true);
		assert(mon.hasAbility('magicguard')); const hp = mon.hp; battle.damage(20, mon, mon, battle.dex.conditions.get('brn')); assert.equal(mon.hp, hp);
	});
	it('keeps actual action counts through retreat and resets accumulated damage at a faint even after revival', () => {
		const r = run(['Primeape']); r.team[0].set.moves = ['ragefist']; r.team[0].pp = [{id: 'ragefist', pp: 10, maxpp: 10}];
		r.team[0].evolutionProgress = {recoil: 250, lostHP: 60};
		const mon = begin(r); battle.makeChoices('move 1', 'default');
		assert.equal(snapshotRoguePokemon(mon, r.team[0]).evolutionProgress.moves.ragefist, 1);
		battle.damage(10, mon, mon, battle.dex.conditions.get('recoil'));
		mon.faint(); battle.faintMessages(); mon.fainted = false; mon.hp = 20;
		const saved = snapshotRoguePokemon(mon, r.team[0]); assert.equal(saved.evolutionProgress.recoil, 0); assert.equal(saved.evolutionProgress.lostHP, 0);
	});
	it('gives the first mushroom package and previews exactly what feeding the current stock will add', () => {
		const r = grant(run(['Paras'], 1), 'mushroomsynthesis'); r.blessings.pending = []; r.phase = 'ready';
		assert.equal(r.bag.tinymushroom, 5); assert.equal(r.bag.bigmushroom, 2); assert.equal(r.bag.balmmushroom, 1);
		const p = r.team[0], preview = mushroomPayoffs(r)[0], before = JSON.stringify(r);
		assert(preview.offense > 0 && preview.defense > 0); assert.equal(JSON.stringify(r), before);
		for (const id of ['tinymushroom', 'bigmushroom', 'balmmushroom']) feedMushroom(r, p.id, id, r.bag[id]);
		assert(Math.abs(p.mushroomTraining.offense - preview.offense) < 1e-8);
		assert(Math.abs(p.mushroomTraining.defense - preview.defense) < 1e-8);
	});
	it('can trigger low-HP boosts again after healing above the threshold, without repeated updates farming boosts', () => {
		const r = run(['Bulbasaur']); r.blessings.owned = [{...blessing('lowhp'), floor: 1}];
		const mon = begin(r);
		for (let i = 1; i <= 3; i++) {
			battle.damage(mon.hp - 1, mon, mon, battle.format); battle.eachEvent('Update'); battle.eachEvent('Update');
			assert.equal(mon.boosts.atk, i); assert.equal(mon.boosts.spa, i);
			battle.heal(mon.maxhp, mon, mon, battle.format); battle.eachEvent('Update');
		}
	});
	it('keeps escorts in order when an attacking pivot and a forced-switch move are used', () => {
		const r = run(['Arcanine']); r.team[0].set.moves = ['roar']; r.team[0].pp = [{id: 'roar', pp: 20, maxpp: 20}];
		const foe = makeEncounterSet('Pikachu', 35); foe.moves = ['voltswitch'];
		const state = {encounterId: 'escort-order', team: r.team, boosts: r.boosts, bag: {}, balls: [], catchable: false, wild: true, escortCount: 2, tera: {player: false, opponent: true}};
		battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: {team: r.team.map(p => p.set)}, p2: {team: [foe, makeEncounterSet('Elekid', 35), makeEncounterSet('Raichu', 35)]}});
		battle.makeChoices('team 1', 'team 123'); const first = battle.p2.active[0]; battle.makeChoices('move roar', 'move voltswitch');
		assert.equal(battle.p2.active[0], first); assert.equal(battle.p2.requestState, 'move'); assert(first.trapped);
		assert.equal(battle.p2.pokemon[0].canTerastallize, null); assert(battle.p2.pokemon[2].canTerastallize);
	});
	for (const floor of ELITE_BOSS_FLOORS) it(`uses ordinary elite offsets for both escorts and fixed-boss offsets for the boss at ${floor}`, () => {
		for (const boss of eliteBossCandidates(floor)) {
			const r = run(['Pikachu'], floor); r.blessings.levels = 7; r.blessings.bossLevels = 19;
			r.node = {kind: 'boss', encounters: [{team: [structuredClone(boss)]}]}; prepareBlessingEncounter(r, () => 0);
			const e = r.node.encounters[0]; assert.equal(e.escortCount, 2); assert.equal(e.team.length, 3);
			for (const escort of e.team.slice(0, 2)) {
				assert.equal(escort.level, Math.min(100, Math.ceil(floor / 2) + 5) + 7);
				assert(dex.species.get(escort.species).types.includes(dex.species.get(boss.species).types[0]));
				assert.deepEqual(encounterSetProblems(escort), []);
			}
			assert.equal(e.team[2].level, boss.level + 19); const copy = structuredClone(r.node); prepareBlessingEncounter(r, () => 0); assert.deepEqual(r.node, copy);
		}
	});
	it('gates each evolution scene above level 30 and keeps each actual interaction and resource cost', () => {
		for (const [id, parent, next, response] of [['stonegate', 'Yamask-Galar', 'Runerigus', 'cross'], ['invertedstars', 'Inkay', 'Malamar', 'turn'],
			['peatmoon', 'Ursaring', 'Ursaluna', 'ceremony'], ['unioncircle', 'Finizen', 'Palafin', 'circle']]) {
			const r = run([parent], 4), p = r.team[0]; p.set.level = 30; assert(!activityEligible(r, id)); p.set.level = 50; assert(activityEligible(r, id));
			r.bag.peatblock = 1; event(r, id); pick(r, 'member:' + encodeURIComponent(p.id)); pick(r, response);
			assert(r.node.event.settled); assert(choice(p, next, {floor: 4}).ready); if (id === 'peatmoon') assert.equal(r.bag.peatblock, 0);
			assert.throws(() => pick(r, response));
		}
	});
	it('scores rhythm taps once per beat, honors failure, and restores ongoing games without rerolling', () => {
		const r = run(['Milcery']); event(r, 'sweetdance'); pick(r, 'member:' + encodeURIComponent(r.team[0].id)); r.bag.strawberrysweet = 1;
		const realNow = Date.now; let now = 100000; Date.now = () => now;
		try {
			pick(r, 'ceremony'); assert.equal(r.bag.strawberrysweet, 0); const started = r.node.event.activity.startedAt;
			for (let beat = 0; beat < 3; beat++) { now = started + beat * 800 + 350; pick(r, 'tap'); pick(r, 'tap'); }
			assert.equal(r.node.event.activity.score, 3); const restored = structuredClone(r); assert.deepEqual(eventView(restored).activity, eventView(r).activity);
			pick(r, 'finish'); assert(choice(r.team[0], 'Alcremie').ready);
			const fail = run(['Milcery']); event(fail, 'sweetdance'); fail.bag.strawberrysweet = 1; pick(fail, 'member:' + encodeURIComponent(fail.team[0].id)); pick(fail, 'ceremony'); pick(fail, 'finish');
			assert(!choice(fail.team[0], 'Alcremie').ready); assert.equal(fail.bag.strawberrysweet, 0);
		} finally { Date.now = realNow; }
	});
	it('makes safari choices consume the finite event balls while leaving the real bag alone', () => {
		const r = run(); r.bag.pokeball = 9; event(r, 'safaripark');
		for (let n = 0; n < 3; n++) pick(r, 'ball', () => 99);
		assert(r.node.event.settled); assert.equal(r.node.event.activity.balls, 0); assert.equal(r.bag.pokeball, 9);
		const success = run(); event(success, 'safaripark'); pick(success, 'bait'); pick(success, 'ball');
		assert.equal(success.blessings.pending.filter(p => p.kind === 'gift').length, 1); assert(success.node.event.settled);
	});
	it('completes the classic noncombat activities through real options and keeps contest style and material choices meaningful', () => {
		const poffin = run(); event(poffin, 'poffinworkshop'); pick(poffin, 'berry:0'); assert.throws(() => pick(poffin, 'berry:0'));
		pick(poffin, 'berry:1'); pick(poffin, 'finish'); assert(poffin.node.event.settled && poffin.bag.oranberry);
		const ruin = run(); ruin.team[0].set.moves = ['growl']; event(ruin, 'relicpuzzle');
		for (let i = 0; i < 3; i++) pick(ruin, 'help'); assert(ruin.node.event.settled && ruin.bag.ether);
		const flute = run(); event(flute, 'pokeflute'); pick(flute, 'listen'); for (let i = 0; i < 3; i++) pick(flute, 'note:0');
		pick(flute, 'thanks'); assert(flute.node.event.settled && flute.bag.ether);
		const ditto = run(); event(ditto, 'dittoshow'); pick(ditto, 'identify:0'); assert(ditto.node.event.settled);
		const contest = run(); contest.team[0].set.moves = ['thundershock']; event(contest, 'minicontest');
		pick(contest, 'member:' + encodeURIComponent(contest.team[0].id)); pick(contest, 'style:clever'); pick(contest, 'perform:thundershock');
		assert.equal(contest.node.event.activity.score, 2); pick(contest, 'finish'); assert(!contest.node.event.settled);
		pick(contest, 'prize:geniusfeather'); assert.equal(contest.bag.geniusfeather, 2); assert(contest.node.event.settled);
		assert.throws(() => pick(contest, 'prize:geniusfeather'));
	});
	it('gates the two old masters, gives the correct special partners once and keeps subway fights continuous', () => {
		const breeder = run(); event(breeder, 'duskbreeder'); pick(breeder, 'accept');
		settleJourneyActivity(account(breeder), breeder, content, () => 0, true, false);
		const rock = breeder.blessings.pending.find(p => p.kind === 'gift').pokemon;
		assert.equal(rock.set.species, 'Rockruff-Dusk'); assert.equal(toID(rock.set.ability), 'owntempo'); assert(!activityEligible(breeder, 'duskbreeder'));
		assert(!activityEligible(run(['Pikachu'], 50), 'kubfumaster')); const master = run(['Pikachu'], 51);
		event(master, 'kubfumaster'); pick(master, 'accept'); settleJourneyActivity(account(master), master, content, () => 0, true, false);
		assert.equal(master.blessings.pending.find(p => p.kind === 'gift').pokemon.set.species, 'Kubfu');
		const metro = run(); event(metro, 'battlemetro'); pick(metro, 'accept'); assert(metro.node.noHealing);
		assert.equal(metro.node.encounters.length, 3);
		settleJourneyActivity(account(metro), metro, content, () => 0, true, false); assert(!metro.node.event.settled);
		metro.encounter = 2; settleJourneyActivity(account(metro), metro, content, () => 0, true, false);
		assert(metro.node.event.settled && !metro.node.noHealing); assert(Object.keys(metro.bag).some(k => k.startsWith('roguetm')));
	});
	for (const [key, [title, type, target]] of Object.entries(SCROLLS)) it(`enforces an independent Kubfu trial and typed fixed-level guards for ${title}`, () => {
		const r = run(['Kubfu', 'Pikachu'], 170); r.blessings.levels = 55; r.blessings.bossLevels = 90;
		event(r, 'kubfuscroll'); pick(r, 'member:' + encodeURIComponent(r.team[0].id)); pick(r, 'scroll:' + key);
		prepareBlessingEncounter(r, () => 0); const e = r.node.encounters[0];
		assert.equal(e.team.length, 3); assert(e.fixedLevels); assert(r.node.noHealing); assert.equal(r.node.event.activity.target, target);
		for (const s of e.team) { assert(s.level >= 35 && s.level <= 40); assert(dex.species.get(s.species).types.includes(type)); assert.deepEqual(encounterSetProblems(s), []); }
		settleJourneyActivity(account(r), r, content, () => 0, true, false);
		assert.equal(r.team[0].set.species, target); assert.deepEqual(encounterSetProblems(r.team[0].set), []);
	});
	for (const [item, stat] of [['powerlens', 'spa'], ['powerbracer', 'atk'], ['poweranklet', 'spe'], ['powerbelt', 'def'], ['powerweight', 'hp'], ['powerband', 'spd']]) {
		it(`settles the real ${item} battle EV bonus separately from normal yields`, () => {
			const store = new RogueStore(':memory:');
			try {
				const engine = new RogueEngine(store, content, () => 0), user = 'power-native';
				const command = (action, fields = {}) => commandAfterOpening(engine, user, {id: randomUUID(), revision: store.get(user).revision, action, ...fields});
				command('start', {starters: ['bulbasaur']}); const p = member('Pikachu', 100); p.set.item = item;
				p.set.moves = ['thunderbolt']; p.pp = [{id: 'thunderbolt', pp: 15, maxpp: 15}];
				store.change(user, a => {a.run.team = [p]; a.run.floor = 45; a.run.phase = 'ready'; a.run.encounter = 0;
					a.run.node = {id: 'power', kind: 'wild', name: '练习', reward: {money: 0, items: {}}, encounters: [{catchable: false, team: [makeEncounterSet('Magikarp', 1)]}]};});
				command('battle'); const before = store.get(user).run, state = engine.battleState(user);
				battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
					p1: {name: user, team: state.team.map(p => p.set)}, p2: {team: before.node.encounters[0].team}});
				battle.makeChoices('team 1', 'team 1'); battle.makeChoices('move 1', 'move 1'); assert(battle.ended);
				engine.settle(user, before.battle.token, rogueBattleResult(battle));
				const after = store.get(user).run.team.find(m => m.id === p.id); assert.equal(after.set.evs[stat], 8 + Number(stat === 'spe'));
				if (stat !== 'spe') assert.equal(after.set.evs.spe, 1);
			} finally { store.close(); }
		});
	}
	it('restricts the real trial battle to one Kubfu, evolves it after a native victory and retains the unplayed party', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, content, () => 0), user = 'scroll-native';
			const command = (action, fields = {}) => commandAfterOpening(engine, user, {id: randomUUID(), revision: store.get(user).revision, action, ...fields});
			command('start', {starters: ['bulbasaur']});
			const kubfu = member('Kubfu', 100); kubfu.set.moves = ['drainpunch']; kubfu.pp = [{id: 'drainpunch', pp: 16, maxpp: 16}];
			const reserve = member('Pikachu', 50); reserve.hp--; reserve.pp[0].pp--;
			store.change(user, a => {a.run.team = [reserve, kubfu]; a.run.floor = 100; event(a.run, 'kubfuscroll');});
			command('event', {member: store.get(user).run.node.event.key, value: 'member:' + kubfu.id});
			command('event', {member: store.get(user).run.node.event.key, value: 'scroll:dark'}); command('battle');
			const before = store.get(user).run, state = engine.battleState(user); assert.deepEqual(state.team.map(p => p.id), [kubfu.id]);
			battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
				p1: {name: user, team: state.team.map(p => p.set)}, p2: {team: before.node.encounters[0].team}});
			battle.makeChoices('team 1', 'team 123');
			for (let n = 0; !battle.ended && n < 30; n++) battle.makeChoices('default', 'default');
			assert(battle.ended && rogueBattleResult(battle).won, battle.log.slice(-12).join('\n'));
			engine.settle(user, before.battle.token, rogueBattleResult(battle)); const after = store.get(user).run;
			assert.equal(after.team.find(p => p.id === kubfu.id).set.species, 'Urshifu');
			const retained = after.team.find(p => p.id === reserve.id); assert.equal(retained.hp, reserve.hp); assert.equal(retained.pp[0].pp, reserve.pp[0].pp);
			assert(!after.node.noHealing); assert(after.node.event.settled);
		} finally { store.close(); }
	});
});
