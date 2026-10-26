'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { collapseState, collapseDamageKind } = require('../../dist/sim/rogue-collapse');
const { VERSION_THREE_COLLAPSE_ENTRIES: COLLAPSE_ENTRIES } = require('../../dist/sim/rogue-collapse-data');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue collapse: native move and damage interactions', function () {
	this.timeout(30000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function begin(ids, options = {}) {
		battle?.destroy();
		const team = [createRoguePokemon({ ...set('Mew', 'No Guard', 50, ['Splash', 'Tackle', 'Swords Dance', 'Baton Pass']), ...options.player }, stats(0))];
		if (options.playerBench) team.push(createRoguePokemon(set('Mew', 'Synchronize', 50, ['Splash']), stats(0)));
		const foe = { ...set('Blissey', 'Healer', 50, ['Splash', 'Tackle', 'Rest', 'Baton Pass']), ...options.foe };
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'collapse-test', team, boosts: stats(0), bag: {}, balls: [], catchable: true,
				collapse: ids, ...options.rules }, p1: { name: 'Player', team: team.map(m => m.set) },
			p2: { name: 'Enemy', team: options.bench ? [foe, set('Blissey', 'Healer', 50, ['Splash'])] : [foe] } });
		battle.makeChoices('team 1', 'team 1');
		battle.randomizer = n => n;
		return battle.p2.active[0];
	}
	function use(name, enemy = false, extra = {}) {
		const source = (enemy ? battle.p2 : battle.p1).active[0], target = (enemy ? battle.p1 : battle.p2).active[0];
		const move = Object.assign(battle.dex.getActiveMove(name), { willCrit: false, accuracy: true }, extra);
		const hp = target.hp;
		battle.actions.useMove(move, source, { target: move.target === 'self' ? source : target });
		return hp - target.hp;
	}
	it('adapts only after the whole move, once per multihit, separately by actual type', () => {
		const foe = begin(['adaptation']);
		const damage = [];
		for (let i = 0; i < 4; i++) { foe.hp = foe.maxhp; damage.push(use('Water Gun')); }
		assert.deepEqual(damage, damage.map((_, i) => battle.modify(damage[0], 1 - i * 0.05)));
		assert.equal(collapseState(foe).adaptation.Water, 3);
		foe.hp = foe.maxhp;
		use('Double Hit');
		assert.equal(collapseState(foe).adaptation.Normal, 1);
		const lines = battle.log.filter(line => line.startsWith('|-damage|p2a:') && line.includes('/' + foe.maxhp)).slice(-2);
		assert.equal(lines.length, 2);
		const hps = lines.map(line => Number(line.split('|')[3].split('/')[0]));
		assert.equal(foe.maxhp - hps[0], hps[0] - hps[1], 'both hits use the same resistance');
		use('Water Gun', false, { type: 'Fire' });
		assert.equal(collapseState(foe).adaptation.Fire, 1);
	});
	it('power boosts enemy ordinary attacks only, without replacing its ability or fixed damage', () => {
		begin([]); const base = use('Tackle', true);
		const foe = begin(['power']);
		assert.equal(use('Tackle', true), battle.modify(base, 1.2));
		assert.equal(use('Seismic Toss', true), 50);
		assert.equal(foe.ability, 'healer');
		assert.equal(battle.fantasyRogue.collapseMetrics.triggers.power, 1);
	});
	it('vitality increases only enemy HP, heals once below half, and survives reconnect/transform', () => {
		const base = begin([]).maxhp;
		let foe = begin(['vitality']);
		assert.equal(foe.maxhp, Math.floor(base * 1.15));
		assert.equal(foe.m.rogueCollapseBaseHP, base);
		foe.maxhp = 200; foe.hp = 150;
		use('Seismic Toss'); assert.equal(foe.hp, 100); assert(!collapseState(foe).emergencyUsed);
		use('Seismic Toss'); assert.equal(foe.hp, 70); assert(collapseState(foe).emergencyUsed);
		const json = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(json); foe = battle.p2.active[0];
		foe.transformInto(battle.p1.active[0]); assert(collapseState(foe).emergencyUsed);
		use('Seismic Toss'); assert.equal(foe.hp, 20);
	});
	it('vitality cannot rescue multihit knockouts or bypass Heal Block', () => {
		let foe = begin(['vitality']); foe.maxhp = 200; foe.hp = 110;
		use('Substitute', true); assert.equal(foe.hp, 60); assert(!collapseState(foe).emergencyUsed);
		foe.removeVolatile('substitute'); use('Heal Block');
		use('Seismic Toss'); assert.equal(foe.hp, 10); assert(collapseState(foe).emergencyUsed);
		foe = begin(['vitality']); foe.maxhp = 200; foe.hp = 60;
		use('Double Hit', false, {basePower: 100}); assert.equal(foe.hp, 0); assert(!collapseState(foe).emergencyUsed);
	});
	it('steadfast saves full HP once, includes fixed/OHKO, but never stops the second hit', () => {
		for (const name of ['Seismic Toss', 'Fissure']) {
			const foe = begin(['steadfast'], {foe: {species: 'Magikarp', level: 5}});
			use(name); assert.equal(foe.hp, 1); assert(collapseState(foe).steadfastUsed);
			foe.hp = foe.maxhp; use(name); assert.equal(foe.hp, 0);
		}
		let foe = begin(['steadfast'], {foe: {species: 'Magikarp', level: 5}});
		use('Double Hit'); assert.equal(foe.hp, 0); assert(collapseState(foe).steadfastUsed);
		foe = begin(['steadfast']); battle.damage(foe.hp, foe, foe, battle.dex.conditions.get('confused'));
		assert.equal(foe.hp, 0); assert(!collapseState(foe).steadfastUsed);
	});
	it('native Sash and Sturdy preserve steadfast and switching never replenishes it', () => {
		for (const item of ['Focus Sash', '']) {
			const foe = begin(['steadfast'], {bench: true, foe: {species: 'Geodude', level: 5, item, ability: item ? 'Rock Head' : 'Sturdy'}});
			use('Surf'); assert.equal(foe.hp, 1); assert(!collapseState(foe).steadfastUsed);
			foe.hp = foe.maxhp; foe.setAbility('Rock Head');
			use('Surf'); assert(collapseState(foe).steadfastUsed);
			battle.makeChoices('move 1', 'switch 2'); battle.makeChoices('move 1', 'switch 2');
			assert(collapseState(foe).steadfastUsed);
		}
	});
	it('cleanse shares one shield between status and actual opponent stat drops', () => {
		let foe = begin(['cleanse']); use('Growl'); assert.equal(foe.boosts.atk, 0); assert(collapseState(foe).shieldUsed);
		use('Toxic'); assert.equal(foe.status, 'tox');
		foe = begin(['cleanse']); use('Yawn'); assert(!foe.volatiles.yawn); use('Growl'); assert.equal(foe.boosts.atk, -1);
		foe = begin(['cleanse']);
		battle.boost({atk: -1, spa: 1}, foe, battle.p1.active[0]); assert.equal(foe.boosts.atk, 0); assert.equal(foe.boosts.spa, 1);
	});
	it('cleanse does not spend on Clear Body, Contrary raises, caps, self drops, or fire immunity', () => {
		for (const ability of ['Clear Body', 'Contrary']) {
			const foe = begin(['cleanse'], {foe: {ability}}); use('Growl'); assert(!collapseState(foe).shieldUsed, ability);
		}
		let foe = begin(['cleanse']); foe.boosts.atk = -6; use('Growl'); assert(!collapseState(foe).shieldUsed);
		battle.boost({def: -1}, foe, foe); assert(!collapseState(foe).shieldUsed);
		foe = begin(['cleanse'], {foe: {species: 'Charizard'}}); use('Will-O-Wisp'); assert(!collapseState(foe).shieldUsed);
	});
	it('does not adapt to substitutes, immunity, Protect, fixed damage or OHKO', () => {
		let foe = begin(['adaptation']);
		use('Substitute', true); use('Water Gun');
		assert.deepEqual(collapseState(foe).adaptation, {});
		foe.removeVolatile('substitute');
		foe.addVolatile('protect', foe); use('Water Gun'); foe.removeVolatile('protect');
		assert.deepEqual(collapseState(foe).adaptation, {});
		assert.equal(use('Seismic Toss'), 50);
		assert.deepEqual(collapseState(foe).adaptation, {});
		foe = begin(['adaptation'], { foe: { species: 'Gastly', ability: 'Levitate' } });
		use('Tackle'); assert.deepEqual(collapseState(foe).adaptation, {});
	});
	it('preserves adaptation and once-per-battle counters over switching and serialization', () => {
		let foe = begin(['adaptation', 'statusshield', 'readiness'], { bench: true });
		use('Water Gun'); use('Toxic');
		battle.makeChoices('move 1', 'switch 2'); battle.makeChoices('move 1', 'switch 2');
		assert.equal(battle.p2.active[0], foe);
		assert.equal(collapseState(foe).adaptation.Water, 1);
		assert.equal(collapseState(foe).shieldUsed, true);
		const saved = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(saved);
		foe = battle.p2.active[0];
		assert.equal(collapseState(foe).adaptation.Water, 1); assert(collapseState(foe).shieldUsed);
		use('Toxic'); assert.equal(foe.status, 'tox');
	});
	for (const [species, ability, move, terrain] of [
		['Charizard', 'Blaze', 'Will-O-Wisp'], ['Weepinbell', 'Chlorophyll', 'Sleep Powder'],
		['Blissey', 'Insomnia', 'Spore'], ['Blissey', 'Healer', 'Spore', 'electricterrain'],
		['Blissey', 'Own Tempo', 'Confuse Ray'], ['Blissey', 'Healer', 'Yawn', 'electricterrain'],
	]) it(`does not spend a shield on native immunity: ${species}/${ability}/${move}/${terrain}`, () => {
		const foe = begin(['statusshield'], { foe: { species, ability } });
		if (terrain) battle.field.setTerrain(terrain, battle.p1.active[0]);
		use(move); assert.equal(collapseState(foe).shieldUsed, false);
	});
	it('blocks Yawn at drowsiness and blocks no later effects after the shield is spent', () => {
		const foe = begin(['statusshield']);
		use('Yawn'); assert(!foe.volatiles.yawn); assert(collapseState(foe).shieldUsed);
		use('Confuse Ray'); assert(foe.volatiles.confusion);
	});
	it('blocks player Toxic Spikes once, but does not spend a shield on self fatigue', () => {
		const foe = begin(['statusshield'], { bench: true });
		foe.addVolatile('confusion', foe, battle.dex.conditions.get('lockedmove'));
		assert(foe.volatiles.confusion); assert(!collapseState(foe).shieldUsed);
		foe.removeVolatile('confusion');
		use('Toxic Spikes'); battle.makeChoices('move 1', 'switch 2');
		const entrant = battle.p2.active[0];
		assert(collapseState(entrant).shieldUsed); assert.equal(entrant.status, '');
		assert(!battle.log.some(line => line.startsWith('|-status|p2a:')));
	});
	it('ignores Rest, self item status, missed status moves, Substitute and preexisting status', () => {
		const foe = begin(['statusshield'], { player: { ability: 'Synchronize' } });
		foe.hp -= 20; use('Rest', true);
		assert.equal(foe.status, 'slp'); assert(!collapseState(foe).shieldUsed);
		foe.cureStatus(); foe.setStatus('brn', foe, battle.dex.items.get('flameorb')); assert(!collapseState(foe).shieldUsed);
		use('Toxic'); assert(!collapseState(foe).shieldUsed); foe.cureStatus();
		use('Toxic', false, { accuracy: 0 }); assert(!collapseState(foe).shieldUsed);
		use('Substitute', true); use('Toxic'); assert(!collapseState(foe).shieldUsed);
	});
	it('blocks only attachment effects while preserving Salt Cure and Fire Spin initial damage', () => {
		const foe = begin(['attachment']);
		assert(use('Salt Cure') > 0); assert(!foe.volatiles.saltcure);
		assert(use('Fire Spin') > 0); assert(!foe.volatiles.partiallytrapped);
		use('Leech Seed'); assert(!foe.volatiles.leechseed);
		use('Taunt'); assert(foe.volatiles.taunt);
		use('Toxic'); assert.equal(foe.status, 'tox');
	});
	it('discounts external indirect damage, leaves fixed damage and self costs intact, and drains actual loss', () => {
		const foe = begin(['erosion']); const player = battle.p1.active[0];
		for (const id of ['psn', 'tox', 'brn', 'sandstorm', 'spikes', 'saltcure', 'curse', 'roughskin', 'rockyhelmet']) {
			foe.hp = foe.maxhp;
			assert.equal(battle.damage(40, foe, player, battle.dex.conditions.get(id)), 20, id);
		}
		for (const id of ['recoil', 'lifeorb', 'strugglerecoil', 'confusion']) {
			assert.notEqual(collapseDamageKind(battle.dex.conditions.get(id), foe, foe), 'external');
			foe.hp = foe.maxhp; assert.equal(battle.damage(40, foe, foe, battle.dex.conditions.get(id)), 40, id);
		}
		foe.hp = foe.maxhp; assert.equal(use('Seismic Toss'), 50);
		use('Leech Seed'); player.hp = 100; const before = foe.hp;
		battle.singleEvent('Residual', foe.getVolatile('leechseed'), foe.volatiles.leechseed, foe);
		assert.equal(player.hp - 100, before - foe.hp);
	});
	it('emergency recovery uses a strict threshold and consumes blocked healing', () => {
		let foe = begin(['emergency']); foe.maxhp = 200; foe.hp = 150;
		use('Seismic Toss'); assert.equal(foe.hp, 100); assert(!collapseState(foe).emergencyUsed);
		use('Seismic Toss'); assert.equal(foe.hp, 90); assert(collapseState(foe).emergencyUsed);
		assert(battle.log.some(line => line.startsWith('|-heal|') && line.includes('[from] Rogue Emergency')));
		foe = begin(['emergency']); foe.maxhp = 200; foe.hp = 140;
		use('Heal Block');
		use('Seismic Toss'); assert.equal(foe.hp, 90); assert(collapseState(foe).emergencyUsed);
		foe.removeVolatile('healblock'); battle.damage(1, foe, battle.p1.active[0], battle.dex.conditions.get('psn'));
		assert.equal(foe.hp, 89);
	});
	it('does not rescue a multihit KO or trigger on HP payments; indirect damage can trigger', () => {
		let foe = begin(['emergency']); foe.maxhp = 200; foe.hp = 110;
		use('Substitute', true); assert.equal(foe.hp, 60); assert(!collapseState(foe).emergencyUsed);
		foe.removeVolatile('substitute');
		battle.damage(1, foe, battle.p1.active[0], battle.dex.conditions.get('psn'));
		assert.equal(foe.hp, 99);
		foe = begin(['emergency']); foe.maxhp = 200; foe.hp = 60;
		use('Double Hit', false, { basePower: 55 });
		assert.equal(foe.hp, 0); assert(!collapseState(foe).emergencyUsed);
		foe = begin(['emergency']); foe.maxhp = 200; foe.hp = 160;
		use('Belly Drum', true); assert.equal(foe.hp, 60); assert(!collapseState(foe).emergencyUsed);
	});
	it('counts active end turns across switching and clears only negative boosts', () => {
		const foe = begin(['readiness'], { bench: true });
		foe.boosts.atk = -2; foe.boosts.spa = 2;
		battle.makeChoices('move 1', 'move 1');
		battle.makeChoices('move 1', 'switch 2');
		assert.equal(collapseState(foe).activeTurns, 1, battle.log.join('\n'));
		battle.makeChoices('move 1', 'switch 2');
		foe.boosts.atk = -2; foe.boosts.spa = 2;
		battle.makeChoices('move 1', 'move 1');
		assert.equal(foe.boosts.atk, 0); assert.equal(foe.boosts.spa, 2);
	});
	it('reduces base critical bonus while keeping critical boost bypass and blocks OHKO flags', () => {
		const foe = begin(['critical']); foe.boosts.def = 6; battle.p1.active[0].boosts.atk = -6;
		const first = use('Tackle', false, { willCrit: true }); foe.hp = foe.maxhp;
		foe.boosts.def = 0; battle.p1.active[0].boosts.atk = 0;
		assert.equal(use('Tackle', false, { willCrit: true }), first);
		const hp = foe.hp; use('Fissure'); assert.equal(foe.hp, hp);
		battle.fantasyRogue.collapse = []; foe.hp = foe.maxhp;
		const full = use('Tackle', false, { willCrit: true }); assert(Math.abs(first / full - 1.25 / 1.5) < 0.03);
	});
	it('retains Sniper and multiplies independent defensive modifiers', () => {
		const foe = begin(['critical', 'adaptation'], { player: { ability: 'Sniper' }, foe: { ability: 'Filter' } });
		collapseState(foe).adaptation.Fighting = 3;
		const reduced = use('Karate Chop', false, { willCrit: true }); foe.hp = foe.maxhp;
		foe.setAbility('Healer'); const noFilter = use('Karate Chop', false, { willCrit: true }); foe.hp = foe.maxhp;
		assert(Math.abs(reduced / noFilter - 0.75) < 0.04);
		battle.p1.active[0].setAbility('No Guard'); const noSniper = use('Karate Chop', false, { willCrit: true });
		assert(Math.abs(noFilter / noSniper - 1.5) < 0.06);
	});
	for (const [weather, name, enemy, factor] of [['raindance', 'Water Gun', false, 1.25 / 1.5],
		['raindance', 'Ember', true, 0.75 / 0.5], ['sunnyday', 'Ember', true, 1]]) {
		it(`adjusts only unfavorable environment factors: ${weather}/${name}/${enemy}`, () => {
			const foe = begin(['environment']); battle.field.setWeather(weather, battle.p1.active[0]);
			const target = enemy ? battle.p1.active[0] : foe;
			const adapted = use(name, enemy); target.hp = target.maxhp;
			battle.fantasyRogue.collapse = []; const original = use(name, enemy);
			assert(Math.abs(adapted - original * factor) < 3, `${adapted}/${original}`);
		});
	}
	it('preserves primal-weather failures, terrain status immunity, and favorable environment bonuses', () => {
		const foe = begin(['environment', 'statusshield']); battle.field.setWeather('primordialsea');
		assert.equal(use('Ember', true), 0);
		battle.field.setTerrain('electricterrain', battle.p1.active[0]); use('Spore'); assert(!collapseState(foe).shieldUsed);
	});
	for (const [terrain, move, enemy, ratio] of [['electricterrain', 'Thunder Shock', false, 1.15 / 1.3],
		['mistyterrain', 'Dragon Breath', true, 0.75 / 0.5], ['grassyterrain', 'Earthquake', true, 0.75 / 0.5]]) {
		it(`adapts the individual terrain factor ${terrain}/${move}`, () => {
			const foe = begin(['environment']); battle.field.setTerrain(terrain, battle.p1.active[0]);
			const target = enemy ? battle.p1.active[0] : foe;
			const adapted = use(move, enemy); target.hp = target.maxhp;
			battle.fantasyRogue.collapse = []; const original = use(move, enemy);
			assert(Math.abs(adapted - original * ratio) < 3, `${adapted}/${original}`);
		});
	}
	it('adds percentage points before Serene Grace and never recreates Sheer Force effects', () => {
		begin(['secondary'], { foe: { ability: 'Serene Grace' } }); use('Flamethrower', true);
		assert.equal(battle.p2.active[0].lastMoveUsed.secondaries[0].chance, 30);
		begin(['secondary'], { foe: { ability: 'Sheer Force' } }); use('Flamethrower', true);
		assert(!battle.p2.active[0].lastMoveUsed.secondaries);
		begin(['secondary']); use('Ancient Power', true);
		assert.equal(battle.p2.active[0].lastMoveUsed.secondaries[0].chance, 15);
		use('Close Combat', true); assert.deepEqual(battle.p2.active[0].lastMoveUsed.self.boosts, { def: -1, spd: -1 });
		use('Tri Attack', true); assert.equal(battle.p2.active[0].lastMoveUsed.secondaries[0].chance, 15);
		begin(['secondary'], { foe: { ability: 'Serene Grace' } }); use('Sacred Fire', true);
		assert.equal(battle.p2.active[0].lastMoveUsed.secondaries[0].chance, 100);
	});
	it('counts actual secondary effects and does not boost unrelated callback chances', () => {
		begin(['secondary']); battle.random = n => n === 100 ? 12 : 0;
		use('Ember', true); assert.equal(battle.p1.active[0].status, 'brn');
		assert.equal(battle.fantasyRogue.collapseMetrics.triggers.secondary, 1);
		use('Ember', true); assert.equal(battle.fantasyRogue.collapseMetrics.triggers.secondary, 1);
		use('Tackle', true, { secondaries: [{ chance: 10, onHit() {} }] });
		assert.equal(battle.p2.active[0].lastMoveUsed.secondaries[0].chance, 10);
	});
	for (const protect of [{ ability: 'Shield Dust' }, { item: 'Covert Cloak' }]) it(`respects secondary protection ${JSON.stringify(protect)}`, () => {
		begin(['secondary'], { player: protect }); use('Nuzzle', true); assert.equal(battle.p1.active[0].status, '');
	});
	it('arms vigilance only when the positive portion increases; misses and fixed damage do not spend it', () => {
		const foe = begin(['vigilance'], { foe: { ability: 'Healer' }, player: { ability: 'Synchronize' } });
		const p = battle.p1.active[0]; p.boosts.atk = -2;
		use('Swords Dance'); assert(!collapseState(foe).vigilance);
		use('Swords Dance'); assert(collapseState(foe).vigilance); use('Swords Dance');
		use('Tackle', true, { accuracy: 0 }); assert(collapseState(foe).vigilance);
		use('Seismic Toss', true); assert(collapseState(foe).vigilance);
		p.addVolatile('protect', p); use('Tackle', true);
		assert(collapseState(foe).vigilance); p.removeVolatile('protect');
		p.hp = p.maxhp; use('Substitute'); use('Double Hit', true);
		assert(!collapseState(foe).vigilance); assert.equal(battle.fantasyRogue.collapseMetrics.triggers.vigilance, 1);
	});
	it('rearms on Baton Pass, clears on switching out and never grants a flag just for switching in', () => {
		const foe = begin(['vigilance'], { playerBench: true, bench: true });
		use('Swords Dance'); use('Tackle', true); assert(!collapseState(foe).vigilance);
		battle.makeChoices('move 4', 'move 1'); battle.makeChoices('switch 2', '');
		assert.equal(battle.p1.active[0].boosts.atk, 2); assert(collapseState(foe).vigilance);
		battle.makeChoices('move 1', 'switch 2'); assert(!collapseState(foe).vigilance);
		assert(!collapseState(battle.p2.active[0]).vigilance);
	});
	it('applies one 25% vigilance bonus to every hit of a move, then spends it once', () => {
		const foe = begin(['vigilance']); const p = battle.p1.active[0];
		const base = use('Double Hit', true); p.hp = p.maxhp;
		use('Swords Dance'); use('Swords Dance'); const boosted = use('Double Hit', true);
		assert(Math.abs(boosted / base - 1.25) < 0.06);
		assert.equal(battle.fantasyRogue.collapseMetrics.triggers.vigilance, 1);
		assert(!collapseState(foe).vigilance);
	});
	it('reserves vigilance gained from Weak Armor during an attack for the next entire move', () => {
		const foe = begin(['vigilance'], { player: { ability: 'Weak Armor' } });
		use('Double Hit', true);
		assert(battle.p1.active[0].boosts.spe > 0); assert(collapseState(foe).vigilance);
		assert(!battle.fantasyRogue.collapseMetrics?.triggers.vigilance);
		use('Tackle', true); assert(!collapseState(foe).vigilance);
	});
	it('does not grant enemy rules to a transformed player and keeps once-only state on boss phase change', () => {
		const foe = begin(['statusshield', 'emergency'], { foe: { species: 'Arceus', ability: 'Multitype' },
			rules: { boss: { kind: 'arceus', arceusMoves: Object.fromEntries(require('../../dist/sim/rogue-bosses').ARCEUS_LIFE_TYPES.map(t => [t, 'Judgment'])) } } });
		use('Toxic'); assert(collapseState(foe).shieldUsed);
		collapseState(foe).emergencyUsed = true;
		use('Transform'); assert(!battle.p1.active[0].m.rogueCollapse);
		foe.hp = 1; use('Tackle'); battle.faintMessages();
		assert(foe.hp > 0); assert(collapseState(foe).shieldUsed); assert(collapseState(foe).emergencyUsed);
	});
	it('applies the same rules to both enemy sides in co-op, including an entire spread attack', () => {
		const saved = createRoguePokemon(set('Mew', 'No Guard', 50, ['Splash']), stats(0));
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'coop-collapse', team: [saved], boosts: stats(0), bag: {}, balls: [], catchable: false,
				cooperative: { opponentOffset: 1 }, collapse: ['vigilance', 'statusshield', 'adaptation'] },
			p1: { name: 'Player', team: [saved.set] }, p2: { name: 'Enemy', team: [set('Blissey', 'Healer', 50, ['Rock Slide'])] },
			p3: { name: 'Ally', team: [set('Mew', 'No Guard', 50, ['Splash'])] },
			p4: { name: 'Enemy Two', team: [set('Blissey', 'Healer', 50, ['Splash'])] } });
		battle.makeChoices('team 1', 'team 1', 'team 1', 'team 1'); battle.randomizer = n => n;
		const p = battle.p1.active[0], ally = battle.p3.active[0], foe = battle.p2.active[0], foe2 = battle.p4.active[0];
		use('Rock Slide', true); const base = [p.maxhp - p.hp, ally.maxhp - ally.hp];
		p.hp = p.maxhp; ally.hp = ally.maxhp;
		battle.boost({ atk: 1 }, ally, ally); assert(collapseState(foe).vigilance); assert(collapseState(foe2).vigilance);
		use('Rock Slide', true);
		for (const [i, mon] of [p, ally].entries()) assert(Math.abs((mon.maxhp - mon.hp) / base[i] - 1.25) < 0.06);
		assert(!collapseState(foe).vigilance); assert(collapseState(foe2).vigilance);
		assert.equal(foe2.trySetStatus('tox', ally), false); assert(collapseState(foe2).shieldUsed);
		assert(!ally.m.rogueCollapse);
		battle.actions.useMove('Water Gun', foe, { target: foe2 });
		assert.equal(collapseState(foe2).adaptation.Water, 1, 'ordinary friendly fire also teaches the defender its type');
	});
	it('can finish a native battle with all ten rules after serializing and reconnecting', () => {
		begin(COLLAPSE_ENTRIES.map(e => e.id), { foe: { species: 'Magikarp', ability: 'Swift Swim', level: 5 },
			player: { moves: ['Thunderbolt', 'Splash'] } });
		const saved = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(saved);
		battle.makeChoices('move 1', 'move 1');
		assert.equal(battle.p2.active[0].hp, 1 + Math.floor(battle.p2.active[0].maxhp / 10), 'steadfast then vitality rescue the first hit');
		battle.makeChoices('move 1', 'move 1');
		assert(battle.ended); assert.equal(battle.winner, 'Player');
		assert.equal(battle.fantasyRogue.collapse.length, 10);
	});
	it('allows both Primarina formes to use their signature Z but not unrelated species', () => {
		for (const species of ['Primarina', 'Primarina-Fantasy', 'Mew']) {
			begin([], { player: { species, item: 'Primarium Z', moves: ['Sparkling Aria'], ability: 'Torrent' }, rules: { systems: { player: { z: true } } } });
			const p = battle.p1.active[0];
			const z = battle.actions.canZMove(p);
			assert.equal(!!z, species !== 'Mew', species);
			if (z) assert.equal(z[0].move, 'Oceanic Operetta');
		}
	});
	it('uses the Fantasy Primarina exclusive Z in an actual Rogue turn when Z is unlocked', () => {
		begin([], { player: { species: 'Primarina-Fantasy', item: 'Primarium Z', moves: ['Sparkling Aria'], ability: 'Torrent' },
			rules: { systems: { player: { mega: false, z: true } } } });
		battle.makeChoices('move 1 zmove', 'move 1');
		assert(battle.p1.zMoveUsed); assert(battle.log.some(line => line.includes('|Oceanic Operetta|')));
	});
});
