import { Utils } from '../../lib';
import { getAIManager } from '../fantasy-ai/manager';
import type { Difficulty } from '../fantasy-ai/types';

export const crqHandlers: { [key: string]: Chat.CRQHandler } = {
	fantasyai(target, user, trustable) {
		return trustable ? getAIManager().getPublicState(user) : null;
	},
};

export const commands: Chat.ChatCommands = {
	fantasyai: {
		'': 'list',
		list() {
			const trainers = getAIManager().list();
			if (!trainers.length) return this.sendReply('目前没有可挑战的 AI 训练家。');
			this.sendReplyBox('<strong>Fantasy AI 训练家</strong><ul>' + trainers.map(trainer =>
				Utils.html`<li>${trainer.name} — ${Dex.formats.get(trainer.format).name}（${trainer.id}）</li>`
			).join('') + '</ul><p>挑战：<code>/fantasyai challenge 训练家标识, normal</code>；高难用 <code>hard</code>。</p>' +
			'<p>高难 AI 开局获知全队初始配置与精确能力值。请先选择并提交队伍。</p>');
		},
		async challenge(target, room, user, connection) {
			const args = target.split(',').map(arg => arg.trim());
			if (args.length !== 2) throw new Chat.ErrorMessage('用法：/fantasyai challenge 训练家标识, normal 或 hard');
			const battleRoom = await getAIManager().challenge(connection, args[0], args[1] as Difficulty);
			if (battleRoom) this.sendReply(`AI 挑战已开始：${battleRoom.roomid}`);
		},
		async rematch(target, room, user, connection) {
			const battle = this.requireRoom().battle;
			if (!battle?.fantasyAI || battle.p1.id !== user.id || !battle.ended) {
				throw new Chat.ErrorMessage('请在你已结束的 AI 对局房间中重新挑战。');
			}
			const { trainer, difficulty } = battle.fantasyAI.options;
			await getAIManager().challenge(connection, trainer.id, difficulty);
		},
		status() {
			this.checkCan('lock');
			this.sendReplyBox(`<pre>${Utils.escapeHTML(JSON.stringify(getAIManager().getStatus(), null, 2))}</pre>`);
		},
	},
	fantasyaihelp: [
		'/fantasyai - 列出可挑战的 AI 训练家。',
		'/fantasyai challenge [训练家标识], [normal/hard] - 使用已提交的队伍发起不计天梯的单人挑战。',
		'/fantasyai rematch - 在自己已结束的 AI 对局中重新挑战，使用当前提交的队伍。',
		'/fantasyai status - 查看管理员诊断与近期对局统计。',
	],
};
