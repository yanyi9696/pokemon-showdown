'use strict';

const assert = require('assert').strict;
const { setTimeout: delay } = require('timers/promises');
const { makeUser, makeConnection } = require('../users-utils');
const { Teams } = require('../../dist/sim/teams');
const { AIChallengeManager } = require('../../dist/server/fantasy-ai/manager');
const { TrainerRegistry } = require('../../dist/server/fantasy-ai/trainers');
const { enumerateRequestChoices } = require('../../dist/server/fantasy-ai/actions');
const { RoomBattleStream } = require('../../dist/server/room-battle');
const examples = require('../fixtures/fantasy-ai-trainers.json');
const trainer = new TrainerRegistry(examples, { enabled: true, allowDevelopmentTrainers: true }).get(examples[0].id);

async function until(check, description = 'condition', timeout = 8000) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${description}`);
		await delay(5);
	}
}

describe('Fantasy AI online challenges', function () {
	this.timeout(20000);
	let manager;
	const users = [];
	const rooms = [];
	let nextUser = 0;
	function human() {
		const user = makeUser(`AI tester ${++nextUser}`, `127.0.1.${nextUser}`);
		user.battleSettings.team = trainer.packedTeam;
		users.push(user);
		return user;
	}
	function setup(settings = {}, definitions = examples) {
		manager = new AIChallengeManager(definitions, { enabled: true, allowDevelopmentTrainers: true, decisionMs: 0, ...settings }, 6);
		return manager;
	}
	async function challenge(user, difficulty = 'normal') {
		const room = await manager.challenge(user.connections[0], trainer.id, difficulty);
		assert(room, 'room created');
		rooms.push(room);
		await until(() => room.battle.p2.request.isWait === true, 'AI team preview choice');
		return room;
	}
	afterEach(async () => {
		const current = manager;
		manager = null;
		if (current) await current.dispose();
		for (const room of rooms.splice(0)) if (Rooms.get(room.roomid)) room.destroy();
		for (const user of users.splice(0)) { user.disconnectAll(); user.destroy(); }
	});

	it('keeps production and development trainers closed unless explicitly configured', () => {
		setup({ enabled: false });
		assert.deepEqual(manager.list(), []);
		assert.deepEqual(new AIChallengeManager(examples, { enabled: true }).list(), []);
		assert.deepEqual(new AIChallengeManager([], { enabled: true }).list(), []);
		assert.throws(() => new AIChallengeManager([], { maxBattles: 0 }), /配置|limits/);
		assert.equal(manager.settings.disconnectMs, 600000);
	});

	it('correlates client creation results and never creates another room for a repeated request', async () => {
		setup();
		const player = human();
		const connection = player.connections[0];
		const first = manager.challengeForClient(connection, trainer.id, 'hard', 'request-1234');
		assert.equal(manager.getPublicState(player, 'request-1234').challenge.status, 'pending');
		const duplicate = await manager.challengeForClient(connection, trainer.id, 'normal', 'request-1234');
		assert.equal(duplicate.status, 'pending');
		const result = await first;
		assert.equal(result.status, 'success');
		const room = Rooms.get(result.roomid);
		rooms.push(room);
		assert.equal(room.battle.fantasyAI.options.difficulty, 'hard');
		assert.deepEqual(await manager.challengeForClient(connection, trainer.id, 'normal', 'request-1234'), result);
		assert.equal(manager.getStatus().active, 1);
		assert.deepEqual(manager.getPublicState(player, 'request-1234').activeBattles, [result.roomid]);
		const other = human();
		assert.equal(manager.getPublicState(other, 'request-1234').challenge.status, 'unknown');
		assert.deepEqual(manager.getPublicState(other).activeBattles, []);
	});

	for (const definition of require('../../config/fantasy-ai-trainers.example.json')) {
		it(`creates a real ${definition.format} room using the explicitly selected AI team`, async () => {
			setup({}, [definition]);
			const player = human();
			player.battleSettings.team = Teams.pack(Teams.import(definition.team));
			const result = await manager.challengeForClient(player.connections[0], definition.id, 'normal', 'format-12345', definition.format);
			assert.equal(result.status, 'success', result.message);
			const room = Rooms.get(result.roomid);
			rooms.push(room);
			assert.equal(room.battle.format, definition.format);
			assert.equal(room.battle.fantasyAI.options.trainer.format, definition.format);
			// The validator fills unspecified gender/tera defaults and canonicalizes names.
			const configured = team => team.map(set => ({
				species: toID(set.species), item: toID(set.item), ability: toID(set.ability),
				moves: set.moves.map(toID), nature: set.nature, evs: set.evs,
			}));
			assert.deepEqual(configured(Teams.unpack(room.battle.fantasyAI.options.trainer.packedTeam)),
				configured(Teams.import(definition.team)));
			assert.equal(manager.getPublicState(player).protocolVersion, 2);
			assert.equal(manager.getPublicState(player).formats.length, 3);
			await until(() => room.battle.p2.request.isWait === true, 'selected-format preview request');
			room.battle.choose(player, 'team 123456');
			await until(() => room.battle.turn === 1, 'selected-format team preview');
			room.battle.choose(player, 'move 1');
			await until(() => room.battle.turn === 2, 'selected-format first turn');
		});
	}

	it('rejects forged format/trainer pairs and checks player legality under the selected format', async () => {
		const definitions = require('../../config/fantasy-ai-trainers.example.json');
		setup({}, definitions);
		const player = human();
		const connection = player.connections[0];
		const mismatch = await manager.challengeForClient(connection, definitions[0].id, 'normal', 'mismatch-123', 'gen9fcuu');
		assert.equal(mismatch.status, 'error');
		assert(/不支持该赛制/.test(mismatch.message));
		const unsupported = await manager.challengeForClient(connection, definitions[0].id, 'normal', 'unknown-1234', 'gen9fcag');
		assert.equal(unsupported.status, 'error');
		const illegal = await manager.challengeForClient(connection, definitions[2].id, 'normal', 'illegal-1234', 'gen9fcuu');
		assert.equal(illegal.status, 'error');
		assert(/banned/.test(illegal.message));
		assert.equal(manager.getStatus().active, 0);
	});

	it('returns actual validation errors in structured client responses and releases reservations', async () => {
		setup();
		const player = human();
		player.battleSettings.team = trainer.packedTeam.replace(/psychic/i, 'notarealmove');
		const result = await manager.challengeForClient(player.connections[0], trainer.id, 'normal', 'invalid-1234');
		assert.equal(result.status, 'error');
		assert(/notarealmove|not a real move|does not exist/i.test(result.message));
		assert.equal(manager.getStatus().active, 0);
		assert.equal(manager.getPublicState(player, 'invalid-1234').challenge.message, result.message);
		player.battleSettings.team = trainer.packedTeam;
		const retry = await manager.challengeForClient(player.connections[0], trainer.id, 'normal', 'valid-123456');
		assert.equal(retry.status, 'success');
		rooms.push(Rooms.get(retry.roomid));
	});

	it('reports disabled, missing trainer, capacity and identity failures to the client', async () => {
		setup();
		const player = human();
		const connection = player.connections[0];
		const missing = await manager.challengeForClient(connection, 'missing', 'normal', 'missing-1234');
		assert(/训练家/.test(missing.message));
		await challenge(player);
		const full = await manager.challengeForClient(connection, trainer.id, 'normal', 'occupied-1234');
		assert(/已有/.test(full.message));
		const invalid = await manager.challengeForClient(connection, trainer.id, 'normal', '../');
		assert.equal(invalid.status, 'error');
		await manager.dispose();
		const closed = await manager.challengeForClient(connection, trainer.id, 'normal', 'closed-1234');
		assert(/未开放/.test(closed.message));
	});

	it('sends only public challenge metadata to the participant on reconnect', async () => {
		setup();
		const player = human();
		const room = await challenge(player, 'hard');
		const connection = player.connections[0];
		const messages = [];
		const sendTo = connection.sendTo;
		connection.sendTo = (roomid, message) => messages.push([roomid, message]);
		try { room.battle.onConnect(player, connection); } finally { connection.sendTo = sendTo; }
		const metadata = messages.find(entry => entry[1].startsWith('|fantasyai|'));
		assert(metadata);
		assert.deepEqual(JSON.parse(metadata[1].slice(11)), {
			trainerId: trainer.id, format: trainer.format, difficulty: 'hard', userid: player.id, disconnectMs: 600000,
		});
		assert(!room.getLog(0).includes('|fantasyai|'));
	});

	for (const difficulty of ['normal', 'hard']) {
		it(`${difficulty}: starts an unrated real room with an occupied AI seat and private information boundary`, async () => {
			setup();
			const calls = [];
			const submit = manager.scheduler.submit.bind(manager.scheduler);
			manager.scheduler.submit = input => { calls.push(structuredClone(input)); return submit(input); };
			const player = human();
			const room = await challenge(player, difficulty);
			const battle = room.battle;
			assert(battle.started);
			assert.equal(battle.rated, 0);
			assert.equal(room.rated, 0);
			assert.equal(battle.playerCount, 2);
			assert(battle.p2.isAI && battle.p2.active && battle.p2.knownActive);
			assert.equal(battle.p2.getUser(), null);
			assert.equal(Users.getExact(toID(battle.p2.name)), null);
			assert.equal(Object.keys(battle.playerTable).length, 1);
			assert(player.games.has(room.roomid));
			battle.choose(player, `team 123456|${battle.p1.request.rqid}`);
			await until(() => battle.turn === 1, 'first turn');
			const rqid = battle.p2.request.rqid;
			if (difficulty === 'hard') {
				assert.equal(calls.filter(input => input.observation.request.active).length, 0);
				battle.choose(player, 'move 1');
			}
			await until(() => calls.some(input => input.observation.request.active), 'first move decision');
			const input = calls.find(input => input.observation.request.active);
			assert(input.observation.publicLog.includes('|turn|1'), 'decision sees current public turn before dispatch');
			assert.equal(input.observation.publicLog.filter(line => line.startsWith('|poke|p1|')).length, 6);
			assert.equal(input.observation.publicLog.filter(line => line.startsWith('|poke|p2|')).length, 6);
			assert.equal(input.observation.request.side.id, 'p2');
			assert.equal(input.key.rqid, rqid);
			assert.equal(input.observation.opponentMoves.length, 6);
			assert(input.observation.opponentMoves.every(mon => Object.keys(mon).sort().join(',') === 'moves,species'));
			if (difficulty === 'hard') {
				assert.equal(input.observation.initialOpponent.length, 6);
				assert(input.observation.initialOpponent.every(mon => !('hp' in mon) && !('position' in mon) && !('name' in mon)));
				assert(input.observation.opponentMove.baseMove);
			} else {
				assert(!('initialOpponent' in input.observation));
				assert(!('opponentMove' in input.observation));
			}
			const log = room.getLog(0);
			assert(!log.includes('|request|') && !log.includes('fantasyai\n') && !log.includes('initialOpponent'));
			assert(!log.includes('"stats"') && !log.includes('/404'));
			assert.equal(battle.timer.start(player), false);
			assert.equal(battle.timer.timer, null);
			room.pokeExpireTimer();
			assert.equal(room.expireTimer, null, 'connected players can think without an inactivity deadline');
			battle.forfeit(player);
			await until(() => battle.ended, 'forfeit');
			assert.equal(manager.getStatus().active, 0);
			assert.equal(manager.getStatus().completed[0].endReason, 'forfeit');
		});
	}

	it('runs hard-mode search in the actual worker after the human submits', async () => {
		setup({ decisionMs: 5000 });
		const player = human();
		const room = await challenge(player, 'hard');
		room.battle.choose(player, 'team 123456');
		await until(() => room.battle.turn === 1, 'first turn');
		room.battle.choose(player, `move 1|${room.battle.p1.request.rqid}`);
		await until(() => room.battle.turn === 2, 'worker response and full turn');
		assert(manager.scheduler.metrics.completed >= 2);
		assert.equal(room.battle.fantasyAI.metrics.illegalChoices, 0);
		assert.equal(room.battle.fantasyAI.metrics.workerErrors, 0);
		assert(room.battle.fantasyAI.metrics.rollouts > 0);
	});

	it('waits for a legal human move, cancels on undo/change, and discards stale worker results', async () => {
		setup({ decisionMs: 1000 });
		const decisions = [];
		manager.scheduler.submit = input => {
			if (!input.observation.request.active) {
				return Promise.resolve({ key: input.key, status: 'completed', decision: { choice: 'team 123456' } });
			}
			return new Promise(resolve => { decisions.push({ input, resolve }); });
		};
		const player = human();
		const room = await challenge(player, 'hard');
		const battle = room.battle;
		battle.choose(player, 'team 123456');
		await until(() => battle.turn === 1, 'first turn');
		await delay(30);
		assert.equal(decisions.length, 0);
		battle.choose(player, 'move 999');
		await until(() => battle.p1.request.isWait === false, 'invalid human move rejected');
		assert.equal(decisions.length, 0);
		const request = JSON.parse(battle.p1.request.request);
		battle.choose(player, 'move 1');
		await until(() => decisions.length === 1, 'first accepted human move');
		assert.equal(decisions[0].input.observation.opponentMove.baseMove, request.active[0].moves[0].id);
		assert(decisions[0].input.budgetMs > 980, 'waiting for the human must not consume the AI budget');
		battle.undo(player, '');
		await delay(20);
		battle.choose(player, 'move 2');
		await until(() => decisions.length === 2, 'changed human move');
		assert.equal(decisions[1].input.observation.opponentMove.baseMove, request.active[0].moves[1].id);
		assert(decisions[1].input.budgetMs < decisions[0].input.budgetMs, 'retries share the original thinking window');
		decisions[0].resolve({ key: decisions[0].input.key, status: 'completed', decision: { choice: 'move 1' } });
		await delay(20);
		assert.equal(battle.turn, 1);
		assert.equal(battle.p2.request.isWait, false);
		decisions[1].resolve({ key: decisions[1].input.key, status: 'completed', decision: { choice: 'move 1' } });
		await until(() => battle.turn === 2, 'current worker result');
		assert.equal(decisions.length, 2, 'new turn must wait for another human choice');
		assert(!room.getLog(0).includes('opponentMove'));
		assert(!room.getLog(0).includes('fantasyaichoice'));
	});

	it('checks the human selection version again inside the simulator before accepting an AI answer', async () => {
		const stream = new RoomBattleStream();
		async function exchange(input) {
			await stream.write(input);
			let state;
			for (;;) {
				const packet = await stream.read();
				if (packet.startsWith('fantasyaiready')) return state;
				if (packet.startsWith('fantasyaichoice\n')) state = JSON.parse(packet.split('\n')[1]);
			}
		}
		try {
			await exchange(`>start ${JSON.stringify({ formatid: trainer.format })}\n>fantasyai hard\n` +
				`>player p1 ${JSON.stringify({ name: 'Human', team: trainer.packedTeam })}\n` +
				`>player p2 ${JSON.stringify({ name: 'AI', team: trainer.packedTeam })}`);
			assert.equal((await exchange('>p1 team 123456\n>p2 team 123456')).ready, false);
			const old = await exchange('>p1 move 1');
			assert(old.ready && old.move.baseMove);
			assert.equal((await exchange('>p1 undo')).ready, false);
			const current = await exchange('>p1 move 2');
			assert(current.version > old.version);
			await exchange(`>fantasyaichoose ${JSON.stringify({ version: old.version, choice: 'move 1' })}`);
			assert.equal(stream.battle.turn, 1);
			assert.equal(stream.battle.p2.isChoiceDone(), false);
			await exchange(`>fantasyaichoose ${JSON.stringify({ version: current.version, choice: 'move 1' })}`);
			assert.equal(stream.battle.turn, 2);
			assert(!stream.battle.inputLog.some(line => line.includes('fantasyaichoose')));
		} finally {
			await stream.destroy();
		}
	});

	it('retries a native invalid action with a fresh request identity and excludes the rejected candidate', async () => {
		setup();
		const inputs = [];
		let invalid = false;
		manager.scheduler.submit = async input => {
			inputs.push(input);
			let choice = enumerateRequestChoices(input.observation.request)[0];
			if (input.observation.request.active && !invalid) { choice = 'move 999'; invalid = true; }
			return { key: input.key, status: 'completed', decision: { choice } };
		};
		const player = human();
		const room = await challenge(player);
		room.battle.choose(player, 'team 123456');
		await until(() => room.battle.fantasyAI.metrics.illegalChoices === 1 && room.battle.p2.request.isWait === true);
		const retry = inputs[inputs.length - 1];
		assert(retry.excluded.includes('move 999'));
		assert(retry.key.rqid > inputs[inputs.length - 2].key.rqid);
		room.battle.choose(player, 'move 1');
		await until(() => room.battle.turn === 2);
	});

	it('handles native Unavailable choice updates without consulting hidden trapping state beforehand', async () => {
		setup();
		let release;
		let trappedRequest;
		let held = false;
		manager.scheduler.submit = async input => {
			if (input.observation.request.active && !held) {
				held = true;
				return new Promise(resolve => { release = () => resolve({ key: input.key, status: 'completed', decision: { choice: 'switch 2' } }); });
			}
			if (input.observation.request.active?.[0].trapped) trappedRequest = input;
			return { key: input.key, status: 'completed', decision: { choice: enumerateRequestChoices(input.observation.request)[0] } };
		};
		const player = human();
		const room = await challenge(player);
		room.battle.choose(player, 'team 123456');
		await until(() => release);
		// Test-only fixture: native state changes after the request, as with a previously hidden trapping restriction.
		await room.battle.stream.write('>eval battle.p2.active[0].trapped = true');
		release();
		await until(() => trappedRequest && room.battle.p2.request.isWait === true);
		assert.equal(room.battle.fantasyAI.metrics.illegalChoices, 1);
		assert(!room.battle.p2.request.choice.startsWith('switch'));
	});

	it('completes all requests of a real six-versus-six room using deadline fallbacks', async () => {
		const team = Teams.import(examples[0].team);
		const dex = Dex.forFormat(trainer.format);
		for (const mon of team) mon.moves = mon.moves.filter(id => dex.moves.get(id).category !== 'Status');
		setup({}, [{ ...examples[0], team: Teams.export(team) }]);
		const player = human();
		player.battleSettings.team = Teams.pack(team);
		const room = await challenge(player);
		const battle = room.battle;
		while (!battle.ended) {
			assert(battle.turn <= 250, 'functional match must finish within its turn limit');
			await until(() => battle.ended || battle.p1.request.isWait === false);
			if (!battle.ended) battle.choose(player, 'default');
		}
		assert.equal(manager.getStatus().active, 0);
		assert.equal(manager.getStatus().completed[0].endReason, 'normal');
		assert.equal(battle.fantasyAI.metrics.illegalChoices, 0);
		assert(battle.fantasyAI.metrics.timeouts > 0);
		assert(room.getLog(0).includes('|win|'));
	});

	it('reserves global and player capacity before async validation, then releases finished games for rematches', async () => {
		setup();
		const first = human();
		const second = human();
		const third = human();
		const starting = challenge(first);
		await assert.rejects(() => manager.challenge(first.connections[0], trainer.id, 'normal'), /已有/);
		const room = await starting;
		await challenge(second);
		await assert.rejects(() => manager.challenge(third.connections[0], trainer.id, 'normal'), /名额已满/);
		room.battle.forfeit(first);
		await until(() => room.battle.ended);
		const rematch = await challenge(first, 'hard');
		assert.notEqual(rematch.roomid, room.roomid);
		assert.notEqual(rematch.battle.fantasyAI.options.instanceId, room.battle.fantasyAI.options.instanceId);
	});

	it('uses an engine-legal fallback on worker exit and recovers the next request', async () => {
		setup({ decisionMs: 5000 });
		let killed = false;
		const submit = manager.scheduler.submit.bind(manager.scheduler);
		manager.scheduler.submit = input => {
			const promise = submit(input);
			if (!killed) { killed = true; void manager.scheduler.worker.terminate(); }
			return promise;
		};
		const player = human();
		const room = await challenge(player);
		assert.equal(room.battle.fantasyAI.metrics.workerErrors, 1);
		room.battle.choose(player, 'team 123456');
		await until(() => room.battle.turn === 1 && room.battle.p2.request.isWait === true);
		assert(manager.scheduler.metrics.completed > 0);
		assert.equal(room.battle.fantasyAI.metrics.illegalChoices, 0);
	});

	it('disables forced timers and preserves the human seat and quota across authenticated renames', async () => {
		setup();
		const forced = Config.forcetimer;
		const player = human();
		let room;
		try {
			Config.forcetimer = true;
			room = await challenge(player);
		} finally {
			Object.assign(Config, { forcetimer: forced });
		}
		assert.equal(room.battle.timer.timer, null);
		player.forceRename(`Renamed AI tester ${nextUser}`, true);
		assert(!room.battle.ended);
		assert.equal(room.battle.p1.id, player.id);
		assert(player.games.has(room.roomid));
		assert.deepEqual(manager.getPublicState(player).activeBattles, [room.roomid]);
		await assert.rejects(() => manager.challenge(player.connections[0], trainer.id, 'normal'), /已有/);
		room.battle.forfeit(player);
		await until(() => room.battle.ended);
		assert.equal(manager.getStatus().active, 0);
	});

	it('rejects invalid teams and releases reserved capacity after failed validation', async () => {
		setup();
		const player = human();
		await assert.rejects(() => manager.challenge(player.connections[0], trainer.id, 'expert'), /normal/);
		const one = trainer.packedTeam.split(']')[0];
		await assert.rejects(() => manager.challenge(player.connections[0], trainer.id, 'normal', one), /六只/);
		assert.equal(manager.getStatus().active, 0);
		await challenge(player);
	});

	it('does not start a room for an identity that changes while its team is being validated', async () => {
		setup();
		const player = human();
		const pending = manager.challenge(player.connections[0], trainer.id, 'normal');
		player.forceRename(`Validating AI tester ${nextUser}`, true);
		assert.equal(await pending, null);
		assert.equal(manager.getStatus().active, 0);
		assert.equal(player.games.size, 0);
	});

	it('cannot turn the AI seat over to a real user or replace the human via leavegame', async () => {
		setup();
		const player = human();
		const room = await challenge(player);
		const stranger = human();
		assert.equal(room.battle.joinGame(stranger, 'p2'), false);
		room.battle.setPlayerUser(room.battle.p2, stranger);
		assert.equal(room.battle.p2.getUser(), null);
		room.battle.leaveGame(player);
		await until(() => room.battle.ended);
		assert.equal(manager.getStatus().active, 0);
	});

	it('retains a disconnected battle, restores its request on rejoin and cancels the old cleanup timer', async () => {
		setup({ disconnectMs: 100 });
		const player = human();
		const room = await challenge(player);
		const before = room.battle.p1.request.request;
		player.disconnectAll();
		await delay(25);
		assert.equal(manager.getStatus().active, 1);
		assert.equal(room.battle.p1.request.choice, '');
		const connection = makeConnection();
		player.mergeConnection(connection);
		player.joinRoom(room);
		await delay(130);
		assert(Rooms.get(room.roomid));
		assert(room.battle.p1.active);
		assert.equal(room.battle.p1.request.request, before);
	});

	it('expires disconnected games even with spectators, without automatically choosing for the human', async () => {
		setup({ disconnectMs: 35 });
		const player = human();
		const room = await challenge(player);
		human().joinRoom(room);
		const battle = room.battle;
		player.leaveRoom(room);
		assert.equal(battle.p1.request.choice, '');
		await until(() => !Rooms.get(room.roomid), 'disconnect cleanup');
		assert.equal(manager.getStatus().active, 0);
		assert.equal(manager.getStatus().completed[0].endReason, 'disconnect-timeout');
	});

	it('ignores a completed decision after the room is destroyed', async () => {
		setup();
		const player = human();
		let resolve;
		manager.scheduler.submit = input => new Promise(done => { resolve = () => done({ status: 'completed', decision: { choice: 'team 123456' }, key: input.key }); });
		const room = await manager.challenge(player.connections[0], trainer.id, 'normal');
		rooms.push(room);
		await until(() => resolve);
		const battle = room.battle;
		room.destroy();
		resolve();
		await delay(10);
		assert(battle.ended);
		assert.equal(manager.getStatus().active, 0);
		assert.equal(manager.getStatus().completed.length, 1);
	});

	it('routes list, challenge and rematch commands and restricts diagnostics to staff', async () => {
		const definitions = require('../../dist/config/fantasy-ai-trainers').Trainers;
		const settings = Config.fantasyai;
		const saved = definitions.slice();
		const player = human();
		const replies = [];
		const connection = player.connections[0];
		const send = connection.send;
		connection.send = message => { replies.push(message); };
		try {
			Config.fantasyai = { enabled: true, allowDevelopmentTrainers: true, decisionMs: 0 };
			definitions.push(...examples);
			manager = require('../../dist/server/fantasy-ai/manager').getAIManager();
			await Chat.parse('/fantasyai list', null, player, connection);
			assert(replies.some(line => line.includes(trainer.id)));
			await Chat.parse('/cmd fantasyai', null, player, connection);
			const packet = replies.find(line => line.startsWith('|queryresponse|fantasyai|'));
			const state = JSON.parse(packet.slice('|queryresponse|fantasyai|'.length));
			assert.equal(state.trainers[0].id, trainer.id);
			assert(!packet.includes('packedTeam') && !packet.includes('diagnostics') && !packet.includes('"stats"'));
			replies.length = 0;
			await Chat.parse('/fantasyai status', null, player, connection);
			assert(replies.some(line => line.includes('Access denied')));
			await Chat.parse(`/fantasyai challenge ${trainer.id}, hard`, null, player, connection);
			const room = [...player.games].map(id => Rooms.get(id)).find(value => value?.battle?.fantasyAI);
			assert(room);
			rooms.push(room);
			room.battle.forfeit(player);
			await until(() => room.battle.ended);
			await Chat.parse('/fantasyai rematch', room, player, connection);
			assert([...player.games].some(id => id !== room.roomid));
		} finally {
			connection.send = send;
			Object.assign(Config, { fantasyai: settings });
			definitions.splice(0, definitions.length, ...saved);
		}
	});
});

describe('Fantasy AI private simulator transport', () => {
	it('transfers the hard snapshot and flush boundary through the real simulator child process', async function () {
		this.timeout(20000);
		const { PM } = require('../../dist/server/room-battle');
		PM.spawn(1, true);
		const stream = PM.createStream();
		try {
			await stream.write(`>start ${JSON.stringify({ formatid: trainer.format })}\n>fantasyai hard\n` +
				`>player p1 ${JSON.stringify({ name: 'Human', team: trainer.packedTeam })}\n` +
				`>player p2 ${JSON.stringify({ name: 'AI', team: trainer.packedTeam })}`);
			const packets = [];
			for (;;) {
				const packet = await stream.read();
				if (packet.startsWith('fantasyaiready')) break;
				packets.push(packet);
			}
			const snapshots = packets.filter(packet => packet.startsWith('fantasyai\n'));
			assert.equal(snapshots.length, 1);
			assert.equal(JSON.parse(snapshots[0].split('\n')[1]).length, 6);
			assert(packets.some(packet => packet.startsWith('sideupdate\np2\n|request|')));
			assert(packets.filter(packet => packet.startsWith('update\n')).every(packet => !packet.includes('"stats"')));
		} finally {
			await stream.destroy();
			await PM.unspawn();
		}
	});

	for (const difficulty of ['normal', 'hard']) {
		it(`${difficulty}: sends an initial snapshot at most once and excludes it from public output and input logs`, async () => {
			const stream = new RoomBattleStream();
			async function readBatch() {
				const packets = [];
				for (;;) {
					const packet = await stream.read();
					if (packet.startsWith('fantasyaiready')) return packets;
					packets.push(packet);
				}
			}
			try {
				await stream.write(`>start ${JSON.stringify({ formatid: trainer.format })}\n>fantasyai ${difficulty}\n` +
					`>player p1 ${JSON.stringify({ name: 'Human', team: trainer.packedTeam })}\n` +
					`>player p2 ${JSON.stringify({ name: 'AI', team: trainer.packedTeam })}`);
				const first = await readBatch();
				assert.equal(first.filter(packet => packet.startsWith('fantasyai\n')).length, difficulty === 'hard' ? 1 : 0);
				assert.equal(first.filter(packet => packet.startsWith('fantasyaimoves\n')).length, difficulty === 'normal' ? 1 : 0);
				assert(first.filter(packet => packet.startsWith('update\n')).every(packet => !packet.includes('"stats"')));
				await stream.write('>p1 team 123456\n>p2 team 123456');
				assert((await readBatch()).every(packet => !packet.startsWith('fantasyai\n') && !packet.startsWith('fantasyaimoves\n')));
				assert(stream.battle.inputLog.every(line => !line.includes('fantasyai') && !line.includes('"stats"')));
			} finally { await stream.destroy(); }
		});
	}
});
