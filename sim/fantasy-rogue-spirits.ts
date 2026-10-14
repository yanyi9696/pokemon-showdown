import type { Battle } from './battle';
import type { Pokemon } from './pokemon';
import { blessingAfterAction } from './fantasy-rogue-blessings';

/** Inactive designs stay visible to developers, never in the playable draw pool. */
export const ROGUE_SPIRITS = [
	{ id: 'zacian', species: 'Zacian', name: '苍响的磨砺', enabled: true,
		text: '每完成一个战斗、精英或遭遇区域，本局全队永久获得 1 点攻击。按区域结算，后来加入的伙伴同样享受；首领、道馆和休整不计入。' },
	// Keep the saved ID so existing adventures and clear cards retain this effect.
	{ id: 'mewtwo', species: 'Calyrex', name: '蕾冠王的研悟', enabled: true,
		text: '每完成一个事件、奖励或奇遇区域，本局全队永久获得 1 点特攻，后来加入的伙伴同样享受。休整与购物不计入。' },
	{ id: 'diancie', species: 'Diancie', name: '蒂安希的琢光', enabled: true,
		text: '每只可捕捉的野生宝可梦有 8% 概率初始为二星，六项能力值为一星的 120%，捕捉后保留星级。重试不重抽；不附带箱子或合成功能。' },
	{ id: 'palkia', species: 'Palkia', name: '帕路奇亚的扭曲', enabled: true,
		text: '每场开战时开启无自然期限的戏法空间。可以再次使用戏法空间关闭，本场不自动恢复；之后用招式开启的空间仍为正常期限。' },
	{ id: 'dialga', species: 'Dialga', name: '帝牙卢卡的操纵', enabled: true,
		text: '双方伤害类招式变为未来攻击，在使用两回合后的回合末攻击目标位置，可连续安排多次攻击；换人后由该位置的新宝可梦承受。变化招式照常，PP 在出招时消耗。' },
	{ id: 'gimmighoul', species: 'Gimmighoul', name: '索财灵的金库', enabled: true,
		text: '每持有 50000 金币，全队直接招式伤害增加 1%，按固定比例连续计算，不设上限。50 万金币增伤 10%，250 万增伤 50%；花费金币后加成同步降低，未兑换的战利品不计入。' },
	{ id: 'zygardeorder', species: 'Arceus', name: '阿尔宙斯的秩序', enabled: true,
		text: '双方伤害浮动固定为中间值；概率低于 50% 的效果不触发，达到 50% 必触发，天恩不加成。普通招式不击中要害；计入所有加成后，要害等级 1／2／3 以上必定要害，威力为 70%／85%／100%，原本必定要害的招式不降威力。睡眠、多段次数取中间值（小数向下取整），同速双方逐回合交替先手；捕捉仍按原概率。' },
	{ id: 'terapagos', species: 'Terapagos', name: '太乐巴戈斯的祝福', enabled: true, text: '本局祝福均为棱彩阶。' },
	{ id: 'gholdengo', species: 'Gholdengo', name: '赛富豪的祝福', enabled: true, text: '本局祝福均为黄金阶。' },
	{ id: 'silvally', species: 'Silvally', name: '银伴战兽的祝福', enabled: true, text: '本局祝福均为白银阶。' },
	{ id: 'necrozma', species: 'Necrozma', name: '奈克洛兹玛的祝福', enabled: true,
		text: '本局每轮祝福都以一银、一金、一彩的形式出现，从左到右依次为白银、黄金、棱彩。每个位置独立刷新且品质不变，领取时按所选祝福的品质承担等级代价。' },
	{ id: 'yveltal', species: 'Yveltal', name: '伊裴尔塔尔的交易', enabled: true,
		text: '我方招式造成实际伤害后，回复伤害量 50% 的 HP。每个商店最多用伙伴的 HP 购买 3 件商品，所有商品均可血付；休整只恢复 PP 和异常状态，不回血。' },
	{ id: 'latios', species: 'Latios', name: '拉帝欧斯的协奏', enabled: false, text: '所有对战改为双打。等待双打馆主队伍，暂不开放。' },
	{ id: 'hoopagift', species: 'Mew', name: '梦幻的奇赠', enabled: true,
		text: '获得普通携带道具时，有 50% 概率转化为一件幻想道具。羽毛、增强剂、进化及恢复用品不参与；已持有的道具交换不会触发。' },
	{ id: 'meowth', species: 'Meowth', name: '喵喵的商道', enabled: true,
		text: '普通商品提前 20 层解锁（最早第 9 层），并按阶段售卖经验糖果。商品售价提高 25%，战利品兑换价不变。' },
	{ id: 'zygarde', species: 'Zygarde', name: '基格尔德的聚合', enabled: true,
		text: '获得额外 30 格宝可梦箱子。3 只同物种、同形态、同星级的伙伴可手动合成，保留选中成员的资质与招式。2／3／4 星六维分别 ×1.2／×1.5／×2，合成最高 4 星。5 星为 ×3，预留给特殊事件。' },
	{ id: 'celebi', species: 'Celebi', name: '时拉比的驻时', enabled: true,
		text: '获得一只随机的 40 级宝可梦。只有这位伙伴的等级锁定为 40，战斗和经验糖果都无法使其升级；其他伙伴照常成长。' },
	{ id: 'mew', species: 'Xerneas', name: '哲尔尼亚斯的加护', enabled: true,
		text: '区域第二档（稀有）和第三档（罕见）槽位权重均 ×3，额外野生遭遇率 3%；161～180／181～200 层区域精英的一级神概率由 25%／50% 提升至 50%／75%。最终捕捉率翻倍，最高 100%；每 40 层一阶段，野怪依阶段额外 +1／2／3／4／5 级，最高 100 级。' },
	{ id: 'victini', species: 'Victini', name: '比克提尼的转机', enabled: true, text: '每个祝福选项多一次刷新，即各可刷新两次，刷新只改变效果，不改变品质。' },
	{ id: 'persian', species: 'Persian', name: '猫老大的悬赏', enabled: true,
		text: '每个商店有 15% 概率被火箭队袭击，击败后开放商店并获得 3000～25000 金币。袭击不会因刷新或重试而改变，也不会重复发奖。' },
	{ id: 'darkrai', species: 'Darkrai', name: '达克莱伊的迷途', enabled: true,
		text: '可选路线中有 2 项被迷雾隐藏。每首次进入 2 层，我方招式伤害累加 1%，第 200 层达到 +100%；固定休整与首领照常显示，重试不叠加。' },
	{ id: 'malamar', species: 'Giratina', name: '骑拉帝纳的世界', enabled: true,
		text: '双方的属性克制关系反转：克制变抵抗，抵抗与属性免疫变克制；特性免疫、守住等不受影响。' },
	{ id: 'groudon', species: 'Groudon', name: '固拉多的烈日', enabled: true, weather: 'sunnyday',
		text: '默认天气为大晴天，不随回合结束。其他天气可以覆盖；覆盖结束后恢复大晴天。' },
	{ id: 'kyogre', species: 'Kyogre', name: '盖欧卡的骤雨', enabled: true, weather: 'raindance',
		text: '默认天气为下雨，不随回合结束。其他天气可以覆盖；覆盖结束后恢复下雨。' },
	{ id: 'tyranitar', species: 'Tyranitar', name: '班基拉斯的沙暴', enabled: true, weather: 'sandstorm',
		text: '默认天气为沙暴，不随回合结束。其他天气可以覆盖；覆盖结束后恢复沙暴。' },
	{ id: 'kyurem', species: 'Kyurem', name: '酋雷姆的霜天', enabled: true, weather: 'snow',
		text: '默认天气为下雪，不随回合结束。其他天气可以覆盖；覆盖结束后恢复下雪。' },
	{ id: 'tapukoko', species: 'Tapu Koko', name: '卡璞·鸣鸣的雷域', enabled: true, terrain: 'electricterrain',
		text: '默认展开电气场地，不随回合结束。其他场地可以覆盖；覆盖结束后恢复电气场地。' },
	{ id: 'tapulele', species: 'Tapu Lele', name: '卡璞·蝶蝶的心域', enabled: true, terrain: 'psychicterrain',
		text: '默认展开精神场地，不随回合结束。其他场地可以覆盖；覆盖结束后恢复精神场地。' },
	{ id: 'tapubulu', species: 'Tapu Bulu', name: '卡璞·哞哞的沃土', enabled: true, terrain: 'grassyterrain',
		text: '默认展开青草场地，不随回合结束。其他场地可以覆盖；覆盖结束后恢复青草场地。' },
	{ id: 'tapufini', species: 'Tapu Fini', name: '卡璞·鳍鳍的薄雾', enabled: true, terrain: 'mistyterrain',
		text: '默认展开薄雾场地，不随回合结束。其他场地可以覆盖；覆盖结束后恢复薄雾场地。' },
	{ id: 'castform', species: 'Castform', name: '飘浮泡泡的万象', enabled: true,
		text: '仅当天气与场地同时为空时，从四种天气、四种场地中随机开启一种，持续 5 回合。已有任何天气或场地时不触发。' },
	{ id: 'tornadus', species: 'Tornadus', name: '龙卷云的回风', enabled: true,
		text: '开战时我方获得 4 回合顺风，结束后敌方获得 4 回合顺风，此后双方交替。招式产生的顺风不会重置交替顺序。' },
	{ id: 'regigigas', species: 'Regigigas', name: '雷吉奇卡斯的试炼', enabled: true,
		text: '本局队伍最多 3 只。我方造成的直接招式伤害 ×2，受到的直接招式伤害减半；HP、速度和持续伤害不变。' },
	{ id: 'hoopamischief', species: 'Hoopa', name: '胡帕的恶作剧', enabled: true,
		text: '开战时双方各抽一个效果：隐形岩、撒菱、毒菱、黏黏网、碎菱钢、反射壁、光墙或神秘守护。障碍为单层，保护效果持续 5 回合；同场重试不重抽。' },
	{ id: 'jirachi', species: 'Jirachi', name: '基拉祈的双愿', enabled: true,
		text: '每次提供两个同阶祝福，可获得两项，每项仍可刷新一次。每选择一项分别承担该阶段的等级代价。' },
	{ id: 'hooh', species: 'Ho-Oh', name: '凤王的虹辉', enabled: true,
		text: '可捕捉野怪的闪光概率提升至 2%。我方闪光伙伴的对战经验 ×3，经验糖果不受影响。' },
];
export const activeRogueSpirits = () => ROGUE_SPIRITS.filter(spirit => spirit.enabled);
export const rogueSpirit = (id?: string) => ROGUE_SPIRITS.find(spirit => spirit.id === id);
export const roguePartyLimit = (id?: string) => id === 'regigigas' ? 3 : 6;
export const rogueStarScale = (stars = 1) => [1, 1, 1.2, 1.5, 2, 3][Math.max(1, Math.min(5, stars))];
export const rogueWildLevelBonus = (floor: number, spirit?: string) =>
	spirit === 'mew' ? Math.max(1, Math.min(5, Math.ceil(floor / 40))) : 0;
