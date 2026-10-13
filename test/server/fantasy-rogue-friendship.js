'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Dex } = require('../../dist/sim/dex');
const { emptyRogueStats } = require('../../dist/sim/fantasy-rogue');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { makeEncounterSet } = require('../../dist/server/fantasy-rogue/encounter-sets');
const { createRoguePokemon, evolutionOptions, gainExperience, initializeExperience, rebuildMember } =
	require('../../dist/server/fantasy-rogue/progression');
const { partyEvolutions } = require('../../dist/server/fantasy-rogue/party-evolution');
const { friendship, changeFriendship, battleFriendship, floorFriendship, rogueTime } =
	require('../../dist/server/fantasy-rogue/friendship');

function member(species, happiness = 70, level = 10, moves = ['tackle']) {
	const mon = createRoguePokemon({ ...makeEncounterSet(species, level), happiness, moves }, emptyRogueStats());
	initializeExperience(mon);
	return mon;
}
const runFor = (mon, floor = 1) => ({ team: [mon], bag: {}, boosts: emptyRogueStats(), floor });

describe('Fantasy Rogue friendship and evolution conditions', () => {
	it('cycles two day floors, dusk, two night floors, dawn, including across fixed floors', () => {
		assert.deepEqual(Array.from({ length: 12 }, (_, i) => rogueTime(i + 1)),
			['day', 'day', 'dusk', 'night', 'night', 'dawn', 'day', 'day', 'dusk', 'night', 'night', 'dawn']);
	});
	it('gates every official friendship evolution on friendship, ready for manual evolution without another level', () => {
		const species = Dex.mod('gen9').species.all().filter(s => s.num > 0 && s.prevo && !s.forme && s.evoType === 'levelFriendship');
		assert.equal(species.length, 18);
		for (const child of species) {
			const mon = member(child.prevo, 159);
			const run = runFor(mon, child.evoCondition === 'at night' ? 4 : 1);
			assert(!evolutionOptions(mon, run).some(e => e.species === child.name), child.name);
			mon.set.happiness = 160;
			assert(evolutionOptions(mon, run).some(e => e.species === child.name), child.name);
		}
	});
	it('checks current tower time and preserves Sylveon priority over Espeon and Umbreon', () => {
		const eevee = member('Eevee', 160);
		assert.deepEqual(evolutionOptions(eevee, runFor(eevee, 1)), [{ species: 'Espeon' }]);
		assert.deepEqual(evolutionOptions(eevee, runFor(eevee, 4)), [{ species: 'Umbreon' }]);
		eevee.set.moves = ['baby-doll eyes'];
		assert.deepEqual(evolutionOptions(eevee, runFor(eevee, 4)), [{ species: 'Sylveon' }]);
		for (const floor of [1, 3, 6]) {
			const riolu = member('Riolu', 160);
			assert.deepEqual(evolutionOptions(riolu, runFor(riolu, floor)), [{ species: 'Lucario' }]);
		}
	});
	it('never evolves automatically on level-up and preserves friendship on rebuild', () => {
		const mon = member('Pichu', 160);
		gainExperience(runFor(mon), mon, 1000);
		assert.equal(mon.set.species, 'Pichu');
		assert.equal(partyEvolutions(mon, runFor(mon))[0].ready, true);
		assert.equal(friendship(mon), 160);
		rebuildMember(mon, emptyRogueStats());
		assert.equal(friendship(mon), 160);
	});
	it('lists every branch before it is available, with named items and current restrictions', () => {
		const eevee = member('Eevee');
		const options = partyEvolutions(eevee, runFor(eevee));
		assert.equal(options.length, 8);
		const vaporeon = options.find(e => e.species === 'Vaporeon');
		assert.equal(vaporeon.item, 'waterstone');
		assert(vaporeon.requirements.some(c => c.name === 'Water Stone' && !c.met));
		assert(!vaporeon.ready);
		assert(options.find(e => e.species === 'Sylveon').requirements.some(c => /妖精/.test(c.text)));
		assert.deepEqual(partyEvolutions(member('Venusaur')), []);
	});
	it('caps participation per member and floor, awards noncombat floors once, and excludes the box', () => {
		const mon = member('Bulbasaur'), bench = member('Squirtle'), box = member('Pichu');
		const run = { ...runFor(mon), team: [mon, bench], box: [box] };
		for (let battle = 0; battle < 3; battle++) {
			const result = { won: true, defeated: [{ participants: [mon.id] }] };
			battleFriendship(run, result, `battle${battle}`, structuredClone(run.team));
			battleFriendship(run, result, `battle${battle}`, structuredClone(run.team));
		}
		floorFriendship(run); floorFriendship(run);
		assert.equal(friendship(mon), 75); assert.equal(friendship(bench), 73); assert.equal(friendship(box), 70);
		run.floor++;
		floorFriendship(run);
		assert.equal(friendship(mon), 78); assert.equal(friendship(bench), 76);
	});
	it('deducts real faints up to twice per floor without rewarding retreats or repeated settlement', () => {
		const mon = member('Bulbasaur'), run = runFor(mon);
		for (let i = 0; i < 3; i++) {
			mon.hp = mon.maxhp;
			const old = structuredClone(run.team);
			mon.hp = 0;
			battleFriendship(run, { won: false }, `loss${i}`, old);
			battleFriendship(run, { won: false }, `loss${i}`, old);
		}
		assert.equal(friendship(mon), 60);
		floorFriendship(run);
		assert.equal(friendship(mon), 60);
		changeFriendship(mon, -1000); assert.equal(friendship(mon), 0);
		changeFriendship(mon, 1000); assert.equal(friendship(mon), 255);
		delete mon.set.happiness; assert.equal(friendship(mon), 255, 'legacy implicit friendship is preserved');
	});
	it('enforces the friendship requirement in commands and starts new adventures at 70', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, createPreviewContent(), () => 0);
			const user = 'friendshiptester';
			const command = (action, extra = {}) => engine.command(user, {
				id: randomUUID(), revision: store.get(user).revision, action, ...extra,
			});
			command('start', { starters: ['bulbasaur'] });
			assert.equal(store.get(user).run.team[0].set.happiness, 70);
			const mon = member('Pichu', 159);
			store.change(user, account => { account.run.team = [mon]; });
			assert.throws(() => command('evolve', { member: mon.id, value: 'pikachu' }), /没有满足条件/);
			store.change(user, account => {
				const pokemon = account.run.team[0]; pokemon.set.happiness = 160;
			});
			command('evolve', { member: mon.id, value: 'pikachu' });
			assert.equal(store.get(user).run.team[0].set.species, 'Pikachu');
		} finally { store.close(); }
	});
	it('supports successive manual evolutions, consumes each resource once and refuses battle or fainted evolution', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, createPreviewContent(), () => 0), user = 'manualevolution';
			const command = (action, extra = {}) => engine.command(user, {
				id: randomUUID(), revision: store.get(user).revision, action, ...extra,
			});
			const learnAll = () => {
				while (store.get(user).run.pendingMoves?.length) {
					command('learn', { member: store.get(user).run.pendingMoves[0].member, value: 'skip' });
				}
			};
			command('start', { starters: ['bulbasaur'] });
			const pichu = member('Pichu', 160, 40);
			delete pichu.seenMoves; // Legacy/gift members may not have initialized level-up history.
			store.change(user, a => { a.run.team = [pichu]; a.run.bag.thunderstone = 1; });
			command('evolve', { member: pichu.id, value: 'pikachu' }); learnAll();
			assert.equal(store.get(user).run.team[0].set.species, 'Pikachu');
			assert(partyEvolutions(store.get(user).run.team[0], store.get(user).run).some(e => e.species === 'Raichu' && e.ready));
			const request = { id: randomUUID(), revision: store.get(user).revision,
				action: 'evolve', member: pichu.id, value: 'raichu' };
			engine.command(user, request);
			const evolved = store.get(user);
			engine.command(user, request);
			assert.deepEqual(store.get(user), evolved);
			assert.equal(evolved.run.team[0].set.species, 'Raichu');
			assert.equal(evolved.run.team[0].set.level, 40);
			assert.equal(evolved.run.bag.thunderstone, 0);
			learnAll();
			const scyther = member('Scyther', 70, 40);
			store.change(user, a => { a.run.team = [scyther]; a.run.bag.linkingcord = 1; });
			assert.throws(() => command('evolve', { member: scyther.id, value: 'scizor' }), /没有满足条件/);
			store.change(user, a => { a.run.team[0].set.item = 'Metal Coat'; a.run.team[0].hp = 0; });
			assert.throws(() => command('evolve', { member: scyther.id, value: 'scizor' }), /没有满足条件/);
			store.change(user, a => { a.run.team[0].hp = 1; a.run.phase = 'battle'; });
			assert.throws(() => command('evolve', { member: scyther.id, value: 'scizor' }), /当前不能进化/);
			store.change(user, a => { a.run.phase = 'choose'; });
			command('evolve', { member: scyther.id, value: 'scizor' });
			assert.equal(store.get(user).run.team[0].set.item, '');
			assert.equal(store.get(user).run.bag.linkingcord, 0);
		} finally { store.close(); }
	});
});
