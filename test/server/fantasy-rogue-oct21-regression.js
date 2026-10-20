'use strict';
const assert = require('assert').strict;
const { Battle, Dex, toID } = require('../../dist/sim');
const { set, stats } = require('../fixtures/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { encounterSetProblems } = require('../../dist/server/fantasy-rogue/encounter-legality');
const { minimumEvolutionLevel, lowerToEligibleStage } = require('../../dist/server/fantasy-rogue/evolution');
const { makeEncounterSet } = require('../../dist/server/fantasy-rogue/encounter-sets');
const { RIVALS } = require('../../dist/server/fantasy-rogue/rival-data');
const { rivalOpeningPages, rivalConversationOptions, rivalChapterReplay } = require('../../dist/server/fantasy-rogue/rival-dialogue');
const { rivalTeam, beginRival, chooseRival, nextRivalFloor, rivalRoutes } = require('../../dist/server/fantasy-rogue/rivals');
const { TRAVELLING_TRAINERS } = require('../../dist/server/fantasy-rogue/travelling-trainers');
const { EVENT_TEAM_POOLS } = require('../../dist/server/fantasy-rogue/event-teams');
const { RogueBiomes } = require('../../dist/server/fantasy-rogue/biome-data');
const { rogueCodex } = require('../../dist/server/fantasy-rogue/codex');
const { robeActive, robeMultiplier, spiralActive, awakeningUpdate, drainPureRobe, bloodRequest } = require('../../dist/sim/fantasy-rogue-awakening');
const { prepareBlessingMember } = require('../../dist/sim/fantasy-rogue-blessings');
const { repairSavedEncounters } = require('../../dist/server/fantasy-rogue/encounter-repair');

describe('Fantasy Rogue October 21 regression', function () {
	this.timeout(30000);
	it('repairs legacy opponents before fighting and preserves the player, active battles and memory challenges', () => {
		const player = createRoguePokemon(set('Pikachu', 'Static', 25, ['Thunder Shock']), stats(0));
		const invalid = set('Slowbro-Galar', 'Swarm', 25, ['Shell Side Arm']);
		const r = { phase: 'ready', team: [player], node: { kind: 'boss', encounters: [{ team: [invalid] }] } };
		const before = JSON.stringify(player);
		repairSavedEncounters(r);
		assert.equal(JSON.stringify(player), before); assert.deepEqual(encounterSetProblems(invalid), []);
		assert(invalid.level >= minimumEvolutionLevel(invalid.species));
		const normalized = JSON.stringify(r); repairSavedEncounters(r); assert.equal(JSON.stringify(r), normalized);
		const ally = set('Chandelure', 'Flame Body', 40, ['Blue Flare', 'Dazzling Gleam']);
		r.node.kind = 'adventure'; r.node.encounters = [{ team: [], cooperative: { team: [ally] } }];
		repairSavedEncounters(r); assert.deepEqual(ally.moves, ['flamethrower', 'energyball']);
		for (const memory of [false, true]) {
			const old = set('Cleffa', 'Yan Bu Zhen', 5, ['Earthquake']);
			r.phase = memory ? 'ready' : 'battle'; r.node.encounters = [{ team: [old] }];
			r.node.event = memory ? { memory: {} } : undefined;
			repairSavedEncounters(r); assert.equal(old.ability, 'Yan Bu Zhen');
		}
	});
	it('never gives an unowned target blessing, godrobe, revival, confusion or spiral power to a co-op ally', () => {
		for (const owned of [[], [{ id: 'hazards', family: 'hazards', floor: 50, target: 'ours' },
			{ id: 'godrobe', family: 'godrobe', floor: 50 }, { id: 'puregodrobe', family: 'puregodrobe', floor: 50 }]]) {
			const player = createRoguePokemon(set('Zangoose', 'Immunity', 50, ['Protect']), stats(0), 'ours');
			const foe = set('Magikarp', 'Swift Swim', 50, ['Splash']);
			const battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: {
				cooperative: { opponentOffset: 1 }, encounterId: 'coop-legal', team: [player], boosts: stats(0),
				bag: {}, catchable: false, blessings: { owned },
			}, p1: { name: 'Player', team: [player.set] }, p2: { name: 'Foe1', team: [foe] },
			p3: { name: 'Lillie', team: [set('Cleffa', 'Cute Charm', 10, ['Splash'])] }, p4: { name: 'Foe2', team: [foe] } });
			try {
				for (const side of battle.sides) battle.choose(side.id, 'team 1');
				const ally = battle.p3.active[0];
				assert.equal(ally.ability, 'cutecharm'); assert.equal(ally.set.fantasyRogueId, undefined);
				prepareBlessingMember(ally);
				assert.deepEqual(ally.m.rogueBlessing.abilities, []);
				for (const mon of battle.sides.slice(1).flatMap(side => side.pokemon)) {
					assert(!mon.hasAbility('yanbuzhen')); assert(!mon.hasAbility('merciless'));
					assert(!robeActive(mon, 'godrobe')); assert(!robeActive(mon, 'puregodrobe')); assert(!spiralActive(mon));
					assert.equal(robeMultiplier(mon), 1); assert.equal(bloodRequest(mon), undefined);
				}
				ally.hp = Math.floor(ally.maxhp / 4); const hp = ally.hp;
				awakeningUpdate(ally); drainPureRobe(ally);
				assert.equal(ally.hp, hp); assert.equal(ally.boosts.spa, 0); assert(!ally.volatiles.confusion);
				if (owned.length) assert(battle.p1.active[0].hasAbility('yanbuzhen'), 'the actual chosen recipient retains its extra ability');
				for (const side of battle.sides) battle.choose(side.id, 'move 1');
				assert.equal(ally.hp, hp); assert(!battle.log.some(line => /神衣纯洁.*半血觉醒/.test(line)));
			} finally { battle.destroy(); }
		}
	});
	it('audits every configured party, candidate, starter and summit life, including legal evolution levels', () => {
		let count = 0;
		function visit(value, path = 'content') {
			if (!value || typeof value !== 'object') return;
			if (value.species && value.ability && Array.isArray(value.moves)) {
				assert.deepEqual(encounterSetProblems(value), [], path + ': ' + value.species);
				assert(value.level >= minimumEvolutionLevel(value.species), path + ': ' + value.species);
				count++; return;
			}
			for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
		}
		visit(createPreviewContent()); assert(count > 3000, String(count));
		assert(encounterSetProblems(set('Cleffa', 'Yan Bu Zhen', 10, ['Splash'])).length);
		assert(encounterSetProblems(set('Cleffa', 'Cute Charm', 10, ['Earthquake'])).length);
		assert(encounterSetProblems(set('Vulpix-Alola', 'Snow Cloak', 10, ['Flamethrower'])).length);
	});
	it('audits dynamic wild, travelling trainer, themed event and rival species at early, middle and late levels', () => {
		const species = new Set([...Object.values(EVENT_TEAM_POOLS).flat(), ...TRAVELLING_TRAINERS.flatMap(p => p.team),
			...Object.values(RIVALS).flatMap(p => p.team).map(n => n === 'Alolan Vulpix' ? 'Vulpix-Alola' : n),
			...RogueBiomes.flatMap(b => b.tiers.flatMap(t => t.flatMap(s => s.species)))]);
		for (const level of [3, 8, 20, 29, 30, 50, 80, 100]) for (const name of species) {
			const actual = lowerToEligibleStage(name, level), mon = makeEncounterSet(actual, level);
			assert.deepEqual(encounterSetProblems(mon), [], `${name} -> ${actual} Lv.${level}`);
			assert(level >= minimumEvolutionLevel(mon.species), mon.species);
		}
		for (const id of Object.keys(RIVALS)) {
			const run = { floor: 1, rival: { id }, team: [] };
			for (const mon of rivalTeam(run, 5, 6)) assert.deepEqual(encounterSetProblems(mon), [], id);
		}
	});
	it('gives all 96 meetings several click-through pages, self-introductions and two affection choices', () => {
		const content = createPreviewContent(), catalog = rogueCodex(undefined, 'events', true);
		for (const id of Object.keys(RIVALS)) assert.deepEqual(catalog.entries.filter(e => e.id.startsWith(`rival:${id}:`))
			.map(e => Number(e.id.split(':')[2])), [1, 2, 3, 4, 5, 6, 7, 8]);
		for (const [id, person] of Object.entries(RIVALS)) for (let chapter = 1; chapter <= 8; chapter++) {
			const pages = rivalOpeningPages(id, chapter, 0);
			assert(pages.length >= 5, `${id}:${chapter}`);
			if (chapter === 1) assert(pages.some(p => p.text.includes(person.name)), id);
			assert.equal(rivalConversationOptions(chapter).length, 3);
			assert.equal(rivalConversationOptions(chapter, 1).length, 3);
			const r = { floor: 20, phase: 'event', team: [], bag: {}, blessings: { owned: [] },
				rival: { id, completed: chapter - 1, affection: 3, lastFloor: 1 }, node: { encounters: [] } };
			beginRival(r, () => 0); assert.equal(r.node.event.rival.step, 'conversation');
			chooseRival(r, content, () => 0, 'greet:warm'); assert.equal(r.rival.affection, 4);
			assert(r.dialogue.pages.length >= 2);
			chooseRival(r, content, () => 0, 'greet:cold'); assert.equal(r.rival.affection, 3);
			assert.notEqual(r.node.event.rival.step, 'conversation');
			const entry = catalog.entries.find(e => e.id === `rival:${id}:${chapter}`);
			assert.deepEqual(entry.replay, rivalChapterReplay(id, chapter));
			assert.equal(entry.portrait, id);
		}
	});
	it('paces an early meeting toward chapter 6 near 100 and chapter 8 before 150, with overdue catch-up', () => {
		const r = { id: 'marnie', completed: 1, lastFloor: 1, affection: 0 };
		assert.equal(nextRivalFloor(r), 31);
		for (; r.completed < 8; r.completed++) {
			const floor = nextRivalFloor(r);
			if (r.completed >= 2) assert(floor - r.lastFloor >= 10 && floor - r.lastFloor <= 20);
			if (r.completed === 5) assert(floor >= 95 && floor <= 102);
			if (r.completed === 7) assert(floor < 150);
			r.lastFloor = floor;
		}
		const delayed = { id: 'marnie', completed: 3, lastFloor: 90, affection: 0 };
		assert(nextRivalFloor(delayed) - delayed.lastFloor < 10);
		for (; delayed.completed < 6; delayed.completed++) delayed.lastFloor = nextRivalFloor(delayed);
		assert(delayed.lastFloor <= 102);
		const nodes = [{ id: 'wild' }], run = { floor: 50, rival: { id: 'marnie', completed: 1, lastFloor: 1 } };
		assert.equal(rivalRoutes(run, nodes, () => 97)[0].id, 'rival');
		assert.equal(rivalRoutes({ floor: 21 }, nodes, () => 0)[0].id, 'wild');
		assert.equal(rivalRoutes({ floor: 170, rival: r }, nodes, () => 0)[0].id, 'wild');
	});
});
