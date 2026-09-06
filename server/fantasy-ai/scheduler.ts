import { performance } from 'perf_hooks';
import * as path from 'path';
import { Worker } from 'worker_threads';
import type { PRNGSeed } from '../../sim/prng';
import { enumerateRequestChoices } from './actions';
import type { Observation } from './information';
import type { SearchDecision } from './rollout';
import { DEFAULT_LIMITS, type ValidatedTrainer } from './types';

export interface RequestKey { roomId: string; instanceId: string; rqid: number }
export interface ScheduledRequest {
	key: RequestKey;
	trainer: ValidatedTrainer;
	observation: Observation;
	seed: PRNGSeed;
	budgetMs?: number;
	maxRollouts?: number;
	excluded?: string[];
}
export interface WorkerRequest {
	token: number;
	trainer: ValidatedTrainer;
	observation: Observation;
	seed: PRNGSeed;
	budgetMs: number;
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
	best: SearchDecision;
	choices: Set<string>;
	timer: NodeJS.Timeout;
	resolve: (result: ScheduledResult) => void;
}

function fallback(observation: Observation, excluded: readonly string[] = []): SearchDecision {
	const choices = enumerateRequestChoices(observation.request).filter(choice => !excluded.includes(choice));
	const choice = observation.request.wait ? null : choices[0] || 'default';
	return {
		choice, candidates: choice ? [{ choice, score: 0, reasons: ['request-fallback'] }] : [],
		phase: observation.request.wait ? 'wait' : observation.request.teamPreview ? 'preview' :
		observation.request.forceSwitch ? 'switch' : 'move',
		diagnostics: [], method: 'rules', rollouts: 0, rounds: 0, elapsedMs: 0, stopReason: 'budget',
	};
}

/** One worker, bounded queue, and deadlines measured from receipt, including worker startup and queue time. */
export class DecisionScheduler {
	private worker?: Worker;
	private active?: Job;
	private readonly queue: Job[] = [];
	private readonly instances = new Map<string, { id: string, latest: number }>();
	private readonly terminating = new Set<Promise<number>>();
	private sequence = 0;
	private disposed = false;
	readonly metrics = { completed: 0, timeouts: 0, workerErrors: 0, cancelled: 0, capacity: 0, staleResults: 0 };

	register(roomId: string, instanceId: string) {
		if (this.disposed || !roomId || !instanceId) throw new Error('invalid-scheduler-instance');
		const previous = this.instances.get(roomId);
		if (previous?.id === instanceId) return;
		if (!previous && this.instances.size >= DEFAULT_LIMITS.maxBattles) throw new Error('ai-battle-capacity');
		this.cancelRoom(roomId);
		this.instances.set(roomId, { id: instanceId, latest: -1 });
	}

	unregister(roomId: string, instanceId: string) {
		if (this.instances.get(roomId)?.id !== instanceId) return;
		this.instances.delete(roomId);
		this.cancelRoom(roomId);
	}

	submit(input: ScheduledRequest): Promise<ScheduledResult> {
		const created = performance.now();
		const instance = this.instances.get(input.key.roomId);
		if (this.disposed || !instance || instance.id !== input.key.instanceId ||
			!Number.isSafeInteger(input.key.rqid) || input.key.rqid <= instance.latest) {
			this.metrics.cancelled++;
			return Promise.resolve({ key: { ...input.key }, status: 'cancelled', decision: null, queueMs: 0, totalMs: 0 });
		}
		if (input.budgetMs !== undefined && (!Number.isFinite(input.budgetMs) || input.budgetMs < 0)) {
			throw new Error('invalid-decision-budget');
		}
		instance.latest = input.key.rqid;
		this.cancelRoom(input.key.roomId);
		const best = fallback(input.observation, input.excluded);
		if (this.queue.length + Number(!!this.active) >= DEFAULT_LIMITS.maxBattles) {
			this.metrics.capacity++;
			return Promise.resolve({ key: { ...input.key }, status: 'capacity', decision: best, queueMs: 0, totalMs: 0 });
		}
		const deadline = created + Math.min(DEFAULT_LIMITS.decisionMs, input.budgetMs ?? DEFAULT_LIMITS.decisionMs);
		return new Promise(resolve => {
			const job: Job = {
				token: ++this.sequence, input: structuredClone(input), created, deadline, best,
				choices: new Set(enumerateRequestChoices(input.observation.request)
					.filter(choice => !input.excluded?.includes(choice))),
				timer: null!, resolve,
			};
			job.timer = setTimeout(() => this.timeout(job), Math.max(0, deadline - performance.now()));
			this.queue.push(job);
			this.pump();
		});
	}

