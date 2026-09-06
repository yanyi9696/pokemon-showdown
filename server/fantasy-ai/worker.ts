import { isMainThread, parentPort } from 'worker_threads';
import { RolloutPolicy } from './rollout';
import type { WorkerRequest } from './scheduler';

if (!isMainThread && parentPort) {
	const port = parentPort;
	let cacheKey = '';
	let policy: RolloutPolicy;
	port.on('message', (message: WorkerRequest) => {
		try {
			const key = JSON.stringify(message.trainer);
			if (key !== cacheKey) { policy = new RolloutPolicy(message.trainer); cacheKey = key; }
			const decision = policy.decide(message.observation, message.seed, {
				budgetMs: message.budgetMs, maxRollouts: message.maxRollouts, excluded: message.excluded,
				onProgress: progress => port.postMessage({ type: 'progress', token: message.token, decision: progress }),
			});
			port.postMessage({ type: 'complete', token: message.token, decision });
		} catch {
			// Do not send hypothetical team data or engine exception payloads across the result channel.
			port.postMessage({ type: 'error', token: message.token });
		}
	});
}
