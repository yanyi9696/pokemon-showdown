'use strict';
const assert = require('node:assert/strict');
const { Battle } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { FusionArtwork } = require('../../dist/data/fantasy-rogue/fusion-art');
const { fusionArtwork, fusionArtworkChoices, memberFusionSprite, validFusionSprite } = require('../../dist/sim/rogue-fusion-art');
const { onFantasySwitchIn, onFantasyUpdate } = require('../../dist/data/mods/gen9fantasy/visuals');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { editFusion } = require('../../dist/server/fantasy-rogue/fusion');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { set, stats } = require('../fixtures/fantasy-rogue');
const art = { head: 'pikachu', body: 'charizard', sprite: '25.6-0123456789ab', artist: 'Test fixture',
	source: 'https://example.org/test-fixture', permission: 'Unit-test metadata; no artwork distributed' };

describe('Potara ordered fusion artwork', () => {
	let battle, original;
	beforeEach(() => { original = structuredClone(FusionArtwork); FusionArtwork['pikachu:charizard'] = { ...art }; });
	afterEach(() => {
		battle?.destroy(); battle = null;
		for (const key of Object.keys(FusionArtwork)) delete FusionArtwork[key];
		Object.assign(FusionArtwork, original);
	});
	function run() {
		const r = { id: 'art', floor: 50, phase: 'ready', bag: {}, money: 0, boosts: stats(0), notices: [],
			team: [set('Pikachu', 'Static', 30, ['Thunderbolt']), set('Charizard', 'Blaze', 60, ['Flamethrower'])]
				.map(s => createRoguePokemon(s, stats(0))) };
		syncBlessingParty(r); r.blessings.owned = [{ ...blessing('potara'), floor: 1 }];
		syncBlessingParty(r); return r;
	}
	function fuse(r, appearance = 'fusion') {
		editFusion(r, { action: 'fusion', member: r.team[0].id, value: r.team[1].id,
			fusionAbility: 'blaze', fusionStats: ['hp', 'atk', 'def'], appearance });
	}
	it('uses exact ordered species and preserves regional/Fantasy distinctions', () => {
		assert.equal(fusionArtwork('Pikachu', 'Charizard').sprite, art.sprite);
		assert.equal(fusionArtwork('Charizard', 'Pikachu'), undefined);
		assert.equal(fusionArtwork('Pikachu-Fantasy', 'Charizard'), undefined);
		assert.equal(fusionArtwork('Pikachu', 'Charizard-Mega-X'), undefined);
		FusionArtwork['charizard:pikachu'] = { ...art, head: 'charizard', body: 'pikachu', sprite: '6.25-abcdef012345' };
		assert.equal(fusionArtwork('Charizard', 'Pikachu').sprite, '6.25-abcdef012345');
		const r = run(); assert.equal(fusionArtworkChoices(r.team).length, 2);
		r.team[1].egg = {}; assert.deepEqual(fusionArtworkChoices(r.team), []);
	});
	it('persists a server-chosen image without changing mechanics; unfusion removes it', () => {
		const pictured = run(), legacy = structuredClone(pictured);
		fuse(pictured); fuse(legacy, legacy.team[0].id);
		const mon = pictured.team[0], old = legacy.team[0];
		assert.equal(mon.fusion.sprite, art.sprite); assert.equal(mon.statModifiers.fusion.sprite, art.sprite);
		assert.deepEqual(mon.stats, old.stats); assert.deepEqual(mon.set, old.set);
		assert.deepEqual(mon.fusion.baseStats, old.fusion.baseStats); assert.deepEqual(mon.fusion.types, old.fusion.types);
		assert.equal(memberFusionSprite(JSON.parse(JSON.stringify(mon))), art.sprite);
		editFusion(pictured, { action: 'unfusion', member: mon.id });
		assert.equal(pictured.team.length, 2); assert(!pictured.team.some(p => p.fusion || p.statModifiers?.fusion));
	});
	it('requires explicit fallback for an absent pair and rejects arbitrary URLs or forged images', () => {
		delete FusionArtwork['pikachu:charizard']; const r = run(), before = JSON.stringify(r);
		for (const appearance of ['fusion', 'https://attacker.invalid/a.png', '', undefined]) {
			assert.throws(() => fuse(r, appearance), /外观/); assert.equal(JSON.stringify(r), before);
		}
		fuse(r, r.team[1].id); assert.equal(r.team[0].set.species, 'Charizard'); assert(!r.team[0].fusion.sprite);
		r.team[0].fusion.sprite = art.sprite; assert.equal(memberFusionSprite(r.team[0]), undefined);
	});
	for (const field of ['artist', 'permission', 'source']) it(`excludes incomplete ${field} metadata`, () => {
		FusionArtwork['pikachu:charizard'][field] = ''; assert.equal(fusionArtwork('Pikachu', 'Charizard'), undefined);
	});
	it('only accepts local content-addressed image identifiers', () => {
		for (const value of ['../25.6', 'https://example.org/a', '25.6.png', '25.6-0123456789ab"', null, {}]) assert(!validFusionSprite(value));
		assert(validFusionSprite(art.sprite));
	});
	it('publishes the image at native preview and entry on both sides', () => {
		const r = run(); fuse(r); const mon = r.team[0];
		const s = { ...mon.set, fantasyRogueModifiers: mon.statModifiers };
		battle = new Battle({ format: new Format({ name: 'gen9fantasyrogue', mod: 'gen9fantasy', ruleset: ['Team Preview'],
			onSwitchIn: onFantasySwitchIn, onUpdate: onFantasyUpdate }), seed: [1, 2, 3, 4],
		p1: { team: [s] }, p2: { team: [s] } });
		assert.equal(battle.log.filter(line => line.startsWith('|poke|') && line.includes(`[fusion] ${art.sprite}`)).length, 2);
		battle.makeChoices('team 1', 'team 1');
		assert.equal(battle.log.filter(line => line.includes(`|-roguefusion|`) && line.endsWith(art.sprite)).length, 2);
	});
	it('respects Illusion, Transform, restore and ordinary battle boundaries', () => {
		const s = (species, sprite) => ({ species, ability: 'Pressure', moves: ['Splash'],
			fantasyRogueModifiers: sprite ? { fusion: { baseStats: stats(100), types: ['Normal'], sprite } } : {} });
		battle = new Battle({ format: new Format({ name: 'gen9fantasyrogue', mod: 'gen9fantasy', ruleset: [],
			onSwitchIn: onFantasySwitchIn, onUpdate: onFantasyUpdate }),
		p1: { team: [s('Ditto')] }, p2: { team: [s('Mew', art.sprite)] } });
		const own = battle.p1.active[0], foe = battle.p2.active[0];
		assert(own.transformInto(foe)); onFantasyUpdate.call(battle, own);
		assert(battle.log.at(-1).includes(art.sprite) || battle.log.some(line => line.startsWith('|-roguefusion|p1') && line.endsWith(art.sprite)));
		const restored = Battle.fromJSON(JSON.stringify(battle));
		try { assert.equal(restored.p1.active[0].m.rogueCopiedFusionSprite, art.sprite); } finally { restored.destroy(); }
		own.clearVolatile(); assert.equal(own.m.rogueCopiedFusionSprite, undefined);
		foe.illusion = own; onFantasyUpdate.call(battle, foe);
		assert(battle.log.some(line => /^\|-roguefusion\|p2.*\|$/.test(line)));
		battle.destroy(); battle = new Battle({ format: new Format({ name: 'ordinary', mod: 'gen9fantasy', ruleset: ['Team Preview'],
			onSwitchIn: onFantasySwitchIn, onUpdate: onFantasyUpdate }), p1: { team: [s('Mew', art.sprite)] }, p2: { team: [s('Mew')] } });
		assert(!battle.log.some(line => line.includes('roguefusion') || line.includes('[fusion]')));
		battle.makeChoices('team 1', 'team 1');
		assert(!battle.log.some(line => line.includes('roguefusion') || line.includes('[fusion]')));
	});
});
