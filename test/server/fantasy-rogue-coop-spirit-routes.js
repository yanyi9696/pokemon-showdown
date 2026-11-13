'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { MajorLegendaryPool } = require('../../dist/server/fantasy-rogue/biome-pools');
const { prepareSpiritNode } = require('../../dist/server/fantasy-rogue/spirits');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue common spirit routes', function () {
	this.timeout(20000);
	let store, engine, manager, data, host, guest, previous;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		data = content(); store = new RogueStore(':memory:');
		engine = new RogueEngine(store, data, max => max === 100 ? 2 : 0); manager = new RogueManager(engine);
		data = engine.content;
		host = makeUser('Routes Spirit Host', '127.99.1.1'); guest = makeUser('Routes Spirit Guest', '127.99.1.2');
	});
	afterEach(() => {
		for (const user of [host, guest]) { user?.disconnectAll(); user?.destroy(); }
		store.close();
		Config.fantasyailocal = previous.local; Config.bindaddress = previous.bind; Config.fantasyrogue = previous.rogue;
	});
	const get = () => store.coopSessionForUser(host.id);
	const view = user => manager.coop.view(user).session.adventure;
	function write(session) { const revision = session.revision++; store.updateCoopSession(session, revision); }
	function start(spirit) {
		for (const user of [host, guest]) engine.command(user.id, { id: randomUUID(), revision: store.get(user.id).revision,
			action: 'start', starters: ['bulbasaur'] });
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		const session = get(); session.adventure.spirit = spirit; session.spirit = spirit;
		write(session);
	}
	function advance(floor) {
		const session = get(), adventure = session.adventure;
		adventure.floor = floor - 1; adventure.phase = 'route-interaction';
		adventure.node = { id: 'center', name: '休整中心', kind: 'rest', encounters: [], reward: { money: 0, items: {} } };
		write(session);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		return get().adventure;
	}
	it('passes the shared Xerneas spirit through real floor advancement, adding levels and the extra encounter once', () => {
		start('mew'); data.biomeEncounters = true; data.floors[41] = structuredClone(data.floors[1]);
		const normal = engine.prepareCoopRoutes(41, 0).choices[0];
		const a = advance(41), boosted = a.routeChoices[0];
		assert.equal(normal.encounters[0].team.length, 3); assert.equal(boosted.encounters[0].team.length, 4);
		assert.equal(boosted.biome.level, normal.biome.level + 2);
		const saved = structuredClone(a);
		manager = new RogueManager(engine); view(host); view(guest);
		assert.deepEqual(get().adventure, saved);
		prepareSpiritNode({ spirit: 'mew', spiritVersion: 1, floor: 41 }, boosted, data, () => 0);
		assert.deepEqual(boosted, saved.routeChoices[0], 'opening a prepared route cannot add levels again');
	});
	it('keeps the authored boosted elite legendary thresholds in shared route generation', () => {
		data.biomeEncounters = true;
		for (const [floor, roll] of [[171, 49], [191, 67]]) {
			data.floors[floor] = [{ id: 'elite', kind: 'elite', name: '区域精英', encounters: [], reward: { money: 0, items: {} } }];
			for (const spirit of [undefined, 'mew']) {
				let calls = 0; engine.random = () => ++calls === 2 ? roll : 0;
				const route = engine.prepareCoopRoutes(floor, 0, undefined, [], [], spirit).choices[0];
				assert.equal(MajorLegendaryPool.includes(route.encounters[0].team[0].species), !!spirit);
			}
		}
	});
	it('hides the same two Darkrai choices for both players, persists them and reveals the selected actual route', () => {
		start('darkrai'); const a = advance(2), hidden = a.routeChoices.filter(node => node.fogged);
		assert.equal(hidden.length, 2);
		assert.deepEqual(view(host).routeChoices, view(guest).routeChoices);
		for (const node of hidden) {
			assert.deepEqual(view(host).routeChoices.find(entry => entry.id === node.id), {
				id: node.id, name: '迷雾区域', kind: 'fog', fogged: true, available: true,
			});
		}
		const saved = get(); manager = new RogueManager(engine);
		manager.coop.command(host, { action: 'refresh' }); manager.coop.command(guest, { action: 'refresh' });
		assert.deepEqual(get(), saved);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: hidden[0].id });
		assert.equal(view(host).selectedRoute.name, hidden[0].name);
		assert.equal(view(guest).selectedRoute.kind, hidden[0].kind);
	});
	it('does not fog fixed rest or boss floors and does not hide optional challenges', () => {
		start('darkrai');
		for (const floor of [9, 20]) assert(advance(floor).routeChoices.every(node => !node.fogged));
		const a = structuredClone(get().adventure); a.floor = 2;
		const ordinary = structuredClone(data.floors[2][0]);
		const challenge = { ...structuredClone(ordinary), id: 'challenge', challenge: { id: 'fixture' } };
		const original = engine.prepareCoopRoutes.bind(engine);
		engine.prepareCoopRoutes = () => ({ choices: [ordinary, challenge], biomeHistory: [] });
		try { manager.coop.prepareRouteChoices(a); } finally { engine.prepareCoopRoutes = original; }
		assert(a.routeChoices[0].fogged); assert(!a.routeChoices[1].fogged);
	});
});
