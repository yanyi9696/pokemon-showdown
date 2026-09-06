'use strict';

// Offline development match; deliberately separate from online challenge commands.
const { runOfflineBattle } = require('../dist/server/fantasy-ai/offline');
const { TrainerRegistry } = require('../dist/server/fantasy-ai/trainers');
const fs = require('fs');

const examples = require('../config/fantasy-ai-trainers.example.json');
const registry = new TrainerRegistry(examples, { enabled: true, allowDevelopmentTrainers: true });
const trainer = registry.get('development-balanced');
if (!trainer) throw new Error(JSON.stringify(registry.getDiagnostics()));

const tracePath = process.argv.includes('--trace') ? `logs/fantasy-ai-public-${Date.now()}.log` : '';
const trace = tracePath ? fs.openSync(tracePath, 'w') : null;
try {
	const result = runOfflineBattle({
		trainers: [trainer, trainer], difficulties: ['normal', 'hard'],
		battleSeed: 'gen5,0001000200030004', decisionSeed: 'gen5,0011001200130014', maxTurns: 200,
		strategy: process.argv.includes('--rollout') ? 'rollout' : 'rules',
		onPublicUpdate: trace === null ? undefined : update => { fs.writeSync(trace, `${update}\n`); },
	});
	console.log(JSON.stringify({ ...result, ...(tracePath ? { publicTrace: tracePath } : {}) }, null, 2));
} finally {
	if (trace !== null) fs.closeSync(trace);
}
