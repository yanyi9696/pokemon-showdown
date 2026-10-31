'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon, initializeExperience, gainExperience } = require('../../dist/server/fantasy-rogue/progression');
const { encounterSetProblems } = require('../../dist/server/fantasy-rogue/encounter-legality');
const { OPTIONAL_CHALLENGES } = require('../../dist/server/fantasy-rogue/challenge-data');
const { challengeNode, offerOptionalChallenge, challengeChance, prepareChallengePrizes, chooseChallengePrize, optionalChallengeView } = require('../../dist/server/fantasy-rogue/optional-challenges');
const { regionalEncounterLevel } = require('../../dist/server/fantasy-rogue/encounter-sets');
const { characterSpeech } = require('../../dist/server/fantasy-rogue/dialogue-copy');
const { rogueCodex } = require('../../dist/server/fantasy-rogue/codex');
const { rivalOpeningPages, rivalConversationOptions, rivalChatOptions, rivalChapterReplay } = require('../../dist/server/fantasy-rogue/rival-dialogue');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { stats, set } = require('../fixtures/fantasy-rogue');
const { travellingRoster, requestCompanion, chooseCompanionInvitation } = require('../../dist/server/fantasy-rogue/travellers');
const { TRAVELLERS } = require('../../dist/server/fantasy-rogue/traveller-profiles');
const { Dex } = require('../../dist/sim/dex');

