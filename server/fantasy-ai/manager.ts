import { randomUUID } from 'crypto';
import { FS } from '../../lib';
import { Trainers } from '../../config/fantasy-ai-trainers';
import { DecisionScheduler } from './scheduler';
import { CHALLENGE_FORMATS, TrainerRegistry, validatePlayerTeam } from './trainers';
import { DEFAULT_LIMITS, type Difficulty } from './types';
import type { ChallengeMetrics } from './controller';
import type { TimeBudgetSettings } from './time-management';

export interface ClientChallengeResult {
	requestId: string;
	status: 'pending' | 'success' | 'error' | 'unknown';
	roomid?: string;
	message?: string;
}

export interface AISettings extends Partial<TimeBudgetSettings> {
	enabled?: boolean;
	allowDevelopmentTrainers?: boolean;
	maxBattles?: number;
	maxBattlesPerPlayer?: number;
	disconnectMs?: number;
}

export class AIChallengeManager {
	readonly scheduler: DecisionScheduler;
	private readonly registry: TrainerRegistry;
	private readonly reservations = new Map<string, { user: User, room?: GameRoom }>();
	private readonly completed: ChallengeMetrics[] = [];
	private readonly clientRequests = new WeakMap<User, Map<string, ClientChallengeResult>>();
	private disposed = false;
	readonly settings: Required<AISettings>;
	private readonly maxRollouts?: number;
	constructor(definitions: readonly unknown[], settings: AISettings = {}, maxRollouts?: number) {
		this.maxRollouts = maxRollouts;
		this.settings = {
			enabled: settings.enabled === true, allowDevelopmentTrainers: settings.allowDevelopmentTrainers === true,
			maxBattles: settings.maxBattles ?? DEFAULT_LIMITS.maxBattles,
			maxBattlesPerPlayer: settings.maxBattlesPerPlayer ?? DEFAULT_LIMITS.maxBattlesPerPlayer,
			decisionMs: settings.decisionMs === undefined ? DEFAULT_LIMITS.decisionMs : settings.decisionMs,
			criticalDecisionMs: settings.criticalDecisionMs ?? DEFAULT_LIMITS.criticalDecisionMs,
			criticalDecisionLimit: settings.criticalDecisionLimit ?? DEFAULT_LIMITS.criticalDecisionLimit,
			criticalDecisionCooldownTurns: settings.criticalDecisionCooldownTurns ?? DEFAULT_LIMITS.criticalDecisionCooldownTurns,
			disconnectMs: settings.disconnectMs ?? DEFAULT_LIMITS.disconnectMs,
		};
		if (!Number.isInteger(this.settings.maxBattlesPerPlayer) || this.settings.maxBattlesPerPlayer < 1 ||
			this.settings.maxBattlesPerPlayer > this.settings.maxBattles || !Number.isFinite(this.settings.disconnectMs) ||
			this.settings.disconnectMs < 1 || this.settings.disconnectMs > 24 * 60 * 60 * 1000) {
			throw new Error('AI 并发或断线保留配置无效。');
		}
		if (!Number.isFinite(this.settings.criticalDecisionMs) || this.settings.criticalDecisionMs < 0 ||
			!Number.isSafeInteger(this.settings.criticalDecisionLimit) || this.settings.criticalDecisionLimit < 0 ||
			!Number.isSafeInteger(this.settings.criticalDecisionCooldownTurns) || this.settings.criticalDecisionCooldownTurns < 1) {
			throw new Error('AI 关键决策时间、次数或间隔配置无效。');
		}
		this.scheduler = new DecisionScheduler(this.settings);
		this.registry = new TrainerRegistry(definitions, this.settings);
	}

	list() { return this.disposed ? [] : this.registry.list(); }

	getPublicState(user: User, requestId = '') {
		return {
			userid: user.id,
			protocolVersion: 2,
			formats: CHALLENGE_FORMATS.map(format => ({ ...format })),
			enabled: !this.disposed && this.settings.enabled,
			trainers: this.list(), difficulties: ['normal', 'hard'],
			disconnectMs: this.settings.disconnectMs,
			challenge: requestId ? {
				...(this.clientRequests.get(user)?.get(requestId) || { requestId, status: 'unknown' }),
			} : null,
			activeBattles: [...this.reservations.values()]
				.filter(entry => (entry.room?.battle?.p1.id || entry.user.id) === user.id)
				.flatMap(entry => entry.room ? [entry.room.roomid] : []),
		};
	}

