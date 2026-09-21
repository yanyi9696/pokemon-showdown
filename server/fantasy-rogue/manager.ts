import { randomUUID } from 'crypto';
import { FS, Utils } from '../../lib';
import { Dex, toID } from '../../sim/dex';
import { Teams } from '../../sim/teams';
import { ROGUE_FORMAT } from '../../sim/fantasy-rogue';
import { FantasyRogueContent } from '../../config/fantasy-rogue';
import { getAIManager, type AIChallengeManager } from '../fantasy-ai/manager';
import { ROGUE_EMERGENCY_COST, RogueEngine } from './engine';
import { RogueStore } from './store';
import { BOSS_FLOORS, fixedFloor } from './content';
import type { RogueCommand } from './types';
import { experienceProgress, evolutionOptions, ensureMemberMemory, rebuildMember } from './progression';
import { healingLocked, inventoryItem } from './team';

export class RogueManager {
	readonly engine: RogueEngine;
	private readonly ai: () => AIChallengeManager;
	constructor(engine: RogueEngine, ai: () => AIChallengeManager = getAIManager) {
		this.engine = engine;
		this.ai = ai;
	}
	private authorize(user: User) {
		if (Config.fantasyrogue?.enabled === false) throw new Error('幻想杯肉鸽尚未开放。');
		if (!user.named || !user.connected) {
			throw new Error(Config.fantasyailocal ? '请先选择固定测试昵称，以保存冒险进度。' : '请先登录注册账号，以保存冒险进度。');
		}
		if (!user.registered && !Config.fantasyailocal) {
			throw new Error('当前仅使用昵称，尚未登录注册账号。请使用账号密码登录后刷新存档。');
		}
	}
	private recoverMissingRoom(userid: string) {
		const battle = this.engine.store.get(userid).run?.battle;
		if (!battle) return;
		const roomBattle = battle.roomid && Rooms.get(battle.roomid)?.battle;
		if (!roomBattle || roomBattle.ended || roomBattle.p1.id !== userid ||
			roomBattle.options.fantasyRogue?.state.encounterId !== battle.encounterId) {
			this.engine.recover(userid, battle.token);
		}
	}
	state(user: User) {
		const common = { userid: user.id, protocolVersion: 1, enabled: Config.fantasyrogue?.enabled !== false };
		try { this.authorize(user); } catch (error) {
			return { ...common, message: (error as Error).message, account: null };
		}
		this.recoverMissingRoom(user.id);
		const account = this.engine.migrate(user.id);
		const content = this.engine.content;
		const run = account.run;
		const items = content ? [...content.items] : [];
		if (run && content) {
			for (const id of [...Object.keys(run.bag), ...run.team.map(mon => toID(mon.set.item))]) {
				if (!id || items.some(item => item.id === id)) continue;
				const item = inventoryItem(content, id);
				if (item) items.push(item);
			}
		}
		return {
			...common, configured: !!content, message: content ? content.label || '' : '正式队伍与数值等待配置，目前可查看局外成长。',
			account: {
				revision: account.revision, points: account.points, boosts: account.boosts, slots: account.slots,
				captures: account.captures, unlocked: account.unlocked,
			},
			starters: content?.starters.map(starter => ({
				id: starter.id, species: starter.set.species, level: starter.set.level,
				available: starter.availableInitially || account.unlocked.includes(starter.id),
			})) || [],
			items, shopItems: content?.items.map(item => item.id) || [],
			run: run ? {
				id: run.id, floor: run.floor, phase: run.phase, encounter: run.encounter,
				recovery: run.recovery, retreating: !!run.battle?.retreatRequested,
				healingLocked: healingLocked(run), emergencyCost: ROGUE_EMERGENCY_COST,
				canEmergency: !!content && this.engine.canEmergency(run),
				teraUnlocked: !!run.teraUnlocked,
				encounters: run.node?.encounters.length || 0, node: run.node && {
					name: run.node.name, kind: run.node.kind, noHealing: !!run.node.noHealing,
					reward: { ...run.node.reward, points: run.node.kind === 'boss' ? 1 : 0 },
				},
				team: run.team.map(saved => {
					const mon = structuredClone(saved);
					ensureMemberMemory(mon);
					if (!mon.stats) rebuildMember(mon, run.boosts);
					const species = Dex.mod('gen9fantasy').species.get(mon.set.species);
					return { ...mon, baseStats: species.baseStats, types: species.types,
						experienceProgress: experienceProgress(mon),
						evolutions: content?.progression ? evolutionOptions(mon) : [],
					};
				}), bag: run.bag, money: run.money, boosts: run.boosts, lastReward: run.lastReward,
				notices: run.notices?.slice(-16) || [], pendingCapture: run.pendingCapture, pendingMoves: run.pendingMoves || [],
				roomid: run.battle?.roomid, fixed: fixedFloor(run.floor), boss: BOSS_FLOORS.get(run.floor),
				choices: run.phase === 'choose' ? (content?.floors[run.floor] || []).map(node => ({
					id: node.id, kind: node.kind, name: node.name,
					reward: { ...node.reward, points: node.kind === 'boss' ? 1 : 0 },
				})) : [],
			} : null,
		};
	}
	/** Never accepts a team, battle outcome, balance or capture count from the browser. */
	command(connection: Connection, command: RogueCommand) {
		const user = connection.user;
		this.authorize(user);
		this.recoverMissingRoom(user.id);
		const current = this.engine.store.get(user.id).run;
		const retreatRoom = command.action === 'retreat' && current?.phase === 'battle' && current.battle?.roomid ?
			Rooms.get(current.battle.roomid)?.battle : undefined;
		if (command.action === 'retreat' && current?.phase === 'battle') {
			if (!retreatRoom?.started || retreatRoom.ended || retreatRoom.p1.id !== user.id) {
				throw new Error('战斗尚未准备好或已经结束，请刷新后重试。');
			}
		}
		const previousRun = this.engine.store.get(user.id).run?.id;
		const account = this.engine.command(user.id, command);
		const run = account.run;
		if (command.action === 'retreat' && run?.battle?.retreatRequested && retreatRoom && !retreatRoom.p1.eliminated) {
			retreatRoom.forfeit(user, ' 撤退了。');
		}
		if (command.action === 'start' && run && run.id !== previousRun && !run.announced) {
			this.engine.store.change(user.id, saved => { saved.run!.announced = true; });
			Rooms.get('lobby')?.add(`|raw|${Utils.escapeHTML(user.name)} 开启了幻想杯肉鸽之旅`).update();
		}
		if (command.action === 'battle' && run?.phase === 'battle' && run.battle && !run.battle.roomid) {
			const userid = user.id;
			const token = run.battle.token;
			const encounter = run.node!.encounters[run.encounter];
			const broadcast = () => user.send(`|queryresponse|fantasyrogue|${JSON.stringify(this.state(user))}`);
			try {
				const room = this.ai().createRogueBattle(user, {
					id: `rogue-${run.node!.id}`, name: encounter.name, avatar: '1', description: '', format: ROGUE_FORMAT,
					style: encounter.style, developmentOnly: false, packedTeam: Teams.pack(encounter.team),
					keyMembers: [], resourcePreferences: [],
				}, Teams.pack(run.team.map(mon => mon.set)), {
					state: this.engine.battleState(userid), floor: run.floor,
					onCapture: captured => { this.engine.capture(userid, token, captured); },
					onResult: result => {
						const pending = this.engine.store.get(userid).run?.battle;
						if (pending?.token !== token) return;
						this.engine.settle(userid, token, result);
						broadcast();
						if (!result.won && pending.roomid) user.sendTo(pending.roomid as RoomID, '|fantasyrogueend|');
					},
					onClose: () => {
						if (this.engine.store.get(userid).run?.battle?.token === token) {
							this.engine.recover(userid, token);
							broadcast();
						}
					},
				});
				this.engine.store.change(userid, saved => {
					if (saved.run?.battle?.token === token) saved.run.battle.roomid = room.roomid;
				});
			} catch (error) {
				this.engine.recover(userid, token);
				throw error;
			}
		}
		return this.state(user);
	}
	/** A battle-room button can only retreat from the caller's current campaign room. */
	retreat(connection: Connection, roomid: string) {
		this.authorize(connection.user);
		const account = this.engine.store.get(connection.user.id);
		if (account.run?.phase !== 'battle' || account.run.battle?.roomid !== roomid) {
			throw new Error('只能从自己当前的肉鸽战斗撤退。');
		}
		if (account.run.battle.retreatRequested) return;
		this.command(connection, { id: randomUUID(), revision: account.revision, action: 'retreat' });
	}
}

let manager: RogueManager | undefined;
export function getRogueManager() {
	if (!manager) {
		FS('databases').mkdirpSync();
		manager = new RogueManager(new RogueEngine(new RogueStore(
			Config.fantasyrogue?.database || 'databases/fantasy-rogue.db'
		), FantasyRogueContent));
	}
	return manager;
}
