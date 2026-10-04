import { parentPort } from 'worker_threads';
import { calculateFantasyDamage, type CalcInput } from './engine';

// This worker only receives calculator assumptions. It has no Rooms or live battle access.
parentPort?.on('message', (inputs: CalcInput[]) => {
	parentPort!.postMessage(inputs.map(input => {
		try {
			return { result: calculateFantasyDamage(input) };
		} catch {
			return { error: '无法计算此配置，请检查宝可梦、招式和场地设置' };
		}
	}));
});
