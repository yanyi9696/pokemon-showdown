import type { ChoiceRequest, PokemonMoveRequestData } from '../../sim/side';
import { enumerateDoublesChoices, type DoublesAction, type DoublesChoice } from './doubles-actions';
import { rankDoublesChoices, type DoublesScoredChoice } from './doubles-policy';
import type { Observation } from './information';

type EnemySeat = 'p2' | 'p4';
const SEATS: EnemySeat[] = ['p2', 'p4'];
export interface MultiScoredChoice extends DoublesScoredChoice {
	commands: Record<EnemySeat, string>;
}
export interface MultiOptions {
	allowSwitch?: boolean;
	jointTurns?: boolean;
	/** Missing key means decide this seat; null means waiting, string means already submitted. */
	fixed?: Partial<Record<EnemySeat, string | null>>;
	excluded?: Partial<Record<EnemySeat, ReadonlySet<string>>>;
}
export interface MultiDecisionInput {
	observation: Observation;
	candidates: DoublesChoice[];
	commands: Map<string, Record<EnemySeat, string>>;
}

/** Collapse four public seats into two field positions per team, never private player requests. */
function mapPublicLine(line: string): string {
	return line.split('|').map(field => field.replace(
		/(^|\[of\] )p([1-4])([a-z])?(:|$)/g,
		(_, prefix, number: string, position: string, suffix) => {
			const id = Number(number);
			return `${prefix}p${id % 2 ? 1 : 2}${position ? id > 2 ? 'b' : 'a' : ''}${suffix}`;
		}
	)).join('|');
}

/**
 * Evaluate the two NPC enemies together. Inputs are copies of THEIR native requests plus the
 * spectator log. Human requests, selected actions, simulator state and its RNG are not inputs.
 * Switch commands retain their native owner/index; the scoring-only party has remapped indices.
 * Transformation budgets remain native per-seat budgets, as for the two human Multi players.
 */
export function prepareMultiChoices(
	requests: Record<EnemySeat, ChoiceRequest>, publicLog: readonly string[], options: MultiOptions = {},
): MultiDecisionInput | undefined {
	if (SEATS.some(seat => requests[seat].wait || requests[seat].teamPreview || !requests[seat].side?.pokemon.length)) {
		return;
	}
	const log = publicLog.map(mapPublicLine);
	const alive = new Map<string, boolean>();
	const publicHealth = new Map<string, string>();
	for (const line of publicLog) {
		const [, event, ident, value, condition] = line.split('|');
		const seat = ident?.slice(0, 2);
		if (['switch', 'drag', 'replace'].includes(event) && condition) {
			alive.set(seat, !condition.includes('fnt'));
			publicHealth.set(seat, condition);
		}
		if (['-damage', '-heal'].includes(event)) publicHealth.set(seat, value);
		if (event === 'faint' || ['-damage', '-heal'].includes(event) && (value === '0' || value.endsWith(' fnt'))) {
			alive.set(seat, false);
		}
	}
	const foes = ['p1', 'p3'].flatMap((seat, i) => alive.get(seat) !== false ? [i + 1] : []);
	const pokemon = SEATS.map(seat => ({ ...requests[seat].side.pokemon[0] }));
	// A waiting seat may not receive a fresh private request after damage/fainting. Update its
	// cached field HP from public health instead of evaluating a dead/old partner as healthy.
	for (const [slot, seat] of SEATS.entries()) {
		if (options.fixed?.[seat] !== null) continue;
		if (alive.get(seat) === false) { pokemon[slot].condition = '0 fnt'; continue; }
		const health = publicHealth.get(seat);
		if (!health) continue;
		const [hp, maximum] = health.split(' ')[0].split('/').map(Number);
		const ownMaximum = Number(pokemon[slot].condition.split(' ')[0].split('/')[1]);
		if (maximum && ownMaximum) {
			pokemon[slot].condition = `${Math.round(hp / maximum * ownMaximum)}/${ownMaximum}${health.includes(' ') ?
				` ${health.split(' ')[1]}` : ''}`;
		}
	}
	const reserveIndices: Record<EnemySeat, number[]> = { p2: [1], p4: [2] };
	for (const seat of SEATS) {
		for (const mon of requests[seat].side.pokemon.slice(1)) {
			pokemon.push({ ...mon });
			reserveIndices[seat].push(pokemon.length);
		}
	}
	for (const mon of pokemon) mon.ident = mapPublicLine(mon.ident);
	const active: PokemonMoveRequestData[] = SEATS.map(seat => {
		const request = requests[seat];
		return 'active' in request ? request.active[0] : { moves: [] };
	});
	const request: ChoiceRequest = { side: { id: 'p2', name: 'NPC team', pokemon }, active };
	const groups = SEATS.map((seat, slot): DoublesAction[] => {
		if (options.fixed?.[seat] === null) return [{ slot, kind: 'pass', command: 'pass', resources: [] }];
		const choices = enumerateDoublesChoices(requests[seat], {
			foes, allyAlive: alive.get(SEATS[1 - slot]) !== false,
			allowSwitch: options.allowSwitch, mod: 'gen9fantasy',
		}).filter(choice => !options.excluded?.[seat]?.has(choice.choice) &&
			(options.fixed?.[seat] === undefined || options.fixed[seat] === choice.choice));
		return choices.map(choice => ({
			...choice.actions[0], slot,
			reserve: choice.actions[0].reserve === undefined ? undefined : reserveIndices[seat][choice.actions[0].reserve - 1],
		}));
	});
	const candidates: DoublesChoice[] = [], commands = new Map<string, Record<EnemySeat, string>>();
	for (const left of groups[0]) for (const right of groups[1]) {
		const choice = `${left.command}, ${right.command}`;
		candidates.push({ choice, actions: [left, right], resources: [...left.resources, ...right.resources] });
		commands.set(choice, { p2: left.command, p4: right.command });
	}
	return { observation: { ownSide: 'p2', difficulty: 'normal', request, publicLog: log }, candidates, commands };
}

export function rankMultiChoices(
	requests: Record<EnemySeat, ChoiceRequest>, publicLog: readonly string[], format: string, options: MultiOptions = {},
): MultiScoredChoice[] {
	const prepared = prepareMultiChoices(requests, publicLog, options);
	if (!prepared) return [];
	return rankDoublesChoices(prepared.observation, format, [], options.allowSwitch, prepared.candidates, options.jointTurns)
		.map(scored => ({ ...scored, commands: prepared.commands.get(scored.choice)! }));
}
