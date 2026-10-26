'use strict';
const assert = require('assert').strict;
const {Battle, Dex} = require('../../dist/sim');
const {PRNG} = require('../../dist/sim/prng');
const {set, stats, eventRoll, commandAfterOpening} = require('../fixtures/fantasy-rogue');
const {randomUUID} = require('crypto');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {createRoguePokemon, initializeExperience} = require('../../dist/server/fantasy-rogue/progression');
const {blessing} = require('../../dist/sim/rogue-blessing-data');
const {normalizeBlessings, handleBlessingCommand, blessingCandidates, reservationGiftPool} = require('../../dist/server/fantasy-rogue/blessings');
const {rollRoutes} = require('../../dist/server/fantasy-rogue/routes');
const {grantJourneyGrowth, grantGrowth, grantPersonalGrowth} = require('../../dist/server/fantasy-rogue/growth');
const {rewardChoices} = require('../../dist/server/fantasy-rogue/reward-scenes');
const {greninjaEventEligible} = require('../../dist/server/fantasy-rogue/greninja-training');
const {chooseEvent, chooseEventOption, eventView} = require('../../dist/server/fantasy-rogue/events');
const {rogueCodex} = require('../../dist/server/fantasy-rogue/codex');
const {beginRival, chooseRival} = require('../../dist/server/fantasy-rogue/rivals');
const {RIVAL_STYLES, rivalAffectionGain} = require('../../dist/server/fantasy-rogue/rival-responses');
const {rivalAnswerPages} = require('../../dist/server/fantasy-rogue/rival-dialogue');
const {battleFriendship} = require('../../dist/server/fantasy-rogue/friendship');
const {rogueBattleResult} = require('../../dist/sim/fantasy-rogue');
const {inventoryItem} = require('../../dist/server/fantasy-rogue/team');

