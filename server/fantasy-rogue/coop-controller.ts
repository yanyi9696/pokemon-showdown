import type { RoomBattle } from '../room-battle';
import type { ChoiceRequest } from '../../sim/side';
import { extractChannelMessages } from '../../sim/battle';
import { Dex } from '../../sim/dex';

interface VisibleMon { species: string; hp: number; status?: string }
const dex = Dex.mod('gen9fantasy');
const hpRatio = (condition: string) => {
	const [hp, max] = condition.split(' ')[0].split('/').map(Number);
	return condition.includes('fnt') ? 0 : max ? hp / max : hp ? 1 : 0;
};
/** Four native seats: each AI receives only its own request and the spectator log.
 * It never reads p1's selected move, enemy private sets, or the simulator instance.
 */
export class RogueCoopController {
	private visible: Partial<Record<SideID, VisibleMon>> = {};
	private closed = false;
	private rejected = new Map<SideID, Set<string>>();
	constructor(private battle: RoomBattle) {}
	update(packet: string) {
		for (const line of extractChannelMessages(packet, [0])[0]) {
			const [, type, ident, value] = line.split('|'), slot = ident?.slice(0, 2) as SideID;
			if (!['p1', 'p2', 'p3', 'p4'].includes(slot)) continue;
			if (['switch', 'drag', 'replace'].includes(type)) this.visible[slot] = { species: value.split(',')[0], hp: hpRatio(line.split('|')[4]) };
			if (['-damage', '-heal'].includes(type) && this.visible[slot]) this.visible[slot]!.hp = hpRatio(value);
			if (type === 'faint' && this.visible[slot]) this.visible[slot]!.hp = 0;
			if (type === '-status' && this.visible[slot]) this.visible[slot]!.status = value;
			if (type === '-curestatus' && this.visible[slot]) delete this.visible[slot]!.status;
		}
	}
	request(slot: SideID, request: ChoiceRequest, rqid: number, retry = false) {
		if (this.closed || slot === 'p1' || request.wait) return;
		if (!retry) this.rejected.delete(slot);
		const tracker = this.battle[slot].request;
		if (tracker.rqid !== rqid || tracker.isWait !== false) return;
		const choice = this.choose(slot, request);
		tracker.isWait = true; tracker.choice = choice;
		void this.battle.stream.write(`>${slot} ${choice}`);
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
	finish() { this.closed = true; }
}
