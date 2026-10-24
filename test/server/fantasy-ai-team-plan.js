'use strict';
const assert = require('assert').strict;
const { Battle, Teams } = require('../../dist/sim');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { RulePolicy } = require('../../dist/server/fantasy-ai/policy');
const { emergencyChoice } = require('../../dist/server/fantasy-ai/fallback');
const { WorldBuilder } = require('../../dist/server/fantasy-ai/world');
const { reconstructWorld } = require('../../dist/server/fantasy-ai/reconstruction');
const { trainerBossCandidates } = require('../../dist/server/fantasy-rogue/trainer-bosses');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { stats, set } = require('../fixtures/fantasy-rogue');

describe('Fantasy AI own-team strategies and campaign scaling', function () {
	this.timeout(60000);
	const seed = [11, 22, 33, 44], format = 'gen9fantasyrogue';
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function setup(team, tier = 0, enemy = [set('Mew', 'Synchronize', 80, ['Protect'])]) {
		const mons = enemy.map(s => createRoguePokemon(s, stats(0), undefined, 1, undefined, { tier, floor: 160 }));
		battle = new Battle({ formatid: format, seed, fantasyRogue: { encounterId: 'plan', team: mons, boosts: stats(0), bag: {}, balls: [], catchable: false, difficulty: { tier, floor: 160 } },
			p1: { team: enemy }, p2: { team } });
		const trainer = { format, style: 'balanced', packedTeam: Teams.pack(team), keyMembers: [], resourcePreferences: ['mega', 'gmega', 'terastallize'] };
		return trainer;
	}
	function observe(tier = 0) {
		const view = new InformationView({ ownSide: 'p2', difficulty: 'normal', rogueDifficulty: { tier, floor: 160 } });
		view.receiveUpdate(battle.log.join('\n')); return view.observe(battle.p2.activeRequest);
	}
	for (const [id, allowed, field] of [
		['candice', ['Abomasnow-Fantasy'], 'snowscape'], ['flannery', ['Torkoal', 'Volcarona-Fantasy'], 'sunnyday'],
		['gardenia', ['Rillaboom'], 'grassyterrain'], ['sabrina', ['Tapu Lele-Fantasy', 'Indeedee'], 'psychicterrain'],
	]) for (const fallback of [false, true]) {
		it(`${id} opens its actual authored roster with the field setter (${fallback ? 'timeout' : 'policy'})`, () => {
			const team = trainerBossCandidates(160, 80).find(c => c.trainer.id === id).team;
			const trainer = setup(team), obs = observe();
			const decision = fallback ? { choice: emergencyChoice(obs, format, [], true) } : new RulePolicy(trainer).decide(obs, seed);
			const lead = team[Number(decision.choice[5]) - 1]; assert(allowed.includes(lead.species), JSON.stringify({ id, lead, decision }));
			assert(battle.choose('p1', 'team 1')); assert(battle.choose('p2', decision.choice));
			assert.equal(battle.field.weather || battle.field.terrain, field);
		});
	}
	it('leads with Drizzle rather than Swift Swim in a rain team, including a reordered roster', () => {
		const team = [set('Kingdra', 'Swift Swim', 80, ['Hydro Pump', 'Draco Meteor']), set('Pelipper', 'Drizzle', 80, ['Hurricane', 'U-turn', 'Roost']), set('Archaludon', 'Stamina', 80, ['Electro Shot', 'Flash Cannon'])];
		const trainer = setup(team);
		for (const choice of [new RulePolicy(trainer).decide(observe(), seed).choice, emergencyChoice(observe(), format, [], true)]) assert.equal(choice[5], '2');
	});
	it('uses webs as a lead plan when there is no weather setter', () => {
		const team = trainerBossCandidates(160, 80).find(c => c.trainer.id === 'winona').team;
		const enemy = ['Mew', 'Raikou', 'Entei', 'Starmie', 'Garchomp', 'Weavile'].map(species => set(species, 'Pressure', 80, ['Protect']));
		setup(team, 0, enemy); const choice = emergencyChoice(observe(), format, [], true); assert.equal(team[Number(choice[5]) - 1].species, 'Masquerain');
		assert(battle.choose('p1', 'team 123456')); assert(battle.choose('p2', choice));
		const trainer = { format, style: 'balanced', packedTeam: Teams.pack(team), keyMembers: [], resourcePreferences: [] };
		const decision = new RulePolicy(trainer).decide(observe(), seed);
		assert(decision.candidates.some(c => c.reasons.some(r => r.includes('hazard'))), JSON.stringify(decision));
	});
	it('sets manual rain for the whole team, then avoids wasting another turn refreshing full-duration rain', () => {
		const lead = set('Manaphy', 'Hydration', 80, ['Rain Dance', 'Surf', 'Tail Glow', 'Rest']); lead.item = 'Damp Rock';
		const team = [lead, set('Kingdra', 'Swift Swim', 80, ['Hydro Pump']), set('Ludicolo', 'Swift Swim', 80, ['Hydro Pump'])];
		const trainer = setup(team); battle.makeChoices('team 1', 'team 123');
		const decision = new RulePolicy(trainer).decide(observe(), seed);
		assert(decision.candidates.find(c => c.choice.startsWith('move 1')).reasons.includes('team-field-support'), JSON.stringify(decision));
		battle.makeChoices('move 1', 'move 1');
		const next = new RulePolicy(trainer).decide(observe(), seed); assert(!next.choice.startsWith('move 1'), JSON.stringify(next));
	});
	for (const tier of ['easy', 5]) it(`retains ${tier} scaling through AI reconstruction and Mega transformation without private foe data`, () => {
		const lead = set('Charizard', 'Blaze', 80, ['Flamethrower', 'Roost']); lead.item = 'Charizardite Y';
		const trainer = setup([lead, set('Venusaur', 'Chlorophyll', 80, ['Giga Drain'])], tier);
		battle.makeChoices('team 1', 'team 12');
		const obs = observe(tier); assert.equal(obs.initialOpponent, undefined); assert.equal(obs.fullState, undefined);
		assert.deepEqual(obs.rogueDifficulty, { tier, floor: 160 });
		const world = new WorldBuilder(trainer).build(obs)[0], copy = reconstructWorld(world, seed);
		try {
			const native = battle.p2.active[0], reconstructed = copy.sides.find(s => s.active[0].species.baseSpecies === 'Charizard').active[0];
			assert.deepEqual(reconstructed.storedStats, native.storedStats); assert.equal(reconstructed.maxhp, native.maxhp);
			battle.actions.runMegaEvo(native); copy.actions.runMegaEvo(reconstructed);
			assert.deepEqual(reconstructed.storedStats, native.storedStats); assert.equal(reconstructed.maxhp, native.maxhp);
		} finally { copy.destroy(); }
	});
});
