import { randomUUID } from 'crypto';
import { Teams } from '../../sim/teams';
import { Dex } from '../../sim/dex';
import { ROGUE_DUEL_FORMAT, ROGUE_STATS, type RogueBattleState } from '../../sim/fantasy-rogue';
import { roguePartyLimit, rogueSpirit } from '../../sim/fantasy-rogue-spirits';
import { rogueRulesVersion, type RogueClearCard } from './legacy';
import { rebuildMember } from './progression';
import type { RogueStore } from './store';

function requireRule(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
export function buildRogueDuelState(a: RogueClearCard, b: RogueClearCard): RogueBattleState {
	requireRule(a.version === 1 && b.version === 1 && a.rulesVersion === rogueRulesVersion() &&
		b.rulesVersion === rogueRulesVersion(), '这张通关卡的对战规则版本已变化，仍可展示，但暂不能复现约战。');
	requireRule(a.owner !== b.owner, '不能与自己的通关卡对战。');
	const spirit = a.snapshot.spirit;
	requireRule(spirit === b.snapshot.spirit, '只能使用相同塔灵的通关卡互战，无塔灵单独成组。');
	requireRule(!spirit || rogueSpirit(spirit)?.enabled, '这张通关卡的塔灵尚不支持约战。');
	const snapshots = [a, b].map(card => {
		const snap = structuredClone(card.snapshot);
		requireRule(!snap.blessings.length || snap.blessingEffects, '这张卡缺少可复现的祝福记录。');
		requireRule(snap.team.length > 0 && snap.team.length <= roguePartyLimit(spirit), '通关卡的队伍数量无效。');
		for (const mon of snap.team) {
			const expected = { ...mon.stats };
			rebuildMember(mon, snap.boosts);
			requireRule(ROGUE_STATS.every(stat => mon.stats?.[stat] === expected[stat]), '通关卡最终数值与当前规则不一致，不能忽略差异开战。');
			mon.hp = mon.maxhp;
			mon.status = '';
			mon.statusState = {};
			delete mon.statuses;
			for (const move of [...mon.pp, ...(mon.moveMemory || []), ...(mon.blessingPP || [])]) {
				move.pp = move.maxpp = Dex.mod('gen9fantasy').moves.get(move.id).pp;
			}
		}
		return snap;
	});
	return {
		encounterId: `duel:${a.id}:${b.id}`, team: snapshots[0].team, boosts: snapshots[0].boosts,
		blessings: snapshots[0].blessingEffects,
		eventBuff: snapshots[0].eventBuff,
		duel: { team: snapshots[1].team, boosts: snapshots[1].boosts,
			hazards: snapshots[1].hazards, money: snapshots[1].money, blessings: snapshots[1].blessingEffects, eventBuff: snapshots[1].eventBuff },
		bag: {}, balls: [], catchable: false,
		systems: { player: { mega: !!snapshots[0].megaUnlocked, gmega: !!snapshots[0].gmegaUnlocked, z: !!snapshots[0].zUnlocked },
			opponent: { mega: !!snapshots[1].megaUnlocked, gmega: !!snapshots[1].gmegaUnlocked, z: !!snapshots[1].zUnlocked } },
		tera: { player: !!snapshots[0].teraUnlocked, opponent: !!snapshots[1].teraUnlocked },
		spirit: spirit ? { id: spirit, floor: 200, hazards: snapshots[0].hazards, money: snapshots[0].money } : undefined,
	};
}
interface Invitation {
	id: string; from: string; to: string; fromName: string; toName: string;
	fromCard: string; toCard: string; expires: number;
}
export interface DuelCommand {
	action: 'challenge' | 'accept' | 'decline' | 'cancel';
	id?: string;
	card?: string;
	target?: string;
}
export class RogueDuels {
	private invitations = new Map<string, Invitation>();
	private cooldowns = new Map<string, number>();
	private accepted = new Map<string, { to: string, roomid: string, expires: number }>();
	private readonly store: RogueStore;
	constructor(store: RogueStore) { this.store = store; }
	private prune() {
		const now = Date.now();
		for (const [id, entry] of this.invitations) if (entry.expires <= now) this.invitations.delete(id);
		for (const [id, entry] of this.accepted) if (entry.expires <= now) this.accepted.delete(id);
		for (const [id, until] of this.cooldowns) if (until <= now) this.cooldowns.delete(id);
	}
	list(userid: string) {
		this.prune();
		return [...this.invitations.values()].filter(invite => invite.from === userid || invite.to === userid);
	}
	private available(user: User) {
		requireRule(user.connected && user.named, '对方已离线。');
		requireRule(![...user.games].some(id => Rooms.get(id)?.battle && !Rooms.get(id)!.battle!.ended), '玩家正在对战中，请结束后再约战。');
	}
	private card(id: string | undefined, owner?: string) {
		requireRule(typeof id === 'string' && id.length <= 80, '通关卡标识无效。');
		const card = this.store.card(id);
		requireRule(card && card.public && (!owner || card.owner === owner), '通关卡不存在、未公开或不属于当前玩家。');
		return card;
	}
	command(user: User, command: DuelCommand) {
		this.prune();
		if (command.action === 'challenge') {
			this.available(user);
			const own = this.card(command.card, user.id), target = this.card(command.target);
			buildRogueDuelState(own, target);
			const other = Users.get(target.owner);
			requireRule(other, '对方目前不在线。');
			requireRule(!other.settings.blockChallenges || user.can('bypassblocks', other), '对方当前不接受约战。');
			this.available(other);
			const existing = this.list(user.id).find(invite =>
				invite.from === user.id && invite.toCard === target.id && invite.fromCard === own.id);
			if (existing) return { invitation: existing.id };
			requireRule(!this.cooldowns.has(user.id), '请稍后再发送约战。');
			requireRule(!this.list(user.id).some(invite => invite.from === user.id), '请先取消上一份约战。');
			requireRule(this.list(other.id).filter(invite => invite.to === other.id).length < 3, '对方待处理的约战较多，请稍后再试。');
			const invitation: Invitation = { id: randomUUID(), from: user.id, to: other.id,
				fromName: user.name, toName: other.name, fromCard: own.id, toCard: target.id, expires: Date.now() + 300000 };
			this.invitations.set(invitation.id, invitation);
			this.cooldowns.set(user.id, Date.now() + 10000);
			other.popup(`${user.name} 邀请你使用肉鸽通关卡约战。请打开“幻想杯肉鸽 → 通关卡展示”查看和接受，邀请五分钟内有效。`);
			other.send(`|queryresponse|fantasyrogueduelnotice|${JSON.stringify({ invitation: invitation.id })}`);
			return { invitation: invitation.id };
		}
		requireRule(typeof command.id === 'string', '约战标识无效。');
		const done = this.accepted.get(command.id);
		if (done && command.action === 'accept') {
			requireRule(done.to === user.id, '不能处理别人的约战。');
			return { roomid: done.roomid };
		}
		const invite = this.invitations.get(command.id);
		requireRule(invite, '约战已过期或已处理。');
		if (command.action === 'decline' || command.action === 'cancel') {
			requireRule(command.action === 'decline' ? invite.to === user.id : invite.from === user.id, '不能处理别人的约战。');
			this.invitations.delete(invite.id);
			return {};
		}
		requireRule(command.action === 'accept' && invite.to === user.id, '不能处理别人的约战。');
		const challenger = Users.get(invite.from);
		requireRule(challenger, '邀请方目前不在线。');
		this.available(user); this.available(challenger);
		const a = this.card(invite.fromCard, challenger.id);
		this.card(invite.toCard, user.id);
		const b = this.card(command.card || invite.toCard, user.id);
		const state = buildRogueDuelState(a, b);
		const room = Rooms.createBattle({ format: ROGUE_DUEL_FORMAT, rated: false, allowRenames: false,
			fantasyRogueDuel: state, players: [
				{ user: challenger, team: Teams.pack(state.team.map(mon => mon.set)) },
				{ user, team: Teams.pack(state.duel!.team.map(mon => mon.set)) },
			] });
		requireRule(room, '当前服务器暂不能创建对战，请稍后重试。');
		this.invitations.delete(invite.id);
		this.accepted.set(invite.id, { to: user.id, roomid: room.roomid, expires: Date.now() + 300000 });
		return { roomid: room.roomid };
	}
}
