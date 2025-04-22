export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
	fengchao: {
		onEffectivenessPriority: -1,
		onEffectiveness(typeMod, target, type, move) {
			if (move && move.effectType === 'Move' && move.category !== 'Status' && type === 'Bug' && typeMod > 0) {
				this.add('-activate', target, 'ability: Fengchao');
				return 0; // Bug-type attacks no longer have effectiveness changes
			}
		},
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Bug') {
				this.debug('Fengchao Bug move power boost');
				return this.chainModify(1.5); // Increase Bug-type move attack power by 1.5x
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Bug') {
				this.debug('Fengchao Bug move special attack boost');
				return this.chainModify(1.5); // Increase Bug-type move special attack power by 1.5x
			}
		},
		onAfterMove(pokemon, target, move) {
			if (move.type === 'Bug') {
				this.heal(pokemon.baseMaxhp / 8); // Heal 1/8 of max HP after using Bug-type move
			}
		},
		name: "Fengchao",
		rating: 3.5,
		num: 10001,
		shortDesc: "虫属性的弱点消失。虫属性招式威力提升1.5倍,使用虫属性招式时会回复最大HP的1/8。",	
	},
	stancechange: {
		onModifyMovePriority: 1,
		onModifyMove(move, attacker, defender) {
			if (attacker.species.baseSpecies !== 'Aegislash-Fantasy' || attacker.transformed) return;
			if (move.category === 'Status' && move.id !== 'kingsshield') return;
			const targetForme = (move.id === 'kingsshield' ? 'Aegislash-Fantasy' : 'Aegislash-Blade-Fantasy');
			if (attacker.species.name !== targetForme) attacker.formeChange(targetForme);
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "Stance Change",
		rating: 4,
		num: 176,
	},
};
