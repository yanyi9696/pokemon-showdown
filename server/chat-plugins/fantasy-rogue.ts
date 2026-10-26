import { getRogueManager } from '../fantasy-rogue/manager';
import { rogueAccess } from '../fantasy-rogue/access';
import type { RogueCommand } from '../fantasy-rogue/types';
import type { DuelCommand } from '../fantasy-rogue/duels';

export const crqHandlers: { [key: string]: Chat.CRQHandler } = {
	fantasyroguehistory(target, user, trustable) {
		const offset = Number(target || 0);
		if (!trustable || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return null;
		return getRogueManager().history(user, offset);
	},
	fantasyrogueaccess(target, user, trustable) {
		return { userid: user.id, enabled: !!trustable && rogueAccess(user) };
	},
	fantasyroguecodex(target, user, trustable) {
		return trustable && (target === 'guide' || target === 'blessings' || target === 'events') ?
			getRogueManager().codex(user, target) : null;
	},
	fantasyroguegallery(target, user, trustable) {
		const offset = Number(target || 0);
		return trustable && Number.isSafeInteger(offset) && offset >= 0 && offset <= 1000000 ?
			getRogueManager().gallery(user, offset) : null;
	},
	fantasyrogue(target, user, trustable) {
		return trustable ? getRogueManager().state(user) : null;
	},
};

export const commands: Chat.ChatCommands = {
	fantasyrogue: {
		ski(target, room, user, connection) {
			let id = '';
			try {
				if (target.length > 1000) throw new Error('请求过长。');
				const command = JSON.parse(target) as RogueCommand;
				if (!command || typeof command.id !== 'string') throw new Error('请求格式无效。');
				id = command.id;
				const delta = getRogueManager().ski(connection, command);
				connection.send(`|queryresponse|fantasyrogueski|${JSON.stringify({ userid: user.id, id, ok: true, ...delta })}`);
			} catch (error) {
				connection.send(`|queryresponse|fantasyrogueski|${JSON.stringify({ userid: user.id, id, ok: false, message: (error as Error).message })}`);
			}
		},
		story(target, room, user, connection) {
			let id = '';
			try {
				if (target.length > 1000) throw new Error('请求过长。');
				const command = JSON.parse(target) as RogueCommand;
				if (!command || typeof command.id !== 'string') throw new Error('请求格式无效。');
				id = command.id;
				if (command.action !== 'storynext' && command.action !== 'storyskip') throw new Error('此入口仅用于剧情翻页。');
				const state = getRogueManager().command(connection, command);
				connection.send(`|queryresponse|fantasyrogueaction|${JSON.stringify({ userid: user.id, id, ok: true, state })}`);
			} catch (error) {
				connection.send(`|queryresponse|fantasyrogueaction|${JSON.stringify({
					userid: user.id, id, ok: false, message: (error as Error).message,
				})}`);
			}
		},
		duel(target, room, user, connection) {
			try {
				if (target.length > 1024) throw new Error('请求过长。');
				const command = JSON.parse(target) as DuelCommand;
				if (!command || typeof command !== 'object') throw new Error('请求无效。');
				const result = getRogueManager().duel(user, command);
				connection.send(`|queryresponse|fantasyrogueduel|${JSON.stringify({ userid: user.id, ok: true, ...result })}`);
			} catch (error) {
				connection.send(`|queryresponse|fantasyrogueduel|${JSON.stringify({ userid: user.id, ok: false, message: (error as Error).message })}`);
			}
		},
		retreat(target, room, user, connection) {
			try {
				if (!room?.battle?.options.fantasyRogue) throw new Error('请在幻想杯肉鸽战斗中使用逃跑。');
				getRogueManager().retreat(connection, room.roomid);
			} catch (error) {
				this.errorReply((error as Error).message);
			}
		},
		action(target, room, user, connection) {
			let id = '';
			try {
				if (target.length > 4096) throw new Error('请求过长。');
				const command = JSON.parse(target) as RogueCommand;
				if (!command || typeof command !== 'object' || typeof command.id !== 'string') throw new Error('请求格式无效。');
				id = command.id;
				const state = getRogueManager().command(connection, command);
				connection.send(`|queryresponse|fantasyrogueaction|${JSON.stringify({ userid: user.id, id, ok: true, state })}`);
			} catch (error) {
				connection.send(`|queryresponse|fantasyrogueaction|${JSON.stringify({
					userid: user.id, id, ok: false, message: (error as Error).message,
				})}`);
			}
		},
	},
};
