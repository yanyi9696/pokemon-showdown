'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createRoguePokemon, rebuildMember } = require('../../dist/server/fantasy-rogue/progression');
const { Battle } = require('../../dist/sim/battle');
const { Dex } = require('../../dist/sim/dex');
const { content, set, stats } = require('../fixtures/fantasy-rogue');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { reserveMainline, offerMainline, beginMainline, mainlineView, advanceMainline, prepareElderMeeting,
	reserveTrueEnding, beginMainlineEnding, beginRememberedOpening, mainlineCodex } = require('../../dist/server/fantasy-rogue/mainline');
const { MAINLINE_SCRIPT } = require('../../dist/server/fantasy-rogue/mainline-data');
const { mainlineProgress, nextMainlineScene, chapterComplete, settleStoryPity, unlockStoryDifficulty } = require('../../dist/server/fantasy-rogue/mainline-progress');
const { clearDifficulty, syncRunDifficulty } = require('../../dist/server/fantasy-rogue/difficulty');
const { firstClearSpeciesKey, initializeFirstClears, awardFirstClears } = require('../../dist/server/fantasy-rogue/first-clears');
const { fantasyTutorMoves } = require('../../dist/server/fantasy-rogue/fantasy-tutor');
const { buildRogueDuelState } = require('../../dist/server/fantasy-rogue/duels');
const { recordClear } = require('../../dist/server/fantasy-rogue/legacy');

