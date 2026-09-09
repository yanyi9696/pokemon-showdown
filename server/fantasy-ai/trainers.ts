import { Dex } from '../../sim/dex';
import { Teams } from '../../sim/teams';
import { TeamValidator } from '../../sim/team-validator';
import type {
	ResourcePreference, TrainerDiagnostic, TrainerStyle, TrainerSummary, ValidatedTrainer,
} from './types';

const STYLES: readonly string[] = ['balanced', 'aggressive', 'defensive'];
const RESOURCES: readonly string[] = ['mega', 'zmove', 'terastallize', 'aura'];

/** Formats offered by the player-facing AI challenge page. UBUU is the existing Ubers UU format. */
export const CHALLENGE_FORMATS = Object.freeze([
	{ id: 'gen9fcubersuu', name: 'FC UBUU' },
	{ id: 'gen9fcou', name: 'FC OU' },
	{ id: 'gen9fcuu', name: 'FC UU' },
]);

/** Reject format variants which cannot be handled by the first singles AI. */
export function getTrainerFormat(name: string): Format {
	if (!name || name.includes('@@@')) throw new Error('必须指定现有 FC 赛制，不能附加自定义规则。');
	const format = Dex.formats.get(name);
	if (!format.exists || format.effectType !== 'Format' || format.section !== 'FC' || format.mod !== 'gen9fantasy') {
		throw new Error('训练家必须使用现有 FC 赛制。');
	}
	const rules = Dex.formats.getRuleTable(format);
	if (
		format.gameType !== 'singles' || format.playerCount !== 2 || format.team || format.customRules?.length ||
		rules.maxTeamSize !== 6 || rules.maxMoveCount !== 4 ||
		(rules.pickedTeamSize !== null && rules.pickedTeamSize !== 6) || !rules.has('teampreview')
	) {
		throw new Error('首版只支持固定六对六、每只最多四招的队伍预览单打赛制。');
	}
	return format;
}

function validateTeam(format: Format, team: PokemonSet[] | null): string[] {
	if (!team || team.length !== 6) return ['队伍必须恰好包含六只宝可梦。'];
	if (team.some(set => !set.moves?.length || set.moves.length > 4)) {
		return ['每只宝可梦必须携带一至四个招式。'];
	}
	return new TeamValidator(format).validateTeam(team) || [];
}

/** Use the same structure and legality checks for the player's submitted team. */
export function validatePlayerTeam(formatName: string, packedTeam: string): {
	packedTeam?: string, problems: string[],
} {
	try {
		const format = getTrainerFormat(formatName);
		if (typeof packedTeam !== 'string' || packedTeam.length > 20000) {
			return { problems: ['玩家队伍数据无效或过长。'] };
		}
		const team = Teams.unpack(packedTeam);
		const problems = validateTeam(format, team);
		return problems.length ? { problems } : { problems, packedTeam: Teams.pack(team) };
	} catch (error) {
		return { problems: [error instanceof Error ? error.message : '玩家队伍校验失败。'] };
	}
}

