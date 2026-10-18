'use strict';
const { commandAfterOpening } = require('../fixtures/fantasy-rogue');
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Dex } = require('../../dist/sim/dex');
const { Battle } = require('../../dist/sim/battle');
const { createRoguePokemon, initializeExperience } = require('../../dist/server/fantasy-rogue/progression');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const b = require('../../dist/server/fantasy-rogue/blessings');
const { blessing, ROGUE_BLESSINGS, blessingLevelCost, FANTASY_BLESSING_ITEMS } = require('../../dist/sim/rogue-blessing-data');
const { stats, set, prepareCompanionParty } = require('../fixtures/fantasy-rogue');
const dex = Dex.mod('gen9fantasy');
const zero = () => 0;

describe('Fantasy Rogue blessing campaign and saves', function () {
	this.timeout(30000);
	let content;
	before(() => { content = createPreviewContent(); content.blessings = true; });
	function setup(floor = 50) {
		const team = [set(), set('Meloetta', 'Serene Grace', 50, ['Psychic']), set('Cobalion', 'Justified', 50, ['Sacred Sword'])]
			.map(s => createRoguePokemon(s, stats(0)));
		team.forEach(initializeExperience);
		const run = { id: 'campaign', contentVersion: content.version, floor, phase: 'blessing', encounter: 0, attempt: 0,
			team, boosts: stats(0), bag: {}, money: 0, caught: [], startingSlots: 3 };
		const account = { revision: 1, points: 0, slots: 3, boosts: stats(0), captures: {}, unlocked: [], run };
		b.normalizeBlessings(run);
		return { run, account };
	}
	function choose(account, run, def, random = zero) {
		run.phase = 'blessing';
		run.blessings.round = { floor: run.floor, tier: def.tier, remaining: 1,
			options: [{ id: def.id, refreshes: 1, chosen: false }], familiesSeen: [def.family], topClearMindEligible: def.id === 'topclearmind' };
		b.handleBlessingCommand(account, run, content, { action: 'blessing', slot: 0 }, random);
	}
	function resolve(account, run, value) {
		b.handleBlessingCommand(account, run, content, { action: 'blessingreward', member: run.blessings.pending[0].id, value }, zero);
	}
	for (const spirit of [undefined, ...require('../../dist/sim/fantasy-rogue-spirits').activeRogueSpirits().map(s => s.id)]) {
		it(`finishes all four blessing checkpoints with refreshes and save restores under ${spirit || 'no spirit'}`, () => {
			for (let seed = 1; seed <= 8; seed++) {
				let randomState = seed;
				const random = max => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) % max);
				let { run, account } = setup(); run.spirit = spirit;
				for (const floor of [1, 50, 100, 150]) {
					run.floor = floor; run.phase = 'blessing';
					if (floor === 1) {
						run.blessings.beforeAdventure = true;
						b.prepareOpeningBlessings(run, content, random);
					} else b.completeBlessingFloor(account, run, content, random);
					let actions = 0;
					while (run.blessings.pending.length || run.blessings.round || run.blessings.stage) {
						assert(++actions <= 30, 'must leave every selection checkpoint');
						const state = run.blessings;
						if (state.pending.length) {
							const reward = state.pending[0];
							resolve(account, run, reward.kind === 'gift' ? run.team[random(run.team.length)].id : reward.options[random(reward.options.length)]);
						} else if (state.stage) {
							b.handleBlessingCommand(account, run, content, { action: 'blessing', value: state.stage.options[random(state.stage.options.length)] }, random);
						} else {
							const available = state.round.options.map((option, slot) => ({ option, slot })).filter(({ option }) => !option.chosen);
							const { option, slot } = available[random(available.length)];
							b.handleBlessingCommand(account, run, content, { action: option.refreshes ? 'blessingrefresh' : 'blessing', slot }, random);
						}
						run = JSON.parse(JSON.stringify(run)); account.run = run;
						b.syncBlessingParty(run);
					}
					assert.equal(run.blessings.levels, run.blessings.owned.reduce((sum, entry) => sum +
						(entry.grantedBy ? 0 : blessingLevelCost(entry.tier, entry.floor)), 0) +
						(run.blessings.evolutionCosts || []).reduce((sum, floor) => sum + blessingLevelCost('prismatic', floor), 0));
					assert.equal(run.blessings.bossLevels, run.blessings.owned.reduce((sum, entry) => sum +
						(entry.grantedBy ? 0 : blessingLevelCost(entry.tier, entry.floor, true)), 0) +
						(run.blessings.evolutionCosts || []).reduce((sum, floor) => sum + blessingLevelCost('prismatic', floor, true), 0));
					delete run.blessings.beforeAdventure;
					assert.equal(new Set(run.blessings.owned.map(entry => entry.id)).size, run.blessings.owned.length);
				}
			}
		});
	}
	it('keeps an opening attribute card selectable after the first Jirachi gift replaces its matching teammate', () => {
		const { run, account } = setup(); run.spirit = 'jirachi';
		run.floor = 1;
		const steel = ROGUE_BLESSINGS.find(def => def.family === 'typeevolution' && def.type === 'Steel');
		run.blessings.round = { floor: 1, tier: 'prismatic', remaining: 2,
			options: [{ id: 'hero', refreshes: 0, chosen: false }, { id: steel.id, refreshes: 0, chosen: false }],
			familiesSeen: ['hero', 'typeevolution'] };
		b.handleBlessingCommand(account, run, content, { action: 'blessing', slot: 0 }, zero);
		assert.equal(run.blessings.round.options[1].id, steel.id);
		run.blessings.pending[0].pokemon = createRoguePokemon(set('Squirtle', 'Torrent'), run.boosts);
		resolve(account, run, run.team[2].id);
		const remaining = run.blessings.round.options[1];
		assert.equal(remaining.id, steel.id, 'the card now gifts its own matching partner');
		assert.equal(remaining.refreshes, 0, 'automatic repair must not grant extra refreshes');
		assert.equal(blessing(remaining.id).tier, 'prismatic');
		assert(run.blessings.round.options[0].chosen);
		const saved = JSON.parse(JSON.stringify(run));
		b.syncBlessingParty(saved);
		b.handleBlessingCommand(account, saved, content, { action: 'blessing', slot: 1 }, zero);
		assert(!saved.blessings.round, 'the restored second pick must finish the round');
	});
	for (const def of ROGUE_BLESSINGS) it(`grants and serializes ${def.id} with its required reward flow`, () => {
		const floor = def.floors?.[0] || (def.family === 'overtime' ? 150 : 50), { run, account } = setup(floor);
		prepareCompanionParty(run, def.family);
		if (def.family === 'typeevolution') {
			const species = dex.species.all().find(s => s.num > 0 && !s.battleOnly && s.types.includes(def.type));
			run.team[0] = createRoguePokemon(set(species.name, species.abilities[0], 50), run.boosts);
		}
		if (def.family === 'topclearmind') run.blessings.prayer = { floor: 50, changed: false, team: run.team.map(m => m.id) };
		if (def.family === 'dragonking') run.team[0] = createRoguePokemon(set('Dragonite', 'Inner Focus', 50), run.boosts);
		if (def.family === 'railgun') run.team[0] = createRoguePokemon(set('Magnemite', 'Sturdy', 50), run.boosts);
		if (def.family === 'rulebreaker') run.team[0].extraAbilities = ['moldbreaker'];
		assert(b.blessingCandidates(run, content).some(entry => entry.id === def.id));
		choose(account, run, def);
		assert(run.blessings.owned.some(entry => entry.id === def.id));
		assert.equal(run.blessings.levels, blessingLevelCost(def.tier, floor));
		let steps = 0;
		while (run.blessings.pending.length) {
			assert(++steps < 8);
			const reward = run.blessings.pending[0];
			resolve(account, run, reward.kind === 'gift' ? 'join' : reward.options[0]);
		}
		while (run.blessings.stage) b.handleBlessingCommand(account, run, content,
			{ action: 'blessing', value: run.blessings.stage.kind === 'direction' ? 'stats' : run.blessings.stage.options[0] }, zero);
		const restored = JSON.parse(JSON.stringify(run));
		b.syncBlessingParty(restored);
		assert.deepEqual(restored.blessings.owned, JSON.parse(JSON.stringify(run.blessings.owned)));
	});
	it('applies the gift spirit to newly obtained equipment without converting property emblems', () => {
		const { run, account } = setup(); run.spirit = 'hoopagift';
		choose(account, run, blessing('secondchoice'));
		assert.equal(Object.values(run.bag).reduce((a, n) => a + n, 0), 3);
		assert(Object.keys(run.bag).every(id => FANTASY_BLESSING_ITEMS.includes(id)));
		assert(!run.bag.choiceband);
		const { convertSpiritItem } = require('../../dist/server/fantasy-rogue/spirits');
		assert.equal(convertSpiritItem(run, content, 'rogueemblemfire', 'gift:emblem', zero), 'rogueemblemfire');
	});
	it('charges only the outer Fate and excludes Fate gifts for all three tiers', () => {
		for (const tier of ['silver', 'gold', 'prismatic']) for (const floor of [1, 50, 100, 150]) {
			const { run, account } = setup(floor);
			choose(account, run, blessing('fate' + tier));
			assert.equal(run.blessings.owned.length, 2);
			assert.equal(run.blessings.owned[1].tier, tier);
			assert(!run.blessings.owned[1].family.startsWith('fate'));
			assert.equal(run.blessings.owned[1].grantedBy, 'fate' + tier);
			assert.equal(run.blessings.levels, blessingLevelCost(tier, floor));
			assert(run.money >= ({ silver: 800, gold: 1000, prismatic: 1200 })[tier] * floor / 50);
		}
	});
	it('raises encounters once and keeps level costs cumulative after a reload', () => {
		const { run, account } = setup();
		for (const [floor, id] of [[50, 'lowhp'], [100, 'smallfinal'], [150, 'speedpower']]) {
			run.floor = floor; choose(account, run, blessing(id));
		}
		assert.equal(run.blessings.levels, 40);
		run.node = { id: 'elite', kind: 'elite', encounters: [{ team: [set('Gyarados', 'Intimidate', 90)] }] };
		b.prepareBlessingEncounter(run, zero);
		b.prepareBlessingEncounter(run, zero);
		assert.equal(run.node.encounters[0].team[0].level, 130);
		assert.equal(JSON.parse(JSON.stringify(run)).node.encounters[0].blessingLevels, 40);
	});
	it('grants mixed cards with the selected quality cost at each checkpoint and preserves their saved offer', () => {
		const { createBlessingRound } = require('../../dist/server/fantasy-rogue/blessing-selection');
		const candidates = ['lowhp', 'smallfinal', 'speedpower'].map(blessing);
		for (const floor of [50, 100, 150]) for (const slot of [0, 1, 2]) {
			const { run, account } = setup(floor); run.spirit = 'necrozma';
			run.blessings.round = createBlessingRound({ floor, spirit: run.spirit }, candidates, zero);
			const saved = JSON.parse(JSON.stringify(run.blessings.round));
			b.syncBlessingParty(run);
			assert.deepEqual(run.blessings.round, saved, 'migration must retain the exact pending cards');
			const view = b.blessingView(run);
			assert.equal(view.round.tier, 'mixed');
			assert.deepEqual(view.round.options.map(option => option.tier), ['silver', 'gold', 'prismatic']);
			b.handleBlessingCommand(account, run, content, { action: 'blessing', slot }, zero);
			assert.equal(run.blessings.levels, blessingLevelCost(candidates[slot].tier, floor));
			assert.deepEqual(run.blessings.owned.map(entry => entry.id), [candidates[slot].id]);
		}
	});
	it('counts whole battle regions only once, completes tasks once and keeps guaranteed routes afterwards', () => {
		const { run, account } = setup(); choose(account, run, blessing('battletask'));
		for (let floor = 51; floor <= 80; floor++) {
			run.floor = floor; run.node = { id: 'wild', kind: 'wild', encounters: [1, 2, 3] };
			b.completeBlessingFloor(account, run, content, zero);
			b.completeBlessingFloor(account, run, content, zero);
		}
		const entry = run.blessings.owned[0];
		assert.equal(entry.progress, 15); assert(entry.completed); assert.equal(run.bag.expcandys, 8);
		run.floor = 81;
		assert(b.blessingRouteTemplates(run, [{ id: 'event', kind: 'event' }]).some(node => node.kind === 'wild'));
	});
	it('records negative event charge once, permits overflow and reduces only the excess gain', () => {
		const { run, account } = setup(); choose(account, run, blessing('psychic'));
		run.floor = 51; run.node = { id: 'event', kind: 'event', encounters: [] };
		run.blessings.psychic = 98;
		b.recordNegativeBlessingEvent(run, 'bad'); b.recordNegativeBlessingEvent(run, 'bad');
		assert.equal(run.blessings.psychic, 101.15);
		b.completeBlessingFloor(account, run, content, zero);
		assert.equal(run.blessings.psychic, 101.55);
		assert.equal(JSON.parse(JSON.stringify(run)).blessings.psychic, 101.55);
	});
	it('does not feed gifted moves into permanent memory and preserves borrowed PP across equipment changes', () => {
		const { run } = setup(), mon = run.team[0];
		mon.set.item = 'rogueemblemfire'; b.syncBlessingParty(run);
		assert(mon.blessingMoves.includes('flareblitz'));
		mon.set.moves[0] = 'flareblitz'; mon.pp[0] = { id: 'flareblitz', pp: 2, maxpp: 15 };
		b.syncBlessingParty(run); mon.emblem = ''; b.syncBlessingParty(run);
		assert(!mon.set.moves.includes('flareblitz'));
		assert(!mon.moveMemory.some(move => move.id === 'flareblitz'));
		mon.emblem = 'rogueemblemfire'; b.syncBlessingParty(run);
		assert.equal(mon.blessingPP.find(move => move.id === 'flareblitz').pp, 2);
	});
	it('keeps all six Pandora categories separate and does not roll equipped or evolution items', () => {
		const { run, account } = setup(); choose(account, run, blessing('pandorasilver'));
		const ids = ['lifeorb', 'charcoal', 'firegem', 'oranberry', FANTASY_BLESSING_ITEMS[0], 'rogueemblemwater'];
		run.team[0].set.item = 'leftovers'; run.bag = { firestone: 1, linkingcord: 1, ...Object.fromEntries(ids.map(id => [id, 1])) };
		run.floor = 51; b.beginBlessingFloor(run, max => max - 1);
		assert.equal(run.team[0].set.item, 'leftovers'); assert.equal(run.bag.firestone, 1); assert.equal(run.bag.linkingcord, 1);
		assert.deepEqual(Object.keys(run.bag).filter(id => b.equipmentCategory(id)).map(b.equipmentCategory).sort(), ids.map(b.equipmentCategory).sort());
		const saved = JSON.stringify(run.bag); b.beginBlessingFloor(run, zero); assert.equal(JSON.stringify(run.bag), saved);
	});
	it('builds 3–6 distinct treasure groups near their stated reward valuation', () => {
		const { run } = setup();
		b.treasure(run, content, zero);
		assert.equal(Object.keys(run.bag).length, 3);
		let value = run.money;
		for (const [id, count] of Object.entries(run.bag)) {
			const item = content.items.find(item => item.id === id);
			value += count * (item ? item.sellPrice || item.price : dex.items.get(id).megaStone ? 6000 : 600);
		}
		assert.equal(value, 4800);
	});
	it('does not downgrade a reserved five-star partner when the star quest pays out', () => {
		const { run, account } = setup(1); choose(account, run, blessing('starquest')); resolve(account, run, 'join');
		const entry = run.blessings.owned[0], mon = run.team.find(mon => mon.id === entry.target);
		mon.stars = 5; entry.progress = 9;
		b.settleBlessingBattle(account, run, content, { won: true, encounterId: 'ten', blessingProgress: { kos: [{ id: 'tenth', member: mon.id }], swords: 0, insight: {} } }, zero);
		assert.equal(mon.stars, 5); assert.deepEqual(entry.milestones, [10]);
	});
	it('keeps prayer eligibility through ordering but loses it after changing party membership', () => {
		const { run, account } = setup(); choose(account, run, blessing('prayer'));
		run.team.reverse(); b.normalizeBlessings(run); assert(!run.blessings.prayer.changed);
		run.team.pop(); b.normalizeBlessings(run); assert(run.blessings.prayer.changed);
		assert(!b.blessingCandidates(run, content).some(def => def.id === 'topclearmind'));
	});
	it('keeps both initial Jirachi choices and charges one prism per later direction with 21 total upgrades', () => {
		const { run, account } = setup(1); run.spirit = 'jirachi';
		run.blessings.round = { floor: 1, tier: 'prismatic', remaining: 2, options: [
			{ id: 'typeevolutiongrass', refreshes: 1, chosen: false }, { id: 'hpgrowth', refreshes: 1, chosen: false },
		], familiesSeen: ['typeevolution', 'hpgrowth'], topClearMindEligible: false };
		b.handleBlessingCommand(account, run, content, { action: 'blessing', slot: 0 }, zero);
		assert.equal(run.blessings.round.remaining, 1);
		resolve(account, run, 'join');
		b.handleBlessingCommand(account, run, content, { action: 'blessing', value: 'stats' }, zero);
		b.handleBlessingCommand(account, run, content, { action: 'blessing', value: 'stat:hp' }, zero);
		b.handleBlessingCommand(account, run, content, { action: 'blessing', slot: 1 }, zero);
		assert.equal(run.blessings.levels, 0); assert.equal(run.blessings.bossLevels, 20);
		let upgrades = 1;
		for (let floor = 10; floor <= 200; floor += 10) {
			run.floor = floor; run.node = { id: 'checkpoint', kind: 'boss', encounters: [] };
			b.completeBlessingFloor(account, run, content, zero);
			assert(!run.blessings.round);
			if (run.blessings.stage.kind === 'direction') {
				b.handleBlessingCommand(account, run, content, { action: 'blessing', value: 'stats' }, zero);
			}
			assert.equal(run.blessings.stage.kind, 'upgrade');
			assert.equal(new Set(run.blessings.stage.options).size, 3);
			b.handleBlessingCommand(account, run, content, { action: 'blessing', value: 'stat:hp' }, zero);
			upgrades++;
		}
		assert.equal(upgrades, 21); assert.equal(run.blessings.levels, 60); assert.equal(run.blessings.bossLevels, 110);
		assert.deepEqual(run.blessings.evolutionCosts, [50, 100, 150]);
		assert(Math.abs(run.blessings.evolution.stats.hp - 3.15) < 0.0001);
	});
	it('rewards all five Regis and the bound final giant before the last fixed elite only', () => {
		const { run, account } = setup(100); choose(account, run, blessing('regis'));
		for (let i = 0; i < 5; i++) {
			run.floor = 151 + i;
			run.node = { id: 'elite' + i, kind: 'elite', biome: { level: 80 }, encounters: [] };
			b.prepareBlessingEncounter(run, zero);
			const foe = run.node.encounters[0].team[0];
			b.settleBlessingBattle(account, run, content, { won: true, encounterId: 'regi:' + i,
				defeated: [{ species: foe.species, participants: [] }] }, zero);
		}
		assert.equal(run.blessings.regis.length, 5);
		assert.equal(Object.keys(run.bag).filter(id => id.startsWith('rogueemblem')).length, 5);
		run.floor = 170; run.node = { id: 'final', kind: 'boss', encounters: [] };
		b.prepareBlessingEncounter(run, zero);
		assert(run.node.regiBoss); assert.equal(run.node.encounters[0].team[0].species, 'Regigigas-Fantasy');
		b.settleBlessingBattle(account, run, content, { won: true, encounterId: 'giant' }, zero);
		assert.equal(run.blessings.shards, 50);
		assert(run.blessings.pending.some(p => p.pokemon?.id === run.blessings.owned[0].target));
		const late = setup(100); choose(late.account, late.run, blessing('regis')); late.run.blessings.regis = [...run.blessings.regis];
		for (const floor of [175, 180, 185, 190, 200]) {
			late.run.floor = floor; late.run.node = { id: 'late', kind: 'boss', encounters: [] };
			b.prepareBlessingEncounter(late.run, zero); assert(!late.run.node.regiBoss);
		}
	});
	it('saves both sides’ independent blessing effects in PVP and never changes the archived cards', () => {
		const { recordClear } = require('../../dist/server/fantasy-rogue/legacy');
		const { buildRogueDuelState } = require('../../dist/server/fantasy-rogue/duels');
		const cards = ['left', 'right'].map((id, index) => {
			const { run, account } = setup(); run.owner = { id, name: id }; run.floor = 200;
			run.blessings.owned = [{ ...blessing(index ? 'sound' : 'entrance'), floor: 150 }];
			run.team = [createRoguePokemon(set('Snorlax', 'Immunity', 50, ['Snore', 'Tackle']), run.boosts)];
			b.syncBlessingParty(run);
			recordClear(account, run);
			account.cards[0].public = true;
			return account.cards[0];
		});
		const before = JSON.stringify(cards), state = buildRogueDuelState(...cards);
		const battle = new Battle({ formatid: 'gen9fantasyrogueduel', fantasyRogue: state,
			p1: { name: 'left', team: state.team.map(m => m.set) }, p2: { name: 'right', team: state.duel.team.map(m => m.set) } });
		try {
			battle.makeChoices('team 1', 'team 1');
			const a = battle.p1.active[0], z = battle.p2.active[0], move = battle.dex.getActiveMove('tackle');
			assert.equal(battle.runEvent('BasePower', a, z, move, 40), 42);
			assert.equal(battle.runEvent('BasePower', z, a, move, 40), 40);
			assert.equal(battle.runEvent('ModifyDamage', z, a, battle.dex.getActiveMove('snore'), 100), 104);
			assert.equal(JSON.stringify(cards), before);
		} finally { battle.destroy(); }
	});
	it('pauses an actual floor clear for a persistent blessing choice and strips capture level inflation', () => {
		const store = new RogueStore(':memory:'); let battle;
		try {
			const engine = new RogueEngine(store, content, zero), user = 'blessingflow';
			const account = () => store.get(user);
			const cmd = (action, details = {}) => commandAfterOpening(engine, user, { action, id: randomUUID(), revision: account().revision, ...details });
			cmd('start', { starters: ['bulbasaur'] });
			store.change(user, saved => {
				saved.run.floor = 50;
				saved.run.phase = 'reward';
				saved.run.node = { id: 'fifty', name: 'Boss', kind: 'boss', encounters: [], reward: { money: 0, items: {} } };
			});
			cmd('continue');
			assert.equal(account().run.phase, 'blessing'); assert.equal(account().run.floor, 50);
			const before = account().run.blessings.round;
			const reloaded = new RogueEngine(store, content, max => max - 1);
			reloaded.migrate(user);
			assert.deepEqual(account().run.blessings.round, before);
			cmd('blessing', { slot: 0 });
			while (account().run.blessings.pending.length) {
				const reward = account().run.blessings.pending[0];
				assert.equal(reward.kind, 'toolbox');
				cmd('blessingreward', {member: reward.id, value: reward.options[0]});
			}
			assert.equal(account().run.floor, 51); assert.equal(account().run.phase, 'choose');
			store.change(user, saved => {
				saved.run.blessings.levels = 30;
				saved.run.phase = 'ready'; saved.run.node = { id: 'catch', kind: 'wild', reward: { money: 0, items: {} }, blessingPrepared: true,
					encounters: [{ name: 'Wild', style: 'balanced', catchable: true, catchChances: { pokeball: 1 }, blessingLevels: 30, team: [set('Magikarp', 'Swift Swim', 55, ['Splash'])] }] };
				saved.run.encounter = 0;
			});
			cmd('battle'); const run = account().run, state = engine.battleState(user);
			battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: state, p1: { name: 'Player', team: run.team.map(mon => mon.set) }, p2: { name: 'Wild', team: run.node.encounters[0].team } });
			battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
			battle.choose('p1', 'rogueball pokeball'); battle.choose('p2', 'move 1');
			engine.settle(user, run.battle.token, rogueBattleResult(battle));
			const captured = account().run.team.find(mon => mon.set.species === 'Magikarp');
			assert(captured, battle.log.join('\n')); assert.equal(captured.set.level, 25);
		} finally { battle?.destroy(); store.close(); }
	});
});
