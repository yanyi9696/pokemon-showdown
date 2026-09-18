import type { HazardMember } from './hazards';
import type { Combatant } from './hypotheses';
import type { MoveEstimate } from './matchup';

export function isMegaEvent(event?: string): boolean {
	return event === 'mega' || event === 'megax' || event === 'megay';
}

export interface MegaPreference { value: number; reason: string }

/** Static coverage only selects threats to verify; it never supplies the final damage estimate. */
function coverage(attacker: Combatant, defender: Combatant, dex: ModdedDex) {
	const types = dex.species.get(defender.species).types;
	const attacks = attacker.moves.map(id => dex.moves.get(id)).filter(move =>
		move.category !== 'Status' && move.basePower > 0 && !move.damage && !move.damageCallback && !move.onModifyType);
	return attacks.map(move => {
		const multiplier = dex.getImmunity(move.type, types) ? 2 ** dex.getEffectiveness(move.type, types) : 0;
		const attack = attacker.stats[move.category === 'Physical' ? 'atk' : 'spa'];
		const defense = defender.stats[move.category === 'Physical' ? 'def' : 'spd'];
		const stab = dex.species.get(attacker.species).types.includes(move.type) ? 1.5 : 1;
		return { move: move.id, multiplier,
			pressure: Math.min(180, move.basePower) * stab * multiplier * attack /
				Math.max(1, defense * defender.stats.hp) };
	}).sort((a, b) => b.pressure - a.pressure)[0];
}

/**
 * Mega 通常是应当及时兑现的永久提升，不是需要一直囤积的一次性攻击资源。
 * 只给实际种族值总和增加的形态加偏好；自制武道熊师等平级变形交给原生局面评分。
 * 属性变化造成的全队劣势先按合法配招筛选，再以最多两名代表对手的原生承伤确认；
 * 新特性、免疫和 Fantasy 招式的真实效果必须通过传入的探针，不能靠属性表断言。
 * 本模块只接受观察/假设，不能读取真实对手；调用方按进化形态缓存本次决策的结果。
 */
export function assessMegaPreference(
	before: Combatant, after: Combatant, opponents: () => readonly HazardMember[], dex: ModdedDex,
	probe: (attacker: Combatant, defender: Combatant, move: string) => MoveEstimate,
): MegaPreference {
	const base = dex.species.get(before.species);
	const evolved = dex.species.get(after.species);
	if (!evolved.isMega || base.id === evolved.id) return { value: 0, reason: 'mega-unconfirmed' };
	const gain = Object.values(evolved.baseStats).reduce((sum, stat) => sum + stat, 0) -
		Object.values(base.baseStats).reduce((sum, stat) => sum + stat, 0);
	if (gain <= 0) return { value: 0, reason: 'mega-sidegrade' };
	const upgrade = { value: Math.min(32, 20 + gain * 0.08), reason: 'mega-upgrade' };
	if (base.types.length === evolved.types.length && base.types.every(type => evolved.types.includes(type))) {
		return upgrade;
	}

	let roster: readonly HazardMember[];
	try {
		roster = opponents().filter(member => member.profile.health.upper > 0);
	} catch {
		return { ...upgrade, reason: 'mega-coverage-uncertain' };
	}
	const total = roster.reduce((sum, member) => sum + member.probability, 0);
	const threats = roster.flatMap(member => {
		const old = coverage(member.profile, before, dex);
		const changed = coverage(member.profile, after, dex);
		if (!changed) return [];
		const type = dex.moves.get(changed.move).type;
		const oldMultiplier = dex.getImmunity(type, base.types) ? 2 ** dex.getEffectiveness(type, base.types) : 0;
		if (changed.multiplier < 2 || changed.multiplier < oldMultiplier * 2 ||
			changed.pressure < (old?.pressure || 0) * 1.5) return [];
		return [{ ...member, move: changed.move, pressure: changed.pressure }];
	});
	const exposed = threats.reduce((sum, member) => sum + member.probability, 0);
	if (!total || exposed + 1e-6 < Math.min(2, total) || exposed < total * 0.5) return upgrade;
	// Do not count several item/spread hypotheses of the same species as several opponents.
	const checked = new Set<string>();
	let confirmed = 0;
	let uncertain = false;
	for (const threat of threats.sort((a, b) => b.probability - a.probability || b.pressure - a.pressure)) {
		const family = dex.species.get(threat.profile.species).baseSpecies;
		if (checked.has(family)) continue;
		checked.add(family);
		try {
			const old = probe(threat.profile, before, threat.move);
			const changed = probe(threat.profile, after, threat.move);
			if (!old.omittedVolatiles.length && !changed.omittedVolatiles.length &&
				(changed.knockout >= old.knockout + 0.5 ||
					changed.damage >= old.damage + 0.18 && changed.damage >= old.damage * 1.4)) confirmed++;
			if (old.omittedVolatiles.length || changed.omittedVolatiles.length) uncertain = true;
		} catch {
			// Missing support is not evidence that Mega is bad; current native action
			// scoring remains authoritative even if this extra bench check fails.
			uncertain = true;
		}
		if (checked.size >= 2) break;
	}
	if (confirmed + 1e-6 >= Math.min(2, total)) return { value: -24, reason: 'mega-team-liability' };
	return uncertain ? { ...upgrade, reason: 'mega-coverage-uncertain' } : upgrade;
}
