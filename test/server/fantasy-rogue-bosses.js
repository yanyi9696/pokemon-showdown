'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { Dex, toID } = require('../../dist/sim/dex');
const { Teams } = require('../../dist/sim/teams');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { FantasyEliteBosses, eliteBossCandidates } = require('../../dist/server/fantasy-rogue/elite-bosses');
const { validateContent } = require('../../dist/server/fantasy-rogue/content');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { WorldBuilder } = require('../../dist/server/fantasy-ai/world');
const { reconstructWorld } = require('../../dist/server/fantasy-ai/reconstruction');
const { enumerateRequestChoices } = require('../../dist/server/fantasy-ai/actions');
const { set, stats } = require('../fixtures/fantasy-rogue');

function nativeBattle(opponents, tera = { player: false, opponent: false }, partySize = 1) {
	const team = Array.from({ length: partySize }, (_, i) => createRoguePokemon(
		set('Blissey', 'Natural Cure', 100, ['Protect', 'Soft-Boiled']), stats(0), `member${i}`
	));
	const battle = new Battle({
		formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
		fantasyRogue: { encounterId: 'test:boss', team, boosts: stats(0), bag: {}, balls: [], catchable: false, tera },
		p1: { name: 'Player', team: Teams.pack(team.map(mon => mon.set)) },
		p2: { name: 'Opponent', team: Teams.pack(opponents) },
	});
	battle.choose('p1', 'team ' + team.map((mon, i) => i + 1).join(''));
	battle.choose('p2', 'team ' + opponents.map((mon, i) => i + 1).join(''));
	return battle;
}

