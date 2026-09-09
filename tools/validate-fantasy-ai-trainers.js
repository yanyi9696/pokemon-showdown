'use strict';

const { Trainers } = require('../dist/config/fantasy-ai-trainers');
const { TrainerRegistry, CHALLENGE_FORMATS } = require('../dist/server/fantasy-ai/trainers');
const examples = process.argv.includes('--examples');
const definitions = examples ? require('../config/fantasy-ai-trainers.example.json') : Trainers;
const registry = new TrainerRegistry(definitions, { enabled: true, allowDevelopmentTrainers: examples });
const diagnostics = registry.getDiagnostics();
console.log(examples ? '校验开发样例：' : '校验 config/fantasy-ai-trainers.ts：');
if (!examples && definitions.some(trainer => trainer.developmentOnly)) {
	console.error('正式配置中存在 developmentOnly: true 的训练家，正式模式不会展示该项。');
	process.exitCode = 1;
}
for (const trainer of registry.list()) {
	console.log(`${trainer.id} | ${trainer.name} | ${trainer.format} | 六只队伍合法`);
	if (!CHALLENGE_FORMATS.some(format => format.id === trainer.format)) {
		console.error(`${trainer.id}: 该赛制不在玩家可选的 FC UBUU / FC OU / FC UU 中。`);
		process.exitCode = 1;
	}
}
for (const entry of diagnostics) {
	console.error(`配置第 ${entry.index + 1} 项（${entry.id || '缺少标识'}）：\n${entry.problems.join('\n')}`);
}
if (diagnostics.length) process.exitCode = 1;
if (!definitions.length) console.log('正式训练家配置为空；AI 已开启且允许开发训练家时将使用开发样例。');
