import type { RogueAccount, RogueContent, RogueNode, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { collectionView, rewardMushroomObservation } from './collection-events';
import { chooseEventOption, rewardReceipt } from './events';

export function collectorRoute(node?: RogueNode) {
	return node?.kind === 'trade' && node.trade?.kind === 'mushroom';
}
type CollectorEntry = { userid: string, run: RogueRun };

/** Either party may supply the observed partner, but the dialogue is chosen together. */
export function collectorOptions(entries: CollectorEntry[]) {
	if (entries.length !== 2 || entries.some(({ run }) => !collectorRoute(run.node) ||
		run.node?.event?.id !== 'mushroomcollector' || run.node.event.settled)) return [];
	const options: { id: string, name: string, text: string, disabled: boolean, pokemon?: string, seat?: number }[] =
		entries.flatMap(({ userid, run }, index) => collectionView(run).options
			.filter(option => option.id.startsWith('show:'))
			.map(option => ({ ...option, id: `show:${userid}:${option.id.slice(5)}`,
				pokemon: run.team.find(mon => mon.id === option.id.slice(5))!.set.species, seat: index + 1,
				name: `展示 ${index + 1}P 的 ${run.team.find(mon => mon.id === option.id.slice(5))!.set.species}`,
				text: '双方各获得一份观察谢礼，本次来访只能领取一次。' })));
	options.push({ id: 'collectorshop', name: '看看蘑菇的回收价',
		text: '跳过展示；各自背包的蘑菇按普通兑换价的 125% 回收。', disabled: false });
	return options;
}

export function settleCollector(
	entries: (CollectorEntry & { account: RogueAccount })[], content: RogueContent, random: RogueRandom, choice: string
) {
	if (!collectorOptions(entries).some(option => option.id === choice && !option.disabled)) {
		throw new Error('共同展示的伙伴或收藏家选项已变化，请刷新后重选。');
	}
	const [, owner, member] = choice.split(':');
	for (const entry of entries) {
		const { run } = entry;
		const personalChoice = owner === entry.userid ? `show:${member}` : 'collectorshop';
		chooseEventOption(entry.account, run, content, random, run.node!.event!.key, personalChoice);
		if (owner && owner !== entry.userid) {
			const before = { money: run.money, bag: { ...run.bag } };
			rewardMushroomObservation(run);
			rewardReceipt(run, before);
		}
		if (!Number.isSafeInteger(run.money) || !Number.isSafeInteger(run.bag.tinymushroom || 0)) {
			throw new Error('收藏家奖励超出可保存范围。');
		}
		run.node!.event!.stage = 'result';
		run.node!.event!.result = owner ? [
			'收藏家仔细观察你们带来的蘑菇伙伴，向双方各赠送一份观察谢礼。',
			'现在可分别回收自己的背包物品；蘑菇享受 125% 回收价，其他战利品按普通兑换价。',
		] : ['你们来到回收柜台。蘑菇享受 125% 回收价，其他战利品按普通兑换价；双方各自交易。'];
	}
}
