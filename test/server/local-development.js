'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');
const local = require('../../tools/local-development');

describe('Unified local development updater', function () {
	this.timeout(20000);
	let directory;
	const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
	function write(file, content = 'fixture') {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
	}
	function repository(name) {
		const root = path.join(directory, name);
		fs.mkdirSync(root);
		git(root, 'init', '-b', 'main');
		write(path.join(root, '.gitignore'), 'dist/\nconfig/config.js\n');
		write(path.join(root, 'rules.ts'), 'export const power = 20;');
		git(root, 'add', '.');
		git(root, '-c', 'user.name=Local Test', '-c', 'user.email=local@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Fixture');
		return root;
	}
	beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-local-updater-')); });
	afterEach(() => {
		const target = fs.realpathSync(directory);
		assert(local.inside(fs.realpathSync(os.tmpdir()), target));
		assert(path.basename(target).startsWith('ps-local-updater-'));
		fs.rmSync(target, { recursive: true, force: true });
	});
	it('discovers a registered worktree and includes uncommitted rules, new files and deletions without changing Git', () => {
		const root = repository('primary');
		const development = path.join(directory, 'development');
		git(root, 'worktree', 'add', '-qb', 'codex/fantasy-rogue', development);
		assert.equal(local.selectSource(root, 'codex/fantasy-rogue'), fs.realpathSync(development));
		const original = local.sourceState(development);
		write(path.join(development, 'rules.ts'), 'export const power = 25;');
		const modified = local.sourceState(development);
		assert.notEqual(modified.hash, original.hash);
		assert.equal(modified.commit, original.commit);
		assert.equal(modified.dirty, true);
		write(path.join(development, 'new-rule.ts'));
		const added = local.sourceState(development);
		assert.notEqual(added.hash, modified.hash);
		fs.unlinkSync(path.join(development, 'rules.ts'));
		assert.notEqual(local.sourceState(development).hash, added.hash);
		assert.equal(git(root, 'branch', '--show-current').trim(), 'main');
		assert.equal(git(root, 'status', '--porcelain'), '');
	});
	it('refuses to silently skip changes in another checkout and accepts an explicit source without switching branches', () => {
		const root = repository('primary');
		git(root, 'worktree', 'add', '-qb', 'codex/fantasy-rogue', path.join(directory, 'development'));
		write(path.join(root, 'rules.ts'), 'unsaved development');
		assert.throws(() => local.selectSource(root, 'codex/fantasy-rogue'), /Other worktrees contain uncommitted/);
		assert.equal(local.selectSource(root, 'codex/fantasy-rogue', root), fs.realpathSync(root));
		assert.equal(git(root, 'branch', '--show-current').trim(), 'main');
		assert.equal(fs.readFileSync(path.join(root, 'rules.ts'), 'utf8'), 'unsaved development');
	});
	it('handles an uninitialized legacy server gitlink without mistaking it for the selected server source', () => {
		const root = repository('client');
		const revision = git(root, 'rev-parse', 'HEAD').trim();
		git(root, 'update-index', '--add', '--cacheinfo', `160000,${revision},data/pokemon-showdown`);
		const absent = local.sourceState(root);
		fs.mkdirSync(path.join(root, 'data/pokemon-showdown'), { recursive: true });
		assert.equal(local.sourceState(root).hash, absent.hash);
		assert.equal(absent.dirty, true);
	});
	it('tracks local configuration edits while excluding only the build-generated client configuration block', () => {
		const root = repository('client');
		const config = path.join(root, 'config/config.js');
		const generated = text => `Config.local = true;\n/*** Begin automatically generated configuration ***/\nConfig.version = '${text}';\n/*** End automatically generated configuration ***/\n`;
		write(config, generated('old'));
		const before = local.sourceState(root);
		write(config, generated('new'));
		assert.equal(local.sourceState(root).hash, before.hash);
		write(config, generated('new').replace('local = true', 'local = false'));
		assert.notEqual(local.sourceState(root).hash, before.hash);
	});
	it('rebuilds changed sources or missing/tampered outputs, and reuses only a verified matching build', () => {
		const sources = { server: { root: 'server', hash: 'a' }, client: { root: 'client', hash: 'b' } };
		const generated = { hash: 'c' };
		const previous = { status: 'success', sources, outputs: generated };
		assert.equal(local.buildPlan(previous, sources, generated).rebuild, false);
		for (const side of ['server', 'client']) {
			assert.equal(local.buildPlan(previous, { ...sources, [side]: { ...sources[side], hash: 'edited' } }, generated).rebuild, true);
		}
		assert.equal(local.buildPlan(previous, sources, null).rebuild, true);
		assert.equal(local.buildPlan(previous, sources, { hash: 'tampered' }).rebuild, true);
		assert.equal(local.buildPlan({ ...previous, status: 'failed' }, sources, generated).rebuild, true);
		assert.equal(local.buildPlan(previous, sources, generated, true).rebuild, true);
	});
	function fixtureRecord() {
		const server = repository('server');
		const client = repository('client');
		const state = path.join(directory, 'state');
		const run = path.join(state, 'runs/one');
		fs.mkdirSync(run, { recursive: true });
		const settingsFile = path.join(directory, 'settings.json');
		const saveDatabase = path.join(directory, 'original/saves.db');
		write(settingsFile, '{}');
		write(path.join(server, 'config/config.js'), `exports.port = 8000; exports.bindaddress = '127.0.0.1'; exports.noguestsecurity = true; exports.fantasyrogue = {database: ${JSON.stringify(saveDatabase)}};`);
		write(path.join(client, 'config/config.js'), 'local configuration');
		const record = { id: 'test-update', status: 'prepared', directory: run, settingsFile,
			settings: { stateRoot: state, saveDatabase, serverRepository: server },
			sources: { server: local.sourceState(server), client: local.sourceState(client) },
			plan: { rebuild: true }, build: {}, outputs: null };
		const filename = path.join(run, 'update.json');
		local.writeJSON(filename, record);
		return { filename, record, server, client, saveDatabase };
	}
	it('backs up external saves including live WAL plus non-Rogue tables and original configurations', async () => {
		const { filename, record, server, saveDatabase } = fixtureRecord();
		fs.mkdirSync(path.dirname(saveDatabase));
		const db = new Database(saveDatabase);
		try {
			db.pragma('journal_mode = WAL');
			db.pragma('wal_autocheckpoint = 0');
			db.exec('CREATE TABLE rogue_accounts (data TEXT); CREATE TABLE ordinary_settings (setting TEXT);');
			db.prepare('INSERT INTO rogue_accounts VALUES (?)').run(JSON.stringify({ run: { floor: 56, phase: 'event' } }));
			db.prepare('INSERT INTO ordinary_settings VALUES (?)').run('keep me');
			const configBefore = fs.readFileSync(path.join(server, 'config/config.js'));
			await local.backup(filename, Database);
			const manifest = local.readJSON(path.join(record.directory, 'backup/manifest.json'));
			assert.equal(manifest.databases.length, 1);
			const saved = new Database(manifest.databases[0].backup, { readonly: true });
			try {
				for (const table of ['rogue_accounts', 'ordinary_settings']) {
					assert.deepEqual(saved.prepare(`SELECT * FROM ${table}`).all(), db.prepare(`SELECT * FROM ${table}`).all());
				}
			} finally { saved.close(); }
			assert.equal(local.readJSON(filename).status, 'backed-up');
			assert.deepEqual(fs.readFileSync(path.join(server, 'config/config.js')), configBefore);
			assert.equal(local.validateLocalConfig(server, record.settings), saveDatabase);
			assert.throws(() => local.validateLocalConfig(server, { ...record.settings, saveDatabase: manifest.databases[0].backup }), /different save database/);
		} finally { db.close(); }
	});
	it('refuses an active saved battle before any build can run', async () => {
		const { filename, saveDatabase } = fixtureRecord();
		fs.mkdirSync(path.dirname(saveDatabase));
		const db = new Database(saveDatabase);
		db.exec('CREATE TABLE rogue_accounts (data TEXT);');
		db.prepare('INSERT INTO rogue_accounts VALUES (?)').run(JSON.stringify({ run: { phase: 'battle' } }));
		db.close();
		await assert.rejects(local.backup(filename, Database), /active Rogue battle/);
		assert.throws(() => local.build(filename), /completed backup/);
		assert.equal(local.readJSON(filename).status, 'failed');
	});
	it('propagates real child build failures, preserves old output as a backup and never rewrites the last success receipt', () => {
		const { filename, record, server } = fixtureRecord();
		write(path.join(server, 'dist/old.js'), 'old output');
		write(path.join(record.settings.stateRoot, 'last-success.json'), '{"old":"verified"}');
		record.backup = 'fixture-backup'; record.status = 'backed-up';
		local.writeJSON(filename, record);
		const configBefore = fs.readFileSync(path.join(server, 'config/config.js'));
		assert.throws(() => local.build(filename, (run, name, root) => {
			local.runBuildStep(run, name, root, ['-e', 'console.error("intentional build failure"); process.exit(7)']);
		}), /exit 7.*\nintentional build failure/);
		const failed = local.readJSON(filename);
		assert.equal(failed.status, 'failed');
		assert.equal(failed.build['server-build'].exitCode, 7);
		assert.equal(fs.readFileSync(path.join(record.directory, 'server-dist-before/old.js'), 'utf8'), 'old output');
		assert.deepEqual(fs.readFileSync(path.join(server, 'config/config.js')), configBefore);
		assert.deepEqual(local.readJSON(path.join(record.settings.stateRoot, 'last-success.json')), { old: 'verified' });
	});
	it('does not swallow a replay build failure after the client full build', () => {
		const { filename, record } = fixtureRecord();
		record.backup = 'fixture-backup'; record.status = 'backed-up';
		local.writeJSON(filename, record);
		const steps = [];
		assert.throws(() => local.build(filename, (run, name) => {
			steps.push(name);
			if (name === 'replay-build') throw new Error('replay failed');
		}), /replay failed/);
		assert.deepEqual(steps, ['server-build', 'client-build', 'replay-build']);
		assert.equal(local.readJSON(filename).status, 'failed');
	});
	it('rejects an old runtime receipt instead of accepting a successful response from an old server', async () => {
		const { filename, record } = fixtureRecord();
		record.status = 'built'; record.outputs = { hash: 'new build' };
		local.writeJSON(filename, record);
		local.writeJSON(path.join(record.directory, 'runtime-ready.json'), { id: 'previous run', pid: 123, outputHash: 'old build' });
		await assert.rejects(local.finish(filename, 123), /does not match this build/);
		assert(!fs.existsSync(path.join(record.settings.stateRoot, 'last-success.json')));
	});
	it('rejects remote paths and refuses a different port or save configuration', () => {
		assert.throws(() => local.localPath('\\\\server\\share'), /local filesystem/);
		assert.throws(() => local.localPath('https://example.invalid'), /local filesystem/);
		const { server, record } = fixtureRecord();
		write(path.join(server, 'config/config.js'), "exports.port = 9000; exports.bindaddress = '0.0.0.0';");
		assert.throws(() => local.validateLocalConfig(server, record.settings), /loopback port 8000/);
	});
	it('does not report nickname login as ready when local guest login is disabled', () => {
		const { server, record } = fixtureRecord();
		write(path.join(server, 'config/config.js'), "exports.port = 8000; exports.bindaddress = '127.0.0.1'; exports.noguestsecurity = false;");
		assert.throws(() => local.validateLocalConfig(server, record.settings), /noguestsecurity=true/);
	});
	it('opens the selected development client with explicit credential-free loopback login', () => {
		const root = path.join(directory, 'current client');
		const url = new URL(local.clientURL(root));
		assert.equal(url.protocol, 'file:');
		assert.equal(require('url').fileURLToPath(url), path.join(root, 'play.pokemonshowdown.com/testclient.html'));
		assert.equal(url.search, '?~~localhost:8000&localguest=1');
	});
	(process.platform === 'win32' ? it : it.skip)('opens only the completed client entry and isolates browser association failures', () => {
		const scriptPath = path.resolve(__dirname, '../../tools/restart-local-development.ps1').replace(/'/g, "''");
		const script = `
$ErrorActionPreference = 'Stop'
$ast = [Management.Automation.Language.Parser]::ParseFile('${scriptPath}', [ref]$null, [ref]$null)
$definition = $ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Open-UpdatedClient'}, $true)
Invoke-Expression $definition.Extent.Text
$script:opened = @()
function Start-Process { param($FilePath, $WindowStyle) $script:opened += $FilePath }
$url = 'file:///F:/current%20worktree/client/testclient.html?~~localhost:8000&localguest=1'
foreach ($status in @('prepared', 'built', 'failed')) {
    $refused = $false
    try { Open-UpdatedClient @{status = $status; clientUrl = $url} } catch { $refused = $true }
    if (!$refused -or $script:opened.Count) { throw 'Incomplete update opened a client.' }
}
Open-UpdatedClient @{status = 'success'; clientUrl = $url}
if ($script:opened.Count -ne 1 -or $script:opened[0] -cne $url) { throw 'Wrong client entry opened.' }
function Start-Process { throw 'Missing browser association' }
Open-UpdatedClient @{status = 'success'; clientUrl = $url}
Write-Output 'client-entry verified'
`;
		assert.match(execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 10000 }), /client-entry verified/);
	});
	(process.platform === 'win32' ? it : it.skip)('terminates the PowerShell process-tree walk at leaf nodes and refuses an unrelated child', () => {
		const scriptPath = path.resolve(__dirname, '../../tools/restart-local-development.ps1').replace(/'/g, "''");
		const script = `
$ErrorActionPreference = 'Stop'
$ast = [Management.Automation.Language.Parser]::ParseFile('${scriptPath}', [ref]$null, [ref]$null)
$definition = $ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Stop-GameTree'}, $true)
Invoke-Expression $definition.Extent.Text
$record = @{allowedServerRoots = @('C:\\game')}
$parent = [pscustomobject]@{ProcessId = 10; ParentProcessId = 1; CreationDate = 1; Name = 'node.exe'}
$child = [pscustomobject]@{ProcessId = 11; ParentProcessId = 10; CreationDate = 2; Name = 'node.exe'; CommandLine = 'node C:\\game\\dist\\worker.js'}
$console = [pscustomobject]@{ProcessId = 12; ParentProcessId = 10; CreationDate = 2; Name = 'conhost.exe'; ExecutablePath = (Join-Path $env:SystemRoot 'System32\\conhost.exe')}
$script:processes = @($parent, $child, $console)
$script:stopped = @()
function Get-CimInstance { param($Class, $Filter) if ($Filter) { $id = [int]($Filter -replace '\\D', ''); return $script:processes | Where-Object ProcessId -eq $id }; return $script:processes }
function Get-NetTCPConnection { return $null }
function Stop-Process { param($Id, $ErrorAction) $script:stopped += $Id }
Stop-GameTree $parent
if (($script:stopped -join ',') -ne '10,11') { throw 'Expected only the verified game tree to stop.' }
$child.CommandLine = 'node C:\\unrelated\\app.js'
$script:stopped = @()
$refused = $false
try { Stop-GameTree $parent } catch { $refused = $true }
if (!$refused -or $script:stopped.Count) { throw 'Unrelated child must prevent any process termination.' }
Write-Output 'process-tree verified'
`;
		assert.match(execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 10000 }), /process-tree verified/);
	});
});
