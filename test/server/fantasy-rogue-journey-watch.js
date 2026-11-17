'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { JourneyWatch, journeyWatchView, publicJourneyBattle } = require('../../dist/server/fantasy-rogue/journey-watch');
const { TRAVELLERS } = require('../../dist/server/fantasy-rogue/traveller-profiles');
const { TRAVELLER_TRANSITIONS } = require('../../dist/server/fantasy-rogue/traveller-transitions');
const { rivalAnswerPages } = require('../../dist/server/fantasy-rogue/rival-dialogue');
const { RIVALS } = require('../../dist/server/fantasy-rogue/rival-data');
const { content } = require('../fixtures/fantasy-rogue');
describe('Public journey snapshots and dialogue transitions', () => {
	it('gives every traveller a distinct bridge and keeps rival page counts unchanged', () => {
		const lines = Object.keys(TRAVELLERS).map(id => {
			assert(TRAVELLER_TRANSITIONS[id]?.length >= 25, id);
			return TRAVELLER_TRANSITIONS[id];
		});
		assert.equal(new Set(lines).size, lines.length);
		for (const id of Object.keys(RIVALS)) {
			const pages = rivalAnswerPages(id, 1, 0, 'greet:honest', 4);
			assert.equal(pages.length, 2);
			assert.equal(pages[1].text, TRAVELLER_TRANSITIONS[id]);
		}
	});
	it('exposes only current public fields without migration, settlement or account writes', () => {
		const store = new RogueStore(':memory:'), data = content(), engine = new RogueEngine(store, data);
		const previous = Config.fantasyrogue;
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		try {
			engine.command('watchowner', { id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur'] });
			store.change('watchowner', a => { a.run.announced = true; a.run.choices = [{ id: 'hidden', kind: 'trainer', name: 'SECRET ROSTER', encounters: [], reward: { money: 99, items: {} } }]; });
			const before = store.get('watchowner'), view = journeyWatchView(before, data, 'FC原名');
			assert.equal(view.player, 'FC原名');
			assert(!('account' in view));
			assert(!('bag' in view));
			assert(!('points' in view));
			const serialized = JSON.stringify(view);
			assert(!serialized.includes('SECRET ROSTER'));
			assert.deepEqual(store.get('watchowner'), before);
			const user = { id: 'watcher', name: 'watcher', named: true, registered: true, connected: true };
			const manager = new RogueManager(engine), first = manager.watch(user, 'watchowner');
			assert(first.view);
			assert(manager.watch(user, 'watchowner,' + first.version).unchanged);
			assert.deepEqual(store.get('watchowner'), before);
			assert.throws(() => manager.watch(user, 'watchowner,{} |/fantasyrogue action'));
			Config.fantasyrogue.publicAccess = false;
			assert.throws(() => manager.watch(user, 'watchowner'), /权限|公开/);
		} finally {
			store.close();
			Config.fantasyrogue = previous;
		}
	});
	it('shares work between 1000 viewers, expires focus and returns updated/end snapshots', () => {
		const watch = new JourneyWatch();
		let builds = 0;
		const build = () => { builds++; return { floor: 51, phase: 'ready' }; };
		const first = watch.read('owner', '', build, 10000);
		for (let i = 0; i < 1000; i++)
			assert(watch.read('owner', first.version, build, 10100).unchanged);
		assert.equal(builds, 1);
		watch.setFocus('owner', 'event', 10200);
		assert.equal(watch.read('owner', '', build, 10300).focus, 'event');
		watch.setFocus('owner', 'bad|protocol', 10350);
		assert.equal(watch.read('owner', '', build, 10400).focus, 'event');
		assert.equal(watch.read('owner', '', build, 20300).focus, '');
		assert(watch.read('owner', '', () => ({ ended: true }), 22000).view.ended);
		assert.equal(watch.read('owner', '', () => null, 24000).view, null);
	});
	it('keeps public battle actions while stripping chat, HTML and private requests', () => {
		const log = '|turn|1\n|move|p1a: FCName|Surf|p2a: Mew\n|c|user|private chat\n|raw|<b>secret</b>\n|request|secret\n|-damage|p2a: Mew|50/100\n';
		assert.deepEqual(publicJourneyBattle(log), ['|turn|1', '|move|p1a: FCName|Surf|p2a: Mew', '|-damage|p2a: Mew|50/100']);
	});
});