describe('Fantasy Rogue optional high-difficulty invitations', function () {
	this.timeout(30000);
	let content, store, engine;
	const user = 'challengeqa';
	before(() => { content = createPreviewContent(); });
	afterEach(() => { store?.close(); store = undefined; });
	function party(floor = 51) {
		return { id: 'challenge-test', floor, phase: 'choose', boosts: stats(0), money: 10000, bag: { potion: 3, revive: 2 },
			team: [createRoguePokemon(set('Blastoise', 'Torrent', 20, ['Surf', 'Ice Beam']), stats(0)),
				createRoguePokemon(set('Raichu', 'Static', 20, ['Thunderbolt', 'Grass Knot']), stats(0))],
			caught: [], encounter: 0, attempt: 0, notices: [],
			choices: ['event', 'trainer', 'reward'].map(kind => ({ id: kind, kind, name: kind, encounters: [] })) };
	}
	function fixture() {
		store?.close();
		store = new RogueStore(':memory:');
		engine = new RogueEngine(store, { ...content, story: false }, () => 0);
		cmd('start', undefined, { starters: ['bulbasaur'], difficulty: 0 });
		store.change(user, a => {
			Object.assign(a.run, party()); a.run.contentVersion = content.version;
			delete a.run.blessings.beforeAdventure; delete a.run.blessings.round;
			a.run.choices[0] = challengeNode('dojoinvitation', 51);
			a.run.challengeHistory = [{ id: 'dojoinvitation', floor: 51 }];
		});
		cmd('select', 'challenge:dojoinvitation');
		return store.get(user).run;
	}
	function cmd(action, value, extra = {}) {
		return engine.command(user, { id: randomUUID(), revision: store.get(user).revision, action, value, ...extra });
	}
	function result(won) {
		const run = store.get(user).run;
		return { encounterId: run.battle.encounterId, won, turns: 7, team: structuredClone(run.team), bag: { ...run.bag }, defeated: [] };
	}
	function clearMoves() {
		while (store.get(user).run.pendingMoves?.length) {
			const move = store.get(user).run.pendingMoves[0];
			cmd('learn', 'skip', { member: move.member, move: move.move });
		}
	}
	it('grants modest run-wide growth on a claimed victory, including early floors and later partners', () => {
		const {syncGrowthParty, GROWTH_LIMITS} = require('../../dist/server/fantasy-rogue/growth');
		const run = party(5); run.phase = 'event'; run.node = challengeNode('dojoinvitation', 5);
		prepareChallengePrizes(run, () => 0);
		run.team[0].hp -= 10; run.team[0].pp[0].pp = 1;
		const before = structuredClone(run.team[0]);
		for (const stage of ['offer', 'battle', 'paused', 'closed']) {
			run.node.challenge.stage = stage;
			assert.throws(() => chooseChallengePrize(run, 'supplies'));
			assert.equal(run.growth, undefined);
		}
		run.node.challenge.stage = 'won'; chooseChallengePrize(run, 'supplies');
		assert.deepEqual(run.growth, {offense: 100, defense: 100, experience: 0});
		assert.equal(run.team[0].statModifiers.training.atk, 0.01);
		assert.equal(run.team[0].statModifiers.training.spd, 0.01);
		assert.equal(run.team[0].hp, before.hp); assert.equal(run.team[0].pp[0].pp, 1);
		assert(run.lastReward.effect.includes('双攻 +1%、双防 +1%'));
		const restored = JSON.parse(JSON.stringify(run));
		assert.throws(() => chooseChallengePrize(restored, 'supplies'));
		assert.deepEqual(restored.growth, run.growth);
		restored.team.push(createRoguePokemon(set('Mew'), stats(0)));
		syncGrowthParty(restored);
		assert.equal(restored.team[2].statModifiers.training.spa, 0.01);
		restored.growth = {...GROWTH_LIMITS, offense: GROWTH_LIMITS.offense - 50};
		restored.node = challengeNode('dojoinvitation', 6); prepareChallengePrizes(restored, () => 0);
		restored.node.challenge.stage = 'won'; chooseChallengePrize(restored, 'supplies');
		assert.deepEqual(restored.growth, GROWTH_LIMITS);
	});
	it('provides 28 independent challenges with legal themed rosters at regional elite levels', () => {
		assert.equal(new Set(OPTIONAL_CHALLENGES.map(d => d.id)).size, 28);
		for (const def of OPTIONAL_CHALLENGES) {
			assert(def.from >= 5 && def.through <= 199);
			const node = challengeNode(def.id, def.from), encounter = node.encounters[0];
			assert(encounter.team.length >= 2); assert.equal(encounter.catchable, false);
			for (const mon of encounter.team) {
				assert.equal(node.kind, 'challenge');
				assert.equal(mon.level, regionalEncounterLevel(def.from, true));
				assert(Object.values(mon.evs).reduce((a, b) => a + b, 0) <= 510);
				assert.deepEqual(encounterSetProblems(mon), [], def.id + ':' + mon.species);
			}
		}
	});
	it('protects fixed and story routes, with twice the base offer chance during grace', () => {
		for (const floor of [1, 4, 9, 10, 30, 49, 50, 60, 99, 100, 200]) {
			const run = party(floor); offerOptionalChallenge(run, () => 0);
			assert(!run.challengeHistory, 'floor ' + floor);
		}
		const run = party(); run.choices = [{ id: 'rival', kind: 'event' }, { id: 'quest', kind: 'event', event: {} },
			{ id: 'catchup', kind: 'reward' }, { id: 'rare', kind: 'trainer', rewardScene: {} }];
		offerOptionalChallenge(run, () => 0); assert(!run.challengeHistory);
		assert.equal(challengeChance(51) / challengeChance(61), 2);
	});
	it('equips serious sparring aces with supported Mega and Z tools and known companion portraits', () => {
		const dex = Dex.mod('gen9fantasy');
		const serious = OPTIONAL_CHALLENGES.filter(d => d.serious);
		assert.equal(serious.length, 11);
		for (const def of serious) {
			assert(def.companions.length && def.portraits.length, def.id);
			for (const id of def.companions) assert(TRAVELLERS[id], id);
			const team = challengeNode(def.id, def.from).encounters[0].team;
			const megas = team.filter(mon => dex.items.get(mon.item).megaStone);
			assert(megas.length <= 1, def.id + ' has competing Mega stones');
			for (const mon of megas) {
				const eligible = dex.items.get(mon.item).megaEvolves;
				assert([eligible].flat().includes(dex.species.get(mon.species).name), def.id + ': ' + mon.species);
			}
			assert(team.length >= 4, def.id);
		}
		assert(serious.some(d => d.team.some(mon => dex.items.get(mon[2]).zMove)));
		assert(serious.some(d => d.team.some(mon => mon[0].includes('-Fantasy'))));
	});
	it('invites both subway bosses only after a win and prize claim while enforcing the two-companion limit', () => {
		const run = party(120); run.phase = 'event'; run.node = challengeNode('battlemetro', 120);
		prepareChallengePrizes(run, () => 0);
		requestCompanion(run, {id: 'riley', origin: 'event'});
		requestCompanion(run, {id: 'palmer', origin: 'event'});
		for (const stage of ['offer', 'battle', 'paused', 'closed']) {
			run.node.challenge.stage = stage; assert.throws(() => chooseChallengePrize(run, 'supplies'));
			assert(!run.companionInvitations?.length);
		}
		run.node.challenge.stage = 'won'; chooseChallengePrize(run, 'supplies');
		assert.deepEqual(travellingRoster(run).map(c => c.id), ['riley', 'palmer']);
		assert.deepEqual(run.companionInvitations.map(c => c.id), ['ingo', 'emmet']);
		const restored = JSON.parse(JSON.stringify(run));
		assert.throws(() => chooseChallengePrize(restored, 'supplies'));
		chooseCompanionInvitation(restored, restored.companionInvitations[0].key, 'riley');
		assert.deepEqual(travellingRoster(restored).map(c => c.id), ['palmer', 'ingo']);
		chooseCompanionInvitation(restored, restored.companionInvitations[0].key, 'decline');
		assert.equal(travellingRoster(restored).length, 2); assert.equal(restored.companionInvitations.length, 0);
	});
	it('promotes a temporarily travelling rival without duplicating their story or companion slot', () => {
		const run = party(60); run.phase = 'event'; run.node = challengeNode('korrinafullpower', 60);
		run.rival = {id: 'korrina', temporaryUntil: 68, temporaryUsed: true, chapter: 7};
		prepareChallengePrizes(run, () => 0); run.node.challenge.stage = 'won';
		chooseChallengePrize(run, 'supplies');
		assert.equal(run.rival.chapter, 7); assert.equal(run.rival.permanent, true);
		assert.equal(run.rival.temporaryUntil, undefined);
		assert.deepEqual(travellingRoster(run).map(c => c.id), ['korrina']);
		assert.equal(run.socialCompanions[0].origin, 'rival');
	});
	it('matches regional elite levels and normal blessing costs before and after grace without stacking on retry', () => {
		const { prepareBlessingEncounter, normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
		for (const floor of [55, 61]) {
			const run = party(floor), state = normalizeBlessings(run);
			Object.assign(state, { levels: 7, bossLevels: 11, deferredLevels: [{ floor: 50, startsAt: 61, normal: 10, boss: 20 }] });
			run.node = challengeNode('dojoinvitation', floor);
			prepareBlessingEncounter(run, () => 0);
			const expected = regionalEncounterLevel(floor, true) + 7 + (floor >= 61 ? 10 : 0);
			assert(run.node.encounters[0].team.every(mon => mon.level === expected));
			prepareBlessingEncounter(run, () => 0);
			assert(run.node.encounters[0].team.every(mon => mon.level === expected));
		}
	});
	it('keeps story and elite slots and removes pure trials from new event draws', () => {
		const { expeditionEligible } = require('../../dist/server/fantasy-rogue/expedition-events');
		const { activityEligible } = require('../../dist/server/fantasy-rogue/journey-activities');
		const run = party(85);
		assert.equal(expeditionEligible(run, 'starmaster'), false);
		assert.equal(activityEligible(run, 'battlemetro'), false);
		assert.equal(expeditionEligible(run, 'identityquiz'), true);
		run.choices = [{ id: 'elite', kind: 'elite', encounters: [] }, { id: 'story', kind: 'event', encounters: [] }, { id: 'trainer', kind: 'trainer', encounters: [] }];
		offerOptionalChallenge(run, () => 0);
		assert.equal(run.choices[0].id, 'elite'); assert.equal(run.choices[1].id, 'story');
		assert.equal(run.choices[2].kind, 'challenge');
	});
	it('awards the rare star lesson to one eligible partner instead of the entire team or another prize', () => {
		const run = party(85); run.phase = 'event'; run.node = challengeNode('starmaster', 85);
		prepareChallengePrizes(run, () => 0);
		const prize = run.node.challenge.prizes.find(p => p.star); assert(prize);
		const before = run.team.map(m => m.stars || 1), money = run.money, bag = { ...run.bag };
		run.node.challenge.stage = 'won'; chooseChallengePrize(run, prize.id);
		assert.equal(run.team[0].stars, before[0] + 1); assert.equal(run.team[1].stars || 1, before[1]);
		assert.equal(run.money, money); assert.deepEqual(run.bag, bag);
		assert.throws(() => chooseChallengePrize(run, 'supplies'));
		const other = party(85); other.node = challengeNode('starmaster', 85); other.phase = 'event';
		other.team[0].stars = 5; other.team[1].egg = {};
		prepareChallengePrizes(other, () => 0); assert(!other.node.challenge.prizes.some(p => p.star));
	});
	it('persists a single offer per grace, prevents duplicate invitations and applies the outside cooldown', () => {
		const run = party(); offerOptionalChallenge(run, () => 0);
		assert.equal(run.challengeHistory.length, 1); assert(run.choices.some(n => n.challenge));
		const restored = JSON.parse(JSON.stringify(run)); offerOptionalChallenge(restored, () => 0);
		assert.deepEqual(restored, run);
		for (const floor of [52, 58]) {
			run.floor = floor; run.choices = party(floor).choices; offerOptionalChallenge(run, () => 0);
			assert.equal(run.challengeHistory.length, 1);
		}
		run.floor = 65; run.choices = party(65).choices; offerOptionalChallenge(run, () => 0);
		assert.equal(run.challengeHistory.length, 2); assert.notEqual(run.challengeHistory[0].id, run.challengeHistory[1].id);
	});
	it('previews actual levels, saves prizes, blocks premature claims and pays a win exactly once', () => {
		const before = fixture(), view = optionalChallengeView(before);
		assert.equal(before.phase, 'event'); assert(view.prizes.length >= 3);
		assert.deepEqual(view.team.map(m => m.level), before.node.encounters[0].team.map(m => m.level));
		assert.throws(() => cmd('challenge', 'supplies'));
		engine.migrate(user); assert.deepEqual(store.get(user).run.node.challenge.prizes, before.node.challenge.prizes);
		cmd('challenge', 'accept'); cmd('battle');
		const ticket = store.get(user).run.battle;
		assert.equal(engine.battleState(user).catchable, false);
		engine.settle(user, ticket.token, result(true)); clearMoves();
		assert.equal(store.get(user).run.node.challenge.stage, 'won');
		const r = store.get(user).run, prize = r.node.challenge.prizes.find(p => p.id === 'supplies');
		const command = { id: randomUUID(), revision: store.get(user).revision, action: 'challenge', value: 'supplies' };
		engine.command(user, command); engine.command(user, command);
		assert.equal(store.get(user).run.money, r.money + prize.money);
		assert.throws(() => cmd('challenge', 'mint'));
		cmd('challenge', 'leave'); assert.equal(store.get(user).run.floor, 52);
		assert.equal(store.get(user).run.money, r.money + prize.money);
	});
	for (const exit of ['retreat', 'loss']) it(`keeps only spent resources on ${exit}, including late win packets, then allows retry or explicit floor exit`, () => {
		fixture(); cmd('challenge', 'accept'); cmd('battle');
		const before = store.get(user).run, ticket = before.battle, end = result(exit === 'retreat');
		end.team[0].hp -= 9; end.team[0].pp[0].pp--;
		end.team[0].experience = (end.team[0].experience || 0) + 4000;
		end.team[0].set.item = 'Leftovers'; end.bag.potion--; end.bag.nugget = 10;
		end.defeated = [{ species: 'Blissey', level: 99, eligible: [end.team[0].id], participants: [end.team[0].id] }];
		if (exit === 'retreat') cmd('retreat');
		engine.settle(user, ticket.token, end);
		let saved = store.get(user).run;
		assert.equal(saved.node.challenge.stage, 'paused'); assert.equal(saved.money, before.money);
		assert.equal(saved.team[0].hp, before.team[0].hp - 9); assert.equal(saved.team[0].pp[0].pp, before.team[0].pp[0].pp - 1);
		assert.equal(saved.team[0].experience, before.team[0].experience); assert.equal(saved.team[0].set.item, '');
		assert.equal(saved.bag.potion, before.bag.potion - 1); assert(!saved.bag.nugget);
		assert.deepEqual(saved.growth, before.growth);
		assert.throws(() => cmd('challenge', 'accept')); assert.throws(() => cmd('challenge', 'supplies'));
		engine.settle(user, ticket.token, end); assert.deepEqual(store.get(user).run, saved);
		cmd('challenge', 'retry'); cmd('battle');
		assert.deepEqual(store.get(user).run.node.encounters, saved.node.encounters);
		assert.deepEqual(store.get(user).run.node.challenge.prizes, saved.node.challenge.prizes);
		assert.notEqual(store.get(user).run.battle.token, ticket.token);
		engine.settle(user, ticket.token, end); assert.equal(store.get(user).run.phase, 'battle');
		const retry = store.get(user).run.battle; cmd('retreat'); engine.settle(user, retry.token, result(false));
		cmd('challenge', 'leave'); saved = store.get(user).run;
		assert.equal(saved.floor, 52); assert.equal(saved.money, before.money); assert(!saved.bag.nugget);
	});
	it('skips without a hidden payout and keeps ordinary capture rules intact', () => {
		const before = fixture(); cmd('challenge', 'skip'); cmd('challenge', 'leave');
		assert.equal(store.get(user).run.money, before.money);
		fixture(); store.change(user, a => {
			a.run.blessings.owned.push({ ...blessing('rocketcatch'), floor: 1 });
		});
		cmd('challenge', 'accept'); cmd('battle'); assert.equal(engine.battleState(user).npcCapture, false);
		store.change(user, a => { delete a.run.node.challenge; a.run.node.kind = 'trainer'; });
		assert.equal(engine.battleState(user).npcCapture, true); assert.equal(engine.battleState(user).catchable, true);
	});
	it('cannot bank catch-up experience or over-level a partner who already caught up', () => {
		const run = party(120); run.node = challengeNode('clubroom', 120); run.phase = 'event';
		prepareChallengePrizes(run, () => 0); const prize = run.node.challenge.prizes.find(p => p.id === 'training'); assert(prize);
		for (const entry of prize.training) {
			const mon = run.team.find(m => m.id === entry.member); initializeExperience(mon); gainExperience(run, mon, 200000);
		}
		const before = run.team.map(m => m.experience); run.node.challenge.stage = 'won'; chooseChallengePrize(run, 'training');
		assert.deepEqual(run.team.map(m => m.experience), before); assert.deepEqual(run.bag, { potion: 3, revive: 2 });
	});
	it('limits Future Sight to the opening and distinguishes dialogue from narration', () => {
		assert.deepEqual(blessing('futuresight').floors, [1]);
		assert.equal(characterSpeech('你好。'), '⌈你好。⌋');
		assert.equal(characterSpeech('她放下背包。「一起走吧。」'), '她放下背包。⌈一起走吧。⌋');
		const pages = rivalOpeningPages('kieran', 1, 0);
		assert(pages.filter(p => p.speaker).every(p => p.text.includes('⌈')));
		assert(!pages[0].text.includes('⌈')); assert(!pages.at(-1).speaker);
		assert(rivalConversationOptions(2).every(o => o.name.startsWith('⌈')));
		assert(rivalChatOptions(0).every(o => o.name.startsWith('⌈') && o.name.endsWith('⌋')));
		assert(rivalChapterReplay('lillie', 4).pages.family0.text[0].startsWith('⌈'));
	});
	it('replays each discovered challenge without exposing locked stories or changing saves', () => {
		fixture(); const account = store.get(user), before = JSON.stringify(account);
		const rows = rogueCodex(account, 'events').entries.filter(e => e.id.startsWith('challenge:'));
		assert.equal(rows.length, 28);
		assert(rows.every(e => e.category === 'challenge'));
		assert(rows.filter(e => !e.unlocked).every(e => !e.replay && e.text === '？？？'));
		const all = rogueCodex(account, 'events', true).entries.filter(e => e.id.startsWith('challenge:'));
		for (const entry of all) {
			const def = OPTIONAL_CHALLENGES.find(d => entry.id === 'challenge:' + d.id);
			assert.deepEqual(entry.replay.pages.start.text, def.opening);
			for (const page of Object.values(entry.replay.pages)) {
				for (const option of page.options) assert(entry.replay.pages[option.next]);
				assert(!page.action && !page.reward);
			}
		}
		assert.equal(JSON.stringify(account), before);
	});
});
