'use strict';

// Synthetic, equal-level native Multi comparisons against the pre-joint NPC heuristic.
// No player accounts, service ports, private opponent requests or battle RNG enter either policy.
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback;
const runtime = path.resolve(option('runtime', path.join(__dirname, '../dist')));
const { Battle, extractChannelMessages } = require(path.join(runtime, 'sim/battle'));
const { Format } = require(path.join(runtime, 'sim/dex-formats'));
// Both old and new policies play the SAME current authored rosters (including later rule fixes).
const { trainerBossCandidates } = require('../dist/server/fantasy-rogue/trainer-bosses');
const { rankMultiChoices } = require(path.join(runtime, 'server/fantasy-ai/multi-policy'));
const { enumerateDoublesChoices } = require(path.join(runtime, 'server/fantasy-ai/doubles-actions'));
const { RogueCoopController } = require(path.join(runtime, 'server/fantasy-rogue/coop-controller'));
const { splitCoopOpponents } = require(path.join(runtime, 'server/fantasy-rogue/coop-team'));
const { rankDoublesLeads } = require(path.join(runtime, 'server/fantasy-ai/doubles-leads'));

const requestedCases = option('cases', 'winona:100,roxie:100,valerie:100,brock:160,sabrina:160,nessa:160');
const cases = requestedCases === 'all' ? [20, 40, 60, 80, 100, 120, 140, 160, 165, 175, 180, 185, 190]
	.flatMap(floor => trainerBossCandidates(floor, 50, true).map(entry => `${entry.trainer.id}:${floor}`)) :
	requestedCases.split(',');
const seeds = Number(option('seeds', '2')), maxTurns = Number(option('max-turns', '80'));
const output = path.resolve(option('output', 'docs/playtests/doubles-ai-latest.json'));
if (fs.existsSync(output)) throw new Error('Use a new output file; existing benchmark evidence is preserved.');
const partitionMode = option('partition', 'alternating');
const leadMode = option('leads', 'authored');
const turnMode = option('turns', 'moves');
const matchupMode = option('matchups', 'mirror');
const jointTurns = turnMode === 'native';
if (!['mirror', 'cycle', 'roundrobin'].includes(matchupMode)) throw new Error('Unknown matchup mode');
if (matchupMode !== 'mirror' && cases.length < 2) throw new Error('Cross-team comparisons need at least two rosters');
if (matchupMode === 'roundrobin' && cases.length > 18) throw new Error('Select at most 18 round-robin rosters');
if (!['moves', 'native'].includes(turnMode)) throw new Error('Unknown turn mode');
if (!['authored', 'planned', 'joint'].includes(leadMode)) throw new Error('Unknown lead mode');
if (!['alternating', 'contiguous'].includes(partitionMode)) throw new Error('Unknown partition mode');
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 20 || !Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 200) {
	throw new Error('Use 1–20 seeds and 1–200 turns.');
}
const swap = line => line.replace(/(^|\||\[of\] )p([1-4])([ab])?(?=:|\||$)/g,
	(_, prefix, n, position = '') => `${prefix}p${Number(n) % 2 ? Number(n) + 1 : Number(n) - 1}${position}`);
