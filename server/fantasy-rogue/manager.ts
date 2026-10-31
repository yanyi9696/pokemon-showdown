import { moveCategoryHelp } from './move-categories';
import { optionalChallengeView } from './optional-challenges';
import { BLESSING_SUPPLY_HELP } from './blessing-text';
import { difficultyMenuDescription } from '../../sim/rogue-difficulty';
import { affectionView, affectionScene } from './affection';
import { ROGUE_DIFFICULTIES, difficultyLabel, difficultyDescription, difficultyScale, difficultyRewardDescription, CHARM_DESCRIPTION } from '../../sim/rogue-difficulty';
import { collapseEntries, collapseParameters } from '../../sim/rogue-collapse-data';
import { difficultySpiritUnlocked, preferredDifficulty } from './difficulty';
import { comebackView } from './comeback';
import { coverageView } from './coverage';
import { fusionAbilities } from './fusion';
import { formItemOptions } from './form-items';
import { rivalCompanionView, rivalCompanionViews } from './rivals';
import { robeMember, robeDurability } from '../../sim/rogue-awakening';
import { eggView } from './eggs';
import { centerCare } from './economy';
import { rogueAccess } from './access';
import { companionView } from './companions';
import { growthView, growthOffers } from './growth';
import { rewardSceneView } from './reward-scenes';
import { randomUUID } from 'crypto';
import { emergencyCost, MENTOR_CARDS, mentorCardAtFloor, type MentorCard } from './early-balance';
import { eventView, canRetreatRogue } from './events';
import { needsOnboarding } from './onboarding';
import { rogueCodex, codexContentVersion, ROGUE_CODEX_SCHEMA, type CodexSection } from './codex';
import { BEGINNER_GUIDE, BEGINNER_GUIDE_VERSION } from './beginner-guide';
import { companionInvitationView, socialCompanionViews } from './travellers';
import { companionOptions } from './companions';
import { FS, Utils } from '../../lib';
import { Dex, toID } from '../../sim/dex';
import { rogueOpponentAvatar } from './trainer-bosses';
import { Teams } from '../../sim/teams';
import { ROGUE_FORMAT, ROGUE_COOP_FORMAT } from '../../sim/fantasy-rogue';
import { FantasyRogueContent } from '../../config/fantasy-rogue';
import { getAIManager, type AIChallengeManager } from '../fantasy-ai/manager';
import { RogueEngine, rogueSlotCost, rogueStatCost } from './engine';
import { ROGUE_CAPTURE_COUNTS } from '../../sim/fantasy-rogue-rules';
import { RogueStore } from './store';
import { BOSS_FLOORS, fixedFloor } from './content';
import type { RogueCommand } from './types';
import { experienceProgress, evolutionOptions, ensureMemberMemory, rebuildMember } from './progression';
import { partyEvolutions } from './party-evolution';
import { friendship, rogueTime, ROGUE_TIME_NAMES } from './friendship';
import { healingLocked, inventoryItem, abilityItemTarget } from './team';
import { starterMoves, starterTraits } from './starter-traits';
import { rogueStarterSlotCost } from '../../sim/rogue-species-identity';
import { spiritItems } from './spirits';
import { shopStock, machineMoves } from './trading';
import { recycleOffers } from './buyback';
import { activeRogueSpirits, rogueSpirit, roguePartyLimit } from '../../sim/fantasy-rogue-spirits';
import { storyView, startCard, bossRoster } from './story';
import { RogueDuels, type DuelCommand } from './duels';
import { rogueRulesVersion, clearCardView } from './legacy';
import { echoView } from './echo';
import { blessingView, blessingItems, blessingMemberTypes, fantasyForm, equipmentCategory } from './blessings';
import { assignedExtraAbilities, canGrantExtraAbility, emblemBaseTypes } from '../../sim/rogue-blessing-permanent';

