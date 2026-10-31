import type { Side } from './side';
import type { Pokemon } from './pokemon';
import { hasBlessing, blessingRevived } from './fantasy-rogue-blessings';
import { clearRogueStatus } from './fantasy-rogue-status';

const REVIVAL_ITEMS = { revive: { name: '活力碎片', fraction: 0.5 }, maxrevive: { name: '活力块', fraction: 1 } };
type RevivalItem = keyof typeof REVIVAL_ITEMS;

function permitted(side: Side) {
	return side.id === 'p1' && !!side.battle.fantasyRogue && !side.battle.fantasyRogue.duel &&
		!side.battle.ended && !!side.pokemon.some(mon => hasBlessing(mon, 'insight'));
}
export function revivalRequest(side: Side, moveRequest = side.requestState === 'move') {
	if (!moveRequest || !permitted(side)) return;
	return {
		items: Object.entries(REVIVAL_ITEMS).map(([id, item]) => ({
			id, name: item.name, count: side.battle.fantasyRogue!.bag[id] || 0,
		})),
		targets: side.pokemon.flatMap((mon, index) => mon.fainted && mon.hp === 0 ?
			[{ slot: index + 1, name: mon.name, species: mon.baseSpecies.name }] : []),
	};
}
export function chooseRogueRevival(side: Side, input: string) {
	const match = /^(revive|maxrevive) ([1-6])$/.exec(input);
	if (!match || !permitted(side) || side.requestState !== 'move') return side.emitChoiceError('当前不能使用复活道具。');
	const id = match[1] as RevivalItem, target = side.pokemon[Number(match[2]) - 1];
	const actor = side.active[side.getChoiceIndex()];
	const reserved = side.choice.actions.filter(action => action.choice === 'roguerevive' && action.moveid === id).length;
	if (!actor?.hp || actor.fainted || !target?.fainted || target.hp ||
		(side.battle.fantasyRogue!.bag[id] || 0) <= reserved || side.choice.actions.some(action => action.target === target)) {
		return side.emitChoiceError('请选择无法战斗的己方伙伴，并确认道具库存充足。');
	}
	side.choice.actions.push({ choice: 'roguerevive', pokemon: actor, target, moveid: id });
	return true;
}
export function useRogueRevival(actor: Pokemon, target: Pokemon, id: string) {
	const side = actor.side, battle = actor.battle, state = battle.fantasyRogue;
	if (!permitted(side) || !Object.prototype.hasOwnProperty.call(REVIVAL_ITEMS, id) || target.side !== side ||
		!target.fainted || target.hp || !actor.hp || actor.fainted || !(state!.bag[id] > 0)) return;
	const item = REVIVAL_ITEMS[id as RevivalItem];
	state!.bag[id]--;
	side.pokemonLeft++;
	target.fainted = false;
	target.faintQueued = false;
	target.subFainted = false;
	clearRogueStatus(target);
	target.status = '';
	target.statusState = battle.initEffectState({ id: '', target });
	target.hp = 1;
	target.sethp(Math.max(1, Math.floor(target.maxhp * item.fraction)));
	blessingRevived(target);
	battle.add('-message', `【濒死悟道】使用了【${item.name}】，${target.name}重新恢复了战斗能力！`);
	battle.add('-heal', target, target.getHealth, '[from] roguebagrevive', '[silent]');
}
