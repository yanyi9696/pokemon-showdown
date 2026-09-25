import { performance } from 'perf_hooks';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { cpus } from 'os';
import type { PRNGSeed } from '../../sim/prng';
import { enumerateRequestChoices } from './actions';
import type { Observation } from './information';
import type { SearchDecision } from './rollout';
import { DEFAULT_LIMITS, type ValidatedTrainer } from './types';

export interface RequestKey { roomId: string; instanceId: string; rqid: number; revision?: number }
export interface ScheduledRequest {
	key: RequestKey;
	trainer: ValidatedTrainer;
	observation: Observation;
	seed: PRNGSeed;
	budgetMs?: number | null;
	/** Allocated by the trusted room controller, with a per-battle quota. */
	critical?: boolean;
	fallbackChoice?: string;
	maxRollouts?: number;
	excluded?: string[];
}
export interface WorkerRequest {
	token: number;
	trainer: ValidatedTrainer;
	observation: Observation;
	seed: PRNGSeed;
	budgetMs: number | null;
	critical?: boolean;
	maxRollouts?: number;
	excluded?: string[];
}
export interface ScheduledResult {
	key: RequestKey;
	status: 'completed' | 'timeout' | 'cancelled' | 'worker-error' | 'capacity';
	decision: SearchDecision | null;
	queueMs: number;
	totalMs: number;
}
interface Job {
	token: number;
	input: ScheduledRequest;
	created: number;
	started?: number;
	deadline: number;
	budgetMs: number;
	best: SearchDecision;
	choices: Set<string>;
	timer?: NodeJS.Timeout;
	resolve: (result: ScheduledResult) => void;
}

interface WorkerSlot { worker?: Worker; active?: Job; stopping?: Promise<number> }

function fallback(observation: Observation, excluded: readonly string[] = [], preferred?: string): SearchDecision {
	const choices = enumerateRequestChoices(observation.request).filter(choice => !excluded.includes(choice));
	const choice = observation.request.wait ? null :
		preferred && choices.includes(preferred) ? preferred : choices[0] || 'default';
	return {
		choice, candidates: choice ? [{ choice, score: 0, reasons: ['request-fallback'] }] : [],
		phase: observation.request.wait ? 'wait' : observation.request.teamPreview ? 'preview' :
		observation.request.forceSwitch ? 'switch' : 'move',
		diagnostics: [], method: 'rules', rollouts: 0, rounds: 0, elapsedMs: 0, stopReason: 'budget',
	};
}

/** Bounded worker pool. Each decision keeps its search budget while waiting for a slot. */
export class DecisionScheduler {
	private readonly slots: WorkerSlot[];
	private readonly queue: Job[] = [];
	private readonly instances = new Map<string, {
		id: string, latest: number, revision: number, onQueueTime?: (milliseconds: number) => void,
	}>();
	private readonly terminating = new Set<Promise<number>>();
	private sequence = 0;
	private disposed = false;
	readonly metrics = { completed: 0, timeouts: 0, workerErrors: 0, cancelled: 0, capacity: 0, staleResults: 0 };
	private readonly maxBattles: number;
	private readonly decisionMs: number | null;
	private readonly criticalDecisionMs: number;

	constructor(options: {
		workers?: number, maxBattles?: number, decisionMs?: number | null, criticalDecisionMs?: number,
	} = {}) {
		this.maxBattles = options.maxBattles ?? DEFAULT_LIMITS.maxBattles;
		this.decisionMs = options.decisionMs === undefined ? DEFAULT_LIMITS.decisionMs : options.decisionMs;
		this.criticalDecisionMs = options.criticalDecisionMs ?? DEFAULT_LIMITS.criticalDecisionMs;
		const workers = options.workers ?? Math.max(1, Math.min(DEFAULT_LIMITS.workers, cpus().length));
		if (!Number.isInteger(this.maxBattles) || this.maxBattles < 1 || this.maxBattles > 16 ||
			!Number.isInteger(workers) || workers < 1 || workers > 16 ||
			this.decisionMs !== null && (!Number.isFinite(this.decisionMs) || this.decisionMs < 0) ||
			!Number.isFinite(this.criticalDecisionMs) || this.criticalDecisionMs < 0) {
			throw new Error('invalid-scheduler-limits');
		}
		this.slots = Array.from({ length: Math.min(workers, this.maxBattles) }, () => ({}));
	}

