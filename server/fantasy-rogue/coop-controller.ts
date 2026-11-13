import type { RoomBattle } from '../room-battle';
import type { ChoiceRequest } from '../../sim/side';
import { extractChannelMessages } from '../../sim/battle';
import { Dex } from '../../sim/dex';
import { enumerateDoublesChoices } from '../fantasy-ai/doubles-actions';
import { prepareMultiChoices, prepareSingleOpponentChoices, rankMultiChoices,
	type MultiScoredChoice } from '../fantasy-ai/multi-policy';
import { rankDoublesChoices } from '../fantasy-ai/doubles-policy';
import type { SearchDecision } from '../fantasy-ai/rollout';
import { rogueBossChoice } from '../../sim/rogue-bosses';
import { isCoopBossState } from '../../sim/rogue-coop-boss';

interface VisibleMon { species: string; hp: number; status?: string }
const dex = Dex.mod('gen9fantasy');
const hpRatio = (condition: string) => {
	const [hp, max] = condition.split(' ')[0].split('/').map(Number);
	return condition.includes('fnt') ? 0 : max ? hp / max : hp ? 1 : 0;
};
/** NPC enemies jointly use their own requests and the spectator log. The optional NPC human ally
 * uses its own request only. Neither path reads human requests/choices or the simulator instance.
 */
