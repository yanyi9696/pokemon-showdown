'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { Dex } = require('../../dist/sim/dex');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { fantasyConversionInfo, fantasyConversionOptions } = require('../../dist/server/fantasy-rogue/fantasy-conversion');
const { BLESSING_SUMMARIES } = require('../../dist/server/fantasy-rogue/blessing-summaries');
const { blessingDisplay } = require('../../dist/server/fantasy-rogue/blessing-text');
const { ROGUE_BLESSINGS } = require('../../dist/sim/rogue-blessing-data');
const { chooseJourneyActivity } = require('../../dist/server/fantasy-rogue/journey-activities');
const { simulateForestBattle } = require('../../dist/server/fantasy-rogue/event-battle');
const { set, stats, content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue localized patch boundaries', function () {
	this.timeout(30000);
	for (const [species, forme, ability] of [
		['Charizard', 'Charizard-Mega-X', 'Blaze'], ['Meloetta', 'Meloetta-Pirouette', 'Serene Grace'],
		['Aegislash', 'Aegislash-Blade', 'Stance Change'],
	]) for (const exit of ['win', 'loss', 'retreat', 'reconnect']) {
		it(`keeps ${species} persistent identity and used resources after ${forme} and ${exit}`, () => {
			const saved = createRoguePokemon(set(species, ability, 50, ['Tackle', 'Splash']), stats(0));
			saved.experience = 123456;
			let battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
				fantasyRogue: { encounterId: 'temporary-form', team: [saved], boosts: stats(0), bag: {}, balls: [], catchable: false },
				p1: { name: 'Player', team: [saved.set] }, p2: { name: 'Foe', team: [set('Snorlax', 'Immunity', 50, ['Splash'])] },
			});
			try {
				battle.makeChoices('team 1', 'team 1');
				const mon = battle.p1.active[0];
				assert(mon.formeChange(forme, battle.dex.conditions.get('rogueblessing'), true));
				assert(mon.formeChange(species, battle.dex.conditions.get('rogueblessing'), true));
				assert(mon.formeChange(forme, battle.dex.conditions.get('rogueblessing'), true));
				mon.hp -= 7; mon.baseMoveSlots[0].pp -= 2; mon.setItem('oranberry');
				if (exit === 'win') battle.win('p1');
				if (exit === 'loss') { mon.hp = 0; battle.win('p2'); }
				if (exit === 'reconnect') {
					const json = JSON.stringify(battle); battle.destroy(); battle = Battle.fromJSON(json);
				}
				const result = rogueBattleResult(battle, false).team[0];
				assert.equal(result.set.species, species); assert.equal(result.set.ability, ability);
				assert.equal(result.set.level, saved.set.level); assert.equal(result.experience, saved.experience);
				assert.equal(result.hp, exit === 'loss' ? 0 : saved.maxhp - 7);
				assert.equal(result.pp[0].pp, saved.pp[0].pp - 2); assert.equal(result.set.item, 'oranberry');
				assert.equal(saved.set.species, species);
			} finally { battle.destroy(); }
		});
	}
	it('has an explicit short description for every blessing without changing the definitions', () => {
		const before = structuredClone(ROGUE_BLESSINGS);
		assert.deepEqual(Object.keys(BLESSING_SUMMARIES).sort(), ROGUE_BLESSINGS.map(def => def.id).sort());
		for (const def of ROGUE_BLESSINGS) for (const floor of [1, 50, 100, 150]) {
			const view = blessingDisplay(def, floor);
			assert(view.text && view.shortText && view.shortText.length > 3, def.id);
			assert(!/undefined|NaN/.test(view.shortText), def.id);
		}
		assert.deepEqual(ROGUE_BLESSINGS, before);
	});
	it('derives current and branched future Fantasy eligibility from gameplay data without consuming shards', () => {
		const dex = Dex.mod('gen9fantasy');
		for (const species of ['Scyther', 'Scizor', 'Slowpoke', 'Slowpoke-Galar', 'Urshifu', 'Ralts', 'Ditto', 'Meltan']) {
			const mon = createRoguePokemon(set(species, dex.species.get(species).abilities[0], 50, ['Tackle']), stats(0));
			const before = structuredClone(mon);
			for (const shards of [0, 49, 50, 99, 100, 101]) {
				const info = fantasyConversionInfo(mon, shards);
				assert.equal(info.cost, 100); assert.equal(info.shards, shards);
				assert.equal(info.current, fantasyConversionOptions(mon).length > 0);
				for (const final of info.finals) assert(fantasyConversionOptions({ ...mon, set: { ...mon.set, species: final } }).length);
			}
			assert.deepEqual(mon, before);
		}
	});
	it('compensates bounded rhythm transit without widening the zone or duplicating a beat', () => {
		const run = () => ({ floor: 10, phase: 'event', team: [], bag: {}, money: 0, node: {
			event: { id: 'poffinworkshop', stage: 'choice', activity: { startedAt: 1000, duration: 12000, score: 0, taps: [] } },
		} });
		const press = (r, received, shown) => chooseJourneyActivity({}, r, content(), () => 0, 'tap', 1000 + received, undefined, shown);
		const r = run(); press(r, 620, 500); assert.equal(r.node.event.activity.score, 1);
		press(r, 650, 520); assert.equal(r.node.event.activity.score, 1);
		const miss = run(); press(miss, 620, 560); assert.equal(miss.node.event.activity.score, 0);
		for (const invalid of [-1, NaN, Infinity, 700, 100]) assert.throws(() => press(run(), 620, invalid), /延迟/);
		const legacy = run(); press(legacy, 500); assert.equal(legacy.node.event.activity.score, 1);
	});
	it('removes items at spectator battle entry without mutating the supplied ordinary teams', () => {
		const teams = [[{ ...set('Pikachu', 'Static', 50, ['Thunderbolt']), item: 'Life Orb' }],
			[{ ...set('Magikarp', 'Swift Swim', 5, ['Splash']), item: 'Focus Sash' }]];
		const original = structuredClone(teams);
		const result = simulateForestBattle(teams, n => Math.min(1, n - 1));
		assert.equal(result.winner, 0);
		assert(!result.log.some(line => /Life Orb|Focus Sash|lifeorb|focussash/.test(line)));
		assert.deepEqual(teams, original);
	});
});
