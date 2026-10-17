export type MentorCard = 'attack' | 'guard' | 'balanced';
export type MentorTier = 'elite' | 'gym';

/** Percent bonuses, shared by the campaign, simulator and owner-only battle UI. */
export function mentorCardProfile(kind: MentorCard, tier: MentorTier = 'elite') {
	const values = tier === 'gym' ? {
		attack: [75, 35, 0], guard: [35, 85, 0], balanced: [55, 55, 25],
	} : {
		attack: [50, 25, 0], guard: [25, 60, 0], balanced: [35, 35, 20],
	};
	const [damage, defense, speed] = values[kind];
	const name = { attack: '破阵之证', guard: '坚守之证', balanced: '同行之证' }[kind];
	return { name, damage, defense, speed,
		text: `首领战中，全队招式伤害 +${damage}%，双防 +${defense}%${speed ? `，速度 +${speed}%` : ''}。` };
}
