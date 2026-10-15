'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { EVENT_NAMES, beginEvent, chooseEvent, eventBudget, expectedWildLoot, eventView } = require('../../dist/server/fantasy-rogue/events');
const { drawGiftSpecies } = require('../../dist/server/fantasy-rogue/gifts');
const { simulateForestBattle } = require('../../dist/server/fantasy-rogue/event-battle');
const { drawBlessingGift, normalizeBlessings, blessingCandidates } = require('../../dist/server/fantasy-rogue/blessings');
const { ROGUE_BLESSINGS, blessing } = require('../../dist/sim/rogue-blessing-data');
const { Battle } = require('../../dist/sim/battle');
const { throwRogueBall, rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { PRNG } = require('../../dist/sim/prng');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue authored events and preferred gifts', function () {
	this.timeout(20000);
	let store, engine, content, random;
	const account = () => store.get('eventtester');
	const cmd = (action, details = {}) => engine.command('eventtester', { id: randomUUID(), revision: account().revision, action, ...details });
	beforeEach(() => {
		store = new RogueStore(':memory:'); content = createPreviewContent(); random = () => 0;
		engine = new RogueEngine(store, content, n => random(n));
		cmd('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());
	function enter(id, floor = 21) {
		store.change('eventtester', a => {
			a.run.floor = floor; a.run.phase = 'choose'; delete a.run.node;
			a.run.choices = [{ id: 'eventtest', name: '事件', kind: 'event', encounters: [], reward: { money: 0, items: {} } }];
			a.run.eventHistory = [];
		});
		let first = true;
		random = n => {
			if (first) { first = false; return Object.keys(EVENT_NAMES).indexOf(id); }
			return 0;
		};
		cmd('select', { value: 'eventtest' }); random = () => 0;
		assert.equal(account().run.node.event.id, id);
	}
	function choose(value, roll = 0) {
		let first = true;
		random = n => {
			if (first) { first = false; return roll % n; }
			return 0;
		};
		return cmd('event', { member: account().run.node.event.key, value });
	}
	function settle(won, retreated = false, faint = false) {
		cmd('battle'); if (retreated) cmd('retreat');
		const run = account().run;
		const result = { encounterId: run.battle.encounterId, won, team: structuredClone(run.team), bag: { ...run.bag } };
		if (faint) result.team.forEach(mon => { mon.hp = 0; mon.pp[0].pp = 1; });
		return { run, result, settled: engine.settle('eventtester', run.battle.token, result) };
	}
	it('adds events on ordinary routes without replacing fixed rest or boss floors', () => {
		random = n => n - 1;
		store.change('eventtester', a => {
			a.run.floor = 21; a.run.phase = 'choose'; delete a.run.choices;
		});
		engine.migrate('eventtester');
		assert.equal(account().run.choices.filter(node => node.kind === 'event').length, 1);
		for (const floor of [19, 20, 100]) {
			store.change('eventtester', a => {
				a.run.floor = floor; a.run.phase = 'choose'; delete a.run.choices;
			});
			engine.migrate('eventtester');
			assert.equal(account().run.choices, undefined);
		}
	});
	it('prioritizes unseen events and never repeats the previous event, even after a long gap', () => {
		const run = account().run;
		for (let i = 0; i < 50; i++) {
			run.floor += 7;
			const id = chooseEvent(run, n => n - 1);
			assert.notEqual(id, run.eventHistory?.slice(-1)[0]?.id);
			(run.eventHistory ||= []).push({ id, floor: run.floor });
		}
		assert.equal(new Set(run.eventHistory.slice(0, 4).map(e => e.id)).size, 4);
	});
	it('keeps spectator rosters and order symmetric with legal randomized wild IVs', () => {
		const run = account().run, rng = new PRNG([4, 3, 2, 1]);
		run.floor = 41; run.node = { id: 'event', kind: 'event', name: '事件', encounters: [], reward: { money: 0, items: {} } };
		let first = true;
		beginEvent(run, n => {
			if (first) { first = false; return Object.keys(EVENT_NAMES).indexOf('forest'); }
			return rng.random(n);
		});
		const [a, b] = run.node.event.teams;
		assert.deepEqual(a, b);
		const ivs = a.flatMap(mon => Object.values(mon.ivs));
		assert(ivs.every(iv => iv >= 20 && iv <= 31));
		assert(new Set(ivs).size > 1);
	});
	it('persists mystery-ball outcomes, queues a full-party gift, and refuses repeated payouts', () => {
		enter('mysteryball');
		store.change('eventtester', a => { while (a.run.team.length < 6) a.run.team.push(createRoguePokemon(set(), stats(0))); });
		const request = { id: randomUUID(), revision: account().revision, action: 'event', member: account().run.node.event.key, value: 'open' };
		engine.command('eventtester', request);
		const saved = JSON.stringify(account()); engine.command('eventtester', request);
		assert.equal(JSON.stringify(account()), saved);
		const run = account().run;
		assert.equal(run.phase, 'blessing'); assert.equal(run.blessings.pending[0].pokemon.stars || 1, 1);
		assert.equal(run.blessings.pending[0].pokemon.set.level, 8);
		assert.ok(Object.values(run.blessings.pending[0].pokemon.set.ivs).every(v => v >= 20 && v <= 31));
		cmd('blessingreward', { member: run.blessings.pending[0].id, value: 'release' });
		assert.equal(account().run.phase, 'event');
		assert.throws(() => cmd('event', { member: run.node.event.key, value: 'open' }), /已更新/);
		cmd('continue'); assert.equal(account().run.floor, 22);
	});
	it('credits the displayed empty ball, leaves empty outcomes empty, and keeps old receipts separate', () => {
		enter('mysteryball'); choose('open', 40);
		assert.equal(account().run.lastReward.items.pokeball, 1);
		enter('mysteryball', 22); choose('open', 60);
		assert.deepEqual(account().run.lastReward.items, {});
		assert.equal(account().run.phase, 'event');
	});
	it('ends an event after defeat, retains losses, and requires revival before advancing', () => {
		enter('room'); choose('fight');
		const before = account().run.bag;
		const { run, result } = settle(false, false, true);
		assert.equal(account().run.phase, 'event');
		assert.equal(account().run.team[0].hp, 0);
		assert.equal(account().run.team[0].pp[0].pp, 1);
		assert.deepEqual(account().run.bag, before);
		assert.equal(account().run.blessings.shards, 0);
		assert.throws(() => cmd('continue'), /复活/);
		const saved = JSON.stringify(account()); engine.settle('eventtester', run.battle.token, result);
		assert.equal(JSON.stringify(account()), saved);
		cmd('use', { value: 'revive', member: account().run.team[0].id }); cmd('continue');
		assert.equal(account().run.floor, 22);
	});
	it('rejects retreat without changing the event, battle or resources', () => {
		enter('room'); choose('fight'); cmd('battle');
		const before = account();
		assert.throws(() => cmd('retreat'), /不能撤退/);
		assert.deepEqual(account(), before);
	});
	it('keeps companions caught before an event defeat and settles the event only after placing them', () => {
		enter('room'); choose('fight');
		store.change('eventtester', a => { while (a.run.team.length < 6) a.run.team.push(createRoguePokemon(set(), stats(0))); });
		cmd('battle'); const run = account().run;
		const captured = createRoguePokemon(run.node.encounters[0].team[0], stats(0), run.battle.encounterId + ':foe:0');
		engine.settle('eventtester', run.battle.token, { encounterId: run.battle.encounterId, won: false,
			team: run.team, bag: run.bag, captures: [captured] });
		assert.equal(account().run.phase, 'settlement');
		assert.equal(account().run.pendingCapture.id, captured.id);
		cmd('replace', { value: run.team[0].id });
		assert.equal(account().run.phase, 'event');
		assert.equal(account().run.team[0].set.species, captured.set.species);
		assert.equal(account().run.blessings.shards, 0);
	});
	it('settles all sleep branches without healing or granting repeatable rewards', () => {
		for (const roll of [0, 50, 80]) {
			enter('room');
			store.change('eventtester', a => { a.run.team[0].hp = 1; a.run.money = 10000; });
			const oldBag = account().run.bag;
			choose('sleep', roll);
			const run = account().run;
			assert.equal(run.team[0].hp, 1); assert.equal(run.phase, 'event');
			if (roll === 0) assert.notDeepEqual(run.bag, oldBag);
			else {
				assert.deepEqual(run.bag, oldBag);
				assert.equal(run.money, 10000 - (roll === 80 ? eventBudget(21, 0.5) : 0));
			}
			assert.throws(() => choose('sleep'), /已更新/);
		}
	});
	it('pays room loot and one four-choice toolbox plus stage shards exactly once', () => {
		enter('room', 101); choose('fight');
		const { run, result } = settle(true);
		const now = account().run;
		assert.equal(now.blessings.shards, 4);
		assert.equal(now.blessings.pending.length, 1);
		assert.equal(now.blessings.pending[0].options.length, 4);
		assert.deepEqual(now.lastReward.items, run.node.wildLoot[0]);
		engine.settle('eventtester', run.battle.token, result);
		assert.equal(account().run.blessings.shards, 4);
		cmd('blessingreward', { member: now.blessings.pending[0].id, value: now.blessings.pending[0].options[0] });
		assert.equal(account().run.phase, 'event');
	});
	it('shows trade costs, blocks unaffordable trades, and pays the agreed mushroom package', () => {
		enter('mushrooms'); const cost = eventBudget(21, 0.4);
		store.change('eventtester', a => { a.run.money = cost - 1; });
		assert.equal(eventView(account().run).options[0].disabled, true);
		assert.throws(() => choose('trade'), /无法选择/);
		store.change('eventtester', a => { a.run.money = cost; }); choose('trade');
		assert.equal(account().run.money, 0);
		const { TREASURES } = require('../../dist/server/fantasy-rogue/economy');
		const value = TREASURES.reduce((sum, item) => sum + (account().run.bag[item.id] || 0) * item.sellPrice, 0);
		assert.equal(value, 1350);
	});
	it('consumes mushroom vitality per entered battle, not per floor or spectator battle', () => {
		enter('mushrooms'); choose('taste');
		assert.equal(account().run.eventBuff.battles, 3);
		for (let i = 3; i > 0; i--) {
			enter('room', 21 + i); choose('fight'); cmd('battle');
			assert.equal(account().run.eventBuff.battles, i - 1);
			assert.equal(engine.battleState('eventtester').eventBuff, true);
			const run = account().run;
			engine.settle('eventtester', run.battle.token, { encounterId: run.battle.encounterId, won: false, team: run.team, bag: run.bag });
		}
		enter('room'); choose('fight'); cmd('battle');
		assert.equal(engine.battleState('eventtester').eventBuff, false);
	});
	it('restores an unused vitality charge when a battle room could not launch', () => {
		enter('mushrooms'); choose('taste');
		enter('room'); choose('fight'); cmd('battle');
		engine.recover('eventtester', account().run.battle.token);
		assert.equal(account().run.eventBuff.battles, 3);
	});
	it('only charges psychic once for actual negative outcomes and never for a voluntary room battle', () => {
		store.change('eventtester', a => { a.run.blessings.owned.push({ id: 'psychic', family: 'psychic', tier: 'prismatic', floor: 50 }); });
		enter('room'); choose('fight'); assert.equal(account().run.blessings.psychic || 0, 0);
		enter('mushrooms'); choose('taste', 90); assert.equal(account().run.blessings.psychic, 25);
		enter('mysteryball', 22); choose('open', 90); assert.equal(account().run.blessings.psychic, 50);
	});
	it('saves a real spectator battle and settles according to its actual winner without player progress', () => {
		enter('forest'); store.change('eventtester', a => { a.run.eventBuff = { battles: 3 }; });
		choose('left');
		const run = account().run, replay = run.node.event.replay;
		assert.ok(replay.log.some(line => line.startsWith('|move|')));
		assert.ok(replay.log.some(line => line.startsWith('|-damage|')));
		assert.ok(replay.log.some(line => line.startsWith('|win|') || line === '|tie|'));
		engine.migrate('eventtester'); assert.deepEqual(account().run.node.event.replay, replay);
		assert.equal(account().run.eventBuff.battles, 3);
		assert.deepEqual(account().run.blessings.defeated, []);
		choose('watched');
		assert.equal(account().run.phase, replay.winner === 1 ? 'ready' : 'event');
		if (replay.winner === 1) assert.equal(account().run.node.encounters[0].team.length, 3);
	});
	it('does not stall a spectator battle by repeatedly using powder into Grass immunity', () => {
		const team = [set('Ivysaur', 'Overgrow', 21, ['Vine Whip', 'Sleep Powder'])];
		const result = simulateForestBattle([team, team], () => 1);
		assert(!result.log.some(line => line.startsWith('|move|') && line.includes('|Sleep Powder|')));
		assert(result.log.some(line => line.startsWith('|win|')));
		assert(result.log.filter(line => line.startsWith('|turn|')).length < 30);
	});
	it('mediation can create one catchable six-member encounter', () => {
		enter('forest'); choose('mediate', 99);
		assert.equal(account().run.node.encounters.length, 1);
		assert.equal(account().run.node.encounters[0].team.length, 6);
		assert.equal(account().run.node.encounters[0].catchable, true);
	});
	it('uses one untyped friend offer and migrates old typed owned/offered blessings', () => {
		assert.equal(ROGUE_BLESSINGS.filter(def => def.family === 'friend').length, 1);
		assert.equal(blessing('friendfire').id, 'friend');
		const run = account().run;
		run.blessings.owned.push({ id: 'friendwater', family: 'friend', type: 'Water', floor: 50, tier: 'silver' });
		run.previousBlessings = ['friendfire']; normalizeBlessings(run);
		assert.equal(run.blessings.owned[0].id, 'friend'); assert.equal(run.blessings.owned[0].type, undefined);
		assert.deepEqual(run.previousBlessings, ['friend']);
		assert.ok(!blessingCandidates(run, content).some(def => def.family === 'friend'));
	});
	it('can claim a saved old typed friend card with the new unrestricted reward', () => {
		store.change('eventtester', a => {
			a.run.floor = 50; a.run.phase = 'blessing';
			a.run.blessings.round = { floor: 50, tier: 'silver', remaining: 1, familiesSeen: ['friend'],
				topClearMindEligible: false, options: [{ id: 'friendfire', refreshes: 1, chosen: false }] };
		});
		cmd('blessing', { slot: 0 });
		const run = account().run;
		assert.equal(run.blessings.owned[0].id, 'friend');
		assert.equal(run.blessings.pending[0].pokemon.stars, 2);
		assert.equal(run.blessings.pending[0].pokemon.set.species, 'Ivysaur');
	});
	it('waits for the start card before drawing Celebi gifts and resumes a full party safely', () => {
		const { storyView } = require('../../dist/server/fantasy-rogue/story');
		cmd('abandon'); content.story = true; engine = new RogueEngine(store, content, () => 0, true);
		store.change('eventtester', a => { a.slots = 6; });
		cmd('storyskip', { value: storyView(account(), true, true).key });
		cmd('start', { starters: ['bulbasaur', 'charmander', 'squirtle', 'chikorita', 'cyndaquil', 'totodile'],
			useSpirit: true, testSpirit: 'celebi' });
		assert.equal(account().run.pendingSpiritGift, true); assert(!account().run.pendingCapture);
		cmd('spiritack'); cmd('startcard', { value: 'grass' });
		assert.equal(account().run.pendingSpiritGift, undefined);
		assert.equal(account().run.pendingCapture.fixedLevel, 40);
		assert.equal(account().run.phase, 'settlement');
		cmd('replace', { value: 'release' });
		assert.equal(account().run.phase, 'choose'); assert.equal(account().run.choices.length, 3);
	});
	it('reweights eligible gifts by 1.25 without changing rarity buckets, including restricted family rewards', () => {
		const rng = new PRNG([1, 2, 3, 4]), random = n => rng.random(n);
		const names = ['Charmander', 'Squirtle', 'Mew', 'Mewtwo'];
		const counts = Object.fromEntries(names.map(name => [name, 0]));
		for (let i = 0; i < 60000; i++) counts[drawGiftSpecies(names, 'fire', random)]++;
		assert.ok(counts.Charmander / counts.Squirtle > 1.20 && counts.Charmander / counts.Squirtle < 1.30);
		assert.ok(counts.Mew > 430 && counts.Mew < 650, JSON.stringify(counts));
		assert.ok(counts.Mewtwo > 30 && counts.Mewtwo < 100, JSON.stringify(counts));
		for (let i = 0; i < 20; i++) assert.equal(drawGiftSpecies(['Squirtle'], 'fire', random), 'Squirtle');
		const run = account().run; run.startCard = 'all';
		const mon = drawBlessingGift(run, content, n => n === 1000 ? 2 : 0, { pool: ['Pikachu'] });
		assert.equal(mon.set.species, 'Pikachu'); assert.equal(mon.set.shiny, true);
	});
	it('keeps wild loot budgets inclusive of the existing drop, not paid twice', () => {
		assert.equal(eventBudget(21, 1.15), 1050);
		assert.equal(expectedWildLoot(1), 254.4);
		assert.equal(expectedWildLoot(161), 4464);
	});
	it('allows catching one wild event opponent without ending a multi-opponent battle', () => {
		enter('forest'); choose('mediate', 99); cmd('battle');
		const state = engine.battleState('eventtester'); state.balls = [{ id: 'pokeball', name: '精灵球', chance: 1 }];
		const battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: state,
			p1: { name: 'Player', team: account().run.team.map(mon => mon.set) },
			p2: { name: 'Wild', team: [set('Magikarp', 'Swift Swim', 1, ['Splash']), set('Magikarp', 'Swift Swim', 1, ['Splash'])] } });
		try {
			battle.makeChoices('team 1', 'team 12');
			throwRogueBall(battle, 'pokeball');
			assert.equal(battle.ended, false); assert.equal(battle.p2.pokemonLeft, 1);
			assert.equal(rogueBattleResult(battle).captures.length, 1);
		} finally { battle.destroy(); }
	});
	it('applies vitality damage in the simulator without modifying recoil or OHKO damage', () => {
		const { rogueEventDamage } = require('../../dist/sim/fantasy-rogue');
		const state = { eventBuff: true }, mockBattle = { fantasyRogue: state };
		const a = { side: { id: 'p1' }, battle: mockBattle }, b = { side: { id: 'p2' }, battle: mockBattle };
		assert.equal(rogueEventDamage(100, b, a, { effectType: 'Move' }), 120);
		assert.equal(rogueEventDamage(100, a, b, { effectType: 'Move' }), 90);
		assert.equal(rogueEventDamage(100, b, a, { effectType: 'Move', ohko: true }), 100);
		assert.equal(rogueEventDamage(100, a, a, { effectType: 'Move' }), 100);
		assert.equal(rogueEventDamage(0, b, a, { effectType: 'Move' }), 0);
		state.eventBuff = false;
		assert.equal(rogueEventDamage(1.5, b, a, { effectType: 'Move' }), 1.5);
		const mon = createRoguePokemon(set('Snorlax', 'Immunity', 50, ['Dragon Rage']), stats(0));
		const battle = new Battle({ formatid: 'gen9fantasyrogue',
			fantasyRogue: { eventBuff: true, encounterId: 'buff-test', team: [mon], boosts: stats(0), bag: {}, balls: [], catchable: false },
			p1: { name: 'Player', team: [{ ...mon.set, fantasyRogueId: mon.id }] }, p2: { name: 'Wild', team: [mon.set] } });
		try {
			battle.makeChoices('team 1', 'team 1');
			const before = battle.sides.map(side => side.active[0].hp);
			battle.makeChoices('move 1', 'move 1');
			assert.equal(before[0] - battle.p1.active[0].hp, 36);
			assert.equal(before[1] - battle.p2.active[0].hp, 48);
		} finally { battle.destroy(); }
	});
});
