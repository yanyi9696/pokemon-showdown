'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { Dex, toID } = require('../../dist/sim/dex');
const { Teams } = require('../../dist/sim/teams');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent, PreviewBalance } = require('../../dist/server/fantasy-rogue/preview-content');
const { TrainerBossData } = require('../../dist/server/fantasy-rogue/trainer-boss-data');
const { trainerBossCandidates, rogueOpponentAvatar } = require('../../dist/server/fantasy-rogue/trainer-bosses');
const { validateContent } = require('../../dist/server/fantasy-rogue/content');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue authored trainers', function () {
	this.timeout(20000);
	let content, store, engine;
	const user = 'trainerqa';
	const account = () => store.get(user);
	const command = (action, data = {}) => engine.command(user, {
		id: randomUUID(), revision: account().revision, action, ...data,
	});
	function enter(floor) {
		store.change(user, saved => {
			saved.run.floor = floor - 1; saved.run.phase = 'rest';
			saved.run.node = structuredClone(content.floors[floor - 1][0]);
		});
		command('continue');
		return account().run.node.encounters[0];
	}
	before(() => { content = createPreviewContent(); });
	beforeEach(() => {
		store = new RogueStore(':memory:');
		engine = new RogueEngine(store, content, () => 0);
		command('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());

	it('loads all 80 gym, 6 Elite Four and 1 champion rosters into native battles without rewriting authored choices', () => {
		assert.equal(TrainerBossData.length, 87);
		const dex = Dex.mod('gen9fantasy');
		for (const source of TrainerBossData) {
			const floor = source.floor || (source.role === 'elitefour' ? 165 : 190);
			const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor)).find(entry => entry.trainer.id === source.id);
			assert(candidate, source.name);
			const original = Teams.import(source.team);
			assert.equal(candidate.team.length, original.length);
			const members = [createRoguePokemon(set('Blissey', 'Natural Cure', 100, ['Protect']), stats(0), 'qa')];
			const battle = new Battle({
				formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
				fantasyRogue: { encounterId: 'qa', team: members, boosts: stats(0), bag: {}, balls: [], catchable: false,
					tera: { player: false, opponent: true } },
				p1: { name: 'Player', team: Teams.pack(members.map(mon => mon.set)) },
				p2: { name: source.name, team: Teams.pack(candidate.team) },
			});
			try {
				battle.choose('p1', 'team 1');
				battle.choose('p2', 'team ' + original.map((mon, index) => index + 1).join(''));
				for (const [index, mon] of battle.p2.pokemon.entries()) {
					const authored = original[index];
					const species = dex.species.get(authored.species);
					assert.equal(mon.species.name, species.forme.includes('Mega') ? species.battleOnly : species.name);
					assert.equal(mon.level, PreviewBalance.bossLevel(floor));
					assert.equal(mon.baseAbility, toID(authored.ability));
					assert.equal(mon.item, toID(authored.item));
					assert.deepEqual(mon.baseMoves, authored.moves.map(toID));
					assert.deepEqual(mon.set.evs, authored.evs);
					assert.deepEqual(mon.set.ivs, authored.ivs);
					assert.equal(mon.set.nature, authored.nature || 'Hardy');
					if (authored.gender) assert.equal(mon.gender, authored.gender);
					if (authored.happiness !== undefined) assert.equal(mon.happiness, authored.happiness);
					if (authored.teraType) assert.equal(mon.teraType, authored.teraType);
				}
				assert(!battle.p1.activeRequest.active[0].canTerastallize);
				battle.choose('p1', 'move 1');
				assert(battle.choose('p2', 'move 1'), `${source.id} ${floor}`);
				assert(battle.turn >= 2 || battle.ended);
			} finally { battle.destroy(); }
		}
	});
	it('uses the complete replacement for Sabrina floor 100 Espathra', () => {
		const mon = trainerBossCandidates(100, 55).find(entry => entry.trainer.id === 'sabrina').team
			.find(entry => entry.species === 'Espathra');
		assert.equal(mon.ability, 'Speed Boost'); assert.equal(mon.item, 'Leftovers');
		assert.equal(mon.nature, 'Bold'); assert.equal(mon.ivs.atk, 0); assert.equal(mon.teraType, 'Fairy');
		assert.deepEqual(mon.moves, ['Calm Mind', 'Stored Power', 'Dazzling Gleam', 'Roost']);
		assert.deepEqual(mon.evs, { hp: 152, atk: 0, def: 244, spa: 0, spd: 0, spe: 112 });
	});
	it('allows every authored Mega and G-Mega forme to transform through its normal battle trigger', () => {
		const seen = new Set();
		for (const source of TrainerBossData) {
			const floor = source.floor || (source.role === 'elitefour' ? 165 : 190);
			const team = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor)).find(entry => entry.trainer.id === source.id).team;
			for (const [index, authored] of Teams.import(source.team).entries()) {
				const target = Dex.mod('gen9fantasy').species.get(authored.species);
				if (!target.forme.includes('Mega') || seen.has(target.id)) continue;
				seen.add(target.id);
				const members = [createRoguePokemon(set('Blissey', 'Natural Cure', 100, ['Splash']), stats(0), 'qa')];
				const battle = new Battle({
					formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
					fantasyRogue: { encounterId: 'qa', team: members, boosts: stats(0), bag: {}, balls: [], catchable: false },
					p1: { name: 'Player', team: Teams.pack(members.map(mon => mon.set)) },
					p2: { name: source.name, team: Teams.pack([team[index]]) },
				});
				try {
					battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
					const mon = battle.p2.active[0];
					assert.notEqual(mon.species.id, target.id);
					battle.choose('p1', 'move 1');
					assert(battle.choose('p2', `move 1${mon.canMegaEvo ? ' mega' : ''}`), target.name);
					assert.equal(mon.species.id, target.id, target.name);
				} finally { battle.destroy(); }
			}
		}
		assert.equal(seen.size, 15);
	});
	it('draws eight distinct gym leaders and persists their team and portrait through defeat, retreat and reload', () => {
		const met = [];
		for (const floor of [20, 40, 60, 80, 100, 120, 140, 160]) {
			const encounter = enter(floor);
			met.push(encounter.trainer.id);
			assert(!encounter.trainerCandidates);
			assert.equal(rogueOpponentAvatar(account().run), encounter.trainer.id);
			command('battle');
			assert.deepEqual(engine.battleState(user).tera, { player: false, opponent: true });
			const run = account().run;
			engine.settle(user, run.battle.token, { encounterId: run.battle.encounterId, won: false, team: run.team, bag: run.bag });
			engine = new RogueEngine(store, content, () => { throw Error('unexpected reroll'); });
			command('battle'); command('retreat');
			engine.recover(user, account().run.battle.token);
			assert.deepEqual(account().run.node.encounters[0], encounter);
			engine = new RogueEngine(store, content, () => 0);
		}
		assert.equal(new Set(met).size, 8);
		assert.deepEqual(account().run.trainerHistory.gyms, met);
	});
	it('guarantees triggered hidden Elite Four, excludes untriggered ones, and fills four unique random slots', () => {
		for (const gyms of [[], ['larry'], ['acerola'], ['larry', 'acerola']]) {
			store.change(user, saved => { saved.run.trainerHistory = { gyms, eliteFour: [] }; });
			const met = [];
			for (const floor of [165, 175, 180, 185]) met.push(enter(floor).trainer.id);
			assert.equal(new Set(met).size, 4);
			for (const hidden of ['larry', 'acerola']) assert.equal(met.includes(hidden), gyms.includes(hidden));
			const expected = account().run.trainerHistory.elitePlan;
			assert.deepEqual(Object.values(expected), met);
			assert.equal(enter(190).trainer.id, 'steven', 'Lance champion rule is deliberately not enabled');
		}
	});
	it('keeps legacy selected rosters intact and infers only past fixed gym identities', () => {
		const oldNode = structuredClone(content.floors[10][0]);
		delete oldNode.encounters[0].candidates;
		store.change(user, saved => {
			delete saved.run.trainerHistory;
			Object.assign(saved.run, { contentVersion: 'preview-2026-10-v5', floor: 10, node: oldNode, phase: 'ready' });
		});
		engine.migrate(user);
		assert.deepEqual(account().run.node, oldNode);
		enter(40);
		assert(account().run.trainerHistory.gyms.includes('brock'));
		assert(!account().run.trainerHistory.gyms.includes('misty'));
		assert.notEqual(account().run.node.encounters[0].trainer.id, 'brock');
	});
	it('uses female or neutral/male silhouettes for all trainerless nodes, including uncatchable bosses', () => {
		for (const [kind, floor] of [['wild', 1], ['elite', 6], ['boss', 10], ['boss', 200]]) {
			for (const [gender, avatar] of [['F', 'unknownf'], ['M', 'unknown'], ['N', 'unknown']]) {
				const run = { floor, encounter: 0, node: { kind, encounters: [{ team: [{ species: 'Pikachu', gender }] }] } };
				assert.equal(rogueOpponentAvatar(run), avatar);
			}
		}
		assert.equal(rogueOpponentAvatar({ floor: 20, encounter: 0,
			node: { kind: 'boss', encounters: [{ team: [] }] } }), 'brock');
	});
	it('validates every authored candidate, not just the placeholder first team', () => {
		const invalid = structuredClone(content);
		invalid.floors[160][0].encounters[0].trainerCandidates[9].team[5].moves[0] = 'not-a-move';
		assert.throws(() => validateContent(invalid), /招式无效/);
	});
});
