'use strict';

// Windows local development only. Git is used for discovery and provenance, never synchronization.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });

function localPath(value, base = process.cwd()) {
	if (!value || /^(?:\\\\|\/\/|\w+:\/\/)/.test(value)) throw new Error('Only local filesystem paths are allowed.');
	return path.resolve(base, value);
}
function inside(root, target) {
	const relative = path.relative(path.resolve(root), path.resolve(target));
	return !!relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
function filesUnder(root) {
	if (!fs.existsSync(root)) return [];
	if (fs.lstatSync(root).isSymbolicLink()) throw new Error(`Refusing linked directory: ${root}`);
	const result = [];
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		const file = path.join(root, entry.name);
		if (entry.isSymbolicLink()) throw new Error(`Refusing linked source/output/config path: ${file}`);
		if (entry.isDirectory()) result.push(...filesUnder(file));
		else if (entry.isFile()) result.push(file);
	}
	return result;
}
function worktrees(repository) {
	return git(repository, ['worktree', 'list', '--porcelain']).trim().split(/\r?\n\r?\n/).map(block => {
		const lines = block.split(/\r?\n/);
		return { root: lines.find(line => line.startsWith('worktree '))?.slice(9),
			branch: lines.find(line => line.startsWith('branch '))?.slice(7).replace(/^refs\/heads\//, '') || '(detached)',
			commit: lines.find(line => line.startsWith('HEAD '))?.slice(5) };
	}).filter(entry => entry.root && !entry.root.includes('\n'));
}
function selectSource(repository, branch, explicit) {
	const entries = worktrees(repository);
	const match = explicit ? { root: localPath(explicit) } : entries.find(entry => entry.branch === branch);
	if (!match) throw new Error(`No checked-out worktree for ${branch}. Specify a source path; no branch will be switched.`);
	const root = fs.realpathSync(localPath(match.root));
	if (fs.realpathSync(git(root, ['rev-parse', '--show-toplevel']).trim()) !== root) throw new Error('Source must be a repository root.');
	if (!explicit) {
		const otherDirty = entries.filter(entry => fs.existsSync(entry.root) && fs.realpathSync(entry.root) !== root && git(entry.root, ['status', '--porcelain']).trim());
		if (otherDirty.length) throw new Error(`Other worktrees contain uncommitted changes. Select the intended source explicitly:\n${otherDirty.map(e => e.root).join('\n')}`);
	}
	return root;
}
function normalizeInput(file, data) {
	if (file.replace(/\\/g, '/').endsWith('config/config.js')) {
		return Buffer.from(data.toString().replace(/\/\*\*\* Begin automatically generated configuration \*\*\*\/[\s\S]*?\/\*\*\* End automatically generated configuration \*\*\*\//g, ''));
	}
	return data;
}
function sourceState(root) {
	const files = new Set(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean));
	const gitlinks = new Map(git(root, ['ls-files', '--stage', '-z']).split('\0').filter(line => line.startsWith('160000 ')).map(line => {
		const [metadata, file] = line.split('\t');
		return [file, metadata.split(' ')[1]];
	}));
	for (const file of filesUnder(path.join(root, 'config'))) {
		if (/\.(?:js|ts)$/.test(file) || /(?:routes|fantasy[^\\/]*)\.json$/.test(file)) files.add(path.relative(root, file).replace(/\\/g, '/'));
	}
	const digest = crypto.createHash('sha256');
	digest.update(`node:${process.version};abi:${process.versions.modules}\0`);
	const installedLock = path.join(root, 'node_modules/.package-lock.json');
	if (fs.existsSync(installedLock)) digest.update(fs.readFileSync(installedLock)).update('\0');
	for (const relative of [...files].sort()) {
		const file = path.resolve(root, relative);
		if (!inside(root, file)) throw new Error('Input outside selected source root.');
		digest.update(relative.replace(/\\/g, '/') + '\0');
		if (gitlinks.has(relative)) {
			digest.update(`gitlink:${gitlinks.get(relative)}\0`);
			// The client contains an old, uninitialized server gitlink. Local builds use PS_SERVER_PATH.
			if (fs.existsSync(path.join(file, '.git'))) digest.update(sourceState(file).hash);
			continue;
		}
		if (!fs.existsSync(file)) { digest.update('DELETED\0'); continue; }
		if (fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile()) throw new Error(`Unsupported source entry: ${file}`);
		digest.update(normalizeInput(file, fs.readFileSync(file)));
		digest.update('\0');
	}
	return { root, hash: digest.digest('hex'), files: files.size, commit: git(root, ['rev-parse', 'HEAD']).trim(),
		branch: git(root, ['branch', '--show-current']).trim() || '(detached)',
		dirty: !!git(root, ['status', '--porcelain']).trim() };
}
function outputs(server, client) {
	const targets = [path.join(server, 'dist'), ...['play.pokemonshowdown.com/data', 'play.pokemonshowdown.com/js',
		'replay.pokemonshowdown.com/js', 'teams.pokemonshowdown.com/js'].map(file => path.join(client, file))];
	const required = [path.join(server, 'dist/server/index.js'), ...['testclient.html', 'index.html', 'data/pokedex-mini.js',
		'data/pokedex-mini-bw.js', 'data/gen9fantasy.js', 'data/pokedex.js', 'data/moves.js'].map(file => path.join(client, 'play.pokemonshowdown.com', file)),
	path.join(client, 'replay.pokemonshowdown.com/theme/wrapper.inc.php')];
	if (required.some(file => !fs.existsSync(file))) return null;
	const digest = crypto.createHash('sha256');
	const files = new Set([...targets.flatMap(filesUnder), ...required].filter(file => !file.endsWith('.map')));
	for (const file of [...files].sort()) digest.update(file + '\0').update(fs.readFileSync(file)).update('\0');
	return { hash: digest.digest('hex'), files: files.size };
}
function sameSources(left, right) {
	return left.server.root === right.server.root && left.client.root === right.client.root &&
		left.server.hash === right.server.hash && left.client.hash === right.client.hash;
}
function buildPlan(previous, sources, generated, force) {
	if (force) return { rebuild: true, reason: 'Forced rebuild' };
	if (!previous || previous.status !== 'success') return { rebuild: true, reason: 'No verified build receipt' };
	if (!sameSources(previous.sources, sources)) return { rebuild: true, reason: 'Source paths or file contents changed (including uncommitted files)' };
	if (!generated || previous.outputs?.hash !== generated.hash) return { rebuild: true, reason: 'Generated files changed or are missing' };
	return { rebuild: false, reason: 'Source and generated-file hashes match the last verified build' };
}
function readConfig(root) {
	const file = path.join(root, 'config/config.js');
	delete require.cache[require.resolve(file)];
	return require(file);
}
function validateLocalConfig(root, settings) {
	const config = readConfig(root);
	if (config.port !== 8000 || !['127.0.0.1', '::1', 'localhost'].includes(config.bindaddress) || config.ssl) {
		throw new Error('Selected server config must use loopback port 8000 without SSL. Local config was not overwritten.');
	}
	const database = path.resolve(root, config.fantasyrogue?.database || 'databases/fantasy-rogue.db');
	if (fs.realpathSync(database) !== fs.realpathSync(settings.saveDatabase)) {
		throw new Error('Selected config points to a different save database. Refusing to change local player saves.');
	}
	return database;
}
function prepare(settingsFile, serverOverride, clientOverride, force = false) {
	const settings = readJSON(settingsFile);
	const base = path.dirname(path.resolve(settingsFile));
	for (const key of ['serverRepository', 'clientRepository', 'stateRoot', 'saveDatabase']) settings[key] = localPath(settings[key], base);
	if (settings.port !== 8000) throw new Error('This local profile preserves port 8000.');
	const server = selectSource(settings.serverRepository, settings.serverBranch, serverOverride);
	const client = selectSource(settings.clientRepository, settings.clientBranch, clientOverride);
	for (const [root, required] of [[server, ['build', 'sim/dex.ts', 'server/index.ts']],
		[client, ['build', 'build-tools/server-source.js', 'play.pokemonshowdown.com/testclient.template.html']]]) {
		for (const file of required) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing source: ${root}/${file}`);
		if (inside(root, settings.stateRoot) || inside(settings.stateRoot, root) || settings.stateRoot === root) throw new Error('State directory must be outside source worktrees.');
	}
	validateLocalConfig(server, settings);
	if (path.parse(server).root.toLowerCase() !== path.parse(settings.stateRoot).root.toLowerCase()) {
		throw new Error('State directory must be on the server source volume for safe generated-output archival.');
	}
	if (!fs.existsSync(path.join(client, 'config/config.js'))) throw new Error('Client local config is missing; configure it before updating.');
	for (const [root, dependencies] of [[server, ['esbuild', 'better-sqlite3']], [client, ['@babel/core', 'image-size']]]) {
		for (const name of dependencies) require.resolve(name, { paths: [root] });
	}
	if (!fs.readFileSync(path.join(client, 'build'), 'utf8').includes('--local-server')) throw new Error('Client does not support an explicit local server source.');
	const sources = { server: sourceState(server), client: sourceState(client) };
	const previousFile = path.join(settings.stateRoot, 'last-success.json');
	const previous = fs.existsSync(previousFile) ? readJSON(previousFile) : null;
	const plan = buildPlan(previous, sources, outputs(server, client), force);
	fs.mkdirSync(path.join(settings.stateRoot, 'runs'), { recursive: true });
	const directory = fs.mkdtempSync(path.join(settings.stateRoot, 'runs', new Date().toISOString().replace(/[:.]/g, '-') + '-'));
	const record = { id: crypto.randomUUID(), status: 'prepared', directory, settingsFile: path.resolve(settingsFile), settings,
		sources, plan, port: 8000, build: {}, outputs: null,
		allowedServerRoots: [...new Set([server, ...worktrees(settings.serverRepository).map(e => path.resolve(e.root))])],
		runtimeScript: path.join(__dirname, 'local-development-runtime.js') };
	const filename = path.join(directory, 'update.json');
	writeJSON(filename, record);
	return filename;
}
async function backup(recordFile, Database) {
	const record = readJSON(recordFile);
	const folder = path.join(record.directory, 'backup');
	fs.mkdirSync(folder);
	const manifest = { configs: [], databases: [] };
	const roots = [...new Set([record.sources.server.root, record.sources.client.root, record.settings.serverRepository])];
	for (const [index, root] of roots.entries()) {
		for (const source of filesUnder(path.join(root, 'config'))) {
			const target = path.join(folder, `config-${index}`, path.relative(path.join(root, 'config'), source));
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.copyFileSync(source, target);
			manifest.configs.push({ source, backup: target, hash: hash(fs.readFileSync(target)) });
		}
	}
	fs.copyFileSync(record.settingsFile, path.join(folder, 'settings.json'));
	const paths = new Set([fs.realpathSync(record.settings.saveDatabase)]);
	for (const root of [record.sources.server.root, record.settings.serverRepository]) {
		const directory = path.join(root, 'databases');
		if (!fs.existsSync(directory)) continue;
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			if (entry.isFile() && /\.(db|sqlite|sqlite3)$/.test(entry.name) && !/(?:before-|backup|snapshot)/i.test(entry.name)) paths.add(fs.realpathSync(path.join(directory, entry.name)));
		}
	}
	Database ||= require(require.resolve('better-sqlite3', { paths: [record.sources.server.root] }));
	for (const [index, source] of [...paths].entries()) {
		const target = path.join(folder, `${index}-${path.basename(source)}`);
		if (fs.statSync(source).size === 0) {
			fs.copyFileSync(source, target);
		} else {
			const db = new Database(source, { readonly: true, fileMustExist: true });
			try {
				if (db.prepare("SELECT name FROM sqlite_master WHERE name='rogue_accounts'").get()) {
					if (db.prepare('SELECT data FROM rogue_accounts').all().some(row => JSON.parse(row.data).run?.phase === 'battle')) {
						throw new Error('An active Rogue battle exists. Finish it before updating.');
					}
				}
				await db.backup(target);
			} finally { db.close(); }
		}
		manifest.databases.push({ source, backup: target, hash: hash(fs.readFileSync(target)) });
	}
	writeJSON(path.join(folder, 'manifest.json'), manifest);
	record.backup = folder;
	record.status = 'backed-up';
	writeJSON(recordFile, record);
}
function runBuildStep(record, name, root, args) {
	const log = path.join(record.directory, name + '.log');
	const fd = fs.openSync(log, 'w');
	let result;
	try {
		result = spawnSync(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore', fd, fd],
			env: { ...process.env, PS_SERVER_PATH: record.sources.server.root, npm_config_offline: 'true', PS_LOCAL_BUILD: '1' } });
	} finally { fs.closeSync(fd); }
	record.build[name] = { exitCode: result.status, log };
	if (result.error || result.status !== 0) {
		throw new Error(`${name} failed (exit ${result.status}). ${result.error?.message || ''}\n${fs.readFileSync(log, 'utf8').slice(-6000)}\nLog: ${log}`);
	}
	if (/failed to retrieve news|news\.inc\.php unavailable/.test(fs.readFileSync(log, 'utf8'))) {
		record.build[name].warnings = ['Optional PHP news generation unavailable; the client uses its local announcement fallback.'];
		console.log(`${name}: WARNING: ${record.build[name].warnings[0]}`);
	}
	console.log(`${name}: PASS. ${log}`);
}
function build(recordFile, runner = runBuildStep) {
	const record = readJSON(recordFile);
	try {
		if (!record.backup || record.status !== 'backed-up') throw new Error('A completed backup is required before building.');
		if (record.plan.rebuild) {
			// Save old output instead of mixing removed modules into a new build. No source or save is deleted.
			const dist = path.join(record.sources.server.root, 'dist');
			const archive = path.join(record.directory, 'server-dist-before');
			if (!inside(record.sources.server.root, dist) || !inside(record.settings.stateRoot, archive)) throw new Error('Invalid generated-output archive path.');
			if (fs.existsSync(dist)) {
				if (fs.lstatSync(dist).isSymbolicLink()) throw new Error('Refusing to move a linked dist directory.');
				fs.renameSync(dist, archive);
			}
			runner(record, 'server-build', record.sources.server.root, ['build']);
			runner(record, 'client-build', record.sources.client.root, ['build', 'full', '--local-server', record.sources.server.root]);
			// The legacy full build swallows replay failures, so verify this step separately.
			runner(record, 'replay-build', record.sources.client.root, ['build', 'replays']);
		} else {
			record.build.reused = { verified: true, reason: record.plan.reason };
		}
		const after = { server: sourceState(record.sources.server.root), client: sourceState(record.sources.client.root) };
		if (!sameSources(record.sources, after)) throw new Error('Source files changed during the build. Rerun the updater.');
		record.outputs = outputs(after.server.root, after.client.root);
		if (!record.outputs) throw new Error('Required server/client output is missing.');
		record.status = 'built';
	} catch (error) {
		record.status = 'failed'; record.error = error.message;
		throw error;
	} finally { writeJSON(recordFile, record); }
}
async function inspect(port = 8000) {
	if (Number(port) !== 8000) throw new Error('Only the local port 8000 is permitted.');
	const socket = new WebSocket('ws://127.0.0.1:8000/showdown/websocket');
	const messages = [];
	socket.addEventListener('error', () => {});
	socket.addEventListener('message', event => {
		let data = String(event.data);
		if (data.startsWith('a[')) data = JSON.parse(data.slice(1)).join('\n');
		messages.push(...data.split('\n'));
	});
	async function wait(prefix) {
		const deadline = Date.now() + 10000;
		while (Date.now() < deadline) {
			const index = messages.findIndex(line => line.startsWith(prefix));
			if (index >= 0) return messages.splice(index, 1)[0];
			if (socket.readyState === WebSocket.CLOSED) throw new Error('Local service disconnected.');
			await new Promise(resolve => { setTimeout(resolve, 50); });
		}
		throw new Error('Local protocol check timed out.');
	}
	try {
		await wait('|challstr|');
		const formats = await wait('|formats|');
		socket.send('|/cmd rooms');
		const rooms = JSON.parse((await wait('|queryresponse|rooms|')).slice('|queryresponse|rooms|'.length));
		if (!Number.isSafeInteger(rooms.battleCount) || rooms.battleCount < 0) throw new Error('Cannot confirm active battles.');
		return { activeBattles: rooms.battleCount, formatsReceived: formats.length > 20 };
	} finally { socket.close(); }
}
async function finish(recordFile, pid) {
	const record = readJSON(recordFile);
	const ready = readJSON(path.join(record.directory, 'runtime-ready.json'));
	if (record.status !== 'built' || ready.id !== record.id || ready.pid !== Number(pid) || ready.outputHash !== record.outputs.hash) {
		throw new Error('The started process does not match this build.');
	}
	record.health = await inspect();
	if (!record.health.formatsReceived) throw new Error('The ordinary Showdown format list was not received.');
	const now = { server: sourceState(record.sources.server.root), client: sourceState(record.sources.client.root) };
	if (!sameSources(record.sources, now) || outputs(now.server.root, now.client.root)?.hash !== record.outputs.hash) throw new Error('Files changed while starting. Update was not accepted.');
	const base = path.dirname(record.settingsFile);
	const url = require('url').pathToFileURL(path.join(now.client.root, 'play.pokemonshowdown.com/testclient.html')).href + '?~~localhost:8000';
	for (const [name, fragment] of [['Pokémon Showdown 本地开发版.url', ''], ['本地肉鸽（开发版）.url', '#fantasyrogue']]) {
		fs.writeFileSync(path.join(base, name), `[InternetShortcut]\r\nURL=${url}${fragment}\r\n`);
	}
	record.status = 'success'; record.pid = Number(pid); record.finishedAt = new Date().toISOString();
	writeJSON(recordFile, record);
	writeJSON(path.join(record.settings.stateRoot, 'last-success.json'), record);
	console.log(JSON.stringify({ status: 'success', sources: record.sources, build: record.build, port: 8000, pid: record.pid, url,
		saveDatabase: record.settings.saveDatabase, backup: record.backup, report: recordFile }, null, 2));
}
if (require.main === module) {
	(async () => {
		if (process.platform !== 'win32') throw new Error('This updater is restricted to Windows local development.');
		const [mode, ...args] = process.argv.slice(2);
		if (mode === 'prepare') console.log(prepare(args[0], args[1] === '-' ? undefined : args[1], args[2] === '-' ? undefined : args[2], args[3] === 'force'));
		else if (mode === 'backup') await backup(args[0]);
		else if (mode === 'build') build(args[0]);
		else if (mode === 'inspect') {
			const state = await inspect();
			if (state.activeBattles) throw new Error('Active battles exist. Finish them before restarting.');
			console.log(JSON.stringify(state));
		} else if (mode === 'finish') await finish(args[0], args[1]);
		else if (mode === 'fail') {
			const record = readJSON(args[0]);
			record.status = 'failed'; record.error = args[1];
			writeJSON(args[0], record);
		} else throw new Error('Unknown local development command.');
	})().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { localPath, inside, worktrees, selectSource, sourceState, outputs, sameSources, buildPlan, prepare, backup, build, readJSON, writeJSON, validateLocalConfig, runBuildStep, finish };
