'use strict';

const assert = require('assert').strict;
const { Battle, Dex, Teams } = require('../../dist/sim');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { captureInitialMoves, captureInitialTeam } = require('../../dist/server/fantasy-ai/initial-snapshot');
const { captureOpponentChoice, matchesOpponentMove } = require('../../dist/server/fantasy-ai/opponent-choice');
const { HypothesisBuilder } = require('../../dist/server/fantasy-ai/hypotheses');
const { HypotheticalSets } = require('../../dist/server/fantasy-ai/sets');
const { WorldBuilder } = require('../../dist/server/fantasy-ai/world');
const { RulePolicy } = require('../../dist/server/fantasy-ai/policy');
const { RolloutPolicy } = require('../../dist/server/fantasy-ai/rollout');
const { enumerateRequestChoices } = require('../../dist/server/fantasy-ai/actions');
const { readBattleMemory } = require('../../dist/server/fantasy-ai/memory');
const { TrainerRegistry } = require('../../dist/server/fantasy-ai/trainers');
const examples = require('../fixtures/fantasy-ai-trainers.json');
const trainer = new TrainerRegistry(examples, { enabled: true, allowDevelopmentTrainers: true }).get(examples[0].id);
const dex = Dex.forFormat(trainer.format);
const seed = 'gen5,0011001200130014';

