'use strict';

const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { DoublesDamageModel } = require('../../dist/server/fantasy-ai/doubles-mechanics');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');
const { enumerateDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-actions');

describe('Fantasy doubles isolated joint turn', () => {
	const battles = [];
	afterEach(() => { for (const battle of battles.splice(0)) battle.destroy(); });
	const set = (species, moves = ['Splash'], extra = {}) => ({
		species, moves, ability: '', level: 50, nature: 'Serious',
		evs: { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 }, ...extra,
	});
	function create(own, foes) {
		const battle = new Battle({
			format: new Format({ name: 'Joint-turn reference', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
			strictChoices: true, seed: [1, 2, 3, 4], p1: { team: own }, p2: { team: foes },
		});
		battles.push(battle);
		return battle;
	}
	function snapshot(battle) {
		return {
			mod: 'gen9fantasy', turn: battle.turn,
			pokemon: battle.sides.flatMap(side => side.pokemon.map((mon, index) => ({
				id: index < 2 ? `${side.id}${index ? 'b' : 'a'}` : `${side.id}-reserve-${index}`,
				side: side.id, position: index < 2 ? `${side.id}${index ? 'b' : 'a'}` : undefined,
				species: mon.species.name, level: mon.level, health: mon.hp / mon.maxhp,
				stats: { hp: mon.maxhp, ...mon.storedStats }, ability: mon.ability, item: mon.item,
				moves: mon.moves.slice(), types: mon.types.slice(), teraType: mon.teraType,
				terastallized: mon.terastallized, status: mon.status, boosts: { ...mon.boosts },
				volatiles: Object.keys(mon.volatiles), activeActions: mon.activeMoveActions,
				lastMove: mon.lastMove?.id,
			}))),
			weather: battle.field.weather, terrain: battle.field.terrain,
			trickRoom: !!battle.field.pseudoWeather.trickroom,
			magicRoom: !!battle.field.pseudoWeather.magicroom,
			conditions: { p1: Object.keys(battle.p1.sideConditions), p2: Object.keys(battle.p2.sideConditions) },
		};
	}
	const move = (actor, id, target, transform) => ({ actor, kind: 'move', move: id, target, transform });
	function project(battle, actions) {
		const model = new DoublesDamageModel(snapshot(battle));
		const result = model.projectTurn(actions);
		assert.deepEqual(model.diagnostics.turnFailures, []);
		assert.equal(result.samples.length, 2);
		return result.samples;
	}
	const foes = () => [set('Blastoise'), set('Blastoise')];
	const idle = () => [move('p2a', 'splash'), move('p2b', 'splash')];
	function rankTurn(battle, extraLog = []) {
		const request = structuredClone(battle.p1.activeRequest);
		for (const active of request.active) delete active.canTerastallize;
		return rankDoublesChoices({
			ownSide: 'p1', difficulty: 'normal', request,
			publicLog: [...extractChannelMessages(battle.log.join('\n'), [0])[0], ...extraLog],
		}, 'gen9fantasy', [], false, undefined, true);
	}

	it('executes Protect and allied Earthquake together, matching the native full turn', () => {
		const battle = create([set('Garchomp', ['Earthquake']), set('Gardevoir', ['Protect'])], foes());
		const results = project(battle, [move('p1a', 'earthquake'), move('p1b', 'protect'), ...idle()]);
		for (const result of results) {
			assert.equal(result.pokemon.p1b.health, 1);
			assert(result.pokemon.p2a.health < 1 && result.pokemon.p2b.health < 1);
			assert.equal(result.interrupted, false);
		}
		battle.randomizer = base => base;
		battle.randomChance = (n, d) => d !== 24 && n > 0;
		battle.makeChoices('move 1, move 1', 'move 1, move 1');
		for (const side of battle.sides) for (const [index, mon] of side.active.entries()) {
			assert.equal(results[1].pokemon[`${side.id}${index ? 'b' : 'a'}`].health, mon.hp / mon.maxhp);
		}
	});
	it('cancels a knocked-out attacker instead of adding its theoretical damage', () => {
		const battle = create([set('Charizard', ['Flamethrower']), set('Magikarp')],
			[set('Scizor', ['X-Scissor']), set('Magikarp')]);
		battle.p2.active[0].hp = 1;
		const result = project(battle, [move('p1a', 'flamethrower', 'p2a'), move('p1b', 'splash'),
			move('p2a', 'xscissor', 'p1a'), move('p2b', 'splash')]);
		for (const sample of result) {
			assert(sample.pokemon.p2a.fainted);
			assert.equal(sample.pokemon.p1a.health, 1);
			assert(!sample.moves.some(action => action.move === 'xscissor'));
		}
	});
	it('moves a slow Eruption immediately after After You under sun', () => {
		const battle = create([
			set('Lilligant-Hisui', ['After You', 'Splash'], { ability: 'Chlorophyll' }),
			set('Torkoal', ['Eruption'], { ability: 'Drought' }),
		], [set('Garchomp', ['Earth Power']), set('Blastoise')]);
		const opponents = [move('p2a', 'earthpower', 'p1b'), move('p2b', 'splash')];
		const assisted = project(battle, [move('p1a', 'afteryou', 'p1b'), move('p1b', 'eruption'), ...opponents]);
		const slow = project(battle, [move('p1a', 'splash'), move('p1b', 'eruption'), ...opponents]);
		for (const [index, sample] of assisted.entries()) {
			assert.deepEqual(sample.moves.slice(0, 2).map(action => action.move), ['afteryou', 'eruption']);
			assert(sample.pokemon.p2b.health < slow[index].pokemon.p2b.health);
		}
	});
	it('updates the remaining action order immediately after Prankster Tailwind', () => {
		const battle = create([set('Tornadus', ['Tailwind'], { ability: 'Prankster' }), set('Metagross', ['Iron Head'])],
			[set('Garchomp', ['Dragon Claw']), set('Blastoise')]);
		const result = project(battle, [move('p1a', 'tailwind'), move('p1b', 'ironhead', 'p2a'),
			move('p2a', 'dragonclaw', 'p1a'), move('p2b', 'splash')]);
		for (const sample of result) {
			assert.deepEqual(sample.moves.slice(0, 2).map(action => action.move), ['tailwind', 'ironhead']);
			assert(sample.conditions.p1.includes('tailwind'));
		}
	});
	it('uses Follow Me to protect an ally from a targeted attack', () => {
		const battle = create([set('Togekiss', ['Follow Me']), set('Torkoal')],
			[set('Pikachu', ['Thunderbolt']), set('Blastoise')]);
		for (const sample of project(battle, [move('p1a', 'followme'), move('p1b', 'splash'),
			move('p2a', 'thunderbolt', 'p1b'), move('p2b', 'splash')])) {
			assert.equal(sample.pokemon.p1b.health, 1);
			assert(sample.pokemon.p1a.health < 1);
		}
	});
	it('lets Fake Out prevent Taunt while the partner establishes Trick Room', () => {
		const battle = create([set('Incineroar', ['Fake Out']), set('Hatterene', ['Trick Room'])],
			[set('Murkrow', ['Taunt'], { ability: 'Prankster' }), set('Magikarp')]);
		for (const sample of project(battle, [move('p1a', 'fakeout', 'p2a'), move('p1b', 'trickroom'),
			move('p2a', 'taunt', 'p1b'), move('p2b', 'splash')])) {
			assert(sample.trickRoom);
			assert(!sample.moves.some(action => action.move === 'taunt'));
		}
	});
	it('makes Trick Room reverse the existing field rather than refreshing it', () => {
		const battle = create([set('Dusclops', ['Trick Room']), set('Magikarp')], foes());
		battle.field.addPseudoWeather('trickroom', battle.p1.active[0]);
		for (const sample of project(battle, [move('p1a', 'trickroom'), move('p1b', 'splash'), ...idle()])) {
			assert.equal(sample.trickRoom, false);
		}
	});
	it('reconstructs Magic Room for Ability Shield in both damage and complete-turn projections', () => {
		const battle = create([set('Haxorus', ['Earthquake'], { ability: 'Mold Breaker' }), set('Magikarp')],
			[set('Rotom', ['Splash'], { ability: 'Levitate', item: 'Ability Shield' }), set('Magikarp')]);
		const actions = [move('p1a', 'earthquake'), move('p1b', 'splash'), ...idle()];
		const shielded = new DoublesDamageModel(snapshot(battle)).project('p1a', 'earthquake');
		assert.equal(shielded.damage.p2a || 0, 0);
		assert(project(battle, actions).every(sample => sample.pokemon.p2a.health === 1));
		battle.field.addPseudoWeather('magicroom', battle.p1.active[0]);
		const unshielded = new DoublesDamageModel(snapshot(battle)).project('p1a', 'earthquake');
		assert(unshielded.damage.p2a > 0);
		assert(project(battle, actions).every(sample => sample.magicRoom && sample.pokemon.p2a.health < 1));
		battle.makeChoices('move 1, move 1', 'move 1, move 1');
		assert(battle.p2.active[0].hp < battle.p2.active[0].maxhp);
	});
	it('removes Magic Room when the move toggles an existing field off', () => {
		const battle = create([set('Dusclops', ['Magic Room']), set('Magikarp')], foes());
		battle.field.addPseudoWeather('magicroom', battle.p1.active[0]);
		for (const sample of project(battle, [move('p1a', 'magicroom'), move('p1b', 'splash'), ...idle()])) {
			assert.equal(sample.magicRoom, false);
		}
	});
	it('tests Sucker Punch against the hypothetical reply, not a guaranteed attack', () => {
		const battle = create([set('Kingambit', ['Sucker Punch']), set('Magikarp')],
			[set('Slowbro', ['Water Gun', 'Slack Off']), set('Magikarp')]);
		const attack = project(battle, [move('p1a', 'suckerpunch', 'p2a'), move('p1b', 'splash'),
			move('p2a', 'watergun', 'p1a'), move('p2b', 'splash')]);
		const status = project(battle, [move('p1a', 'suckerpunch', 'p2a'), move('p1b', 'splash'),
			move('p2a', 'slackoff'), move('p2b', 'splash')]);
		assert(attack.every(sample => sample.pokemon.p2a.health < 1));
		assert(status.every(sample => sample.pokemon.p2a.health === 1));
	});
	it('marks U-turn requiring a reserve choice as incomplete instead of pretending to finish the turn', () => {
		const battle = create([set('Scizor', ['U-turn']), set('Magikarp'), set('Squirtle')], foes());
		const result = project(battle, [move('p1a', 'uturn', 'p2a'), move('p1b', 'splash'), ...idle()]);
		assert(result.every(sample => sample.interrupted));
	});
	it('executes Mega Drought before Solar Beam and preserves the detached inputs and live RNG', () => {
		const battle = create([set('Charizard', ['Solar Beam'], { item: 'Charizardite Y', ability: 'Blaze' }), set('Magikarp')],
			foes());
		const input = snapshot(battle), before = structuredClone(input), seed = battle.prng.getSeed();
		const model = new DoublesDamageModel(input);
		const actions = [move('p1a', 'solarbeam', 'p2a', 'mega'), move('p1b', 'splash'), ...idle()];
		const result = model.projectTurn(actions);
		assert.deepEqual(model.diagnostics.turnFailures, []);
		assert(result.samples.every(sample => sample.weather === 'sunnyday' && sample.pokemon.p2a.health < 1));
		assert.strictEqual(model.projectTurn(actions), result);
		assert.equal(model.diagnostics.turnProbes, 2);
		assert.deepEqual(input, before);
		assert.deepEqual(battle.prng.getSeed(), seed);
		assert.equal(battle.p1.active[0].species.name, 'Charizard');
	});
	it('retains the public consecutive-Protect penalty in the native turn model', () => {
		const battle = create([set('Pikachu', ['Protect']), set('Magikarp')],
			[set('Garchomp', ['Dragon Rage']), set('Magikarp')]);
		const input = snapshot(battle);
		input.pokemon[0].protectStreak = 5;
		const model = new DoublesDamageModel(input);
		const result = model.projectTurn([move('p1a', 'protect'), move('p1b', 'splash'),
			move('p2a', 'dragonrage', 'p1a'), move('p2b', 'splash')]);
		assert.deepEqual(model.diagnostics.turnFailures, []);
		assert(result.samples.some(sample => sample.pokemon.p1a.health < 1), 'repeated protection is not guaranteed');
	});
	it('ranks After You Eruption by actual execution order without reading the opponent request', () => {
		const battle = create([
			set('Lilligant-Hisui', ['After You', 'Protect'], { ability: 'Chlorophyll' }),
			set('Torkoal', ['Eruption'], { ability: 'Drought' }),
		], [set('Garchomp', ['Earth Power']), set('Blastoise')]);
		const scored = rankTurn(battle, ['|move|p2a: Garchomp|Earth Power|p1b: Torkoal']);
		assert(scored[0].jointTurn);
		assert.equal(scored[0].choice, 'move 1 -2, move 1');
		assert(scored[0].reasons.includes('joint-turn-public-hypotheses'));
		assert.deepEqual(scored[0].mechanics.turnFailures, []);
	});
	it('does not apply an incomplete U-turn forecast as a full-turn ranking', () => {
		const battle = create([set('Scizor', ['U-turn']), set('Magikarp'), set('Squirtle')], foes());
		const scored = rankTurn(battle);
		assert.equal(scored[0].mechanics.turnProbes, 2, 'stop after the first incomplete two-sample hypothesis');
		assert.equal(scored[0].jointTurn, undefined);
		assert.deepEqual(scored[0].mechanics.turnFailures, []);
	});
	it('rejects omitted public state before spending any joint-turn simulation budget', () => {
		const battle = create([set('Blastoise', ['Surf']), set('Magikarp')], foes());
		battle.p1.active[0].addVolatile('aquaring');
		const model = new DoublesDamageModel(snapshot(battle));
		assert(model.hasIncompleteTurnState());
		const scored = rankTurn(battle);
		assert.equal(scored[0].mechanics.turnProbes, 0);
		assert.equal(scored[0].jointTurn, undefined);
	});
	it('preserves the move/switch fallback ranking while skipping all discarded turn forecasts', () => {
		const battle = create([set('Garchomp', ['Earthquake']), set('Gardevoir', ['Protect']), set('Pikachu')], foes());
		const request = structuredClone(battle.p1.activeRequest);
		for (const active of request.active) delete active.canTerastallize;
		const observation = { ownSide: 'p1', difficulty: 'normal', request,
			publicLog: extractChannelMessages(battle.log.join('\n'), [0])[0] };
		const candidates = enumerateDoublesChoices(request, { foes: [1, 2], allowSwitch: true })
			.filter(choice => ['move 1, move 1', 'switch 3, move 1'].includes(choice.choice));
		assert.equal(candidates.length, 2);
		const base = rankDoublesChoices(observation, 'gen9fantasy', [], true, candidates, false);
		const native = rankDoublesChoices(observation, 'gen9fantasy', [], true, candidates, true);
		const decisions = rows => rows.map(({ choice, score, reasons }) => ({ choice, score, reasons }));
		assert.deepEqual(decisions(native), decisions(base));
		assert.equal(native[0].mechanics.turnProbes, 0);
		assert.equal(native[0].jointTurn, undefined);
	});
	it('applies publicly counted toxic residual damage without an undefined native counter', () => {
		const battle = create([set('Garchomp'), set('Magikarp')], foes());
		battle.p1.active[0].setStatus('tox');
		battle.p1.active[0].statusState.stage = 2;
		const input = snapshot(battle);
		input.pokemon[0].toxicStage = 2;
		const model = new DoublesDamageModel(input);
		const result = model.projectTurn([move('p1a', 'splash'), move('p1b', 'splash'), ...idle()]);
		assert.deepEqual(model.diagnostics.turnFailures, []);
		battle.makeChoices('move 1, move 1', 'move 1, move 1');
		const expected = battle.p1.active[0].hp / battle.p1.active[0].maxhp;
		assert(result.samples.every(sample => sample.pokemon.p1a.health === expected));
		assert(expected < 1);
	});
	it('samples possible sleep wake-up turns instead of reading the private duration', () => {
		const battle = create([set('Garchomp', ['Dragon Rage']), set('Magikarp')], foes());
		battle.p1.active[0].setStatus('slp');
		const input = snapshot(battle);
		input.pokemon[0].sleepTurns = 1;
		const model = new DoublesDamageModel(input);
		const result = model.projectTurn([move('p1a', 'dragonrage', 'p2a'), move('p1b', 'splash'), ...idle()]);
		assert.deepEqual(model.diagnostics.turnFailures, []);
		assert(result.samples[0].pokemon.p2a.health < 1);
		assert.equal(result.samples[1].pokemon.p2a.health, 1);
	});
	it('resolves a native switch and its weather before the partner attacks', () => {
		const battle = create([
			set('Torkoal', ['Splash'], { ability: 'Drought' }), set('Ludicolo', ['Surf']),
			set('Pelipper', ['Splash'], { ability: 'Drizzle' }),
		], foes());
		const result = project(battle, [{ actor: 'p1a', kind: 'switch', reserve: 'p1-reserve-2' },
			move('p1b', 'surf'), ...idle()]);
		assert(result.every(sample => sample.weather === 'raindance'));
		assert(result.every(sample => sample.pokemon.p1a.health === 1 && sample.pokemon['p1-reserve-2'].health < 1));
	});
	it('runs a Z attack immediately and a Max attack with a single Dynamax activation', () => {
		for (const transform of ['zmove', 'dynamax']) {
			const battle = create([set('Charizard', ['Fly'], { item: 'Flyinium Z' }), set('Magikarp')], foes());
			const result = project(battle, [move('p1a', 'fly', 'p2a', transform), move('p1b', 'splash'), ...idle()]);
			assert(result.every(sample => sample.pokemon.p2a.health < 1));
			assert(result.every(sample => !sample.interrupted));
		}
	});
	it('does not merge the two native Multi seats’ independently legal Mega permissions', () => {
		const battle = create([
			set('Gardevoir', ['Protect'], { item: 'Gardevoirite', ability: 'Synchronize' }),
			set('Blastoise', ['Aura Sphere'], { item: 'Blastoisinite', ability: 'Torrent' }),
		], foes());
		const both = project(battle, [move('p1a', 'protect', undefined, 'mega'),
			move('p1b', 'aurasphere', 'p2a', 'mega'), ...idle()]);
		const secondOnly = project(battle, [move('p1a', 'protect'), move('p1b', 'aurasphere', 'p2a', 'mega'), ...idle()]);
		assert.deepEqual(both.map(sample => sample.pokemon.p2a.health), secondOnly.map(sample => sample.pokemon.p2a.health));
	});
});
