'use strict';

// Real authored floors and native RoomBattle lifecycle. Strong isolated parties accelerate
// workflow coverage; this is deliberately NOT a difficulty or strong-AI benchmark.
const assert = require('assert').strict;
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setTimeout: delay } = require('timers/promises');
const { makeUser } = require('../users-utils');
const { AIChallengeManager } = require('../../dist/server/fantasy-ai/manager');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue continuous native cooperative journey', function () {
	this.timeout(900000);
	let store, manager, ai, host, guest, oldConfig, originalRandom, room, directory, filename, content;
	const makeManager = () => new RogueManager(new RogueEngine(store, content), () => ai);
	const saved = () => store.coopSessionForUser(host.id);
	const view = (user = host) => manager.coop.view(user).session.adventure;
	const command = (user, action, extra = {}) => manager.coop.command(user, { action, ...extra });
	const both = (action, extra = {}) => {
		command(host, action, extra); command(guest, action, extra);
	};
	const report = { floors: [], battles: 0, turns: 0, blessings: [], phases: {}, growth: 0,
		captures: [], reopened: false, recovered: false };
	before(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		originalRandom = crypto.randomInt;
		let seed = 154;
		crypto.randomInt = (min, max) => {
			if (max === undefined) { max = min; min = 0; }
			seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
			return min + (seed >>> 0) % (max - min);
		};
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-journey-'));
		filename = path.join(directory, 'isolated.db');
		store = new RogueStore(filename);
		ai = new AIChallengeManager([], { enabled: true, decisionMs: 0, maxBattles: 1 }, 6);
		content = createPreviewContent(); manager = makeManager();
		host = makeUser('Journey Host', '127.6.1.1'); guest = makeUser('Journey Guest', '127.6.1.2');
		for (const user of [host, guest]) store.change(user.id, account => { account.slots = 2; });
	});
	after(async () => {
		console.log('COOP_JOURNEY_LAST', JSON.stringify({ report, last: saved()?.adventure && {
			floor: view().floor, phase: view().phase, route: view().selectedRoute,
			event: view().coopEvent, blessing: view().coopBlessing,
		} }));
		await ai?.dispose(); if (room) Rooms.get(room.roomid)?.destroy();
		for (const user of [host, guest]) { user?.disconnectAll(); user?.destroy(); }
		store?.close(); crypto.randomInt = originalRandom;
		assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
		assert(path.basename(directory).startsWith('rogue-journey-'));
		fs.rmSync(directory, { recursive: true, force: true });
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	function growth() {
		for (const user of [host, guest]) for (let step = 0; step < 60; step++) {
			const v = view(user), pending = v.pendingMove, evolution = v.liveGrowth?.evolutions[0];
			if (pending) command(user, 'learn', { member: pending.member, move: pending.move,
				value: 'skip', visit: v.liveGrowth?.key });
			else if (evolution) command(user, 'evolutionnotice', { member: evolution.member, visit: v.liveGrowth.key });
			else break;
			report.growth++;
		}
	}
	function publicFoes(log) {
		const foes = {};
		for (const line of log) {
			const [, kind, ident, details] = line.split('|'), side = ident?.slice(0, 2);
			if (!['p2', 'p4'].includes(side)) continue;
			if (['switch', 'drag', 'detailschange'].includes(kind)) foes[side] = details.split(',')[0];
			if (kind === 'faint') delete foes[side];
		}
		return foes;
	}
	function playerChoice(request, log) {
		if (request.teamPreview) return 'team 12';
		if (request.forceSwitch) return 'default';
		const moves = request.active?.[0]?.moves;
		assert(moves, 'a non-wait request must offer player moves');
		const dex = Dex.mod('gen9fantasy'), foes = publicFoes(log), choices = [];
		for (const [index, move] of moves.entries()) {
			if (move.disabled || move.pp === 0) continue;
			const data = dex.moves.get(move.id);
			for (const [side, name] of Object.entries(foes)) {
				const species = dex.species.get(name);
				const score = data.basePower * (dex.getImmunity(data.type, species) ?
					2 ** dex.getEffectiveness(data.type, species) : 0);
				choices.push({ score, value: `move ${index + 1}${move.target === 'normal' ? ` ${side === 'p2' ? 1 : 2}` : ''}` });
			}
		}
		return choices.sort((a, b) => b.score - a.score)[0]?.value || 'default';
	}
	function restoreBattle() {
		store.close(); store = new RogueStore(filename); manager = makeManager();
		assert(manager.coop.view(host).session.battleRecovery.available);
		both('recoverbattle'); room = Rooms.get(saved().roomid);
		assert(room?.battle); report.recovered = true;
	}
	async function fight() {
		command(host, 'preparebattle', { visit: view().battleSelectionKey });
		room = Rooms.get(saved().roomid);
		assert(room?.battle, 'native room created');
		assert.equal(room.battle.gameType, 'multi');
		const submitted = new Map(), start = Date.now();
		while (['battle', 'battle-starting'].includes(saved().adventure.phase)) {
			if (Date.now() - start > 25000) throw new Error(`Battle timeout floor ${saved().adventure.floor}: ${JSON.stringify({
				requests: [room.battle.p1.request, room.battle.p3.request], log: room.battle.stream.battle.log.slice(-16),
			})}`);
			growth();
			if (!report.recovered && saved().adventure.floor >= 102 &&
				room.battle.stream.battle.turn === 1 && !room.battle.p1.request.isWait && !room.battle.p3.request.isWait) {
				const native = room.battle.stream.battle;
				if (saved().adventure.battleCheckpoint?.sequence !== native.fantasyRogue.checkpointSequence) {
					await delay(2); continue;
				}
				room.destroy(); await delay(0);
				restoreBattle(); submitted.clear();
				continue;
			}
			if (report.captures.length < 2 && !room.battle.p1.request.isWait && !room.battle.p3.request.isWait) {
				const request = JSON.parse(room.battle.p1.request.request || '{}');
				const target = request.fantasyRogue?.captureTargets?.find(entry => entry.hp > 0);
				if (request.active && target && room.battle.canStartCoopCapture(host.id, 'masterball', target.key, target.id)) {
					command(host, 'proposecapture', { ball: 'masterball', captureTarget: target.key });
					let proposal = view(guest).captureProposal;
					if (report.captures.length) {
						command(guest, 'respondcapture', { id: proposal.id, value: 'contest' });
						proposal = view().captureProposal;
						command(host, 'respondcapture', { id: proposal.id, value: 'give', ball: 'masterball' });
					} else command(guest, 'respondcapture', { id: proposal.id, value: 'accept' });
					report.captures.push({ owner: report.captures.length ? guest.id : host.id, id: target.id });
					await delay(2); continue;
				}
			}
			for (const [user, seat] of [[host, room.battle.p1], [guest, room.battle.p3]]) {
				if (!seat.request.request || seat.request.isWait || seat.request.choice) continue;
				const request = JSON.parse(seat.request.request);
				if (request.wait || submitted.get(user.id) === seat.request.rqid) continue;
				const choice = playerChoice(request, room.battle.stream.battle.log);
				room.battle.choose(user, `${choice}|${seat.request.rqid}`);
				submitted.set(user.id, seat.request.rqid);
			}
			await delay(2);
		}
		const native = room.battle.stream.battle;
		assert(native.ended, 'flow cannot settle before the native simulator ends');
		assert(saved().adventure.battleResult?.won, `native loss on floor ${saved().adventure.floor}`);
		assert(!native.log.some(line => /^\|(?:error|bigerror)\|/.test(line)), 'no simulator errors');
		const settled = structuredClone(saved());
		room.battle.options.fantasyRogue.onResult(rogueBattleResult(native, true));
		assert.deepEqual(saved(), settled, 'replayed real battle result cannot double-award or advance');
		report.battles++; report.turns += native.turn;
		Rooms.get(room.roomid)?.destroy(); room = undefined;
	}
	function supplies() {
		for (const user of [host, guest]) {
			for (const mon of saved().adventure.members[user.id].team) {
				if (mon.pp.every(move => move.pp < 5)) command(user, 'useitem', {
					id: crypto.randomUUID(), member: mon.id, value: 'maxelixir' });
			}
		}
	}
	it('walks all 200 authored floors from invite to both account clears without writing floors or injecting battle wins', async () => {
		command(host, 'invite', { target: guest.id, difficulty: 0 });
		command(guest, 'accept', { id: store.coopInvitations(guest.id)[0].id });
		both('selectstarters', { starters: ['bulbasaur', 'charmander'] });
		// ONE fixture initialization. All subsequent progression uses public commands/native battles.
		const initial = saved(), revision = initial.revision;
		for (const owner of [host.id, guest.id]) {
			const member = initial.adventure.members[owner];
			member.boosts = stats(10000);
			member.team = member.team.map(mon => createRoguePokemon({ ...mon.set,
				moves: ['Flamethrower', 'Ice Beam', 'Thunderbolt', 'Earth Power'] }, member.boosts, mon.id));
			member.bag.maxelixir = 1000;
			member.bag.masterball = 2;
		}
		initial.revision++; store.updateCoopSession(initial, revision);
		const sessionId = initial.id;
		for (let step = 0; step < 5000; step++) {
			const session = store.coopSession(sessionId);
			if (session.status === 'complete') break;
			growth();
			const v = view();
			if (v.floor === 101 && !report.reopened) {
				const before = structuredClone(saved());
				store.close(); store = new RogueStore(filename); manager = makeManager();
				assert.deepEqual(saved(), before, 'reopening retains both owners and the exact floor');
				report.reopened = true;
			}
			report.phases[v.phase] = (report.phases[v.phase] || 0) + 1;
			if (report.floors[report.floors.length - 1] !== v.floor) {
				assert.equal(v.floor, report.floors.length + 1, 'floors progress one at a time');
				report.floors.push(v.floor);
				if (v.floor % 20 === 0) console.log('COOP_JOURNEY', JSON.stringify({ floor: v.floor, battles: report.battles }));
			}
			if (v.phase === 'blessing-selection') {
				report.blessings.push(v.floor);
				both('blessingchoice', { slot: v.coopBlessing.round.options.findIndex(option => !option.chosen) });
			} else if (v.phase === 'blessing-reward') {
				for (const user of [host, guest]) {
					const blessing = view(user).coopBlessing;
					if (!blessing) continue;
					if (blessing.ownStage) command(user, 'blessingreward', { value: blessing.ownStage.options[0].id });
					else if (blessing.ownPending.length) {
						const reward = blessing.ownPending[0];
						command(user, 'blessingreward', { member: reward.id,
							value: reward.kind === 'gift' ? (view(user).team.length < 6 ? 'join' : 'release') : reward.options?.[0]?.id });
					}
				}
			} else if (v.phase === 'area-selection') {
				const priority = ['rest', 'boss', 'wild', 'elite', 'trainer', 'reward', 'trade', 'event'];
				const rank = kind => priority.includes(kind) ? priority.indexOf(kind) : 99;
				const route = v.routeChoices.filter(entry => entry.available).sort((a, b) =>
					rank(a.kind) - rank(b.kind))[0];
				assert(route && !/秘闻/.test(route.name), 'normal shared route available');
				command(host, 'selectarea', { value: route.id });
				assert.equal(view(guest).partnerAreaSelection, route.id);
				assert.equal(view().phase, 'area-selection', 'one player cannot advance the shared route');
				command(guest, 'selectarea', { value: route.id });
			} else if (v.phase === 'battle-selection') {
				supplies(); await fight();
			} else if (v.phase === 'settlement') {
				both('continuebattle');
			} else if (v.phase === 'route-interaction') {
				if (v.coopEvent && (!v.coopEvent.ownComplete || !v.coopEvent.partnerComplete)) {
					if (!v.coopEvent.branchResolved) {
						const option = v.coopEvent.branchOptions.find(entry => !entry.disabled);
						assert(option, 'an unresolved shared event offers a choice');
						both('eventchoice', { visit: v.coopEvent.key, value: option.id });
					} else for (const user of [host, guest]) {
						const event = view(user).coopEvent;
						if (!event || event.ownComplete) continue;
						const option = event.options.find(entry => !entry.disabled);
						assert(option, 'an unresolved personal event offers a choice');
						command(user, 'eventchoice', { visit: event.key, value: option.id });
					}
					continue;
				}
				if (v.mentor && !v.mentor.card) both('mentorcard', { visit: v.mentor.key, value: 'balanced' });
				if (v.selectedRoute.kind === 'rest') both('heal');
				both('finishroute');
			} else if (v.phase === 'postgame') {
				both('godchallenge', { visit: v.postgame.key, value: 'decline' });
			} else if (v.phase === 'affection') {
				both('affection', { visit: v.coopAffection.visit, value: v.coopAffection.options[0].id });
			} else {
				assert.fail(`Unimplemented driver phase ${v.phase}: ${JSON.stringify(v)}`);
			}
		}
		const completed = store.coopSession(sessionId);
		assert.equal(completed.status, 'complete');
		assert.equal(completed.adventure.campaignCleared, true);
		assert.equal(report.floors.length, 200);
		assert.deepEqual(report.blessings, [1, 50, 100, 150]);
		assert(report.reopened && report.recovered, 'both route and native battle survive a closed store');
		assert.equal(report.captures.length, 2);
		for (const capture of report.captures) {
			assert(completed.adventure.members[capture.owner].team.some(mon => mon.id === capture.id));
			const other = capture.owner === host.id ? guest.id : host.id;
			assert(!completed.adventure.members[other].team.some(mon => mon.id === capture.id), 'capture belongs only to its owner');
		}
		for (const user of [host, guest]) {
			assert.deepEqual(store.get(user.id).difficulties.cleared, ['0']);
			assert.equal(store.history(user.id).records[0].outcome, 'complete');
			assert.equal(store.history(user.id).records[0].floor, 200);
		}
		console.log('COOP_JOURNEY_COMPLETE', JSON.stringify(report));
	});
});
