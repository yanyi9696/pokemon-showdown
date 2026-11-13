'use strict';

const { setTimeout: delay } = require('timers/promises');

/** Offline RoomBattle adapter: only NPC wire requests and spectator updates enter the controller.
 * Its real scheduler, candidate filtering, retry and worker path are kept intact. The adapter
 * queues commands so the campaign driver can submit them after the entire request batch.
 */
class PlaytestCoopNPC {
	constructor(load, { roomId, format, state, wild, trainer, onDecision }) {
		const { DecisionScheduler } = load('server/fantasy-ai/scheduler');
		const { RogueCoopController } = load('server/fantasy-rogue/coop-controller');
		this.scheduler = new DecisionScheduler({ workers: 1 });
		this.commands = [];
		this.rqid = 0;
		this.onDecision = onDecision;
		this.room = { roomid: roomId, format, ended: false, options: {
			fantasyRogue: { state, wild },
			fantasyAI: { trainer, instanceId: roomId, scheduler: this.scheduler },
		}, stream: { write: chunk => {
			for (const line of chunk.split('\n')) {
				const match = /^>(p[234]) (.+)$/.exec(line);
				if (!match) throw new Error('Unexpected NPC command');
				this.commands.push({ side: match[1], choice: match[2] });
			}
		} } };
		Object.defineProperty(this.room, 'p1', { get() { throw new Error('NPC accessed player private request'); } });
		Object.defineProperty(this.room.stream, 'battle', { get() { throw new Error('NPC accessed simulator state'); } });
		for (const side of ['p2', 'p3', 'p4']) {
			this.room[side] = { isAI: true, request: { rqid: 0, isWait: true, choice: '', request: '' } };
		}
		this.scheduler.register(roomId, roomId);
		this.controller = new RogueCoopController(this.room);
	}
	update(packet) {
		this.controller.update(packet);
	}
	request(side, request) {
		if (!['p2', 'p3', 'p4'].includes(side)) throw new Error('Only NPC wire requests may be supplied');
		const tracker = this.room[side].request;
		tracker.rqid = ++this.rqid;
		tracker.isWait = !!request.wait;
		tracker.choice = '';
		tracker.request = JSON.stringify(request);
		this.controller.request(side, request, tracker.rqid);
	}
	invalidChoice(side) {
		this.controller.invalidChoice(side);
	}
	async flush() {
		this.controller.flush();
		const start = Date.now();
		while (['p2', 'p3', 'p4'].some(side => this.room[side].request.isWait === false)) {
			if (Date.now() - start > 12000) throw new Error('NPC scheduler did not complete within the audit bound');
			await delay(5);
		}
		const commands = this.commands.splice(0);
		if (commands.length) this.onDecision?.(structuredClone(this.controller.lastDecision));
		return commands;
	}
	async finish() {
		this.room.ended = true;
		this.controller.finish();
		this.scheduler.unregister(this.room.roomid, this.room.roomid);
		await this.scheduler.dispose();
	}
}

/** Two-seat counterpart. The only player-side field used by AIController is the public
 * eliminated flag; any attempt to inspect a private player request fails the audit.
 */
class PlaytestNPC {
	constructor(load, { roomId, format, state, wild, boss, optionalChallenge, trainer, onDecision }) {
		const { DecisionScheduler } = load('server/fantasy-ai/scheduler');
		const { AIController } = load('server/fantasy-ai/controller');
		const { DEFAULT_LIMITS } = load('server/fantasy-ai/types');
		this.scheduler = new DecisionScheduler({ workers: 1 });
		this.commands = [];
		this.rqid = 0;
		this.onDecision = onDecision;
		this.room = { roomid: roomId, format, ended: false, turn: 0,
			p1: { eliminated: false },
			p2: { isAI: true, request: { rqid: 0, isWait: true, choice: '', request: '' } },
			stream: { write: chunk => {
				const match = /^>p2 (.+)$/.exec(chunk);
				if (!match) throw new Error('Unexpected NPC command');
				this.commands.push({ side: 'p2', choice: match[1] });
			} },
			room: { add() { throw new Error('Production NPC controller terminated the audit battle'); } },
		};
		Object.defineProperty(this.room.p1, 'request', { get() { throw new Error('NPC accessed player private request'); } });
		Object.defineProperty(this.room.stream, 'battle', { get() { throw new Error('NPC accessed simulator state'); } });
		this.controller = new AIController(this.room, {
			...DEFAULT_LIMITS, trainer, difficulty: 'normal', instanceId: roomId, scheduler: this.scheduler,
			rogue: { difficulty: state.difficulty, orderedBoss: !!state.boss, immediate: !boss && !optionalChallenge,
				wild, partySize: state.team.length },
			onEnd: metrics => { this.finalMetrics = metrics; },
		});
	}
	update(packet) {
		for (const line of packet.split('\n')) {
			if (line.startsWith('|turn|')) this.room.turn = Number(line.slice(6));
		}
		this.controller.update(packet);
	}
	request(side, request) {
		if (side !== 'p2') throw new Error('Only NPC wire requests may be supplied');
		const tracker = this.room.p2.request;
		tracker.rqid = ++this.rqid;
		tracker.isWait = !!request.wait;
		tracker.choice = '';
		tracker.request = JSON.stringify(request);
		this.controller.request(request, tracker.rqid);
	}
	invalidChoice(side) {
		if (side !== 'p2') throw new Error('Only NPC wire requests may be supplied');
		this.controller.invalidChoice();
		// Same sequence as RoomBattle's invalid-choice handler, including a fresh rqid.
		this.request(side, JSON.parse(this.room.p2.request.request));
	}
	async flush() {
		this.controller.flush();
		const start = Date.now();
		while (this.room.p2.request.isWait === false) {
			if (Date.now() - start > 12000) throw new Error('NPC scheduler did not complete within the audit bound');
			await delay(5);
		}
		const commands = this.commands.splice(0);
		if (commands.length) this.onDecision?.({ controllerMetrics: structuredClone(this.controller.metrics) });
		return commands;
	}
	async finish() {
		this.room.ended = true;
		this.controller.finish('playtest-finished');
		await this.scheduler.dispose();
	}
}

module.exports = { PlaytestCoopNPC, PlaytestNPC };
