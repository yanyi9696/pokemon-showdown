import { toID, type ModdedDex } from '../../../sim/dex';

/** Reviewed gameplay differences: enhancements use +; changed mechanics use 🔄. */
const MOVE_BUFFS = new Set('recover roost slackoff softboiled rest milkdrink cut wringout chargebeam darkvoid psystrike watershuriken landswrath mistyexplosion kingsshield supercellslam flyingpress'.split(' '));
const ABILITY_BUFFS = new Set('piercingdrill shellarmor illuminate magmaarmor pressure cutecharm whitesmoke battlearmor heatproof slowstart icebody flowergift bigpecks infiltrator sandforce flowerveil watercompaction corrosion dancer stalwart transistor protosynthesis'.split(' '));
// Reviewed gameplay changes, not source-text differences. Translation, visual sync,
// custom-status compatibility and suppression guards do not rework the original effect.
const MOVE_REWORKS = new Set('razorwind jumpkick rockthrow swift skullbash triattack powdersnow spark shadowpunch punishment crushgrip shadowbone overdrive bittermalice shelter nihillight'.split(' '));
export function fantasyAdjustmentMarker(table: 'Moves' | 'Abilities', id: string): '+' | '🔄' | '' {
	return (table === 'Moves' ? MOVE_BUFFS : ABILITY_BUFFS).has(id) ? '+' :
		table === 'Moves' && MOVE_REWORKS.has(id) ? '🔄' : '';
}
export function applyAdjustmentLabels(dex: ModdedDex) {
	const original = dex.mod('gen9');
	for (const table of ['Moves', 'Abilities'] as const) {
		for (const id of Object.keys(dex.data[table])) {
			const base = original.data[table][id];
			if (!base) continue; // New Fantasy content is not a changed original effect.
			const marker = fantasyAdjustmentMarker(table, id);
			if (!marker) continue;
			const entry = dex.modData(table, id);
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
