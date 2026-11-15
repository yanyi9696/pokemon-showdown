import { Battle, extractChannelMessages } from '../../sim/battle';
import { Format } from '../../sim/dex-formats';
import { Teams } from '../../sim/teams';
import { InformationView } from '../fantasy-ai/information';
import { RolloutPolicy } from '../fantasy-ai/rollout';
import type { RogueRandom } from './biome-pools';

/** Offline only: the gym leader search policy, with a deterministic work budget. */
export function simulateDailyCupBattle(teams: PokemonSet[][], random: RogueRandom) {
	const clean = teams.map(team => structuredClone(team).map(set => ({ ...set, item: '' })));
	const format = new Format({ name: '每日对战竞猜', mod: 'gen9fantasy', gameType: 'singles',
		ruleset: ['HP Percentage Mod', 'Team Preview', 'Max Team Size = 6', 'Max Level = 100'] });
	const seed = () => `gen5,${[random(65536), random(65536), random(65536), random(65536)].join(',')}` as const;
	const battle = new Battle({ format, formatid: format.id, seed: seed(),
		p1: { name: '左边的队伍', avatar: 'unknown', team: clean[0] },
		p2: { name: '右边的队伍', avatar: 'unknown', team: clean[1] },
	});
	const policies = clean.map(team => new RolloutPolicy({ id: 'daily-cup', name: '每日对战竞猜',
		avatar: 'unknown', description: '', format: 'gen9fantasyrogue', style: 'balanced', developmentOnly: false,
		packedTeam: Teams.pack(team), keyMembers: [], resourcePreferences: [],
	}));
	const views = (['p1', 'p2'] as const).map((ownSide, i) => new InformationView({
		ownSide, difficulty: 'normal', partySize: clean[1 - i].length,
	}));
	let cursor = 0, rollouts = 0, decisions = 0;
	try {
		for (; !battle.ended && decisions < 800; decisions++) {
			const packet = battle.log.slice(cursor).join('\n'); cursor = battle.log.length;
			for (const view of views) view.receiveUpdate(packet);
			// Both choices are made before either is submitted, just as in a normal battle.
			const choices = battle.sides.map((side, i) => {
				if (!side.activeRequest || side.activeRequest.wait) return '';
				const result = policies[i].decide(views[i].observe(side.activeRequest), seed(), {
					budgetMs: null, maxRollouts: 64,
				});
				rollouts += result.rollouts;
				if (!result.choice) throw new Error('Daily cup AI returned no legal choice.');
				return result.choice;
			});
			for (const [i, choice] of choices.entries()) {
				if (choice && !battle.choose(i ? 'p2' : 'p1', choice)) {
					throw new Error(`Daily cup AI rejected at turn ${battle.turn}: ${choice}`);
				}
			}
		}
		if (!battle.ended) battle.tie();
		return { log: extractChannelMessages(battle.log.join('\n'), [0])[0], decisions, rollouts,
			winner: battle.winner === battle.p1.name ? 0 : battle.winner === battle.p2.name ? 1 : null };
	} finally { battle.destroy(); }
}
