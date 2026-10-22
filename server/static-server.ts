/** HTTP lifecycle fixes for the optional node-static server (not the SockJS transport). */
import * as fs from 'fs';
import type * as http from 'http';
import * as path from 'path';
import { parse as parseURL } from 'url';
import { Server as NodeStaticServer } from 'node-static';

function closed(res: http.ServerResponse) {
	return res.destroyed || res.writableEnded;
}

function inside(root: string, file: string) {
	const relative = path.relative(root, file);
	return !path.isAbsolute(relative) && relative.split(path.sep).every(part => !part.startsWith('.'));
}

/** Only a satisfiable single byte range is streamed; malformed/multiple ranges are ignored. */
function byteRange(value: string, size: number): { start: number, end: number } | false | undefined {
	const match = /^bytes=(\d*)-(\d*)$/.exec(value);
	if (!match || (!match[1] && !match[2])) return;
	const first = Number(match[1]), last = Number(match[2]);
	if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return;
	if (!match[1]) return last && size ? { start: Math.max(0, size - last), end: size - 1 } : false;
	if (match[2] && last < first) return;
	if (first >= size) return false;
	return { start: first, end: match[2] ? Math.min(last, size - 1) : size - 1 };
}

export class StaticServer extends NodeStaticServer {
	// node-static's stream already ends a response. Its finish() nevertheless writes
	// again for HEAD, 206 and custom 404 responses. Never re-enter that write path.
	override finish: NodeStaticServer['finish'] = (status, headers, req, res, promise, callback) => {
		if (closed(res)) return;
		if (res.headersSent) {
			// A streaming failure cannot be replaced with an HTML error response.
			res.destroy();
			return;
		}
		NodeStaticServer.prototype.finish.call(this, status, headers, req, res, promise, callback);
	};

	override respondNoGzip: NodeStaticServer['respondNoGzip'] = (
		pathname, status, contentType, extraHeaders, files, stat, req, res, finish
	) => {
		// Also check real paths: public directories must not expose symlink targets
		// in config or elsewhere outside their root (including directory indexes).
		const paths = [this.root, ...files.map(file => path.resolve(pathname || '.', file))];
		Promise.all(paths.map(file => fs.promises.realpath(file)))
			.then(([root, ...realFiles]) => {
				if (closed(res) || res.headersSent) return;
				if (realFiles.some(file => !inside(root, file))) return finish(403, {});
				const mtime = stat.mtime.getTime();
				const etag = JSON.stringify([stat.ino, stat.size, mtime].join('-'));
				const modified = new Date(mtime).toUTCString();
				const headers: http.OutgoingHttpHeaders = {
					...this.options.headers, Etag: etag, Date: new Date().toUTCString(),
					'Last-Modified': modified, 'Content-Type': contentType, 'Content-Length': stat.size,
					'Accept-Ranges': 'bytes', ...extraHeaders,
				};
				let start = 0, length = stat.size;
				if (status === 200) {
					const match = req.headers['if-none-match'];
					const since = Date.parse(req.headers['if-modified-since'] || '');
					const fresh = match !== undefined ? match.split(',').some(tag =>
						tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag
					) : since >= Math.floor(mtime / 1000) * 1000;
					if (fresh) return finish(304, {
						...this.options.headers, Etag: etag, Date: headers.Date, 'Last-Modified': modified,
					});
					// RFC 9110: Range applies to GET, and only after conditional requests.
					const ifRange = req.headers['if-range'];
					if (req.method === 'GET' && files.length === 1 && req.headers.range &&
						(!ifRange || ifRange === etag ||
							typeof ifRange === 'string' && Date.parse(ifRange) === Math.floor(mtime / 1000) * 1000)) {
						const range = byteRange(req.headers.range, stat.size);
						if (range === false) return finish(416, { 'Content-Range': `bytes */${stat.size}` });
						if (range) {
							status = 206;
							start = range.start;
							length = range.end - start + 1;
							headers['Content-Range'] = `bytes ${start}-${range.end}/${stat.size}`;
							headers['Content-Length'] = length;
						}
					}
				}
				res.writeHead(status, headers);
				if (req.method === 'HEAD' || !length) {
					res.end();
					return;
				}
				this.stream(pathname, files, length, start, res, error => {
					if (error && !closed(res)) res.destroy();
				});
			}).catch(() => {
				if (!closed(res)) finish(500, {});
			});
	};

	override stream: NodeStaticServer['stream'] = (pathname, files, length, start, res, callback) => {
		let index = 0, current: fs.ReadStream | undefined, done = false;
		const close = () => {
			done = true;
			current?.destroy();
		};
		res.once('close', close);
		const complete = (error?: Error) => {
			if (done) return;
			done = true;
			res.removeListener('close', close);
			if (!closed(res)) {
				if (error) res.destroy();
				else res.end();
			}
			callback(error!);
		};
		const next = () => {
			if (done || closed(res)) return;
			if (index === files.length) return complete();
			current = fs.createReadStream(path.resolve(pathname || '.', files[index++]), {
				start, end: start + length - 1,
			});
			current.once('error', complete);
			current.once('end', next);
			current.pipe(res, { end: false });
		};
		next();
	};
}

export function createStaticRequestHandler(
	config: { customhttpresponse?: typeof Config.customhttpresponse },
	roots = { static: './server/static', css: './config', avatars: './config/avatars' }
) {
	const staticServer = new StaticServer(roots.static);
	const cssServer = new StaticServer(roots.css);
	const avatarServer = new StaticServer(roots.avatars);
	const roomidRegex = /^\/(?:[A-Za-z0-9][A-Za-z0-9-]*)\/?$/;
	return (req: http.IncomingMessage, res: http.ServerResponse) => {
		req.once('end', () => {
			if (req.aborted || closed(res)) return;
			if (config.customhttpresponse?.(req, res) || res.headersSent || closed(res)) return;
			const error = (status: number, headers = {}) => {
				if (closed(res) || res.headersSent) return;
				res.writeHead(status, headers);
				res.end();
			};
			const notFound = () => {
				if (closed(res) || res.headersSent) return;
				staticServer.serveFile('404.html', 404, {}, req, res).on('error', () => error(404));
			};
			if (req.method !== 'GET' && req.method !== 'HEAD') return error(405, { Allow: 'GET, HEAD' });
			let pathname: string;
			try {
				pathname = decodeURIComponent(parseURL(req.url || '/').pathname || '/');
			} catch {
				return error(400);
			}
			// Deny dotfiles, traversal and Windows path syntax before any filesystem lookup.
			if (!pathname.startsWith('/') || /[\\\0:]/.test(pathname) ||
				pathname.split('/').some(part => part.startsWith('.'))) return notFound();
			let server = staticServer;
			if (pathname === '/custom.css') {
				server = cssServer;
			} else if (pathname.startsWith('/avatars/')) {
				pathname = pathname.slice(8);
				server = avatarServer;
			} else if (roomidRegex.test(pathname)) {
				pathname = '/';
				req.url = '/';
			}
			// Decode once above, then use the path API directly (no second URL decoding).
			const target = server.resolve(pathname);
			if (!inside(server.root, target)) return notFound();
			server.servePath(pathname, 200, {}, req, res, (status, headers = {}) => {
				if (status === 404) notFound();
				else error(status, headers);
			});
		});
		req.resume();
	};
}
