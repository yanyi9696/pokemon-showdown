'use strict';
// Explicit local pack import. Never crawls a third-party sprite server.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

function importPack(packFile, clientRoot, write = false, serverRoot = path.resolve(__dirname, '..')) {
	const {Dex, toID} = require(path.join(serverRoot, 'dist/sim/dex'));
	const dex = Dex.mod('gen9fantasy');
	const packRoot = path.dirname(path.resolve(packFile));
	const pack = JSON.parse(fs.readFileSync(packFile, 'utf8').replace(/^\uFEFF/, ''));
	if (pack.version !== 1 || !Array.isArray(pack.entries) || !pack.entries.length) throw new Error('Expected version 1 and nonempty entries.');
	const catalogFile = path.join(serverRoot, 'data/fantasy-rogue/fusion-art.ts');
	const source = fs.readFileSync(catalogFile, 'utf8');
	const marker = source.indexOf(' = ');
	const catalog = JSON.parse(source.slice(marker + 3).trim().replace(/;$/, ''));
	const output = path.join(path.resolve(clientRoot), 'play.pokemonshowdown.com/sprites/fantasy-rogue/fusions');
	if (!fs.existsSync(path.join(clientRoot, 'play.pokemonshowdown.com/src/battle-dex.ts'))) throw new Error('Expected client source root.');
	const assets = [];
	for (const entry of pack.entries) {
		if (!/^[1-9]\d{0,3}\.[1-9]\d{0,3}[a-z]{0,3}\.png$/.test(entry.file || '')) throw new Error('Expected head.body.png basename.');
		const head = dex.species.get(entry.head), body = dex.species.get(entry.body);
		if (!head.exists || !body.exists || head.id !== toID(entry.head) || body.id !== toID(entry.body)) throw new Error('Use exact existing species names, including forms.');
		if (typeof entry.artist !== 'string' || !entry.artist.trim() || typeof entry.permission !== 'string' || !entry.permission.trim()) {
			throw new Error('Artist and permission reference are required.');
		}
		const url = new URL(entry.source);
		if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Source must be public HTTPS without credentials.');
		const bytes = fs.readFileSync(path.join(packRoot, entry.file));
		if (bytes.length < 45 || bytes.length > 2 * 1024 * 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
			bytes.subarray(12, 16).toString() !== 'IHDR' || bytes.subarray(-8, -4).toString() !== 'IEND' ||
			![96, 288].includes(bytes.readUInt32BE(16)) || bytes.readUInt32BE(16) !== bytes.readUInt32BE(20)) {
			throw new Error('Expected a square 96px or 288px PNG with IHDR/IEND, at most 2 MiB.');
		}
		const hash = createHash('sha256').update(bytes).digest('hex');
		const sprite = `${entry.file.slice(0, -4)}-${hash.slice(0, 12)}`;
		const key = `${head.id}:${body.id}`;
		const item = {head: head.id, body: body.id, sprite, artist: entry.artist.trim(), source: url.href, permission: entry.permission.trim()};
		if (catalog[key] && JSON.stringify(catalog[key]) !== JSON.stringify(item)) throw new Error(`Existing pair ${key} differs; preserve previously saved artwork.`);
		const file = path.join(output, sprite + '.png');
		if (fs.existsSync(file) && !fs.readFileSync(file).equals(bytes)) throw new Error(`Content collision: ${sprite}`);
		catalog[key] = item;
		assets.push({file, bytes, sprite, key, sha256: hash});
	}
	if (write) {
		fs.mkdirSync(output, {recursive: true});
		for (const asset of assets) if (!fs.existsSync(asset.file)) fs.writeFileSync(asset.file, asset.bytes, {flag: 'wx'});
		fs.writeFileSync(path.join(output, 'credits.json'), JSON.stringify(catalog, null, 2) + '\n');
		fs.writeFileSync(catalogFile, source.slice(0, marker + 3) + JSON.stringify(catalog, null, 2) + ';\n');
	}
	return {write, assets: assets.map(({key, sprite, sha256}) => ({key, sprite, sha256}))};
}

if (require.main === module) {
	const args = process.argv.slice(2), value = flag => args[args.indexOf(flag) + 1];
	if (!args.includes('--pack') || !args.includes('--client-root')) {
		throw new Error('Usage: node tools/import-rogue-fusion-art.cjs --pack <manifest.json> --client-root <client source> [--write]');
	}
	console.log(JSON.stringify(importPack(value('--pack'), value('--client-root'), args.includes('--write')), null, 2));
}
module.exports = {importPack};
