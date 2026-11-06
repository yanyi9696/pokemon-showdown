'use strict';
const { commandAfterOpening } = require('../fixtures/fantasy-rogue');

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { Dex, toID } = require('../../dist/sim/dex');
const { Format } = require('../../dist/sim/dex-formats');
const { Teams } = require('../../dist/sim/teams');
const { TeamValidator } = require('../../dist/sim/team-validator');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent, PreviewBalance } = require('../../dist/server/fantasy-rogue/preview-content');
const { TrainerBossData } = require('../../dist/server/fantasy-rogue/trainer-boss-data');
const { TrainerBossDoublesAuthored } = require('../../dist/server/fantasy-rogue/trainer-boss-doubles-authored');
const { TrainerBossDoublesHighTier } = require('../../dist/server/fantasy-rogue/trainer-boss-doubles-high-tier');
const { TrainerBossDoublesSamples } = require('../../dist/server/fantasy-rogue/trainer-boss-doubles-samples');
const { trainerBossCandidates, rogueOpponentAvatar, chooseTrainer } = require('../../dist/server/fantasy-rogue/trainer-bosses');
const { PRNG } = require('../../dist/sim/prng');
const { validateContent } = require('../../dist/server/fantasy-rogue/content');
const { set, stats } = require('../fixtures/fantasy-rogue');
const { storyView } = require('../../dist/server/fantasy-rogue/story');

