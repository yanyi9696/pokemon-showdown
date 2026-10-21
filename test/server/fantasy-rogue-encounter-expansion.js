'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle, Dex } = require('../../dist/sim');
const { createRoguePokemon, RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createBiomeRoutes } = require('../../dist/server/fantasy-rogue/biome-routes');
const { prepareEconomy } = require('../../dist/server/fantasy-rogue/economy');
const { exclusiveCatalog, suitableExclusiveItems, neededExclusiveItems, syncExclusiveItems,
	exclusiveEncounterChance } = require('../../dist/server/fantasy-rogue/exclusive-items');
const { beginExclusiveEncounter, beginExclusiveClue, exclusiveEventView, chooseExclusiveEvent,
	settleExclusiveEvent } = require('../../dist/server/fantasy-rogue/exclusive-events');
const { applyHeldForme } = require('../../dist/server/fantasy-rogue/held-formes');
const { beginAuction, auctionView } = require('../../dist/server/fantasy-rogue/auction');
const { prepareTrade, premiumMachine } = require('../../dist/server/fantasy-rogue/trading');
const { towerExperience } = require('../../dist/server/fantasy-rogue/early-balance');
const { fantasyTutorMoves, FANTASY_TUTOR_COST } = require('../../dist/server/fantasy-rogue/fantasy-tutor');
const { chooseEvent, eventView } = require('../../dist/server/fantasy-rogue/events');
const { summitEncounter } = require('../../dist/server/fantasy-rogue/final-bosses');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { set, stats, commandAfterOpening } = require('../fixtures/fantasy-rogue');

const node = kind => ({ id: kind, name: kind, kind, encounters: [], reward: { money: 0, items: {} } });
const member = species => createRoguePokemon({ ...set(species, Dex.mod('gen9fantasy').species.get(species).abilities[0], 60, ['Tackle']) }, stats(0));
const runFor = species => ({ floor: 100, phase: 'choose', team: [member(species)], boosts: stats(0), bag: {}, money: 50000, node: node('trainer') });