function validateTrainer(input: unknown): ValidatedTrainer {
	if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('训练家配置必须是对象。');
	const raw = input as Record<string, unknown>;
	if (typeof raw.id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(raw.id)) {
		throw new Error('训练家标识必须以小写字母开头，仅包含小写字母、数字或连字符，最多 40 字符。');
	}
	if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 60 || /[\r\n|]/.test(raw.name)) {
		throw new Error('训练家名称必须为 1 至 60 字符，不能包含换行或协议分隔符。');
	}
	if (typeof raw.style !== 'string' || !STYLES.includes(raw.style)) throw new Error('未知的训练家战术风格。');
	if (raw.avatar !== undefined && (typeof raw.avatar !== 'string' || !/^#?[a-z0-9-]{1,80}$/.test(raw.avatar))) {
		throw new Error('训练家头像必须使用客户端已有的头像标识。');
	}
	if (raw.description !== undefined && (typeof raw.description !== 'string' || raw.description.length > 500 ||
		// Reject protocol/control bytes; newlines in plain descriptions are harmless.
		// eslint-disable-next-line no-control-regex
		/[\x00-\x08\x0b-\x1f]/.test(raw.description))) {
		throw new Error('训练家简介必须是最多 500 字符的普通文本。');
	}
	if (raw.developmentOnly !== undefined && typeof raw.developmentOnly !== 'boolean') {
		throw new Error('developmentOnly 必须是布尔值。');
	}
	if (typeof raw.format !== 'string') throw new Error('训练家缺少赛制。');
	const format = getTrainerFormat(raw.format);
	if (typeof raw.team !== 'string' || !raw.team.trim() || raw.team.length > 20000) {
		throw new Error('训练家必须提供 Showdown 导入文本格式的固定队伍（最多 20000 字符）。');
	}
	const team = Teams.import(raw.team);
	const problems = validateTeam(format, team);
	if (problems.length) throw new Error(problems.join('\n'));
	const keyMembers = raw.keyMembers === undefined ? [] : raw.keyMembers;
	if (
		!Array.isArray(keyMembers) || keyMembers.some(slot => !Number.isInteger(slot) || slot < 1 || slot > 6) ||
		new Set(keyMembers).size !== keyMembers.length
	) throw new Error('关键成员必须是互不重复的队伍位置（1 至 6）。');
	const resourcePreferences = raw.resourcePreferences === undefined ? [] : raw.resourcePreferences;
	if (
		!Array.isArray(resourcePreferences) || resourcePreferences.some(resource => !RESOURCES.includes(resource)) ||
		new Set(resourcePreferences).size !== resourcePreferences.length
	) throw new Error('特殊资源偏好无效或重复。');
	return {
		id: raw.id,
		name: raw.name.trim(),
		avatar: raw.avatar || 'unknown',
		description: (raw.description || '').trim(),
		format: format.id,
		style: raw.style as TrainerStyle,
		developmentOnly: raw.developmentOnly === true,
		packedTeam: Teams.pack(team),
		keyMembers: keyMembers.slice(),
		resourcePreferences: resourcePreferences.slice() as ResourcePreference[],
	};
}

export class TrainerRegistry {
	private readonly trainers = new Map<string, ValidatedTrainer>();
	private readonly diagnostics: TrainerDiagnostic[] = [];
	private readonly enabled: boolean;
	private readonly allowDevelopmentTrainers: boolean;

	constructor(definitions: readonly unknown[], options: { enabled?: boolean, allowDevelopmentTrainers?: boolean } = {}) {
		this.enabled = options.enabled === true;
		this.allowDevelopmentTrainers = options.allowDevelopmentTrainers === true;
		const counts = new Map<string, number>();
		for (const input of definitions) {
			const id = (input as { id?: unknown } | null)?.id;
			if (typeof id === 'string') counts.set(id, (counts.get(id) || 0) + 1);
		}
		for (const [index, input] of definitions.entries()) {
			const id = (input as { id?: unknown } | null)?.id;
			try {
				if (typeof id === 'string' && counts.get(id)! > 1) throw new Error('训练家标识重复，所有同名配置均已停用。');
				const trainer = validateTrainer(input);
				this.trainers.set(trainer.id, trainer);
			} catch (error) {
				this.diagnostics.push({
					index, id: typeof id === 'string' ? id : '',
					problems: (error instanceof Error ? error.message : '训练家配置加载失败。').split('\n'),
				});
			}
		}
	}

	get(id: string): ValidatedTrainer | undefined {
		const trainer = this.trainers.get(id);
		if (!this.enabled || !trainer || (trainer.developmentOnly && !this.allowDevelopmentTrainers)) return undefined;
		return { ...trainer, keyMembers: trainer.keyMembers.slice(), resourcePreferences: trainer.resourcePreferences.slice() };
	}

	list(): TrainerSummary[] {
		const result: TrainerSummary[] = [];
		for (const id of this.trainers.keys()) {
			const trainer = this.get(id);
			if (!trainer) continue;
			const { name, avatar, description, format, style, developmentOnly } = trainer;
			result.push({ id, name, avatar, description, format, style, developmentOnly });
		}
		return result;
	}

	/** Administrative diagnostics; do not publish these through the trainer list. */
	getDiagnostics(): TrainerDiagnostic[] {
		return this.diagnostics.map(entry => ({ ...entry, problems: entry.problems.slice() }));
	}
}
