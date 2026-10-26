export type MentorCard = 'attack' | 'guard' | 'speed' | 'balanced';
export type MentorTier = 'elite' | 'gym';

/** Percent bonuses, shared by the campaign, simulator and owner-only battle UI. */
export function mentorCardProfile(kind: MentorCard, _tier: MentorTier = 'elite') {
	// Retain the tier argument for old saves; all fixed bosses now share gym-strength cards.
	const values = {
		attack: [90, 45, 0], guard: [45, 100, 0], speed: [30, 30, 100], balanced: [60, 60, 30],
	};
	const [damage, defense, speed] = values[kind];
	const name = { attack: '破阵之证', guard: '坚守之证', speed: '疾风之证', balanced: '同行之证' }[kind];
	return { name, damage, defense, speed,
		text: `首领战中，全队招式伤害 +${damage}%，双防 +${defense}%${speed ? `，速度 +${speed}%` : ''}。` };
}
