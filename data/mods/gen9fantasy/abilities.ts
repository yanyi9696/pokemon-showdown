export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
	fengchaofanghu: {
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
		name: "蜂巢防护",
		rating: 3.5,
		num: 10001,
		shortDesc: "虫属性的弱点消失，不会受到攻击以外的伤害。",
	},
};
