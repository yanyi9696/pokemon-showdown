'use strict';

const assert = require('assert').strict;
const path = require('path');
const engineRoot = process.env.FANTASY_PLAYTEST_ENGINE_ROOT || path.resolve(__dirname, '../../dist');
const load = id => require(path.join(engineRoot, id));
const { Battle, extractChannelMessages } = load('sim/battle');
const { Format } = load('sim/dex-formats');
const { PlaytestCoopNPC, PlaytestNPC } = require('../../tools/fantasy-rogue-playtest-npc');
const mon = (species, moves) => ({ species, moves, level: 50, ability: '', nature: 'Serious' });

describe('Fantasy Rogue offline campaign production NPC adapter', function () {
	this.timeout(20000);
	let battle, npc, requests, diagnostics;
	beforeEach(() => { npc = undefined; });
	afterEach(async () => { if (npc) await npc.finish(); battle?.destroy(); });
	function create(enemy = ['Dragon Claw', 'Protect'], wild = false) {
		requests = {}; diagnostics = [];
		battle = new Battle({
			format: new Format({ name: 'Offline adapter', mod: 'gen9fantasy', gameType: 'multi', ruleset: [] }),
			seed: [2026, 11, 12, 168], strictChoices: true,
			send(type, packet) {
				if (type === 'sideupdate' && packet.slice(3).startsWith('|request|')) {
					requests[packet.slice(0, 2)] = JSON.parse(packet.slice(12));
				}
			},
			p1: { team: [mon('Blissey', ['Splash'])] },
			p2: { team: [mon('Dugtrio', enemy)] },
			p3: { team: [mon('Blissey', ['Splash'])] },
			p4: { team: [mon('Dugtrio', enemy)] },
		});
		npc = new PlaytestCoopNPC(load, {
			roomId: 'offline-native-test', format: 'gen9fantasyroguecoop', state: {}, wild,
			trainer: { id: 'offline-test', format: 'gen9fantasy', packedTeam: '', keyMembers: [], resourcePreferences: [] },
			onDecision: decision => diagnostics.push(decision),
		});
	}
	async function choose() {
		npc.update(extractChannelMessages(battle.log.join('\n'), [0])[0].join('\n'));
		for (const seat of ['p2', 'p3', 'p4']) npc.request(seat, requests[seat]);
		return npc.flush();
	}
	it('uses a real joint worker and returns one valid command per NPC without reading player requests', async () => {
		create();
		const before = JSON.stringify(requests);
		const commands = await choose();
		assert.equal(JSON.stringify(requests), before);
		assert.deepEqual(commands.map(entry => entry.side), ['p2', 'p3', 'p4']);
		assert.equal(diagnostics[0].workerStatus, 'completed');
		assert.equal(diagnostics[0].nativeTurns, true);
		assert.throws(() => npc.request('p1', requests.p1), /Only NPC/);
		for (const { side, choice } of commands) assert(battle.choose(side, choice));
		assert(battle.choose('p1', 'move 1'));
		assert.equal(battle.turn, 2);
		assert.deepEqual(await npc.flush(), []);
	});
	for (const wild of [false, true]) {
		it(`sends locked Dig with no forbidden target in the ${wild ? 'wild' : 'trainer'} worker path`, async () => {
			create(['Dig'], wild);
			battle.makeChoices('move 1', 'move 1 1', 'move 1', 'move 1 2');
			assert(battle.p2.active[0].volatiles.twoturnmove);
			const commands = await choose();
			for (const side of ['p2', 'p4']) {
				const choice = commands.find(entry => entry.side === side).choice;
				assert.equal(choice, 'move 1');
			}
			for (const { side, choice } of commands) assert(battle.choose(side, choice));
			assert(battle.choose('p1', 'move 1'));
			assert.equal(battle.turn, 3);
			assert(!battle.log.some(line => line.includes('[Invalid choice]')));
		});
	}
	it('retries only the rejected seat through the real controller and retains partner decisions', async () => {
		create(['Earthquake', 'Protect']);
		const first = await choose();
		const original = first.find(entry => entry.side === 'p2').choice;
		const partner = npc.room.p4.request.choice;
		npc.invalidChoice('p2');
		const retry = await npc.flush();
		assert.deepEqual(retry.map(entry => entry.side), ['p2']);
		assert.notEqual(retry[0].choice, original);
		assert.equal(npc.room.p4.request.choice, partner);
		assert.equal(npc.scheduler.metrics.completed, 2);
	});
});

