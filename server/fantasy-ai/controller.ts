import { performance } from 'perf_hooks';
import { PRNG } from '../../sim/prng';
import type { ChoiceRequest } from '../../sim/side';
import type { RoomBattle } from '../room-battle';
import { InformationView } from './information';
import type { InitialPokemon } from './initial-snapshot';
import { enumerateRequestChoices } from './actions';
import type { DecisionScheduler } from './scheduler';
import type { Difficulty, ValidatedTrainer } from './types';

export interface ChallengeMetrics {
	roomId: string;
	trainer: string;
	difficulty: Difficulty;
	decisions: number;
	timeouts: number;
	workerErrors: number;
	searchFallbacks: number;
	rollouts: number;
	illegalChoices: number;
	totalDecisionMs: number;
	maxDecisionMs: number;
	endReason: string;
}
export interface AIChallengeOptions {
	trainer: ValidatedTrainer;
	difficulty: Difficulty;
	instanceId: string;
	scheduler: DecisionScheduler;
	decisionMs: number;
	disconnectMs: number;
	maxRollouts?: number;
	onEnd: (metrics: ChallengeMetrics) => void;
}

/** Trusted room adapter. Only detached views, never a room or simulator, cross into the worker. */
export class AIController {
	private view?: InformationView;
	private readonly rng = new PRNG();
	private pending?: { request: ChoiceRequest, rqid: number, received: number };
	private submitted = 0;
	private submittedChoice = '';
	private fingerprint = '';
	private rejected: string[] = [];
	private closed = false;
	private disconnectTimer?: NodeJS.Timeout;
	readonly metrics: ChallengeMetrics;
	private readonly battle: RoomBattle;
	readonly options: AIChallengeOptions;

	constructor(battle: RoomBattle, options: AIChallengeOptions) {
		this.battle = battle;
		this.options = options;
		if (options.difficulty === 'normal') this.view = new InformationView({ ownSide: 'p2', difficulty: 'normal' });
		options.scheduler.register(battle.roomid, options.instanceId);
		this.metrics = {
			roomId: battle.roomid, trainer: options.trainer.id, difficulty: options.difficulty,
			decisions: 0, timeouts: 0, workerErrors: 0, searchFallbacks: 0, rollouts: 0, illegalChoices: 0,
			totalDecisionMs: 0, maxDecisionMs: 0, endReason: '',
		};
	}

	initialSnapshot(snapshot: InitialPokemon[]) {
		if (this.closed || this.options.difficulty !== 'hard' || this.view) return;
		this.view = new InformationView({ ownSide: 'p2', difficulty: 'hard', initialOpponent: snapshot });
	}

	update(publicPacket: string) {
		if (!this.closed) this.view?.receiveUpdate(publicPacket);
	}

	request(request: ChoiceRequest, rqid: number) {
		if (this.closed) return;
		this.options.scheduler.cancel(this.battle.roomid, this.options.instanceId);
		this.pending = { request, rqid, received: performance.now() };
	}

	invalidChoice() {
		if (this.closed) return;
		this.metrics.illegalChoices++;
		if (this.submittedChoice === 'default' || this.rejected.length >= 12) {
			this.fail('choice-error');
			return;
		}
		if (this.submittedChoice) this.rejected.push(this.submittedChoice);
	}

	/** The simulator's private flush marker follows requests AND their public update packet. */
	flush() {
		if (this.closed || !this.pending || this.battle.ended) return;
		const { request, rqid, received } = this.pending;
		if (request.wait || rqid === this.submitted) return;
		if (!this.view) { this.fail('missing-initial-snapshot'); return; }
		const observation = this.view.observe(request);
		const fingerprint = `${this.battle.turn}:${JSON.stringify(observation.request)}`;
		if (this.fingerprint !== fingerprint) { this.rejected = []; this.fingerprint = fingerprint; }
		this.submitted = rqid;
		const key = { roomId: this.battle.roomid, instanceId: this.options.instanceId, rqid };
		const seed = this.rng.getSeed();
		this.rng.random();
		const fallback = enumerateRequestChoices(request).find(choice => !this.rejected.includes(choice)) || 'default';
		const submit = (choice: string) => {
			if (this.closed || this.battle.ended || this.battle.p1.eliminated || this.pending?.rqid !== rqid) return;
			const current = this.battle.p2.request;
			if (current.rqid !== rqid || current.isWait !== false) return;
			this.submittedChoice = choice;
			current.isWait = true;
			current.choice = choice;
			void this.battle.stream.write(`>p2 ${choice}`);
		};
		void this.options.scheduler.submit({
			key, trainer: this.options.trainer, observation, seed, excluded: this.rejected.slice(),
			budgetMs: Math.max(0, this.options.decisionMs - (performance.now() - received)),
			maxRollouts: this.options.maxRollouts,
		}).then(result => {
			if (this.closed || this.pending?.rqid !== rqid || result.status === 'cancelled') return;
			this.metrics.decisions++;
			const elapsed = performance.now() - received;
			this.metrics.totalDecisionMs += elapsed;
			this.metrics.maxDecisionMs = Math.max(this.metrics.maxDecisionMs, elapsed);
			if (result.status === 'timeout') this.metrics.timeouts++;
			if (result.status === 'worker-error') this.metrics.workerErrors++;
			if (result.decision?.phase === 'move' && result.decision.method !== 'rollout') this.metrics.searchFallbacks++;
			this.metrics.rollouts += result.decision?.rollouts || 0;
			submit(result.decision?.choice || fallback);
		}).catch(() => { this.metrics.workerErrors++; submit(fallback); });
	}

	connected() {
		if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
		this.disconnectTimer = undefined;
	}

	disconnected() {
		if (this.closed || this.disconnectTimer) return;
		this.disconnectTimer = setTimeout(() => {
			if (this.closed) return;
			this.finish('disconnect-timeout');
			this.battle.room.expire();
		}, this.options.disconnectMs);
	}

	private fail(reason: string) {
		this.finish(reason);
		this.battle.room.add('|-message|AI 对局出现异常，本局结束。').update();
		this.battle.tie();
	}

	finish(reason: string) {
		if (this.closed) return;
		this.closed = true;
		this.connected();
		this.pending = undefined;
		this.view = undefined;
		this.options.scheduler.unregister(this.battle.roomid, this.options.instanceId);
		this.metrics.endReason = reason;
		this.options.onEnd({ ...this.metrics });
	}
}
