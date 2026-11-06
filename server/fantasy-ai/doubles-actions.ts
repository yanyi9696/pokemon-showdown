import { toID } from '../../sim/dex';
import type { ChoiceRequest, PokemonMoveRequestData } from '../../sim/side';

export type DoublesResource = 'mega' | 'gmega' | 'ultra' | 'aura' | 'zmove' | 'dynamax' | 'tera';
type Transform = '' | 'mega' | 'megax' | 'megay' | 'ultra' | 'zmove' | 'dynamax' | 'terastallize';
export interface DoublesAction {
	slot: number;
	command: string;
	kind: 'move' | 'switch' | 'pass';
	move?: string;
	target?: number;
	reserve?: number;
	transform?: Transform;
	resources: DoublesResource[];
}
export interface DoublesChoice {
	choice: string;
	actions: DoublesAction[];
	resources: DoublesResource[];
}
export interface DoublesChoiceOptions {
	/** Public living target locations, never undisclosed opponent sets or actions. */
	foes?: number[];
	allyAlive?: boolean;
	resources?: Partial<Record<DoublesResource, boolean>>;
	allowSwitch?: boolean;
	mod?: string;
}
const directed = new Set(['normal', 'any', 'adjacentAlly', 'adjacentAllyOrSelf', 'adjacentFoe']);
const fainted = (condition: string) => condition === '0 fnt' || condition.endsWith(' fnt');

/** Native target locations for doubles or a single seat of a four-seat multi battle. */
function targets(type: string, self: number, allyAlive: boolean, foes: number[]) {
	if (!directed.has(type)) return [0];
	const ally = self === -1 ? -2 : -1;
	if (type === 'adjacentAlly') return allyAlive ? [ally] : [];
	if (type === 'adjacentAllyOrSelf') return allyAlive ? [self, ally] : [self];
	if (type === 'adjacentFoe') return foes;
	// Native "normal" and "any" moves can also target a partner (e.g. justified/weakness-policy setups).
	return allyAlive ? [...foes, ally] : foes;
}

function moveActions(
	request: PokemonMoveRequestData, slot: number, self: number, item: string,
	options: DoublesChoiceOptions, allyAlive: boolean,
): DoublesAction[] {
	const used = options.resources || {};
	const variants: { flag: Transform, resources: DoublesResource[] }[] = [{ flag: '', resources: [] }];
	if (request.canMegaEvo && !(request.canGMegaEvo ? used.gmega : used.mega)) {
		variants.push({ flag: 'mega', resources: [request.canGMegaEvo ? 'gmega' : 'mega'] });
	}
	if (request.canMegaEvoX && !used.mega) variants.push({ flag: 'megax', resources: ['mega'] });
	if (request.canMegaEvoY && !used.mega) variants.push({ flag: 'megay', resources: ['mega'] });
	if (request.canUltraBurst && !used.ultra) {
		const native = toID(item) === 'ultranecroziumz';
		if (native || !used.aura && !used.zmove) {
			variants.push({ flag: 'ultra', resources: native ? ['ultra'] : ['ultra', 'aura', 'zmove'] });
		}
	}
	if (request.canTerastallize && !used.tera) variants.push({ flag: 'terastallize', resources: ['tera'] });
	const result: DoublesAction[] = [];
	for (const [index, available] of request.moves.entries()) {
		const pp = (available as typeof available & { pp?: number }).pp;
		const currentMax = request.maxMoves && !request.canDynamax ? request.maxMoves.maxMoves[index] : undefined;
		// A locked second turn/recharge intentionally omits target in the native request.
		// Supplying the Dex move's ordinary target here is rejected before LockMove is resolved.
		const type = currentMax?.target || available.target || '';
		const add = (flag: Transform, resources: DoublesResource[], targetType: string) => {
			for (const target of targets(targetType, self, allyAlive, options.foes ?? [1, 2])) {
				result.push({ slot, kind: 'move', move: available.id, target, transform: flag, resources,
					command: `move ${index + 1}${target ? ` ${target}` : ''}${flag ? ` ${flag}` : ''}` });
			}
		};
		if (pp !== 0 && (currentMax ? !currentMax.disabled : !available.disabled)) {
			for (const variant of variants) add(variant.flag, variant.resources, type);
		}
		// Z and Max eligibility come from their own native request, including their changed targeting.
		const z = request.canZMove?.[index];
		if (z && pp !== 0 && !used.zmove && !used.aura) add('zmove', ['zmove'], z.target);
		const max = request.maxMoves?.maxMoves[index];
		if (request.canDynamax && max && !max.disabled && pp !== 0 && !used.dynamax) {
			add('dynamax', ['dynamax'], max.target);
		}
	}
	return result;
}