	private current(job: Job) {
		const instance = this.instances.get(job.input.key.roomId);
		return instance?.id === job.input.key.instanceId && instance.latest === job.input.key.rqid;
	}

	private finish(job: Job, status: ScheduledResult['status']) {
		clearTimeout(job.timer);
		if (this.active === job) this.active = undefined;
		const index = this.queue.indexOf(job);
		if (index >= 0) this.queue.splice(index, 1);
		const now = performance.now();
		job.resolve({
			key: { ...job.input.key }, status, decision: status === 'cancelled' ? null : structuredClone(job.best),
			queueMs: (job.started ?? now) - job.created, totalMs: now - job.created,
		});
	}

	private retire() {
		const worker = this.worker;
		if (!worker) return;
		this.worker = undefined;
		const stopped = worker.terminate();
		this.terminating.add(stopped);
		const finished = () => { this.terminating.delete(stopped); this.pump(); };
		void stopped.then(finished, finished);
	}

	private timeout(job: Job) {
		if (this.active !== job && !this.queue.includes(job)) return;
		const active = this.active === job;
		this.metrics.timeouts++;
		job.best.stopReason = 'budget';
		this.finish(job, 'timeout');
		if (active) this.retire();
		this.pump();
	}

	private cancelRoom(roomId: string) {
		for (const job of [...this.queue, ...(this.active ? [this.active] : [])]) {
			if (job.input.key.roomId !== roomId) continue;
			const active = job === this.active;
			this.metrics.cancelled++;
			this.finish(job, 'cancelled');
			if (active) this.retire();
		}
		this.pump();
	}

	private failure(worker: Worker) {
		if (worker !== this.worker) return;
		if (this.active) { this.metrics.workerErrors++; this.finish(this.active, 'worker-error'); }
		this.retire();
	}

	private pump() {
		if (this.disposed || this.active || this.terminating.size) return;
		const job = this.queue[0];
		if (!job) return;
		if (!this.current(job)) {
			this.metrics.cancelled++;
			this.finish(job, 'cancelled');
			this.pump();
			return;
		}
		if (performance.now() >= job.deadline) { this.timeout(job); return; }
		if (!this.worker) {
			let worker: Worker;
			try {
				worker = new Worker(path.join(__dirname, 'worker.js'), { resourceLimits: { maxOldGenerationSizeMb: 384 } });
			} catch {
				this.metrics.workerErrors++;
				this.finish(job, 'worker-error');
				this.pump();
				return;
			}
			this.worker = worker;
			worker.on('message', (message: { token: number, type: string, decision?: SearchDecision }) => {
				const active = this.active;
				if (worker !== this.worker || !active || message.token !== active.token || !this.current(active)) {
					this.metrics.staleResults++; return;
				}
				if (performance.now() >= active.deadline) { this.timeout(active); return; }
				if (message.type === 'error') { this.failure(worker); return; }
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
			worker.on('error', () => this.failure(worker));
			worker.on('exit', () => this.failure(worker));
		}
		this.queue.shift();
		this.active = job;
		job.started = performance.now();
		const message: WorkerRequest = {
			token: job.token, trainer: job.input.trainer, observation: job.input.observation, seed: job.input.seed,
			budgetMs: Math.max(0, job.deadline - performance.now()),
			maxRollouts: job.input.maxRollouts, excluded: job.input.excluded,
		};
		try { this.worker.postMessage(message); } catch { this.failure(this.worker); }
	}

	async dispose() {
		this.disposed = true;
		for (const roomId of this.instances.keys()) this.cancelRoom(roomId);
		this.instances.clear();
		this.retire();
		await Promise.allSettled([...this.terminating]);
	}
}