export const rogueCoinDamageMultiplier = (money = 0) => 1 + Math.max(0, money) / 5000000;

/** Called after charge/prepare checks, before accuracy, immunities and damage. */
export function queueRogueFutureAttack(battle: Battle, targets: Pokemon[], source: Pokemon, move: ActiveMove) {
	if (battle.fantasyRogue?.spirit?.id !== 'dialga' || move.category === 'Status' || move.rogueFutureReleased || move.id === 'roguepsychicburst') {
		return false;
	}
	const queued = battle.dex.deepClone(move);
	queued.rogueDelayed = false;
	queued.rogueFutureReleased = true;
	(battle.fantasyRogue.futureAttacks ||= []).push({
		turn: battle.turn + 2, source, slots: targets.map(target => target.getSlot()), move: queued,
	});
	move.rogueDelayed = true;
	battle.attrLastMove('[still]');
	battle.add('-message', `${source.name}的${move.name}将在第 ${battle.turn + 2} 回合末到达目标位置。`,
		'[roguefuture]', source, move.id, targets.map(target => target.getSlot()).join(','), battle.turn + 2);
	return true;
}

/** Slot-based attacks survive switches, fainting and native battle serialization. */
export function resolveRogueFutureAttacks(battle: Battle) {
	const state = battle.fantasyRogue;
	if (state?.spirit?.id !== 'dialga' || !state.futureAttacks?.length) return;
	const due = state.futureAttacks.filter(attack => attack.turn <= battle.turn);
	state.futureAttacks = state.futureAttacks.filter(attack => attack.turn > battle.turn);
	for (const attack of due) {
		if (battle.ended) break;
		const { source, move } = attack;
		const targets = attack.slots.map(slot => battle.getAtSlot(slot)).filter(target => target?.hp && target !== source);
		if (!targets.length) continue;
		move.flags = { ...move.flags, futuremove: 1 };
		delete move.flags.protect;
		// Native Future Sight/Doom Desire already wait two turns; never schedule them twice.
		if (['futuresight', 'doomdesire'].includes(move.id)) move.ignoreImmunity = false;
		const selfSwitch = move.selfSwitch;
		if (!source.isActive || !source.hp) move.selfSwitch = false;
		battle.add('-message', `${source.name}的未来攻击到达了！`);
		battle.addMove('-anim', source, move.name, targets[0]);
		const hit = battle.actions.trySpreadMoveHit(targets, source, move, true);
		blessingAfterAction(battle, source, move);
		if (hit && source.isActive && source.hp) {
			if (move.selfBoost) battle.actions.moveHit(source, source, move, move.selfBoost, false, true);
			if (!move.negateSecondary && !(move.hasSheerForce && source.hasAbility('sheerforce'))) {
				battle.singleEvent('AfterMoveSecondarySelf', move, null, source, targets[0], move);
				battle.runEvent('AfterMoveSecondarySelf', source, targets[0], move);
			}
		}
		move.selfSwitch = selfSwitch;
		battle.activeMove = null;
		battle.checkWin();
	}
}