function requestForNPC(request, swapSides) {
	const copy = JSON.parse(JSON.stringify(request));
	if (swapSides && copy.side) {
		copy.side.id = copy.side.id === 'p1' ? 'p2' : 'p4';
		for (const pokemon of copy.side.pokemon) pokemon.ident = swap(pokemon.ident);
	}
	return copy;
}
function fallback(controller, seat, request) {
	const legal = enumerateDoublesChoices(request, { mod: 'gen9fantasy' });
	const suggested = controller.choose(seat, request);
	return legal.find(choice => choice.choice === suggested)?.choice || legal[0]?.choice || 'default';
}
function play(label, team, seed, jointOnLeft, opposingTeam = team) {
	const plan = rankDoublesLeads(team)[0];
	const partition = (roster, planned) => {
		const split = Math.ceil(roster.length / 2);
		const leadPlan = roster === team ? plan : rankDoublesLeads(roster)[0];
		const ordered = planned ? leadPlan.order.map(index => roster[index]) : roster;
		return partitionMode === 'alternating' ? splitCoopOpponents(ordered) :
			{ first: ordered.slice(0, split), second: ordered.slice(split) };
	};
	const left = partition(jointOnLeft ? team : opposingTeam, leadMode === 'planned' || leadMode === 'joint' && jointOnLeft);
	const right = partition(jointOnLeft ? opposingTeam : team, leadMode === 'planned' || leadMode === 'joint' && !jointOnLeft);
	const battle = new Battle({
		format: new Format({ name: 'Fantasy joint AI benchmark', mod: 'gen9fantasy', gameType: 'multi', ruleset: [] }),
		strictChoices: true, seed,
		p1: { name: jointOnLeft ? 'Joint' : 'Baseline', team: structuredClone(left.first) },
		p2: { name: jointOnLeft ? 'Baseline' : 'Joint', team: structuredClone(right.first) },
		p3: { name: 'Left partner', team: structuredClone(left.second) },
		p4: { name: 'Right partner', team: structuredClone(right.second) },
	});
	const result = { label, seed, jointOnLeft, winner: '', turns: 0, decisions: 0, jointDecisions: 0,
		fallbacks: 0, invalid: 0, maxDecisionMs: 0, totalDecisionMs: 0, moves: {}, lastTurns: [],
		mechanicsProbes: 0, mechanicsFailures: {}, omittedVolatiles: {}, leadPlan: plan };
	Object.assign(result, { turnProbes: 0, turnFailures: {}, turnDecisions: 0 });
	const cached = [{}, {}];
	const baselines = [0, 1].map(() => new RogueCoopController({ options: { fantasyRogue: { wild: false } } }));
	let cursor = 0;
	try {
		for (let step = 0; !battle.ended && battle.turn <= maxTurns && step < maxTurns * 12; step++) {
			const delta = battle.log.slice(cursor); cursor = battle.log.length;
			baselines[0].update(delta.map(swap).join('\n')); baselines[1].update(delta.join('\n'));
			const publicLog = extractChannelMessages(battle.log.join('\n'), [0])[0];
			const decisions = {};
			for (const [side, seats] of [['p1', 'p3'], ['p2', 'p4']].entries()) {
				const fixed = {}, pending = [];
				for (const [index, seat] of seats.entries()) {
					const request = battle[seat].activeRequest, virtual = index ? 'p4' : 'p2';
					if (!request || request.wait || battle[seat].isChoiceDone()) { fixed[virtual] = null; continue; }
					cached[side][virtual] = requestForNPC(request, side === 0);
					pending.push([seat, virtual, cached[side][virtual]]);
				}
				if (!pending.length) continue;
				const joint = (side === 0) === jointOnLeft;
				const begin = performance.now();
				const scored = joint && cached[side].p2 && cached[side].p4 ? rankMultiChoices(cached[side],
					side === 0 ? publicLog.map(swap) : publicLog, 'gen9fantasy', { fixed, jointTurns }) : [];
				if (joint) {
					const elapsed = performance.now() - begin;
					result.decisions++; result.totalDecisionMs += elapsed;
					result.maxDecisionMs = Math.max(result.maxDecisionMs, elapsed);
					if (scored.length) result.jointDecisions++;
					else result.fallbacks++;
					const mechanics = scored[0]?.mechanics;
					result.mechanicsProbes += mechanics?.probes || 0;
					result.turnProbes += mechanics?.turnProbes || 0;
					if (scored[0]?.jointTurn) result.turnDecisions++;
					for (const error of mechanics?.turnFailures || []) result.turnFailures[error] = (result.turnFailures[error] || 0) + 1;
					for (const error of mechanics?.failures || []) {
						result.mechanicsFailures[error] = (result.mechanicsFailures[error] || 0) + 1;
					}
					for (const id of mechanics?.omittedVolatiles || []) {
						result.omittedVolatiles[id] = (result.omittedVolatiles[id] || 0) + 1;
					}
				}
				for (const [seat, virtual, request] of pending) {
					decisions[seat] = scored[0]?.commands[virtual] || fallback(baselines[side], virtual, request);
				}
			}
			if (!Object.keys(decisions).length) throw new Error('No pending actions and battle has not ended');
			result.lastTurns.push({ turn: battle.turn, decisions });
			if (result.lastTurns.length > 8) result.lastTurns.shift();
			for (const [seat, choice] of Object.entries(decisions)) {
				const request = battle[seat].activeRequest;
				const index = /^move (\d+)/.exec(choice)?.[1];
				if (index && request?.active) {
					const id = request.active[0].moves[Number(index) - 1]?.id;
					const actor = ((seat === 'p1' || seat === 'p3') === jointOnLeft) ? 'joint' : 'baseline';
					result.moves[`${actor}:${id}`] = (result.moves[`${actor}:${id}`] || 0) + 1;
				}
				if (!battle.choose(seat, choice)) { result.invalid++; throw new Error(`Invalid ${seat} ${choice}`); }
			}
		}
		result.winner = battle.ended ? battle.winner || 'tie' : 'turn-limit';
		result.turns = battle.turn;
	} catch (error) {
		result.turns = battle.turn;
		if (String(error.message).includes('[Invalid choice]')) result.invalid++;
		result.error = error.stack;
		result.winner = 'error';
	} finally {
		battle.destroy();
	}
	return result;
}
const report = { method: `${matchupMode === 'mirror' ? 'Identical' : 'Different'} authored rosters at level 50, same seeds, each policy on each side. Native gen9fantasy Multi. No campaign growth, blessings or human play. Baseline is the retained pre-joint NPC heuristic, with native legal fallback.`, partition: partitionMode, leads: leadMode, results: [] };
report.turns = turnMode;
report.runtime = runtime;
report.matchups = matchupMode;
const rosters = new Map(cases.map(label => {
	const [id, floor] = label.split(':');
	const candidate = trainerBossCandidates(Number(floor), 50, true).find(entry => entry.trainer.id === id);
	if (!candidate || candidate.team.length < 2) throw new Error(`Unknown doubles roster: ${label}`);
	return [label, candidate];
}));
for (const [index, label] of cases.entries()) {
	const floor = Number(label.split(':')[1]);
	const opponents = matchupMode === 'mirror' ? [label] : matchupMode === 'cycle' ?
		[cases[(index + 1) % cases.length]] : cases.filter(other => other !== label);
	for (const opponent of opponents) for (let n = 1; n <= seeds; n++) for (const jointOnLeft of [false, true]) {
		const name = matchupMode === 'mirror' ? label : `${label} vs ${opponent}`;
		const result = play(name, rosters.get(label).team, [2026, 11, floor, n], jointOnLeft, rosters.get(opponent).team);
		report.results.push(result);
		console.log(`${name} seed ${n} ${jointOnLeft ? 'left' : 'right'}: ${result.winner}, ${result.turns} turns`);
	}
}
report.summary = {
	games: report.results.length,
	wins: report.results.filter(result => result.winner === 'Joint' ||
		result.winner === (result.jointOnLeft ? 'Left partner' : 'Right partner')).length,
	losses: report.results.filter(result => result.winner === 'Baseline' ||
		result.winner === (result.jointOnLeft ? 'Right partner' : 'Left partner')).length,
	unfinished: report.results.filter(result => ['turn-limit', 'error'].includes(result.winner)).length,
	maxDecisionMs: Math.max(...report.results.map(result => result.maxDecisionMs)),
	mechanicsProbes: report.results.reduce((total, result) => total + result.mechanicsProbes, 0),
	turnProbes: report.results.reduce((total, result) => total + result.turnProbes, 0),
	turnDecisions: report.results.reduce((total, result) => total + result.turnDecisions, 0),
	turnFailures: report.results.reduce((total, result) =>
		total + Object.values(result.turnFailures).reduce((sum, count) => sum + count, 0), 0),
	mechanicsFailures: report.results.reduce((total, result) =>
		total + Object.values(result.mechanicsFailures).reduce((sum, count) => sum + count, 0), 0),
	errors: report.results.filter(result => result.error).map(result => ({ label: result.label, error: result.error })),
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report.summary, errors: report.summary.errors.length }));
console.log(output);
if (report.summary.errors.length) process.exitCode = 1;
