import { toID } from '../../sim/dex';

export type SinglesSide = 'p1' | 'p2';
export interface HealthRange { lower: number; upper: number }
export interface SeenPokemon {
	appearance: string;
	side: SinglesSide;
	ident: string;
	species: string;
	level: number;
	health: HealthRange;
	status: string;
	moves: string[];
	moveUses: Record<string, number>;
	boosts: SparseBoostsTable;
	volatiles: string[];
	item?: string;
	ability?: string;
	types?: string[];
	teraType?: string;
	transformed: boolean;
	ambiguousIdentity: boolean;
}
export interface SeenSide {
	preview: { species: string, level: number }[];
	appearances: SeenPokemon[];
	active?: SeenPokemon;
	conditions: Record<string, number>;
	resources: { mega: boolean, zmove: boolean, tera: boolean, aura: boolean };
}
export interface BattleMemory {
	turn: number;
	sides: Record<SinglesSide, SeenSide>;
	weather: string;
	terrain: string;
	pseudoWeather: string[];
	switches: { side: SinglesSide, turn: number, ident: string }[];
	/** Observed order at equal base priority; ties and priority modifiers remain possible. */
	speedEvidence: { first: string, second: string, turn: number, trickRoom: boolean }[];
}

export function parseDetails(details: string): { species: string, level: number } {
	const parts = details.split(', ');
	return { species: parts[0], level: Number(parts.find(part => /^L\d+$/.test(part))?.slice(1)) || 100 };
}

/** Public HP is rounded up. Keep its interval rather than inventing exact HP. */
export function parseHealth(condition: string, exact = false): HealthRange {
	if (condition === '0' || condition.endsWith(' fnt')) return { lower: 0, upper: 0 };
	const match = /^(\d+)\/(\d+)/.exec(condition);
	if (!match || !Number(match[2])) return { lower: 0, upper: 1 };
	const hp = Number(match[1]);
	const maxhp = Number(match[2]);
	return { lower: Math.max(0, (hp - (exact ? 0 : 1)) / maxhp), upper: Math.min(1, hp / maxhp) };
}

export function conditionID(text: string): string {
	return toID(text.replace(/^(move|ability|item): /, ''));
}

function newSide(): SeenSide {
	return {
		preview: [], appearances: [], conditions: {},
		resources: { mega: false, zmove: false, tera: false, aura: false },
	};
}

