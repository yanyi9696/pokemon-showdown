import { Dex } from '../../sim/dex';
import { rogueCaptureCount } from '../../sim/fantasy-rogue-rules';
import { isMajorLegendary, type RogueRandom } from './biome-pools';
import { cardBiasedSpecies } from './story';

/** Choose rarity first. A preference card never changes the reward's eligibility or legendary odds. */
export function drawGiftSpecies(names: string[], card: string | undefined, random: RogueRandom, strong = false) {
	const groups = [names.filter(name => !isMajorLegendary(name) && rogueCaptureCount(name) === 1),
		names.filter(name => !isMajorLegendary(name) && rogueCaptureCount(name) === 10), names.filter(isMajorLegendary)];
	const weights = [9900, 90, 10].map((weight, i) => groups[i].length ? weight : 0);
	if (!weights.some(Boolean)) throw new Error('没有符合条件的赠送伙伴。');
	let roll = random(weights.reduce((a, b) => a + b, 0));
	const group = groups[weights.findIndex(weight => { roll -= weight; return roll < 0; })];
	const draw = () => cardBiasedSpecies(() => group[random(group.length)], card, random);
	let name = draw();
	if (strong) {
		const other = draw(), dex = Dex.mod('gen9fantasy');
		if (dex.species.get(other).bst > dex.species.get(name).bst) name = other;
	}
	return name;
}
