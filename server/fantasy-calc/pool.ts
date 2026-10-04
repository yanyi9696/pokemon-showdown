import { Worker } from 'worker_threads';
import * as path from 'path';
import type { CalcInput, CalcResult } from './engine';

type Reply = { result?: CalcResult, error?: string }[];
type Job = { inputs: CalcInput[], resolve: (result: Reply) => void, reject: (error: Error) => void };

/** Bounded, isolated computation; a slow custom move cannot block the battle server. */
export class FantasyCalcPool {
	private queue: Job[] = [];
	private slots: { worker: Worker, busy: boolean }[] = [];
	private closed = false;

	query(inputs: CalcInput[]): Promise<Reply> {
		if (this.closed || this.queue.length >= 16) return Promise.reject(new Error('计算器繁忙，请稍后重试'));
		return new Promise((resolve, reject) => {
			this.queue.push({ inputs, resolve, reject });
			this.pump();
		});
	}

	private pump() {
		if (this.closed || !this.queue.length) return;
		let slot = this.slots.find(candidate => !candidate.busy);
		if (!slot && this.slots.length < 2) {
			slot = { worker: new Worker(path.join(__dirname, 'worker.js')), busy: false };
			slot.worker.unref();
			this.slots.push(slot);
		}
		if (!slot) return;
		const selected = slot;
		const job = this.queue.shift()!;
		selected.busy = true;
		selected.worker.ref();
		let finished = false;
		const finish = (error?: Error, reply?: Reply) => {
			if (finished) return;
			finished = true;
			clearTimeout(timer);
			// Worker has internal newListener/removeListener hooks: preserve them on reuse.
			selected.worker.removeListener('message', onMessage);
			selected.worker.removeListener('error', onError);
			selected.worker.removeListener('exit', onExit);
			selected.busy = false;
			if (error) {
				this.slots = this.slots.filter(candidate => candidate !== selected);
				void selected.worker.terminate();
				job.reject(new Error('计算超时或不可用，请修改假设后重试'));
			} else {
				selected.worker.unref();
				job.resolve(reply!);
			}
			this.pump();
		};
		const onMessage = (reply: Reply) => finish(undefined, reply);
		const onError = (error: Error) => finish(error);
		const onExit = () => finish(new Error('exit'));
		const timer = setTimeout(() => finish(new Error('timeout')), 5000);
		selected.worker.once('message', onMessage);
		selected.worker.once('error', onError);
		selected.worker.once('exit', onExit);
		selected.worker.postMessage(job.inputs);
		this.pump();
	}

	destroy() {
		this.closed = true;
		for (const job of this.queue.splice(0)) job.reject(new Error('计算器正在重载'));
		for (const slot of this.slots) void slot.worker.terminate();
	}
}