describe('Fantasy Rogue continuous encounters and exclusive equipment', function () {
	this.timeout(15000);
	it('creates a single 3/4-member pack with three loot rolls and leaves weather to the floor', () => {
		for (const extra of [false, true]) {
			const [route] = createBiomeRoutes(45, [node('wild')], undefined, max => extra ? 0 : Math.min(1, max - 1));
			assert.equal(route.encounters.length, 1);
			assert.equal(route.encounters[0].team.length, extra ? 4 : 3);
			assert.equal(route.encounters[0].wildPack.lootRolls, 3);
			assert(!route.encounters[0].environment);
			const old = { ...node('wild'), encounters: Array.from({ length: 3 }, () => ({ team: [] })) };
			const originalLoot = max => max === 100 ? 99 : 0;
			prepareEconomy(old, 45, originalLoot); prepareEconomy(route, 45, originalLoot);
			const sum = {};
			for (const loot of old.wildLoot) for (const [id, n] of Object.entries(loot)) sum[id] = (sum[id] || 0) + n;
			assert.deepEqual(route.wildLoot, [sum]);
			const copy = structuredClone(route); prepareEconomy(route, 45, () => { throw new Error('reroll'); });
			assert.deepEqual(route, copy);
		}
	});
	it('raises ordinary wild experience for both captures and knockouts without changing trainer experience', () => {
		for (const floor of [1, 50, 100, 150, 199]) {
			const args = [100, 50, 50, true, floor], base = towerExperience(...args);
			assert.equal(towerExperience(...args, false, true), Math.floor(base * 1.1));
			assert.equal(towerExperience(...args, true), Math.floor(base * 1.375));
		}
		for (const id of ['protect', 'swordsdance', 'flamethrower', 'bulletpunch']) assert(premiumMachine(id), id);
		for (const id of ['splash', 'tackle', 'fissure', 'explosion', 'solarbeam', 'hyperbeam']) assert(!premiumMachine(id), id);
	});
	it('completes three native captures in one room with normal PP and no voluntary wild switching', () => {
		const mon = member('Blissey');
		const battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'pack', team: [mon], boosts: stats(0), wild: true, catchable: true,
				bag: { pokeball: 3 }, balls: [{ id: 'pokeball', name: '精灵球', chance: 1 }] },
			p1: { name: 'Player', team: [mon.set] }, p2: { name: 'Wild', team: Array.from({ length: 3 }, () => set('Magikarp', 'Swift Swim', 5, ['Splash'])) } });
		try {
			battle.makeChoices('team 1', 'team 123');
			assert.equal(battle.choose('p2', 'switch 2'), false);
			assert.equal(battle.p2.active[0].moveSlots[0].maxpp, 40);
			for (let i = 0; i < 3; i++) {
				battle.makeChoices('rogueball pokeball', 'move 1');
				assert.equal(battle.fantasyRogue.captures.length, i + 1);
				if (i < 2) { assert(!battle.ended); battle.choose('p2', 'default'); }
			}
			assert.equal(battle.winner, 'Player'); assert.equal(rogueBattleResult(battle).captures.length, 3);
			assert.equal(new Set(battle.fantasyRogue.captures.map(p => p.id)).size, 3);
			assert(!battle.log.some(line => line.startsWith('|faint|p2')));
		} finally { battle.destroy(); }
	});
	it('keeps wild pivot moves and forced-switch items from rotating a living pack member', () => {
		const mon = member('Blissey'); mon.set.moves = ['Tackle'];
		const battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'pivot', team: [mon], boosts: stats(0), wild: true, catchable: true, bag: {}, balls: [] },
			p1: { team: [mon.set] }, p2: { team: [set('Scizor', 'Technician', 20, ['U-turn']), set('Mew', 'Synchronize', 20, ['Splash'])] } });
		try {
			battle.makeChoices('team 1', 'team 12');
			battle.p2.active[0].setItem('Eject Button');
			battle.makeChoices('move 1', 'move 1');
			assert.equal(battle.p2.active[0].species.name, 'Scizor');
			assert.equal(battle.p2.requestState, 'move');
		} finally { battle.destroy(); }
	});
	it('starts theme weather once, expires it after five turns and allows replacement', () => {
		const mon = member('Blissey'); mon.set.moves = ['Splash', 'Sunny Day'];
		const battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'weather', team: [mon], boosts: stats(0), wild: true, bag: {}, balls: [], catchable: true,
				environment: { weather: 'raindance', name: '下雨' } },
			p1: { team: [mon.set] }, p2: { team: [set('Magikarp', 'Swift Swim', 5, ['Splash'])] } });
		try {
			battle.makeChoices('team 1', 'team 1'); assert.equal(battle.field.weather, 'raindance');
			for (let i = 0; i < 5; i++) battle.makeChoices('move 1', 'move 1');
			assert.equal(battle.field.weather, '');
			battle.makeChoices('move 2', 'move 1'); assert.equal(battle.field.weather, 'sunnyday');
		} finally { battle.destroy(); }
	});
	it('allows the summit guards to switch, blocks early Mewtwo entry and then admits it', () => {
		const encounter = summitEncounter(), mon = member('Blissey'); mon.set.moves = ['Splash'];
		const battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'commander', team: [mon], boosts: stats(0), wild: false, bag: {}, balls: [], catchable: false, boss: encounter.boss },
			p1: { team: [mon.set] }, p2: { team: encounter.team } });
		try {
			assert.equal(battle.choose('p2', 'team 612345'), false);
			battle.makeChoices('team 1', 'team 123456');
			assert.equal(battle.choose('p2', 'switch 6'), false);
			battle.makeChoices('move 1', 'switch 2'); assert.equal(battle.p2.active[0].species.name, 'Miraidon-Fantasy');
			for (const p of battle.p2.pokemon.filter(p => !p.species.name.includes('Mewtwo'))) p.faint();
			battle.faintMessages(); battle.checkFainted(); battle.makeRequest('switch');
			assert(battle.choose('p2', 'default'));
			assert(battle.p2.active[0].species.name.includes('Mewtwo'));
		} finally { battle.destroy(); }
	});
	it('covers all metadata-backed exclusive items with themed trainer, clue and auction data', () => {
		const catalog = exclusiveCatalog(), ids = new Set(catalog.map(i => i.id));
		assert(catalog.length > 190);
		for (const item of Dex.mod('gen9fantasy').items.all()) {
			if (['CAP', 'Custom', 'Unobtainable'].includes(item.isNonstandard) || item.id.startsWith('rogue') || item.id === 'gmegawishingstar') continue;
			if (item.itemUser?.length || item.megaEvolves || item.onPlate || item.onDrive || item.onMemory) assert(ids.has(item.id), item.id);
		}
		for (const item of catalog) {
			assert.equal(new Set(item.sites).size, 4); assert(item.trainer && item.place && item.clue && item.avatar);
			assert(item.species.length && item.guards.length >= 3);
			for (const name of [...item.species, ...item.guards]) assert(Dex.mod('gen9fantasy').species.get(name).exists, name);
		}
		for (const [species, id] of [['Ogerpon', 'hearthflamemask'], ['Genesect', 'burndrive'], ['Pikachu', 'lightball'],
			['Marowak-Alola', 'thickclub'], ['Marowak-Alola-Fantasy', 'thickclub'],
			['Lugia-Fantasy', 'shadowbottle'], ['Slowbro-Galar-Fantasy', 'slowbrogalarnite']]) {
			assert(suitableExclusiveItems(species).some(i => i.id === id), species);
		}
		assert(!suitableExclusiveItems('Pikachu').some(i => i.id === 'pikashuniumz'));
		assert(!suitableExclusiveItems('Lugia').some(i => i.id === 'shadowbottle'));
	});
	it('tracks waiting time and misses, enforces loss cooldown, and removes rewards across acquisition paths', () => {
		const run = runFor('Lugia-Fantasy'); syncExclusiveItems(run);
		assert.equal(exclusiveEncounterChance(run, 'shadowbottle'), 15);
		assert.equal(beginExclusiveEncounter(run, max => max - 1), false);
		assert.equal(exclusiveEncounterChance(run, 'shadowbottle'), 23);
		run.floor += 5; assert.equal(exclusiveEncounterChance(run, 'shadowbottle'), 28);
		assert(beginExclusiveEncounter(run, () => 0));
		assert.equal(run.node.encounters[0].team[0].item, 'Shadow Bottle');
		assert.equal(run.node.encounters[0].catchable, false); assert(run.node.event.committed);
		settleExclusiveEvent(run, false); assert.equal(exclusiveEncounterChance(run, 'shadowbottle'), 0);
		run.floor += 8; assert(exclusiveEncounterChance(run, 'shadowbottle') > 28);
		assert(beginExclusiveEncounter(run, () => 0)); settleExclusiveEvent(run, true);
		assert.equal(run.bag.shadowbottle, 1); assert.equal(neededExclusiveItems(run).length, 0);
		delete run.bag.shadowbottle; assert.equal(neededExclusiveItems(run).length, 0, 'one acquisition per run even after use');
	});
	it('commits clue choices, keeps the answer across reloads and makes the third wrong guess elite', () => {
		const run = runFor('Lugia-Fantasy'); beginExclusiveClue(run, () => 0);
		assert(exclusiveEventView(run).options.some(o => o.id === 'leave'));
		chooseExclusiveEvent(run, 'investigate', () => 0);
		assert(!exclusiveEventView(run).options.some(o => o.id === 'leave'));
		for (const i of [1, 2, 3]) {
			chooseExclusiveEvent(run, `site:${i}`, () => 0);
			assert.equal(run.node.event.exclusive.battleElite, i === 3);
			assert.equal(run.node.encounters[0].catchable, true);
			settleExclusiveEvent(run, true);
			assert.equal(run.node.event.stage, 'choice');
			assert.equal(JSON.parse(JSON.stringify(run)).node.event.exclusive.answer, 0);
			assert(!exclusiveEventView(run).options.some(o => o.id === `site:${i}`));
		}
		chooseExclusiveEvent(run, 'site:0', () => 0); assert.equal(run.bag.shadowbottle, 1);
		assert.equal(run.node.event.stage, 'result');
	});
	it('can find the clue reward at the first location without a battle', () => {
		const run = runFor('Marowak'); beginExclusiveClue(run, () => 0);
		chooseExclusiveEvent(run, 'investigate', () => 0); chooseExclusiveEvent(run, 'site:0', () => 0);
		assert.equal(run.bag.thickclub, 1); assert.equal(run.node.encounters.length, 0);
	});
	it('applies and removes held formes without turning ordinary forms into Fantasy or auto-Mega', () => {
		for (const [base, item, form] of [['Ogerpon', 'Hearthflame Mask', 'Ogerpon-Hearthflame'], ['Genesect', 'Burn Drive', 'Genesect-Burn'],
			['Silvally', 'Fire Memory', 'Silvally-Fire'], ['Arceus', 'Flame Plate', 'Arceus-Fire'], ['Giratina', 'Griseous Core', 'Giratina-Origin']]) {
			const s = { ...member(base).set, item }; assert(applyHeldForme(s)); assert.equal(s.species, form);
			s.item = ''; assert(applyHeldForme(s)); assert.equal(s.species, base);
		}
		const lugia = { ...member('Lugia').set, item: 'Shadow Bottle' }; assert.equal(applyHeldForme(lugia), false);
		const mewtwo = { ...member('Mewtwo-Fantasy').set, item: 'Mewtwonite X' }; assert.equal(applyHeldForme(mewtwo), false);
	});
});

