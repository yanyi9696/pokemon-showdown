'use strict';

// Offline development match; deliberately separate from online challenge commands.
const { runOfflineBattle } = require('../dist/server/fantasy-ai/offline');
const { TrainerRegistry } = require('../dist/server/fantasy-ai/trainers');

const examples = require('../config/fantasy-ai-trainers.example.json');
const registry = new TrainerRegistry(examples, { enabled: true, allowDevelopmentTrainers: true });
const trainer = registry.get('development-balanced');
if (!trainer) throw new Error(JSON.stringify(registry.getDiagnostics()));

console.log(JSON.stringify(runOfflineBattle({
	trainers: [trainer, trainer], difficulties: ['normal', 'hard'],
	battleSeed: 'gen5,0001000200030004', decisionSeed: 'gen5,0011001200130014', maxTurns: 200,
}), null, 2));
