'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { ROGUE_BLESSINGS, blessing } = require('../../dist/sim/rogue-blessing-data');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue blessing interaction audit', function () {
	this.timeout(30000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function begin(ids, spirit, options = {}) {
		const names = ids.includes('mousefamily') ? ['Pikachu', 'Raichu', 'Plusle', 'Minun', 'Pachirisu', 'Dedenne'] :
			ids.includes('eeveefamily') ? ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Umbreon', 'Sylveon'] :
			['Cobalion', 'Meloetta', 'Golduck', 'Scizor', 'Bulbasaur', 'Hoopa'];
		const team = names.map((name, i) => createRoguePokemon({ ...set(name, 'Run Away', 50,
			['Sacred Sword', 'Bug Buzz', 'Double Hit', 'Splash']), item: ['leftovers', 'sitrusberry', 'lightball'][i] || '' }, stats(0)));
		const run = { team, boosts: stats(0), floor: 100, spirit, bag: {}, money: 10000,
			blessings: undefined };
		syncBlessingParty(run);
		run.blessings.owned = ids.map(id => ({ ...blessing(id), floor: 50, target: team[0].id }));
		options.prepare?.(run);
		syncBlessingParty(run);
		const state = { encounterId: 'audit', team, boosts: stats(0), bag: {}, balls: [], catchable: false,
			blessings: run.blessings, spirit: spirit ? { id: spirit, floor: 100, money: run.money } : undefined };
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [4, 3, 2, 1], fantasyRogue: state,
			p1: { name: 'Player', team: team.map(mon => mon.set) },
			p2: { name: 'Opponent', team: [set('Blissey', 'Natural Cure', 100, ['Tackle', 'Splash']), set('Snorlax', 'Immunity', 100, ['Splash'])] } });
		battle.choose('p1', 'team 123456'); battle.choose('p2', 'team 12');
		return state;
	}
	function play(choice) {
		for (const player of battle.sides) {
			if (!player.requestState) continue;
			if (player.id === 'p1' && player.requestState === 'move') {
				if (battle.choose(player.id, choice)) continue;
			}
			assert(battle.choose(player.id, 'default'), `${player.id}: ${player.choice.error}`);
		}
	}
	const families = ['coin', 'dice', 'supercombo', 'lowhp', 'pivot', 'swapstats', 'kid', 'slacker', 'passdrops', 'bond',
		'detect', 'weakness', 'weaknessarmor', 'singer', 'dancer', 'smallfinal', 'prayer', 'topclearmind', 'hazards', 'toxic', 'stackstatus',
		'starters', 'bugchoir', 'survive', 'seeds', 'secondchoice', 'learnall', 'style', 'insight', 'inheritmoves', 'entrance',
		'swords', 'execute', 'hpgrowth', 'sound', 'multihit', 'hoopa', 'psychic', 'ascent', 'duck', 'lifepower',
		'renewable', 'mousefamily', 'eeveefamily', 'restinball', 'arsenal', 'speedpower'];
	for (let i = 0; i < families.length; i++) for (let j = i + 1; j < families.length; j++) {
		const ids = [families[i], families[j]];
		if (ids.includes('singer') && ids.includes('dancer')) continue;
		it(`settles ${ids.join(' + ')} across attacks, switching and restoration`, () => {
			begin(ids, (i + j) % 3 === 0 ? 'dialga' : (i + j) % 3 === 1 && !ids.includes('coin') ? 'zygardeorder' : undefined);
			play('move 1'); play('move 2');
			const saved = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(saved);
			for (const choice of ['switch 2', 'move 3', 'move 4', 'move 1']) {
				if (!battle.ended) play(choice);
			}
			for (const mon of battle.getAllPokemon()) {
				assert(Number.isFinite(mon.hp) && mon.hp >= 0 && mon.hp <= mon.maxhp, 'valid HP');
				for (const stat of Object.keys(stats(0)).filter(stat => stat !== 'hp')) assert(Number.isFinite(mon.getStat(stat)), stat);
				for (const slot of mon.moveSlots) assert(slot.pp >= 0 && slot.pp <= slot.maxpp, slot.id);
			}
			assert.doesNotThrow(() => JSON.stringify(rogueBattleResult(battle)));
		});
	}
	it('does not double Regenerator when the native ability is also granted by the blessing', () => {
		begin(['restinball'], undefined, { prepare(run) { run.team[0].set.ability = 'Regenerator'; } });
		const mon = battle.p1.active[0]; mon.hp = Math.floor(mon.maxhp / 3);
		const expected = mon.hp + Math.floor(mon.maxhp / 3);
		play('switch 2'); assert.equal(mon.hp, expected);
	});
	it('delayed attacks pay Life Orb recoil on arrival rather than launch, once per multi-hit move', () => {
		begin(['lifepower', 'multihit'], 'dialga');
		const mon = battle.p1.active[0]; mon.item = ''; const hp = mon.hp;
		battle.p2.pokemon[0].moveSlots = battle.p2.pokemon[0].moveSlots.slice(1);
		play('move 3'); assert.equal(mon.hp, hp);
		play('move 4'); assert.equal(mon.hp, hp);
		play('move 4'); assert.equal(mon.hp, hp - Math.floor(mon.baseMaxhp / 10));
	});
	it('all blessing descriptions expose a nonempty name and effect without undefined placeholders', () => {
		for (const def of ROGUE_BLESSINGS) {
			assert(def.name.trim() && def.text.trim(), def.id);
			assert(!/undefined|NaN|待填写/.test(def.text), def.id);
		}
	});
});
