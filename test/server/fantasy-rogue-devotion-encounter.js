'use strict';
const assert = require('assert').strict;
const { prepareEeveeEncounter } = require('../../dist/server/fantasy-rogue/eevee-encounter');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { set, stats } = require('../fixtures/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');

function run(species = 'Pikachu', eevee = false) {
	const member = createRoguePokemon(set(species, undefined, 30), stats(0));
	const r = { id: 'devotion-test', floor: 61, phase: 'ready', team: [member], box: [], bag: {}, money: 100,
		boosts: stats(0), notices: [], caught: [] };
	normalizeBlessings(r);
	r.blessings.owned = [{ family: 'devotion', species: species.toLowerCase(), encounterSpecies: species, target: member.id }];
	if (eevee) r.blessings.owned.push({ family: 'eeveefamily' });
	return r;
}
function wild(length = 3) {
	return { id: 'test-wild', kind: 'wild', biome: { level: 40 }, encounters: [{ wildPack: true,
		team: Array.from({ length }, () => set('Magikarp', 'Swift Swim', 40, ['Splash'])) }] };
}
const misses = n => n - 1;
function rolls(...values) { return n => (values.length ? values.shift() : 0) % n; }

describe('Devotion and Eevee extra encounters', () => {
	for (const [species, eevee, expected] of [['Pikachu', false, 20], ['Eevee', true, 40]]) {
		it(`uses exactly ${expected}/100 chance for ${species}, stacked=${eevee}`, () => {
			let hits = 0;
			for (let roll = 0; roll < 100; roll++) {
				const r = run(species, eevee), n = wild();
				prepareEeveeEncounter(n, [r], x => roll % x);
				if (n.encounters[0].team.length === 4) hits++;
				assert(n.encounters[0].team.length <= 4);
				if (eevee) assert.equal(r.blessings.eeveeMisses, r.blessings.devotionMisses);
			}
			assert.equal(hits, expected);
		});
	}
	it('persists the tenth-visit guarantee and does not reroll a revisited or reloaded node', () => {
		let r = run();
		for (let i = 1; i <= 9; i++) {
			const n = wild(); prepareEeveeEncounter(n, [r], misses);
			assert.equal(n.encounters[0].team.length, 3); assert.equal(r.blessings.devotionMisses, i);
			const loaded = JSON.parse(JSON.stringify(n));
			prepareEeveeEncounter(loaded, [r], () => { throw new Error('reroll'); });
			r = JSON.parse(JSON.stringify(r)); normalizeBlessings(r);
		}
		const n = wild(); prepareEeveeEncounter(n, [r], misses);
		assert.equal(n.encounters[0].team[3].species, 'Pikachu');
		assert.equal(n.encounters[0].team[3].level, 40); assert.equal(r.blessings.devotionMisses, 0);
	});
	it('shares a same-species guarantee without adding two copies', () => {
		const r = run('Eevee', true), n = wild();
		r.blessings.eeveeMisses = 9; r.blessings.devotionMisses = 2;
		prepareEeveeEncounter(n, [r], misses);
		assert.equal(n.encounters[0].team.length, 4); assert.equal(n.encounters[0].team[3].species, 'Eevee');
		assert.equal(r.blessings.eeveeMisses, 0); assert.equal(r.blessings.devotionMisses, 0);
	});
	for (const pick of [0, 1]) it(`defers the other guarantee after simultaneous guarantees, selected ${pick}`, () => {
		const r = run('Pikachu', true), n = wild();
		r.blessings.eeveeMisses = r.blessings.devotionMisses = 9;
		prepareEeveeEncounter(n, [r], rolls(pick));
		const selected = n.encounters[0].team[3].species;
		assert.equal(n.encounters[0].team.length, 4);
		assert.equal(r.blessings.eeveeMisses, selected === 'Eevee' ? 0 : 9);
		assert.equal(r.blessings.devotionMisses, selected === 'Pikachu' ? 0 : 9);
		const loaded = JSON.parse(JSON.stringify(r)), next = wild();
		prepareEeveeEncounter(next, [loaded], misses);
		assert.notEqual(next.encounters[0].team[3].species, selected);
		assert.equal(next.encounters[0].team.length, 4);
	});
	it('rolls different targets independently and retains a successful but displaced target', () => {
		let either = 0, both = 0;
		for (let first = 0; first < 100; first++) for (let second = 0; second < 100; second++) {
			const r = run('Pikachu', true), n = wild();
			prepareEeveeEncounter(n, [r], rolls(first, second));
			assert.equal(n.encounters[0].team.length, first < 20 || second < 20 ? 4 : 3);
			if (n.encounters[0].team.length === 4) either++;
			if (first < 20 && second < 20) {
				both++; assert.equal(r.blessings.devotionMisses, 9);
				const next = wild(); prepareEeveeEncounter(next, [r], misses);
				assert.equal(next.encounters[0].team[3].species, 'Pikachu');
			}
		}
		assert.equal(either, 3600); assert.equal(both, 400);
	});
	it('does not spend guarantees in occupied, trainer or multi-encounter areas', () => {
		const r = run('Eevee', true); r.blessings.eeveeMisses = r.blessings.devotionMisses = 9;
		const nodes = [wild(4), { ...wild(), kind: 'trainer' }, { ...wild(), encounters: [...wild().encounters, ...wild().encounters] }];
		for (const n of nodes) prepareEeveeEncounter(n, [r], () => { throw new Error('unqualified roll'); });
		assert.equal(r.blessings.eeveeMisses, 9); assert.equal(r.blessings.devotionMisses, 9);
	});
	it('keeps the chosen species after evolution, departure or boxing', () => {
		for (const state of ['evolved', 'left', 'boxed']) {
			const r = run('Pikachu');
			if (state === 'evolved') r.team[0].set.species = 'Raichu';
			if (state === 'left') r.team = [];
			if (state === 'boxed') r.box = r.team.splice(0);
			const n = wild(); prepareEeveeEncounter(n, [r], () => 0);
			assert.equal(n.encounters[0].team[3].species, 'Pikachu');
		}
	});
	it('recovers legacy selections while keeping Fantasy identities when still available', () => {
		const r = run('Mawile-Fantasy'); delete r.blessings.owned[0].encounterSpecies;
		r.blessings.owned[0].species = 'mawile';
		let n = wild(); prepareEeveeEncounter(n, [r], () => 0);
		assert.equal(n.encounters[0].team[3].species, 'Mawile-Fantasy');
		const old = run('Pikachu'); delete old.blessings.owned[0].encounterSpecies;
		old.team[0].set.species = 'Raichu'; n = wild(); prepareEeveeEncounter(n, [old], () => 0);
		assert.equal(n.encounters[0].team[3].species, 'Pikachu');
	});
	it('does not double probability for two co-op owners of the same blessing', () => {
		let hits = 0;
		for (let roll = 0; roll < 100; roll++) {
			const a = run(), b = run(), observer = run(); observer.blessings.owned = [];
			const n = wild(); prepareEeveeEncounter(n, [a, b, observer], max => roll % max);
			if (n.encounters[0].team.length === 4) hits++;
			assert.equal(a.blessings.devotionMisses, b.blessings.devotionMisses);
			assert.equal(observer.blessings.devotionMisses, undefined);
		}
		assert.equal(hits, 20);
	});
	it('locks the actual selected form once without repeating the original gift', () => {
		const { handleBlessingCommand } = require('../../dist/server/fantasy-rogue/blessings');
		const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
		const { blessing } = require('../../dist/sim/rogue-blessing-data');
		const r = run('Mawile-Fantasy'), member = r.team[0];
		r.phase = 'blessing';
		r.blessings.owned = [{ ...blessing('devotion'), floor: 1 }];
		r.blessings.pending = [{ id: 'pick-devotion', title: '专一', kind: 'target', blessing: 'devotion', options: [member.id] }];
		const command = { action: 'blessingreward', member: 'pick-devotion', value: member.id };
		const account = { captures: {}, unlocked: [] };
		handleBlessingCommand(account, r, createPreviewContent(), command, () => 0);
		assert.equal(r.blessings.owned[0].encounterSpecies, 'Mawile-Fantasy');
		assert.equal(r.blessings.owned[0].species, 'mawile');
		const saved = structuredClone(r.blessings);
		assert.throws(() => handleBlessingCommand(account, r, createPreviewContent(), command, () => 0));
		assert.deepEqual(r.blessings, saved);
	});
	it('preserves separate co-op owner progress while sharing two same-target counters of one owner', () => {
		const a = run('Eevee', true), b = run('Eevee', true);
		a.blessings.eeveeMisses = 6; a.blessings.devotionMisses = 2;
		b.blessings.eeveeMisses = 1; b.blessings.devotionMisses = 0;
		prepareEeveeEncounter(wild(), [a, b], misses);
		assert.equal(a.blessings.eeveeMisses, 7); assert.equal(a.blessings.devotionMisses, 7);
		assert.equal(b.blessings.eeveeMisses, 2); assert.equal(b.blessings.devotionMisses, 2);
	});
	it('retains new counters and selected species through SQLite migration without changing assets', () => {
		const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
		const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
		const { content } = require('../fixtures/fantasy-rogue');
		const { randomUUID } = require('crypto');
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, content());
			engine.command('devotionqa', { id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur'] });
			store.change('devotionqa', a => {
				const r = a.run; normalizeBlessings(r);
				r.blessings.owned = run('Eevee', true).blessings.owned;
				r.blessings.eeveeMisses = r.blessings.devotionMisses = 9;
			});
			const before = store.get('devotionqa');
			for (let i = 0; i < 3; i++) engine.migrate('devotionqa');
			const after = store.get('devotionqa');
			assert.equal(after.run.blessings.devotionMisses, 9); assert.equal(after.run.blessings.eeveeMisses, 9);
			assert.equal(after.run.blessings.owned[0].encounterSpecies, 'Eevee');
			for (const key of ['team', 'bag', 'money']) assert.deepEqual(after.run[key], before.run[key]);
			for (const key of ['growthPoints', 'unlocked', 'captures']) assert.deepEqual(after[key], before[key]);
		} finally { store.close(); }
	});
});
