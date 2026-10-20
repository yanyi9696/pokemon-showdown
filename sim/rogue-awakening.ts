import { Dex, toID } from './dex';
import type { RoguePokemon } from './fantasy-rogue';
import type { BlessingEffects } from './rogue-blessing-data';

export const SPIRAL_CAP = 1000;
export const SPIRAL_SURVIVAL = 250;
export function addSpiral(points: number, gain: number) {
	return Math.min(SPIRAL_CAP, points + gain * Math.max(0, 1 - points / SPIRAL_CAP) ** 1.5);
}
/** Smooth between every HP value, with exact 1 / 1.5 / 3 reference anchors. */
export function robeDurability(hp: number, maxhp: number, awakened = false) {
	const fraction = Math.max(0.000001, Math.min(1, hp / Math.max(1, maxhp)));
	return Math.min(6, 1 + 0.5 * ((1 - fraction) / fraction) ** (Math.log(4) / Math.log(3)) * (awakened ? 1.15 : 1));
}
export type RobeKind = 'godrobe' | 'puregodrobe';
export function robeMember(team: RoguePokemon[], effects: BlessingEffects | undefined, kind: RobeKind) {
	const owned = effects?.owned.find(b => b.family === kind);
	if (!owned) return;
	const transfer = kind === 'godrobe' ? 'yveltal' : 'reshiram';
	const bases = owned.target ? [transfer] : kind === 'godrobe' ? ['seviper'] : ['espurr', 'meowstic'];
	const sum = (v: Partial<StatsTable>) => Object.values(v || {}).reduce((n, x) => n + (x || 0), 0);
	return team.filter(mon => !mon.egg && (!owned.target || owned.target === mon.id) &&
		bases.includes(toID(Dex.mod('gen9fantasy').species.get(mon.set.species).baseSpecies).replace(/fantasy$/, '')) &&
		(owned.target || kind === 'godrobe' || mon.set.gender === 'F' || mon.set.species.includes('Meowstic-F')))
		.sort((a, b) => b.set.level - a.set.level || sum(b.set.evs) - sum(a.set.evs) || sum(b.set.ivs) - sum(a.set.ivs) ||
			(b.set.happiness || 0) - (a.set.happiness || 0) || (a.joinOrder || 0) - (b.joinOrder || 0))[0];
}