	getStatus() {
		return { workers: this.slots.length, active: this.slots.filter(slot => slot.active).length, queued: this.queue.length };
	}

	register(roomId: string, instanceId: string, onQueueTime?: (milliseconds: number) => void) {
		if (this.disposed || !roomId || !instanceId) throw new Error('invalid-scheduler-instance');
		const previous = this.instances.get(roomId);
		if (previous?.id === instanceId) return;
		if (!previous && this.instances.size >= this.maxBattles) throw new Error('ai-battle-capacity');
		this.cancelRoom(roomId);
		this.instances.set(roomId, { id: instanceId, latest: -1, revision: -1, onQueueTime });
	}

	unregister(roomId: string, instanceId: string) {
		if (this.instances.get(roomId)?.id !== instanceId) return;
		this.instances.delete(roomId);
		this.cancelRoom(roomId);
	}

	cancel(roomId: string, instanceId: string) {
		if (this.instances.get(roomId)?.id === instanceId) this.cancelRoom(roomId);
	}

	submit(input: ScheduledRequest): Promise<ScheduledResult> {
		const created = performance.now();
		const instance = this.instances.get(input.key.roomId);
		const revision = input.key.revision ?? 0;
		if (this.disposed || !instance || instance.id !== input.key.instanceId ||
			!Number.isSafeInteger(input.key.rqid) || !Number.isSafeInteger(revision) || revision < 0 ||
			input.key.rqid < instance.latest || input.key.rqid === instance.latest && revision <= instance.revision) {
			this.metrics.cancelled++;
			return Promise.resolve({ key: { ...input.key }, status: 'cancelled', decision: null, queueMs: 0, totalMs: 0 });
		}
		if (input.budgetMs != null && (!Number.isFinite(input.budgetMs) || input.budgetMs < 0)) {
			throw new Error('invalid-decision-budget');
		}
		instance.latest = input.key.rqid;
		instance.revision = revision;
		this.cancelRoom(input.key.roomId);
		const best = fallback(input.observation, input.excluded, input.fallbackChoice);
		if (this.queue.length + this.getStatus().active >= this.maxBattles) {
			this.metrics.capacity++;
			return Promise.resolve({ key: { ...input.key }, status: 'capacity', decision: best, queueMs: 0, totalMs: 0 });
		}
		const maximum = this.decisionMs === null ? Infinity : input.critical ?
			Math.max(this.decisionMs, this.criticalDecisionMs) : this.decisionMs;
		const budgetMs = Math.min(maximum, input.budgetMs ?? Infinity);
		if (!budgetMs) {
			this.metrics.timeouts++;
			return Promise.resolve({ key: { ...input.key }, status: 'timeout', decision: best,
				queueMs: 0, totalMs: performance.now() - created });
		}
		return new Promise(resolve => {
			const job: Job = {
				token: ++this.sequence, input: structuredClone(input), created, deadline: Infinity, budgetMs, best,
				choices: new Set(enumerateRequestChoices(input.observation.request)
					.filter(choice => !input.excluded?.includes(choice))),
				resolve,
			};
			this.queue.push(job);
			this.pump();
		});
	}

	private current(job: Job) {
		const instance = this.instances.get(job.input.key.roomId);
		return instance?.id === job.input.key.instanceId && instance.latest === job.input.key.rqid &&
			instance.revision === (job.input.key.revision ?? 0);
	}

	private finish(job: Job, status: ScheduledResult['status']) {
		if (job.timer) clearTimeout(job.timer);
		const slot = this.slots.find(entry => entry.active === job);
		if (slot) slot.active = undefined;
		const index = this.queue.indexOf(job);
		if (index >= 0) this.queue.splice(index, 1);
		const now = performance.now();
		if (job.started === undefined) this.reportQueueTime(job, now - job.created);
		job.resolve({
			key: { ...job.input.key }, status, decision: status === 'cancelled' ? null : structuredClone(job.best),
			queueMs: (job.started ?? now) - job.created, totalMs: now - job.created,
		});
	}

	private armTimeout(job: Job) {
		if (!Number.isFinite(job.deadline)) return;
		// Node overflows setTimeout delays above 2^31-1 to 1 ms. Explicit long
		// budgets need multiple timer segments; unlimited jobs need no timer at all.
		job.timer = setTimeout(() => {
			if (performance.now() >= job.deadline) this.timeout(job);
			else this.armTimeout(job);
		}, Math.min(0x7FFFFFFF, Math.max(0, job.deadline - performance.now())));
	}