describe('Fantasy Rogue mainline, identity ledger and percentage growth', function () {
	this.timeout(30000);
	let store, engine;
	const user = 'mainlinetest';
	const account = () => store.get(user);
	const cmd = (action, extra = {}) => engine.command(user, { id: randomUUID(), revision: account().revision, action, ...extra });
	beforeEach(() => {
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content(), () => 0);
		cmd('start', { starters: ['bulbasaur'] }); engine.content.story = true;
	});
	afterEach(() => store.close());
	const read = (a, choice = () => '0') => {
		for (let i = 0; a.mainlineDialogue && i < 120; i++) {
			const v = mainlineView(a);
			advanceMainline(a, engine.content, () => 0, v.key, v.options ? choice(v, a) : undefined);
		}
		assert(!a.mainlineDialogue, 'dialogue must reach its ending');
	};
	const enterScene = (a, tier, id) => {
		Object.assign(a.run, { floor: 21, phase: 'choose', difficulty: tier, mainline: { scene: id, floor: 21 },
			choices: [{ id: 'event', kind: 'event', name: '事件', encounters: [], reward: { money: 0, items: {} } }] });
		offerMainline(a.run); a.run.node = a.run.choices[0]; beginMainline(a, a.run, a.run.node);
	};
	it('implements all 22 ordered scenes and branch replies without unlocking unseen future scripts', () => {
		const a = account();
		assert.equal(MAINLINE_SCRIPT.scenes.length, 22);
		assert(!JSON.stringify(mainlineCodex(a)).includes('协作'));
		for (const scene of MAINLINE_SCRIPT.scenes) {
			assert.equal(nextMainlineScene(a, scene.tier), scene.id);
			enterScene(a, scene.tier, scene.id);
			assert.throws(() => beginMainline(a, a.run, { ...a.run.node, mainlineScene: 's5-6' }));
			read(a, v => v.options.at(-1).id);
			assert(a.mainline.completed.includes(scene.id));
			assert.equal(a.run.lastReward.name, '黑袍老人给你的补给');
			assert(a.run.lastReward.money > 0);
			assert.equal(a.run.phase, 'reward');
		}
		for (let tier = 0; tier < 6; tier++) assert(chapterComplete(a, tier));
		assert(a.mainline.identityRevealed && a.mainline.endingPending);
		assert.equal(mainlineCodex(a).filter(s => s.unlocked).length, 22);
	});
	it('requires a choice and resumes persisted replies, rejecting stale and duplicated reward claims', () => {
		store.change(user, a => enterScene(a, 0, 's0-1'));
		const key = mainlineView(account()).key;
		cmd('storyskip', { value: key });
		assert(mainlineView(account()).options);
		assert.throws(() => cmd('storynext', { value: mainlineView(account()).key }), /回应/);
		assert.throws(() => cmd('mainlinechoice', { value: mainlineView(account()).key, member: '99' }), /选项/);
		const request = { id: randomUUID(), revision: account().revision, action: 'mainlinechoice', value: mainlineView(account()).key, member: '1' };
		engine.command(user, request); const response = account(); engine.command(user, request);
		assert.deepEqual(account(), response);
		engine = new RogueEngine(store, { ...content(), story: true }, () => 0);
		assert.equal(mainlineView(account()).key, mainlineView(response).key);
		cmd('storyskip', { value: mainlineView(account()).key });
		const settled = account(); assert.deepEqual(settled.mainline.completed, ['s0-1']);
		assert.throws(() => cmd('storynext', { value: key }), /进度/);
		assert.deepEqual(account(), settled);
		cmd('continue'); assert.equal(account().run.floor, 22);
		assert.equal(account().run.money, settled.run.money);
	});
	it('reserves once per run, preserves reconnects and guarantees the next eligible run after a missed 100 floors', () => {
		const a = account(), r = a.run; reserveMainline(a, r, n => n - 1);
		assert.equal(r.mainline.floor, undefined);
		r.floor = 99; settleStoryPity(a, r); assert(!a.mainline.pity['0']);
		r.floor = 100; settleStoryPity(a, r); assert(a.mainline.pity['0']);
		const next = { ...r, floor: 1 }; delete next.mainline; reserveMainline(a, next, n => n - 1);
		assert(next.mainline.floor >= 21 && next.mainline.floor <= 48);
		next.floor = next.mainline.floor; next.choices = [{ id: 'event', kind: 'event' }]; offerMainline(next);
		assert.equal(next.choices[0].kind, 'story');
		next.floor++; next.choices = [{ id: 'event', kind: 'event' }]; offerMainline(next);
		assert.equal(next.choices[0].kind, 'event');
		for (const difficulty of ['easy', 0]) {
			const excluded = { ...r, difficulty, difficultyTest: difficulty === 0 }; delete excluded.mainline;
			reserveMainline(a, excluded, () => 0); assert(!excluded.mainline);
		}
	});
	it('requires both chapter and clear in either order, retains old unlocks and notifies only once', () => {
		for (const storyFirst of [false, true]) {
			const a = account(), r = a.run; r.floor = 200; r.phase = 'complete';
			if (storyFirst) mainlineProgress(a).completed.push('s0-1');
			clearDifficulty(a, r);
			assert.equal(a.difficulties.highest, storyFirst ? 1 : 0);
			if (!storyFirst) { mainlineProgress(a).completed.push('s0-1'); unlockStoryDifficulty(a); }
			assert.equal(a.difficulties.highest, 1);
			const before = JSON.stringify(a);
			clearDifficulty(a, r); unlockStoryDifficulty(a); assert.equal(JSON.stringify(a), before);
			assert.deepEqual(a.unlockNotices.map(n => n.id), ['spirit:0', 'difficulty:1']);
		}
		const old = { difficulties: { highest: 5, cleared: [], spirits: [] } }; unlockStoryDifficulty(old); assert.equal(old.difficulties.highest, 5);
	});
	it('keeps revelation after a failed run and plays the true ending on a later first clear, then allows free play', () => {
		store.change(user, a => {
			mainlineProgress(a).completed = MAINLINE_SCRIPT.scenes.slice(0, -1).map(s => s.id);
			enterScene(a, 5, 's5-5'); read(a);
		});
		cmd('abandon'); assert(account().mainline.endingPending); assert(account().mainlineDialogue.kind === 'opening');
		store.change(user, a => read(a)); cmd('start', { starters: ['bulbasaur'] });
		store.change(user, a => {
			delete a.run.story; a.run.floor = 200; a.run.phase = 'complete';
			assert(reserveTrueEnding(a, a.run)); assert(!reserveTrueEnding(a, a.run)); beginMainlineEnding(a, a.run);
		});
		assert.equal(account().mainlineDialogue.id, 'ending-true');
		assert.throws(() => cmd('storyskip', { value: mainlineView(account()).key }), /阅读/);
		store.change(user, a => read(a)); assert(account().mainline.endingSeen); assert(!account().mainline.endingPending);
		const a = account();
		delete a.run; a.opening = { page: 0 };
		beginRememberedOpening(a); assert.equal(a.mainlineDialogue.id, 'opening-after');
		read(a); a.run = { ...account().run, id: 'another' }; delete a.run.mainlineEnding;
		assert(!reserveTrueEnding(a, a.run)); beginMainlineEnding(a, a.run); assert.equal(a.mainlineDialogue.id, 'ending-free');
	});
	it('keeps chapter replays read-only and all graph links valid', () => {
		const a = account(); mainlineProgress(a).completed = ['s0-1'];
		const before = JSON.stringify(a), entries = mainlineCodex(a);
		assert.equal(JSON.stringify(a), before);
		assert(entries[0].replay && !entries[1].replay); assert.equal(entries[1].name, '尚未拾起的记忆');
		for (const page of Object.values(entries[0].replay.pages)) for (const option of page.options) assert(entries[0].replay.pages[option.next]);
	});
	it('opens every mystery and the true ending only in server-authorized local preview without completing them', () => {
		const {rogueCodex} = require('../../dist/server/fantasy-rogue/codex');
		const a = account(), before = JSON.stringify(a);
		const local = rogueCodex(a, 'stories', true), production = rogueCodex(a, 'stories');
		assert(local.preview); assert.equal(local.entries.length, 23);
		assert(local.entries.every(e => e.unlocked && e.replay));
		assert(local.entries.some(e => e.id === 'ending-true'));
		assert(!production.preview); assert(production.entries.every(e => !e.unlocked && !e.replay));
		assert(!production.entries.some(e => e.id === 'ending-true'));
		for (const entry of local.entries) for (const page of Object.values(entry.replay.pages)) {
			for (const option of page.options) assert(entry.replay.pages[option.next]);
		}
		assert.equal(JSON.stringify(a), before);
	});
	it('lets the elder reassign earned EVs without filling them to 510 and never modifies other partners', () => {
		const a = account(); a.run.floor = 45; a.run.node = { kind: 'event', encounters: [], reward: { money: 5, items: {} } };
		a.run.team[0].set.evs = { ...stats(0), atk: 72, spe: 64 }; const before = structuredClone(a.run.team[0].set.evs);
		const rolls = [99, 0]; assert(prepareElderMeeting(a, a.run, n => (rolls.shift() || 0) % n));
		read(a, (v, data) => data.mainlineDialogue.pages[data.mainlineDialogue.index].options.find(o => o.effect === 'ev') ? '1' : '0');
		assert.deepEqual(a.run.team[0].evRespec, { total: 136 }); assert.deepEqual(a.run.team[0].set.evs, before);
		assert(a.run.elderServices.includes('ev')); assert.deepEqual(a.mainline.completed, []);
	});
	it('teaches only legal Fantasy moves to the chosen partner and retains PP already spent', () => {
		engine.content = { ...createPreviewContent(), story: true };
		const a = account(), mon = createRoguePokemon(set('Pidgeot-Fantasy', 'Keen Eye', 55, ['Tackle']), a.run.boosts);
		a.run.team = [mon]; const moves = fantasyTutorMoves(mon); assert(moves.length > 0);
		mon.pp[0].pp = 1; a.run.node = { kind: 'event', encounters: [], reward: { money: 0, items: {} } };
		const rolls = [99, 0]; assert(prepareElderMeeting(a, a.run, n => (rolls.shift() || 0) % n));
		read(a, (v, data) => {
			const i = data.mainlineDialogue.pages[data.mainlineDialogue.index].options.findIndex(o => o.effect === 'fantasy');
			return i >= 0 ? String(i) : '0';
		});
		assert.equal(mon.pp[0].pp, 1); assert.equal(fantasyTutorMoves(mon).length, 0);
		assert(moves.every(id => mon.moveMemory.some(slot => slot.id === id)));
	});
	it('uses species rather than evolution lines; regional identities split and Fantasy/battle forms fold', () => {
		assert.equal(firstClearSpeciesKey('Bulbasaur'), '1'); assert.equal(firstClearSpeciesKey('Ivysaur'), '2');
		assert.equal(firstClearSpeciesKey('Swampert-Fantasy'), firstClearSpeciesKey('Swampert'));
		assert.equal(firstClearSpeciesKey('Charizard-Mega-X'), firstClearSpeciesKey('Charizard'));
		assert.equal(firstClearSpeciesKey('Meowth-Galar'), '52:galar'); assert.equal(firstClearSpeciesKey('Meowth-Alola'), '52:alola');
		assert.notEqual(firstClearSpeciesKey('Meowth-Galar'), firstClearSpeciesKey('Meowth'));
		assert.equal(firstClearSpeciesKey('Terapagos'), '1024'); assert.equal(firstClearSpeciesKey('Pecharunt'), '1025');
		for (let i = 1; i <= 1025; i++) assert(Dex.species.all().some(s => s.num === i && firstClearSpeciesKey(s.name) === String(i)), `national species ${i}`);
	});
	it('awards each species once, excludes eggs/easy/local tests, and imports old cards without retroactive points', () => {
		const a = account(), r = a.run; Object.assign(r, { floor: 200, phase: 'complete' });
		r.team.push(structuredClone(r.team[0])); const points = a.points;
		assert.equal(awardFirstClears(a, r), 5); assert.equal(a.points, points + 5); assert.equal(awardFirstClears(a, r), 0);
		delete r.firstClearRewardsRecorded; assert.equal(awardFirstClears(a, r), 0);
		for (const mode of ['easy', 'test']) {
			const b = account(); Object.assign(b.run, { floor: 200, phase: 'complete', difficulty: mode === 'easy' ? 'easy' : 0, difficultyTest: mode === 'test' });
			assert.equal(awardFirstClears(b, b.run), 0);
		}
		const old = { points: 20, cards: [{ snapshot: { floor: 200, team: [{ set: set('Bulbasaur') }] } }] }; initializeFirstClears(old);
		assert.equal(old.points, 20); assert.deepEqual(old.firstClearSpecies, ['1']);
	});
	it('matches percentage panels with real battles, form rebuilds and legacy cards without compounding', () => {
		for (const percent of [false, true]) {
			const r = account().run; r.floor = 80; r.boosts = stats(10);
			if (!percent) delete r.boostRuleVersion;
			const baseline = createRoguePokemon(set('Bulbasaur', 'Overgrow', 60), stats(0)).stats;
			r.team = [createRoguePokemon(set('Bulbasaur', 'Overgrow', 60), r.boosts)];
			syncRunDifficulty(r);
			for (const stat of Object.keys(baseline)) assert.equal(r.team[0].stats[stat], percent ? Math.floor(baseline[stat] * 1.1 + 1e-9) : baseline[stat] + 10);
			const b = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: { encounterId: 'growth', team: r.team, boosts: r.boosts, bag: {}, balls: [], catchable: false },
				p1: { team: r.team.map(m => m.set) }, p2: { team: [set('Magikarp', 'Swift Swim', 60, ['Splash'])] } });
			try { assert.deepEqual({ hp: b.p1.pokemon[0].maxhp, ...b.p1.pokemon[0].storedStats }, r.team[0].stats); } finally { b.destroy(); }
			const before = structuredClone(r.team[0].stats);
			rebuildMember(r.team[0], r.boosts); syncRunDifficulty(r); assert.deepEqual(r.team[0].stats, before);
			const a = { points: 0 };
			r.floor = 200; r.phase = 'complete'; recordClear(a, r);
			const duel = buildRogueDuelState({ ...a.cards[0], owner: 'left' }, { ...a.cards[0], owner: 'right' });
			const d = new Battle({ formatid: 'gen9fantasyrogueduel', fantasyRogue: duel, p1: { team: duel.team.map(m => m.set) }, p2: { team: duel.duel.team.map(m => m.set) } });
			try { assert.deepEqual({ hp: d.p1.pokemon[0].maxhp, ...d.p1.pokemon[0].storedStats }, a.cards[0].snapshot.team[0].stats); } finally { d.destroy(); }
		}
	});
	it('persists a partially read scene to SQLite, reopens it and rolls back invalid actions', () => {
		const file = path.join(os.tmpdir(), `rogue-story-${randomUUID()}.db`);
		let disk;
		try {
			disk = new RogueStore(file);
			disk.change(user, a => { Object.assign(a, account()); enterScene(a, 0, 's0-1'); });
			const before = disk.get(user);
			disk.close(); disk = new RogueStore(file); assert.deepEqual(disk.get(user), before);
			assert.throws(() => disk.change(user, a => advanceMainline(a, engine.content, () => 0, 'stale', '0')));
			assert.deepEqual(disk.get(user), before); disk.change(user, a => read(a));
			disk.close(); disk = new RogueStore(file); assert.deepEqual(disk.get(user).mainline.completed, ['s0-1']);
		} finally {
			if (disk) disk.close();
			for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(file + suffix)) fs.unlinkSync(file + suffix);
		}
	});
});
