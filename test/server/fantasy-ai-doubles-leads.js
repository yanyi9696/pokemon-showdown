'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { rankDoublesLeads } = require('../../dist/server/fantasy-ai/doubles-leads');
const { trainerBossCandidates } = require('../../dist/server/fantasy-rogue/trainer-bosses');

describe('Fantasy doubles opening pair plans', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	const roster = (id, floor = 160) => trainerBossCandidates(floor, 50, true).find(row => row.trainer.id === id).team;
	function leads(id) {
		const team = roster(id), plan = rankDoublesLeads(team)[0];
		return { ...plan, species: plan.order.slice(0, 2).map(index => team[index].species).sort() };
	}
	it('opens a Psychic Terrain and protected Trick Room axis from Sabrina’s full roster', () => {
		const result = leads('sabrina');
		assert.deepEqual(result.species, ['Hatterene', 'Indeedee-F']);
		assert(result.reasons.includes('psychic-terrain-spread'));
		assert(result.reasons.includes('redirect-establish-core'));
	});
	it('pairs Brock’s Sand Stream with Sand Rush instead of the first two defensive members', () => {
		const result = leads('brock');
		assert.deepEqual(result.species, ['Excadrill', 'Tyranitar']);
		assert(result.reasons.includes('weather-sand-partner'));
	});
	it('pairs Torkoal and Lilligant for sun, Chlorophyll and After You Eruption', () => {
		const result = leads('flannery');
		assert.deepEqual(result.species, ['Lilligant-Hisui', 'Torkoal']);
		assert(result.reasons.includes('after-you-spread-core'));
	});
	it('gives Valerie’s screen setter an offensive partner instead of a second support', () => {
		const result = leads('valerie');
		assert.deepEqual(result.species, ['Gardevoir', 'Grimmsnarl']);
		assert(result.reasons.includes('screens-with-offense'));
	});
	it('keeps low-stat redirection support as part of the opening plan', () => {
		const team = [
			{ species: 'Garchomp', ability: 'Rough Skin', moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
			{ species: 'Dragonite', ability: 'Inner Focus', moves: ['Dragon Claw', 'Fire Punch', 'Ice Punch', 'Protect'] },
			{ species: 'Dusclops', ability: 'Frisk', moves: ['Trick Room', 'Night Shade', 'Will-O-Wisp', 'Protect'] },
			{ species: 'Amoonguss', ability: 'Regenerator', moves: ['Rage Powder', 'Spore', 'Pollen Puff', 'Protect'] },
		];
		assert.deepEqual(rankDoublesLeads(team)[0].order.slice(0, 2), [2, 3]);
	});
	it('retains an unchanged full permutation for all 174 authored rosters and leaves input sets untouched', () => {
		let count = 0;
		for (const floor of [20, 40, 60, 80, 100, 120, 140, 160, 165, 175, 180, 185, 190]) {
			for (const { team } of trainerBossCandidates(floor, 50, true)) {
				const before = structuredClone(team);
				const plans = rankDoublesLeads(team);
				assert.deepEqual(plans[0].order.slice().sort(), team.map((_, index) => index));
				assert.deepEqual(team, before);
				if (team.length === 2) assert.deepEqual(plans[0].order, [0, 1]);
				count++;
			}
		}
		assert.equal(count, 174);
	});
	it('starts the planned pair in native single-player doubles and keeps the whole bench', () => {
		const team = roster('brock');
		battle = new Battle({
			format: new Format({ name: 'Lead request reference', mod: 'gen9fantasy', gameType: 'doubles', ruleset: ['Team Preview'] }),
			seed: [1, 2, 3, 4], strictChoices: true,
			p1: { team: structuredClone(team) }, p2: { team: structuredClone(team) },
		});
		const plan = rankDoublesLeads(team)[0];
		battle.makeChoices('team 123456', `team ${plan.order.map(index => index + 1).join('')}`);
		assert.deepEqual(battle.p2.active.map(mon => mon.species.name).sort(), ['Excadrill', 'Tyranitar']);
		assert.equal(battle.p2.pokemon.length, 6);
	});
});