	/** A client retries the status query, never blindly repeats a timed-out challenge. */
	async challengeForClient(
		connection: Connection, trainerId: string, difficulty: Difficulty, requestId: string, formatId?: string,
	) {
		if (!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) {
			return { requestId: '', status: 'error', message: '挑战请求标识无效，请重新打开 AI 挑战。' } as ClientChallengeResult;
		}
		const user = connection.user;
		let requests = this.clientRequests.get(user);
		if (!requests) this.clientRequests.set(user, requests = new Map());
		const existing = requests.get(requestId);
		if (existing) return { ...existing };
		// Bound per-user history, retaining in-flight requests during concurrent validation.
		if (requests.size >= 16) {
			for (const [id, result] of requests) {
				if (result.status !== 'pending') { requests.delete(id); break; }
			}
			if (requests.size >= 16) return { requestId, status: 'error', message: '已有挑战正在创建，请稍后查询结果。' } as ClientChallengeResult;
		}
		const result: ClientChallengeResult = { requestId, status: 'pending' };
		requests.set(requestId, result);
		let validationError = '';
		try {
			if (formatId !== undefined && !CHALLENGE_FORMATS.some(format => format.id === formatId)) {
				throw new Chat.ErrorMessage('请选择 FC UBUU、FC OU 或 FC UU 赛制。');
			}
			const room = await this.challenge(connection, trainerId, difficulty, user.battleSettings.team,
				message => { validationError = message; }, formatId);
			if (room) {
				result.status = 'success';
				result.roomid = room.roomid;
			} else {
				result.status = 'error';
				result.message = validationError || '对局创建失败。请检查连接、用户名和队伍后重试。';
			}
		} catch (error) {
			result.status = 'error';
			result.message = error instanceof Chat.ErrorMessage ? error.message : '对局创建失败，请稍后重试。';
			if (!(error instanceof Chat.ErrorMessage)) Monitor.crashlog(error as Error, 'Fantasy AI challenge');
		}
		return { ...result };
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
		onValidationError?: (message: string) => void, formatId?: string,
	) {
		if (this.disposed || !this.settings.enabled) throw new Chat.ErrorMessage('AI 挑战尚未开放。');
		if (!['normal', 'hard'].includes(difficulty)) throw new Chat.ErrorMessage('请选择 normal（普通）或 hard（高难）。');
		const trainer = this.registry.get(trainerId);
		if (!trainer) throw new Chat.ErrorMessage('该训练家暂不可挑战。');
		if (formatId !== undefined && trainer.format !== formatId) {
			throw new Chat.ErrorMessage('所选训练家不支持该赛制，请重新选择。');
		}
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
			const ready = await Ladders(trainer.format).prepBattle(connection, 'challenge', packedTeam, false, onValidationError);
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
					criticalDecisionMs: this.settings.criticalDecisionMs, criticalDecisionLimit: this.settings.criticalDecisionLimit,
					criticalDecisionCooldownTurns: this.settings.criticalDecisionCooldownTurns,
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
			if (this.settings.decisionMs === null) {
				room.add('|-message|AI 本局不设思考时限，请等待其完成决策。').update();
			} else {
				const normal = Math.ceil(this.settings.decisionMs / 1000);
				const critical = Math.ceil(this.settings.criticalDecisionMs / 1000);
				const extra = this.settings.criticalDecisionLimit && critical > normal ?
					`，每局最多 ${this.settings.criticalDecisionLimit} 次关键决策可用 ${critical} 秒` : '';
				room.add(`|-message|AI 通常最多思考 ${normal} 秒${extra}，完成后会提前出招。`).update();
			}
			room.add(`|-message|断线或离开房间后保留 ${Math.ceil(this.settings.disconnectMs / 60000)} 分钟，期间不会替你自动出招。`).update();
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
	if (!manager) {
		const definitions = Config.fantasyai?.enabled && Config.fantasyai.allowDevelopmentTrainers && !Trainers.length ?
			JSON.parse(FS('config/fantasy-ai-trainers.example.json').readSync()) : Trainers;
		manager = new AIChallengeManager(definitions, Config.fantasyai);
	}
	return manager;
}
