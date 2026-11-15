'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim');
const { Format } = require('../../dist/sim/dex-formats');
const { set, stats } = require('../fixtures/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { blessing } = require('../../dist/sim/rogue-blessing-data');

describe('Robe and draining ability presentation', function () {
	this.timeout(10000);
	for (const supplied of ['native', 'blood-robe']) {
		for (const knockout of [false, true]) {
			for (const owner of ['p1', 'p2']) {
				if (supplied === 'blood-robe' && owner === 'p2') continue;
				it(`${supplied}: attributes healing to ${owner}, after ${knockout ? 'a multi-hit KO' : 'damage'}`, () => {
					const team = [createRoguePokemon(set('Zangoose', supplied === 'native' ? 'Ji Qu Su Sheng' : 'Immunity', 50,
						[knockout ? 'Double Kick' : 'Dragon Rage']), stats(0))];
					const foe = [set('Audino', 'Healer', 50, ['Splash'])];
					const blood = supplied === 'blood-robe';
					const battle = new Battle({ seed: [1, 2, 3, 4],
						...(blood ? { formatid: 'gen9fantasyrogue', fantasyRogue: {
							encounterId: 'robe-log', team, boosts: stats(0), bag: {}, balls: [], catchable: false,
							blessings: { owned: [{ id: 'godrobe', family: 'godrobe', floor: 50 }] },
						} } : { format: new Format({ name: 'Draining display test', mod: 'gen9fantasy', ruleset: [] }) }),
						p1: { name: 'First', team: owner === 'p1' ? team.map(mon => mon.set) : foe },
						p2: { name: 'Second', team: owner === 'p2' ? team.map(mon => mon.set) : foe },
					});
					try {
						if (blood) battle.makeChoices('team 1', 'team 1');
						const mon = battle[owner].active[0], enemy = mon.side.foe.active[0];
						mon.hp = 1;
						if (knockout) enemy.hp = 30;
						const before = enemy.hp;
						battle.makeChoices('move 1', 'move 1');
						const damage = before - enemy.hp;
						assert.equal(mon.hp, 1 + Math.min(mon.maxhp - 1, Math.floor(damage / 3)));
						if (knockout) assert(enemy.fainted);
						const heal = battle.log.find(line => line.startsWith(`|-heal|${owner}a: Zangoose|`));
						assert(heal, battle.log.join('\n'));
						assert(heal.endsWith('|[from] ability: Ji Qu Su Sheng'), heal);
						assert(!battle.log.some(line => line.startsWith('|-ability|')), 'healing does not acquire or replace an ability');
						assert.equal(mon.ability, blood ? 'immunity' : 'jiqususheng');
					} finally { battle.destroy(); }
				});
			}
		}
	}
	it('documents the blue-black appearance without removing any blood-robe rules', () => {
		const text = blessing('godrobe').text;
		for (const phrase of ['蓝黑色', '锋锐', '汲取苏生', '10%', '+50%', '50% HP', '×6', '+60%', '15%']) assert(text.includes(phrase));
	});
});
