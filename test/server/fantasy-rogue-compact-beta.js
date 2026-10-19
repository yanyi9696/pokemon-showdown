'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { rogueAccess } = require('../../dist/server/fantasy-rogue/access');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { partyEvolutions, GHOLDENGO_EVOLUTION_COINS } = require('../../dist/server/fantasy-rogue/party-evolution');
const { syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { grantCompanion, companionCommand, companionView } = require('../../dist/server/fantasy-rogue/companions');
const { assignedExtraAbilities } = require('../../dist/sim/rogue-blessing-permanent');
const { prepareEconomy, diversifyBattleReward } = require('../../dist/server/fantasy-rogue/economy');
const { mentorCardAtFloor } = require('../../dist/server/fantasy-rogue/early-balance');
const { SKI_DURATION, chooseCollection } = require('../../dist/server/fantasy-rogue/collection-events');
const { storyView } = require('../../dist/server/fantasy-rogue/story');
const { set, stats, commandAfterOpening } = require('../fixtures/fantasy-rogue');
const { Battle } = require('../../dist/sim/battle');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { emergencyChoice } = require('../../dist/server/fantasy-ai/fallback');
describe('Rogue compact beta revision', function () {
	this.timeout(20000);
	let content, store, engine, original;
	const user = { id: 'compactqa', name: 'CompactQA', registered: true, named: true, connected: true };
	const saved = () => store.get(user.id);
	const cmd = (action, extra = {}) => engine.command(user.id, { id: randomUUID(), revision: saved().revision, action, ...extra });
	before(() => { content = createPreviewContent(); });
	beforeEach(() => {
		original = { rogue: Config.fantasyrogue, local: Config.fantasyailocal, bind: Config.bindaddress };
		Config.fantasyrogue = { enabled: true, betaAccounts: [user.name], publicAccess: false };
		Config.fantasyailocal = false;
		Config.bindaddress = '0.0.0.0';
		store = new RogueStore(':memory:');
		engine = new RogueEngine(store, content, () => 0);
		commandAfterOpening(engine, user.id, { id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur'] });
	});
	afterEach(() => {
		store.close();
		Config.fantasyrogue = original.rogue; Config.fantasyailocal = original.local; Config.bindaddress = original.bind;
	});
	it('requires an authenticated whitelist identity for every data and action entry point', () => {
		assert(rogueAccess(user));
		assert(!rogueAccess({ ...user, registered: false }));
		assert(!rogueAccess({ ...user, id: 'other' }));
		Config.fantasyailocal = true;
		assert(!rogueAccess({ ...user, registered: false }));
		const manager = new RogueManager(engine), stranger = { ...user, id: 'other' };
		assert.equal(manager.state(stranger).enabled, false);
		assert.deepEqual(manager.codex(stranger, 'events').entries, []);
		assert.deepEqual(manager.gallery(stranger).cards, []);
		assert.throws(() => manager.command({ user: stranger }, { action: 'start' }), /内测权限/);
		assert.throws(() => manager.duel(stranger, {}), /内测权限/);
		Config.bindaddress = '127.0.0.1';
		assert(rogueAccess({ ...user, registered: false }));
		Config.fantasyrogue.enabled = false;
		assert(!rogueAccess(user));
	});
	it('keeps active-run payloads lean and restores the starter catalogue after abandonment', () => {
		const manager = new RogueManager(engine);
		assert.equal(manager.state(user).starters.length, 0);
		cmd('abandon');
		assert(manager.state(user).starters.length > 0);
	});
	it('switches an exposed fourfold weakness using revealed attacks only, while the wild policy stays in', () => {
		const battle = new Battle({ formatid: 'gen9customgame', seed: [19, 10, 20, 26] });
		try {
			battle.setPlayer('p1', { name: 'Player', team: [set('Mew', 'Synchronize', 50, ['Ice Beam'])] });
			battle.setPlayer('p2', { name: 'Trainer', team: [set('Dragonite', 'Inner Focus', 50, ['Wrap']), set('Lapras', 'Water Absorb', 50, ['Water Gun'])] });
			battle.makeChoices('team 1', 'team 12');
			const view = new InformationView({ ownSide: 'p2', difficulty: 'normal' });
			view.receiveUpdate(battle.log.join('\n'));
			let observation = view.observe(battle.p2.activeRequest);
			assert(emergencyChoice(observation, 'gen9fantasy', [], true, true, true).startsWith('move '));
			view.receiveUpdate('|move|p1a: Mew|Ice Beam|p2a: Dragonite');
			observation = view.observe(battle.p2.activeRequest);
			assert.equal(emergencyChoice(observation, 'gen9fantasy', [], true, true, true), 'switch 2');
			assert(emergencyChoice(observation, 'gen9fantasy', ['switch 2'], true, true, false).startsWith('move '));
		} finally {
			battle.destroy();
		}
	});
	it('allows companion reselection, defers a missing partner and removes the replaced grant', () => {
		const run = saved().run;
		run.phase = 'ready';
		run.team = [];
		grantCompanion(run, 'bea');
		companionCommand(run, { member: 'bea', value: 'ability:guts' }, () => 0, []);
		assert.equal(companionView(run)[0].ability, 'guts');
		run.team.push(createRoguePokemon(set('Machop', 'No Guard', 30), stats(0)));
		syncBlessingParty(run);
		assert(assignedExtraAbilities(run.team[0], run.team, run.blessings).includes('guts'));
		companionCommand(run, { member: 'bea', value: 'ability:hustle' }, () => 0, []);
		const extra = assignedExtraAbilities(run.team[0], run.team, run.blessings);
		assert(extra.includes('hustle'));
		assert(!extra.includes('guts'));
		run.phase = 'battle';
		assert.throws(() => companionCommand(run, { member: 'bea', value: 'ability:guts' }, () => 0, []));
	});
	it('requires level 20 plus the published coin fee and charges it exactly once', () => {
		store.change(user.id, a => {
			a.run.phase = 'ready';
			a.run.team = [createRoguePokemon(set('Gimmighoul', 'Rattled', 19), stats(0))];
			a.run.money = GHOLDENGO_EVOLUTION_COINS;
		});
		const mon = saved().run.team[0];
		assert(!partyEvolutions(mon, saved().run).find(e => e.species === 'Gholdengo').requirements.every(r => r.met));
		assert.throws(() => cmd('evolve', { member: mon.id, value: 'gholdengo' }));
		store.change(user.id, a => { a.run.team[0].set.level = 20; a.run.money--; });
		assert.throws(() => cmd('evolve', { member: mon.id, value: 'gholdengo' }));
		store.change(user.id, a => { a.run.money++; });
		const request = { id: randomUUID(), revision: saved().revision, action: 'evolve', member: mon.id, value: 'gholdengo' };
		engine.command(user.id, request);
		engine.command(user.id, request);
		assert.equal(saved().run.money, 0);
		assert.equal(saved().run.team[0].set.species, 'Gholdengo');
	});
	for (const floor of [164, 174, 179, 184, 189])
		it(`offers the gym-strength card before boss floor ${floor + 1}`, () => {
			engine = new RogueEngine(store, { ...content, story: true }, () => 0);
			store.change(user.id, a => {
				a.run.floor = floor; a.run.phase = 'choose';
				delete a.run.node; delete a.run.choices;
			});
			cmd('select', { value: 'center' });
			cmd('storyskip', { value: storyView(saved(), true, false).key });
			assert.equal(saved().run.mentorOffer, floor + 1);
			cmd('mentorcard', { value: 'attack' });
			cmd('continue');
			assert.equal(saved().run.mentorCard.floor, floor + 1);
			assert.equal(mentorCardAtFloor('attack', floor + 1).damage, mentorCardAtFloor('attack', 20).damage);
		});
	it('exchanges reward budget for useful items rather than multiplying payouts or rerolling routes', () => {
		const reward = { money: 0, items: { tinymushroom: 3 } };
		diversifyBattleReward(reward, 1, () => 0);
		assert.deepEqual(reward, { money: 0, items: { tinymushroom: 2, oranberry: 1 } });
		const unaltered = { money: 3000, items: { expcandyxs: 20 } };
		diversifyBattleReward(unaltered, 1, () => 99);
		assert.equal(unaltered.money, 3000);
		const node = { kind: 'trainer', encounters: [{ team: [] }], reward: { money: 0, items: {} } };
		prepareEconomy(node, 80, () => 0);
		const first = structuredClone(node);
		prepareEconomy(node, 80, () => { throw Error('reroll'); });
		assert.deepEqual(node, first);
	});
	it('runs a denser 15-second ski and sends idempotent lightweight input replies', () => {
		assert.equal(SKI_DURATION, 15000);
		store.change(user.id, a => {
			a.run.phase = 'event';
			a.run.node = { id: 'ski', kind: 'event', name: '雪山速滑', encounters: [], reward: { money: 0, items: {} }, event: { id: 'skiing', key: 'ski-key', stage: 'choice' } };
			chooseCollection(a.run, content, () => 0, 'skistart', Date.now());
		});
		assert(saved().run.node.event.ski.obstacles.length >= 18);
		const manager = new RogueManager(engine);
		const request = { id: randomUUID(), revision: saved().revision, action: 'event', member: 'ski-key', value: 'skiright' };
		const first = manager.ski({ user }, request), second = manager.ski({ user }, request);
		assert.equal(first.revision, second.revision);
		assert.equal(second.event.ski.lane, 2);
		assert(!('team' in second));
		assert(!('items' in second));
		assert.throws(() => manager.ski({ user }, { ...request, value: 'buy' }));
	});
});
