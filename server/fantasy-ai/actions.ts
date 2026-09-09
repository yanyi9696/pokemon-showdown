import type { ChoiceRequest } from '../../sim/side';
import { toID } from '../../sim/dex';
import type { SeenSide } from './memory';

/** Fantasy Aura consumes the team's Z opportunity; native Necrozma Ultra Burst does not. */
export function hasUltraBurstResource(resources: SeenSide['resources'] | undefined, item: string): boolean {
	return !resources?.aura && (!resources?.zmove || toID(item) === 'ultranecroziumz');
}

/**
 * Enumerate singles candidates from the AI's own request and public resource use. Unknown
 * trapping/disable information can still cause the engine to reject a choice;
 * the controller must handle its updated request, as a human client does.
 */
export function enumerateRequestChoices(request: ChoiceRequest, resources?: SeenSide['resources']): string[] {
	if (request.wait) return [];
	const pokemon = request.side.pokemon;
	if (pokemon.length !== 6) throw new Error('AI 行动枚举只支持六只宝可梦的队伍。');
	if (request.teamPreview) {
		if (request.maxChosenTeamSize !== undefined && request.maxChosenTeamSize !== 6) {
			throw new Error('AI 不支持选出部分队伍的赛制。');
		}
		const orders: string[] = [];
		const visit = (prefix: string, remaining: number[]) => {
			if (!remaining.length) {
				orders.push(`team ${prefix}`);
				return;
			}
			for (const slot of remaining) visit(`${prefix}${slot}`, remaining.filter(other => other !== slot));
		};
		visit('', [1, 2, 3, 4, 5, 6]);
		return orders;
	}
	const fainted = (condition: string) => condition === '0 fnt' || condition.endsWith(' fnt');
	if (request.forceSwitch) {
		if (request.forceSwitch.length !== 1) throw new Error('AI 不支持多人或双打换人请求。');
		if (!request.forceSwitch[0]) return ['pass'];
		return pokemon.flatMap((mon, index) => (
			!mon.active && fainted(mon.condition) === !!pokemon[0].reviving ? [`switch ${index + 1}`] : []
		));
	}
	if (request.active.length !== 1) throw new Error('AI 不支持多人或双打行动请求。');
	const active = request.active[0];
	if (active.canDynamax || active.maxMoves) throw new Error('首版 FC AI 不支持极巨化。');
	const choices: string[] = [];
	const events: string[] = [''];
	if (active.canMegaEvo && !resources?.mega) events.push('mega');
	if (active.canMegaEvoX && !resources?.mega) events.push('megax');
	if (active.canMegaEvoY && !resources?.mega) events.push('megay');
	// Fantasy Aura Burst uses the existing `ultra` choice protocol.
	// The native flag may still be cached after a Z move. Public resource use is authoritative.
	const item = pokemon.find(mon => mon.active)?.item || '';
	if (active.canUltraBurst && hasUltraBurstResource(resources, item)) events.push('ultra');
	if (active.canTerastallize && !resources?.tera) events.push('terastallize');
	for (const [index, move] of active.moves.entries()) {
		const pp = (move as typeof move & { pp?: number }).pp;
		if (!move.disabled && pp !== 0) {
			for (const event of events) choices.push(`move ${index + 1}${event ? ` ${event}` : ''}`);
		}
		if (active.canZMove?.[index] && !resources?.zmove && !resources?.aura) choices.push(`move ${index + 1} zmove`);
	}
	if (!active.trapped) {
		for (const [index, mon] of pokemon.entries()) {
			if (!mon.active && !fainted(mon.condition)) choices.push(`switch ${index + 1}`);
		}
	}
	return choices;
}
