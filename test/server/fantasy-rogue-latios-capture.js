'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { rogueBattleResult, rogueCaptureChance } = require('../../dist/sim/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue Latios capture and fainted leads', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function create(mask = 7, chance = 1) {
		const team = ['Dracovish', 'Zubat', 'Pikachu'].map((species, i) => {
			const mon = createRoguePokemon(set(species, 'Run Away', 10, ['Splash']), stats(0));
			if (!(mask & (1 << i))) mon.hp = 0;
			return mon;
		});
		battle = new Battle({ formatid: 'gen9fantasyroguedoubles', seed: [1, 2, 3, 4], fantasyRogue: {
			encounterId: 'latios-capture', team, boosts: stats(0), catchable: true, wild: true,
			bag: { pokeball: 9 }, balls: [{ id: 'pokeball', name: '精灵球', chance }], spirit: { id: 'latios', version: 1 },
		}, p1: { name: 'Player', team: team.map(mon => mon.set) }, p2: { name: 'Wild', team: [
			set('Magikarp', 'Swift Swim', 8, ['Splash']), set('Stunfisk', 'Static', 8, ['Splash']),
		] } });
		return battle;
	}
	function request() {
		let result;
		const send = battle.send;
		battle.send = (type, data) => {
			if (type === 'sideupdate' && data.startsWith('p1\n|request|')) result = JSON.parse(data.slice(12));
		};
		try { battle.p1.emitRequest(battle.p1.activeRequest); } finally { battle.send = send; }
		return result;
	}
	for (let mask = 1; mask <= 7; mask++) {
		it(`only sends living partners at battle start, roster mask ${mask}`, () => {
			create(mask);
			const saved = structuredClone(battle.fantasyRogue.team);
			assert.equal(battle.p1.active.filter(Boolean).length, Math.min(2, saved.filter(m => m.hp).length));
			assert(battle.p1.active.filter(Boolean).every(mon => mon.hp > 0 && !mon.fainted));
			assert(!battle.log.some(line => line.startsWith('|switch|p1') && /\|0(?: fnt|\/)/.test(line)));
			battle.makeChoices('default', 'default'); assert.equal(battle.turn, 2);
			for (const original of saved.filter(mon => !mon.hp)) {
				assert.equal(battle.p1.pokemon.find(mon => mon.set.fantasyRogueId === original.id).hp, 0);
			}
			assert.deepEqual(battle.fantasyRogue.team, saved, 'battle ordering must not rewrite the persistent roster');
		});
	}
	for (const first of [1, 2]) {
		it(`catches position ${first} and then the remaining position, including old-client fallback`, () => {
			create();
			assert.deepEqual(request().fantasyRogue.captureTargets.map(t => t.key), ['p2:0', 'p2:1']);
			const target = battle.p2.active[first - 1].set.fantasyRogueId;
			battle.makeChoices(`rogueball pokeball ${first}, move 1`, 'move 1, move 1');
			assert.equal(battle.fantasyRogue.captures[0].id, target);
			assert.equal(battle.fantasyRogue.bag.pokeball, 8);
			const next = request().fantasyRogue;
			assert.equal(next.captureTargets.length, 1); assert.equal(next.balls[0].chance, 1);
			battle.makeChoices('rogueball pokeball, move 1', 'default');
			assert.equal(battle.fantasyRogue.captures.length, 2); assert.equal(battle.fantasyRogue.bag.pokeball, 7);
			assert(battle.ended); assert.equal(battle.winner, 'Player');
			const result = rogueBattleResult(battle);
			assert.deepEqual(Object.values(result.captureOwners), ['p1', 'p1']);
		});
	}
	it('uses the second living actor when the first slot has fainted and no replacements remain', () => {
		create(3);
		battle.p1.active[0].faint(); battle.faintMessages(); battle.makeRequest('move');
		assert.equal(rogueCaptureChance(battle, battle.fantasyRogue.balls[0]), 1);
		battle.makeChoices('pass, rogueball pokeball 2', 'move 1, move 1');
		assert.equal(battle.fantasyRogue.captures[0].set.species, 'Stunfisk');
		assert.equal(battle.fantasyRogue.bag.pokeball, 8);
	});
	it('uses the chosen actor and its Level Ball bonus, not the first partner', () => {
		create();
		delete battle.fantasyRogue.balls[0].chance;
		battle.fantasyRogue.balls[0].rule = { condition: 'level' };
		battle.p1.active[0].level = 4; battle.p1.active[1].level = 40;
		const chances = request().fantasyRogue.captureTargets[1].slotChances;
		assert(chances[1].pokeball > chances[0].pokeball);
		battle.choose('p1', 'move 1, rogueball pokeball 2');
		assert.equal(battle.p1.choice.actions[1].pokemon, battle.p1.active[1]);
		battle.choose('p2', 'move 1, move 1');
		assert.equal(battle.fantasyRogue.captures[0].set.species, 'Stunfisk');
	});
	it('rejects nonexistent targets and an opponent attempting to throw without consuming balls', () => {
		create();
		for (const target of ['0', '-1', '3', '4', 'p2:1', '1 2']) {
			assert.equal(battle.choose('p1', `rogueball pokeball ${target}, move 1`), false);
		}
		assert.equal(battle.choose('p2', 'rogueball pokeball 1, move 1'), false);
		assert.equal(battle.fantasyRogue.bag.pokeball, 9); assert(!battle.fantasyRogue.captures);
	});
	it('does not double catch or double charge when both partners select the same target', () => {
		create(); battle.makeChoices('rogueball pokeball 2, rogueball pokeball 2', 'move 1, move 1');
		assert.equal(battle.fantasyRogue.captures.length, 1); assert.equal(battle.fantasyRogue.bag.pokeball, 8);
		assert.equal(battle.turn, 2);
	});
	it('does not charge during repeated choice replacement before the opponent responds', () => {
		create();
		for (let n = 0; n < 3; n++) assert(battle.choose('p1', 'rogueball pokeball 2, move 1'));
		assert.equal(battle.fantasyRogue.bag.pokeball, 9);
		assert.match(battle.p1.getChoice(), /rogueball pokeball 2/);
		battle.choose('p2', 'move 1, move 1');
		assert.equal(battle.fantasyRogue.captures.length, 1); assert.equal(battle.fantasyRogue.bag.pokeball, 8);
	});
	it('leaves the target alive on failure and continues both partners next turn', () => {
		create(7, 0); battle.makeChoices('rogueball pokeball 2, move 1', 'move 1, move 1');
		assert.equal(battle.fantasyRogue.bag.pokeball, 8); assert(!battle.fantasyRogue.captures);
		assert(battle.p2.active.every(mon => mon.hp)); assert.equal(battle.turn, 2);
		battle.makeChoices('default', 'default'); assert.equal(battle.turn, 3);
	});
	it('preserves a pending second-slot throw across native serialization', () => {
		create(); battle.choose('p1', 'move 1, rogueball pokeball 2');
		const saved = JSON.stringify(battle); battle.destroy(); battle = null;
		battle = Battle.fromJSON(saved);
		assert.equal(battle.p1.choice.actions[1].target, battle.p2.active[1]);
		battle.choose('p2', 'move 1, move 1');
		assert.equal(battle.fantasyRogue.captures[0].set.species, 'Stunfisk');
		assert.equal(battle.fantasyRogue.bag.pokeball, 8);
	});
	it('preserves Nuzlocke target restrictions instead of unlocking the other slot', () => {
		create();
		battle.fantasyRogue.nuzlocke = { captureAllowed: true, target: battle.p2.active[0].set.fantasyRogueId, dead: [] };
		assert.equal(request().fantasyRogue.captureTargets[1].chances.pokeball, null);
		assert.equal(battle.choose('p1', 'rogueball pokeball 2, move 1'), false);
		assert.equal(battle.fantasyRogue.bag.pokeball, 9);
		battle.makeChoices('rogueball pokeball 1, move 1', 'move 1, move 1');
		assert.equal(battle.fantasyRogue.captures.length, 1);
		assert.equal(battle.choose('p1', 'rogueball pokeball 2, move 1'), false);
	});
	it('rejects fainted switches without reviving or changing their persistent HP', () => {
		create(5);
		const fainted = battle.p1.pokemon.find(mon => !mon.hp), slot = fainted.position + 1;
		assert.equal(battle.choose('p1', `switch ${slot}, move 1`), false);
		assert.equal(fainted.hp, 0); assert(!fainted.isActive);
		battle.makeChoices('default', 'default'); assert.equal(battle.turn, 2);
	});
});
