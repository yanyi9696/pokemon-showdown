'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { Dex } = require('../../dist/sim/dex');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');

describe('Fantasy Rogue doubles joint policy', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	it('registers a hidden two-player Rogue doubles format without changing the public singles format', () => {
		assert.equal(Dex.formats.get('gen9fantasyrogue').gameType, 'singles');
		const doubles = Dex.formats.get('gen9fantasyroguedoubles');
		assert.equal(doubles.gameType, 'doubles');
		assert.equal(doubles.playerCount, 2);
		assert.equal(doubles.searchShow, false);
	});
	const mon = (species, moves, item = '') => ({
		species, moves, item, level: 50, ability: Dex.mod('gen9fantasy').species.get(species).abilities['0'],
	});
	function observe(own, foes, log = []) {
		battle = new Battle({
			format: new Format({ name: 'Doubles policy tests', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
			strictChoices: true,
			seed: [1, 2, 3, 4],
			p1: { team: foes },
			p2: { team: own },
		});
		const entries = [
			'|turn|1',
			...own.map((pokemon, index) => `|switch|p2${index ? 'b' : 'a'}: ${pokemon.species}|${pokemon.species}, L50|100/150`),
			...foes.map((pokemon, index) => `|switch|p1${index ? 'b' : 'a'}: ${pokemon.species}|${pokemon.species}, L50|100/150`),
			...log,
		];
		return {
			difficulty: 'normal',
			ownSide: 'p2',
			request: battle.p2.activeRequest,
			publicLog: entries,
		};
	}
	function score(observation, choice) {
		return rankDoublesChoices(observation, 'gen9fantasy', []).find(entry => entry.choice === choice);
	}

	it('scores terrain-expanded native targets and reports projection failures separately from legal fallback', () => {
		const observation = observe(
			[mon('Indeedee-F', ['Expanding Force', 'Psychic']), mon('Magikarp', ['Splash'])],
			[mon('Blastoise', ['Splash']), mon('Blastoise', ['Splash'])],
			['|-fieldstart|move: Psychic Terrain']
		);
		const expanded = score(observation, 'move 1 1, move 1');
		assert(expanded.reasons.includes('native-damage'));
		assert(expanded.score > score(observation, 'move 2 1, move 1').score);
		assert(expanded.mechanics.probes > 0);
		assert.deepEqual(expanded.mechanics.failures, []);
	});

	it('uses the Fantasy mod for custom species when the Multi caller passes a mod ID', () => {
		const observation = observe(
			[mon('Rotom-Fantasy', ['Thunderbolt']), mon('Magikarp', ['Splash'])],
			[mon('Drednaw-Gmega-Fantasy', ['Splash']), mon('Tapu Fini-Fantasy', ['Splash'])]
		);
		const mod = rankDoublesChoices(observation, 'gen9fantasy');
		const format = rankDoublesChoices(observation, 'gen9fantasyroguedoubles');
		assert.deepEqual(mod, format);
		assert(mod[0].mechanics.probes > 0);
		assert.deepEqual(mod[0].mechanics.failures, []);
	});

	it('learns an absorbing ability from a public immunity message without seeing the opposing request', () => {
		const observation = observe(
			[mon('Charizard', ['Flamethrower']), mon('Magikarp', ['Splash'])],
			[mon('Arcanine', ['Splash']), mon('Blastoise', ['Splash'])]
		);
		const before = score(observation, 'move 1 1, move 1');
		observation.publicLog.push('|-immune|p1a: Arcanine|[from] ability: Flash Fire');
		const after = score(observation, 'move 1 1, move 1');
		assert(after.reasons.includes('ineffective-target'));
		assert(after.score < before.score);
		assert.deepEqual(after.mechanics.failures, []);
	});

	it('keeps original-type STAB after a public Tera message and a copied species after public Transform', () => {
		const observation = observe(
			[mon('Charizard', ['Air Slash']), mon('Magikarp', ['Splash'])],
			[mon('Blastoise', ['Splash']), mon('Ditto', ['Transform'])],
			['|-transform|p1b: Ditto|p1a: Blastoise']
		);
		const before = score(observation, 'move 1 1, move 1');
		observation.request.side.pokemon[0].terastallized = 'Fire';
		observation.publicLog.push('|-terastallize|p2a: Charizard|Fire');
		const after = score(observation, 'move 1 1, move 1');
		assert.equal(after.score, before.score);
		assert.deepEqual(after.mechanics.failures, []);
	});

	it('focuses a target for a coordinated knockout and avoids spending both attacks on an easy finish', () => {
		const observation = observe(
			[mon('Pikachu', ['Thunderbolt', 'Protect']), mon('Raichu', ['Thunderbolt', 'Protect'])],
			[mon('Charizard', ['Splash']), mon('Gastrodon', ['Splash'])],
			['|-damage|p1a: Charizard|150/150']
		);
		const focus = score(observation, 'move 1 1, move 1 1');
		assert(focus?.reasons.includes('focus-fire-knockout'));
		assert(focus.score > score(observation, 'move 1 1, move 1 2').score);
		const lowTarget = observe(
			[mon('Pikachu', ['Thunderbolt', 'Protect']), mon('Raichu', ['Thunderbolt', 'Protect'])],
			[mon('Charizard', ['Splash']), mon('Blastoise', ['Splash'])],
			['|-damage|p1a: Charizard|10/150']
		);
		assert(score(lowTarget, 'move 1 1, move 1 2').score > score(lowTarget, 'move 1 1, move 1 1').score);
	});

	it('prices spread-move friendly fire and rewards the immune Flying partner line', () => {
		const opponents = [mon('Charizard', ['Splash']), mon('Lucario', ['Splash'])];
		const earthshaker = observe([mon('Garchomp', ['Earthquake']), mon('Gardevoir', ['Splash'])], opponents);
		const harmful = score(earthshaker, 'move 1, move 1');
		assert(harmful?.reasons.includes('friendly-fire-risk'));
		const immunePartner = observe([mon('Garchomp', ['Earthquake']), mon('Talonflame', ['Splash'])], opponents);
		const safe = score(immunePartner, 'move 1, move 1');
		assert(!safe?.reasons.includes('friendly-fire-risk'));
		assert(safe.score > harmful.score);
		const levitatePartner = observe([mon('Garchomp', ['Earthquake']), mon('Rotom-Wash', ['Splash'])], opponents);
		assert(!score(levitatePartner, 'move 1, move 1')?.reasons.includes('friendly-fire-risk'));
	});

	it('avoids attacking a publicly known type immunity when another target is available', () => {
		const observation = observe(
			[mon('Pikachu', ['Thunderbolt', 'Protect']), mon('Gardevoir', ['Moonblast', 'Protect'])],
			[mon('Gastrodon', ['Splash']), mon('Charizard', ['Splash'])]
		);
		const immuneTarget = score(observation, 'move 1 1, move 2');
		const viableTarget = score(observation, 'move 1 2, move 2');
		assert(immuneTarget?.reasons.includes('ineffective-target'));
		assert(viableTarget && immuneTarget && viableTarget.score > immuneTarget.score);
	});

	it('recognizes native Protect plus Earthquake without treating a repeat Protect as certain', () => {
		const observation = observe(
			[mon('Garchomp', ['Earthquake']), mon('Gardevoir', ['Protect', 'Splash'])],
			[mon('Blissey', ['Splash']), mon('Snorlax', ['Splash'])]
		);
		const guarded = score(observation, 'move 1, move 1');
		const exposed = score(observation, 'move 1, move 2');
		assert(guarded.reasons.includes('protect-partner-from-spread'));
		assert(!guarded.reasons.includes('friendly-fire-risk'));
		assert(exposed.reasons.includes('friendly-fire-risk'));
		const hp = battle.p2.active[1].hp;
		battle.makeChoices('move 1, move 1', 'move 1, move 1');
		assert.equal(battle.p2.active[1].hp, hp, 'native Protect prevents allied Earthquake');
		observation.publicLog.push('|move|p2b: Gardevoir|Protect|p2b: Gardevoir', '|turn|2');
		assert(score(observation, 'move 1, move 1').reasons.includes('friendly-fire-risk'));
	});

	it('checks powder immunity on the attacker, leaving Grass-type Amoonguss free to redirect', () => {
		const observation = observe(
			[mon('Amoonguss', ['Rage Powder']), mon('Pikachu', ['Thunderbolt'])],
			[mon('Charizard', ['Flamethrower']), mon('Blastoise', ['Splash'])],
			['|move|p1a: Charizard|Flamethrower|p2b: Pikachu']
		);
		const redirect = score(observation, 'move 1, move 1 2');
		assert(redirect.reasons.includes('redirect-protect-key-ally'));
		assert(!redirect.reasons.includes('redirection-blocked'));
		observation.publicLog.push('|-item|p1a: Charizard|Safety Goggles', '|-ability|p1b: Blastoise|Overcoat');
		const blocked = score(observation, 'move 1, move 1 2');
		assert(blocked.reasons.includes('redirection-blocked'));
		assert(!blocked.reasons.includes('redirect-protect-key-ally'));
		assert(redirect.score > blocked.score);
	});

	it('does not reward Rage Powder for a revealed spread attack it cannot redirect', () => {
		const observation = observe(
			[mon('Amoonguss', ['Rage Powder']), mon('Pikachu', ['Protect'])],
			[mon('Charizard', ['Heat Wave']), mon('Blastoise', ['Surf'])],
			['|move|p1a: Charizard|Heat Wave|p2a: Amoonguss', '|move|p1b: Blastoise|Surf|p2a: Amoonguss']
		);
		const spread = score(observation, 'move 1, move 1');
		observation.publicLog.push('|move|p1a: Charizard|Flamethrower|p2b: Pikachu');
		const single = score(observation, 'move 1, move 1');
		assert(single.score > spread.score, 'only plausible unrevealed single attacks retain a discounted redirect value');
	});

	it('makes Fake Out unavailable after an action, available on re-entry, and handles either side', () => {
		const observation = observe(
			[mon('Incineroar', ['Fake Out', 'Protect']), mon('Gardevoir', ['Protect'])],
			[mon('Charizard', ['Flamethrower']), mon('Blastoise', ['Splash'])],
			['|move|p2a: Incineroar|Protect|p2a: Incineroar', '|turn|2']
		);
		const expired = score(observation, 'move 1 1, move 1');
		assert(expired.reasons.includes('fake-out-expired'));
		assert(!expired.reasons.includes('focus-fire-knockout'));
		observation.publicLog.push('|turn|5', '|switch|p2a: Incineroar|Incineroar, L50|100/150');
		const fresh = score(observation, 'move 1 1, move 1');
		assert(fresh.reasons.includes('disrupt-threat'));
		assert(fresh.score > expired.score);
		observation.request.side.id = 'p1'; observation.ownSide = 'p1';
		for (const pokemon of observation.request.side.pokemon) pokemon.ident = pokemon.ident.replace('p2:', 'p1:');
		observation.publicLog = observation.publicLog.map(line => line.replace(/p([12])([ab])?:/g,
			(_, n, position = '') => `p${n === '1' ? '2' : '1'}${position}:`));
		assert(score(observation, 'move 1 1, move 1').reasons.includes('disrupt-threat'));
		observation.publicLog.push('|cant|p1a: Incineroar|flinch', '|turn|6');
		assert(score(observation, 'move 1 1, move 1').reasons.includes('fake-out-expired'));
	});

	it('coordinates Helping Hand with an ally attack and Protect with a revealed threat', () => {
		const support = observe(
			[mon('Indeedee-F', ['Helping Hand']), mon('Gardevoir', ['Moonblast', 'Protect'])],
			[mon('Charizard', ['Splash']), mon('Blastoise', ['Splash'])]
		);
		assert(score(support, 'move 1 -2, move 1 1')?.reasons.includes('helping-hand-synergy'));

		const team = [mon('Pikachu', ['Protect', 'Thunderbolt']), mon('Gardevoir', ['Moonblast'])];
		const foes = [mon('Charizard', ['Flamethrower']), mon('Blastoise', ['Splash'])];
		const threatened = observe(team, foes, ['|move|p1a: Charizard|Flamethrower|p2a: Pikachu', '|turn|2']);
		const protect = score(threatened, 'move 1, move 1 1');
		assert(protect?.reasons.includes('protect-under-threat'));
	});

	it('uses speed control and scores only from the detached public observation', () => {
		const observation = observe(
			[mon('Whimsicott', ['Tailwind', 'Moonblast']), mon('Torkoal', ['Heat Wave', 'Protect'])],
			[mon('Dragapult', ['Splash']), mon('Garchomp', ['Splash'])]
		);
		const before = JSON.stringify(observation.request);
		const scored = rankDoublesChoices(observation, 'gen9fantasy');
		assert(scored.some(choice => choice.reasons.includes('speed-control-tailwind')));
		assert.equal(JSON.stringify(observation.request), before);
		assert(battle.p2.choose(scored[0].choice));
	});

	it('values weather setup when the active pair can use the weather', () => {
		const observation = observe(
			[mon('Ninetales', ['Sunny Day']), mon('Venusaur', ['Solar Beam'])],
			[mon('Charizard', ['Splash']), mon('Blastoise', ['Splash'])]
		);
		const sunnyTurn = score(observation, 'move 1, move 1 1');
		assert(sunnyTurn?.reasons.includes('weather-support'));
	});

	it('does not repeatedly value Tailwind when both allies already outspeed the opponents', () => {
		const observation = observe(
			[mon('Talonflame', ['Tailwind', 'Brave Bird']), mon('Jolteon', ['Thunderbolt'])],
			[mon('Snorlax', ['Splash']), mon('Slowbro', ['Splash'])]
		);
		const unnecessary = score(observation, 'move 1, move 1 2');
		assert(!unnecessary.reasons.includes('speed-control-tailwind'));
		assert(score(observation, 'move 2 1, move 1 2').score > unnecessary.score);
		observation.publicLog.push('|-sidestart|p1: Player|move: Tailwind');
		observation.request.side.pokemon[0].stats.spe = 70;
		observation.request.side.pokemon[1].stats.spe = 70;
		assert(score(observation, 'move 1, move 1 2').reasons.includes('speed-control-tailwind'));
	});

	it('distinguishes Wide Guard from Quick Guard and values legal Fake Out and self-healing targets', () => {
		const guard = observe(
			[mon('Hitmontop', ['Wide Guard', 'Quick Guard']), mon('Gardevoir', ['Protect'])],
			[mon('Talonflame', ['Quick Attack']), mon('Blastoise', ['Splash'])],
			['|move|p1a: Talonflame|Quick Attack|p2a: Hitmontop']
		);
		const wideGuard = score(guard, 'move 1, move 1');
		const quickGuard = score(guard, 'move 2, move 1');
		assert(!wideGuard?.reasons.includes('teamwide-protection'));
		assert(quickGuard?.reasons.includes('teamwide-protection'));

		const fakeOut = observe(
			[mon('Incineroar', ['Fake Out', 'Protect']), mon('Gardevoir', ['Protect'])],
			[mon('Charizard', ['Flamethrower']), mon('Blastoise', ['Splash'])],
			['|-status|p1a: Charizard|brn']
		);
		assert(score(fakeOut, 'move 1 1, move 1')?.reasons.includes('disrupt-threat'));

		const recovery = observe(
			[mon('Blissey', ['Soft-Boiled', 'Protect']), mon('Gardevoir', ['Protect'])],
			[mon('Charizard', ['Splash']), mon('Blastoise', ['Splash'])]
		);
		recovery.request.side.pokemon[0].condition = '25/100';
		assert(score(recovery, 'move 1, move 1')?.reasons.includes('self-recovery'));
	});

	it('discourages consecutive Protect and does not treat a Ghost as a Fake Out target', () => {
		const party = [mon('Pikachu', ['Protect', 'Thunderbolt']), mon('Raichu', ['Thunderbolt'])];
		const foes = [mon('Charizard', ['Flamethrower']), mon('Blastoise', ['Splash'])];
		const threatLog = ['|move|p1a: Charizard|Flamethrower|p2a: Pikachu', '|turn|2'];
		const available = observe(party, foes, threatLog);
		const consecutive = observe(party, foes, [
			'|move|p1a: Charizard|Flamethrower|p2a: Pikachu',
			'|move|p2a: Pikachu|Protect|p2a: Pikachu',
			'|turn|2',
		]);
		const guarded = score(available, 'move 1, move 1 1');
		const repeatedGuard = score(consecutive, 'move 1, move 1 1');
		assert(guarded?.reasons.includes('protect-under-threat'));
		assert(repeatedGuard.score < guarded.score);

		const unknownSet = observe(
			[mon('Pikachu', ['Protect', 'Thunderbolt']), mon('Raichu', ['Thunderbolt'])],
			[mon('Charizard', ['Flamethrower']), mon('Blastoise', ['Splash'])]
		);
		unknownSet.request.side.pokemon[0].condition = '20/100';
		assert(!unknownSet.publicLog.some(line => line.includes('Flamethrower')), 'the hidden opponent set must not enter the observation');
		assert(score(unknownSet, 'move 1, move 1 1')?.reasons.includes('protect-under-threat'),
			'a critically injured attacker can respect a plausible public species threat before its set is revealed');

		const fakeOut = observe(
			[mon('Incineroar', ['Fake Out', 'Protect']), mon('Gardevoir', ['Protect'])],
			[mon('Gengar', ['Splash']), mon('Blastoise', ['Splash'])]
		);
		assert(!score(fakeOut, 'move 1 1, move 1')?.reasons.includes('disrupt-threat'));
	});

	it('does not spend the shared Mega resource on a zero-pressure Protect turn', () => {
		const observation = observe(
			[mon('Gardevoir', ['Protect', 'Moonblast'], 'Gardevoirite'), mon('Pikachu', ['Protect'])],
			[mon('Charizard', ['Splash']), mon('Blastoise', ['Splash'])]
		);
		assert(observation.request.active[0].canMegaEvo);
		const ordinary = score(observation, 'move 1, move 1');
		const wastedMega = score(observation, 'move 1 mega, move 1');
		assert(ordinary && wastedMega);
		assert.equal(wastedMega.score, ordinary.score);
		assert(!wastedMega.reasons.includes('transformation'));
	});

	it('avoids priority attacks blocked by Psychic Terrain and status moves blocked by immunity', () => {
		const terrain = observe(
			[mon('Pikachu', ['Quick Attack', 'Thunderbolt']), mon('Gardevoir', ['Moonblast'])],
			[mon('Charizard', ['Splash']), mon('Blastoise', ['Splash'])],
			['|-fieldstart|move: Psychic Terrain']
		);
		const blocked = score(terrain, 'move 1 2, move 1 2');
		const unblocked = score(terrain, 'move 2 2, move 1 2');
		assert(blocked?.reasons.includes('priority-blocked'), JSON.stringify(blocked));
		assert(unblocked && blocked && unblocked.score > blocked.score);

		const immune = observe(
			[mon('Pikachu', ['Thunder Wave', 'Thunderbolt']), mon('Gardevoir', ['Moonblast'])],
			[mon('Gastrodon', ['Splash']), mon('Blastoise', ['Splash'])]
		);
		const paralysis = score(immune, 'move 1 1, move 1 2');
		const attack = score(immune, 'move 2 2, move 1 2');
		assert(paralysis?.reasons.includes('status-immunity'));
		assert(attack && paralysis && attack.score > paralysis.score);

		const sleeping = observe(
			[mon('Snorlax', ['Yawn']), mon('Gardevoir', ['Moonblast'])],
			[mon('Blastoise', ['Splash']), mon('Charizard', ['Splash'])],
			['|-fieldstart|move: Electric Terrain']
		);
		assert(score(sleeping, 'move 1 1, move 1 2')?.reasons.includes('status-immunity'));
	});

	it('scores redirection only when it can protect a threatened partner', () => {
		const observation = observe(
			[mon('Indeedee-F', ['Follow Me']), mon('Gardevoir', ['Moonblast'])],
			[mon('Charizard', ['Flamethrower']), mon('Blastoise', ['Splash'])],
			['|move|p1a: Charizard|Flamethrower|p2b: Gardevoir']
		);
		const redirect = score(observation, 'move 1, move 1 1');
		assert(redirect?.reasons.includes('redirect-protect-key-ally'));

		const blocked = observe(
			[mon('Amoonguss', ['Rage Powder']), mon('Gardevoir', ['Moonblast'])],
			[mon('Venusaur', ['Energy Ball']), mon('Rillaboom', ['Wood Hammer'])]
		);
		assert(score(blocked, 'move 1, move 1 1')?.reasons.includes('redirection-blocked'));
	});

	it('chooses Trick Room for a slower pair and switches into a revealed Ground immunity', () => {
		const slow = observe(
			[mon('Torkoal', ['Trick Room', 'Heat Wave']), mon('Snorlax', ['Body Slam', 'Protect'])],
			[mon('Dragapult', ['Splash']), mon('Jolteon', ['Splash'])]
		);
		assert(score(slow, 'move 1, move 1 1')?.reasons.includes('speed-control-trick-room'));

		const switchTeam = [
			mon('Pikachu', ['Thunderbolt', 'Protect']), mon('Gardevoir', ['Moonblast']),
			mon('Talonflame', ['Brave Bird', 'Protect']),
		];
		const switchBattle = observe(
			switchTeam,
			[mon('Garchomp', ['Earthquake', 'Dragon Claw']), mon('Charizard', ['Splash'])],
			['|move|p1a: Garchomp|Earthquake|p2a: Pikachu']
		);
		const dodge = score(switchBattle, 'switch 3, move 1 1');
		const stay = score(switchBattle, 'move 2, move 1 2');
		assert(dodge && stay && dodge.score > stay.score, JSON.stringify({ dodge, stay }));
	});
});
