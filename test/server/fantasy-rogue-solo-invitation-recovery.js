'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon, initializeExperience } = require('../../dist/server/fantasy-rogue/progression');
const { completeBlessingFloor, syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { challengeNode } = require('../../dist/server/fantasy-rogue/optional-challenges');
const { OPTIONAL_CHALLENGES } = require('../../dist/server/fantasy-rogue/challenge-data');
const { gainAffection, affectionScene } = require('../../dist/server/fantasy-rogue/affection');
const { requestCompanion, travellingRoster, companionInvitationView } = require('../../dist/server/fantasy-rogue/travellers');
const { storyView } = require('../../dist/server/fantasy-rogue/story');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { experienceAtLevel, rogueSpeciesData } = require('../../dist/sim/fantasy-rogue-rules');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue solo floor and full-companion recovery', function () {
	this.timeout(30000);
	let content, store, engine;
	const user = 'solo-invite-recheck';
	before(() => { content = { ...createPreviewContent(), story: false }; });
	afterEach(() => { store?.close(); store = undefined; });
	const run = () => store.get(user).run;
	function cmd(action, value, extra = {}) {
		return engine.command(user, { id: randomUUID(), revision: store.get(user).revision, action, value, ...extra });
	}
	function fixture(species = 'Blastoise', level = 20, solo = true, challenge = 'dojoinvitation', floor = 51) {
		store = new RogueStore(':memory:');
		engine = new RogueEngine(store, content, () => 0);
		cmd('start', undefined, { starters: ['bulbasaur'], difficulty: 0 });
		store.change(user, account => {
			Object.assign(account.run, { floor, phase: 'choose', money: 10000, encounter: 0, attempt: 0,
				team: [createRoguePokemon(set(species, 'Run Away', level, ['Splash']), stats(0))],
				bag: { rarecandy: 10, expcandyl: 10 }, notices: [],
				choices: [challengeNode(challenge, floor)], challengeHistory: [{ id: challenge, floor }] });
			delete account.run.blessings.beforeAdventure; delete account.run.blessings.round;
			account.run.blessings.owned = solo ? [{ ...blessing('sololeveling'), floor: 1 }] : [];
			syncBlessingParty(account.run);
			account.run.team.forEach(initializeExperience);
		});
		cmd('select', 'challenge:' + challenge);
	}
	function clearMoves() {
		for (let i = 0; run().pendingMoves?.length; i++) {
			assert(i < 100, 'pending move queue must terminate');
			const move = run().pendingMoves[0];
			cmd('learn', 'skip', { member: move.member, move: move.move });
		}
	}
	function winChallenge() {
		cmd('challenge', 'accept'); cmd('battle');
		const before = run(), member = before.team[0];
		const result = { encounterId: before.battle.encounterId, won: true, turns: 8,
			team: structuredClone(before.team), bag: { ...before.bag },
			defeated: [0, 1, 2].map(id => ({ id: String(id), species: 'Blissey', level: member.set.level + 15,
				eligible: [member.id], participants: [member.id] })) };
		engine.settle(user, before.battle.token, result);
		clearMoves();
		assert.equal(run().node.challenge.stage, 'won');
		assert(run().team[0].experience > member.experience,
			'actual battle experience settlement must occur: ' + JSON.stringify({ before: member.experience,
				after: run().team[0].experience, level: member.set.level, uncapped: member.uncappedLevel }));
	}
	function reload() {
		const saved = JSON.parse(JSON.stringify(store.get(user)));
		const previous = store; store = new RogueStore(':memory:');
		store.change(user, account => Object.assign(account, saved)); previous.close();
		engine = new RogueEngine(store, content, () => 0); engine.migrate(user);
	}
	function candy(id) {
		const member = run().team[0], before = run().bag[id];
		const growth = rogueSpeciesData(member.set.species).growth;
		const count = id === 'rarecandy' ? 1 : Math.ceil((experienceAtLevel(growth, member.set.level + 1) -
			member.experience) / content.items.find(item => item.id === id).amount);
		const command = { id: randomUUID(), revision: store.get(user).revision,
			action: 'use', value: id, member: member.id, count };
		engine.command(user, command);
		assert.equal(run().bag[id], before - count);
		assert(run().team[0].set.level > member.set.level);
		const saved = store.get(user); engine.command(user, command);
		assert.deepEqual(store.get(user), saved, 'replayed candy must not consume or level twice');
		clearMoves();
	}
	const speciesByGrowth = ['Blastoise', 'Raichu', 'Altaria', 'Hariyama', 'Clefairy', 'Dratini'];
	it('covers all six experience growth curves', () => {
		assert.equal(new Set(speciesByGrowth.map(s => rogueSpeciesData(s).growth)).size, 6);
	});
	for (const species of speciesByGrowth) {
		for (const item of ['rarecandy', 'expcandyl']) {
			it(`adds the floor level after battle XP, ${item}, a saved reload and challenge rewards for ${species}`, () => {
				fixture(species); winChallenge();
				candy(item); reload();
				cmd('challenge', 'supplies');
				candy(item); reload();
				const before = run().team[0]; assert(before.set.level < 100);
				const leave = { id: randomUUID(), revision: store.get(user).revision, action: 'challenge', value: 'leave' };
				engine.command(user, leave);
				assert.equal(run().team[0].set.level, before.set.level + 1);
				assert.equal(run().blessings.completed.filter(f => f === 51).length, 1);
				const saved = store.get(user); engine.command(user, leave);
				assert.deepEqual(store.get(user), saved, 'replayed floor completion must not pay twice');
				clearMoves(); assert.equal(run().floor, 52);
			});
		}
	}
	for (const item of ['rarecandy', 'expcandyl']) {
		it(`retains the mid-game floor level after battle XP and ${item} at level 70`, () => {
			fixture('Blastoise', 70); winChallenge();
			candy(item); reload();
			cmd('challenge', 'supplies'); const before = run().team[0];
			assert(before.set.level < 100); cmd('challenge', 'leave');
			assert.equal(run().team[0].set.level, before.set.level + 1);
		});
	}
	it('does not add a solo level without the blessing', () => {
		fixture('Mew', 20, false); winChallenge(); candy('rarecandy');
		cmd('challenge', 'supplies'); const level = run().team[0].set.level;
		cmd('challenge', 'leave'); assert.equal(run().team[0].set.level, level);
	});
	for (const definition of OPTIONAL_CHALLENGES) {
		it(`completes ${definition.id} with solo floor growth after candy and its actual prize`, () => {
			fixture('Mew', 20, true, definition.id, definition.from);
			winChallenge(); candy('expcandyl');
			const prizes = run().node.challenge.prizes;
			const training = prizes.find(prize => prize.training?.length);
			cmd('challenge', (training || prizes[0]).id); clearMoves();
			candy('rarecandy'); reload();
			const before = run().team[0]; assert(before.set.level < 100);
			cmd('challenge', 'leave');
			assert.equal(run().team[0].set.level, before.set.level + 1);
			assert.equal(run().blessings.completed.filter(f => f === definition.from).length, 1);
			clearMoves(); assert.equal(run().floor, definition.from + 1);
		});
	}
	for (const level of [99, 100, 101, 150]) {
		it(`keeps the documented late-floor cadence when candy is used at level ${level}`, () => {
			fixture('Mew', level); winChallenge(); cmd('challenge', 'supplies');
			candy('rarecandy'); reload();
			const before = run().team[0]; assert(before.set.level > 100);
			cmd('challenge', 'leave');
			assert.equal(run().team[0].set.level, before.set.level, 'first late floor is accumulated, not skipped by candy');
			assert.equal(run().blessings.soloLateFloors, 1);
			const next = run(); assert.equal(next.floor, 52);
			completeBlessingFloor({ run: next }, next, content, () => 0);
			assert.equal(next.team[0].set.level, before.set.level + 1);
			assert.equal(next.blessings.soloLateFloors, 2);
			completeBlessingFloor({ run: next }, next, content, () => 0);
			assert.equal(next.blessings.soloLateFloors, 2);
		});
	}
	it('still grants the level-100 floor reward before starting the two-floor cadence', () => {
		fixture('Mew', 100); const saved = run(), member = saved.team[0];
		completeBlessingFloor({ run: saved }, saved, content, () => 0);
		assert.equal(member.set.level, 101);
		assert.equal(member.experience, experienceAtLevel(rogueSpeciesData('Mew').growth, 101));
	});
	it('can still finish a floor at the existing maximum solo level without invalid experience or duplicate rewards', () => {
		fixture('Mew', 9999); const saved = run(), member = saved.team[0];
		// An even late-floor count would otherwise try to calculate experience for level 10000.
		saved.blessings.soloLateFloors = 1;
		const before = member.experience;
		assert.doesNotThrow(() => completeBlessingFloor({ run: saved }, saved, content, () => 0));
		assert.equal(member.set.level, 9999); assert.equal(member.experience, before);
		assert.equal(saved.blessings.completed.filter(f => f === saved.floor).length, 1);
		completeBlessingFloor({ run: saved }, saved, content, () => 0);
		assert.equal(saved.blessings.completed.filter(f => f === saved.floor).length, 1);
	});
	for (const choice of ['decline', 'brock']) {
		for (const [stage, learning] of [[50, false], [50, true], [100, false], [100, true]]) {
			it(`recovers full companions and affection ${stage} after reload, ${choice}, learning=${learning}, and duplicate commands`, () => {
				fixture('Mew', 20, false);
				store.change(user, account => {
					const r = account.run;
					requestCompanion(r, { id: 'brock', origin: 'event' });
					requestCompanion(r, { id: 'viola', origin: 'event' });
					requestCompanion(r, { id: 'nessa', origin: 'event' });
					r.trainerBonds.nessa = { score: stage - 1, gifts: stage === 100 ? [50] : [], pending: [] };
					gainAffection(r, 'nessa', 1, 'same-reward', { content, random: () => 0 });
					if (learning) r.pendingMoves = [{ member: r.team[0].id, move: 'psychic' }];
				});
				reload();
				assert.equal(affectionScene(run()), undefined, 'do not send an unanswerable scene to cached older clients');
				assert.deepEqual(run().trainerBonds.nessa.pending, [stage], 'defer, never discard, the saved scene');
				const invitation = companionInvitationView(run()), bag = { ...run().bag };
				assert.equal(invitation.roster.length, 2);
				assert.throws(() => cmd('affection', stage === 100 ? 'friends' : 'thanks', { member: 'nessa' }), /同行邀请/);
				const invite = { id: randomUUID(), revision: store.get(user).revision, action: 'companioninvite', member: invitation.key, value: choice };
				engine.command(user, invite); const saved = store.get(user);
				engine.command(user, invite); assert.deepEqual(store.get(user), saved);
				reload();
				for (let i = 0; run().story; i++) {
					assert(i < 10); cmd('storyskip', storyView(store.get(user), false, true).key);
				}
				assert.equal(travellingRoster(run()).length, 2);
				if (learning) {
					assert.equal(affectionScene(run()), undefined);
					assert.equal(run().pendingMoves[0].move, 'psychic'); clearMoves();
				}
				assert.equal(affectionScene(run()).stage, stage);
				const reply = { id: randomUUID(), revision: store.get(user).revision, action: 'affection', member: 'nessa', value: stage === 100 ? 'friends' : 'thanks' };
				engine.command(user, reply); const answered = store.get(user);
				engine.command(user, reply); assert.deepEqual(store.get(user), answered);
				assert(!affectionScene(run())); assert.deepEqual(run().bag, bag, 'milestone rewards are not issued again');
				const reward = run().blessings.pending[0];
				if (reward) cmd('blessingreward', reward.options[0], { member: reward.id });
				cmd('challenge', 'accept'); cmd('battle'); assert.equal(run().phase, 'battle');
			});
		}
	}
});
