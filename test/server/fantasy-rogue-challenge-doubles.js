'use strict';

const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { Dex, toID } = require('../../dist/sim/dex');
const { OPTIONAL_CHALLENGES } = require('../../dist/server/fantasy-rogue/challenge-data');
const { CHALLENGE_DOUBLES } = require('../../dist/server/fantasy-rogue/challenge-doubles');
const { challengeNode, offerOptionalChallenge, optionalChallengeView } = require('../../dist/server/fantasy-rogue/optional-challenges');
const { offerCoopChallenge } = require('../../dist/server/fantasy-rogue/coop-challenges');
const { splitCoopOpponents } = require('../../dist/server/fantasy-rogue/coop-team');
const { encounterSetProblems } = require('../../dist/server/fantasy-rogue/encounter-legality');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');
const { rankMultiChoices } = require('../../dist/server/fantasy-ai/multi-policy');

describe('Fantasy Rogue authored optional challenge doubles', function () {
	this.timeout(30000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	const dex = Dex.mod('gen9fantasy');
	const run = doubles => ({ floor: 51, doubleBattle: doubles, phase: 'choose', team: [],
		choices: [{ id: 'trainer', kind: 'trainer', encounters: [] }] });
	const publicLog = () => extractChannelMessages(battle.log.join('\n'), [0])[0];
	const foe = species => ({ species, level: 50, ability: dex.species.get(species).abilities[0],
		moves: ['Tackle', 'Protect'], evs: { hp: 252, def: 128, spd: 128 } });
	function start(id, multi = false, seed = 1) {
		const team = challengeNode(id, 100, undefined, true).encounters[0].team.map(set => ({ ...set, level: 50 }));
		const partition = splitCoopOpponents(team);
		battle = new Battle({
			format: new Format({ name: 'Optional challenge doubles QA', mod: 'gen9fantasy',
				gameType: multi ? 'multi' : 'doubles', ruleset: [] }),
			strictChoices: true, seed: [seed, 2, 3, 4],
			p1: { team: multi ? [foe('Snorlax')] : [foe('Snorlax'), foe('Blastoise')] },
			p2: { team: multi ? partition.first : team },
			...(multi ? { p3: { team: [foe('Blastoise')] }, p4: { team: partition.second } } : {}),
		});
		// Tera is not offered by these NPC definitions; retain their authored Mega/Z resources.
		for (const side of battle.sides) for (const active of side.activeRequest.active) delete active.canTerastallize;
		assert.equal(battle.p2.active[0].species.name, dex.species.get(team[0].species).name);
		assert.equal((multi ? battle.p4.active[0] : battle.p2.active[1]).species.name, dex.species.get(team[1].species).name);
	}
	function play(multi = false) {
		const ranked = multi ? rankMultiChoices({ p2: battle.p2.activeRequest, p4: battle.p4.activeRequest },
			publicLog(), 'gen9fantasy', { allowSwitch: false }) :
			rankDoublesChoices({ ownSide: 'p2', difficulty: 'normal', request: battle.p2.activeRequest,
				publicLog: publicLog() }, 'gen9fantasy', [], false);
		assert(ranked.length);
		assert.deepEqual(ranked[0].mechanics.failures, []);
		const chosen = multi ? ranked[0].commands : { p2: ranked[0].choice };
		for (const [seat, command] of Object.entries(chosen)) {
			assert(battle[seat].choose(command), `${seat}: ${command}`);
		}
		for (const seat of multi ? ['p1', 'p3'] : ['p1']) {
			assert(battle[seat].choose(multi ? 'move 1 1' : 'move 1 1, move 1 1'));
		}
		battle.commitChoices();
		assert(!battle.log.some(line => line.startsWith('|error|')));
		assert(battle.ended || battle.turn > 1);
		return ranked[0];
	}
	it('covers all 28 old invitations while preserving their cast, sizes and singular transformation budgets', () => {
		assert.deepEqual(Object.keys(CHALLENGE_DOUBLES).sort(), OPTIONAL_CHALLENGES.filter(d => !d.totem).map(d => d.id).sort());
		for (const def of OPTIONAL_CHALLENGES.filter(d => !d.totem)) {
			const plan = CHALLENGE_DOUBLES[def.id];
			assert.deepEqual(plan.team.map(row => row[0]).sort(), def.team.map(row => row[0]).sort(), def.id);
			assert(plan.hint.length > 20);
			assert(plan.team.filter(row => dex.items.get(row[2]).megaStone).length <= 1, def.id);
			assert(plan.team.filter(row => dex.items.get(row[2]).zMove).length <= 1, def.id);
		}
	});
	for (const def of OPTIONAL_CHALLENGES) {
		it(`keeps legal moves, abilities, items and training at both bounds: ${def.id}`, () => {
			for (const floor of [def.from, def.through]) {
				const team = challengeNode(def.id, floor, undefined, true).encounters[0].team;
				for (const mon of team) {
					assert.deepEqual(encounterSetProblems(mon), [], `${def.id}: ${mon.species}`);
					assert(dex.items.get(mon.item).exists);
					assert.equal(mon.moves.length, 4);
					assert.equal(new Set(mon.moves.map(toID)).size, 4);
					assert(Object.values(mon.evs).reduce((sum, ev) => sum + ev, 0) <= 510);
					if (toID(mon.item) === 'assaultvest' || toID(mon.item).startsWith('choice')) {
						assert(mon.moves.every(move => dex.moves.get(move).category !== 'Status'), `${def.id}: ${mon.species}`);
					}
				}
			}
		});
	}
	it('preserves all ordinary singles sets and the three existing Totem teams', () => {
		for (const def of OPTIONAL_CHALLENGES) {
			const original = challengeNode(def.id, def.from);
			assert.equal(original.challenge.doubles, undefined);
			assert.deepEqual(original.encounters[0].team.map(mon => [mon.species, mon.ability, mon.item, mon.moves]),
				def.team.map(row => row.slice(0, 4)));
			if (def.totem) assert.deepEqual(challengeNode(def.id, def.from, undefined, true).encounters[0].team,
				original.encounters[0].team);
		}
	});
	it('selects new plans only for doubles routes, and explicitly for coop even before projection normalization', () => {
		for (const doubles of [false, true]) {
			const state = run(doubles); offerOptionalChallenge(state, () => 0);
			assert.equal(state.choices[0].challenge.doubles, doubles ? true : undefined);
		}
		const adventure = { routeChoices: run(false).choices };
		offerCoopChallenge(adventure, [{ userid: 'a', run: run(false) }, { userid: 'b', run: run(false) }], () => 0);
		assert.equal(adventure.routeChoices[0].challenge.doubles, true);
	});
	it('does not rewrite saved legacy encounters or attach new-plan instructions to them', () => {
		for (const doubles of [false, true]) {
			const state = { ...run(true), node: JSON.parse(JSON.stringify(challengeNode('clubroom', 120, undefined, doubles))) };
			state.node.challenge.stage = 'paused';
			const before = JSON.stringify(state);
			assert.equal(optionalChallengeView(state).hint,
				doubles ? CHALLENGE_DOUBLES.clubroom.hint : OPTIONAL_CHALLENGES.find(d => d.id === 'clubroom').hint);
			assert.equal(JSON.stringify(state), before);
		}
	});
	for (const id of Object.keys(CHALLENGE_DOUBLES)) {
		for (const multi of [false, true]) it(`executes a native ${multi ? 'four-seat Multi' : 'doubles'} opening: ${id}`, () => {
			start(id, multi); play(multi);
		});
	}
});
