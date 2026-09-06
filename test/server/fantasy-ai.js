'use strict';

const assert = require('assert').strict;
const common = require('../common');
const { Teams } = require('../../dist/sim/teams');
const { TrainerRegistry, getTrainerFormat, validatePlayerTeam } = require('../../dist/server/fantasy-ai/trainers');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { captureInitialTeam } = require('../../dist/server/fantasy-ai/initial-snapshot');
const { enumerateRequestChoices } = require('../../dist/server/fantasy-ai/actions');
const samples = require('../../config/fantasy-ai-trainers.example.json');

const sample = samples[0];
const enabled = { enabled: true, allowDevelopmentTrainers: true };
const sampleTeam = () => Teams.import(sample.team);

describe('Fantasy AI trainer configuration', () => {
	it('starts closed and does not expose development trainers in production', () => {
		assert.deepEqual(new TrainerRegistry([]).list(), []);
		assert.deepEqual(new TrainerRegistry(samples).list(), []);
		assert.deepEqual(new TrainerRegistry(samples, { enabled: true }).list(), []);
		assert.equal(new TrainerRegistry(samples, enabled).list().length, 1);
		assert.equal(new TrainerRegistry([{ ...sample, developmentOnly: false }], { enabled: true }).list().length, 1);
	});

	it('validates the example using actual FC legality and returns detached metadata', () => {
		const registry = new TrainerRegistry(samples, enabled);
		assert.deepEqual(registry.getDiagnostics(), []);
		const trainer = registry.get(sample.id);
		assert.equal(Teams.unpack(trainer.packedTeam).length, 6);
		assert.equal(registry.list()[0].packedTeam, undefined);
		assert.equal(registry.list()[0].team, undefined);
		trainer.keyMembers.push(1);
		trainer.resourcePreferences.push('mega');
		assert.deepEqual(registry.get(sample.id).keyMembers, [6]);
		assert.deepEqual(registry.get(sample.id).resourcePreferences, ['terastallize']);
		assert.equal(registry.get('missing'), undefined);
	});

	for (const format of [
		'gen9ou', 'gen9fcrandombattle', 'gen9fcrumax9pick6', 'gen9fcchampionssinglesa',
		'gen9fcchampionsdoublescdoublemega', 'gen9fcfreeforall', 'gen9fccustomgame',
		'gen9fcag@@@Max Team Size = 9', 'missing',
	]) {
		it(`rejects unsupported format ${format}`, () => {
			assert.throws(() => getTrainerFormat(format));
			const registry = new TrainerRegistry([{ ...sample, format }], enabled);
			assert.deepEqual(registry.list(), []);
			assert.equal(registry.getDiagnostics().length, 1);
		});
	}

	for (const [description, changes] of [
		['short teams', { team: Teams.export(sampleTeam().slice(0, 5)) }],
		['oversized teams', { team: sample.team + '\n\nPikachu\nAbility: Static\n- Thunderbolt' }],
		['more than four moves', { team: sample.team + '\n- Protect' }],
		['illegal moves', { team: sample.team.replace('- Psychic', '- Definitely Not A Move') }],
		['illegal format-specific teams', { format: 'gen9fclc' }],
		['empty teams', { team: '' }],
		['invalid identifiers', { id: '../trainer' }],
		['protocol injection in names', { name: 'AI\n|win|AI' }],
		['invalid styles', { style: 'omniscient' }],
		['invalid key members', { keyMembers: [0, 7] }],
		['duplicate key members', { keyMembers: [2, 2] }],
		['invalid resources', { resourcePreferences: ['dynamax'] }],
		['non-boolean development flags', { developmentOnly: 'false' }],
	]) {
		it(`quarantines ${description} without replacing the team`, () => {
			const registry = new TrainerRegistry([{ ...sample, ...changes }], enabled);
			assert.deepEqual(registry.list(), []);
			assert.equal(registry.getDiagnostics().length, 1);
			assert(registry.getDiagnostics()[0].problems[0]);
		});
	}

	it('quarantines both duplicate IDs while retaining other valid trainers', () => {
		const registry = new TrainerRegistry([sample, { ...sample }, { ...sample, id: 'another' }], enabled);
		assert.deepEqual(registry.list().map(trainer => trainer.id), ['another']);
		assert.equal(registry.getDiagnostics().length, 2);
	});

	it('uses the same six-member legality requirements for the submitted player team', () => {
		const good = validatePlayerTeam(sample.format, Teams.pack(sampleTeam()));
		assert.deepEqual(good.problems, []);
		assert(good.packedTeam);
		const bad = validatePlayerTeam(sample.format, Teams.pack(sampleTeam().slice(0, 2)));
		assert(bad.problems.length);
		assert.equal(bad.packedTeam, undefined);
		assert(validatePlayerTeam('gen9fccustomgame', Teams.pack(sampleTeam())).problems.length);
	});
});