export class RogueManager {
	readonly engine: RogueEngine;
	private readonly ai: () => AIChallengeManager;
	readonly duels: RogueDuels;
	constructor(engine: RogueEngine, ai: () => AIChallengeManager = getAIManager) {
		this.engine = engine;
		this.ai = ai;
		this.duels = new RogueDuels(engine.store);
	}
	private authorize(user: User) {
		if (Config.fantasyrogue?.enabled === false) throw new Error('幻想杯肉鸽尚未开放。');
		if (!user.named || !user.connected) {
			throw new Error(Config.fantasyailocal ? '请先选择固定测试昵称，以保存冒险进度。' : '请先登录注册账号，以保存冒险进度。');
		}
		if (!user.registered && !Config.fantasyailocal) {
			throw new Error('当前仅使用昵称，尚未登录注册账号。请使用账号密码登录后刷新存档。');
		}
		if (!rogueAccess(user)) throw new Error('当前账号尚未获得幻想杯肉鸽内测权限。');
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
	history(user: User, offset = 0) {
		try { this.authorize(user); } catch { return { userid: user.id, records: [], total: 0, error: '请先登录可用的测试昵称或账号。' }; }
		return { userid: user.id, ...this.engine.store.history(user.id, offset) };
	}
	gallery(user: User, offset = 0) {
		if (!rogueAccess(user)) return { userid: user.id, enabled: false, cards: [], own: [] };
		const account = this.state(user).account;
		const own = account ? this.engine.store.get(user.id) : undefined;
		return { userid: user.id, account, own: own?.cards?.map(clearCardView) || [], pending: own?.pendingClear && clearCardView(own.pendingClear),
			rulesVersion: rogueRulesVersion(), offset,
			cards: this.engine.store.gallery(offset).map(card => ({ ...clearCardView(card), online: !!Users.get(card.owner)?.connected })),
			invitations: account ? this.duels.list(user.id) : [] };
	}
	codex(user: User, section: CodexSection) {
		if (!rogueAccess(user)) return { userid: user.id, enabled: false, section, entries: [] };
		let account;
		try { this.authorize(user); account = this.engine.store.get(user.id); } catch {}
		return { userid: user.id, revision: account?.revision, codexSchema: ROGUE_CODEX_SCHEMA, contentVersion: codexContentVersion(), moveCategoryHelp: moveCategoryHelp(), blessingSupplyHelp: BLESSING_SUPPLY_HELP, ...rogueCodex(account, section, this.engine.localSpirits) };
	}
	duel(user: User, command: DuelCommand) {
		this.authorize(user);
		return this.duels.command(user, command);
	}
	state(user: User) {
		const common = {
			userid: user.id, protocolVersion: 1, codexSchema: ROGUE_CODEX_SCHEMA,
			contentVersion: codexContentVersion(), enabled: rogueAccess(user), continueOnly: this.engine.continueOnly,
		};
		try { this.authorize(user); } catch (error) {
			return { ...common, message: (error as Error).message, account: null };
		}
		this.recoverMissingRoom(user.id);
		const account = this.engine.migrate(user.id);
		const content = this.engine.content;
		const run = account.run;
		const stock = content ? shopStock(content, run) : [];
		const items = content ? [...spiritItems(content, run), ...(content.blessings ? blessingItems(this.engine.localSpirits || account.tonicSecret) : [])].map(item => ({ ...item })) : [];
		if (run?.node) {
			for (const item of stock) {
				const index = items.findIndex(entry => entry.id === item.id);
				if (index >= 0) items[index] = { ...item }; else items.push({ ...item });
			}
		}
		if (run && content) {
			for (const id of [...Object.keys(run.bag), ...(run.node?.challenge?.prizes ||
				[]).flatMap(prize => Object.keys(prize.items)),
			...[...run.team, ...(run.box || [])].flatMap(mon => [toID(mon.set.item), mon.emblem || ''])]) {
				if (!id || items.some(item => item.id === id)) continue;
				const item = inventoryItem(content, id);
				if (item) items.push({ ...item });
			}
		}
		for (const item of items) item.category ||= equipmentCategory(item.id);
		if (run?.collapse?.includes('medicine')) for (const item of items) {
			if (item.kind === 'heal') item.description = `原回复量 ${item.amount} HP；本局受药效衰减影响，按原量与目标最大生命值中较小者的 ${Math.round(collapseParameters(run.difficultyRulesVersion ?? 3).medicine * 100)}% 回复（向下取整，至少 1 HP），不复活倒下成员。`;
		}
		if (run && content) for (const offer of recycleOffers(run, content)) {
			const item = items.find(entry => entry.id === offer.id);
			if (item) item.recyclePrice = offer.recyclePrice;
		}
		return {
			...common, configured: !!content, message: content ? content.label || '' : '正式队伍与数值等待配置，目前可查看局外成长。',
			storyEnabled: !!content?.story,
			beginnerGuide: needsOnboarding(account) ? BEGINNER_GUIDE : undefined,
			beginnerGuideVersion: BEGINNER_GUIDE_VERSION,
			moveCategoryHelp: moveCategoryHelp(), blessingSupplyHelp: BLESSING_SUPPLY_HELP,
			story: storyView(account, !!content?.story, this.engine.localSpirits),
			cards: account.cards?.map(clearCardView) || [], pendingClear: account.pendingClear && clearCardView(account.pendingClear),
			account: {
				echo: echoView(account),
				needsOnboarding: !!content && needsOnboarding(account),
				revision: account.revision, points: account.points, boosts: account.boosts, slots: account.slots,
				boostRuleVersion: 2, unlockNotices: account.unlockNotices || [],
				mainline: { completed: account.mainline?.completed.length || 0, total: 22, endingSeen: !!account.mainline?.endingSeen },
				preferredDifficulty: preferredDifficulty(account),
				difficultySettingsUnlocked: this.engine.localSpirits || account.difficulties!.highest > 0,
				slotCost: rogueSlotCost(account.slots),
				statCosts: Object.fromEntries(Object.entries(account.boosts).map(([stat, value]) => [stat, rogueStatCost(value)])),
				captures: account.captures, unlocked: account.unlocked,
				spiritUnlocked: !!content?.spirits && (!!account.spiritUnlocked || this.engine.localSpirits),
			},
			difficulties: ROGUE_DIFFICULTIES.map(tier => ({ id: tier, name: difficultyLabel(tier), text: difficultyDescription(tier), menuText: difficultyMenuDescription(tier),
				rewards: difficultyRewardDescription(tier),
				unlocked: tier === 'easy' || tier <= account.difficulties!.highest,
				spirit: !!content?.spirits && difficultySpiritUnlocked(account, tier) })),
			collapseEntries: collapseEntries(run && run.phase !== 'complete' ? run.difficultyRulesVersion || 1 : 5),
			localSpirits: this.engine.localSpirits,
			selectableSpirits: content?.spirits ? activeRogueSpirits().filter(spirit => account.unlockedSpirits?.includes(spirit.id)) : [],
			spirits: this.engine.localSpirits && content?.spirits ? activeRogueSpirits() : [],
			unlockRequirements: ROGUE_CAPTURE_COUNTS,
			natures: Dex.natures.all().map(nature => ({
				id: nature.id, name: nature.name, plus: nature.plus, minus: nature.minus,
			})),
			starters: (!run || run.phase === 'complete' ? content?.starters : [])?.map(starter => ({
				id: starter.id, species: starter.set.species, level: starter.set.level,
				gen: Dex.mod('gen9fantasy').species.get(starter.set.species).gen,
				types: Dex.mod('gen9fantasy').species.get(starter.set.species).types,
				slotCost: rogueStarterSlotCost(starter.set.species),
				available: starter.availableInitially || account.unlocked.includes(starter.id),
				traits: starterTraits(account, starter.id),
				abilities: Object.entries(Dex.mod('gen9fantasy').species.get(starter.set.species).abilities)
					.map(([slot, name]) => ({ id: toID(name), name, hidden: slot === 'H' })),
				gender: Dex.mod('gen9fantasy').species.get(starter.set.species).gender,
				defaultMoves: starter.set.moves.map(toID),
				moves: starterMoves(account, content!, starter.id),
			})) || [],
			items, shopItems: stock.map(item => item.id),
			run: run ? {
				difficulty: run.difficulty || 0, difficultyLabel: difficultyLabel(run.difficulty), difficultyTest: !!run.difficultyTest,
				difficultyScales: { player: difficultyScale(run.difficulty, run.floor, false, run.difficultyRulesVersion || 1), opponent: difficultyScale(run.difficulty, run.floor, true, run.difficultyRulesVersion || 1) },
				collapse: run.collapse || [], difficultyRulesVersion: run.difficultyRulesVersion || 1,
				futureSight: run.blessings?.owned.some(b => b.family === 'futuresight') ? {
					bosses: Object.keys(run.bossPreviews || {}).map(Number).filter(floor => floor > run.floor)
						.sort((a, b) => a - b).map(floor => ({ floor, roster: bossRoster(run, floor) })),
				} : undefined,
				difficultyRewards: difficultyRewardDescription(run.difficulty),
				charm: run.difficulty === 'easy' ? { name: '替身护符', description: CHARM_DESCRIPTION } : undefined,
				trainerBonds: affectionView(run), affectionScene: affectionScene(run),
				companions: companionView(run, eventView(run)?.options || []),
				selectedCompanions: run.blessings?.companions?.map(c => c.id),
				companionInvitation: companionInvitationView(run),
				socialCompanions: socialCompanionViews(run, companionOptions(run, eventView(run)?.options || [])),
				preview: run.preview && { trainer: run.preview.trainer, stage: run.preview.stage, won: run.preview.result?.won },
				comeback: comebackView(run), coverage: coverageView(run), growth: growthView(run), growthOffers: growthOffers(run), rewardScene: rewardSceneView(run),
				blessings: blessingView(run, this.engine.localSpirits || account.tonicSecret), moveSlots: run.blessings?.owned.some(b => b.family === 'learnall') ? 5 : 4,
				story: run.story, startCard: startCard(run.startCard),
				spirit: rogueSpirit(run.spirit), partyLimit: roguePartyLimit(run.spirit, run.blessings), box: run.box?.map(mon => mon.egg ? eggView(mon, run.floor) : mon),
				id: run.id, floor: run.floor, phase: run.phase, encounter: run.encounter,
				postgame: run.postgame?.stage,
				godEchoAwarded: run.postgame?.echoAwarded,
				failure: run.failure,
				event: eventView(run), challenge: optionalChallengeView(run), eventBuff: run.eventBuff,
                mentorOffer: run.mentorOffer ? {floor: run.mentorOffer, cards: Object.keys(MENTOR_CARDS).map(id => ({id, ...mentorCardAtFloor(id as MentorCard, run.mentorOffer!)}))} : undefined,
                mentorCard: run.mentorCard ? {...run.mentorCard, ...mentorCardAtFloor(run.mentorCard.kind, run.mentorCard.floor)} : undefined,
				time: { id: rogueTime(run.floor), name: ROGUE_TIME_NAMES[rogueTime(run.floor)] },
				floorEnvironment: run.environment,
				recovery: run.recovery, retreating: !!run.battle?.retreatRequested,
				emergencyRecovery: run.emergencyRecovery,
				canRetreat: canRetreatRogue(run),
				centerCare: run.node?.kind === 'rest' ? centerCare(run) : undefined,
				healingLocked: healingLocked(run), emergencyCost: emergencyCost(run.floor),
				canEmergency: !!content && this.engine.canEmergency(run),
				teraUnlocked: !!run.teraUnlocked,
				megaUnlocked: !!run.megaUnlocked, gmegaUnlocked: !!run.gmegaUnlocked, zUnlocked: !!run.zUnlocked,
				encounters: run.node?.encounters.length || 0, node: run.node && {
					name: run.node.name, kind: run.node.kind, trade: run.node.trade, noHealing: !!run.node.noHealing,
					rocket: run.node.rocket, shopChallenge: run.node.shopChallenge, hpPurchases: run.node.hpPurchases || 0,
					biome: run.node.biome, bonusEncounter: !!run.node.encounters[run.encounter]?.bonus,
					wildPack: run.node.encounters[run.encounter]?.wildPack ? run.node.encounters[run.encounter].team.length : undefined,
					environment: run.node.encounters[run.encounter]?.environment,
					wildLoot: run.node.wildLoot, encounterLoot: run.node.wildLoot?.[run.encounter],
					reward: { ...run.node.reward, points: run.difficulty === 'easy' ? 0 : run.postgame?.stage === 'battle' ? 20 : run.node.kind === 'boss' && !run.node.companionLoss ? 1 : 0 },
				},
				rival: run.rival, rivalCompanion: rivalCompanionView(run), rivalCompanions: rivalCompanionViews(run),
				team: run.team.map(saved => {
					if (saved.egg) return eggView(saved, run.floor);
					const mon = structuredClone(saved);
					ensureMemberMemory(mon);
					if (!mon.stats) rebuildMember(mon, run.boosts);
					const species = Dex.mod('gen9fantasy').species.get(mon.set.species);
					const baseStats = { ...(mon.fusion?.baseStats || species.baseStats) };
					const robe = (['godrobe', 'puregodrobe'] as const).find(kind => robeMember(run.team, run.blessings, kind)?.id === saved.id);
					for (const [key, value] of Object.entries(mon.statModifiers?.baseStats || {})) baseStats[key as StatID] += value;
					return { ...mon, baseStats, fusionAbilities: fusionAbilities(saved, run), machineMoves: items.some(item => item.kind === 'machine') ? machineMoves(mon) : [],
						formOptions: formItemOptions(run, saved),
						robeInfo: robe ? {name: robe === 'godrobe' ? '神衣鲜血' : '神衣纯洁', durability: robeDurability(mon.hp, mon.maxhp, !!run.blessings?.owned.find(b => b.family === robe)?.completed)} : undefined,
						abilityChanges: { abilitycapsule: abilityItemTarget(mon, 'abilitycapsule'), abilitypatch: abilityItemTarget(mon, 'abilitypatch') },
						extraAbilities: assignedExtraAbilities(saved, run.team, run.blessings).filter(id => id !== toID(mon.set.ability)),
						canReceiveSharpness: canGrantExtraAbility(saved, 'sharpness', run.team, run.blessings),
						types: blessingMemberTypes(mon), emblemBaseTypes: emblemBaseTypes(saved),
						fantasyForm: mon.fusion ? undefined : fantasyForm(mon.set.species),
						experienceProgress: experienceProgress(mon),
						friendship: friendship(mon),
						evolutionDetails: content?.progression ? partyEvolutions(mon, run) : undefined,
						evolutions: content?.progression ? evolutionOptions(mon, run) : [],
					};
				}), bag: run.bag, money: run.money, boosts: run.boosts,
				boostRuleVersion: run.boostRuleVersion, lastReward: run.lastReward,
				notices: run.notices?.slice(-16) || [], pendingCapture: run.pendingCapture,
				returningPartner: run.captureResume === 'event' && run.node?.event?.id === 'greninjareturn',
				pendingMoves: run.pendingMoves || [],
				roomid: run.battle?.roomid, fixed: fixedFloor(run.floor), boss: BOSS_FLOORS.get(run.floor),
				choices: run.phase === 'choose' ? (run.choices || content?.floors[run.floor] || []).map(node => node.fogged ? {
					id: node.id, kind: 'fog', name: '迷雾区域', fogged: true, reward: { money: 0, items: {}, points: 0 },
				} : ({
					id: node.id, kind: node.kind, name: node.kind === 'trainer' && !node.challenge ? '未知遭遇' : node.name,
					hidden: node.kind === 'trainer' && !node.challenge, challenge: !!node.challenge,
					biome: node.biome,
					wildLoot: node.wildLoot,
					reward: { money: 0, items: {}, points: 0 },
				})) : [],
			} : null,
		};
	}
	/** Ski input uses the same transactional revision/receipt checks without resending the whole party. */
	ski(connection: Connection, command: RogueCommand) {
		this.authorize(connection.user);
		const account = this.engine.store.get(connection.user.id);
		const event = account.run?.node?.event;
		if (command.action !== 'event' || !['skileft', 'skiright', 'skitick'].includes(command.value || '') ||
			event?.id !== 'skiing' || event.key !== command.member) throw new Error('当前没有进行中的滑雪。');
		const result = this.engine.command(connection.user.id, command, connection.user.name);
		return { revision: result.revision, event: eventView(result.run!) };
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
		const account = this.engine.command(user.id, command, user.name);
		const run = account.run;
		if (command.action === 'retreat' && run?.battle?.retreatRequested && retreatRoom && !retreatRoom.p1.eliminated) {
			retreatRoom.forfeit(user, ' 逃跑了。');
		}
		if (command.action === 'start' && run && run.id !== previousRun && !run.announced) {
			this.engine.store.change(user.id, saved => { saved.run!.announced = true; });
			if (Config.fantasyrogue?.publicAccess) Rooms.get('lobby')?.add(`|raw|${Utils.escapeHTML(user.name)} 开启了幻想杯肉鸽之旅`).update();
		}
		if (['battle', 'shopchallenge', 'godchallenge'].includes(command.action) &&
			run?.phase === 'battle' && run.battle && !run.battle.roomid) {
			const userid = user.id;
			const token = run.battle.token;
			const encounter = run.node!.encounters[run.encounter];
			const broadcast = () => user.send(`|queryresponse|fantasyrogue|${JSON.stringify(this.state(user))}`);
			try {
				const battleState = this.engine.battleState(userid);
				const room = this.ai().createRogueBattle(user, {
					id: `rogue-${encounter.trainer?.id || run.node!.id}`, name: encounter.name,
					avatar: rogueOpponentAvatar(run), description: '', format: encounter.cooperative ? ROGUE_COOP_FORMAT : ROGUE_FORMAT,
					style: encounter.style, developmentOnly: false, packedTeam: Teams.pack(encounter.cooperative ? encounter.team.slice(0, Math.ceil(encounter.team.length / 2)) : encounter.team),
					keyMembers: [], resourcePreferences: [],
				}, Teams.pack(battleState.team.map(mon => mon.set)), {
					cooperative: encounter.cooperative && { name: encounter.cooperative.name, avatar: encounter.cooperative.id, ally: Teams.pack(encounter.cooperative.team), foe: Teams.pack(encounter.team.slice(Math.ceil(encounter.team.length / 2))), foeName: encounter.name },
					state: battleState, floor: run.floor, boss: run.node!.kind === 'boss', canRetreat: canRetreatRogue(run),
					optionalChallenge: !!run.node?.challenge,
					preview: run.preview?.stage === 'running' ? run.preview.trainer : undefined,
					wild: !encounter.trainer && run.node!.kind !== 'trainer' && encounter.boss?.kind !== 'summit',
					onCapture: captured => { this.engine.capture(userid, token, captured); },
					onResult: result => {
						const pending = this.engine.store.get(userid).run?.battle;
						if (pending?.token !== token) return;
						const previewing = this.engine.store.get(userid).run?.preview?.stage === 'running';
						this.engine.settle(userid, token, result);
						broadcast();
						if (previewing) {
							if (pending.retreatRequested && pending.roomid) user.sendTo(pending.roomid as RoomID, '|fantasyrogueend|');
							return;
						}
						if ((!result.won || pending.retreatRequested) && pending.roomid) {
							if (pending.retreatRequested) {
								user.sendTo(pending.roomid as RoomID, '|fantasyrogueend|');
							} else {
								const settled = this.engine.store.get(userid).run!;
								const defeat = {
									...(settled.failure ? { failedRun: true } : {}),
									...(settled.node?.companionLoss || run.node?.event?.rematch ? { companionRescue: true } : {}),
									...(settled.postgame ? { postgame: true } : {}),
									...(settled.emergencyRecovery ? { emergencyRecovery: settled.emergencyRecovery } : {}),
									floor: run.floor, encounter: run.encounter + 1, encounters: run.node!.encounters.length,
									...(run.node!.shopChallenge ? { shopClosed: true } : {}),
									...(run.node!.event?.police ? { eventRetry: true } : run.node!.event?.id === 'exclusiveclue' ? { eventContinues: true } :
										run.node!.event ? { eventClosed: true } : {}),
									...(run.node!.event?.id === 'travel' ? { memoryRestored: true } : {}),
									retryFloor: settled.phase === 'failed', noHealing: !!settled.node?.noHealing,
									emergencyCost: emergencyCost(run.floor),
								};
								// Retain the notice for reconnects; the client waits for the native playback queue.
								room.battle!.options.fantasyRogue!.defeat = defeat;
								user.sendTo(pending.roomid as RoomID, `|fantasyroguedefeat|${JSON.stringify(defeat)}`);
							}
						}
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
			throw new Error('只能从自己当前的肉鸽战斗逃跑。');
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
		), FantasyRogueContent, undefined,
		!!Config.fantasyailocal && ['127.0.0.1', '::1'].includes(Config.bindaddress || ''),
		!!Config.fantasyrogue?.continueOnly));
	}
	return manager;
}
