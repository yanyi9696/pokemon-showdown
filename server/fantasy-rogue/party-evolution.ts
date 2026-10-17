import { Dex, toID } from '../../sim/dex';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueRun } from './types';
import { evolutionChildren, partyEvolutionLevel } from './evolution';
import { friendship, ROGUE_FRIENDSHIP_EVOLUTION, rogueTime } from './friendship';

const dex = Dex.mod('gen9');
type Context = Pick<RogueRun, 'floor' | 'bag'> & Partial<Pick<RogueRun, 'blessings'>>;
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
	if (child.gender) conditions.push({
		text: `性别为${child.gender === 'F' ? '雌性' : '雄性'}`, met: mon.set.gender === child.gender,
	});
	return conditions;
}

/** A single source drives the condition display and the server's evolution gate. */
export function partyEvolutions(mon: RoguePokemon, context: Context = { floor: 1, bag: {} }): PartyEvolution[] {
	return evolutionChildren(mon.set.species).map(child => {
		const conditions: EvolutionRequirement[] = [];
		if (context.blessings?.owned.some(entry => entry.family === 'kid') && toID(mon.set.item) === 'eviolite' && !child.evos.length) {
			conditions.push({ text: '小鬼当家：携带进化奇石时不能进化为最终形态', met: false });
		}
		let item: string | undefined;
		let heldItem: string | undefined;
		if (toID(mon.set.species) === 'meltan' && child.id === 'melmetal') {
			conditions.push({ text: `专属糖果 ${context.blessings?.candy || 0} / 400（携带美录坦击倒或捕捉：钢系 +10，其他 +1）`,
				met: (context.blessings?.candy || 0) >= 400 });
		} else if (isFriendshipEvolution(child)) {
			conditions.push(...friendshipRequirements(mon, child, context.floor));
		} else {
			const level = partyEvolutionLevel(child.name);
			conditions.push({ text: `等级达到 Lv.${level}${child.evoLevel ? '' : '（塔内特殊进化等级）'}`, met: mon.set.level >= level });
			if (child.gender) conditions.push({
				text: `性别为${child.gender === 'F' ? '雌性' : '雄性'}`, met: mon.set.gender === child.gender,
			});
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
			if (item) conditions.push({
				text: item === 'linkingcord' ? '使用（塔内替代通信进化）' : '使用',
				name: item === 'linkingcord' ? '联系绳' : dex.items.get(item).name,
				met: (context.bag[item] || 0) > 0, resource: true,
			});
		}
		return { species: child.name, ...(item ? { item } : {}), ...(heldItem ? { heldItem } : {}), requirements: conditions,
			ready: conditions.every(condition => condition.met) && mon.hp > 0 };
	});
}
