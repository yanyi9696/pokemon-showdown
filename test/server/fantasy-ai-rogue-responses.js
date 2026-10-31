'use strict';
const assert = require('assert').strict;
const { Battle, Dex } = require('../../dist/sim');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { emergencyChoice } = require('../../dist/server/fantasy-ai/fallback');
const { makeEncounterSet } = require('../../dist/server/fantasy-rogue/encounter-sets');
const { createRoguePokemon, levelMoves } = require('../../dist/server/fantasy-rogue/progression');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue public-evidence responses', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function start(player, enemies) {
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [11, 22, 33, 44],
			fantasyRogue: { encounterId: 'responses', team: [createRoguePokemon(player, stats(0))], boosts: stats(0), bag: {}, balls: [], catchable: false },
			p1: { team: [player] }, p2: { team: enemies } });
		battle.makeChoices('team 1', 'team 1');
		battle.randomizer = n => n;
	}
	function choice() {
		const view = new InformationView({ ownSide: 'p2', difficulty: 'normal' });
		view.receiveUpdate(battle.log.join('\n'));
		const observation = view.observe(battle.p2.activeRequest);
		assert.equal(observation.opponentMove, undefined);
		assert.equal(observation.fullState, undefined);
		return emergencyChoice(observation, 'gen9fantasyrogue', [], true, true, true);
	}
	it('replaces a fainted member with a counter instead of the next weak roster member', () => {
		start(set('Charizard', 'Blaze', 80, ['Flamethrower']), [
			set('Scizor', 'Swarm', 80, ['Splash']), set('Venusaur', 'Overgrow', 80, ['Energy Ball']),
			set('Swampert', 'Torrent', 80, ['Surf']),
		]);
		battle.makeChoices('move 1', 'move 1');
		assert(battle.p2.activeRequest.forceSwitch);
		assert.equal(choice(), 'switch 3');
	});
	it('switches into a surviving counter after the opponent reveals a dangerous attack', () => {
		start(set('Charizard', 'Blaze', 80, ['Flamethrower']), [
			set('Scizor', 'Swarm', 80, ['Protect', 'Bullet Punch']), set('Swampert', 'Torrent', 80, ['Surf']),
		]);
		battle.makeChoices('move 1', 'move 1');
		assert.equal(choice(), 'switch 2');
	});
	it('does not choose a slower heal when the revealed attack will knock it out first', () => {
		start(set('Terrakion', 'Justified', 80, ['Close Combat']), [set('Blissey', 'Natural Cure', 80, ['Protect', 'Soft-Boiled', 'Seismic Toss'])]);
		battle.makeChoices('move 1', 'move 1');
		const own = battle.p2.active[0];
		battle.damage(Math.floor(own.maxhp * 0.75), own, battle.p1.active[0], battle.dex.moves.get('seismictoss'));
		battle.makeRequest('move');
		assert.equal(choice(), 'move 3');
	});
	it('answers revealed setup with Haze instead of another ineffective attack', () => {
		start(set('Gyarados', 'Intimidate', 80, ['Dragon Dance']), [set('Toxapex', 'Limber', 80, ['Splash', 'Haze', 'Surf'])]);
		battle.makeChoices('move 1', 'move 1');
		assert.equal(choice(), 'move 2');
	});
	it('prefers a reliable knockout over switching, healing or setup', () => {
		start(set('Charizard', 'Blaze', 80, ['Flamethrower']), [
			set('Scizor', 'Technician', 80, ['Protect', 'Bullet Punch', 'Swords Dance']), set('Swampert', 'Torrent', 80, ['Surf']),
		]);
		battle.makeChoices('move 1', 'move 1');
		const foe = battle.p1.active[0];
		battle.damage(foe.maxhp - 1, foe, battle.p2.active[0], battle.dex.moves.get('seismictoss'));
		battle.makeRequest('move');
		assert.equal(choice(), 'move 2');
	});
	it('chooses varied level-legal attacks suited to the wild species without teaching future moves', () => {
		const dex = Dex.mod('gen9fantasy');
		for (const name of ['Machamp', 'Alakazam', 'Charizard', 'Gyarados', 'Pikachu', 'Snorlax', 'Scizor', 'Munna']) {
			for (const level of [10, 25, 50, 100]) {
				const generated = makeEncounterSet(name, level);
				const legal = new Set(levelMoves(name).filter(m => m.level <= level).map(m => m.move));
				assert.equal(new Set(generated.moves).size, generated.moves.length);
				assert(generated.moves.every(m => legal.has(m)), `${name} Lv.${level}: ${generated.moves}`);
				assert(dex.moves.get(generated.moves[0]).category !== 'Status', name);
			}
		}
		assert.equal(dex.moves.get(makeEncounterSet('Machamp', 50).moves[0]).category, 'Physical');
		assert.equal(dex.moves.get(makeEncounterSet('Alakazam', 50).moves[0]).category, 'Special');
		assert(!makeEncounterSet('Charizard', 100).moves.includes('growl'));
	});
});
