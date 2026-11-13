'use strict';
const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { onFantasySwitchIn, onFantasyUpdate } = require('../../dist/data/mods/gen9fantasy/visuals');

describe('Rogue effective base-stat presentation', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	const set = (species, modifiers = {}, extra = {}) => ({ species, ability: 'Pressure', moves: ['Splash'],
		level: 50, nature: 'Hardy', evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
		ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, fantasyRogueModifiers: modifiers, ...extra });
	function start(ours, theirs = [set('Mew')], rogue = true) {
		battle = new Battle({ format: new Format({ name: rogue ? 'gen9fantasyrogue' : 'Unmodified Fantasy visual',
			mod: 'gen9fantasy', ruleset: [], onSwitchIn: onFantasySwitchIn, onUpdate: onFantasyUpdate }),
		seed: [1, 2, 3, 4], strictChoices: true, p1: { team: ours }, p2: { team: theirs } });
		return battle.p1.active[0];
	}
	const shown = side => battle.log.filter(line => line.startsWith(`|-start|${side}a:`) && line.includes('|roguebasestats|'))
		.at(-1)?.split('|')[4];
	it('publishes both sides from the same base-stat pipeline and excludes final-stat boosts', () => {
		const ours = start([set('Mew', { baseStats: { atk: 30 }, stats: { atk: 0.5 } })],
			[set('Mew', { baseStats: { spa: 20 } })]);
		assert.equal(shown('p1'), '100/130/100/100/100/100');
		assert.equal(shown('p2'), '100/100/100/120/100/100');
		assert.equal(ours.storedStats.atk, Math.floor((130 + 15 + 5) * 1.5));
		for (const channel of [0, 1, 2]) {
			const log = extractChannelMessages(battle.log.join('\n'), [channel])[channel].join('\n');
			assert(log.includes('|roguebasestats|100/130/100/100/100/100|'));
			assert(log.includes('|roguebasestats|100/100/100/120/100/100|'));
		}
		const before = battle.log.length; onFantasyUpdate.call(battle, ours);
		assert.equal(battle.log.length, before, 'unchanged stats do not spam the log');
	});
	it('shows the small-final multiplier, compound eligibility and fusion without mutating Dex data', () => {
		const mon = start([set('Smeargle', { smallFinal: true })]);
		assert.equal(shown('p1'), '82/30/52/30/67/112');
		const raw = structuredClone(mon.species.baseStats);
		mon.set.fantasyRogueModifiers = { fusion: { baseStats: { hp: 90, atk: 120, def: 80, spa: 60, spd: 70, spe: 100 }, types: ['Normal'] } };
		onFantasyUpdate.call(battle, mon); assert.equal(shown('p1'), '90/120/80/60/70/100');
		assert.deepEqual(mon.species.baseStats, raw);
		const mew = battle.p2.active[0];
		mew.set.fantasyRogueModifiers = { compound: true, baseStats: { atk: 30 }, compoundBonus: { atk: 30 } };
		onFantasyUpdate.call(battle, mew); assert.equal(shown('p2'), undefined, '600 BST is ineligible');
		mew.set.fantasyRogueModifiers.compoundReorganized = true;
		onFantasyUpdate.call(battle, mew); assert.equal(shown('p2'), '100/130/100/100/100/100');
	});
	it('updates the same species on modifier changes, clears reverted stats and survives restoration', () => {
		const mon = start([set('Mew', { baseStats: { atk: 30 } })]);
		mon.set.fantasyRogueModifiers.baseStats.atk = 40;
		onFantasyUpdate.call(battle, mon); assert.equal(shown('p1'), '100/140/100/100/100/100');
		// JSON restores the data marker; update hooks are functions on the format, not in Pokemon.m.
		const before = battle.log.length;
		const restored = Battle.fromJSON(JSON.stringify(battle));
		try {
			onFantasyUpdate.call(restored, restored.p1.active[0]);
			assert.equal(restored.log.length, before);
		} finally {
			restored.destroy();
		}
		delete mon.set.fantasyRogueModifiers.baseStats;
		onFantasyUpdate.call(battle, mon);
		assert(battle.log.at(-1).includes('|roguebasestats|[silent]') && battle.log.at(-1).startsWith('|-end|'));
	});
	it('keeps Illusion hidden and shows the real modified stats only after it breaks', () => {
		const mon = start([set('Zoroark', { baseStats: { atk: 40 } }, { ability: 'Illusion' }), set('Mew')]);
		assert(mon.illusion); assert.equal(shown('p1'), undefined);
		mon.illusion = null; onFantasyUpdate.call(battle, mon);
		assert.equal(shown('p1'), '60/145/60/120/60/105');
	});
	it('copies transformed effective stats without exposing IVs and removes them on switching out', () => {
		const mon = start([set('Ditto'), set('Mew')], [set('Mew', { baseStats: { spa: 30 } })]);
		assert(mon.transformInto(battle.p2.active[0])); onFantasyUpdate.call(battle, mon);
		assert.equal(shown('p1'), '48/100/100/130/100/100');
		battle.makeChoices('switch 2', 'move 1');
		assert.equal(mon.m.rogueCopiedBaseStats, undefined);
	});
	it('does not change ordinary Fantasy formats or label modified normal species as Fantasy', () => {
		start([set('Mew', { baseStats: { atk: 30 } })], undefined, false);
		assert.equal(shown('p1'), undefined);
		assert(!battle.log.some(line => line.startsWith('|-start|') && line.includes('|fantasystats|')));
	});
});
