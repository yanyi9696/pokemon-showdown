'use strict';

// A boundary fixture, not a journey/difficulty benchmark: real authored floor-120 opponents,
// deliberately weak human parties, and real native defeats/retreats (never forcewin/results).
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setTimeout: delay } = require('timers/promises');
const { makeUser } = require('../users-utils');
const { AIChallengeManager } = require('../../dist/server/fantasy-ai/manager');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { emergencyCost } = require('../../dist/server/fantasy-rogue/early-balance');
const { COLLAPSE_ENTRIES } = require('../../dist/sim/rogue-collapse-data');
const { activeRogueSpirits } = require('../../dist/sim/fantasy-rogue-spirits');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');

async function until(check, description) {
	const started = Date.now();
	while (!check()) {
		if (Date.now() - started > 20000) throw new Error(`Timed out: ${description}`);
		await delay(5);
	}
}
describe('Fantasy Rogue high-tier native cooperative defeat and retry', function () {
	this.timeout(120000);
	let store, manager, ai, host, guest, content, directory, filename, oldConfig;
	let serial = 0;
	const rooms = [];
	const saved = () => store.coopSessionForUser(host.id);
	const member = user => saved().adventure.members[user.id];
	const view = (user = host) => manager.coop.view(user).session.adventure;
	const command = (user, action, extra = {}) => manager.coop.command(user, { action, ...extra });
	const both = (action, extra = {}) => { command(host, action, extra); command(guest, action, extra); };
	const rebuild = () => { manager = new RogueManager(new RogueEngine(store, content), () => ai); };
	before(() => { content = createPreviewContent({ doubleBattle: true }); content.blessings = false; });
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-native-retry-'));
		filename = path.join(directory, 'isolated.db'); store = new RogueStore(filename);
		ai = new AIChallengeManager([], { enabled: true, decisionMs: 150, maxBattles: 1 }, 6);
		rebuild();
		host = makeUser(`Retry Host ${++serial}`, `127.6.7.${serial}`);
		guest = makeUser(`Retry Guest ${serial}`, `127.6.8.${serial}`);
		for (const user of [host, guest]) store.change(user.id, account => {
			account.slots = 2;
			account.difficulties = { highest: 5, cleared: ['0', '1', '2', '3', '4', '5'], spirits: ['0'] };
			account.spiritClearTiers = Object.fromEntries(activeRogueSpirits().map(spirit => [spirit.id, 5]));
		});
	});
	afterEach(async () => {
		await ai?.dispose();
		for (const room of rooms.splice(0)) Rooms.get(room.roomid)?.destroy();
		for (const user of [host, guest]) { user?.disconnectAll(); user?.destroy(); }
		store?.close();
		if (directory) {
			assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
			assert(path.basename(directory).startsWith('rogue-native-retry-'));
			fs.rmSync(directory, { recursive: true, force: true });
		}
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	function initialize(tier, spirit) {
		command(host, 'invite', { target: guest.id, difficulty: tier });
		command(guest, 'accept', { id: store.coopInvitations(guest.id)[0].id });
		both('spirit', { value: spirit || 'none', confirmed: true, visit: saved().spiritChoice.key });
		both('selectstarters', { starters: ['bulbasaur', 'charmander'] });
		if (tier) both('collapse', { collapse: COLLAPSE_ENTRIES.slice(0, tier * 2).map(entry => entry.id),
			confirmed: true, visit: saved().adventure.collapseChoice.key });
		assert.equal(saved().adventure.phase, 'area-selection');
		// Initialize this one boundary. All recovery, spending and retry operations below are public commands.
		const session = saved(), revision = session.revision;
		session.adventure.floor = 120;
		session.adventure.routeChoices = structuredClone(content.floors[120]);
		for (const user of [host, guest]) {
			const own = session.adventure.members[user.id];
			own.money = user === host ? 300 : 10000;
			own.bag = user === host ? { maxrevive: 1, potion: 2 } : { potion: 3 };
			own.team = own.team.map(mon => createRoguePokemon({ ...mon.set, moves: ['Splash'], level: 5 }, own.boosts, mon.id));
		}
		session.revision++; store.updateCoopSession(session, revision);
		both('selectarea', { value: content.floors[120][0].id });
		assert.equal(view().phase, 'battle-selection');
	}
	async function startBattle() {
		command(host, 'preparebattle', { visit: view().battleSelectionKey });
		const room = Rooms.get(saved().roomid); rooms.push(room);
		await until(() => room.battle.p1.request.request && room.battle.p3.request.request, 'human native preview');
		assert.equal(room.battle.gameType, 'multi');
		for (const [user, seat] of [[host, room.battle.p1], [guest, room.battle.p3]]) {
			const healthy = member(user).team.map((mon, index) => mon.hp > 0 ? index + 1 : 0).filter(Boolean);
			room.battle.choose(user, `team ${healthy.join('')}|${seat.request.rqid}`);
		}
		await until(() => room.battle.stream.battle.turn > 0 &&
			saved().adventure.battleCheckpoint?.sequence === room.battle.stream.battle.fantasyRogue.checkpointSequence,
		'first turn checkpoint');
		return room;
	}
	async function restore(room) {
		const checkpoint = structuredClone(saved().adventure.battleCheckpoint);
		room.destroy(); await delay(0); store.close();
		store = new RogueStore(filename); rebuild();
		assert(view().phase === 'battle');
		assert(manager.coop.view(host).session.battleRecovery.available);
		command(host, 'recoverbattle'); assert.equal(saved().roomid, undefined);
		command(guest, 'recoverbattle');
		const resumed = Rooms.get(saved().roomid); rooms.push(resumed);
		await until(() => resumed.battle.p1.request.request && resumed.battle.p3.request.request &&
			saved().adventure.battleCheckpoint?.sequence === resumed.battle.stream.battle.fantasyRogue.checkpointSequence,
		'restored battle and checkpoint');
		assert.deepEqual(saved().adventure.battleCheckpoint.result.team, checkpoint.result.team);
		assert.deepEqual(saved().adventure.battleCheckpoint.result.partnerTeam, checkpoint.result.partnerTeam);
		return resumed;
	}
	function attackQueue(native) {
		return (native.fantasyRogue.futureAttacks || []).map(attack => ({
			turn: attack.turn, source: attack.source.fullname, slots: [...attack.slots],
			move: { id: attack.move.id, type: attack.move.type, category: attack.move.category,
				basePower: attack.move.basePower, accuracy: attack.move.accuracy },
		}));
	}
	async function queueDelayedAttack(room) {
		const native = room.battle.stream.battle;
		for (let attempt = 0; attempt < 3 && !native.fantasyRogue.futureAttacks?.length; attempt++) {
			const turn = native.turn;
			for (const [user, seat] of [[host, room.battle.p1], [guest, room.battle.p3]]) {
				await until(() => seat.request.request && !seat.request.isWait, 'human move request');
				room.battle.choose(user, `move 1|${seat.request.rqid}`);
			}
			await until(() => native.turn > turn && saved().adventure.battleCheckpoint?.sequence ===
			native.fantasyRogue.checkpointSequence, 'attack queue checkpoint');
		}
		assert(native.fantasyRogue.futureAttacks.length, 'authored NPC schedules a damaging attack');
		return attackQueue(native);
	}
	async function loseNormally(room) {
		const submitted = new Map(), started = Date.now();
		while (saved().adventure.phase === 'battle') {
			assert(Date.now() - started < 60000, 'authored NPC must finish the weak-party battle within 60 seconds');
			for (const [user, seat] of [[host, room.battle.p1], [guest, room.battle.p3]]) {
				if (!seat.request.request || seat.request.isWait || seat.request.choice || submitted.get(user.id) === seat.request.rqid) continue;
				const request = JSON.parse(seat.request.request);
				if (request.wait) continue;
				room.battle.choose(user, `${request.forceSwitch ? 'default' : 'move 1'}|${seat.request.rqid}`);
				submitted.set(user.id, seat.request.rqid);
			}
			await delay(5);
		}
		assert(room.battle.stream.battle.ended);
		assert.equal(saved().adventure.phase, 'settlement');
		assert.equal(saved().adventure.battleResult.won, false);
		assert(!room.battle.stream.battle.log.some(line => /^\|(?:error|bigerror)\|/.test(line)));
	}
	for (const [tier, spirit] of [[0, undefined], [3, 'palkia'], [5, 'dialga']]) {
		it(`preserves tier ${tier} / ${spirit || 'no spirit'} through real defeat, owner healing and retry`, async () => {
			initialize(tier, spirit);
			const node = structuredClone(saved().adventure.node), accounts = [store.get(host.id), store.get(guest.id)];
			let room = await startBattle();
			const encounter = structuredClone(room.battle.options.fantasyRogue.state);
			assert.equal(encounter.difficulty.tier, tier);
			assert.equal(encounter.collapse.length, tier * 2);
			assert.equal(encounter.spirit?.id, spirit);
			assert.equal(room.battle.stream.battle.p2.pokemon.length + room.battle.stream.battle.p4.pokemon.length, 6);
			if (spirit === 'palkia') assert(room.battle.stream.battle.field.pseudoWeather.trickroom);
			const enemies = [room.battle.stream.battle.p2, room.battle.stream.battle.p4]
				.flatMap(side => side.pokemon.map(mon => ({ species: mon.species.name, level: mon.level })));
			const queued = spirit === 'dialga' ? await queueDelayedAttack(room) : undefined;
			room = await restore(room);
			assert.equal(room.battle.stream.battle.fantasyRogue.spirit?.id, spirit);
			if (spirit === 'palkia') assert(room.battle.stream.battle.field.pseudoWeather.trickroom);
			if (queued) assert.deepEqual(attackQueue(room.battle.stream.battle), queued);
			await loseNormally(room);
			const realDefeat = structuredClone(rogueBattleResult(room.battle.stream.battle, false));
			assert.equal(saved().adventure.floor, 120); assert.deepEqual(saved().adventure.node, node);
			assert(member(host).team.every(mon => mon.hp === 0)); assert(member(guest).team.every(mon => mon.hp === 0));
			assert.equal(member(host).money, 300); assert.equal(member(guest).money, 10000);
			// Real defeat now offers each eligible owner the jointly answered assistance first.
			while (view().comeback) {
				const offer = view().comeback;
				both('comeback', { visit: offer.visit, value: offer.choosing ? 'no' : offer.answer ? 'continue' : 'next' });
			}
			assert.throws(() => command(host, 'retrybattle'), /没有可出战/);
			assert.equal(view().recovery.emergency, false);
			assert.equal(view(guest).recovery.emergency, true);
			const recovery = { id: randomUUID() };
			command(guest, 'emergency', recovery); command(guest, 'emergency', recovery);
			assert.equal(member(guest).money, 10000 - emergencyCost(120));
			assert.equal(member(host).money, 300); assert(member(host).team.every(mon => mon.hp === 0));
			const revive = { id: randomUUID(), value: 'maxrevive', member: member(host).team[0].id };
			command(host, 'useitem', revive); command(host, 'useitem', revive);
			assert.equal(member(host).bag.maxrevive, 0); assert.equal(member(host).team[0].hp, member(host).team[0].maxhp);
			assert.equal(member(host).team[1].hp, 0); assert.equal(member(guest).bag.potion, 3);
			command(host, 'retrybattle'); assert.equal(view().phase, 'settlement');
			command(guest, 'retrybattle'); assert.equal(view().phase, 'battle-selection');
			const previous = room; room = await startBattle();
			assert.notEqual(room.roomid, previous.roomid);
			assert.deepEqual(saved().adventure.node, node, 'retry keeps the exact opponent/reward roll');
			assert.deepEqual(room.battle.options.fantasyRogue.state.collapse, encounter.collapse);
			assert.equal(room.battle.options.fantasyRogue.state.spirit?.id, spirit);
			const beforeRetreat = structuredClone(saved().adventure);
			command(host, 'proposeexit', { value: 'retreat' });
			command(guest, 'respondexit', { id: saved().exitProposal.id, value: 'accept' });
			await until(() => view().phase === 'settlement', 'retry retreat');
			assert(saved().adventure.battleResult.retreated); assert.equal(saved().adventure.battleResult.won, false);
			for (const user of [host, guest]) {
				assert.equal(member(user).money, beforeRetreat.members[user.id].money);
				assert.deepEqual(member(user).bag, beforeRetreat.members[user.id].bag);
				assert.equal(store.get(user.id).points, accounts[user === host ? 0 : 1].points);
				assert.equal(store.history(user.id).total, 0);
			}
			const final = structuredClone(saved());
			previous.battle.options.fantasyRogue.onResult(realDefeat);
			assert.deepEqual(saved(), final, 'late result from the previous room cannot award or replace the retry');
			console.log('COOP_NATIVE_RETRY', JSON.stringify({ tier, spirit, floor: 120,
				trainer: node.encounters[0].name, enemies, turns: previous.battle.stream.battle.turn,
				collapse: encounter.collapse, recovered: true, loss: true, retried: true, retreated: true }));
		});
	}
});
