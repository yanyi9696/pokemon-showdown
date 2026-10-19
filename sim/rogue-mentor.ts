export type MentorCard = 'attack' | 'guard' | 'balanced';
export type MentorTier = 'elite' | 'gym';

/** Percent bonuses, shared by the campaign, simulator and owner-only battle UI. */
export function mentorCardProfile(kind: MentorCard, tier: MentorTier = 'elite') {
	const values = tier === 'gym' ? {
		attack: [80, 40, 0], guard: [40, 90, 0], balanced: [60, 60, 30],
	} : {
		attack: [40, 20, 0], guard: [20, 50, 0], balanced: [30, 30, 15],
	};
	const [damage, defense, speed] = values[kind];
	const name = { attack: '破阵之证', guard: '坚守之证', balanced: '同行之证' }[kind];
	return { name, damage, defense, speed,
		text: `首领战中，全队招式伤害 +${damage}%，双防 +${defense}%${speed ? `，速度 +${speed}%` : ''}。` };
}
