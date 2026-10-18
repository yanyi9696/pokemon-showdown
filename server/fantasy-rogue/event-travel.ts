import { randomSpeciesEligible } from './species-eligibility';
import { Dex, toID } from '../../sim/dex';
import { type RoguePokemon, type RogueBattleResult } from '../../sim/fantasy-rogue';
import { rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import { towerExperience } from './early-balance';
import { drawBlessingGift, blessingExperience } from './blessings';
import { partyEvolutionLevel } from './evolution';
import { gainExperience, levelMoves, rebuildMember, rememberMove } from './progression';
import { clearIllegalMoves, legalFormMoves } from './event-learning';
import { POSTCARDS } from './event-service-text';
import type { RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';

const dex = Dex.mod('gen9fantasy');
export type Postcard = keyof typeof POSTCARDS;
export interface TravelMemory {
	team: RoguePokemon[];
	bag: Record<string, number>;
	money: number;
	eventBuff?: RogueRun['eventBuff'];
}
export function regionalSpecies(region: Postcard) {
	const forme = POSTCARDS[region].forme;
	return dex.species.all().filter(species => species.exists && !species.name.includes('Fantasy') &&
		!species.battleOnly && !species.isMega && species.baseSpecies !== 'Pikachu' &&
		(species.forme === forme || forme === 'Paldea' && species.forme.startsWith('Paldea-')));
}
export function regionalPool(region: Postcard, level: number, content: RogueContent) {
	return regionalSpecies(region).filter(species =>
		content.unlocks[species.id] && randomSpeciesEligible(species.name, level) && partyEvolutionLevel(species.name) <= level)
		.map(species => species.name);
}
export function conversionChoices(run: RogueRun, region: Postcard) {
	return run.team.flatMap(mon => {
		const old = dex.species.get(mon.set.species), fantasy = old.name.includes('Fantasy');
		if (old.isMega || old.battleOnly || /Totem|Gmax/.test(old.forme)) return [];
		return regionalSpecies(region).filter(species => species.baseSpecies === old.baseSpecies)
			.map(species => fantasy ? dex.species.get(`${species.name}-Fantasy`) : species).filter(species =>
				species.exists && species.id !== old.id && !species.battleOnly)
			.map(species => ({ member: mon.id, target: species.name }));
	});
}
function converted(run: RogueRun, original: RoguePokemon, target: string) {
	const mon = structuredClone(original);
	const old = dex.species.get(original.set.species), next = dex.species.get(target);
	const legal = new Set(legalFormMoves(target)), ratio = mon.hp / mon.maxhp;
	const slot = Object.entries(old.abilities).find(([, name]) => toID(name) === toID(mon.set.ability))?.[0] || '0';
	mon.set.species = next.name;
	if (!mon.set.name || mon.set.name === old.name) mon.set.name = next.name;
	mon.set.ability = Object.values(next.abilities).includes(mon.set.ability) ? mon.set.ability :
		next.abilities[slot as '0' | '1' | 'H'] || next.abilities[0];
	mon.abilityPool = [{ id: toID(mon.set.ability), hidden: toID(next.abilities.H) === toID(mon.set.ability) }];
	clearIllegalMoves(mon, legal);
	const ordinary = next.name.replace(/-Fantasy$/, '');
	const learned = levelMoves(ordinary).filter(entry => entry.level <= mon.set.level).map(entry => entry.move);
	// Custom forms may add their own level-up moves, while ordinary forms use their latest generation's list.
	if (next.name.includes('Fantasy')) {
		for (const [move, sources] of Object.entries(dex.species.getLearnsetData(next.id).learnset || {})) {
			if (sources.some(source => /^[1-9]L\d+$/.test(source) && Number(source.slice(2)) <= mon.set.level)) learned.push(move);
		}
	}
	for (const move of learned) if (legal.has(move)) rememberMove(mon, move);
	if (!mon.set.moves.length) {
		const first = mon.moveMemory?.[0]?.id;
		if (!first) throw new Error('目标形态当前没有可用招式。');
		mon.set.moves = [first];
	}
	rebuildMember(mon, run.boosts);
	mon.hp = ratio ? Math.max(1, Math.floor(mon.maxhp * ratio)) : 0;
	return mon;
}
export function conversionPreview(run: RogueRun, member: string, target: string) {
	const original = run.team.find(mon => mon.id === member);
	if (!original) return undefined;
	const mon = converted(run, original, target);
	return { before: original.set.species, after: target, member, types: dex.species.get(target).types,
		ability: mon.set.ability, stats: mon.stats,
		removed: original.moveMemory?.filter(slot => !mon.moveMemory!.some(next => next.id === slot.id))
			.map(slot => slot.id) || [],
		added: mon.moveMemory!.filter(slot => !original.moveMemory?.some(old => old.id === slot.id)).map(slot => slot.id),
		equipped: mon.set.moves, hp: mon.hp, maxhp: mon.maxhp };
}
export function convertRegional(run: RogueRun, member: string, target: string) {
	const index = run.team.findIndex(mon => mon.id === member);
	if (index < 0) throw new Error('伙伴已经不在队伍中。');
	run.team[index] = converted(run, run.team[index], target);
}
export function regionalGift(run: RogueRun, content: RogueContent, region: Postcard, random: RogueRandom) {
	const level = Math.max(3, Math.min(100, Math.ceil(run.floor / 2)));
	return drawBlessingGift(run, content, random, { level, pool: regionalPool(region, level, content) });
}
export function snapshotTravelBattle(run: RogueRun) {
	const event = run.node?.event;
	if (event?.id !== 'travel' || event.stage !== 'battle') return;
	event.memory = structuredClone({ team: run.team, bag: run.bag, money: run.money, eventBuff: run.eventBuff });
}
/** Only capture results and earned experience survive this encounter; no battle payout hooks run. */
export function restoreTravelBattle(run: RogueRun, result: RogueBattleResult) {
	const event = run.node?.event;
	if (event?.id !== 'travel' || !event.memory) throw new Error('旅行战斗缺少恢复记录。');
	const memory = event.memory;
	run.team = structuredClone(memory.team);
	run.bag = { ...memory.bag }; run.money = memory.money;
	run.eventBuff = memory.eventBuff && { ...memory.eventBuff };
	run.notices = [];
	for (const defeated of result.defeated || []) {
		for (const mon of run.team) {
			if (!defeated.eligible.includes(mon.id)) continue;
			gainExperience(run, mon, Math.floor(towerExperience(rogueSpeciesData(defeated.species).baseExperience,
				defeated.level, mon.set.level, defeated.participants.includes(mon.id), run.floor) *
				(run.spirit === 'hooh' && mon.set.shiny ? 3 : 1) * blessingExperience(run, mon, defeated.dragonKing) *
				(1 + (run.growth?.experience || 0) / 10000)));
		}
	}
	for (const mon of run.team) {
		// Level-up growth remains, but the battle may neither heal nor damage the original party.
		const old = memory.team.find(saved => saved.id === mon.id)!;
		mon.hp = Math.min(mon.maxhp, old.hp);
	}
	delete event.memory;
}
