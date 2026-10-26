'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { set, stats } = require('../fixtures/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { trainerReunionPages } = require('../../dist/server/fantasy-rogue/trainer-reunions');
const { TRAVELLERS } = require('../../dist/server/fantasy-rogue/traveller-profiles');
const { travellingRoster, requestCompanion, recordSocialPreference } = require('../../dist/server/fantasy-rogue/travellers');
const { beginSocialEvent, socialCandidates, chooseSocialEvent, settleSocialEvent } = require('../../dist/server/fantasy-rogue/social-events');
const { beginRival } = require('../../dist/server/fantasy-rogue/rivals');
const { beginPoliceEncounter } = require('../../dist/server/fantasy-rogue/police-events');
const { bossIntroPages } = require('../../dist/server/fantasy-rogue/story');
const { rogueCodex } = require('../../dist/server/fantasy-rogue/codex');
const { affectionFloor } = require('../../dist/server/fantasy-rogue/affection');

const newLeaders = ['jasmine', 'winona', 'gardenia', 'candice', 'clair', 'clay', 'nanu', 'valerie', 'leon', 'cynthia', 'diantha', 'ash'];
const pairs = [['clay', 'lacey'], ['giovanni', 'silver'], ['nanu', 'acerola']];
function run(companion) {
	const r = { id: randomUUID(), floor: 60, phase: 'event', encounter: 0, money: 0, bag: {}, boosts: stats(0),
		team: [createRoguePokemon(set('Bulbasaur', 'Overgrow', 35), stats(0))], caught: [],
		node: { id: 'event', kind: 'event', name: '旅途', encounters: [], reward: { money: 0, items: {} } } };
	normalizeBlessings(r);
	if (companion === 'silver') r.rival = { id: 'silver', completed: 8, lastFloor: 50, affection: 12, permanent: true };
	else if (companion) requestCompanion(r, { id: companion, origin: 'event' });
	return r;
}

describe('Fantasy Rogue gym companions and relationship meetings', () => {
	it('recruits each added gym leader through affinity and pays the 50-affection gift once', () => {
		const catalog = rogueCodex(undefined, 'events', true).entries;
		for (const id of newLeaders) {
			const r = run(), p = TRAVELLERS[id], pool = socialCandidates(r);
			assert(pool.some(person => person.id === id), id);
			beginSocialEvent(r, () => pool.findIndex(person => person.id === id));
			assert.equal(r.dialogue.pages[0].portrait, id);
			assert(r.dialogue.pages[0].text.includes(p.name));
			chooseSocialEvent(r, p.preference, () => 0);
			if (p.preference === 'battle') {
				assert.equal(r.phase, 'ready'); assert(r.node.encounters[0].team.length);
				settleSocialEvent(r, true);
			} else chooseSocialEvent(r, p.preference, () => 0);
			assert.equal(r.node.event.social.step, 'invite');
			chooseSocialEvent(r, 'join', () => 0);
			assert.deepEqual(travellingRoster(r).map(c => c.id), [id]);
			const options = [{ id: 'preferred', name: '同行建议', preference: p.preference }];
			for (let i = 0; i < 15; i++) recordSocialPreference(r, options, 'preferred', 'choice' + i);
			assert(!r.bag[p.gifts[0].id], 'choices alone should not rush the journey gift');
			for (let i = 0; i < 20; i++) { r.floor++; affectionFloor(r, () => 99); }
			assert.equal(r.bag[p.gifts[0].id], 1, id);
			for (let i = 0; i < 5; i++) recordSocialPreference(r, options, 'preferred', 'extra' + i);
			assert.equal(r.bag[p.gifts[0].id], 1, 'the 50-point gift is paid only once');
			assert(catalog.some(e => e.portrait === id && (e.roles?.includes('gym') || e.roles?.includes('champion')) && e.roles.includes('companion')), id);
		}
	});
	for (const pair of pairs) for (const [companion, visitor] of [pair, [...pair].reverse()]) {
		it(`plays ${companion} meeting ${visitor}, with each portrait on its correct side`, () => {
			const r = run(companion), before = JSON.stringify(r), pages = trainerReunionPages(r, visitor);
			assert.equal(pages.length, 6);
			assert.deepEqual(new Set(pages.map(p => p.portrait)), new Set(pair));
			assert(pages.every(p => p.side === (p.portrait === companion ? 'left' : 'right')));
			assert.equal(JSON.stringify(r), before, 'reading dialogue does not change rewards or affinity');
			assert.deepEqual(trainerReunionPages(run(), visitor), []);
			if (companion === 'silver') r.rival.away = true;
			else r.socialCompanions[0].away = true;
			assert.deepEqual(trainerReunionPages(r, visitor), []);
		});
	}
	it('queues reunions in social events in either direction, and Silver chapters with Giovanni travelling', () => {
		for (const pair of pairs) for (const [companion, visitor] of [pair, [...pair].reverse()]) {
			const r = run(companion);
			if (visitor === 'silver') {
				r.rival = { id: 'silver', completed: 1, lastFloor: 20, affection: 3 };
				beginRival(r, () => 0);
			} else {
				const pool = socialCandidates(r);
				assert(beginSocialEvent(r, () => pool.findIndex(p => p.id === visitor)));
			}
			assert.deepEqual(r.dialogue.pages.slice(0, 6).map(p => p.text), trainerReunionPages(r, visitor).map(p => p.text));
			assert.equal(r.dialogue.resume, 'event');
		}
	});
	it('covers gym and Elite Four visitors, and Giovanni appearing in the Rocket event', () => {
		for (const [companion, visitor, role] of [
			['lacey', 'clay', 'gym'], ['clay', 'lacey', 'elitefour'], ['acerola', 'nanu', 'gym'],
			['nanu', 'acerola', 'gym'], ['nanu', 'acerola', 'elitefour'],
		]) {
			const r = run(companion); r.node.kind = 'boss';
			r.node.encounters = [{ trainer: { id: visitor, name: TRAVELLERS[visitor].name, avatar: visitor, role } }];
			assert.deepEqual(bossIntroPages(r).slice(0, 6), trainerReunionPages(r, visitor));
			assert.equal(bossIntroPages(r).length, 8);
		}
		const r = run('silver');
		r.police = { nextFloor: 1, regions: { kanto: { floor: 30, revengeAfter: 38, status: 'pending', round: 2 } } };
		assert(beginPoliceEncounter(r, () => 0));
		assert.equal(r.node.encounters[0].trainer.id, 'giovanni');
		assert.deepEqual(r.dialogue.pages.slice(0, 6).map(p => p.text), trainerReunionPages(r, 'giovanni').map(p => p.text));
		assert.equal(r.dialogue.resume, 'ready');
	});
});
