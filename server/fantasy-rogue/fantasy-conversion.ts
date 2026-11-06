import { Dex, toID } from '../../sim/dex';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import { blessingLearnChoices } from './blessings';
import { ensureMemberMemory, rebuildMember, rememberPastLevelMoves } from './progression';
import type { RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
const signatures: Record<string, [string, string]> = {
	urshifufantasy: ['wickedblow', 'dianshanxunji'], urshifu2fantasy: ['wickedblow', 'cunjinbengji'],
	urshifurapidstrikefantasy: ['surgingstrikes', 'yishunqianji'],
	urshifurapidstrike2fantasy: ['surgingstrikes', 'xingyihuanda'],
};
export function fantasyVariants(name: string) {
	const species = dex.species.get(name);
	const direct = dex.species.get(`${species.name}-Fantasy`);
	const alternate = dex.species.get(`${species.name}-2-Fantasy`);
	return [direct, alternate].filter(form => form.exists && !form.battleOnly).map(form => form.name);
}
export function fullFantasyMoves(name: string): string[] {
	return blessingLearnChoices({ set: { species: name, moves: [] }, moveMemory: [] } as unknown as RoguePokemon);
}
export function fantasyConversionOptions(mon: RoguePokemon) {
	if (mon.egg || mon.fusion || mon.formFusion || mon.nuzlockeDead) return [];
	const known = [...new Set([...mon.set.moves.map(toID), ...mon.moveMemory?.map(slot => slot.id) || []])];
	return fantasyVariants(mon.set.species).map(name => {
		const species = dex.species.get(name), legal = new Set(fullFantasyMoves(name)), signature = signatures[species.id];
		const replacements = signature && known.includes(signature[0]) ? [{ from: signature[0], to: signature[1] }] : [];
		return { species: name, types: species.types, signature: signature?.[1], replacements,
			removed: known.filter(id => !legal.has(id) && !replacements.some(pair => pair.from === id)),
			lostMoves: fullFantasyMoves(mon.set.species).filter(id => !legal.has(id)) };
	});
}
export function applyFantasyConversion(run: RogueRun, mon: RoguePokemon, target: string) {
	const preview = fantasyConversionOptions(mon).find(option => option.species === target);
	if (!preview) throw new Error('该伙伴没有所选幻想形态。');
	const old = dex.species.get(mon.set.species), species = dex.species.get(target);
	const legal = new Set(fullFantasyMoves(target));
	ensureMemberMemory(mon);
	const convert = (id: string) => preview.replacements.find(pair => pair.from === toID(id))?.to || toID(id);
	const slots = (memory: RoguePokemon['pp']) => {
		const unique = new Map<string, RoguePokemon['pp'][number]>();
		for (const slot of memory) {
			const id = convert(slot.id);
			if (!legal.has(id)) continue;
			const maxpp = id === slot.id ? slot.maxpp : dex.moves.get(id).pp;
			const pp = Math.max(0, maxpp - (slot.maxpp - slot.pp));
			const previous = unique.get(id);
			// A previously taught signature and its replacement must not create two slots or refill PP.
			unique.set(id, { id, maxpp, pp: previous ? Math.min(previous.pp, pp) : pp });
		}
		return [...unique.values()];
	};
	mon.set.moves = [...new Set(mon.set.moves.map(convert))].filter(id => legal.has(id));
	mon.pp = slots(mon.pp);
	mon.moveMemory = slots(mon.moveMemory!);
	mon.formMoveMemory = slots(mon.formMoveMemory || []);
	mon.seenMoves = [...new Set((mon.seenMoves || []).map(convert))].filter(id => legal.has(id));
	const slot = Object.keys(old.abilities).find(key => toID(old.abilities[key as '0']) === toID(mon.set.ability)) || '0';
	const unlocked = Object.entries(old.abilities)
		.filter(([, ability]) => mon.abilityPool?.some(entry => entry.id === toID(ability)))
		.map(([key]) => key);
	mon.set.species = mon.set.name = species.name;
	mon.set.ability = species.abilities[slot as '0'] || species.abilities[0];
	mon.abilityPool = [...new Set([slot, ...unlocked])].filter(key => species.abilities[key as '0'])
		.map(key => ({ id: toID(species.abilities[key as '0']), hidden: key === 'H' }));
	rememberPastLevelMoves(mon);
	if (!mon.set.moves.length) mon.set.moves = [mon.moveMemory?.[0]?.id || fullFantasyMoves(target)[0]];
	rebuildMember(mon, run.boosts);
	(run.notices ||= []).push(`${old.name} 已幻想化为 ${species.name}。`);
	for (const pair of preview.replacements) {
		run.notices.push(`专属招式替换：【${dex.moves.get(pair.from).name}】→【${dex.moves.get(pair.to).name}】，保留已消耗 PP。`);
	}
	if (preview.removed.length) {
		run.notices.push(`新形态不能保留的招式已移除：${preview.removed.map(id => dex.moves.get(id).name).join('、')}。`);
	}
}
