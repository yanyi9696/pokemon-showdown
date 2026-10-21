import { toID } from '../../sim/dex';
import type { RogueItem } from './types';

export const EVOLUTION_HELD_ITEMS = [
	["King's Rock", '王者之证', 49], ['Protector', '护具', 69], ['Dragon Scale', '龙之鳞片', 49],
	['Electirizer', '电力增幅器', 69], ['Magmarizer', '熔岩增幅器', 69], ['Up-Grade', '升级数据', 49],
	['Razor Fang', '锐利之牙', 49], ['Razor Claw', '锐利之爪', 49], ['Dubious Disc', '可疑补丁', 69],
	['Prism Scale', '美丽鳞片', 49], ['Reaper Cloth', '灵界之布', 69], ['Deep Sea Tooth', '深海之牙', 49],
	['Deep Sea Scale', '深海鳞片', 49], ['Oval Stone', '浑圆之石', 29], ['Sachet', '香袋', 49], ['Whipped Dream', '泡沫奶油', 49],
] as const;
export function addEvolutionSupplies(items: RogueItem[]) {
	for (const [name, label, floor] of EVOLUTION_HELD_ITEMS) {
		const id = toID(name), old = items.find(i => i.id === id);
		if (old) {
			old.category = '进化道具'; old.shopFloor = floor;
			continue;
		}
		items.push({ id, name: label, kind: 'held', category: '进化道具', icon: id,
			price: floor >= 69 ? 2400 : floor >= 49 ? 1800 : 1200, shopFloor: floor,
			description: '进化用携带道具。装备后在队伍面板检查对应伙伴的条件；需要交换的进化另用联系绳，进化时消耗携带道具。' });
	}
	for (const [id, name] of [['peatblock', '泥炭块'], ['strawberrysweet', '草莓糖饰']]) {
		if (!items.some(i => i.id === id)) items.push({ id, name, kind: 'evolution', icon: id, price: 1600, shopFloor: 49,
			description: '用于专属进化事件；满足条件后可交给研究人员或培育家。' });
	}
	for (const [id, name] of [['powerlens', '力量镜'], ['powerbracer', '力量护腕'], ['poweranklet', '力量护踝'],
		['powerbelt', '力量腰带'], ['powerweight', '力量负重'], ['powerband', '力量束带'], ['lightball', '电气球']]) {
		if (!items.some(i => i.id === id)) items.push({ id, name, kind: 'held', icon: id, price: 0, shopFloor: false,
			category: id === 'lightball' ? '专属道具' : '力量系列',
			description: id === 'lightball' ? '皮卡丘携带时，攻击与特攻变为原来的 2 倍。' : '携带时速度减半，击败对手后额外获得对应能力的 8 点努力值，仍受单项 252、总计 510 上限限制。' });
	}
}
