import type { TrainerDefinition } from '../server/fantasy-ai/types';

// 正式内容由服主提供。缺少正式队伍时保持为空，不自动替换为随机队伍。
// 开发样例见 fantasy-ai-trainers.example.json，必须显式允许开发训练家才可使用。
export const Trainers: TrainerDefinition[] = [];
