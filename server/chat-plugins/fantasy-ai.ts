import { Utils } from '../../lib';
import { getAIManager } from '../fantasy-ai/manager';
import type { ChallengeDifficulty } from '../fantasy-ai/types';

export const crqHandlers: { [key: string]: Chat.CRQHandler } = {
	fantasyai(target, user, trustable) {
		return trustable ? getAIManager().getPublicState(user, target.trim()) : null;
	},
};

export const commands: Chat.ChatCommands = {
	fantasyai: {
		'': 'list',
		list() {
			const manager = getAIManager();
			const trainers = manager.list();
			const { maxBattles, maxBattlesPerPlayer } = manager.settings;
			if (!trainers.length) return this.sendReply('目前没有可挑战的 AI 训练家。');
			this.sendReplyBox('<strong>Fantasy AI 训练家</strong><ul>' + trainers.map(trainer =>
				Utils.html`<li>${trainer.name} — ${Dex.formats.get(trainer.format).name}（${trainer.id}）</li>`
			).join('') + '</ul><p>挑战：<code>/fantasyai challenge 训练家标识, normal</code>；' +
			'高难用 <code>hard</code>，极限用 <code>extreme</code>。</p>' +
			Utils.html`<p>全服最多 ${maxBattles} 场 AI 挑战，每人最多 ${maxBattlesPerPlayer} 场；所有训练家、赛制和难度共用名额。</p>` +
			'<p>高难及极限 AI 知晓玩家全队当前完整状态和已提交操作。极限额外限制玩家分级：FC UBUU→OU，FC OU→UUBL，FC UU→RUBL；含配置可触发的进化形态，其他禁令沿用原赛制。请先选择并提交队伍。</p>');
		},
		async challenge(target, room, user, connection) {
			const args = target.split(',').map(arg => arg.trim());
			if (args.length === 3 || args.length === 4) {
				const result = await getAIManager().challengeForClient(
					connection, args[0], args[1] as ChallengeDifficulty, args[2], args[3]);
				connection.send(`|queryresponse|fantasyaichallenge|${JSON.stringify({ ...result, userid: user.id })}`);
				return;
			}
			if (args.length !== 2) throw new Chat.ErrorMessage('用法：/fantasyai challenge 训练家标识, normal、hard 或 extreme');
			const battleRoom = await getAIManager().challenge(connection, args[0], args[1] as ChallengeDifficulty);
			if (battleRoom) this.sendReply(`AI 挑战已开始：${battleRoom.roomid}`);
		},
		async rematch(target, room, user, connection) {
			const battle = this.requireRoom().battle;
			if (!battle?.fantasyAI || battle.p1.id !== user.id || !battle.ended) {
				throw new Chat.ErrorMessage('请在你已结束的 AI 对局房间中重新挑战。');
			}
			const { trainer, difficulty } = battle.fantasyAI.options;
			await getAIManager().challenge(connection, trainer.id, difficulty, undefined, undefined, trainer.format);
		},
		status() {
			this.checkCan('lock');
			this.sendReplyBox(`<pre>${Utils.escapeHTML(JSON.stringify(getAIManager().getStatus(), null, 2))}</pre>`);
		},
	},
	fantasyaihelp: [
		'/fantasyai - 列出可挑战的 AI 训练家。',
		'/fantasyai challenge [训练家标识], [normal/hard/extreme] - 使用已提交的队伍发起不计天梯的单人挑战。',
		'/fantasyai rematch - 在自己已结束的 AI 对局中重新挑战，使用当前提交的队伍。',
		'/fantasyai status - 查看管理员诊断与近期对局统计。',
	],
};
