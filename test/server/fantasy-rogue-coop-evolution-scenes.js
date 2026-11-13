'use strict';

const assert = require('assert').strict;
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { content, set, firstEventRoute } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op personal evolution scenes', () => {
	let oldConfig, store, engine, manager, host, guest;
	let serial = 0;
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content()); manager = new RogueManager(engine);
		host = makeUser(`Scene Host ${++serial}`, `127.0.51.${serial}`);
		guest = makeUser(`Scene Guest ${serial}`, `127.0.52.${serial}`);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = user => manager.coop.view(user).session.adventure.coopEvent;
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function prepare(id, species, both = true, floor = 64) {
		change(shared => {
			const a = shared.adventure; a.floor = floor;
			for (const user of both ? [host, guest] : [guest]) {
				const mon = createRoguePokemon({ ...set(), species, level: 40 }, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
				mon.hp = mon.maxhp = 110;
				a.members[user.id].team = [mon];
				a.members[user.id].money = 2000; a.members[user.id].bag.peatblock = 0;
			}
			a.routeChoices = [{ id: 'scene', name: '共同事件', kind: 'event', encounters: [], reward: { money: 0, items: {} } }];
			a.coopEventHistory = Object.keys(EVENT_NAMES).filter(key => key !== id).map(key => ({ id: key, floor: 1 }));
		});
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'scene' });
		});
	}
	function choose(user, value, owner, visit) {
		const target = owner === guest.id ? guest : owner === host.id ? host : user;
		return manager.coop.command(user, { action: 'eventchoice', value, owner, visit: visit || view(target).key });
	}
	function participate() { choose(host, 'participate'); choose(guest, 'participate'); }
	function select(user, owner) {
		const target = owner === guest.id ? guest : owner === host.id ? host : user;
		return choose(user, 'member:' + encodeURIComponent(member(target).team[0].id), owner);
	}
	for (const [id, species, action, scene] of [
		['stonegate', 'Yamask-Galar', 'cross', 'runerigus'], ['invertedstars', 'Inkay', 'turn', 'malamar'],
		['peatmoon', 'Ursaring', 'ceremony', 'ursaluna'], ['unioncircle', 'Finizen', 'circle', 'palafin'],
	]) it(`shares ${id}, then grants each personal condition only once`, () => {
		prepare(id, species); assert.equal(view(host).id, id);
		assert.deepEqual(view(host).branchOptions, view(guest).branchOptions);
		choose(host, 'participate'); assert.equal(view(host).branchResolved, false);
		choose(guest, 'participate'); assert.equal(view(host).branchResolved, true);
		const other = member(guest);
		select(host); choose(host, action);
		assert.deepEqual(member(guest), other);
		assert(member(host).team[0].evolutionProgress.scenes.includes(scene));
		assert.equal(view(host).ownComplete, true); assert.equal(view(host).partnerComplete, false);
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /双方.*事件|完成/);
		const saved = session(); assert.throws(() => choose(host, action), /变化|更新/); assert.deepEqual(session(), saved);
		select(guest); choose(guest, action);
		assert(member(guest).team[0].evolutionProgress.scenes.includes(scene));
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 65);
	});
	it('allows guest-only eligibility and a personal skip, including after reconnection', () => {
		prepare('unioncircle', 'Finizen', false); assert.equal(view(host).id, 'unioncircle'); participate();
		assert.deepEqual(view(host).options.map(option => option.id), ['leave']);
		choose(host, 'leave'); manager = new RogueManager(new RogueEngine(store, engine.content));
		select(guest); choose(guest, 'circle');
		assert.equal(member(host).team[0].evolutionProgress, undefined);
		assert(member(guest).team[0].evolutionProgress.scenes.includes('palafin'));
	});
	it('consumes only the owner’s peat item or money and preserves the teammate wallet', () => {
		prepare('peatmoon', 'Ursaring');
		change(s => { s.adventure.members[host.id].bag.peatblock = 1; }); participate();
		select(host); choose(host, 'ceremony');
		assert.equal(member(host).bag.peatblock, 0); assert.equal(member(host).money, 2000);
		assert.equal(member(guest).money, 2000);
		select(guest); choose(guest, 'ceremony');
		assert.equal(member(guest).money, 400);
	});
	it('requires a fresh personal token and current ownership after delegation and revocation', () => {
		prepare('unioncircle', 'Finizen'); const previous = view(host).key; participate();
		assert.throws(() => choose(host, 'leave', undefined, previous), /已变化/);
		assert.throws(() => select(host, guest.id), /只能提交自己/);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert.equal(view(host).partnerKey, view(guest).key); select(host, guest.id);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.throws(() => choose(host, 'circle', guest.id), /只能提交自己/);
		choose(guest, 'circle'); assert.equal(view(guest).ownComplete, true);
	});
	it('revalidates changed targets and affordability before any effect', () => {
		prepare('peatmoon', 'Ursaring'); participate(); select(host);
		change(s => { s.adventure.members[host.id].money = 1599; });
		let saved = session(); assert.throws(() => choose(host, 'ceremony'), /变化/); assert.deepEqual(session(), saved);
		change(s => { s.adventure.members[host.id].team[0].nuzlockeDead = true; });
		assert.deepEqual(view(host).options.map(option => option.id), ['leave']);
		saved = session(); assert.throws(() => choose(host, 'ceremony'), /变化/); assert.deepEqual(session(), saved);
		choose(host, 'leave');
	});
	it('protects stonegate HP and accepts already accumulated damage without charging it twice', () => {
		prepare('stonegate', 'Yamask-Galar'); participate(); select(host);
		change(s => { s.adventure.members[host.id].team[0].hp = 49; });
		assert.throws(() => choose(host, 'cross'), /变化/);
		change(s => { s.adventure.members[host.id].team[0].evolutionProgress = { lostHP: 49 }; });
		choose(host, 'cross'); assert.equal(member(host).team[0].hp, 49);
		select(guest); choose(guest, 'cross'); assert.equal(member(guest).team[0].hp, 61);
	});
	it('rolls back private resource and condition changes on persistence failure', () => {
		prepare('peatmoon', 'Ursaring'); participate(); select(host);
		const saved = session(), original = store.updateCoopSession;
		store.updateCoopSession = function (...args) { original.apply(this, args); throw new Error('scene save failed'); };
		try { assert.throws(() => choose(host, 'ceremony'), /scene save failed/); } finally { store.updateCoopSession = original; }
		assert.deepEqual(session(), saved); choose(host, 'ceremony'); assert.equal(member(host).money, 400);
	});
});
