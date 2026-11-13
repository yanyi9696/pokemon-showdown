import { moveCategoryHelp } from './move-categories';
import { releaseView } from './release';
import { candyRewardPreview } from './candy-rewards';
import { splitCoopOpponents } from './coop-team';
import { activeCoopEscort, coopBattleParty } from './coop-escort';
import { crateSummary, crateView } from './starter-crates';
import { needsCupSettlement, settleDailyCup, dailyCupReplay } from './daily-crate-cup';
import { retryHealingView } from './retry-healing';
import { optionalChallengeView } from './optional-challenges';
import { BLESSING_SUPPLY_HELP } from './blessing-text';
import { affectionView, affectionScene } from './affection';
import { difficultyMenuDescription, ROGUE_DIFFICULTIES, difficultyLabel, difficultyDescription, difficultyScale, difficultyRewardDescription, CHARM_DESCRIPTION } from '../../sim/rogue-difficulty';
import { collapseEntries, collapseParameters } from '../../sim/rogue-collapse-data';
import { difficultySpiritUnlocked, preferredDifficulty, canSelectSpirit } from './difficulty';
import { comebackView } from './comeback';
import { coopBattleMentor } from './coop-mentor';
import { coopComebackCard } from './coop-comeback';
import { coverageView } from './coverage';
import { fusionAbilities } from './fusion';
import { fusionArtworkChoices, memberFusionSprite } from '../../sim/rogue-fusion-art';
import { formItemOptions } from './form-items';
import { rivalCompanionView, rivalCompanionViews } from './rivals';
import { robeMember, robeDurability } from '../../sim/rogue-awakening';
import { eggView } from './eggs';
import { centerCare } from './economy';
import { rogueAccess, rogueCoopAccess } from './access';
import { companionView, companionOptions } from './companions';
import { growthView, growthOffers } from './growth';
import { rewardSceneView } from './reward-scenes';
import { randomUUID } from 'crypto';
import { emergencyCost, MENTOR_CARDS, mentorCardAtFloor, mentorTier, type MentorCard } from './early-balance';
import { eventView, canRetreatRogue } from './events';
import { needsOnboarding } from './onboarding';
import { rogueCodex, codexContentVersion, ROGUE_CODEX_SCHEMA, type CodexSection } from './codex';
import { BEGINNER_GUIDE, BEGINNER_GUIDE_VERSION } from './beginner-guide';
import { companionInvitationView, socialCompanionViews } from './travellers';
import { FS, Utils } from '../../lib';
import { Dex, toID } from '../../sim/dex';
import { rogueOpponentAvatar } from './trainer-bosses';
import { Teams } from '../../sim/teams';
import {
	ROGUE_FORMAT, ROGUE_COOP_FORMAT, ROGUE_DOUBLES_FORMAT, type RoguePokemon, type RogueBattleResult, type RogueBattleState,
} from '../../sim/fantasy-rogue';
import { FantasyRogueContent } from '../../config/fantasy-rogue';
import { getAIManager, type AIChallengeManager } from '../fantasy-ai/manager';
import { RogueEngine, rogueSlotCost, rogueStatCost } from './engine';
import { ROGUE_CAPTURE_COUNTS } from '../../sim/fantasy-rogue-rules';
import { RogueStore } from './store';
import { BOSS_FLOORS, fixedFloor } from './content';
import type { RogueCoopSession, RogueCommand } from './types';
import { coopBattleBlessings } from './coop-growth';
import { experienceProgress, evolutionOptions, ensureMemberMemory, rebuildMember } from './progression';
import { partyEvolutions } from './party-evolution';
import { friendship, rogueTime, ROGUE_TIME_NAMES } from './friendship';
import { healingLocked, inventoryItem, abilityItemTarget } from './team';
import { starterMoves, starterTraits } from './starter-traits';
import { rogueStarterSlotCost } from '../../sim/rogue-species-identity';
import { rogueSpeciesID } from './species-eligibility';
import { spiritItems } from './spirits';
import { shopStock, machineMoves } from './trading';
import { recycleOffers } from './buyback';
import { activeRogueSpirits, rogueSpirit, roguePartyLimit } from '../../sim/fantasy-rogue-spirits';
import { storyView, startCard, bossRoster } from './story';
import { RogueDuels, type DuelCommand } from './duels';
import { rogueRulesVersion, clearCardView } from './legacy';
import { echoView } from './echo';
import { monthlyChallengeView } from './monthly-challenges';
import { blessingView, blessingItems, blessingMemberTypes, fantasyForm, equipmentCategory } from './blessings';
import { universalOptions } from './universal-evolution';
import { fantasyConversionOptions } from './fantasy-conversion';
import {
	assignedExtraAbilities, canGrantExtraAbility, emblemBaseTypes,
} from '../../sim/rogue-blessing-permanent';
import { RogueCoopSessions } from './coop-sessions';
import type { ValidatedTrainer } from '../fantasy-ai/types';

