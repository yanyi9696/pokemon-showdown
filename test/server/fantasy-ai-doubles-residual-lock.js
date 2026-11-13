'use strict';

const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { DoublesDamageModel } = require('../../dist/server/fantasy-ai/doubles-mechanics');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');
const { rankMultiChoices } = require('../../dist/server/fantasy-ai/multi-policy');

describe('Fantasy doubles public move locks and residual states', () => {
	const battles = [];
	afterEach(() => { for (const battle of battles.splice(0)) battle.destroy(); });
	function start(multi = false) {
		const mon = { species: 'Snorlax', level: 50, ability: 'Thick Fat',
			moves: ['Protect', 'Tackle', 'Recover', 'Yawn'] };
		const battle = new Battle({ format: new Format({ name: 'Public residual reference', mod: 'gen9fantasy',
			gameType: multi ? 'multi' : 'doubles', ruleset: [] }), seed: [157, 1, 2, 3],
		p1: { team: multi ? [mon] : [mon, mon] }, p2: { team: multi ? [mon] : [mon, mon] },
		...(multi ? { p3: { team: [mon] }, p4: { team: [mon] } } : {}) });
		battles.push(battle);
		return battle;
	}
	function snapshot(battle) {
		return { mod: 'gen9fantasy', turn: battle.turn, weather: '', terrain: battle.field.terrain,
			trickRoom: false, conditions: { p1: [], p2: [] },
			pokemon: battle.sides.flatMap(side => side.active.map((mon, index) => ({
				id: `${side.id}${index ? 'b' : 'a'}`, side: side.id, position: `${side.id}${index ? 'b' : 'a'}`,
				species: mon.species.name, level: mon.level, health: mon.hp / mon.maxhp,
				stats: { hp: mon.maxhp, ...mon.storedStats }, ability: mon.ability, item: mon.item,
				moves: mon.moves.slice(), types: mon.types.slice(), status: mon.status, boosts: { ...mon.boosts },
				volatiles: Object.keys(mon.volatiles), activeActions: mon.activeMoveActions,
				lastMove: mon.lastMove?.id, encoreMove: mon.volatiles.encore?.move,
				yawnTurns: mon.volatiles.yawn?.duration,
			}))) };
	}
	const wait = () => ['p1a', 'p1b', 'p2a', 'p2b'].map(actor => ({ actor, kind: 'move', move: 'protect' }));
	for (const types of [['Normal'], ['Water'], ['Steel'], ['Water', 'Steel']]) {
		it(`matches native Salt Cure residual damage on ${types.join('/')}`, () => {
			const battle = start(), target = battle.p1.active[0];
			target.setType(types); target.addVolatile('saltcure', battle.p2.active[0]);
			const model = new DoublesDamageModel(snapshot(battle)), result = model.projectTurn(wait());
			battle.makeChoices('move 1, move 1', 'move 1, move 1');
			assert.deepEqual(result.omittedVolatiles, []);
			assert(result.samples.every(sample => sample.pokemon.p1a.health === target.hp / target.maxhp));
		});
	}
	it('uses native Magic Guard, suppression, and changed typing for Salt Cure', () => {
		for (const suppressed of [false, true]) {
			const battle = start(), target = battle.p1.active[0];
			target.setAbility('Magic Guard'); target.setType('Electric');
			target.addVolatile('saltcure', battle.p2.active[0]);
			if (suppressed) target.addVolatile('gastroacid');
			const result = new DoublesDamageModel(snapshot(battle)).projectTurn(wait());
			battle.makeChoices('move 1, move 1', 'move 1, move 1');
			assert(result.samples.every(sample => sample.pokemon.p1a.health === target.hp / target.maxhp));
			assert.equal(target.hp < target.maxhp, suppressed);
		}
	});
	it('removes Salt Cure and Yawn when switching out without transferring them to the replacement', () => {
		const state = snapshot(start());
		Object.assign(state.pokemon[0], { volatiles: ['saltcure', 'yawn'], yawnTurns: 1 });
		state.pokemon.push({ ...state.pokemon[0], id: 'reserve', position: undefined, volatiles: [], yawnTurns: undefined });
		const actions = wait(); actions[0] = { actor: 'p1a', kind: 'switch', reserve: 'reserve' };
		const result = new DoublesDamageModel(state).projectTurn(actions);
		assert.deepEqual(result.omittedVolatiles, []);
		assert(result.samples.every(sample => sample.pokemon.reserve.health === 1 && !sample.pokemon.reserve.status &&
			!sample.pokemon.p1a.status && sample.pokemon.p1a.health === 1));
	});
	for (const [remaining, terrain, ability] of [[1, '', 'Thick Fat'], [2, '', 'Thick Fat'],
		[1, 'electricterrain', 'Thick Fat'], [1, 'mistyterrain', 'Thick Fat'], [1, '', 'Insomnia']]) {
		it(`matches native Yawn timing and sleep prevention (${remaining}/${terrain}/${ability})`, () => {
			const battle = start(), target = battle.p1.active[0];
			target.addVolatile('yawn', battle.p2.active[0]); target.volatiles.yawn.duration = remaining;
			target.setAbility(ability); if (terrain) battle.field.setTerrain(terrain, battle.p2.active[0]);
			const model = new DoublesDamageModel(snapshot(battle)), result = model.projectTurn(wait());
			battle.makeChoices('move 1, move 1', 'move 1, move 1');
			assert.deepEqual(result.omittedVolatiles, []);
			assert(result.samples.every(sample => sample.pokemon.p1a.status === target.status));
			assert.equal(target.status === 'slp', remaining === 1 && !terrain && ability !== 'Insomnia');
		});
	}
	it('overrides Encore in both one-move and full-turn probes without inventing an unlocked attack', () => {
		const state = snapshot(start());
		Object.assign(state.pokemon[0], { lastMove: 'recover', encoreMove: 'recover', volatiles: ['encore'], health: 0.4 });
		const model = new DoublesDamageModel(state), single = model.project('p1a', 'tackle', 'p2a');
		assert.deepEqual(single.omittedVolatiles, []); assert.deepEqual(single.damage, {});
		assert(single.healing.p1a > 0.45);
		const turn = model.projectTurn([{ actor: 'p1a', kind: 'move', move: 'tackle', target: 'p2a' }]);
		assert(turn.samples.every(sample => sample.moves.some(move => move.actor === 'p1a' && move.move === 'recover') &&
			sample.pokemon.p2a.health === 1 && sample.pokemon.p1a.health > 0.85));
	});
	it('preserves the native Z-move escape from Encore', () => {
		const state = snapshot(start());
		Object.assign(state.pokemon[0], { encoreMove: 'recover', volatiles: ['encore'], item: 'normaliumz' });
		const model = new DoublesDamageModel(state);
		assert.deepEqual(model.project('p1a', 'tackle', 'p2a').damage, {});
		assert(model.project('p1a', 'tackle', 'p2a', 'zmove').damage.p2a > 0);
	});
	it('matches a native Encore that locks a publicly executed recovery move', () => {
		const battle = start(), target = battle.p1.active[0];
		target.hp = Math.floor(target.maxhp * 0.2);
		battle.makeChoices('move 3, move 1', 'move 1, move 1');
		assert.equal(target.lastMove.id, 'recover');
		target.addVolatile('encore', battle.p2.active[0]);
		assert.equal(target.volatiles.encore.move, 'recover');
		const state = snapshot(battle), result = new DoublesDamageModel(state).projectTurn(wait());
		battle.makeChoices('move 3, move 1', 'move 1, move 1');
		assert(result.samples.every(sample => sample.pokemon.p1a.health === target.hp / target.maxhp &&
			sample.moves.some(move => move.actor === 'p1a' && move.move === 'recover')));
	});
	it('does not hypothesize free enemy attacks or Protect while publicly locked into recovery', () => {
		const battle = start(), log = extractChannelMessages(battle.log.join('\n'), [0])[0];
		log.push('|move|p1a: Snorlax|Tackle|p2a: Snorlax', '|move|p1a: Snorlax|Protect|p1a: Snorlax',
			'|move|p1a: Snorlax|Recover|p1a: Snorlax', '|-start|p1a: Snorlax|Encore', '|turn|2');
		const request = structuredClone(battle.p2.activeRequest);
		for (const active of request.active) delete active.canTerastallize;
		const replies = [], original = DoublesDamageModel.prototype.projectTurn;
		DoublesDamageModel.prototype.projectTurn = function (actions) {
			replies.push(...actions.filter(action => action.actor === 'p1a'));
			return original.call(this, actions);
		};
		try {
			const ranked = rankDoublesChoices({ ownSide: 'p2', difficulty: 'normal', request, publicLog: log },
				'gen9fantasy', [], false, undefined, true);
			assert(ranked[0].jointTurn); assert(replies.length);
			assert(replies.every(action => action.move === 'recover'));
		} finally { DoublesDamageModel.prototype.projectTurn = original; }
	});
	it('retains an explicit incomplete-state fallback when an Encore target move was never observed', () => {
		const state = snapshot(start()); state.pokemon[0].volatiles.push('encore');
		const model = new DoublesDamageModel(state);
		assert.equal(model.hasIncompleteTurnState(), true);
		assert.deepEqual(model.projectTurn(wait()).omittedVolatiles, ['encore']);
	});
	for (const multi of [false, true]) it(`tracks public locks and delayed sleep through replacement/end/switch (${multi})`, () => {
		const battle = start(multi), log = extractChannelMessages(battle.log.join('\n'), [0])[0];
		log.push('|move|p2a: Snorlax|Recover|p2a: Snorlax', '|-start|p2a: Snorlax|Encore',
			'|-start|p2a: Snorlax|move: Yawn|[of] p1a: Snorlax', '|upkeep', '|turn|2');
		const requests = multi ? { p2: structuredClone(battle.p2.activeRequest), p4: structuredClone(battle.p4.activeRequest) } :
			structuredClone(battle.p2.activeRequest);
		for (const request of multi ? Object.values(requests) : [requests]) {
			for (const active of request.active) delete active.canTerastallize;
		}
		const original = DoublesDamageModel.prototype.project;
		let seen;
		DoublesDamageModel.prototype.project = function (...args) { seen = this.snapshot; return original.apply(this, args); };
		const rank = () => multi ? rankMultiChoices(requests, log, 'gen9fantasy', { jointTurns: true }) :
			rankDoublesChoices({ ownSide: 'p2', difficulty: 'normal', request: requests, publicLog: log },
				'gen9fantasy', [], false, undefined, true);
		try {
			assert(rank()[0].jointTurn);
			let mon = seen.pokemon.find(pokemon => pokemon.id === 'p2a');
			assert.equal(mon.encoreMove, 'recover'); assert.equal(mon.yawnTurns, 1);
			log.push('|move|p2a: Snorlax|Tackle|p1a: Snorlax|[from] move: Instruct',
				'|replace|p2a: Snorlax|Zoroark, L50');
			rank(); mon = seen.pokemon.find(pokemon => pokemon.id === 'p2a');
			assert.equal(mon.encoreMove, 'recover', 'the locked move stays fixed across another observed move');
			assert.equal(mon.yawnTurns, 1);
			log.push('|-end|p2a: Snorlax|Encore', '|-end|p2a: Snorlax|move: Yawn'); rank();
			mon = seen.pokemon.find(pokemon => pokemon.id === 'p2a');
			assert.equal(mon.encoreMove, undefined); assert.equal(mon.yawnTurns, undefined);
			log.push('|-start|p2a: Snorlax|Encore', '|-start|p2a: Snorlax|move: Yawn',
				'|switch|p2a: replacement|Snorlax, L50|100/100'); rank();
			mon = seen.pokemon.find(pokemon => pokemon.id === 'p2a');
			assert(!mon.volatiles.includes('encore')); assert(!mon.volatiles.includes('yawn'));
			assert.equal(mon.encoreMove, undefined); assert.equal(mon.yawnTurns, undefined);
		} finally { DoublesDamageModel.prototype.project = original; }
	});
});
