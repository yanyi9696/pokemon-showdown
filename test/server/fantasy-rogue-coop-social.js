'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { content, firstEventRoute } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative social meetings', () => {
	let oldConfig, store, engine, manager, host, guest, created, preview;
	let serial = 0, oldNow, now, oldRandom;
	before(() => { preview = createPreviewContent(); });
	beforeEach(() => {
		oldNow = Date.now; now = oldNow(); Date.now = () => now;
		oldRandom = crypto.randomInt;
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true; fixture.events = true;
		fixture.items = [...fixture.items, ...preview.items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		for (const id of Object.keys(preview.unlocks)) {
			fixture.unlocks[id] = structuredClone(preview.unlocks[id]);
			if (!fixture.starters.some(entry => entry.id === fixture.unlocks[id].starter)) {
				fixture.starters.push(structuredClone(preview.starters.find(entry => entry.id === fixture.unlocks[id].starter)));
			}
		}
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-activity-battles-fixture' };
		} }));
		host = makeUser(`Social Host ${++serial}`, `127.0.85.${serial}`);
		guest = makeUser(`Social Guest ${serial}`, `127.0.86.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: crypto.randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(shared => {
			const round = { floor: 1, tier: 'silver', remaining: 1, familiesSeen: [], idsSeen: ['swapstats'],
				options: [{ id: 'swapstats', tier: 'silver', refreshes: 1, chosen: false }] };
			shared.adventure.coopBlessingRound = round;
			for (const user of [host, guest]) shared.adventure.members[user.id].blessings.round = structuredClone(round);
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'blessingchoice', slot: 0 });
	});
	afterEach(() => {
		Date.now = oldNow; crypto.randomInt = oldRandom;
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const event = user => manager.coop.view(user).session.adventure.coopEvent;
	const choose = (user, value, visit = event(user).key) => manager.coop.command(user, { action: 'eventchoice', value, visit });
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter(id, floor = 61) {
		change(shared => {
			shared.adventure.floor = floor; shared.adventure.phase = 'area-selection';
			for (const user of [host, guest]) shared.adventure.members[user.id].money = 3000;
			shared.areaSelections = { [host.id]: null, [guest.id]: null };
			shared.adventure.routeChoices = [{ id: 'activityroute', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(other => other !== id)
				.map(other => ({ id: other, floor: 1 }));
		});
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'activityroute' });
		});
		assert.equal(event(host).id, id);
	}
	function agree(choice) {
		const key = event(host).key; choose(host, choice, key); choose(guest, choice, key);
	}
	function startBattle() {
		assert.equal(session().adventure.phase, 'battle-selection');
		assert.deepEqual(member(host).coopEvent, member(guest).coopEvent);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		assert(created.rogue.cooperative);
	}
	function result(won = true, turns = 1, retreat = false) {
		const state = created.rogue.state;
		return { encounterId: state.encounterId, won, turns, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag },
			defeated: [], ...(retreat ? { coopExit: 'retreat' } : {}) };
	}
	function settle(won = true, turns = 1, retreat = false) {
		const outcome = result(won, turns, retreat); created.rogue.onResult(outcome); return outcome;
	}
	function meeting(preference) {
		enter('travellermeeting');
		if (preference) {
			const {TRAVELLERS} = require('../../dist/server/fantasy-rogue/traveller-profiles');
			const {RIVALS} = require('../../dist/server/fantasy-rogue/rival-data');
			const person = Object.values(TRAVELLERS).find(p => p.preference === preference && !p.challengeOnly && !(p.id in RIVALS) && p.id !== 'carmine');
			change(shared => {
				shared.adventure.node.event.social.trainer = person.id;
				for (const user of [host, guest]) shared.adventure.members[user.id].coopEvent.social.trainer = person.id;
			});
		}
		return member(host).coopEvent.social.trainer;
	}
	function back() {
		for (const user of [host, guest]) manager.coop.command(user, {action: 'continuebattle'});
		assert.equal(session().adventure.phase, 'route-interaction');
	}
	it('shares the visitor and greeting while retaining separate meeting affinity', () => {
		const visitor = meeting();
		assert.deepEqual(member(host).coopEvent, member(guest).coopEvent);
		assert.deepEqual(event(host).branchOptions, event(guest).branchOptions);
		assert.equal(event(host).rivalPortrait, visitor);
		assert(event(host).paragraphs.length);
		for (const user of [host, guest]) assert.equal(member(user).trainerBonds[visitor].score, 2);
		const saved = session(); manager.coop.view(host); manager.coop.view(guest); assert.deepEqual(session(), saved);
	});
	it('requires shared replies, preserves personal affinity and rejects stale options', () => {
		const visitor = meeting('pokemon');
		change(shared => {
			for (const [index, user] of [host, guest].entries()) {
				(shared.adventure.members[user.id].trainerBonds ||= {})[visitor] = {score: 10 + 20 * index, gifts: [], pending: []};
			}
		});
		const key = event(host).key;
		choose(host, 'pokemon'); assert.equal(member(host).trainerBonds[visitor].score, 10);
		choose(guest, 'pokemon', key);
		assert.equal(member(host).trainerBonds[visitor].score, 13); assert.equal(member(guest).trainerBonds[visitor].score, 33);
		assert.throws(() => choose(host, 'pokemon', key)); assert.throws(() => choose(host, 'join'));
		agree('pokemon'); assert.equal(member(host).coopEvent.social.step, 'invite');
		agree('join');
		for (const user of [host, guest]) assert(member(user).socialCompanions.some(person => person.id === visitor && !person.away));
		assert.equal(member(host).trainerBonds[visitor].score, 16); assert.equal(member(guest).trainerBonds[visitor].score, 36);
	});
	it('shares one supply gift while keeping bags separate', () => {
		meeting('battle'); agree('pokemon');
		const bags = [host, guest].map(user => ({...member(user).bag}));
		let rolls = 0; crypto.randomInt = max => { if (max === 3) { rolls++; return 1; } return oldRandom(max); };
		agree('reward'); assert.equal(rolls, 1);
		for (const [index, user] of [host, guest].entries()) {
			assert.equal(member(user).bag.ether, (bags[index].ether || 0) + 1);
			assert.equal(event(user).stage, 'result');
		}
	});
	it('rolls back both supplies and the dialogue if one bag would overflow', () => {
		meeting('battle'); agree('pokemon');
		change(shared => { shared.adventure.members[guest.id].bag.ether = Number.MAX_SAFE_INTEGER; });
		crypto.randomInt = max => max === 3 ? 1 : oldRandom(max);
		choose(host, 'reward'); const before = session();
		assert.throws(() => choose(guest, 'reward')); assert.deepEqual(session(), before);
	});
	it('shares Mew berry conversion, rolls back both ledgers, and preserves the receipt after reconnect', () => {
		meeting('battle'); agree('pokemon');
		change(shared => {
			shared.adventure.spirit = 'hoopagift'; shared.adventure.spiritVersion = 1;
			for (const [i, user] of [host, guest].entries()) {
				const m = shared.adventure.members[user.id];
				m.bag = { potion: i + 1 }; m.spiritConversions = { old: i ? 'lifeorb' : 'leftovers' };
			}
			shared.adventure.members[guest.id].bag.fantasypowerlens = Number.MAX_SAFE_INTEGER;
		});
		let rolls = 0;
		crypto.randomInt = max => {
			if (max === 3) return 2;
			if (max === 2) { rolls++; return 0; }
			return 0;
		};
		const key = event(host).key;
		choose(host, 'reward', key); const before = session();
		assert.throws(() => choose(guest, 'reward', key)); assert.deepEqual(session(), before);
		assert.equal(rolls, 1, 'one shared conversion even when the second inventory fails');
		change(shared => { delete shared.adventure.members[guest.id].bag.fantasypowerlens; });
		rolls = 0; choose(guest, 'reward', key); assert.equal(rolls, 1);
		for (const [i, user] of [host, guest].entries()) {
			const m = member(user); assert.equal(m.bag.fantasypowerlens, 1); assert(!m.bag.oranberry);
			assert.equal(m.bag.potion, i + 1);
			assert.equal(m.spiritConversions.old, i ? 'lifeorb' : 'leftovers');
			assert.equal(m.spiritConversions[`social:${key}:oranberry`], 'fantasypowerlens');
		}
		const saved = session(); manager = new RogueManager(new RogueEngine(store, engine.content));
		manager.coop.view(host); manager.coop.view(guest); assert.deepEqual(session(), saved);
		assert.throws(() => choose(host, 'reward', key)); assert.deepEqual(session(), saved);
	});
	it('uses each player own companion capacity and does not overwrite existing travellers', () => {
		const visitor = meeting('pokemon');
		change(shared => {
			shared.adventure.members[guest.id].socialCompanions = ['clay', 'nanu'].map(id => ({id, origin: 'event', preferences: 0, counted: []}));
		});
		agree('pokemon'); agree('pokemon'); agree('join');
		assert(member(host).socialCompanions.some(person => person.id === visitor));
		assert.equal(member(guest).companionInvitations.length, 1);
		assert.equal(member(guest).companionInvitations[0].id, visitor);
		assert.deepEqual(member(guest).socialCompanions.map(person => person.id), ['clay', 'nanu']);
		assert.throws(() => manager.coop.command(host, {action: 'companioninvite', owner: guest.id,
			visit: member(guest).companionInvitations[0].key, value: 'clay'}));
		manager.coop.command(guest, {action: 'companioninvite', visit: member(guest).companionInvitations[0].key, value: 'clay'});
		assert(member(guest).socialCompanions.find(person => person.id === 'clay').away);
		assert(member(guest).socialCompanions.some(person => person.id === visitor && !person.away));
	});
	it('keeps either party existing travellers out of the shared candidate pool and preserves reunion dialogue', () => {
		meeting();
		const {socialCandidates} = require('../../dist/server/fantasy-rogue/social-events');
		const {beginCoopSocial} = require('../../dist/server/fantasy-rogue/coop-social');
		const runs = [host, guest].map(user => manager.coop.eventRun(session().adventure, user.id));
		runs[1].socialCompanions = [{id: 'clay', origin: 'event', preferences: 0, counted: []}];
		const candidates = socialCandidates(runs[0], [runs[1]]);
		assert(!candidates.some(person => person.id === 'clay'));
		const index = candidates.findIndex(person => person.id === 'lacey'); assert(index >= 0);
		beginCoopSocial(runs, () => index);
		assert(runs[0].node.event.result.some(line => line.includes('爸爸')));
		assert.deepEqual(runs[0].node.event, runs[1].node.event);
		assert.equal(runs[1].socialCompanions[0].id, 'clay');
	});
	for (const won of [true, false]) it(`settles social sparring after ${won ? 'victory' : 'defeat'} and heals both parties`, () => {
		const visitor = meeting('battle'); agree('battle'); startBattle();
		assert.equal(created.rogue.state.catchable, false);
		const outcome = result(won);
		for (const team of [outcome.team, outcome.partnerTeam]) {
			team[0].hp = 0; team[0].status = 'brn'; team[0].pp[0].pp = 0;
		}
		created.rogue.onResult(outcome); const saved = session(); created.rogue.onResult(outcome); assert.deepEqual(session(), saved);
		back();
		for (const user of [host, guest]) {
			assert.equal(member(user).team[0].hp, member(user).team[0].maxhp);
			assert.equal(member(user).team[0].status, ''); assert.equal(member(user).team[0].pp[0].pp, member(user).team[0].pp[0].maxpp);
		}
		if (won) { assert(event(host).branchOptions.some(option => option.id === 'join')); agree('join');
			assert(member(guest).socialCompanions.some(person => person.id === visitor));
		} else assert.equal(event(host).stage, 'result');
	});
	it('preserves the same sparring encounter on retreat and resumes it without awarding affinity', () => {
		const visitor = meeting('battle'); agree('battle'); startBattle();
		const encounters = session().adventure.node.encounters;
		const score = member(host).trainerBonds?.[visitor]?.score || 0;
		settle(false, 1, true); assert(!session().adventure.battleResult.eventResolved);
		assert.equal(member(host).trainerBonds?.[visitor]?.score || 0, score);
		for (const user of [host, guest]) manager.coop.command(user, {action: 'retrybattle'});
		assert.deepEqual(session().adventure.node.encounters, encounters);
		startBattle(); settle(); back(); agree('decline'); assert.equal(event(host).stage, 'result');
	});
	it('allows leaving before sparring without granting a companion or supply', () => {
		meeting(); const bag = {...member(host).bag}; agree('leave');
		assert.equal(event(host).stage, 'result'); assert.deepEqual(member(host).bag, bag);
		assert(!member(host).socialCompanions?.length);
	});
	it('queues personal milestone rewards earned on arrival before continuing the shared event', () => {
		const {TRAVELLERS} = require('../../dist/server/fantasy-rogue/traveller-profiles');
		change(shared => {
			for (const user of [host, guest]) shared.adventure.members[user.id].trainerBonds = Object.fromEntries(
				Object.keys(TRAVELLERS).map(id => [id, {score: 98, gifts: [50], pending: []}]));
		});
		const visitor = meeting();
		assert.equal(session().adventure.phase, 'blessing-reward');
		assert.equal(session().adventure.coopBlessingResume, 'event');
		for (const user of [host, guest]) {
			assert.equal(member(user).trainerBonds[visitor].score, 100);
			assert(member(user).blessings.pending.some(reward => reward.title.includes('心意')));
		}
		assert.throws(() => choose(host, 'battle'));
	});
	it('starts real native multi sparring and restores the shared reply after recreation', () => {
		meeting('battle'); agree('battle'); startBattle();
		const {Battle} = require('../../dist/sim/battle');
		const {Teams} = require('../../dist/sim/teams');
		const state = structuredClone(created.rogue.state);
		const battle = new Battle({formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: {name: host.name, team: state.team.map(mon => mon.set)},
			p2: {name: 'Traveller A', team: Teams.unpack(created.trainer.packedTeam)},
			p3: {name: guest.name, team: state.partner.team.map(mon => mon.set)},
			p4: {name: 'Traveller B', team: Teams.unpack(created.rogue.cooperative.foe)}});
		try {
			for (const side of battle.sides) assert(battle.choose(side.id, 'default'));
			assert.equal(battle.sides.length, 4); assert(battle.p2.active[0]); assert(battle.sides[3].active[0]);
		} finally { battle.destroy(); }
		settle(); back(); const before = event(guest);
		const restored = new RogueManager(new RogueEngine(store, engine.content), () => ({enabled: true}));
		assert.deepEqual(restored.coop.view(guest).session.adventure.coopEvent, before);
		assert(before.branchOptions.some(option => option.id === 'join'));
	});
});
