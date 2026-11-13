'use strict';
const assert = require('assert').strict;
const { Dex, toID } = require('../../dist/sim/dex');
const { Teams } = require('../../dist/sim/teams');
const { Battle } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { trainerBossCandidates } = require('../../dist/server/fantasy-rogue/trainer-bosses');
const { TrainerBossDoublesAuthored } = require('../../dist/server/fantasy-rogue/trainer-boss-doubles-authored');
const { TrainerBossDoublesHighTier } = require('../../dist/server/fantasy-rogue/trainer-boss-doubles-high-tier');
const { TrainerBossDoublesSamples } = require('../../dist/server/fantasy-rogue/trainer-boss-doubles-samples');
const { set } = require('../fixtures/fantasy-rogue');
const dex = Dex.mod('gen9fantasy');
const team = (id, floor) => trainerBossCandidates(floor, 50, true).find(entry => entry.trainer.id === id).team;
const mon = (id, floor, species) => team(id, floor).find(member => toID(member.species) === toID(species));

describe('Fantasy Rogue authored doubles training', () => {
	it('exports complete legal training for all 630 authored mid/late-tier member entries', () => {
		let trained = 0;
		for (const [key, text] of Object.entries({ ...TrainerBossDoublesAuthored, ...TrainerBossDoublesHighTier })) {
			if (Number(key.split(':')[1]) < 60) continue;
			for (const member of Teams.import(text)) {
				assert.equal(Object.values(member.evs).reduce((a, b) => a + b, 0), 508, `${key}: ${member.species}`);
				assert(Object.values(member.evs).every(value => Number.isInteger(value) && value >= 0 && value <= 252));
				assert(dex.natures.get(member.nature).plus, `${key}: needs an intentional nature`);
				trained++;
			}
		}
		assert.equal(trained, 630);
	});
	it('keeps all early leaders untrained and preserves the supplied sample configurations at every tier', () => {
		for (const floor of [20, 40]) for (const entry of trainerBossCandidates(floor, 50, true)) {
			for (const member of entry.team) {
				assert(!Object.values(member.evs || {}).some(value => value));
				assert.equal(member.item, '');
				assert.equal(member.nature, 'Hardy');
			}
		}
		for (const [key, source] of Object.entries(TrainerBossDoublesSamples)) {
			const [id, floor] = key.split(':');
			const actual = team(id, Number(floor)), imported = Teams.import(source.team);
			for (const [index, member] of imported.entries()) {
				assert.deepEqual(actual[index].evs, member.evs, key);
				assert.deepEqual(actual[index].ivs, member.ivs, key);
				assert.equal(actual[index].nature, member.nature || 'Hardy', key);
			}
		}
	});
	it('distinguishes offensive and defensive Corviknight and the two Raichu roles', () => {
		assert.equal(mon('bea', 160, 'Corviknight-Fantasy').evs.atk, 252);
		assert.equal(mon('larry', 180, 'Corviknight-Fantasy').evs.def, 252);
		assert.equal(mon('larry', 180, 'Corviknight-Fantasy').evs.atk, 0);
		assert.equal(mon('iono', 60, 'Raichu').evs.hp, 252);
		assert.equal(mon('iono', 100, 'Raichu').evs.spa, 252);
	});
	it('keeps deliberate slow-mode attackers and setters slow while preserving fast-mode partners', () => {
		for (const [id, floor, species] of [
			['sabrina', 160, 'Hatterene'], ['sabrina', 160, 'Cresselia-Fantasy'],
			['jasmine', 160, 'Bronzong'], ['jasmine', 160, 'Melmetal-Fantasy'],
			['larry', 160, 'Ursaluna-Bloodmoon'], ['acerola', 185, 'Marowak-Alola-Totem-Fantasy'],
		]) {
			const member = mon(id, floor, species);
			assert(member, `${id}:${floor} ${species}`);
			assert.equal(member.ivs.spe, 0);
			assert.equal(member.evs.spe, 0);
			assert.equal(dex.natures.get(member.nature).minus, 'spe');
		}
		assert.equal(mon('sabrina', 160, 'Alakazam').evs.spe, 252);
		assert.equal(mon('larry', 160, 'Staraptor').evs.spe, 252);
	});
	it('uses the sun After You speed axis and a naturally slow Torkoal in a native battle', () => {
		const tortoise = mon('flannery', 160, 'Torkoal'), lily = mon('flannery', 160, 'Lilligant-Hisui');
		const dragon = { ...set('Dragapult', 'Clear Body', 50, ['Splash']), nature: 'Jolly',
			evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 } };
		const battle = new Battle({ format: new Format({ name: 'Doubles training speed', mod: 'gen9fantasy',
			gameType: 'doubles', ruleset: [] }), seed: [156, 1, 1, 1],
		p1: { name: 'QA', team: [dragon, set('Blissey', 'Natural Cure', 50, ['Splash'])] },
		p2: { name: 'Sun', team: [tortoise, lily] } });
		try {
			assert.equal(battle.field.weather, 'sunnyday');
			assert(battle.p2.active[1].getStat('spe') > battle.p1.active[0].getStat('spe'));
			assert.equal(battle.p2.active[0].storedStats.spe, 22);
		} finally { battle.destroy(); }
	});
});
