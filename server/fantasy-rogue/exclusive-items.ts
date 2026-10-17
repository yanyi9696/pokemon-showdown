import { Dex, toID } from '../../sim/dex';
import type { RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
export interface ExclusiveItem {
	id: string; species: string[]; theme: string; trainer: string; avatar: string;
	place: string; clue: string; sites: string[]; guards: string[];
}
const themes: Record<string, Omit<ExclusiveItem, 'id' | 'species' | 'theme'>> = {
	mask: { trainer: '乌栗', avatar: 'kieran', place: '祭典散场后的山道', clue: '面具背面留下的绳结纹样',
		sites: ['挂着旧灯笼的树洞', '覆着青苔的石龛', '被落叶盖住的小祠', '溪边的旧木匣'], guards: ['Shiftry', 'Politoed', 'Dipplin', 'Yanmega'] },
	drive: { trainer: '遗迹调查员', avatar: 'scientist', place: '仍有指示灯闪烁的旧研究所', clue: '接口旁磨损的编号',
		sites: ['标着编号的储物柜', '停机的维护台', '封存的资料箱', '备用电源后方'], guards: ['Porygon-Z', 'Magnezone', 'Klinklang', 'Metagross'] },
	light: { trainer: '电气收藏家', avatar: 'pokefan', place: '电灯忽明忽暗的修理铺', clue: '电光留下的细小焦痕',
		sites: ['闪光的工具抽屉', '屋檐下的鸟巢', '蓄电池旁的布袋', '旧招牌后的木盒'], guards: ['Raichu', 'Ampharos', 'Pachirisu', 'Emolga'] },
	bone: { trainer: '守墓人', avatar: 'medium', place: '风声低回的墓园', clue: '骨质器物摩擦过的白痕',
		sites: ['老树根下', '石碑背后的裂缝', '祠堂的香炉旁', '月光照着的土堆'], guards: ['Marowak', 'Marowak-Alola', 'Dusclops', 'Sableye'] },
	shadow: { trainer: '海渊守望者', avatar: 'psychic', place: '潮水退去的海底神殿', clue: '瓶口溢出的暗色水迹',
		sites: ['破裂的祭坛', '贝壳覆盖的石台', '潮湿的壁龛', '沉船的舱底'], guards: ['Malamar', 'Dragalge', 'Spiritomb', 'Dhelmise'] },
	plate: { trainer: '神话研究员', avatar: 'sage', place: '刻满古老纹章的神殿', clue: '石片与壁画相接的纹路',
		sites: ['壁画下的暗格', '中央祭台', '断柱内部', '入口的石盘'], guards: ['Bronzong', 'Claydol', 'Sigilyph', 'Golurk'] },
	relic: { trainer: '古物守护者', avatar: 'veteran', place: '旧王城的遗迹', clue: '器物上反复出现的徽记',
		sites: ['盔甲旁的木柜', '倒塌的王座下', '石阶尽头的匣子', '庭院的枯井边'], guards: ['Aegislash', 'Gallade', 'Corviknight', 'Bisharp'] },
	mega: { trainer: '进化研究家', avatar: 'scientist', place: '散落着彩色矿石的山洞', clue: '与伙伴共鸣时亮起的矿纹',
		sites: ['洞口的晶簇', '地下水边的石缝', '洞壁上的小孔', '最深处的矿堆'], guards: ['Lucario', 'Aerodactyl', 'Steelix', 'Sableye'] },
	z: { trainer: '岛屿巡礼者', avatar: 'hiker', place: '海风吹拂的试炼台', clue: '晶体映出的招式轨迹',
		sites: ['试炼台的凹槽', '树荫下的石盒', '海边的贝壳堆', '山径旁的小洞'], guards: ['Lycanroc', 'Kommo-o', 'Mudsdale', 'Oricorio'] },
	keepsake: { trainer: '旅途收藏家', avatar: 'backpacker', place: '一间摆满旅途纪念品的小屋', clue: '只有这位伙伴认得的气味和印记',
		sites: ['窗边的旧箱', '垫着软布的篮子', '门后的柜子', '院角的小棚'], guards: ['Cinccino', 'Ambipom', 'Smeargle', 'Linoone'] },
};

/** Keep regional forms and Fantasy membership distinct, but merge item-selected forms. */
export function exclusiveFamily(name: string): string {
	const s = dex.species.get(name);
	const fantasy = s.name.includes('Fantasy') ? '-Fantasy' : '';
	const region = ['Alola', 'Galar', 'Hisui', 'Paldea'].find(r => s.name.includes(`-${r}`));
	return toID(s.baseSpecies.replace(/-Fantasy$/, '') + (region ? `-${region}` : '') + fantasy);
}
let catalog: ExclusiveItem[] | undefined;
const suitableCache = new Map<string, ExclusiveItem[]>();
export function exclusiveCatalog(): ExclusiveItem[] {
	if (catalog) return catalog;
	catalog = [];
	for (const item of dex.items.all()) {
		if (!item.exists || ['CAP', 'Custom', 'Unobtainable'].includes(item.isNonstandard || '') ||
			item.id.startsWith('rogue') || item.id === 'gmegawishingstar') continue;
		const users = [...(item.itemUser || []), ...[item.megaEvolves || []].flat()];
		// These native species boosts also recognize Fantasy forms by their original base species.
		// Do not generalize this to Mega stones, Z crystals or form-changing artifacts.
		if (['lightball', 'thickclub', 'luckypunch', 'metalpowder', 'quickpowder', 'souldew',
			'adamantorb', 'lustrousorb'].includes(item.id)) {
			for (const form of dex.species.all()) {
				if (form.name.endsWith('-Fantasy') && users.includes(form.name.slice(0, -8))) users.push(form.name);
			}
		}
		if (item.onPlate) users.push('Arceus');
		if (item.onDrive) users.push('Genesect');
		if (item.onMemory) users.push('Silvally');
		// Cover item-selected formes even when their item omits itemUser metadata.
		for (const form of dex.species.all()) {
			if (!form.isMega && (form.requiredItems || []).some(name => toID(name) === item.id)) users.push(form.name);
		}
		if (!users.length && item.forcedForme && !item.zMove) users.push(item.forcedForme);
		const species = [...new Set(users)].filter(name => dex.species.get(name).exists);
		if (!species.length) continue;
		const theme = item.megaStone ? 'mega' : item.zMove ? 'z' : item.id.endsWith('mask') ? 'mask' :
			item.onDrive || item.onMemory ? 'drive' : item.id === 'lightball' ? 'light' : item.id === 'thickclub' ? 'bone' :
			item.id === 'shadowbottle' ? 'shadow' : item.onPlate || item.id === 'legendplate' ? 'plate' :
			/^(rusted|adamant|lustrous|griseous|blueorb|redorb)/.test(item.id) ? 'relic' : 'keepsake';
		catalog.push({ id: item.id, species, theme, ...themes[theme] });
	}
	return catalog;
}
export function suitableExclusiveItems(species: string) {
	const owned = dex.species.get(species);
	if (suitableCache.has(owned.id)) return suitableCache.get(owned.id)!;
	const result = exclusiveCatalog().filter(entry => {
		const item = dex.items.get(entry.id);
		return entry.species.some(name => name === owned.name ||
			// Signature Z crystals can require a particular cap, regional or fusion form.
			(!item.zMove || item.onPlate) && exclusiveFamily(name) === exclusiveFamily(owned.name));
	});
	suitableCache.set(owned.id, result);
	return result;
}
export function syncExclusiveItems(run: RogueRun) {
	const ledger = run.exclusiveItems ||= {};
	for (const mon of [...run.team, ...(run.box || [])]) for (const entry of suitableExclusiveItems(mon.set.species)) {
		ledger[entry.id] ||= { since: run.floor, misses: 0, cooldown: 0 };
	}
	for (const id of Object.keys(ledger)) {
		if (run.bag[id] > 0 || [...run.team, ...(run.box || [])].some(mon => toID(mon.set.item) === id)) {
			ledger[id].obtained = true;
		}
	}
}
export function neededExclusiveItems(run: RogueRun) {
	syncExclusiveItems(run);
	const available = new Set(run.team.flatMap(mon => suitableExclusiveItems(mon.set.species).map(item => item.id)));
	return exclusiveCatalog().filter(item => available.has(item.id) && !run.exclusiveItems![item.id].obtained);
}
export function grantExclusiveItem(run: RogueRun, id: string) {
	syncExclusiveItems(run);
	if (!run.exclusiveItems![id] || run.exclusiveItems![id].obtained) return false;
	run.bag[id] = (run.bag[id] || 0) + 1;
	run.exclusiveItems![id].obtained = true;
	return true;
}
export function exclusiveEncounterChance(run: RogueRun, id: string) {
	const entry = run.exclusiveItems?.[id];
	return !entry || entry.obtained || run.floor < entry.cooldown ? 0 :
		Math.min(85, 15 + Math.max(0, run.floor - entry.since) + entry.misses * 8);
}
