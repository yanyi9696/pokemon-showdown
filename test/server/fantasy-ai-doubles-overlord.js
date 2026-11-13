'use strict';
const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { DoublesDamageModel } = require('../../dist/server/fantasy-ai/doubles-mechanics');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');
const { prepareMultiChoices, rankMultiChoices } = require('../../dist/server/fantasy-ai/multi-policy');
const mon = (species, ability = '', moves = ['Splash']) => ({ species, ability, moves, level: 50,
	nature: 'Serious', evs: { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 } });
const idle = () => mon('Blissey', 'Natural Cure');

describe('Fantasy doubles Supreme Overlord public state', () => {
	const battles = [];
	afterEach(() => { for (const battle of battles.splice(0)) battle.destroy(); });
	function start() {
		const battle = new Battle({ format: new Format({ name: 'Overlord reference', mod: 'gen9fantasy',
			gameType: 'doubles', ruleset: [] }), seed: [156, 2, 1, 1],
		p1: { name: 'QA', team: [mon('Kingambit', 'Supreme Overlord', ['Kowtow Cleave']), idle(),
			mon('Kingambit', 'Supreme Overlord', ['Kowtow Cleave'])] }, p2: { name: 'Foe', team: [idle(), idle()] } });
		battles.push(battle); return battle;
	}
	function snapshot(battle) {
		return { mod: 'gen9fantasy', turn: battle.turn, weather: '', terrain: '', trickRoom: false,
			conditions: { p1: [], p2: [] }, pokemon: battle.sides.flatMap(side => side.pokemon.map((pokemon, index) => ({
				id: `${side.id}-${index}`, side: side.id, position: index < 2 ? `${side.id}${index ? 'b' : 'a'}` : undefined,
				nativeSide: side.id, faintedAllies: side.totalFainted, species: pokemon.species.name, level: pokemon.level,
				health: pokemon.hp / pokemon.maxhp, stats: { hp: pokemon.maxhp, ...pokemon.storedStats },
				ability: pokemon.ability, item: pokemon.item, moves: pokemon.moves, types: pokemon.types,
				status: '', boosts: { ...pokemon.boosts }, activeActions: 1,
				volatiles: [...Object.keys(pokemon.volatiles), ...(pokemon.abilityState.fallen ? [`fallen${pokemon.abilityState.fallen}`] : [])],
			}))) };
	}
	function activate(battle, count) {
		battle.p1.totalFainted = count;
		const king = battle.p1.active[0];
		battle.singleEvent('Start', king.getAbility(), king.abilityState, king);
	}
	function expectedDamage(battle) {
		const king = battle.p1.active[0], target = battle.p2.active[0];
		return [85, 100].reduce((sum, percent) => {
			battle.randomizer = base => Math.floor(base * percent / 100);
			const move = battle.dex.getActiveMove('kowtowcleave'); move.willCrit = false;
			return sum + Math.min(target.hp, battle.actions.getDamage(king, target, move)) / target.maxhp / 2;
		}, 0);
	}
	for (const count of [1, 2, 3, 4, 5]) it(`matches native damage for ${count} publicly announced fallen allies`, () => {
		const battle = start(); activate(battle, count);
		const model = new DoublesDamageModel(snapshot(battle));
		assert.equal(model.hasIncompleteTurnState(), false);
		const result = model.project('p1-0', 'kowtowcleave', 'p2-0');
		assert.deepEqual(result.omittedVolatiles, []);
		assert.equal(result.damage['p2-0'], expectedDamage(battle));
	});
	it('keeps the entry multiplier when more allies fall, and respects ability suppression', () => {
		const battle = start(); activate(battle, 1); battle.p1.totalFainted = 5;
		for (const suppressed of [false, true]) {
			if (suppressed) battle.p1.active[0].addVolatile('gastroacid');
			const model = new DoublesDamageModel(snapshot(battle));
			assert.equal(model.project('p1-0', 'kowtowcleave', 'p2-0').damage['p2-0'], expectedDamage(battle));
		}
	});
	it('uses original Multi owners on native entry and counts projected defeats only for that owner', () => {
		const reference = start(), state = snapshot(reference);
		for (const pokemon of state.pokemon) {
			pokemon.nativeSide = pokemon.id === 'p1-1' ? 'p4' : pokemon.side === 'p1' ? 'p2' : 'p1';
			pokemon.faintedAllies = pokemon.nativeSide === 'p4' ? 4 : pokemon.nativeSide === 'p2' ? 1 : 0;
		}
		// Inspect the disposable native world to test its real switch/faint event handlers.
		const probe = new DoublesDamageModel(state).create(1); battles.push(probe.battle);
		const king = probe.pokemon.get('p1-0'), reserve = probe.pokemon.get('p1-2'), ally = probe.pokemon.get('p1-1');
		probe.battle.singleEvent('Start', king.getAbility(), king.abilityState, king);
		assert.equal(king.abilityState.fallen, 1);
		ally.faint(); probe.battle.faintMessages();
		assert.equal(king.abilityState.fallen, 1);
		probe.battle.actions.switchIn(reserve, 0); probe.battle.actions.runSwitch(reserve);
		assert.equal(reserve.abilityState.fallen, 1, 'partner defeat must not increase this native owner count');
		reserve.faint(); probe.battle.faintMessages();
		probe.battle.actions.switchIn(king, 0); probe.battle.actions.runSwitch(king);
		assert.equal(king.abilityState.fallen, 2, 'own new defeat is included on re-entry');
	});
	it('counts repeated public defeats after revival and preserves Multi reserve ownership', () => {
		const battle = new Battle({ format: new Format({ name: 'Multi ownership reference', mod: 'gen9fantasy',
			gameType: 'multi', ruleset: [] }), seed: [156, 3, 1, 1],
		p1: { team: [idle()] }, p3: { team: [idle()] },
		p2: { team: [mon('Kingambit', 'Supreme Overlord', ['Kowtow Cleave']), idle()] },
		p4: { team: [idle(), mon('Kingambit', 'Supreme Overlord', ['Kowtow Cleave'])] } });
		battles.push(battle);
		const history = ['|faint|p2a: Old', '|-heal|p2: Old|50/100', '|faint|p2a: Old',
			'|faint|p4a: Partner', '|faint|p3a: Opponent'];
		const prepared = prepareMultiChoices({ p2: structuredClone(battle.p2.activeRequest),
			p4: structuredClone(battle.p4.activeRequest) }, [...history, ...extractChannelMessages(battle.log.join('\n'), [0])[0]]);
		assert.deepEqual(prepared.observation.doublesNativeSides, {
			own: ['p2', 'p4', 'p2', 'p4'], fainted: { p1: 0, p2: 2, p3: 1, p4: 1 },
		});
		const seen = [], project = DoublesDamageModel.prototype.project;
		DoublesDamageModel.prototype.project = function (...args) { seen.push(this.snapshot); return project.apply(this, args); };
		try {
			const requests = { p2: structuredClone(battle.p2.activeRequest), p4: structuredClone(battle.p4.activeRequest) };
			for (const request of Object.values(requests)) delete request.active[0].canTerastallize;
			const scored = rankMultiChoices(requests, [...history, ...extractChannelMessages(battle.log.join('\n'), [0])[0]],
				'gen9fantasy', { allowSwitch: true, jointTurns: true });
			assert(scored.length && seen.length);
			for (const pokemon of seen[0].pokemon) {
				assert.equal(pokemon.faintedAllies, { p1: 0, p2: 2, p3: 1, p4: 1 }[pokemon.nativeSide]);
			}
			assert.equal(seen[0].pokemon.find(pokemon => pokemon.position === 'p2b').nativeSide, 'p4');
			assert.equal(seen[0].pokemon.find(pokemon => pokemon.position === 'p1b').nativeSide, 'p3');
		} finally { DoublesDamageModel.prototype.project = project; }
	});
	it('uses the public marker in policy projections and clears it on an announced end', () => {
		const battle = start(); activate(battle, 2);
		const request = structuredClone(battle.p1.activeRequest);
		for (const active of request.active) delete active.canTerastallize;
		const log = ['|faint|p1a: Prior', '|-heal|p1: Prior|50/100', '|faint|p1a: Prior', '|faint|p2a: Foe',
			...extractChannelMessages(battle.log.join('\n'), [0])[0]];
		const seen = [], project = DoublesDamageModel.prototype.project;
		DoublesDamageModel.prototype.project = function (...args) { seen.push(this.snapshot); return project.apply(this, args); };
		try {
			for (const ended of [false, true]) {
				seen.length = 0;
				const scored = rankDoublesChoices({ ownSide: 'p1', difficulty: 'normal', request,
					publicLog: [...log, ...(ended ? ['|-end|p1a: Kingambit|fallen2|[silent]'] : [])] },
				'gen9fantasy', [], false, undefined, true);
				assert(scored[0].jointTurn);
				assert.deepEqual(scored[0].mechanics.omittedVolatiles, []);
				assert(seen.length);
				assert.equal(seen[0].pokemon.find(pokemon => pokemon.position === 'p1a').volatiles.includes('fallen2'), !ended);
				assert(seen[0].pokemon.filter(pokemon => pokemon.side === 'p1').every(pokemon => pokemon.faintedAllies === 2));
				assert(seen[0].pokemon.filter(pokemon => pokemon.side === 'p2').every(pokemon => pokemon.faintedAllies === 1));
			}
		} finally { DoublesDamageModel.prototype.project = project; }
	});
});
