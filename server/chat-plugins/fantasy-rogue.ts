import { getRogueManager } from '../fantasy-rogue/manager';
import type { RogueCommand } from '../fantasy-rogue/types';

export const crqHandlers: { [key: string]: Chat.CRQHandler } = {
	fantasyrogue(target, user, trustable) {
		return trustable ? getRogueManager().state(user) : null;
	},
};

export const commands: Chat.ChatCommands = {
	fantasyrogue: {
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
