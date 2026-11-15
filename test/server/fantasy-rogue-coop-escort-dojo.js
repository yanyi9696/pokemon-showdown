'use strict';

const assert = require('assert').strict;
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { exclusiveCatalog } = require('../../dist/server/fantasy-rogue/exclusive-items');
const { Battle } = require('../../dist/sim/battle');
const { Teams } = require('../../dist/sim/teams');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { captureCoopCheckpoint } = require('../../dist/sim/rogue-coop-checkpoint');
const { content, set, stats, firstEventRoute } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative escort and evolution dojo', () => {
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
			created = { trainer, rogue }; return { roomid: 'battle-coop-escort-dojo-fixture' };
		} }));
	}
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content();
		fixture.items.push({ id: 'rarecandy', name: '神奇糖果', kind: 'rarecandy', price: 0 });
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture); newManager();
		host = makeUser(`Escort Host ${++serial}`, `127.0.96.${serial}`);
		guest = makeUser(`Escort Guest ${serial}`, `127.0.97.${serial}`);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(s => {
			for (const user of [host, guest]) {
				s.adventure.members[user.id].team = ['Primeape', 'Stantler', 'Bulbasaur', 'Charmander', 'Squirtle', 'Pikachu']
					.map((species, index) => ({ ...createRoguePokemon(set(species, '', 40, ['Splash']), stats(0)), joinOrder: index }));
				s.adventure.members[user.id].team[0].hp -= 3;
			}
		});
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	function enter(id) {
		change(s => {
			const a = s.adventure; a.floor = 61; a.phase = 'area-selection';
			// Exclusive clues intentionally bypass the normal recent-event filter. This fixture tests other events.
			for (const m of Object.values(a.members)) m.exclusiveItems = Object.fromEntries(
				exclusiveCatalog().map(item => [item.id, { obtained: true, since: 1, misses: 0, cooldown: 0 }]));
			s.areaSelections = { [host.id]: null, [guest.id]: null };
			a.routeChoices = [{ id: 'trainingroute', name: '共同相遇', kind: 'event', encounters: [], reward: { money: 0, items: {} } }];
			a.coopEventHistory = Object.keys(EVENT_NAMES).filter(key => key !== id).map(key => ({ id: key, floor: 1 }));
		});
		// Ready evolution events can now re-enter the unseen pool. Select the authored
		// first route explicitly; the escort assertions below must not depend on RNG.
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'trainingroute' });
		});
		assert.equal(event().id, id);
	}
	function choose(user, value, owner, visit) {
		const target = owner === guest.id ? guest : owner === host.id ? host : user;
		return manager.coop.command(user, { action: 'eventchoice', value, owner, visit: visit || event(target).key });
	}
	function agree(value) { choose(host, value); choose(guest, value); }
	function prepareEscort(owner = host, native = false) {
		enter('lostescort'); agree('escort:' + owner.id);
		if (native) manager.coop.command(host, { action: 'preparebattle', visit: view().battleSelectionKey });
		else for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: user === owner ?
			[session().adventure.node.event.coopEscort.pokemon.id] : member(user).team.slice(0, 3).map(mon => mon.id) });
		assert(created.rogue.cooperative); assert.equal(created.rogue.state.catchable, false);
	}
	function outcome(won = true) {
		const state = created.rogue.state;
		return { encounterId: state.encounterId, won, turns: 3, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag }, defeated: [] };
	}
	function escortResult(result) {
		return session().adventure.node.event.coopEscort.owner === host.id ? result.team[0] : result.partnerTeam[0];
	}
	function settle(result = outcome()) { created.rogue.onResult(result); }
	for (const side of ['host', 'guest']) it(`keeps the ${side} escort temporary while the human partner grows`, () => {
		engine.content.progression = 'mainline7';
		const owner = side === 'host' ? host : guest, partner = side === 'host' ? guest : host;
		change(saved => {
			for (const player of Object.values(saved.adventure.members)) {
				player.echo = { types: ['Psychic'], guard: true, shiny: 0, catch: 0, systems: [] };
			}
		});
		prepareEscort(owner);
		assert(created.rogue.state.liveProgression);
		assert.equal((side === 'host' ? created.rogue.state : created.rogue.state.partner).echo, undefined);
		assert((side === 'host' ? created.rogue.state.partner : created.rogue.state).echo.guard);
		const before = session(), ownParty = member(owner).team, account = store.get(owner.id), result = outcome(false);
		const ids = [...result.team, ...result.partnerTeam].map(mon => mon.id);
		result.defeated = [{ id: 'escort-defeat', species: 'Blissey', level: 90, captured: false, eligible: ids, participants: ids }];
		const npc = escortResult(result), originalNPC = structuredClone(npc);
		npc.hp -= 4; npc.pp[0].pp--;
		created.rogue.onProgress({ sequence: 1, result });
		const saved = session(), escort = saved.adventure.node.event.coopEscort.pokemon;
		assert.deepEqual(member(owner).team, ownParty, 'off-field personal party does not gain NPC training');
		assert.deepEqual(store.get(owner.id), account, 'temporary Ralts never unlocks personal moves');
		assert.equal(escort.set.species, 'Ralts'); assert.equal(escort.set.level, originalNPC.set.level);
		assert.equal(escort.hp, originalNPC.hp - 4); assert.equal(escort.pp[0].pp, originalNPC.pp[0].pp - 1);
		assert(member(partner).team[0].set.level > before.adventure.members[partner.id].team[0].set.level);
		const { coopGrowthAcknowledgement } = require('../../dist/server/fantasy-rogue/coop-growth');
		const ack = coopGrowthAcknowledgement(saved), temporary = side === 'host' ? ack : ack.partner;
		assert.equal(temporary.team.length, 1); assert.equal(temporary.team[0].id, npc.id);
		assert.equal(temporary.blessingRoster, undefined);
	});
	function battleFromState() {
		const state = structuredClone(created.rogue.state);
		return new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: host.name, team: state.team.map(mon => mon.set) },
			p2: { name: 'Opponent A', team: Teams.unpack(created.trainer.packedTeam) },
			p3: { name: guest.name, team: state.partner.team.map(mon => mon.set) },
			p4: { name: 'Opponent B', team: Teams.unpack(created.rogue.cooperative.foe) },
		});
	}
	it('offers both escort holders through the pool and requires a matching common selection', () => {
		enter('lostescort'); const saved = session(), visible = event();
		assert.deepEqual(visible.branchOptions.map(option => option.id), ['escort:' + host.id, 'escort:' + guest.id, 'leave']);
		assert.deepEqual(visible.branchOptions, event(guest).branchOptions);
		assert.deepEqual(session(), saved); choose(host, 'escort:' + host.id); choose(guest, 'escort:' + guest.id);
		assert.equal(session().adventure.phase, 'route-interaction');
		manager.coop.command(host, { action: 'cancelevent', visit: event().key });
		assert.equal(event().ownChoice, null); choose(host, 'escort:' + guest.id);
		assert.equal(session().adventure.phase, 'battle-selection');
		assert.equal(session().adventure.node.event.coopEscort.owner, guest.id);
		assert.throws(() => choose(host, 'leave', undefined, visible.key));
	});
	it('declines the escort without changing parties, costs or permanent unlocks', () => {
		enter('lostescort'); const before = session().adventure.members, accounts = [store.get(host.id), store.get(guest.id)];
		agree('leave');
		for (const user of [host, guest]) {
			assert.deepEqual(member(user).team, before[user.id].team);
			assert.deepEqual(member(user).bag, before[user.id].bag); assert.equal(member(user).money, before[user.id].money);
			assert.equal(member(user).coopEvent.settled, true);
		}
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
	});
	for (const seat of ['host', 'guest']) {
		it(`uses ${seat}'s position only and leaves their full personal party untouched`, () => {
			const owner = seat === 'host' ? host : guest, other = owner === host ? guest : host;
			prepareEscort(owner); const state = created.rogue.state;
			const escortTeam = owner === host ? state.team : state.partner.team;
			assert.equal(escortTeam.length, 1); assert.equal(escortTeam[0].set.species, 'Ralts');
			assert.equal((owner === host ? state.partner.team : state.team).length, 3);
			assert.equal(state.systems[owner === host ? 'player' : 'partner'].mega, false);
			assert.equal((owner === host ? state : state.partner).blessings, undefined);
			const before = member(owner).team, account = store.get(owner.id), result = outcome();
			// The non-escort seat fainting must not be mistaken for the escort dying.
			for (const mon of owner === host ? result.partnerTeam : result.team) mon.hp = 0;
			settle(result);
			assert.deepEqual(member(owner).team, before); assert.equal(member(owner).team.length, 6);
			assert.equal(member(owner).bag.rarecandy, 1); assert.equal(member(other).bag.rarecandy, 1);
			assert.deepEqual(store.get(owner.id), account);
			assert(!Object.values(session().adventure.members).some(m => m.team.concat(m.box).some(mon => mon.set.species === 'Ralts')));
			const saved = session(); settle(result); assert.deepEqual(session(), saved);
		});
		it(`settles failure when ${seat}'s escorted Ralts faints even if the players win`, () => {
			prepareEscort(seat === 'host' ? host : guest); const before = session().adventure.members, result = outcome();
			escortResult(result).hp = 0; result.allySurvived = true; settle(result);
			for (const user of [host, guest]) {
				assert.equal(member(user).coopEvent.activity.allySurvived, false);
				assert.deepEqual(member(user).bag, before[user.id].bag); assert.equal(member(user).money, before[user.id].money);
				assert(member(user).coopEvent.result.join('').includes('没有完成护送'));
			}
		});
		it(`supports the real native selection and trusted checkpoint with ${seat} escorting`, () => {
			const owner = seat === 'host' ? host : guest;
			prepareEscort(owner, true); const before = session().adventure.members, battle = battleFromState();
			try {
				const partner = owner === host ? guest : host, escort = session().adventure.node.event.coopEscort.pokemon;
				assert.deepEqual(view(owner).battleTeam.map(mon => mon.id), [escort.id]);
				assert.deepEqual(view(partner).partnerBattleTeam.map(mon => mon.id), [escort.id]);
				assert.equal(view(partner).partnerBattleTeam[0].species, 'Ralts');
				assert.deepEqual(view(owner).team.map(mon => mon.id), before[owner.id].team.map(mon => mon.id));
				assert.deepEqual(view(partner).partnerTeam.map(mon => mon.id), before[owner.id].team.map(mon => mon.id));
				assert.equal(battle.turn, 0);
				assert.equal((owner === host ? battle.p1 : battle.p3).pokemon.length, 1);
				for (const side of battle.sides) assert(battle.choose(side.id,
					`team ${side.id === (owner === host ? 'p3' : 'p1') ? '3,1,2' : '1'}`));
				assert.equal(battle.turn, 1); created.rogue.onCheckpoint(captureCoopCheckpoint(battle));
				assert.equal(session().battleSelections[owner.id].length, 1);
				assert.equal(session().battleSelections[owner === host ? guest.id : host.id].length, 3);
				assert.deepEqual(session().adventure.members[owner.id].team, before[owner.id].team);
				for (const side of [battle.p2, battle.p4]) for (const mon of side.pokemon) battle.damage(mon.hp, mon);
				battle.faintMessages(); const result = rogueBattleResult(battle);
				assert(result.won); settle(result);
				assert.deepEqual(member(owner).team, before[owner.id].team); assert.equal(member(owner).bag.rarecandy, 1);
			} finally { battle.destroy(); }
		});
	}
	it('forbids a holder’s personal party from replacing the required escort', () => {
		enter('lostescort'); agree('escort:' + guest.id); const saved = session();
		assert.throws(() => manager.coop.command(guest, { action: 'selectbattle', members: [member(guest).team[0].id] }), /健康队伍/);
		assert.deepEqual(session(), saved);
		change(s => { s.adventure.node.event.coopEscort = undefined; });
		assert.throws(() => manager.coop.command(host, { action: 'preparebattle', visit: 'stale' }), /护送记录/);
	});
	it('resumes a saved native escort battle without putting the temporary NPC into either party', () => {
		prepareEscort(guest, true); const battle = battleFromState(), before = session().adventure.members;
		try {
			for (const side of battle.sides) battle.choose(side.id, 'team 1');
			battle.damage(5, battle.p3.pokemon[0]);
			const checkpoint = captureCoopCheckpoint(battle); created.rogue.onCheckpoint(checkpoint);
			const npcHP = checkpoint.result.partnerTeam[0].hp;
			newManager();
			for (const user of [host, guest]) manager.coop.command(user, { action: 'recoverbattle' });
			assert.equal(created.rogue.resumeCheckpoint.result.partnerTeam[0].hp, npcHP);
			const restored = Battle.fromJSON(created.rogue.resumeCheckpoint.state);
			try {
				assert.equal(restored.p3.pokemon[0].hp, npcHP); assert.equal(restored.p3.pokemon[0].species.name, 'Ralts');
				assert.equal(restored.turn, battle.turn);
			} finally { restored.destroy(); }
			assert.deepEqual(member(guest).team, before[guest.id].team);
		} finally { battle.destroy(); }
	});
	it('preserves escort injury, PP, ID and personal item spending after a live retreat and manager reload', () => {
		prepareEscort(guest); const result = outcome(false), npc = escortResult(result), parties = session().adventure.members;
		npc.hp = 7; npc.pp = [1, 2, 3, 4]; result.partnerBag.pokeball--;
		result.coopExit = 'retreat'; settle(result);
		assert.equal(session().adventure.battleResult.eventResolved, false);
		assert.deepEqual(member(guest).team, parties[guest.id].team); newManager();
		for (const user of [host, guest]) manager.coop.command(user, { action: 'retrybattle' });
		manager.coop.command(host, { action: 'preparebattle', visit: view().battleSelectionKey });
		assert.equal(created.rogue.state.partner.team[0].id, npc.id);
		assert.equal(created.rogue.state.partner.team[0].hp, 7);
		assert.deepEqual(created.rogue.state.partner.team[0].pp, [1, 2, 3, 4]);
		assert.equal(created.rogue.state.partnerBag.pokeball, parties[guest.id].bag.pokeball - 1);
	});
	it('ends a failed escort after retreating with fainted Ralts, rather than trapping the session', () => {
		prepareEscort(); const result = outcome(false);
		escortResult(result).hp = 0; result.coopExit = 'retreat'; settle(result);
		assert.equal(session().adventure.battleResult.eventResolved, true);
		assert.throws(() => manager.coop.command(host, { action: 'retrybattle' }), /不能重试/);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
		assert.equal(session().adventure.phase, 'route-interaction'); assert.equal(member(host).bag.rarecandy, undefined);
	});
	it('loses without rewards even if the escorted Ralts survived', () => {
		prepareEscort(); const before = session().adventure.members; settle(outcome(false));
		for (const user of [host, guest]) {
			assert.equal(member(user).coopEvent.settled, true); assert.deepEqual(member(user).bag, before[user.id].bag);
		}
	});
	it('keeps the once-per-run rare candy replacement personal to each reward recipient', () => {
		change(s => { s.adventure.members[host.id].rareCandyEvents = ['lostescort']; });
		prepareEscort(); settle();
		assert.equal(member(host).bag.rarecandy, undefined); assert.equal(member(host).bag.ether, 1);
		assert.equal(member(guest).bag.rarecandy, 1); assert.equal(member(guest).bag.ether, undefined);
	});
	it('rejects stale holder votes after delegation and permits either player to revoke control', () => {
		enter('lostescort'); choose(host, 'escort:' + host.id);
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.equal(event().ownChoice, null); assert.throws(() => choose(host, 'escort:' + host.id), /操作权/);
		choose(guest, 'escort:' + guest.id); assert.equal(view().escort.owner, guest.id);
		manager.coop.command(host, { action: 'delegate', value: 'revoke' }); assert.equal(session().delegatedTo, undefined);
	});
	it('rolls back both rewards and temporary NPC state on a persistence error', () => {
		prepareEscort(); const saved = session(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec("CREATE TEMP TRIGGER escort_write_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'escort write failed'); END;");
		try { assert.throws(() => settle(), /escort write failed/); } finally { store.db.exec('DROP TRIGGER escort_write_fail'); }
		assert.deepEqual(session(), saved); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		settle(); assert.equal(member(host).bag.rarecandy, 1);
	});
	it('rejects replacement or malformed escort snapshots before changing either party', () => {
		prepareEscort(); const saved = session(), result = outcome(); escortResult(result).set.species = 'Mew';
		assert.throws(() => settle(result), /护送伙伴/); assert.deepEqual(session(), saved);
	});
	it('supports guest-only dojo eligibility and individual teaching without starting an unagreed battle', () => {
		change(s => { s.adventure.members[host.id].team = s.adventure.members[host.id].team.slice(2); });
		enter('evolutiondojo'); agree('lesson'); assert.deepEqual(event().options.map(o => o.id), ['leave']);
		choose(host, 'leave'); choose(guest, 'member:' + member(guest).team[0].id);
		assert(!event(guest).options.some(o => o.id === 'practice'));
		const saved = session(); assert.throws(() => choose(guest, 'practice'), /变化/); assert.deepEqual(session(), saved);
		choose(guest, 'lesson'); assert.equal(member(guest).pendingMoves[0].move, 'ragefist');
		assert.equal(member(host).pendingMoves?.length || 0, 0);
		assert(!member(guest).team[0].evolutionProgress?.moves?.ragefist);
	});
	it('revalidates the selected dojo target and rejects another player’s target or expired token', () => {
		enter('evolutiondojo'); const old = event().key; agree('lesson');
		assert.throws(() => choose(host, 'member:' + member(guest).team[0].id), /变化/);
		choose(host, 'member:' + member(host).team[0].id);
		assert.throws(() => choose(host, 'lesson', undefined, old), /已变化/);
		change(s => { s.adventure.members[host.id].team[0].nuzlockeDead = true; });
		assert(!event().options.some(o => o.id === 'lesson')); assert.throws(() => choose(host, 'lesson'), /变化/);
	});
	for (const flag of ['egg', 'fusion', 'formFusion', 'nuzlockeDead']) it(`does not offer an ineligible ${flag} dojo target`, () => {
		enter('evolutiondojo'); agree('lesson');
		const id = member(host).team[0].id;
		change(s => { s.adventure.members[host.id].team[0][flag] = flag === 'nuzlockeDead' ? true : {}; });
		assert(!event().options.some(o => o.id === 'member:' + id));
	});
	it('generates one dojo opponent team, pays both native prizes and permits retreat then retry', () => {
		enter('evolutiondojo'); agree('practice');
		assert.equal(session().adventure.phase, 'battle-selection');
		assert.equal(session().adventure.node.encounters[0].team.length, 3);
		assert.deepEqual(member(host).coopEvent, member(guest).coopEvent);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		const before = session().adventure.node.encounters, result = outcome(false); result.coopExit = 'retreat'; settle(result);
		assert.equal(session().adventure.battleResult.eventResolved, false);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'retrybattle' });
		assert.deepEqual(session().adventure.node.encounters, before);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		settle(); for (const user of [host, guest]) assert.equal(member(user).bag.ether, 1);
	});
	it('rebuilds delegated personal dojo lessons and rolls back an unsuccessful save', () => {
		enter('evolutiondojo'); agree('lesson');
		manager.coop.command(guest, { action: 'delegate', value: 'partner' }); newManager();
		choose(host, 'member:' + member(guest).team[0].id, guest.id);
		assert(!event().partnerOptions.some(option => option.id === 'practice'));
		const saved = session(), original = store.updateCoopSession;
		store.updateCoopSession = function (...args) { original.apply(this, args); throw new Error('dojo save failed'); };
		try { assert.throws(() => choose(host, 'lesson', guest.id), /dojo save failed/); } finally { store.updateCoopSession = original; }
		assert.deepEqual(session(), saved); choose(host, 'lesson', guest.id); assert.equal(member(guest).pendingMoves[0].move, 'ragefist');
	});
	it('records actual dojo move use in the simulator and saves it only to the original personal battler', () => {
		change(s => { s.adventure.members[host.id].team[0].set.moves = ['Rage Fist']; });
		enter('evolutiondojo'); agree('practice');
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		const battle = battleFromState();
		try {
			for (const side of battle.sides) battle.choose(side.id, 'team 1');
			for (const side of [battle.p2, battle.p4]) side.active[0].moveSlots = [{ move: 'Splash', id: 'splash', pp: 40, maxpp: 40, target: 'self', disabled: false, used: false }];
			battle.makeChoices('move 1 1', 'move 1', 'move 1', 'move 1');
			for (const side of [battle.p2, battle.p4]) for (const mon of side.pokemon) battle.damage(mon.hp, mon);
			battle.faintMessages(); settle(rogueBattleResult(battle));
			assert.equal(member(host).team[0].evolutionProgress.moves.ragefist, 1);
			assert.equal(member(host).team[0].set.species, 'Primeape');
			assert.equal(member(guest).team[0].evolutionProgress?.moves?.ragefist, undefined);
		} finally { battle.destroy(); }
	});
});
