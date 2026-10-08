import { Dex, toID } from '../../sim/dex';
import { TeamValidator } from '../../sim/team-validator';
import { ROGUE_STATS } from '../../sim/fantasy-rogue';
import type { RogueAccount, RogueContent, RogueStarterTraits } from './types';

const baseIVs = (): StatsTable => ({ hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 });

export function starterTraits(account: RogueAccount, id: string): RogueStarterTraits {
	return structuredClone({
		natures: [], genders: [], abilities: [], moves: [], ivs: { min: baseIVs(), max: baseIVs() },
		...account.starterTraits?.[id],
	});
}

/** Only trusted captures/events may expand permanent choices; starting a run never unlocks a nature. */
export function recordStarterTraits(account: RogueAccount, content: RogueContent, set: PokemonSet, nature: boolean) {
	const dex = Dex.mod('gen9fantasy');
	const id = content.unlocks[dex.species.get(set.species).id]?.starter;
	if (!id) return;
	const traits = starterTraits(account, id);
	const knownNature = dex.natures.get(set.nature);
	if (nature && knownNature.exists && !traits.natures.includes(knownNature.id)) traits.natures.push(knownNature.id);
	if (nature && ['M', 'F', 'N'].includes(set.gender) && !traits.genders.includes(set.gender)) {
		traits.genders.push(set.gender);
	}
	if (nature) {
		// Evolution may change the ability's name: inherit its normal/hidden slot.
		const captured = dex.species.get(set.species);
		const starter = content.starters.find(entry => entry.id === id);
		const abilities: Partial<Species['abilities']> = starter ? dex.species.get(starter.set.species).abilities : {};
		for (const slot of Object.keys(captured.abilities) as (keyof Species['abilities'])[]) {
			const ability = abilities[slot];
			if (ability && toID(captured.abilities[slot]) === toID(set.ability) && !traits.abilities.includes(toID(ability))) {
				traits.abilities.push(toID(ability));
			}
		}
	}
	for (const stat of ROGUE_STATS) {
		const value = set.ivs?.[stat];
		if (!Number.isInteger(value) || value < 0 || value > 31) continue;
		traits.ivs.min[stat] = Math.min(traits.ivs.min[stat], value);
		traits.ivs.max[stat] = Math.max(traits.ivs.max[stat], value);
	}
	(account.starterTraits ||= {})[id] = traits;
}

const learnability = new Map<string, boolean>();
/** Ordinary RPG learnsets, including past-generation sources. Unlocks bypass level timing, not species legality. */
export function canStarterLearn(species: string, move: string) {
	const key = `${species}:${toID(move)}`;
	if (!learnability.has(key)) {
		const validator = new TeamValidator('gen9nationaldex');
		const entry = validator.dex.moves.get(move);
		learnability.set(key, entry.exists &&
		!validator.checkCanLearn(entry, validator.dex.species.get(species), undefined, { level: 100 }));
	}
	return learnability.get(key)!;
}

export function recordStarterMoves(account: RogueAccount, content: RogueContent, set: PokemonSet) {
	const id = content.unlocks[toID(set.species)]?.starter ||
		content.starters.find(starter => toID(starter.set.species) === toID(set.species))?.id;
	const starter = content.starters.find(entry => entry.id === id);
	if (!starter) return;
	const traits = starterTraits(account, starter.id);
	for (const move of set.moves.map(toID)) {
		if (!traits.moves.includes(move) && canStarterLearn(starter.set.species, move)) traits.moves.push(move);
	}
	(account.starterTraits ||= {})[starter.id] = traits;
}

export function starterMoves(account: RogueAccount, content: RogueContent, id: string) {
	const starter = content.starters.find(entry => entry.id === id)!;
	return [...new Set([...starter.set.moves.map(toID), ...starterTraits(account, id).moves])]
		.filter(move => canStarterLearn(starter.set.species, move));
}