	private retire(slot: WorkerSlot) {
		const worker = slot.worker;
		if (!worker) return;
		slot.worker = undefined;
		const stopped = worker.terminate();
		slot.stopping = stopped;
		this.terminating.add(stopped);
		const finished = () => {
			slot.stopping = undefined;
			this.terminating.delete(stopped);
			this.pump();
		};
		void stopped.then(finished, finished);
	}

	private timeout(job: Job) {
		const slot = this.slots.find(entry => entry.active === job);
		if (!slot && !this.queue.includes(job)) return;
		this.metrics.timeouts++;
		job.best.stopReason = 'budget';
		this.finish(job, 'timeout');
		if (slot) this.retire(slot);
		this.pump();
	}

	private cancelRoom(roomId: string) {
		for (const job of [...this.queue, ...this.slots.flatMap(slot => slot.active ? [slot.active] : [])]) {
			if (job.input.key.roomId !== roomId) continue;
			const slot = this.slots.find(entry => entry.active === job);
			this.metrics.cancelled++;
			this.finish(job, 'cancelled');
			if (slot) this.retire(slot);
		}
		this.pump();
	}

	private failure(slot: WorkerSlot, worker: Worker) {
		if (worker !== slot.worker) return;
		if (slot.active) { this.metrics.workerErrors++; this.finish(slot.active, 'worker-error'); }
		this.retire(slot);
		this.pump();
	}

	private reportQueueTime(job: Job, milliseconds: number) {
		const instance = this.instances.get(job.input.key.roomId);
		if (instance?.id === job.input.key.instanceId) instance.onQueueTime?.(milliseconds);
	}

	private pump() {
		if (this.disposed) return;
		for (const slot of this.slots) {
			if (!slot.active && !slot.stopping) this.startNext(slot);
		}
	}

	private startNext(slot: WorkerSlot) {
		const job = this.queue[0];
		if (!job) return;
		if (!this.current(job)) {
			this.metrics.cancelled++;
			this.finish(job, 'cancelled');
			this.pump();
			return;
		}
		job.started = performance.now();
		this.reportQueueTime(job, job.started - job.created);
		job.deadline = job.started + job.budgetMs;
		if (!slot.worker) {
			let worker: Worker;
			try {
				worker = new Worker(path.join(__dirname, 'worker.js'), { resourceLimits: { maxOldGenerationSizeMb: 384 } });
			} catch {
				this.metrics.workerErrors++;
				this.finish(job, 'worker-error');
				this.pump();
				return;
			}
			slot.worker = worker;
			worker.on('message', (message: { token: number, type: string, decision?: SearchDecision }) => {
				const active = slot.active;
				if (worker !== slot.worker || !active || message.token !== active.token || !this.current(active)) {
					this.metrics.staleResults++; return;
				}
				if (performance.now() >= active.deadline) { this.timeout(active); return; }
				if (message.type === 'error') { this.failure(slot, worker); return; }
				const decision = message.decision;
				if (decision && ((decision.choice === null && active.input.observation.request.wait) ||
					decision.choice === 'default' || (decision.choice !== null && active.choices.has(decision.choice)))) {
					active.best = decision;
				}
				if (message.type === 'complete') {
					this.metrics.completed++;
					this.finish(active, 'completed');
					this.pump();
				}
			});
			worker.on('error', () => this.failure(slot, worker));
			worker.on('exit', () => this.failure(slot, worker));
		}
		this.queue.shift();
		slot.active = job;
		this.armTimeout(job);
		const message: WorkerRequest = {
			token: job.token, trainer: job.input.trainer, observation: job.input.observation, seed: job.input.seed,
			budgetMs: Number.isFinite(job.deadline) ? Math.max(0, job.deadline - performance.now()) : null,
			critical: job.input.critical,
			maxRollouts: job.input.maxRollouts, excluded: job.input.excluded,
		};
		try { slot.worker.postMessage(message); } catch { this.failure(slot, slot.worker); }
	}

	async dispose() {
		this.disposed = true;
		for (const roomId of this.instances.keys()) this.cancelRoom(roomId);
		this.instances.clear();
		for (const slot of this.slots) this.retire(slot);
		await Promise.allSettled([...this.terminating]);
	}
}
