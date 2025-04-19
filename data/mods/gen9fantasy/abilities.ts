export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
	fengqunshouhu: {
		onResidual(pokemon) {
			if (pokemon.hp && pokemon.status && this.randomChance(50, 100)) {
				this.debug('蜂群守护');
				this.add('-activate', pokemon, 'ability: 蜂群守护');
				pokemon.cureStatus();
			}
		},
		onEffectivenessPriority: -1,
		onEffectiveness(typeMod, target, type, move) {
			if (move && move.effectType === 'Move' && move.category !== 'Status' && type === 'Bug' && typeMod > 0) {
				this.add('-activate', target, 'ability: 蜂群守护');
				return 0;
			}
		},
		name: "蜂群守护",
		rating: 3.5,
		num: 10001,
		shortDesc: "虫属性的弱点消失，不会受到攻击以外的伤害。",
	},
};
