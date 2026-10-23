'use strict';

// Deterministic damage comparisons, not a claim of a full 200-floor playthrough.
const { Battle } = require('../dist/sim/battle');
const { blessing } = require('../dist/sim/rogue-blessing-data');
const { blessingSpeciesID } = require('../dist/sim/rogue-species-identity');
const { createRoguePokemon } = require('../dist/server/fantasy-rogue/progression');
const { syncBlessingParty } = require('../dist/server/fantasy-rogue/blessings');
const stats = n => ({ hp: n, atk: n, def: n, spa: n, spd: n, spe: n });
const cases = [
	['Garchomp', 'Sand Veil', 'Dragon Claw', 'Snorlax', 'Immunity', 'Body Slam'],
	['Garchomp', 'Sand Veil', 'Earthquake', 'Clefable', 'Cute Charm', 'Moonblast'],
	['Blastoise', 'Torrent', 'Surf', 'Snorlax', 'Immunity', 'Body Slam'],
	['Blastoise', 'Torrent', 'Ice Beam', 'Tangrowth', 'Chlorophyll', 'Energy Ball'],
	['Gengar', 'Cursed Body', 'Shadow Ball', 'Blastoise', 'Torrent', 'Surf'],
	['Gengar', 'Cursed Body', 'Sludge Bomb', 'Alakazam', 'Synchronize', 'Psychic'],
];
function measure(count, id, c, level) {
	const set = (species, ability, move) => ({ species, ability, level, moves: [move], nature: 'Hardy', evs: stats(0), ivs: stats(31) });
	const run = { boosts: stats(0), team: Array.from({ length: 6 }, (_, i) =>
		createRoguePokemon(i < count ? set(c[0], c[1], c[2]) : set('Magikarp', 'Swift Swim', 'Splash'), stats(0))) };
	syncBlessingParty(run);
	if (id) run.blessings.owned = [{ ...blessing(id), species: blessingSpeciesID(c[0]), floor: 50 }];
	syncBlessingParty(run);
	const battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
		fantasyRogue: { encounterId: 'devotion-balance', team: run.team, blessings: run.blessings,
			boosts: stats(0), bag: {}, balls: [], catchable: false },
		p1: { team: run.team.map(p => p.set) }, p2: { team: [set(c[3], c[4], c[5])] } });
	try {
		battle.makeChoices('team 1', 'team 1'); battle.randomizer = n => n;
		const [source, target] = [battle.p1.active[0], battle.p2.active[0]];
		const damage = (a, b, move) => {
			const m = battle.dex.getActiveMove(move); m.willCrit = false;
			return battle.actions.getDamage(a, b, m);
		};
		return { out: damage(source, target, c[2]), incoming: damage(target, source, c[5]), hp: source.maxhp,
			targetHP: target.maxhp };
	} finally { battle.destroy(); }
}
function balanceReport() {
	return [2, 3, 4, 5, 6].map(count => {
		const samples = [50, 100].flatMap(level => cases.map(c => {
			const base = measure(count, undefined, c, level), blessed = measure(count, 'devotion', c, level);
			return { level, species: c[0], opponent: c[3], base, blessed, offense: blessed.out / base.out,
				durability: base.incoming / blessed.incoming,
				baseHits: Math.ceil(base.targetHP / base.out), blessedHits: Math.ceil(blessed.targetHP / blessed.out) };
		}));
		const range = key => [Math.min(...samples.map(s => s[key])), Math.max(...samples.map(s => s[key]))].map(n => +n.toFixed(3));
		return { count, offense: range('offense'), durability: range('durability'),
			fewerHits: samples.filter(s => s.blessedHits < s.baseHits).length, samples };
	});
}
if (require.main === module) process.stdout.write(JSON.stringify(balanceReport(), null, 2) + '\n');
module.exports = { measure, balanceReport };
