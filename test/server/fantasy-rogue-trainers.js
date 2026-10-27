'use strict';
const { commandAfterOpening } = require('../fixtures/fantasy-rogue');

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { Dex, toID } = require('../../dist/sim/dex');
const { Teams } = require('../../dist/sim/teams');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent, PreviewBalance } = require('../../dist/server/fantasy-rogue/preview-content');
const { TrainerBossData } = require('../../dist/server/fantasy-rogue/trainer-boss-data');
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

	it('loads all 144 gym, 6 Elite Four and 6 champion rosters into native battles without rewriting authored choices', () => {
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
					assert.equal(mon.item || mon.lastItem, toID(authored.item));
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
