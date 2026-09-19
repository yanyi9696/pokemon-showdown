import { randomUUID } from 'crypto';
import { Dex, toID } from '../../sim/dex';
import {
	ROGUE_STATS, type RogueBattleResult, type RogueBattleState, type RoguePokemon,
} from '../../sim/fantasy-rogue';
import { fixedFloor, validateContent } from './content';
import type { RogueStore } from './store';
import type { RogueAccount, RogueCommand, RogueContent, RogueInventory, RogueRun } from './types';
import {
	createRoguePokemon, ensureMemberMemory, evolveMember, evolutionOptions, gainEffort, gainExperience,
	initializeExperience, rebuildMember, rememberMove,
} from './progression';
import { experienceYield, rogueEffortYield, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import { canEditParty, editParty, TEAM_ACTIONS } from './team';
export { createRoguePokemon } from './progression';

function requireRule(ok: unknown, message: string): asserts ok {
	if (!ok) throw new Error(message);
}
const inventory = (run: RogueInventory): RogueInventory => structuredClone({
	team: run.team, bag: run.bag, money: run.money,
});

export class RogueEngine {
	readonly content: RogueContent | null;
	readonly store: RogueStore;
	constructor(store: RogueStore, content: RogueContent | null) {
		this.store = store;
		this.content = content && validateContent(content);
	}
	private configured(): RogueContent {
		requireRule(this.content, '正式初始队伍、楼层和数值尚未配置，暂不能开始冒险。');
		return this.content;
	}
	private run(account: RogueAccount): RogueRun {
		requireRule(account.run && account.run.phase !== 'complete', '没有进行中的冒险。');
		requireRule(account.run.contentVersion === this.configured().version, '内容版本已变更，请由管理员恢复对应版本后继续存档。');
		return account.run;
	}
	private enterFloor(run: RogueRun) {
		run.checkpoint = inventory(run);
		run.encounter = 0;
		run.attempt = 0;
		delete run.battle;
		delete run.node;
		run.phase = 'choose';
		const options = this.configured().floors[run.floor];
		if (options && fixedFloor(run.floor)) this.select(run, options[0].id);
	}
	private select(run: RogueRun, id: string) {
		requireRule(run.phase === 'choose', '本层已经选择了路线。');
		const node = this.configured().floors[run.floor]?.find(option => option.id === id);
		requireRule(node, '本层内容尚未配置或路线无效。');
		run.node = structuredClone(node);
		run.phase = node.kind === 'rest' ? 'rest' : node.kind === 'reward' ? 'reward' : 'ready';
	}
	private completeFloor(account: RogueAccount, run: RogueRun) {
		const reward = run.node!.reward;
		run.money += reward.money;
		for (const [id, count] of Object.entries(reward.items)) run.bag[id] = (run.bag[id] || 0) + count;
		const points = run.node!.kind === 'boss' ? 1 : 0;
		account.points += points;
		run.lastReward = { floor: run.floor, name: run.node!.name, ...structuredClone(reward), points };
		delete run.battle;
		if (run.floor === 200) { run.phase = 'complete'; return; }
		run.floor++;
		this.enterFloor(run);
	}
	private finishSettlement(account: RogueAccount, run: RogueRun) {
		if (run.phase !== 'settlement' || run.pendingCapture || run.pendingMoves?.length) return;
		if (run.encounter < run.node!.encounters.length) run.phase = 'ready';
		else this.completeFloor(account, run);
	}
	command(userid: string, command: RogueCommand) {
		return this.store.change(userid, account => {
			if (command.action === 'upgrade') {
				requireRule(!account.run || account.run.phase === 'complete', '进行中的冒险不能花费成长点数，请结束或放弃本局后再加点。');
				if (command.value === 'slot') {
					requireRule(account.slots < 6 && account.points >= 20, '栏位已满或成长点数不足 20。');
					account.points -= 20;
					account.slots++;
				} else {
					const stat = command.value as StatID;
					requireRule(ROGUE_STATS.includes(stat) && account.boosts[stat] < 10 && account.points >= 1, '属性已满、点数不足或属性无效。');
					account.points--;
					account.boosts[stat]++;
				}
				return;
			}
			if (command.action === 'start') {
				const content = this.configured();
				requireRule(!account.run || account.run.phase === 'complete', '请先继续或明确放弃已有冒险。');
				const selected = command.starters;
				requireRule(Array.isArray(selected) && selected.length > 0 && selected.length <= account.slots &&
					new Set(selected).size === selected.length, '请选择已解锁栏位内的不同初始宝可梦。');
				const team = selected.map(id => {
					const starter = content.starters.find(entry => entry.id === id);
					requireRule(starter && (starter.availableInitially || account.unlocked.includes(id)), '初始宝可梦尚未解锁。');
					const mon = createRoguePokemon(starter.set, account.boosts);
					if (content.progression) initializeExperience(mon);
					return mon;
				});
				const initial = { team, bag: { ...content.initialBag }, money: content.initialMoney };
				account.run = {
					...initial, id: randomUUID(), contentVersion: content.version, floor: 1, phase: 'choose',
					encounter: 0, attempt: 0, boosts: { ...account.boosts }, startingSlots: account.slots,
					checkpoint: inventory(initial), caught: [],
				};
				this.enterFloor(account.run);
				return;
			}
			const run = this.run(account);
			if (command.action === 'abandon') {
				requireRule(run.phase !== 'battle', '请先结束当前战斗，再放弃冒险。');
				delete account.run;
				return;
			}
			requireRule(!run.pendingMoves?.length || ['learn', 'replace'].includes(command.action), '请先处理待学习的招式。');
			if (TEAM_ACTIONS.includes(command.action)) {
				editParty(run, command, this.configured());
				return;
			}
			switch (command.action) {
			case 'learn': {
				const pending = run.pendingMoves?.[0];
				const mon = run.team.find(entry => entry.id === pending?.member);
				requireRule(pending && mon && command.member === mon.id, '没有对应的待学习招式。');
				const legacyNewMove = !mon.moveMemory && !mon.set.moves.some(move => toID(move) === pending.move);
				rememberMove(mon, pending.move);
				if (legacyNewMove) {
					const learned = mon.moveMemory!.find(move => move.id === pending.move)!;
					learned.pp = learned.maxpp;
				}
				if (command.value !== 'skip') {
					const slot = Number(command.value);
					requireRule(Number.isInteger(slot) && slot >= 0 && slot < mon.set.moves.length, '替换招式位置无效。');
					mon.set.moves[slot] = pending.move;
					rebuildMember(mon, run.boosts);
				}
				run.pendingMoves!.shift();
				this.finishSettlement(account, run);
				break;
			}
			case 'replace': {
				requireRule(run.phase === 'settlement' && run.pendingCapture, '没有待安置的捕获成员。');
				if (command.value !== 'release') {
					const index = run.team.findIndex(mon => mon.id === command.value);
					requireRule(index >= 0, '替换成员无效。');
					const removed = run.team[index].id;
					run.team[index] = run.pendingCapture;
					run.pendingMoves = run.pendingMoves?.filter(move => move.member !== removed);
				}
				delete run.pendingCapture;
				this.finishSettlement(account, run);
				break;
			}
			case 'evolve': {
				requireRule(this.configured().progression && ['choose', 'ready', 'rest', 'reward'].includes(run.phase), '当前不能进化。');
				const mon = run.team.find(entry => entry.id === command.member);
				const option = mon && evolutionOptions(mon).find(entry => toID(entry.species) === command.value);
				requireRule(mon?.hp && option, '没有满足条件的进化。');
				if (option.item) {
					requireRule(run.bag[option.item] > 0, '缺少进化道具。');
					run.bag[option.item]--;
				}
				evolveMember(run, mon, option.species);
				break;
			}
			case 'select': this.select(run, command.value || ''); break;
			case 'battle':
				requireRule(run.phase === 'ready' && run.team.some(mon => mon.hp > 0), '当前不能进入战斗。');
				run.battle = {
					token: randomUUID(), encounterId: `${run.id}:${run.floor}:${run.node!.id}:${run.encounter}`,
				};
				run.phase = 'battle';
				break;
			case 'retry':
				requireRule(run.phase === 'failed', '当前不是失败待重试状态。');
				Object.assign(run, inventory(run.checkpoint));
				run.encounter = 0;
				run.attempt++;
				run.phase = 'ready';
				delete run.battle;
				delete run.pendingCapture;
				delete run.pendingMoves;
				run.notices = ['已恢复进入本层时的队伍、经验、道具和货币。'];
				break;
			case 'heal':
				requireRule(run.phase === 'rest', '只能在休整中心恢复。');
				for (const mon of run.team) {
					if (!mon.hp) continue;
					mon.hp = mon.maxhp;
					mon.status = '';
					mon.statusState = {};
					for (const slot of mon.pp) slot.pp = slot.maxpp;
					ensureMemberMemory(mon);
					for (const slot of mon.moveMemory!) slot.pp = slot.maxpp;
				}
				break;
			case 'buy': {
				requireRule(run.phase === 'rest', '只能在休整商店购买。');
				const item = this.configured().items.find(entry => entry.id === command.value);
				requireRule(item && run.money >= item.price, '商品无效或余额不足。');
				run.money -= item.price;
				run.bag[item.id] = (run.bag[item.id] || 0) + 1;
				break;
			}
			case 'use': {
				requireRule(['rest', 'ready', 'choose', 'reward'].includes(run.phase), '请在战斗间隙使用补给。');
				const item = this.configured().items.find(entry => entry.id === command.value);
				const mon = run.team.find(entry => entry.id === command.member);
				requireRule(item && mon && run.bag[item.id] > 0, '道具、数量或目标无效。');
				if (item.kind === 'revive') {
					requireRule(!mon.hp, '活力碎片只能对倒下成员使用。');
					mon.hp = Math.max(1, Math.floor(mon.maxhp * item.amount!));
					mon.status = '';
					mon.statusState = {};
				} else if (item.kind === 'candy') {
					requireRule(this.configured().progression && mon.hp > 0 && mon.set.level < 100, '该成员不能再获得经验。');
					run.notices = [];
					gainExperience(run, mon, item.amount!);
				} else if (item.kind === 'ether') {
					requireRule(mon.hp > 0 && mon.pp.some(slot => slot.pp < slot.maxpp), '该成员不需要恢复 PP。');
					for (const slot of mon.pp) slot.pp = Math.min(slot.maxpp, slot.pp + item.amount!);
				} else if (item.kind === 'cure') {
					requireRule(mon.hp > 0 && mon.status, '该成员没有异常状态。');
					mon.status = '';
					mon.statusState = {};
				} else {
					requireRule(item.kind === 'heal' && mon.hp > 0 && mon.hp < mon.maxhp, '该目标不能使用治疗道具。');
					mon.hp = Math.min(mon.maxhp, mon.hp + item.amount!);
				}
				run.bag[item.id]--;
				break;
			}
			case 'continue':
				requireRule(run.phase === 'rest' || run.phase === 'reward', '请先完成本层。');
				this.completeFloor(account, run);
				break;
			default: throw new Error('未知的肉鸽操作。');
			}
		}, command);
	}
	battleState(userid: string): RogueBattleState {
		const account = this.store.get(userid);
		const run = this.run(account);
		requireRule(run.phase === 'battle' && run.battle, '当前没有待建立的战斗。');
		const encounter = run.node!.encounters[run.encounter];
		return {
			encounterId: run.battle.encounterId, team: structuredClone(run.team), boosts: { ...run.boosts }, bag: { ...run.bag },
			catchable: encounter.catchable,
			progression: !!this.configured().progression, allowReplacement: this.configured().allowReplacement,
			caughtSpecies: account.caughtSpecies?.length || 0,
			balls: this.configured().items.filter(item => item.kind === 'ball' &&
				(item.multiplier || item.id in (encounter.catchChances || {})))
				.map(item => ({
					id: item.id, name: item.name, chance: encounter.catchChances?.[item.id], multiplier: item.multiplier,
				})),
		};
	}
	private recordCatch(account: RogueAccount, run: RogueRun, captured: RoguePokemon) {
		requireRule(captured.id === run.battle?.encounterId, '捕捉对象与当前战斗不符。');
		if (run.caught.includes(captured.id)) return;
		const rule = this.configured().unlocks[toID(captured.set.species)];
		requireRule(rule, '缺少捕捉解锁配置。');
		run.caught.push(captured.id);
		account.caughtSpecies ||= [];
		const species = toID(captured.set.species);
		if (!account.caughtSpecies.includes(species)) account.caughtSpecies.push(species);
		const count = account.captures[rule.starter] = (account.captures[rule.starter] || 0) + 1;
		if (count >= rule.captures && !account.unlocked.includes(rule.starter)) account.unlocked.push(rule.starter);
	}
	capture(userid: string, token: string, captured: RoguePokemon) {
		this.store.change(userid, account => {
			const run = account.run;
			if (run?.phase === 'battle' && run.battle?.token === token) this.recordCatch(account, run, captured);
		});
	}
	settle(userid: string, token: string, result: RogueBattleResult) {
		return this.store.change(userid, account => {
			const run = account.run;
			if (run?.phase !== 'battle' || run.battle?.token !== token || run.battle.encounterId !== result.encounterId) return;
			if (result.captured) this.recordCatch(account, run, result.captured);
			delete run.battle;
			if (!result.won) { run.phase = 'failed'; return; }
			run.team = structuredClone(result.team);
			run.bag = { ...result.bag };
			run.notices = [];
			if (this.configured().progression) {
				for (const defeated of result.defeated || []) {
					for (const mon of run.team) {
						if (!defeated.eligible.includes(mon.id)) continue;
						if (!defeated.captured) gainEffort(run, mon, rogueEffortYield(defeated.species));
						gainExperience(run, mon, experienceYield(rogueSpeciesData(defeated.species).baseExperience,
							defeated.level, mon.set.level, defeated.participants.includes(mon.id)));
					}
				}
			}
			if (result.captured) {
				requireRule(run.team.length < 6 || this.configured().allowReplacement, '队伍已满。');
				const mon = createRoguePokemon(result.captured.set, run.boosts, result.captured.id);
				mon.hp = Math.max(1, mon.maxhp - (result.captured.maxhp - result.captured.hp));
				mon.pp = structuredClone(result.captured.pp);
				mon.status = result.captured.status;
				mon.statusState = { ...result.captured.statusState };
				if (this.configured().progression) initializeExperience(mon);
				if (run.team.length < 6) run.team.push(mon);
				else run.pendingCapture = mon;
			}
			run.encounter++;
			run.phase = 'settlement';
			this.finishSettlement(account, run);
		});
	}
	/** Future event handlers call these methods; the public command API cannot grant unlocks. */
	unlockAbility(userid: string, member: string, ability: string) {
		return this.store.change(userid, account => {
			const run = this.run(account);
			const mon = run.team.find(entry => entry.id === member);
			const dex = Dex.mod('gen9fantasy');
			const entry = dex.abilities.get(ability);
			requireRule(mon && canEditParty(run) && entry.exists, '当前不能解锁该特性。');
			ensureMemberMemory(mon);
			if (!mon.abilityPool!.some(known => known.id === entry.id)) {
				mon.abilityPool!.push({ id: entry.id, hidden: toID(dex.species.get(mon.set.species).abilities.H) === entry.id });
			}
		});
	}
	unlockEVRespec(userid: string, member: string) {
		return this.store.change(userid, account => {
			const run = this.run(account);
			const mon = run.team.find(entry => entry.id === member);
			requireRule(mon && canEditParty(run), '当前不能调整努力值。');
			mon.evRespec = { total: ROGUE_STATS.reduce((sum, stat) => sum + mon.set.evs[stat], 0) };
		});
	}
	/** A missing room resumes its pre-battle save; never awards a win or silently heals. */
	recover(userid: string, token: string) {
		return this.store.change(userid, account => {
			const run = account.run;
			if (run?.phase === 'battle' && run.battle?.token === token) {
				run.phase = 'ready';
				delete run.battle;
			}
		});
	}
}
