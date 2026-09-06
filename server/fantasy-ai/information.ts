import { extractChannelMessages } from '../../sim/battle';
import type { ChoiceRequest, PokemonMoveRequestData } from '../../sim/side';
import { copyInitialTeam, type InitialPokemon } from './initial-snapshot';
import type { Difficulty } from './types';

// Only battle information. Requests, chat, debug output and input logs must
// not enter the opponent model even if a caller supplies a raw update packet.
const PUBLIC_EVENTS = new Set([
	'gametype', 'gen', 'tier', 'rule', 'teamsize', 'clearpoke', 'poke', 'teampreview',
	'start', 'turn', 'upkeep', 'win', 'tie', 'switch', 'drag', 'replace', 'detailschange',
	'move', 'cant', 'faint', 'swap',
	'-damage', '-heal', '-sethp', '-status', '-curestatus', '-cureteam',
	'-boost', '-unboost', '-setboost', '-swapboost', '-copyboost', '-clearboost',
	'-clearallboost', '-clearpositiveboost', '-clearnegativeboost', '-invertboost',
	'-item', '-enditem', '-ability', '-endability', '-transform', '-formechange',
	'-mega', '-primal', '-burst', '-zpower', '-zbroken', '-terastallize',
	'-start', '-end', '-singleturn', '-singlemove', '-activate', '-block',
	'-sidestart', '-sideend', '-swapsideconditions', '-weather', '-fieldstart', '-fieldend', '-fieldactivate',
	'-miss', '-fail', '-immune', '-crit', '-supereffective', '-resisted', '-notarget',
	'-ohko', '-hitcount', '-nothing', '-combine', '-waiting', '-prepare', '-mustrecharge',
	'-message', '-center',
]);

type InformationOptions = { ownSide: 'p1' | 'p2' } & (
	{ difficulty: 'normal', initialOpponent?: never } |
	{ difficulty: 'hard', initialOpponent: readonly InitialPokemon[] }
);

export interface Observation {
	difficulty: Difficulty;
	ownSide: 'p1' | 'p2';
	request: ChoiceRequest;
	publicLog: string[];
	initialOpponent?: InitialPokemon[];
}

function copyOwnRequest(request: ChoiceRequest): ChoiceRequest {
	const side = {
		id: request.side.id,
		name: request.side.name,
		pokemon: request.side.pokemon.map(mon => ({
			ident: mon.ident, details: mon.details, condition: mon.condition, active: mon.active,
			stats: { atk: mon.stats.atk, def: mon.stats.def, spa: mon.stats.spa, spd: mon.stats.spd, spe: mon.stats.spe },
			moves: mon.moves.slice(), baseAbility: mon.baseAbility, ability: mon.ability,
			item: mon.item, pokeball: mon.pokeball, commanding: mon.commanding, reviving: mon.reviving,
			teraType: mon.teraType, terastallized: mon.terastallized,
		})),
	};
	const common = { side, noCancel: request.noCancel };
	if (request.wait) return { ...common, wait: true };
	if (request.teamPreview) return { ...common, teamPreview: true, maxChosenTeamSize: request.maxChosenTeamSize };
	if (request.forceSwitch) return { ...common, forceSwitch: request.forceSwitch.slice() };
	const active: PokemonMoveRequestData[] = request.active.map(mon => ({
		moves: mon.moves.map(move => {
			// The simulator includes PP in JSON although its shared request type
			// currently omits these two fields.
			const pp = move as typeof move & { pp?: number, maxpp?: number };
			return {
				move: move.move, id: move.id, target: move.target, disabled: move.disabled,
				disabledSource: move.disabledSource, pp: pp.pp, maxpp: pp.maxpp,
			};
		}),
		maybeDisabled: mon.maybeDisabled, maybeLocked: mon.maybeLocked,
		trapped: mon.trapped, maybeTrapped: mon.maybeTrapped,
		canMegaEvo: mon.canMegaEvo, canMegaEvoX: mon.canMegaEvoX, canMegaEvoY: mon.canMegaEvoY,
		canUltraBurst: mon.canUltraBurst, canTerastallize: mon.canTerastallize,
		canZMove: mon.canZMove?.map((move: { move: string, target: string } | null) => (
			move ? { move: move.move, target: move.target } : null
		)),
		canDynamax: mon.canDynamax,
		maxMoves: mon.maxMoves ? {
			gigantamax: mon.maxMoves.gigantamax,
			maxMoves: mon.maxMoves.maxMoves.map(move => ({ move: move.move, target: move.target, disabled: move.disabled })),
		} : undefined,
	}));
	return { ...common, active };
}

/**
 * An AI owns this detached information view. Its only changing inputs are
 * its own request and public battle updates. There is no live Battle/Side,
 * opponent request, choice queue or battle RNG in this interface.
 */
export class InformationView {
	private readonly ownSide: 'p1' | 'p2';
	private readonly difficulty: Difficulty;
	private readonly initialOpponent?: InitialPokemon[];
	private readonly publicLog: string[] = [];

	constructor(options: InformationOptions) {
		if (options.ownSide !== 'p1' && options.ownSide !== 'p2') throw new Error('AI 仅支持单打双方。');
		if (options.difficulty !== 'normal' && options.difficulty !== 'hard') throw new Error('未知的 AI 难度。');
		this.ownSide = options.ownSide;
		this.difficulty = options.difficulty;
		if (options.difficulty === 'hard') {
			if (options.initialOpponent?.length !== 6) throw new Error('高难档需要完整的开局六只宝可梦快照。');
			this.initialOpponent = copyInitialTeam(options.initialOpponent);
		}
	}

	/** Feed complete simulator update packets, never partially split lines. */
	receiveUpdate(update: string) {
		const lines = update.split('\n');
		for (let index = 0; index < lines.length; index++) {
			if (!lines[index].startsWith('|split|')) continue;
			if (!/^\|split\|p[1-4]$/.test(lines[index]) || index + 2 >= lines.length) {
				throw new Error('公开日志必须使用完整的 split 协议消息。');
			}
			index += 2;
		}
		const shared = extractChannelMessages(update, [0])[0];
		for (const line of shared) {
			const event = line.split('|', 3)[1];
			if (PUBLIC_EVENTS.has(event)) this.publicLog.push(line);
		}
	}

	observe(request: ChoiceRequest): Observation {
		if (request.side.id !== this.ownSide) throw new Error('不能读取对手的私有行动请求。');
		const observation: Observation = {
			difficulty: this.difficulty,
			ownSide: this.ownSide,
			request: copyOwnRequest(request),
			publicLog: this.publicLog.slice(),
		};
		if (this.initialOpponent) observation.initialOpponent = copyInitialTeam(this.initialOpponent);
		return observation;
	}
}
