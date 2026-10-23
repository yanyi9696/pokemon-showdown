'use strict';
const assert = require('assert').strict;
const {Battle, Dex} = require('../../dist/sim');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {rogueCodex} = require('../../dist/server/fantasy-rogue/codex');
const {blessingDisplay, compareBlessingNames} = require('../../dist/server/fantasy-rogue/blessing-text');
const b = require('../../dist/server/fantasy-rogue/blessings');
const data = require('../../dist/sim/rogue-blessing-data');
const {recordClear} = require('../../dist/server/fantasy-rogue/legacy');
const {set, stats} = require('../fixtures/fantasy-rogue');
const zero = () => 0;

describe('Fantasy Rogue player copy and four-stage blessing rewards', function () {
	this.timeout(30000);
	let content;
	before(() => { content = createPreviewContent(); });
	function setup(floor = 1, size = 1) {
		const team = Array.from({length: size}, () => createRoguePokemon(set('Pikachu', 'Static', 50, ['Tackle']), stats(0)));
		team.forEach(mon => { mon.initialPartner = true; });
		const run = {id: 'blessing-copy', floor, phase: 'blessing', team, boosts: stats(0), bag: {}, money: 0, caught: [], startingSlots: size};
		const account = {points: 0, slots: size, captures: {}, unlocked: [], run};
		b.normalizeBlessings(run); return {run, account};
	}
	function pick(run, account, id) {
		const def = data.blessing(id);
		run.blessings.round = {floor: run.floor, tier: def.tier, remaining: 1, familiesSeen: [def.family],
			options: [{id, refreshes: 0, chosen: false}]};
		b.handleBlessingCommand(account, run, content, {action: 'blessing', slot: 0}, zero);
	}
	function rewardValue(run) {
		return run.money + Object.entries(run.bag).reduce((value, [id, count]) => {
			const item = content.items.find(item => item.id === id);
			return value + count * (item ? item.sellPrice || item.price : Dex.mod('gen9fantasy').items.get(id).megaStone ? 6000 : 600);
		}, 0);
	}
	for (const [stage, floor] of data.BLESSING_STAGES.entries()) {
		it(`grants and describes exact coin totals at floor ${floor}`, () => {
			for (const id of ['money', 'bigmoney']) {
				const {run, account} = setup(floor); pick(run, account, id);
				assert.equal(run.money, (id === 'money' ? [4000, 8000, 12000, 16000] : [10000, 20000, 30000, 40000])[stage]);
				const view = b.blessingView(run).owned[0];
				assert.equal(view.text, `立即获得 ${run.money} 金币。`);
				assert.equal(view.name, data.blessing(id).name + '+'.repeat(stage));
			}
		});
		it(`pays late-selection compensation exactly once at floor ${floor}`, () => {
			for (const id of ['rocketcatch', 'battletask', 'eventtask', 'capturebonus', 'shopraid']) {
				const {run, account} = setup(floor); pick(run, account, id);
				const before = JSON.stringify({bag: run.bag, money: run.money, pending: run.blessings.pending});
				assert.throws(() => b.handleBlessingCommand(account, run, content, {action: 'blessing', slot: 0}, zero));
				assert.equal(JSON.stringify({bag: run.bag, money: run.money, pending: run.blessings.pending}), before);
				if (id === 'shopraid') {
					assert.equal(run.blessings.pending.length, [0, 1, 1, 2][stage]);
					assert(run.blessings.pending.every(r => r.kind === 'toolbox' && r.options.length === 4));
					if (stage === 2) assert(run.blessings.pending[0].title.includes('高级'));
				} else assert.equal(rewardValue(run), stage ? Math.floor(data.treasureBudget(floor) * 0.8) : 0);
			}
		});
		it(`heals ${15}% for the medical blessing acquired at floor ${floor}`, () => {
			const {run, account} = setup(floor, 2); pick(run, account, 'medic');
			const mon = run.team[0]; mon.hp = 1; mon.status = 'psn'; run.team[1].hp = 0;
			run.floor = 190; // Its acquired version remains fixed while climbing.
			b.settleBlessingBattle(account, run, content, {won: false, encounterId: 'loss', defeated: []}, zero);
			assert.equal(mon.hp, 1); assert.equal(mon.status, 'psn');
			const expected = 1 + Math.floor(mon.maxhp * (15) / 100);
			const result = {won: true, encounterId: 'win', defeated: []};
			b.settleBlessingBattle(account, run, content, result, zero);
			assert.equal(mon.hp, expected); assert.equal(mon.status, ''); assert.equal(run.team[1].hp, 0);
			b.settleBlessingBattle(account, run, content, result, zero); assert.equal(mon.hp, expected);
			assert(b.blessingView(run).owned[0].text.includes(`${15}%`));
		});
	}
	it('scales every treasure bag by its actual acquisition floor, including non-blessing sources', () => {
		let previous = 0;
		for (const floor of [1, 50, 100, 150]) {
			const {run} = setup(floor); b.treasure(run, content, zero);
			const value = rewardValue(run);
			assert.equal(value, data.treasureBudget(floor) * 0.8); assert(value > previous); previous = value;
		}
	});
	it('lists every staged version with the same text as selection and owned cards, without duplicate gameplay IDs', () => {
		const entries = rogueCodex(undefined, 'blessings', true).entries;
		assert.equal(entries.length, data.ROGUE_BLESSINGS.length + data.STAGED_BLESSING_FAMILIES.length * 3);
		assert.equal(new Set(entries.map(e => e.id)).size, entries.length);
		for (const def of data.ROGUE_BLESSINGS) {
			const versions = entries.filter(e => e.blessingId === def.id);
			assert.equal(versions.length, data.STAGED_BLESSING_FAMILIES.includes(def.family) ? 4 : 1);
			for (const entry of versions) {
				const floor = entry.variantFloor || def.floors?.[0] || 1;
				const {run} = setup(floor);
				run.blessings.owned = [{...def, floor}];
				run.blessings.round = {floor, tier: def.tier, remaining: 1, options: [{id: def.id, refreshes: 1, chosen: false}]};
				const view = b.blessingView(run);
				assert.equal(view.owned[0].text, view.round.options[0].text, def.id);
				if (entry.variantFloor) assert.equal(entry.text, view.owned[0].text, entry.id);
				assert(!/乘算|触发留得青山在|后台|期望|不重复领取|行动顺序 \+0\.5/.test(entry.text), entry.id);
			}
		}
		assert.deepEqual(entries, [...entries].sort(compareBlessingNames));
		assert(entries.findIndex(e => e.blessingId === 'ascent') < entries.findIndex(e => e.blessingId === 'topclearmind'));
		assert.equal(entries.filter(e => e.blessingId === 'ordinary').length, 1);
	});
	it('keeps undiscovered variant effects hidden and unlocks the family without altering discovery records', () => {
		const account = {discoveries: {blessings: ['money'], events: []}};
		const before = JSON.stringify(account), entries = rogueCodex(account, 'blessings').entries;
		assert(entries.filter(e => e.blessingId === 'money').every(e => e.unlocked && /\d+ 金币/.test(e.text)));
		assert(entries.filter(e => e.blessingId === 'medic').every(e => !e.unlocked && e.text === '？？？'));
		assert.equal(JSON.stringify(account), before);
	});
	it('shows each emblem type, independent slot rule and its five named moves', () => {
		for (const type of Object.keys(data.BLESSING_TYPES)) for (const family of ['typexp', 'typelink']) {
			const text = blessingDisplay(data.blessing(family + type.toLowerCase()), 50).text;
			assert(text.includes(`【${data.BLESSING_TYPES[type]}属性转】`));
			assert(text.includes('不占道具位，可取下')); assert(text.includes('副属性'));
			for (const name of data.EMBLEM_MOVE_NAMES[type]) assert(text.includes(`【${name}】`));
		}
	});
	it('offers bond only on floor one and reduces its weight with fewer initial partners', () => {
		let previous = 0;
		for (let size = 1; size <= 6; size++) {
			const {run} = setup(1, size), bond = b.blessingCandidates(run, content).find(e => e.id === 'bond');
			assert(bond.appearanceWeight > previous); previous = bond.appearanceWeight;
			run.previousBlessings = ['bond'];
			assert(b.blessingCandidates(run, content).find(e => e.id === 'bond').appearanceWeight < bond.appearanceWeight);
			for (const floor of [50, 100, 150]) { run.floor = floor; assert(!b.blessingCandidates(run, content).some(e => e.id === 'bond')); }
		}
		assert.equal(previous, 100);
		assert(!data.blessing('bond').text.includes('概率降低'));
	});
	it('removes the old late ordinary-team bonus but retains its stated graded damage and loot', () => {
		const {run, account} = setup(150); pick(run, account, 'ordinary');
		assert.equal(b.blessingView(run).owned[0].name, '愤怒的普通宝可梦');
		assert.equal(b.blessingExperience(run, run.team[0]), 1.4);
		assert.deepEqual(b.blessingLoot(run, {pearl: 10}, zero), {pearl: 14});
		const before = JSON.stringify({bag: run.bag, money: run.money, shards: run.blessings.shards, pending: run.blessings.pending});
		run.floor = 151; run.node = {kind: 'wild', encounters: []}; b.completeBlessingFloor(account, run, content, zero);
		assert.equal(JSON.stringify({bag: run.bag, money: run.money, shards: run.blessings.shards, pending: run.blessings.pending}), before);
	});
	it('writes concrete variant text into newly saved clear cards', () => {
		const {run, account} = setup(100); pick(run, account, 'money');
		run.floor = 200; run.phase = 'complete'; run.owner = {id: 'copy', name: 'Copy'};
		recordClear(account, run);
		assert.equal(account.cards[0].snapshot.blessings[0].name, '来财，来++');
		assert.equal(account.cards[0].snapshot.blessings[0].text, '立即获得 12000 金币。');
	});
});