describe('Fantasy Rogue solo doubles campaign production NPC adapter', function () {
	this.timeout(20000);
	let battle, npc, requests, diagnostics;
	afterEach(async () => { if (npc) await npc.finish(); battle?.destroy(); });
	function create(moves = ['Dragon Claw', 'Protect'], wild = false, playerMoves = ['Splash'], enemySize = 3) {
		requests = {}; diagnostics = [];
		battle = new Battle({
			format: new Format({ name: 'Offline doubles adapter', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
			seed: [2026, 11, 13, 198], strictChoices: true,
			send(type, packet) {
				if (type === 'sideupdate' && packet.slice(3).startsWith('|request|')) {
					requests[packet.slice(0, 2)] = JSON.parse(packet.slice(12));
				}
			},
			p1: { team: [mon('Blissey', playerMoves), mon('Blissey', playerMoves)] },
			p2: { team: [mon('Dugtrio', moves), mon('Dugtrio', moves), mon('Pikachu', ['Thunderbolt'])].slice(0, enemySize) },
		});
		npc = new PlaytestNPC(load, {
			roomId: 'offline-native-doubles-test', format: 'gen9fantasyroguedoubles', state: { team: [{}, {}] }, wild,
			trainer: { id: 'offline-test', format: 'gen9fantasyroguedoubles', packedTeam: '', keyMembers: [], resourcePreferences: [] },
			onDecision: decision => diagnostics.push(decision),
		});
	}
	async function choose() {
		npc.update(extractChannelMessages(battle.log.join('\n'), [0])[0].join('\n'));
		npc.request('p2', requests.p2);
		return npc.flush();
	}
	it('uses the real two-seat controller and worker without private player state', async () => {
		create();
		const before = JSON.stringify(requests), commands = await choose();
		assert.equal(JSON.stringify(requests), before);
		assert.equal(commands.length, 1); assert.equal(commands[0].side, 'p2');
		assert.equal(commands[0].choice.split(',').length, 2);
		assert.equal(npc.scheduler.metrics.completed, 1);
		assert.equal(diagnostics[0].controllerMetrics.workerErrors, 0);
		assert.equal(diagnostics[0].controllerMetrics.jointTurnDecisions, 1);
		assert.throws(() => npc.request('p1', requests.p1), /Only NPC/);
		assert.throws(() => npc.room.p1.request, /private request/);
		assert.throws(() => npc.room.stream.battle, /simulator state/);
		assert(battle.choose('p2', commands[0].choice));
		assert(battle.choose('p1', 'move 1, move 1'));
		assert.equal(battle.turn, 2); assert.deepEqual(await npc.flush(), []);
	});
	for (const wild of [false, true]) it(`preserves forced Dig targets for ${wild ? 'wild' : 'trainer'} doubles`, async () => {
		create(['Dig'], wild);
		battle.makeChoices('move 1, move 1', 'move 1 1, move 1 2');
		assert(battle.p2.active.every(pokemon => pokemon.volatiles.twoturnmove));
		const [command] = await choose();
		assert.equal(command.choice, 'move 1, move 1');
		assert(battle.choose('p2', command.choice)); assert(battle.choose('p1', 'move 1, move 1'));
		assert.equal(battle.turn, 3);
	});
	it('reissues only a rejected NPC request and excludes the rejected joint command', async () => {
		create();
		const [first] = await choose(), before = npc.room.p2.request.rqid;
		npc.invalidChoice('p2');
		assert(npc.room.p2.request.rqid > before);
		const [retry] = await npc.flush();
		assert.notEqual(retry.choice, first.choice);
		assert(battle.choose('p2', retry.choice)); assert(battle.choose('p1', 'move 1, move 1'));
		assert.equal(npc.controller.metrics.illegalChoices, 1);
	});
	it('keeps a live partner in place when replacing one fainted member', async () => {
		create(['Splash'], false, ['Seismic Toss']);
		for (let turn = 0; turn < 3 && !requests.p2.forceSwitch; turn++) {
			battle.makeChoices('move 1 1, move 1 1', 'move 1, move 1');
		}
		assert.deepEqual(requests.p2.forceSwitch, [true, false]);
		const [command] = await choose();
		assert.equal(command.choice, 'switch 3, pass');
		assert(battle.choose('p2', command.choice));
	});
	for (const wild of [false, true]) it(`evaluates a one-member ${wild ? 'wild' : 'trainer'} team through its wire null slot`, async () => {
		create(['Dragon Claw', 'Protect'], wild, ['Splash'], 1);
		assert.equal(requests.p2.active[1], null);
		const before = JSON.stringify(requests.p2), [command] = await choose();
		assert.equal(JSON.stringify(requests.p2), before);
		assert.equal(npc.controller.metrics.workerErrors, 0);
		assert.equal(npc.controller.metrics.searchFallbacks, 0);
		assert.equal(npc.scheduler.metrics.completed, 1);
		assert.match(command.choice, /, pass$/);
		assert(battle.choose('p2', command.choice)); assert(battle.choose('p1', 'move 1, move 1'));
		assert.equal(battle.turn, 2);
	});
});
