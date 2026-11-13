'use strict';

const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { rankDoublesChoices } = require('../../dist/server/fantasy-ai/doubles-policy');
const mon = (species, ability, moves, item = '') => ({ species, ability, moves, item, level: 50 });

describe('Fantasy doubles Skill Swap support', () => {
	let battle;
	afterEach(() => battle?.destroy());
	function create(target = mon('Regigigas', 'Slow Start', ['Body Slam', 'Protect']), item = '') {
		battle = new Battle({ format: new Format({ name: 'Skill Swap support', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
			strictChoices: true, seed: [1, 2, 3, 4],
			p1: { team: [mon('Blissey', 'Natural Cure', ['Splash']), mon('Chansey', 'Natural Cure', ['Splash'])] },
			p2: { team: [mon('Cresselia', 'Levitate', ['Skill Swap', 'Psychic'], item), target] },
		});
		for (const side of battle.sides) for (const active of side.activeRequest.active) delete active.canTerastallize;
	}
	function ranked(extra = []) {
		return rankDoublesChoices({ ownSide: 'p2', difficulty: 'normal', request: battle.p2.activeRequest,
			publicLog: [...extractChannelMessages(battle.log.join('\n'), [0])[0], ...extra] }, 'gen9fantasy', [], false);
	}
	const candidate = choice => ranked().find(row => row.choice === choice);
	it('actually frees its allied physical attacker and does not trade Slow Start back next turn', () => {
		create();
		assert(ranked()[0].choice.startsWith('move 1 -2,'), ranked()[0].choice);
		assert(candidate('move 1 -2, move 1 1').reasons.includes('skill-swap-release-attacker'));
		battle.makeChoices('move 1, move 1', ranked()[0].choice);
		assert.equal(battle.p2.active[1].ability, 'levitate');
		assert.equal(battle.p2.active[1].volatiles.slowstart, undefined);
		assert.equal(battle.p2.active[0].ability, 'slowstart');
		assert(!ranked()[0].choice.startsWith('move 1 -2,'));
		assert(candidate('move 1 -2, move 1 1').reasons.includes('skill-swap-no-proven-benefit'));
	});
	it('does not count support through the partner Protect or by inventing an opposing ability', () => {
		create();
		assert(candidate('move 1 -2, move 2').reasons.includes('skill-swap-partner-unavailable'));
		assert(!candidate('move 1 1, move 1 1').reasons.includes('skill-swap-release-attacker'));
		battle.makeChoices('move 1, move 1', 'move 1 -2, move 2');
		assert.equal(battle.p2.active[1].ability, 'slowstart');
	});
	it('does not swap after Slow Start has already expired', () => {
		create();
		const expired = ranked(['|-end|p2b: Regigigas|Slow Start']);
		assert(!expired.find(row => row.choice === 'move 1 -2, move 1 1').reasons.includes('skill-swap-release-attacker'));
	});
	for (const shieldOwner of ['source', 'target']) it(`respects ${shieldOwner} Ability Shield in native execution`, () => {
		create(mon('Regigigas', 'Slow Start', ['Body Slam', 'Protect'], shieldOwner === 'target' ? 'Ability Shield' : ''),
			shieldOwner === 'source' ? 'Ability Shield' : '');
		assert(candidate('move 1 -2, move 1 1').reasons.includes('skill-swap-blocked'));
		battle.makeChoices('move 1, move 1', 'move 1 -2, move 1 1');
		assert.equal(battle.p2.active[1].ability, 'slowstart');
	});
	it('respects abilities whose native flags prohibit Skill Swap', () => {
		create(mon('Aegislash', 'Stance Change', ['Shadow Ball', 'Protect']));
		assert(candidate('move 1 -2, move 1 1').reasons.includes('skill-swap-blocked'));
		battle.makeChoices('move 1, move 1', 'move 1 -2, move 1 1');
		assert.equal(battle.p2.active[1].ability, 'stancechange');
	});
});
