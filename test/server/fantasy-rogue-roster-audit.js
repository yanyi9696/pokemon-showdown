'use strict';

const assert = require('assert').strict;
const { Dex, toID } = require('../../dist/sim/dex');
const { Teams } = require('../../dist/sim/teams');
const { Battle } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { blessingSpeciesID } = require('../../dist/sim/rogue-species-identity');
const { TrainerBossData } = require('../../dist/server/fantasy-rogue/trainer-boss-data');
const { trainerBossCandidates } = require('../../dist/server/fantasy-rogue/trainer-bosses');
const { TrainerBossDoublesSamples } = require('../../dist/server/fantasy-rogue/trainer-boss-doubles-samples');
const { TrainerBossDoublesAuthored } = require('../../dist/server/fantasy-rogue/trainer-boss-doubles-authored');
const { TrainerBossDoublesHighTier } = require('../../dist/server/fantasy-rogue/trainer-boss-doubles-high-tier');
const { set } = require('../fixtures/fantasy-rogue');

const gymTypes = { brock: 'Rock', nessa: 'Water', winona: 'Flying', roxie: 'Poison', valerie: 'Fairy',
	iono: 'Electric', sabrina: 'Psychic', flannery: 'Fire', viola: 'Bug', nanu: 'Dark', acerola: 'Ghost',
	gardenia: 'Grass', jasmine: 'Steel', bea: 'Fighting', candice: 'Ice', clair: 'Dragon', clay: 'Ground', larry: 'Normal' };
const gyms = [20, 40, 60, 80, 100, 120, 140, 160];
const elites = [165, 175, 180, 185];
const galar = ['nessa', 'bea'];
const paldea = ['iono', 'larry'];
const dex = Dex.mod('gen9fantasy');
const sourceFor = key => TrainerBossDoublesSamples[key]?.team || TrainerBossDoublesAuthored[key] || TrainerBossDoublesHighTier[key];

