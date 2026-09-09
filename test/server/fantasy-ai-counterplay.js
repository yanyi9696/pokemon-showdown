'use strict';

const assert = require('assert').strict;
const { Battle, Dex, Teams, TeamValidator } = require('../../dist/sim');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { captureInitialTeam } = require('../../dist/server/fantasy-ai/initial-snapshot');
const { RulePolicy } = require('../../dist/server/fantasy-ai/policy');
const { RolloutPolicy, simulateTurn } = require('../../dist/server/fantasy-ai/rollout');
const { WorldBuilder } = require('../../dist/server/fantasy-ai/world');
const { reconstructWorld } = require('../../dist/server/fantasy-ai/reconstruction');
const { readBattleMemory, ownSeen } = require('../../dist/server/fantasy-ai/memory');
const { estimateMove } = require('../../dist/server/fantasy-ai/matchup');
const { HypotheticalSets } = require('../../dist/server/fantasy-ai/sets');
const { ownTeam, observationAt, SEED } = require('../fixtures/fantasy-ai-replay-7947');

const trainer = { format: 'gen9fcuu', style: 'balanced', packedTeam: Teams.pack(ownTeam),
	keyMembers: [2, 3, 6], resourcePreferences: ['mega', 'terastallize'] };
const dex = Dex.forFormat(trainer.format);
const explain = result => JSON.stringify(result);

