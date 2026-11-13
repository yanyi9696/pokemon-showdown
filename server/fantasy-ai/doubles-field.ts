import { toID } from '../../sim/dex';
import type { PublicRogueEnvironment } from '../../sim/fantasy-rogue-spirits';

/** Zero means no natural expiry. Two values represent public short/extended hypotheses. */
export type FieldDuration = [number, number];
export interface DoublesFieldDurations {
	field: Record<string, FieldDuration>;
	sides: Record<'p1' | 'p2', Record<string, FieldDuration>>;
	/** Public reset/alternation rules applied after the ordinary timers expire. */
	environment?: PublicRogueEnvironment;
}

// Native Court Change transfers only these effects, not every side condition.
export const COURT_CHANGE_CONDITIONS = [
	'mist', 'lightscreen', 'reflect', 'spikes', 'safeguard', 'tailwind', 'toxicspikes', 'stealthrock',
	'waterpledge', 'firepledge', 'grasspledge', 'stickyweb', 'auroraveil', 'luckychant', 'gmaxsteelsurge',
	'gmaxcannonade', 'gmaxvinelash', 'gmaxwildfire', 'gmaxvolcalith',
];
const EXTENDERS: Record<string, string> = {
	sunnyday: 'heatrock', raindance: 'damprock', sandstorm: 'smoothrock', hail: 'icyrock', snowscape: 'icyrock',
	electricterrain: 'terrainextender', grassyterrain: 'terrainextender', psychicterrain: 'terrainextender',
	mistyterrain: 'terrainextender', reflect: 'lightclay', lightscreen: 'lightclay', auroraveil: 'lightclay',
};
const WEATHER_ALIASES: Record<string, string> = { sun: 'sunnyday', rain: 'raindance', snow: 'snowscape', none: '' };

/** Consume public events in order; never consult a live opponent, item or native duration. */
export class DoublesFieldClock {
	readonly durations: DoublesFieldDurations = { field: {}, sides: { p1: {}, p2: {} } };
	private weather = '';
	private terrain = '';
	private readonly freshAfterResidual = new Set<string>();
	private readonly dex: ModdedDex;

	constructor(dex: ModdedDex) { this.dex = dex; }

	private start(id: string, fields: string[], sourceItem?: string): FieldDuration {
		const base = this.dex.conditions.get(id).duration;
		if (!base) return [0, 0];
		if (EXTENDERS[id]) {
			if (sourceItem === undefined) return [base, base + 3];
			const duration = base + (sourceItem === EXTENDERS[id] ? 3 : 0);
			return [duration, duration];
		}
		const duration = base + (fields.includes('[persistent]') ? 2 : 0);
		return [duration, duration];
	}

	observe(fields: string[], sourceItem?: string) {
		const [, event, target = '', value = ''] = fields;
		const { field, sides } = this.durations;
		if (event === 'upkeep') {
			for (const [scope, effects] of Object.entries({ field, ...sides })) for (const [id, range] of Object.entries(effects)) {
				if (this.freshAfterResidual.has(`${scope}:${id}`)) continue;
				const remaining = range.map(turns => Math.max(0, turns - 1)) as FieldDuration;
				// If the public end message did not occur, the shorter hypothesis was disproven.
				if (!remaining[0] && remaining[1]) remaining[0] = remaining[1];
				effects[id] = remaining;
			}
			this.freshAfterResidual.clear();
			return;
		}
		if (event === '-message') {
			if (value === '[roguespirit]') this.durations.environment = { id: toID(fields[4]), duel: fields.includes('[duel]') };
			if (value === '[roguepermanentroom]') field.trickroom = [0, 0];
			if (value === '[roguepermanentweather]' && this.weather) field[this.weather] = [0, 0];
			if (value === '[roguepermanentterrain]' && this.terrain) field[this.terrain] = [0, 0];
			if (value === '[roguefieldduration]') {
				const scope = fields[4], id = toID(fields[5]), turns = Number(fields[6]);
				const effects = scope === 'field' ? field : scope === 'p1' || scope === 'p2' ? sides[scope] : undefined;
				if (effects?.[id] && Number.isInteger(turns) && turns > 0 && turns <= 8) {
					effects[id] = [turns, turns];
					if (fields.includes('[afterresidual]')) this.freshAfterResidual.add(`${scope}:${id}`);
					if (this.durations.environment?.id === 'tornadus' && id === 'tailwind' && scope !== 'field') {
						this.durations.environment.windSide = scope === 'p1' ? 0 : 1;
					}
				}
			}
			return;
		}
		if (event === '-weather' && !fields.includes('[upkeep]')) {
			delete field[this.weather];
			const id = toID(target);
			this.weather = WEATHER_ALIASES[id] ?? id;
			if (this.weather) field[this.weather] = this.start(this.weather, fields, sourceItem);
			return;
		}
		if (event === '-fieldstart' || event === '-fieldend') {
			const id = toID(target.replace(/^(move|ability): /i, ''));
			if (id.endsWith('terrain')) {
				delete field[this.terrain];
				this.terrain = event === '-fieldstart' ? id : '';
			}
			if (event === '-fieldstart') field[id] = this.start(id, fields, sourceItem);
			else delete field[id];
			return;
		}
		if (event === '-sidestart' || event === '-sideend') {
			const side = target.slice(0, 2);
			if (side !== 'p1' && side !== 'p2') return;
			const id = toID(value.replace(/^(move|ability): /i, ''));
			if (event === '-sidestart') sides[side][id] = this.start(id, fields, sourceItem);
			else delete sides[side][id];
			return;
		}
		if (event === '-swapsideconditions') {
			for (const id of COURT_CHANGE_CONDITIONS) {
				const left = sides.p1[id], right = sides.p2[id];
				if (right) sides.p1[id] = right;
				else delete sides.p1[id];
				if (left) sides.p2[id] = left;
				else delete sides.p2[id];
			}
		}
	}
}
