'use strict';
const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { Dex } = require('../../dist/sim/dex');
const { shopDoublesTeam } = require('../../dist/server/fantasy-rogue/shop-doubles');
const { beginShopChallenge } = require('../../dist/server/fantasy-rogue/shop-challenge');
const { prepareSpiritNode } = require('../../dist/server/fantasy-rogue/spirits');
const { splitCoopOpponents } = require('../../dist/server/fantasy-rogue/coop-team');
const { encounterSetProblems } = require('../../dist/server/fantasy-rogue/encounter-legality');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');
const { rankMultiChoices } = require('../../dist/server/fantasy-ai/multi-policy');
const { ROGUE_BLESSINGS } = require('../../dist/sim/rogue-blessing-data');
const { content, set } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue authored shop doubles teams', function () {
	this.timeout(30000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	const level = (kind, floor) => Math.min(100, Math.max(3, Math.ceil(floor / 2)) + (kind === 'rocket' ? 3 : 0));
	function run(kind, floor, doubles = true) {
		return { floor, doubleBattle: doubles, phase: 'rest', spirit: kind === 'rocket' ? 'persian' : undefined,
			spiritVersion: 1, team: [{ hp: 20 }], bag: {}, money: 100,
			blessings: { owned: [{ ...ROGUE_BLESSINGS.find(b => b.family === 'shopraid') }], levels: 0 },
			node: { id: 'shop', name: kind === 'nurse' ? '宝可梦中心' : '旅行商店', kind: 'rest', encounters: [],
				reward: { money: 0, items: {} } } };
	}
	function encounter(kind, floor, doubles = true) {
		const r = run(kind, floor, doubles);
		if (kind === 'rocket') prepareSpiritNode(r, r.node, content(), () => 0);
		else beginShopChallenge(r, content(), () => 0);
		return r.node.encounters[0];
	}
	for (const kind of ['nurse', 'merchant', 'rocket']) {
		it(`keeps every ${kind} tier legal with the original headcount, level and IV budgets`, () => {
			for (const floor of [1, 9, 39, 40, 41, 49, 50, 55, 56, 62, 63, 64, 79, 80, 81, 120, 121, 160, 161, 199]) {
				const old = encounter(kind, floor, false), current = encounter(kind, floor);
				assert.equal(current.team.length, old.team.length);
				assert.equal(current.catchable, false); assert.equal(current.trainer.role, old.trainer.role);
				for (const mon of current.team) {
					assert.equal(mon.level, level(kind, floor)); assert.equal(mon.ivs.hp, kind === 'rocket' ? 20 : 25);
					assert.equal(Object.values(mon.evs).reduce((a, b) => a + b, 0), 0);
					assert.deepEqual(encounterSetProblems(mon), [], `${kind}/${floor}/${mon.species}`);
					assert.equal(new Set(mon.moves).size, 4);
					if (mon.item) assert(Dex.mod('gen9fantasy').items.get(mon.item).exists);
					if (mon.level < 25) assert.equal(mon.item, '');
				}
			}
		});
		for (const floor of [9, 59, 89, 169]) for (const multi of [false, true]) {
			it(`plays ${kind} ${floor} through the real ${multi ? 'Multi' : 'doubles'} opening`, () => {
				const team = encounter(kind, floor).team.map(mon => ({ ...mon, level: 50 })), split = splitCoopOpponents(team);
				const foe = name => ({ ...set(name, Dex.mod('gen9fantasy').species.get(name).abilities[0], 50, ['Tackle', 'Protect']) });
				battle = new Battle({ format: new Format({ name: 'Shop guards', mod: 'gen9fantasy',
					gameType: multi ? 'multi' : 'doubles', ruleset: [] }), strictChoices: true, seed: [1, 2, 3, 4],
				p1: { team: multi ? [foe('Snorlax')] : [foe('Snorlax'), foe('Blastoise')] },
				p2: { team: multi ? split.first : team },
				...(multi ? { p3: { team: [foe('Blastoise')] }, p4: { team: split.second } } : {}) });
				assert.equal(battle.p2.active[0].species.name, team[0].species);
				assert.equal((multi ? battle.p4.active[0] : battle.p2.active[1]).species.name, team[1].species);
				for (const side of battle.sides) for (const mon of side.activeRequest.active) delete mon.canTerastallize;
				const log = extractChannelMessages(battle.log.join('\n'), [0])[0];
				const ranked = multi ? rankMultiChoices({ p2: battle.p2.activeRequest, p4: battle.p4.activeRequest }, log,
					'gen9fantasy', { allowSwitch: true, jointTurns: true }) :
					rankDoublesChoices({ ownSide: 'p2', difficulty: 'normal', request: battle.p2.activeRequest, publicLog: log },
						'gen9fantasy', [], true, undefined, true);
				assert(ranked.length); assert.deepEqual(ranked[0].mechanics.failures, []);
				const commands = multi ? ranked[0].commands : { p2: ranked[0].choice };
				for (const [seat, choice] of Object.entries(commands)) assert(battle[seat].choose(choice), choice);
				for (const seat of multi ? ['p1', 'p3'] : ['p1']) assert(battle[seat].choose(multi ? 'move 1 1' : 'move 1 1, move 1 1'));
				battle.commitChoices(); assert(battle.ended || battle.turn > 1);
				assert(!battle.log.some(line => line.startsWith('|error|')));
			});
		}
	}
	it('retains known singles guards and their pre-existing shop closing reward contract', () => {
		assert.deepEqual(encounter('nurse', 169, false).team.map(mon => mon.species),
			['Blissey', 'Audino', 'Alomomola', 'Comfey', 'Wigglytuff']);
		assert.deepEqual(encounter('merchant', 169, false).team.map(mon => mon.species),
			['Persian', 'Greedent', 'Delibird', 'Murkrow', 'Gholdengo']);
		assert.deepEqual(encounter('rocket', 169, false).team.map(mon => mon.species),
			['Raticate', 'Arbok', 'Golbat', 'Weezing', 'Muk']);
		for (const doubles of [false, true]) {
			const r = run('rocket', 169, doubles);
			prepareSpiritNode(r, r.node, content(), () => 0);
			assert.deepEqual(r.node.rocket, { cleared: false, reward: 25000 });
			const saved = structuredClone(r); prepareSpiritNode(r, r.node, content(), () => { throw Error('reroll'); });
			assert.deepEqual(r, saved);
		}
	});
	it('uses complete authored early control and later speed cores rather than stat-only substitutes', () => {
		assert.deepEqual(shopDoublesTeam('merchant', 169, 85).slice(0, 2).map(mon => mon.species), ['Murkrow', 'Gholdengo']);
		assert(shopDoublesTeam('nurse', 9, 5)[1].moves.includes('followme'));
		assert(shopDoublesTeam('rocket', 59, 33)[1].moves.includes('tailwind'));
	});
});