describe('Fantasy AI replay 7947 and tactical counterplay', function () {
	this.timeout(30000);
	let battle;
	let policy;
	let initialOpponent;
	beforeEach(() => { policy = new RulePolicy(trainer); });
	afterEach(() => { if (battle) battle.destroy(); battle = null; });
	function state(view) {
		const memory = readBattleMemory(view.publicLog, dex);
		const slot = view.request.side.pokemon.find(mon => mon.active);
		const foeSide = view.ownSide === 'p1' ? 'p2' : 'p1';
		const mon = policy.hypotheses.own(slot, ownSeen(memory, view.ownSide, slot.ident, true));
		return { memory, mon, foes: policy.hypotheses.build(memory.sides[foeSide].active, view, memory) };
	}
	function setup(moves = ['destinybond', 'encore', 'dazzlinggleam', 'wasitihuan'], foe = {}) {
		const team = structuredClone(ownTeam);
		team[0].moves = moves;
		const opponent = [{ species: 'Decidueye-Hisui-Fantasy', ability: 'Scrappy', item: 'Choice Scarf', nature: 'Jolly',
			evs: { atk: 252, spe: 252, spd: 4 }, moves: ['thousandarrows', 'swordsdance', 'roost', 'closecombat'], ...foe },
		...structuredClone(ownTeam.slice(1))];
		assert.equal(new TeamValidator(trainer.format).validateTeam(team), null);
		assert.equal(new TeamValidator(trainer.format).validateTeam(opponent), null);
		policy = new RulePolicy({ ...trainer, packedTeam: Teams.pack(team) });
		battle = new Battle({ formatid: trainer.format, seed: SEED, p1: { team }, p2: { team: opponent } });
		initialOpponent = captureInitialTeam(battle, 'p2');
		battle.makeChoices('team 123456', 'team 123456');
	}
	function observe() {
		const view = new InformationView({ ownSide: 'p1', difficulty: 'hard', initialOpponent });
		view.receiveUpdate(battle.log.join('\n'));
		return view.observe(battle.p1.activeRequest);
	}
	function probe(id, view = observe()) {
		const { memory, mon, foes } = state(view);
		return estimateMove(trainer.format, mon, foes[0], id, '', memory, view.ownSide, 1);
	}

	it('remembers the item disclosed by Poltergeist across subsequent appearances', () => {
		const { foes } = state(observationAt(3));
		assert(foes.length > 1);
		assert(foes.every(foe => foe.item === 'fantasypowerlens'));
	});
	it('keeps the publicly permanent Sachet ability after a switch and in reconstructed worlds', () => {
		const view = observationAt(26);
		const memory = readBattleMemory(view.publicLog, dex);
		const seen = ownSeen(memory, 'p2', 'p2: Marowak', false);
		assert.equal(seen.fantasy.baseAbility, 'lingeringaroma');
		const world = new WorldBuilder(trainer).build(view)[0];
		const copy = reconstructWorld(world, SEED);
		try {
			const mon = copy.p2.pokemon.find(member => member.name === 'Marowak');
			assert.equal(mon.baseAbility, 'lingeringaroma');
			assert.equal(mon.ability, 'lingeringaroma');
		} finally { copy.destroy(); }
	});
	it('retains both current STAB types despite an incomplete random-team template', () => {
		const { foes } = state(observationAt(31));
		for (const foe of foes) {
			for (const type of ['Ground', 'Fighting']) {
				assert(foe.moves.some(id => dex.moves.get(id).type === type && dex.moves.get(id).category === 'Physical'),
					JSON.stringify(foe));
			}
		}
	});
	it('keeps a legal Scarf speed scenario without claiming or mutating a hidden item', () => {
		const view = observationAt(35);
		const before = structuredClone(view);
		assert(view.publicLog.filter(line => /^\|(?:-damage|-heal)\|p1/.test(line))
			.map(line => line.split('|')[3])
			.every(condition => !condition.includes('/') || /\/100(?: |$)/.test(condition)),
		'Normal AI only receives public HP precision');
		const { memory, foes } = state(view);
		const fast = foes.find(foe => foe.item === 'choicescarf');
		assert(fast && fast.probability > 0 && fast.probability < 0.5);
		assert.equal(memory.sides.p1.active.item, undefined);
		const set = new HypotheticalSets(trainer.format).create(fast, false, 0, ['thousandarrows']);
		assert.equal(new TeamValidator(trainer.format).validateSet(set, {}), null);
		view.publicLog.push('|-item|p1a: Decidueye|Leftovers');
		assert(state(view).foes.every(foe => foe.item === 'leftovers'));
		view.publicLog.pop();
		assert.deepEqual(view, before);
	});
	it('turn 31 restores Shield forme instead of exposing Blade forme to Ground STAB', () => {
		const result = policy.decide(observationAt(31), SEED);
		assert.equal(result.choice, 'move 3', explain(result));
		assert(result.candidates[0].reasons.includes('shield-forme'));
	});
	for (const turn of [26, 28]) {
		it(`turn ${turn} attacks before the poisoned low-HP recovery pivot can escape`, () => {
			const result = policy.decide(observationAt(turn), SEED);
			assert(result.choice.startsWith('move '), explain(result));
			assert(result.candidates.find(candidate => candidate.choice === result.choice).reasons.includes('reliable-finish'));
			assert(result.candidates.filter(candidate => candidate.choice.startsWith('switch '))
				.every(candidate => candidate.reasons.includes('concedes-finishing-window')));
		});
	}
	it('uses the free replacement to select a counter instead of the 1% HP attacker', () => {
		const view = observationAt(32, true);
		const result = policy.decide(view, SEED);
		const replacement = view.request.side.pokemon[Number(result.choice.split(' ')[1]) - 1];
		assert(dex.species.get(replacement.details.split(',')[0]).id === 'gengarfantasy', explain(result));
		assert(result.candidates.find(candidate => candidate.choice === result.choice).reasons.includes('counterplay-entry'));
	});
	it('turn 35 retains and chooses priority Destiny Bond as an emergency response', () => {
		const result = policy.decide(observationAt(35), SEED);
		assert.equal(result.choice, 'move 4', explain(result));
		assert(result.candidates[0].reasons.includes('destiny-bond-trade'));
	});
	it('native Destiny Bond trades with a faster Scarf attacker and the probe agrees', () => {
		setup();
		const view = observe();
		const { memory, foes } = state(view);
		const bond = probe('destinybond');
		assert.equal(bond.priority, 1);
		assert.equal(bond.destinyBond, 1);
		const reply = estimateMove(trainer.format, foes[0], bond.postAction[0].profile, 'thousandarrows', '', memory, 'p2', 1);
		assert.equal(reply.selfKnockout, 1);
		assert(battle.p2.active[0].getStat('spe') > battle.p1.active[0].getStat('spe'));
		battle.makeChoices('move 1', 'move 1');
		assert(battle.p1.active[0].fainted && battle.p2.active[0].fainted);
	});
	it('does not get another successful Destiny Bond by ignoring the previous use', () => {
		setup(undefined, { item: 'Leftovers' });
		battle.makeChoices('move 1', 'move 2');
		const repeat = probe('destinybond');
		assert(!repeat.destinyBond);
		assert.equal(repeat.ineffective, 1);
		battle.makeChoices('move 1', 'move 2');
		assert(!battle.p1.active[0].volatiles.destinybond);
	});
	it('gives Encore the disclosed last move and respects native same-turn control', () => {
		setup(undefined, { item: 'Leftovers' });
		battle.makeChoices('move 1', 'move 2');
		const encore = probe('encore');
		assert.equal(encore.ineffective, 0);
		assert.equal(encore.targetAfterMove[0].profile.moveLocks.encore, 'swordsdance');
		const result = policy.decide(observe(), SEED);
		assert.equal(result.choice, 'move 2', explain(result));
		battle.makeChoices('move 2', 'move 1');
		assert.equal(battle.p2.active[0].lastMove.id, 'swordsdance');
		assert.equal(battle.p1.active[0].hp, battle.p1.active[0].maxhp);
	});
	it('expires Destiny Bond before an ordinary attack in both the probe and the actual turn', () => {
		setup(undefined, { item: 'Leftovers' });
		battle.makeChoices('move 1', 'move 2');
		const attack = probe('dazzlinggleam');
		assert(!attack.postAction[0].profile.volatiles.includes('destinybond'));
		battle.makeChoices('move 3', 'move 1');
		assert(battle.p1.active[0].fainted);
		assert(!battle.p2.active[0].fainted);
	});
	it('does not let Prankster Encore bypass Dark immunity', () => {
		setup(undefined, { species: 'Krookodile', ability: 'Intimidate', item: 'Leftovers',
			moves: ['earthquake', 'bulkup', 'taunt', 'knockoff'] });
		battle.makeChoices('move 1', 'move 2');
		assert.equal(probe('encore').ineffective, 1);
		assert(!probe('encore').targetAfterMove);
	});
	it('a nonlethal response or residual-only threat does not create a Destiny Bond trade', () => {
		setup(undefined, { species: 'Mew', ability: 'Synchronize', item: 'Leftovers',
			moves: ['protect', 'toxic', 'softboiled', 'willowisp'] });
		const { memory, foes } = state(observe());
		const bond = probe('destinybond');
		const reply = estimateMove(trainer.format, foes[0], bond.postAction[0].profile, 'toxic', '', memory, 'p2', 1);
		assert.equal(reply.selfKnockout, 0);
		const result = policy.decide(observe(), SEED);
		assert.notEqual(result.choice, 'move 1', explain(result));
	});
	it('native Psychic Terrain blocks Prankster Encore but not self-targeted Destiny Bond', () => {
		setup(undefined, { item: 'Leftovers' });
		battle.makeChoices('move 1', 'move 2');
		battle.field.setTerrain('psychicterrain', battle.p2.active[0]);
		assert.equal(probe('encore').ineffective, 1);
		battle.makeChoices('move 3', 'move 2');
		assert.equal(probe('destinybond').destinyBond, 1);
	});
	for (const [turn, move] of [[26, 'flipturn'], [28, 'recover']]) {
		it(`native turn ${turn} finishes the target before its disclosed ${move}`, () => {
			const view = observationAt(turn);
			const decision = policy.decide(view, SEED);
			const world = new WorldBuilder(trainer).build(view)[0];
			const foeMove = world.teams.p1[0].set.moves.findIndex(id => dex.moves.get(id).id === move) + 1;
			assert(foeMove > 0);
			const outcome = simulateTurn(world, { p1: `move ${foeMove}`, p2: decision.choice }, SEED, () => 'default');
			assert(outcome.log.some(line => line === '|faint|p1a: Tentacruel'), explain(outcome));
			assert(!outcome.log.some(line => line.startsWith(`|move|p1a: Tentacruel|${dex.moves.get(move).name}|`)),
				explain(outcome));
		});
	}
	for (const turn of [26, 31]) {
		it(`search retains useful counterplay at replay turn ${turn}`, () => {
			const view = observationAt(turn);
			const before = structuredClone(view);
			const result = new RolloutPolicy(trainer).decide(view, SEED, { budgetMs: 10000, maxRollouts: 120 });
			assert.equal(result.method, 'rollout', explain(result));
			assert(result.searchDepth >= 1);
			assert.equal(result.choice, `move ${turn === 26 ? 1 : 3}`, explain(result));
			assert(!result.diagnostics.some(message => /probe-failed|unsupported|no-supported/.test(message)), explain(result));
			assert.deepEqual(view, before);
		});
	}
});