describe('Fantasy Rogue October 21 content and progression update', function () {
	this.timeout(30000);
	let content;
	before(() => { content = createPreviewContent(); });
	function run(floor = 21) {
		const mon = createRoguePokemon(set('Pikachu', 'Static', 25, ['Thunder Shock']), stats(0), 'pika');
		initializeExperience(mon);
		const r = {id: 'oct21', floor, phase: 'event', boosts: stats(0), team: [mon], bag: {}, money: 10000, caught: [],
			node: {kind: 'event', name: '测试', encounters: [], reward: {money: 0, items: {}}}, encounter: 0};
		normalizeBlessings(r); return r;
	}
	const account = r => ({run: r, captures: {}, unlocked: [], points: 0});
	function event(r, id) { r.node.event = {id, key: 'current', stage: 'choice'}; r.phase = 'event'; }
	function pick(r, choice) { chooseEventOption(account(r), r, content, () => 0, r.node.event.key, choice); }
	it('shares corrected titles, the new gold blessing and both training stages with the start codices', () => {
		const catalog = rogueCodex(undefined, 'blessings', true).entries;
		for (const name of ['某科学的超电磁炮', '宝可梦毒液进化', '宝可梦黑暗进化', '艺术就是爆炸']) {
			assert(catalog.some(e => e.name === name), name);
		}
		assert.equal(blessing('explosionart').tier, 'gold');
		assert(!catalog.some(e => /某科学超电磁炮|宝可梦剧毒进化|宝可梦暗黑进化/.test(e.name)));
		const events = rogueCodex(undefined, 'events', true).entries;
		for (const id of ['greninjatraining', 'greninjareturn']) {
			const entry = events.find(e => e.id === id || e.id === 'event:' + id);
			assert(entry?.unlocked && entry.replay, id);
		}
		assert(rogueCodex(undefined, 'guide', true).guide.itemNotes.some(e => e.id === 'greninjaashz'));
	});
	it('gifts natural unevolved stages and female pure-robe partners below their evolution gates', () => {
		for (const [id, floor, species] of [['spiral', 1, 'Drilbur'], ['spiral', 60, 'Drilbur'], ['spiral', 62, 'Excadrill'],
			['puregodrobe', 1, 'Espurr'], ['puregodrobe', 48, 'Espurr'], ['puregodrobe', 50, 'Meowstic-F']]) {
			const r = run(floor); r.phase = 'blessing';
			r.blessings.round = {floor, tier: 'prismatic', remaining: 1, options: [{id, refreshes: 1, chosen: false}], familiesSeen: []};
			handleBlessingCommand(account(r), r, content, {action: 'blessing', slot: 0}, () => 0);
			const mon = r.blessings.pending.find(p => p.kind === 'gift').pokemon;
			assert.equal(mon.set.species, species); assert.equal(mon.set.level, Math.max(5, Math.ceil(floor / 2)));
			if (id === 'puregodrobe') assert.equal(mon.set.gender, 'F');
		}
	});
	it('further discounts previous-run blessings without changing saved IDs', () => {
		const r = run(); r.previousBlessings = ['medic'];
		const pool = blessingCandidates(r, content);
		assert.equal(pool.find(e => e.id === 'medic').appearanceWeight, 20);
		assert.equal(pool.find(e => e.id === 'lowhp').appearanceWeight, 100);
	});
	it('never offers elites on consecutive floors, survives serialization and retains the red/blue mix', () => {
		const pool = ['wild', 'trainer', 'elite', 'event', 'reward', 'trade'].map(kind => ({id: kind, name: kind, kind, encounters: [], reward: {money: 0, items: {}}}));
		const rng = new PRNG([1, 2, 3, 4]); let r = run(1), lastElite = -100;
		const counts = {wild: 0, trainer: 0, elite: 0};
		for (let floor = 1; floor <= 5000; floor++) {
			r.floor = floor;
			const choices = rollRoutes(r, pool, n => rng.random(n));
			for (const kind of Object.keys(counts)) counts[kind] += choices.filter(n => n.kind === kind).length;
			if (choices.some(n => n.kind === 'elite')) { assert(floor - lastElite > 1); lastElite = floor; }
			assert(choices.some(n => ['wild', 'trainer', 'elite'].includes(n.kind)));
			assert(choices.some(n => ['event', 'reward', 'trade'].includes(n.kind)));
			if (floor % 13 === 0) r = JSON.parse(JSON.stringify(r));
		}
		assert(counts.wild > counts.trainer * 1.5 && counts.wild > counts.elite * 1.5, JSON.stringify(counts));
		assert(Math.abs(counts.trainer - counts.elite) / Math.max(counts.trainer, counts.elite) < .2, JSON.stringify(counts));
	});
	it('blocks permanent rewards before 40 and cushions the late midgame', () => {
		for (const floor of [1, 10, 20, 21, 39, 40, 50, 80, 81, 100, 101, 140, 141, 149, 150, 199]) {
			const r = run(floor); r.node.event = {settled: true};
			grantJourneyGrowth(r, () => 0);
			assert.equal(r.growth?.offense || 0, floor < 40 ? 0 : floor <= 80 ? 115 : floor <= 100 ? 175 : floor <= 140 ? 200 : 225);
			const before = JSON.stringify(r.growth); grantJourneyGrowth(r, () => 0); assert.equal(JSON.stringify(r.growth), before);
			r.node.rewardScene = {id: 'chest'};
			const offer = rewardChoices(r).find(e => e.id === 'offense');
			assert.equal(offer?.targets[0].amount || 0, floor < 40 ? 0 : floor <= 80 ? 600 : floor <= 100 ? 900 : floor <= 140 ? 1000 : 1100);
			if (floor < 40) {
				grantGrowth(r, 'defense', 100); grantPersonalGrowth(r, r.team[0], 'offense', 100);
				assert(!r.growth?.defense && !r.team[0].training?.offense);
			}
		}
	});
	it('uses personality preferences for three courteous styles and persists real affinity gains', () => {
		for (const [id, styles] of Object.entries(RIVAL_STYLES)) {
			for (const chapter of [1, 2, 4, 8]) {
				assert(rivalAffectionGain(id, styles[0], chapter) > rivalAffectionGain(id, styles[2], chapter));
				assert(rivalAffectionGain(id, styles[2], chapter) > 0);
				if (id === 'carmine') continue;
				const r = run(); r.rival = {id, completed: chapter - 1, affection: 0, lastFloor: 1};
				beginRival(r, () => 0);
				chooseRival(r, content, () => 0, 'greet:' + styles[0]);
				assert.equal(r.rival.affection, rivalAffectionGain(id, styles[0], chapter));
				assert.equal(r.dialogue.pages[0].affectionGain, r.rival.affection * 2);
				assert.equal(r.dialogue.pages[0].affection, r.trainerBonds[id].score);
				assert.equal(new Set(['warm', 'honest', 'cold'].map(style => rivalAnswerPages(id, chapter, 0, 'greet:' + style, 0)[0].text)).size, 3);
			}
		}
	});
	it('gates the forest event, keeps the exact away member and returns it once after the actual floor interval', () => {
		let r = run(80);
		assert(!greninjaEventEligible(r, 'greninjatraining'));
		const frog = createRoguePokemon(set('Greninja-Fantasy', 'Anticipation', 40, ['Water Shuriken']), stats(0), 'trained-frog');
		initializeExperience(frog); frog.training = {offense: 400}; frog.hp--; frog.pp[0].pp--;
		r.team.push(frog); normalizeBlessings(r); const before = JSON.parse(JSON.stringify(frog));
		assert(greninjaEventEligible(r, 'greninjatraining'));
		event(r, 'greninjatraining'); pick(r, 'train:' + frog.id);
		assert.equal(r.team.length, 1); assert.deepEqual(r.greninjaTraining.member, before);
		r = JSON.parse(JSON.stringify(r)); r.floor = 84; assert(!greninjaEventEligible(r, 'greninjareturn'));
		r.floor = 87; assert(greninjaEventEligible(r, 'greninjareturn'));
		event(r, 'greninjareturn'); pick(r, 'welcome');
		const returned = r.team.find(m => m.id === frog.id);
		assert.equal(returned.set.level, 47); assert.deepEqual(returned.training, before.training);
		assert.equal(returned.pp[0].pp, before.pp[0].pp); assert.equal(returned.maxhp - returned.hp, before.maxhp - before.hp);
		assert.equal(r.bag.greninjaashz, 1); assert(r.zUnlocked); assert(!r.greninjaTraining.member);
		assert(!greninjaEventEligible(r, 'greninjareturn')); assert(!greninjaEventEligible(r, 'greninjatraining'));
		assert.throws(() => pick(r, 'welcome')); assert.equal(r.bag.greninjaashz, 1);
		assert.equal(inventoryItem(content, 'greninjaashz').name, '智蛙 Z');
	});
	it('keeps a last capable fighter at home, rejects missing members and offers the returning partner when full', () => {
		const r = run(80), frog = createRoguePokemon(set('Greninja-Fantasy', 'Anticipation', 40), stats(0), 'frog');
		initializeExperience(frog); r.team[0].hp = 0; r.team.push(frog);
		assert(!greninjaEventEligible(r, 'greninjatraining'));
		r.team[0].hp = r.team[0].maxhp; event(r, 'greninjatraining');
		assert.throws(() => pick(r, 'train:missing')); pick(r, 'train:frog');
		r.floor += 6;
		while (r.team.length < 6) r.team.push({...structuredClone(r.team[0]), id: 'member' + r.team.length});
		event(r, 'greninjareturn'); pick(r, 'welcome');
		assert.equal(r.team.length, 6); assert.equal(r.pendingCapture.id, 'frog');
		assert.equal(r.phase, 'settlement'); assert.equal(r.captureResume, 'event');
		assert(!r.pendingMoves?.some(m => m.member === 'frog'));
	});
	it('persists departure, reconnection, full-party return and duplicate requests through real campaign commands', () => {
		const store = new RogueStore(':memory:'); const engine = new RogueEngine(store, content, () => 0), user = 'oct21training';
		const cmd = (action, data = {}) => commandAfterOpening(engine, user, {id: randomUUID(), revision: store.get(user).revision, action, ...data});
		try {
			cmd('start', {starters: ['bulbasaur']});
			store.change(user, a => {
				const r = a.run; r.floor = 80; r.phase = 'event';
				r.node = {kind: 'event', name: '甲贺忍蛙护林员', encounters: [], reward: {money: 0, items: {}}};
				const frog = createRoguePokemon(set('Greninja-Fantasy', 'Anticipation', 40, ['Water Shuriken']), r.boosts, 'command-frog');
				initializeExperience(frog); r.team.push(frog); event(r, 'greninjatraining');
				assert.equal(chooseEvent(r, () => eventRoll(r, 'greninjatraining')), 'greninjatraining');
			});
			cmd('event', {member: 'current', value: 'train:command-frog'});
			assert(store.get(user).run.greninjaTraining.member); assert.equal(engine.migrate(user).run.team.length, 1);
			store.change(user, a => {
				const r = a.run; r.floor = 86; r.phase = 'event';
				assert.equal(chooseEvent(r, () => eventRoll(r, 'greninjareturn')), 'greninjareturn');
				while (r.team.length < 6) r.team.push({...structuredClone(r.team[0]), id: 'fill' + r.team.length});
				event(r, 'greninjareturn');
			});
			const request = {id: randomUUID(), revision: store.get(user).revision, action: 'event', member: 'current', value: 'welcome'};
			engine.command(user, request); const receipt = store.get(user); engine.command(user, request);
			assert.deepEqual(store.get(user), receipt); assert.equal(receipt.run.bag.greninjaashz, 1);
			assert.throws(() => cmd('continue'));
			const r = store.get(user).run; assert.equal(r.phase, 'settlement'); assert.equal(r.pendingCapture.id, 'command-frog');
			cmd('replace', {value: r.team[0].id});
			const restored = engine.migrate(user).run;
			assert.equal(restored.team.filter(m => m.id === 'command-frog').length, 1);
			assert.equal(restored.team.find(m => m.id === 'command-frog').set.level, 46);
			assert(!restored.pendingCapture); assert.equal(restored.bag.greninjaashz, 1);
			assert.equal(restored.phase, 'event'); cmd('continue'); assert.equal(store.get(user).run.floor, 87);
		} finally { store.close(); }
	});
	it('includes custom-Z Fantasy evolution chains in reservation gifts, including Froakie', () => {
		const r = run(1), pool = reservationGiftPool(r, content, 'z');
		assert(pool.pool.includes('Froakie'));
		r.team[0].set.species = 'Froakie'; assert(reservationGiftPool(r, content, 'z').present);
	});
	function native(team, ids = [], foes = [set('Blissey', 'Natural Cure', 100, ['Splash'])]) {
		const saved = team.map((s, i) => createRoguePokemon(s, stats(0), 'member' + i));
		const b = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: {
			encounterId: 'oct21-battle', team: saved, boosts: stats(0), bag: {}, catchable: false, progression: true,
			systems: {player: {mega: false, z: true}}, blessings: {owned: ids.map(id => ({...blessing(id), floor: 1}))},
		}, p1: {name: 'Player', team: saved.map(m => m.set)}, p2: {name: 'Foe', team: foes}});
		b.makeChoices('team 1', 'team 1'); b.randomizer = value => value; return b;
	}
	it('increases final Explosion damage by 50%, preserving self-KO XP and friendship only for its true user', () => {
		for (const move of ['Self-Destruct', 'Explosion']) {
			const losses = [];
			for (const enabled of [false, true]) {
				const b = native([set('Electrode', 'Soundproof', 50, [move]), set('Pikachu', 'Static', 50)], enabled ? ['explosionart'] : []);
				try {
					const p = b.p1.active[0], foe = b.p2.active[0]; b.makeChoices('move 1', 'move 1');
					losses.push(foe.maxhp - foe.hp); assert.equal(p.hp, 0);
					assert.equal(b.fantasyRogue.selfDestructed.includes(p.set.fantasyRogueId), enabled);
				} finally { b.destroy(); }
			}
			assert(Math.abs(losses[1] - losses[0] * 1.5) <= 2, losses.join('/'));
		}
		const b = native([set('Electrode', 'Soundproof', 100, ['Explosion']), set('Pikachu', 'Static', 50)], ['explosionart'], [set('Magikarp', 'Swift Swim', 1, ['Splash'])]);
		try {
			b.makeChoices('move 1', 'move 1'); const result = rogueBattleResult(b);
			assert(result.won); assert(result.defeated[0].eligible.includes('member0'));
			const r = run(), before = structuredClone(b.fantasyRogue.team); r.team = result.team;
			r.team[0].set.happiness = 70; battleFriendship(r, result, 'once', before);
			assert.equal(r.team[0].set.happiness, 70);
		} finally { b.destroy(); }
	});
	it('transforms only a crystal-carrying Fantasy Greninja in a Rogue battle and enables its native exclusive Z', () => {
		for (const item of ['', 'Greninja-Ash Z']) {
			const b = native([{...set('Greninja-Fantasy', 'Anticipation', 50, ['Water Shuriken']), item}]);
			try {
				const frog = b.p1.active[0];
				assert.equal(frog.species.id, item ? 'greninjaashfantasy' : 'greninjafantasy');
				if (item) {
					assert.equal(frog.ability, 'moldbreaker'); assert(b.actions.canZMove(frog));
					b.makeChoices('move 1 zmove', 'move 1');
					assert(b.log.some(line => /huangjinjibanshoulijian/i.test(line)), b.log.join('\n'));
				}
			} finally { b.destroy(); }
		}
	});
});
