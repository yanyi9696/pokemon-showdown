/**
 * Standalone replay server for private Pokemon Showdown deployments.
 *
 * This serves local replay JSON files written by server/replays.ts.
 */
import * as http from 'http';
import { URL } from 'url';
import { FS } from '../lib';
import { load as loadConfig } from './config-loader';

type ReplayRow = {
	id: string,
	format: string,
	players: string,
	log: string,
	inputlog: string | null,
	uploadtime: number,
	views: number,
	formatid: string,
	rating: number | null,
	private: 0 | 1 | 2 | 3 | 10,
	password: string | null,
};

type ReplaySummaryRow = Pick<
	ReplayRow, 'id' | 'format' | 'players' | 'uploadtime' | 'rating' | 'private' | 'password'
>;

const Config = loadConfig();

function toID(text: string | null | undefined) {
	return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function escapeHTML(text: string | number | null | undefined) {
	return `${text ?? ''}`
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function escapeScriptText(text: string) {
	return text.replace(/<\/(script)/gi, '<\\/$1');
}

function normalizeOrigin(origin: string) {
	origin = origin.trim().replace(/\/+$/, '');
	if (!origin) return '';
	if (!/^https?:\/\//.test(origin)) origin = `https://${origin}`;
	return origin;
}

function clientOrigin() {
	return normalizeOrigin(
		process.env.REPLAY_CLIENT_ORIGIN ||
		Config.replayclientorigin ||
		Config.routes?.client ||
		'play.pokemonshowdown.com'
	);
}

function parseReplayID(fullid: string) {
	let id = fullid;
	let password = '';
	if (fullid.endsWith('pw')) {
		const dash = fullid.lastIndexOf('-');
		if (dash > 0) {
			id = fullid.slice(0, dash);
			password = fullid.slice(dash + 1, -2);
		}
	}
	return { id, password };
}

function fileReplayDir() {
	return Config.replaysdir || 'logs/replays';
}

function fileReplayPath(id: string) {
	if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error(`Invalid replay ID: ${id}`);
	return FS(`${fileReplayDir()}/${id}.json`);
}

const replayWriteLocks = new Map<string, Promise<void>>();

async function writeFileReplay(replay: ReplayRow) {
	await FS(fileReplayDir()).mkdirp();
	const file = fileReplayPath(replay.id);
	const previousWrite = replayWriteLocks.get(file.path) || Promise.resolve();
	const nextWrite = previousWrite.then(() => file.safeWrite(JSON.stringify(replay)));
	replayWriteLocks.set(file.path, nextWrite.catch(() => {}));
	try {
		await nextWrite;
	} finally {
		if (replayWriteLocks.get(file.path) === nextWrite) replayWriteLocks.delete(file.path);
	}
}

async function readFileReplay(id: string) {
	const data = await fileReplayPath(id).readIfExists();
	if (!data) return null;
	return JSON.parse(data) as ReplayRow;
}

async function listFileReplays() {
	const files = await FS(fileReplayDir()).readdirIfExists();
	const rows: ReplayRow[] = [];
	for (const file of files) {
		if (!file.endsWith('.json')) continue;
		try {
			rows.push(JSON.parse(await FS(`${fileReplayDir()}/${file}`).read()) as ReplayRow);
		} catch {}
	}
	return rows;
}

function fullReplayID(replay: ReplayRow | ReplaySummaryRow) {
	return replay.id + (replay.password ? `-${replay.password}pw` : '');
}

function splitPlayers(players: string) {
	return players.split(',').map(player => player.startsWith('!') ? player.slice(1) : player);
}

function replaySummary(replay: ReplaySummaryRow) {
	const players = splitPlayers(replay.players);
	return {
		id: fullReplayID(replay),
		format: replay.format,
		players,
		p1: players[0] || '',
		p2: players[1] || '',
		uploadtime: Number(replay.uploadtime),
		rating: replay.rating,
	};
}

function shouldIncludeInputLog(replay: ReplayRow) {
	if (!replay.inputlog) return false;
	const formatid = replay.formatid || toID(replay.format);
	return (
		formatid.endsWith('randombattle') ||
		formatid.endsWith('randomdoublesbattle') ||
		formatid === 'gen7challengecup' ||
		formatid === 'gen7challengecup1v1' ||
		formatid === 'gen7battlefactory' ||
		formatid === 'gen7bssfactory' ||
		formatid === 'gen7hackmonscup'
	);
}

function replayJSON(replay: ReplayRow) {
	const players = splitPlayers(replay.players);
	const json: Record<string, unknown> = {
		id: replay.id,
		format: replay.format,
		formatid: replay.formatid,
		players,
		p1: players[0] || '',
		p2: players[1] || '',
		log: replay.log.replace(/\r/g, ''),
		uploadtime: Number(replay.uploadtime),
		views: Number(replay.views),
		rating: replay.rating,
		private: replay.private,
	};
	if (shouldIncludeInputLog(replay)) json.inputlog = replay.inputlog;
	return json;
}

function write(
	res: http.ServerResponse, statusCode: number, body: string | Buffer,
	headers: http.OutgoingHttpHeaders = {}
) {
	res.writeHead(statusCode, {
		'Content-Length': typeof body === 'string' ? Buffer.byteLength(body) : body.length,
		...headers,
	});
	res.end(body);
}

function writeJSON(res: http.ServerResponse, statusCode: number, data: unknown) {
	write(res, statusCode, JSON.stringify(data), {
		'Content-Type': 'application/json; charset=utf-8',
		'Access-Control-Allow-Origin': '*',
	});
}

function notFound(res: http.ServerResponse) {
	write(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
}

async function loadReplay(fullid: string) {
	if (!/^[A-Za-z0-9-]+$/.test(fullid)) return null;
	const { id, password } = parseReplayID(fullid);
	const replay = await readFileReplay(id);
	if (!replay || replay.private === 3) return null;
	if (replay.password && replay.password !== password) return null;
	replay.views = Number(replay.views || 0) + 1;
	await writeFileReplay(replay);
	return replay;
}

async function recentReplays() {
	const rows = (await listFileReplays()).filter(row => row.private === 0);
	rows.sort((a, b) => b.uploadtime - a.uploadtime);
	return rows.slice(0, 50);
}

function pageOffset(url: URL) {
	const page = Number(url.searchParams.get('page') || 1);
	if (!Number.isFinite(page) || page < 1) return 0;
	return Math.min(page, 25) * 50 - 50;
}

async function searchReplays(url: URL) {
	const username = toID(url.searchParams.get('user'));
	const username2 = toID(url.searchParams.get('user2'));
	const formatid = toID(url.searchParams.get('format'));
	const contains = url.searchParams.get('contains') || '';
	const byRating = url.searchParams.has('rating');
	const offset = pageOffset(url);
	let rows = (await listFileReplays()).filter(row => row.private === 0);

	if (contains) {
		const terms = contains.split(',').map(term => term.trim().toLowerCase()).filter(Boolean).slice(0, 2);
		rows = rows.filter(row => {
			const log = row.log.toLowerCase();
			return terms.every(term => log.includes(term));
		});
		rows.sort((a, b) => b.uploadtime - a.uploadtime);
		return rows.slice(0, 10);
	}

	rows = rows.filter(row => {
		if (formatid && row.formatid !== formatid) return false;
		const playerids = splitPlayers(row.players).map(player => toID(player));
		if (username && !playerids.includes(username)) return false;
		if (username2 && !playerids.includes(username2)) return false;
		return true;
	});
	rows.sort((a, b) => {
		if (byRating) return (b.rating || 0) - (a.rating || 0) || b.uploadtime - a.uploadtime;
		return b.uploadtime - a.uploadtime;
	});
	return rows.slice(offset, offset + 51);
}

function canonicalReplayURL(req: http.IncomingMessage, replay: ReplayRow) {
	const proto = `${req.headers['x-forwarded-proto'] || 'https'}`.split(',')[0];
	const host = req.headers['x-forwarded-host'] || req.headers.host || Config.routes?.replays || 'localhost';
	return `${proto}://${host}/${fullReplayID(replay)}`;
}

function renderReplayPage(req: http.IncomingMessage, replay: ReplayRow) {
	const players = splitPlayers(replay.players);
	const p1 = players[0] || 'Player 1';
	const p2 = players[1] || 'Player 2';
	const title = `${replay.format} replay: ${p1} vs. ${p2}`;
	const uploaded = new Date(Number(replay.uploadtime) * 1000).toISOString().slice(0, 10);
	const origin = clientOrigin();
	const replayURL = canonicalReplayURL(req, replay);
	const log = escapeScriptText(replay.log.replace(/\r/g, ''));
	const miniSpritesURL = 'https://play.pokemonshowdown.com/data/pokedex-mini.js';
	const miniSpritesBWURL = 'https://play.pokemonshowdown.com/data/pokedex-mini-bw.js';

	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	${replay.private ? '<meta name="robots" content="noindex" />' : ''}
	<title>${escapeHTML(title)}</title>
	<link rel="stylesheet" href="${origin}/style/font-awesome.css" />
	<link rel="stylesheet" href="${origin}/style/battle.css" />
	<link rel="stylesheet" href="${origin}/style/replay.css" />
	<link rel="stylesheet" href="${origin}/style/utilichart.css" />
	<style>
		body { margin: 0; padding: 16px; background: #f5f5f5; color: #222; font: 14px Arial, sans-serif; }
		.replay-shell { max-width: 1180px; margin: 0 auto; }
		.urlbox { white-space: pre-wrap; word-break: break-all; background: #fff; border: 1px solid #ccc; padding: 8px; }
		h1 { font-weight: normal; text-align: left; }
		.replay-controls, .replay-controls-2 { margin: 8px 0; }
	</style>
</head>
<body>
	<div class="wrapper replay-wrapper replay-shell">
		<div class="battle"><div class="playbutton"><button disabled>Loading...</button></div></div>
		<div class="battle-log"></div>
		<div class="replay-controls"></div>
		<div class="replay-controls-2">
			<div class="chooser leftchooser speedchooser">
				<em>Speed:</em>
				<div>
					<button value="fast" class="sel">Fast</button><button value="normal">Normal</button>
					<button value="slow">Slow</button><button value="reallyslow">Really Slow</button>
				</div>
			</div>
			<div class="chooser colorchooser">
				<em>Color scheme:</em>
				<div><button value="light" class="sel">Light</button><button value="dark">Dark</button></div>
			</div>
			<div class="chooser soundchooser" style="display:none">
				<em>Music:</em>
				<div><button value="on" class="sel">On</button><button value="off">Off</button></div>
			</div>
		</div>
		${replay.private ? '<strong>THIS REPLAY IS PRIVATE</strong>' : ''}
		<pre class="urlbox">${escapeHTML(replayURL)}</pre>
		<h1><strong>${escapeHTML(replay.format)}</strong>: ${escapeHTML(p1)} vs. ${escapeHTML(p2)}</h1>
		<p><small class="uploaddate" data-timestamp="${Number(replay.uploadtime)}"><em>Uploaded:</em>
		${uploaded}${replay.rating ? ` | <em>Rating:</em> ${escapeHTML(replay.rating)}` : ''}</small></p>
		<input type="hidden" name="replayid" value="${escapeHTML(replay.id)}" />
		<script type="text/plain" class="battle-log-data">${log}</script>
	</div>
	<script src="${origin}/js/lib/ps-polyfill.js"></script>
	<script src="${origin}/js/lib/jquery-1.11.0.min.js"></script>
	<script src="${origin}/js/lib/html-sanitizer-minified.js"></script>
	<script src="${origin}/js/battle-sound.js"></script>
	<script src="${origin}/config/config.js"></script>
	<script>
	window.PSIconSheetPrefix = ${JSON.stringify(`${origin}/`)};
	</script>
	<script src="${origin}/js/battledata.js"></script>
	<script src="${miniSpritesURL}"></script>
	<script src="${miniSpritesBWURL}"></script>
	<script src="${origin}/data/graphics.js"></script>
	<script src="${origin}/data/typechart.js"></script>
	<script src="${origin}/data/pokedex.js"></script>
	<script src="${origin}/data/moves.js"></script>
	<script src="${origin}/data/abilities.js"></script>
	<script src="${origin}/data/items.js"></script>
	<script src="${origin}/data/teambuilder-tables.js"></script>
	<script src="${origin}/data/gen9fantasy.js"></script>
	<script src="${origin}/js/battle-tooltips.js"></script>
	<script src="${origin}/js/battle.js"></script>
	<script>
	(function () {
		var replay = {battle: null, muted: false};
		function update() {
			if (!replay.battle) return;
			if (window.BattleSound && BattleSound.muted && !replay.muted) changeSetting('sound', 'off');
			var resetDisabled = !replay.battle.started ? ' disabled' : '';
			if (replay.battle.paused) {
				$('.replay-controls').html('<button data-action="play"><i class="fa fa-play"></i> Play</button><button data-action="reset"' + resetDisabled + '><i class="fa fa-undo"></i> Reset</button> <button data-action="rewind"><i class="fa fa-step-backward"></i> Last turn</button><button data-action="ff"><i class="fa fa-step-forward"></i> Next turn</button> <button data-action="ffto"><i class="fa fa-fast-forward"></i> Go to turn...</button><button data-action="switchSides"><i class="fa fa-random"></i> Switch sides</button>');
			} else {
				$('.replay-controls').html('<button data-action="pause"><i class="fa fa-pause"></i> Pause</button><button data-action="reset"><i class="fa fa-undo"></i> Reset</button> <button data-action="rewind"><i class="fa fa-step-backward"></i> Last turn</button><button data-action="ff"><i class="fa fa-step-forward"></i> Next turn</button> <button data-action="ffto"><i class="fa fa-fast-forward"></i> Go to turn...</button><button data-action="switchSides"><i class="fa fa-random"></i> Switch sides</button>');
			}
		}
		function changeSetting(type, value) {
			var chooser = $('.' + type + 'chooser');
			chooser.find('button').removeClass('sel');
			chooser.find('button[value=' + value + ']').addClass('sel');
			if (type === 'color') {
				$(document.body).toggleClass('dark', value === 'dark');
			} else if (type === 'sound') {
				replay.muted = value === 'off';
				replay.battle.setMute(replay.muted);
			} else if (type === 'speed') {
				replay.battle.messageDelay = {fast: 8, normal: 800, slow: 2500, reallyslow: 5000}[value] || 8;
			}
		}
		window.addEventListener('load', function () {
			var log = $('script.battle-log-data').text() || '';
			replay.battle = new Battle({
				id: $('input[name=replayid]').val() || '',
				$frame: $('.battle'),
				$logFrame: $('.battle-log'),
				log: log.split('\\n'),
				isReplay: true,
				paused: true
			});
			if (window.HTMLAudioElement) $('.soundchooser').show();
			replay.battle.subscribe(update);
			update();
			$('.replay-controls-2').on('click', 'button', function (e) {
				e.preventDefault();
				var parent = $(e.currentTarget).closest('.chooser');
				var type = parent.hasClass('colorchooser') ? 'color' : parent.hasClass('soundchooser') ? 'sound' : 'speed';
				changeSetting(type, e.currentTarget.value);
			});
			$('.replay-controls').on('click', 'button', function (e) {
				var action = e.currentTarget.getAttribute('data-action');
				if (!action) return;
				e.preventDefault();
				if (action === 'play') replay.battle.play();
				if (action === 'pause') replay.battle.pause();
				if (action === 'reset') replay.battle.reset();
				if (action === 'ff') replay.battle.skipTurn();
				if (action === 'rewind') replay.battle.seekTurn(replay.battle.turn - 1);
				if (action === 'switchSides') replay.battle.switchSides();
				if (action === 'ffto') {
					var turn = prompt('Turn?');
					if (!turn || !turn.trim()) return;
					if (turn === 'e' || turn === 'end' || turn === 'f' || turn === 'finish') turn = Infinity;
					turn = Number(turn);
					if (isNaN(turn) || turn < 0) alert('Invalid turn');
					else replay.battle.seekTurn(turn);
				}
			});
		});
	})();
	</script>
</body>
</html>`;
}

function renderIndex(replays: ReplaySummaryRow[]) {
	const rows = replays.map(replay => {
		const summary = replaySummary(replay);
		const uploaded = new Date(summary.uploadtime * 1000).toISOString().slice(0, 10);
		return `<li><a href="/${escapeHTML(summary.id)}"><small>[${escapeHTML(summary.format)}]</small> ` +
			`<strong>${escapeHTML(summary.p1)}</strong> vs. <strong>${escapeHTML(summary.p2)}</strong>` +
			` <small>${uploaded}${summary.rating ? ` | ${escapeHTML(summary.rating)}` : ''}</small></a></li>`;
	}).join('\n');
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Replays</title>
	<style>
		body { margin: 0; padding: 24px; background: #f5f5f5; color: #222; font: 14px Arial, sans-serif; }
		main { max-width: 760px; margin: 0 auto; }
		a { color: #224488; text-decoration: none; }
		a:hover { text-decoration: underline; }
		li { margin: 8px 0; }
	</style>
</head>
<body>
	<main>
		<h1>Replays</h1>
		<p>Use <code>/savereplay</code> in a battle to save a replay.</p>
		<h2>Recent replays</h2>
		<ul>${rows || '<li>No public replays found.</li>'}</ul>
	</main>
</body>
</html>`;
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
	const host = req.headers.host || 'localhost';
	const url = new URL(req.url || '/', `http://${host}`);
	const pathname = decodeURIComponent(url.pathname);
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		write(res, 405, 'Method not allowed', {
			'Allow': 'GET, HEAD',
			'Content-Type': 'text/plain; charset=utf-8',
		});
		return;
	}

	if (pathname === '/') {
		const replays = await recentReplays();
		write(res, 200, renderIndex(replays), { 'Content-Type': 'text/html; charset=utf-8' });
		return;
	}
	if (pathname === '/search.json') {
		const replays = await searchReplays(url);
		writeJSON(res, 200, replays.map(replaySummary));
		return;
	}
	if (pathname.startsWith('/battle-')) {
		res.writeHead(302, { 'Location': `/${pathname.slice('/battle-'.length)}${url.search}` });
		res.end();
		return;
	}

	const match = /^\/([A-Za-z0-9-]+?)(?:\.(json|log))?$/.exec(pathname);
	if (!match) {
		notFound(res);
		return;
	}
	const replay = await loadReplay(match[1]);
	if (!replay) {
		notFound(res);
		return;
	}
	const noIndex = replay.private ? { 'X-Robots-Tag': 'noindex' } : {};
	if (match[2] === 'json') {
		write(res, 200, JSON.stringify(replayJSON(replay)), {
			'Content-Type': 'application/json; charset=utf-8',
			'Access-Control-Allow-Origin': '*',
			...noIndex,
		});
	} else if (match[2] === 'log') {
		write(res, 200, replay.log.replace(/\r/g, ''), {
			'Content-Type': 'text/plain; charset=utf-8',
			'Access-Control-Allow-Origin': '*',
			...noIndex,
		});
	} else {
		write(res, 200, renderReplayPage(req, replay), {
			'Content-Type': 'text/html; charset=utf-8',
			...noIndex,
		});
	}
}

const server = http.createServer((req, res) => {
	void handle(req, res).catch(error => {
		console.error(error);
		write(res, 500, 'Internal server error', { 'Content-Type': 'text/plain; charset=utf-8' });
	});
});

const port = Number(process.env.REPLAY_SERVER_PORT || Config.replayserverport || 8001);
const bindAddress = process.env.REPLAY_SERVER_BIND_ADDRESS || Config.replayserverbindaddress || '127.0.0.1';

server.listen(port, bindAddress, () => {
	console.log(`Replay server listening on http://${bindAddress}:${port}`);
	console.log(`Using replay client assets from ${clientOrigin()}`);
	console.log(`Using local replay storage at ${fileReplayDir()}`);
});
