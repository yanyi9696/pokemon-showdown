'use strict';

const assert = require('assert').strict;
const { Battle, Dex } = require('../../dist/sim');
const { State } = require('../../dist/sim/state');
const { createRoguePokemon, rebuildMember } = require('../../dist/server/fantasy-rogue/progression');
const { normalizeBlessings, syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { permanentMemberTypes } = require('../../dist/sim/rogue-blessing-permanent');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { applyRogueGrowth } = require('../../dist/sim/rogue-growth');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue emblems change base formes without locking battle typing', function () {
	this.timeout(15000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function campaign(sets, emblem = 'rogueemblemfire', slot = 0, blessings = []) {
		const run = { floor: 50, phase: 'ready', team: sets.map(s => createRoguePokemon(s, stats(0))),
			caught: [], bag: {}, money: 0, boosts: stats(0), encounter: 0 };
		run.team[0].emblem = emblem; run.team[0].emblemSlot = slot;
		normalizeBlessings(run);
		run.blessings.owned = blessings.map(id => ({ ...blessing(id), floor: 1 }));
		syncBlessingParty(run);
		return run;
	}
	function begin(run, foe = set('Blissey', 'Natural Cure', 100, ['Splash', 'Soak', 'Ice Beam'])) {
		const state = { encounterId: 'emblem-base', team: structuredClone(run.team), boosts: stats(0),
			bag: {}, balls: [], catchable: false, blessings: structuredClone(run.blessings),
			systems: { player: { mega: true } }, tera: { player: true, opponent: true } };
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { team: state.team.map(mon => mon.set) }, p2: { team: [foe] } });
		battle.makeChoices('team 1', 'team 1');
		return battle.p1.active[0];
	}
	function turn(ours = 'move 1', theirs = 'move 1') {
		assert(battle.choose('p1', ours), battle.log.slice(-15).join('\n'));
		assert(battle.choose('p2', theirs), battle.log.slice(-15).join('\n'));
	}
	function restored() {
		const state = JSON.parse(JSON.stringify(State.serializeBattle(battle)));
		battle.destroy(); battle = State.deserializeBattle(state);
		return battle.p1.active[0];
	}
	for (const ability of ['Protean', 'Libero', 'Bian Huan Zi You']) {
		it(`keeps ${ability}'s single move type through damage, the next turn and resume`, () => {
			const mon = begin(campaign([set('Greninja-Fantasy', ability, 50, ['Leafage', 'Splash'])]));
			assert.deepEqual(mon.getTypes(), ['Fire', 'Dark']);
			let onHit;
			battle.onEvent('BasePower', battle.format, -100, (power, source, target, move) => {
				if (source === mon && move.id === 'leafage') onHit = source.getTypes();
			});
			turn();
			assert.deepEqual(onHit, ['Grass'], 'must already use the changed type during the move');
			assert.deepEqual(mon.getTypes(), ['Grass'], battle.log.join('\n'));
			assert(!battle.log.some(line => line.includes('|typechange|Grass/Fire')));
			// Event closures are a test probe, not persistent battle state.
			battle.events = {};
			assert.deepEqual(restored().getTypes(), ['Grass']);
			turn(); assert.deepEqual(battle.p1.active[0].getTypes(), ['Grass']);
		});
	}
	it('restores the equipped base pair on switching, without changing the shared species or saved species', () => {
		const run = campaign([set('Greninja-Fantasy', 'Bian Huan Zi You', 50, ['Leafage']), set('Mew', 'Synchronize', 50, ['Splash'])]);
		const mon = begin(run); turn();
		turn('switch 2'); turn('switch 2');
		assert.equal(battle.p1.active[0], mon); assert.deepEqual(mon.types, ['Fire', 'Dark']);
		assert.deepEqual(mon.getTypes(), ['Fire', 'Dark']);
		assert.deepEqual(Dex.mod('gen9fantasy').species.get('Greninja-Fantasy').types, ['Water', 'Dark']);
		const saved = rogueBattleResult(battle).team[0];
		assert.equal(saved.set.species, run.team[0].set.species);
		assert.deepEqual(permanentMemberTypes(saved), ['Fire', 'Dark']);
		assert.equal(saved.emblemSlot, 0); assert.equal(saved.emblem, 'rogueemblemfire');
	});
	for (const [move, type] of [['Soak', 'Water'], ['Magic Powder', 'Psychic']]) {
		it(`allows ${move} to replace both emblem base types until switching`, () => {
			const mon = begin(campaign([set('Greninja', 'Torrent', 50, ['Splash'])]), set('Mew', 'Synchronize', 50, [move, 'Splash']));
			turn(); assert.deepEqual(mon.getTypes(), [type]);
			turn('move 1', 'move 2'); assert.deepEqual(mon.getTypes(), [type]);
			assert.deepEqual(restored().getTypes(), [type]);
		});
	}
	for (const [move, type, moves] of [
		['Reflect Type', ['Normal'], ['Reflect Type']],
		['Conversion', ['Electric'], ['Thunder Shock', 'Conversion']],
		['Camouflage', ['Normal'], ['Camouflage']],
	]) {
		it(`does not reapply the emblem after ${move}`, () => {
			const mon = begin(campaign([set('Greninja', 'Torrent', 50, moves)]));
			turn(`move ${move}`); assert.deepEqual(mon.getTypes(), type);
		});
	}
	it('lets Color Change replace the emblem after being hit', () => {
		const mon = begin(campaign([set('Greninja', 'Color Change', 100, ['Splash'])]));
		turn('move 1', 'move 3'); assert.deepEqual(mon.getTypes(), ['Ice']);
		turn(); assert.deepEqual(mon.getTypes(), ['Ice']);
	});
	it('lets Burn Up remove the emblem Fire type instead of restoring it on every read', () => {
		const mon = begin(campaign([set('Greninja', 'Torrent', 50, ['Burn Up', 'Splash'])]));
		turn(); assert.deepEqual(mon.getTypes(), ['???', 'Dark']);
		turn('move 2'); assert.deepEqual(mon.getTypes(), ['???', 'Dark']);
	});
	it('lets Roost temporarily suppress the emblem Flying type, then restore it normally', () => {
		const mon = begin(campaign([set('Greninja', 'Torrent', 100, ['Roost'])], 'rogueemblemflying', 1));
		mon.hp -= 20;
		let during;
		battle.onEvent('BasePower', battle.format, -100, (power, source, target, move) => {
			if (move.id === 'icebeam') during = target.getTypes();
		});
		turn('move 1', 'move 3');
		assert.deepEqual(during, ['Water']); assert.deepEqual(mon.getTypes(), ['Water', 'Flying']);
	});
	it('retains separately added Trick-or-Treat typing', () => {
		const mon = begin(campaign([set('Greninja', 'Torrent', 50, ['Splash'])]), set('Mew', 'Synchronize', 50, ['Trick-or-Treat']));
		turn(); assert.deepEqual(mon.getTypes(), ['Fire', 'Dark', 'Ghost']);
	});
	for (const [species, stone, before, after] of [
		['Greninja-Fantasy', 'Greninjite', ['Fire', 'Dark'], ['Fire', 'Dark']],
		['Gyarados', 'Gyaradosite', ['Fire', 'Flying'], ['Fire', 'Dark']],
	]) {
		it(`bases ${species}'s Mega type on its new form, while allowing later Soak`, () => {
			const mon = begin(campaign([{ ...set(species, 'Torrent', 50, ['Splash']), item: stone }]));
			assert.deepEqual(mon.types, before);
			mon.setType('Grass');
			assert(battle.actions.runMegaEvo(mon)); assert.deepEqual(mon.getTypes(), after);
			assert(battle.log.filter(line => line.includes('|typechange|')).at(-1).includes(`|${after.join('/')}|`));
			turn('move 1', 'move 2'); assert.deepEqual(mon.getTypes(), ['Water']);
			assert.deepEqual(restored().getTypes(), ['Water']);
		});
	}
	it('uses the selected base slot in Zen Mode, preserves Soak while Zen, and restores base typing on reversal', () => {
		const mon = begin(campaign([set('Darmanitan', 'Zen Mode', 50, ['Splash'])], 'rogueemblemrock', 0));
		assert.deepEqual(mon.getTypes(), ['Fire', 'Rock']);
		mon.hp = Math.floor(mon.maxhp / 4); turn();
		assert.equal(mon.species.id, 'darmanitanzen'); assert.deepEqual(mon.getTypes(), ['Rock', 'Psychic']);
		turn('move 1', 'move 2'); assert.deepEqual(mon.getTypes(), ['Water']);
		turn(); assert.deepEqual(mon.getTypes(), ['Water']);
		mon.hp = mon.maxhp; turn();
		assert.equal(mon.species.id, 'darmanitan'); assert.deepEqual(mon.getTypes(), ['Fire', 'Rock']);
	});
	it('copies Transform target types without imposing the user emblem, then restores its own base on exit', () => {
		const mon = begin(campaign([set('Ditto', 'Limber', 50, ['Transform']), set('Mew', 'Synchronize', 50, ['Splash'])]),
			set('Dragonite', 'Inner Focus', 50, ['Splash']));
		turn(); assert(mon.transformed); assert.deepEqual(mon.getTypes(), ['Dragon', 'Flying']);
		turn('switch 2'); turn('switch 2'); assert.deepEqual(mon.getTypes(), ['Normal', 'Fire']);
	});
	it('keeps ordinary and Stellar Terastallization rules and the equipped pre-Tera STAB types', () => {
		const run = campaign([{ ...set('Greninja', 'Torrent', 50, ['Splash']), teraType: 'Electric' }]);
		const mon = begin(run);
		assert.equal(mon.teraType, 'Electric'); battle.actions.terastallize(mon);
		assert.deepEqual(mon.getTypes(), ['Electric']);
		assert.deepEqual(mon.getTypes(false, true), ['Fire', 'Dark']);
		assert.equal(mon.setType('Water'), false);
		assert.deepEqual(restored().getTypes(), ['Electric']);
		battle.destroy(); run.team[0].set.teraType = 'Stellar';
		const stellar = begin(run); battle.actions.terastallize(stellar);
		assert.deepEqual(stellar.getTypes(), ['Fire', 'Dark']);
	});
	it('does not reset temporary typing during a live level-up and preserves it in battle snapshots', () => {
		const mon = begin(campaign([set('Greninja', 'Protean', 50, ['Leafage'])]));
		turn();
		const state = battle.fantasyRogue;
		state.liveProgression = true; state.growthWaiting = true; state.defeated = ['foe'];
		const team = structuredClone(state.team); team[0].set.level++; rebuildMember(team[0], stats(0));
		applyRogueGrowth(battle, { sequence: 1, revision: 1, paused: false, team, bag: {} });
		assert.equal(mon.level, 51); assert.deepEqual(mon.getTypes(), ['Grass']);
		assert.deepEqual(restored().getTypes(), ['Grass']);
	});
	it('starts the next encounter from the persistent emblem base, not the last battle temporary type', () => {
		const run = campaign([set('Greninja', 'Protean', 50, ['Leafage'])]);
		begin(run); turn(); run.team = JSON.parse(JSON.stringify(rogueBattleResult(battle).team));
		assert.equal(run.team[0].set.species, 'Greninja');
		assert.deepEqual(permanentMemberTypes(run.team[0]), ['Fire', 'Dark']);
		battle.destroy(); assert.deepEqual(begin(run).getTypes(), ['Fire', 'Dark']);
	});
	it('restores an old checkpoint base array without resetting HP, PP, added types or equipment', () => {
		begin(campaign([set('Greninja', 'Torrent', 50, ['Splash'])]));
		const mon = battle.p1.active[0];
		mon.hp -= 5; mon.moveSlots[0].pp--; mon.addType('Ghost');
		const snapshot = JSON.parse(JSON.stringify(State.serializeBattle(battle)));
		// Exact legacy storage: getTypes added Fire but never changed the natural types array.
		snapshot.sides[0].pokemon[0].types = ['Water', 'Dark'];
		const hp = mon.hp, pp = mon.moveSlots[0].pp;
		battle.destroy(); battle = State.deserializeBattle(snapshot);
		const resumed = battle.p1.active[0];
		assert.deepEqual(resumed.getTypes(), ['Fire', 'Dark', 'Ghost']);
		assert.equal(resumed.hp, hp); assert.equal(resumed.moveSlots[0].pp, pp);
		assert.equal(battle.fantasyRogue.team[0].emblem, 'rogueemblemfire');
		assert.deepEqual(restored().getTypes(), ['Fire', 'Dark', 'Ghost']);
	});
	for (const ability of ['Protean', 'Bian Huan Zi You']) {
		it(`preserves an old ${ability} change equal to natural typing through a level-up and checkpoint restore`, () => {
			begin(campaign([set('Psyduck', ability, 50, ['Water Gun'])])); turn();
			const snapshot = JSON.parse(JSON.stringify(State.serializeBattle(battle)));
			snapshot.sides[0].pokemon[0].types = ['Water'];
			snapshot.sides[0].pokemon[0].apparentType = 'Water/Fire';
			// Legacy end-of-turn readback and level notifications must not erase the move's type change.
			snapshot.log.push('|-start|p1a: Psyduck|typechange|Water/Fire|[silent]',
				'|detailschange|p1a: Psyduck|Psyduck, L51|[levelchange]');
			battle.destroy(); battle = State.deserializeBattle(snapshot);
			assert.deepEqual(battle.p1.active[0].getTypes(), ['Water']);
			assert(battle.log.at(-1).includes('|typechange|Water|[silent]'));
			assert(!snapshot.log.at(-1).includes('|typechange|Water|[silent]'), 'saved input remains unchanged');
		});
	}
	it('migrates the resting base types of an old benched partner independently of previous type-change logs', () => {
		begin(campaign([set('Psyduck', 'Protean', 50, ['Water Gun']), set('Mew', 'Synchronize', 50, ['Splash'])]));
		turn(); turn('switch 2');
		const snapshot = JSON.parse(JSON.stringify(State.serializeBattle(battle)));
		snapshot.sides[0].pokemon.find(mon => mon.set.species === 'Psyduck').types = ['Water'];
		battle.destroy(); battle = State.deserializeBattle(snapshot);
		assert.deepEqual(battle.p1.pokemon.find(mon => mon.species.name === 'Psyduck').getTypes(), ['Water', 'Fire']);
	});
	it('restores the emblem base after a legacy Mimicry terrain reset', () => {
		begin(campaign([set('Psyduck', 'Mimicry', 50, ['Splash'])]));
		const snapshot = JSON.parse(JSON.stringify(State.serializeBattle(battle)));
		snapshot.sides[0].pokemon[0].types = ['Water'];
		snapshot.log.push('|-start|p1a: Psyduck|typechange|Grass|[from] ability: Mimicry',
			'|-activate|p1a: Psyduck|ability: Mimicry', '|-end|p1a: Psyduck|typechange|[silent]');
		battle.destroy(); battle = State.deserializeBattle(snapshot);
		assert.deepEqual(battle.p1.active[0].getTypes(), ['Water', 'Fire']);
	});
	it('preserves the custom Houbaxi move type through its silent form change and checkpoint', () => {
		const mon = begin(campaign([set('Simisage-Fantasy', 'Gluttony', 50, ['Houbaxi'])]),
			set('Charizard', 'Blaze', 100, ['Splash']));
		turn(); assert.equal(mon.species.name, 'Simipour-Fantasy');
		assert.deepEqual(mon.getTypes(), ['Water']);
		assert.deepEqual(restored().getTypes(), ['Water']);
	});
	it('applies the emblem after permanent Duck typing, without relocking the replaced slot', () => {
		const mon = begin(campaign([set('Golduck', 'Damp', 50, ['Splash'])], 'rogueemblemfire', 1, ['duck']));
		assert.deepEqual(mon.getTypes(), ['Water', 'Fire']);
		turn('move 1', 'move 2'); assert.deepEqual(mon.getTypes(), ['Water']);
	});
	it('allows Ghidorah to change its first type during battle instead of having the emblem mask it', () => {
		const mon = begin(campaign([set('Hydreigon', 'Levitate', 50, ['Dark Pulse'])], 'rogueemblemice', 0, ['ghidorah']));
		turn(); assert.equal(mon.getTypes()[0], 'Dark');
	});
	it('preserves the existing no-emblem Duck and wine/cephalosporin effects', () => {
		const run = campaign([set('Golduck', 'Damp', 50, ['Splash'])], '', 1, ['duck']);
		run.team[0].tonics = { wine: true, cephalosporin: true };
		const mon = begin(run); assert.deepEqual(mon.getTypes(), ['Water', 'Psychic', 'Ghost']);
		mon.setType('Fire'); assert.deepEqual(mon.getTypes(), ['Fire', 'Psychic', 'Ghost']);
	});
	it('restores emblem base types after Mimicry terrain ends and publishes that restoration', () => {
		const mon = begin(campaign([set('Psyduck', 'Mimicry', 50, ['Splash'])]));
		assert.deepEqual(mon.getTypes(), ['Water', 'Fire']);
		assert(battle.field.setTerrain('grassyterrain', mon));
		assert.deepEqual(mon.getTypes(), ['Grass']);
		battle.field.clearTerrain(); assert.deepEqual(mon.getTypes(), ['Water', 'Fire']);
		assert(battle.log.filter(line => line.includes('|typechange|')).at(-1).includes('|Water/Fire|'));
	});
	it('lets AR System change its first type while retaining the emblem second base type', () => {
		const run = campaign([{ ...set('Silvally-Fantasy', 'AR Xi Tong Gai', 50, ['Splash']), item: 'Water Memory' }],
			'rogueemblemfire', 1);
		const mon = begin(run);
		assert.deepEqual(mon.getTypes(), ['Water', 'Fire']);
		mon.setItem('Ice Memory');
		assert.deepEqual(mon.getTypes(), ['Ice', 'Fire']);
	});
	for (const [emblem, slot, expected] of [
		['rogueemblemfire', 0, ['Fire', 'Dark']], ['rogueemblemfire', 1, ['Water', 'Fire']],
		['rogueemblemwater', 1, ['Water']], ['rogueemblemdark', 0, ['Dark']],
	]) {
		it(`starts with ${emblem} in slot ${slot} in its stored typing without duplicate types`, () => {
			const mon = begin(campaign([set('Greninja', 'Torrent', 50, ['Splash'])], emblem, slot));
			assert.deepEqual(mon.types, expected); assert.deepEqual(mon.getTypes(), expected);
		});
	}
	for (const formatid of ['gen9fantasyroguecoop', 'gen9fantasyroguedoubles', 'gen9fantasyrogueduel']) {
		it(`keeps both participants' emblem and temporary types independent in ${formatid}`, () => {
			const host = campaign([set('Greninja-Fantasy', 'Bian Huan Zi You', 50, ['Leafage'])]);
			const guest = campaign([set('Greninja-Fantasy', 'Bian Huan Zi You', 50, ['Water Gun'])], 'rogueemblemice', 1);
			const foe = () => ({ team: [set('Blissey', 'Natural Cure', 100, ['Splash'])] });
			const state = { encounterId: formatid, team: host.team, boosts: stats(0), bag: {}, balls: [], catchable: false };
			const options = { formatid, seed: [1, 2, 3, 4], fantasyRogue: state, p1: { team: host.team.map(m => m.set) } };
			if (formatid.endsWith('duel')) {
				state.duel = { team: guest.team, boosts: stats(0) };
				options.p2 = { team: guest.team.map(m => m.set) };
			} else if (formatid.endsWith('coop')) {
				Object.assign(state, { persistCoop: true, cooperative: { opponentOffset: 1 }, partner: { team: guest.team, boosts: stats(0) } });
				Object.assign(options, { p2: foe(), p3: { team: guest.team.map(m => m.set) }, p4: foe() });
			} else {
				state.team.push(...guest.team); options.p1.team.push(...guest.team.map(m => m.set));
				options.p2 = { team: [...foe().team, ...foe().team] };
			}
			battle = new Battle(options);
			if (formatid.endsWith('coop')) battle.makeChoices('team 1', 'team 1', 'team 1', 'team 1');
			else if (formatid.endsWith('duel')) battle.makeChoices('team 1', 'team 1');
			const mons = () => [battle.p1.active[0], formatid.endsWith('duel') ? battle.p2.active[0] :
				formatid.endsWith('coop') ? battle.p3.active[0] : battle.p1.active[1]];
			assert.deepEqual(mons().map(m => m.getTypes()), [['Fire', 'Dark'], ['Water', 'Ice']]);
			if (formatid.endsWith('coop')) battle.makeChoices('move 1 1', 'move 1', 'move 1 2', 'move 1');
			else if (formatid.endsWith('duel')) battle.makeChoices('move 1', 'move 1');
			else battle.makeChoices('move 1 1, move 1 2', 'move 1, move 1');
			assert.deepEqual(mons().map(m => m.getTypes()), [['Grass'], ['Water']]);
			restored(); assert.deepEqual(mons().map(m => m.getTypes()), [['Grass'], ['Water']]);
		});
	}
	it('does not apply Rogue metadata in an ordinary Fantasy battle', () => {
		battle = new Battle({ formatid: 'gen9fcag', seed: [1, 2, 3, 4],
			p1: { team: [{ ...set('Greninja', 'Protean', 50, ['Leafage']), fantasyRogueModifiers: { emblem: 'rogueemblemfire' } }] },
			p2: { team: [set('Blissey', 'Natural Cure', 100, ['Splash'])] } });
		battle.makeChoices('team 1', 'team 1');
		assert.deepEqual(battle.p1.active[0].getTypes(), ['Water', 'Dark']);
		turn(); assert.deepEqual(battle.p1.active[0].getTypes(), ['Grass']);
	});
});