export class RogueCoopController {
	private visible: Partial<Record<SideID, VisibleMon>> = {};
	private closed = false;
	private rejected = new Map<SideID, Set<string>>();
	private publicLog: string[] = [];
	private latest = new Map<SideID, ChoiceRequest>();
	private pending = new Map<SideID, { request: ChoiceRequest, rqid: number }>();
	private revision = 0;
	private inFlight?: number;
	private lastBatchRqid = 0;
	private readonly schedulerRoomId: string;
	lastDecision?: { elapsedMs: number, candidates: number, joint: boolean, reasons: string[], error?: string,
		mechanics?: { probes: number, failures: string[], omittedVolatiles: string[] },
		workerStatus?: string,
		nativeTurns?: boolean,
	};
	private battle: RoomBattle;
	constructor(battle: RoomBattle) { this.battle = battle; this.schedulerRoomId = battle.roomid; }
	update(packet: string) {
		for (const line of extractChannelMessages(packet, [0])[0]) {
			this.publicLog.push(line);
			const [, type, ident, value] = line.split('|'), slot = ident?.slice(0, 2) as SideID;
			if (!['p1', 'p2', 'p3', 'p4'].includes(slot)) continue;
			if (['switch', 'drag', 'replace'].includes(type)) {
				const condition = line.split('|')[4], previous = this.visible[slot];
				this.visible[slot] = { species: value.split(',')[0],
					hp: condition ? hpRatio(condition) : previous?.hp ?? 1,
					status: condition ? condition.split(' ')[1] : type === 'replace' ? previous?.status : undefined };
			}
			if (['-damage', '-heal'].includes(type) && this.visible[slot]) this.visible[slot].hp = hpRatio(value);
			if (type === 'faint' && this.visible[slot]) this.visible[slot].hp = 0;
			if (type === '-status' && this.visible[slot]) this.visible[slot].status = value;
			if (type === '-curestatus' && this.visible[slot]) delete this.visible[slot].status;
		}
	}
	request(slot: SideID, request: ChoiceRequest, rqid: number, retry = false) {
		if (this.closed || slot === 'p1' || !this.battle[slot].isAI) return;
		const tracker = this.battle[slot].request;
		if (tracker.rqid !== rqid) return;
		this.revision++;
		if (this.inFlight !== undefined) {
			const options = this.battle.options.fantasyAI;
			options?.scheduler.cancel(this.schedulerRoomId, options.instanceId);
			this.inFlight = undefined;
		}
		this.pending.delete(slot);
		if (request.wait) return;
		if (!retry) this.rejected.delete(slot);
		const copy = JSON.parse(JSON.stringify(request)) as ChoiceRequest;
		this.latest.set(slot, copy);
		if (tracker.isWait !== false) return;
		this.pending.set(slot, { request: copy, rqid });
	}
	/** Called after the entire simulator update batch, not midway through its seat requests. */
	flush() {
		if (this.closed || this.battle.ended || !this.pending.size || this.inFlight === this.revision) return;
		const pending = [...this.pending].filter(([slot, entry]) => {
			const tracker = this.battle[slot].request;
			return tracker.rqid === entry.rqid && tracker.isWait === false;
		});
		if (!pending.length) return;
		const start = Date.now(), seats = ['p2', 'p4'] as const;
		const revision = this.revision;
		const commit = (commands?: Partial<Record<SideID, string>>) => {
			if (this.closed || this.battle.ended || this.revision !== revision) return;
			this.inFlight = undefined;
			if (pending.some(([slot, entry]) => this.pending.get(slot) !== entry ||
				this.battle[slot].request.rqid !== entry.rqid || this.battle[slot].request.isWait !== false)) return;
			const writes: string[] = [];
			for (const [slot, { request }] of pending) {
				const choice = commands?.[slot] || this.fallback(slot, request);
				const tracker = this.battle[slot].request;
				this.pending.delete(slot);
				tracker.isWait = true;
				tracker.choice = choice;
				writes.push(`>${slot} ${choice}`);
			}
			// Mark every seat before writing: synchronous simulator replies cannot submit a seat twice.
			const failed = (error: unknown) => {
				Monitor.crashlog(error as Error, 'Rogue co-op choice delivery');
				if (this.closed || this.battle.ended || this.revision !== revision) return;
				try {
					this.finish();
					// onClose restores the shared checkpoint instead of leaving both players waiting.
					this.battle.room.destroy();
				} catch (recoveryError) {
					Monitor.crashlog(recoveryError as Error, 'Rogue co-op choice recovery');
				}
			};
			try {
				void Promise.resolve(this.battle.stream.write(writes.join('\n'))).catch(failed);
			} catch (writeError) {
				failed(writeError);
			}
		};
		let scored: MultiScoredChoice[] = [];
		let error: string | undefined;
		const singleBoss = isCoopBossState(this.battle.format, this.battle.options.fantasyRogue?.state);
		if ((singleBoss && this.latest.has('p2') || seats.every(seat => this.latest.has(seat))) &&
			pending.some(([slot]) => slot === 'p2' || slot === 'p4')) {
			const fixed: Partial<Record<'p2' | 'p4', string | null>> = {};
			for (const seat of seats) {
				if (!pending.some(([slot]) => slot === seat)) fixed[seat] = this.battle[seat].request.choice || null;
			}
			try {
				const ai = this.battle.options.fantasyAI;
				const options = { fixed, excluded: { p2: this.rejected.get('p2'), p4: this.rejected.get('p4') },
					allowSwitch: !singleBoss && !this.battle.options.fantasyRogue?.wild };
				const requests = { p2: this.latest.get('p2')!, p4: this.latest.get('p4')! };
				const prepared = singleBoss ? prepareSingleOpponentChoices(requests.p2, this.publicLog, this.rejected.get('p2')) :
					prepareMultiChoices(requests, this.publicLog, options);
				if (ai) {
					if (prepared?.candidates.length) {
						const preferred = new Map(pending.map(([seat, entry]) => [seat, this.fallback(seat, entry.request)]));
						const fallbackChoice = [...prepared.commands].find(([, commands]) =>
							seats.every(seat => !preferred.has(seat) || commands[seat] === preferred.get(seat)))?.[0];
						this.inFlight = revision;
						// Native seat request IDs differ. Retrying the earlier seat must not look older
						// than the prior joint batch; the revision and per-seat commit checks identify it.
						this.lastBatchRqid = Math.max(this.lastBatchRqid, ...pending.map(([, entry]) => entry.rqid));
						const done = (decision: SearchDecision | null, status: string) => {
							if (this.closed || this.revision !== revision || status === 'cancelled') return;
							this.lastDecision = { elapsedMs: Date.now() - start,
								candidates: decision?.doubles?.candidates || 0, joint: !!decision?.doubles?.candidates,
								reasons: decision?.candidates[0]?.reasons || ['native-fallback'],
								mechanics: decision?.doubles?.mechanics, workerStatus: status,
								nativeTurns: !!decision?.doubles?.jointTurn };
							commit(decision?.choice ? prepared.commands.get(decision.choice) : undefined);
						};
						void ai.scheduler.submit({
							key: { roomId: this.schedulerRoomId, instanceId: ai.instanceId,
								rqid: this.lastBatchRqid, revision },
							trainer: ai.trainer, observation: prepared.observation, seed: 'gen5,0001000200030004',
							doubles: { allowSwitch: options.allowSwitch, jointTurns: !this.battle.options.fantasyRogue?.wild,
								candidates: prepared.candidates },
							budgetMs: 1500, wallClockMs: 4500, fallbackChoice,
						}).then(result => done(result.decision, result.status)).catch(() => done(null, 'worker-error'));
						return;
					}
					commit();
					return;
				}
				// Pure fixture/adaptor callers without a room scheduler keep the synchronous entry point.
				if (singleBoss) {
					scored = prepared ? rankDoublesChoices(prepared.observation, 'gen9fantasy', [], false,
						prepared.candidates, true).map(entry => ({ ...entry, commands: prepared.commands.get(entry.choice)! })) : [];
				} else {
					scored = rankMultiChoices(requests, this.publicLog, 'gen9fantasy', options);
				}
			} catch {
				// Keep a diagnostic without serializing any battle/request data; legal fallback stays available.
				error = 'joint-policy-error';
			}
		}
		this.lastDecision = { elapsedMs: Date.now() - start, candidates: scored.length,
			joint: !!scored.length, reasons: scored[0]?.reasons || ['native-fallback'],
			mechanics: scored[0]?.mechanics, ...(error ? { error } : {}) };
		commit(scored[0]?.commands);
	}
	private fallback(slot: SideID, request: ChoiceRequest) {
		const boss = slot === 'p2' && isCoopBossState(this.battle.format, this.battle.options.fantasyRogue?.state);
		const ordered = boss && rogueBossChoice(request);
		if (ordered) return ordered;
		const foes: SideID[] = slot === 'p3' ? ['p2', 'p4'] : ['p1', 'p3'];
		const partner = slot === 'p3' ? 'p1' : slot === 'p2' ? 'p4' : 'p2';
		const native = enumerateDoublesChoices(request, { mod: 'gen9fantasy',
			allowSwitch: !boss && (slot === 'p3' || !this.battle.options.fantasyRogue?.wild),
			foes: foes.flatMap((seat, index) => this.visible[seat]?.hp === 0 ? [] : [index + 1]),
			allyAlive: !boss && this.visible[partner]?.hp !== 0 });
		const choices = native.filter(entry => !this.rejected.get(slot)?.has(entry.choice));
		const preferred = this.choose(slot, request);
		return choices.find(entry => entry.choice === preferred)?.choice || choices[0]?.choice || 'default';
	}
	choose(slot: SideID, request: ChoiceRequest): string {
		const rejected = this.rejected.get(slot) || new Set();
		if (request.wait) return 'default';
		if (request.teamPreview) return 'team ' + request.side.pokemon.map((_, i) => i + 1).join('');
		const options: { choice: string, value: number }[] = [];
		if (request.forceSwitch) {
			request.side.pokemon.forEach((mon, i) => { if (!mon.active && hpRatio(mon.condition) > 0) options.push({ choice: `switch ${i + 1}`, value: hpRatio(mon.condition) }); });
		} else {
			const active = request.active[0], own = request.side.pokemon.find(p => p.active), foes: SideID[] = slot === 'p3' ? ['p2', 'p4'] : ['p1', 'p3'];
			if (!active || !own) return 'default';
			const species = dex.species.get(own.details.split(',')[0]);
			for (const [index, available] of active.moves.entries()) {
				if (available.disabled) continue;
				const move = dex.moves.get(available.id), target = available.target || move.target;
				const directed = ['normal', 'any', 'adjacentFoe', 'adjacentAlly', 'adjacentAllyOrSelf'].includes(target);
				for (const [i, foe] of (directed ? foes : [foes[0]]).entries()) {
					const opponent = this.visible[foe]; if (directed && opponent?.hp === 0) continue;
					let value = move.basePower || (move.damage ? 65 : 0);
					if (move.category !== 'Status') {
						value *= species.types.includes(move.type) ? 1.5 : 1;
						if (opponent) { const defender = dex.species.get(opponent.species); value *= dex.getImmunity(move.type, defender) ? 2 ** dex.getEffectiveness(move.type, defender) : 0; }
						value *= move.accuracy === true ? 1 : move.accuracy / 100;
						if (move.category === 'Physical') value *= (own.stats.atk || 100) / Math.max(1, own.stats.spa || 100);
						if (target === 'allAdjacent') value *= 0.55; // Avoid carelessly hitting the independent ally.
						if (target === 'allAdjacentFoes') value *= 1.35;
						if (move.priority > 0 && opponent && opponent.hp < 0.25) value *= 1.5;
					} else if (move.heal) value = hpRatio(own.condition) < 0.45 ? 140 : 0;
					else if (move.status) value = opponent?.status ? 0 : 42;
					else if (move.boosts) value = hpRatio(own.condition) > 0.7 ? 55 : 10;
					else value = 8;
					const backSeat = slot === 'p3' || slot === 'p4';
					const loc = target === 'adjacentAlly' ? backSeat ? -1 : -2 : target === 'adjacentAllyOrSelf' ? backSeat ? -2 : -1 : i + 1;
					const transform = active.canMegaEvo ? ' mega' : active.canTerastallize ? ' terastallize' : '';
					options.push({ choice: `move ${index + 1}${directed ? ` ${loc}` : ''}${transform}`, value });
				}
			}
			// When all available attacks are ineffective, a healthy reserve may offer a better matchup.
			if (!active.trapped && !(slot !== 'p3' && this.battle.options.fantasyRogue?.wild) && Math.max(0, ...options.map(o => o.value)) < 20) {
				request.side.pokemon.forEach((mon, i) => { if (!mon.active && hpRatio(mon.condition) > 0) options.push({ choice: `switch ${i + 1}`, value: 30 + hpRatio(mon.condition) * 5 }); });
			}
		}
		return options.sort((a, b) => b.value - a.value).find(o => !rejected.has(o.choice))?.choice || 'default';
	}
	invalidChoice(slot: SideID) {
		const tracker = this.battle[slot].request;
		if (!this.rejected.has(slot)) this.rejected.set(slot, new Set());
		if (tracker.choice) this.rejected.get(slot)!.add(tracker.choice);
		tracker.isWait = false; tracker.choice = '';
		if (tracker.request) this.request(slot, JSON.parse(tracker.request), tracker.rqid, true);
	}
	finish() {
		this.closed = true;
		const options = this.battle.options.fantasyAI;
		options?.scheduler.cancel(this.schedulerRoomId, options.instanceId);
		this.inFlight = undefined;
		this.pending.clear();
		this.latest.clear();
		this.publicLog = [];
	}
}
