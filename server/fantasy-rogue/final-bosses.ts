import { Dex } from '../../sim/dex';
import { Teams } from '../../sim/teams';
import { ARCEUS_LIFE_TYPES } from '../../sim/rogue-bosses';
import type { RogueEncounter } from './types';

/** The seventh export is Mewtwo's second life, not a seventh party slot. */
export const SUMMIT_TEAM = `
Koraidon-Fantasy @ Fire Gem
Ability: Orichalcum Pulse
Tera Type: Fire
EVs: 252 Atk / 4 Def / 252 Spe
Jolly Nature
- Dragon Dance
- Lie Huo Meng Zhuang
- Collision Course
- Outrage

Miraidon-Fantasy @ Dragon Gem
Ability: Hadron Engine
Tera Type: Dragon
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
IVs: 0 Atk
- Huan Zhi Wu
- Ke Ji Meng Chong
- Electro Drift
- Dragon Pulse

Calyrex-Fantasy @ Life Orb
Ability: fengraoguodu
Tera Type: Steel
EVs: 252 HP / 252 Atk / 4 Def
Adamant Nature
- Swords Dance
- Grassy Glide
- Wood Hammer
- dongchadaji

Xerneas-Fantasy @ Power Herb
Ability: Fairy Aura
EVs: 4 HP / 252 SpA / 252 Spe
Modest Nature
IVs: 0 Atk
- Geomancy
- Earth Power
- Moonblast
- Giga Drain

Lugia-Fantasy @ Shadow Bottle
Ability: yuanhaiyangliu
Tera Type: Steel
EVs: 248 HP / 252 Def / 8 SpA
Bold Nature
IVs: 0 Atk
- Scald
- Aeroblast
- Recover
- Thunder Wave

Mewtwo-Fantasy @ Mewtwonite X
Ability: pohuaiyu
EVs: 4 HP / 252 Atk / 252 Spe
Jolly Nature
- Psystrike
- Close Combat
- Huan Shen Bu
- Swords Dance

Mewtwo-Fantasy @ Mewtwonite Y
Ability: Po Huai Yu
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
- Sucker Punch
- Punishment
- Psystrike
- Ice Beam
`;

export function summitEncounter(level = 100): RogueEncounter {
	const dex = Dex.mod('gen9fantasy');
	const sets = Teams.import(SUMMIT_TEAM)!.map(set => ({
		...set, level, species: dex.species.get(set.species).name, item: dex.items.get(set.item).name,
		ability: dex.abilities.get(set.ability).name,
		moves: set.moves.map(move => dex.moves.get(move).name),
	}));
	return { name: '塔顶 · 最后的守卫', team: sets.slice(0, 6), style: 'balanced', catchable: false,
		boss: { kind: 'summit', mewtwoY: sets[6] } };
}

/** Author's moves: https://pokepast.es/731230c921c0c207, plus the confirmed Fairy/Legend exceptions. */
export const ARCEUS_PHYSICAL_MOVES: Partial<Record<string, string>> = {
	Normal: 'Double-Edge', Bug: 'X-Scissor', Dark: 'Foul Play', Dragon: 'Outrage',
	Electric: 'Supercell Slam', Fire: 'Flare Blitz', Flying: 'Fly', Ground: 'Earthquake',
	Ice: 'Avalanche', Poison: 'Gunk Shot', Psychic: 'Zen Headbutt', Rock: 'Stone Edge',
	Water: 'Liquidation', Legend: 'Extreme Speed',
	Fighting: 'Body Press', Ghost: 'Phantom Force', Grass: 'Trailblaze', Steel: 'Iron Head', Fairy: 'Magic Coat',
};
export function arceusChallengeReady(moves = ARCEUS_PHYSICAL_MOVES) {
	const dex = Dex.mod('gen9fantasy');
	return [...ARCEUS_LIFE_TYPES, 'Legend'].every(type => {
		const move = dex.moves.get(moves[type] || '');
		return move.exists && (move.category === 'Physical' || type === 'Fairy' && move.id === 'magiccoat');
	});
}
export function arceusEncounter(level = 100, moves = ARCEUS_PHYSICAL_MOVES): RogueEncounter {
	if (!arceusChallengeReady(moves)) throw new Error('阿尔宙斯各阶段的第四招尚未配置完整。');
	return { name: '神之挑战 · 阿尔宙斯', style: 'balanced', catchable: false,
		boss: { kind: 'arceus', arceusMoves: { ...moves } }, team: [{
			name: '', species: 'Arceus', ability: 'Multitype', item: '', nature: 'Hardy', level,
			moves: ['Judgment', 'Recover', 'Cosmic Power', moves.Normal!],
			evs: { hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252 },
			ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, gender: 'N',
		}] };
}
