'use strict';

const assert = require('assert').strict;
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { Dex } = require('../../dist/sim/dex');
const { rankMultiChoices } = require('../../dist/server/fantasy-ai/multi-policy');
const { RogueCoopController } = require('../../dist/server/fantasy-rogue/coop-controller');

describe('Fantasy Rogue joint NPC multi decisions', () => {
	let battle;
	afterEach(() => battle?.destroy());
	const mon = (species, moves, item = '') => ({
		species, moves, item, level: 50, ability: Dex.mod('gen9fantasy').species.get(species).abilities['0'],
	});
	function start(left = [mon('Pikachu', ['Thunderbolt', 'Protect'])],
		right = [mon('Raichu', ['Thunderbolt', 'Protect'])], extra = {}) {
		battle = new Battle({
			format: new Format({ name: 'Multi policy test', mod: 'gen9fantasy', gameType: 'multi', ruleset: [] }),
			strictChoices: true, seed: [1, 2, 3, 4],
			p1: { team: [mon('Charizard', ['Splash'])] }, p2: { team: left },
			p3: { team: [mon('Gastrodon', ['Splash'])] }, p4: { team: right }, ...extra,
		});
		// Isolate coordinated move selection from the separately tested transformation branch.
		for (const seat of ['p2', 'p4']) battle[seat].activeRequest.active[0].canTerastallize = false;
		return requests();
	}
	const requests = () => JSON.parse(JSON.stringify({ p2: battle.p2.activeRequest, p4: battle.p4.activeRequest }));
	const log = () => extractChannelMessages(battle.log.join('\n'), [0])[0];
	function nativeAccepts(scored) {
		assert(scored.length);
		for (const entry of scored) for (const seat of ['p2', 'p4']) {
			assert(battle[seat].choose(entry.commands[seat]), `${seat}: ${entry.commands[seat]}`);
			battle[seat].clearChoice();
		}
	}
	function controller() {
		const writes = [], room = {
			options: { fantasyRogue: { wild: false } },
			stream: { write: chunk => { writes.push(chunk); } },
			p2: { isAI: true, request: { rqid: 2, isWait: false, choice: '' } },
			p4: { isAI: true, request: { rqid: 4, isWait: false, choice: '' } },
		};
		// These are deliberately inaccessible: the controller has no need for either human request.
		for (const key of ['p1', 'p3']) Object.defineProperty(room, key, { get: () => { throw new Error('Human private state'); } });
		Object.defineProperty(room.stream, 'battle', { get: () => { throw new Error('Simulator private state'); } });
		const ai = new RogueCoopController(room);
		ai.update(battle.log.join('\n'));
		return { ai, room, writes };
	}

	it('coordinates both enemies against the vulnerable human slot without mutating native requests', () => {
		const input = start(), before = JSON.stringify(input);
		const scored = rankMultiChoices(input, log(), 'gen9fantasy', { allowSwitch: false });
		nativeAccepts(scored);
		assert.equal(scored[0].commands.p2, 'move 1 1');
		assert.equal(scored[0].commands.p4, 'move 1 1');
		assert.equal(JSON.stringify(input), before);
	});
	it('keeps identical nicknames separate and translates each native reserve index only for scoring', () => {
		const a = mon('Pikachu', ['Thunderbolt', 'Protect']); a.name = 'Twin';
		const b = mon('Indeedee-F', ['Helping Hand', 'Protect']); b.name = 'Twin';
		const input = start([a, mon('Garchomp', ['Earthquake'])], [b, mon('Gengar', ['Shadow Ball'])]);
		const scored = rankMultiChoices(input, log(), 'gen9fantasy');
		nativeAccepts(scored);
		assert(scored.some(entry => entry.commands.p4 === 'move 1 -1' && entry.reasons.includes('helping-hand-synergy')));
		assert(scored.some(entry => entry.commands.p2 === 'switch 2' && entry.commands.p4 === 'switch 2'));
		assert(!scored.some(entry => Object.values(entry.commands).some(command => /^switch [3-9]/.test(command))));
	});
	it('preserves native per-player transformation budgets in Multi', () => {
		const input = start([mon('Gardevoir', ['Moonblast'], 'Gardevoirite')],
			[mon('Gengar', ['Shadow Ball'], 'Gengarite')]);
		const scored = rankMultiChoices(input, log(), 'gen9fantasy');
		nativeAccepts(scored);
		assert(scored.some(entry => entry.commands.p2.includes(' mega') && entry.commands.p4.includes(' mega')));
	});
	it('waits for the complete request batch and commits the joint decision once', () => {
		const input = start(), { ai, writes, room } = controller();
		ai.request('p2', input.p2, 2);
		assert.equal(writes.length, 0);
		ai.request('p4', input.p4, 4);
		assert.equal(writes.length, 0);
		ai.flush();
		assert.equal(writes.length, 1);
		assert.equal(writes[0], '>p2 move 1 1\n>p4 move 1 1');
		assert(ai.lastDecision.joint);
		assert(room.p2.request.isWait && room.p4.request.isWait);
		ai.flush();
		assert.equal(writes.length, 1);
	});
	it('retains a restored partner choice and retries only the rejected seat', () => {
		const input = start(), { ai, writes, room } = controller();
		room.p4.request.choice = 'move 2';
		room.p4.request.isWait = true;
		ai.request('p4', input.p4, 4);
		ai.request('p2', input.p2, 2);
		ai.flush();
		assert.equal(writes.length, 1);
		assert(!writes[0].includes('>p4'));
		assert.equal(room.p4.request.choice, 'move 2');
		const rejected = room.p2.request.choice;
		room.p2.request.request = JSON.stringify(input.p2);
		ai.invalidChoice('p2');
		ai.flush();
		assert.equal(writes.length, 2);
		assert(!writes[1].includes('>p4'));
		assert.notEqual(room.p2.request.choice, rejected);
		assert(battle.p2.choose(room.p2.request.choice));
	});
	it('handles a forced replacement while the other enemy waits and never chooses its reserve', () => {
		start([mon('Pikachu', ['Thunderbolt']), mon('Garchomp', ['Earthquake'])]);
		const old = requests();
		battle.p2.active[0].faint();
		battle.faintMessages();
		battle.p2.active[0].switchFlag = true;
		battle.makeRequest('switch');
		const { ai, room, writes } = controller();
		room.p4.request.isWait = true;
		ai.request('p4', old.p4, 4);
		ai.request('p2', battle.p2.activeRequest, 2);
		ai.flush();
		assert.deepEqual(writes, ['>p2 switch 2']);
		assert(battle.p2.choose('switch 2'));
		assert(ai.lastDecision.joint);
	});
	for (const fainted of [false, true]) it(`keeps ${fainted ? 'fainted' : 'pivoting'} replacements outside an attacking turn`, () => {
		const cached = start([mon('Pikachu', ['Thunderbolt']), mon('Garchomp', ['Earthquake'])]);
		if (fainted) { battle.p2.active[0].faint(); battle.faintMessages(); }
		battle.p2.active[0].switchFlag = true;
		battle.makeRequest('switch');
		const ranked = rankMultiChoices({ p2: battle.p2.activeRequest, p4: cached.p4 }, log(), 'gen9fantasy',
			{ jointTurns: true, fixed: { p4: null } });
		assert(ranked.length);
		assert.equal(ranked[0].commands.p2, 'switch 2');
		assert.equal(ranked[0].commands.p4, 'pass');
		assert(battle.p2.choose(ranked[0].commands.p2));
		assert.equal(ranked[0].mechanics.turnProbes, 0);
		assert.deepEqual(ranked[0].mechanics.turnFailures, []);
	});
	it('does not resubmit a stale request or act after finish', () => {
		const input = start(), { ai, room, writes } = controller();
		ai.request('p2', input.p2, 2);
		room.p2.request.rqid = 8;
		ai.flush();
		assert.equal(writes.length, 0);
		ai.request('p2', input.p2, 8);
		ai.finish();
		ai.flush();
		assert.equal(writes.length, 0);
	});
	it('uses a public faint to remove a waiting partner from spread damage evaluations', () => {
		const input = start([mon('Garchomp', ['Earthquake'])], [mon('Gardevoir', ['Protect'])]);
		const scored = rankMultiChoices(input, [...log(), '|faint|p4b: Gardevoir'], 'gen9fantasy', { fixed: { p4: null } });
		assert(scored.length);
		assert.equal(scored[0].commands.p2, 'move 1');
		assert(!scored[0].reasons.includes('friendly-fire-risk'));
	});
	it('ignores the private branch of split health updates', () => {
		const input = start(), { ai, room, writes } = controller();
		ai.update('|split|p1\n|-damage|p1a: Charizard|1/999 par\n|-damage|p1a: Charizard|100/100');
		ai.request('p2', input.p2, 2); ai.request('p4', input.p4, 4); ai.flush();
		const first = writes[0];
		room.p2.request.isWait = room.p4.request.isWait = false;
		ai.update('|split|p1\n|-damage|p1a: Charizard|998/999 brn\n|-damage|p1a: Charizard|100/100');
		ai.request('p2', input.p2, 2); ai.request('p4', input.p4, 4); ai.flush();
		assert.equal(writes[1], first);
	});
	it('accepts an Illusion replacement without an HP field and keeps the public health it already saw', () => {
		const input = start(), { ai, writes } = controller();
		const reveal = '|-damage|p1a: Charizard|25/100 brn\n|replace|p1a: Zoroark|Zoroark, L50';
		assert.doesNotThrow(() => ai.update(reveal));
		ai.request('p2', input.p2, 2); ai.request('p4', input.p4, 4); ai.flush();
		assert.equal(writes.length, 1);
		assert(ai.lastDecision.joint);
		assert.equal(ai.lastDecision.error, undefined);
		const withoutHealth = rankMultiChoices(input, [...log(), ...reveal.split('\n')], 'gen9fantasy');
		const explicitHealth = rankMultiChoices(input, [...log(), ...`${reveal}|25/100 brn`.split('\n')], 'gen9fantasy');
		assert.deepEqual(withoutHealth, explicitHealth);
	});
});
