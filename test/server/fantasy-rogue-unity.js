'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { battleUnity } = require('../../dist/sim/rogue-unity');
const { roguePowerModifiers, rogueAbilityInfo } = require('../../dist/sim/fantasy-rogue-blessings');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { syncBlessingParty, blessingView, blessingCandidates, handleBlessingCommand } = require('../../dist/server/fantasy-rogue/blessings');
const { trackJourney } = require('../../dist/server/fantasy-rogue/history');
const { preferredDifficulty } = require('../../dist/server/fantasy-rogue/difficulty');
const { set, stats, content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue unified teams and coverage', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function party(names, ids = ['unity']) {
		const run = { id: 'unity-test', floor: 1, phase: 'ready', bag: {}, money: 0, boosts: stats(0),
			team: names.map(name => createRoguePokemon(set(name, 'Run Away', 50, ['Splash']), stats(0))) };
		syncBlessingParty(run);
		run.blessings.owned = ids.map(id => ({ ...blessing(id), floor: 1, ...(id === 'unity' ? { type: 'Water' } : {}) }));
		syncBlessingParty(run);
		return run;
	}
	function begin(run) {
		const team = run.team.filter(mon => !mon.egg);
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: run.id, team: structuredClone(team), boosts: stats(0), bag: {}, balls: [],
				catchable: false, blessings: structuredClone(run.blessings) },
			p1: { team: team.map(mon => mon.set) }, p2: { team: [set('Mew', 'Run Away', 50, ['Splash'])] } });
		battle.makeChoices('team ' + team.map((_, i) => i + 1).join(''), 'team 1');
		battle.randomizer = value => value;
		return battle.p1.active[0];
	}
	function damage(type, outgoing = false, id = 'swift', power = 1) {
		const source = (outgoing ? battle.p1 : battle.p2).active[0];
		const target = (outgoing ? battle.p2 : battle.p1).active[0];
		const move = battle.dex.getActiveMove(id);
		move.type = type;
		move.willCrit = false;
		move.basePower *= power;
		battle.setActiveMove(move, source, target);
		const result = battle.actions.getDamage(source, target, move);
		battle.clearActiveMove(); return result;
	}
	function ratio(type, factor, outgoing = false, power = 1) {
		const boosted = damage(type, outgoing), owned = battle.fantasyRogue.blessings.owned;
		battle.fantasyRogue.blessings.owned = [];
		// Compare against the same base power: the damage formula adds 2 and rounds before effectiveness.
		const base = damage(type, outgoing, 'swift', power); battle.fantasyRogue.blessings.owned = owned;
		assert(Math.abs(boosted - base * factor) <= 2, `${type} ${outgoing ? 'out' : 'in'}: ${boosted}/${base}, expected ${factor}`);
	}
	it('offers unity only with two or more non-egg partners sharing a type; ignores fainting', () => {
		const eligible = names => blessingCandidates(party(names, []), content()).some(b => b.id === 'unity');
		assert(!eligible(['Squirtle'])); assert(!eligible(['Squirtle', 'Charmander']));
		assert(eligible(['Squirtle', 'Gyarados']));
		const run = party(['Squirtle', 'Gyarados', 'Charmander'], []);
		run.team[2].egg = { found: 1, hatch: 10 }; run.team[0].hp = 0;
		assert(blessingCandidates(run, content()).some(b => b.id === 'unity'));
		assert(blessingCandidates(run, content()).some(b => b.id === 'coverage' && b.tier === 'gold'));
	});
	it('asks once when several types are shared, persists the chosen type and records it in history', () => {
		const run = party(['Gyarados', 'Pelipper'], []), account = { discoveries: { blessings: [], events: [], trainers: [] } };
		run.phase = 'blessing';
		run.blessings.round = { floor: 1, tier: 'prismatic', remaining: 1, familiesSeen: [], topClearMindEligible: false,
			options: [{ id: 'unity', refreshes: 1, chosen: false }] };
		handleBlessingCommand(account, run, content(), { action: 'blessing', slot: 0 }, () => 0);
		const reward = run.blessings.pending[0]; assert.equal(reward.kind, 'unity');
		assert.deepEqual(new Set(reward.options), new Set(['Water', 'Flying']));
		trackJourney(run, account);
		assert.throws(() => handleBlessingCommand(account, run, content(), { action: 'blessingreward', member: reward.id, value: 'Fire' }, () => 0));
		const restored = JSON.parse(JSON.stringify(run));
		handleBlessingCommand(account, restored, content(), { action: 'blessingreward', member: reward.id, value: 'Water' }, () => 0);
		trackJourney(restored, account);
		assert.equal(restored.blessings.owned[0].type, 'Water');
		assert.equal(restored.journey.blessings.length, 1);
		assert(restored.journey.blessings[0].text.includes('锁定属性：水'));
		assert(blessingView(restored).owned[0].text.includes('锁定属性：水'));
		assert.throws(() => handleBlessingCommand(account, restored, content(), { action: 'blessingreward', member: reward.id, value: 'Flying' }, () => 0));
	});
	it('changes only the common type weakness component: Water/Flying receives Electric x3', () => {
		begin(party(['Gyarados', 'Squirtle']));
		ratio('Electric', 3 / 4); ratio('Rock', 1); ratio('Water', 1);
		assert.equal(damage('Dragon', false, 'dragonrage'), 40);
		assert.equal(damage('Fighting', false, 'seismictoss'), 50);
	});
	for (const count of [2, 3, 4, 5, 6]) it(`applies all cumulative thresholds at ${count} members in the native damage engine`, () => {
		begin(party(Array(count).fill('Squirtle')));
		const enemy = battle.p2.active[0];
		const power = count >= 6 ? 1.5 : 1;
		assert.equal(roguePowerModifiers(battle.p1.active[0], battle.dex.getActiveMove('watergun')).find(m => m.source === '统一队爱好者')?.factor || 1, power);
		ratio('Electric', 0.75); ratio('Fire', count >= 4 ? 0.5 : 1);
		enemy.setType(['Grass', 'Dragon']);
		ratio('Water', count >= 3 ? 2.25 : 1, true, power);
		enemy.setType(['Fire', 'Ground']);
		ratio('Water', count >= 5 ? 2.25 : 1, true, power);
		enemy.setType(['Normal']); ratio('Water', 1, true, power);
		assert.equal(damage('Dragon', true, 'dragonrage'), 40);
	});
	it('preserves immunity, counts fainted allies and suspends/restores without changing the lock', () => {
		const mon = begin(party(['Swampert', 'Squirtle', 'Squirtle', 'Squirtle']));
		assert.equal(damage('Electric'), false);
		battle.p1.pokemon[1].hp = 0; battle.p1.pokemon[1].fainted = true;
		assert.equal(battleUnity(mon).count, 4); ratio('Fire', 0.5);
		battle.p1.pokemon[2].setType(['Normal']); assert(!battleUnity(mon).active); ratio('Fire', 1);
		battle.p1.pokemon[2].setType(['Water']); assert(battleUnity(mon).active); ratio('Fire', 0.5);
		assert.equal(battleUnity(battle.p2.active[0]).active, false);
		const json = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(json);
		battle.randomizer = value => value;
		assert.equal(battleUnity(battle.p1.active[0]).type, 'Water'); ratio('Fire', 0.5);
	});
	it('boosts coverage base power but never STAB, forced STAB, fixed damage or status moves', () => {
		const mon = begin(party(['Squirtle', 'Squirtle'], ['coverage']));
		battle.p2.active[0].setType(['Normal']); ratio('Fire', 1.3, true); ratio('Water', 1, true);
		const move = battle.dex.getActiveMove('flamethrower');
		assert(roguePowerModifiers(mon, move).some(m => m.source === '补盲好手' && m.factor === 1.3));
		move.forceSTAB = true; assert(!roguePowerModifiers(mon, move).some(m => m.source === '补盲好手'));
		assert.equal(damage('Dragon', true, 'dragonrage'), 40);
		assert.deepEqual(roguePowerModifiers(mon, battle.dex.getActiveMove('splash')), []);
		mon.terastallized = 'Fire'; ratio('Water', 1, true); ratio('Fire', 1, true);
	});
	it('falls back from hidden locked preferences without changing active run difficulty', () => {
		const account = { preferredDifficulty: 3, difficulties: { highest: 1, cleared: ['0'], spirits: [] }, run: { difficulty: 3 } };
		assert.equal(preferredDifficulty(account), undefined); assert.equal(account.run.difficulty, 3);
		account.preferredDifficulty = 1; assert.equal(preferredDifficulty(account), 1);
		account.preferredDifficulty = 0; assert.equal(preferredDifficulty(account), 0);
	});
	it('previews the actual type of variable-type moves with both new blessings', () => {
		const run = party(Array(6).fill('Squirtle'), ['unity', 'coverage']);
		run.team[0].set.moves = ['weatherball'];
		const mon = begin(run), types = rogueAbilityInfo(mon).moves.weatherball.types;
		assert(types.Fire.some(m => m.source === '补盲好手' && m.factor === 1.3));
		assert(!types.Water.some(m => m.source === '补盲好手'));
		assert(types.Water.some(m => m.source === '统一队爱好者' && m.factor === 1.5));
	});
});