describe('Fantasy AI information boundary', () => {
	let battle;

	beforeEach(() => {
		battle = common.createBattle({ formatid: sample.format }, [sampleTeam(), sampleTeam()]);
	});

	afterEach(() => battle.destroy());

	it('captures only initial configuration and exact initial stats, with no team-slot linkage', () => {
		const before = JSON.stringify(battle);
		const snapshot = captureInitialTeam(battle, 'p2');
		assert.equal(JSON.stringify(battle), before);
		assert.equal(snapshot.length, 6);
		assert.deepEqual(Object.keys(snapshot[0]).sort(), ['ability', 'item', 'level', 'moves', 'species', 'stats', 'teraType']);
		const mew = snapshot.find(mon => mon.species === 'Mew');
		assert.deepEqual(mew.stats, battle.p2.pokemon[0].baseStoredStats);
		const other = common.createBattle({ formatid: sample.format }, [sampleTeam(), sampleTeam().reverse()]);
		try {
			assert.deepEqual(captureInitialTeam(other, 'p2'), snapshot);
		} finally {
			other.destroy();
		}
		battle.makeChoices();
		assert.throws(() => captureInitialTeam(battle, 'p2'), /队伍预览/);
		assert(!battle.log.join('\n').includes(JSON.stringify(snapshot)));
	});

	it('requires a complete snapshot only in hard mode and never exposes it in normal mode', () => {
		const snapshot = captureInitialTeam(battle, 'p2');
		assert.throws(() => new InformationView({ ownSide: 'p1', difficulty: 'hard', initialOpponent: [] }));
		const normal = new InformationView({ ownSide: 'p1', difficulty: 'normal', initialOpponent: snapshot });
		assert.equal(normal.observe(battle.p1.activeRequest).initialOpponent, undefined);
		assert.throws(() => normal.observe(battle.p2.activeRequest), /对手/);
	});

	for (const difficulty of ['normal', 'hard']) {
		it(`${difficulty}: ignores opponent pending choices, hidden state and battle RNG changes`, () => {
			const view = new InformationView({ ownSide: 'p1', difficulty, initialOpponent: captureInitialTeam(battle, 'p2') });
			battle.makeChoices();
			view.receiveUpdate(battle.log.join('\n'));
			const before = view.observe(battle.p1.activeRequest);
			battle.p2.choose('move 1');
			battle.prng.random();
			battle.p2.active[0].hp--;
			battle.p2.active[0].moveSlots[0].pp--;
			battle.p2.active[0].item = 'choicescarf';
			battle.p2.active[0].ability = 'pressure';
			battle.p2.active[0].m.privateAIForbidden = true;
			assert.deepEqual(view.observe(battle.p1.activeRequest), before);
			battle.p2.clearChoice();
			battle.p2.choose('switch 2');
			assert.deepEqual(view.observe(battle.p1.activeRequest), before);
		});

		it(`${difficulty}: retains only shared protocol data and the AI's own request`, () => {
			const view = new InformationView({ ownSide: 'p1', difficulty, initialOpponent: captureInitialTeam(battle, 'p2') });
			view.receiveUpdate([
				'|split|p2', '|-damage|p2a: Mew|317/404', '|-damage|p2a: Mew|79/100',
				'|request|{"private":"forbidden"}', '|debug|hidden-item', '|c|user|fake-move',
				'|-ability|p2a: Mew|Pressure', '|move|p2a: Mew|Psychic|p1a: Mew',
			].join('\n'));
			const observed = view.observe(battle.p1.activeRequest);
			assert.deepEqual(observed.publicLog, [
				'|-damage|p2a: Mew|79/100', '|-ability|p2a: Mew|Pressure', '|move|p2a: Mew|Psychic|p1a: Mew',
			]);
			assert(!JSON.stringify(observed).includes('317/404'));
			if (difficulty === 'hard') {
				assert.equal(observed.initialOpponent.find(mon => mon.species === 'Mew').ability, 'synchronize');
			}
		});
	}

	it('does not alias snapshots, requests or public logs across the boundary', () => {
		const snapshot = captureInitialTeam(battle, 'p2');
		const view = new InformationView({ ownSide: 'p1', difficulty: 'hard', initialOpponent: snapshot });
		const before = view.observe(battle.p1.activeRequest);
		snapshot[0].stats.hp = -10;
		const observed = view.observe(battle.p1.activeRequest);
		observed.initialOpponent[0].moves.push('forbidden');
		observed.request.side.pokemon[0].stats.atk = -10;
		observed.publicLog.push('|win|forbidden');
		assert.deepEqual(view.observe(battle.p1.activeRequest), before);
	});

	it('rejects incomplete split packets before recording any private health', () => {
		const view = new InformationView({ ownSide: 'p1', difficulty: 'normal' });
		assert.throws(() => view.receiveUpdate('|turn|1\n|split|p2\n|-damage|p2a: Mew|317/404'), /完整/);
		assert.deepEqual(view.observe(battle.p1.activeRequest).publicLog, []);
	});

	it('drops unrecognized private fields attached to an otherwise valid own request', () => {
		const view = new InformationView({ ownSide: 'p1', difficulty: 'normal' });
		const request = structuredClone(battle.p1.activeRequest);
		request.opponent = { hp: 'forbidden' };
		request.side.pokemon[0].opponent = { item: 'forbidden' };
		assert(!JSON.stringify(view.observe(request)).includes('forbidden'));
	});

	it('does not associate an Illusion disguise with its internal team position', () => {
		battle.destroy();
		const opposing = sampleTeam();
		opposing[0] = { species: 'Zoroark', ability: 'Illusion', moves: ['splash'] };
		battle = common.createBattle({ formatid: sample.format }, [sampleTeam(), opposing]);
		const view = new InformationView({ ownSide: 'p1', difficulty: 'hard', initialOpponent: captureInitialTeam(battle, 'p2') });
		battle.makeChoices();
		assert(battle.p2.active[0].illusion);
		view.receiveUpdate(battle.log.join('\n'));
		const observation = view.observe(battle.p1.activeRequest);
		const switches = observation.publicLog.filter(line => line.startsWith('|switch|p2'));
		assert(switches[0].includes('Weavile'));
		assert(!switches[0].includes('Zoroark'));
		for (const mon of observation.initialOpponent) {
			assert.equal(mon.ident, undefined);
			assert.equal(mon.position, undefined);
			assert.equal(mon.active, undefined);
		}
	});
});