/** Called at battle start and after native weather/terrain timers have expired. */
export function maintainRogueEnvironment(battle: Battle) {
	const state = battle.fantasyRogue?.spirit;
	if (!state) return;
	const spirit = rogueSpirit(state.id);
	const source = battle.p1.active.find(mon => mon?.hp) || battle.p2.active.find(mon => mon?.hp) || battle.p1.pokemon[0];
	const randomEnvironment = state.id === 'castform' && !battle.field.weather && !battle.field.terrain ?
		battle.sample([
			'sunnyday', 'raindance', 'sandstorm', 'snow', 'electricterrain', 'psychicterrain', 'grassyterrain', 'mistyterrain',
		]) : '';
	if (!battle.field.weather && (spirit?.weather || (randomEnvironment && !randomEnvironment.endsWith('terrain')))) {
		const weather = spirit?.weather || randomEnvironment;
		if (battle.field.setWeather(weather, source, battle.format)) {
			if (spirit?.weather) delete battle.field.weatherState.duration;
			else battle.field.weatherState.duration = 5;
		}
	}
	if (!battle.field.terrain && (spirit?.terrain || randomEnvironment.endsWith('terrain'))) {
		const terrain = spirit?.terrain || randomEnvironment;
		if (battle.field.setTerrain(terrain, source, battle.format)) {
			if (spirit?.terrain) delete battle.field.terrainState.duration;
			else battle.field.terrainState.duration = 5;
		}
	}
	if (state.id === 'tornadus') {
		if (battle.fantasyRogue?.duel) {
			// Each archive starts its own ally-first cycle; simultaneous handoffs give both sides wind.
			for (const side of battle.sides) {
				if (!side.sideConditions.tailwind) side.addSideCondition('tailwind', source, battle.format);
			}
			return;
		}
		const previous = state.windSide;
		if (previous === undefined || !battle.sides[previous].sideConditions.tailwind) {
			const next = previous === undefined ? 0 : 1 - previous;
			state.windSide = next;
			const side = battle.sides[next];
			side.addSideCondition('tailwind', source, battle.format);
			if (side.sideConditions.tailwind) side.sideConditions.tailwind.duration = 4;
		}
	}
}

