import type { Pokemon } from './pokemon';
import type { Battle } from './battle';

/** Keep the saved 0–100 scale; 20/40/60/80/100 map the original affection milestones. */
export function affectionBenefits(value: number) {
	return {
		experience: value >= 20 ? 1.2 : 1,
		endure: value >= 100 ? 25 : value >= 80 ? 20 : value >= 60 ? 15 : value >= 40 ? 10 : 0,
		cure: value >= 60 ? 20 : 0,
		accuracy: value >= 80 ? 10 : 0,
		critical: value >= 100 ? 2 : 1,
	};
}
export function battleAffection(mon: Pokemon) {
	const state = mon.battle.fantasyRogue;
	const team = mon.side.id === 'p1' ? state?.team : mon.side.id === 'p2' ? state?.duel?.team : undefined;
	return team?.find(saved => saved.id === mon.set.fantasyRogueId)?.bond || 0;
}
export function affectionEndure(damage: number, target: Pokemon, source: Pokemon | null, effect: Effect) {
	if (damage < target.hp || !target.hp || !(effect.id === 'confused' ||
		effect.effectType === 'Move' && source && !source.isAlly(target))) return;
	const chance = affectionBenefits(battleAffection(target)).endure;
	if (chance && target.battle.randomChance(chance, 100)) {
		target.battle.add('-message', `${target.name}不想让你担心，奋力撑住了！`);
		return target.hp - 1;
	}
}
export function affectionAccuracy(accuracy: number | true, target: Pokemon, source: Pokemon) {
	if (accuracy === true || source.isAlly(target)) return accuracy;
	return Math.max(0, accuracy - affectionBenefits(battleAffection(target)).accuracy);
}
export function affectionResidual(battle: Battle) {
	if (!battle.fantasyRogue) return;
	for (const mon of battle.getAllActive()) {
		if (!mon.hp || !mon.status) continue;
		const chance = affectionBenefits(battleAffection(mon)).cure;
		if (chance && battle.randomChance(chance, 100) && mon.cureStatus()) {
			battle.add('-message', `${mon.name}回应你的鼓励，摆脱了异常状态！`);
		}
	}
}