describe('Fantasy AI action enumeration', () => {
	let battle;

	afterEach(() => {
		if (battle) battle.destroy();
		battle = null;
	});

	function create(first, start = true) {
		const team = sampleTeam();
		if (first) team[0] = first;
		battle = common.createBattle({ formatid: sample.format }, [team, sampleTeam()]);
		if (start) battle.makeChoices();
		return battle.p1.activeRequest;
	}

	function assertAccepted(choices) {
		for (const choice of choices) {
			assert(battle.p1.choose(choice), choice);
			assert(battle.p1.isChoiceDone(), choice);
			battle.p1.clearChoice();
		}
	}

	it('enumerates all six-member preview orders accepted by the engine', () => {
		const request = create(null, false);
		const choices = enumerateRequestChoices(request);
		assert.equal(new Set(choices).size, 720);
		assertAccepted(choices);
	});

	for (const [mechanic, first, suffix] of [
		['Mega X', { species: 'Mewtwo-Fantasy', ability: 'Pressure', item: 'Mewtwonite X', moves: ['splash'] }, 'mega'],
		['Mega Y', { species: 'Mewtwo-Fantasy', ability: 'Pressure', item: 'Mewtwonite Y', moves: ['splash'] }, 'mega'],
		['Z moves', { species: 'Mew', ability: 'Synchronize', item: 'Psychium Z', moves: ['psychic'] }, 'zmove'],
		['Terastallization', { species: 'Mew', ability: 'Synchronize', teraType: 'Water', moves: ['psychic'] }, 'terastallize'],
		['Aura Burst', { species: 'Marowak-Alola-Fantasy', ability: 'Rock Head', item: 'Firium Z', moves: ['flamewheel'] }, 'ultra'],
	]) {
		it(`enumerates ${mechanic} as separate engine-valid actions`, () => {
			const request = create(first);
			const before = JSON.stringify(battle);
			const choices = enumerateRequestChoices(request);
			assert(choices.includes(`move 1 ${suffix}`));
			assert.equal(JSON.stringify(battle), before);
			assertAccepted(choices);
			assert(choices.every(choice => choice.split(' ').length <= 3));
		});
	}

	it('respects exhausted PP, Struggle and known trapping', () => {
		create({ species: 'Mew', ability: 'Synchronize', moves: ['psychic'] });
		battle.p1.active[0].moveSlots[0].pp = 0;
		battle.makeRequest('move');
		assert.equal(battle.p1.activeRequest.active[0].moves[0].id, 'struggle');
		let choices = enumerateRequestChoices(battle.p1.activeRequest);
		assertAccepted(choices);
		const request = structuredClone(battle.p1.activeRequest);
		request.active[0].trapped = true;
		choices = enumerateRequestChoices(request);
		assert.deepEqual(choices, ['move 1']);
	});

	it('handles forced replacement without selecting active or fainted team members', () => {
		create({ species: 'Mew', ability: 'Synchronize', moves: ['uturn'] });
		battle.makeChoices('move 1', 'move 2');
		assert.equal(battle.requestState, 'switch');
		const choices = enumerateRequestChoices(battle.p1.activeRequest);
		assert.deepEqual(choices, ['switch 2', 'switch 3', 'switch 4', 'switch 5', 'switch 6']);
		assertAccepted(choices);
		const request = structuredClone(battle.p1.activeRequest);
		request.side.pokemon[2].condition = '0 fnt';
		assert(!enumerateRequestChoices(request).includes('switch 3'));
		request.side.pokemon[0].reviving = true;
		assert.deepEqual(enumerateRequestChoices(request), ['switch 3']);
	});

	it('does not use an already-consumed Aura Burst or Z resource', () => {
		create({ species: 'Marowak-Alola-Fantasy', ability: 'Rock Head', item: 'Firium Z', moves: ['flamewheel'] });
		battle.makeChoices('move 1 ultra', 'move 2');
		const choices = enumerateRequestChoices(battle.p1.activeRequest);
		assert(battle.p1.zMoveUsed);
		assert(!choices.some(choice => / (ultra|zmove)$/.test(choice)));
		assertAccepted(choices);
	});

	it('does nothing while waiting and rejects unsupported request structures', () => {
		const request = create();
		assert.deepEqual(enumerateRequestChoices({ wait: true, side: request.side }), []);
		assert.throws(() => enumerateRequestChoices({ ...request, active: [request.active[0], request.active[0]] }));
		assert.throws(() => enumerateRequestChoices({ teamPreview: true, side: request.side, maxChosenTeamSize: 3 }));
	});
});
