import { randomInt, randomUUID } from 'crypto';
import { Dex, toID } from '../../sim/dex';
import {
	ROGUE_STATS, type RogueBattleResult, type RogueBattleState, type RoguePokemon,
} from '../../sim/fantasy-rogue';
import { ELITE_BOSS_FLOORS, fixedFloor, validateContent } from './content';
import type { RogueStore } from './store';
import type { RogueAccount, RogueCommand, RogueContent, RogueInventory, RogueRun } from './types';
import {
	createRoguePokemon, ensureMemberMemory, evolveMember, evolutionOptions, gainEffort, gainExperience,
	initializeExperience, rebuildMember, rememberMove,
} from './progression';
import { experienceYield, rogueEffortYield, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import { canEditParty, editParty, healingLocked, TEAM_ACTIONS } from './team';
import { createBiomeRoutes } from './biome-routes';
import type { RogueRandom } from './biome-pools';
import { recordStarterMoves, recordStarterTraits, starterMoves, starterTraits } from './starter-traits';
import { chooseTrainer } from './trainer-bosses';
import { prepareEconomy } from './economy';
import { roguePartyLimit } from '../../sim/fantasy-rogue-spirits';
import { initializeSpirit, prepareSpiritNode, spiritItems, spiritShopAvailable, hpPurchaseCost,
	convertSpiritItem, editSpiritBox, mergeSpiritPokemon } from './spirits';
export { createRoguePokemon } from './progression';

export const ROGUE_EMERGENCY_COST = 5000;

export function rogueSlotCost(slots: number) {
	return slots >= 6 ? 0 : slots * 20;
}

function requireRule(ok: unknown, message: string): asserts ok {
	if (!ok) throw new Error(message);
}
const inventory = (run: RogueInventory): RogueInventory => structuredClone({
	team: run.team, bag: run.bag, money: run.money, teraUnlocked: !!run.teraUnlocked,
	...(run.box ? { box: run.box } : {}),
});

export class RogueEngine {
	readonly content: RogueContent | null;
	readonly store: RogueStore;
	readonly localSpirits: boolean;
	private readonly random: RogueRandom;
	constructor(store: RogueStore, content: RogueContent | null, random: RogueRandom = max => randomInt(max),
		localSpirits = false) {
		this.localSpirits = localSpirits;
		this.random = random;
		this.store = store;
		this.content = content && validateContent(content);
	}
	private configured(): RogueContent {
		requireRule(this.content, '正式初始队伍、楼层和数值尚未配置，暂不能开始冒险。');
		return this.content;
	}
	private run(account: RogueAccount): RogueRun {
		requireRule(account.run && account.run.phase !== 'complete', '没有进行中的冒险。');
		const content = this.configured();
		requireRule(
			account.run.contentVersion === content.version || content.compatibleVersions?.includes(account.run.contentVersion),
			'内容版本已变更，请由管理员恢复对应版本后继续存档。'
		);
		account.run.contentVersion = content.version;
		this.normalizeRun(account.run);
		return account.run;
	}
	private normalizeRun(run: RogueRun) {
		if (this.content && (run.contentVersion === this.content.version ||
			this.content.compatibleVersions?.includes(run.contentVersion))) this.prepareChoices(run);
		for (const mon of [...run.team, ...(run.box || []), ...run.checkpoint.team, ...(run.checkpoint.box || []),
			...(run.pendingCapture ? [run.pendingCapture] : [])]) {
			const legacyMemory = !mon.moveMemory;
			ensureMemberMemory(mon);
			if (legacyMemory && run.team.includes(mon)) {
				for (const pending of run.pendingMoves || []) {
					if (pending.member !== mon.id || mon.set.moves.some(move => toID(move) === pending.move)) continue;
					rememberMove(mon, pending.move);
					const learned = mon.moveMemory!.find(move => move.id === pending.move)!;
					learned.pp = learned.maxpp;
				}
			}
		}
		if (run.phase === 'failed' && !run.node?.noHealing) {
			// Older versions discarded the loss snapshot. Do not silently restore their pre-fight HP.
			for (const mon of run.team) mon.hp = 0;
			run.phase = 'ready';
			run.recovery = 'defeat';
			delete run.battle;
		}
	}
	migrate(userid: string) {
		return this.store.change(userid, account => {
			this.normalizeAccount(account);
			if (account.run) this.normalizeRun(account.run);
		});
	}
	private normalizeAccount(account: RogueAccount) {
		if (!this.content) return;
		if (account.run?.phase === 'complete' && account.run.floor === 200 && !account.run.spirit) {
			account.spiritUnlocked = true;
		}
		const requirements = new Map<string, number>();
		for (const rule of Object.values(this.content.unlocks)) {
			requirements.set(rule.starter, Math.max(requirements.get(rule.starter) || 0, rule.captures));
		}
		// Re-lock historical special starters below ten, without changing an existing party or checkpoint.
		account.unlocked = account.unlocked.filter(id =>
			requirements.get(id) !== 10 || (account.captures[id] || 0) >= 10);
		if (!account.starterTraits) {
			account.starterTraits = {};
			const run = account.run;
			if (!run) return;
			// Older ledgers have counts but no nature/IV history. Recover only retained, proven captures.
			for (const mon of [...run.team, ...run.checkpoint.team, ...(run.pendingCapture ? [run.pendingCapture] : [])]) {
				if (run.caught.includes(mon.id)) recordStarterTraits(account, this.content, mon.set, true);
				recordStarterMoves(account, this.content, mon.set);
			}
		}
	}
	canEmergency(run: RogueRun): boolean {
		return canEditParty(run) && !healingLocked(run) && !run.team.some(mon => mon.hp > 0) &&
			!this.configured().items.some(item => item.kind === 'revive' && run.bag[item.id] > 0);
	}
	private healMember(mon: RoguePokemon) {
		ensureMemberMemory(mon);
		mon.hp = mon.maxhp;
		mon.status = '';
		mon.statusState = {};
		for (const slot of [...mon.pp, ...mon.moveMemory!]) slot.pp = slot.maxpp;
	}
	private enterFloor(run: RogueRun) {
		run.checkpoint = inventory(run);
		run.encounter = 0;
		run.attempt = 0;
		delete run.battle;
		delete run.recovery;
		delete run.node;
		delete run.choices;
		run.phase = 'choose';
		this.prepareChoices(run);
		const options = this.configured().floors[run.floor];
		if (options && fixedFloor(run.floor)) this.select(run, options[0].id);
	}
	private prepareChoices(run: RogueRun) {
		if (run.phase !== 'choose' || run.choices || !this.content || fixedFloor(run.floor)) return;
		const templates = this.content.floors[run.floor];
		if (!templates) return;
		run.choices = this.content.biomeEncounters ?
			createBiomeRoutes(run.floor, templates, undefined, this.random, run.spirit) : structuredClone(templates);
		if (this.content.wildTreasures) {
			for (const node of run.choices) prepareEconomy(node, run.floor, this.random);
		}
		for (const node of run.choices) prepareSpiritNode(run, node, this.content, this.random);
		if (run.spirit === 'darkrai') {
			const pool = [...run.choices];
			for (let i = 0; i < Math.min(2, run.choices.length); i++) pool.splice(this.random(pool.length), 1)[0].fogged = true;
		}
	}
	private select(run: RogueRun, id: string) {
		requireRule(run.phase === 'choose', '本层已经选择了路线。');
		const node = (run.choices || this.configured().floors[run.floor])?.find(option => option.id === id);
		requireRule(node, '本层内容尚未配置或路线无效。');
		run.node = structuredClone(node);
		if (this.content?.wildTreasures) prepareEconomy(run.node, run.floor, this.random);
		delete run.choices;
		for (const encounter of run.node.encounters) {
			if (encounter.trainerCandidates) {
				const selected = chooseTrainer(run, encounter.trainerCandidates, this.random);
				encounter.trainer = selected.trainer;
				encounter.team = selected.team;
				encounter.name = selected.trainer.name;
				run.node.name = selected.trainer.name;
				delete encounter.trainerCandidates;
			}
			if (node.kind === 'wild' || node.kind === 'elite') {
				const natures = Dex.natures.all();
				for (const set of encounter.team) set.nature = natures[this.random(natures.length)].name;
			}
			if (encounter.candidates) {
				encounter.team = [encounter.candidates[this.random(encounter.candidates.length)]];
				delete encounter.candidates;
			}
			this.resolveOpponentGenders(encounter.team);
		}
		prepareSpiritNode(run, run.node, this.configured(), this.random);
		this.resolveOpponentGenders(run.node.encounters.flatMap(encounter => encounter.team));
		run.phase = run.node.rocket && !run.node.rocket.cleared ? 'ready' :
			node.kind === 'rest' ? 'rest' : node.kind === 'reward' ? 'reward' : 'ready';
	}
	private resolveOpponentGenders(team: PokemonSet[]) {
		for (const set of team) {
			if (set.gender) continue;
			const species = Dex.mod('gen9fantasy').species.get(set.species);
			set.gender = species.gender || (this.random(256) < species.genderRatio.F * 256 ? 'F' : 'M');
		}
	}
	private completeFloor(account: RogueAccount, run: RogueRun) {
		const reward = run.node!.reward;
		run.money += reward.money;
		for (const [id, count] of Object.entries(reward.items)) run.bag[id] = (run.bag[id] || 0) + count;
		const points = run.node!.kind === 'boss' ? 1 : 0;
		account.points += points;
		if (run.node!.wildLoot) {
			// Wild drops have already been credited per encounter; the final receipt only adds the Boss point.
			if (run.lastReward?.floor === run.floor) run.lastReward.points += points;
		} else {
			run.lastReward = { floor: run.floor, name: run.node!.name, ...structuredClone(reward), points };
		}
		delete run.battle;
		if (run.floor === 200) {
			run.phase = 'complete';
			if (!run.spirit) account.spiritUnlocked = true;
			return;
		}
		run.floor++;
		this.enterFloor(run);
	}
	private finishSettlement(account: RogueAccount, run: RogueRun) {
		if (run.phase !== 'settlement' || run.pendingCapture || run.pendingMoves?.length) return;
		if (run.encounter < run.node!.encounters.length) run.phase = 'ready';
		else if (run.node!.rocket && !run.node!.rocket.cleared) {
			const rocket = run.node!.rocket;
			rocket.cleared = true;
			run.money += rocket.reward;
			run.lastReward = { floor: run.floor, name: '击退火箭队', money: rocket.reward, items: {}, points: 0 };
			run.phase = 'rest';
		} else this.completeFloor(account, run);
	}
	command(userid: string, command: RogueCommand) {
		return this.store.change(userid, account => {
			this.normalizeAccount(account);
			if (command.action === 'upgrade') {
				requireRule(!account.run || account.run.phase === 'complete', '进行中的冒险不能花费成长点数，请结束或放弃本局后再加点。');
				if (command.value === 'slot') {
					const cost = rogueSlotCost(account.slots);
					requireRule(account.slots < 6, '初始栏位已满。');
					requireRule(account.points >= cost, `成长点数不足，本次扩展需要 ${cost} 点。`);
					account.points -= cost;
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
				requireRule(command.useSpirit === undefined || typeof command.useSpirit === 'boolean', '塔灵选项无效。');
				requireRule(!command.useSpirit || (content.spirits && (this.localSpirits || account.spiritUnlocked)),
					'无塔灵通关 200 层后解锁塔灵。');
				requireRule(!command.testSpirit || (this.localSpirits && command.useSpirit), '指定塔灵仅在本地测试开放。');
				requireRule(!account.run || account.run.phase === 'complete', '请先继续或明确放弃已有冒险。');
				const selected = command.starters;
				requireRule(Array.isArray(selected) && selected.length > 0 && selected.length <= account.slots &&
					new Set(selected).size === selected.length, '请选择已解锁栏位内的不同初始宝可梦。');
				requireRule(command.starterBuilds === undefined || (command.starterBuilds &&
					typeof command.starterBuilds === 'object' && !Array.isArray(command.starterBuilds) &&
					Object.keys(command.starterBuilds).every(id => selected.includes(id))), '初始配置无效。');
				const team = selected.map(id => {
					const starter = content.starters.find(entry => entry.id === id);
					requireRule(starter && (starter.availableInitially || account.unlocked.includes(id)), '初始宝可梦尚未解锁。');
					const traits = starterTraits(account, id);
					const build = command.starterBuilds?.[id];
					const nature = build?.nature ?? 'random';
					requireRule(typeof nature === 'string' && (nature === 'random' || traits.natures.includes(toID(nature))),
						'这个性格尚未通过捕捉解锁。');
					const ivs = build?.ivs ?? traits.ivs.max;
					requireRule(ivs && typeof ivs === 'object' && !Array.isArray(ivs) && ROGUE_STATS.every(stat =>
						Number.isInteger(ivs[stat]) && ivs[stat] >= traits.ivs.min[stat] && ivs[stat] <= traits.ivs.max[stat]),
					'个体值超出该伙伴已解锁的范围。');
					const natures = Dex.natures.all();
					const species = Dex.mod('gen9fantasy').species.get(starter.set.species);
					const ability = build?.ability ?? 'random';
					requireRule(typeof ability === 'string' && (ability === 'random' ||
						(traits.abilities.includes(toID(ability)) && Object.values(species.abilities).some(a => toID(a) === toID(ability)))),
					'这个特性尚未通过捕捉解锁或不适用于该物种。');
					const normalAbilities = [...new Set([species.abilities[0], species.abilities[1]].filter(Boolean))];
					const gender = build?.gender ?? 'random';
					requireRule(gender === 'random' || (['M', 'F', 'N'].includes(gender) &&
						(traits.genders.includes(gender) || species.gender === 'N') && (!species.gender || gender === species.gender)),
					'这个性别尚未通过捕捉解锁或不适用于该物种。');
					const moves = build?.moves ?? starter.set.moves.map(toID);
					const availableMoves = starterMoves(account, content, id);
					requireRule(Array.isArray(moves) && moves.length >= 1 && moves.length <= 4 &&
						moves.every(move => typeof move === 'string' && availableMoves.includes(toID(move))) &&
						new Set(moves.map(toID)).size === moves.length, '请选择 1～4 个不重复、已解锁且初始形态可合法学习的招式。');
					const set = { ...structuredClone(starter.set), ivs: { ...ivs },
						ability: ability === 'random' ? normalAbilities[this.random(normalAbilities.length)]! :
						Dex.mod('gen9fantasy').abilities.get(ability).name,
						moves: moves.map(toID),
						gender: gender === 'random' ? species.gender || (this.random(256) < species.genderRatio.F * 256 ? 'F' : 'M') : gender,
						nature: nature === 'random' ? natures[this.random(natures.length)].name : Dex.natures.get(nature).name };
					const mon = createRoguePokemon(set, account.boosts);
					// All unlocked legal moves are available immediately in the in-run editor.
					mon.moveMemory = availableMoves.map(moveid => {
						const move = Dex.mod('gen9fantasy').moves.get(moveid);
						return { id: move.id, pp: move.pp, maxpp: move.pp };
					});
					mon.seenMoves = availableMoves.map(toID);
					if (content.progression) initializeExperience(mon);
					return mon;
				});
				const initial = { team, bag: { ...content.initialBag }, money: content.initialMoney, teraUnlocked: false };
				account.run = {
					...initial, id: randomUUID(), contentVersion: content.version, floor: 1, phase: 'choose',
					encounter: 0, attempt: 0, boosts: { ...account.boosts }, startingSlots: account.slots,
					checkpoint: inventory(initial), caught: [], trainerHistory: { gyms: [], eliteFour: [] },
				};
				if (content.spirits) account.run.spiritVersion = 1;
				if (command.useSpirit) initializeSpirit(account.run, content, this.random, command.testSpirit);
				else this.enterFloor(account.run);
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
				for (const mon of run.team) recordStarterMoves(account, this.configured(), mon.set);
				return;
			}
			switch (command.action) {
			case 'spiritack':
				requireRule(run.phase === 'intro' && !run.pendingCapture && run.team.length <= roguePartyLimit(run.spirit),
					'请先安置赠送伙伴或将队伍缩减至塔灵允许的数量。');
				this.enterFloor(run);
				break;
			case 'trimparty':
				requireRule(run.phase === 'intro' && run.spirit === 'regigigas' && run.team.length > 3 &&
					run.team.some(mon => mon.id === command.member), '当前无需精简队伍。');
				run.team = run.team.filter(mon => mon.id !== command.member);
				break;
			case 'box': editSpiritBox(run, command.member || '', command.value); break;
			case 'merge': mergeSpiritPokemon(run, command.member || '', command.order); break;
			case 'learn': {
				const pending = run.pendingMoves?.[0];
				const mon = run.team.find(entry => entry.id === pending?.member);
				requireRule(pending && mon && command.member === mon.id, '没有对应的待学习招式。');
				rememberMove(mon, pending.move);
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
				requireRule(['settlement', 'intro'].includes(run.phase) && run.pendingCapture, '没有待安置的捕获成员。');
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
				requireRule(!healingLocked(run), '本层要求连续战斗，途中不能通过进化调整状态。');
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
				requireRule(run.phase === 'ready' && run.team.some(mon => mon.hp > 0), '当前不能进入战斗，请先复活至少一名队员。');
				// Old saves may predate persisted opponent gender; resolve it once before choosing the portrait.
				this.resolveOpponentGenders(run.node!.encounters[run.encounter].team);
				run.battle = {
					token: randomUUID(), encounterId: `${run.id}:${run.floor}:${run.node!.id}:${run.encounter}`,
				};
				run.phase = 'battle';
				delete run.recovery;
				break;
			case 'retreat':
				requireRule(run.phase === 'battle' && run.battle, '当前没有可撤退的战斗。');
				run.battle.retreatRequested = true;
				break;
			case 'emergency':
				requireRule(this.canEmergency(run), '仅在全队濒死、没有复活道具且允许场外治疗时可急救。');
				requireRule(run.money >= ROGUE_EMERGENCY_COST, `急救需要 ${ROGUE_EMERGENCY_COST} 金币，当前余额不足。`);
				run.money -= ROGUE_EMERGENCY_COST;
				for (const mon of run.team) this.healMember(mon);
				run.notices = [`已花费 ${ROGUE_EMERGENCY_COST} 金币急救全队，HP、PP 和异常状态已恢复。`];
				break;
			case 'retry':
				requireRule(run.phase === 'failed' && run.node?.noHealing, '只有连续挑战全队倒下后可重试整层；普通战斗请治疗后继续当前场次。');
				Object.assign(run, inventory(run.checkpoint));
				run.encounter = 0;
				run.attempt++;
				run.phase = 'ready';
				delete run.battle;
				delete run.pendingCapture;
				delete run.pendingMoves;
				delete run.recovery;
				run.notices = ['已恢复进入本层时的队伍、经验、道具和货币。'];
				delete run.lastReward;
				break;
			case 'heal':
				requireRule(run.phase === 'rest', '只能在休整中心恢复。');
				for (const mon of run.team) {
					if (!mon.hp) continue;
					const hp = mon.hp;
					this.healMember(mon);
					if (run.spirit === 'yveltal') mon.hp = hp;
				}
				break;
			case 'buy': case 'buyhp': {
				requireRule(run.phase === 'rest', '只能在休整商店购买。');
				const item = spiritItems(this.configured(), run).find(entry => entry.id === command.value);
				requireRule(item && spiritShopAvailable(item, run.floor), '商品尚未解锁或不在商店售卖。');
				if (command.action === 'buyhp') {
					const mon = run.team.find(entry => entry.id === command.member);
					requireRule(run.spirit === 'yveltal' && (run.node!.hpPurchases || 0) < 3 && mon,
						'本商店的血量购买限额已用完，或目标无效。');
					const cost = hpPurchaseCost(item, mon.maxhp);
					requireRule(mon.hp > cost, `需要 ${cost} HP，支付后至少保留 1 HP。`);
					mon.hp -= cost;
					run.node!.hpPurchases = (run.node!.hpPurchases || 0) + 1;
				} else {
					requireRule(run.money >= item.price, '金币余额不足。');
					run.money -= item.price;
				}
				const received = convertSpiritItem(run, this.configured(), item.id, `purchase:${command.id}`, this.random);
				run.bag[received] = (run.bag[received] || 0) + 1;
				if (received !== item.id) run.notices = [`胡帕将购买的道具变成了 ${Dex.mod('gen9fantasy').items.get(received).name}。`];
				break;
			}
			case 'sell': {
				requireRule(run.phase === 'rest', '只能在商店兑换贵重物品。');
				const items = this.configured().items.filter(item => item.kind === 'treasure' &&
					(command.value === 'all' || item.id === command.value) && (run.bag[item.id] || 0) > 0);
				requireRule(items.length, '没有可兑换的贵重物品。');
				let money = 0;
				for (const item of items) money += run.bag[item.id] * item.sellPrice!;
				requireRule(Number.isSafeInteger(money) && Number.isSafeInteger(run.money + money), '兑换金额无效。');
				for (const item of items) run.bag[item.id] = 0;
				run.money += money;
				run.notices = [`贵重物品兑换完成，获得 ${money} 金币。`];
				break;
			}
			case 'use': {
				requireRule(['rest', 'ready', 'choose', 'reward'].includes(run.phase), '请在战斗间隙使用补给。');
				requireRule(!healingLocked(run), '本层要求连续战斗，途中不能使用治疗和补给道具。');
				const item = this.configured().items.find(entry => entry.id === command.value);
				const mon = run.team.find(entry => entry.id === command.member);
				requireRule(item && mon && run.bag[item.id] > 0, '道具、数量或目标无效。');
				if (item.kind === 'revive') {
					requireRule(!mon.hp, '活力碎片只能对倒下成员使用。');
					mon.hp = Math.max(1, Math.floor(mon.maxhp * item.amount!));
					mon.status = '';
					mon.statusState = {};
				} else if (item.kind === 'effort') {
					const stat = item.stat!;
					requireRule(mon.set.evs[stat] < 252 && ROGUE_STATS.reduce((sum, key) => sum + mon.set.evs[key], 0) < 510,
						'该项基础点数或总基础点数已达上限，道具未消耗。');
					run.notices = [];
					gainEffort(run, mon, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, [stat]: item.amount! });
				} else if (item.kind === 'candy') {
					requireRule(this.configured().progression && mon.hp > 0 && mon.set.level < 100 && !mon.fixedLevel, '该成员不能再获得经验。');
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
			for (const mon of run.team) recordStarterMoves(account, this.configured(), mon.set);
		}, command);
	}
	battleState(userid: string): RogueBattleState {
		const account = this.store.get(userid);
		const run = this.run(account);
		requireRule(run.phase === 'battle' && run.battle, '当前没有待建立的战斗。');
		const encounter = run.node!.encounters[run.encounter];
		return {
			...(run.spirit ? { spirit: { id: run.spirit, floor: run.floor, hazards: encounter.spiritHazards } } : {}),
			encounterId: run.battle.encounterId, team: structuredClone(run.team), boosts: { ...run.boosts }, bag: { ...run.bag },
			catchable: encounter.catchable,
			tera: { player: !!run.teraUnlocked, opponent: !!encounter.trainer?.tera ||
				(run.node!.kind === 'boss' && ELITE_BOSS_FLOORS.has(run.floor)) },
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
		recordStarterTraits(account, this.configured(), captured.set, true);
		recordStarterMoves(account, this.configured(), captured.set);
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
			const retreated = run.battle.retreatRequested;
			const previousItems = new Map(run.team.map(mon => [mon.id, toID(mon.set.item)]));
			delete run.battle;
			run.team = structuredClone(result.team);
			for (const mon of run.team) {
				const item = toID(mon.set.item);
				if (item && previousItems.get(mon.id) !== item) {
					mon.set.item = convertSpiritItem(run, this.configured(), item,
						`battle:${result.encounterId}:${mon.id}:${item}`, this.random);
				}
			}
			run.bag = { ...result.bag };
			for (const mon of run.team) ensureMemberMemory(mon);
			run.notices = [];
			if (!result.won) {
				run.recovery = retreated ? 'retreat' : 'defeat';
				run.phase = run.node!.noHealing && !run.team.some(mon => mon.hp > 0) ? 'failed' : 'ready';
				run.attempt++;
				run.notices = [retreated ? '已撤退，伤害、PP、异常状态和道具消耗已保存。' : '本场战斗未通过，队伍当前状态已保存。'];
				return;
			}
			delete run.recovery;
			const loot = run.node!.wildLoot?.[run.encounter];
			if (loot) {
				for (const [id, count] of Object.entries(loot)) run.bag[id] = (run.bag[id] || 0) + count;
				run.lastReward = { floor: run.floor, encounter: run.encounter + 1, name: run.node!.name,
					money: 0, items: structuredClone(loot), points: 0 };
			}
			if (this.configured().progression) {
				for (const defeated of result.defeated || []) {
					for (const mon of run.team) {
						if (!defeated.eligible.includes(mon.id)) continue;
						if (!defeated.captured) gainEffort(run, mon, rogueEffortYield(defeated.species));
						gainExperience(run, mon, experienceYield(rogueSpeciesData(defeated.species).baseExperience,
							defeated.level, mon.set.level, defeated.participants.includes(mon.id)) *
							(run.spirit === 'hooh' && mon.set.shiny ? 3 : 1));
					}
				}
			}
			for (const mon of run.team) recordStarterMoves(account, this.configured(), mon.set);
			if (result.captured) {
				requireRule(run.team.length < roguePartyLimit(run.spirit) || this.configured().allowReplacement, '队伍已满。');
				const mon = createRoguePokemon(result.captured.set, run.boosts, result.captured.id);
				mon.hp = Math.max(1, mon.maxhp - (result.captured.maxhp - result.captured.hp));
				mon.pp = structuredClone(result.captured.pp);
				mon.status = result.captured.status;
				mon.statusState = { ...result.captured.statusState };
				if (this.configured().progression) initializeExperience(mon);
				if (mon.set.item) {
					mon.set.item = convertSpiritItem(run, this.configured(), toID(mon.set.item), `capture:${mon.id}`, this.random);
				}
				if (run.team.length < roguePartyLimit(run.spirit)) run.team.push(mon);
				else if (run.box && run.box.length < 30) run.box.push(mon);
				else run.pendingCapture = mon;
			}
			run.encounter++;
			run.phase = 'settlement';
			this.finishSettlement(account, run);
		});
	}
	/** Future event handlers call these methods; the public command API cannot grant unlocks. */
	setEventIVs(userid: string, member: string, ivs: Partial<StatsTable>) {
		return this.store.change(userid, account => {
			this.normalizeAccount(account);
			const run = this.run(account);
			const mon = run.team.find(entry => entry.id === member);
			requireRule(mon && canEditParty(run), '当前不能调整个体值。');
			requireRule(ivs && Object.keys(ivs).length > 0 && Object.entries(ivs).every(([stat, value]) =>
				ROGUE_STATS.includes(stat as StatID) && Number.isInteger(value) && value >= 0 && value <= 31),
			'个体值必须为 0～31 的整数。');
			Object.assign(mon.set.ivs, ivs);
			rebuildMember(mon, run.boosts);
			recordStarterTraits(account, this.configured(), mon.set, false);
		});
	}
	unlockTerastallization(userid: string) {
		return this.store.change(userid, account => {
			const run = this.run(account);
			requireRule(canEditParty(run), '当前不能解锁太晶化。');
			run.teraUnlocked = true;
		});
	}
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
