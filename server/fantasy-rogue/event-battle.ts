import { Battle, extractChannelMessages } from '../../sim/battle';
import { Format } from '../../sim/dex-formats';
import type { Side } from '../../sim/side';
import type { RogueRandom } from './biome-pools';

/** The same inexpensive policy controls both teams; the simulator resolves every turn normally. */
function choose(battle: Battle, side: Side): string {
	const request = side.activeRequest;
	if (!request || request.wait) return '';
	if ('teamPreview' in request) return 'team 123';
	if ('forceSwitch' in request) return 'default';
	if (!('active' in request)) return 'default';
	const source = side.active[0], target = side.foe.active[0];
	const moves = request.active[0].moves.map((slot, i) => {
		const move = battle.dex.moves.get(slot.id);
		if (slot.disabled) return { choice: `move ${i + 1}`, score: -1 };
		let score = 0;
		if (move.category !== 'Status') {
			const attack = source.storedStats[move.category === 'Physical' ? 'atk' : 'spa'];
			const defense = target.storedStats[move.category === 'Physical' ? 'def' : 'spd'];
			score = (move.basePower || 45) * attack / defense * (source.hasType(move.type) ? 1.5 : 1) *
				(battle.dex.getImmunity(move.type, target) ? 2 ** battle.dex.getEffectiveness(move.type, target) : 0) *
				(typeof move.accuracy === 'number' ? move.accuracy / 100 : 1);
			if (move.multihit) score *= Array.isArray(move.multihit) ? 3 : move.multihit;
		} else if (move.heal && source.hp < source.maxhp / 3) score = 120;
		else if (move.status && !target.status && battle.dex.getImmunity(move.status, target)) {
			const powderBlocked = move.flags.powder && (target.hasType('Grass') ||
				target.hasAbility('overcoat') || target.hasItem('safetygoggles'));
			const statusBlocked = move.status === 'slp' &&
				target.hasAbility(['insomnia', 'vitalspirit', 'sweetveil', 'comatose']) ||
				['psn', 'tox'].includes(move.status) && target.hasAbility(['immunity', 'pastelveil', 'comatose']) ||
				move.status === 'brn' && target.hasAbility(['waterveil', 'waterbubble', 'thermalexchange', 'comatose']);
			if (!powderBlocked && !statusBlocked) score = 35;
		}
		return { choice: `move ${i + 1}`, score };
	}).filter(move => move.score >= 0);
	if (!moves.length) return 'default';
	const best = Math.max(...moves.map(move => move.score));
	const tied = moves.filter(move => move.score === best);
	return tied[battle.random(tied.length)].choice;
}

/** No player state, spirit, drops or task counters enter this independent spectator match. */
export function simulateForestBattle(teams: PokemonSet[][], random: RogueRandom) {
	const format = new Format({ name: '斗蛐蛐！', mod: 'gen9fantasy', gameType: 'singles',
		ruleset: ['HP Percentage Mod', 'Max Team Size = 6', 'Max Level = 100'] });
	const battle = new Battle({ format, formatid: format.id,
		seed: `gen5,${[random(65536), random(65536), random(65536), random(65536)].join(',')}`,
		p1: { name: '左边的队伍', avatar: 'unknown', team: structuredClone(teams[0]) },
		p2: { name: '右边的队伍', avatar: 'unknown', team: structuredClone(teams[1]) },
	});
	try {
		for (let decisions = 0; !battle.ended && decisions < 800; decisions++) {
			const choices = battle.sides.map(side => choose(battle, side));
			for (const [i, choice] of choices.entries()) {
				if (choice && !battle.choose(i ? 'p2' : 'p1', choice)) battle.choose(i ? 'p2' : 'p1', 'default');
			}
		}
		if (!battle.ended) { battle.add('-message', '双方久战不下，各自收手。'); battle.tie(); }
		return { log: extractChannelMessages(battle.log.join('\n'), [0])[0],
			winner: battle.winner === battle.p1.name ? 0 : battle.winner === battle.p2.name ? 1 : null };
	} finally { battle.destroy(); }
}