describe('Fantasy Rogue authored trainers', function () {
	this.timeout(20000);
	let content, store, engine;
	const user = 'trainerqa';
	const account = () => store.get(user);
	const command = (action, data = {}) => commandAfterOpening(engine, user, {
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
	it('removes all held items from every floor 20 and 40 gym in singles and doubles only', () => {
		for (const doubles of [false, true]) {
			for (const floor of [20, 40]) {
				const candidates = trainerBossCandidates(floor, 20, doubles);
				assert(candidates.length >= 18);
				for (const candidate of candidates) {
					assert(candidate.team.every(mon => !mon.item), `${doubles}/${floor}/${candidate.trainer.id}`);
				}
			}
			for (const floor of [60, 80, 100, 120, 140, 160]) {
				for (const candidate of trainerBossCandidates(floor, 50, doubles)) {
					const entry = TrainerBossData.find(t => t.id === candidate.trainer.id && t.floor === floor);
					const source = doubles ? TrainerBossDoublesSamples[`${entry.id}:${floor}`]?.team ||
						TrainerBossDoublesAuthored[`${entry.id}:${floor}`] : entry.team;
					assert.deepEqual(candidate.team.map(mon => toID(mon.item)), Teams.import(source).map(mon => toID(mon.item)));
				}
			}
		}
	});
	it('offers the entire configured gym identity pool at every gym floor, with a uniform fresh-run draw', () => {
		const identities = [...new Set(TrainerBossData.filter(entry => entry.role === 'gym').map(entry => entry.id))].sort();
		for (const floor of [20, 40, 60, 80, 100, 120, 140, 160]) {
			const candidates = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor));
			assert.deepEqual(candidates.map(c => c.trainer.id).sort(), identities);
			// Every random index must select exactly its corresponding available identity.
			for (let index = 0; index < identities.length; index++) {
				const run = {floor, trainerHistory: {gyms: [], eliteFour: []}};
				const chosen = chooseTrainer(run, candidates, max => {assert.equal(max, identities.length); return index;});
				assert.equal(chosen.trainer.id, candidates[index].trainer.id);
			}
		}
		const rng = new PRNG([2026, 10, 17, 77]);
		const candidates = trainerBossCandidates(20, 15), counts = Object.fromEntries(identities.map(id => [id, 0]));
		for (let i = 0; i < 10000; i++) {
			const run = {floor: 20, trainerHistory: {gyms: [], eliteFour: []}};
			counts[chooseTrainer(run, candidates, max => rng.random(max)).trainer.id]++;
		}
		const expected = 10000 / identities.length;
		for (const count of Object.values(counts)) assert(Math.abs(count - expected) < expected * 0.15, JSON.stringify(counts));
	});
	it('loads all 24 supplied doubles samples by gym and floor without falling back to singles teams', () => {
		const expectedCounts = [2, 4, 4, 4, 4, 6, 6, 6];
		assert.equal(Object.keys(TrainerBossDoublesSamples).length, 24);
		const validator = new TeamValidator('gen9fantasyrogue');
		for (const sample of Object.values(TrainerBossDoublesSamples)) {
			const team = Teams.import(sample.team);
			assert(team, sample.source);
			assert.equal(validator.validateTeam(team), null, sample.source);
		}
		for (const [id, name, type] of [['winona', '娜琪', 'Flying'], ['roxie', '霍米加', 'Poison'], ['valerie', '玛秀', 'Fairy']]) {
			for (const [index, floor] of [20, 40, 60, 80, 100, 120, 140, 160].entries()) {
				const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true)
					.find(entry => entry.trainer.id === id);
				assert(candidate, `${name} · ${floor}`);
				assert.equal(candidate.team.length, expectedCounts[index], `${name} · ${floor}`);
				assert(candidate.team.every(member => member.level === PreviewBalance.bossLevel(floor)));
				const minimum = floor === 20 ? 2 : floor >= 120 ? 4 : 3;
				assert(candidate.team.filter(member => Dex.mod('gen9fantasy').species.get(member.species).types.includes(type)).length >= minimum,
					`${name} · ${floor} must meet its leader-type quota`);
			}
		}
		const doublesPool = trainerBossCandidates(20, PreviewBalance.bossLevel(20), true).map(entry => entry.trainer.id).sort();
		assert.deepEqual(doublesPool, ['acerola', 'bea', 'brock', 'candice', 'clair', 'clay', 'flannery', 'gardenia', 'iono', 'jasmine', 'larry', 'nanu', 'nessa', 'roxie', 'sabrina', 'valerie', 'viola', 'winona']);
		assert.equal(trainerBossCandidates(20, PreviewBalance.bossLevel(20)).length,
			new Set(TrainerBossData.filter(entry => entry.role === 'gym').map(entry => entry.id)).size);
	});

	it('validates the first authored Brock doubles ladder for progression, Rock quotas and two VGC axes', () => {
		const expectedCounts = [2, 4, 4, 4, 4, 6, 6, 6];
		const validator = new TeamValidator('gen9fantasyrogue');
		const floors = [20, 40, 60, 80, 100, 120, 140, 160];
		const format = new Format({ name: 'Brock authored doubles roster test', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] });
		assert.equal(Object.keys(TrainerBossDoublesAuthored).filter(key => key.startsWith('brock:')).length, 8);
		for (const [index, floor] of floors.entries()) {
			const key = `brock:${floor}`;
			const source = TrainerBossDoublesAuthored[key];
			const team = Teams.import(source);
			assert(team, key);
			assert.equal(validator.validateTeam(team), null, key);
			const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true)
				.find(entry => entry.trainer.id === 'brock');
			assert(candidate, key);
			assert.equal(candidate.team.length, expectedCounts[index], key);
			assert(candidate.team.every(member => member.level === PreviewBalance.bossLevel(floor)), key);
			const minimum = floor === 20 ? 2 : floor >= 120 ? 4 : 3;
			assert(candidate.team.filter(member => Dex.mod('gen9fantasy').species.get(member.species).types.includes('Rock')).length >= minimum,
				`${key} must meet its Rock quota`);
			const battle = new Battle({
				format, seed: [1, 2, 3, floor],
				p1: { name: 'Doubles QA', team: Teams.pack([
					set('Garchomp', 'Rough Skin', 50, ['Earthquake', 'Protect']),
					set('Talonflame', 'Flame Body', 50, ['Tailwind', 'Protect']),
				]) },
				p2: { name: 'Brock', team: Teams.pack(candidate.team) },
			});
			try {
				assert.equal(battle.p1.activeRequest.active.length, 2, `${key} player should enter a native double battle`);
				assert.equal(battle.p2.activeRequest.active.length, 2, `${key} trainer should enter a native double battle`);
				assert(battle.choose('p1', 'move 1, move 1'));
				assert(battle.choose('p2', 'move 1, move 1 1'), `${key} trainer's first pair should submit legal moves`);
				assert(battle.turn >= 2 || battle.ended || battle.p1.activeRequest.forceSwitch || battle.p2.activeRequest.forceSwitch,
					`${key} battle should resolve the joint turn or request a legal replacement`);
			} finally {
				battle.destroy();
			}
		}
		const floor40 = Teams.import(TrainerBossDoublesAuthored['brock:40']);
		assert(floor40.find(mon => mon.species === 'Aerodactyl').moves.includes('Tailwind'));
		const floor120 = Teams.import(TrainerBossDoublesAuthored['brock:120']);
		assert(floor120.find(mon => mon.species === 'Tyranitar').ability === 'Sand Stream');
		assert(floor120.find(mon => mon.species === 'Excadrill').ability === 'Sand Rush');
		const floor160 = Teams.import(TrainerBossDoublesAuthored['brock:160']);
		assert.equal(floor160.filter(mon => ['Terrakion', 'Regirock'].includes(mon.species)).length, 1);
	});

	it('validates Sabrina’s Psychic Terrain and Trick Room ladder at every floor', () => {
		const expectedCounts = [2, 4, 4, 4, 4, 6, 6, 6];
		const validator = new TeamValidator('gen9fantasyrogue');
		const floors = [20, 40, 60, 80, 100, 120, 140, 160];
		assert.equal(Object.keys(TrainerBossDoublesAuthored).filter(key => key.startsWith('sabrina:')).length, 8);
		for (const [index, floor] of floors.entries()) {
			const key = `sabrina:${floor}`;
			const team = Teams.import(TrainerBossDoublesAuthored[key]);
			assert(team, key);
			assert.equal(validator.validateTeam(team), null, key);
			const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true)
				.find(entry => entry.trainer.id === 'sabrina');
			assert(candidate, key);
			assert.equal(candidate.team.length, expectedCounts[index], key);
			assert(candidate.team.every(member => member.level === PreviewBalance.bossLevel(floor)), key);
			const minimum = floor === 20 ? 2 : floor >= 120 ? 4 : 3;
			assert(candidate.team.filter(member => Dex.mod('gen9fantasy').species.get(member.species).types.includes('Psychic')).length >= minimum,
				`${key} must meet its Psychic quota`);
			const format = new Format({ name: 'Sabrina authored doubles roster test', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] });
			const battle = new Battle({
				format, seed: [5, 6, 7, floor],
				p1: { name: 'Doubles QA', team: Teams.pack([
					set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
					set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
				]) },
				p2: { name: 'Sabrina', team: Teams.pack(candidate.team) },
			});
			try {
				assert.equal(battle.p2.activeRequest.active.length, 2, `${key} trainer should enter doubles`);
				assert(battle.choose('p1', 'move 2, move 1'));
				assert(battle.choose('p2', 'move 2 1, move 2 1'), `${key} trainer's opening pair should submit legal moves`);
			} finally {
				battle.destroy();
			}
		}
		const floor120 = Teams.import(TrainerBossDoublesAuthored['sabrina:120']);
		assert.equal(floor120.filter(mon => ['tapulelefantasy', 'cresseliafantasy', 'deoxysattack'].includes(toID(mon.species))).length, 1);
		const floor140 = Teams.import(TrainerBossDoublesAuthored['sabrina:140']);
		assert.equal(floor140.filter(mon => ['tapulelefantasy', 'cresseliafantasy', 'deoxysattack'].includes(toID(mon.species))).length, 1);
		const floor160 = Teams.import(TrainerBossDoublesAuthored['sabrina:160']);
		assert.equal(floor160.filter(mon => ['tapulelefantasy', 'cresseliafantasy', 'deoxysattack'].includes(toID(mon.species))).length, 2);
		assert(Teams.import(TrainerBossDoublesAuthored['sabrina:100']).some(mon => toID(mon.species) === 'alakazammega'));
	});

	it('validates Flannery’s sun and After You ladder with a controlled legendary budget', () => {
		const expectedCounts = [2, 4, 4, 4, 4, 6, 6, 6];
		const validator = new TeamValidator('gen9fantasyrogue');
		const floors = [20, 40, 60, 80, 100, 120, 140, 160];
		assert.equal(Object.keys(TrainerBossDoublesAuthored).filter(key => key.startsWith('flannery:')).length, 8);
		for (const [index, floor] of floors.entries()) {
			const key = `flannery:${floor}`;
			const team = Teams.import(TrainerBossDoublesAuthored[key]);
			assert(team, key);
			assert.equal(validator.validateTeam(team), null, key);
			const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true)
				.find(entry => entry.trainer.id === 'flannery');
			assert(candidate, key);
			assert.equal(candidate.team.length, expectedCounts[index], key);
			const minimum = floor === 20 ? 2 : floor >= 120 ? 4 : 3;
			assert(candidate.team.filter(member => Dex.mod('gen9fantasy').species.get(member.species).types.includes('Fire')).length >= minimum,
				`${key} must meet its Fire quota`);
			const format = new Format({ name: 'Flannery authored doubles roster test', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] });
			const battle = new Battle({
				format, seed: [8, 9, 10, floor],
				p1: { name: 'Doubles QA', team: Teams.pack([
					set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
					set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
				]) },
				p2: { name: 'Flannery', team: Teams.pack(candidate.team) },
			});
			try {
				assert.equal(battle.p2.activeRequest.active.length, 2, `${key} trainer should enter doubles`);
				assert(battle.choose('p1', 'move 2, move 1'));
				assert(battle.choose('p2', 'move 4, move 4'), `${key} trainer's opening pair should submit legal moves`);
			} finally {
				battle.destroy();
			}
		}
		for (const floor of [120, 140]) {
			const team = Teams.import(TrainerBossDoublesAuthored[`flannery:${floor}`]);
			assert.equal(team.filter(mon => ['heatran', 'chiyu'].includes(toID(mon.species))).length, 1);
		}
		const floor160 = Teams.import(TrainerBossDoublesAuthored['flannery:160']);
		assert.equal(floor160.filter(mon => ['heatran', 'chiyu'].includes(toID(mon.species))).length, 2);
		assert(Teams.import(TrainerBossDoublesAuthored['flannery:100']).some(mon => toID(mon.species) === 'charizardmegay'));
	});

	it('validates Nessa’s rain core and keeps her Galar G-Mega signature available from floor 100', () => {
		const expectedCounts = [2, 4, 4, 4, 4, 6, 6, 6];
		const validator = new TeamValidator('gen9fantasyrogue');
		const floors = [20, 40, 60, 80, 100, 120, 140, 160];
		assert.equal(Object.keys(TrainerBossDoublesAuthored).filter(key => key.startsWith('nessa:')).length, 8);
		for (const [index, floor] of floors.entries()) {
			const key = `nessa:${floor}`;
			const team = Teams.import(TrainerBossDoublesAuthored[key]);
			assert(team, key);
			assert.equal(validator.validateTeam(team), null, key);
			const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true)
				.find(entry => entry.trainer.id === 'nessa');
			assert(candidate, key);
			assert.equal(candidate.team.length, expectedCounts[index], key);
			assert(candidate.team.every(member => member.level === PreviewBalance.bossLevel(floor)), key);
			const minimum = floor === 20 ? 2 : floor >= 120 ? 4 : 3;
			assert(candidate.team.filter(member => Dex.mod('gen9fantasy').species.get(member.species).types.includes('Water')).length >= minimum,
				`${key} must meet its Water quota`);
			const format = new Format({ name: 'Nessa authored doubles roster test', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] });
			const battle = new Battle({
				format, seed: [11, 12, 13, floor],
				p1: { name: 'Doubles QA', team: Teams.pack([
					set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
					set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
				]) },
				p2: { name: 'Nessa', team: Teams.pack(candidate.team) },
			});
			try {
				assert.equal(battle.p2.activeRequest.active.length, 2, `${key} trainer should enter doubles`);
				assert(battle.choose('p1', 'move 2, move 1'));
				const protects = battle.p2.activeRequest.active.map(active => {
					const slot = active.moves.findIndex(move => move.id === 'protect');
					assert(slot >= 0, `${key} active member needs a legal Protect choice`);
					return `move ${slot + 1}`;
				}).join(', ');
				assert(battle.choose('p2', protects), `${key} trainer's opening pair should submit legal moves`);
			} finally {
				battle.destroy();
			}
			if (floor >= 100) {
				const gmax = team.find(mon => toID(mon.species) === 'drednawgmegafantasy');
				assert(gmax, `${key} must include Nessa's Galar signature`);
				assert.equal(toID(gmax.item), 'gmegawishingstar', `${key} must be able to use the G-Mega route`);
				assert.equal(toID(candidate.team.find(mon => toID(mon.item) === 'gmegawishingstar').species), 'drednawfantasy');
			}
		}
		const floor120 = Teams.import(TrainerBossDoublesAuthored['nessa:120']);
		assert.equal(floor120.filter(mon => ['suicune', 'urshifurapidstrike'].includes(toID(mon.species))).length, 0);
		const floor140 = Teams.import(TrainerBossDoublesAuthored['nessa:140']);
		assert.equal(floor140.filter(mon => ['suicune', 'urshifurapidstrike'].includes(toID(mon.species))).length, 1);
		const floor160 = Teams.import(TrainerBossDoublesAuthored['nessa:160']);
		assert.equal(floor160.filter(mon => ['suicune', 'urshifurapidstrike'].includes(toID(mon.species))).length, 2);
	});

	it('validates Iono’s Electric Terrain and Tailwind ladder in every native doubles battle', () => {
		const expectedCounts = [2, 4, 4, 4, 4, 6, 6, 6];
		const floors = [20, 40, 60, 80, 100, 120, 140, 160];
		const validator = new TeamValidator('gen9fantasyrogue');
		const format = new Format({ name: 'Iono authored doubles roster test', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] });
		assert.equal(Object.keys(TrainerBossDoublesAuthored).filter(key => key.startsWith('iono:')).length, 8);
		for (const [index, floor] of floors.entries()) {
			const key = `iono:${floor}`;
			const team = Teams.import(TrainerBossDoublesAuthored[key]);
			assert(team, key);
			assert.equal(validator.validateTeam(team), null, key);
			const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true)
				.find(entry => entry.trainer.id === 'iono');
			assert(candidate, key);
			assert.equal(candidate.team.length, expectedCounts[index], key);
			assert(candidate.team.every(member => member.level === PreviewBalance.bossLevel(floor)), key);
			const minimum = floor === 20 ? 2 : floor >= 120 ? 4 : 3;
			const matching = candidate.team.filter(member => Dex.mod('gen9fantasy').species.get(member.species).types.includes('Electric') ||
				toID(member.teraType) === 'electric');
			assert(matching.length >= minimum, `${key} must meet its Electric quota`);
			const exception = team.find(member => ['misdreavus', 'mismagius'].includes(toID(member.species)));
			if (exception) assert.equal(toID(exception.teraType), 'electric', `${key} must use Iono's Paldea Tera exception`);
			if (floor >= 100) {
				const mega = team.find(member => toID(member.species) === 'raichumegay');
				assert(mega, `${key} must retain Iono's Mega signature after unlock`);
				assert.equal(toID(mega.item), 'raichunitey', `${key} must activate Mega Raichu Y`);
			}
			const exceptionalLegends = team.filter(member =>
				['tapukokofantasy', 'ironhands', 'ragingbolt'].includes(toID(member.species)));
			assert(exceptionalLegends.length <= (floor >= 160 ? 3 : floor >= 120 ? 1 : 0), `${key} exceeds its legendary budget`);
			if (floor === 160) assert.equal(exceptionalLegends.length, 3, `${key} should use three complementary late-game legends`);

			const battle = new Battle({
				format, seed: [15, 16, 17, floor],
				p1: { name: 'Doubles QA', team: Teams.pack([
					set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
					set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
				]) },
				p2: { name: 'Iono', team: Teams.pack(candidate.team) },
			});
			try {
				const protects = battle.p2.activeRequest.active.map(active => {
					const slot = active.moves.findIndex(move => move.id === 'protect');
					assert(slot >= 0, `${key} active member needs Protect for safe opening verification`);
					return `move ${slot + 1}`;
				}).join(', ');
				assert(battle.choose('p1', 'move 2, move 2'));
				assert(battle.choose('p2', protects), `${key} must accept a legal native double choice`);
			} finally {
				battle.destroy();
			}
		}
		assert(Teams.import(TrainerBossDoublesAuthored['iono:40']).some(mon => toID(mon.species) === 'pincurchin' && mon.ability === 'Electric Surge'));
		assert(Teams.import(TrainerBossDoublesAuthored['iono:60']).some(mon => mon.moves.includes('Tailwind')));
		assert(Teams.import(TrainerBossDoublesAuthored['iono:120']).some(mon => toID(mon.species) === 'rotomfantasy'));
		assert(Teams.import(TrainerBossDoublesAuthored['iono:140']).some(mon => toID(mon.species) === 'tapukokofantasy'));
	});

	it('validates Viola’s Bug speed-control ladder, Mega unlock and late-game legendary budget', () => {
		const expectedCounts = [2, 4, 4, 4, 4, 6, 6, 6];
		const floors = [20, 40, 60, 80, 100, 120, 140, 160];
		const validator = new TeamValidator('gen9fantasyrogue');
		const format = new Format({ name: 'Viola authored doubles roster test', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] });
		assert.equal(Object.keys(TrainerBossDoublesAuthored).filter(key => key.startsWith('viola:')).length, 8);
		for (const [index, floor] of floors.entries()) {
			const key = `viola:${floor}`;
			const team = Teams.import(TrainerBossDoublesAuthored[key]);
			assert(team, key);
			assert.equal(validator.validateTeam(team), null, key);
			const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true)
				.find(entry => entry.trainer.id === 'viola');
			assert(candidate, key);
			assert.equal(candidate.team.length, expectedCounts[index], key);
			assert(candidate.team.every(member => member.level === PreviewBalance.bossLevel(floor)), key);
			const minimum = floor === 20 ? 2 : floor >= 120 ? 4 : 3;
			const bugCount = candidate.team.filter(member => Dex.mod('gen9fantasy').species.get(member.species).types.includes('Bug')).length;
			assert(bugCount >= minimum, `${key} must meet its Bug quota`);
			const legends = team.filter(member => ['genesect', 'pheromosa'].includes(toID(member.species)));
			assert(legends.length <= (floor >= 160 ? 3 : floor >= 120 ? 1 : 0), `${key} exceeds its legendary budget`);
			if (floor === 120) assert.equal(legends.length, 0, `${key} should keep its first six-member tier grounded`);
			if (floor === 140) assert.deepEqual(legends.map(member => toID(member.species)), ['pheromosa']);
			if (floor === 160) assert.deepEqual(legends.map(member => toID(member.species)).sort(), ['genesect', 'pheromosa']);
			if (floor >= 100) {
				assert(team.some(member => toID(member.item) === 'pinsirite'), `${key} must keep the unlocked Mega Pinsir route`);
			}
			const battle = new Battle({
				format, seed: [18, 19, 20, floor],
				p1: { name: 'Doubles QA', team: Teams.pack([
					set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
					set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
				]) },
				p2: { name: 'Viola', team: Teams.pack(candidate.team) },
			});
			try {
				const opening = battle.p2.activeRequest.active.map(active => {
					const slot = active.moves.findIndex(move => move.id === 'protect');
					assert(slot >= 0, `${key} active member needs Protect for safe opening verification`);
					return `move ${slot + 1}`;
				}).join(', ');
				if (floor === 100) assert(battle.p2.activeRequest.active[0].canMegaEvo, `${key} must make Mega Pinsir available in battle`);
				assert(battle.choose('p1', 'move 2, move 2'));
				assert(battle.choose('p2', opening), `${key} must accept a legal native double choice`);
			} finally {
				battle.destroy();
			}
		}
	});

	it('validates Nanu’s Dark disruption ladder and uses one compatible legend axis per tier', () => {
		const expectedCounts = [2, 4, 4, 4, 4, 6, 6, 6];
		const floors = [20, 40, 60, 80, 100, 120, 140, 160];
		const validator = new TeamValidator('gen9fantasyrogue');
		const format = new Format({ name: 'Nanu authored doubles roster test', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] });
		assert.equal(Object.keys(TrainerBossDoublesAuthored).filter(key => key.startsWith('nanu:')).length, 8);
		for (const [index, floor] of floors.entries()) {
			const key = `nanu:${floor}`;
			const team = Teams.import(TrainerBossDoublesAuthored[key]);
			assert(team, key);
			assert.equal(validator.validateTeam(team), null, key);
			const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true)
				.find(entry => entry.trainer.id === 'nanu');
			assert(candidate, key);
			assert.equal(candidate.team.length, expectedCounts[index], key);
			assert(candidate.team.every(member => member.level === PreviewBalance.bossLevel(floor)), key);
			const minimum = floor === 20 ? 2 : floor >= 120 ? 4 : 3;
			const darkCount = candidate.team.filter(member => Dex.mod('gen9fantasy').species.get(member.species).types.includes('Dark')).length;
			assert(darkCount >= minimum, `${key} must meet its Dark quota`);
			const legends = team.filter(member => ['Urshifu', 'Moltres-Galar'].includes(Dex.mod('gen9fantasy').species.get(member.species).name));
			assert(legends.length <= (floor >= 160 ? 3 : floor >= 120 ? 1 : 0), `${key} exceeds its legendary budget`);
			if (floor === 120) assert.equal(legends.length, 1, `${key} should upgrade its physical breaker with Urshifu`);
			if (floor === 140) assert.deepEqual(legends.map(member => Dex.mod('gen9fantasy').species.get(member.species).name), ['Moltres-Galar']);
			if (floor === 160) assert.deepEqual(legends.map(member => Dex.mod('gen9fantasy').species.get(member.species).name).sort(), ['Moltres-Galar', 'Urshifu']);
			if (floor >= 100) assert(team.some(member => toID(member.item) === 'sablenite'), `${key} must keep Mega Sableye available`);
			const battle = new Battle({
				format, seed: [21, 22, 23, floor],
				p1: { name: 'Doubles QA', team: Teams.pack([
					set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
					set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
				]) },
				p2: { name: 'Nanu', team: Teams.pack(candidate.team) },
			});
			try {
				const opening = battle.p2.activeRequest.active.map(active => {
					const slot = active.moves.findIndex(move => move.id === 'protect');
					assert(slot >= 0, `${key} active member needs Protect for safe opening verification`);
					return `move ${slot + 1}`;
				}).join(', ');
				if (floor === 100) assert(battle.p2.activeRequest.active[0].canMegaEvo, `${key} must make Mega Sableye available in battle`);
				assert(battle.choose('p1', 'move 2, move 2'));
				assert(battle.choose('p2', opening), `${key} must accept a legal native double choice`);
			} finally {
				battle.destroy();
			}
		}
	});

	it('validates Acerola’s dual-speed Ghost roster and Mega Banette transformation', () => {
		const expectedCounts = [2, 4, 4, 4, 4, 6, 6, 6];
		const floors = [20, 40, 60, 80, 100, 120, 140, 160];
		const validator = new TeamValidator('gen9fantasyrogue');
		const format = new Format({ name: 'Acerola authored doubles roster test', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] });
		assert.equal(Object.keys(TrainerBossDoublesAuthored).filter(key => key.startsWith('acerola:')).length, 8);
		for (const [index, floor] of floors.entries()) {
			const key = `acerola:${floor}`;
			const team = Teams.import(TrainerBossDoublesAuthored[key]);
			assert(team, key);
			assert.equal(validator.validateTeam(team), null, key);
			const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true)
				.find(entry => entry.trainer.id === 'acerola');
			assert(candidate, key);
			assert.equal(candidate.team.length, expectedCounts[index], key);
			assert(candidate.team.every(member => member.level === PreviewBalance.bossLevel(floor)), key);
			const minimum = floor === 20 ? 2 : floor >= 120 ? 4 : 3;
			const ghostCount = candidate.team.filter(member => Dex.mod('gen9fantasy').species.get(member.species).types.includes('Ghost')).length;
			assert(ghostCount >= minimum, `${key} must meet its Ghost quota`);
			const legends = team.filter(member => ['Spectrier', 'Marshadow'].includes(Dex.mod('gen9fantasy').species.get(member.species).name));
			assert(legends.length <= (floor >= 160 ? 3 : floor >= 120 ? 1 : 0), `${key} exceeds its legendary budget`);
			if (floor === 120 || floor === 140) assert.deepEqual(legends.map(member => Dex.mod('gen9fantasy').species.get(member.species).name), ['Spectrier']);
			if (floor === 160) assert.deepEqual(legends.map(member => Dex.mod('gen9fantasy').species.get(member.species).name).sort(), ['Marshadow', 'Spectrier']);
			if (floor >= 100) assert(team.some(member => toID(member.item) === 'banettite'), `${key} must retain Mega Banette`);
			const battle = new Battle({
				format, seed: [24, 25, 26, floor],
				p1: { name: 'Doubles QA', team: Teams.pack([
					set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
					set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
				]) },
				p2: { name: 'Acerola', team: Teams.pack(candidate.team) },
			});
			try {
				const opening = battle.p2.activeRequest.active.map(active => {
					const slot = active.moves.findIndex(move => move.id === 'protect');
					assert(slot >= 0, `${key} active member needs Protect for safe opening verification`);
					return `move ${slot + 1}`;
				}).join(', ');
				if (floor === 100) assert(battle.p2.activeRequest.active[0].canMegaEvo, `${key} must make Mega Banette available in battle`);
				assert(battle.choose('p1', 'move 2, move 2'));
				assert(battle.choose('p2', opening), `${key} must accept a legal native double choice`);
			} finally {
				battle.destroy();
			}
		}
	});

	it('validates Gardenia’s Grassy Terrain support and late-game legend progression', () => {
		const expectedCounts = [2, 4, 4, 4, 4, 6, 6, 6];
		const floors = [20, 40, 60, 80, 100, 120, 140, 160];
		const validator = new TeamValidator('gen9fantasyrogue');
		const format = new Format({ name: 'Gardenia authored doubles roster test', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] });
		assert.equal(Object.keys(TrainerBossDoublesAuthored).filter(key => key.startsWith('gardenia:')).length, 8);
		for (const [index, floor] of floors.entries()) {
			const key = `gardenia:${floor}`;
			const team = Teams.import(TrainerBossDoublesAuthored[key]);
			assert(team, key);
			assert.equal(validator.validateTeam(team), null, key);
			const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true)
				.find(entry => entry.trainer.id === 'gardenia');
			assert(candidate, key);
			assert.equal(candidate.team.length, expectedCounts[index], key);
			assert(candidate.team.every(member => member.level === PreviewBalance.bossLevel(floor)), key);
			const minimum = floor === 20 ? 2 : floor >= 120 ? 4 : 3;
			const grassCount = candidate.team.filter(member => Dex.mod('gen9fantasy').species.get(member.species).types.includes('Grass')).length;
			assert(grassCount >= minimum, `${key} must meet its Grass quota`);
			const legends = team.filter(member => ['Tapu Bulu', 'Celebi'].includes(Dex.mod('gen9fantasy').species.get(member.species).name));
			assert(legends.length <= (floor >= 160 ? 3 : floor >= 120 ? 1 : 0), `${key} exceeds its legendary budget`);
			if (floor === 120) assert.equal(legends.length, 0, `${key} should keep its first six-member tier grounded`);
			if (floor === 140) assert.deepEqual(legends.map(member => Dex.mod('gen9fantasy').species.get(member.species).name), ['Tapu Bulu']);
			if (floor === 160) assert.deepEqual(legends.map(member => Dex.mod('gen9fantasy').species.get(member.species).name).sort(), ['Celebi', 'Tapu Bulu']);
			if (floor >= 100) assert(team.some(member => toID(member.item) === 'sceptilite'), `${key} must keep Mega Sceptile available`);
			const battle = new Battle({
				format, seed: [27, 28, 29, floor],
				p1: { name: 'Doubles QA', team: Teams.pack([
					set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
					set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
				]) },
				p2: { name: 'Gardenia', team: Teams.pack(candidate.team) },
			});
			try {
				const opening = battle.p2.activeRequest.active.map(active => {
					const slot = active.moves.findIndex(move => move.id === 'protect');
					assert(slot >= 0, `${key} active member needs Protect for safe opening verification`);
					return `move ${slot + 1}`;
				}).join(', ');
				if (floor === 100) assert(battle.p2.activeRequest.active[0].canMegaEvo, `${key} must make Mega Sceptile available in battle`);
				assert(battle.choose('p1', 'move 2, move 2'));
				assert(battle.choose('p2', opening), `${key} must accept a legal native double choice`);
			} finally {
				battle.destroy();
			}
		}
	});

	it('validates Jasmine’s Steel bulk and speed-mode ladder with a legal Mega Steelix', () => {
		const expectedCounts = [2, 4, 4, 4, 4, 6, 6, 6];
		const floors = [20, 40, 60, 80, 100, 120, 140, 160];
		const validator = new TeamValidator('gen9fantasyrogue');
		const format = new Format({ name: 'Jasmine authored doubles roster test', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] });
		assert.equal(Object.keys(TrainerBossDoublesAuthored).filter(key => key.startsWith('jasmine:')).length, 8);
		for (const [index, floor] of floors.entries()) {
			const key = `jasmine:${floor}`;
			const team = Teams.import(TrainerBossDoublesAuthored[key]);
			assert(team, key);
			assert.equal(validator.validateTeam(team), null, key);
			const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true)
				.find(entry => entry.trainer.id === 'jasmine');
			assert(candidate, key);
			assert.equal(candidate.team.length, expectedCounts[index], key);
			assert(candidate.team.every(member => member.level === PreviewBalance.bossLevel(floor)), key);
			const minimum = floor === 20 ? 2 : floor >= 120 ? 4 : 3;
			const steelCount = candidate.team.filter(member => Dex.mod('gen9fantasy').species.get(member.species).types.includes('Steel')).length;
			assert(steelCount >= minimum, `${key} must meet its Steel quota`);
			const legends = team.filter(member => ['Heatran', 'Melmetal-Fantasy'].includes(Dex.mod('gen9fantasy').species.get(member.species).name));
			assert(legends.length <= (floor >= 160 ? 3 : floor >= 120 ? 1 : 0), `${key} exceeds its legendary budget`);
			if (floor === 120) assert.equal(legends.length, 0, `${key} should keep its first six-member tier grounded`);
			if (floor === 140) assert.deepEqual(legends.map(member => Dex.mod('gen9fantasy').species.get(member.species).name), ['Heatran']);
			if (floor === 160) assert.deepEqual(legends.map(member => Dex.mod('gen9fantasy').species.get(member.species).name).sort(), ['Heatran', 'Melmetal-Fantasy']);
			if (floor >= 100) assert(team.some(member => toID(member.item) === 'steelixite'), `${key} must retain the Steelix Mega Stone`);
			const battle = new Battle({
				format, seed: [30, 31, 32, floor],
				p1: { name: 'Doubles QA', team: Teams.pack([
					set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
					set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
				]) },
				p2: { name: 'Jasmine', team: Teams.pack(candidate.team) },
			});
			try {
				const opening = battle.p2.activeRequest.active.map(active => {
					const slot = active.moves.findIndex(move => move.id === 'protect');
					assert(slot >= 0, `${key} active member needs Protect for safe opening verification`);
					return `move ${slot + 1}`;
				}).join(', ');
				if (floor === 100) assert(battle.p2.activeRequest.active[0].canMegaEvo, `${key} must make Mega Steelix available in battle`);
				assert(battle.choose('p1', 'move 2, move 2'));
				assert(battle.choose('p2', opening), `${key} must accept a legal native double choice`);
			} finally {
				battle.destroy();
			}
		}
	});

	it('validates Bea’s Fighting support core, Tailwind access and legendary cap', () => {
		const expectedCounts = [2, 4, 4, 4, 4, 6, 6, 6];
		const floors = [20, 40, 60, 80, 100, 120, 140, 160];
		const validator = new TeamValidator('gen9fantasyrogue');
		const format = new Format({ name: 'Bea authored doubles roster test', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] });
		assert.equal(Object.keys(TrainerBossDoublesAuthored).filter(key => key.startsWith('bea:')).length, 8);
		for (const [index, floor] of floors.entries()) {
			const key = `bea:${floor}`;
			const team = Teams.import(TrainerBossDoublesAuthored[key]);
			assert(team, key);
			assert.equal(validator.validateTeam(team), null, key);
			const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true)
				.find(entry => entry.trainer.id === 'bea');
			assert(candidate, key);
			assert.equal(candidate.team.length, expectedCounts[index], key);
			assert(candidate.team.every(member => member.level === PreviewBalance.bossLevel(floor)), key);
			const minimum = floor === 20 ? 2 : floor >= 120 ? 4 : 3;
			const fightingCount = candidate.team.filter(member => Dex.mod('gen9fantasy').species.get(member.species).types.includes('Fighting')).length;
			assert(fightingCount >= minimum, `${key} must meet its Fighting quota`);
			const legends = team.filter(member => ['Urshifu-Rapid-Strike-Fantasy', 'Pheromosa'].includes(Dex.mod('gen9fantasy').species.get(member.species).name));
			assert(legends.length <= (floor >= 160 ? 3 : floor >= 120 ? 1 : 0), `${key} exceeds its legendary budget`);
			if (floor === 120) assert.deepEqual(legends.map(member => Dex.mod('gen9fantasy').species.get(member.species).name), ['Urshifu-Rapid-Strike-Fantasy']);
			if (floor === 140) assert.deepEqual(legends.map(member => Dex.mod('gen9fantasy').species.get(member.species).name), ['Pheromosa']);
			if (floor === 160) assert.deepEqual(legends.map(member => Dex.mod('gen9fantasy').species.get(member.species).name).sort(), ['Pheromosa', 'Urshifu-Rapid-Strike-Fantasy']);
			if (floor >= 100) assert(team.some(member => toID(member.item) === 'galladite'), `${key} must keep Mega Gallade available`);
			const battle = new Battle({
				format, seed: [33, 34, 35, floor],
				p1: { name: 'Doubles QA', team: Teams.pack([
					set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
					set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
				]) },
				p2: { name: 'Bea', team: Teams.pack(candidate.team) },
			});
			try {
				const opening = battle.p2.activeRequest.active.map(active => {
					const slot = active.moves.findIndex(move => move.id === 'protect');
					assert(slot >= 0, `${key} active member needs Protect for safe opening verification`);
					return `move ${slot + 1}`;
				}).join(', ');
				if (floor === 100) assert(battle.p2.activeRequest.active[0].canMegaEvo, `${key} must make Mega Gallade available in battle`);
				assert(battle.choose('p1', 'move 2, move 2'));
				assert(battle.choose('p2', opening), `${key} must accept a legal native double choice`);
			} finally {
				battle.destroy();
			}
		}
	});

	it('validates Candice, Clair, Clay and Larry doubles ladders against type, legendary and native-battle rules', () => {
		const expectedCounts = [2, 4, 4, 4, 4, 6, 6, 6];
		const floors = [20, 40, 60, 80, 100, 120, 140, 160];
		const leaders = [
			{
				id: 'candice', type: 'Ice', mega: 'abomasite',
				special: { 120: ['ironbundle'], 140: ['articuno'], 160: ['articuno', 'ironbundle'] },
			},
			{ id: 'clair', type: 'Dragon', mega: 'tatsugirinite', special: { 160: ['ragingbolt'] } },
			{ id: 'clay', type: 'Ground', mega: 'excadrite', special: { 140: ['sandyshocksfantasy'], 160: ['sandyshocksfantasy'] } },
			{ id: 'larry', type: 'Normal', mega: 'staraptite', special: { 160: ['enteifantasy'] } },
		];
		const specialSpecies = new Set(['articuno', 'ironbundle', 'ragingbolt', 'sandyshocksfantasy', 'enteifantasy']);
		const validator = new TeamValidator('gen9fantasyrogue');
		const format = new Format({ name: 'Remaining authored doubles rosters', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] });
		for (const leader of leaders) {
			assert.equal(Object.keys(TrainerBossDoublesAuthored).filter(key => key.startsWith(`${leader.id}:`)).length, 8);
			for (const [index, floor] of floors.entries()) {
				const key = `${leader.id}:${floor}`;
				const team = Teams.import(TrainerBossDoublesAuthored[key]);
				assert(team, key);
				assert.equal(validator.validateTeam(team), null, key);
				const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true)
					.find(entry => entry.trainer.id === leader.id);
				assert(candidate, key);
				assert.equal(candidate.team.length, expectedCounts[index], key);
				assert(candidate.team.every(member => member.level === PreviewBalance.bossLevel(floor)), key);
				const minimum = floor === 20 ? 2 : floor >= 120 ? 4 : 3;
				const matching = candidate.team.filter(member => Dex.mod('gen9fantasy').species.get(member.species).types.includes(leader.type));
				assert(matching.length >= minimum, `${key} must meet its ${leader.type} quota`);
				const special = team.map(member => toID(Dex.mod('gen9fantasy').species.get(member.species).name))
					.filter(id => specialSpecies.has(id)).sort();
				const expectedSpecial = (leader.special[floor] || []).slice().sort();
				assert.deepEqual(special, expectedSpecial, `${key} special roster should match its planned budget`);
				assert(special.length <= (floor >= 160 ? 3 : floor >= 120 ? 1 : 0), `${key} exceeds its legendary budget`);
				if (floor >= 100 && leader.id !== 'larry') assert(team.some(member => toID(member.item) === leader.mega), `${key} must retain its Mega axis`);
				if (leader.id === 'larry' && floor >= 100) {
					assert(team.some(member => toID(member.item) === 'pidgeotite' || toID(member.item) === 'staraptite'), `${key} must retain its Mega axis`);
				}
				const battleTeam = candidate.team.slice();
				const megaItem = leader.id === 'larry' ? (floor === 100 ? 'pidgeotite' : 'staraptite') : leader.mega;
				if (floor >= 100) {
					const megaIndex = battleTeam.findIndex(member => toID(member.item) === megaItem);
					assert(megaIndex >= 0, `${key} needs an eligible Mega holder`);
					if (megaIndex > 1) [battleTeam[1], battleTeam[megaIndex]] = [battleTeam[megaIndex], battleTeam[1]];
				}
				const battle = new Battle({
					format, seed: [71, 72, 73, floor],
					p1: { name: 'Doubles QA', team: Teams.pack([
						set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
						set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
					]) },
					p2: { name: leader.id, team: Teams.pack(battleTeam) },
				});
				try {
					assert.equal(battle.p1.activeRequest.active.length, 2, `${key} player opens two active slots`);
					assert.equal(battle.p2.activeRequest.active.length, 2, `${key} trainer opens two active slots`);
					const megaSlot = floor >= 100 ? battle.p2.activeRequest.active.findIndex(active => active.canMegaEvo) : -1;
					if (floor >= 100) assert(megaSlot >= 0, `${key} must expose its Mega choice in a native battle`);
					const opening = battle.p2.activeRequest.active.map((active, slotIndex) => {
						const slot = active.moves.findIndex(move => move.id === 'protect');
						assert(slot >= 0, `${key} active member needs Protect for safe opening verification`);
						return `move ${slot + 1}${slotIndex === megaSlot ? ' mega' : ''}`;
					}).join(', ');
					assert(battle.choose('p1', 'move 2, move 2'));
					assert(battle.choose('p2', opening), `${key} must accept a legal native double choice`);
					if (floor >= 100) assert(battle.p2.active[megaSlot].species.isMega, `${key} must transform through its actual Mega trigger`);
				} finally {
					battle.destroy();
				}
				if (leader.id === 'clay' && floor >= 120) {
					const gmegaTeam = candidate.team.slice();
					const gmegaIndex = gmegaTeam.findIndex(member => toID(member.item) === 'gmegawishingstar');
					assert(gmegaIndex >= 0, `${key} needs its G-Mega Sandaconda`);
					if (gmegaIndex > 1) [gmegaTeam[1], gmegaTeam[gmegaIndex]] = [gmegaTeam[gmegaIndex], gmegaTeam[1]];
					const gmegaBattle = new Battle({
						format, seed: [74, 75, 76, floor],
						p1: { name: 'Doubles QA', team: Teams.pack([
							set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
							set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
						]) },
						p2: { name: leader.id, team: Teams.pack(gmegaTeam) },
					});
					try {
						const gmegaSlot = gmegaBattle.p2.activeRequest.active.findIndex(active => active.canGMegaEvo);
						assert(gmegaSlot >= 0, `${key} must expose G-Mega Sandaconda in a native battle`);
						const choices = gmegaBattle.p2.activeRequest.active.map((active, slotIndex) => {
							const slot = active.moves.findIndex(move => move.id === 'protect');
							assert(slot >= 0, `${key} G-Mega opener needs Protect`);
							return `move ${slot + 1}${slotIndex === gmegaSlot ? ' mega' : ''}`;
						}).join(', ');
						gmegaBattle.choose('p1', 'move 2, move 2');
						assert(gmegaBattle.choose('p2', choices));
						assert(gmegaBattle.p2.active[gmegaSlot].species.isGMega, `${key} must transform through its G-Mega trigger`);
					} finally {
						gmegaBattle.destroy();
					}
				}
			}
		}
	});

	it('validates all Elite Four floors and champions for special limits and native doubles openings', () => {
		const eliteFloors = [165, 175, 180, 185];
		const championFloor = 190;
		const eliteIds = TrainerBossData.filter(entry => entry.role === 'elitefour').map(entry => entry.id);
		const championIds = TrainerBossData.filter(entry => entry.role === 'champion').map(entry => entry.id);
		const nonRestrictedTags = new Set(['Sub-Legendary', 'Mythical', 'Ultra Beast', 'Paradox']);
		const restrictedTag = 'Restricted Legendary';
		const validator = new TeamValidator('gen9fantasyrogue');
		assert.equal(Object.keys(TrainerBossDoublesHighTier).length, eliteIds.length * eliteFloors.length + championIds.length);
		for (const id of eliteIds) {
			for (const floor of eliteFloors) {
				const key = `${id}:${floor}`;
				const team = Teams.import(TrainerBossDoublesHighTier[key]);
				assert(team, key);
				assert.equal(team.length, 6, `${key} must use the complete six-member high-tier team`);
				assert.equal(validator.validateTeam(team), null, key);
				const species = team.map(member => Dex.mod('gen9fantasy').species.get(member.species));
				const restricted = species.filter(mon => mon.tags.includes(restrictedTag));
				const nonRestricted = species.filter(mon => mon.tags.some(tag => nonRestrictedTags.has(tag)));
				assert.equal(restricted.length, 0, `${key} cannot use a restricted legendary`);
				assert(nonRestricted.length <= 3, `${key} exceeds the Elite Four non-restricted legendary budget`);
				const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true).find(entry => entry.trainer.id === id);
				assert(candidate, key);
				assert.equal(candidate.team.length, 6, key);
				assert(candidate.team.every(member => member.level === PreviewBalance.bossLevel(floor)), key);
				const battle = new Battle({
					format: new Format({ name: 'Elite Four doubles roster', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }), seed: [81, 82, 83, floor],
					p1: { name: 'Doubles QA', team: Teams.pack([
						set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
						set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
					]) },
					p2: { name: id, team: Teams.pack(candidate.team) },
				});
				try {
					const choices = battle.p2.activeRequest.active.map(active => {
						const slot = active.moves.findIndex(move => move.id === 'protect');
						const selected = active.moves[slot >= 0 ? slot : 0];
						const target = ['normal', 'adjacentFoe', 'any'].includes(selected.target) ? ' 1' : '';
						return `move ${slot >= 0 ? slot + 1 : 1}${target}`;
					}).join(', ');
					battle.choose('p1', 'move 2, move 2');
					assert(battle.choose('p2', choices), `${key} must accept legal native double choices (${choices}; ${JSON.stringify(battle.p2.activeRequest.active.map(active => active.moves.map(move => move.id)))}; ${battle.log.slice(-3).join(' ')})`);
				} finally {
					battle.destroy();
				}
			}
		}
		for (const id of championIds) {
			const key = `${id}:${championFloor}`;
			const team = Teams.import(TrainerBossDoublesHighTier[key]);
			assert(team, key);
			assert.equal(team.length, 6, `${key} must use the complete six-member champion team`);
			assert.equal(validator.validateTeam(team), null, key);
			const species = team.map(member => Dex.mod('gen9fantasy').species.get(member.species));
			assert(species.filter(mon => mon.tags.includes(restrictedTag)).length <= 1, `${key} exceeds the one restricted legendary limit`);
			const candidate = trainerBossCandidates(championFloor, PreviewBalance.bossLevel(championFloor), true).find(entry => entry.trainer.id === id);
			assert(candidate, key);
			assert.equal(candidate.team.length, 6, key);
			const battle = new Battle({
				format: new Format({ name: 'Champion doubles roster', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }), seed: [91, 92, 93, championFloor],
				p1: { name: 'Doubles QA', team: Teams.pack([
					set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
					set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
				]) },
				p2: { name: id, team: Teams.pack(candidate.team) },
			});
			try {
				const choices = battle.p2.activeRequest.active.map(active => {
					const slot = active.moves.findIndex(move => move.id === 'protect');
					const selected = active.moves[slot >= 0 ? slot : 0];
					const target = ['normal', 'adjacentFoe', 'any'].includes(selected.target) ? ' 1' : '';
					return `move ${slot >= 0 ? slot + 1 : 1}${target}`;
				}).join(', ');
				battle.choose('p1', 'move 2, move 2');
				assert(battle.choose('p2', choices), `${key} must accept legal native double choices`);
			} finally {
				battle.destroy();
			}
		}
		const transformations = [
			['lorelei', 165, 'froslassite', 'mega'],
			['lance', 165, 'gyaradosite', 'mega'],
			['lacey', 165, 'floettite', 'mega'],
			['acerola', 165, 'darkranite', 'mega'],
			['larry', 165, 'staraptite', 'mega'],
			['larry', 165, 'gmegawishingstar', 'gmega'],
			['steven', 190, 'metagrossite', 'mega'],
			['leon', 190, 'charizarditey', 'mega'],
			['lance', 190, 'gyaradosite', 'mega'],
			['diantha', 190, 'gardevoirite', 'mega'],
			['cynthia', 190, 'garchompite', 'mega'],
			['ash', 190, 'gmegawishingstar', 'gmega'],
			['ash', 190, 'lucarionite', 'mega'],
		];
		for (const [id, floor, item, kind] of transformations) {
			const candidate = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor), true).find(entry => entry.trainer.id === id);
			assert(candidate, `${id}:${floor}`);
			const roster = candidate.team.slice();
			const transformIndex = roster.findIndex(member => toID(member.item) === item);
			assert(transformIndex >= 0, `${id}:${floor} must carry ${item}`);
			if (transformIndex > 1) [roster[1], roster[transformIndex]] = [roster[transformIndex], roster[1]];
			const battle = new Battle({
				format: new Format({ name: `${id} ${kind} verification`, mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
				seed: [101, 102, 103, floor],
				p1: { name: 'Doubles QA', team: Teams.pack([
					set('Garchomp', 'Rough Skin', 100, ['Earthquake', 'Protect']),
					set('Talonflame', 'Flame Body', 100, ['Tailwind', 'Protect']),
				]) },
				p2: { name: id, team: Teams.pack(roster) },
			});
			try {
				const transformSlot = battle.p2.activeRequest.active.findIndex(active => kind === 'gmega' ? active.canGMegaEvo : active.canMegaEvo);
				assert(transformSlot >= 0, `${id}:${floor} must expose ${kind} in the native battle request`);
				const choices = battle.p2.activeRequest.active.map((active, index) => {
					const slot = active.moves.findIndex(move => move.id === 'protect');
					assert(slot >= 0, `${id}:${floor} transformation opener needs Protect`);
					return `move ${slot + 1}${index === transformSlot ? ' mega' : ''}`;
				}).join(', ');
				battle.choose('p1', 'move 2, move 2');
				assert(battle.choose('p2', choices), `${id}:${floor} must accept the transformation choice`);
				assert(kind === 'gmega' ? battle.p2.active[transformSlot].species.isGMega : battle.p2.active[transformSlot].species.isMega,
					`${id}:${floor} must complete the ${kind} transformation`);
			} finally {
				battle.destroy();
			}
		}
	});

	it('keeps cross-leader doubles roster reuse to at most three identities per species', () => {
		const leadersBySpecies = new Map();
		const entries = [
			...Object.entries(TrainerBossDoublesSamples).map(([key, sample]) => [key, sample.team]),
			...Object.entries(TrainerBossDoublesAuthored),
		];
		for (const [key, source] of entries) {
			const leader = key.split(':')[0];
			for (const member of Teams.import(source) || []) {
				const species = Dex.mod('gen9fantasy').species.get(member.species).baseSpecies;
				if (!leadersBySpecies.has(species)) leadersBySpecies.set(species, new Set());
				leadersBySpecies.get(species).add(leader);
			}
		}
		for (const [species, leaders] of leadersBySpecies) {
			assert(leaders.size <= 3, `${species} appears across ${leaders.size} different gym leaders`);
		}
	});

	it('loads all authored rosters into native battles with only the floor 20/40 gym item policy applied', () => {
		assert.equal(TrainerBossData.length, 156);
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
					assert.equal(mon.level, PreviewBalance.bossLevel(floor), 'Authored trainer rosters use one floor level');
					assert.equal(candidate.team[index].ability, dex.abilities.get(authored.ability).name);
					assert.equal(mon.baseAbility, species.id === 'greninjaashfantasy' ? 'moldbreaker' : toID(authored.ability));
					// Entry effects can immediately consume Booster Energy or a terrain seed.
					assert.equal(mon.item || mon.lastItem, source.role === 'gym' && floor <= 40 ? '' : toID(authored.item));
					assert.deepEqual(mon.baseMoves, authored.moves.map(move => dex.moves.get(move).id));
					const hiddenPower = authored.moves.map(move => dex.moves.get(move)).find(move => move.id === 'hiddenpower');
					if (hiddenPower) assert.equal(mon.hpType, hiddenPower.type);
					assert.deepEqual(mon.set.evs, authored.evs);
					assert.deepEqual(mon.set.ivs, authored.ivs);
					assert.equal(mon.set.nature, authored.nature || 'Hardy');
					if (authored.gender) assert.equal(mon.gender, authored.gender);
					assert.equal(!!mon.set.shiny, !!authored.shiny);
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
		assert.deepEqual(mon.moves, ['Calm Mind', 'Stored Power', 'Dazzling Gleam', 'Roost+']);
		assert.deepEqual(mon.evs, { hp: 152, atk: 0, def: 244, spa: 0, spd: 0, spe: 112 });
	});
	it('uses the exact new Valerie final roster and keeps her earlier stages unchanged', () => {
		const team = trainerBossCandidates(160, 90).find(c => c.trainer.id === 'valerie').team;
		assert.deepEqual(team.map(s => s.species), ['Sylveon', 'Cresselia-Fantasy', 'Weezing-Galar-Fantasy',
			'Tapu Bulu-Fantasy', 'Iron Valiant', 'Delphox-Fantasy']);
		assert.equal(team[0].item, 'Grassy Seed');
		assert.equal(team[1].ability, Dex.mod('gen9fantasy').abilities.get('meimenggongyou').name);
		assert(team[2].moves.includes(Dex.mod('gen9fantasy').moves.get('mistyexplosion').name));
		assert.equal(team[4].item, 'Fairy Gem');
		assert(trainerBossCandidates(140, 80).find(c => c.trainer.id === 'valerie').team.some(s => s.species === 'Mienshao-Fantasy'));
	});
	it('reserves hidden champion Lance for an encountered or already announced Elite Four Lance', () => {
		const candidates = trainerBossCandidates(190, 100);
		const ordinary = candidates.filter(c => c.trainer.id !== 'lance');
		for (let i = 0; i < ordinary.length; i++) {
			const run = {floor: 190, trainerHistory: {gyms: [], eliteFour: ['rika']}};
			assert.equal(chooseTrainer(run, candidates, () => i).trainer.id, ordinary[i].trainer.id);
		}
		for (const trainerHistory of [{gyms: [], eliteFour: ['lance']},
			{gyms: [], eliteFour: [], elitePlan: {165: 'lance', 175: 'rika', 180: 'lorelei', 185: 'lacey'}}]) {
			assert.equal(chooseTrainer({floor: 190, trainerHistory}, candidates,
				() => {throw Error('guaranteed opponent must not consume random draw');}).trainer.id, 'lance');
		}
	});
	it('repairs an unplayed legacy champion preview after Lance, but preserves an active saved champion', () => {
		const old = structuredClone(content.floors[190][0]);
		const steven = old.encounters[0].trainerCandidates.find(c => c.trainer.id === 'steven');
		Object.assign(old.encounters[0], steven); delete old.encounters[0].trainerCandidates;
		store.change(user, a => {
			a.run.floor = 188; a.run.trainerHistory = {gyms: [], eliteFour: ['lance']};
			a.run.bossPreviews = {190: old};
		});
		engine.migrate(user);
		assert.equal(account().run.bossPreviews[190].encounters[0].trainer.id, 'lance');
		store.change(user, a => {a.run.floor = 190; a.run.node = old; a.run.bossPreviews[190] = old;});
		engine.migrate(user);
		assert.equal(account().run.node.encounters[0].trainer.id, 'steven');
	});
	it('allows every authored Mega and G-Mega forme to transform through its normal battle trigger', () => {
		const seen = new Set();
		for (const source of TrainerBossData) {
			const floor = source.floor || (source.role === 'elitefour' ? 165 : 190);
			const team = trainerBossCandidates(floor, PreviewBalance.bossLevel(floor)).find(entry => entry.trainer.id === source.id).team;
			for (const [index, authored] of Teams.import(source.team).entries()) {
				const target = Dex.mod('gen9fantasy').species.get(authored.species);
				const configuration = `${target.id}:${toID(authored.item)}:${authored.moves.map(toID).join(',')}`;
				if (!target.forme.includes('Mega') || seen.has(configuration)) continue;
				seen.add(configuration);
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
		const expected = new Set(TrainerBossData.flatMap(entry => Teams.import(entry.team))
			.filter(mon => Dex.mod('gen9fantasy').species.get(mon.species).forme.includes('Mega'))
			.map(mon => `${toID(mon.species)}:${toID(mon.item)}:${mon.moves.map(toID).join(',')}`));
		assert.deepEqual(seen, expected);
	});
	it('draws eight distinct gym leaders and persists their team and portrait through defeat, retreat and reload', () => {
		const met = [];
		for (const floor of [20, 40, 60, 80, 100, 120, 140, 160]) {
			const encounter = enter(floor);
			while (account().run.story?.stage === 'gymgift') command('storynext', {value: storyView(account(), false, false).key});
			while (account().run.blessings?.beforeGym) {
				const reward = account().run.blessings.pending[0];
				command('blessingreward', {member: reward.id, value: reward.options[0]});
			}
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
			assert.equal(enter(190).trainer.id === 'lance', met.includes('lance'));
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