describe('Fantasy Rogue revised ascent and Life Orb compatibility', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function begin(ids, ability, move, item = '') {
		battle?.destroy();
		const mon = createRoguePokemon({...set('Mew', ability, 80, [move, 'Slash', 'Splash']), item}, stats(0));
		battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: {encounterId: 'copy-native', team: [mon], boosts: stats(0), bag: {}, balls: [], catchable: false,
				blessings: {owned: ids.map(id => ({...data.blessing(id), floor: 50}))}},
			p1: {team: [mon.set]}, p2: {team: [set('Blissey', 'Natural Cure', 100, ['Splash'])]}});
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		battle.randomizer = damage => damage;
		return battle.p1.active[0];
	}
	it('gives the freely selected landing move 20% more power after an actual slicing hit', () => {
		const mon = begin(['ascent'], 'Synchronize', 'Tackle');
		battle.makeChoices('move 2', 'move 1'); assert(mon.isSemiInvulnerable());
		let landingPower;
		const original = battle.runEvent.bind(battle);
		battle.runEvent = function (name, target, source, effect, relay, ...args) {
			const value = original(name, target, source, effect, relay, ...args);
			if (name === 'BasePower' && effect?.id === 'tackle') landingPower = value;
			return value;
		};
		battle.makeChoices('move 1', 'move 1');
		assert.equal(landingPower, 48); assert.equal(mon.lastMove.id, 'tackle'); assert(!mon.isSemiInvulnerable());
	});
	for (const [ability, move, recoil] of [
		['Sheer Force', 'Flamethrower', false], ['Sheer Force', 'Tackle', true],
		['Magic Guard', 'Flamethrower', false], ['Synchronize', 'Flamethrower', true],
		['Synchronize', 'Splash', false],
	]) it(`matches Life Orb damage and HP cost with ${ability} using ${move}`, () => {
		const results = [];
		for (const blessing of [true, false]) {
			const mon = begin(blessing ? ['lifepower'] : [], ability, move, blessing ? '' : 'Life Orb');
			const foe = battle.p2.active[0], hp = mon.hp, targetHP = foe.hp;
			battle.makeChoices('move 1', 'move 1');
			results.push({damage: targetHP - foe.hp, recoil: hp - mon.hp});
			assert.equal(hp - mon.hp, recoil ? Math.floor(mon.maxhp / 10) : 0);
		}
		assert.deepEqual(results[0], results[1]);
	});
});
