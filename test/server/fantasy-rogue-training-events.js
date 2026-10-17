'use strict';
const {eventCost} = require('../../dist/server/fantasy-rogue/early-balance');
const { commandAfterOpening } = require('../fixtures/fantasy-rogue');
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Dex } = require('../../dist/sim/dex');
const { Battle } = require('../../dist/sim/battle');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { EVENT_NAMES, eventView, chooseEvent } = require('../../dist/server/fantasy-rogue/events');
const { createRoguePokemon, initializeExperience, rememberMove, levelMoves } = require('../../dist/server/fantasy-rogue/progression');
const { teachingMoves, FREE_TUTOR_MOVES, effortTotal, legalFormMoves } = require('../../dist/server/fantasy-rogue/event-learning');
const { demonstrationCost } = require('../../dist/server/fantasy-rogue/event-services');
const { regionalPool, conversionChoices } = require('../../dist/server/fantasy-rogue/event-travel');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue travel memories and training events', function () {
	this.timeout(20000);
	let store, engine, content, random;
	const account = () => store.get('trainingtester');
	const cmd = (action, details = {}) => commandAfterOpening(engine, 'trainingtester', {
		id: randomUUID(), revision: account().revision, action, ...details,
	});
	const choose = (value, details = {}) => cmd('event', { member: account().run.node.event.key, value, ...details });
	const view = () => eventView(account().run);
	const chooseMember = (member = account().run.team[0]) => choose(`member:${encodeURIComponent(member.id)}`);
	function enter(id, floor = 41) {
		store.change('trainingtester', a => {
			Object.assign(a.run, { floor, phase: 'choose', eventHistory: [],
				choices: [{ id: 'training', name: '事件', kind: 'event', encounters: [], reward: { money: 0, items: {} } }] });
			delete a.run.node;
		});
		let first = true;
		random = n => {
			if (first) { first = false; return Object.keys(EVENT_NAMES).indexOf(id); }
			return 0;
		};
		cmd('select', { value: 'training' }); random = () => 0;
		assert.equal(account().run.node.event.id, id);
	}
	function party(species, level = 21) {
		store.change('trainingtester', a => {
			a.run.team = species.map((name, i) => {
				const native = Dex.mod('gen9fantasy').species.get(name);
				const moves = levelMoves(name).filter(entry => entry.level <= level).slice(-4).map(entry => entry.move);
				const mon = createRoguePokemon(set(name, native.abilities[0], level, moves.length ? moves : ['Tackle']), stats(0), `training:member:${i}`);
				initializeExperience(mon); return mon;
			});
		});
	}
	function settle(won = true, mutate = () => {}, retreat = false) {
		cmd('battle'); if (retreat) cmd('retreat');
		const run = account().run;
		const result = { encounterId: run.battle.encounterId, won, team: structuredClone(run.team), bag: { ...run.bag } };
		mutate(result, run);
		engine.settle('trainingtester', run.battle.token, result);
		return { result, token: run.battle.token };
	}
	function path(region, road = 'path') {
		choose(`postcard:${region}`); choose('enter'); choose(road);
	}
	beforeEach(() => {
		store = new RogueStore(':memory:'); content = createPreviewContent(); random = () => 0;
		engine = new RogueEngine(store, content, n => random(n));
		cmd('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());

	it('introduces all three events only after their floor thresholds', () => {
		for (const [floor, expected] of [[1, 4], [11, 5], [20, 6], [25, 7]]) {
			const run = { ...account().run, floor, eventHistory: [] };
			const found = new Set();
			for (let i = 0; i < expected; i++) {
				const id = chooseEvent(run, () => 0); found.add(id); run.eventHistory.push({ id, floor });
			}
			assert.equal(found.size, expected);
		}
	});
	it('lets Hisuian Growlithe choose any legal unknown move, including non-tutor moves', () => {
		party(['Growlithe-Hisui'], 17); enter('tutor');
		store.change('trainingtester', a => { a.run.money = 100000; });
		choose('ask'); const mon = account().run.team[0];
		assert(!view().options.find(o => o.id === `member:${encodeURIComponent(mon.id)}`).disabled);
		chooseMember(mon);
		const tutors = teachingMoves(mon, true);
		const option = view().picker.options.find(o => !o.disabled && !tutors.includes(o.id.slice(5)));
		assert(option, 'a legitimate machine/level/egg move should be available');
		choose(option.id); assert(account().run.team[0].moveMemory.some(m => m.id === option.id.slice(5)));
	});
	it('never offers a leave branch in travel memories', () => {
		enter('travel'); assert(!view().options.some(o => o.id === 'leave'));
		choose('postcard:alola'); assert(!view().options.some(o => o.id === 'leave'));
	});
	it('has stage-eligible regional opponents in every postcard, with no hats or battle forms', () => {
		for (const region of ['alola', 'galar', 'hisui', 'paldea']) for (const lv of [6, 25, 50, 100]) {
			const pool = regionalPool(region, lv, content);
			assert(pool.length, `${region} ${lv}`);
			assert(!pool.some(name => /Pikachu|Totem|Zen|Fantasy|Mega/.test(name)));
		}
	});
	it('offers a stable regional gift only when no current partner can convert to the chosen region', () => {
		party(['Ponyta-Galar']); enter('travel'); path('alola');
		assert.equal(account().run.node.event.service.step, 'adopt');
		const offered = account().run.node.event.service.partner;
		assert.match(offered.set.species, /Alola/);
		engine.migrate('trainingtester'); assert.deepEqual(account().run.node.event.service.partner, offered);
		choose('adopt'); assert.equal(account().run.phase, 'blessing');
		const reward = account().run.blessings.pending[0];
		assert.equal(reward.pokemon.id, offered.id);
		cmd('blessingreward', { member: reward.id, value: 'join' });
		assert.equal(account().run.phase, 'event');
		assert(account().run.team.some(mon => mon.id === offered.id));
		assert.throws(() => choose('adopt'), /已更新/);
	});
	it('does not replace or delete partners when a regional gift meets a full team', () => {
		party(Array(6).fill('Bulbasaur')); enter('travel'); path('galar');
		choose('adopt');
		const ids = account().run.team.map(mon => mon.id), reward = account().run.blessings.pending[0];
		assert.equal(account().run.blessings.pending.length, 1);
		assert.deepEqual(account().run.team.map(mon => mon.id), ids);
		cmd('blessingreward', { member: reward.id, value: 'release' });
		assert.equal(account().run.phase, 'event'); assert.deepEqual(account().run.team.map(mon => mon.id), ids);
	});
	it('previews and converts the same regional partner, preserving training and filtering the move pool', () => {
		party(['Vulpix']);
		store.change('trainingtester', a => {
			const mon = a.run.team[0]; mon.stars = 3; mon.set.evs = { ...stats(0), spa: 40 };
			mon.set.happiness = 199; mon.joinOrder = 7; mon.hp = 3;
			mon.pp[0].pp = 2; rememberMove(mon, 'flamethrower'); rememberMove(mon, 'protect');
		});
		enter('travel'); path('alola');
		assert.equal(account().run.node.event.service.step, 'professor');
		const old = structuredClone(account().run.team[0]);
		choose(view().options.find(o => o.id.startsWith('swap:')).id);
		assert.equal(view().preview.after, 'Vulpix-Alola');
		assert.equal(account().run.team[0].set.species, 'Vulpix');
		assert(view().preview.removed.includes('flamethrower'));
		choose('confirm');
		const mon = account().run.team[0];
		assert.equal(mon.id, old.id); assert.equal(mon.set.species, 'Vulpix-Alola');
		for (const key of ['level', 'evs', 'ivs', 'happiness', 'nature', 'gender']) assert.deepEqual(mon.set[key], old.set[key], key);
		for (const key of ['stars', 'experience', 'joinOrder']) assert.equal(mon[key], old[key], key);
		assert(mon.moveMemory.some(m => m.id === 'protect'));
		assert(!mon.moveMemory.some(m => m.id === 'flamethrower'));
		const allowedNew = levelMoves('Vulpix-Alola').filter(m => m.level <= old.set.level).map(m => m.move);
		for (const move of mon.moveMemory) {
			assert(legalFormMoves('Vulpix-Alola').includes(move.id));
			if (!old.moveMemory.some(previous => previous.id === move.id)) assert(allowedNew.includes(move.id), move.id);
		}
		assert(mon.hp > 0 && mon.hp < mon.maxhp);
		assert.equal(account().run.node.event.exchange.before, 'Vulpix');
		assert.throws(() => choose('confirm'), /已更新/);
	});
	it('rejects fabricated conversion targets and intermediate exits without changing the original team', () => {
		party(['Vulpix']); enter('travel'); path('alola');
		const before = structuredClone(account().run.team);
		assert.throws(() => choose('swap:training%3Amember%3A0:arceus'), /已更新/);
		assert.throws(() => choose('leave'), /选项/); assert.deepEqual(account().run.team, before);
	});
	it('offers each Paldean Tauros style and cannot convert to the already-current form', () => {
		party(['Tauros']);
		assert.equal(conversionChoices(account().run, 'paldea').length, 3);
		party(['Vulpix-Alola']); assert.equal(conversionChoices(account().run, 'alola').length, 0);
	});
	it('restores travel battle resources on victory and defeat while retaining actual experience', () => {
		for (const [won, retreat] of [[true, false], [false, false]]) {
			party(['Bulbasaur']); enter('travel'); path('alola', 'road');
			store.change('trainingtester', a => {
				const mon = a.run.team[0]; mon.hp = 7; mon.set.item = 'oranberry';
				mon.status = 'psn'; mon.pp[0].pp = 2;
				a.run.eventBuff = { battles: 2 };
				a.run.growth = {offense: 0, defense: 0, experience: 2000};
			});
			engine.migrate('trainingtester');
			const old = structuredClone(account().run);
			const { result, token } = settle(won, (result, run) => {
				result.team[0].hp = 0; result.team[0].set.item = ''; result.team[0].pp[0].pp = 0;
				result.team[0].status = ''; result.bag = {};
				result.defeated = [{ species: 'Rattata-Alola', level: 24, eligible: [run.team[0].id], participants: [run.team[0].id] }];
			}, retreat);
			const now = account().run;
			assert.equal(now.phase, 'event'); assert.equal(now.node.event.stage, 'result');
			assert.equal(now.team[0].hp, old.team[0].hp); assert.equal(now.team[0].status, 'psn');
			assert.equal(now.team[0].set.item, 'oranberry'); assert.equal(now.team[0].pp[0].pp, 2);
			assert.deepEqual(now.bag, old.bag); assert.equal(now.money, old.money);
			assert.deepEqual(now.team[0].training, old.team[0].training); assert.deepEqual(now.team[0].set.evs, old.team[0].set.evs);
			assert.equal(now.team[0].set.happiness, old.team[0].set.happiness);
			assert(now.team[0].experience > old.team[0].experience);
			const {towerExperience} = require('../../dist/server/fantasy-rogue/early-balance');
			const {rogueSpeciesData} = require('../../dist/sim/fantasy-rogue-rules');
			assert.equal(now.team[0].experience - old.team[0].experience, Math.floor(towerExperience(
				rogueSpeciesData('Rattata-Alola').baseExperience, 24, old.team[0].set.level, true, old.floor) * 1.2));
			engine.settle('trainingtester', token, result);
			assert.equal(account().run.team[0].experience, now.team[0].experience);
			assert(!now.node.event.memory);
		}
	});
	it('keeps captures and returns the spent ball after the travel encounter', () => {
		party(['Bulbasaur']); enter('travel'); path('hisui', 'road');
		const count = account().run.bag.pokeball;
		settle(true, (result, run) => {
			const mon = createRoguePokemon(run.node.encounters[0].team[0], stats(0), `${run.battle.encounterId}:foe:0`);
			result.captures = [mon]; result.bag.pokeball--;
		});
		assert.equal(account().run.team.length, 2); assert.equal(account().run.bag.pokeball, count);
		assert.equal(account().run.team[1].set.species.includes('Hisui'), true);
		assert.match(account().run.node.event.result.join(''), /新伙伴/);
	});
	it('resumes a travel battle safely after migrating mushroom vitality into permanent training', () => {
		enter('travel'); path('alola', 'road');
		store.change('trainingtester', a => { a.run.eventBuff = { battles: 2 }; });
		engine.migrate('trainingtester');
		const training = account().run.team[0].training;
		cmd('battle'); engine.recover('trainingtester', account().run.battle.token);
		assert.deepEqual(account().run.team[0].training, training);
		settle(false); assert.deepEqual(account().run.team[0].training, training);
	});
	it('respecs exactly existing EVs once, without charging, restoring HP, or reviving', () => {
		party(['Bulbasaur']); enter('martial');
		assert(view().options.find(o => o.id === 'skill').disabled);
		store.change('trainingtester', a => { a.run.team[0].set.evs.atk = 24; a.run.team[0].hp = 0; });
		const money = account().run.money;
		choose('skill'); chooseMember();
		assert.equal(view().evAllocation.total, 24);
		for (const evs of [{ ...stats(0), spa: 25 }, { ...stats(0), spa: -24 }, { ...stats(0), spa: 23.5 }]) {
			assert.throws(() => choose('allocate', { evs }), /努力值/);
		}
		choose('allocate', { evs: { ...stats(0), spa: 24 } });
		assert.equal(account().run.team[0].set.evs.spa, 24); assert.equal(account().run.team[0].hp, 0);
		assert.equal(account().run.money, money); assert.match(account().run.node.event.result.join(''), /嗯嗯，这是武术的胜利/);
		assert.throws(() => choose('allocate', { evs: { ...stats(0), atk: 24 } }), /已更新/);
	});
	it('awards each present teammate EVs on victory, caps at 510/252, and preserves existing EV allocation', () => {
		party(['Bulbasaur', 'Squirtle']); enter('martial');
		store.change('trainingtester', a => { a.run.team[0].set.evs = { ...stats(0), atk: 252, def: 252, spe: 4 }; });
		choose('power'); settle(); assert.equal(account().run.phase, 'event');
		assert.equal(account().run.node.event.service.grants.length, 2);
		chooseMember(); assert.equal(view().evAllocation.total, 510);
		assert.throws(() => choose('allocate', { evs: { ...stats(0), hp: 252, def: 252, spe: 6 } }), /努力值/);
		assert.throws(() => choose('allocate', { evs: { ...stats(0), atk: 254, def: 252, spe: 4 } }), /努力值/);
		choose('allocate', { evs: { ...stats(0), atk: 252, def: 252, spe: 6 } });
		assert.throws(() => chooseMember(), /已更新/);
		chooseMember(account().run.team[1]); choose('allocate', { evs: { ...stats(0), spa: 12 } });
		assert.equal(effortTotal(account().run.team[1]), 12);
		assert.match(account().run.node.event.result.join(''), /嗯嗯，这是武术的胜利/);
	});
	it('ends an elder loss with the required line and preserves battle costs without EV rewards', () => {
		for (const retreat of [false]) {
			party(['Bulbasaur']); enter('martial'); choose('power');
			store.change('trainingtester', a => { a.run.bag.revive = 1; });
			settle(false, result => {
				result.team[0].hp = 0; result.team[0].pp[0].pp = 0; result.bag.potion--;
			}, retreat);
			const run = account().run;
			assert.equal(run.team[0].hp, 0); assert.equal(run.team[0].pp[0].pp, 0);
			assert.equal(effortTotal(run.team[0]), 0); assert(!run.node.event.service.grants);
			assert.match(run.node.event.result.join(''), /嗯嗯，这是武术的胜利/);
			assert.throws(() => cmd('continue'), /先复活/);
			cmd('use', { value: 'revive', member: run.team[0].id });
			cmd('continue'); assert.equal(account().run.floor, 42);
		}
	});
	it('samples any legal unlearned move, including non-tutor moves, and charges the quoted total once', () => {
		party(['Bulbasaur', 'Squirtle']); enter('tutor');
		store.change('trainingtester', a => { a.run.money = 20000; });
		const before = account().run, cost = demonstrationCost(before);
		const pool = teachingMoves(before.team[0]);
		const nonTutor = pool.find(move => !teachingMoves(before.team[0], true).includes(move));
		assert(nonTutor, 'needs a legal level/egg/TM move not available from a tutor');
		random = n => n === pool.length ? pool.indexOf(nonTutor) : 0;
		assert.match(view().options.find(o => o.id === 'demo').text, /金币/);
		choose('demo');
		const now = account().run;
		assert.equal(now.money, before.money - cost);
		assert(now.team[0].moveMemory.some(move => move.id === nonTutor));
		for (let i = 0; i < 2; i++) {
			assert.equal(now.team[i].moveMemory.length, before.team[i].moveMemory.length + 1);
			assert.deepEqual(now.team[i].pp, before.team[i].pp); assert.deepEqual(now.team[i].set.moves, before.team[i].set.moves);
		}
		assert.throws(() => choose('demo'), /已更新/);
		assert.equal(account().run.money, now.money);
	});
	it('checks affordability before teaching and charges only partners that have an available new move', () => {
		party(['Bulbasaur', 'Magikarp']); enter('tutor');
		store.change('trainingtester', a => {
			for (const move of teachingMoves(a.run.team[1])) rememberMove(a.run.team[1], move);
			a.run.money = 0;
		});
		const before = account().run.team;
		assert(view().options.find(o => o.id === 'demo').disabled);
		assert.throws(() => choose('demo'), /已更新/);
		assert.deepEqual(account().run.team, before);
		assert.equal(demonstrationCost(account().run), eventCost(41, 0.25));
		store.change('trainingtester', a => { a.run.money = demonstrationCost(a.run); });
		choose('demo'); assert.equal(account().run.money, 0);
		assert.deepEqual(account().run.team[1], before[1]);
	});
	it('teaches the ten specified moves free only to legal eligible partners and charges other tutor moves', () => {
		assert.equal(FREE_TUTOR_MOVES.size, 10);
		party(['Bulbasaur']); enter('tutor');
		choose('ask'); chooseMember();
		const options = view().picker.options;
		assert(options.some(option => option.id === 'move:grasspledge' && !option.disabled && option.text.startsWith('免费')));
		assert(!options.some(option => option.id === 'move:dragonascent'));
		const money = account().run.money;
		choose('move:grasspledge'); assert.equal(account().run.money, money);
		assert.match(account().run.node.event.result.join(''), /不收你/);
		enter('tutor'); choose('ask'); chooseMember();
		assert(!view().picker.options.some(option => option.id === 'move:grasspledge'));
		const paid = view().picker.options.find(option => !option.disabled && !option.text.startsWith('免费'));
		assert(paid); choose(paid.id);
		assert.equal(account().run.money, money - eventCost(41, 0.75));
	});
	it('shows the fantasy challenge only for actually known custom moves and grants one legal choice per partner', () => {
		party(['Bulbasaur', 'Squirtle']); enter('tutor');
		assert(view().options.find(option => option.id === 'fantasy').disabled);
		assert.throws(() => choose('fantasy'), /已更新/);
		const fantasy = Dex.mod('gen9fantasy').moves.all().find(move => move.exists && !move.isZ && !move.isMax &&
			!move.id.startsWith('rogue') && !Dex.mod('gen9').moves.get(move.id).exists);
		assert(fantasy);
		store.change('trainingtester', a => rememberMove(a.run.team[0], fantasy.id));
		choose('fantasy'); assert.equal(account().run.phase, 'ready'); settle(true);
		assert.match(view().paragraphs.join(''), /以身相许/);
		assert.equal(account().run.node.event.service.grants.length, 2);
		for (let i = 0; i < 2; i++) {
			const mon = account().run.team[i], pool = teachingMoves(mon);
			chooseMember(mon); assert.equal(view().picker.options.length, pool.length);
			assert.throws(() => choose('move:roaroftime'), /已更新/);
			choose(view().picker.options[0].id);
			if (i === 0) assert.throws(() => chooseMember(mon), /已更新/);
		}
		assert.equal(account().run.node.event.stage, 'result');
		assert.match(account().run.node.event.result.join(''), /继续赶路/);
	});
	it('launches both themed NPC teams in the real battle engine with normal turn requests', () => {
		for (const id of ['martial', 'tutor']) {
			party(['Bulbasaur'], 50); enter(id);
			if (id === 'martial') choose('power');
			else {
				store.change('trainingtester', a => {
					const move = Dex.mod('gen9fantasy').moves.all().find(m => m.exists && !m.isZ && !m.isMax && !m.id.startsWith('rogue') && !Dex.mod('gen9').moves.get(m.id).exists);
					rememberMove(a.run.team[0], move.id);
				});
				choose('fantasy');
			}
			cmd('battle'); const run = account().run, state = engine.battleState('trainingtester');
			assert.equal(state.catchable, false);
			const encounter = run.node.encounters[0];
			assert.equal(encounter.trainer.avatar, id === 'martial' ? 'sage' : 'backpackerf');
			const battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: state,
				p1: { name: 'Player', team: run.team.map(mon => ({ ...mon.set, fantasyRogueId: mon.id })) },
				p2: { name: encounter.trainer.name, team: encounter.team } });
			try {
				battle.makeChoices('team 1', 'team 123'); battle.makeChoices('move 1', 'move 1');
				assert(battle.log.some(line => line.startsWith('|move|')));
				assert(battle.turn >= 2 || battle.requestState === 'switch');
			} finally { battle.destroy(); }
		}
	});
});
