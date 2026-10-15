'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { State } = require('../../dist/sim/state');
const { createRoguePokemon, rebuildMember } = require('../../dist/server/fantasy-rogue/progression');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { rogueCodex } = require('../../dist/server/fantasy-rogue/codex');
const { recordClear } = require('../../dist/server/fantasy-rogue/legacy');
const { buildRogueDuelState } = require('../../dist/server/fantasy-rogue/duels');
const { randomUUID } = require('crypto');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { battleDragonKing } = require('../../dist/sim/fantasy-rogue-blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { memberStatTotal, permanentMemberTypes, strongestDragon } = require('../../dist/sim/rogue-blessing-permanent');
const { tonicItems, useTonic } = require('../../dist/server/fantasy-rogue/blessing-consumables');
const b = require('../../dist/server/fantasy-rogue/blessings');
const { stats, set } = require('../fixtures/fantasy-rogue');
const owned = id => ({ ...blessing(id), floor: 50 });
const dragon = (name = 'Dragonite', level = 50) => set(name, 'Inner Focus', level, ['Tackle', 'Draco Meteor', 'Splash']);

describe('Fantasy Rogue dragon king and permanent tonics', function () {
	this.timeout(30000);
	let battle, store, content;
	before(() => { content = createPreviewContent(); });
	afterEach(() => {
		battle?.destroy(); battle = undefined;
		store?.close(); store = undefined;
	});
	function campaign(sets = [dragon(), dragon('Dratini', 60), set()]) {
		const team = sets.map((s, i) => ({ ...createRoguePokemon(s, stats(0)), joinOrder: i + 1 }));
		const run = { id: 'newblessings', floor: 50, phase: 'ready', contentVersion: content.version,
			team, boosts: stats(0), bag: {}, money: 0, caught: [], encounter: 0, attempt: 0, startingSlots: team.length };
		run.checkpoint = structuredClone({ team, bag: {}, money: 0 });
		const account = { revision: 1, points: 0, slots: team.length, boosts: stats(0), captures: {}, unlocked: [], run };
		b.normalizeBlessings(run); return { run, account };
	}
	function grant(account, run, id) {
		const def = blessing(id); run.phase = 'blessing';
		run.blessings.round = { floor: 50, tier: def.tier, remaining: 1,
			options: [{ id, refreshes: 1 }], familiesSeen: [def.family] };
		b.handleBlessingCommand(account, run, content, { action: 'blessing', slot: 0 }, () => 0);
		run.phase = 'ready';
	}
	function begin(run, foes = [set('Blissey', 'Natural Cure', 100, ['Splash', 'Dragon Rage'])], duel) {
		const state = { encounterId: 'newblessings:1', team: structuredClone(run.team), boosts: stats(0),
			bag: {}, balls: [], catchable: false, progression: true, blessings: structuredClone(run.blessings), duel };
		battle = new Battle({ formatid: duel ? 'gen9fantasyrogueduel' : 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: 'Player', team: state.team.map(mon => mon.set) }, p2: { name: 'Foe', team: duel ? duel.team.map(mon => mon.set) : foes } });
		if (battleDragonKing(battle.p1)?.pending) {
			const king = battleDragonKing(battle.p1); assert(battle.choose('p1', `rogueking longzhihuxi ${king.token}`));
		}
		assert(battle.choose('p1', 'team 1')); assert(battle.choose('p2', 'team 1'));
		return state;
	}
	function turn(ours = 'move 1', theirs = 'move 1') {
		assert(battle.choose('p1', ours)); assert(battle.choose('p2', theirs));
	}
	function tonicRun(tonics, moves = ['Tackle', 'Splash']) {
		const result = campaign([set('Mew', 'Synchronize', 50, moves), set('Snorlax', 'Immunity', 50, ['Splash'])]);
		result.run.team[0].tonics = tonics; return result.run;
	}
	it('renames Mandrake without changing existing owned IDs or targets', () => {
		assert.equal(blessing('toxic').name, '曼陀罗饮品'); assert.equal(blessing('toxic').tier, 'gold');
	});
	it('selects by actual six-stat total, keeps ties in join order, and preserves the selected ability', () => {
		const { run, account } = campaign(); grant(account, run, 'dragonking');
		const king = run.team[0]; assert(king.set.level < run.team[1].set.level);
		assert.equal(run.blessings.dragonKing.member, king.id);
		assert.equal(b.blessingView(run).dragonKing.total, memberStatTotal(king));
		run.blessings.dragonKing.ability = 'drizzle'; run.team.reverse(); b.syncBlessingParty(run);
		assert.equal(run.blessings.dragonKing.ability, 'drizzle');
		const copy = structuredClone(king); copy.id = 'tie'; copy.joinOrder = 9;
		assert.equal(strongestDragon([copy, king]).id, king.id);
		const replacement = run.team.find(mon => mon.id !== king.id && permanentMemberTypes(mon).includes('Dragon'));
		replacement.set.level = 100; replacement.set.species = 'Rayquaza'; rebuildMember(replacement, run.boosts);
		b.syncBlessingParty(run); assert.equal(run.blessings.dragonKing.member, replacement.id);
		assert.equal(run.blessings.dragonKing.ability, undefined);
	});
	it('grants one item each, rejects duplicate consumption, reveals both descriptions account-wide in either order', () => {
		for (const order of [['wine', 'cephalosporin'], ['cephalosporin', 'wine']]) {
			const { run, account } = campaign([set('Bulbasaur', 'Overgrow', 50)]);
			for (const id of order) grant(account, run, id);
			assert.equal(run.bag.roguewine, 1); assert.equal(run.bag.roguecephalosporin, 1);
			assert(!b.blessingView(run).owned.find(x => x.id === 'wine').text.includes('×1.5'));
			const mon = run.team[0]; mon.status = 'brn'; mon.statuses = { brn: {}, psn: {} };
			for (const id of order) useTonic(account, mon, tonicItems().find(item => item.id === `rogue${id}`));
			assert.equal(mon.status, ''); assert.equal(mon.statuses, undefined);
			assert.deepEqual(permanentMemberTypes(mon), ['Grass', 'Ghost']); assert(mon.tonics.poison);
			assert(account.tonicSecret);
			assert.throws(() => useTonic(account, mon, tonicItems()[0]), /已经使用过/);
			assert(b.blessingView(run, account.tonicSecret).owned.find(x => x.id === 'wine').text.includes('×1.5'));
			delete account.run;
			const texts = rogueCodex(account, 'blessings', true).entries.filter(x => ['wine', 'cephalosporin'].includes(x.id));
			assert(texts.every(x => x.text.includes('×1.5')));
		}
	});
	it('keeps tonics and poison eligibility across rebuilding and does not give poison bonus to other species', () => {
		const { run, account } = campaign([set('Bulbasaur', 'Overgrow', 50)]), mon = run.team[0];
		tonicItems().forEach(item => useTonic(account, mon, item));
		mon.set.species = 'Ivysaur'; rebuildMember(mon, run.boosts); b.syncBlessingParty(run);
		assert.deepEqual(permanentMemberTypes(mon), ['Grass', 'Ghost']); assert(mon.tonics.poison);
		const other = createRoguePokemon(set('Charmander', 'Blaze'), stats(0));
		tonicItems().forEach(item => useTonic(account, other, item)); assert(!other.tonics.poison);
	});
	it('grants native Dragon Breath and retains it across ordinary switching', () => {
		const { run, account } = campaign();
		grant(account, run, 'dragonking');
		run.blessings.dragonKing.ability = 'longzhihuxi'; begin(run);
		const king = battle.p1.active[0]; assert(king.hasAbility('longzhihuxi')); assert(king.hasAbility('innerfocus'));
		turn('move 2'); assert.equal(king.boosts.spa, 0);
		turn('move 2'); assert.equal(king.boosts.spa, -2);
		turn('switch 2'); assert.equal(battleDragonKing(battle.p1).member, king.set.fantasyRogueId);
		turn('switch 2'); turn('move 1'); assert.equal(king.lastMove.type, 'Dragon');
	});
	it('uses Drizzle as native weather instead of a permanent field rule', () => {
		const { run, account } = campaign();
		grant(account, run, 'dragonking');
		run.blessings.dragonKing.ability = 'drizzle'; begin(run);
		assert.equal(battle.field.weather, 'raindance'); assert.equal(battle.field.weatherState.duration, 5);
	});
	it('pauses succession for a private ability choice, preserves turn/PP, and does not let a revived king reclaim it', () => {
		const { run, account } = campaign(); grant(account, run, 'dragonking'); run.blessings.dragonKing.ability = 'drizzle';
		run.team[0].hp = 1; const state = begin(run);
		const king = battle.p1.active[0], successor = battle.p1.pokemon[1]; turn('move 3', 'move 2');
		assert.equal(king.hp, 0); const next = battleDragonKing(battle.p1);
		assert.equal(next.member, successor.set.fantasyRogueId); assert(next.pending);
		assert(battle.log.some(line => line.includes('接任本场龙王')));
		assert.equal(battle.choose('p1', 'switch 2'), false);
		const currentTurn = battle.turn, pp = successor.moveSlots[0].pp;
		assert.equal(battle.choose('p1', `rogueking hugepower ${next.token}`), false);
		assert(battle.choose('p1', `rogueking longzhihuxi ${next.token}`));
		assert.equal(battle.turn, currentTurn); assert.equal(successor.moveSlots[0].pp, pp);
		assert.equal(battle.choose('p1', `rogueking drizzle ${next.token}`), false);
		assert(battle.choose('p1', 'switch 2')); assert(successor.hasAbility('longzhihuxi'));
		king.hp = king.maxhp; king.fainted = false; battle.p1.pokemonLeft++;
		turn('switch 2'); assert(!king.hasAbility('drizzle')); assert(!king.hasAbility('longzhihuxi'));
		assert.equal(battleDragonKing(battle.p1).member, successor.set.fantasyRogueId);
		assert.deepEqual(state.blessings.dragonKing, { member: run.team[0].id, ability: 'drizzle' });
		b.syncBlessingParty(run); assert.equal(run.blessings.dragonKing.ability, 'drizzle');
		const serialized = State.serializeBattle(battle), restored = State.deserializeBattle(serialized);
		assert.equal(battleDragonKing(restored.p1).member, successor.set.fantasyRogueId); restored.destroy();
	});
	it('applies the experience bonus against the king at the time of each defeat and stacks other bonuses', () => {
		const { run, account } = campaign(); grant(account, run, 'dragonking');
		const king = run.team[0], next = run.team[1];
		assert.equal(b.blessingExperience(run, king), 1); assert.equal(b.blessingExperience(run, next), 1.3);
		assert.equal(b.blessingExperience(run, king, next.id), 1.3); assert.equal(b.blessingExperience(run, next, next.id), 1);
		run.blessings.owned.push({ ...owned('typexpdragon'), type: 'Dragon' });
		assert.equal(b.blessingExperience(run, next), 1.3 * 1.3);
	});
	it('requires a real outside-battle selection, applies items exactly once, and persists discovery across adventures', () => {
		store = new RogueStore(':memory:'); const user = 'tonicplayer', engine = new RogueEngine(store, content, () => 0);
		const account = () => store.get(user);
		const cmd = (action, details = {}) => engine.command(user, { action, ...details, id: randomUUID(), revision: account().revision });
		cmd('start', { starters: ['bulbasaur'] });
		store.change(user, saved => {
			const prepared = campaign(); Object.assign(saved, prepared.account);
			grant(saved, saved.run, 'dragonking'); grant(saved, saved.run, 'wine'); grant(saved, saved.run, 'cephalosporin');
			saved.run.phase = 'ready'; saved.run.node = { id: 'test', kind: 'wild', reward: { money: 0, items: {} },
				encounters: [{ team: [set('Magikarp', 'Swift Swim', 1, ['Splash'])], catchable: true }] };
		});
		assert.throws(() => cmd('battle'), /选择龙王/); assert(!account().run.battle);
		const king = account().run.blessings.dragonKing;
		assert.throws(() => cmd('dragonking', { member: 'wrong', value: 'drizzle' }), /变化/);
		cmd('dragonking', { member: king.member, value: 'drizzle' });
		assert.throws(() => cmd('dragonking', { member: king.member, value: 'longzhihuxi' }), /变化/);
		const request = { action: 'use', value: 'roguewine', member: king.member, id: randomUUID(), revision: account().revision };
		engine.command(user, request); engine.command(user, request);
		assert.equal(account().run.bag.roguewine, 0);
		store.change(user, saved => { saved.run.bag.roguewine = 1; });
		assert.throws(() => cmd('use', { value: 'roguewine', member: king.member }), /已经使用过/);
		assert.equal(account().run.bag.roguewine, 1);
		cmd('use', { value: 'roguecephalosporin', member: king.member });
		assert(account().tonicSecret); cmd('battle');
		assert.deepEqual(engine.battleState(user).blessings.dragonKing, king.ability ? king : { ...king, ability: 'drizzle' });
		store.change(user, saved => { saved.run.phase = 'ready'; delete saved.run.battle; });
		cmd('abandon'); cmd('start', { starters: ['bulbasaur'] });
		assert(account().tonicSecret); assert(!account().run.team[0].tonics);
	});
	it('snapshots tonics and the original king for clear-card PvP on either side without mutating the cards', () => {
		const cards = ['left', 'right'].map(id => {
			const { run, account } = campaign();
			grant(account, run, 'dragonking');
			grant(account, run, 'wine'); grant(account, run, 'cephalosporin');
			run.blessings.dragonKing.ability = id === 'left' ? 'drizzle' : 'longzhihuxi';
			tonicItems().forEach(item => useTonic(account, run.team[0], item));
			run.owner = { id, name: id }; run.floor = 200;
			recordClear(account, run); return account.cards[0];
		});
		const before = JSON.stringify(cards), state = buildRogueDuelState(...cards);
		battle = new Battle({ formatid: 'gen9fantasyrogueduel', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: 'left', team: state.team.map(m => m.set) }, p2: { name: 'right', team: state.duel.team.map(m => m.set) } });
		battle.makeChoices('team 1', 'team 1');
		assert(battle.p1.active[0].hasAbility('drizzle')); assert(battle.p2.active[0].hasAbility('longzhihuxi'));
		for (const player of battle.sides) { assert(player.active[0].volatiles.confusion); assert(!player.active[0].trySetStatus('brn')); }
		const fallen = battle.p2.active[0]; fallen.faint(); battle.faintMessages();
		const king = battleDragonKing(battle.p2); assert(king.pending);
		assert.equal(battle.choose('p1', `rogueking drizzle ${king.token}`), false);
		assert(battle.choose('p2', `rogueking drizzle ${king.token}`));
		assert.equal(JSON.stringify(cards), before);
	});
	it('lets native timer defaults resolve a pending king instead of deadlocking', () => {
		const { run, account } = campaign();
		grant(account, run, 'dragonking');
		run.blessings.dragonKing.ability = 'drizzle';
		run.team[0].hp = 1; begin(run);
		turn('move 3', 'move 2'); assert(battleDragonKing(battle.p1).pending);
		battle.makeChoices(); assert(!battleDragonKing(battle.p1).pending); assert(battle.p1.active[0].hp > 0);
	});
	it('records the temporary king alongside defeated opponents for experience settlement', () => {
		const { run, account } = campaign();
		grant(account, run, 'dragonking');
		run.blessings.dragonKing.ability = 'drizzle';
		run.team[0].hp = 1; begin(run);
		turn('move 3', 'move 2'); const king = battleDragonKing(battle.p1);
		assert(battle.choose('p1', `rogueking longzhihuxi ${king.token}`)); assert(battle.choose('p1', 'switch 2'));
		battle.p2.active[0].hp = 1; turn();
		assert.equal(rogueBattleResult(battle).defeated[0].dragonKing, run.team[1].id);
	});
	it('wine confuses every entry but grants power only to the first actually executed move', () => {
		begin(tonicRun({ wine: true })); const a = battle.p1.active[0];
		assert(a.volatiles.confusion); a.removeVolatile('confusion'); turn();
		assert(a.lastMove.rogueWine);
		assert.equal(battle.runEvent('BasePower', a, battle.p2.active[0], a.lastMove, 40), 80);
		turn(); assert(!a.lastMove.rogueWine);
		turn('switch 2'); turn('switch 2');
		assert(a.volatiles.confusion); a.removeVolatile('confusion'); turn();
		assert(!a.lastMove.rogueWine);
		assert.deepEqual(rogueBattleResult(battle).team[0].tonics, { wine: true });
	});
	for (const move of ['Splash', 'Fissure']) it(`wine consumes its opportunity on ${move}`, () => {
		begin(tonicRun({ wine: true }, [move, 'Tackle'])); const a = battle.p1.active[0]; a.removeVolatile('confusion');
		turn(); assert(a.m.rogueBlessing.wineUsed);
		turn('move 2'); assert(!a.lastMove.rogueWine);
	});
	for (const blocker of ['flinch', 'confusion']) it(`wine keeps the opportunity after ${blocker}`, () => {
		begin(tonicRun({ wine: true })); const a = battle.p1.active[0];
		if (blocker === 'flinch') {
			a.removeVolatile('confusion'); a.addVolatile('flinch');
		} else {
			battle.randomChance = () => true;
		}
		turn(); assert(!a.m.rogueBlessing.wineUsed);
		a.removeVolatile('confusion'); a.removeVolatile('flinch');
		turn(); assert(a.lastMove.rogueWine);
	});
	it('cephalosporin blocks seven statuses even under stacking, while wine confusion remains', () => {
		const run = tonicRun({ wine: true, cephalosporin: true, poison: true }, ['Poison Sting']);
		begin(run); const a = battle.p1.active[0], foe = battle.p2.active[0];
		// Enable the stacking blessing on the opposing side to exercise its immunity bypass.
		battle.fantasyRogue.duel = { team: [], blessings: { owned: [owned('stackstatus')] } };
		for (const id of ['psn', 'tox', 'brn', 'par', 'slp', 'frz', 'fst']) assert(!a.trySetStatus(id, foe), id);
		assert(a.volatiles.confusion); assert.deepEqual(a.getTypes(), ['Psychic', 'Ghost']);
		a.removeVolatile('confusion'); turn();
		assert.equal(battle.runEvent('BasePower', a, foe, a.lastMove, 40), 120);
	});
});