describe('Fantasy AI authorized move information', function () {
	this.timeout(20000);
	let battle;
	let moves;
	let initial;
	function create(opponent = {}) {
		const ownTeam = Teams.unpack(trainer.packedTeam);
		const other = Teams.unpack(trainer.packedTeam);
		other[0] = { ...other[0], moves: ['Ice Beam', 'Thunderbolt', 'Soft-Boiled', 'Stealth Rock'], ...opponent };
		battle = new Battle({ formatid: trainer.format, seed, p1: { team: ownTeam }, p2: { team: other } });
		moves = captureInitialMoves(battle, 'p2');
		initial = captureInitialTeam(battle, 'p2');
		battle.makeChoices();
	}
	function observe(difficulty = 'normal', selected) {
		const view = new InformationView(difficulty === 'normal' ?
			{ ownSide: 'p1', difficulty, opponentMoves: moves } :
			{ ownSide: 'p1', difficulty, initialOpponent: initial });
		view.receiveUpdate(battle.log.join('\n'));
		return view.observe(battle.p1.activeRequest, selected);
	}
	afterEach(() => battle?.destroy());

	it('gives normal mode exactly the entire team moves, without other private configuration or slot order', () => {
		create();
		const observation = observe();
		assert.equal(observation.opponentMoves.length, 6);
		assert(observation.opponentMoves.every(mon => Object.keys(mon).sort().join(',') === 'moves,species'));
		assert.deepEqual(observation.opponentMoves.find(mon => mon.species === 'Mew').moves,
			['icebeam', 'softboiled', 'stealthrock', 'thunderbolt']);
		assert.equal(observation.initialOpponent, undefined);
		assert.equal(observation.opponentMove, undefined);
		const reverse = new InformationView({ ownSide: 'p1', difficulty: 'normal', opponentMoves: moves.slice().reverse() });
		assert.deepEqual(reverse.observe(battle.p1.activeRequest).opponentMoves, observation.opponentMoves);
	});

	it('copies move snapshots and admits selected moves only through the hard-mode whitelist', () => {
		create();
		const view = new InformationView({ ownSide: 'p1', difficulty: 'normal', opponentMoves: moves });
		const before = view.observe(battle.p1.activeRequest);
		moves[0].moves.push('forbidden');
		const selected = { move: 'icebeam', baseMove: 'icebeam', target: 'forbidden', hp: 123 };
		assert.deepEqual(view.observe(battle.p1.activeRequest, selected), before);
		const hard = observe('hard', selected);
		assert.deepEqual(hard.opponentMove, { move: 'icebeam', baseMove: 'icebeam', event: undefined });
		selected.baseMove = 'forbidden';
		assert.equal(hard.opponentMove.baseMove, 'icebeam');
		before.opponentMoves[0].moves.push('another');
		assert(!JSON.stringify(view.observe(battle.p1.activeRequest)).includes('another'));
	});

	it('uses known moves in every normal hypothesis and every reconstructed reserve', () => {
		create();
		const observation = observe();
		const memory = readBattleMemory(observation.publicLog, dex);
		const hypotheses = new HypothesisBuilder(trainer.format).build(memory.sides.p2.active, observation, memory);
		const expected = moves.find(mon => mon.species === 'Mew').moves;
		assert(hypotheses.every(mon => mon.movesKnown && mon.moves.slice().sort().join(',') === expected.join(',')));
		const worlds = new WorldBuilder(trainer).build(observation);
		assert(worlds.length > 0);
		for (const world of worlds) {
			assert.deepEqual(world.opponentMoves, moves);
			for (const member of world.teams.p2) {
				assert.deepEqual(member.set.moves.map(toID).sort(), moves.find(mon => mon.species === member.set.species).moves);
			}
		}
	});

	it('does not invent a fourth move or silently delete a known move to legalize a guessed set', () => {
		create({ moves: ['Ice Beam', 'Thunderbolt', 'Soft-Boiled'] });
		const observation = observe();
		const memory = readBattleMemory(observation.publicLog, dex);
		const profile = new HypothesisBuilder(trainer.format).build(memory.sides.p2.active, observation, memory)[0];
		assert.equal(profile.moves.length, 3);
		const sets = new HypotheticalSets(trainer.format);
		const impossible = { ...profile, moves: ['icebeam', 'doubleironbash'] };
		assert.throws(() => sets.create(impossible, false, 0, [], { moves: true }), /no-legal-configuration/);
	});

	it('reads only accepted selections and clears them on undo and non-move phases', () => {
		create();
		assert.equal(captureOpponentChoice(battle, 'p2').ready, false);
		assert.equal(battle.choose('p2', 'move 999'), false);
		assert.equal(captureOpponentChoice(battle, 'p2').ready, false);
		battle.choose('p2', 'move 1');
		assert.deepEqual(captureOpponentChoice(battle, 'p2', 7), {
			version: 7, ready: true, move: { move: 'icebeam', baseMove: 'icebeam', event: undefined },
		});
		battle.undoChoice('p2');
		assert.equal(captureOpponentChoice(battle, 'p2').ready, false);
		battle.choose('p2', 'switch 2');
		assert.deepEqual(captureOpponentChoice(battle, 'p2'), { version: 0, ready: true, move: null });
		battle.undoChoice('p2');
		battle.p2.active[0].switchFlag = true;
		battle.makeRequest('switch');
		assert.deepEqual(captureOpponentChoice(battle, 'p2'), { version: 0, ready: true });
	});

	for (const move of ['Thunderbolt', 'Protect']) {
		it(`maps the selected Z-${move} by identity even when move order differs`, () => {
			create({ item: move === 'Protect' ? 'Normalium Z' : 'Electrium Z', moves: [move, 'Ice Beam'] });
			battle.choose('p2', 'move 1 zmove');
			const selected = captureOpponentChoice(battle, 'p2').move;
			assert.equal(selected.event, 'zmove');
			const request = structuredClone(battle.p2.activeRequest);
			request.active[0].moves.reverse();
			request.active[0].canZMove.reverse();
			assert(matchesOpponentMove(request, 'move 2 zmove', selected));
			assert(!matchesOpponentMove(request, 'move 1 zmove', selected));
			assert(!matchesOpponentMove(request, 'move 2', selected));
		});
	}

	it('changes hard-mode switch danger for the submitted attack while normal mode ignores it', () => {
		create();
		const policy = new RulePolicy(trainer);
		const observation = observe('hard');
		const excluded = enumerateRequestChoices(observation.request).filter(choice => !['move 1', 'switch 2'].includes(choice));
		const score = selected => policy.decide({ ...observation, opponentMove: {
			move: selected, baseMove: selected,
		} }, seed, excluded, { quick: true });
		const thunderbolt = score('thunderbolt');
		const icebeam = score('icebeam');
		const switching = decision => decision.candidates.find(candidate => candidate.choice === 'switch 2').score;
		assert(switching(thunderbolt) > switching(icebeam) + 20, 'Ground/Dragon Garchomp resists the selected Thunderbolt, but not Ice Beam');
		const normal = observe();
		assert.deepEqual(policy.decide({ ...normal, opponentMove: { move: 'icebeam', baseMove: 'icebeam' } }, seed, excluded),
			policy.decide(normal, seed, excluded));
	});

	it('constrains real root rollouts to the submitted move and leaves later turns free to predict', () => {
		create();
		const observation = observe('hard', { move: 'softboiled', baseMove: 'softboiled' });
		const original = RulePolicy.prototype.decide;
		let roots = 0;
		let continuations = 0;
		RulePolicy.prototype.decide = function (view, decisionSeed, excluded, options) {
			const result = original.call(this, view, decisionSeed, excluded, options);
			if (view.ownSide === 'p2' && excluded?.length) {
				roots++;
				assert(result.candidates.length);
				assert(result.candidates.every(candidate => matchesOpponentMove(view.request, candidate.choice, observation.opponentMove)));
			} else if (view.publicLog.includes('|turn|2')) {
				continuations++;
				assert.equal(view.opponentMove, undefined);
			}
			return result;
		};
		try {
			const excluded = enumerateRequestChoices(observation.request)
				.filter(choice => !['move 1', 'switch 2'].includes(choice));
			const result = new RolloutPolicy(trainer).decide(observation, seed, { budgetMs: null, maxRollouts: 60, excluded });
			assert.equal(result.method, 'rollout', JSON.stringify(result.diagnostics));
			assert(roots > 0);
			assert(continuations > 0);
		} finally {
			RulePolicy.prototype.decide = original;
		}
	});
});
