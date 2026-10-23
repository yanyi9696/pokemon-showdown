import { Dex, toID } from '../../sim/dex';
import { TeamValidator } from '../../sim/team-validator';
import { Format } from '../../sim/dex-formats';
import { roguePartyLimit } from '../../sim/fantasy-rogue-spirits';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueRun } from './types';
import { FORM_ITEMS, formItem } from './form-item-data';
import { canEditParty, healingLocked } from './team';
import { ensureMemberMemory, rebuildMember, rememberMove } from './progression';
import { rogueTime } from './friendship';

const dex = Dex.mod('gen9fantasy');
const validator = new TeamValidator(new Format({ ...Dex.formats.get('gen9nationaldex'), name: 'Rogue forms', mod: 'gen9fantasy' }));
const fusions: Record<string, { base: string, donor: string, form: string }[]> = {
	dnasplicers: [{ base: 'Kyurem', donor: 'Reshiram', form: 'Kyurem-White' }, { base: 'Kyurem', donor: 'Zekrom', form: 'Kyurem-Black' }],
	reinsofunity: [{ base: 'Calyrex', donor: 'Glastrier', form: 'Calyrex-Ice' }, { base: 'Calyrex', donor: 'Spectrier', form: 'Calyrex-Shadow' }],
	nsolarizer: [{ base: 'Necrozma', donor: 'Solgaleo', form: 'Necrozma-Dusk-Mane' }],
	nlunarizer: [{ base: 'Necrozma', donor: 'Lunala', form: 'Necrozma-Dawn-Wings' }],
};
const applianceMoves: Record<string, string> = { rotomheat: 'overheat', rotomwash: 'hydropump', rotomfrost: 'blizzard', rotomfan: 'airslash', rotommow: 'leafstorm' };
const fusionMoves: Record<string, string> = { calyrexice: 'glaciallance', calyrexshadow: 'astralbarrage', necrozmaduskmane: 'sunsteelstrike', necrozmadawnwings: 'moongeistbeam' };
const kyuremMoves: Record<string, Record<string, string>> = {
	kyuremwhite: { scaryface: 'fusionflare', glaciate: 'iceburn' },
	kyuremblack: { scaryface: 'fusionbolt', glaciate: 'freezeshock' },
};
export interface FormOption { id: string; item: string; species: string; donor?: string }
function requireRule(ok: unknown, text: string): asserts ok { if (!ok) throw new Error(text); }

export function formItemOptions(run: RogueRun, mon: RoguePokemon): FormOption[] {
	if (mon.egg || mon.fusion || mon.compound) return [];
	if (mon.formFusion) return run.bag[mon.formFusion.item] ? [{ id: 'separate', item: mon.formFusion.item, species: mon.formFusion.species }] : [];
	const current = dex.species.get(mon.set.species), options: FormOption[] = [];
	for (const item of FORM_ITEMS) {
		if (!run.bag[item.id] || !item.species.includes(current.baseSpecies)) continue;
		for (const fusion of fusions[item.id] || []) if (current.name === fusion.base) {
			for (const donor of run.team) if (donor !== mon && !donor.egg && !donor.fusion && !donor.formFusion && donor.hp > 0 &&
				donor.set.species === fusion.donor) options.push({ id: `${item.id}:${donor.id}`, item: item.id, species: fusion.form, donor: donor.id });
		}
		let forms = item.forms || [];
		if (item.id === 'revealglass') forms = [current.baseSpecies, current.baseSpecies + '-Therian'];
		if (item.id === 'dnasplicers' && !mon.formFusion) {
			if (mon.originalDragonUnlocked || ['Reshiram', 'Zekrom'].every(name => run.blessings?.dragonCharges?.includes(name))) forms = ['Kyurem', 'Kyurem-Original'];
		}
		for (const name of forms) if (name !== current.name && dex.species.get(name).exists) {
			if (name === 'Shaymin-Sky' && (rogueTime(run.floor) !== 'day' || mon.status === 'frz' || mon.statuses?.frz)) continue;
			options.push({ id: `${item.id}:${toID(name)}`, item: item.id, species: name });
		}
	}
	return options;
}

