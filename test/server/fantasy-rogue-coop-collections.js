'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { chooseEventOption } = require('../../dist/server/fantasy-rogue/events');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { settleCoopCollection } = require('../../dist/server/fantasy-rogue/coop-collections');
const { stonePrice, collectionView, chooseCollection } = require('../../dist/server/fantasy-rogue/collection-events');
const { grantCompanion } = require('../../dist/server/fantasy-rogue/companions');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { neededExclusiveItems } = require('../../dist/server/fantasy-rogue/exclusive-items');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op stones and feather collection', () => {
	let previous, store, engine, manager, host, guest, serial = 0;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const data = content(), items = createPreviewContent().items;
		data.items = [...items, ...data.items.filter(item => !items.some(entry => entry.id === item.id))];
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, data); manager = new RogueManager(engine);
		host = makeUser(`Collection Host ${++serial}`, `127.0.71.${serial}`);
		guest = makeUser(`Collection Guest ${serial}`, `127.0.72.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(shared => {
			for (const user of [host, guest]) {
				const own = shared.adventure.members[user.id]; own.money = 30000;
				own.bag = { potion: 2, prettyfeather: user === host ? 0 : 5 };
			}
			shared.adventure.members[guest.id].team.push(createRoguePokemon(set('Pidgeot', 'Keen Eye', 30), stats(0)));
		});
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = previous.local; Config.bindaddress = previous.bind; Config.fantasyrogue = previous.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = user => manager.coop.view(user).session.adventure;
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter(id, floor = 81) {
		change(shared => {
			const a = shared.adventure; a.floor = floor;
			a.phase = 'area-selection'; delete a.node;
			a.routeChoices = [{ id: 'collection', kind: 'event', name: '共同事件', encounters: [], reward: { money: 0, items: {} } }];
			a.coopEventHistory = Object.keys(EVENT_NAMES).filter(name => name !== id).map(name => ({ id: name, floor: 1 }));
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'collection' });
		return view(host).coopEvent;
	}
	function request(user, value, action = 'eventchoice') { return { action, value, visit: view(user).coopEvent.key }; }
	function choose(user, value) { return manager.coop.command(user, request(user, value)); }
	function agree(value) { choose(host, value); choose(guest, value); }
	const showcase = () => view(host).coopEvent.branchOptions.find(option => option.id.startsWith('show:')).id;
	function entries() {
		const a = session().adventure;
		return [host, guest].map(user => ({ userid: user.id, account: store.get(user.id),
			run: structuredClone(manager.coop.eventRun(a, user.id)) }));
	}
	for (const eventId of ['stones', 'feathers']) it(`offers ${eventId} through the real event pool and preserves read-only views`, () => {
		assert.equal(enter(eventId).id, eventId);
		const saved = session();
		assert.deepEqual(view(host).coopEvent.branchOptions, view(guest).coopEvent.branchOptions);
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /目标步骤/);
		manager = new RogueManager(engine); manager.coop.command(guest, { action: 'refresh' });
		assert.deepEqual(session(), saved);
	});
	it('keeps the authored early feather-event restriction', () => {
		assert.notEqual(enter('feathers', 29).id, 'feathers');
		assert.equal(enter('feathers', 60).id, 'feathers');
	});
	it('requires matching purchases, supports cancellation and changes no wallet on disagreement or exit', () => {
		enter('stones'); const before = [member(host), member(guest)];
		choose(host, `stone:${host.id}:1`); choose(guest, `stone:${guest.id}:5`);
		assert(!view(host).coopEvent.branchResolved);
		for (const [index, user] of [host, guest].entries()) {
			assert.equal(member(user).money, before[index].money); assert.deepEqual(member(user).bag, before[index].bag);
		}
		manager.coop.command(guest, request(guest, undefined, 'cancelevent'));
		assert.equal(view(guest).coopEvent.ownChoice, null);
		agree('stonefinish'); assert(view(host).coopEvent.ownComplete); assert(view(guest).coopEvent.ownComplete);
		assert.equal(member(host).money, before[0].money); assert.equal(member(guest).money, before[1].money);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 82);
	});
	it('charges only the named buyer, preserves their original roll and rejects duplicate or stale repeat purchases', () => {
		enter('stones'); const before = [member(host), member(guest)], accounts = [store.get(host.id), store.get(guest.id)];
		const value = `stone:${guest.id}:5`, command = request(guest, value);
		choose(host, value); manager.coop.command(guest, command);
		assert.equal(member(host).money, before[0].money); assert.deepEqual(member(host).bag, before[0].bag);
		assert.equal(member(guest).money, before[1].money - stonePrice(81) * 5);
		assert.equal(member(guest).coopEvent.stonesOpened, 5); assert.equal(member(host).coopEvent.stonesOpened, undefined);
		assert.equal(view(guest).lastReward.money, -stonePrice(81) * 5);
		assert(!view(host).coopEvent.branchResolved); assert.equal(view(host).coopEvent.ownChoice, null);
		assert.notEqual(view(host).coopEvent.key, command.visit);
		assert.equal(session().adventure.node.event.key, view(guest).coopEvent.key);
		assert.deepEqual(view(host).coopEvent.paragraphs, view(guest).coopEvent.paragraphs);
		assert(view(host).coopEvent.paragraphs[0].includes('2P'));
		const saved = session(); manager = new RogueManager(engine);
		assert.throws(() => manager.coop.command(guest, command), /进度已变化/); assert.deepEqual(session(), saved);
		assert.throws(() => manager.coop.command(host, { ...command, action: 'cancelevent' }), /进度已变化/);
		agree(`stone:${host.id}:1`);
		assert.equal(member(host).money, before[0].money - stonePrice(81));
		assert.equal(member(guest).money, before[1].money - stonePrice(81) * 5);
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		agree('stonefinish'); const final = session();
		assert.throws(() => choose(host, value), /变化/); assert.deepEqual(session(), final);
	});
	it('uses exactly the native empty, ordinary and premium stone results without rolling for the other player', () => {
		enter('stones'); const runs = entries(), solo = structuredClone(runs[1].run);
		let rolled = 0;
		const random = () => { let index = 0; return max => max === 100 ? [49, 50, 94, 95, 99][index++] : 0; };
		const nativeRandom = random(), sharedRandom = random();
		chooseEventOption(runs[1].account, solo, engine.content, nativeRandom, solo.node.event.key, 'stone:5');
		const other = structuredClone(runs[0].run);
		settleCoopCollection(runs, engine.content, max => { if (max === 100) rolled++; return sharedRandom(max); }, `stone:${guest.id}:5`);
		assert.equal(rolled, 5); assert.equal(runs[1].run.money, solo.money);
		assert.deepEqual(runs[1].run.bag, solo.bag); assert.deepEqual(runs[1].run.lastReward, solo.lastReward);
		assert.equal(Object.values(solo.lastReward.items).reduce((sum, count) => sum + count, 0), 4);
		assert.equal(runs[0].run.money, other.money); assert.deepEqual(runs[0].run.bag, other.bag);
	});
	it('validates the current payer balance, ownership, visit, quantity and allowed stage', () => {
		enter('stones'); const value = `stone:${guest.id}:5`; choose(host, value);
		change(shared => { shared.adventure.members[guest.id].money = stonePrice(81) * 5 - 1; });
		const saved = session(); assert(view(host).coopEvent.branchOptions.find(option => option.id === value).disabled);
		for (const invalid of [value, `stone:outsider:1`, `stone:${host.id}:2`, 'stone:1']) {
			assert.throws(() => choose(guest, invalid), /分支/);
		}
		assert.throws(() => manager.coop.command(guest, { action: 'eventchoice', value: 'stonefinish' }), /进度/);
		assert.deepEqual(session(), saved);
		const valid = request(guest, 'stonefinish');
		change(shared => { shared.adventure.phase = 'battle'; });
		assert.throws(() => manager.coop.command(guest, valid), /事件/);
		change(shared => { shared.adventure.phase = 'route-interaction'; shared.adventure.node.mainlineScene = 'forged'; });
		assert.equal(view(host).coopEvent, null); assert.throws(() => manager.coop.command(guest, valid), /秘闻/);
	});
	it('keeps Olivia roll bonuses and completed-visit progress with the actual purchaser across changing step keys', () => {
		enter('stones'); const runs = entries();
		for (const { run } of runs) { normalizeBlessings(run); grantCompanion(run, 'olivia'); }
		const solo = structuredClone(runs[1].run), random = max => max === 100 ? 90 : 0;
		chooseEventOption(runs[1].account, solo, engine.content, random, solo.node.event.key, 'stone:1');
		settleCoopCollection(runs, engine.content, random, `stone:${guest.id}:1`);
		assert.deepEqual(runs[1].run.bag, solo.bag); assert(Object.keys(solo.lastReward.items).length);
		const companionKey = runs[1].run.node.event.companionKey;
		settleCoopCollection(runs, engine.content, random, `stone:${guest.id}:1`);
		assert.equal(runs[1].run.node.event.companionKey, companionKey);
		settleCoopCollection(runs, engine.content, random, 'stonefinish');
		assert.equal(runs[0].run.blessings.companions[0].preferences, 0);
		assert.equal(runs[1].run.blessings.companions[0].preferences, 1);
	});
	it('records a purchased exclusive item for its owner even after it leaves the bag', () => {
		enter('stones'); const runs = entries();
		runs[1].run.team[1] = createRoguePokemon(set('Pikachu', 'Static', 30), stats(0));
		assert(neededExclusiveItems(runs[1].run).some(item => item.id === 'lightball'));
		const data = { ...engine.content, items: engine.content.items.filter(item => item.id === 'lightball') };
		settleCoopCollection(runs, data, max => max === 100 ? 60 : 0, `stone:${guest.id}:1`);
		assert.equal(runs[1].run.bag.lightball, 1); assert(runs[1].run.exclusiveItems.lightball.obtained);
		assert.equal(runs[0].run.bag.lightball, undefined);
		delete runs[1].run.bag.lightball;
		assert(!neededExclusiveItems(runs[1].run).some(item => item.id === 'lightball'));
	});
	it('accepts either party feathered partner and duplicates only the original free observation gift', () => {
		enter('feathers'); const before = [member(host), member(guest)], accounts = [store.get(host.id), store.get(guest.id)];
		const runs = entries(), solo = runs[1].run;
		chooseEventOption(runs[1].account, solo, engine.content, () => 0, solo.node.event.key, `show:${solo.team[1].id}`);
		const choice = showcase(); assert(choice.includes(guest.id)); assert.equal(view(host).coopEvent.branchOptions.find(o => o.id === choice).seat, 2);
		const command = request(guest, choice); choose(host, choice); manager.coop.command(guest, command);
		for (const [index, user] of [host, guest].entries()) {
			assert.equal(member(user).money - before[index].money, solo.money - before[1].money);
			assert.equal(member(user).bag.prettyfeather, before[index].bag.prettyfeather + 3);
			assert.deepEqual(view(user).lastReward.items, { prettyfeather: 3 });
			assert(view(user).coopEvent.ownComplete); assert(view(user).coopEvent.partnerComplete);
		}
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		const saved = session(); assert.throws(() => manager.coop.command(guest, command), /进度/); assert.deepEqual(session(), saved);
	});
	it('does not showcase boxed, egg or Nuzlocke-lost members and revalidates changed party species', () => {
		enter('feathers'); const selected = showcase(); choose(host, selected);
		change(shared => {
			const own = shared.adventure.members[guest.id]; own.box = [structuredClone(own.team[1])];
			own.team[1].egg = { species: 'Pidgeot', remaining: 1 };
		});
		assert(!view(host).coopEvent.branchOptions.some(option => option.id.startsWith('show:')));
		assert.throws(() => choose(guest, selected), /分支/);
		change(shared => {
			const mon = shared.adventure.members[guest.id].team[1]; delete mon.egg; mon.nuzlockeDead = true;
		});
		assert.throws(() => choose(guest, selected), /分支/);
		change(shared => {
			const mon = shared.adventure.members[guest.id].team[1]; delete mon.nuzlockeDead; mon.set.species = 'Bulbasaur';
		});
		assert.throws(() => choose(guest, selected), /分支/);
	});
	it('exchanges only the selected owners five feathers for six native training feathers', () => {
		enter('feathers'); const before = [member(host), member(guest)];
		assert(view(host).coopEvent.branchOptions.find(option => option.id === `feathertrade:${host.id}`).disabled);
		agree(`feathertrade:${guest.id}`);
		assert.equal(member(guest).bag.prettyfeather, 0); assert.deepEqual(member(host).bag, before[0].bag);
		assert.equal(member(guest).money, before[1].money); assert.equal(member(host).money, before[0].money);
		const rewards = view(guest).lastReward.items;
		assert.equal(Object.values(rewards).reduce((sum, count) => sum + count, 0), 6);
		assert(Object.keys(rewards).every(id => /^(health|muscle|resist|genius|clever|swift)feather$/.test(id)));
		assert(view(host).coopEvent.ownComplete); assert.equal(view(host).lastReward, null);
	});
	for (const [id, species] of [['feathers', 'Pidgeot'], ['mushroomcollector', 'Amoonguss']]) {
		it(`blocks Nuzlocke-lost partners in the native ${id} observation as well`, () => {
			enter('feathers'); const run = entries()[1].run, mon = run.team[1];
			run.node.event.id = id; mon.set.species = species;
			assert(collectionView(run).options.some(option => option.id === `show:${mon.id}`));
			mon.nuzlockeDead = true;
			assert(!collectionView(run).options.some(option => option.id === `show:${mon.id}`));
			const before = structuredClone(run);
			assert.throws(() => chooseCollection(run, engine.content, () => 0, `show:${mon.id}`), /无法选择/);
			assert.deepEqual(run, before);
		});
	}
	it('rechecks feather stock at consensus and allows a resource-free shared skip', () => {
		enter('feathers'); const selected = `feathertrade:${guest.id}`; choose(host, selected);
		change(shared => { shared.adventure.members[guest.id].bag.prettyfeather = 4; });
		const saved = session(); assert.throws(() => choose(guest, selected), /分支/); assert.deepEqual(session(), saved);
		agree('leave'); assert(view(host).coopEvent.ownComplete);
		assert.equal(member(guest).bag.prettyfeather, 4); assert.equal(view(host).lastReward.money, 0);
	});
	it('respects delegation and revocation without changing the selected payer', () => {
		enter('stones'); const value = `stone:${guest.id}:1`, before = [member(host).money, member(guest).money];
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert.throws(() => choose(guest, value), /移交/);
		choose(host, value); assert.equal(member(host).money, before[0]); assert.equal(member(guest).money, before[1] - stonePrice(81));
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		choose(host, value); assert.equal(member(guest).money, before[1] - stonePrice(81));
		choose(guest, value); assert.equal(member(guest).money, before[1] - stonePrice(81) * 2);
	});
	for (const id of ['stones', 'feathers']) it(`rolls back ${id} resources, progress and notifications on a failed write`, () => {
		enter(id); const value = id === 'stones' ? `stone:${guest.id}:1` : showcase(); choose(host, value);
		const command = request(guest, value), saved = session(), accounts = [store.get(host.id), store.get(guest.id)];
		const send = host.send, messages = []; host.send = message => messages.push(message);
		store.db.exec("CREATE TEMP TRIGGER collection_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'collection write failed'); END;");
		try {
			assert.throws(() => manager.coop.command(guest, command), /collection write failed/);
			assert.deepEqual(session(), saved); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
			assert.equal(messages.length, 0);
		} finally { store.db.exec('DROP TRIGGER collection_fail'); host.send = send; }
		manager.coop.command(guest, command);
		assert.notEqual(view(host).coopEvent.key, command.visit);
		assert.throws(() => manager.coop.command(guest, command), /进度/);
	});
	it('rejects overflow without saving either observation gift', () => {
		enter('feathers'); choose(host, showcase());
		change(shared => { shared.adventure.members[host.id].money = Number.MAX_SAFE_INTEGER; });
		const saved = session(); assert.throws(() => choose(guest, showcase()), /可保存范围/); assert.deepEqual(session(), saved);
	});
});
