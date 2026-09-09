'use strict';

const { Battle, Dex } = require('../../dist/sim');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { readBattleMemory, ownSeen } = require('../../dist/server/fantasy-ai/memory');
const fixture = require('./fantasy-ai-replay-7947.json');
const dex = Dex.forFormat('gen9fcuu');
const SEED = 'gen5,0011001200130014';

/** Replay requests are unavailable. Rebuild only our known roster, with rounded public HP. */
function observationAt(turn, beforeReplacement = false) {
	const end = fixture.publicLog.indexOf(`|turn|${turn}`);
	if (end < 0) throw new Error(`Missing replay turn ${turn}`);
	let log = fixture.publicLog.slice(0, end + 1);
	if (beforeReplacement) {
		const replacement = log.findLastIndex(line => line.startsWith('|switch|p2'));
		log = log.slice(0, replacement);
	}
	const memory = readBattleMemory(log, dex);
	const battle = new Battle({ formatid: 'gen9fcuu', seed: SEED,
		p1: { team: [{ species: 'Mew', ability: 'Synchronize', moves: ['protect'] }] },
		p2: { team: structuredClone(fixture.ownTeam) },
	});
	try {
		battle.makeChoices('team 1', 'team 123456');
		const activeName = memory.sides.p2.active.ident.split(': ')[1];
		const team = battle.p2.pokemon;
		const index = team.findIndex(mon => mon.name === activeName);
		[team[0], team[index]] = [team[index], team[0]];
		battle.p2.active[0] = team[0];
		for (const [position, mon] of team.entries()) {
			mon.position = position;
			mon.isActive = mon.isStarted = position === 0;
			const seen = ownSeen(memory, 'p2', `p2: ${mon.name}`, position === 0);
			if (seen) {
				if (seen.fantasy?.baseAbility) mon.baseAbility = mon.ability = seen.fantasy.baseAbility;
				if (position === 0 || dex.species.get(seen.species).isMega) mon.setSpecies(dex.species.get(seen.species));
				mon.hp = Math.ceil(mon.maxhp * seen.health.upper);
				mon.fainted = !mon.hp;
				mon.status = mon.fainted ? 'fnt' : seen.status;
				if (position === 0) {
					Object.assign(mon.boosts, seen.boosts);
					if (seen.ability !== undefined) mon.ability = seen.ability;
					if (seen.types) mon.setType(seen.types, true);
				}
				mon.item = seen.item ?? mon.item;
				mon.terastallized = seen.teraType || '';
				for (const slot of mon.moveSlots) slot.pp = Math.max(0, slot.maxpp - (seen.moveUses[slot.id] || 0));
			}
			if (memory.sides.p2.resources.tera) mon.canTerastallize = null;
			if (memory.sides.p2.resources.mega) mon.canMegaEvo = null;
			mon.details = mon.getUpdatedDetails();
		}
		battle.makeRequest('move');
		const view = new InformationView({ ownSide: 'p2', difficulty: 'normal' });
		view.receiveUpdate(log.join('\n'));
		return view.observe(beforeReplacement ? { side: battle.p2.activeRequest.side, forceSwitch: [true] } :
			battle.p2.activeRequest);
	} finally {
		battle.destroy();
	}
}

module.exports = { ...fixture, observationAt, SEED };
