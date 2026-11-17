'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim');
const { set, stats } = require('../fixtures/fantasy-rogue');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon, rebuildMember, ensureMemberMemory } = require('../../dist/server/fantasy-rogue/progression');
const { useInventoryItem, trainingItemTargets } = require('../../dist/server/fantasy-rogue/inventory-use');
const { shopStock } = require('../../dist/server/fantasy-rogue/trading');
const { prepareEeveeEncounter } = require('../../dist/server/fantasy-rogue/eevee-encounter');
const { routeAdvice } = require('../../dist/server/fantasy-rogue/route-advice');
const { settleBlessingBattle } = require('../../dist/server/fantasy-rogue/blessings');
const { gainAffection } = require('../../dist/server/fantasy-rogue/affection');
const { floorFriendship } = require('../../dist/server/fantasy-rogue/friendship');
const content = createPreviewContent();
const mon = (species = 'Bulbasaur', level = 30) => createRoguePokemon(set(species, 'Overgrow', level, ['Tackle', 'Growl']), stats(0));
function run() { return { id: 'qa', floor: 61, phase: 'ready', team: [mon(), mon('Charmander')], box: [], boosts: stats(0), bag: { ppmax: 3 }, notices: [], money: 20000, blessings: { owned: [], settled: [], pending: [], completed: [], caught: [], defeated: [], nextJoin: 1, levels: 0 }, node: { id: 'rest', kind: 'rest', encounters: [] } }; }
describe('Fantasy Rogue confirmed balance, route and PP Max rules', function () {
	this.timeout(20000);
	it('PP Max increases only the selected move, preserving spent PP and surviving rebuild and a battle', () => {
		const r = run(), m = r.team[0], item = content.items.find(i => i.id === 'ppmax');
		assert(item);
		m.pp[0].pp -= 3;
		ensureMemberMemory(m);
		const other = structuredClone(m.pp[1]);
		useInventoryItem({}, r, content, { value: 'ppmax', member: m.id, slot: 0 });
		assert.equal(m.pp[0].maxpp, 56);
		assert.equal(m.pp[0].pp, 53);
		assert.deepEqual(m.pp[1], other);
		assert.equal(r.bag.ppmax, 2);
		for (let i = 0; i < 3; i++)
			rebuildMember(m, r.boosts);
		assert.equal(m.pp[0].pp, 53);
		assert.equal(m.pp[0].maxpp, 56);
		const saved = JSON.parse(JSON.stringify(m));
		const battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: { encounterId: 'pp', team: [saved], boosts: stats(0), bag: {}, balls: [], catchable: false }, p1: { team: [saved.set] }, p2: { team: [set('Magikarp', 'Swift Swim', 30, ['Splash'])] } });
		try {
			battle.makeChoices('team 1', 'team 1');
			assert.equal(battle.p1.active[0].moveSlots[0].maxpp, 56);
			assert.equal(battle.p1.active[0].moveSlots[0].pp, 53);
		} finally {
			battle.destroy();
		}
		assert.throws(() => useInventoryItem({}, r, content, { value: 'ppmax', member: m.id, slot: 0 }), /上限/);
		assert.equal(r.bag.ppmax, 2);
		assert.deepEqual(trainingItemTargets(r, content, item).find(t => t.member === m.id).slots, [1]);
	});
	it('preserves legacy PP normalization and refuses special no-boost moves', () => {
		const r = run(), m = r.team[0];
		m.pp[0] = { id: 'tackle', pp: 38, maxpp: 56 };
		ensureMemberMemory(m);
		assert.equal(m.pp[0].maxpp, 35);
		assert.equal(m.pp[0].pp, 17, 'legacy 56 max / 38 remaining means 18 uses spent; base 35 must keep 17');
		m.pp[0] = { id: 'sketch', pp: 1, maxpp: 1 };
		m.set.moves[0] = 'sketch';
		assert.throws(() => useInventoryItem({}, r, content, { value: 'ppmax', member: m.id, slot: 0 }), /不可提升/);
		assert.equal(r.bag.ppmax, 3);
	});
	it('preserves PP Max and spent PP through SQLite saves, migration and repeated reads', () => {
		const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
		const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
		const { randomUUID } = require('crypto');
		const store = new RogueStore(':memory:');
		try {
			const data = { ...content, story: undefined, blessings: false }, engine = new RogueEngine(store, data);
			engine.command('ppreceiptqa', { id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur'] });
			store.change('ppreceiptqa', account => {
				const r = account.run;
				r.phase = 'ready';
				r.bag.ppmax = 2;
				const m = r.team[0];
				m.pp[0].pp -= 2;
				useInventoryItem(account, r, data, { value: 'ppmax', member: m.id, slot: 0 });
			});
			const before = store.get('ppreceiptqa').run.team[0], inventory = store.get('ppreceiptqa').run.bag;
			for (let i = 0; i < 3; i++)
				engine.migrate('ppreceiptqa');
			const saved = store.get('ppreceiptqa').run.team[0];
			assert.deepEqual(saved.ppMaxed, before.ppMaxed);
			assert.equal(saved.pp[0].maxpp, before.pp[0].maxpp);
			assert.equal(saved.pp[0].pp, before.pp[0].pp);
			assert.deepEqual(store.get('ppreceiptqa').run.bag, inventory);
		} finally {
			store.close();
		}
	});
	for (const floor of [49, 89, 98, 99, 109, 149, 199])
		it(`offers PP Max at the confirmed boss shops, floor ${floor}`, () => {
			const r = run();
			r.floor = floor;
			const offer = shopStock(content, r).find(i => i.id === 'ppmax');
			assert.equal(!!offer, [99, 109, 149, 199].includes(floor));
			if (offer) {
				assert.equal(offer.price, 12000);
				assert.equal(offer.remaining, 1);
				r.node.restCandyPurchases = { ppmax: 1 };
				assert.equal(shopStock(content, r).find(i => i.id === 'ppmax').remaining, 0);
			}
		});
	function wild(length = 3) { return { id: 'wild', kind: 'wild', encounters: [{ wildPack: true, team: Array.from({ length }, () => set()) }] }; }
	it('adds exactly one fourth Eevee and persists a tenth-visit guarantee without rerolls', () => {
		const r = run();
		r.blessings.owned = [{ family: 'eeveefamily' }];
		for (let i = 1; i <= 9; i++) {
			const n = wild();
			prepareEeveeEncounter(n, [r], x => x - 1);
			assert.equal(n.encounters[0].team.length, 3);
			assert.equal(r.blessings.eeveeMisses, i);
			prepareEeveeEncounter(n, [r], () => 0);
			assert.equal(r.blessings.eeveeMisses, i);
		}
		const reloaded = JSON.parse(JSON.stringify(r)), n = wild();
		prepareEeveeEncounter(n, [reloaded], x => x - 1);
		assert.equal(n.encounters[0].team[3].species, 'Eevee');
		assert.equal(reloaded.blessings.eeveeMisses, 0);
		const occupied = wild(4);
		reloaded.blessings.eeveeMisses = 9;
		prepareEeveeEncounter(occupied, [reloaded], () => 0);
		assert.equal(occupied.encounters[0].team.length, 4);
		assert.equal(reloaded.blessings.eeveeMisses, 9);
	});
	it('uses a 20 percent base chance and only updates owners in co-op', () => {
		let appeared = 0;
		for (let roll = 0; roll < 100; roll++) {
			const a = run(), b = run();
			a.blessings.owned = [{ family: 'eeveefamily' }];
			const n = wild();
			prepareEeveeEncounter(n, [a, b], x => roll % x);
			if (n.encounters[0].team.length === 4)
				appeared++;
			assert.equal(b.blessings.eeveeMisses, undefined);
		}
		assert.equal(appeared, 20);
	});
	it('recomputes recommendations from current health, roster and the actual region level', () => {
		const r = run();
		r.phase = 'choose';
		r.choices = ['rest', 'reward', 'wild', 'elite', 'event'].map(kind => ({ id: kind, kind, name: kind, biome: { level: 30 } }));
		assert.equal(routeAdvice(r).id, 'elite');
		r.team[0].hp = 0;
		r.team[1].hp = 0;
		assert.equal(routeAdvice(r).id, 'rest');
		r.team = [mon()];
		assert.equal(routeAdvice(r).id, 'wild');
		r.team.push(mon());
		for (const p of r.team)
			p.hp = 1;
		assert.equal(routeAdvice(r).id, 'reward');
		for (const p of r.team) {
			p.hp = p.maxhp;
			p.set.level = 10;
		}
		assert.equal(routeAdvice(r).id, 'reward');
		for (const p of r.team) {
			p.set.level = 30;
			p.hp = Math.floor(p.maxhp * 0.6);
		}
		assert.equal(routeAdvice(r).id, 'event');
	});
	it('awards the small dog supplies only once per victory, never a defeat or retreat', () => {
		const r = run();
		r.blessings.owned = [{ family: 'dogs' }];
		const result = { encounterId: 'a', won: true, turns: 1, team: r.team, bag: {}, defeated: [] };
		settleBlessingBattle({}, r, content, result, () => 0);
		const first = structuredClone(r.bag);
		assert.equal(first.superpotion, 1);
		settleBlessingBattle({}, r, content, result, () => 0);
		assert.deepEqual(r.bag, first);
		settleBlessingBattle({}, r, content, { ...result, encounterId: 'b', won: false }, () => 0);
		assert.deepEqual(r.bag, first);
		settleBlessingBattle({}, r, content, { ...result, encounterId: 'c' }, () => 0, true);
		assert.deepEqual(r.bag, first);
	});
	it('adds the 50-affection supplies once and never retroactively regrants them', () => {
		const r = run();
		gainAffection(r, 'nemona', 50, { content, random: () => 0 });
		assert.equal(r.bag.ether, 1);
		assert.equal(r.bag.oranberry, 1);
		const first = structuredClone(r.bag);
		gainAffection(r, 'nemona', 1, { content, random: () => 0 });
		assert.deepEqual(r.bag, first);
	});
	it('gives four friendship per floor once and caps at 255', () => {
		const r = run(), m = r.team[0];
		m.set.happiness = 70;
		floorFriendship(r);
		assert.equal(m.set.happiness, 74);
		floorFriendship(r);
		assert.equal(m.set.happiness, 74);
		r.floor++;
		m.set.happiness = 254;
		floorFriendship(r);
		assert.equal(m.set.happiness, 255);
	});
	it('adds a PP Max choice only to late serious challenges and pays it only once', () => {
		const { prepareChallengePrizes, chooseChallengePrize } = require('../../dist/server/fantasy-rogue/optional-challenges');
		const { OPTIONAL_CHALLENGES } = require('../../dist/server/fantasy-rogue/challenge-data');
		for (const floor of [98, 99, 150])
			for (const serious of [false, true]) {
				const def = OPTIONAL_CHALLENGES.find(d => !!d.serious === serious), r = run();
				r.floor = floor;
				r.phase = 'event';
				r.node = { id: 'qa', name: 'challenge', kind: 'challenge', challenge: { id: def.id, key: 'qa', stage: 'won' }, encounters: [] };
				prepareChallengePrizes(r, () => 0);
				const p = r.node.challenge.prizes.find(p => p.id === 'ppmax');
				assert.equal(!!p, serious && floor >= 99);
				if (p) {
					const before = r.bag.ppmax;
					chooseChallengePrize(r, p.id);
					assert.equal(r.bag.ppmax, before + 1);
					assert.throws(() => chooseChallengePrize(r, p.id), /挑战胜利/);
					assert.equal(r.bag.ppmax, before + 1);
				}
			}
	});
});
