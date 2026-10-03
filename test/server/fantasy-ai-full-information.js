'use strict';

const assert = require('assert').strict;
const { Battle, Teams, PRNG } = require('../../dist/sim');
const { captureFullState, captureFullChoice, restoreFullState } = require('../../dist/server/fantasy-ai/full-state');
const { captureInitialTeam } = require('../../dist/server/fantasy-ai/initial-snapshot');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { RulePolicy } = require('../../dist/server/fantasy-ai/policy');
const { RolloutPolicy } = require('../../dist/server/fantasy-ai/rollout');
const { TrainerRegistry } = require('../../dist/server/fantasy-ai/trainers');
const examples = require('../fixtures/fantasy-ai-trainers.json');
const base = new TrainerRegistry(examples, { enabled: true, allowDevelopmentTrainers: true }).get(examples[0].id);
const SEED = 'gen5,0011001200130014';
const splash = species => ({ species, ability: 'Pressure', moves: ['splash'] });

describe('Fantasy AI complete current information', function () {
	this.timeout(30000);
	let battle, trainer, initialOpponent;
	afterEach(() => { battle?.destroy(); battle = null; });
	function setup(own, foe, ownBench = [], foeBench = [], preview = false) {
		const teams = [[own, ...ownBench], [foe, ...foeBench]].map(team => {
			while (team.length < 6) team.push(splash('Blissey'));
			return team;
		});
		trainer = { ...base, format: 'gen9fcubersuu', packedTeam: Teams.pack(teams[0]) };
		battle = new Battle({ formatid: trainer.format, seed: SEED, p1: { name: 'AI', team: teams[0] }, p2: { name: 'Player', team: teams[1] } });
		initialOpponent = captureInitialTeam(battle, 'p2');
		if (preview) return;
		battle.makeChoices('team 123456', 'team 123456');
		for (const [index, side] of battle.sides.entries()) {
			for (const mon of side.pokemon.slice(1 + (index ? foeBench.length : ownBench.length))) mon.faint();
		}
		battle.faintMessages();
		battle.p1.pokemon.forEach(mon => { mon.canTerastallize = null; });
		battle.makeRequest('move');
	}
	function observe(difficulty = 'hard') {
		const view = new InformationView({ ownSide: 'p1', difficulty, initialOpponent });
		view.receiveUpdate(battle.log.join('\n'));
		return view.observe(battle.p1.activeRequest, undefined, captureFullState(battle, 'p2'));
	}
	function decide() {
		const before = JSON.stringify(battle.toJSON());
		const result = new RulePolicy(trainer).decide(observe(), SEED);
		assert.deepEqual(result.diagnostics, [], JSON.stringify(result));
		assert.equal(JSON.stringify(battle.toJSON()), before, 'search must not modify the real battle');
		return result;
	}
	it('copies current items, abilities, HP, PP, hidden counters and identity without exposing the real RNG', () => {
		setup(splash('Mew'), { species: 'Zoroark', ability: 'Illusion', item: 'Leftovers', teraType: 'Normal', moves: ['splash'] }, [], [splash('Audino-Fantasy')]);
		const foe = battle.p2.active[0];
		foe.hp = 123; foe.item = 'choicescarf'; foe.ability = 'pressure';
		foe.moveSlots[0].pp = 2;
		foe.status = 'slp'; foe.statusState.time = 2;
		battle.choose('p2', 'move 1');
		const state = captureFullState(battle, 'p2');
		const oldSeed = battle.prng.getSeed();
		battle.prng = new PRNG('gen5,0015001600170018');
		battle.prngSeed = battle.prng.getSeed();
		assert.deepEqual(captureFullState(battle, 'p2'), state);
		assert(!JSON.stringify(state).includes(oldSeed));
		const clone = restoreFullState(state, SEED);
		try {
			const mon = clone.p2.active[0];
			assert.equal(mon.species.name, 'Zoroark'); assert(mon.illusion);
			assert.equal(mon.hp, 123); assert.equal(mon.item, 'choicescarf'); assert.equal(mon.ability, 'pressure');
			assert.equal(mon.moveSlots[0].pp, 2); assert.equal(mon.statusState.time, 2); assert.equal(mon.teraType, 'Normal');
			mon.hp = 1; assert.equal(foe.hp, 123);
		} finally { clone.destroy(); }
		assert(!('fullState' in observe('normal')));
		const view = observe(); view.fullState.state.sides[1].pokemon[0].hp = 1;
		assert.equal(foe.hp, 123);
	});
	it('changes its attack when the accepted switch changes between immune targets', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['thunderbolt', 'icebeam'] }, splash('Pelipper'), [], [splash('Gastrodon'), splash('Gyarados')]);
		battle.choose('p2', 'switch 2');
		assert.equal(captureFullState(battle, 'p2').choice, 'switch 2');
		assert.equal(decide().choice, 'move 2');
		battle.undoChoice('p2'); battle.choose('p2', 'switch 3');
		assert.equal(decide().choice, 'move 1');
	});
	it('executes the selected Tera type before evaluating Ghost immunity in both policy paths', () => {
		setup({ species: 'Gengar', ability: 'Cursed Body', moves: ['shadowball', 'sludgebomb'] },
			{ species: 'Mew', ability: 'Synchronize', teraType: 'Normal', moves: ['splash'] });
		battle.choose('p2', 'move 1'); assert.equal(decide().choice, 'move 1');
		battle.undoChoice('p2'); battle.choose('p2', 'move 1 terastallize');
		assert.equal(decide().choice, 'move 2');
		const result = new RolloutPolicy(trainer).decide(observe(), SEED, { budgetMs: 2000, maxRollouts: 12 });
		assert.equal(result.choice, 'move 2', JSON.stringify(result));
		assert.equal(result.method, 'rollout');
	});
	it('takes a faster guaranteed knockout even when the submitted reply would knock it out', () => {
		setup({ species: 'Mewtwo', ability: 'Pressure', moves: ['psychic', 'splash'] },
			{ species: 'Gengar', ability: 'Cursed Body', moves: ['shadowball'] }, [splash('Blissey')]);
		battle.p1.active[0].hp = 10; battle.p2.active[0].hp = 10;
		battle.makeRequest('move'); battle.choose('p2', 'move 1');
		assert.equal(decide().choice, 'move 1');
	});
	it('uses changed abilities and consumed items instead of the initial configuration', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['earthquake', 'psychic'] },
			{ species: 'Weezing', ability: 'Levitate', item: 'Air Balloon', moves: ['splash'] });
		battle.choose('p2', 'move 1');
		assert.equal(decide().choice, 'move 2');
		battle.undoChoice('p2');
		const foe = battle.p2.active[0];
		foe.ability = 'pressure'; foe.item = '';
		foe.storedStats.spd = 1000; foe.storedStats.def = 30;
		battle.choose('p2', 'move 1');
		assert.equal(decide().choice, 'move 1');
	});
	it('chooses a lead against the actual accepted preview order', () => {
		setup({ species: 'Mew', ability: 'Shadow Tag', moves: ['thunderbolt'] }, splash('Gyarados'),
			[{ species: 'Venusaur', ability: 'Shadow Tag', moves: ['energyball'] }], [splash('Gastrodon')], true);
		battle.choose('p2', 'team 123456');
		const first = decide();
		assert(first.choice.startsWith('team 1'), JSON.stringify(first));
		battle.undoChoice('p2'); battle.choose('p2', 'team 213456');
		const second = decide();
		assert(second.choice.startsWith('team 2'), JSON.stringify(second));
	});
	it('retains the shared early Mega preference when it is a safe permanent upgrade', () => {
		setup({ species: 'Charizard', ability: 'Blaze', item: 'Charizardite X', moves: ['splash'] }, splash('Blissey'));
		battle.choose('p2', 'move 1');
		assert.equal(decide().choice, 'move 1 mega');
	});
	it('waits for accepted preview/replacement choices, and needs no choice from a waiting opponent', () => {
		setup(splash('Mew'), splash('Mew'), [], [], true);
		assert.equal(captureFullChoice(battle, 'p2', 1).ready, false);
		battle.choose('p2', 'team 213456');
		const ready = captureFullChoice(battle, 'p2', 2);
		assert(ready.ready && ready.fullState.choice.startsWith('team 2'));
		battle.undoChoice('p2'); assert.equal(captureFullChoice(battle, 'p2', 3).ready, false);
		battle.makeChoices('team 123456', 'team 123456');
		battle.p1.active[0].faint(); battle.p2.active[0].faint(); battle.faintMessages();
		battle.p1.active[0].switchFlag = true; battle.p2.active[0].switchFlag = true; battle.makeRequest('switch');
		assert.equal(captureFullChoice(battle, 'p2', 4).ready, false);
		battle.choose('p2', 'switch 2'); assert(captureFullChoice(battle, 'p2', 5).ready);
		battle.choose('p1', 'switch 2');
		battle.p1.active[0].faint(); battle.faintMessages(); battle.p1.active[0].switchFlag = true;
		battle.makeRequest('switch');
		assert(battle.p2.activeRequest.wait);
		assert(captureFullChoice(battle, 'p2', 6).ready);
	});
	it('resumes an in-turn U-turn replacement without executing the pivot twice', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['splash'] },
			{ species: 'Scizor', ability: 'Technician', moves: ['uturn'] }, [], [splash('Mew')]);
		battle.makeChoices('move 1', 'move 1');
		assert.equal(battle.requestState, 'switch');
		const snapshot = captureFullState(battle, 'p1');
		const beforeHP = battle.p1.active[0].hp;
		const clone = restoreFullState(snapshot, SEED);
		try {
			assert(clone.choose('p2', 'switch 2'));
			assert.equal(clone.turn, 2); assert.equal(clone.p1.active[0].hp, beforeHP);
			assert.equal(clone.p2.active[0].species.name, 'Mew');
		} finally { clone.destroy(); }
	});
	it('executes accepted Mega and G-Mega flags with independent resources after serialization', () => {
		setup(splash('Blissey'), { species: 'Charizard', ability: 'Blaze', item: 'Charizardite X', moves: ['splash'] }, [],
			[{ species: 'Urshifu-Rapid-Strike-Fantasy', ability: 'Unseen Fist', moves: ['yishunqianji', 'splash'] }]);
		battle.choose('p2', 'move 1 mega');
		const clone = restoreFullState(captureFullState(battle, 'p2'), SEED);
		try {
			clone.choose('p1', 'move 1');
			assert.equal(clone.p2.active[0].species.name, 'Charizard-Mega-X');
			clone.makeChoices('move 1', 'switch 2');
			assert(clone.p2.activeRequest.active[0].canMegaEvo);
			clone.makeChoices('move 1', 'move 2 mega');
			assert.equal(clone.p2.active[0].species.name, 'Urshifu-Rapid-Strike-G-Mega-Fantasy');
			assert(clone.p2.pokemon.every(mon => !mon.canMegaEvo && !mon.canMegaEvoX && !mon.canMegaEvoY));
		} finally { clone.destroy(); }
		assert.equal(battle.p2.active[0].species.name, 'Charizard');
	});
});
