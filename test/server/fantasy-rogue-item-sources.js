'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { rogueItemSource } = require('../../dist/sim/rogue-item-sources');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { battleItemReward } = require('../../dist/server/fantasy-rogue/battle-item-rewards');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue physical battle item origins', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function begin(ownItem = '', enemyItem = '', options = {}) {
		const team = [createRoguePokemon({ ...set('Snorlax', options.ability || 'Immunity', 50,
			['Trick', 'Thief', 'Recycle', 'Splash']), item: ownItem }, stats(0))];
		const partner = options.coop ? { team: [createRoguePokemon({ ...set('Blissey', options.partnerAbility || 'Natural Cure', 50, ['Splash']),
			item: options.partnerItem || '' }, stats(0))], boosts: stats(0) } : undefined;
		const state = { encounterId: 'item-source-battle', team, boosts: stats(0), partner, bag: { pokeball: 5 },
			partnerBag: partner ? {} : undefined, catchable: true, balls: [{ id: 'pokeball', name: '精灵球', chance: 1 }],
			cooperative: partner ? { opponentOffset: 1 } : undefined, spirit: { id: options.spirit || 'hoopagift', floor: 30 } };
		battle = new Battle({ formatid: partner ? 'gen9fantasyroguecoop' : 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: 'Owner', team: team.map(mon => mon.set) },
			p2: { name: 'Enemy', team: [{ ...set('Blissey', options.enemyAbility || 'Natural Cure', 50, ['Splash']), item: enemyItem }] },
			...(partner ? { p3: { name: 'Partner', team: partner.team.map(mon => mon.set) },
				p4: { name: 'Enemy B', team: [set('Blissey', 'Natural Cure', 50, ['Splash'])] } } : {}) });
		if (partner) battle.makeChoices('team 1', 'team 1', 'team 1', 'team 1');
		else battle.makeChoices('team 1', 'team 1');
		return [battle.p1.active[0], battle.p2.active[0]];
	}
	const noRoll = () => { throw new Error('Existing equipment must not reroll'); };
	function reward(result = rogueBattleResult(battle), run = { spirit: 'hoopagift' }, random = () => 0) {
		return battleItemReward(run, content(), result.team[0], result, random);
	}
	it('tracks native Thief gains without mutating Dex item definitions and converts the physical item once', () => {
		const [a, b] = begin('', 'Leftovers'), initial = rogueItemSource(b), dexItem = battle.dex.items.get('leftovers');
		battle.makeChoices('move thief', 'move splash'); assert.equal(a.item, 'leftovers');
		assert.deepEqual(rogueItemSource(a), initial); assert.equal(initial.owned, false);
		assert.equal(battle.dex.items.get('leftovers'), dexItem); assert.equal(dexItem.rogueItemSource, undefined);
		const result = rogueBattleResult(battle), run = { spirit: 'hoopagift' };
		assert.equal(reward(result, run), 'fantasypowerlens'); assert.equal(reward(result, run, noRoll), 'fantasypowerlens');
		assert.equal(Object.keys(run.spiritConversions).length, 1);
	});
	it('recognizes player equipment returned by Trick and foreign equipment with an identical item name', () => {
		let [a, b] = begin('Leftovers'); const original = rogueItemSource(a);
		battle.makeChoices('move trick', 'move splash'); assert.equal(b.item, 'leftovers');
		battle.makeChoices('move trick', 'move splash'); assert.deepEqual(rogueItemSource(a), original);
		assert.equal(reward(undefined, { spirit: 'hoopagift' }, noRoll), 'leftovers');
		battle.destroy(); [a, b] = begin('Leftovers', 'Leftovers');
		const foreign = rogueItemSource(b); battle.makeChoices('move trick', 'move splash');
		assert.deepEqual(rogueItemSource(a), foreign); assert.equal(reward(), 'fantasypowerlens');
	});
	it('preserves the origin across human-to-human Bestow and a full simulator checkpoint', () => {
		const [a] = begin('Leftovers', '', { coop: true }), b = battle.p3.active[0], original = rogueItemSource(a);
		battle.actions.useMove('bestow', a, { target: b }); assert.equal(b.item, 'leftovers'); assert.deepEqual(rogueItemSource(b), original);
		const snapshot = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(snapshot);
		assert.deepEqual(rogueItemSource(battle.p3.active[0]), original);
		const result = rogueBattleResult(battle);
		assert.equal(battleItemReward({ spirit: 'hoopagift' }, content(), result.partnerTeam[0], result, noRoll), 'leftovers');
		assert.deepEqual(rogueBattleResult(battle), result, 'pure repeated result snapshots');
	});
	it('retains the source through consumed-item Recycle and Harvest', () => {
		for (const ability of ['Immunity', 'Harvest']) {
			const [a] = begin('Sitrus Berry', '', { ability }), original = rogueItemSource(a);
			a.hp = Math.floor(a.maxhp / 3); assert(a.eatItem()); assert.equal(a.item, '');
			if (ability === 'Harvest') {
				battle.field.setWeather('sunnyday', a);
				battle.singleEvent('Residual', battle.dex.abilities.get('harvest'), a.abilityState, a);
			} else battle.actions.useMove('recycle', a, { target: a });
			assert.equal(a.item, 'sitrusberry'); assert.deepEqual(rogueItemSource(a), original);
			assert.equal(reward(undefined, { spirit: 'hoopagift' }, noRoll), 'sitrusberry');
			battle.destroy(); battle = undefined;
		}
	});
	it('distinguishes Pickup of an enemy berry from recovery of the player own berry', () => {
		const [a, b] = begin('', 'Sitrus Berry', { ability: 'Pickup' }), original = rogueItemSource(b);
		b.hp = Math.floor(b.maxhp / 3); assert(b.eatItem());
		battle.singleEvent('Residual', battle.dex.abilities.get('pickup'), a.abilityState, a);
		assert.equal(a.item, 'sitrusberry'); assert.deepEqual(rogueItemSource(a), original); assert.equal(original.owned, false);
		const result = rogueBattleResult(battle), data = content();
		data.items.push({ id: 'sitrusberry', kind: 'held', name: '文柚果', price: 600 });
		assert.equal(battleItemReward({ spirit: 'hoopagift' }, data, result.team[0], result, () => 0), 'fantasypowerlens');
	});
	it('preserves an allied Symbiosis transfer following berry consumption', () => {
		const [a] = begin('Sitrus Berry', '', { coop: true, partnerAbility: 'Symbiosis', partnerItem: 'Leftovers' });
		const b = battle.p3.active[0], original = rogueItemSource(b);
		a.hp = Math.floor(a.maxhp / 3); assert(a.eatItem());
		assert.equal(a.item, 'leftovers'); assert.equal(b.item, ''); assert.deepEqual(rogueItemSource(a), original);
		assert.equal(reward(undefined, { spirit: 'hoopagift' }, noRoll), 'leftovers');
	});
	it('preserves a consumed berry restored by G-Max Replenish', () => {
		const [a, b] = begin('Sitrus Berry'), original = rogueItemSource(a);
		a.hp = Math.floor(a.maxhp / 3); assert(a.eatItem());
		battle.randomChance = () => false;
		battle.actions.useMove('gmaxreplenish', a, { target: b });
		assert.equal(a.item, 'sitrusberry'); assert.deepEqual(rogueItemSource(a), original);
	});
	it('keeps the original item source when a native transfer fails', () => {
		const [a, b] = begin('Leftovers', 'Sitrus Berry', { enemyAbility: 'Sticky Hold' });
		const oldA = rogueItemSource(a), oldB = rogueItemSource(b);
		battle.makeChoices('move trick', 'move splash');
		assert.equal(a.item, 'leftovers'); assert.equal(b.item, 'sitrusberry');
		assert.deepEqual(rogueItemSource(a), oldA); assert.deepEqual(rogueItemSource(b), oldB);
	});
	it('keeps provenance on capture so giving away and catching one own item cannot reroll it', () => {
		const [a, b] = begin('Leftovers'); const original = rogueItemSource(a);
		battle.makeChoices('move trick', 'move splash'); assert.deepEqual(rogueItemSource(b), original);
		battle.makeChoices('rogueball pokeball', 'move splash');
		const result = rogueBattleResult(battle); assert(result.captured);
		assert.equal(battleItemReward({ spirit: 'hoopagift' }, content(), result.captured, result, noRoll, true), 'leftovers');
		assert.deepEqual(result.itemSources[result.captured.id], original);
	});
	it('does not reinterpret old checkpoints or another spirit and keeps generated sources distinct', () => {
		let [a] = begin(); a.setItem('leftovers'); const first = rogueItemSource(a);
		a.clearItem(); a.setItem('leftovers'); assert.notEqual(rogueItemSource(a).key, first.key);
		const old = battle.toJSON(); delete old.fantasyRogue.itemSourceVersion;
		battle.destroy(); battle = Battle.fromJSON(old); assert.equal(rogueBattleResult(battle).itemSources, undefined);
		assert.equal(reward(undefined, { spirit: 'hoopagift' }, noRoll), 'leftovers');
		battle.destroy(); [a] = begin('Leftovers', '', { spirit: 'hooh' });
		assert.equal(rogueItemSource(a), undefined); assert.equal(a.takeItem(), battle.dex.items.get('leftovers'));
	});
	it('leaves ordinary Showdown item mechanics outside the Rogue provenance hooks', () => {
		battle = new Battle({ formatid: 'gen9customgame', seed: [1, 2, 3, 4],
			p1: { name: 'Normal', team: [{ ...set('Snorlax', 'Immunity', 50, ['Trick', 'Splash']), item: 'Leftovers' }] },
			p2: { name: 'Other', team: [set('Blissey', 'Natural Cure', 50, ['Splash'])] } });
		battle.makeChoices('team 1', 'team 1'); battle.makeChoices('move trick', 'move splash');
		assert.equal(battle.p2.active[0].item, 'leftovers'); assert.equal(battle.p1.active[0].m.rogueItemSource, undefined);
		assert.equal(battle.p2.active[0].m.rogueItemSource, undefined);
	});
});