export function startRogueSpirit(battle: Battle) {
	if (battle.deserialized || !battle.fantasyRogue?.spirit) return;
	const state = battle.fantasyRogue.spirit;
	battle.add('-message', `塔灵：${rogueSpirit(state.id)?.name || state.id}`);
	maintainRogueEnvironment(battle);
	if (state.id === 'palkia') {
		battle.field.addPseudoWeather('trickroom', battle.p1.pokemon[0], battle.format);
		delete battle.field.pseudoWeather.trickroom.duration;
		battle.add('-message', '帕路奇亚的戏法空间不会自然结束。', '[roguepermanentroom]');
	}
	if (state.id === 'hoopamischief') {
		for (const [i, side] of battle.sides.entries()) {
			const effects = [state.hazards?.[i] || 'stealthrock'];
			// The second archive has the opposite ally/foe orientation. Preserve both rolled pairs.
			if (battle.fantasyRogue.duel) effects.push(battle.fantasyRogue.duel.hazards?.[1 - i] || 'stealthrock');
			for (const id of effects) {
				side.addSideCondition(id, side.foe.pokemon[0], battle.format);
				if (['reflect', 'lightscreen', 'safeguard'].includes(id) && side.sideConditions[id]) {
					side.sideConditions[id].duration = 5;
				}
			}
		}
	}
}
