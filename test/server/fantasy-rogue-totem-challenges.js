'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { rogueSwitchIn } = require('../../dist/sim/fantasy-rogue');
const { challengeNode } = require('../../dist/server/fantasy-rogue/optional-challenges');
const { TOTEM_CHALLENGES } = require('../../dist/server/fantasy-rogue/challenge-totems');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue Totem challenge battles', () => {
	for (const def of TOTEM_CHALLENGES) for (const mode of ['singles', 'doubles', 'multi']) {
		it(`${def.id} applies its aura once only to the enemy in ${mode}`, () => {
			const node = challengeNode(def.id, def.from), encounter = node.encounters[0];
			const own = createRoguePokemon(set('Blissey', 'Natural Cure', 90, ['Splash', 'Haze']), stats(0));
			const other = createRoguePokemon(set('Blissey', 'Natural Cure', 90, ['Splash']), stats(0));
			const state = { encounterId: def.id, team: mode === 'multi' ? [own] : [own, other], boosts: stats(0), bag: {}, balls: [],
				catchable: false, totemTrial: encounter.totemTrial,
				...(mode === 'multi' ? { partner: { team: [other], boosts: stats(0) } } : {}) };
			const battle = new Battle({ formatid: mode === 'multi' ? 'gen9fantasyroguecoop' :
				mode === 'doubles' ? 'gen9fantasyroguedoubles' : 'gen9fantasyrogue',
			fantasyRogue: state, seed: [1, 2, 3, 4],
			p1: { team: mode === 'multi' ? [own.set] : [own.set, other.set] },
			p2: { team: mode === 'multi' ? [encounter.team[0]] : encounter.team },
			...(mode === 'multi' ? { p3: { team: [other.set] }, p4: { team: [encounter.team[1]] } } : {}),
			});
			let restored;
			try {
				if (battle.requestState === 'teampreview') battle.makeChoices(...battle.sides.map(s =>
					'team ' + s.pokemon.map((_, i) => i + 1).join('')));
				const boss = battle.p2.active[0];
				assert.equal(boss.species.name, def.totem.species);
				for (const [stat, amount] of Object.entries(def.totem.boosts)) assert.equal(boss.boosts[stat], amount);
				assert(Object.values(battle.p1.active[0].boosts).every(v => v === 0));
				if (mode === 'multi') assert(Object.values(battle.p4.active[0].boosts).every(v => v === 0));
				const before = { ...boss.boosts }; rogueSwitchIn(boss); assert.deepEqual(boss.boosts, before);
				restored = Battle.fromJSON(battle.toJSON());
				const savedBoss = restored.p2.active[0]; savedBoss.clearBoosts(); rogueSwitchIn(savedBoss);
				assert(Object.values(savedBoss.boosts).every(v => v === 0), 'cleared aura must not reapply after recovery');
				assert.equal(encounter.catchable, false); assert.equal(state.catchable, false);
			} finally { battle.destroy(); restored?.destroy(); }
		});
	}
});
