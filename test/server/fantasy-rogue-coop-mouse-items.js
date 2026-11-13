'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { toID } = require('../../dist/sim/dex');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { permanentMemberTypes } = require('../../dist/sim/rogue-blessing-permanent');
const { sharedRogueItems, mouseFamilyActive } = require('../../dist/sim/fantasy-rogue-items');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative electric mouse reserve equipment', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function party(items = [], ids = ['mousefamily']) {
		const run = { id: 'mice', floor: 30, phase: 'ready', money: 0, bag: {}, boosts: stats(0),
			team: ['Raichu', 'Pikachu', 'Plusle', 'Minun', 'Pachirisu', 'Dedenne'].map((name, i) =>
				createRoguePokemon({ ...set(name, 'Run Away', 80, ['Splash']), item: items[i] || '' }, stats(0))) };
		syncBlessingParty(run); run.blessings.owned = ids.map(id => ({ ...blessing(id), floor: 1 }));
		syncBlessingParty(run);
		run.blessings.party = run.team.map(mon => ({ id: mon.id, species: mon.set.species,
			types: permanentMemberTypes(mon), moves: mon.set.moves.map(toID), item: toID(mon.set.item) }));
		return run;
	}
	function begin(host, guest = party([], [])) {
		const state = { encounterId: 'mice', team: structuredClone(host.team.slice(0, 3)), boosts: stats(0),
			blessings: structuredClone(host.blessings), bag: {}, partnerBag: {},
			partner: { team: structuredClone(guest.team.slice(0, 3)), boosts: stats(0), blessings: structuredClone(guest.blessings) },
			balls: [], catchable: false, cooperative: { opponentOffset: 1 } };
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: 'Host', team: state.team.map(mon => mon.set) }, p3: { name: 'Guest', team: state.partner.team.map(mon => mon.set) },
			p2: { name: 'Enemy A', team: [set('Blissey', 'Run Away', 100, ['Splash'])] },
			p4: { name: 'Enemy B', team: [set('Blissey', 'Run Away', 100, ['Splash'])] } });
		battle.makeChoices('team 123', 'team 1', 'team 123', 'team 1');
		return battle.p1.active[0];
	}
	const turn = () => battle.makeChoices('move splash', 'move splash', 'move splash', 'move splash');
	function eat(mon) { mon.hp = Math.floor(mon.maxhp / 3); battle.runEvent('Update', mon); }
	it('shares reserve Light Ball and deduplicates Choice Band without borrowing from the partner', () => {
		const mon = begin(party(['', '', '', 'lightball', 'choiceband', 'choiceband']));
		assert.equal(mon.getStat('atk'), Math.floor(mon.storedStats.atk * 3));
		assert.equal(sharedRogueItems(mon).length, 2);
		assert.equal(battle.p3.active[0].getStat('atk'), battle.p3.active[0].storedStats.atk);
		assert.deepEqual(sharedRogueItems(battle.p2.active[0]), []);
		battle.field.addPseudoWeather('magicroom', mon);
		assert.equal(mon.getStat('atk'), mon.storedStats.atk);
	});
	it('consumes only the owning player reserve berries and preserves unrelated real equipment', () => {
		const mon = begin(party(['leftovers', '', '', 'sitrusberry', 'sitrusberry']), party(['', '', '', 'sitrusberry']));
		eat(mon); assert(mon.hp > mon.maxhp / 3); assert.equal(mon.item, 'leftovers');
		const result = rogueBattleResult(battle);
		for (const i of [3, 4]) {
			assert.equal(result.blessingEffects.party[i].item, '');
			assert.equal(result.blessingEffects.party[i].consumedItem, 'sitrusberry');
		}
		assert.equal(result.partnerBlessingEffects.party[3].item, 'sitrusberry');
		assert(!mon.hasItem('sitrusberry')); assert(battle.p3.active[0].hasItem('sitrusberry'));
	});
	it('preserves renewable first use and consumes the reserve berry only on the next use', () => {
		const mon = begin(party(['leftovers', '', '', 'sitrusberry'], ['mousefamily', 'renewable']));
		eat(mon); assert.equal(battle.fantasyRogue.blessings.party[3].item, 'sitrusberry');
		eat(mon); assert.equal(battle.fantasyRogue.blessings.party[3].item, '');
		assert.equal(mon.item, 'leftovers');
	});
	it('persists spent reserve equipment through a checkpoint and cannot consume it twice', () => {
		const mon = begin(party(['', '', '', 'sitrusberry'])); eat(mon);
		const snapshot = battle.toJSON(); battle.destroy(); battle = Battle.fromJSON(JSON.stringify(snapshot));
		const restored = battle.p1.active[0]; eat(restored);
		assert.equal(restored.hp, Math.floor(restored.maxhp / 3));
		assert.equal(rogueBattleResult(battle).blessingEffects.party[3].consumedItem, 'sitrusberry');
		turn(); assert(!restored.hasItem('sitrusberry'));
	});
	it('spends a reserve Focus Sash through native damage and does not share special transformation items', () => {
		const mon = begin(party(['', '', '', 'focussash', 'charizarditex', 'eeviumz']));
		assert.deepEqual(sharedRogueItems(mon), ['focussash']);
		battle.actions.tryMoveHit(mon, battle.p2.active[0], battle.dex.getActiveMove('fissure'));
		assert.equal(mon.hp, 1); assert(!mon.hasItem('focussash'));
		assert.equal(rogueBattleResult(battle).blessingEffects.party[3].consumedItem, 'focussash');
	});
	it('refunds every physically spent guest Weakness Policy once, including reserves', () => {
		begin(party(), party(['', 'weaknesspolicy', '', 'weaknesspolicy', 'weaknesspolicy'], ['mousefamily', 'weakness']));
		const mon = battle.p3.active[0];
		// A low-power super-effective hit invokes the native item callback without knocking Raichu out.
		const move = battle.dex.getActiveMove('mudslap'); move.basePower = 1;
		battle.actions.tryMoveHit(mon, battle.p2.active[0], move);
		assert.equal(mon.boosts.atk, 2); assert.equal(mon.boosts.spa, 2);
		assert.equal(battle.p3.pokemon[1].item, '');
		assert.equal(rogueBattleResult(battle, false).partnerBag.weaknesspolicy, undefined);
		assert.equal(rogueBattleResult(battle).partnerBag.weaknesspolicy, 3);
		assert.equal(rogueBattleResult(battle).partnerBag.weaknesspolicy, 3);
		assert.equal(rogueBattleResult(battle).bag.weaknesspolicy, undefined);
		assert.equal(battle.fantasyRogue.partnerBag.weaknesspolicy, undefined);
	});
	it('uses current selected equipment rather than its stale full-party copy', () => {
		const mon = begin(party(['lightball']));
		mon.setItem(''); assert.deepEqual(sharedRogueItems(mon), []);
		assert.equal(mon.getStat('atk'), mon.storedStats.atk);
	});
	it('keeps old snapshots safe and does not count a partner to complete the six-mouse condition', () => {
		const host = party(['', '', '', 'lightball']); delete host.blessings.party;
		begin(host); assert(!mouseFamilyActive(battle.p1.active[0]));
		assert.deepEqual(sharedRogueItems(battle.p1.active[0]), []);
	});
	it('keeps reserve move memory shared within the owner full party, independently of battle selection', () => {
		const host = party(), guest = party();
		host.team[4].moveMemory.push({ id: 'thunderbolt', pp: 15, maxpp: 15 });
		syncBlessingParty(host); syncBlessingParty(guest);
		assert(host.team.every(mon => mon.blessingMoves.includes('thunderbolt')));
		assert(guest.team.every(mon => !mon.blessingMoves.includes('thunderbolt')));
		host.team[0].set.moves = ['thunderbolt'];
		host.team[0].pp = [{ id: 'thunderbolt', pp: 15, maxpp: 15 }];
		const mon = begin(host, guest), foe = battle.p2.active[0], before = foe.hp;
		battle.makeChoices('move thunderbolt 1', 'move splash', 'move splash', 'move splash');
		assert(foe.hp < before); assert.equal(mon.moveSlots[0].pp, 14);
	});
});
