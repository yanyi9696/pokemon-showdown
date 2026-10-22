'use strict';
// Summarize saved native-battle probes without touching game accounts or balance.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const root = process.argv[2] || 'docs/playtests/2026-10-22';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const average = list => list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length * 10) / 10 : null;
const counts = list => list.reduce((result, key) => (result[key] = (result[key] || 0) + 1, result), {});
const runs = fs.readdirSync(root).filter(name => name.startsWith('run-')).map(name => {
	const folder = path.join(root, name);
	const metrics = read(path.join(folder, 'driver-state.json')).metrics;
	const finalPath = path.join(folder, 'final-save.json');
	const final = fs.existsSync(finalPath) && fs.statSync(finalPath).mtimeMs >= fs.statSync(path.join(folder, 'driver-state.json')).mtimeMs ? read(finalPath) : undefined;
	const actions = fs.readFileSync(path.join(folder, 'actions.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
	// AI companion rehearsals use native battles but do not settle unless accepted.
	const settled = metrics.battles.filter(row => !row.preview || row.accepted);
	// Resuming an unfinished battle can record the current floor again; keep its latest snapshot.
	const floors = [...new Map(metrics.floors.map(row => [row.floor, row])).values()];
	const stages = [];
	for (let start = 1; start <= 200; start += 20) {
		const end = start + 19, battles = settled.filter(row => row.floor >= start && row.floor <= end);
		const snapshots = floors.filter(row => row.floor >= start && row.floor <= end);
		if (!snapshots.length && !battles.length) continue;
		const last = snapshots.at(-1);
		stages.push({start, end, lastReached: last?.floor, battles: battles.length,
			wins: battles.filter(row => row.won).length, losses: battles.filter(row => !row.won).length,
			turns: battles.reduce((total, row) => total + row.turns, 0), averageTurns: average(battles.map(row => row.turns)),
			faints: battles.reduce((total, row) => total + row.faints, 0),
			moneyRange: snapshots.length ? [Math.min(...snapshots.map(row => row.money)), Math.max(...snapshots.map(row => row.money))] : null,
			lastMoney: last?.money, lastTeam: last?.team, lastRevives: last?.bag.revive || 0,
			routes: counts(actions.filter(row => row.type === 'route' && row.floor >= start && row.floor <= end).map(row => row.kind)),
			bosses: battles.filter(row => row.kind === 'boss').map(row => ({floor: row.floor, name: row.name, won: row.won,
				turns: row.turns, faints: row.faints, ownLevels: row.team.map(mon => mon.level), foeLevels: row.foe.map(mon => mon.level)})),
		});
	}
	const failureRows = metrics.battles.map((row, index) => ({...row, log: `${name}/battle-${index + 1}.log`}))
		.filter(row => !row.won && !row.preview).map(row => ({floor: row.floor, name: row.name, turns: row.turns, faints: row.faints,
			team: row.team, foe: row.foe, moneyBefore: row.moneyBefore, moneyAfter: row.moneyAfter, log: row.log}));
	return {name, profile: metrics.profile, driverVersion: metrics.driverVersion, driverHash: metrics.driverHash,
		started: metrics.started, ended: final ? fs.statSync(finalPath).mtime.toISOString() : null,
		conditions: metrics.conditions, startingSlots: metrics.startingSlots, starters: metrics.starters,
		lastFloor: Math.max(metrics.lastFloor || 0, floors.at(-1)?.floor || 0), phase: final ? metrics.phase : 'running',
		completed: final?.run?.phase === 'complete',
		accountPoints: final?.points, accountBoosts: final?.boosts, accountSlots: final?.slots,
		battleCount: metrics.battles.length, turnCount: metrics.battles.reduce((total, row) => total + row.turns, 0),
		settledBattleCount: settled.length, settledTurnCount: settled.reduce((total, row) => total + row.turns, 0),
		previews: {total: metrics.battles.filter(row => row.preview).length, accepted: metrics.battles.filter(row => row.preview && row.accepted).length,
			discardedLosses: metrics.battles.filter(row => row.preview && !row.won).length},
		winCount: settled.filter(row => row.won).length, lossCount: failureRows.length,
		choices: metrics.choices, issues: metrics.issues, stages, failures: failureRows,
		routeCounts: counts(actions.filter(row => row.type === 'route').map(row => row.kind)),
		eventCounts: counts([...new Map(actions.filter(row => row.type === 'event').map(row => [
			`${row.floor}:${row.event.id}`, row.event.id,
		])).values()]),
		finalTeam: final?.run?.team.map(mon => ({species: mon.set.species, level: mon.set.level, hp: mon.hp, maxhp: mon.maxhp, item: mon.set.item,
			moves: mon.set.moves, stats: mon.stats, training: mon.training, campTraining: mon.campTraining})),
		finalMoney: final?.run?.money, finalGrowth: final?.run?.growth,
		finalBlessings: final?.run?.blessings.owned, purchases: metrics.purchases, comeback: final?.run?.comeback,
		coverageLessons: final?.run?.coverageLessons,
		featureActions: actions.filter(row => row.type === 'action' && ['comeback', 'coverage', 'learnbonus', 'buygrowth'].includes(row.action)),
		rewardChoices: actions.filter(row => row.type === 'action' && row.action === 'rewardchoice').map(row => ({floor: row.floor, value: row.value})),
		resumes: actions.filter(row => row.type === 'resume'),
		interruptedRecoveries: actions.filter(row => row.type === 'interrupted-recovery'),
	};
});
const trackedInputs = ['tools/fantasy-rogue-prepared-playtest.js', 'tools/fantasy-rogue-blessing-playtest.js',
	'dist/server/fantasy-rogue/engine.js', 'dist/server/fantasy-rogue/early-balance.js', 'dist/sim/rogue-blessing-data.js',
	'dist/sim/rogue-number-blessings.js', 'dist/server/fantasy-rogue/fusion.js', 'dist/sim/rogue-spinda.js',
	'dist/server/fantasy-rogue/comeback.js', 'dist/server/fantasy-rogue/coverage.js', 'dist/server/fantasy-rogue/growth.js',
	'dist/server/fantasy-rogue/reward-scenes.js', 'dist/sim/fantasy-rogue-blessings.js'];
const evidence = {generated: new Date().toISOString(),
	serverHead: cp.execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
	scope: 'Isolated SQLite accounts; ordinary game commands and native battle settlement. Automated decision policies are not a human or browser usability test. No forced wins, grants or completed-battle rewinds.',
	inputs: Object.fromEntries(trackedInputs.filter(file => fs.existsSync(file)).map(file => [file,
		crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])), runs,
	controlledProbes: read(path.join(root, 'blessing-probes.json'))};
fs.writeFileSync(path.join(root, 'playtest-evidence.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(runs.map(run => ({name: run.name, floor: run.lastFloor, phase: run.phase,
	battles: run.battleCount, losses: run.lossCount, turns: run.turnCount})), null, 2));
