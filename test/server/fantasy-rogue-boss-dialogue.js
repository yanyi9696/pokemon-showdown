'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { TrainerBossData } = require('../../dist/server/fantasy-rogue/trainer-boss-data');
const { trainerBossCandidates } = require('../../dist/server/fantasy-rogue/trainer-bosses');
const { TRAINER_DIALOGUE, GYM_GIFT_LINES } = require('../../dist/server/fantasy-rogue/trainer-dialogue');
const { storyView, bossIntroPages, bossDialogueKey } = require('../../dist/server/fantasy-rogue/story');
const { commandAfterOpening } = require('../fixtures/fantasy-rogue');
const { requestCompanion } = require('../../dist/server/fantasy-rogue/travellers');

describe('Fantasy Rogue boss openings', function () {
	this.timeout(15000);
	let store, engine, content;
	const user = 'bossdialogue';
	const account = () => store.get(user);
	const run = () => account().run;
	const cmd = (action, extra = {}) => engine.command(user, { id: randomUUID(), revision: account().revision, action, ...extra });
	const view = () => storyView(account(), true, false);
	const next = () => cmd('storynext', { value: view().key });
	const skip = () => cmd('storyskip', { value: view().key });
	function enter(floor) {
		store.change(user, a => {
			a.run.floor = floor; a.run.phase = 'choose'; a.run.encounter = 0;
			delete a.run.node; delete a.run.choices;
			delete a.run.story; delete a.run.battle;
		});
		cmd('select', { value: content.floors[floor][0].id });
	}
	beforeEach(() => {
		store = new RogueStore(':memory:'); content = createPreviewContent();
		engine = new RogueEngine(store, content, () => 0);
		commandAfterOpening(engine, user, { id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur'] });
		content.story = true; engine = new RogueEngine(store, content, () => 0);
	});
	afterEach(() => store.close());
	it('covers every current gym, Elite Four and Champion roster with its own short opening', () => {
		const roles = new Set();
		for (const entry of TrainerBossData) {
			const lines = TRAINER_DIALOGUE[entry.id]?.[entry.role];
			assert.equal(lines?.length, 2, `${entry.id}/${entry.role}`);
			assert(lines.every(line => line.length < 90));
			roles.add(`${entry.id}:${entry.role}`);
			if (entry.role === 'gym') assert(GYM_GIFT_LINES[entry.id]);
		}
		assert.equal(roles.size, 30); // Five added champion roles; Lance already has an Elite Four role.
		for (const id of ['leon', 'lance', 'diantha', 'cynthia', 'ash']) assert(roles.has(`${id}:champion`));
		for (const id of ['larry', 'acerola']) assert.notDeepEqual(TRAINER_DIALOGUE[id].gym, TRAINER_DIALOGUE[id].elitefour);
	});
	for (const floor of [20, 40, 60, 80, 120, 140, 160, 165, 175, 180, 185, 190]) {
		it(`offers preparation before starting the actual floor ${floor} encounter`, () => {
			enter(floor); const encounter = structuredClone(run().node.encounters[0]);
			assert.equal(run().phase, 'story'); assert.equal(view().stage, 'bossintro');
			assert.equal(view().speaker, encounter.trainer.name);
			assert.equal(view().avatar, encounter.trainer.avatar);
			assert.throws(() => cmd('battle', { value: view().key }), /读完/);
			next(); assert(view().battleReady);
			const key = view().key;
			engine = new RogueEngine(store, content, () => { throw Error('Must not reroll a saved opponent'); });
			engine.migrate(user); assert.equal(view().key, key);
			next(); assert.equal(run().phase, 'ready');
			assert(!run().battle); assert(!view());
			assert(run().seenBossDialogues.includes(bossDialogueKey(run())));
			cmd('battle'); assert.equal(run().phase, 'battle'); assert(run().battle.token);
			assert.deepEqual(run().node.encounters[0], encounter);
		});
	}
	it('starts directly from the last page, rejecting stale pages and preserving retry readiness', () => {
		enter(20); const first = view().key;
		next(); assert.throws(() => cmd('storynext', { value: first }), /进度/);
		assert.throws(() => cmd('battle', { value: first }), /读完/);
		cmd('battle', { value: view().key });
		assert.equal(run().phase, 'battle'); assert(!run().story);
		const current = run();
		engine.settle(user, current.battle.token, { encounterId: current.battle.encounterId, won: false, team: current.team, bag: current.bag });
		assert.equal(run().phase, 'ready'); cmd('battle'); assert.equal(run().phase, 'battle');
	});
	it('skips to preparation without starting a battle and distinguishes different encounters', () => {
		enter(20); const first = view().key;
		skip(); assert.equal(run().phase, 'ready'); assert(!run().battle);
		enter(40); assert.notEqual(view().key, first);
		assert.throws(() => cmd('storynext', { value: first }), /进度/);
		assert.equal(view().index, 0);
	});
	it('catches legacy ready saves before battle, without interrupting already active battles', () => {
		enter(20);
		store.change(user, a => { delete a.run.story; a.run.phase = 'ready'; });
		cmd('battle'); assert.equal(run().phase, 'story'); assert(!run().battle);
		skip(); cmd('battle'); const token = run().battle.token;
		engine.migrate(user); assert.equal(run().battle.token, token); assert(!view());
	});
	it('uses the 100-floor gift dialogue as its opening and never starts combat after claiming the gift', () => {
		enter(100); assert.equal(view().stage, 'gymgift');
		assert.throws(() => cmd('battle'), /不能进入/);
		assert(view().text.includes('一百层'));
		next(); assert(!view().battleReady);
		next(); assert.equal(run().phase, 'blessing');
		const gift = run().blessings.pending[0];
		cmd('blessingreward', { member: gift.id, value: 'gmega' });
		assert(run().gmegaUnlocked); assert.equal(run().bag.gmegawishingstar, 1);
		assert.equal(run().phase, 'ready'); assert(!run().battle); assert(!view());
		cmd('battle'); assert.equal(run().phase, 'battle');
	});
	for (const floor of [20, 100]) {
		it(`saves the companion reunion at gym floor ${floor}, resumes its page and does not replay after defeat`, () => {
			store.change(user, a => {
				requestCompanion(a.run, { id: 'lacey', origin: 'event' });
			});
			const candidates = trainerBossCandidates(floor, 50);
			engine = new RogueEngine(store, content, n => n === candidates.length ? candidates.findIndex(c => c.trainer.id === 'clay') : 0);
			enter(floor);
			assert.equal(run().node.encounters[0].trainer.id, 'clay');
			assert.equal(view().portrait, 'lacey'); assert.equal(view().side, 'left');
			assert.equal(view().total, 8); next();
			assert.equal(view().portrait, 'clay'); assert.equal(view().side, 'right');
			const key = view().key;
			engine = new RogueEngine(store, content, () => 0); engine.migrate(user);
			assert.equal(view().key, key);
			while (view()?.key) next();
			if (floor === 100) {
				const gift = run().blessings.pending[0];
				cmd('blessingreward', { member: gift.id, value: 'gmega' });
			}
			assert.equal(run().phase, 'ready'); assert(run().seenBossDialogues.includes(bossDialogueKey(run())));
			cmd('battle'); const current = run();
			engine.settle(user, current.battle.token, { encounterId: current.battle.encounterId, won: false, team: current.team, bag: current.bag });
			engine.migrate(user); assert(!view());
			cmd('battle'); assert.equal(run().phase, 'battle');
		});
	}
	it('offers a replacement gift when all four systems are already unlocked', () => {
		store.change(user, a => Object.assign(a.run, { megaUnlocked: true, gmegaUnlocked: true, teraUnlocked: true, zUnlocked: true }));
		enter(100);
		const lines = [];
		while (view()?.key) { lines.push(view().text); next(); }
		assert(lines.join('').includes('四种力量你都已经掌握'));
		assert(!lines.join('').includes('选一种新的力量'));
		assert.equal(run().phase, 'blessing'); assert(!run().battle);
		const reward = run().blessings.pending[0];
		assert.equal(reward.kind, 'systemfallback');
		cmd('blessingreward', {member: reward.id, value: 'shards'});
		assert.equal(run().phase, 'ready'); assert.equal(run().blessings.shards, 100);
	});
	it('gives Mewtwo an unanswered opening and leaves the separate god challenge untouched', () => {
		enter(200); const lines = [];
		while (!view().battleReady) { lines.push(view().text); next(); }
		lines.push(view().text);
		assert(lines.join('').includes('塔之尽头')); assert(lines.join('').includes('幻想的顶点'));
		assert(view().text.includes('自己为何而来')); assert.equal(view().pokemon, 'Mewtwo-Fantasy');
		assert.equal(view().total, 3); assert(!view().options);
		cmd('battle', { value: view().key }); assert.equal(run().phase, 'battle');
		const current = run();
		assert.equal(current.node.encounters[0].boss.kind, 'summit');
		assert.deepEqual(bossIntroPages({ ...current, postgame: { stage: 'battle' } }), []);
	});
	it('renders both identities of hidden Elite Four and ignores ordinary trainers and wild elites', () => {
		for (const id of ['larry', 'acerola']) {
			const trainer = trainerBossCandidates(165, 90).find(c => c.trainer.id === id).trainer;
			const candidate = { ...run(), floor: 165, node: { id: 'boss', kind: 'boss', encounters: [{ trainer }] } };
			assert.deepEqual(bossIntroPages(candidate).map(p => p.text), TRAINER_DIALOGUE[id].elitefour);
		}
		for (const role of ['rocket', 'merchant', 'traveller', 'nurse', undefined]) {
			const candidate = { ...run(), floor: 8, node: { kind: 'elite', encounters: [{ trainer: role && { id: 'test', role } }] } };
			assert.equal(bossIntroPages(candidate).length, 0);
		}
	});
});
