'use strict';
const { commandAfterOpening } = require('../fixtures/fantasy-rogue');
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { rogueCodex } = require('../../dist/server/fantasy-rogue/codex');
const { rogueDiscoveries } = require('../../dist/server/fantasy-rogue/discoveries');
const { EVENT_NAMES, eventView } = require('../../dist/server/fantasy-rogue/events');
const { ROGUE_BLESSINGS, STAGED_BLESSING_FAMILIES } = require('../../dist/sim/rogue-blessing-data');

describe('Fantasy Rogue permanent codex and read-only event replays', function () {
	this.timeout(20000);
	let store, engine;
	const account = () => store.get('codextest');
	const cmd = (action, details = {}) => commandAfterOpening(engine, 'codextest', { id: randomUUID(), revision: account().revision, action, ...details });
	beforeEach(() => {
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, createPreviewContent(), () => 0);
		cmd('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());
	it('exposes every entry for local preview without changing real discovery records', () => {
		const a = account(), before = JSON.stringify(a);
		for (const section of ['events', 'blessings']) {
			const preview = rogueCodex(a, section, true);
			assert(preview.preview);
			assert(preview.entries.every(entry => entry.unlocked && entry.text !== '？？？'));
			if (section === 'events') assert(preview.entries.filter(e => !['companion', 'trainer'].includes(e.category)).every(entry => entry.replay));
			assert(rogueCodex(a, section).entries.every(entry => !entry.unlocked));
		}
		assert.equal(JSON.stringify(a), before);
	});
	it('sends only names, tiers and question marks for never obtained entries', () => {
		const data = rogueCodex(account(), 'blessings');
		assert.equal(data.entries.length, ROGUE_BLESSINGS.length + STAGED_BLESSING_FAMILIES.length * 3);
		assert(data.entries.every(entry => !entry.unlocked && entry.text === '？？？' && entry.tier && entry.name));
		const events = rogueCodex(undefined, 'events').entries;
		assert.equal(events.filter(e => e.category === 'event').length, Object.keys(EVENT_NAMES).filter(id =>
			!['auction', 'mushroomcollector', 'exclusivechallenge', 'policeassist', 'policerevenge', 'terasolo', 'rivalstory'].includes(id)).length);
		for (const id of ['exclusivechallenge', 'policeassist', 'policerevenge']) assert.equal(events.find(e => e.id === id).category, 'encounter');
		assert.equal(events.filter(e => e.category === 'trade').length, 9);
		assert.equal(events.filter(e => e.category === 'reward').length, 6);
		assert(events.every(entry => !entry.unlocked && !entry.replay && entry.text === '？？？'));
		const people = events.filter(e => ['companion', 'trainer'].includes(e.category));
		assert.equal(people.length, 89);
		for (const role of ['companion', 'gym', 'elitefour', 'champion', 'antagonist', 'other']) {
			assert(people.some(e => e.roles.includes(role)), role);
		}
	});
	it('records an actual selection once, never unlocks an offer, and keeps it after abandoning', () => {
		store.change('codextest', a => {
			a.run.floor = 50; a.run.phase = 'blessing';
			a.run.blessings.round = { floor: 50, tier: 'silver', remaining: 1, familiesSeen: ['friend', 'medic'],
				options: [{ id: 'friendfire', refreshes: 1, chosen: false }, { id: 'medic', refreshes: 1, chosen: false }] };
		});
		assert.equal(rogueDiscoveries(account()).blessings.length, 0);
		const command = { id: randomUUID(), revision: account().revision, action: 'blessing', slot: 0 };
		engine.command('codextest', command); engine.command('codextest', command);
		assert.deepEqual(account().discoveries.blessings, ['friend']);
		cmd('abandon');
		const rows = rogueCodex(account(), 'blessings').entries;
		assert.equal(rows.find(b => b.id === 'friend').text, ROGUE_BLESSINGS.find(b => b.id === 'friend').text);
		assert.equal(rows.find(b => b.id === 'medic').text, '？？？');
	});
	it('records entry into an event even if the player leaves before choosing an outcome', () => {
		store.change('codextest', a => {
			a.run.phase = 'choose';
			a.run.choices = [{ id: 'event', kind: 'event', name: '见闻', encounters: [], reward: { money: 0, items: {} } }];
		});
		cmd('select', { value: 'event' });
		const eventId = account().run.node.event.id;
		assert.deepEqual(account().discoveries.events, [eventId]);
		cmd('abandon'); cmd('start', { starters: ['bulbasaur'] });
		assert(rogueCodex(account(), 'events').entries.find(e => e.id === eventId).replay);
		assert(!rogueCodex(account(), 'events').entries.find(e => e.id === 'forest').replay);
	});
	it('backfills retained legacy evidence without inventing lost older history', () => {
		const legacy = { revision: 1, previousBlessings: ['friendwater', 'unknown'], cards: [{ snapshot: { blessings: [{ id: 'medic' }] } }],
			pendingClear: { snapshot: { blessings: [{ id: 'psychic' }] } }, run: { blessings: { owned: [{ id: 'money' }] }, eventHistory: [{ id: 'forest', floor: 21 }] } };
		assert.deepEqual(rogueDiscoveries(legacy), { blessings: ['friend', 'medic', 'money', 'psychic'], events: ['forest'], trainers: [] });
		assert.equal(rogueCodex(legacy, 'events').entries.filter(e => !['companion', 'trainer'].includes(e.category) && e.unlocked).length, 1);
	});
	it('unlocks only the chosen companion and the opponent actually reached, keeping both across adventures', () => {
		store.change('codextest', a => {
			a.run.phase = 'choose';
			a.run.blessings.owned.push({ id: 'companionband', family: 'companionband', floor: 1 });
			a.run.bossPreviews = { 20: { encounters: [{ trainer: { id: 'brock' } }] } };
			a.run.choices = [{ encounters: [{ trainer: { id: 'sabrina' } }] }];
		});
		assert.deepEqual(rogueDiscoveries(account()).trainers, []);
		cmd('companion', { member: 'marnie', value: 'chooseband' });
		assert.deepEqual(account().discoveries.trainers, ['marnie']);
		store.change('codextest', a => {
			a.run.phase = 'ready'; a.run.encounter = 0;
			a.run.node = { kind: 'boss', encounters: [{ trainer: { id: 'brock' } }, { trainer: { id: 'sabrina' } }] };
		});
		assert.deepEqual(account().discoveries.trainers, ['brock', 'marnie']);
		cmd('abandon'); cmd('start', { starters: ['bulbasaur'] });
		const people = rogueCodex(account(), 'events').entries.filter(e => e.portrait);
		assert.deepEqual(people.filter(e => e.unlocked).map(e => e.portrait).sort(), ['brock', 'marnie']);
		for (const id of ['roxie', 'sabrina']) assert.equal(people.find(e => e.portrait === id).text, '？？？');
	});
	it('records each displayed dialogue character without unlocking later speakers or future boss previews', () => {
		store.change('codextest', a => {
			a.run.phase = 'story'; a.run.story = { stage: 'restguide', page: 0 };
			a.run.bossPreviews = { 20: { encounters: [{ trainer: { id: 'brock' } }] } };
		});
		assert.deepEqual(rogueDiscoveries(account()).trainers, []);
		store.change('codextest', a => {
			a.run.story = { stage: 'interlude', page: 0 };
			a.run.dialogue = { key: 'meeting', resume: 'event', pages: [{ portrait: 'jenny' }, { portrait: 'clover' }] };
		});
		assert.deepEqual(account().discoveries.trainers, ['jenny']);
		store.change('codextest', a => { a.run.story.page = 1; });
		assert.deepEqual(account().discoveries.trainers, ['clover', 'jenny']);
		store.change('codextest', a => { delete a.run; });
		assert.deepEqual(account().discoveries.trainers, ['clover', 'jenny']);
	});
	it('backfills actual legacy trainer evidence without interpreting a blessing offer or floor as a meeting', () => {
		const legacy = { cards: [{ snapshot: { blessings: [], blessingEffects: { companions: [{ id: 'iris' }] } } }],
			run: { phase: 'choose', floor: 200, blessings: { owned: [{ id: 'companionstreamer' }] },
				seenBossDialogues: ['20:boss20:0:gym:brock'], bossPreviews: { 200: { kind: 'boss' } } } };
		assert.deepEqual(rogueDiscoveries(legacy).trainers, ['brock', 'iris']);
		const before = JSON.stringify(legacy);
		const full = rogueCodex(legacy, 'events', true);
		assert(full.entries.filter(e => e.portrait).every(e => e.unlocked));
		assert.equal(JSON.stringify(legacy), before);
		assert(!rogueCodex(legacy, 'events').entries.find(e => e.portrait === 'mewtwo').unlocked);
	});
	it('does not record changes from rejected transactions or mutate during codex reading', () => {
		const before = JSON.stringify(account());
		assert.throws(() => store.change('codextest', a => { a.run.eventHistory = [{ id: 'forest', floor: 1 }]; throw new Error('cancel'); }));
		for (const section of ['guide', 'events', 'blessings']) rogueCodex(account(), section);
		assert.equal(JSON.stringify(account()), before);
	});
	it('has traversable narrative-only branches and the same opening text as live events', () => {
		const a = account(); a.discoveries = { blessings: [], events: Object.keys(EVENT_NAMES) };
		const before = JSON.stringify(a);
		for (const entry of rogueCodex(a, 'events').entries.filter(e => e.category === 'event')) {
			const replay = entry.replay;
			const run = { ...a.run, node: { event: { id: entry.id, key: 'x', stage: 'choice' } } };
			const expedition = entry.id in require('../../dist/server/fantasy-rogue/expedition-text').EXPEDITION_OVERVIEWS;
			if (expedition || ['exclusiveclue', 'exclusivechallenge', 'auction', 'feathers', 'honeymoonreturn', 'companionrematch'].includes(entry.id)) {
				// These openings incorporate the saved item, owner and NPC budgets at runtime.
				assert.deepEqual(replay.pages.start.text, require('../../dist/server/fantasy-rogue/event-text').eventOpening(entry.id));
			} else {
				assert.deepEqual(replay.pages.start.text, eventView(run).paragraphs);
				assert.deepEqual(replay.pages.start.options.map(o => o.label), eventView(run).options.map(o => o.name));
			}
			let endings = 0;
			for (const page of Object.values(replay.pages)) {
				assert(page.text.every(p => typeof p === 'string' && p.length));
				for (const option of page.options) assert(replay.pages[option.next], option.next);
				if (!page.options.length) endings++;
				assert(!page.action && !page.reward && !page.log);
			}
			assert(endings >= (expedition ? 1 : 3));
		}
		assert.equal(JSON.stringify(a), before);
	});
	it('uses real Fantasy data, includes all eleven Fantasy items, and omits internal battle commands', () => {
		const { modules } = rogueCodex(undefined, 'guide').guide;
		const { FANTASY_BLESSING_ITEMS } = require('../../dist/sim/rogue-blessing-data');
		for (const id of FANTASY_BLESSING_ITEMS) assert(modules.items.some(item => item.id === id), id);
		assert(modules.moves.some(move => move.id === 'recover' && move.pp === 10));
		assert(modules.pokemon.length > 100 && modules.abilities.length > 10);
		assert(Object.values(modules).every(entries => entries.every(e => !e.id.startsWith('rogue'))));
		assert(modules.items.every(item => item.icon === item.id && item.spritenum > 0));
		assert.equal(modules.items.filter(item => item.category === 'general').length, 11);
		assert(modules.items.some(item => item.id === 'dadascloak' && item.category === 'exclusive'));
		assert(!modules.items.some(item => ['firegem', 'charizarditex', 'firiumz'].includes(item.id)));
		const { Dex } = require('../../dist/sim/dex');
		for (const id of ['piercingdrill', 'spicyspray', 'eelevate', 'firemane', 'auraguard']) {
			assert(Dex.abilities.get(id).exists);
			assert(!modules.abilities.some(item => item.id === id));
		}
		for (const kind of ['moves', 'abilities']) {
			assert(modules[kind].some(item => item.origin === 'fantasy'));
			assert(modules[kind].some(item => item.origin === 'enhanced'));
			for (const item of modules[kind]) assert.equal(item.origin === 'enhanced', Dex.mod('gen9')[kind].get(item.id).exists);
		}
		assert(rogueCodex(account(), 'blessings').entries.every(item => item.family));
	});
	it('does not advertise an unapproved battle exit in any authored event replay', () => {
		for (const entry of rogueCodex(undefined, 'events', true).entries.filter(e => e.replay)) {
			for (const page of Object.values(entry.replay.pages)) {
				assert(page.options.every(option => !/撤退|退出战斗/.test(option.label)));
			}
		}
	});
});
