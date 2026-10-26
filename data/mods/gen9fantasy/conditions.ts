export const Conditions: import('../../../sim/dex-conditions').ModdedConditionDataTable = {
	// Named healing source only; this does not add a volatile or an ability to the Pokemon.
	rogueemergency: { name: 'Rogue Emergency' },
	roguebloodrobe: {
		name: 'Rogue Blood Robe', noCopy: true,
		onStart(pokemon) { this.add('-start', pokemon, 'Rogue Blood Robe', '[silent]'); },
		onEnd(pokemon) { this.add('-end', pokemon, 'Rogue Blood Robe', '[silent]'); },
	},
	rogueghidorah: {
		name: 'Rogue Ghidorah', noCopy: true,
		onStart(pokemon) { this.add('-start', pokemon, 'Rogue Ghidorah', '[silent]'); },
		onEnd(pokemon) { this.add('-end', pokemon, 'Rogue Ghidorah', '[silent]'); },
	},
	roguespindasleep: {
		noCopy: true,
		name: 'Rogue Spinda Sleep',
		onStart(pokemon) {
			this.effectState.wake = this.turn + 2;
			this.add('-start', pokemon, 'Rogue Spinda Sleep', '[silent]');
		},
		onBeforeMovePriority: 15,
		onBeforeMove(pokemon) { this.add('-message', '濒死睡眠中，无法行动。'); return false; },
		onTrapPokemon(pokemon) { pokemon.trapped = true; },
		onTryHeal() { return false; },
		onResidualOrder: 29,
		onResidual(pokemon) {
			if (this.turn < this.effectState.wake || !pokemon.hp) return;
			pokemon.removeVolatile('roguespindasleep');
			this.heal(pokemon.maxhp, pokemon, pokemon, this.dex.getActiveMove('rest'));
			this.add('-message', '【摇~摇~晃~摇】成功醒来，恢复全部 HP！');
		},
		onEnd(pokemon) { this.add('-end', pokemon, 'Rogue Spinda Sleep', '[silent]'); },
	},
};
