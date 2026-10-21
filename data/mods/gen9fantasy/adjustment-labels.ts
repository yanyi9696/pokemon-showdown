import { toID, type ModdedDex } from '../../../sim/dex';

/** Explicit reviewed enhancements. Mixed trade-offs and replacements default to 🔄. */
const MOVE_BUFFS = new Set('recover roost slackoff softboiled rest milkdrink cut wringout chargebeam darkvoid psystrike watershuriken landswrath mistyexplosion kingsshield'.split(' '));
const ABILITY_BUFFS = new Set('shellarmor illuminate magmaarmor pressure cutecharm whitesmoke battlearmor heatproof slowstart icebody flowergift bigpecks infiltrator sandforce flowerveil watercompaction corrosion dancer stalwart transistor protosynthesis'.split(' '));
const serial = (value: unknown) => JSON.stringify(value, (_key, v) => typeof v === 'function' ? v.toString() : v);
export function applyAdjustmentLabels(dex: ModdedDex) {
	const original = dex.mod('gen9');
	for (const table of ['Moves', 'Abilities'] as const) {
		const buffs = table === 'Moves' ? MOVE_BUFFS : ABILITY_BUFFS;
		for (const [id, data] of Object.entries(dex.data[table])) {
			const base = original.data[table][id];
			if (!base) continue; // New Fantasy content is not a changed original effect.
			const changed = Object.keys(data).some(key => !['inherit', 'name', 'num', 'desc', 'shortDesc', 'rating', 'isNonstandard', 'gen', 'contestType'].includes(key) &&
				serial((data)[key]) !== serial((base as any)[key]));
			if (!changed && !buffs.has(id)) continue;
			const entry = dex.modData(table, id), marker = buffs.has(id) ? '+' : '🔄';
			entry.name = (base.name || entry.name).replace(/[+🔄]+$/u, '') + marker;
		}
	}
	// PS validates an ability against the species' canonical display name. Keep both
	// records consistent while leaving the parent dex and every ability ID untouched.
	for (const table of ['Pokedex', 'FormatsData'] as const) for (const id of Object.keys(dex.data[table])) {
		const required = (dex.data[table][id] as { requiredAbility?: string }).requiredAbility;
		const requiredName = required && dex.data.Abilities[toID(required)]?.name;
		if (requiredName && requiredName !== required) {
			(dex.modData(table, id) as { requiredAbility?: string }).requiredAbility = requiredName;
		}
		const abilities = (dex.data[table][id] as { abilities?: Species['abilities'] }).abilities;
		if (!abilities) continue;
		const next = { ...abilities };
		let changed = false;
		for (const slot of Object.keys(abilities) as (keyof Species['abilities'])[]) {
			const name = dex.data.Abilities[toID(abilities[slot])]?.name || abilities[slot];
			if (name !== abilities[slot]) { next[slot] = name!; changed = true; }
		}
		if (changed) (dex.modData(table, id) as { abilities?: Species['abilities'] }).abilities = next;
	}
}
