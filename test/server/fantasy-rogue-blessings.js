'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { Dex } = require('../../dist/sim/dex');
const { createRoguePokemon, rebuildMember } = require('../../dist/server/fantasy-rogue/progression');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { hasRogueStatus } = require('../../dist/sim/fantasy-rogue-status');
const { blessing, blessingLevelCost, addPsychicCharge, ROGUE_BLESSINGS } = require('../../dist/sim/rogue-blessing-data');
const { rogueStarScale } = require('../../dist/sim/fantasy-rogue-spirits');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue blessings in native battles', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	const owned = id => ({ ...blessing(id), floor: 50 });
	function begin(ids, ours = [set('Snorlax', 'Immunity', 50, ['Tackle', 'Splash', 'Detect', 'U-turn'])],
		foes = [set('Snorlax', 'Immunity', 50, ['Splash', 'Dragon Rage', 'Protect'])], options = {}) {
		battle?.destroy();
		const team = ours.map(s => createRoguePokemon(s, stats(0)));
		if (options.prepare) options.prepare(team);
		const effects = { owned: ids.map(owned), ...options.effects };
		for (const entry of effects.owned) if (entry.target) entry.target = team[0].id;
		const state = { encounterId: 'blessing:1', team, boosts: stats(0), bag: {}, balls: [], catchable: false, blessings: effects,
			...options.state };
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: 'Player', team: team.map(mon => mon.set) }, p2: { name: 'Foe', team: foes } });
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		return state;
	}
	const turn = (ours = 'move 1', theirs = 'move 1') => {
		assert(battle.choose('p1', ours), ours);
		assert(battle.choose('p2', theirs), theirs);
	};
	it('has unique options, current star scales and floor-based level costs', () => {
		assert.equal(ROGUE_BLESSINGS.length, new Set(ROGUE_BLESSINGS.map(b => b.id)).size);
		assert.deepEqual([1, 2, 3, 4, 5].map(rogueStarScale), [1, 1.2, 1.5, 2, 3]);
		assert.deepEqual([50, 100, 150].map(f => blessingLevelCost('gold', f)), [5, 10, 15]);
		assert.deepEqual([50, 100, 150].map(f => blessingLevelCost('prismatic', f)), [10, 20, 30]);
		assert.equal(addPsychicCharge(99, 3), 100.1);
		assert.equal(addPsychicCharge(120, 20), 121);
	});
	it('does not apply one side’s blessings to its opponent', () => {
		begin(['entrance']);
		const a = battle.p1.active[0], b = battle.p2.active[0];
		assert.equal(a.m.rogueBlessing.entries, 1);
		const m = battle.dex.getActiveMove('tackle');
		assert.equal(battle.runEvent('BasePower', a, b, m, 40), 40);
		assert.equal(a.getStat('atk'), Math.floor(a.storedStats.atk * 1.05));
		assert.equal(battle.runEvent('BasePower', b, a, m, 40), 40);
	});
	it('grants a fifth native move slot and preserves its PP', () => {
		begin(['learnall'], [set('Snorlax', 'Immunity', 50, ['Tackle', 'Splash', 'Detect', 'Rest', 'Growl'])]);
		assert.equal(battle.p1.activeRequest.active[0].moves.length, 5);
		turn('move 5');
		assert.equal(rogueBattleResult(battle).team[0].pp[4].pp, 39);
	});
	it('preserves inherited moves and their PP after a switch out and back', () => {
		begin(['inheritmoves'], [set('Magikarp', 'Swift Swim', 5, ['Splash']), set('Snorlax', 'Immunity', 50, ['Tackle']), set('Blissey', 'Natural Cure', 50, ['Growl'])]);
		turn('move 1', 'move 2');
		assert(battle.choose('p1', 'switch 2'));
		assert.equal(battle.p1.active[0].moveSlots.length, 2);
		turn('move 2');
		turn('switch 3'); turn('switch 3');
		assert.equal(battle.p1.active[0].moveSlots.find(m => m.id === 'splash').pp, 39);
		assert.equal(rogueBattleResult(battle).team[1].set.moves.length, 1);
	});
	it('stacks all seven statuses and cures all of them together', () => {
		begin(['stackstatus'], undefined, [set('Blissey', 'Natural Cure', 50, ['Splash'])]);
		const a = battle.p1.active[0], b = battle.p2.active[0];
		for (const id of ['brn', 'par', 'slp', 'psn', 'tox', 'fst', 'frz']) assert(b.trySetStatus(id, a), id);
		for (const id of ['brn', 'par', 'slp', 'psn', 'tox', 'fst', 'frz']) assert(hasRogueStatus(b, id), id);
		const old = b.hp;
		turn('move 2');
		assert(b.hp < old);
		b.cureStatus();
		assert.equal(b.status, ''); assert(!b.m.rogueStatusStack);
	});
	it('bypasses only type status immunity and still respects abilities and terrain', () => {
		begin(['stackstatus'], undefined, [set('Steelix', 'Sturdy', 50, ['Splash'])]);
		const a = battle.p1.active[0], b = battle.p2.active[0];
		assert(b.trySetStatus('psn', a)); b.cureStatus();
		b.setAbility('Immunity'); assert(!b.trySetStatus('psn', a));
		b.setAbility('Sturdy'); battle.field.setTerrain('mistyterrain', a);
		assert(!b.trySetStatus('brn', a));
	});
	it('adds native Natural Cure without replacing the species ability', () => {
		begin(['restinball'], [set('Snorlax', 'Immunity', 50, ['Splash']), set('Blissey', 'Natural Cure', 50, ['Splash'])]);
		const a = battle.p1.active[0];
		assert(a.hasAbility('naturalcure')); assert(a.hasAbility('immunity'));
		a.setStatus('brn'); turn('switch 2'); assert.equal(a.status, '');
	});
	it('unlocks the first Choice item move and locks the second actual move', () => {
		begin(['secondchoice'], [{ ...set('Snorlax', 'Immunity', 50, ['Tackle', 'Growl', 'Splash']), item: 'Choice Band' }]);
		turn('move 1');
		assert(!battle.p1.active[0].volatiles.choicelock);
		turn('move 2');
		assert.equal(battle.p1.active[0].volatiles.choicelock.move, 'growl');
	});
	it('survives lethal damage with a bench and requests a native switch', () => {
		begin(['survive'], [set('Magikarp', 'Swift Swim', 5, ['Splash']), set('Snorlax', 'Immunity', 50, ['Splash'])]);
		turn('move 1', 'move 2');
		assert.equal(battle.p1.active[0].hp, 1);
		assert(battle.p1.activeRequest.forceSwitch[0]);
	});
	it('insight heals a lethal hit instead of leaving one damage after spirit multipliers', () => {
		begin(['insight'], [set('Magikarp', 'Swift Swim', 5, ['Splash'])], undefined, {
			prepare(team) { team[0].insight = { points: 100, gain: 1 }; }, state: { spirit: { id: 'regigigas', floor: 100 } },
		});
		turn('move 1', 'move 2');
		assert.equal(battle.p1.active[0].hp, battle.p1.active[0].maxhp);
		assert.deepEqual(rogueBattleResult(battle).blessingProgress.insight[battle.p1.active[0].set.fantasyRogueId], { points: 0, gain: 2 });
	});
	it('preserves native ability suppression for extra abilities', () => {
		begin(['medic']); const a = battle.p1.active[0];
		a.addVolatile('gastroacid'); assert(!a.hasAbility('naturalcure'));
	});
	it('applies emblems as an actual replacement of the second type', () => {
		begin([], [{ ...set('Charizard', 'Blaze', 50, ['Tackle']), item: 'rogueemblemwater' }]);
		assert.deepEqual(battle.p1.active[0].getTypes(), ['Fire', 'Water']);
	});
	it('spends all psychic charge, bypasses Protect and Substitute, and hits a switched-in target', () => {
		begin(['psychic'], undefined, [set('Blissey', 'Natural Cure', 100, ['Protect']), set('Snorlax', 'Immunity', 100, ['Protect'])],
			{ effects: { psychic: 125 } });
		const target = battle.p2.active[0]; target.addVolatile('substitute');
		turn('roguepsychic 1');
		assert.equal(target.hp, 0, battle.log.join('\n')); assert.equal(battle.fantasyRogue.blessings.psychic, 4);
		assert(battle.choose('p2', 'switch 2'));
		assert.equal(battle.choose('p1', 'roguepsychic 1'), false);
	});
	it('psychic follows the opposing position rather than the old Pokemon', () => {
		begin(['psychic'], undefined, [set('Blissey', 'Natural Cure', 50, ['Splash']), set('Snorlax', 'Immunity', 50, ['Splash'])],
			{ effects: { psychic: 100 } });
		turn('roguepsychic 1', 'switch 2');
		assert.equal(battle.p2.active[0].hp, 0); assert(battle.p2.pokemon[1].hp > 0);
	});
	for (const item of ['', 'Focus Sash']) it(`psychic respects ${item || 'Sturdy'} and consumes charge on failure`, () => {
		begin(['psychic'], undefined, [{ ...set('Steelix', item ? 'Rock Head' : 'Sturdy', 50, ['Splash']), item }],
			{ effects: { psychic: 101 } });
		turn('roguepsychic 1');
		assert.equal(battle.p2.active[0].hp, item ? 1 : battle.p2.active[0].maxhp);
		assert.equal(battle.fantasyRogue.blessings.psychic, 0);
	});
	it('psychic misses a target outside the field and accumulates more from being defeated', () => {
		begin(['psychic'], [set('Magikarp', 'Swift Swim', 5, ['Splash']), set('Snorlax', 'Immunity', 50, ['Splash'])],
			[set('Snorlax', 'Immunity', 50, ['Fly', 'Dragon Rage'])], { effects: { psychic: 80 } });
		turn('move 1', 'move 2');
		assert.equal(battle.fantasyRogue.blessings.psychic, 100.25);
		assert(battle.choose('p1', 'switch 2'));
		battle.p2.active[0].addVolatile('fly');
		turn('roguepsychic 1', 'move 2');
		assert(battle.p2.active[0].hp > 0);
		assert.equal(battle.fantasyRogue.blessings.psychic, 0);
	});
	it('uses one coin result per move and makes the loaded coin positive', () => {
		begin(['coin', 'dice'], [set('Mew', 'Synchronize', 50, ['Double Hit'])]);
		turn();
		assert.equal(battle.log.filter(line => line.includes('命运决定一切：')).length, 1);
		assert(battle.log.some(line => line.includes('正面，伤害 ×1.5')));
	});
	it('keeps super-effective combo after switching and clears it on a non-damaging action', () => {
		begin(['supercombo'], [set('Mew', 'Synchronize', 30, ['Water Gun', 'Splash']), set('Blissey', 'Natural Cure', 30, ['Splash'])],
			[set('Onix', 'Sturdy', 100, ['Splash'])]);
		turn(); assert.equal(battle.fantasyRogue.blessingRuntime.p1.combo, 1);
		turn('switch 2'); assert.equal(battle.fantasyRogue.blessingRuntime.p1.combo, 1);
		turn(); assert.equal(battle.fantasyRogue.blessingRuntime.p1.combo, 0);
	});
	it('pivots when hitting a substitute, but not when missing into Protect', () => {
		begin(['pivot'], [set('Snorlax', 'Immunity', 50, ['Tackle']), set('Blissey', 'Natural Cure', 50, ['Splash'])]);
		battle.p2.active[0].addVolatile('substitute');
		turn(); assert(battle.p1.activeRequest.forceSwitch[0]);
		battle.choose('p1', 'switch 2');
		turn('switch 2');
		turn('move 1', 'move 3'); assert(!battle.p1.activeRequest.forceSwitch);
	});
	it('grants low-HP boosts once per Pokemon, not on every update', () => {
		begin(['lowhp']); const a = battle.p1.active[0]; a.hp = 1;
		battle.runEvent('Update', a); battle.runEvent('Update', a);
		assert.equal(a.boosts.atk, 1); assert.equal(a.boosts.spa, 1);
	});
	it('carries opposing drops and Leech Seed over a replacement', () => {
		begin(['passdrops', 'seeds'], undefined, [set('Blissey', 'Natural Cure', 100, ['Splash']), set('Snorlax', 'Immunity', 100, ['Splash'])]);
		const a = battle.p1.active[0], b = battle.p2.active[0];
		battle.boost({ atk: -2, def: 1 }, b); b.addVolatile('leechseed', a);
		turn('move 2', 'switch 2');
		const incoming = battle.p2.active[0];
		assert.equal(incoming.boosts.atk, -2); assert.equal(incoming.boosts.def, 0); assert(incoming.volatiles.leechseed);
		assert.equal(incoming.maxhp - incoming.hp, Math.floor(incoming.maxhp / 6));
	});
	it('banks a guaranteed critical damaging move after Detect across a nonattacking turn', () => {
		begin(['detect']); turn('move 3', 'move 2');
		assert.equal(battle.p1.active[0].m.rogueBlessing.detectReady, true);
		turn('move 2');
		assert.equal(battle.p1.active[0].m.rogueBlessing.detectReady, true);
		const move = battle.dex.getActiveMove('tackle');
		battle.runEvent('ModifyMove', battle.p1.active[0], battle.p2.active[0], move, move);
		assert.equal(move.willCrit, true);
		const next = battle.dex.getActiveMove('tackle');
		battle.runEvent('ModifyMove', battle.p1.active[0], battle.p2.active[0], next, next);
		assert(!next.willCrit);
	});
	it('lets Truant use its own Slack Off, while other moves still loaf', () => {
		begin(['slacker'], [set('Slaking', 'Truant', 50, ['Tackle', 'Slack Off'])]);
		turn(); const a = battle.p1.active[0]; a.hp -= 60;
		turn('move 2'); assert.equal(a.hp, a.maxhp);
	});
	it('applies stat exchange and final-small-species scaling through form changes', () => {
		begin(['smallfinal', 'swapstats'], [set('Wishiwashi', 'Water Absorb', 50, ['Splash'])], undefined, {
			prepare(team) { team[0].statModifiers = { smallFinal: true, swap: true }; rebuildMember(team[0], stats(0)); },
		});
		const mon = battle.p1.active[0], solo = mon.maxhp;
		mon.formeChange('Wishiwashi-School');
		const reference = createRoguePokemon(set('Wishiwashi-School', 'Water Absorb', 50, ['Splash']), stats(0), 'reference', 1, { smallFinal: true, swap: true });
		assert.equal(mon.maxhp, reference.maxhp); assert(mon.maxhp < solo);
		assert.equal(mon.storedStats.atk, reference.stats.atk);
		mon.formeChange('Wishiwashi'); assert.equal(mon.maxhp, solo);
	});
	it('selects only the strongest Meloetta and preserves its native ability', () => {
		begin(['singer'], [set('Meloetta', 'Serene Grace', 30, ['Tackle']), set('Meloetta', 'Serene Grace', 50, ['Tackle'])]);
		assert(!battle.p1.active[0].hasAbility('jizhineng'));
		turn('switch 2'); const a = battle.p1.active[0];
		assert(a.hasAbility('jizhineng')); assert(a.hasAbility('tianlaizhiyin')); assert(a.hasAbility('serenegrace'));
	});
	it('changes the strongest dancer to Pirouette and restores its campaign form on settlement', () => {
		begin(['dancer'], [set('Meloetta', 'Serene Grace', 50, ['Tackle'])]);
		assert.equal(battle.p1.active[0].species.name, 'Meloetta-Pirouette');
		assert(battle.p1.active[0].hasAbility('dancer'));
		assert.equal(rogueBattleResult(battle).team[0].set.species, 'Meloetta');
	});
	it('doubles Triple Axel to six continuously increasing hits', () => {
		begin(['multihit'], [set('Mew', 'Skill Link', 10, ['Triple Axel'])], [set('Blissey', 'Natural Cure', 100, ['Splash'])]);
		turn();
		assert(battle.log.some(line => line.startsWith('|-hitcount|') && line.endsWith('|6')), battle.log.join('\n'));
	});
	it('extends weather and Trick Room without replacing their normal duration rules', () => {
		begin(['overtimeraindance', 'overtimetrickroom'], [set('Mew', 'Synchronize', 50, ['Rain Dance', 'Trick Room'])]);
		turn(); assert.equal(battle.field.weatherState.duration, 7);
		turn('move 2'); assert.equal(battle.field.pseudoWeather.trickroom.duration, 7);
	});
	it('applies HP growth immediately and persists it without multiplying the flat bonus by stars', () => {
		const state = begin(['hpgrowth'], [set('Snorlax', 'Immunity', 50, ['Dragon Rage'])], [set('Magikarp', 'Swift Swim', 1, ['Splash'])], {
			prepare(team) { team[0].stars = 4; rebuildMember(team[0], stats(0)); },
		});
		const a = battle.p1.active[0], before = a.maxhp;
		turn(); assert.equal(a.maxhp, before + 2);
		const saved = rogueBattleResult(battle).team[0];
		assert.equal(saved.bonusHP, 2); assert.equal(saved.maxhp, state.team[0].maxhp + 2);
		rebuildMember(saved, stats(0)); assert.equal(saved.maxhp, before + 2);
	});
	it('earns S through six different successful actions and spends an extra Z without consuming the normal one', () => {
		begin(['style'], [set('Mew', 'Synchronize', 10, ['Tackle', 'Water Gun'])], [set('Blissey', 'Natural Cure', 100, ['Splash'])]);
		for (let i = 0; i < 6; i++) turn('move ' + (i % 2 + 1));
		assert.equal(battle.fantasyRogue.blessingRuntime.p1.style, 6);
		assert(battle.p1.activeRequest.active[0].canZMove[0]);
		turn('move 1 zmove');
		assert.equal(battle.fantasyRogue.blessingRuntime.p1.style, 0);
		assert(!battle.p1.zMoveUsed);
	});
	it('updates type-specific stats after Soak and removes them when the original type returns', () => {
		begin([], [set('Charmander', 'Blaze', 50, ['Splash']), set('Blissey', 'Natural Cure', 50, ['Splash'])],
			[set('Mew', 'Synchronize', 50, ['Soak', 'Splash'])], {
				prepare(team) { team[0].statModifiers = { statsType: 'Water', stats: { hp: 0.3, atk: 0.15 } }; rebuildMember(team[0], stats(0)); },
			});
		const a = battle.p1.active[0], hp = a.maxhp, atk = a.storedStats.atk;
		a.hp -= 7;
		turn();
		assert.deepEqual(a.getTypes(), ['Water']);
		assert.equal(a.maxhp, Math.floor(hp * 1.3)); assert.equal(a.storedStats.atk, Math.floor(atk * 1.15));
		assert.equal(a.maxhp - a.hp, 7);
		turn('switch 2', 'move 2'); turn('switch 2', 'move 2');
		assert.deepEqual(a.getTypes(), ['Fire']); assert.equal(a.maxhp, hp); assert.equal(a.storedStats.atk, atk);
		assert.equal(a.maxhp - a.hp, 7);
	});
	it('keeps Shedinja at one HP when it does not match the stat evolution type', () => {
		begin([], [set('Shedinja', 'Wonder Guard', 50, ['Splash'])], undefined, {
			prepare(team) { team[0].statModifiers = { statsType: 'Water', stats: { hp: 2 } }; rebuildMember(team[0], stats(0)); },
		});
		assert.equal(battle.p1.active[0].maxhp, 1);
	});
	it('turns a type immunity neutral before upgrading it to super effective', () => {
		for (const upgrades of [1, 2]) {
			begin([], [set('Mew', 'Synchronize', 30, ['Tackle'])], [set('Gengar', 'Cursed Body', 100, ['Splash'])], {
				effects: { evolution: { type: 'Normal', direction: 'moves', defense: {}, offense: { Ghost: upgrades }, stats: {}, power: 0, extras: [] } },
			});
			const b = battle.p2.active[0]; turn();
			assert(b.hp < b.maxhp, battle.log.join('\n'));
			assert.equal(battle.log.some(line => line.startsWith('|-supereffective|')), upgrades === 2);
		}
	});
	it('applies offensive type upgrades after the inverse spirit has reversed the base matchup', () => {
		begin([], [set('Mew', 'Synchronize', 30, ['Tackle'])], [set('Gengar', 'Cursed Body', 100, ['Splash'])], {
			state: { spirit: { id: 'malamar', floor: 50 } },
			effects: { evolution: { type: 'Normal', direction: 'moves', defense: {}, offense: { Ghost: 1 }, stats: {}, power: 0, extras: [] } },
		});
		const target = battle.p2.active[0];
		battle.activePokemon = battle.p1.active[0];
		const move = battle.dex.getActiveMove('tackle');
		assert.equal(battle.runEvent('Effectiveness', target, 'Ghost', move, 0), 2);
	});
	it('reconstructs public blessing mechanics for normal AI without a tower spirit', () => {
		const {Teams} = require('../../dist/sim/teams');
		const {InformationView} = require('../../dist/server/fantasy-ai/information');
		const {WorldBuilder} = require('../../dist/server/fantasy-ai/world');
		const {reconstructWorld} = require('../../dist/server/fantasy-ai/reconstruction');
		begin(['multihit'], [set('Mew', 'Synchronize', 30, ['Double Hit'])]);
		const view = new InformationView({ownSide: 'p2', difficulty: 'normal', partySize: 1, rogueBoosts: stats(0),
			rogueBlessings: battle.fantasyRogue.blessings});
		view.receiveUpdate(battle.log.join('\n'));
		const world = new WorldBuilder({format: 'gen9fantasyrogue', packedTeam: Teams.pack(battle.p2.team)})
			.build(view.observe(battle.p2.activeRequest))[0];
		const copy = reconstructWorld(world, [1, 2, 3, 4]);
		try {
			const move = copy.dex.getActiveMove('doublehit');
			copy.runEvent('ModifyMove', copy.p1.active[0], copy.p2.active[0], move, move);
			assert.equal(move.multihit, 4);
			const other = copy.dex.getActiveMove('doublehit');
			copy.runEvent('ModifyMove', copy.p2.active[0], copy.p1.active[0], other, other);
			assert.equal(other.multihit, 2);
		} finally { copy.destroy(); }
	});
});
