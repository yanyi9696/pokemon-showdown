'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { applyRogueGrowth } = require('../../dist/sim/rogue-growth');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { captureCoopCheckpoint } = require('../../dist/sim/rogue-coop-checkpoint');
const { createRoguePokemon, rebuildMember } = require('../../dist/server/fantasy-rogue/progression');
const { blessingPartyRoles } = require('../../dist/sim/rogue-blessing-permanent');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative simulator live growth acknowledgement', () => {
	let battle, messages;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function begin(guest = set('Charmander', 'Run Away', 15, ['Ember', 'Growl'])) {
		const team = [createRoguePokemon(set('Bulbasaur', 'Run Away', 8, ['Tackle', 'Growl']), stats(0))];
		const partner = [createRoguePokemon(guest, stats(0))];
		messages = [];
		const state = { encounterId: 'coop-live', persistCoop: true, cooperative: { opponentOffset: 2 },
			liveProgression: true, progression: true, team, partner: { team: partner, boosts: stats(0) },
			boosts: stats(0), bag: { potion: 2 }, partnerBag: { potion: 5 }, balls: [], catchable: false };
		const foes = () => [set('Magikarp', 'Swift Swim', 5, ['Splash']), set('Magikarp', 'Swift Swim', 5, ['Splash'])];
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', fantasyRogue: state, seed: [1, 2, 3, 4],
			p1: { name: 'Host', team: team.map(mon => mon.set) }, p3: { name: 'Guest', team: partner.map(mon => mon.set) },
			p2: { name: 'Wild A', team: foes() }, p4: { name: 'Wild B', team: foes() },
			send(type, payload) { if (type === 'fantasyrogueprogress') messages.push(JSON.parse(payload)); } });
		battle.makeChoices('team 1', 'team 12', 'team 1', 'team 12');
	}
	function pause(guestMove = 'ember') {
		battle.p2.active[0].hp = 1; battle.p4.active[0].hp = 1;
		battle.makeChoices('move tackle 1', 'move splash', `move ${guestMove}${guestMove === 'splash' ? '' : ' 2'}`, 'move splash');
		assert.equal(messages.length, 1); assert(battle.fantasyRogue.growthWaiting);
		assert(battle.sides.every(side => side.activeRequest.wait));
		assert(!battle.ended);
	}
	function update(paused = true) {
		const result = rogueBattleResult(battle, false);
		const grow = team => team.map(mon => {
			mon.set.level++; rebuildMember(mon, stats(0)); return mon;
		});
		return { sequence: messages[0].sequence, revision: 1, paused,
			team: grow(result.team), bag: { potion: 1 },
			partner: { team: grow(result.partnerTeam), bag: { potion: 4 } } };
	}
	it('pauses all four seats after a native double knockout and updates both owners before resuming', () => {
		begin(); pause(); assert.equal(messages[0].sequence, 2);
		const ack = update();
		applyRogueGrowth(battle, ack);
		assert.equal(battle.p1.pokemon[0].level, 9); assert.equal(battle.p3.pokemon[0].level, 16);
		assert.deepEqual(battle.fantasyRogue.bag, { potion: 1 });
		assert.deepEqual(battle.fantasyRogue.partnerBag, { potion: 4 });
		assert(battle.sides.every(side => side.activeRequest.wait));
		applyRogueGrowth(battle, { ...ack, revision: 2, paused: false });
		assert(!battle.fantasyRogue.growthWaiting);
		assert(battle.p2.activeRequest.forceSwitch); assert(battle.p4.activeRequest.forceSwitch);
		battle.makeChoices('pass', 'switch 2', 'pass', 'switch 2');
		assert(!battle.p1.activeRequest.wait); assert(!battle.p3.activeRequest.wait);
		assert.equal(messages.length, 1);
	});
	it('rejects missing, partial, duplicate and cross-owner acknowledgements atomically', () => {
		begin(); pause(); const good = update(false), before = battle.toJSON();
		for (const mutate of [ack => { delete ack.partner; }, ack => { ack.partner.team = []; },
			ack => { ack.partner.team.push(ack.partner.team[0]); }, ack => { ack.partner.team = ack.team; },
			ack => { ack.team = ack.partner.team; }, ack => { ack.sequence++; },
			ack => { ack.revision = NaN; }]) {
			const bad = structuredClone(good); mutate(bad); applyRogueGrowth(battle, bad);
			assert.deepEqual(battle.toJSON(), before);
		}
		applyRogueGrowth(battle, good); assert(!battle.fantasyRogue.growthWaiting);
	});
	it('preserves both owners damage, PP, status, boosts and temporary move replacements', () => {
		begin();
		for (const side of [battle.p1, battle.p3]) {
			const mon = side.active[0]; mon.hp -= 3; mon.boosts.def = 2;
			mon.moveSlots[1] = { ...mon.moveSlots[1], move: 'Splash', id: 'splash', pp: 3, maxpp: 5, virtual: true };
		}
		pause(); const missing = [battle.p1, battle.p3].map(side => side.active[0].maxhp - side.active[0].hp);
		for (const side of [battle.p1, battle.p3]) assert(side.active[0].setStatus('par'));
		const ack = update(); applyRogueGrowth(battle, ack);
		for (const [i, side] of [battle.p1, battle.p3].entries()) {
			const mon = side.active[0]; assert.equal(mon.maxhp - mon.hp, missing[i]);
			assert.equal(mon.status, 'par'); assert.equal(mon.boosts.def, 2);
			assert.equal(mon.moveSlots[1].id, 'splash'); assert.equal(mon.moveSlots[1].pp, 3);
			assert.equal(mon.baseMoveSlots[1].id, 'growl');
			assert.equal(mon.moveSlots[0].pp, mon.moveSlots[0].maxpp - 1);
		}
	});
	it('restores a pending dual acknowledgement from a checkpoint and ignores older revisions', () => {
		begin(); pause(); const ack = update();
		applyRogueGrowth(battle, ack);
		const checkpoint = captureCoopCheckpoint(battle); battle.destroy(); battle = Battle.fromJSON(checkpoint.state);
		const before = battle.toJSON();
		applyRogueGrowth(battle, { ...ack, paused: false }); assert.deepEqual(battle.toJSON(), before);
		ack.partner.team[0].set.moves[1] = 'smokescreen';
		ack.partner.team[0].pp[1] = { id: 'smokescreen', pp: 20, maxpp: 20 };
		applyRogueGrowth(battle, { ...ack, revision: 2, paused: false });
		assert.equal(battle.p3.pokemon[0].moveSlots[1].id, 'smokescreen');
		assert.equal(battle.p1.pokemon[0].moveSlots[1].id, 'growl');
		assert(!battle.fantasyRogue.growthWaiting);
		assert.equal(battle.fantasyRogue.growthRevision, 2);
	});
	it('evolves the guest in place without reviving it or adding unselected evolution partners', () => {
		begin(); pause(); const ack = update();
		const guest = ack.partner.team[0], mon = battle.p3.pokemon[0];
		guest.set.species = 'Charmeleon'; guest.set.ability = 'Blaze'; rebuildMember(guest, stats(0));
		const missing = mon.maxhp - mon.hp; applyRogueGrowth(battle, ack);
		assert.equal(mon.baseSpecies.name, 'Charmeleon'); assert.equal(mon.maxhp - mon.hp, missing);
		assert.equal(mon.baseAbility, 'blaze'); assert.equal(mon.set.fantasyRogueId, guest.id);
		const before = battle.toJSON(), extra = structuredClone(ack);
		extra.revision++; extra.partner.team.push(createRoguePokemon(set('Shedinja', 'Wonder Guard', 16), stats(0)));
		applyRogueGrowth(battle, extra); assert.deepEqual(battle.toJSON(), before);
		mon.hp = 0; mon.fainted = true;
		applyRogueGrowth(battle, { ...ack, revision: 2 }); assert.equal(mon.hp, 0); assert(mon.fainted);
	});
	it('keeps guest Transform stats and copied moves while updating its original member', () => {
		begin(set('Ditto', 'Limber', 15, ['Transform']));
		const mon = battle.p3.active[0]; mon.transformInto(battle.p4.active[0]);
		mon.moveSlots[0].pp = 2; const copied = { ...mon.storedStats };
		pause('splash'); const ack = update(); applyRogueGrowth(battle, ack);
		assert(mon.transformed); assert.equal(mon.species.name, 'Magikarp');
		assert.deepEqual(mon.storedStats, copied); assert.equal(mon.moveSlots[0].pp, 1);
		assert.equal(mon.baseMoveSlots[0].id, 'transform'); assert.equal(mon.baseSpecies.name, 'Ditto');
		assert.equal(rogueBattleResult(battle, false).partnerTeam[0].set.species, 'Ditto');
	});
	it('keeps an evolution-created Shedinja outside the fixed cooperative battle selection', () => {
		begin(set('Nincada', 'Run Away', 19, ['Scratch'])); pause('scratch');
		const ack = update(), evolved = ack.partner.team[0];
		evolved.set.species = 'Ninjask'; evolved.set.ability = 'Speed Boost'; rebuildMember(evolved, stats(0));
		const extra = structuredClone(ack);
		extra.partner.team.push(createRoguePokemon(set('Shedinja', 'Wonder Guard', 20), stats(0)));
		const before = battle.toJSON(); applyRogueGrowth(battle, extra); assert.deepEqual(battle.toJSON(), before);
		applyRogueGrowth(battle, ack);
		assert.equal(battle.p3.pokemon.length, 1); assert.equal(battle.p3.pokemon[0].species.name, 'Ninjask');
		assert.equal(battle.fantasyRogue.partner.team.length, 1);
	});
	it('refreshes full-party role assignments without erasing already spent personal effects', () => {
		begin(set('Golduck', 'Run Away', 30, ['Ember']));
		battle.fantasyRogue.partner.blessings = { owned: [{ ...blessing('duck'), floor: 1 }],
			psychic: { points: 42 }, companionZ: { companion: 'marnie', member: 'old', spent: true } };
		pause(); const ack = update();
		const reserve = createRoguePokemon(set('Golduck', 'Run Away', 50), stats(0));
		const effects = battle.fantasyRogue.partner.blessings;
		ack.partner.blessingRoster = { partyRoles: blessingPartyRoles([...ack.partner.team, reserve], effects) };
		applyRogueGrowth(battle, ack); assert(!battle.p3.pokemon[0].hasAbility('neuroforce'));
		ack.partner.blessingRoster.partyRoles = blessingPartyRoles(ack.partner.team, effects);
		applyRogueGrowth(battle, { ...ack, revision: 2 }); assert(battle.p3.pokemon[0].hasAbility('neuroforce'));
		assert.equal(effects.psychic.points, 42); assert.equal(effects.companionZ.spent, true);
	});
});
