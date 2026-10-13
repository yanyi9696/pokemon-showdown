'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { throwRogueBall } = require('../../dist/sim/fantasy-rogue');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue healing and capture presentation', () => {
	it('heals a poisoned injured partner and rejects a full-health target without consuming another potion', () => {
		const store = new RogueStore(':memory:');
		try {
			const definition = content();
			definition.items.push({ id: 'potion', name: '伤药', kind: 'heal', amount: 20, price: 150 });
			const engine = new RogueEngine(store, definition);
			const cmd = (action, details) => engine.command('healqa', { id: randomUUID(), revision: store.get('healqa').revision, action, ...details });
			cmd('start', { starters: ['bulbasaur'] });
			store.change('healqa', account => {
				account.run.team[0].hp = 5; account.run.team[0].status = 'psn'; account.run.bag.potion = 2;
			});
			const mon = store.get('healqa').run.team[0];
			cmd('use', { member: mon.id, value: 'potion' });
			const run = store.get('healqa').run;
			assert.equal(run.team[0].hp, mon.maxhp); assert.equal(run.team[0].status, 'psn'); assert.equal(run.bag.potion, 1);
			assert.throws(() => cmd('use', { member: mon.id, value: 'potion' }), /治疗道具/);
			assert.equal(store.get('healqa').run.bag.potion, 1);
		} finally { store.close(); }
	});
	for (const success of [false, true]) {
		it(`reports a ${success ? 'successful' : 'failed'} capture before the result without additional RNG`, () => {
			const mon = createRoguePokemon(set('Bulbasaur', 'Overgrow', 5, ['Growl']), stats(0));
			const battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
				fantasyRogue: { encounterId: 'capture:test', team: [mon], boosts: stats(0), catchable: true,
					bag: { greatball: 2 }, balls: [{ id: 'greatball', name: '超级球', chance: success ? 1 : 0 }] },
				p1: { name: 'Player', team: [mon.set] }, p2: { name: 'Wild', team: [set('Magikarp', 'Swift Swim', 5, ['Splash'])] } });
			try {
				battle.makeChoices('team 1', 'team 1');
				let draws = 0;
				battle.randomChance = () => { draws++; return success; };
				throwRogueBall(battle, 'greatball');
				assert.equal(draws, 1); assert.equal(battle.fantasyRogue.bag.greatball, 1);
				const line = battle.log.findIndex(entry => entry.startsWith('|-roguecapture|'));
				assert(line >= 0); assert(battle.log[line].includes(`|greatball|${success ? 'success|3' : 'failure|1'}|normal`));
				assert(battle.log[line + 1].includes(success ? '成功捕捉' : '挣脱')); assert.equal(battle.ended, success);
			} finally { battle.destroy(); }
		});
	}
});
