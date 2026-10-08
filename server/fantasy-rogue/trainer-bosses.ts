import { Dex } from '../../sim/dex';
import { Teams } from '../../sim/teams';
import { BOSS_FLOORS } from './content';
import { TrainerBossData } from './trainer-boss-data';
import type { RogueRandom } from './biome-pools';
import type { RogueRun, RogueTrainerCandidate } from './types';

export const ELITE_FOUR_FLOORS = [165, 175, 180, 185];
const legacyGyms: Record<number, string> = {
	20: 'brock', 40: 'misty', 60: 'ltsurge', 80: 'erika', 100: 'koga', 120: 'sabrina', 140: 'blaine', 160: 'clair',
};
const dex = Dex.mod('gen9fantasy');

/** Normal Showdown exports may name a Mega forme but enter battle in its underlying forme. */
export function trainerBossCandidates(floor: number, level: number): RogueTrainerCandidate[] {
	const kind = BOSS_FLOORS.get(floor);
	return TrainerBossData.filter(entry => kind === '道馆' ? entry.role === 'gym' && entry.floor === floor :
		kind === '四天王' ? entry.role === 'elitefour' : kind === '冠军' && entry.role === 'champion').map(entry => ({
		trainer: {
			id: entry.id, name: `${kind} · ${entry.name}`, role: entry.role,
			avatar: entry.id === 'lorelei' ? 'lorelei-lgpe' : entry.id, tera: true,
			...(entry.role === 'elitefour' && ['larry', 'acerola'].includes(entry.id) ? { requiresGym: entry.id } : {}),
		},
		team: Teams.import(entry.team)!.map(imported => {
			const species = dex.species.get(imported.species);
			const entrySpecies = species.forme.includes('Mega') && typeof species.battleOnly === 'string' ?
				species.battleOnly : species.name;
			return {
				...imported, name: '', species: entrySpecies, level, nature: imported.nature || 'Hardy',
				ability: dex.abilities.get(imported.ability).name,
				item: imported.item ? dex.items.get(imported.item).name : '',
				moves: imported.moves.map(move => dex.moves.get(move).name),
			};
		}),
	}));
}

function history(run: RogueRun) {
	// Pre-v6 previews had fixed gym leaders. Infer only those proven by the floor already reached.
	run.trainerHistory ||= {
		gyms: Object.entries(legacyGyms).filter(([floor]) => Number(floor) < run.floor).map(([, id]) => id), eliteFour: [],
	};
	return run.trainerHistory;
}

function shuffle<T>(entries: T[], random: RogueRandom): T[] {
	const result = entries.slice();
	for (let i = result.length - 1; i > 0; i--) {
		const j = random(i + 1);
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

export function chooseTrainer(run: RogueRun, candidates: RogueTrainerCandidate[], random: RogueRandom) {
	const saved = history(run);
	const role = candidates[0].trainer.role;
	let pool = candidates;
	if (role === 'gym') pool = candidates.filter(entry => !saved.gyms.includes(entry.trainer.id));
	if (role === 'elitefour') {
		if (!saved.elitePlan) {
			const remainingFloors = ELITE_FOUR_FLOORS.filter(floor => floor >= run.floor);
			const eligible = candidates.filter(entry => !saved.eliteFour.includes(entry.trainer.id));
			const guaranteed = eligible.filter(entry =>
				entry.trainer.requiresGym && saved.gyms.includes(entry.trainer.requiresGym));
			const ordinary = shuffle(eligible.filter(entry => !entry.trainer.requiresGym), random);
			const selected = shuffle([...guaranteed, ...ordinary.slice(0, remainingFloors.length - guaranteed.length)], random);
			if (selected.length !== remainingFloors.length) throw new Error('四天王配置不足，无法安排不重复的对手。');
			saved.elitePlan = Object.fromEntries(remainingFloors.map((floor, index) => [floor, selected[index].trainer.id]));
		}
		pool = candidates.filter(entry => entry.trainer.id === saved.elitePlan![run.floor]);
	}
	if (!pool.length) throw new Error('没有可用的不重复训练家配置。');
	const selected = pool[pool.length === 1 ? 0 : random(pool.length)];
	if (role === 'gym') saved.gyms.push(selected.trainer.id);
	if (role === 'elitefour') saved.eliteFour.push(selected.trainer.id);
	return selected;
}

/** Saved pre-v6 opponents keep their teams and use the corresponding old trainer portrait. */
export function rogueOpponentAvatar(run: RogueRun): string {
	const node = run.node!;
	const encounter = node.encounters[run.encounter];
	if (encounter.trainer) return encounter.trainer.avatar;
	if (node.kind === 'trainer') return '1';
	if (node.kind === 'boss' && ['道馆', '四天王', '冠军'].includes(BOSS_FLOORS.get(run.floor) || '')) {
		return legacyGyms[run.floor] || '1';
	}
	const set = encounter.team[0];
	return (set.gender || dex.species.get(set.species).gender) === 'F' ? 'unknownf' : 'unknown';
}