describe('Fantasy Rogue complete doubles roster contract audit', () => {
	it('checks every authored gym tier, Elite Four and champion against shared quotas and usable held items', () => {
		const issues = [], reuse = new Map();
		const specialTags = ['Sub-Legendary', 'Mythical', 'Ultra Beast', 'Paradox'];
		let total = 0;
		for (const floor of [...gyms, ...elites, 190]) {
			const candidates = trainerBossCandidates(floor, 50, true);
			assert.equal(candidates.length, gyms.includes(floor) ? 18 : 6);
			for (const candidate of candidates) {
				const { id, role } = candidate.trainer, key = `${id}:${floor}`;
				const authored = Teams.import(sourceFor(key)), team = candidate.team;
				assert(authored, key); total++;
				const check = (condition, reason) => { if (!condition) issues.push(`${key}: ${reason}`); };
				check(team.length === (floor === 20 ? 2 : floor < 120 ? 4 : 6), 'party size');
				const tags = authored.map(mon => new Set([...dex.species.get(mon.species).tags,
					...Dex.mod('gen9').species.get(blessingSpeciesID(mon.species)).tags]));
				const restricted = tags.filter(tag => tag.has('Restricted Legendary')).length;
				const specials = tags.filter(tag => specialTags.some(t => tag.has(t))).length;
				check(restricted <= (role === 'champion' ? 1 : 0), 'restricted legendary cap');
				if (role === 'gym') {
					const type = gymTypes[id]; assert(type, `${id} needs an explicit leader type`);
					const same = authored.filter(mon => dex.species.get(mon.species).types.includes(type)).length;
					const tera = paldea.includes(id) && authored.some(mon => !dex.species.get(mon.species).types.includes(type) &&
						mon.teraType === type) ? 1 : 0;
					check(same + tera >= (floor === 20 ? 2 : floor < 120 ? 3 : 4), 'leader type quota');
					check(specials <= (floor < 120 ? 0 : floor < 160 ? 1 : 3), 'special family cap');
					if (floor === 160) check(specials >= 1, 'final gym needs at least one special family');
					if (floor <= 40) check(team.every(mon => !mon.item), 'early gym must not hold items');
					if (floor < 100) check(authored.every(mon => !/Fantasy|Mega|Totem|Gmax/.test(mon.species) &&
						!dex.items.get(mon.item).megaStone), 'special forms unlocked too early');
					if (galar.includes(id) && floor >= 100) check(authored.some(mon =>
						dex.species.get(mon.species).isGMega), 'missing Galar G-Mega signature');
					for (const mon of authored) {
						const family = blessingSpeciesID(mon.species);
						if (!reuse.has(family)) reuse.set(family, new Set());
						reuse.get(family).add(id);
					}
				} else if (role === 'elitefour') check(specials <= 3, 'Elite Four special family cap');
				for (const mon of team) {
					const item = toID(mon.item), moves = mon.moves.map(move => dex.moves.get(move));
					if (item === 'boosterenergy') check(['protosynthesis', 'quarkdrive'].includes(toID(mon.ability)),
						`${mon.species} cannot activate Booster Energy`);
					if (item === 'loadeddice') check(moves.some(move => Array.isArray(move.multihit) ||
						['populationbomb', 'tripleaxel', 'triplekick'].includes(move.id)), `${mon.species} has no Loaded Dice move`);
					if (item === 'assaultvest') check(moves.every(move => move.category !== 'Status' || move.id === 'mefirst'),
						`${mon.species} has an Assault Vest-blocked move`);
				}
			}
		}
		assert.equal(total, 174);
		assert.deepEqual(Object.keys(gymTypes).sort(), [...new Set(TrainerBossData.filter(t => t.role === 'gym').map(t => t.id))].sort());
		for (const [family, users] of reuse) if (users.size > 3) issues.push(`${family}: used by ${[...users].join(', ')}`);
		assert.deepEqual(issues, []);
	});
	for (const id of galar) for (const floor of gyms.filter(value => value >= 100)) {
		it(`${id}:${floor} actually transforms its signature member in a native doubles battle`, () => {
			const team = trainerBossCandidates(floor, 50, true).find(entry => entry.trainer.id === id).team;
			const authored = Teams.import(sourceFor(`${id}:${floor}`));
			const index = authored.findIndex(mon => dex.species.get(mon.species).isGMega);
			assert(index >= 0, 'Galar signature must be configured');
			const ordered = [team[index], ...team.filter((_, slot) => slot !== index)];
			const battle = new Battle({ format: new Format({ name: 'Galar signature audit', mod: 'gen9fantasy',
				gameType: 'doubles', ruleset: [] }), seed: [155, floor, 7, 3],
			p1: { name: 'QA', team: [set('Blissey', 'Natural Cure', 100, ['Splash']), set('Blissey', 'Natural Cure', 100, ['Splash'])] },
			p2: { name: id, team: structuredClone(ordered) } });
			try {
				assert(battle.p2.activeRequest.active[0].canGMegaEvo, 'the actual item grants a G-Mega request');
				const moves = battle.p2.activeRequest.active.map((active, slot) => {
					const protect = active.moves.findIndex(move => move.id === 'protect');
					assert(protect >= 0); return `move ${protect + 1}${slot === 0 ? ' mega' : ''}`;
				});
				assert(battle.choose('p1', 'move 1, move 1'));
				assert(battle.choose('p2', moves.join(', ')));
				assert.equal(battle.p2.active[0].species.id, toID(authored[index].species));
				assert(battle.p2.active[0].species.isGMega);
			} finally { battle.destroy(); }
		});
	}
	it('allows Flannery to use Parting Shot and leave the field with its corrected support item', () => {
		const team = trainerBossCandidates(160, 50, true).find(entry => entry.trainer.id === 'flannery').team;
		const cat = team.find(mon => mon.species === 'Incineroar');
		const dummy = () => set('Blissey', 'Natural Cure', 100, ['Splash']);
		const battle = new Battle({ format: new Format({ name: 'Support item audit', mod: 'gen9fantasy',
			gameType: 'doubles', ruleset: [] }), seed: [155, 1, 1, 1],
		p1: { name: 'QA', team: [dummy(), dummy()] }, p2: { name: 'Flannery', team: [cat, dummy(), dummy()] } });
		try {
			const slot = battle.p2.activeRequest.active[0].moves.findIndex(move => move.id === 'partingshot');
			assert(slot >= 0 && !battle.p2.activeRequest.active[0].moves[slot].disabled);
			assert(battle.choose('p1', 'move 1, move 1'));
			assert(battle.choose('p2', `move ${slot + 1} 1, move 1`));
			assert(battle.p2.activeRequest.forceSwitch[0]);
			assert.equal(battle.p1.active[0].boosts.atk, -2); // Intimidate, then Parting Shot.
			assert.equal(battle.p1.active[0].boosts.spa, -1);
			assert(battle.choose('p2', 'switch 3, pass'));
			assert.equal(battle.p2.active[0].species.id, 'blissey');
		} finally { battle.destroy(); }
	});
	it('activates the authored Sandy Shocks Booster Energy without needing a sunlight teammate', () => {
		const team = trainerBossCandidates(165, 50, true).find(entry => entry.trainer.id === 'rika').team;
		const sandy = team.find(mon => toID(mon.species) === 'sandyshocksfantasy');
		const dummy = () => set('Blissey', 'Natural Cure', 100, ['Splash']);
		const battle = new Battle({ format: new Format({ name: 'Booster item audit', mod: 'gen9fantasy',
			gameType: 'doubles', ruleset: [] }), seed: [155, 2, 1, 1],
		p1: { name: 'QA', team: [dummy(), dummy()] }, p2: { name: 'Rika', team: [sandy, dummy()] } });
		try {
			assert.equal(battle.field.weather, '');
			assert.equal(battle.p2.active[0].item, '');
			assert.equal(battle.p2.active[0].volatiles.protosynthesis.fromBooster, true);
		} finally { battle.destroy(); }
	});
});
