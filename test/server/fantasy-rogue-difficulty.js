'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { difficultyScale, difficultyCardScale, difficultyIVs, ROGUE_DIFFICULTIES } = require('../../dist/sim/rogue-difficulty');
const { migrateDifficulty, clearDifficulty, syncRunDifficulty, syncMemberDifficulty } = require('../../dist/server/fantasy-rogue/difficulty');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createRoguePokemon, rebuildMember } = require('../../dist/server/fantasy-rogue/progression');
const { recordClear } = require('../../dist/server/fantasy-rogue/legacy');
const { buildRogueDuelState } = require('../../dist/server/fantasy-rogue/duels');
const { settleRematch } = require('../../dist/server/fantasy-rogue/companion-rematches');
const { content, set, stats, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue difficulty tiers', function () {
	this.timeout(30000);
	const makeRun = (difficulty, floor = 200) => ({ id: randomUUID(), difficulty, difficultyRulesVersion: 1, floor,
		phase: 'complete', owner: { id: randomUUID(), name: 'Difficulty' }, contentVersion: 'test',
		team: [createRoguePokemon(set('Bulbasaur', 'Overgrow', 80), stats(0))], boosts: stats(0), bag: {}, money: 0,
		caught: [], notices: [], encounter: 0, node: { kind: 'boss', encounters: [], reward: { money: 0, items: {} } } });
	for (const tier of ROGUE_DIFFICULTIES) for (const floor of [1, 50, 100, 150, 200]) {
		it(`uses native combat and panel stats exactly once at ${tier}/${floor}`, () => {
			const r = makeRun(tier, floor); syncRunDifficulty(r);
			const enemy = { ...set('Bulbasaur', 'Overgrow', 80), ivs: difficultyIVs(stats(20), tier, floor) };
			const base = createRoguePokemon(enemy, stats(0));
			const battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
				fantasyRogue: { difficulty: { tier, floor }, encounterId: 'scale', team: r.team, boosts: r.boosts, bag: {}, balls: [], catchable: false },
				p1: { team: r.team.map(mon => mon.set) }, p2: { team: [enemy] } });
			try {
				const player = battle.p1.pokemon[0], foe = battle.p2.pokemon[0];
				assert.deepEqual({ hp: player.maxhp, ...player.storedStats }, r.team[0].stats);
				for (const stat of Object.keys(stats(0))) assert.equal(stat === 'hp' ? foe.maxhp : foe.storedStats[stat],
					Math.max(1, Math.floor(base.stats[stat] * difficultyScale(tier, floor, true) + 1e-9)), stat);
				const before = structuredClone(r.team[0]); rebuildMember(r.team[0], r.boosts); syncRunDifficulty(r);
				assert.deepEqual(r.team[0].stats, before.stats);
				if (tier === 'easy') assert(Object.values(r.team[0].set.ivs).every(iv => iv <= 10));
				const a = difficultyScale(tier, floor), b = difficultyScale(tier, floor, true);
				assert(tier === 'easy' ? b < a && a < 1 : tier ? b > a && a > 1 : a === 1 && b === 1);
			} finally { battle.destroy(); }
		});
	}
	it('preserves spent HP, fainting, PP, tactical zeros and stored donors across floor and form changes', () => {
		const r = makeRun('easy', 1), mon = r.team[0]; mon.set.ivs.atk = mon.set.ivs.spe = 0;
		mon.formFusion = { donor: createRoguePokemon(set('Reshiram', 'Turboblaze', 80), stats(0)) };
		syncRunDifficulty(r); mon.hp -= 8; mon.pp[0].pp -= 3;
		const spentPP = mon.pp[0].pp; r.floor = 200; syncRunDifficulty(r);
		assert.equal(mon.maxhp - mon.hp, 8); assert.equal(mon.pp[0].pp, spentPP);
		assert.equal(mon.set.ivs.atk, 0); assert.equal(mon.set.ivs.spe, 0);
		assert(Object.values(mon.formFusion.donor.set.ivs).every(iv => iv <= 10));
		mon.hp = 0; mon.set.species = 'Ivysaur'; rebuildMember(mon, r.boosts);
		assert.equal(mon.hp, 0);
		const before = structuredClone(mon); syncMemberDifficulty(mon, r); assert.deepEqual(mon, before);
		assert.deepEqual(difficultyIVs({ ...stats(31), atk: 0, spe: 0 }, 5, 200), { ...stats(31), atk: 0, spe: 0 });
	});
	it('unlocks only the next highest cleared tier and its own spirit permission, independently of cards', () => {
		const account = { points: 20 };
		clearDifficulty(account, makeRun('easy')); assert.equal(account.difficulties.highest, 0);
		assert.deepEqual(account.difficulties.spirits, ['easy']);
		for (let tier = 0; tier <= 5; tier++) {
			const run = makeRun(tier); clearDifficulty(account, run);
			assert.equal(account.difficulties.highest, Math.min(5, tier + 1));
			const before = structuredClone(account); clearDifficulty(account, run); clearDifficulty(account, makeRun(0));
			assert.deepEqual(account, before);
		}
		assert.deepEqual(account.difficulties.spirits, ['easy', '0', '1', '2', '3', '4', '5']);
		const bypass = {}; clearDifficulty(bypass, { ...makeRun(5), difficultyTest: true });
		assert.deepEqual(bypass.difficulties, { highest: 0, cleared: [], spirits: [] });
	});
	it('migrates reliable legacy evidence once without inventing clears or mutating old snapshots', () => {
		const old = { version: 1, snapshot: { floor: 200, team: [{ stats: stats(999) }] } };
		for (const account of [{ cards: [old] }, { pendingClear: old }, { run: { floor: 200, phase: 'complete' } }]) {
			const before = JSON.stringify(account); migrateDifficulty(account);
			assert.equal(account.difficulties.highest, 1);
			const migrated = structuredClone(account); migrateDifficulty(account); assert.deepEqual(account, migrated);
			delete account.difficulties; assert.equal(JSON.stringify(account), before);
		}
		const onlySpirit = { spiritUnlocked: true }; migrateDifficulty(onlySpirit);
		assert.deepEqual(onlySpirit.difficulties, { highest: 0, cleared: [], spirits: ['0'] });
		const ongoing = { run: { floor: 100, phase: 'ready' } }; migrateDifficulty(ongoing); assert.equal(ongoing.difficulties.highest, 0);
	});
	it('keeps archive scales separate from the tower and restores both sides in a real duel', () => {
		const cards = ROGUE_DIFFICULTIES.map(tier => {
			const r = makeRun(tier), account = { points: 20 }; syncRunDifficulty(r); const before = structuredClone(r.team);
			recordClear(account, r); const card = account.cards[0];
			assert.deepEqual(r.team, before); assert.equal(card.snapshot.difficultyScale, difficultyCardScale(tier));
			if (tier === 'easy') assert.equal(card.snapshot.difficultyLabel, '护符庇佑');
			return card;
		});
		for (let i = 1; i < cards.length; i++) assert(cards[i].snapshot.team[0].stats.hp > cards[i - 1].snapshot.team[0].stats.hp);
		const before = JSON.stringify(cards), state = buildRogueDuelState(cards[0], cards[6]);
		const battle = new Battle({ formatid: 'gen9fantasyrogueduel', fantasyRogue: state,
			p1: { team: state.team.map(m => m.set) }, p2: { team: state.duel.team.map(m => m.set) } });
		try {
			assert.deepEqual({ hp: battle.p1.pokemon[0].maxhp, ...battle.p1.pokemon[0].storedStats }, cards[0].snapshot.team[0].stats);
			assert.deepEqual({ hp: battle.p2.pokemon[0].maxhp, ...battle.p2.pokemon[0].storedStats }, cards[6].snapshot.team[0].stats);
			assert.equal(JSON.stringify(cards), before);
		} finally { battle.destroy(); }
	});
	it('enforces start permissions, a locked running tier and local bypass isolation', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, content(), () => 0);
			const cmd = (action, extra = {}) => commandAfterOpening(engine, 'tier', { id: randomUUID(), revision: store.get('tier').revision, action, ...extra });
			for (const difficulty of [1, 5, -1, '1', 7]) assert.throws(() => cmd('start', { starters: ['bulbasaur'], difficulty }));
			cmd('start', { starters: ['bulbasaur'], difficulty: 'easy' });
			assert(Object.values(store.get('tier').run.team[0].set.ivs).every(iv => iv <= 10));
			assert.throws(() => cmd('select', { value: 'grass', difficulty: 0 }), /锁定/);
			assert.throws(() => cmd('charm', { value: 'accept' }), /护符/);
			assert.throws(() => cmd('restartsetup'), /已经开始/);
		} finally { store.close(); }
	});
	for (const tier of ['easy', 5]) it(`captures with player scaling and keeps collection boundaries in ${tier}`, () => {
		const store = new RogueStore(':memory:'), config = content(); config.progression = true;
		for (const item of config.items.filter(i => i.kind === 'ball')) item.multiplier = 255;
		config.floors[1][0].encounters[0].team[0].shiny = true;
		const engine = new RogueEngine(store, config, () => 0, true); let battle;
		try {
			const cmd = (action, extra = {}) => commandAfterOpening(engine, 'catchtier', { id: randomUUID(), revision: store.get('catchtier').revision, action, ...extra });
			cmd('start', { starters: ['bulbasaur'], difficulty: tier }); cmd('select', { value: 'grass' });
			store.change('catchtier', a => { a.run.node.encounters = a.run.node.encounters.slice(0, 1); }); cmd('battle');
			const r = store.get('catchtier').run;
			battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: engine.battleState('catchtier'),
				p1: { team: r.team.map(m => m.set) }, p2: { team: r.node.encounters[0].team } });
			battle.makeChoices('team 1', 'team 1'); battle.makeChoices('rogueball pokeball', 'move 1');
			const result = rogueBattleResult(battle); assert(result.captured);
			engine.capture('catchtier', r.battle.token, result.captured); engine.settle('catchtier', r.battle.token, result);
			const saved = store.get('catchtier'), mon = saved.run.team.find(m => m.set.species === 'Magikarp');
			assert.equal(mon.difficulty.tier, tier); assert.equal(mon.difficulty.floor, 2); assert(mon.set.shiny);
			assert(saved.unlocked.includes('magikarp')); assert(saved.starterTraits.magikarp.shiny);
			if (tier === 'easy') { assert(Object.values(mon.set.ivs).every(iv => iv <= 10)); assert(!saved.starterTraits.magikarp.natures?.length); }
			const expected = createRoguePokemon(mon.set, saved.run.boosts, mon.id, mon.stars, mon.statModifiers, mon.difficulty);
			assert.deepEqual(mon.stats, expected.stats);
			const again = structuredClone(mon); engine.migrate('catchtier');
			assert.deepEqual(store.get('catchtier').run.team.find(m => m.id === mon.id).stats, again.stats);
		} finally { battle?.destroy(); store.close(); }
	});
	it('blocks every permanent point entry in easy while paying local items and coins', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, content(), () => 0), user = 'easypoints';
			const cmd = (action, extra = {}) => commandAfterOpening(engine, user, { id: randomUUID(), revision: store.get(user).revision, action, ...extra });
			cmd('start', { starters: ['bulbasaur'], difficulty: 'easy' }); const points = store.get(user).points;
			store.change(user, a => {
				a.run.floor = 20; a.run.phase = 'choose'; delete a.run.choices;
			});
			cmd('select', { value: 'boss' }); cmd('battle'); const r = store.get(user).run;
			engine.settle(user, r.battle.token, { encounterId: r.battle.encounterId, won: true, team: r.team, bag: r.bag });
			assert.equal(store.get(user).points, points);
			const a = store.get(user), run = a.run;
			run.postgame = { stage: 'battle', before: structuredClone(run), node: structuredClone(run.node), encounter: run.encounter };
			engine.finishGodChallenge(a, run, 'won'); assert.equal(a.points, points); assert.equal(run.lastReward.points, 0);
			run.node = { event: { id: 'rematch', rematch: 'r' } }; run.rematches = [{ id: 'r', companion: 'brock', floor: 20, reward: { points: 2, money: 100, items: { potion: 1 } } }];
			settleRematch(a, run, true);
			assert.equal(a.points, points); assert.equal(run.lastReward.points, 0); assert(run.bag.potion);
		} finally { store.close(); }
	});
});
