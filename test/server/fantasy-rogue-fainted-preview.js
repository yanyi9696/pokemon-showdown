'use strict';

const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Rogue pre-battle fainted party presentation', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function party(prefix) {
		return ['Bench', 'Lead', 'Reserve'].map((name, i) => {
			const member = createRoguePokemon({ ...set('Bulbasaur', 'Overgrow', 10, ['Growl']), name: prefix + name }, stats(0));
			if (!i) member.hp = 0;
			return member;
		});
	}
	function start(formatid = 'gen9fantasyrogue', healed = false) {
		const team = party('Own'), partner = party('Ally');
		if (healed) team[0].hp = team[0].maxhp;
		const coop = formatid === 'gen9fantasyroguecoop';
		const state = { encounterId: 'fainted-preview', team, boosts: stats(0), bag: {}, balls: [], catchable: false,
			...(coop ? { persistCoop: true, partner: { team: partner, boosts: stats(0) }, cooperative: { opponentOffset: 1 } } : {}) };
		const before = JSON.stringify(team);
		battle = new Battle({ formatid, seed: [1, 2, 3, 4],
			...(formatid.startsWith('gen9fantasyrogue') ? { fantasyRogue: structuredClone(state) } : {}),
			p1: { name: 'Player', team: structuredClone(team.map(mon => mon.set)) },
			p2: { name: 'NPC', team: [set('Magikarp', 'Swift Swim', 10, ['Splash']), set('Feebas', 'Swift Swim', 10, ['Splash'])] },
			...(coop ? { p3: { name: 'Partner', team: structuredClone(partner.map(mon => mon.set)) },
				p4: { name: 'NPC partner', team: [set('Magikarp', 'Swift Swim', 10, ['Splash'])] } } : {}),
		});
		assert.equal(JSON.stringify(team), before, 'presentation must not alter the saved party');
		return state;
	}
	for (const format of ['gen9fantasyrogue', 'gen9fantasyroguedoubles', 'gen9fantasyroguecoop']) {
		it(`publishes initial fainted status before lead selection in ${format}`, () => {
			start(format);
			const flagged = battle.log.filter(line => line.startsWith('|poke|') && line.includes('|[fainted]'));
			assert.equal(flagged.length, format.endsWith('coop') ? 2 : 1);
			assert(flagged.some(line => line.startsWith('|poke|p1|Bulbasaur,') && line.endsWith('|[fainted] OwnBench')));
			const fainted = battle.p1.pokemon.find(mon => mon.name === 'OwnBench');
			assert.equal(fainted.hp, 0);
			assert.equal(fainted.fainted, true);
			assert(!battle.p1.active.includes(fainted), 'an already-fainted member stays on the bench');
			assert.equal(battle.p1.pokemonLeft, 2);
			assert(!battle.log.some(line => line.startsWith('|faint|')), 'no KO animation, counter or reward is created');
			for (const channel of [0, 1, 2, 3]) {
				const log = extractChannelMessages(battle.log.join('\n'), [channel])[channel].join('\n');
				assert(log.includes('|[fainted] OwnBench'), 'viewers and reconnects receive the same public preview');
			}
		});
	}
	it('preserves the marker through battle checkpoint restoration and does not select a fainted lead', () => {
		start();
		battle.makeChoices('team 231', 'team 12');
		assert.equal(battle.p1.active[0].name, 'OwnLead');
		assert.equal(battle.p1.pokemon.find(mon => mon.name === 'OwnBench').fainted, true);
		const restored = Battle.fromJSON(JSON.stringify(battle));
		try {
			assert.deepEqual(restored.log, battle.log);
			assert.equal(restored.p1.pokemon.find(mon => mon.name === 'OwnBench').hp, 0);
			assert.equal(restored.p1.pokemonLeft, 2);
		} finally { restored.destroy(); }
	});
	it('starts a healed party with normal icons and unchanged PP and health', () => {
		const state = start('gen9fantasyrogue', true);
		assert(!battle.log.some(line => line.includes('|[fainted]')));
		assert.equal(battle.p1.pokemon[0].hp, state.team[0].hp);
		assert.equal(battle.p1.pokemon[0].moveSlots[0].pp, state.team[0].pp[0].pp);
	});
	for (const format of ['gen9ou', 'gen9doublesou', 'gen9fcag']) {
		it(`leaves ordinary ${format} team previews unchanged`, () => {
			start(format);
			assert(!battle.log.some(line => line.includes('|[fainted]')));
			assert.equal(battle.p1.pokemonLeft, 3);
		});
	}
});
