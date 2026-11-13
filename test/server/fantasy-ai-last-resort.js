'use strict';

const assert = require('assert').strict;
const { Battle, Teams } = require('../../dist/sim');
const { extractChannelMessages } = require('../../dist/sim/battle');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { emergencyChoice } = require('../../dist/server/fantasy-ai/fallback');
const { WorldBuilder } = require('../../dist/server/fantasy-ai/world');
const { reconstructWorld } = require('../../dist/server/fantasy-ai/reconstruction');
const { HypothesisBuilder } = require('../../dist/server/fantasy-ai/hypotheses');
const { readBattleMemory } = require('../../dist/server/fantasy-ai/memory');
const { createMatchup } = require('../../dist/server/fantasy-ai/matchup');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy AI Last Resort prerequisites', () => {
	const format = 'gen9fantasyrogue', seed = [11, 22, 33, 44];
	let battle, trainer;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function start(moves = ['Last Resort', 'Tackle']) {
		const player = set('Blissey', 'Natural Cure', 100, ['Splash']);
		const team = [set('Kangaskhan', 'Early Bird', 50, moves), set('Slowbro', 'Own Tempo', 50, ['Splash'])];
		battle = new Battle({ formatid: format, seed,
			fantasyRogue: { encounterId: 'last-resort', team: [createRoguePokemon(player, stats(0))],
				boosts: stats(0), bag: {}, balls: [], catchable: false },
			p1: { team: [player] }, p2: { team },
		});
		trainer = { format, style: 'balanced', packedTeam: Teams.pack(team), keyMembers: [], resourcePreferences: [] };
		battle.makeChoices('team 1', 'team 12');
	}
	function observe() {
		const view = new InformationView({ ownSide: 'p2', difficulty: 'normal' });
		view.receiveUpdate(extractChannelMessages(battle.log.join('\n'), [0])[0].join('\n'));
		return view.observe(battle.p2.activeRequest);
	}
	function choice() { return emergencyChoice(observe(), format, ['switch 2'], true); }
	it('uses its other move before Last Resort, then can use Last Resort successfully', () => {
		start();
		assert.equal(choice(), 'move 2');
		battle.makeChoices('move 1', choice());
		assert.equal(choice(), 'move 1');
		const hp = battle.p1.active[0].hp;
		battle.makeChoices('move 1', choice());
		assert(battle.p1.active[0].hp < hp);
	});
	it('does not mistake PP spent before switching out for moves used after returning', () => {
		start();
		battle.makeChoices('move 1', 'move 2');
		battle.makeChoices('move 1', 'switch 2');
		const returningSlot = battle.p2.pokemon.findIndex(mon => mon.species.id === 'kangaskhan') + 1;
		battle.makeChoices('move 1', `switch ${returningSlot}`);
		assert.equal(choice(), 'move 2');
		assert.equal(battle.p2.active[0].getMoveData('tackle').used, false);
	});
	it('counts an unsuccessful direct move as used, matching the native PP rule', () => {
		start(['Last Resort', 'Splash']);
		battle.makeChoices('move 1', 'move 2');
		assert(battle.p2.active[0].getMoveData('splash').used);
		assert.equal(choice(), 'move 1');
	});
	it('does not count a Sleep Talk called move as a directly used move slot', () => {
		start(['Last Resort', 'Sleep Talk', 'Tackle']);
		battle.p2.active[0].setAbility('comatose');
		const nativeSample = battle.sample.bind(battle);
		battle.sample = values => values.includes('tackle') ? 'tackle' : nativeSample(values);
		battle.makeChoices('move 1', 'move 2');
		assert(!battle.p2.active[0].getMoveData('tackle').used);
		assert.notEqual(choice(), 'move 1');
	});
	for (const ready of [false, true]) it(`preserves ${ready ? 'satisfied' : 'unsatisfied'} prerequisites in full and single-move native probes`, () => {
		start();
		if (ready) battle.makeChoices('move 1', 'move 2');
		const obs = observe(), memory = readBattleMemory(obs.publicLog, battle.dex);
		const builder = new HypothesisBuilder(format);
		const own = builder.own(obs.request.side.pokemon[0], memory.sides.p2.active);
		const foe = builder.build(memory.sides.p1.active, obs, memory)[0];
		const copies = [reconstructWorld(new WorldBuilder(trainer).build(obs)[0], seed),
			createMatchup(format, own, foe, memory, 'p2').battle];
		try {
			for (const copy of copies) {
				const mon = copy.sides.flatMap(side => side.active).find(p => p?.species.id === 'kangaskhan');
				assert.equal(mon.getMoveData('tackle').used, ready);
				assert.equal(copy.dex.moves.get('lastresort').onTry.call(copy, mon), ready);
			}
		} finally { for (const copy of copies) copy.destroy(); }
	});
});
