'use strict';

// Local maintenance only: never changes an account or sends a game action.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const databases = ['fantasy-rogue-preview.db', 'fantasy-rogue.db'];
const [mode, portArgument = '8000'] = process.argv.slice(2);

async function backup() {
	const Database = require('better-sqlite3');
	const opened = [];
	try {
		for (const name of databases) {
			const source = path.join(root, 'databases', name);
			if (!fs.existsSync(source)) continue;
			const db = new Database(source, { readonly: true, fileMustExist: true });
			opened.push({ name, db });
			const rows = db.prepare('SELECT userid, data FROM rogue_accounts ORDER BY userid').all();
			if (rows.some(row => JSON.parse(row.data).run?.phase === 'battle')) {
				throw new Error('存在进行中的肉鸽战斗，请先结束战斗再重启。');
			}
		}
		const folder = path.join(root, 'databases', 'backups', 'local-restart-' + new Date().toISOString().replace(/[:.]/g, '-'));
		fs.mkdirSync(folder, { recursive: true });
		const manifest = { at: new Date().toISOString(), folder, databases: [] };
		for (const { name, db } of opened) {
			await db.backup(path.join(folder, name));
			const rows = db.prepare('SELECT userid, data FROM rogue_accounts ORDER BY userid').all();
			manifest.databases.push({ name, accounts: rows.length,
				hash: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex') });
		}
		const config = path.join(root, 'config', 'config.js');
		if (fs.existsSync(config)) fs.copyFileSync(config, path.join(folder, 'config.js'));
		fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2));
		fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
		fs.writeFileSync(path.join(root, 'tmp', 'fantasy-rogue-last-backup.json'), JSON.stringify(manifest, null, 2));
		console.log(JSON.stringify({ backup: folder, databases: manifest.databases.map(({ name, accounts }) => ({ name, accounts })) }));
	} finally {
		for (const { db } of opened) db.close();
	}
}

async function inspect(verify) {
	const port = Number(portArgument);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口无效。');
	if (typeof WebSocket !== 'function') throw new Error('本地维护检查需要 Node.js 22 或更新版本。');
	const socket = new WebSocket(`ws://127.0.0.1:${port}/showdown/websocket`);
	const messages = [];
	socket.addEventListener('message', event => {
		let data = String(event.data);
		if (data.startsWith('a[')) data = JSON.parse(data.slice(1)).join('\n');
		messages.push(...data.split('\n'));
	});
	async function wait(predicate) {
		const deadline = Date.now() + 10000;
		while (Date.now() < deadline) {
			const index = messages.findIndex(predicate);
			if (index >= 0) return messages.splice(index, 1)[0];
			if (socket.readyState === WebSocket.CLOSED) throw new Error('本地游戏连接已关闭。');
			await new Promise(resolve => { setTimeout(resolve, 40); });
		}
		throw new Error('等待本地游戏协议响应超时。');
	}
	async function query(kind, target = '') {
		const prefix = `|queryresponse|${kind}|`;
		socket.send(`|/cmd ${kind}${target ? ' ' + target : ''}`);
		return JSON.parse((await wait(line => line.startsWith(prefix))).slice(prefix.length));
	}
	try {
		await wait(line => line.startsWith('|challstr|'));
		const rooms = await query('rooms');
		const activeBattles = rooms?.battleCount;
		if (!Number.isSafeInteger(activeBattles) || activeBattles < 0) throw new Error('无法确认活动对战数，停止维护检查。');
		if (activeBattles && !verify) throw new Error('存在对战房间，请先结束对战再重启。');
		const blessings = await query('fantasyroguecodex', 'blessings');
		const result = { port, activeBattles, codexSchema: blessings.codexSchema,
			contentVersion: blessings.contentVersion, blessings: blessings.entries?.length };
		if (verify) {
			const { codexContentVersion, rogueCodex, ROGUE_CODEX_SCHEMA } = require('../dist/server/fantasy-rogue/codex');
			if (blessings.codexSchema !== ROGUE_CODEX_SCHEMA || blessings.contentVersion !== codexContentVersion()) {
				throw new Error('端口上的服务仍不是当前构建版本，请查看启动日志。');
			}
			const events = await query('fantasyroguecodex', 'events');
			if (events.entries.length !== rogueCodex(undefined, 'events', true).entries.length) throw new Error('图鉴条目数不符。');
			result.adventures = events.entries.filter(entry => entry.category === 'adventure').length;
			result.trainers = events.entries.filter(entry => entry.roles).length;
		}
		console.log(JSON.stringify(result));
	} finally {
		socket.close();
	}
}

(mode === 'backup' ? backup() : mode === 'inspect' || mode === 'verify' ? inspect(mode === 'verify') :
	Promise.reject(new Error('Usage: node tools/fantasy-rogue-local-service.js backup|inspect|verify [port]')))
	.catch(error => { console.error(error.message); process.exitCode = 1; });
