import type { RogueAccount, RogueItem } from './types';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import { permanentMemberTypes, tonicDescription } from '../../sim/rogue-blessing-permanent';

export function tonicItems(discovered = false): RogueItem[] {
	return ['wine', 'cephalosporin'].map(id => ({ id: `rogue${id}`, name: id === 'wine' ? '酒' : '头孢',
		kind: 'tonic', price: 0, shopFloor: false, icon: id === 'wine' ? 'berryjuice' : 'fullheal',
		description: '一次性道具，效果永久绑定使用者。' + tonicDescription(id, discovered) }));
}
export function useTonic(account: RogueAccount, mon: RoguePokemon, item: RogueItem) {
	const kind = item.id === 'roguewine' ? 'wine' : item.id === 'roguecephalosporin' ? 'cephalosporin' : undefined;
	if (!kind) throw new Error('未知的祝福道具。');
	if (mon.tonics?.[kind]) throw new Error('该伙伴已经使用过此道具，效果不重复叠加，道具未消耗。');
	const poison = permanentMemberTypes(mon).includes('Poison');
	(mon.tonics ||= {})[kind] = true;
	if (kind === 'cephalosporin') {
		mon.status = '';
		mon.statusState = {};
		delete mon.statuses;
	}
	if (mon.tonics.wine && mon.tonics.cephalosporin) {
		mon.tonics.poison = poison;
		account.tonicSecret = true;
	}
}
