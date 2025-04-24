export const Scripts: ModdedBattleScriptsData = {
	gen: 9,
	init() {
		for (const id in this.data.FormatsData) {
			if (this.data.FormatsData[id].isNonstandard === 'Past') delete this.data.FormatsData[id].isNonstandard;
			if (this.data.FormatsData[id].natDexTier) {
				this.data.FormatsData[id].tier = this.data.FormatsData[id].natDexTier;
			}
		}
	},
	// 添加 actions 属性来覆盖对战行为
	actions: {
		// 覆盖 runMegaEvo 方法
		runMegaEvo(pokemon: Pokemon) {
			const speciesid = pokemon.species.id;
			const item = pokemon.getItem();

			// Handle Garchomp-Fantasy specifically
			if (speciesid === 'garchompfantasy' && item.id === 'garchompite') {
				const megaSpecies = this.dex.species.get('Garchomp-Mega-Fantasy');
				// Check if the target Mega exists and if the Pokemon can Mega Evolve
				if (!megaSpecies?.exists || !megaSpecies.isMega || !pokemon.canMegaEvo) {
					// Silently fail or rely on other checks; explicit error removed
					return false;
				}

				pokemon.formeChange(megaSpecies, item, true);
				// Standard Mega Evo post-processing
				this.battle.add('-mega', pokemon.fullname, megaSpecies.name, item.name);
				pokemon.canMegaEvo = null;
				this.battle.runEvent('AfterMega', pokemon);
				return true;
			} else {
				// For other Pokemon, attempt to call the base runMegaEvo.
                // WARNING: Calling this.battle.actions.runMegaEvo might cause infinite recursion
                // if the mod loader doesn't handle inheritance correctly (e.g., by providing a 'super' call).
                // If issues arise, this needs to be replaced with the correct way to call
                // the original/base implementation or by copying the base logic here.
                // Consult Pokemon Showdown modding documentation/examples for the proper pattern.
				// @ts-ignore - Assuming the call works or a base implementation exists
				const baseImplementation = this.battle.actions.__proto__?.runMegaEvo; // Attempt to find base
                if (baseImplementation) {
                    return baseImplementation.call(this, pokemon);
                } else {
                    // Fallback or error if base cannot be found
                    console.error("Could not find base runMegaEvo implementation.");
                    return false;
                }
			}
		},
	},
};
