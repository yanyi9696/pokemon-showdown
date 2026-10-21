import { Dex, toID } from '../../sim/dex';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueRun } from './types';
import { evolutionChildren, partyEvolutionLevel } from './evolution';
import { compoundEvolutionAllowed } from '../../sim/rogue-compound';
import { friendship, ROGUE_FRIENDSHIP_EVOLUTION, rogueTime } from './friendship';

const dex = Dex.mod('gen9');
export const GHOLDENGO_EVOLUTION_COINS = 80000;
type Context = Pick<RogueRun, 'floor' | 'bag'> & Partial<Pick<RogueRun, 'blessings' | 'money'>>;
export interface EvolutionRequirement {
	text: string;
	/** Names are translated by the same client dictionary as the party editor. */
	name?: string;
	met: boolean;
	resource?: boolean;
}
export interface PartyEvolution {
	species: string;
	item?: string;
	heldItem?: string;
	requirements: EvolutionRequirement[];
	ready: boolean;
}

export function isFriendshipEvolution(species: Species) {
	// Showdown retains Sylveon's original affection description. Gen 8+ uses friendship instead.
	return species.evoType === 'levelFriendship' || species.id === 'sylveon';
}

function genderRequirement(mon: RoguePokemon, child: Species): EvolutionRequirement[] {
	// Fixed gender is species metadata, not always an additional evolution condition.
	// In particular N means genderless, never male.
	if (!['M', 'F'].includes(child.gender) || dex.species.get(mon.set.species).gender === child.gender) return [];
	return [{ text: `性别为${child.gender === 'F' ? '雌性' : '雄性'}`, met: mon.set.gender === child.gender }];
}

function friendshipRequirements(mon: RoguePokemon, child: Species, floor: number): EvolutionRequirement[] {
	const conditions: EvolutionRequirement[] = [{
		text: `亲密度达到 ${ROGUE_FRIENDSHIP_EVOLUTION}（当前 ${friendship(mon)}）`,
		met: friendship(mon) >= ROGUE_FRIENDSHIP_EVOLUTION,
	}];
	const night = rogueTime(floor) === 'night';
	if (child.evoCondition === 'during the day') conditions.push({ text: '白天、黄昏或黎明', met: !night });
	if (child.evoCondition === 'at night') conditions.push({ text: '夜晚', met: night });
	const fairyMove = mon.set.moves.some(move => dex.moves.get(move).type === 'Fairy');
	if (child.id === 'sylveon') conditions.push({ text: '当前招式中有妖精属性招式', met: fairyMove });
	if (child.id === 'espeon' || child.id === 'umbreon') {
		conditions.push({ text: '当前未装备妖精属性招式（否则优先进化为仙子伊布）', met: !fairyMove });
	}
	conditions.push(...genderRequirement(mon, child));
	return conditions;
}

/** A single source drives the condition display and the server's evolution gate. */
export function partyEvolutions(mon: RoguePokemon, context: Context = { floor: 1, bag: {} }): PartyEvolution[] {
	return evolutionChildren(mon.set.species).map(child => {
		const conditions: EvolutionRequirement[] = [];
		if (!compoundEvolutionAllowed(mon, child.name)) conditions.push({
			text: '五号化合物已锁定其他进化方向', met: false,
		});
		if (context.blessings?.owned.some(entry => entry.family === 'kid') && toID(mon.set.item) === 'eviolite' && !child.evos.length) {
			conditions.push({ text: '小鬼当家：携带进化奇石时不能进化为最终形态', met: false });
		}
		let item: string | undefined;
		let heldItem: string | undefined;
		if (toID(mon.set.species) === 'meltan' && child.id === 'melmetal') {
			conditions.push({ text: `专属糖果 ${context.blessings?.candy || 0} / 400（携带美录坦击倒或捕捉：钢系 +10，其他 +1）`,
				met: (context.blessings?.candy || 0) >= 400 });
		} else if (child.id === 'gholdengo') {
			conditions.push({ text: '等级达到 Lv.20', met: mon.set.level >= 20 });
			conditions.push({ text: `消耗 ${GHOLDENGO_EVOLUTION_COINS} 金币（当前 ${context.money || 0}）`,
				met: (context.money || 0) >= GHOLDENGO_EVOLUTION_COINS });
		} else if (isFriendshipEvolution(child)) {
			conditions.push(...friendshipRequirements(mon, child, context.floor));
		} else if (child.id === 'kingambit') {
			// Tower adaptation: use a Crest directly, with no additional level or KO counter.
			item = 'leaderscrest';
		} else {
			const level = partyEvolutionLevel(child.name);
			conditions.push({ text: `等级达到 Lv.${level}${child.evoLevel ? '' : '（塔内特殊进化等级）'}`, met: mon.set.level >= level });
			conditions.push(...genderRequirement(mon, child));
			if (child.evoType === 'useItem') item = toID(child.evoItem || (child.id === 'kleavor' ? 'Black Augurite' : ''));
			if (child.evoType === 'trade') item = 'linkingcord';
			if (['trade', 'levelHold'].includes(child.evoType || '') && child.evoItem) {
				heldItem = toID(child.evoItem);
				conditions.push({
					text: '携带（进化后消耗）', name: dex.items.get(heldItem).name, met: toID(mon.set.item) === heldItem,
				});
			}
			if (child.evoType === 'levelHold') {
				if (child.evoCondition === 'during the day') {
					conditions.push({ text: '白天、黄昏或黎明', met: rogueTime(context.floor) !== 'night' });
				}
				if (child.evoCondition === 'at night') conditions.push({ text: '夜晚', met: rogueTime(context.floor) === 'night' });
			}
		}
		if (item) conditions.push({
			text: item === 'linkingcord' ? '使用（塔内替代通信进化）' : '使用',
			name: item === 'linkingcord' ? '联系绳' : item === 'leaderscrest' ? '头领凭证' : dex.items.get(item).name,
			met: (context.bag[item] || 0) > 0, resource: true,
		});
		return { species: child.name, ...(item ? { item } : {}), ...(heldItem ? { heldItem } : {}), requirements: conditions,
			ready: conditions.every(condition => condition.met) && mon.hp > 0 };
	});
}
