'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {Battle, Dex, PRNG} = require('../../dist/sim');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
const {createRoguePokemon, gainExperience} = require('../../dist/server/fantasy-rogue/progression');
const b = require('../../dist/server/fantasy-rogue/blessings');
const {partyEvolutions} = require('../../dist/server/fantasy-rogue/party-evolution');
const {markRogueParticipants} = require('../../dist/sim/fantasy-rogue');
const {minimumEvolutionLevel, lowerToEligibleStage} = require('../../dist/server/fantasy-rogue/evolution');
const {chooseAdventure, fishingFrame, fishingWidth, settleAdventure, adventureView} = require('../../dist/server/fantasy-rogue/event-adventures');
const {forestTeams, eventView, canRetreatRogue, chooseEventOption} = require('../../dist/server/fantasy-rogue/events');
const {rogueAbilityInfo, blessingProgress} = require('../../dist/sim/fantasy-rogue-blessings');
const {EVENT_TEAM_POOLS, eventSpeciesPool, themedEventTeam} = require('../../dist/server/fantasy-rogue/event-teams');
const {eventCost} = require('../../dist/server/fantasy-rogue/early-balance');
const {set, stats, commandAfterOpening} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue flow, adventures and ability visibility', function () {
	this.timeout(30000);
	let content;
	before(() => { content = createPreviewContent(); });
	function setup(id = 'dice', floor = 21) {
		const run = {id: 'flow', floor, phase: 'event', money: 10000, bag: {}, boosts: stats(0), caught: [],
			team: [createRoguePokemon(set(), stats(0), 'flow:partner')],
			node: {id, name: id, kind: 'event', encounters: [], reward: {money: 0, items: {}}, event: {id, key: id, stage: 'choice'}}};
		const account = {run, points: 0, slots: 1, captures: {}, unlocked: []};
		b.normalizeBlessings(run); return {run, account};
	}
	function worth(run) {
		return run.money + Object.entries(run.bag).reduce((sum, [id, count]) => sum + count * (content.items.find(i => i.id === id)?.sellPrice || 0), 0);
	}
	for (const face of [1, 2, 3, 4, 5, 6]) it(`settles a single paid die roll: ${face}`, () => {
		const {run, account} = setup(), fee = Math.round(eventCost(run.floor) * .3);
		chooseAdventure(account, run, content, n => n === 6 ? face - 1 : 0, 'roll');
		assert.equal(worth(run), 10000 - fee + (face === 6 ? fee * 4 : face === 1 ? fee * 2 : 0));
		assert(run.node.event.settled); assert(run.node.event.trainingAidBlocked);
		assert.equal(adventureView(run).options.length, 0);
	});
	it('applies Loaded Dice to the actual paid dice event without refunding fees or permitting repeat payouts', () => {
		const {run, account} = setup(); run.blessings.owned.push({id: 'dice', family: 'dice', tier: 'silver', floor: 1});
		const fee = Math.round(eventCost(run.floor) * .3);
		chooseEventOption(account, run, content, n => n === 6 ? 2 : 0, 'dice', 'roll');
		assert.equal(worth(run), 10000 - fee + fee * 4);
		assert(run.node.event.result.some(line => line.includes('6 点')));
		const saved = structuredClone(run);
		assert.throws(() => chooseEventOption(account, run, content, () => 0, 'dice', 'roll'));
		assert.deepEqual(run, saved);
	});
	it('applies Loaded Dice only to the bandit coin choice and does not improve unrelated outcomes', () => {
		for (const choice of ['coin', 'talk']) {
			const {run, account} = setup('bandits');
			run.blessings.owned.push({id: 'dice', family: 'dice', tier: 'silver', floor: 1});
			chooseAdventure(account, run, content, () => 1, choice);
			if (choice === 'coin') {
				assert.equal(run.money, 10000); assert(run.node.event.result.some(line => line.includes('正面朝上')));
			} else assert(run.money < 10000);
		}
	});
	it('bandits have distinct free, robbed, victorious and defeated outcomes', () => {
		const success = setup('bandits'); chooseAdventure(success.account, success.run, content, () => 0, 'coin');
		assert.equal(success.run.money, 10000);
		const robbed = setup('bandits'); chooseAdventure(robbed.account, robbed.run, content, () => 1, 'coin');
		const failed = setup('bandits'); settleAdventure(failed.run, content, () => 0, false);
		assert(failed.run.money < robbed.run.money); assert(robbed.run.money < 10000);
		const fight = setup('bandits'); chooseAdventure(fight.account, fight.run, content, () => 0, 'fight');
		assert.equal(fight.run.phase, 'ready'); assert.equal(fight.run.node.encounters[0].team.length, 3);
		assert(canRetreatRogue(fight.run)); settleAdventure(fight.run, content, () => 0, true);
		assert(worth(fight.run) > 10000);
	});
	it('shows only required costs, with no possible-outcome spoilers', () => {
		for (const id of ['mysteryball', 'forest', 'mushrooms', 'room', 'bandits', 'dice']) {
			const {run} = setup(id);
			const view = eventView(run);
			for (const option of view.options) assert(!/概率|获得|损失|全队三场/.test(option.text), `${id}:${option.text}`);
		}
	});
	it('finishes zero-hit fishing once the persisted deadline expires, with consolation coins', () => {
		const {run, account} = setup('fishing');
		chooseAdventure(account, run, content, () => 0, 'fishstart', 100000);
		assert.throws(() => chooseAdventure(account, run, content, () => 0, 'fishfinish', 101000), /没收完/);
		const reloaded = JSON.parse(JSON.stringify(account));
		chooseAdventure(reloaded, reloaded.run, content, () => 0, 'fishfinish', 114001);
		assert.equal(reloaded.run.money, 10142); assert(reloaded.run.node.event.settled);
		assert.equal(adventureView(reloaded.run).options.length, 0);
	});
	it('keeps timing continuous, caps at six hits and rejects fast repeated taps', () => {
		const {run, account} = setup('fishing'); let now = 100000;
		chooseAdventure(account, run, content, () => 0, 'fishstart', now);
		for (let i = 0; i < 6; i++) {
			const fish = run.node.event.fishing;
			now = Math.max(now + 1000, fish.lastTap + 1000);
			while (Math.abs(fishingFrame(fish, now).cursor - fish.center) > fishingWidth(fish.hits) / 2) now += 10;
			const cursor = fishingFrame(fish, now).cursor;
			chooseAdventure(account, run, content, () => 0, 'fishtap', now);
			assert.equal(fish.hits, i + 1); assert(Math.abs(fishingFrame(fish, now).cursor - cursor) < 0.001);
			if (i < 5) { chooseAdventure(account, run, content, () => 0, 'fishtap', now + 50); assert.equal(fish.hits, i + 1); }
		}
		assert(run.node.event.settled); assert(fishingWidth(6) >= .16); assert(now < 120000);
		assert(worth(run) > 10000);
	});
	it('offers a legal caught partner or an elite according to the saved fishing score', () => {
		for (const elite of [false, true]) {
			const {run, account} = setup('fishing', 5);
			run.node.event.fishing = {started: 100, anchor: 100, travel: 0, hits: 6, misses: 0, lastTap: 100, center: .5};
			let hundreds = 0;
			chooseAdventure(account, run, content, n => n === 100 ? (++hundreds === 1 ? 99 : elite ? 0 : 99) : n - 1, 'fishfinish', 20000);
			if (elite) {
				assert.equal(run.phase, 'ready'); assert.equal(run.node.event.stage, 'battle');
				assert(run.node.encounters[0].catchable);
			} else {
				const mon = run.blessings.pending[0].pokemon;
				assert.equal(mon.set.level, 5); assert(minimumEvolutionLevel(mon.set.species) <= 5);
				assert(Object.values(mon.set.ivs).every(iv => iv >= 26));
			}
		}
	});
	it('makes non-mirror balanced forest teams across stages and RNG seeds', () => {
		for (const level of [3, 5, 16, 25, 32, 50, 100]) for (let i = 0; i < 30; i++) {
			const rng = new PRNG([i, level, 2, 9]), teams = forestTeams(level, n => rng.random(n));
			assert.equal(new Set(teams.flat().map(s => s.species)).size, 6);
			const totals = teams.map(t => t.reduce((sum, mon) => sum + Dex.species.get(mon.species).bst, 0));
			assert(Math.max(...totals) / Math.min(...totals) <= 1.1);
		}
	});
	it('draws diverse, level-legal event casts without repeating a family within a trainer team', () => {
		const dex = Dex.mod('gen9fantasy');
		const root = name => { const s = dex.species.get(name); return s.prevo ? root(s.prevo) : s.baseSpecies; };
		for (const [theme, names] of Object.entries(EVENT_TEAM_POOLS)) {
			for (const name of names) assert(dex.species.get(name).exists, `${theme}: ${name}`);
			for (const level of [5, 15, 30, 60, 100]) {
				const seen = new Set(), allowed = eventSpeciesPool(theme, level);
				assert(allowed.length >= 15, `${theme} at ${level} has enough different partners`);
				for (let i = 0; i < 50; i++) {
					const rng = new PRNG([i, level, 7, 2]), team = themedEventTeam(theme, level, 3, n => rng.random(n));
					assert.equal(team.length, 3); assert.equal(new Set(team.map(p => root(p.species))).size, 3);
					for (const mon of team) {
						assert(allowed.includes(mon.species)); assert.equal(mon.level, level);
						assert(minimumEvolutionLevel(mon.species) <= level, mon.species); seen.add(mon.species);
					}
				}
				assert(seen.size >= 15, `${theme}: should not keep generating the same trio`);
			}
		}
	});
	it('generates only level-legal gifts and repairs unclaimed old gifts without losing identity', () => {
		for (const floor of [1, 50, 100, 150]) {
			const {run} = setup('dice', floor), rng = new PRNG([floor, 3, 4, 5]);
			for (let i = 0; i < 100; i++) {
				const gift = b.drawBlessingGift(run, content, n => rng.random(n));
				assert.equal(gift.set.species, lowerToEligibleStage(gift.set.species, gift.set.level));
			}
		}
		const {run} = setup('dice', 1), mon = createRoguePokemon(set('Venusaur', 'Overgrow', 5), stats(0), 'oldgift', 2);
		run.blessings.pending.push({kind: 'gift', pokemon: mon}); b.normalizeBlessings(run);
		assert.equal(run.blessings.pending[0].pokemon.set.species, 'Bulbasaur');
		assert.equal(run.blessings.pending[0].pokemon.id, mon.id); assert.equal(run.blessings.pending[0].pokemon.stars, 2);
		assert.equal(lowerToEligibleStage('Regigigas-Fantasy', 90), 'Regigigas-Fantasy');
	});
	it('records confirmed starters and preserves old capture history during migration', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, content, () => 0), user = 'starterflow';
			commandAfterOpening(engine, user, {id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur']});
			const first = store.get(user), mon = first.run.team[0];
			assert(first.starterTraits.bulbasaur.natures.includes(Dex.toID(mon.set.nature)));
			assert.equal(first.captures.bulbasaur || 0, 0);
			store.change(user, a => { delete a.starterTraits; a.run.team.push(createRoguePokemon(set('Magikarp', 'Swift Swim', 5), stats(0), 'captured')); a.run.caught.push('captured'); });
			engine.migrate(user); const repaired = store.get(user);
			assert(repaired.starterTraits.bulbasaur.natures.length); assert(repaired.starterTraits.magikarp.natures.length);
		} finally { store.close(); }
	});
	it('keeps a boss card after defeat, applies it only at its boss and consumes it on victory', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, require('../fixtures/fantasy-rogue').content(), () => 0), user = 'mentorflow';
			const saved = () => store.get(user);
			const cmd = (action, extra = {}) => engine.command(user, {id: randomUUID(), revision: saved().revision, action, ...extra});
			commandAfterOpening(engine, user, {id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur']});
			cmd('select', {value: 'grass'});
			store.change(user, a => {a.run.mentorCard = {floor: 10, kind: 'guard'};});
			cmd('battle'); assert.equal(engine.battleState(user).mentorCard, undefined);
			store.change(user, a => {delete a.run.battle; a.run.floor = 9; a.run.phase = 'rest'; a.run.mentorOffer = 10;});
			cmd('mentorcard', {value: 'guard'}); cmd('continue'); cmd('battle');
			assert.equal(engine.battleState(user).mentorCard, 'guard');
			let run = saved().run;
			engine.settle(user, run.battle.token, {encounterId: run.battle.encounterId, won: false, team: run.team, bag: run.bag});
			assert.deepEqual(saved().run.mentorCard, {floor: 10, kind: 'guard'});
			engine.migrate(user); cmd('battle'); assert.equal(engine.battleState(user).mentorCard, 'guard');
			run = saved().run;
			engine.settle(user, run.battle.token, {encounterId: run.battle.encounterId, won: true, team: run.team, bag: run.bag});
			assert.equal(saved().run.floor, 11); assert.equal(saved().run.mentorCard, undefined);
		} finally {store.close();}
	});
	it('persists an evolution prompt and keeps evolution available after postponing it', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, content, () => 0), user = 'evolutionflow';
			commandAfterOpening(engine, user, {id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur']});
			store.change(user, a => {
				a.run.team = [createRoguePokemon(set('Bulbasaur', 'Overgrow', 15), stats(0), 'evo')];
				gainExperience(a.run, a.run.team[0], 1000);
			});
			engine.migrate(user);
			assert(store.get(user).run.team[0].evolutionNotice);
			engine.command(user, {id: randomUUID(), revision: store.get(user).revision, action: 'evolutionnotice', member: 'evo'});
			const run = store.get(user).run;
			assert(!run.team[0].evolutionNotice); assert.equal(run.team[0].set.species, 'Bulbasaur');
			assert(partyEvolutions(run.team[0], run).some(evo => evo.ready));
		} finally {store.close();}
	});
	function makeBattle(extra = [], card, ability = 'Overgrow', fishingElite = false) {
		const mon = createRoguePokemon(set('Bulbasaur', ability, 50, ['Tackle']), stats(0)); mon.extraAbilities = extra;
		const battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: {encounterId: 'flowbattle', progression: true, team: [mon], boosts: stats(0), bag: {}, balls: [], catchable: false, mentorCard: card, fishingElite},
			p1: {team: [mon.set]}, p2: {team: [set('Snorlax', 'Immunity', 50, ['Splash'])]}});
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		return battle;
	}
	it('does not weaken fishing elites or reset their later boosts', () => {
		const battle = makeBattle([], undefined, 'Overgrow', true);
		try {
			const foe = battle.p2.active[0];
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe']) assert.equal(foe.boosts[stat], 0);
			battle.boost({atk: 2}, foe); markRogueParticipants(battle);
			assert.equal(foe.boosts.atk, 2);
		} finally {battle.destroy();}
	});
	it('exposes granted abilities and actual stat modifiers only to their owner', () => {
		const battle = makeBattle(['roguegreatmage', 'hugepower'], 'guard', 'Immunity');
		try {
			const mon = battle.p1.active[0], info = mon.getSwitchRequestData().rogueAbilityInfo;
			assert.deepEqual(info.abilities, ['roguegreatmage', 'hugepower']);
			assert.equal(mon.getStat('spa'), mon.storedStats.spa * 2); assert.equal(mon.getStat('atk'), mon.storedStats.atk * 2);
			assert.equal(mon.getStat('def'), battle.modify(mon.storedStats.def, 1.5));
			battle.sendUpdates(); const index = battle.log.findIndex(line => line.startsWith('|-rogueinfo|'));
			assert(index > 0); assert.equal(battle.log[index - 1], '|split|p1'); assert.equal(battle.log[index + 1], '');
			mon.addVolatile('gastroacid'); assert.equal(rogueAbilityInfo(mon).active, false);
			assert.equal(mon.getStat('spa'), mon.storedStats.spa);
		} finally { battle.destroy(); }
	});
	it('does not produce insight progress without the insight blessing and keeps wild PP at base values', () => {
		const battle = makeBattle();
		try {
			assert.equal(battle.p2.active[0].moveSlots[0].maxpp, Dex.moves.get('Splash').pp);
			assert.deepEqual(blessingProgress(battle).insight, {});
		} finally { battle.destroy(); }
	});
	for (const card of ['attack', 'guard', 'balanced']) it(`uses the confirmed ${card} boss-card modifiers`, () => {
		const baseline = makeBattle([], undefined, 'Immunity'), boosted = makeBattle([], card, 'Immunity');
		try {
			const source = boosted.p1.active[0], base = baseline.p1.active[0];
			assert.equal(source.getStat('def'), boosted.modify(base.getStat('def'), card === 'guard' ? 1.5 : card === 'balanced' ? 1.3 : 1.2));
			assert.equal(source.getStat('spe'), boosted.modify(base.getStat('spe'), card === 'balanced' ? 1.15 : 1));
			baseline.randomizer = boosted.randomizer = n => n;
			const damage = boosted.damage(boosted.actions.getDamage(source, boosted.p2.active[0], 'tackle'),
				boosted.p2.active[0], source, boosted.dex.getActiveMove('tackle'));
			const normal = baseline.damage(baseline.actions.getDamage(base, baseline.p2.active[0], 'tackle'),
				baseline.p2.active[0], base, baseline.dex.getActiveMove('tackle'));
			assert(Math.abs(damage / normal - (card === 'attack' ? 1.4 : card === 'balanced' ? 1.3 : 1.2)) < 0.08);
		} finally { baseline.destroy(); boosted.destroy(); }
	});
});
