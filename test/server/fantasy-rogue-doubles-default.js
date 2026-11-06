'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { Dex } = require('../../dist/sim/dex');
const { Format } = require('../../dist/sim/dex-formats');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createBiomeRoutes } = require('../../dist/server/fantasy-rogue/biome-routes');
const { createPreviewContent, PreviewBalance } = require('../../dist/server/fantasy-rogue/preview-content');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');

describe('Fantasy Rogue solo doubles defaults', function () {
	this.timeout(20000);
	let store;
	afterEach(() => store?.close());

	function makeMon(species, moves) {
		return {
			species, moves, level: 50, nature: 'Hardy',
			ability: Dex.mod('gen9fantasy').species.get(species).abilities['0'],
		};
	}

	it('opts new configured runs into doubles while the old save mode stays frozen', () => {
		const legacyContent = createPreviewContent();
		const doubleContent = createPreviewContent({ doubleBattle: true });
		assert.equal(legacyContent.doubleBattle, false);
		assert.equal(doubleContent.doubleBattle, true);
		assert(doubleContent.compatibleVersions.includes(PreviewBalance.version));

		store = new RogueStore(':memory:');
		const user = 'doublesmodeqa';
		const engine = new RogueEngine(store, doubleContent, () => 0);
		engine.command(user, { id: randomUUID(), revision: store.get(user).revision, action: 'start', starters: ['bulbasaur'] });
		assert.equal(store.get(user).run.doubleBattle, true);
	});

	it('has no team preview and rotates every member of the full six-mon party', () => {
		const rogueFormat = Dex.formats.get('gen9fantasyroguedoubles');
		assert.equal(rogueFormat.gameType, 'doubles');
		assert(!rogueFormat.ruleset.includes('Team Preview'));
		const format = new Format({ name: 'Rogue doubles rotation fixture', mod: rogueFormat.mod,
			gameType: rogueFormat.gameType, ruleset: rogueFormat.ruleset });
		const team = (species, moves) => Array.from({ length: 6 }, () => makeMon(species, moves));
		const battle = new Battle({
			format, strictChoices: true, seed: [1, 2, 3, 4],
			p1: { team: team('Pikachu', ['Thunderbolt', 'Protect']) },
			p2: { team: ['Magikarp', 'Magikarp', 'Rattata', 'Rattata', 'Geodude', 'Geodude']
				.map(species => makeMon(species, ['Splash'])) },
		});
		try {
			assert.equal(battle.p1.pokemon.length, 6);
			assert.equal(battle.p1.active.length, 2);
			assert.equal(battle.p1.activeRequest.teamPreview, undefined);
			battle.makeChoices('move 1 1, move 1 2', 'move 1, move 1');
			assert.deepEqual(battle.p2.activeRequest.forceSwitch, [true, true]);
			assert.equal(battle.p2.pokemon.filter(mon => !mon.fainted).length, 4);
			battle.p2.choose('switch 3, switch 4');
			battle.commitChoices();
			assert.deepEqual(battle.p2.active.map(mon => mon.species.name), ['Rattata', 'Rattata']);
		} finally {
			battle.destroy();
		}
	});

	it('selects the authored double roster for gym, 100-layer and Elite Four bosses', () => {
		store = new RogueStore(':memory:');
		const user = 'doublebossqa';
		const content = createPreviewContent({ doubleBattle: true });
		const engine = new RogueEngine(store, content, () => 0);
		const command = (action, extra = {}) => engine.command(user, {
			id: randomUUID(), revision: store.get(user).revision, action, ...extra,
		});
		command('start', { starters: ['bulbasaur'] });
		for (const [floor, expectedSize] of [[20, 2], [100, 4], [165, 6]]) {
			store.change(user, account => {
				const run = account.run;
				run.floor = floor;
				run.phase = 'choose';
				run.choices = structuredClone(content.floors[floor]);
				run.trainerHistory = { gyms: [], eliteFour: [] };
				delete run.bossPreviews;
				delete run.story;
			});
			command('select', { value: 'boss' });
			const encounter = store.get(user).run.node.encounters[0];
			assert.equal(encounter.team.length, expectedSize, `floor ${floor}`);
			assert(encounter.trainer, `floor ${floor} should resolve to a trainer`);
		}
	});

	it('gives new solo elite wild encounters a second opponent without changing legacy route packs', () => {
		const content = createPreviewContent();
		const routeTemplates = [content.routePools[1].find(node => node.kind === 'wild'),
			content.routePools[1].find(node => node.kind === 'elite')];
		const doubleRoutes = createBiomeRoutes(1, routeTemplates, undefined, max => Math.floor(max / 2),
			undefined, undefined, [], [], { doubleBattle: true });
		const legacyRoutes = createBiomeRoutes(1, routeTemplates, undefined, max => Math.floor(max / 2));
		const wildPack = doubleRoutes.find(node => node.kind === 'wild').encounters[0];
		const elite = doubleRoutes.find(node => node.kind === 'elite').encounters[0];
		assert([3, 4].includes(wildPack.team.length));
		assert.equal(elite.team.length, 2);
		assert.equal(legacyRoutes.find(node => node.kind === 'elite').encounters[0].team.length, 1);
	});
});
