import { randomUUID } from 'crypto';
import { Trainers } from '../../config/fantasy-ai-trainers';
import { DecisionScheduler } from './scheduler';
import { TrainerRegistry, validatePlayerTeam } from './trainers';
import { DEFAULT_LIMITS, type Difficulty } from './types';
import type { ChallengeMetrics } from './controller';

export interface AISettings {
	enabled?: boolean;
	allowDevelopmentTrainers?: boolean;
	maxBattles?: number;
	maxBattlesPerPlayer?: number;
	decisionMs?: number;
	disconnectMs?: number;
}

export class AIChallengeManager {
	readonly scheduler: DecisionScheduler;
	private readonly registry: TrainerRegistry;
	private readonly reservations = new Map<string, { user: User, room?: GameRoom }>();
	private readonly completed: ChallengeMetrics[] = [];
	private disposed = false;
	readonly settings: Required<AISettings>;
	private readonly maxRollouts?: number;
	constructor(definitions: readonly unknown[], settings: AISettings = {}, maxRollouts?: number) {
		this.maxRollouts = maxRollouts;
		this.settings = {
			enabled: settings.enabled === true, allowDevelopmentTrainers: settings.allowDevelopmentTrainers === true,
			maxBattles: settings.maxBattles ?? DEFAULT_LIMITS.maxBattles,
			maxBattlesPerPlayer: settings.maxBattlesPerPlayer ?? DEFAULT_LIMITS.maxBattlesPerPlayer,
			decisionMs: settings.decisionMs ?? DEFAULT_LIMITS.decisionMs,
			disconnectMs: settings.disconnectMs ?? DEFAULT_LIMITS.disconnectMs,
		};
		if (!Number.isInteger(this.settings.maxBattlesPerPlayer) || this.settings.maxBattlesPerPlayer < 1 ||
			this.settings.maxBattlesPerPlayer > this.settings.maxBattles || !Number.isFinite(this.settings.disconnectMs) ||
			this.settings.disconnectMs < 1 || this.settings.disconnectMs > 24 * 60 * 60 * 1000) {
			throw new Error('AI 并发或断线保留配置无效。');
		}
		this.scheduler = new DecisionScheduler(this.settings);
		this.registry = new TrainerRegistry(definitions, this.settings);
	}

	list() { return this.disposed ? [] : this.registry.list(); }

	getPublicState(user: User) {
		return {
			enabled: !this.disposed && this.settings.enabled,
			trainers: this.list(), difficulties: ['normal', 'hard'],
			activeBattles: [...this.reservations.values()]
				.filter(entry => (entry.room?.battle?.p1.id || entry.user.id) === user.id)
				.flatMap(entry => entry.room ? [entry.room.roomid] : []),
		};
	}

	getStatus() {
		return {
			enabled: !this.disposed && this.settings.enabled, active: this.reservations.size,
			maxBattles: this.settings.maxBattles, worker: { ...this.scheduler.metrics },
			diagnostics: this.registry.getDiagnostics(), completed: this.completed.map(entry => ({ ...entry })),
		};
	}

	async challenge(
		connection: Connection, trainerId: string, difficulty: Difficulty, packedTeam = connection.user.battleSettings.team,
	) {
		if (this.disposed || !this.settings.enabled) throw new Chat.ErrorMessage('AI 挑战尚未开放。');
		if (!['normal', 'hard'].includes(difficulty)) throw new Chat.ErrorMessage('请选择 normal（普通）或 hard（高难）。');
		const trainer = this.registry.get(trainerId);
		if (!trainer) throw new Chat.ErrorMessage('该训练家暂不可挑战。');
		const user = connection.user;
		const userid = user.id;
		if (!user.named || !user.connected) throw new Chat.ErrorMessage('请先登录或选择用户名。');
		if (typeof packedTeam !== 'string' || !packedTeam || packedTeam.length > 20000) {
			throw new Chat.ErrorMessage('请先选择并提交有效队伍。');
		}
		const existing = [...this.reservations.values()]
			.filter(entry => (entry.room?.battle?.p1.id || entry.user.id) === userid);
		if (existing.length >= this.settings.maxBattlesPerPlayer) throw new Chat.ErrorMessage('请先结束已有的 AI 对局。');
		if (this.reservations.size >= this.settings.maxBattles) throw new Chat.ErrorMessage('AI 挑战名额已满，请稍后再试。');
		// Reserve before asynchronous validation so simultaneous requests cannot oversubscribe either limit.
		const instanceId = randomUUID();
		const reservation: { user: User, room?: GameRoom } = { user };
		this.reservations.set(instanceId, reservation);
		let room: GameRoom | null = null;
		let roomid: RoomID | undefined;
		try {
			const ready = await Ladders(trainer.format).prepBattle(connection, 'challenge', packedTeam);
			if (!ready) return null;
			if (this.disposed || user.id !== userid || !user.connected || connection.user !== user ||
				Punishments.isBattleBanned(user)) return null;
			const validated = validatePlayerTeam(trainer.format, ready.settings.team);
			if (validated.problems.length) throw new Chat.ErrorMessage(validated.problems.join('\n'));
			roomid = Rooms.global.prepBattleRoom(trainer.format);
			room = Rooms.createBattle({
				roomid,
				format: trainer.format, rated: false, challengeType: 'challenge', allowRenames: true,
				players: [{ user, team: validated.packedTeam, hidden: ready.settings.hidden, inviteOnly: ready.settings.inviteOnly }],
				fantasyAI: {
					trainer, difficulty, instanceId, scheduler: this.scheduler,
					decisionMs: this.settings.decisionMs, disconnectMs: this.settings.disconnectMs, maxRollouts: this.maxRollouts,
					onEnd: metrics => {
						this.reservations.delete(instanceId);
						this.completed.push(metrics);
						if (this.completed.length > 100) this.completed.shift();
						Monitor.notice(`[Fantasy AI] ${JSON.stringify(metrics)}`);
					},
				},
			});
			if (!room) return null;
			reservation.room = room;
			room.add(`|-message|AI 训练家：${trainer.name}；难度：${difficulty === 'hard' ? '高难' : '普通'}。`).update();
			if (difficulty === 'hard') {
				room.add('|-message|高难 AI 开局获知全队初始配置及精确能力值；不会读取当前隐藏状态或未执行的行动。').update();
			}
			return room;
		} finally {
			if (!room) {
				if (roomid) Rooms.get(roomid)?.destroy();
				this.scheduler.unregister(roomid || '', instanceId);
				this.reservations.delete(instanceId);
			}
		}
	}

	async dispose() {
		this.disposed = true;
		for (const entry of [...this.reservations.values()]) entry.room?.destroy();
		this.reservations.clear();
		await this.scheduler.dispose();
	}
}

let manager: AIChallengeManager | undefined;
/** Configuration is loaded once; restarting the server applies trainer or limit changes. */
export function getAIManager() {
	manager ||= new AIChallengeManager(Trainers, Config.fantasyai);
	return manager;
}
