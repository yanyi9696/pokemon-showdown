'use strict';

// Detached, identical first-turn positions. This measures scheduling, not playing strength or web loading.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');
const { setTimeout: delay } = require('timers/promises');
const { Battle, extractChannelMessages } = require('../dist/sim/battle');
const { Format } = require('../dist/sim/dex-formats');
const { trainerBossCandidates } = require('../dist/server/fantasy-rogue/trainer-bosses');
const { decideDoubles } = require('../dist/server/fantasy-ai/doubles-worker');
const { DecisionScheduler } = require('../dist/server/fantasy-ai/scheduler');

const output = process.argv[2];
if (!output || !path.isAbsolute(output) || fs.existsSync(output)) {
	throw new Error('Pass a new absolute JSON output path; existing evidence is never overwritten.');
}
const seed = 'gen5,0001000200030004';
const trainer = { id: 'worker-benchmark', format: 'gen9fantasy', packedTeam: '', keyMembers: [], resourcePreferences: [] };
const labels = ['winona:100', 'roxie:100', 'valerie:100', 'brock:160', 'sabrina:160', 'nessa:160'];
function observation(label) {
	const [id, floor] = label.split(':');
	const entry = trainerBossCandidates(Number(floor), 50, true).find(candidate => candidate.trainer.id === id);
	if (!entry) throw new Error(`No authored team: ${label}`);
	const battle = new Battle({
		format: new Format({ name: 'Worker timing fixture', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
		seed, p1: { team: structuredClone(entry.team) }, p2: { team: structuredClone(entry.team) },
	});
	try {
		return { ownSide: 'p2', difficulty: 'normal', request: structuredClone(battle.p2.activeRequest),
			publicLog: extractChannelMessages(battle.log.join('\n'), [0])[0] };
	} finally { battle.destroy(); }
}
async function timed(work) {
	await delay(1);
	const begin = performance.now();
	let previous = begin, maxTimerGapMs = 0, ticks = 0;
	const interval = setInterval(() => {
		const now = performance.now(); maxTimerGapMs = Math.max(maxTimerGapMs, now - previous);
		previous = now; ticks++;
	}, 5);
	const firstTimer = new Promise(resolve => { setTimeout(() => resolve(performance.now() - begin), 0); });
	try {
		const value = await work();
		const wallMs = performance.now() - begin, ticksDuringDecision = ticks;
		const firstTimerDelayMs = await firstTimer;
		return { value, wallMs, firstTimerDelayMs, maxTimerGapMs, ticksDuringDecision };
	} finally { clearInterval(interval); }
}
async function main() {
	const positions = labels.map(label => ({ label, observation: observation(label) }));
	const scheduler = new DecisionScheduler({ workers: 1, decisionMs: 5000 });
	scheduler.register('benchmark', 'one');
	let sequence = 0;
	const background = (position, jointTurns) => scheduler.submit({
		key: { roomId: 'benchmark', instanceId: 'one', rqid: ++sequence }, trainer, seed,
		observation: position, doubles: { allowSwitch: false, jointTurns }, budgetMs: 5000, wallClockMs: 5000,
	});
	const rows = [];
	try {
		const cold = await timed(() => background(positions[0].observation, false));
		if (cold.value.status !== 'completed') throw new Error(`Cold worker: ${cold.value.status}`);
		const coldWorker = { ...cold, value: undefined, computeMs: cold.value.decision.elapsedMs };
		for (const jointTurns of [false, true]) for (let repeat = 0; repeat < 3; repeat++) {
			for (const position of positions) {
				const direct = () => timed(() => decideDoubles(position.observation, trainer.format, [],
					{ allowSwitch: false, jointTurns }));
				const scheduled = () => timed(() => background(position.observation, jointTurns));
				const [sync, worker] = repeat % 2 ? await (async () => {
					const second = await scheduled(); return [await direct(), second];
				})() : [await direct(), await scheduled()];
				const decision = worker.value.decision;
				const identical = sync.value.choice === decision?.choice &&
					JSON.stringify(sync.value.candidates) === JSON.stringify(decision?.candidates);
				rows.push({ label: position.label, repeat, jointTurns, identical, status: worker.value.status,
					choice: decision?.choice, sync: { ...sync, value: undefined, computeMs: sync.value.elapsedMs },
					worker: { ...worker, value: undefined, computeMs: decision?.elapsedMs, queueMs: worker.value.queueMs } });
			}
		}
		const report = { created: new Date().toISOString(), method: '6 authored first-turn positions, 3 repeats, alternating order',
			limitations: 'Synthetic local scheduling benchmark; no strength, live server, Edge or webpage performance claim.',
			machine: { cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length, ramGiB: os.totalmem() / 2 ** 30,
				platform: os.platform(), node: process.version }, coldWorker, rows };
		fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
		if (rows.some(row => !row.identical || row.status !== 'completed')) throw new Error('Decision mismatch or unfinished worker');
		process.stdout.write(`Saved ${rows.length} matching comparisons to ${output}\n`);
	} finally { await scheduler.dispose(); }
}
void main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