describe('Fantasy Rogue tutor and auction save transactions', function () {
	this.timeout(15000);
	let store, engine, content;
	const account = () => store.get('expansiontester');
	const cmd = (action, details = {}) => commandAfterOpening(engine, 'expansiontester', { id: randomUUID(), revision: account().revision, action, ...details });
	const choose = value => cmd('event', { value, member: account().run.node.event.key });
	beforeEach(() => {
		store = new RogueStore(':memory:'); content = createPreviewContent(); engine = new RogueEngine(store, content, () => 0);
		cmd('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());
	function auction() {
		store.change('expansiontester', a => {
			Object.assign(a.run, runFor('Lugia-Fantasy')); a.run.node = { ...node('trade'), trade: { kind: 'auction', stock: [], purchases: 0 } };
			beginAuction(a.run, content, () => 0);
		});
	}
	it('pays the exclusive encounter prize only on victory and never again when continuing', () => {
		for (const won of [false, true]) {
			store.change('expansiontester', a => {
				Object.assign(a.run, runFor('Lugia-Fantasy'), { floor: 101, exclusiveItems: {} });
				assert(beginExclusiveEncounter(a.run, () => 0));
				prepareEconomy(a.run.node, a.run.floor, () => 0);
				a.run.phase = 'ready';
			});
			const before = account().run, reward = structuredClone(before.node.reward);
			assert(reward.money > 0);
			cmd('battle'); const run = account().run;
			engine.settle('expansiontester', run.battle.token, {
				encounterId: run.battle.encounterId, won, team: run.team, bag: run.bag,
			});
			while (account().run.pendingMoves?.length) cmd('learn', { member: account().run.pendingMoves[0].member, value: 'skip' });
			const after = account().run;
			assert.equal(after.money, before.money + (won ? reward.money : -(500 + before.floor * 20)));
			assert.equal(after.bag.shadowbottle || 0, won ? 1 : 0);
			for (const [id, n] of Object.entries(reward.items)) assert.equal(after.bag[id] || 0, won ? n : 0, id);
			assert.deepEqual(after.node.reward, { money: 0, items: {} });
			cmd('continue');
			assert.equal(account().run.floor, 102);
			assert.equal(account().run.money, after.money);
			assert.deepEqual(account().run.bag, after.bag);
		}
	});
	it('keeps each clue attack distinct while escape retries retain the same capture identity', () => {
		store.change('expansiontester', a => {
			a.run.floor = 100; a.run.team = [member('Lugia-Fantasy')];
			a.run.node = node('event'); beginExclusiveClue(a.run, () => 0);
		});
		choose('investigate');
		const identities = [];
		for (const site of [1, 2, 3]) {
			choose(`site:${site}`); cmd('battle');
			let run = account().run; identities.push(run.battle.encounterId);
			cmd('retreat');
			engine.settle('expansiontester', run.battle.token, { encounterId: run.battle.encounterId, won: false, team: run.team, bag: run.bag });
			cmd('battle'); run = account().run;
			assert.equal(run.battle.encounterId, identities.at(-1));
			const captured = createRoguePokemon(run.node.encounters[0].team[0], run.boosts, `${run.battle.encounterId}:foe:0`);
			engine.settle('expansiontester', run.battle.token, { encounterId: run.battle.encounterId, won: true, team: run.team, bag: run.bag, captured });
			while (account().run.pendingMoves?.length) cmd('learn', { member: account().run.pendingMoves[0].member, value: 'skip' });
			assert.equal(account().run.phase, 'event');
		}
		assert.equal(new Set(identities).size, 3);
		assert.equal(account().run.caught.length, 3);
		assert.equal(account().run.team.length, 4);
		choose('site:0'); assert.equal(account().run.bag.shadowbottle, 1);
	});
	it('saves 3–5 auction lots including a needed item, budgets and personalities without rerolling', () => {
		auction(); const run = account().run, before = structuredClone(run);
		assert.equal(run.auction.lots.length, 3); assert.equal(run.auction.lots[0].item.id, 'shadowbottle');
		assert.equal(run.auction.npcs.length, 3); assert(auctionView(run).paragraphs.some(p => p.includes('预算')));
		prepareTrade(run, content, () => { throw new Error('reroll'); }); assert.deepEqual(run, before);
		choose('enter'); assert(!eventView(account().run).options.some(o => o.id === 'leave'));
	});
	it('settles affordable winning bids once, rejects stale requests and suppresses the obtained exclusive', () => {
		auction(); choose('enter');
		store.change('expansiontester', a => { a.run.auction.lots[0].willingness = [0, 0, 0]; });
		const before = account().run, request = { id: randomUUID(), revision: account().revision, action: 'event', value: 'bid', member: before.node.event.key };
		engine.command('expansiontester', request); engine.command('expansiontester', request);
		const run = account().run; assert.equal(run.money, before.money - before.auction.lots[0].opening);
		assert.equal(run.bag.shadowbottle, 1); assert.equal(run.auction.index, 1); assert.equal(neededExclusiveItems(run).length, 0);
		assert.throws(() => choose('leave'), /选项/);
		while (account().run.node.event.stage !== 'result') choose('pass');
		assert(account().run.auction.npcs.every(n => n.budget >= 0));
	});
	it('lets pressure reduce cautious bids and bluff increase proud bids, without overspending or repeated talk', () => {
		auction(); choose('enter');
		const initial = account().run.auction.lots[0].willingness;
		choose('pressure'); assert(account().run.auction.lots[0].willingness[0] < initial[0]);
		assert.throws(() => choose('bluff'), /选项/); choose('pass');
		const second = account().run.auction.lots[1].willingness; choose('bluff');
		assert(account().run.auction.lots[1].willingness[1] >= second[1]);
		store.change('expansiontester', a => { a.run.money = 0; });
		const before = account(); assert.throws(() => choose('bid'), /选项/); assert.deepEqual(account(), before);
	});
	it('teaches only a legal unlearned Fantasy move for 10 fragments and never charges twice', () => {
		store.change('expansiontester', a => {
			a.run.floor = 81; a.run.phase = 'event'; a.run.team = [member('Pikachu'), member('Mewtwo-Fantasy')];
			a.run.blessings.shards = 30;
			a.run.node = { ...node('event'), event: { id: 'fantasytutor', key: randomUUID(), stage: 'choice' } };
		});
		assert.equal(fantasyTutorMoves(account().run.team[0]).length, 0);
		choose('lesson'); const mon = account().run.team[1], moves = fantasyTutorMoves(mon); assert(moves.length);
		assert.throws(() => choose(`member:${encodeURIComponent(account().run.team[0].id)}`), /选项/);
		choose(`member:${encodeURIComponent(mon.id)}`);
		assert.throws(() => choose('fantasymove:tackle'), /选项/);
		const request = { id: randomUUID(), revision: account().revision, action: 'event', value: `fantasymove:${moves[0]}`, member: account().run.node.event.key };
		engine.command('expansiontester', request); engine.command('expansiontester', request);
		assert.equal(account().run.blessings.shards, 30 - FANTASY_TUTOR_COST);
		assert(account().run.team[1].moveMemory.some(m => m.id === moves[0]));
		assert(!fantasyTutorMoves(account().run.team[1]).includes(moves[0]));
	});
	it('never draws the tutor before floor 81 or exclusive-only events without eligible partners', () => {
		const run = account().run; run.floor = 80;
		const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
		run.eventHistory = Object.keys(EVENT_NAMES).filter(id => id !== 'fantasytutor').map(id => ({ id, floor: 1 }));
		for (let n = 0; n < 40; n++) assert.notEqual(chooseEvent(run, max => n % max), 'fantasytutor');
		run.floor = 81; assert.equal(chooseEvent(run, () => 0), 'fantasytutor');
	});
});
