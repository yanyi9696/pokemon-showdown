'use strict';
const { commandAfterOpening } = require('../fixtures/fantasy-rogue');
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon, rebuildMember } = require('../../dist/server/fantasy-rogue/progression');
const { completeSpiritRegion, prepareSpiritNode } = require('../../dist/server/fantasy-rogue/spirits');
const { activeRogueSpirits, ROGUE_SPIRITS, rogueCoinDamageMultiplier } = require('../../dist/sim/fantasy-rogue-spirits');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { recordClear } = require('../../dist/server/fantasy-rogue/legacy');
const { buildRogueDuelState } = require('../../dist/server/fantasy-rogue/duels');
const { readBattleMemory } = require('../../dist/server/fantasy-ai/memory');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { WorldBuilder } = require('../../dist/server/fantasy-ai/world');
const { reconstructWorld } = require('../../dist/server/fantasy-ai/reconstruction');
const { Teams } = require('../../dist/sim/teams');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue additional tower spirits', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function begin(id, moves = ['Dragon Rage', 'Splash', 'Trick Room'], options = {}) {
		const team = [createRoguePokemon(set('Snorlax', 'Immunity', 50, moves), stats(0))];
		if (options.ally) team.push(createRoguePokemon(set('Blissey', 'Natural Cure', 50, ['Splash']), stats(0)));
		const foes = options.foes || [set('Snorlax', 'Immunity', 50, ['Splash', 'Dragon Rage', 'Protect'])];
		const state = { encounterId: 'new:1', team, boosts: stats(0), bag: { pokeball: 1 }, catchable: true,
			balls: [{ id: 'pokeball', name: '精灵球', chance: 1 }], spirit: { id, floor: 100, money: options.money },
			opponentStars: options.stars };
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: 'Player', team: team.map(mon => mon.set) }, p2: { name: 'Foe', team: foes } });
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		return state;
	}
	const turn = (ours = 'move 2', theirs = 'move 1') => {
		battle.choose('p1', ours); battle.choose('p2', theirs);
	};
	it('keeps every name and Pokemon unique, including unavailable spirits', () => {
		assert.equal(new Set(ROGUE_SPIRITS.map(s => s.name)).size, ROGUE_SPIRITS.length);
		assert.equal(new Set(ROGUE_SPIRITS.map(s => s.species)).size, ROGUE_SPIRITS.length);
		assert.equal(activeRogueSpirits().length, 35);
	});
	it('uses a linear, uncapped coin ratio and excludes opponent and residual damage', () => {
		assert.equal(rogueCoinDamageMultiplier(50000), 1.01);
		assert.equal(rogueCoinDamageMultiplier(2500000), 1.5);
		assert.equal(rogueCoinDamageMultiplier(10000000), 3);
		begin('gimmighoul', undefined, { money: 2500000 });
		const a = battle.p1.active[0], b = battle.p2.active[0], hp = a.hp, foeHP = b.hp;
		const move = battle.dex.getActiveMove('tackle');
		assert.equal(battle.runEvent('ModifyDamage', a, b, move, 100), 150);
		assert.equal(battle.runEvent('ModifyDamage', b, a, move, 100), 100);
		turn('move 1', 'move 2');
		assert.equal(a.hp, hp - 40); assert.equal(b.hp, foeHP - 40);
		battle.damage(10, b, a, battle.dex.conditions.get('psn'));
		assert.equal(b.hp, foeHP - 50);
	});
	it('starts permanent Trick Room, allows closing, and later casts have ordinary duration', () => {
		begin('palkia');
		for (let i = 0; i < 7; i++) turn();
		assert(battle.field.pseudoWeather.trickroom);
		assert.equal(battle.field.pseudoWeather.trickroom.duration, undefined);
		const memory = readBattleMemory(battle.log, battle.dex);
		assert.equal(memory.fieldDurations.trickroom, Infinity);
		turn('move 3'); assert(!battle.field.pseudoWeather.trickroom);
		turn(); assert(!battle.field.pseudoWeather.trickroom);
		turn('move 3'); assert.equal(battle.field.pseudoWeather.trickroom.duration, 4);
		for (let i = 0; i < 4; i++) turn();
		assert(!battle.field.pseudoWeather.trickroom);
	});
	it('rolls wild stars at the 8% boundary, once, excluding trainers', () => {
		const run = { spirit: 'diancie', spiritVersion: 1, floor: 1 };
		const node = { encounters: [0, 1].map(() => ({ catchable: true, team: [set()] })), reward: { items: {} } };
		let n = 7;
		prepareSpiritNode(run, node, {}, max => max === 100 ? n++ : 999);
		assert.deepEqual(node.encounters.map(e => e.stars), [[2], [1]]);
		prepareSpiritNode(run, node, {}, () => { throw new Error('Rerolled stars'); });
		const trainer = { encounters: [{ trainer: {}, catchable: false, team: [set()] }], reward: { items: {} } };
		prepareSpiritNode(run, trainer, {}, () => { throw new Error('Rolled trainer'); });
		assert(!trainer.encounters[0].stars);
	});
	it('scales all wild stats once and preserves two-star captures through settlement and rebuild', () => {
		begin('diancie', undefined, { stars: [2] });
		const foe = battle.p2.active[0], plain = createRoguePokemon(foe.set, stats(0));
		for (const stat of Object.keys(stats(0))) assert.equal(foe.baseStoredStats[stat], Math.floor(plain.stats[stat] * 1.2));
		turn('rogueball pokeball');
		const result = rogueBattleResult(battle);
		assert.equal(result.captured.stars, 2);
		const mon = createRoguePokemon(result.captured.set, stats(0), 'captured', result.captured.stars);
		assert.equal(mon.stars, 2); assert.equal(mon.maxhp, foe.maxhp);
		rebuildMember(mon, stats(0)); assert.equal(mon.maxhp, foe.maxhp);
	});
	it('delays both sides by exactly two turns, stacks attacks and spends PP only on launch', () => {
		begin('dialga'); const a = battle.p1.active[0], b = battle.p2.active[0], hp = a.hp;
		turn('move 1', 'move 2'); assert.equal(a.hp, hp); assert.equal(b.hp, hp);
		turn('move 1', 'move 2'); assert.equal(a.hp, hp);
		turn(); assert.equal(a.hp, hp - 40); assert.equal(b.hp, hp - 40);
		turn(); assert.equal(a.hp, hp - 80); assert.equal(b.hp, hp - 80);
		assert.equal(a.moveSlots[0].pp, 8);
		assert.equal(battle.fantasyRogue.futureAttacks.length, 0);
	});
	it('keeps status moves immediate and attack secondary effects delayed', () => {
		begin('dialga', ['Nuzzle', 'Swords Dance', 'Splash']);
		const a = battle.p1.active[0], b = battle.p2.active[0];
		turn('move 2'); assert.equal(a.boosts.atk, 2);
		turn('move 1'); assert.equal(b.status, '');
		turn('move 3'); assert.equal(b.status, '');
		turn('move 3'); assert.equal(b.status, 'par');
	});
	it('targets the replacement and bypasses Protect like a future attack', () => {
		begin('dialga', undefined, { foes: [set('Snorlax', 'Immunity', 50, ['Splash']),
			set('Blissey', 'Natural Cure', 50, ['Splash', 'Protect'])] });
		const originalHP = battle.p2.active[0].hp;
		turn('move 1'); turn('move 2', 'switch 2');
		const target = battle.p2.active[0], hp = target.hp;
		turn('move 2', 'move 2'); assert.equal(target.hp, hp - 40);
		assert.equal(battle.p2.pokemon[1].hp, originalHP);
	});
	it('preserves queued attacks across native JSON restoration', () => {
		begin('dialga'); turn('move 1');
		const saved = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(saved);
		const foe = battle.p2.active[0], hp = foe.hp;
		turn(); turn(); assert.equal(foe.hp, hp - 40);
		assert.equal(battle.fantasyRogue.futureAttacks.length, 0);
	});
	it('waits for charging to finish before starting the delay', () => {
		begin('dialga', ['Fly', 'Splash']);
		const foe = battle.p2.active[0], hp = foe.hp;
		turn('move 1'); assert.equal(battle.fantasyRogue.futureAttacks?.length || 0, 0);
		turn('move 1'); assert.equal(battle.fantasyRogue.futureAttacks[0].turn, 4);
		turn(); assert.equal(foe.hp, hp);
		turn(); assert(foe.hp < hp);
	});
	it('keeps multihit attacks after the user leaves the field or faints', () => {
		begin('dialga', ['Double Kick', 'Splash'], { ally: true });
		const source = battle.p1.active[0], foe = battle.p2.active[0], hp = foe.hp;
		turn('move 1'); turn('switch 2');
		battle.faint(source, foe, battle.dex.moves.get('pursuit')); battle.faintMessages();
		turn('move 1');
		assert(foe.hp < hp);
		assert(battle.log.some(line => line.startsWith('|-hitcount|') && line.endsWith('|2')));
		assert.equal(source.hp, 0);
	});
	it('keeps permanent space in normal AI reconstructions after the fifth turn', () => {
		begin('palkia'); for (let i = 0; i < 6; i++) turn();
		const view = new InformationView({ ownSide: 'p2', difficulty: 'normal', partySize: 1,
			rogueBoosts: stats(0), rogueSpirit: { id: 'palkia', floor: 100 } });
		view.receiveUpdate(battle.log.join('\n'));
		const world = new WorldBuilder({ format: 'gen9fantasyrogue', packedTeam: Teams.pack(battle.p2.team) })
			.build(view.observe(battle.p2.activeRequest))[0];
		const simulated = reconstructWorld(world, [1, 2, 3, 4]);
		try {
			assert(simulated.field.pseudoWeather.trickroom);
			assert.equal(simulated.field.pseudoWeather.trickroom.duration, undefined);
		} finally { simulated.destroy(); }
	});
	it('does not double-delay native Future Sight and Doom Desire', () => {
		begin('dialga', ['Future Sight', 'Doom Desire', 'Splash']);
		const foe = battle.p2.active[0], hp = foe.hp;
		turn('move 1'); turn('move 2'); assert.equal(foe.hp, hp);
		turn('move 3'); assert(foe.hp < hp);
		const after = foe.hp; turn('move 3'); assert(foe.hp < after);
		assert.equal(battle.fantasyRogue.futureAttacks.length, 0);
	});
	it('reconstructs public pending attacks for the normal AI', () => {
		begin('dialga'); turn('move 1');
		const view = new InformationView({ ownSide: 'p2', difficulty: 'normal', partySize: 1,
			rogueBoosts: stats(0), rogueSpirit: { id: 'dialga', floor: 100 } });
		view.receiveUpdate(battle.log.join('\n'));
		const world = new WorldBuilder({ format: 'gen9fantasyrogue', packedTeam: Teams.pack(battle.p2.team) })
			.build(view.observe(battle.p2.activeRequest))[0];
		const simulated = reconstructWorld(world, [1, 2, 3, 4]);
		try { assert.equal(simulated.fantasyRogue.futureAttacks.length, 1); } finally { simulated.destroy(); }
	});
	it('applies growth only on full-region success and later captures inherit it', () => {
		const store = new RogueStore(':memory:');
		try {
			const content = createPreviewContent();
			content.events = false;
			const engine = new RogueEngine(store, content, max => max - 1, true);
			const cmd = (action, extra = {}) => commandAfterOpening(engine, 'growth', { id: randomUUID(), revision: store.get('growth').revision, action, ...extra });
			cmd('start', { starters: ['bulbasaur'], useSpirit: true, testSpirit: 'zacian' }); cmd('spiritack'); cmd('select', { value: 'wild0' });
			const fight = won => {
				cmd('battle'); const run = store.get('growth').run;
				const result = { won, encounterId: run.battle.encounterId, team: run.team, bag: run.bag };
				engine.settle('growth', run.battle.token, result); engine.settle('growth', run.battle.token, result);
			};
			fight(false); assert.equal(store.get('growth').run.boosts.atk, 0);
			fight(true); let run = store.get('growth').run;
			assert.equal(run.boosts.atk, 1); assert.equal(store.get('growth').boosts.atk, 0);
			const later = createRoguePokemon(set(), run.boosts), plain = createRoguePokemon(set(), stats(0));
			assert.equal(later.stats.atk, plain.stats.atk + 1);
			run = { ...run, spirit: 'mewtwo', node: { kind: 'event' } };
			for (const kind of ['event', 'trade', 'reward']) { run.node.kind = kind; completeSpiritRegion(run); }
			assert.equal(run.boosts.spa, 3);
			for (const kind of ['rest', 'boss', 'wild', 'adventure']) { run.node.kind = kind; completeSpiritRegion(run); }
			assert.equal(run.boosts.spa, 3);
		} finally { store.close(); }
	});
	it('archives growth and stars, and uses each owners archived money in PVP', () => {
		const card = (owner, money) => {
			const account = {};
			const team = [createRoguePokemon(set('Snorlax', 'Immunity', 50, ['Dragon Rage', 'Splash']), stats(4), 'saved', 2)];
			recordClear(account, { owner: { id: owner, name: owner }, id: owner, team, money, bag: {}, boosts: stats(4), spirit: 'gimmighoul' });
			return account.cards[0];
		};
		const a = card('one', 2500000), b = card('two', 500000);
		const state = buildRogueDuelState(a, b);
		battle = new Battle({ formatid: 'gen9fantasyrogueduel', fantasyRogue: state,
			p1: { name: 'One', team: state.team.map(mon => mon.set) }, p2: { name: 'Two', team: state.duel.team.map(mon => mon.set) } });
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		const p1 = battle.p1.active[0], p2 = battle.p2.active[0], hp = p1.hp;
		const move = battle.dex.getActiveMove('tackle');
		assert.equal(battle.runEvent('ModifyDamage', p1, p2, move, 100), 150);
		assert.equal(battle.runEvent('ModifyDamage', p2, p1, move, 100), 110);
		turn('move 1', 'move 1'); assert.equal(p1.hp, hp - 40); assert.equal(p2.hp, hp - 40);
		assert.equal(p1.storedStats.atk, state.team[0].stats.atk);
	});
});
