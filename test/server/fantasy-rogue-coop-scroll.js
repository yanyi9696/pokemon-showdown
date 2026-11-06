'use strict';

const assert = require('assert').strict;
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { SCROLLS, activityEligible, journeyActivityView } = require('../../dist/server/fantasy-rogue/journey-activities');
const { Battle } = require('../../dist/sim/battle');
const { Teams } = require('../../dist/sim/teams');
const { Dex } = require('../../dist/sim/dex');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { captureCoopCheckpoint } = require('../../dist/sim/rogue-coop-checkpoint');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative Kubfu scroll trials', () => {
	let oldConfig, store, engine, manager, host, guest, created;
	let serial = 0;
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = (user = host) => manager.coop.view(user).session.adventure;
	const event = (user = host) => view(user).coopEvent;
	function change(update) {
		const s = session(), revision = s.revision;
		update(s); s.revision++; store.updateCoopSession(s, revision);
	}
	function newManager() {
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-scroll-fixture' };
		} }));
	}
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content()); newManager();
		host = makeUser(`Scroll Host ${++serial}`, `127.0.98.${serial}`);
		guest = makeUser(`Scroll Guest ${serial}`, `127.0.99.${serial}`);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(s => {
			for (const user of [host, guest]) {
				s.adventure.members[user.id].team = ['Kubfu', 'Kubfu', 'Bulbasaur', 'Charmander', 'Squirtle', 'Pikachu']
					.map((species, index) => ({ ...createRoguePokemon(set(species, '', 40, ['Splash']), stats(0)), joinOrder: index }));
			}
		});
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	function enter() {
		change(s => {
			const a = s.adventure; a.floor = 61; a.phase = 'area-selection';
			s.areaSelections = { [host.id]: null, [guest.id]: null };
			a.routeChoices = [{ id: 'scrollroute', name: '卷轴修行', kind: 'event', encounters: [], reward: { money: 0, items: {} } }];
			a.coopEventHistory = Object.keys(EVENT_NAMES).filter(key => key !== 'kubfuscroll').map(key => ({ id: key, floor: 1 }));
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'scrollroute' });
		assert.equal(event().id, 'kubfuscroll');
	}
	function choose(user, value, owner, visit) {
		const target = owner === guest.id ? guest : owner === host.id ? host : user;
		return manager.coop.command(user, { action: 'eventchoice', value, owner, visit: visit || event(target).key });
	}
	function agree(value) { choose(host, value); choose(guest, value); }
	function pick(user, scroll, index = 0, actor = user) {
		choose(actor, 'member:' + member(user).team[index].id, user.id);
		choose(actor, scroll ? 'scroll:' + scroll : 'assist', user.id);
	}
	function prepare(first = 'dark', second = 'water', native = false) {
		enter(); agree('accept');
		pick(host, first); pick(guest, second, 1);
		assert.equal(session().adventure.phase, 'battle-selection');
		if (native) manager.coop.command(host, { action: 'preparebattle', visit: view().battleSelectionKey });
		else for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle',
			members: [session().adventure.node.event.coopScroll.participants[user.id].member] });
		assert(created.rogue.cooperative); assert.equal(created.rogue.state.catchable, false);
	}
	function outcome(won = true) {
		const state = created.rogue.state;
		return { encounterId: state.encounterId, won, turns: 3, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag }, defeated: [] };
	}
	function settle(result = outcome()) { created.rogue.onResult(result); }
	function battleFromState() {
		const state = structuredClone(created.rogue.state);
		return new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: host.name, team: state.team.map(mon => mon.set) },
			p2: { name: 'Guardian A', team: Teams.unpack(created.trainer.packedTeam) },
			p3: { name: guest.name, team: state.partner.team.map(mon => mon.set) },
			p4: { name: 'Guardian B', team: Teams.unpack(created.rogue.cooperative.foe) },
		});
	}
	function finishMoves() {
		// These tests cover scroll settlement; keep any real move-learning grants intact in the assertions above.
		change(s => { for (const m of Object.values(s.adventure.members)) m.pendingMoves = []; });
	}
	it('requires common consent, lets each player change their own selection, and synchronizes both choices', () => {
		enter(); const before = session(), old = event().key;
		assert.deepEqual(event().branchOptions, event(guest).branchOptions); assert.deepEqual(session(), before);
		choose(host, 'accept'); choose(guest, 'leave'); assert(!session().adventure.coopEventBranchResolved);
		manager.coop.command(guest, { action: 'cancelevent', visit: event(guest).key }); choose(guest, 'accept');
		assert.notEqual(event().key, old); assert.notEqual(event().key, event(guest).key);
		assert.throws(() => choose(host, 'member:' + member(host).team[0].id, undefined, old), /已变化/);
		pick(host, 'dark'); assert.equal(session().adventure.phase, 'route-interaction');
		assert.equal(event(guest).scrollPartners[0].choice, 'dark');
		choose(host, 'change'); assert.equal(event(guest).scrollPartners[0].choice, undefined);
		pick(host, 'water', 1); pick(guest, 'dark');
		assert.equal(session().adventure.phase, 'battle-selection');
	});
	it('declines without modifying either party or permanent unlocks', () => {
		enter(); const members = session().adventure.members, accounts = [store.get(host.id), store.get(guest.id)];
		agree('leave');
		for (const user of [host, guest]) {
			assert.deepEqual(member(user).team, members[user.id].team); assert(member(user).coopEvent.settled);
			assert.deepEqual(member(user).bag, members[user.id].bag);
		}
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
	});
	for (const first of Object.keys(SCROLLS)) it(`combines ${first} with the same scroll and evolves only the selected Kubfu`, () => {
		prepare(first, first); const before = session().adventure.members, s = session().adventure;
		assert.equal(s.node.encounters[0].team.length, 6); assert(s.node.encounters[0].fixedLevels); assert(s.node.noHealing);
		for (const mon of s.node.encounters[0].team) {
			assert(Dex.mod('gen9fantasy').species.get(mon.species).types.includes(SCROLLS[first][1]));
			assert(mon.level >= 35 && mon.level <= 40);
		}
		assert.equal(created.rogue.state.team.length, 1); assert.equal(created.rogue.state.partner.team.length, 1);
		settle();
		for (const [user, index] of [[host, 0], [guest, 1]]) {
			assert.equal(member(user).team.length, 6); assert.equal(member(user).team[index].set.species, SCROLLS[first][2]);
			assert.equal(member(user).team[index].id, before[user.id].team[index].id);
			assert.deepEqual(member(user).team.filter((_, i) => i !== index), before[user.id].team.filter((_, i) => i !== index));
			assert(member(user).coopEvent.settled);
		}
		const saved = session(); settle(); assert.deepEqual(session(), saved);
		assert(!session().adventure.node.noHealing);
	});
	it('combines different native guardians, keeps full parties, and resolves a real Multi victory from a checkpoint', () => {
		prepare('dark', 'water', true); const battle = battleFromState();
		try {
			assert.equal(battle.gameType, 'multi'); assert.equal(battle.p1.pokemon.length, 1); assert.equal(battle.p3.pokemon.length, 1);
			assert.equal(battle.p2.pokemon.length + battle.p4.pokemon.length, 6);
			const enemies = session().adventure.node.encounters[0].team;
			for (const [index, mon] of enemies.entries()) {
				assert(Dex.mod('gen9fantasy').species.get(mon.species).types.includes(index < 3 ? 'Dark' : 'Water'));
			}
			for (const side of battle.sides) assert(battle.choose(side.id, 'team 1'));
			assert.equal(battle.turn, 1); created.rogue.onCheckpoint(captureCoopCheckpoint(battle));
			assert.equal(session().battleSelections[host.id].length, 1); assert.equal(session().battleSelections[guest.id].length, 1);
			for (const side of [battle.p2, battle.p4]) for (const mon of side.pokemon) mon.faint();
			battle.faintMessages(); const result = rogueBattleResult(battle);
			assert(result.won); settle(result);
			assert.equal(member(host).team[0].set.species, 'Urshifu');
			assert.equal(member(guest).team[1].set.species, 'Urshifu-Rapid-Strike');
		} finally { battle.destroy(); }
	});
	for (const traineeSeat of ['host', 'guest']) it(`offers the trial when only ${traineeSeat} has Kubfu and restricts the helper to one`, () => {
		const trainee = traineeSeat === 'host' ? host : guest, helper = trainee === host ? guest : host;
		change(s => { s.adventure.members[helper.id].team = s.adventure.members[helper.id].team.slice(2); });
		enter(); agree('accept'); pick(trainee, 'electric');
		assert(event(helper).paragraphs.join('').includes('协助')); pick(helper, null, 1);
		assert.equal(session().adventure.node.encounters[0].team.length, 3);
		assert.throws(() => manager.coop.command(helper, { action: 'selectbattle', members: member(helper).team.slice(0, 2).map(m => m.id) }));
		const before = member(helper).team;
		manager.coop.command(host, { action: 'preparebattle', visit: view().battleSelectionKey });
		const battle = battleFromState();
		try {
			assert.equal(battle.p2.pokemon.length + battle.p4.pokemon.length, 3);
			for (const side of battle.sides) assert(battle.choose(side.id, 'team 1'));
			created.rogue.onCheckpoint(captureCoopCheckpoint(battle));
			settle();
			assert.equal(member(trainee).team[0].set.species, 'Urshifu-Fantasy');
			assert.deepEqual(member(helper).team, before); assert(member(helper).coopEvent.result.join('').includes('协助'));
		} finally { battle.destroy(); }
	});
	it('rejects foreign targets, stale personal actions and an unchosen substitute', () => {
		enter(); agree('accept'); const saved = session();
		assert.throws(() => choose(host, 'member:' + member(guest).team[0].id), /变化/); assert.deepEqual(session(), saved);
		const key = event().key; choose(host, 'member:' + member(host).team[0].id);
		assert.throws(() => choose(host, 'scroll:dark', undefined, key), /已变化/);
		choose(host, 'scroll:dark'); pick(guest, 'water');
		assert.throws(() => manager.coop.command(host, { action: 'selectbattle', members: [member(host).team[1].id] }), /健康队伍/);
		change(s => { delete s.adventure.node.event.coopScroll; });
		assert.throws(() => manager.coop.command(host, { action: 'preparebattle', visit: 'old' }), /修行记录/);
	});
	for (const invalid of ['egg', 'fusion', 'formFusion', 'nuzlockeDead', 'fainted', 'underlevel']) {
		it(`rejects ${invalid} trainees in both native and cooperative choices`, () => {
			enter(); agree('accept');
			change(s => {
				const mon = s.adventure.members[host.id].team[0];
				if (invalid === 'fainted') mon.hp = 0;
				else if (invalid === 'underlevel') mon.set.level = 34;
				else mon[invalid] = invalid === 'nuzlockeDead' ? true : {};
			});
			const mon = member(host).team[0];
			assert(!event().options.some(o => o.id === 'member:' + mon.id));
			assert(!activityEligible({ team: [mon] }, 'kubfuscroll'));
			const run = { team: [mon], node: { event: { id: 'kubfuscroll', stage: 'choice', activity: { member: mon.id } } } };
			assert(!journeyActivityView(run).options.some(o => o.id.startsWith('scroll:')));
		});
	}
	it('accepts level 35 and revalidates a ready selection changed before the other player confirms', () => {
		enter(); agree('accept');
		change(s => { s.adventure.members[host.id].team[0].set.level = 35; });
		pick(host, 'dark'); choose(guest, 'member:' + member(guest).team[1].id);
		change(s => { s.adventure.members[host.id].team[0].hp = 0; });
		const saved = session(); assert.throws(() => choose(guest, 'scroll:water'), /已变化/); assert.deepEqual(session(), saved);
		choose(host, 'member:' + member(host).team[1].id); choose(host, 'scroll:dark');
		choose(guest, 'scroll:water'); assert.equal(session().adventure.phase, 'battle-selection');
	});
	it('supports delegated independent scrolls and revocation without changing the teammate selection', () => {
		enter(); choose(host, 'accept'); manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.equal(event().ownChoice, null); choose(guest, 'accept');
		assert.throws(() => choose(host, 'member:' + member(host).team[0].id), /操作权/);
		pick(host, 'poison', 0, guest); const own = member(host).coopEvent.activity;
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		assert.deepEqual(member(host).coopEvent.activity, own); pick(guest, 'psychic');
		assert.equal(session().adventure.node.event.coopScroll.participants[host.id].scroll, 'poison');
		assert.equal(session().adventure.node.event.coopScroll.participants[guest.id].scroll, 'psychic');
	});
	it('restores a saved native battle with the same selected members and enemies', () => {
		prepare('dark', 'water', true); const battle = battleFromState();
		try {
			for (const side of battle.sides) battle.choose(side.id, 'team 1');
			battle.damage(5, battle.p3.pokemon[0]); const cp = captureCoopCheckpoint(battle); created.rogue.onCheckpoint(cp);
			newManager(); for (const user of [host, guest]) manager.coop.command(user, { action: 'recoverbattle' });
			const restored = Battle.fromJSON(created.rogue.resumeCheckpoint.state);
			try {
				assert.equal(restored.p3.pokemon[0].hp, battle.p3.pokemon[0].hp);
				assert.equal(restored.p2.pokemon.length + restored.p4.pokemon.length, 6);
				assert.equal(created.rogue.state.partner.team[0].id, member(guest).team[1].id);
			} finally { restored.destroy(); }
		} finally { battle.destroy(); }
	});
	it('retains injury and spending on a live retreat and retries the same enemy and personal choices', () => {
		prepare(); const enemies = session().adventure.node.encounters, result = outcome(false);
		result.team[0].hp = 7; result.bag.pokeball--; result.coopExit = 'retreat';
		settle(result);
		assert(!session().adventure.battleResult.eventResolved); newManager();
		for (const user of [host, guest]) manager.coop.command(user, { action: 'retrybattle' });
		manager.coop.command(host, { action: 'preparebattle', visit: view().battleSelectionKey });
		assert.equal(created.rogue.state.team[0].hp, 7); assert.equal(created.rogue.state.bag.pokeball, result.bag.pokeball);
		assert.deepEqual(session().adventure.node.encounters, enemies);
	});
	for (const retreated of [false, true]) it(`ends an unsuccessful ${retreated ? 'fainted retreat' : 'battle'} without evolution or a retry deadlock`, () => {
		prepare(); const result = outcome(false); result.partnerTeam[0].hp = 0;
		if (retreated) result.coopExit = 'retreat'; settle(result);
		assert(session().adventure.battleResult.eventResolved); assert.equal(member(guest).team[1].set.species, 'Kubfu');
		assert.throws(() => manager.coop.command(host, { action: 'retrybattle' }), /不能重试/);
		finishMoves(); for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
		assert.equal(session().adventure.phase, 'route-interaction'); assert(event().ownComplete); assert(event().partnerComplete);
	});
	it('still evolves both selected Kubfu on victory when one fainted before the final knockout', () => {
		prepare(); const result = outcome(); result.team[0].hp = 0;
		settle(result);
		assert.equal(member(host).team[0].set.species, 'Urshifu'); assert.equal(member(guest).team[1].set.species, 'Urshifu-Rapid-Strike');
	});
	it('rolls back party evolution and account changes together when persistence fails', () => {
		prepare(); const saved = session(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec("CREATE TEMP TRIGGER scroll_write_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'scroll write failed'); END;");
		try { assert.throws(() => settle(), /scroll write failed/); } finally { store.db.exec('DROP TRIGGER scroll_write_fail'); }
		assert.deepEqual(session(), saved); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		settle(); assert.equal(member(host).team[0].set.species, 'Urshifu');
	});
});
