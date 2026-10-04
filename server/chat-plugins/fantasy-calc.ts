import { FantasyCalcPool } from '../fantasy-calc/pool';
import { normalizeInput } from '../fantasy-calc/engine';

const pool = new FantasyCalcPool();
const requests = new WeakMap<User, { pending: number, start: number, count: number }>();

export const crqHandlers: { [key: string]: Chat.CRQHandler } = {
	async fantasycalc(target, user, trustable) {
		if (!trustable || target.length > 40000) return { error: '计算请求过大或暂不可用' };
		let id = '';
		let lease;
		try {
			const request = JSON.parse(target);
			id = typeof request?.id === 'string' ? request.id.slice(0, 80) : '';
			if (!id || !Array.isArray(request.inputs) || !request.inputs.length || request.inputs.length > 8) {
				return { id, error: '每次最多计算 8 个招式' };
			}
			let quota = requests.get(user);
			if (!quota) { quota = { pending: 0, start: Date.now(), count: 0 }; requests.set(user, quota); }
			if (Date.now() - quota.start > 10000) { quota.start = Date.now(); quota.count = 0; }
			if (quota.pending >= 2 || quota.count >= 20) return { id, error: '计算过于频繁，请稍后重试' };
			const inputs = request.inputs.map(normalizeInput);
			quota.pending++;
			quota.count++;
			lease = quota;
			return { id, results: await pool.query(inputs) };
		} catch (error) {
			const safeMessages = ['无效的计算参数', '缺少宝可梦配置', '宝可梦数据不存在，请刷新客户端数据',
				'招式数据不存在，请刷新客户端数据', '计算器繁忙，请稍后重试', '计算超时或不可用，请修改假设后重试'];
			return { id, error: error instanceof Error && safeMessages.includes(error.message) ?
				error.message : '计算暂不可用，请检查配置后重试' };
		} finally {
			if (lease) lease.pending--;
		}
	},
};

export function destroy() {
	pool.destroy();
}
