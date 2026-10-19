'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RoguePreviewController } = require('../../dist/server/fantasy-rogue/preview-controller');
const { createRoguePokemon, rebuildMember } = require('../../dist/server/fantasy-rogue/progression');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { assignedExtraAbilities, strongestDragon } = require('../../dist/sim/rogue-blessing-permanent');
const { strongestTypedMember, companionAbilityOptions, syncCompanions, companionAppearance } = require('../../dist/sim/rogue-companions');
const c = require('../../dist/server/fantasy-rogue/companions');
const { COMPANION_DIALOGUE } = require('../../dist/server/fantasy-rogue/companion-dialogue');
const { content, set, stats, commandAfterOpening } = require('../fixtures/fantasy-rogue');
const own = id => ({ ...blessing(id), floor: 1 });

describe('Fantasy Rogue companion trainers and native preview transactions', function () {
	this.timeout(20000);
	let store, battle;
	afterEach(() => {
		store?.close(); store = null;
		battle?.destroy(); battle = null;
	});
	function party(sets) {
		const run = { id: 'companions', floor: 50, phase: 'ready', team: sets.map((s, i) => ({ ...createRoguePokemon(s, stats(0)), joinOrder: i + 1 })),
			boosts: stats(0), bag: {}, money: 10000, encounter: 0, attempt: 0 };
		syncBlessingParty(run); return run;
	}
	function begin(run) {
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'companion-native', team: structuredClone(run.team), boosts: stats(0), bag: {}, balls: [],
				catchable: false, blessings: structuredClone(run.blessings) },
			p1: { team: run.team.map(mon => mon.set) }, p2: { team: [set('Blissey', 'Natural Cure', 100, ['Splash'])] } });
		battle.makeChoices('team 1', 'team 1'); return battle.p1.active[0];
	}
	function campaign() {
		store = new RogueStore(':memory:');
		const data = content(); data.blessings = true;
		const engine = new RogueEngine(store, data, () => 0);
		const cmd = (action, extra = {}) => commandAfterOpening(engine, 'companiontest', {
			id: randomUUID(), revision: store.get('companiontest').revision, action, ...extra,
		});
		cmd('start', { starters: ['bulbasaur'] }); cmd('select', { value: 'grass' });
		store.change('companiontest', account => {
			account.run.blessings.owned.push(own('companionai')); c.grantCompanion(account.run, 'sada');
		});
		const run = () => store.get('companiontest').run;
		const preview = won => {
			cmd('battle'); const current = run();
			const result = { encounterId: current.battle.encounterId, won, team: structuredClone(current.team), bag: { ...current.bag } };
			result.team[0].hp = won ? 1 : 0; result.team[0].status = 'brn'; result.bag.pokeball--;
			return { token: current.battle.token, result };
		};
		return { engine, cmd, run, preview };
	}
	it('uses the dragon king six-stat total and join-order rule, and moves the grant only when the strongest changes', () => {
		const run = party([set('Machamp', 'No Guard', 50), set('Machop', 'No Guard', 20)]);
		c.grantCompanion(run, 'bea'); const companion = run.blessings.companions[0];
		assert.equal(companion.member, run.team[0].id);
		c.companionCommand(run, { member: 'bea', value: 'ability:guts' }, () => 0, []);
		syncCompanions(run.blessings, run.team); assert.equal(companion.ability, 'guts');
		assert(assignedExtraAbilities(run.team[0], run.team, run.blessings).includes('guts'));
		run.team[1].set.level = 100; rebuildMember(run.team[1], stats(0));
		syncCompanions(run.blessings, run.team); assert.equal(companion.member, run.team[1].id); assert(!companion.ability);
		assert(!assignedExtraAbilities(run.team[0], run.team, run.blessings).includes('guts'));
		const dragons = party([set('Dragonite', 'Inner Focus', 50), set('Dratini', 'Shed Skin', 80)]).team;
		assert.equal(strongestTypedMember(dragons, 'Dragon').id, strongestDragon(dragons).id);
	});
	it('waits for an eligible member and rejects native or separately granted duplicate abilities', () => {
		const run = party([set()]); c.grantCompanion(run, 'bea'); assert(!run.blessings.companions[0].member);
		run.team.push(createRoguePokemon(set('Machop', 'Guts', 30), stats(0))); syncCompanions(run.blessings, run.team);
		const companion = run.blessings.companions[0], mon = run.team[1];
		assert.deepEqual(companionAbilityOptions(companion, mon, run.team, run.blessings), ['hustle']);
		assert.throws(() => c.companionCommand(run, { member: 'bea', value: 'ability:guts' }, () => 0, []), /额外特性/);
		c.companionCommand(run, { member: 'bea', value: 'ability:hustle' }, () => 0, []);
		assert.equal(companion.ability, 'hustle');
	});
	it('changes only the specified appearance weights and leaves AI neutral', () => {
		for (const [family, species] of [['dragonking', 'Dratini'], ['companionbea', 'Machop'], ['companionlana', 'Squirtle']]) {
			assert.equal(companionAppearance(family, []), 0);
			const team = party([set(species), set(species)]).team;
			assert.equal(companionAppearance(family, team.slice(0, 1)), 1); assert.equal(companionAppearance(family, team), 2);
		}
		assert.equal(companionAppearance('companionacerola', party([set('Gastly'), set('Eevee')]).team), 2);
		assert.equal(companionAppearance('companionai', []), 1);
	});
	it('offers all 10 chats and 5 praises per trainer without repeating before exhausting the pool', () => {
		for (const id of Object.keys(COMPANION_DIALOGUE)) {
			assert.equal(new Set(COMPANION_DIALOGUE[id].chat).size, 10); assert.equal(new Set(COMPANION_DIALOGUE[id].praise).size, 5);
			const run = party([set()]); c.grantCompanion(run, id); const seen = new Set();
			for (let n = 0; n < 10; n++) { c.companionCommand(run, { member: id, value: 'chat' }, () => 0, []); seen.add(run.blessings.companions[0].message); }
			assert.equal(seen.size, 10);
		}
	});
	it('marks advised choices, praises them, resets the smile next event, and awards preference 15 only once', () => {
		const run = party([set('Machop')]); c.grantCompanion(run, 'bea'); run.phase = 'event';
		const options = [{ id: 'skill', name: '观摩技巧' }, { id: 'power', name: '比试力量' }];
		for (let i = 0; i < 15; i++) {
			run.node = { event: { id: 'martial', key: 'event' + i, stage: 'choice' } };
			c.companionCommand(run, { member: 'bea', value: 'advice' }, () => 0, options);
			assert.equal(c.companionView(run, options)[0].recommended, 'power');
			c.recordCompanionPreference(run, options, 'power', () => 0); c.recordCompanionPreference(run, options, 'power', () => 0);
		}
		assert.equal(run.blessings.companions[0].preferences, 15); assert(run.blessings.companions[0].rewarded);
		assert.equal(run.money, 10000); assert.equal(run.bag.blackbelt, 1); assert(c.companionView(run, options)[0].smile);
		run.node.event.key = 'next-dialogue'; assert(c.companionView(run, options)[0].smile);
		run.node.event = { id: 'martial', key: 'new', stage: 'choice' };
		assert(!c.companionView(run, options)[0].smile);
		c.recordCompanionPreference(run, options, 'power', () => 0); assert.equal(run.money, 10000); assert.equal(run.bag.blackbelt, 1);
	});
	it('applies Fighting XP and Water-opponent XP independently, including captured opponents', () => {
		const run = party([set('Machop'), set('Eevee')]); c.grantCompanion(run, 'bea'); c.grantCompanion(run, 'lana');
		assert.equal(c.companionExperience(run, run.team[0], { species: 'Squirtle', captured: true }), 1.56);
		assert.equal(c.companionExperience(run, run.team[1], { species: 'Squirtle' }), 1.2);
		assert.equal(c.companionExperience(run, run.team[1], { species: 'Charmander' }), 1);
	});
	it('rolls once per Ghost/Normal member immediately at floor entry, never farms reloads', () => {
		const run = party([set('Zorua-Hisui'), set('Eevee'), set('Machop')]); c.grantCompanion(run, 'acerola');
		c.companionPickup(run, 'fight1', () => 0); assert(!run.companionPickups);
		c.deliverCompanionPickup(run, () => 0); assert.equal(run.bag.potion, 2);
		c.deliverCompanionPickup(run, () => 0); assert.equal(run.bag.potion, 2);
		run.floor++; c.deliverCompanionPickup(run, () => 0); assert.equal(run.bag.potion, 4);
	});
	it('does not apply failed preview losses or force emergency recovery, then allows only a personal challenge', () => {
		const { engine, cmd, run, preview } = campaign(); const before = structuredClone(run()); const { token, result } = preview(false);
		engine.settle('companiontest', token, result); assert.equal(run().preview.stage, 'result');
		assert.deepEqual(run().team, before.team); assert.deepEqual(run().bag, before.bag); assert.equal(run().money, before.money);
		assert(!run().emergencyRecovery); assert.equal(run().attempt, before.attempt);
		assert.throws(() => cmd('battle'), /预演结果/); assert.throws(() => cmd('previewresult', { value: 'accept' }), /获胜/);
		cmd('previewresult', { value: 'personal' }); cmd('battle'); assert.equal(run().preview.stage, 'personal');
	});
	it('accepts a successful preview exactly once through ordinary settlement', () => {
		const { engine, cmd, run, preview } = campaign(); const { token, result } = preview(true);
		engine.settle('companiontest', token, result); assert.notEqual(run().team[0].hp, 1);
		cmd('previewresult', { value: 'accept' }); assert.equal(run().team[0].hp, 1); assert.equal(run().team[0].status, 'brn');
		assert.equal(run().bag.pokeball, result.bag.pokeball); assert.equal(run().encounter, 1);
		assert.throws(() => cmd('previewresult', { value: 'accept' }), /预演结果/);
		engine.settle('companiontest', token, result); assert.equal(run().encounter, 1);
		cmd('battle'); assert.equal(run().preview.stage, 'running');
	});
	it('discards a win or an interrupted preview without changing campaign resources', () => {
		const { engine, cmd, run, preview } = campaign();
		const before = structuredClone(run()); const { token, result } = preview(true);
		engine.settle('companiontest', token, result); cmd('previewresult', { value: 'personal' });
		assert.deepEqual(run().team, before.team); assert.deepEqual(run().bag, before.bag);
		cmd('battle'); assert.equal(run().preview.stage, 'personal');
		engine.recover('companiontest', run().battle.token); assert.deepEqual(run().team, before.team);
		store.change('companiontest', a => { a.run.attempt++; });
		cmd('battle'); assert.equal(run().preview.stage, 'running');
		engine.recover('companiontest', run().battle.token); assert.equal(run().preview.stage, 'personal');
		assert.deepEqual(run().team, before.team); assert.deepEqual(run().bag, before.bag);
	});
	it('native preview controller advances the player seat rather than selecting on behalf of the opponent', async () => {
		const run = party([set('Mew', 'Synchronize', 100, ['Psychic'])]); begin(run);
		const writes = [], tracker = { rqid: 7, isWait: false, choice: '', request: '' };
		const adapter = { turn: 1, ended: false, p1: { request: tracker }, stream: { write: async line => writes.push(line) } };
		const controller = new RoguePreviewController(adapter);
		try {
			controller.update(battle.log.join('\n'));
			const request = battle.p1.activeRequest; tracker.request = JSON.stringify(request);
			controller.request(request, 7); await new Promise(resolve => { setTimeout(resolve, 350); });
			assert.equal(writes.length, 1); assert(writes[0].startsWith('>p1 '));
			assert(battle.choose('p1', writes[0].slice(4))); battle.choose('p2', 'move 1'); assert(battle.turn > 1 || battle.ended);
		} finally { controller.finish(); }
	});
});
