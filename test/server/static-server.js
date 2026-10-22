'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { once } = require('events');
const { PassThrough } = require('stream');
const { StaticServer, createStaticRequestHandler } = require('../../dist/server/static-server');

describe('Static HTTP responses', function () {
	this.timeout(10000);
	let directory, roots, server, port, calls, sockets;
	const content = '0123456789';
	const missing = '<h1>Test 404</h1>';
	beforeEach(async () => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-static-test-'));
		roots = { static: path.join(directory, 'public'), css: path.join(directory, 'config'), avatars: path.join(directory, 'config/avatars') };
		for (const root of Object.values(roots)) fs.mkdirSync(root, { recursive: true });
		fs.writeFileSync(path.join(roots.static, 'index.html'), content);
		fs.writeFileSync(path.join(roots.static, 'file.txt'), content);
		fs.writeFileSync(path.join(roots.static, 'empty.txt'), '');
		fs.writeFileSync(path.join(roots.static, '404.html'), missing);
		fs.writeFileSync(path.join(roots.static, '.env'), 'PRIVATE_TEST_VALUE');
		fs.mkdirSync(path.join(roots.static, '.git'));
		fs.writeFileSync(path.join(roots.static, '.git/config'), 'PRIVATE_TEST_VALUE');
		fs.writeFileSync(path.join(roots.css, 'custom.css'), 'body { color: red; }');
		fs.writeFileSync(path.join(roots.css, 'config.js'), 'PRIVATE_TEST_VALUE');
		fs.writeFileSync(path.join(roots.avatars, 'trainer.png'), 'public avatar');
		const config = { customhttpresponse(req, res) {
			if (req.url === '/custom-hook') { res.end('custom response'); return true; }
			if (req.url === '/custom-ended') res.end('already ended');
		} };
		const handler = createStaticRequestHandler(config, roots);
		calls = [];
		server = http.createServer((req, res) => {
			const record = { url: req.url, heads: 0, ends: 0, errors: [] };
			calls.push(record);
			const writeHead = res.writeHead, end = res.end;
			res.writeHead = function (...args) { record.heads++; return writeHead.apply(this, args); };
			res.end = function (...args) { record.ends++; return end.apply(this, args); };
			res.on('error', error => record.errors.push(error));
			handler(req, res);
		});
		sockets = new Set();
		server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		port = server.address().port;
	});
	let restore;
	afterEach(async () => {
		restore?.(); restore = undefined;
		for (const socket of sockets) socket.destroy();
		await new Promise(resolve => { server.close(resolve); });
		assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
		assert(path.basename(directory).startsWith('ps-static-test-'));
		fs.rmSync(directory, { recursive: true, force: true });
		for (const record of calls) {
			assert(record.heads <= 1, `duplicate writeHead: ${record.url}`);
			assert(record.ends <= 1, `duplicate end: ${record.url}`);
			assert.deepEqual(record.errors, []);
		}
	});
	function request(url = '/', method = 'GET', headers = {}) {
		return new Promise((resolve, reject) => {
			const req = http.request({ host: '127.0.0.1', port, path: url, method, headers, agent: false }, res => {
				const chunks = [];
				res.on('data', data => chunks.push(data));
				res.on('error', reject);
				res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
			});
			req.on('error', reject);
			req.end();
		});
	}
	for (const url of ['/', '/lobby', '/battle-gen9ou-123', '/file.txt?version=1', 'http://static.example/file.txt?version=1']) {
		it(`serves GET ${url} once`, async () => {
			const result = await request(url);
			assert.equal(result.status, 200); assert.equal(result.body, content);
			assert.equal(Number(result.headers['content-length']), content.length);
			assert.equal(result.headers['cache-control'], 'max-age=3600');
		});
	}
	it('serves custom CSS and avatars from only their intended public locations', async () => {
		assert.equal((await request('/custom.css?v=1')).body, 'body { color: red; }');
		assert.equal((await request('/avatars/trainer.png')).body, 'public avatar');
		assert.equal((await request('/config.js')).status, 404);
	});
	for (const method of ['GET', 'HEAD']) {
		it(`finishes a custom ${method} 404 exactly once`, async () => {
			const result = await request('/absent.txt', method);
			assert.equal(result.status, 404); assert.equal(result.body, method === 'HEAD' ? '' : missing);
			assert.equal(Number(result.headers['content-length']), missing.length);
			await new Promise(resolve => { setImmediate(resolve); });
			assert.equal(calls[0].heads, 1); assert.equal(calls[0].ends, 1);
		});
	}
	it('sends HEAD metadata without opening a file stream or applying Range', async () => {
		const createReadStream = fs.createReadStream;
		fs.createReadStream = () => { throw new Error('HEAD must not stream'); };
		restore = () => { fs.createReadStream = createReadStream; };
		const result = await request('/', 'HEAD', { Range: 'bytes=0-2' });
		assert.equal(result.status, 200); assert.equal(result.body, '');
		assert.equal(Number(result.headers['content-length']), content.length);
	});
	it('handles zero-length files', async () => {
		const result = await request('/empty.txt');
		assert.equal(result.status, 200); assert.equal(result.body, '');
		assert.equal(result.headers['content-length'], '0');
		assert.equal((await request('/empty.txt', 'GET', { Range: 'bytes=0-0' })).status, 416);
	});
	it('returns one bodyless 304 for GET and HEAD with ETag or Last-Modified validators', async () => {
		const initial = await request();
		for (const method of ['GET', 'HEAD']) for (const headers of [
			{ 'If-None-Match': initial.headers.etag },
			{ 'If-None-Match': `"other", W/${initial.headers.etag}` },
			{ 'If-None-Match': '*' },
			{ 'If-Modified-Since': initial.headers['last-modified'] },
		]) {
			const result = await request('/', method, headers);
			assert.equal(result.status, 304); assert.equal(result.body, '');
			assert.equal(result.headers['content-length'], undefined);
		}
		const stale = await request('/', 'GET', { 'If-None-Match': '"stale"', 'If-Modified-Since': 'Wed, 01 Jan 2031 00:00:00 GMT' });
		assert.equal(stale.status, 200); assert.equal(stale.body, content);
	});
	for (const [range, body, contentRange] of [
		['bytes=0-0', '0', 'bytes 0-0/10'], ['bytes=2-5', '2345', 'bytes 2-5/10'],
		['bytes=7-', '789', 'bytes 7-9/10'], ['bytes=-3', '789', 'bytes 7-9/10'],
		['bytes=-50', content, 'bytes 0-9/10'], ['bytes=8-500', '89', 'bytes 8-9/10'],
	]) {
		it(`streams a single 206 response for ${range}`, async () => {
			const result = await request('/file.txt', 'GET', { Range: range });
			assert.equal(result.status, 206); assert.equal(result.body, body);
			assert.equal(result.headers['content-range'], contentRange);
			assert.equal(Number(result.headers['content-length']), body.length);
		});
	}
	for (const range of ['bytes=10-', 'bytes=100-200', 'bytes=-0']) {
		it(`ends unsatisfiable ${range} with 416`, async () => {
			const result = await request('/file.txt', 'GET', { Range: range });
			assert.equal(result.status, 416); assert.equal(result.body, '');
			assert.equal(result.headers['content-range'], 'bytes */10');
		});
	}
	it('ignores malformed, unsupported and multiple ranges', async () => {
		for (const range of ['bytes=3-2', 'bytes=oops', 'items=1-3', 'bytes=0-1,3-4']) {
			const result = await request('/file.txt', 'GET', { Range: range });
			assert.equal(result.status, 200); assert.equal(result.body, content);
		}
	});
	it('honors If-Range and gives cache validators precedence over Range', async () => {
		const initial = await request('/file.txt');
		for (const validator of [initial.headers.etag, initial.headers['last-modified']]) {
			assert.equal((await request('/file.txt', 'GET', { Range: 'bytes=0-2', 'If-Range': validator })).body, '012');
		}
		for (const validator of [
			'"stale"', `W/${initial.headers.etag}`,
			'Thu, 01 Jan 1970 00:00:00 GMT', 'Wed, 01 Jan 2031 00:00:00 GMT',
		]) {
			assert.equal((await request('/file.txt', 'GET', { Range: 'bytes=0-2', 'If-Range': validator })).body, content);
		}
		assert.equal((await request('/file.txt', 'GET', { Range: 'bytes=0-2', 'If-None-Match': initial.headers.etag })).status, 304);
		assert.equal((await request('/missing.txt', 'GET', { Range: 'bytes=0-2', 'If-None-Match': '*' })).status, 404);
	});
	for (const url of [
		'/.env', '/%2eenv', '/.git/config', '/%2e%2e/config/config.js', '/avatars/../config.js',
		'/avatars/%2e%2e%2fconfig.js', '/avatars/%5c..%5cconfig.js', '/avatars/trainer.png::$DATA', '/file.txt%00',
	]) {
		it(`does not expose private fixture data through ${url}`, async () => {
			const result = await request(url);
			assert.equal(result.status, 404); assert.equal(result.body, missing);
		});
	}
	it('does not serve files through an out-of-root directory junction/symlink', async () => {
		fs.symlinkSync(roots.css, path.join(roots.static, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
		const result = await request('/linked/config.js');
		assert.equal(result.status, 403); assert(!result.body.includes('PRIVATE_TEST_VALUE'));
	});
	it('does not expose hidden files through a public directory index', async () => {
		fs.mkdirSync(path.join(roots.static, 'bundle/data'), { recursive: true });
		fs.writeFileSync(path.join(roots.static, 'bundle/data/index.json'), JSON.stringify({ files: ['../../.env'] }));
		const result = await request('/bundle/data/');
		assert.equal(result.status, 403); assert(!result.body.includes('PRIVATE_TEST_VALUE'));
	});
	it('handles bad URL escapes and unsupported methods without hanging', async () => {
		assert.equal((await request('/%ZZ')).status, 400);
		const result = await request('/', 'POST');
		assert.equal(result.status, 405); assert.equal(result.headers.allow, 'GET, HEAD');
	});
	it('preserves custom responses, including a hook that already ended without returning true', async () => {
		assert.equal((await request('/custom-hook')).body, 'custom response');
		assert.equal((await request('/custom-ended')).body, 'already ended');
	});
	it('lets SockJS own its transport requests while preserving static HTTP routes', async () => {
		const transport = require('sockjs').createServer({ prefix: '/showdown', log() {} });
		transport.installHandlers(server, {});
		const info = await request('/showdown/info');
		assert.equal(info.status, 200);
		assert.equal(JSON.parse(info.body).websocket, true);
		const preflight = await request('/showdown/info', 'OPTIONS', { Origin: 'https://client.example' });
		assert.equal(preflight.status, 204);
		assert.equal(preflight.headers['access-control-allow-origin'], 'https://client.example');
		assert.equal((await request('/')).body, content);
		assert.equal((await request('/missing.txt')).status, 404);
		assert.equal(calls.length, 2, 'SockJS must not pass transport requests to node-static');
	});
	it('ends a missing custom 404 fallback without an unhandled emitter error', async () => {
		fs.unlinkSync(path.join(roots.static, '404.html'));
		const result = await request('/missing.txt');
		assert.equal(result.status, 404); assert.equal(result.body, '');
	});
	it('preserves directory redirects and custom index files', async () => {
		fs.mkdirSync(path.join(roots.avatars, 'nested'));
		fs.writeFileSync(path.join(roots.avatars, 'nested/index.html'), 'nested');
		const redirect = await request('/avatars/nested');
		assert.equal(redirect.status, 301); assert.equal(redirect.headers.location, '/avatars/nested/');
		assert.equal((await request('/avatars/nested/')).body, 'nested');
	});
	it('preserves concatenated directory indexes for GET and HEAD', async () => {
		const directoryPath = path.join(roots.static, 'bundles/example');
		fs.mkdirSync(directoryPath, { recursive: true });
		fs.writeFileSync(path.join(directoryPath, 'a.txt'), 'first');
		fs.writeFileSync(path.join(directoryPath, 'b.txt'), 'second');
		fs.writeFileSync(path.join(directoryPath, 'index.json'), JSON.stringify({ files: ['a.txt', 'b.txt'] }));
		for (const method of ['GET', 'HEAD']) {
			const result = await request('/bundles/example/', method);
			assert.equal(result.status, 200);
			assert.equal(result.body, method === 'HEAD' ? '' : 'firstsecond');
			assert.equal(Number(result.headers['content-length']), 11);
		}
	});
	it('cancels an active file stream when the client disconnects', async () => {
		let opened;
		const ready = new Promise(resolve => { opened = resolve; });
		const createReadStream = fs.createReadStream;
		const source = new PassThrough();
		fs.createReadStream = () => { opened(); return source; };
		restore = () => { fs.createReadStream = createReadStream; source.destroy(); };
		const req = http.get({ host: '127.0.0.1', port, path: '/file.txt', agent: false });
		req.on('error', () => {});
		await ready;
		source.write('0');
		const [response] = await once(req, 'response');
		response.on('error', () => {});
		const stopped = once(source, 'close');
		req.destroy();
		await stopped;
		assert(source.destroyed);
		assert.equal(calls[0].heads, 1); assert.equal(calls[0].ends, 0);
	});
	it('handles stream errors without retrying headers, ending twice or sending a custom 404', async () => {
		const createReadStream = fs.createReadStream;
		fs.createReadStream = () => {
			const source = new PassThrough();
			setImmediate(() => source.destroy(new Error('simulated read failure')));
			return source;
		};
		restore = () => { fs.createReadStream = createReadStream; };
		await assert.rejects(request('/file.txt'));
		assert.equal(calls[0].heads, 1); assert.equal(calls[0].ends, 0);
	});
	it('does not write a response after a disconnect during filesystem lookup', async () => {
		const realpath = fs.promises.realpath;
		let started, release;
		const ready = new Promise(resolve => { started = resolve; });
		const gate = new Promise(resolve => { release = resolve; });
		fs.promises.realpath = async (...args) => {
			started(); await gate;
			return realpath(...args);
		};
		restore = () => { fs.promises.realpath = realpath; release(); };
		const req = http.get({ host: '127.0.0.1', port, path: '/file.txt', agent: false });
		req.on('error', () => {});
		await ready;
		const disconnected = once([...sockets][0], 'close');
		req.destroy(); await disconnected;
		release(); await new Promise(resolve => { setImmediate(resolve); });
		assert.equal(calls[0].heads, 0); assert.equal(calls[0].ends, 0);
	});
	it('stops after a late node-static finish callback on an already completed response', async () => {
		const base = new StaticServer(roots.static);
		const res = { writableEnded: true, writeHead() { assert.fail('duplicate headers'); }, end() { assert.fail('duplicate end'); } };
		base.finish(404, {}, { method: 'HEAD' }, res);
	});
});