/** Parse only the already-filtered public log. Never infer an internal team index. */
export function readBattleMemory(log: readonly string[], dex: ModdedDex): BattleMemory {
	const memory: BattleMemory = {
		turn: 0, sides: { p1: newSide(), p2: newSide() }, weather: '', terrain: '',
		pseudoWeather: [], switches: [], speedEvidence: [],
	};
	let turnMoves: { mon: SeenPokemon, priority: number }[] = [];
	const lookup = (ident: string): SeenPokemon | undefined => {
		const side = ident.slice(0, 2) as SinglesSide;
		const active = memory.sides[side]?.active;
		return active && active.ident.slice(0, 3) === ident.slice(0, 3) ? active : undefined;
	};
	for (const line of log) {
		const [, event, target = '', value = '', extra = '', ...tags] = line.split('|');
		const sideID = target.slice(0, 2) as SinglesSide;
		const side = memory.sides[sideID];
		const mon = lookup(target);
		const markers = [extra, ...tags];
		const holder = markers.find(tag => tag.startsWith('[of] '));
		const revealedHolder = holder ? lookup(holder.slice(5)) : mon;
		for (const marker of markers) {
			if (revealedHolder && marker.startsWith('[from] item: ')) revealedHolder.item = toID(marker.slice(13));
			if (revealedHolder && marker.startsWith('[from] ability: ')) revealedHolder.ability = toID(marker.slice(16));
		}
		switch (event) {
		case 'turn':
			memory.turn = Number(target);
			turnMoves = [];
			break;
		case 'clearpoke':
			memory.sides.p1.preview = [];
			memory.sides.p2.preview = [];
			break;
		case 'poke':
			side?.preview.push(parseDetails(value));
			break;
		case 'switch': case 'drag': {
			if (!side) break;
			const details = parseDetails(value);
			const illusionPossible = side.preview.some(member => Object.values(dex.species.get(member.species).abilities)
				.some(ability => toID(ability) === 'illusion'));
			const unique = side.preview.filter(member => member.species === details.species).length === 1;
			const previous = !illusionPossible && unique ? side.appearances.slice().reverse().find(member =>
				member.ident === target && member.species === details.species && !member.transformed) : undefined;
			const seen: SeenPokemon = {
				appearance: `${sideID}:${side.appearances.length + 1}`, side: sideID, ident: target, ...details,
				health: parseHealth(extra), status: extra.split(' ')[1] || '',
				moves: previous?.moves.slice() || [], moveUses: { ...previous?.moveUses },
				boosts: {}, volatiles: [], item: previous?.item,
				// Temporary ability/type changes can end on switching: leave ability unknown.
				transformed: false, ambiguousIdentity: illusionPossible || !unique,
			};
			side.appearances.push(seen);
			side.active = seen;
			memory.switches.push({ side: sideID, turn: memory.turn, ident: target });
			break;
		}
		case 'replace':
			if (mon) {
				Object.assign(mon, parseDetails(value));
				mon.ident = target;
				mon.ambiguousIdentity = false;
				if (extra) mon.health = parseHealth(extra);
				// Any types attributed to the disguise no longer describe this Pokemon.
				mon.types = undefined;
			}
			break;
		case 'detailschange': case '-formechange':
			if (mon) {
				mon.species = parseDetails(value).species;
				if (/, L\d+/.test(value)) mon.level = parseDetails(value).level;
				mon.types = undefined;
			}
			break;
		case 'move':
			if (mon) {
				const move = dex.moves.get(value);
				// Metronome, Sleep Talk, etc. do not reveal another selectable move or spend its PP.
				if (!tags.some(tag => tag.startsWith('[from]'))) {
					if (move.exists && !mon.moves.includes(move.id)) mon.moves.push(move.id);
					mon.moveUses[move.id] = (mon.moveUses[move.id] || 0) + 1;
					const first = turnMoves[0];
					if (first && first.mon.side !== mon.side && first.priority === move.priority) {
						memory.speedEvidence.push({
							first: first.mon.appearance, second: mon.appearance, turn: memory.turn,
							trickRoom: memory.pseudoWeather.includes('trickroom'),
						});
					}
					turnMoves.push({ mon, priority: move.priority });
				}
			}
			break;
		case '-damage': case '-heal': case '-sethp':
			if (mon) { mon.health = parseHealth(value); mon.status = value.split(' ')[1] || ''; }
			if (event === '-sethp' && extra) {
				const second = lookup(extra);
				if (second) second.health = parseHealth(tags[0] || '');
			}
			break;
		case 'faint':
			if (mon) { mon.health = { lower: 0, upper: 0 }; mon.status = 'fnt'; }
			break;
		case '-status': if (mon) mon.status = value; break;
		case '-curestatus': if (mon) mon.status = ''; break;
		case '-item': if (mon) mon.item = toID(value); break;
		case '-enditem': if (mon) mon.item = ''; break;
		case '-ability': if (mon) mon.ability = toID(value); break;
		case '-endability': if (mon) mon.ability = ''; break;
		case '-activate':
			if (mon && value.startsWith('ability: ')) mon.ability = conditionID(value);
			if (mon && value.startsWith('item: ')) mon.item = conditionID(value);
			break;
		case '-boost': case '-unboost': case '-setboost':
			if (mon && ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'].includes(value)) {
				const stat = value as BoostID;
				mon.boosts[stat] = Math.max(-6, Math.min(6, event === '-setboost' ? Number(extra) :
					(mon.boosts[stat] || 0) + Number(extra) * (event === '-unboost' ? -1 : 1)));
			}
			break;
		case '-clearboost': if (mon) mon.boosts = {}; break;
		case '-copyboost': case '-swapboost': {
			const other = lookup(value);
			if (!mon || !other) break;
			const stats = (extra ? extra.split(', ') : ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']) as BoostID[];
			for (const stat of stats) {
				const before = mon.boosts[stat] || 0;
				mon.boosts[stat] = other.boosts[stat] || 0;
				if (event === '-swapboost') other.boosts[stat] = before;
			}
			break;
		}
		case '-clearallboost':
			for (const team of Object.values(memory.sides)) if (team.active) team.active.boosts = {};
			break;
		case '-clearpositiveboost': case '-clearnegativeboost': case '-invertboost':
			if (mon) {
				for (const stat of Object.keys(mon.boosts) as BoostID[]) {
					const boost = mon.boosts[stat] || 0;
					mon.boosts[stat] = event === '-invertboost' ? -boost :
						(event === '-clearpositiveboost' ? Math.min(0, boost) : Math.max(0, boost));
				}
			}
			break;
		case '-start': case '-end':
			if (mon) {
				const effect = conditionID(value);
				if (effect === 'typechange') { mon.types = event === '-start' ? extra.split('/') : undefined; break; }
				if (effect === 'fantasystats') break;
				if (event === '-start' && !mon.volatiles.includes(effect)) mon.volatiles.push(effect);
				if (event === '-end') mon.volatiles = mon.volatiles.filter(id => id !== effect);
				if (effect.startsWith('auraburst')) { side.resources.aura = true; side.resources.zmove = true; }
			}
			break;
		case '-transform':
			if (mon) {
				const transformed = lookup(value);
				if (transformed) { mon.species = transformed.species; mon.types = transformed.types?.slice(); }
				mon.transformed = true;
				mon.moves = [];
			}
			break;
		case '-mega': if (side) side.resources.mega = true; break;
		case '-zpower': if (side) side.resources.zmove = true; break;
		case '-terastallize':
			if (side) side.resources.tera = true;
			if (mon) mon.teraType = value;
			break;
		case '-sidestart': case '-sideend':
			if (side) {
				const effect = conditionID(value);
				if (event === '-sideend') delete side.conditions[effect];
				else side.conditions[effect] = (side.conditions[effect] || 0) + 1;
			}
			break;
		case '-weather': memory.weather = target === 'none' ? '' : toID(target); break;
		case '-fieldstart': case '-fieldend': {
			const effect = conditionID(target);
			if (effect.endsWith('terrain')) memory.terrain = event === '-fieldstart' ? effect : '';
			else if (event === '-fieldstart') memory.pseudoWeather.push(effect);
			else memory.pseudoWeather = memory.pseudoWeather.filter(id => id !== effect);
			break;
		}
		}
	}
	return memory;
}
