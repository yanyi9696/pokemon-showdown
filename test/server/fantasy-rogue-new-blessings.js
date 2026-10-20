'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { Dex } = require('../../dist/sim/dex');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { syncBlessingParty, blessingCandidates, blessingExperience, blessingLoot, canLearnZapCannon, handleBlessingCommand } = require('../../dist/server/fantasy-rogue/blessings');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { grantCompanion, companionCommand, companionRecommendation, recordCompanionPreference, poppyRewardPickup } = require('../../dist/server/fantasy-rogue/companions');
const { rogueAbilityInfo } = require('../../dist/sim/fantasy-rogue-blessings');
const { rulebreakerActive } = require('../../dist/sim/rogue-special-blessings');
const { stats, set, content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue companion gifts, railgun and rule breaker', function () {
	this.timeout(20000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function party(sets, ids = []) {
		const run = { id: 'new-blessings', floor: 50, phase: 'ready', money: 0, bag: {}, boosts: stats(0),
			team: sets.map((s, i) => ({ ...createRoguePokemon(s, stats(0)), joinOrder: i + 1 })) };
		syncBlessingParty(run);
		run.blessings.owned = ids.map(id => ({ ...blessing(id), floor: 1 }));
		syncBlessingParty(run); return run;
	}
	function begin(run, foe = set('Blissey', 'Natural Cure', 100, ['Splash'])) {
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'new-blessings', team: structuredClone(run.team), boosts: stats(0), bag: {}, balls: [],
				catchable: false, blessings: structuredClone(run.blessings) },
			p1: { team: run.team.map(m => m.set) }, p2: { team: [foe] } });
		battle.makeChoices('team 1', 'team 1'); battle.randomizer = n => n;
		return battle.p1.active[0];
	}
	function modified(id, mon = battle.p1.active[0]) {
		const move = battle.dex.getActiveMove(id);
		battle.setActiveMove(move, mon, battle.p2.active[0]);
		battle.runEvent('ModifyMove', mon, battle.p2.active[0], move, move);
		return move;
	}
	function damage(id = 'tackle') {
		const move = modified(id), value = battle.actions.getDamage(battle.p1.active[0], battle.p2.active[0], move);
		battle.clearActiveMove(); return value;
	}
	it('gates both prismatic offers by legal learning or an actual main/extra Mold Breaker holder', () => {
		const run = party([set('Magikarp')]);
		assert(!canLearnZapCannon(run.team[0]));
		assert(!blessingCandidates(run, content()).some(b => ['railgun', 'rulebreaker'].includes(b.family)));
		run.team = party([set('Magnemite')]).team;
		assert(canLearnZapCannon(run.team[0])); assert(blessingCandidates(run, content()).some(b => b.family === 'railgun'));
		run.team[0].extraAbilities = ['moldbreaker'];
		assert(blessingCandidates(run, content()).some(b => b.family === 'rulebreaker'));
		delete run.team[0].extraAbilities; run.team[0].set.ability = 'Mold Breaker';
		assert(blessingCandidates(run, content()).some(b => b.family === 'rulebreaker'));
	});
	it('upgrades only the strongest equipped Zap Cannon user and exposes the same power/accuracy sources', () => {
		const run = party([set('Magnemite', 'Sturdy', 100, ['Zap Cannon', 'Splash']), set('Magnemite', 'Sturdy', 20, ['Zap Cannon'])], ['railgun']);
		const mon = begin(run);
		assert.equal(mon.volatiles.magnetrise.duration, 0);
		const move = modified('zapcannon'); assert.equal(move.name, '超电磁炮'); assert.equal(move.accuracy, 100);
		assert.equal(battle.runEvent('BasePower', mon, battle.p2.active[0], move, move.basePower), 240);
		battle.clearActiveMove();
		const info = rogueAbilityInfo(mon);
		assert.equal(info.moves.zapcannon.accuracyFactor, 2);
		assert.deepEqual(info.moves.zapcannon.power, [{ source: '某科学超电磁炮', factor: 2 }]);
		battle.makeChoices('switch 2', 'move splash');
		assert(!battle.p1.active[0].volatiles.magnetrise);
		assert.equal(modified('zapcannon').accuracy, 50); battle.clearActiveMove();
		battle.makeChoices('switch ' + (battle.p1.pokemon.indexOf(mon) + 1), 'move splash');
		for (let i = 0; i < 7; i++) battle.makeChoices('move splash', 'move splash');
		assert(mon.volatiles.magnetrise); assert.equal(mon.volatiles.magnetrise.duration, 0);
	});
	it('teaches a legal partner immediately, preserves a full moveset and can repair a stale reward', () => {
		const run = party([set('Magnemite', 'Sturdy', 20, ['Tackle', 'Thunder Shock', 'Supersonic', 'Thunder Wave']), set('Magikarp')]);
		const account = {revision: 1, captures: {}, unlocked: [], run}; const data = content(); data.blessings = true;
		run.phase = 'blessing'; run.blessings.round = {floor: 50, tier: 'prismatic', remaining: 1, options: [{id: 'railgun', refreshes: 1}], familiesSeen: ['railgun']};
		handleBlessingCommand(account, run, data, {action: 'blessing', slot: 0}, () => 0);
		assert.deepEqual(run.blessings.pending[0].options, [run.team[0].id]);
		handleBlessingCommand(account, run, data, {action: 'blessingreward', member: run.blessings.pending[0].id, value: run.team[0].id}, () => 0);
		assert.equal(run.team[0].set.moves.length, 4); assert(run.team[0].moveMemory.some(m => m.id === 'zapcannon'));
		run.blessings.pending = [{id: 'stale', blessing: 'railgun', kind: 'target', options: ['missing']}]; run.team = [run.team[1]];
		handleBlessingCommand(account, run, data, {action: 'blessingreward', member: 'stale', value: 'skip'}, () => 0);
		assert.equal(run.blessings.pending.length, 0);
	});
	it('keeps Iris on existing dragon-king saves and restricts the XP benefit to other Dragons', () => {
		const run = party([set('Dragonite'), set('Dratini'), set('Eevee')], ['dragonking']);
		assert(run.blessings.companions.some(c => c.id === 'iris'));
		assert.equal(blessingExperience(run, run.team[0]), 1);
		assert.equal(blessingExperience(run, run.team[1]), 1.3);
		assert.equal(blessingExperience(run, run.team[2]), 1);
		syncBlessingParty(run); assert.equal(run.blessings.companions.length, 1);
	});
	it('migrates Acerola and offers the new companions without duplicate native abilities', () => {
		const run = party([set('Eevee', 'Run Away'), set('Scizor', 'Technician')]);
		grantCompanion(run, 'acerola'); const c = run.blessings.companions[0];
		c.type = 'Normal'; c.member = run.team[0].id; c.ability = 'stalwart'; syncBlessingParty(run);
		assert.equal(c.ability, 'moldbreaker');
		grantCompanion(run, 'poppy'); grantCompanion(run, 'guzma');
		require('../../dist/server/fantasy-rogue/travellers').chooseCompanionInvitation(run, run.companionInvitations[0].key, 'acerola');
		companionCommand(run, { member: 'poppy', value: 'ability:tiekai' }, () => 0, []);
		companionCommand(run, { member: 'guzma', value: 'ability:huibizaisheng' }, () => 0, []);
		assert.equal(run.blessings.companions[1].member, run.team[1].id);
		assert.equal(run.blessings.companions[2].member, run.team[1].id);
	});
	it('streamers and Guzma prefer fights; Iris prefers partners and Lana counts fishing starts once', () => {
		const options = [{ id: 'fight', name: '战斗' }, { id: 'adopt', name: '照顾伙伴' }, { id: 'fishstart', name: '借我试试' }];
		for (const id of ['iono', 'canari', 'guzma', 'iris']) {
			const r = party([set()]); r.phase = 'event'; grantCompanion(r, id);
			r.node = {kind: 'event', event: {id: 'fishing', key: 'fish', stage: 'choice'}};
			assert.equal(companionRecommendation(r, r.blessings.companions[0], options), id === 'iris' ? 'adopt' : 'fight');
		}
		const run = party([set()]); run.phase = 'event'; grantCompanion(run, 'lana');
		run.node = { kind: 'event', event: { id: 'fishing', key: 'fish', stage: 'choice' } };
		for (let i = 0; i < 15; i++) {
			run.node.event = { id: 'fishing', key: 'fish' + i, stage: 'choice' };
			recordCompanionPreference(run, options, 'fishstart', () => 0);
			recordCompanionPreference(run, options, 'fishstart', () => 0);
		}
		assert.equal(run.blessings.companions.find(c => c.id === 'lana').preferences, 15);
		assert.equal(run.bag.mysticwater, 1); assert.equal(run.money, 0);
		assert(run.notices.some(n => n.includes('同行训练家的赠礼')));
	});
	it('grants Poppy candy only after reward regions once and preserves the stated Guzma quantity', () => {
		const run = party([set('Scizor'), set('Magnemite'), set('Eevee')]);
		grantCompanion(run, 'poppy'); grantCompanion(run, 'guzma');
		run.node = { kind: 'event' }; poppyRewardPickup(run, () => 0); assert.deepEqual(run.bag, {});
		run.node.kind = 'reward'; poppyRewardPickup(run, () => 0); poppyRewardPickup(run, () => 0);
		assert.equal(Object.values(run.bag).reduce((a, b) => a + b, 0), 2);
		assert.equal(blessingLoot(run, { tinymushroom: 10 }, () => 999).tinymushroom, 12);
	});
	it('ignores all negative stat stages, including self-inflicted drops, without boosting unrelated allies', () => {
		const mon = begin(party([set('Haxorus', 'Mold Breaker'), set('Eevee')], ['rulebreaker']));
		assert(rulebreakerActive(mon));
		const before = mon.getStat('atk'); mon.boosts.atk = -6;
		assert.equal(mon.getStat('atk'), before);
		battle.boost({ def: -1, spa: 1 }, mon, mon); assert.equal(mon.boosts.def, 0); assert.equal(mon.boosts.spa, 1);
		assert(!rulebreakerActive(battle.p1.pokemon[1]));
	});
	for (const item of ['eviolite', 'assaultvest', 'chilanberry']) it(`ignores defensive item ${item} without consuming it`, () => {
		begin(party([set('Mew', 'Mold Breaker', 50)], ['rulebreaker']), { ...set('Chansey', 'Natural Cure', 100), item });
		const target = battle.p2.active[0], move = item === 'assaultvest' ? 'swift' : 'tackle';
		const boosted = damage(move); target.item = ''; assert.equal(damage(move), boosted);
	});
	it('ignores defensive stages, Shadow Shield, screens and natural type immunity', () => {
		begin(party([set('Mew', 'Mold Breaker', 50)], ['rulebreaker']), set('Blissey', 'Shadow Shield', 100));
		const foe = battle.p2.active[0], base = damage();
		foe.boosts.def = 6; foe.side.addSideCondition('reflect', foe); assert.equal(damage(), base);
		foe.setAbility('Natural Cure'); assert.equal(damage(), base);
		foe.setType('Ghost'); assert.equal(damage(), base);
	});
	it('hits through Protect and Substitute, and ignores Focus Sash', () => {
		begin(party([set('Haxorus', 'Mold Breaker', 100, ['Tackle'])], ['rulebreaker']), { ...set('Shedinja', 'Wonder Guard', 1, ['Protect']), item: 'Focus Sash' });
		const foe = battle.p2.active[0]; foe.addVolatile('substitute', foe); foe.volatiles.substitute.hp = 100;
		battle.makeChoices('move tackle', 'move protect');
		assert(foe.fainted); assert.equal(foe.item, 'focussash');
	});
	for (const protection of ['maxguard', 'endure']) it(`bypasses ${protection} without removing it for other attackers`, () => {
		begin(party([set('Haxorus', 'Mold Breaker', 100, ['Tackle'])], ['rulebreaker']), set('Shedinja', 'Wonder Guard', 1, ['Splash']));
		const foe = battle.p2.active[0]; foe.addVolatile(protection, foe);
		battle.makeChoices('move tackle', 'move splash'); assert(foe.fainted);
	});
	it('bypasses protective terrain while leaving its offensive bonuses intact', () => {
		const mon = begin(party([set('Mew', 'Mold Breaker', 50, ['Quick Attack'])], ['rulebreaker']));
		const earthquake = damage('earthquake'), dragon = damage('dragonbreath'), grass = damage('vinewhip');
		battle.field.setTerrain('grassyterrain', mon); assert.equal(damage('earthquake'), earthquake); assert(damage('vinewhip') > grass);
		battle.field.setTerrain('mistyterrain', mon); assert.equal(damage('dragonbreath'), dragon);
		battle.field.setTerrain('psychicterrain', mon); const before = battle.p2.active[0].hp;
		battle.makeChoices('move quickattack', 'move splash'); assert(battle.p2.active[0].hp < before);
	});
	it('suppresses weather damage and penalties but keeps beneficial weather multipliers', () => {
		const mon = begin(party([set('Mew', 'Mold Breaker', 50, ['Splash'])], ['rulebreaker']));
		const dry = damage('watergun'), flame = damage('ember');
		battle.field.setWeather('sunnyday', mon); assert.equal(damage('watergun'), dry); assert(damage('ember') > flame);
		battle.field.setWeather('raindance', mon); assert.equal(damage('ember'), flame); assert(damage('watergun') > dry);
		battle.field.setWeather('sandstorm', mon); const hp = mon.hp;
		battle.makeChoices('move splash', 'move splash'); assert.equal(mon.hp, hp);
	});
	it('also activates for an extra Mold Breaker through Ability Shield and survives serialization', () => {
		const run = party([set('Mew', 'Synchronize', 50)], ['rulebreaker']); run.team[0].extraAbilities = ['moldbreaker'];
		const mon = begin(run, { ...set('Blissey', 'Fur Coat', 100), item: 'Ability Shield' });
		assert(rulebreakerActive(mon)); const shield = damage();
		battle.p2.active[0].setAbility('Natural Cure'); assert.equal(damage(), shield);
		const snapshot = battle.toJSON(); battle.destroy(); battle = Battle.fromJSON(snapshot);
		assert(rulebreakerActive(battle.p1.active[0])); assert(rogueAbilityInfo(battle.p1.active[0]).rulebreaker);
	});
});
