import { randomUUID } from 'crypto';
import type { RogueAccount, RogueContent, RogueCoopAdventure, RogueRun } from './types';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueRandom } from './biome-pools';
import { chooseEventOption } from './events';
import { createRoguePokemon } from './progression';
import { coopScrollBattler } from './coop-scroll';

type Entry = { userid: string, run: RogueRun, account: RogueAccount };
const healthy = (mon: RoguePokemon) => !mon.egg && !mon.nuzlockeDead && mon.hp > 0;

/** Pick the escorting player together before reserving their one active battle position. */
export function coopEscortOptions(entries: { userid: string, run: RogueRun }[]) {
	const event = entries[0]?.run.node?.event;
	if (entries.length !== 2 || event?.id !== 'lostescort' || entries.some(({ run }) =>
		run.node?.event?.id !== event.id || run.node.event.key !== event.key || run.node.event.stage !== 'choice' ||
		run.node.event.settled || run.floor !== entries[0].run.floor)) return [];
	return [...entries.map(({ userid }, index) => ({
		id: 'escort:' + userid, name: `由 ${index + 1}P 接过拉鲁拉丝。`,
		text: '拉鲁拉丝临时占用护送者的战位，原队伍留在场外；另一人照常选最多三只，并独自迎战两名敌人。伙伴在场时拉鲁拉丝受到保护，不行动、无法被招式命中；获胜时它须存活，谢礼双方各得一份。',
		disabled: !entries[1 - index].run.team.some(healthy),
	})), { id: 'leave', name: '这次先不接下护送。', text: '双方共同离开。', disabled: false }];
}

export function beginCoopEscort(entries: Entry[], content: RogueContent, random: RogueRandom, choice: string) {
	if (!coopEscortOptions(entries).some(option => option.id === choice && !option.disabled)) {
		throw new Error('护送人选或队伍状态已变化，请刷新后重选。');
	}
	if (choice === 'leave') {
		for (const { run, account } of entries) chooseEventOption(account, run, content, random, run.node!.event!.key, choice);
		return;
	}
	const owner = entries.find(entry => choice === 'escort:' + entry.userid)!;
	chooseEventOption(owner.account, owner.run, content, random, owner.run.node!.event!.key, 'accept');
	const node = owner.run.node!, escortSet = node.encounters[0]?.cooperative?.team[0];
	if (!escortSet || node.encounters[0].cooperative!.team.length !== 1 || escortSet.species !== 'Ralts') {
		throw new Error('护送伙伴配置不完整，不能建立共同战斗。');
	}
	const pokemon = createRoguePokemon({ ...structuredClone(escortSet), name: '护送拉鲁拉丝' },
		{ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, 'escort-' + randomUUID());
	// The native NPC becomes a player-controlled temporary battler, not a third allied seat or party gift.
	delete node.encounters[0].cooperative;
	node.event!.coopEscort = { owner: owner.userid, pokemon };
	for (const { run } of entries) {
		run.node = structuredClone(node);
		run.encounter = 0;
		run.phase = 'ready';
	}
}

export function activeCoopEscort(adventure: RogueCoopAdventure) {
	const event = adventure.node?.event;
	if (event?.id !== 'lostescort' || event.stage !== 'battle') return undefined;
	const escort = event.coopEscort;
	if (!escort || !adventure.members[escort.owner] || escort.pokemon.set.species !== 'Ralts' ||
		!escort.pokemon.id.startsWith('escort-')) throw new Error('共同护送记录不完整，请保留进度并检查存档。');
	return escort;
}

/** The full personal party never leaves its member record. */
export function coopBattleParty(adventure: RogueCoopAdventure, userid: string) {
	const escort = activeCoopEscort(adventure);
	const scroll = coopScrollBattler(adventure, userid);
	return escort?.owner === userid ? [escort.pokemon] : scroll ? [scroll] : adventure.members[userid].team;
}

/** Persist injury/PP for a retreat, without admitting or unlocking the temporary partner. */
export function saveCoopEscortResult(adventure: RogueCoopAdventure, userid: string, team: RoguePokemon[]) {
	const escort = activeCoopEscort(adventure);
	if (escort?.owner !== userid) return false;
	if (team.length !== 1 || team[0].id !== escort.pokemon.id || team[0].set.species !== 'Ralts') {
		throw new Error('护送伙伴的战后快照不匹配。');
	}
	escort.pokemon = structuredClone(team[0]);
	for (const member of Object.values(adventure.members)) {
		if (member.coopEvent?.id === 'lostescort') member.coopEvent.coopEscort = structuredClone(escort);
	}
	return true;
}
