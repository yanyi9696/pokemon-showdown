import { randomUUID } from 'crypto';
import type { RogueRandom } from './biome-pools';
import type { RogueRun } from './types';
import { makeEncounterSet, randomEncounterIVs } from './encounter-sets';
import { lowerToEligibleStage } from './evolution';

const avatars: Record<string, string> = { hexmaniac: 'hexmaniac-gen6', cheerleader: 'backersf', snowboarder: 'skier' };

/** Authored themes, not a particular named NPC's canonical team. */
export const TRAVELLING_TRAINERS = [
	{ id: 'hiker', name: '登山男', line: '山路一步一步走，对战也一样。来，踏稳脚下！', team: ['Golem', 'Machamp', 'Gigalith', 'Camerupt', 'Probopass'] },
	{ id: 'swimmerf', name: '比基尼大姐姐', line: '泳池外也能掀起浪花哦。让我们的伙伴活动一下吧！', team: ['Golduck', 'Lanturn', 'Mantine', 'Azumarill', 'Lumineon'] },
	{ id: 'hexmaniac', name: '灵异迷', line: '刚才有谁从你背后飘过去了……是我的伙伴啦。', team: ['Mismagius', 'Banette', 'Drifblim', 'Gourgeist', 'Chandelure'] },
	{ id: 'cheerleader', name: '啦啦队员', line: '一、二！一、二！给彼此的伙伴加油吧！', team: ['Plusle', 'Minun', 'Oricorio-Pom-Pom', 'Bellossom', 'Lopunny'] },
	{ id: 'reporter', name: '记者', line: '可以采访一下你的对战风格吗？就用招式回答！', team: ['Exploud', 'Magneton', 'Noctowl', 'Pelipper', 'Chatot'] },
	{ id: 'fisherman', name: '钓鱼大叔', line: '上钩的不一定是鱼，也可能是一场好对战！', team: ['Gyarados', 'Whiscash', 'Seaking', 'Barraskewda', 'Kingler'] },
	{ id: 'scientist', name: '研究员', line: '数据只能提出猜想，真正的答案还要交给实战。', team: ['Magnezone', 'Porygon2', 'Weezing', 'Reuniclus', 'Metagross'] },
	{ id: 'blackbelt', name: '空手道王', line: '向伙伴敬礼！出招时要全心信任它们！', team: ['Hariyama', 'Medicham', 'Hitmontop', 'Sawk', 'Mienshao'] },
	{ id: 'backpacker', name: '背包客', line: '下一站还很远，不如先交换一点旅行经验吧。', team: ['Furret', 'Mudsdale', 'Skiddo', 'Sandaconda', 'Dudunsparce'] },
	{ id: 'pokemonbreeder', name: '宝可梦培育家', line: '它们每天都有新进步，今天想请你帮忙见证。', team: ['Blissey', 'Togetic', 'Ampharos', 'Stoutland', 'Altaria'] },
	{ id: 'beauty', name: '大姐姐', line: '自信也是一种美。来看看我们练习的成果吧。', team: ['Ninetales', 'Milotic', 'Tsareena', 'Cinccino', 'Roserade'] },
	{ id: 'artist', name: '画家', line: '你的伙伴很有神采！让我用一场对战记住这个瞬间。', team: ['Smeargle', 'Grafaiai', 'Vivillon', 'Florges', 'Bruxish'] },
	{ id: 'gentleman', name: '绅士', line: '旅途辛苦了。若方便，容我请教一场。', team: ['Arcanine', 'Persian', 'Polteageist', 'Indeedee', 'Furfrou'] },
	{ id: 'worker', name: '工人', line: '工地刚收工，伙伴们还有使不完的力气！', team: ['Conkeldurr', 'Excadrill', 'Copperajah', 'Orthworm', 'Steelix'] },
	{ id: 'pokemonranger', name: '宝可梦巡护员', line: '道路已经检查过了。接下来，检验一下彼此的配合吧。', team: ['Sawsbuck', 'Breloom', 'Talonflame', 'Leavanny', 'Manectric'] },
	{ id: 'guitarist', name: '吉他手', line: '拍子跟上！把这场对战演奏到最后！', team: ['Toxtricity', 'Electrode', 'Loudred', 'Obstagoon', 'Rillaboom'] },
	{ id: 'sailor', name: '水手', line: '风向变了也不怕。好搭档总能把船带回港口！', team: ['Poliwrath', 'Pelipper', 'Dhelmise', 'Machoke', 'Floatzel'] },
	{ id: 'bugcatcher', name: '捕虫少年', line: '别小看我的虫宝可梦！它们也有厉害的绝招！', team: ['Butterfree', 'Scyther', 'Heracross', 'Vikavolt', 'Galvantula'] },
	{ id: 'birdkeeper', name: '鸟使', line: '听见振翅声了吗？那是我们的开场信号！', team: ['Pidgeot', 'Staraptor', 'Corviknight', 'Swellow', 'Kilowattrel'] },
	{ id: 'psychic', name: '超能力者', line: '我看见了几种可能的结局……这次由你来改变它。', team: ['Alakazam', 'Xatu', 'Espeon', 'Claydol', 'Gothitelle'] },
	{ id: 'pokefan', name: '宝可梦发烧友', line: '每只伙伴都有拿手好戏，我忍不住想介绍给你！', team: ['Raichu', 'Wigglytuff', 'Dedenne', 'Mimikyu', 'Togedemaru'] },
	{ id: 'biker', name: '暴走族', line: '放心，车停好了。今天只比宝可梦的本事！', team: ['Weezing', 'Muk', 'Revavroom', 'Skuntank', 'Scrafty'] },
	{ id: 'snowboarder', name: '滑雪玩家', line: '转弯、加速，出招也要找到自己的节奏！', team: ['Glalie', 'Froslass', 'Weavile', 'Abomasnow', 'Cetitan'] },
	{ id: 'acetrainer', name: '精英训练家', line: '让我们认真打一场，看看双方的队伍还有什么可能。', team: ['Lucario', 'Gardevoir', 'Garchomp', 'Rotom', 'Scizor'] },
];

export function prepareTravellingTrainer(run: RogueRun, random: RogueRandom) {
	const node = run.node!;
	if (node.kind !== 'trainer' || node.event || node.encounters.some(e => e.trainer || e.trainerCandidates || e.forcedTera)) return;
	const trainer = TRAVELLING_TRAINERS[random(TRAVELLING_TRAINERS.length)];
	const level = Math.max(3, Math.min(100, Math.ceil(run.floor / 2) + 1));
	const candidates = [...trainer.team];
	const count = run.floor < 80 ? 3 : 4;
	const team = Array.from({ length: count }, () => {
		const species = candidates.splice(random(candidates.length), 1)[0];
		return makeEncounterSet(lowerToEligibleStage(species, level), level, randomEncounterIVs(random, false));
	});
	node.encounters = [{ key: randomUUID(), name: trainer.name, team, style: 'balanced', catchable: false,
		trainer: { id: trainer.id, name: trainer.name, avatar: avatars[trainer.id] || trainer.id, role: 'traveller', tera: false } }];
	node.name = trainer.name;
	(run.notices ||= []).push(trainer.name + '：「' + trainer.line + '」');
}