export class RogueManager {
	readonly engine: RogueEngine;
	readonly coop: RogueCoopSessions;
	private readonly ai: () => AIChallengeManager;
	readonly duels: RogueDuels;
	constructor(engine: RogueEngine, ai: () => AIChallengeManager = getAIManager) {
		this.engine = engine;
		this.ai = ai;
		this.coop = new RogueCoopSessions(engine, (session, token) => this.startCoopBattle(session, token));
		this.duels = new RogueDuels(engine.store);
	}
	private startCoopBattle(session: RogueCoopSession, token: string) {
		const adventure = session.adventure;
		if (adventure?.phase !== 'battle-starting' || adventure.battleToken !== token || !adventure.node) {
			throw new Error('共同战斗启动状态已失效，请刷新联机进度。');
		}
		const host = Users.get(session.hostUser), guest = Users.get(session.guestUser);
		if (!host?.connected || !guest?.connected) throw new Error('双方都需要保持在线才能开始共同战斗。');
		if (!rogueCoopAccess(host) || !rogueCoopAccess(guest)) throw new Error('联机游玩暂未开放，请先体验单人冒险。');
		const node = adventure.node;
		if (node.kind === 'story' || node.mainlineScene) throw new Error('联机冒险不进入秘闻主线区域。');
		const encounter = node.encounters[adventure.encounter ?? 0];
		if (!encounter) throw new Error('所选区域没有可启动的战斗遭遇。');
		if (!adventure.encounterId) throw new Error('共同战斗编号缺失，请刷新联机进度后重试。');
		const hostMember = adventure.members[session.hostUser], guestMember = adventure.members[session.guestUser];
		const escort = activeCoopEscort(adventure);
		const battleMember = (userid: string) => {
			const member = adventure.members[userid];
			return escort?.owner !== userid ? member : { ...member, blessings: undefined, echo: undefined,
				boosts: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
				systems: { mega: false, gmega: false, z: false, tera: false } };
		};
		const hostEffects = battleMember(session.hostUser), guestEffects = battleMember(session.guestUser);
		const hostSelection = session.battleSelections[session.hostUser], guestSelection = session.battleSelections[session.guestUser];
		const hostTeam = hostSelection.map(id => coopBattleParty(adventure, session.hostUser).find(mon => mon.id === id))
			.filter((mon): mon is RoguePokemon => !!mon);
		const guestTeam = guestSelection.map(id => coopBattleParty(adventure, session.guestUser).find(mon => mon.id === id))
			.filter((mon): mon is RoguePokemon => !!mon);
		if (hostTeam.length !== hostSelection.length || guestTeam.length !== guestSelection.length || !hostTeam.length || !guestTeam.length) {
			throw new Error('联机出战队伍已变化，请刷新后重新选择。');
		}
		let opponentSets = encounter.team;
		if (!opponentSets.length && encounter.trainerCandidates?.length) opponentSets = encounter.trainerCandidates[0].team;
		opponentSets = structuredClone(opponentSets.slice(0, 6));
		const singleOpponent = encounter.boss?.kind === 'summit' || encounter.boss?.kind === 'arceus';
		if (opponentSets.length === 1 && !singleOpponent) opponentSets.push(structuredClone(opponentSets[0]));
		if (!opponentSets.length) throw new Error('所选区域的对手队伍尚未配置。');
		const partition = singleOpponent ? { first: opponentSets, second: [], opponentOffset: opponentSets.length,
			opponentSlots: opponentSets.map((_, index) => index) } : splitCoopOpponents(opponentSets);
		const firstOpponent = partition.first, secondOpponent = partition.second;
		const opponentName = encounter.trainer?.name || encounter.name || node.name;
		const content = this.engine.content!;
		const caughtSpecies = (userid: string) => this.engine.store.get(userid).caughtSpecies || [];
		const captureSpeciesConfigured = opponentSets.every(set => !!content.unlocks[rogueSpeciesID(set.species)]);
		const wild = !encounter.trainer && !node.challenge &&
			(node.kind === 'wild' || node.kind === 'event' && !!encounter.catchable);
		const catchable = wild && !!encounter.catchable && captureSpeciesConfigured;
		const trainer: ValidatedTrainer = {
			id: toID(`rogue-coop-${node.id}`) || 'roguecoop', name: opponentName,
			avatar: encounter.trainer?.avatar || 'unknown', description: '', format: ROGUE_COOP_FORMAT,
			style: encounter.style, developmentOnly: false, packedTeam: Teams.pack(firstOpponent), keyMembers: [],
			resourcePreferences: [],
		};
		const state: RogueBattleState = {
			persistCoop: true,
			totemTrial: encounter.totemTrial && structuredClone(encounter.totemTrial),
			coopTeamPreview: adventure.nativeTeamPreview, coopTeamSelected: adventure.nativeTeamSelected,
			encounterId: adventure.encounterId, team: hostTeam, partner: { team: guestTeam, boosts: { ...guestEffects.boosts },
				money: guestMember.money,
				comebackCard: escort?.owner !== session.guestUser && coopComebackCard(adventure, session.guestUser),
				blessings: coopBattleBlessings(guestEffects.blessings, guestMember.team),
				echo: guestEffects.echo && structuredClone(guestEffects.echo),
				mentorCard: escort?.owner === session.guestUser ? undefined : coopBattleMentor(adventure) },
			mentorCard: escort?.owner === session.hostUser ? undefined : coopBattleMentor(adventure),
			comebackCard: escort?.owner !== session.hostUser && coopComebackCard(adventure, session.hostUser),
			mentorTier: node.kind === 'boss' ? mentorTier(adventure.floor) : undefined,
			echo: hostEffects.echo && structuredClone(hostEffects.echo),
			blessings: coopBattleBlessings(hostEffects.blessings, hostMember.team),
			boosts: { ...hostEffects.boosts }, bag: { ...hostMember.bag }, partnerBag: { ...guestMember.bag },
			spirit: adventure.spirit ? { id: adventure.spirit, floor: adventure.floor,
				money: hostMember.money, hazards: encounter.spiritHazards?.slice() } : undefined,
			balls: content.items.filter(item => item.kind === 'ball' && (item.multiplier || item.id in (encounter.catchChances || {})) &&
				(item.id !== 'masterball' || !encounter.trainer && encounter.catchable))
				.map(item => ({ id: item.id, name: item.name, chance: encounter.catchChances?.[item.id],
					multiplier: item.multiplier, rule: item.ballRule })),
			catchable,
			fishingElite: node.event?.id === 'fishing',
			coopCaptureCapacity: {
				p1: hostMember.team.length < 6 || hostMember.box.length < 30,
				p3: guestMember.team.length < 6 || guestMember.box.length < 30,
			},
			coopCaptureSlots: {
				p1: Math.max(0, 6 - hostMember.team.length) + Math.max(0, 30 - hostMember.box.length),
				p3: Math.max(0, 6 - guestMember.team.length) + Math.max(0, 30 - guestMember.box.length),
			},
			caughtSpecies: caughtSpecies(session.hostUser).length,
			caughtSpeciesIds: [...caughtSpecies(session.hostUser)],
			partnerCaughtSpecies: caughtSpecies(session.guestUser).length,
			partnerCaughtSpeciesIds: [...caughtSpecies(session.guestUser)],
			captureEnvironment: {
				fishing: node.event?.id === 'fishing',
				water: node.event?.id === 'fishing' || ['biome02', 'biome09'].includes(node.biome?.id || ''),
				dark: rogueTime(adventure.floor) === 'night' || ['biome04', 'biome12', 'biome14'].includes(node.biome?.id || ''),
			},
			progression: !!this.engine.content?.progression,
			liveProgression: !!this.engine.content?.progression && node.event?.id !== 'travel' &&
				adventure.postgame?.stage !== 'battle',
			difficulty: { tier: adventure.difficulty, floor: adventure.floor, version: adventure.difficultyRulesVersion || 1 },
			collapse: (adventure.difficultyRulesVersion || 1) >= 2 ? adventure.collapse?.slice() : undefined,
			opponentCount: opponentSets.length, opponentSlots: partition.opponentSlots,
			cooperative: { opponentOffset: partition.opponentOffset, singleOpponent: singleOpponent || undefined }, wild,
			boss: singleOpponent ? structuredClone(encounter.boss) : undefined,
			systems: {
				player: { mega: hostEffects.systems.mega, gmega: hostEffects.systems.gmega, z: hostEffects.systems.z },
				partner: { mega: guestEffects.systems.mega, gmega: guestEffects.systems.gmega, z: guestEffects.systems.z },
				opponent: { mega: encounter.boss?.kind === 'summit', gmega: false, z: false },
			},
			forcedTera: encounter.forcedTera,
			tera: { player: hostEffects.systems.tera, partner: guestEffects.systems.tera, opponent: !!encounter.forcedTera },
		};
		const lease = adventure.battleLease || token;
		const currentRoom = () => this.coop.ownsBattleRoom(session.id, token, lease);
		const room = this.ai().createRogueBattle(host, trainer, Teams.pack(hostTeam.map(mon => mon.set)), {
			cooperative: { name: guest.name, avatar: 'unknown', ally: Teams.pack(guestTeam.map(mon => mon.set)),
				foe: Teams.pack(secondOpponent), foeName: opponentName },
			getCoopController: () => this.coop.delegatedController(session.id),
			resumeCheckpoint: adventure.battleCheckpoint,
			onCheckpoint: checkpoint => { this.coop.saveBattleCheckpoint(session.id, token, lease, checkpoint); },
			onProgress: progress => {
				if (!currentRoom()) return;
				try {
					this.coop.handleBattleGrowth(session.id, token, lease, progress.sequence, progress.result);
				} catch (error) {
					Monitor.crashlog(error as Error, 'Cooperative battle growth');
					for (const user of [host, guest]) user.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
						session: session.id, growthError: true,
					})}`);
				}
			},
			state, floor: adventure.floor, boss: node.kind === 'boss', wild, optionalChallenge: !!node.challenge,
			onCapture: (captured, result) => { if (currentRoom()) this.coop.recordCapture(session.id, token, captured, result); },
			onResult: (result: RogueBattleResult) => { if (currentRoom()) this.coop.settleBattle(session.id, token, result); },
			onClose: () => { if (currentRoom()) this.coop.abortBattle(session.id, token); },
		}, { user: guest, team: Teams.pack(guestTeam.map(mon => mon.set)) });
		return room.roomid;
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
			pendingClearCount: (own?.pendingClear ? 1 : 0) + (own?.pendingClearQueue?.length || 0),
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
	crate(user: User) {
		try {
			this.authorize(user);
			if (!this.engine.content) throw new Error('开箱内容尚未配置。');
			return { userid: user.id, enabled: true,
				...crateView(this.settleCrates(user.id), this.engine.content) };
		} catch (error) {
			return { userid: user.id, enabled: false, message: (error as Error).message };
		}
	}
	private settleCrates(userid: string) {
		const account = this.engine.store.get(userid);
		if (!needsCupSettlement(account.crates)) return account;
		return this.engine.store.change(userid, current => {
			if (current.crates) settleDailyCup(current.crates);
		});
	}
	dailyReplay(user: User, target: string) {
		try {
			this.authorize(user);
			if (!/^\d{4}-\d{2}-\d{2}:[012]$/.test(target)) throw new Error('请选择有效的赛事录像。');
			const [day, match] = target.split(':');
			return { userid: user.id, target, enabled: true, ...dailyCupReplay(day, Number(match)) };
		} catch (error) {
			return { userid: user.id, target, enabled: false, message: (error as Error).message };
		}
	}
	state(user: User) {
		const common = {
			userid: user.id, protocolVersion: 1, codexSchema: ROGUE_CODEX_SCHEMA,
			contentVersion: codexContentVersion(), enabled: rogueAccess(user), continueOnly: this.engine.continueOnly,
			coopEnabled: rogueCoopAccess(user),
		};
		try { this.authorize(user); } catch (error) {
			return { ...common, message: (error as Error).message, account: null };
		}
		this.recoverMissingRoom(user.id);
		let account = this.engine.migrate(user.id);
		if (needsCupSettlement(account.crates)) account = this.settleCrates(user.id);
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
			// Older clients cannot render mainline replies or challenge controls. Detect
			// both route offers and saved challenges, before they become a blank screen.
			protocolVersion: account.mainlineDialogue || run?.node?.challenge ||
				run?.choices?.some(node => node.challenge) ? 2 : 1,
			storyEnabled: !!content?.story,
			beginnerGuide: needsOnboarding(account) ? BEGINNER_GUIDE : undefined,
			beginnerGuideVersion: BEGINNER_GUIDE_VERSION,
			moveCategoryHelp: moveCategoryHelp(), blessingSupplyHelp: BLESSING_SUPPLY_HELP,
			story: storyView(account, !!content?.story, this.engine.localSpirits),
			cards: account.cards?.map(clearCardView) || [], pendingClear: account.pendingClear && clearCardView(account.pendingClear),
			pendingClearCount: (account.pendingClear ? 1 : 0) + (account.pendingClearQueue?.length || 0),
			account: {
				monthlyChallenges: monthlyChallengeView(account),
				crates: crateSummary(account),
				echo: echoView(account, this.engine.localSpirits),
				needsOnboarding: !!content && needsOnboarding(account),
				revision: account.revision, points: account.points, boosts: account.boosts, slots: account.slots,
				boostRuleVersion: 2, unlockNotices: account.unlockNotices || [],
				mainline: { completed: account.mainline?.completed.length || 0, total: 22, endingSeen: !!account.mainline?.endingSeen },
				preferredDifficulty: preferredDifficulty(account, this.engine.localSpirits),
				preferredNuzlocke: !!account.preferredNuzlocke,
				difficultySettingsUnlocked: true,
				slotCost: rogueSlotCost(account.slots),
				statCosts: Object.fromEntries(Object.entries(account.boosts).map(([stat, value]) => [stat, rogueStatCost(value)])),
				captures: account.captures, unlocked: account.unlocked,
				spiritUnlocked: !!content?.spirits && (difficultySpiritUnlocked(account) || this.engine.localSpirits),
			},
			difficulties: ROGUE_DIFFICULTIES.map(tier => ({ id: tier, name: difficultyLabel(tier), text: difficultyDescription(tier), menuText: difficultyMenuDescription(tier),
				rewards: difficultyRewardDescription(tier),
				unlocked: tier === 'easy' || tier <= account.difficulties!.highest || this.engine.localSpirits,
				spirit: !!content?.spirits && difficultySpiritUnlocked(account, tier) })),
			collapseEntries: collapseEntries(run && run.phase !== 'complete' ? run.difficultyRulesVersion || 1 : 5),
			localSpirits: this.engine.localSpirits,
			selectableSpirits: content?.spirits ? activeRogueSpirits()
				.filter(spirit => canSelectSpirit(account, spirit.id, preferredDifficulty(account, this.engine.localSpirits) ?? 0))
				.map(spirit => ({ ...spirit, clearedTier: account.spiritClearTiers![spirit.id] })) : [],
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
				retryHealing: content ? retryHealingView(run, content) : undefined,
				growthPaused: !!run.battle?.growthPaused,
				nuzlocke: run.nuzlocke ? { dead: run.nuzlocke.dead,
					captureUsed: !!run.nuzlocke.encounters[String(Math.floor((run.floor - 1) / 10))] } : undefined,
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
				fusionArtwork: run.blessings?.owned.some(b => b.family === 'potara') ? fusionArtworkChoices(run.team) : [],
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
					reward: { ...run.node.reward, ...candyRewardPreview(run, run.node.reward),
						points: (run.difficulty === 'easy' ? 0 : run.postgame?.stage === 'battle' ? 20 : run.node.kind === 'boss' && !run.node.companionLoss ? 1 : 0) * (run.nuzlocke ? 2 : 1) },
				},
				rival: run.rival, rivalCompanion: rivalCompanionView(run), rivalCompanions: rivalCompanionViews(run),
				team: run.team.map(saved => {
					if (saved.egg) return { ...eggView(saved, run.floor), release: releaseView(run, saved),
						replacementRelease: releaseView(run, saved, run.pendingCapture ||
						run.blessings?.pending.find(reward => reward.kind === 'gift')?.pokemon) };
					const mon = structuredClone(saved);
					if (mon.fusion) mon.fusion.sprite = memberFusionSprite(saved);
					ensureMemberMemory(mon);
					if (!mon.stats) rebuildMember(mon, run.boosts);
					const species = Dex.mod('gen9fantasy').species.get(mon.set.species);
					const baseStats = { ...(mon.fusion?.baseStats || species.baseStats) };
					const robe = (['godrobe', 'puregodrobe'] as const).find(kind => robeMember(run.team, run.blessings, kind)?.id === saved.id);
					for (const [key, value] of Object.entries(mon.statModifiers?.baseStats || {})) baseStats[key as StatID] += value;
					return { ...mon, baseStats, fusionAbilities: fusionAbilities(saved, run), machineMoves: items.some(item => item.kind === 'machine') ? machineMoves(mon) : [],
						formOptions: formItemOptions(run, saved),
						release: releaseView(run, saved),
						replacementRelease: releaseView(run, saved, run.pendingCapture ||
						run.blessings?.pending.find(reward => reward.kind === 'gift')?.pokemon),
						universalOptions: universalOptions(run, saved),
						robeInfo: robe ? {name: robe === 'godrobe' ? '神衣鲜血' : '神衣纯洁', durability: robeDurability(mon.hp, mon.maxhp, !!run.blessings?.owned.find(b => b.family === robe)?.completed)} : undefined,
						abilityChanges: { abilitycapsule: abilityItemTarget(mon, 'abilitycapsule'), abilitypatch: abilityItemTarget(mon, 'abilitypatch') },
						extraAbilities: assignedExtraAbilities(saved, run.team, run.blessings).filter(id => id !== toID(mon.set.ability)),
						canReceiveSharpness: canGrantExtraAbility(saved, 'sharpness', run.team, run.blessings),
						types: blessingMemberTypes(mon), emblemBaseTypes: emblemBaseTypes(saved),
						fantasyForm: mon.fusion ? undefined : fantasyForm(mon.set.species),
						fantasyOptions: fantasyConversionOptions(mon),
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
	/** Acknowledge only persisted simulator progress; never trust browser snapshots. */
	private resumeGrowth(userid: ID) {
		const run = this.engine.store.get(userid).run;
		if (!run?.battle?.growthSequence || run.battle.retreatRequested || !run.battle.roomid) return;
		const room = Rooms.get(run.battle.roomid);
		if (!room?.battle || room.battle.ended) return;
		const updated = this.engine.store.change(userid, account => {
			const current = account.run!;
			current.battle!.growthPaused = !!current.pendingMoves?.length ||
				current.team.some(mon => mon.hp > 0 && mon.evolutionNotice);
			current.battle!.growthRevision = (current.battle!.growthRevision || 0) + 1;
			if (current.battle!.checkpoint) {
				current.battle!.checkpoint.team = structuredClone(current.team);
				current.battle!.checkpoint.bag = { ...current.bag };
			}
		}).run!;
		const failed = (error: unknown) => {
			Monitor.crashlog(error as Error, 'Rogue battle growth delivery');
			// Closing this room uses its existing onClose checkpoint recovery. A late failure
			// must never close a newer encounter or roll back its already committed progress.
			try {
				if (this.engine.store.get(userid).run?.battle?.token !== updated.battle!.token) return;
				room.destroy();
			} catch (recoveryError) {
				Monitor.crashlog(recoveryError as Error, 'Rogue battle growth recovery');
			}
		};
		try {
			void Promise.resolve(room.battle.stream.write(`>rogueprogress ${JSON.stringify({
				sequence: updated.battle!.growthSequence, revision: updated.battle!.growthRevision,
				team: updated.team, bag: updated.bag, paused: updated.battle!.growthPaused,
			})}`)).catch(failed);
		} catch (error) {
			failed(error);
		}
	}
	/** Never accepts a team, battle outcome, balance or capture count from the browser. */
	command(connection: Connection, command: RogueCommand) {
		const user = connection.user;
		this.authorize(user);
		this.recoverMissingRoom(user.id);
		const current = this.engine.store.get(user.id).run;
		const leaving = command.action === 'retreat' || command.action === 'rematch';
		const retreatRoom = leaving && current?.phase === 'battle' && current.battle?.roomid ?
			Rooms.get(current.battle.roomid)?.battle : undefined;
		if (leaving && current?.phase === 'battle') {
			if (!retreatRoom?.started || retreatRoom.ended || retreatRoom.p1.id !== user.id) {
				throw new Error('战斗尚未准备好或已经结束，请刷新后重试。');
			}
		}
		const previousRun = this.engine.store.get(user.id).run?.id;
		const account = this.engine.command(user.id, command, user.name);
		const run = account.run;
		if (current?.battle?.growthPaused && ['learn', 'evolve', 'evolutionnotice'].includes(command.action)) {
			this.resumeGrowth(user.id);
		}
		if (leaving && run?.battle?.retreatRequested && retreatRoom && !retreatRoom.p1.eliminated) {
			retreatRoom.forfeit(user, ' 逃跑了。');
		}
		if (command.action === 'start' && run && run.id !== previousRun && !run.announced) {
			this.engine.store.change(user.id, saved => { saved.run!.announced = true; });
			if (Config.fantasyrogue?.publicAccess) Rooms.get('lobby')?.add(`|raw|${Utils.escapeHTML(user.name)} 开启了幻想杯肉鸽之旅`).update();
		}
		if (['battle', 'shopchallenge', 'godchallenge', 'retryheal'].includes(command.action) &&
			run?.phase === 'battle' && run.battle && !run.battle.roomid) {
			const userid = user.id;
			const token = run.battle.token;
			const encounter = run.node!.encounters[run.encounter];
			const broadcast = () => user.send(`|queryresponse|fantasyrogue|${JSON.stringify(this.state(user))}`);
			try {
				const battleState = this.engine.battleState(userid);
				const opponentTeam = encounter.team.filter((_, i) => battleState.opponentSlots!.includes(i));
				if (!opponentTeam.length) throw new Error('本场对手已全部捕获，请刷新存档继续。');
				const partition = encounter.cooperative ?
					splitCoopOpponents(opponentTeam, battleState.opponentSlots) : undefined;
				if (battleState.cooperative && partition) {
					battleState.cooperative.opponentOffset = partition.opponentOffset;
					battleState.opponentSlots = partition.opponentSlots;
				}
				const room = this.ai().createRogueBattle(user, {
					id: `rogue-${encounter.trainer?.id || run.node!.id}`, name: encounter.name,
					avatar: rogueOpponentAvatar(run), description: '', format: encounter.cooperative ? ROGUE_COOP_FORMAT :
					run.doubleBattle ? ROGUE_DOUBLES_FORMAT : ROGUE_FORMAT,
					style: encounter.style, developmentOnly: false, packedTeam: Teams.pack(partition?.first || opponentTeam),
					keyMembers: [], resourcePreferences: [],
				}, Teams.pack(battleState.team.map(mon => mon.set)), {
					cooperative: encounter.cooperative && { name: encounter.cooperative.name, avatar: encounter.cooperative.id,
						ally: Teams.pack(encounter.cooperative.team), foe: Teams.pack(partition!.second), foeName: encounter.name },
					state: battleState, floor: run.floor, boss: run.node!.kind === 'boss', canRetreat: canRetreatRogue(run),
					doubleBattle: !!run.doubleBattle && !encounter.cooperative,
					optionalChallenge: !!run.node?.challenge,
					preview: run.preview?.stage === 'running' ? run.preview.trainer : undefined,
					wild: !encounter.trainer && run.node!.kind !== 'trainer' && encounter.boss?.kind !== 'summit',
					onCapture: (captured, result) => { this.engine.capture(userid, token, captured, result); },
					onNuzlocke: progress => { this.engine.nuzlockeProgress(userid, token, progress); },
					onProgress: progress => {
						this.engine.progressBattle(userid, token, progress.sequence, progress.result);
						this.resumeGrowth(userid);
						broadcast();
					},
					onResult: result => {
						const pending = this.engine.store.get(userid).run?.battle;
						if (pending?.token !== token) return;
						const previewing = this.engine.store.get(userid).run?.preview?.stage === 'running';
						this.engine.settle(userid, token, result, notices => {
							const battleRoom = pending.roomid && Rooms.get(pending.roomid);
							if (!battleRoom) return;
							for (const notice of notices) battleRoom.add(`|-roguegrowth|${JSON.stringify(notice)}`);
							battleRoom.update();
						});
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
	retreat(connection: Connection, roomid: string, action: 'retreat' | 'rematch' = 'retreat') {
		this.authorize(connection.user);
		const account = this.engine.store.get(connection.user.id);
		if (account.run?.phase !== 'battle' || account.run.battle?.roomid !== roomid) {
			throw new Error('只能从自己当前的肉鸽战斗逃跑。');
		}
		if (account.run.battle.retreatRequested) return;
		this.command(connection, { id: randomUUID(), revision: account.revision, action });
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
