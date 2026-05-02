#!/usr/bin/env node
/**
 * Remove old local replay JSON files.
 *
 * Usage:
 *   node tools/cleanup-replays.js --days=30
 *   REPLAYS_DIR=/var/www/pokemon-showdown/logs/replays node tools/cleanup-replays.js --dry-run
 */
'use strict';

const fs = require('fs/promises');
const path = require('path');

function parseArgs(argv) {
	const args = {
		days: Number(process.env.REPLAY_CLEANUP_DAYS || 30),
		dir: process.env.REPLAYS_DIR || 'logs/replays',
		dryRun: false,
	};
	for (const arg of argv) {
		if (arg === '--dry-run') {
			args.dryRun = true;
		} else if (arg.startsWith('--days=')) {
			args.days = Number(arg.slice('--days='.length));
		} else if (arg.startsWith('--dir=')) {
			args.dir = arg.slice('--dir='.length);
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	if (!Number.isFinite(args.days) || args.days <= 0) {
		throw new Error(`Invalid --days value: ${args.days}`);
	}
	if (!args.dir) throw new Error('Replay directory is empty');
	return args;
}

function replayAgeTimestamp(replay, stat) {
	if (replay && Number.isFinite(replay.uploadtime) && replay.uploadtime > 0) {
		return replay.uploadtime * 1000;
	}
	return stat.mtimeMs;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const replayDir = path.resolve(args.dir);
	const cutoff = Date.now() - args.days * 24 * 60 * 60 * 1000;
	let entries;
	try {
		entries = await fs.readdir(replayDir, { withFileTypes: true });
	} catch (error) {
		if (error.code === 'ENOENT') {
			console.log(`Replay directory does not exist: ${replayDir}`);
			return;
		}
		throw error;
	}

	let checked = 0;
	let deleted = 0;
	let skipped = 0;
	let failed = 0;
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
		checked++;
		const filePath = path.join(replayDir, entry.name);
		try {
			const [stat, raw] = await Promise.all([
				fs.stat(filePath),
				fs.readFile(filePath, 'utf8'),
			]);
			let replay = null;
			try {
				replay = JSON.parse(raw);
			} catch {
				skipped++;
				console.warn(`Skipping invalid replay JSON: ${entry.name}`);
				continue;
			}
			const timestamp = replayAgeTimestamp(replay, stat);
			if (timestamp > cutoff) {
				skipped++;
				continue;
			}
			if (args.dryRun) {
				console.log(`[dry-run] delete ${entry.name}`);
			} else {
				await fs.unlink(filePath);
				console.log(`deleted ${entry.name}`);
			}
			deleted++;
		} catch (error) {
			failed++;
			console.warn(`Failed to process ${entry.name}: ${error.message}`);
		}
	}

	const action = args.dryRun ? 'would delete' : 'deleted';
	console.log(
		`Replay cleanup complete: checked=${checked}, ${action}=${deleted}, skipped=${skipped}, failed=${failed}, ` +
		`dir=${replayDir}, days=${args.days}`
	);
	if (failed) process.exitCode = 1;
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
