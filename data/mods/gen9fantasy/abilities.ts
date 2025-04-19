export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
	allseeingeye: {
		onAfterMove(source, target, move) {
			if (move.type === "Psychic" && move.category === "Status") {
				this.heal(source.baseMaxhp / 4);
			}
		},
		name: "All-Seeing Eye",
		rating: 3.5,
		num: 10000,
		shortDesc: "This Pokemon's Psychic-type status moves heal it for 1/4 max HP.",
	},
	fengchao: {
		onDamage(damage, target, source, effect) {
			if (effect.effectType !== 'Move') {
				if (effect.effectType === 'Ability') this.add('-activate', source, 'ability: ' + effect.name);
				return false;
			}
		},
		onEffectivenessPriority: -1,
		onEffectiveness(typeMod, target, type, move) {
			if (move && move.effectType === 'Move' && move.category !== 'Status' && type === 'Bug' && typeMod > 0) {
				this.add('-activate', target, 'ability: Fengchao');
				return 0;
			}
		},
		name: "Fengchao",
		rating: 3.5,
		num: 10001,
		shortDesc: "魔法防守+取消虫系弱点",
	},
};
