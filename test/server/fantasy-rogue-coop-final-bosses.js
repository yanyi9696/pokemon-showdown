'use strict';
const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { summitEncounter, arceusEncounter } = require('../../dist/server/fantasy-rogue/final-bosses');
const { captureCoopCheckpoint, validCoopCheckpoint } = require('../../dist/sim/rogue-coop-checkpoint');
const { rogueBossChoice } = require('../../dist/sim/rogue-bosses');
const { RogueCoopController } = require('../../dist/server/fantasy-rogue/coop-controller');
const { prepareSingleOpponentChoices } = require('../../dist/server/fantasy-ai/multi-policy');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue native cooperative single-slot final bosses', function () {
	this.timeout(15000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function options(encounter, patch = {}) {
		const team = [createRoguePokemon(set('Blissey', 'Natural Cure', 100, ['Splash']), stats(0))];
		const partner = structuredClone(team); partner[0].id = 'guest';
		return { formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'coop-final', team, boosts: stats(0), bag: {}, balls: [],
				partner: { team: partner, boosts: stats(0) }, partnerBag: {}, catchable: false,
				persistCoop: true, cooperative: { opponentOffset: encounter.team.length, singleOpponent: true },
				opponentCount: encounter.team.length, opponentSlots: encounter.team.map((_, i) => i),
				boss: structuredClone(encounter.boss), ...patch },
			p1: { name: 'Host', team: team.map(mon => mon.set) },
			p3: { name: 'Guest', team: partner.map(mon => mon.set) },
			p2: { name: 'Boss', team: encounter.team }, p4: { name: 'Empty enemy slot', team: [] } };
	}
	function begin(encounter) {
		battle = new Battle(options(encounter));
		assert.equal(battle.p4.activeRequest.wait, true);
		for (const id of ['p1', 'p2', 'p3']) assert(battle.choose(id, 'team'));
		return battle.p2.active[0];
	}
	function deplete() {
		battle.p2.active[0].faint(battle.p1.active[0], battle.dex.moves.get('tackle'));
		battle.faintMessages();
	}
	function restore() {
		const checkpoint = captureCoopCheckpoint(battle);
		assert(validCoopCheckpoint(checkpoint, 'coop-final'));
		battle.destroy(); battle = Battle.fromJSON(JSON.stringify(checkpoint.state));
	}
	function simple() {
		return { team: [set('Blissey', 'Natural Cure', 100, ['Splash'])], boss: { kind: 'summit' } };
	}
	function controller() {
		const ai = new RogueCoopController({ roomid: 'boss-ai-test', format: battle.format.id,
			options: { fantasyRogue: { state: battle.fantasyRogue } } });
		ai.update(battle.log.join('\n')); return ai;
	}
	it('scores a lone enemy against both public targets, rejects immunity, and runs native turn hypotheses', () => {
		const encounter = simple(); encounter.team = [set('Pikachu', 'Static', 100, ['Thunderbolt', 'Helping Hand', 'Protect'])];
		const opts = options(encounter);
		const host = createRoguePokemon(set('Charizard', 'Blaze', 100, ['Splash']), stats(0));
		const guest = createRoguePokemon(set('Gastrodon', 'Storm Drain', 100, ['Splash']), stats(0));
		opts.p1.team = [host.set]; opts.fantasyRogue.team = [host];
		opts.p3.team = [guest.set]; opts.fantasyRogue.partner.team = [guest];
		battle = new Battle(opts);
		for (const id of ['p1', 'p2', 'p3']) battle.choose(id, 'team');
		const input = structuredClone(battle.p2.activeRequest);
		input.active[0].canTerastallize = false;
		const publicLog = extractChannelMessages(battle.log.join('\n'), [0])[0];
		const before = JSON.stringify(input), rng = battle.prng.getSeed();
		const prepared = prepareSingleOpponentChoices(input, publicLog);
		assert.equal(prepared.observation.request.active.length, 1);
		assert.equal(prepared.observation.request.side.pokemon.length, 1);
		assert(prepared.observation.publicLog.some(line => line.startsWith('|switch|p1b:')));
		assert(!prepared.candidates.some(candidate => candidate.actions.some(action => action.move === 'helpinghand')));
		const ranked = rankDoublesChoices(prepared.observation, 'gen9fantasy', [], false, prepared.candidates, true);
		assert(ranked.length); assert.equal(ranked[0].choice, 'move 1 1', JSON.stringify(ranked));
		assert(ranked[0].jointTurn?.hypotheses > 0, 'must complete actual isolated turn hypotheses');
		assert(!ranked.some(entry => entry.choice === 'move 3'), 'do not stall a board that cannot improve');
		for (const effect of ['|-status|p1a: Charizard|tox', '|-prepare|p1a: Charizard|Solar Beam',
			'|-sidestart|p1: Host|move: Tailwind']) {
			const waiting = prepareSingleOpponentChoices(input, [...publicLog, effect]);
			assert(rankDoublesChoices(waiting.observation, 'gen9fantasy', [], false, waiting.candidates)
				.some(entry => entry.choice === 'move 3'), `must preserve a concrete waiting plan: ${effect}`);
		}
		const healing = structuredClone(input);
		healing.side.pokemon[0].condition = '100/300'; healing.side.pokemon[0].item = 'leftovers';
		const recovery = prepareSingleOpponentChoices(healing, publicLog);
		assert(rankDoublesChoices(recovery.observation, 'gen9fantasy', [], false, recovery.candidates)
			.some(entry => entry.choice === 'move 3'));
		for (const entry of ranked) { assert(battle.p2.choose(entry.choice)); battle.p2.clearChoice(); }
		assert.equal(JSON.stringify(input), before); assert.deepEqual(battle.prng.getSeed(), rng);
		const hidden = ['dracometeor', 'hydropump'];
		battle.p1.pokemon[0].set.moves = hidden;
		battle.p3.pokemon[0].set.item = 'Choice Scarf';
		const repeated = rankDoublesChoices(prepared.observation, 'gen9fantasy', [], false, prepared.candidates, true);
		assert.deepEqual(repeated.map(entry => [entry.choice, entry.score]), ranked.map(entry => [entry.choice, entry.score]));
		const excluded = prepareSingleOpponentChoices(input, publicLog, new Set(['move 1 1']));
		assert(!excluded.candidates.some(choice => choice.choice === 'move 1 1'));
		const fainted = prepareSingleOpponentChoices(input, [...publicLog, '|faint|p3a: Gastrodon']);
		assert(!fainted.candidates.some(choice => choice.actions.some(action => action.target === 2)));
		const writes = [], room = { roomid: 'single-policy', format: 'gen9fantasyroguecoop', options: {
			fantasyRogue: { state: { persistCoop: true, cooperative: { singleOpponent: true }, boss: { kind: 'summit' } } },
		}, stream: { write: text => writes.push(text) },
		p2: { isAI: true, request: { rqid: 2, isWait: false, choice: '' } },
		p4: { isAI: true, request: { rqid: 4, isWait: true, choice: '' } } };
		for (const seat of ['p1', 'p3']) Object.defineProperty(room, seat, { get() { throw new Error('Private human request'); } });
		Object.defineProperty(room.stream, 'battle', { get() { throw new Error('Live simulator'); } });
		const ai = new RogueCoopController(room);
		ai.update(publicLog.join('\n')); ai.request('p2', input, 2);
		ai.request('p4', { wait: true }, 4); ai.flush();
		assert.deepEqual(writes, ['>p2 move 1 1']); assert(ai.lastDecision.candidates > 0);
		ai.finish();
	});
	it('never sends ally support toward the empty enemy seat', () => {
		const encounter = simple(); encounter.team[0].moves = ['Helping Hand', 'Tackle'];
		begin(encounter);
		assert.match(controller().fallback('p2', battle.p2.activeRequest), /^move 2 [12]$/);
	});
	it('keeps the first living guard even when a later guard has a higher health ratio', () => {
		begin(summitEncounter()); deplete(); battle.checkFainted();
		battle.makeRequest('switch');
		battle.p2.pokemon[1].hp = 1;
		battle.makeRequest('switch');
		assert.equal(controller().fallback('p2', battle.p2.activeRequest), 'switch 2');
	});
	it('runs both humans and exactly one enemy without a placeholder or fourth choice', () => {
		begin(simple());
		assert.equal(battle.p4.pokemon.length, 0);
		assert.deepEqual(battle.p4.active, [null]);
		assert.equal(battle.p2.active.filter(Boolean).length, 1);
		assert.equal(battle.ended, false);
		for (const id of ['p1', 'p2', 'p3']) assert(battle.choose(id, 'move 1'));
		assert.equal(battle.turn, 2);
		assert.equal(battle.log.filter(line => line.startsWith('|move|')).length, 3);
		assert(!battle.log.some(line => /^\|(move|switch|drag)\|p4/.test(line)));
		assert.equal(battle.p4.activeRequest.wait, true);
		deplete(); assert.equal(battle.ended, true); assert.equal(battle.winner, 'Host');
	});
	it('derives double base HP once, leaves player HP alone, and preserves a pending choice across restoration', () => {
		const mon = begin(simple());
		const base = battle.p1.active[0].maxhp;
		assert.equal(mon.maxhp, base * 2); assert.equal(battle.p3.active[0].maxhp, base);
		assert(!mon.volatiles.dynamax);
		assert(battle.choose('p1', 'move 1'));
		restore();
		assert.equal(battle.p2.active[0].maxhp, base * 2);
		assert(battle.choose('p2', 'move 1')); assert(battle.choose('p3', 'move 1'));
		assert.equal(battle.turn, 2);
		assert.equal(battle.p2.active[0].maxhp, base * 2);
		assert.equal(battle.log.filter(line => line.startsWith('|move|p1')).length, 1);
	});
	it('does not lose when one human faints while the teammate is still alive', () => {
		begin(simple());
		battle.p1.active[0].faint(battle.p2.active[0], battle.dex.moves.get('tackle'));
		battle.faintMessages(); assert.equal(battle.ended, false);
		battle.checkFainted(); battle.makeRequest('move');
		assert.equal(battle.p1.activeRequest.wait, true);
		assert(battle.choose('p2', 'move 1')); assert(battle.choose('p3', 'move 1'));
		assert.equal(battle.turn, 2);
		battle.p3.active[0].faint(battle.p2.active[0], battle.dex.moves.get('tackle'));
		battle.faintMessages(); assert.equal(battle.ended, true); assert.equal(battle.winner, 'Boss');
	});
	it('keeps six sequential guards, both Mewtwo phases, and double HP after phase restoration', () => {
		const encounter = summitEncounter(); begin(encounter);
		for (let i = 0; i < 5; i++) {
			assert.equal(battle.p2.active[0].set.species, encounter.team[i].species);
			const guard = battle.p2.active[0];
			assert.equal(guard.maxhp, battle.spreadModify(guard.species.baseStats, guard.set).hp * 2);
			deplete(); assert.equal(battle.ended, false);
			battle.checkFainted(); battle.makeRequest('switch');
			assert(battle.choose('p2', rogueBossChoice(battle.p2.activeRequest)));
		}
		const hp = battle.p2.active[0].maxhp;
		deplete(); assert.equal(battle.p2.active[0].species.id, 'mewtwomegayfantasy');
		assert.equal(battle.fantasyRogue.boss.phase, 1);
		// X and Y differ in HP EVs, so compare against a newly computed Y spread.
		const mon = battle.p2.active[0];
		const expected = battle.spreadModify(mon.species.baseStats, mon.set).hp * 2;
		assert.equal(mon.maxhp, expected); assert(mon.maxhp > hp / 2);
		restore(); assert.equal(battle.p2.active[0].maxhp, expected);
		assert(!battle.p2.active[0].volatiles.dynamax);
		deplete(); assert.equal(battle.ended, true); assert.equal(battle.winner, 'Host');
	});
	it('retains exactly nineteen Arceus lives and never doubles restored HP again', () => {
		begin(arceusEncounter());
		for (let phase = 0; phase < 18; phase++) {
			deplete(); assert.equal(battle.ended, false);
			const mon = battle.p2.active[0];
			assert.equal(mon.maxhp, battle.spreadModify(mon.species.baseStats, mon.set).hp * 2);
			assert.equal(mon.hp, mon.maxhp);
			if (phase === 8 || phase === 17) restore();
		}
		deplete(); assert.equal(battle.ended, true);
	});
	for (const patch of [{ persistCoop: false }, { boss: undefined },
		{ cooperative: { opponentOffset: 1 } }]) {
		it(`rejects an empty enemy team without the trusted boss flags ${JSON.stringify(patch)}`, () => {
			assert.throws(() => { battle = new Battle(options(simple(), patch)); }, /empty team/i);
		});
	}
	it('keeps single-player boss HP and standard Multi empty-team validation unchanged', () => {
		const encounter = simple(), opts = options(encounter);
		delete opts.p3; delete opts.p4; opts.formatid = 'gen9fantasyrogue';
		delete opts.fantasyRogue.cooperative; delete opts.fantasyRogue.partner;
		delete opts.fantasyRogue.persistCoop;
		battle = new Battle(opts);
		assert.equal(battle.p2.pokemon[0].maxhp, battle.p1.pokemon[0].maxhp);
		battle.destroy(); battle = null;
		const ordinary = options(encounter); delete ordinary.formatid;
		ordinary.format = new Format({ name: 'Ordinary Multi control', mod: 'gen9', gameType: 'multi', ruleset: [] });
		delete ordinary.fantasyRogue;
		assert.throws(() => { battle = new Battle(ordinary); }, /empty team/i);
	});
});
