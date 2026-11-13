import type { RogueCoopAdventure, RogueCoopMemberState, RogueItem } from './types';
import { hpPurchaseCost } from './spirits';

/** The limit belongs to each player's visit; shared stock still belongs to the route. */
export function coopHpShop(adventure: RogueCoopAdventure, member: RogueCoopMemberState) {
	const node = adventure.node;
	if (adventure.spirit !== 'yveltal' || adventure.phase !== 'route-interaction' || !node ||
		!['rest', 'trade'].includes(node.kind) || node.rocket && !node.rocket.cleared) return null;
	const visit = `${adventure.id}:${adventure.floor}:${node.id}`;
	const used = member.hpPurchases?.visit === visit ? member.hpPurchases.receipts.length : 0;
	return { visit, remaining: Math.max(0, 3 - used),
		locked: adventure.tradeProposal ? '请先完成或撤回交换，再使用伙伴的 HP 购物。' :
		member.pendingMoves?.length ? '请先处理自己队伍的待学习招式。' : '',
		payers: member.team.filter(mon => !mon.egg && !mon.nuzlockeDead && mon.hp > 0)
			.map(mon => ({ id: mon.id, species: mon.set.species, hp: mon.hp, maxhp: mon.maxhp })) };
}

export function payCoopHp(
	adventure: RogueCoopAdventure, member: RogueCoopMemberState, item: RogueItem,
	request: { id: string, visit?: string, member?: string, count?: number }
) {
	const quote = coopHpShop(adventure, member);
	if (!quote || quote.visit !== request.visit) throw new Error('血量商店已变化，请刷新后重新选择。');
	if (quote.locked) throw new Error(quote.locked);
	if (request.count !== undefined && request.count !== 1) throw new Error('血量支付每次只能购买一件。');
	if (!quote.remaining) throw new Error('你在本商店的血量购买限额已用完。');
	const payer = quote.payers.find(mon => mon.id === request.member);
	if (!payer) throw new Error('请选择自己队伍中存活且已孵化的伙伴支付。');
	const cost = hpPurchaseCost(item, payer.maxhp);
	if (payer.hp <= cost) throw new Error(`需要 ${cost} HP，支付后至少保留 1 HP。`);
	member.team.find(mon => mon.id === payer.id)!.hp -= cost;
	if (member.hpPurchases?.visit !== quote.visit) member.hpPurchases = { visit: quote.visit, receipts: [] };
	member.hpPurchases.receipts.push(request.id);
	return { cost, species: payer.species };
}
