'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { State } = require('../../dist/sim/state');
const { createRoguePokemon, rebuildMember, rememberMove } = require('../../dist/server/fantasy-rogue/progression');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { editParty, inventoryItem } = require('../../dist/server/fantasy-rogue/team');
const b = require('../../dist/server/fantasy-rogue/blessings');
const { blessing, BLESSING_TYPES } = require('../../dist/sim/rogue-blessing-data');
const { permanentMemberTypes, canGrantExtraAbility } = require('../../dist/sim/rogue-blessing-permanent');
const { dragonKingRequest } = require('../../dist/sim/fantasy-rogue-blessings');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { recordClear } = require('../../dist/server/fantasy-rogue/legacy');
const { buildRogueDuelState } = require('../../dist/server/fantasy-rogue/duels');
const { mergeSpiritPokemon } = require('../../dist/server/fantasy-rogue/spirits');
const { set, stats } = require('../fixtures/fantasy-rogue');
const owned = id => ({ ...blessing(id), floor: 50 });

describe('Fantasy Rogue independent emblems, prayer and unique abilities', function () {
	this.timeout(30000);
	let battle, content;
	before(() => { content = createPreviewContent(); });
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function campaign(sets = [set('Mew', 'Synchronize', 50, ['Tackle', 'Splash'])], ids = []) {
		const team = sets.map(s => createRoguePokemon(s, stats(0)));
		const run = { id: 'emblem-prayer', contentVersion: content.version, floor: 50, phase: 'ready',
			team, boosts: stats(0), bag: {}, money: 0, encounter: 0, attempt: 0, caught: [],
			owner: { id: 'emblemplayer', name: 'Emblem Player' } };
		run.checkpoint = structuredClone({ team, bag: {}, money: 0 });
		b.normalizeBlessings(run); run.blessings.owned = ids.map(owned); b.syncBlessingParty(run);
		const account = { revision: 1, points: 0, slots: team.length, boosts: stats(0), captures: {}, unlocked: [], run };
		return { run, account };
	}
	function begin(run, foes = [set('Blissey', 'Natural Cure', 100, ['Splash', 'Dragon Rage'])], other) {
		const state = { encounterId: 'emblems:1', team: structuredClone(run.team), boosts: stats(0), bag: {}, balls: [],
			catchable: false, blessings: structuredClone(run.blessings),
			systems: { player: { mega: true }, opponent: { mega: true } },
			duel: other && { team: structuredClone(other.team), boosts: stats(0), blessings: structuredClone(other.blessings) } };
		battle = new Battle({ formatid: other ? 'gen9fantasyrogueduel' : 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: 'Player', team: state.team.map(mon => mon.set) },
			p2: { name: 'Foe', team: other ? state.duel.team.map(mon => mon.set) : foes } });
		if (!dragonKingRequest(battle.p1)?.pending) {
			assert(battle.choose('p1', 'team 1')); assert(battle.choose('p2', 'team 1'));
		}
		return battle.p1.active[0];
	}
	function turn(ours = 'move 1', theirs = 'move 1') {
		const start = battle.log.length;
		assert(battle.choose('p1', ours), battle.log.slice(-8).join('\n'));
		assert(battle.choose('p2', theirs), battle.log.slice(-8).join('\n'));
		return battle.log.slice(start);
	}
	function grant(account, run, id) {
		const def = blessing(id); run.phase = 'blessing';
		run.blessings.round = { floor: run.floor, tier: def.tier, remaining: 1,
			options: [{ id, refreshes: 1 }], familiesSeen: [def.family] };
		b.handleBlessingCommand(account, run, content, { action: 'blessing', slot: 0 }, () => 0);
	}
	function resolve(account, run, value) {
		b.handleBlessingCommand(account, run, content, { action: 'blessingreward', member: run.blessings.pending[0].id, value }, () => 0);
	}
	for (const type of Object.keys(BLESSING_TYPES)) it(`${type} emblem coexists with a real item and survives battle settlement`, () => {
		const { run } = campaign(), mon = run.team[0], id = 'rogueemblem' + type.toLowerCase();
		mon.set.item = 'leftovers'; run.bag[id] = 1;
		editParty(run, { action: 'equipemblem', member: mon.id, value: id }, content); b.syncBlessingParty(run);
		assert.equal(mon.set.item, 'leftovers'); assert.equal(inventoryItem(content, id).kind, 'emblem');
		const active = begin(run); assert.deepEqual(active.getTypes(), [...new Set(['Psychic', type])]);
		active.hp -= 20; turn('move 2'); assert.equal(active.maxhp - active.hp, 20 - Math.floor(active.maxhp / 16));
		const result = rogueBattleResult(battle).team[0];
		assert.equal(result.emblem, id); assert.equal(result.set.item, 'leftovers');
		assert.deepEqual(result.set.moves, mon.set.moves);
	});
	it('migrates old held emblems in party and checkpoint once, without creating extra copies', () => {
		const { run } = campaign(); run.team[0].set.item = run.checkpoint.team[0].set.item = 'rogueemblemfire';
		b.syncBlessingParty(run); b.syncBlessingParty(run);
		assert.equal(run.team[0].emblem, 'rogueemblemfire'); assert.equal(run.team[0].set.item, '');
		assert.equal(run.checkpoint.team[0].emblem, 'rogueemblemfire'); assert.equal(run.checkpoint.team[0].set.item, '');
		assert.equal(run.bag.rogueemblemfire || 0, 0); assert.equal(run.checkpoint.bag.rogueemblemfire || 0, 0);
	});
	it('returns removed emblems, retains actual learned moves and spent borrowed PP, and rejects held-slot use', () => {
		const { run } = campaign(), mon = run.team[0]; mon.set.item = 'lifeorb'; run.bag.rogueemblemfire = 1;
		assert.throws(() => editParty(run, { action: 'equip', member: mon.id, value: 'rogueemblemfire' }, content), /携带道具/);
		rememberMove(mon, 'flamethrower');
		editParty(run, { action: 'equipemblem', member: mon.id, value: 'rogueemblemfire' }, content); b.syncBlessingParty(run);
		editParty(run, { action: 'setmove', member: mon.id, slot: 0, value: 'flareblitz' }, content);
		editParty(run, { action: 'setmove', member: mon.id, slot: 1, value: 'flamethrower' }, content);
		mon.pp.find(pp => pp.id === 'flareblitz').pp = 2;
		editParty(run, { action: 'equipemblem', member: mon.id, value: '' }, content); b.syncBlessingParty(run);
		assert.equal(mon.set.item, 'lifeorb'); assert.equal(run.bag.rogueemblemfire, 1);
		assert(!mon.set.moves.includes('flareblitz')); assert(mon.set.moves.includes('flamethrower'));
		editParty(run, { action: 'equipemblem', member: mon.id, value: 'rogueemblemfire' }, content); b.syncBlessingParty(run);
		assert.equal(mon.blessingPP.find(pp => pp.id === 'flareblitz').pp, 2);
	});
	it('uses the emblem for type-evolution stats, preserves it through Mega, saves and card duels', () => {
		const { run, account } = campaign([{ ...set('Charizard', 'Blaze', 50, ['Splash']), item: 'Charizardite X' }]);
		const mon = run.team[0], hp = mon.maxhp; mon.emblem = 'rogueemblemwater';
		run.blessings.evolution = { type: 'Water', stats: { hp: .15 }, defense: {}, offense: {}, power: 0, extras: [], direction: 'stats' };
		b.syncBlessingParty(run); assert.equal(mon.maxhp, Math.floor(hp * 1.15));
		begin(run); turn('move 1 mega'); assert.equal(battle.p1.active[0].species.name, 'Charizard-Mega-X');
		assert.deepEqual(battle.p1.active[0].getTypes(), ['Fire', 'Water']);
		const serialized = State.serializeBattle(battle), restored = State.deserializeBattle(serialized); battle.destroy(); battle = restored;
		assert.deepEqual(battle.p1.active[0].getTypes(), ['Fire', 'Water']);
		run.floor = 200; run.phase = 'complete'; recordClear(account, run);
		const card = account.cards[0], other = structuredClone(card); other.id = 'other'; other.owner = 'opponent';
		const duel = buildRogueDuelState(card, other);
		assert.equal(duel.team[0].emblem, mon.emblem); assert.equal(duel.duel.team[0].emblem, mon.emblem);
		assert.equal(duel.team[0].set.item, 'Charizardite X'); assert.equal(duel.team[0].maxhp, mon.maxhp);
	});
	it('returns independent emblems from both consumed partners when merging stars', () => {
		const { run } = campaign([set(), set(), set()]); run.spirit = 'zygarde'; run.box = [];
		run.team[1].emblem = run.team[2].emblem = 'rogueemblemfire'; run.team[1].set.item = 'leftovers';
		mergeSpiritPokemon(run, run.team[0].id, [run.team[1].id, run.team[2].id]);
		assert.equal(run.bag.rogueemblemfire, 2); assert.equal(run.bag.leftovers, 1);
	});
	it('includes original 80/80 donors and receivers, and forwards previously inherited stats', () => {
		const { run } = campaign(Array.from({ length: 3 }, () => set('Phione', 'Hydration', 50, ['Splash'])), ['prayer']);
		begin(run); const first = battle.p1.active[0], base = first.getStat('atk', true);
		first.hp = 1; turn('move 1', 'move 2'); assert(battle.choose('p1', 'switch 2'));
		const second = battle.p1.active[0]; assert.equal(second.getStat('atk', true), base + Math.floor(base / 3));
		second.hp = 1; turn('move 1', 'move 2'); assert(battle.choose('p1', 'switch 3'));
		assert.equal(battle.p1.active[0].getStat('atk', true), base + Math.floor((base + Math.floor(base / 3)) / 3));
	});
	it('rejects a donor above either 80 base-stat limit', () => {
		const { run } = campaign([set('Grumpig', 'Thick Fat', 50, ['Splash']), set('Phione', 'Hydration', 50, ['Splash'])], ['prayer']);
		begin(run); battle.p1.active[0].hp = 1; turn('move 1', 'move 2'); assert(battle.choose('p1', 'switch 2'));
		assert.equal(battle.p1.active[0].m.rogueBlessing.prayer.atk, 0);
	});
	it('keeps inherited stats after a real Mega, but does not pass them onward even if Mega stats are also at most 80', () => {
		const { run } = campaign([set('Phione', 'Hydration', 50, ['Splash']),
			{ ...set('Audino', 'Healer', 50, ['Splash']), item: 'Audinite' }, set('Phione', 'Hydration', 50, ['Splash'])], ['prayer']);
		begin(run, [set('Blissey', 'Natural Cure', 100, ['Splash', 'Seismic Toss'])]);
		const first = battle.p1.active[0], inherited = Math.floor(first.getStat('atk', true) / 3);
		first.hp = 1; turn('move 1', 'move 2'); assert(battle.choose('p1', 'switch 2'));
		const endpoint = battle.p1.active[0]; turn('move 1 mega');
		assert.equal(endpoint.species.name, 'Audino-Mega');
		assert.equal(endpoint.getStat('atk', true), endpoint.storedStats.atk + inherited);
		endpoint.hp = 1; turn('move 1', 'move 2'); assert(endpoint.fainted); assert(battle.choose('p1', 'switch 3'));
		assert.equal(battle.p1.active[0].m.rogueBlessing.prayer.atk, 0);
		assert.equal(battle.p1.active[0].m.rogueBlessing.prayer.spa, 0);
	});
	it('orders Top Clear Mind ahead of the same bracket despite Stall, a lagging item and Trick Room', () => {
		const { run } = campaign([{ ...set('Sableye', 'Stall', 50, ['Tackle']), item: 'laggingtail' }], ['topclearmind']);
		begin(run, [set('Mew', 'Synchronize', 50, ['Tackle', 'Quick Attack'])]);
		battle.field.addPseudoWeather('trickroom', battle.p1.active[0]);
		assert(turn()[0] !== undefined);
		let moves = battle.log.filter(line => line.startsWith('|move|')).slice(-2); assert(moves[0].includes('p1a:'));
		turn('move 1', 'move 2'); moves = battle.log.filter(line => line.startsWith('|move|')).slice(-2);
		assert(moves[0].includes('p2a:'), 'a true +1 move still outranks the +0.5 ordering bonus');
	});
	it('uses normal Speed order when both sides have Top Clear Mind under Trick Room', () => {
		const a = campaign([set('Snorlax', 'Immunity', 50, ['Tackle'])], ['topclearmind']).run;
		const c = campaign([set('Mew', 'Synchronize', 50, ['Tackle'])], ['topclearmind']).run;
		begin(a, undefined, c); battle.field.addPseudoWeather('trickroom', battle.p1.active[0]); turn();
		assert(battle.log.filter(line => line.startsWith('|move|'))[0].includes('p2a:'));
	});
	for (const ability of ['Queenly Majesty', 'Dazzling', 'Armor Tail']) it(`bypasses ${ability} and Psychic Terrain, including native priority moves`, () => {
		const { run } = campaign([set('Mew', 'Synchronize', 50, ['Quick Attack'])], ['topclearmind']);
		begin(run, [set('Blissey', ability, 100, ['Splash'])]); battle.field.setTerrain('psychicterrain', battle.p1.active[0]);
		const defender = battle.p2.active[0]; turn(); assert(defender.hp < defender.maxhp, battle.log.join('\n'));
	});
	it('does not confer priority-blocker immunity without Top Clear Mind', () => {
		const { run } = campaign([set('Mew', 'Synchronize', 50, ['Quick Attack'])]);
		begin(run, [set('Blissey', 'Dazzling', 100, ['Splash'])]); const defender = battle.p2.active[0]; turn();
		assert.equal(defender.hp, defender.maxhp);
	});
	it('filters direct blessing targets with the same natural ability and rejects forged target choices', () => {
		const { run, account } = campaign([set('Toxapex', 'Merciless', 50), set('Mew', 'Synchronize', 50)]);
		grant(account, run, 'toxic'); assert.deepEqual(run.blessings.pending[0].options, [run.team[1].id]);
		assert.throws(() => resolve(account, run, run.team[0].id), /选项无效/);
		resolve(account, run, run.team[1].id); assert.equal(run.blessings.owned[0].target, run.team[1].id);
	});
	it('filters persistent extra abilities and offers only a valid power-choice recipient', () => {
		const { run, account } = campaign([set('Azumarill', 'Huge Power', 50), set('Mew', 'Synchronize', 50)]);
		run.team[1].extraAbilities = ['hugepower'];
		grant(account, run, 'powerchoice'); assert.deepEqual(run.blessings.pending[0].options, ['roguegreatmage']);
		resolve(account, run, 'roguegreatmage'); resolve(account, run, run.team[1].id);
		assert.deepEqual(run.team[1].extraAbilities, ['hugepower', 'roguegreatmage']);
	});
	it('checks team-wide extra abilities and closes legacy rewards with no eligible target', () => {
		const { run, account } = campaign([set('Mew', 'Synchronize', 50)], ['restinball', 'powerchoice']);
		assert(!canGrantExtraAbility(run.team[0], 'Natural Cure', run.team, run.blessings));
		run.team[0].extraAbilities = ['hugepower', 'roguegreatmage']; run.phase = 'blessing';
		run.blessings.pending = [{ id: 'old', title: '大力士？大法师！', kind: 'ability', blessing: 'powerchoice', options: ['hugepower', 'roguegreatmage'] }];
		b.normalizeBlessings(run); assert.deepEqual(run.blessings.pending[0].options, ['skip']);
		resolve(account, run, 'skip'); assert.equal(run.blessings.pending.length, 0);
	});
	it('does not consume a sword reward when its recipient already has Sharpness', () => {
		const { run, account } = campaign([set('Cobalion', 'Sharpness', 50)], ['swords']); run.blessings.swordUses = 15;
		assert.throws(() => b.handleBlessingCommand(account, run, content,
			{ action: 'swordreward', member: run.team[0].id }, () => 0), /已经拥有锋锐/);
		assert.equal(run.blessings.swordRewards.length, 0);
	});
	it('runs only one copy of an ability when a team-wide effect matches the primary ability', () => {
		const { run } = campaign([set('Slowbro', 'Regenerator', 50, ['Splash']), set('Mew', 'Synchronize', 50, ['Splash'])], ['restinball']);
		const mon = begin(run); assert(!mon.volatiles['ability:regenerator']); assert(mon.volatiles['ability:naturalcure']);
		mon.hp = 1; turn('switch 2'); assert.equal(mon.hp, 1 + Math.floor(mon.maxhp / 3));
	});
	it('filters duplicate dragon-king options in and outside battle and never leaves an empty choice pending', () => {
		const { run } = campaign([set('Dragonite', 'Drizzle', 50, ['Splash'])], ['dragonking']);
		assert.deepEqual(b.blessingView(run).dragonKing.options, ['longzhihuxi']);
		begin(run); const request = dragonKingRequest(battle.p1); assert.deepEqual(request.options, ['longzhihuxi']);
		assert.equal(battle.choose('p1', `rogueking drizzle ${request.token}`), false);
		assert(battle.choose('p1', `rogueking longzhihuxi ${request.token}`)); battle.destroy(); battle = undefined;
		run.team[0].extraAbilities = ['longzhihuxi']; b.syncBlessingParty(run);
		assert.deepEqual(b.blessingView(run).dragonKing.options, []); begin(run);
		assert.equal(dragonKingRequest(battle.p1).pending, false); assert.equal(battle.turn, 1);
	});
});