describe('Fantasy Rogue elite pools and Tera events', () => {
	let store, engine;
	const user = 'eliteqatester';
	const account = () => store.get(user);
	const cmd = (action, details = {}) => engine.command(user, {
		id: crypto.randomUUID(), revision: account().revision, action, ...details,
	});
	function restBefore(floor) {
		store.change(user, saved => {
			saved.run.floor = floor - 1;
			saved.run.phase = 'rest';
			saved.run.node = structuredClone(engine.content.floors[floor - 1][0]);
		});
	}
	function finish(won = false) {
		const run = account().run;
		engine.settle(user, run.battle.token, {
			encounterId: run.battle.encounterId, won, team: run.team, bag: run.bag,
		});
	}
	beforeEach(() => {
		store = new RogueStore(':memory:');
		engine = new RogueEngine(store, createPreviewContent());
		cmd('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());

	it('runs all 54 authored opponents at their exact levels, with their moves, abilities, IVs and Tera', () => {
		const dex = Dex.mod('gen9fantasy');
		let count = 0;
		for (const [floor, pool] of Object.entries(FantasyEliteBosses)) {
			assert.equal(pool.candidates.length, 6);
			assert.equal(new Set(pool.candidates.map(candidate => toID(candidate.species))).size, 6);
			for (const [index, candidate] of eliteBossCandidates(Number(floor)).entries()) {
				const original = pool.candidates[index];
				const battle = nativeBattle([candidate], { player: false, opponent: true });
				try {
					const mon = battle.p2.active[0];
					assert.equal(mon.species.id, toID(original.species));
					assert.equal(mon.level, 5 + Number(floor) / 2);
					assert.equal(mon.baseAbility, toID(original.ability));
					assert.deepEqual(mon.baseMoves, original.moves.map(toID));
					assert.equal(mon.item, toID(original.item));
					if (original.gender) assert.equal(mon.gender, original.gender);
					assert.deepEqual(mon.set.ivs, { ...stats(31), ...original.ivs });
					assert.equal(mon.teraType, dex.species.get(original.species).defaultTeraType);
					assert(!battle.p1.activeRequest.active[0].canTerastallize);
					assert.equal(battle.p2.activeRequest.active[0].canTerastallize, mon.teraType);
					battle.choose('p1', 'move 1');
					assert(battle.choose('p2', 'move 1 terastallize'));
					assert(battle.log.some(line => line.startsWith('|-terastallize|p2')));
					count++;
				} finally { battle.destroy(); }
			}
		}
		assert.equal(count, 54);
	});
	it('validates every candidate, including those beyond the default team', () => {
		const invalid = createPreviewContent();
		invalid.floors[10][0].encounters[0].candidates[2].moves[0] = 'not-a-move';
		assert.throws(() => validateContent(invalid), /招式无效/);
		const wrongFloor = createPreviewContent();
		wrongFloor.floors[20][0].encounters[0].candidates = eliteBossCandidates(10);
		assert.throws(() => validateContent(wrongFloor), /固定幻想精英/);
	});
	it('draws any pool member once and persists the choice across retries, duplicate requests and engine reloads', () => {
		const originalRandomInt = crypto.randomInt;
		try {
			for (const [floor, pool] of Object.entries(FantasyEliteBosses)) {
				for (let index = 0; index < pool.candidates.length; index++) {
					let draws = 0;
					crypto.randomInt = max => {
						if (max === 256) return 128; // Gender is resolved once, before saving the encounter.
						assert.equal(max, pool.candidates.length); draws++; return index;
					};
					restBefore(Number(floor));
					const request = { id: crypto.randomUUID(), revision: account().revision, action: 'continue' };
					engine.command(user, request);
					const selected = account().run.node;
					assert.equal(toID(selected.encounters[0].team[0].species), toID(pool.candidates[index].species));
					assert(['M', 'F', 'N'].includes(selected.encounters[0].team[0].gender));
					assert(!selected.encounters[0].candidates);
					engine.command(user, request);
					cmd('battle'); finish();
					engine = new RogueEngine(store, createPreviewContent());
					cmd('battle'); engine.recover(user, account().run.battle.token);
					assert.deepEqual(account().run.node, selected);
					assert.equal(draws, 1);
				}
			}
		} finally { crypto.randomInt = originalRandomInt; }
	});
	it('grants opposing Tera only on the nine elite Boss floors, never ordinary elites, gyms or final bosses', () => {
		const allowed = [10, 30, 50, 70, 90, 110, 130, 150, 170];
		for (const [floor, nodes] of Object.entries(engine.content.floors)) {
			for (const node of nodes.filter(node => node.encounters.length)) {
				store.change(user, saved => {
					Object.assign(saved.run, { floor: Number(floor), phase: 'battle', node, encounter: 0,
						battle: { token: 'test', encounterId: 'test' } });
				});
				assert.deepEqual(engine.battleState(user).tera, { player: false, opponent: allowed.includes(Number(floor)) });
			}
		}
	});
	it('rejects forged event commands and client flags; unlocks only through the trusted event handler', () => {
		assert.equal(account().run.teraUnlocked, false);
		assert.throws(() => cmd('unlocktera'), /未知/);
		cmd('select', { value: 'wild0', teraUnlocked: true });
		cmd('battle', { teraUnlocked: true, tera: { player: true, opponent: true } });
		assert.deepEqual(engine.battleState(user).tera, { player: false, opponent: false });
		assert.throws(() => engine.unlockTerastallization(user), /不能解锁/);
		finish();
		engine.unlockTerastallization(user);
		assert.equal(account().run.teraUnlocked, true);
		cmd('battle');
		assert.equal(engine.battleState(user).tera.player, true);
		finish();
		assert.equal(account().run.teraUnlocked, true, 'An encounter loss preserves event unlocks');
		restBefore(10);
		engine.unlockTerastallization(user); cmd('continue');
		assert.equal(account().run.checkpoint.teraUnlocked, true);
		cmd('battle'); finish();
		assert.equal(account().run.teraUnlocked, true, 'Earlier-floor unlock survives retry');
		cmd('abandon'); cmd('start', { starters: ['bulbasaur'] });
		assert.equal(account().run.teraUnlocked, false, 'New adventures start locked');
	});
	for (const version of ['preview-2026-09-v2', 'preview-2026-09-v3']) {
		it(`preserves the selected enemy when upgrading ${version}, and rejects unknown versions`, () => {
			restBefore(10); cmd('continue');
			store.change(user, saved => {
				saved.run.contentVersion = version;
				saved.run.node.encounters[0].team = [set('Butterfree', 'Compound Eyes', 10, ['Gust'])];
				delete saved.run.teraUnlocked;
				delete saved.run.checkpoint.teraUnlocked;
			});
			const original = account().run;
			cmd('battle');
			assert.equal(account().run.contentVersion, engine.content.version);
			assert.deepEqual(account().run.node, original.node);
			assert.deepEqual(account().run.team, original.team);
			assert.equal(engine.battleState(user).tera.player, false);
			finish();
			assert.equal(!!account().run.teraUnlocked, false);
			store.change(user, saved => { saved.run.contentVersion = 'incompatible-content'; });
			assert.throws(() => cmd('battle'), /内容版本/);
		});
	}
});

describe('Fantasy Rogue native Tera permissions', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	it('omits locked Tera requests and rejects direct choices and transformation calls on both sides', () => {
		battle = nativeBattle([set('Magikarp', 'Swift Swim', 10, ['Splash'])]);
		for (const side of battle.sides) {
			assert.equal(side.activeRequest.side.fantasyRogueTera, false);
			assert(!side.activeRequest.active[0].canTerastallize);
			assert.equal(battle.choose(side.id, 'move 1 terastallize'), false);
			battle.actions.terastallize(side.active[0]);
			assert(!side.active[0].terastallized);
			side.active[0].clearVolatile();
			assert(!battle.actions.canTerastallize(side.active[0]));
			assert(!side.active[0].canTerastallize);
		}
		assert(!battle.log.some(line => line.startsWith('|-terastallize|')));
	});
	it('lets an unlocked party use Tera once per native battle without unlocking the wild opponent', () => {
		battle = nativeBattle([set('Magikarp', 'Swift Swim', 10, ['Splash'])], { player: true, opponent: false }, 2);
		assert(battle.p1.activeRequest.active[0].canTerastallize);
		assert(!battle.p2.activeRequest.active[0].canTerastallize);
		assert(battle.choose('p1', 'move 1 terastallize')); battle.choose('p2', 'move 1');
		assert(battle.log.some(line => line.startsWith('|-terastallize|p1')));
		assert(battle.p1.pokemon.every(mon => !mon.canTerastallize));
		battle.choose('p1', 'switch 2'); battle.choose('p2', 'move 1');
		assert(!battle.p1.activeRequest.active[0].canTerastallize);
		assert.equal(battle.choose('p1', 'move 1 terastallize'), false);
		battle.destroy();
		battle = nativeBattle([set('Magikarp', 'Swift Swim', 10, ['Splash'])], { player: true, opponent: false });
		assert(battle.p1.activeRequest.active[0].canTerastallize);
	});
	it('keeps own Tera permission through AI reconstruction without disclosing the player event unlock', () => {
		const foes = [set('Magikarp', 'Swift Swim', 10, ['Splash']), set('Squirtle', 'Torrent', 10, ['Tackle'])];
		let lockedObservation;
		for (const player of [false, true]) {
			battle = nativeBattle(foes, { player, opponent: false });
			const view = new InformationView({ ownSide: 'p2', difficulty: 'normal', partySize: 1 });
			view.setOpponentMoves([{ species: 'Blissey', moves: ['protect', 'softboiled'] }]);
			view.receiveUpdate(battle.log.join('\n'));
			const observation = view.observe(battle.p2.activeRequest);
			if (player) assert.deepEqual(observation, lockedObservation);
			else lockedObservation = observation;
			const world = new WorldBuilder({ format: 'gen9fantasyrogue', packedTeam: Teams.pack(foes) }).build(observation)[0];
			const restored = reconstructWorld(world, [1, 2, 3, 4]);
			try {
				assert.equal(restored.p2.fantasyRogueTera, false);
				assert.equal(restored.p1.fantasyRogueTera, undefined);
				assert(restored.p2.pokemon.every(mon => !mon.canTerastallize));
				assert(!enumerateRequestChoices(restored.p2.activeRequest).some(choice => choice.includes('terastallize')));
				restored.actions.terastallize(restored.p2.active[0]);
				assert(!restored.p2.active[0].terastallized);
			} finally { restored.destroy(); }
			battle.destroy(); battle = undefined;
		}
	});
	it('leaves ordinary Fantasy battles unchanged', () => {
		battle = new Battle({ formatid: 'gen9fantasy',
			p1: { name: 'Player', team: [set()] }, p2: { name: 'Opponent', team: [set()] } });
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		assert.equal(battle.p1.activeRequest.side.fantasyRogueTera, undefined);
		assert.equal(battle.p1.activeRequest.active[0].canTerastallize, 'Grass');
		assert(battle.choose('p1', 'move 1 terastallize')); battle.choose('p2', 'move 1');
		assert(battle.log.some(line => line.startsWith('|-terastallize|p1')));
	});
});