/** Never keep foreign moves or abilities after a form's learning permissions end. */
export function refreshFormMoves(mon: RoguePokemon, previous: string) {
	ensureMemberMemory(mon);
	const species = dex.species.get(mon.set.species);
	const legal = (id: string) => !validator.checkCanLearn(dex.moves.get(id), species, undefined, { level: 100 });
	const from = kyuremMoves[toID(previous)] || {}, to = kyuremMoves[species.id] || {};
	const converted = (id: string) => {
		const base = Object.keys(from).find(key => from[key] === toID(id)) || toID(id);
		return to[base] || base;
	};
	if (Object.keys(from).length || Object.keys(to).length) {
		mon.set.moves = mon.set.moves.map(converted);
		mon.seenMoves = mon.seenMoves?.map(converted);
		for (const slot of [...mon.pp, ...mon.moveMemory!]) {
			const next = converted(slot.id);
			if (next !== slot.id) {
				const maxpp = dex.moves.get(next).pp;
				Object.assign(slot, { id: next, pp: Math.max(0, maxpp - (slot.maxpp - slot.pp)), maxpp });
			}
		}
	}
	const oldAppliance = applianceMoves[toID(previous)], newAppliance = applianceMoves[species.id];
	mon.formMoveMemory ||= [];
	for (const slot of mon.moveMemory!) if (!legal(slot.id) || slot.id === oldAppliance) {
		mon.formMoveMemory = mon.formMoveMemory.filter(s => s.id !== slot.id).concat({ ...slot });
	}
	if (oldAppliance) {
		mon.set.moves = mon.set.moves.filter(id => toID(id) !== oldAppliance);
		mon.pp = mon.pp.filter(slot => slot.id !== oldAppliance);
		mon.moveMemory = mon.moveMemory!.filter(slot => slot.id !== oldAppliance);
	}
	mon.set.moves = mon.set.moves.filter(legal);
	mon.pp = mon.pp.filter(slot => legal(slot.id));
	mon.moveMemory = mon.moveMemory!.filter(slot => legal(slot.id));
	mon.seenMoves = mon.seenMoves?.filter(legal).filter(id => id !== oldAppliance);
	for (const slot of mon.formMoveMemory) if (legal(slot.id) && slot.id !== oldAppliance && !mon.moveMemory.some(s => s.id === slot.id)) {
		mon.moveMemory.push({ ...slot });
	}
	const signature = newAppliance || fusionMoves[species.id];
	if (signature) {
		rememberMove(mon, signature);
		mon.set.moves = [signature, ...mon.set.moves.filter(id => toID(id) !== signature)].slice(0, 4);
	}
	if (!mon.set.moves.length) {
		const fallback = Object.keys(dex.species.getFullLearnset(species.id)[0]?.learnset || {}).find(id => legal(id) && !dex.moves.get(id).isZ);
		requireRule(fallback, '目标形态缺少合法招式。'); rememberMove(mon, fallback); mon.set.moves = [fallback];
	}
	mon.abilityPool = Object.entries(species.abilities).map(([slot, name]) => ({ id: toID(name), hidden: slot === 'H' }));
}

export function useFormItem(run: RogueRun, member: string, optionID: string) {
	requireRule(canEditParty(run) && !healingLocked(run), '请在战斗外完成结算后使用形态道具。');
	const mon = run.team.find(p => p.id === member);
	requireRule(mon && mon.hp > 0, '请先选择并复活伙伴。');
	const activity = run.node?.event?.activity;
	requireRule(!activity?.member && !activity?.solo || run.node?.event?.settled, '请先完成当前伙伴的事件互动。');
	const option = formItemOptions(run, mon).find(o => o.id === optionID);
	requireRule(option, '当前没有该形态变化的道具或伙伴条件。');
	const previous = mon.set.species, previousAbility = mon.set.ability;
	if (option.id === 'separate') {
		const data = mon.formFusion!;
		requireRule(run.team.length < roguePartyLimit(run.spirit, run.blessings) || run.box && run.box.length < 30, '队伍和箱子都已满，请先为归队伙伴留出位置。');
		if (run.team.length < roguePartyLimit(run.spirit, run.blessings)) run.team.push(data.donor);
		else run.box!.push(data.donor);
		mon.set.ability = data.ability;
		delete mon.formFusion;
	} else if (option.donor) {
		const donor = run.team.find(p => p.id === option.donor)!;
		mon.formFusion = { item: option.item, species: previous, ability: previousAbility, donor: structuredClone(donor) };
		run.team = run.team.filter(p => p.id !== donor.id);
	}
	if (option.species === 'Kyurem-Original' && !mon.originalDragonUnlocked) {
		mon.originalDragonUnlocked = true; run.blessings!.dragonCharges = [];
	}
	mon.set.species = option.species;
	if (!mon.set.name || mon.set.name === previous) mon.set.name = option.species;
	const target = dex.species.get(option.species);
	if (option.id !== 'separate') {
		const slot = Object.keys(dex.species.get(previous).abilities).find(k => dex.species.get(previous).abilities[k as '0'] === previousAbility);
		mon.set.ability = target.abilities[slot as '0'] || target.abilities[0];
	}
	if (option.item === 'zygardecube') mon.set.ability = 'Power Construct';
	refreshFormMoves(mon, previous);
	rebuildMember(mon, run.boosts);
	const item = formItem(option.item)!;
	if (item.consumed) run.bag[item.id]--;
	(run.notices ||= []).push(`使用【${item.name}】完成形态变化，${item.consumed ? '道具已消耗' : '道具可以再次使用'}。`);
}