/** Combine allied decisions without duplicate reserves or conflicting team-wide resources. */
export function combineDoublesActions(groups: DoublesAction[][]): DoublesChoice[] {
	let choices: DoublesChoice[] = [{ choice: '', actions: [], resources: [] }];
	for (const group of groups) {
		const next: DoublesChoice[] = [];
		for (const previous of choices) for (const action of group) {
			if (action.reserve !== undefined && previous.actions.some(a => a.reserve === action.reserve)) continue;
			if (action.resources.some(resource => previous.resources.includes(resource))) continue;
			const actions = [...previous.actions, action];
			next.push({ choice: actions.map(a => a.command).join(', '), actions,
				resources: [...previous.resources, ...action.resources] });
		}
		choices = next;
	}
	return choices;
}

/**
 * Uses only the actor's native request and public target occupancy. No simulator, opponent choice,
 * hidden opponent configuration, random stream, or arbitrary campaign command enters this layer.
 */
export function enumerateDoublesChoices(request: ChoiceRequest, options: DoublesChoiceOptions = {}): DoublesChoice[] {
	if (request.wait) return [];
	const pokemon = request.side.pokemon;
	if (!pokemon.length || pokemon.length > 6) throw new Error('双打 AI 只支持一到六只的原生队伍请求。');
	if (request.teamPreview) {
		const size = request.maxChosenTeamSize ?? pokemon.length, result: DoublesChoice[] = [];
		if (!Number.isInteger(size) || size < 1 || size > pokemon.length) throw new Error('双打选出人数无效。');
		const visit = (chosen: number[], remaining: number[]) => {
			if (chosen.length === size) {
				result.push({ choice: `team ${chosen.join('')}`, actions: [], resources: [] });
				return;
			}
			for (const position of remaining) visit([...chosen, position], remaining.filter(i => i !== position));
		};
		visit([], pokemon.map((_, index) => index + 1));
		return result;
	}
	const count = request.forceSwitch ? request.forceSwitch.length : request.active.length;
	if (count < 1 || count > 2) throw new Error('双打 AI 请求必须为一个多玩家座位或两个活动位置。');
	const bench = pokemon.flatMap((mon, index) => !mon.active && !fainted(mon.condition) ? [index + 1] : []);
	const pass = (slot: number): DoublesAction => ({ slot, kind: 'pass', command: 'pass', resources: [] });
	const change = (slot: number, reserve: number): DoublesAction =>
		({ slot, kind: 'switch', reserve, command: `switch ${reserve}`, resources: [] });
	const groups: DoublesAction[][] = [];
	for (let slot = 0; slot < count; slot++) {
		if (request.forceSwitch) {
			if (!request.forceSwitch[slot]) { groups.push([pass(slot)]); continue; }
			const reviving = pokemon[slot]?.reviving;
			const reserves = reviving ? pokemon.flatMap((mon, i) => fainted(mon.condition) ? [i + 1] : []) : bench;
			const choices = reserves.map(reserve => change(slot, reserve));
			if (!reviving && bench.length < request.forceSwitch.filter(Boolean).length) choices.push(pass(slot));
			groups.push(choices);
			continue;
		}
		const mon = pokemon[slot], active = request.active[slot];
		if (!mon || fainted(mon.condition) || mon.commanding) { groups.push([pass(slot)]); continue; }
		const self = count === 2 ? -(slot + 1) : ['p3', 'p4'].includes(request.side.id) ? -2 : -1;
		const ally = count === 2 ? pokemon[1 - slot] : request.ally?.pokemon.find(p => p.active);
		const allyAlive = options.allyAlive ?? !!(ally && !fainted(ally.condition));
		const choices = moveActions(active, slot, self, mon.item, options, allyAlive);
		if (!active.trapped && options.allowSwitch !== false) choices.push(...bench.map(reserve => change(slot, reserve)));
		groups.push(choices);
	}
	let result = combineDoublesActions(groups);
	if (request.forceSwitch) {
		const required = request.forceSwitch.filter(Boolean).length;
		const revival = pokemon.some(mon => mon.reviving);
		const switches = revival ? required : Math.min(required, bench.length);
		result = result.filter(choice => choice.actions.filter(action => action.kind === 'switch').length === switches);
	}
	return result;
}
