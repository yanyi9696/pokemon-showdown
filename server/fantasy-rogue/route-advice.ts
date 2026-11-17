import type { RogueRun, RogueNode } from './types';

/** Display advice only: character-preference rewards retain their original matcher. */
export function routeAdvice(run: RogueRun) {
	if (run.phase !== 'choose') return;
	const choices = (run.choices || []).filter(node => !node.fogged);
	const party = run.team.filter(mon => !mon.egg && !mon.nuzlockeDead);
	const alive = party.filter(mon => mon.hp > 0);
	const hp = party.length ? party.reduce((sum, mon) => sum + mon.hp / mon.maxhp, 0) / party.length : 0;
	const level = party.length ? party.reduce((sum, mon) => sum + mon.set.level, 0) / party.length : 0;
	const regionLevels = choices.map(node => node.biome?.level).filter((value): value is number => !!value);
	const expected = regionLevels.length ? Math.max(...regionLevels) : Math.max(3, Math.min(100, Math.ceil(run.floor / 2)));
	const medicines = ['potion', 'superpotion', 'hyperpotion', 'maxpotion', 'fullrestore', 'oranberry', 'sitrusberry']
		.reduce((sum, id) => sum + Math.max(0, run.bag[id] || 0), 0);
	const pick = (predicates: ((node: RogueNode) => boolean)[], reason: string) => {
		for (const predicate of predicates) {
			const node = choices.find(predicate);
			if (node) return { id: node.id, name: node.name, reason };
		}
	};
	const rest = (node: RogueNode) => node.kind === 'rest';
	const reward = (node: RogueNode) => node.kind === 'reward';
	if (!alive.length) return pick([rest, reward], '伙伴们都需要休息，先寻找恢复的办法。');
	if (party.length < 2) return pick([node => node.kind === 'wild'], '同行的伙伴太少，先去能捕捉宝可梦的战斗区域补员。');
	if (hp < 0.45 && medicines < 2) return pick([reward, rest], '伙伴状态不佳，恢复物资也不多，先补给更稳妥。');
	if (level < expected * 0.85) return pick([node => node.trade?.kind === 'candy', reward], '伙伴等级暂时落后，先找经验糖果补上训练。');
	if (hp >= 0.75 && alive.length >= 2 && level >= expected) return pick([
		node => node.kind === 'elite', node => node.kind === 'encounter', node => node.kind === 'trainer',
	], '伙伴状态和等级都准备好了，可以挑战更强的对手。');
	return pick([node => node.kind === 'event'], '目前状态适中，去事件区域看看新的机遇吧。');
}
