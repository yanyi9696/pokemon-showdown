'use strict';

const assert = require('assert').strict;
const { Battle, Teams, Dex, TeamValidator } = require('../../dist/sim');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { captureInitialTeam } = require('../../dist/server/fantasy-ai/initial-snapshot');
const { RulePolicy } = require('../../dist/server/fantasy-ai/policy');
const { RolloutPolicy } = require('../../dist/server/fantasy-ai/rollout');
const { DecisionScheduler } = require('../../dist/server/fantasy-ai/scheduler');
const { readBattleMemory } = require('../../dist/server/fantasy-ai/memory');
const { possibleMegaForms, estimateMove } = require('../../dist/server/fantasy-ai/matchup');
const { TrainerRegistry } = require('../../dist/server/fantasy-ai/trainers');
const examples = require('../fixtures/fantasy-ai-trainers.json');
const base = new TrainerRegistry(examples, { enabled: true, allowDevelopmentTrainers: true }).get(examples[0].id);
const SEED = 'gen5,0011001200130014';
const explain = result => JSON.stringify(result);

describe('Fantasy AI switch prediction, Mega and abilities', function () {
	this.timeout(30000);
	let battle, trainer, initialOpponent, policy;
	afterEach(() => { battle?.destroy(); battle = null; });
	function setup(first, foe, bench, foeBench) {
		const teams = [Teams.unpack(base.packedTeam), Teams.unpack(base.packedTeam)];
		teams[0][0] = first;
		teams[1][0] = foe;
		if (bench) teams[0][1] = bench;
		if (foeBench) teams[1][1] = foeBench;
		start(teams);
	}
	function start(teams, format = base.format) {
		trainer = { ...base, format, packedTeam: Teams.pack(teams[0]) };
		policy = new RulePolicy(trainer);
		battle = new Battle({ formatid: trainer.format, seed: SEED, p1: { team: teams[0] }, p2: { team: teams[1] } });
		initialOpponent = captureInitialTeam(battle, 'p2');
		battle.makeChoices('team 123456', 'team 123456');
	}
	function observe(difficulty = 'hard', selected) {
		const view = new InformationView({ ownSide: 'p1', difficulty, initialOpponent,
			opponentMoves: initialOpponent.map(mon => ({ species: mon.species, moves: mon.moves })) });
		view.receiveUpdate(battle.log.join('\n'));
		return view.observe(battle.p1.activeRequest, selected);
	}
	function state(view = observe()) {
		const memory = readBattleMemory(view.publicLog, Dex.forFormat(trainer.format));
		return { memory, own: policy.hypotheses.own(view.request.side.pokemon[0]),
			foe: policy.hypotheses.build(memory.sides.p2.active, view, memory)[0] };
	}
	function finishBench(start) {
		for (const side of battle.sides) {
			for (const mon of side.pokemon.slice(start)) { mon.faint(); }
		}
		battle.faintMessages();
		battle.makeRequest('move');
	}

	it('anticipates Mega Audino gaining Ghost immunity and Unaware without reading the Mega button', () => {
		setup({ species: 'Giratina', ability: 'Pressure', item: 'Leftovers', nature: 'Adamant', evs: { atk: 252 },
			moves: ['poltergeist', 'earthquake'] },
		{ species: 'Audino-Fantasy', ability: 'Regenerator', item: 'Audinite', moves: ['hypervoice', 'calmmind'] });
		finishBench(1);
		const view = observe('hard', { move: 'calmmind', baseMove: 'calmmind' });
		const { own, foe, memory } = state(view);
		const forms = possibleMegaForms(trainer.format, foe, own, memory, 'p2');
		assert.equal(forms.length, 1);
		assert(forms[0].types.includes('Normal'));
		assert.equal(forms[0].ability, 'unaware');
		assert.equal(estimateMove(trainer.format, own, forms[0], 'poltergeist', '', memory, 'p1').damage, 0);
		const before = structuredClone(view);
		const decision = policy.decide(view, SEED);
		assert(decision.choice.startsWith('move 2'), explain(decision));
		assert.deepEqual(view, before);
		memory.sides.p2.resources.mega = true;
		assert.deepEqual(possibleMegaForms(trainer.format, foe, own, memory, 'p2'), []);
	});

	for (const difficulty of ['normal', 'hard']) {
		it(`${difficulty}: can double-switch into the likely Electric immunity instead of firing into it`, () => {
			setup({ species: 'Zapdos', ability: 'Pressure', nature: 'Modest', evs: { spa: 252 }, moves: ['thunderbolt'] },
				{ species: 'Pelipper', ability: 'Drizzle', moves: ['scald'] },
				{ species: 'Ferrothorn', ability: 'Iron Barbs', moves: ['powerwhip'] },
				{ species: 'Gastrodon', ability: 'Storm Drain', moves: ['scald', 'recover'] });
			finishBench(2);
			const view = observe(difficulty, difficulty === 'hard' ? null : undefined);
			const before = structuredClone(view);
			const result = policy.decide(view, SEED);
			assert.equal(result.choice, 'switch 2', explain(result));
			assert(result.candidates.find(candidate => candidate.choice === 'switch 2').reasons.includes('double-switch'));
			assert.deepEqual(view, before);
		});
	}

	it('retains the double-switch after native turn search when the opponent switches', () => {
		setup({ species: 'Zapdos', ability: 'Pressure', nature: 'Modest', evs: { spa: 252 }, moves: ['thunderbolt'] },
			{ species: 'Pelipper', ability: 'Drizzle', moves: ['scald'] },
			{ species: 'Ferrothorn', ability: 'Iron Barbs', moves: ['powerwhip'] },
			{ species: 'Gastrodon', ability: 'Storm Drain', moves: ['scald', 'recover'] });
		finishBench(2);
		const result = new RolloutPolicy(trainer).decide(observe('hard', null), SEED, { maxRollouts: 12, budgetMs: 5000 });
		assert.equal(result.choice, 'switch 2', explain(result));
		assert.equal(result.method, 'rollout', explain(result));
	});

	it('uses native Levitate and Water Absorb immunity instead of type-only damage', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['earthquake', 'surf', 'psychic'] },
			{ species: 'Volcanion', ability: 'Water Absorb', moves: ['steameruption'] });
		const { own, foe, memory } = state();
		assert.equal(estimateMove(trainer.format, own, foe, 'surf', '', memory, 'p1').damage, 0);
		const floating = { ...foe, species: 'Pecharunt-Fantasy', ability: 'levitate', types: undefined };
		assert.equal(estimateMove(trainer.format, own, floating, 'earthquake', '', memory, 'p1').damage, 0);
	});

	it('does not value Attack setup that Unaware will ignore', () => {
		setup({ species: 'Giratina', ability: 'Pressure', moves: ['howl', 'earthquake'] },
			{ species: 'Audino-Mega-Fantasy', ability: 'Unaware', item: 'Audinite', moves: ['hypervoice'] });
		finishBench(1);
		const result = policy.decide(observe('hard', { move: 'hypervoice', baseMove: 'hypervoice' }), SEED);
		assert(result.choice.startsWith('move 2'), explain(result));
		assert(result.candidates.find(candidate => candidate.choice === 'move 1')?.reasons.includes('setup-no-damage-gain'));
	});

	it('continues real worker decisions through Toxic, Rest and Heal Bell with Dragalge and Audino', async () => {
		const definition = require('../../dist/config/fantasy-ai-trainers').Trainers.find(entry => entry.id === 'acelora-ubuu');
		const team = Teams.import(definition.team);
		[team[0], team[5]] = [team[5], team[0]];
		const foe = [
			{ species: 'Dragalge-Fantasy', ability: 'Corrosion', evs: { hp: 252, def: 252, spd: 4 },
				moves: ['toxic', 'sludgebomb', 'dragonpulse', 'protect'] },
			{ species: 'Audino-Fantasy', ability: 'Regenerator', evs: { hp: 252, def: 252, spd: 4 },
				moves: ['wish', 'healbell', 'protect', 'hypervoice'] },
			...structuredClone(team.slice(2)),
		];
		for (const roster of [team, foe]) assert.equal(new TeamValidator(definition.format).validateTeam(roster), null);
		start([team, foe], definition.format);
		battle.makeChoices('move defog', 'move toxic');
		assert.equal(battle.p1.active[0].status, 'tox');
		battle.makeChoices('move rest', 'switch 2');
		assert.equal(battle.p1.active[0].status, 'slp');
		const scheduler = new DecisionScheduler({ workers: 1, decisionMs: 3000 });
		scheduler.register('status-test', 'first');
		try {
			for (let turn = 1; turn <= 2; turn++) {
				const result = await scheduler.submit({ key: { roomId: 'status-test', instanceId: 'first', rqid: turn },
					trainer, observation: observe('hard', { move: 'healbell', baseMove: 'healbell' }), seed: SEED, maxRollouts: 6 });
				assert.equal(result.status, 'completed', explain(result));
				assert(battle.choose('p1', result.decision.choice), explain(result));
				assert(battle.choose('p2', 'move 2'));
				while (battle.requestState === 'switch') battle.makeChoices();
			}
			assert.equal(scheduler.metrics.workerErrors, 0);
		} finally { await scheduler.dispose(); }
	});

	it('clears public bench status after a team-wide cure', () => {
		const memory = readBattleMemory(['|poke|p2|Audino-Fantasy', '|poke|p2|Dragalge-Fantasy',
			'|switch|p2a: Dragalge|Dragalge-Fantasy|80/100 par', '|switch|p2a: Audino|Audino-Fantasy|90/100 brn',
			'|-cureteam|p2a: Audino|[from] move: Heal Bell'], Dex.forFormat(base.format));
		assert(memory.sides.p2.appearances.every(mon => !mon.status));
	});

	it('accounts for Thick Fat after Mega and the public wetland speed effect from replay 4635', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['flamethrower'] },
			{ species: 'Venusaur-Mega', ability: 'Thick Fat', item: 'Venusaurite', moves: ['gigadrain'] });
		const { own, foe, memory } = state();
		const probe = target => estimateMove(trainer.format, own, target, 'flamethrower', '', memory, 'p1');
		assert(probe(foe).damage < probe({ ...foe, ability: 'overgrow' }).damage * 0.6);
		const speed = probe(foe).speed;
		memory.sides.p1.conditions.weixingshidi = 1;
		assert.equal(probe(foe).speed, Math.floor(speed / 2));
	});
});
