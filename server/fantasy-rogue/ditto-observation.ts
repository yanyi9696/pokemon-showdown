import { Dex } from '../../sim/dex';
import { Format } from '../../sim/dex-formats';
import { TeamValidator } from '../../sim/team-validator';
import type { RogueRandom } from './biome-pools';

const dex = Dex.mod('gen9fantasy');
const validator = new TeamValidator(new Format({
	...Dex.formats.get('gen9nationaldex'), name: 'Ditto Observation', mod: 'gen9fantasy',
}));

/** Authored, plausible coverage moves; legality is checked against the live rules, not the copy. */
const MODELS: [string, string[], string[]][] = [
	['Blastoise', ['focusblast', 'dragonpulse', 'darkpulse'], ['thunderbolt', 'sludgebomb']],
	['Venusaur', ['earthpower', 'knockoff', 'weatherball'], ['powergem', 'rockslide']],
	['Charizard', ['solarbeam', 'thunderpunch', 'dragonpulse'], ['drainpunch', 'powergem']],
	['Gengar', ['dazzlinggleam', 'energyball', 'focusblast'], ['icebeam', 'flamethrower']],
	['Alakazam', ['energyball', 'drainpunch', 'irontail'], ['icebeam', 'darkpulse']],
	['Clefable', ['meteormash', 'waterpulse', 'thunderbolt'], ['scald', 'airslash']],
	['Nidoking', ['surf', 'thunderbolt', 'flamethrower'], ['energyball', 'powergem']],
	['Snorlax', ['surf', 'seedbomb', 'wildcharge'], ['drainpunch', 'poisonjab']],
	['Gyarados', ['thunderbolt', 'flamethrower', 'powerwhip'], ['dragonpulse', 'earthpower']],
	['Machamp', ['fireblast', 'knockoff', 'heavyslam'], ['drainpunch', 'ironhead']],
	['Slowbro', ['flamethrower', 'icepunch', 'drainpunch'], ['thunderbolt', 'energyball']],
	['Lapras', ['psychic', 'dragonpulse', 'drillrun'], ['flashcannon', 'earthpower']],
	['Dragonite', ['icebeam', 'thunderbolt', 'focusblast'], ['energyball', 'darkpulse']],
	['Ampharos', ['powergem', 'dragonpulse', 'focusblast'], ['icebeam', 'energyball']],
	['Umbreon', ['psychic', 'dig', 'irontail'], ['moonblast', 'sludgebomb']],
	['Espeon', ['grassknot', 'shadowball', 'dazzlinggleam'], ['energyball', 'thunderbolt']],
	['Scizor', ['airslash', 'nightslash', 'superpower'], ['rockslide', 'drainpunch']],
	['Heracross', ['rockblast', 'nightslash', 'shadowclaw'], ['drainpunch', 'ironhead']],
	['Miltank', ['surf', 'icebeam', 'shadowball'], ['moonblast', 'darkpulse']],
	['Tyranitar', ['surf', 'thunderbolt', 'flamethrower'], ['powerwhip', 'flashcannon']],
	['Sceptile', ['rockslide', 'dragonpulse', 'thunderpunch'], ['darkpulse', 'flamethrower']],
	['Aggron', ['surf', 'thunderbolt', 'icebeam'], ['powergem', 'drainpunch']],
	['Milotic', ['dragonpulse', 'muddywater', 'disarmingvoice'], ['psychic', 'energyball']],
	['Togekiss', ['aurasphere', 'flamethrower', 'signalbeam'], ['moonblast', 'icebeam']],
	['Lucario', ['waterpulse', 'dragonpulse', 'blazekick'], ['icebeam', 'thunderbolt']],
	['Gliscor', ['aquatail', 'crabhammer', 'firefang'], ['leechlife', 'waterfall']],
	['Mamoswine', ['ancientpower', 'freezedry', 'knockoff'], ['headsmash', 'ironhead']],
	['Krookodile', ['aquatail', 'aerialace', 'grassknot'], ['dragonpulse', 'firepunch']],
	['Goodra', ['thunderbolt', 'fireblast', 'powerwhip'], ['psychic', 'icepunch']],
	['Tsareena', ['tripleaxel', 'highjumpkick', 'acrobatics'], ['drainpunch', 'playrough']],
];
export const DITTO_SIGNATURE_MOVES = ['roaroftime', 'spacialrend', 'oblivionwing', 'originpulse', 'precipiceblades'];
export const DITTO_SMEARGLE_PERCENT = 5;
export interface ObservationModel { species: string; move: string }
let modelPool: { species: string, legal: string[], disguise: string[] }[] | undefined;
export function observationPool() {
	modelPool ||= MODELS.map(([name, legal, disguise]) => {
		const species = dex.species.get(name);
		const canLearn = (id: string) => !validator.checkCanLearn(dex.moves.get(id), species, undefined, { level: 100 });
		return { species: species.name, legal: legal.filter(canLearn), disguise: disguise.filter(id => !canLearn(id)) };
	}).filter(model => model.legal.length && model.disguise.length);
	return modelPool;
}
export function drawObservation(previous: readonly string[], random: RogueRandom) {
	const full = observationPool(), fresh = full.filter(model => !previous.includes(model.species));
	const pool = [...(fresh.length >= 3 ? fresh : full)];
	const index = random(3), special = random(100) >= 100 - DITTO_SMEARGLE_PERCENT;
	const models: ObservationModel[] = Array.from({ length: 3 }, (_, i) => {
		const model = pool.splice(random(pool.length), 1)[0];
		if (i === index && special) {
			return { species: 'Smeargle', move: DITTO_SIGNATURE_MOVES[random(DITTO_SIGNATURE_MOVES.length)] };
		}
		const moves = i === index ? model.disguise : model.legal;
		return { species: model.species, move: moves[random(moves.length)] };
	});
	return { index, special, models };
}

/** Keep already-open legacy questions and their saved answer; never reroll from a view request. */
export function observationModels(activity: { observation?: ObservationModel[], index?: number }) {
	if (activity.observation?.length === 3) return activity.observation;
	return ['Pikachu', 'Squirtle', 'Charmander'].map((species, i) => ({ species,
		move: i === (activity.index || 0) ?
			['watergun', 'thundershock', 'vinewhip'][i] : ['thundershock', 'watergun', 'ember'][i] }));
}

let machines: string[] | undefined;
/** Existing machine sources only. Receiving a TM does not grant permission to learn an illegal move. */
export function observationMachines() {
	if (!machines) {
		const ids = new Set<string>();
		for (const data of Object.values(dex.data.Learnsets)) {
			for (const [id, sources] of Object.entries(data.learnset || {})) {
				if (sources.some(source => /^[1-9]M/.test(source))) ids.add(id);
			}
		}
		machines = [...ids].filter(id => {
			const move = dex.moves.get(id);
			return move.exists && !move.isZ && !move.isMax && id !== 'struggle';
		}).sort();
	}
	return machines;
}
