import { Battle } from '../../sim/battle';
import { toID } from '../../sim/dex';
import type { PRNGSeed } from '../../sim/prng';
import type { SinglesSide } from './memory';
import type { WorldHypothesis } from './world';
import { FANTASY_VOLATILES, restoreDelayedHealing, restoreFantasyState } from './fantasy-state';
import { hasUltraBurstResource } from './actions';
import { trickRoomTurns } from './trick-room';

const VOLATILES = new Set([
	'confusion', 'taunt', 'torment', 'healblock', 'ingrain', 'aquaring', 'magnetrise', 'telekinesis',
	'focusenergy', 'substitute', 'leechseed', 'encore', 'disable', 'yawn', 'nightmare', 'curse',
	'embargo', 'perishsong', 'perish0', 'perish1', 'perish2', 'perish3', 'gastroacid', 'smackdown',
	'roost', 'auraburstatk', 'auraburstdef', 'auraburstspa', 'auraburstspd', 'auraburstspe', 'auraburstall',
	'saltcure', 'destinybond', 'gemdefensepermanentboost',
	...FANTASY_VOLATILES,
	'flashfire', 'charge', 'imprison',
]);

/** Data-only world -> new Fantasy Battle. No real Battle can be passed to this boundary. */
export function reconstructWorld(world: WorldHypothesis, seed: PRNGSeed): Battle {
	const battle = new Battle({
		formatid: toID(world.format), seed, deserialized: true, strictChoices: false,
		p1: { name: 'Hypothesis P1', team: structuredClone(world.teams.p1.map(mon => mon.set)) },
		p2: { name: 'Hypothesis P2', team: structuredClone(world.teams.p2.map(mon => mon.set)) },
	});
	try {
		battle.p1.foe = battle.p2;
		battle.p2.foe = battle.p1;
		battle.started = true;
		battle.turn = world.turn;
		battle.format.onBegin?.call(battle);
		for (const rule of battle.ruleTable.keys()) {
			if (!'+*-!'.includes(rule.charAt(0))) battle.dex.formats.get(rule).onBegin?.call(battle);
		}
		for (const side of battle.sides) {
			const sideID = side.id as SinglesSide;
			const resources = world.memory.sides[sideID].resources;
			side.active[0] = side.pokemon[0];
			side.zMoveUsed = resources.zmove || resources.aura;
			for (const [index, member] of world.teams[sideID].entries()) {
				const mon = side.pokemon[index];
				const { profile, seen } = member;
				const species = battle.dex.species.get(profile.species);
				if (mon.species.id !== species.id) {
					mon.setSpecies(species);
					if (species.isMega || species.isPrimal || seen?.volatiles.some(id => id.startsWith('auraburst'))) {
						mon.baseSpecies = species;
						mon.baseAbility = toID(species.abilities['0']);
					}
				}
				if (member.exactStats) {
					const hp = sideID === world.ownSide && profile.health.upper === 0 ? mon.baseStoredStats.hp : profile.stats.hp;
					mon.baseStoredStats = { ...profile.stats, hp };
					for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as const) mon.storedStats[stat] = profile.stats[stat];
				}
				mon.baseMaxhp = mon.maxhp = mon.baseStoredStats.hp;
				const fraction = sideID === world.ownSide || !world.variant ? profile.health.upper :
					(profile.health.lower + profile.health.upper) / 2;
				mon.hp = profile.health.upper === 0 ? 0 : Math.max(1, Math.ceil(fraction * mon.maxhp));
				mon.fainted = !mon.hp;
				mon.status = (mon.fainted ? 'fnt' : profile.status) as ID;
				mon.statusState = battle.initEffectState({ id: mon.status, target: mon });
				if (mon.status === 'slp') {
					mon.statusState.time = profile.item === 'fantasylifeorb' ? Math.max(1, 4 - (seen?.statusActions || 0)) :
						1 + Math.min(world.variant * 2, Math.max(0, 3 - (seen?.statusActivations || 0)));
					mon.statusState.startTime = mon.statusState.time + (seen?.statusActivations || 0);
				}
				if (mon.status === 'tox') {
					const elapsed = Math.max(0, world.turn - Math.max(seen?.statusTurn ?? world.turn, seen?.enteredTurn ?? world.turn));
					mon.statusState.stage = Math.min(15,
						world.variant ? Math.max(seen?.statusTicks || 0, elapsed) : seen?.statusTicks || 0);
				}
				Object.assign(mon.boosts, profile.boosts);
				mon.ability = toID(profile.ability);
				mon.abilityState = battle.initEffectState({ id: mon.ability, target: mon });
				mon.item = toID(profile.item);
				mon.itemState = battle.initEffectState({ id: mon.item, target: mon });
				if (profile.types?.length) mon.setType(profile.types, true);
				mon.terastallized = profile.terastallized || '';
				mon.teraType = profile.teraType;
				mon.isActive = mon.isStarted = index === 0 && !mon.fainted;
				mon.activeTurns = index === 0 ? Math.max(1, world.turn - (seen?.enteredTurn ?? world.turn - 1)) : 0;
				mon.activeMoveActions = seen?.activeMoveActions || 0;
				if (seen?.lastMove) mon.lastMove = battle.dex.getActiveMove(seen.lastMove);
				mon.m.fantasyVisualsInitialized = index === 0 || !!seen;
				mon.m.lastVisualShown = member.disguise ? `illusion_${toID(member.disguise)}` : mon.species.id;
				restoreFantasyState(battle, mon, profile, seen);
				if (resources.mega) mon.canMegaEvo = mon.canMegaEvoX = mon.canMegaEvoY = null;
				if (!hasUltraBurstResource(resources, mon.item)) mon.canUltraBurst = null;
				if (resources.tera || mon.terastallized) mon.canTerastallize = null;
				for (const slot of mon.moveSlots) {
					const request = member.request?.moves.find(move => move.id === slot.id) as
						{ pp?: number, disabled?: boolean | string, disabledSource?: string } | undefined;
					slot.pp = request?.pp ?? Math.max(0, slot.maxpp - (seen?.moveUses[slot.id] || 0));
					if (member.request?.moves[0]?.id === 'struggle') slot.pp = 0;
					if (request?.disabled) { slot.disabled = true; slot.disabledSource = request.disabledSource || ''; }
				}
				mon.details = mon.getUpdatedDetails();
			}
			side.pokemonLeft = side.pokemon.filter(mon => !mon.fainted).length;
			side.totalFainted = world.publicLog.filter(line => line.startsWith(`|faint|${sideID}`)).length;
		}
		for (const side of battle.sides) {
			const sideID = side.id as SinglesSide;
			for (const [index, member] of world.teams[sideID].entries()) {
				const mon = side.pokemon[index];
				if (member.disguise) {
					mon.illusion = side.pokemon.find(other => other !== mon && other.species.id === toID(member.disguise)) || null;
					if (!mon.illusion) throw new Error('missing-hypothetical-disguise');
				}
				mon.statusState.source = member.seen?.statusSource ?
					battle.getSide(member.seen.statusSource).active[0] : member.seen?.lastMove === 'rest' ? mon : side.foe.active[0];
				if (index !== 0) continue;
				for (const id of member.profile.volatiles) {
					if (!VOLATILES.has(id)) throw new Error(`unsupported-volatile:${id}`);
					const effect = battle.dex.conditions.get(id);
					const publicEffect = member.seen?.effects?.[id];
					const source = publicEffect?.source ? battle.getSide(publicEffect.source).active[0] : side.foe.active[0];
					const state = battle.initEffectState({ id, target: mon, source, sourceSlot: source.getSlot() });
					if (id === 'imprison') { state.source = mon; state.sourceSlot = mon.getSlot(); }
					if (effect.duration) state.duration = Math.max(1, effect.duration - (world.turn - (publicEffect?.turn ?? world.turn)));
					if (id === 'confusion') state.time = world.variant ? 3 : 1;
					if (id === 'substitute') state.hp = Math.max(1, Math.floor(mon.maxhp / (world.variant ? 8 : 4)));
					if (id === 'encore' || id === 'disable') {
						const namedMove = battle.dex.moves.get(publicEffect?.value || '');
						state.move = namedMove.exists ? namedMove.id : member.seen?.lastMove;
						state.duration = Math.max(1, (id === 'encore' ? 3 : 4) - (world.turn - (publicEffect?.turn ?? world.turn)));
					}
					if (id.startsWith('perish')) { state.time = Number(id.slice(6)) || 0; }
					mon.volatiles[id.startsWith('perish') ? 'perishsong' : id] = state;
				}
				if (['choiceband', 'choicespecs', 'choicescarf'].includes(mon.item) && mon.lastMove) {
					mon.volatiles.choicelock = battle.initEffectState({ id: 'choicelock', target: mon, move: mon.lastMove.id });
				}
			}
			for (const [id, layers] of Object.entries(world.memory.sides[sideID].conditions)) {
				const effect = battle.dex.conditions.get(id);
				const state = battle.initEffectState({ id, target: side, source: side.foe.active[0], layers });
				if (effect.duration) {
					const started = world.memory.sides[sideID].conditionTurns?.[id] ?? world.turn;
					const extension = ['reflect', 'lightscreen', 'auroraveil'].includes(id) ? world.variant * 3 : 0;
					state.duration = Math.max(1, effect.duration + extension - (world.turn - started));
				}
				side.sideConditions[id] = state;
			}
			restoreDelayedHealing(battle, side, world.memory.sides[sideID], (appearance, ident) => {
				let index = world.teams[sideID].findIndex(member => member.seen?.appearance === appearance);
				if (index < 0) {
					const matches = world.teams[sideID].map((member, position) => ({ member, position }))
						.filter(({ member }) => member.seen?.ident === ident && !member.seen.ambiguousIdentity);
					if (matches.length === 1) index = matches[0].position;
				}
				return index >= 0 ? side.pokemon[index] : undefined;
			});
		}
		const fieldState = (id: string) => {
			const effect = battle.dex.conditions.get(id);
			const state = battle.initEffectState({ id, target: battle.field, source: battle.p1.active[0] });
			if (effect.duration) {
				const extendable = id.endsWith('terrain') || ['raindance', 'sunnyday', 'sandstorm', 'hail', 'snowscape'].includes(id);
				state.duration = Math.max(1, effect.duration + (extendable ? world.variant * 3 : 0) -
				(world.turn - (world.memory.fieldTurns?.[id] ?? world.turn)));
			}
			if (id === 'trickroom') state.duration = trickRoomTurns(world.memory);
			return state;
		};
		battle.field.weather = world.memory.weather as ID;
		battle.field.weatherState = fieldState(world.memory.weather);
		battle.field.terrain = world.memory.terrain as ID;
		battle.field.terrainState = fieldState(world.memory.terrain);
		for (const id of world.memory.pseudoWeather) battle.field.pseudoWeather[id] = fieldState(id);
		battle.log.length = 0;
		battle.log.push(...world.publicLog);
		battle.sentLogPos = battle.log.length;
		for (const mon of battle.getAllActive()) {
			battle.runEvent('DisableMove', mon);
			battle.runEvent('TrapPokemon', mon);
		}
		battle.makeRequest('move');
		const expected = world.teams[world.ownSide][0].request;
		const actual = battle.getSide(world.ownSide).activeRequest;
		if (expected && actual && !actual.wait && !actual.forceSwitch && !actual.teamPreview &&
			expected.moves.map(move => move.id).join(',') !== actual.active[0].moves.map(move => move.id).join(',')) {
			throw new Error('unsupported-request-move-mapping');
		}
		return battle;
	} catch (error) {
		battle.destroy();
		throw error;
	}
}
