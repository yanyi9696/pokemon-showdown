'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim');
const { set, stats } = require('../fixtures/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { updateRogueEscort } = require('../../dist/sim/rogue-escort');
const { prepareMultiChoices } = require('../../dist/server/fantasy-ai/multi-policy');
describe('Fantasy Rogue protected Ralts escort', function () {
	this.timeout(15000);
	let battle;
	afterEach(() => battle?.destroy());
	function start(escortSide = 'p3', protectedEvent = true) {
		const player = ['Blissey', 'Snorlax'].map((s, i) => createRoguePokemon(set(s, 'Natural Cure', 50, ['Splash']), stats(0), 'human' + i));
		const ralts = [createRoguePokemon(set('Ralts', 'Synchronize', 50, ['Splash']), stats(0), 'escort')];
		const p1 = escortSide === 'p1' ? ralts : player, p3 = escortSide === 'p3' ? ralts : player;
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: { encounterId: 'escort', team: p1,
			partner: { team: p3, boosts: stats(0) }, boosts: stats(0), bag: {}, balls: [], catchable: false,
			cooperative: { opponentOffset: 1, escortSide: protectedEvent ? escortSide : undefined } },
		p1: { name: 'Human A', team: p1.map(m => m.set) }, p3: { name: 'Human B', team: p3.map(m => m.set) },
		p2: { name: 'Foe A', team: [set('Magikarp', 'Swift Swim', 30, ['Tackle'])] },
		p4: { name: 'Foe B', team: [set('Magikarp', 'Swift Swim', 30, ['Tackle'])] } });
		for (const side of battle.sides)
			if (side.requestState === 'teampreview')
				assert(battle.choose(side.id, 'team 1'));
		return { escort: battle.getSide(escortSide).active[0], player: battle.getSide(escortSide === 'p1' ? 'p3' : 'p1').active[0] };
	}
	for (const side of ['p1', 'p3'])
		it(`${side} cannot act or be hit while the player fights two enemies`, () => {
			const { escort, player } = start(side), hp = escort.hp;
			assert(escort.volatiles.commanding);
			assert(escort.volatiles.rogueescort);
			assert.equal(escort.getSwitchRequestData().commanding, true);
			assert.deepEqual(Object.values(player.boosts), [0, 0, 0, 0, 0, 0, 0]);
			battle.actions.useMove('Tackle', battle.p2.active[0], { target: escort });
			assert.equal(escort.hp, hp);
			battle.actions.useMove('Tackle', battle.p4.active[0], { target: player });
			assert(player.hp < player.maxhp);
			assert(battle.choose(side, 'pass'));
			const json = battle.toJSON(), restored = Battle.fromJSON(json);
			try {
				assert(restored.getSide(side).active[0].volatiles.commanding);
				assert.equal(restored.getSide(side).active[0].hp, hp);
			} finally {
				restored.destroy();
			}
		});
	it('releases protection when the player faints and restores it for the next healthy teammate', () => {
		const { escort, player } = start();
		player.hp = 0;
		updateRogueEscort(battle);
		assert(!escort.volatiles.commanding);
		assert(!escort.volatiles.rogueescort);
		player.hp = player.maxhp;
		updateRogueEscort(battle);
		updateRogueEscort(battle);
		assert(escort.volatiles.commanding);
		assert.equal(battle.log.filter(l => l.includes('|-start|p3') && l.includes('|rogueescort|')).length, 2);
		assert.equal(battle.log.filter(l => l.includes('|-end|p3') && l.includes('|rogueescort|')).length, 1);
	});
	it('does not change other NPC partners', () => { const { escort } = start('p3', false); assert(!escort.volatiles.commanding); });
	it('keeps both enemies targeting the visible player using public information', () => {
		start();
		const prepared = prepareMultiChoices({ p2: battle.p2.activeRequest, p4: battle.p4.activeRequest }, battle.log, { allowSwitch: false });
		assert(prepared);
		assert(prepared.candidates.length);
		for (const c of prepared.candidates)
			for (const a of c.actions)
				if (a.target > 0)
					assert.equal(a.target, 1);
	});
	it('auto-pass does not block consecutive rounds', () => {
		start();
		for (let i = 0; i < 3; i++) {
			for (const [id, choice] of [['p1', 'move 1'], ['p2', 'move 1 1'], ['p3', 'pass'], ['p4', 'move 1 1']]) {
				if (!battle.getSide(id).isChoiceDone())
					assert(battle.choose(id, choice));
			}
		}
		assert.equal(battle.turn, 4);
	});
});
