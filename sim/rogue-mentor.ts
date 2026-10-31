export type MentorCard = 'attack' | 'guard' | 'speed' | 'balanced';
export type MentorTier = 'elite' | 'gym';

/** Percent bonuses, shared by the campaign, simulator and owner-only battle UI. */
export function mentorCardProfile(kind: MentorCard, _tier: MentorTier = 'elite') {
	// Retain the tier argument for old saves; all fixed bosses now share gym-strength cards.
	const values = {
		attack: [100, 40, 0], guard: [40, 120, 0], speed: [30, 30, 100], balanced: [60, 60, 50],
	};
	const [offense, defense, speed] = values[kind];
	const name = { attack: '破阵之证', guard: '坚守之证', speed: '疾风之证', balanced: '同行之证' }[kind];
	return { name, offense, defense, speed,
		text: `首领战中，全队双攻 +${offense}%，双防 +${defense}%${speed ? `，速度 +${speed}%` : ''}。` };
}
