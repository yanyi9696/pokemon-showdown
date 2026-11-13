'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { deflateSync } = require('node:zlib');
const { importPack } = require('../../tools/import-rogue-fusion-art.cjs');

// Synthetic transparent PNG, no third-party artwork.
function png() {
	function chunk(type, data) {
		const content = Buffer.concat([Buffer.from(type), data]);
		let crc = 0xffffffff;
		for (const byte of content) {
			crc ^= byte;
			for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
		}
		const out = Buffer.alloc(data.length + 12);
		out.writeUInt32BE(data.length); content.copy(out, 4); out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
		return out;
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(96); header.writeUInt32BE(96, 4);
	header[8] = 8; header[9] = 6;
	return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
		chunk('IDAT', deflateSync(Buffer.alloc(96 * (96 * 4 + 1)))), chunk('IEND', Buffer.alloc(0))]);
}

describe('Potara explicit local artwork import', () => {
	let root, server, client, catalog, manifest, entry, output;
	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-fusion-import-'));
		server = path.join(root, 'server'); client = path.join(root, 'client');
		catalog = path.join(server, 'data/fantasy-rogue/fusion-art.ts'); manifest = path.join(root, 'pack.json');
		output = path.join(client, 'play.pokemonshowdown.com/sprites/fantasy-rogue/fusions');
		for (const dir of [path.dirname(catalog), path.join(server, 'dist/sim'),
			path.join(client, 'play.pokemonshowdown.com/src')]) fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(catalog, 'export const FusionArtwork: Record<string, unknown> = {};\n');
		fs.writeFileSync(path.join(server, 'dist/sim/dex.js'),
			`module.exports = require(${JSON.stringify(require.resolve('../../dist/sim/dex'))});\n`);
		fs.writeFileSync(path.join(client, 'play.pokemonshowdown.com/src/battle-dex.ts'), '');
		fs.writeFileSync(path.join(root, '25.6.png'), png());
		entry = { head: 'Pikachu', body: 'Charizard', file: '25.6.png', artist: 'Test author',
			source: 'https://example.org/fixture', permission: 'Synthetic unit-test asset' };
	});
	afterEach(() => {
		assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
		assert(path.basename(root).startsWith('rogue-fusion-import-'));
		fs.rmSync(root, { recursive: true, force: true });
	});
	function run(entries = [entry], write = false) {
		fs.writeFileSync(manifest, JSON.stringify({ version: 1, entries }));
		return importPack(manifest, client, write, server);
	}
	it('dry-runs without writing, then imports immutable artwork and credits idempotently', () => {
		const before = fs.readFileSync(catalog, 'utf8'), dry = run();
		assert.equal(dry.assets[0].key, 'pikachu:charizard');
		assert.match(dry.assets[0].sprite, /^25\.6-[a-f0-9]{12}$/);
		assert.equal(fs.readFileSync(catalog, 'utf8'), before); assert(!fs.existsSync(output));
		const imported = run([entry], true), sprite = imported.assets[0].sprite;
		assert(fs.readFileSync(path.join(output, sprite + '.png')).equals(png()));
		assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'credits.json')))['pikachu:charizard'].artist, entry.artist);
		assert.deepEqual(run([entry], true), imported);
		assert.throws(() => run([{ ...entry, artist: 'Changed author' }], true), /Existing pair/);
	});
	it('validates the whole pack before writing and rejects traversal, URLs and missing attribution', () => {
		for (const bad of [{ file: '../25.6.png' }, { source: 'javascript:alert(1)' },
			{ source: 'https://secret:secret@example.org/a' }, { artist: '' }, { permission: '' }, { head: 'missing-species' }]) {
			assert.throws(() => run([entry, { ...entry, ...bad }], true));
			assert(!fs.existsSync(output)); assert(fs.readFileSync(catalog, 'utf8').endsWith('= {};\n'));
		}
	});
	it('rejects malformed image headers and oversized files', () => {
		for (const bytes of [Buffer.from('not a PNG'), Buffer.alloc(2 * 1024 * 1024 + 1)]) {
			fs.writeFileSync(path.join(root, '25.6.png'), bytes);
			assert.throws(() => run(), /PNG/);
		}
	});
});
