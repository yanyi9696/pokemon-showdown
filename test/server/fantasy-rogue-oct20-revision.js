'use strict';
const assert = require('assert').strict;
const {Battle, Dex} = require('../../dist/sim');
const {set, stats} = require('../fixtures/fantasy-rogue');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {minimumEvolutionLevel, lowerToEligibleStage} = require('../../dist/server/fantasy-rogue/evolution');
const {randomEncounterAbility} = require('../../dist/server/fantasy-rogue/encounter-sets');
const {abilityItemTarget} = require('../../dist/server/fantasy-rogue/team');
const {giveEgg, hatchEggs, eggView} = require('../../dist/server/fantasy-rogue/eggs');
const {normalizeBlessings} = require('../../dist/server/fantasy-rogue/blessings');
const {availableFossils, expeditionEligible, chooseExpedition, expeditionView} = require('../../dist/server/fantasy-rogue/expedition-events');
const {rivalRoutes, beginRival, settleRival, chooseRival, rivalBlessingAllowed} = require('../../dist/server/fantasy-rogue/rivals');
const {rogueBattleResult} = require('../../dist/sim/fantasy-rogue');
const {blessing} = require('../../dist/sim/rogue-blessing-data');
const {rogueAbilityInfo, roguePowerModifiers, blessingLeave} = require('../../dist/sim/fantasy-rogue-blessings');
const content = createPreviewContent();
function run(floor = 1) {
	const r = {floor, team: [createRoguePokemon(set('Pikachu', 'Static', 20), stats(0))], bag: {}, money: 99999, boosts: stats(0),
		caught: [], phase: 'event', encounter: 0, node: {name: '测试', kind: 'event', reward: {money: 0, items: {}}, encounters: []}};
	normalizeBlessings(r); return r;
}
describe('Fantasy Rogue October 20 regression', () => {
	function nativeBattle(player, foes, state = {}, ids = []) {
		const team = player.map(s => createRoguePokemon(s, stats(0)));
		const battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: {
			encounterId: 'regression', team, boosts: stats(0), bag: {}, balls: [], catchable: false, progression: true,
			blessings: {owned: ids.map(id => ({...blessing(id), floor: 50}))}, ...state,
		}, p1: {name: 'Player', team: team.map(mon => mon.set)}, p2: {name: 'Opponent', team: foes}});
		battle.makeChoices('team 1', 'team 1'); return battle;
	}
	it('enforces every explicitly special evolution at acquisition, including Mantine', () => {
		const dex = Dex.mod('gen9fantasy');
		assert.equal(lowerToEligibleStage('Mantine', 6), 'Mantyke');
		for (const species of dex.species.all()) if (species.prevo && (species.evoType || species.evoItem)) {
			assert(minimumEvolutionLevel(species.name) >= 30, species.name);
			assert.notEqual(lowerToEligibleStage(species.name, 29), species.name);
		}
	});
	it('normal wild abilities never roll hidden, and previews capsule/patch without changing the partner', () => {
		for (let n = 0; n < 100; n++) assert.notEqual(randomEncounterAbility('Bulbasaur', max => n % max), 'Chlorophyll');
		assert.equal(randomEncounterAbility('Bulbasaur', () => 0, true), 'Chlorophyll');
		const mon = createRoguePokemon(set('Scyther', 'Swarm'), stats(0));
		assert.equal(abilityItemTarget(mon, 'abilitycapsule'), 'Technician');
		assert.equal(abilityItemTarget(mon, 'abilitypatch'), 'Steadfast');
		assert.equal(mon.set.ability, 'Swarm'); mon.compound = {};
		assert.equal(abilityItemTarget(mon, 'abilitycapsule'), undefined);
	});
	it('requires complete fossil pairs, not any lone Galar fragment', () => {
		const r = run(); r.bag.fossilizedbird = 1;
		assert(!expeditionEligible(r, 'fossillab'));
		r.bag.fossilizeddrake = 1;
		assert.deepEqual(availableFossils(r)[0], [['fossilizedbird', 'fossilizeddrake'], 'Dracozolt']);
	});
	it('revives one complete fossil pair at the floor level and leaves unmatched pieces untouched', () => {
		const r = run(100), account = {captures: {}, unlocked: []};
		r.bag = {fossilizedbird: 1, fossilizeddrake: 1, fossilizedfish: 1};
		r.node.event = {id: 'fossillab', stage: 'choice', expedition: {}};
		assert.equal(expeditionView(r).options.length, 1);
		chooseExpedition(account, r, content, () => 0, 'restore');
		assert.deepEqual(r.bag, {fossilizedbird: 0, fossilizeddrake: 0, fossilizedfish: 1});
		assert.equal(r.blessings.pending[0].pokemon.set.species, 'Dracozolt');
		assert.equal(r.blessings.pending[0].pokemon.set.level, 50);
	});
	it('uses the fantasy silhouette and forces the dishonest type quiz into a real battle', () => {
		const r = run(100), account = {captures: {}, unlocked: []}, dex = Dex.mod('gen9fantasy');
		r.node.event = {id: 'identityquiz', stage: 'choice', expedition: {}};
		chooseExpedition(account, r, content, () => 0, 'enter');
		const state = r.node.event.expedition, target = dex.species.get(state.target);
		assert(target.name.includes('Fantasy'));
		assert.equal(state.answers.length, 4);
		chooseExpedition(account, r, content, () => 0, 'answer:' + state.answers.indexOf(dex.species.get(target.baseSpecies).name));
		assert.equal(expeditionView(r).options.filter(o => o.id.startsWith('type:')).length, 18);
		for (const type of target.types) chooseExpedition(account, r, content, () => 0, 'type:' + type);
		chooseExpedition(account, r, content, () => 0, 'confirmtypes');
		assert.equal(state.step, 'fight');
		chooseExpedition(account, r, content, () => 0, 'fight');
		assert.equal(r.phase, 'ready'); assert.equal(r.node.encounters[0].team.length, 3);
	});
	it('does not multiply Endeavor or allow a delayed Endeavor to KO after its user faints', () => {
		for (const delayed of [false, true]) {
			const battle = nativeBattle([set('Reuniclus', 'Magic Guard', 50, ['Endeavor', 'Splash'])],
				[set('Blissey', 'Natural Cure', 100, ['Splash'])], {mentorCard: 'attack', mentorTier: 'gym',
					...(delayed ? {spirit: {id: 'dialga', floor: 100}} : {})});
			try {
				battle.p1.active[0].hp = 3;
				battle.makeChoices('move 1', 'move 1');
				if (delayed) { battle.makeChoices('move 2', 'move 1'); battle.makeChoices('move 2', 'move 1'); }
				assert.equal(battle.p2.active[0].hp, 3, battle.log.join('\n'));
			} finally { battle.destroy(); }
		}
		const battle = nativeBattle([set('Reuniclus', 'Magic Guard', 50, ['Endeavor', 'Splash']), set('Blissey', 'Natural Cure', 100, ['Splash'])],
			[set('Blissey', 'Natural Cure', 100, ['Splash'])], {mentorCard: 'attack', spirit: {id: 'dialga', floor: 100}});
		try {
			battle.p1.active[0].hp = 3; battle.makeChoices('move 1', 'move 1');
			battle.p1.active[0].hp = 0; battle.p1.active[0].fainted = true;
			battle.turn += 2;
			require('../../dist/sim/fantasy-rogue-spirits').resolveRogueFutureAttacks(battle);
			assert.equal(battle.p2.active[0].hp, battle.p2.active[0].maxhp);
		} finally { battle.destroy(); }
	});
	it('applies card damage before Focus Sash, and persists consumption unless renewable is owned', () => {
		const battle = nativeBattle([set('Mew', 'Synchronize', 100, ['Hyper Beam'])],
			[{...set('Magikarp', 'Swift Swim', 10, ['Splash']), item: 'Focus Sash'}], {mentorCard: 'attack', mentorTier: 'gym'});
		try { battle.makeChoices('move 1', 'move 1'); assert.equal(battle.p2.active[0].hp, 1); assert.equal(battle.p2.active[0].item, ''); }
		finally { battle.destroy(); }
		for (const renewable of [false, true]) {
			const b = nativeBattle([{...set('Magikarp', 'Swift Swim', 10, ['Splash']), item: 'Focus Sash'}],
				[set('Mew', 'Synchronize', 100, ['Tackle'])], {}, renewable ? ['renewable'] : []);
			try { b.makeChoices('move 1', 'move 1'); assert.equal(b.p1.active[0].hp, 1); assert.equal(rogueBattleResult(b).team[0].set.item, renewable ? 'focussash' : ''); }
			finally { b.destroy(); }
		}
	});
	it('starts a Tera solo battle already Terastallized', () => {
		const battle = nativeBattle([set('Mew', 'Synchronize', 50, ['Splash'])],
			[{...set('Pikachu', 'Static', 30, ['Splash']), teraType: 'Grass'}], {forcedTera: true, tera: {player: false, opponent: true}});
		try { assert.equal(battle.p2.active[0].terastallized, 'Grass'); } finally { battle.destroy(); }
	});
	it('counts repeated faints after revival for type-link power and exposes the assigned ability immediately', () => {
		const entry = require('../../dist/sim/rogue-blessing-data').ROGUE_BLESSINGS.find(b => b.family === 'typelink' && b.type === 'Water');
		const saved = createRoguePokemon(set('Squirtle', 'Torrent', 50, ['Water Gun']), stats(0));
		saved.extraAbilities = ['hugepower'];
		const battle = nativeBattle([saved.set], [set('Mew', 'Synchronize', 100, ['Splash'])], {team: [saved]}, [entry.id]);
		try {
			const mon = battle.p1.active[0], move = battle.dex.moves.get('watergun');
			assert(rogueAbilityInfo(mon).abilities.includes('hugepower'));
			const factor = () => roguePowerModifiers(mon, move).find(m => m.source === entry.name).factor;
			assert.equal(factor(), 1.5);
			blessingLeave(mon, true); assert.equal(factor(), 1.55);
			mon.hp = mon.maxhp; mon.fainted = false;
			blessingLeave(mon, true); assert.equal(factor(), 1.6);
		} finally {battle.destroy();}
	});
	it('includes fainted teammates in battle experience only with insight', () => {
		for (const insight of [false, true]) {
			const battle = nativeBattle([set('Mew', 'Synchronize', 80, ['Dragon Rage']), set('Magikarp', 'Swift Swim', 10, ['Splash'])],
				[set('Magikarp', 'Swift Swim', 1, ['Splash'])], {}, insight ? ['insight'] : []);
			try {
				const reserve = battle.p1.pokemon[1]; reserve.hp = 0; reserve.fainted = true;
				battle.makeChoices('move 1', 'move 1');
				assert.equal(rogueBattleResult(battle).defeated[0].eligible.includes(reserve.set.fantasyRogueId), insight);
			} finally { battle.destroy(); }
		}
	});
	it('persists one egg roll, redacts it, hatches by floors once and records discovery only on hatch', () => {
		const r = run(80), account = {captures: {}, unlocked: []};
		const egg = giveEgg(r, content, () => 0, '测试蛋'); r.team.push(egg);
		assert.equal(eggView(egg, 80).set.species, 'Egg');
		assert.equal(egg.hp, 0); assert.equal(hatchEggs(account, r, content), 0);
		const mushroomEgg = structuredClone(egg); mushroomEgg.id = 'mushroom-egg'; mushroomEgg.set.species = 'Shroomish'; r.team.push(mushroomEgg);
		r.blessings.owned.push({...blessing('mushroomsynthesis'), floor: 80}); r.bag.tinymushroom = 1;
		assert.throws(() => require('../../dist/server/fantasy-rogue/mushroom-feeding').feedMushroom(r, mushroomEgg.id, 'tinymushroom', 1));
		assert.equal(r.bag.tinymushroom, 1); r.team.pop();
		r.floor = 85;
		assert.equal(hatchEggs(account, r, content), 1);
		assert(egg.hp > 0); assert(!egg.egg); assert.equal(hatchEggs(account, r, content), 0);
	});
	it('locks an early rival, preserves other companions, gates late chapters and grants permanent company even after loss', () => {
		const r = run(1), nodes = [{id: 'wild'}];
		assert.equal(rivalRoutes(r, nodes, () => 0)[0].id, 'rival');
		r.floor = 21; assert.equal(rivalRoutes(r, nodes, () => 0)[0].id, 'wild');
		r.floor = 1; beginRival(r, () => 0); assert.equal(r.rival.id, 'kieran');
		r.rival.id = 'marnie';
		assert(rivalBlessingAllowed(r, 'companionband')); // Roxie remains selectable.
		r.rival.id = 'lana'; assert(!rivalBlessingAllowed(r, 'companionlana'));
		settleRival(r, () => 0, false); assert.equal(r.rival.completed, 1); assert.equal(r.rival.affection, 0);
		r.rival.completed = 5; r.floor = 94; assert.equal(rivalRoutes(r, nodes, () => 0)[0].id, 'wild');
		r.floor = 100; assert.equal(rivalRoutes(r, nodes, () => 0)[0].id, 'rival');
			r.floor = 150; r.rival.completed = 7; beginRival(r, () => 0);
			chooseRival(r, content, () => 0, 'greet:honest'); chooseRival(r, content, () => 0, 'greet:honest');
			chooseRival(r, content, () => 0, 'start');
		settleRival(r, () => 0, false); assert(r.rival.permanent); assert.equal(r.rival.completed, 8);
	});
	it('runs actual four-seat doubles, counts both opponents and preserves only the player party', () => {
		const player = createRoguePokemon(set('Snorlax', 'Immunity', 80, ['Dragon Rage']), stats(0));
		const foe = set('Magikarp', 'Swift Swim', 1, ['Splash']);
		const battle = new Battle({formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: {
			cooperative: {opponentOffset: 1}, encounterId: 'coop', team: [player], boosts: stats(0), bag: {}, catchable: false,
			progression: true, opponentStars: [1, 1],
		}, p1: {name: 'Player', team: [player.set]}, p2: {name: 'Foe1', team: [foe]},
		p3: {name: 'Rival', team: [set('Snorlax', 'Immunity', 80, ['Dragon Rage'])]}, p4: {name: 'Foe2', team: [foe]}});
		try {
			for (const side of ['p1', 'p2', 'p3', 'p4']) battle.choose(side, 'team 1');
			const [ours, enemy, ally, enemy2] = battle.sides.map(side => side.active[0]), move = battle.dex.getActiveMove('tackle');
			battle.fantasyRogue.spirit = {id: 'regigigas', floor: 100};
			assert.equal(battle.runEvent('ModifyDamage', ours, enemy2, move, 100), 200);
			assert.equal(battle.runEvent('ModifyDamage', enemy2, ours, move, 100), 50);
			assert.equal(battle.runEvent('ModifyDamage', enemy, ally, move, 100), 100);
			assert.equal(battle.runEvent('ModifyDamage', ours, ally, move, 100), 100);
			delete battle.fantasyRogue.spirit;
			battle.choose('p1', 'move 1 1'); battle.choose('p2', 'move 1'); battle.choose('p3', 'move 1 2'); battle.choose('p4', 'move 1');
			assert(battle.ended, battle.log.join('\n'));
			const result = rogueBattleResult(battle);
			assert(result.won); assert.equal(result.team.length, 1); assert.equal(result.defeated.length, 2);
			assert(result.defeated.every(d => d.eligible.includes(player.id)));
		} finally { battle.destroy(); }
	});
	it('settles all eight rival chapters through saved commands, supports reconnect and rejects duplicate payouts', () => {
		const {randomUUID} = require('crypto');
		const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
		const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
		const {storyView} = require('../../dist/server/fantasy-rogue/story');
		const {eventView} = require('../../dist/server/fantasy-rogue/events');
		const config = require('../fixtures/fantasy-rogue').content(), store = new RogueStore(':memory:');
		let engine = new RogueEngine(store, config, () => 0);
		const account = () => store.get('rivaljourney'), current = () => account().run;
		const cmd = (action, extra = {}) => engine.command('rivaljourney', {id: randomUUID(), revision: account().revision, action, ...extra});
		const option = value => cmd('event', {member: current().node.event.key, value});
		try {
			cmd('start', {starters: ['bulbasaur']});
			config.story = true; config.events = true;
			for (const [i, floor] of [1, 12, 23, 34, 45, 100, 120, 150].entries()) {
				store.change('rivaljourney', a => {
					const r = a.run; r.floor = floor; r.phase = 'choose'; r.encounter = 0;
					r.choices = [{id: 'rival', name: '旅途中的相遇', kind: 'adventure', encounters: [], reward: {money: 0, items: {}}}];
				});
				cmd('select', {value: 'rival'});
				let steps = 0;
				while ((current().node.event.stage !== 'result' || current().phase === 'story') && steps++ < 50) {
					const r = current();
					if (r.phase === 'story') {
						const key = storyView(account(), true, false).key;
						engine = new RogueEngine(store, config, () => 0); engine.migrate('rivaljourney');
						assert.equal(storyView(account(), true, false).key, key);
						cmd('storyskip', {value: key});
					} else if (r.phase === 'event') {
						const choices = eventView(r).options;
						option(choices.find(o => o.id === 'warm' || o.id === 'shards' || o.id === 'join')?.id || choices[0].id);
					} else if (r.phase === 'ready') cmd('battle');
					else if (r.phase === 'battle') {
						const team = structuredClone(engine.battleState('rivaljourney').team), won = i !== 7;
						if (!won) for (const mon of team) { mon.hp = 0; mon.status = 'psn'; }
						const result = {encounterId: r.battle.encounterId, team, bag: r.bag, won};
						engine.settle('rivaljourney', r.battle.token, result);
						const paid = JSON.stringify(current());
						engine.settle('rivaljourney', r.battle.token, result);
						assert.equal(JSON.stringify(current()), paid);
					} else throw new Error(`Unexpected chapter ${i + 1} phase ${r.phase}: ${JSON.stringify({pending: r.pendingMoves, capture: r.pendingCapture, resume: r.dialogue?.resume, stage: r.node.event.stage})}`);
				}
				assert(steps < 50, `Chapter ${i + 1} stalled`);
				assert.equal(current().rival.completed, i + 1);
				if (i === 3) assert(current().rival.temporaryUsed); // The earlier invitation consumes this run's one temporary visit.
			}
			assert(current().rival.permanent);
			assert.equal(current().team[0].hp, current().team[0].maxhp);
			assert(!current().team[0].status);
			assert.equal(current().eventHistory.filter(e => e.id.startsWith('rival:')).length, 8);
			const saved = structuredClone(current()), archive = {};
			saved.owner = {id: 'rivaljourney', name: '旅人'};
			require('../../dist/server/fantasy-rogue/legacy').recordClear(archive, saved);
			assert.equal(archive.cards[0].snapshot.rival.name, '乌栗');
			assert(archive.cards[0].snapshot.rival.permanent);
			assert(archive.cards[0].snapshot.rival.carmine.permanent);
			assert(require('../../dist/server/fantasy-rogue/discoveries').rogueDiscoveries(archive).trainers.includes('kieran'));
		} finally { store.close(); }
	});
});
