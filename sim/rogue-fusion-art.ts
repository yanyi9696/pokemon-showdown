import { toID } from './dex';
import { FusionArtwork } from '../data/fantasy-rogue/fusion-art';
import type { RoguePokemon } from './fantasy-rogue';

/** Content-addressed local PNG; never accept a URL or path from a player or save. */
export const validFusionSprite = (value: unknown): value is string =>
	typeof value === 'string' && /^\d{1,4}\.\d{1,4}[a-z]{0,3}-[a-f0-9]{12}$/.test(value);

export function fusionArtwork(head: string, body: string) {
	// Exact species IDs intentionally keep regional and Fantasy forms separate.
	const art = FusionArtwork[`${toID(head)}:${toID(body)}`];
	return art && toID(art.head) === toID(head) && toID(art.body) === toID(body) &&
		validFusionSprite(art.sprite) && art.artist && art.source.startsWith("https://") && art.permission ? art : undefined;
}

export function memberFusionSprite(mon: RoguePokemon) {
	if (!mon.fusion?.sprite) return undefined;
	const art = fusionArtwork(mon.fusion.first.set.species, mon.fusion.second.set.species);
	return art?.sprite === mon.fusion.sprite ? art.sprite : undefined;
}

export function fusionArtworkChoices(team: RoguePokemon[]) {
	return team.filter(mon => !mon.egg && !mon.fusion).flatMap(head => team.filter(body =>
		body !== head && !body.egg && !body.fusion).flatMap(body => {
		const art = fusionArtwork(head.set.species, body.set.species);
		return art ? [{ head: head.id, body: body.id, sprite: art.sprite, artist: art.artist, source: art.source }] : [];
	}));
}

/** Only visual state is public; no donor moves, IVs or abilities are sent. */
export function battleFusionSprite(pokemon: Pokemon): string | undefined {
	const visible = pokemon.illusion || pokemon;
	const sprite = visible.transformed ? visible.m.rogueCopiedFusionSprite :
		visible.set.fantasyRogueModifiers?.fusion?.sprite;
	return validFusionSprite(sprite) ? sprite : undefined;
}
