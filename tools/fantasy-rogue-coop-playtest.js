'use strict';

// Called only from the isolated test/main.js bootstrap. Uses native Rooms and the production
// co-op manager, with normal resources. This is a scripted campaign, not a human/Edge benchmark.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert').strict;
const { setTimeout: delay } = require('timers/promises');

async function runCoopPlaytest({ engineRoot, output, seed = 1, profile = 'newcomer', stop = 200, resume = false }) {
	assert(['newcomer', 'experienced'].includes(profile));
	assert(Config.nofswriting && Config.noguestsecurity, 'Use the isolated test bootstrap, never a running game server');
	assert(!fs.existsSync(output) || resume, 'Preserve existing samples; explicitly resume or use a new directory');
	fs.mkdirSync(output, { recursive: true });
	const previous = resume ? JSON.parse(fs.readFileSync(path.join(output, 'summary.json'), 'utf8')) : undefined;
	if (previous) {
		assert.equal(previous.version, 2); assert.equal(previous.profile, profile); assert.equal(previous.seed, seed);
		assert(!['complete', 'resource-defeat', 'resource-wall'].includes(previous.outcome), 'Do not restart a terminal sample');
	}
	const load = id => require(path.join(engineRoot, id));
	const { makeUser } = require(path.join(engineRoot, '../test/users-utils'));
	const { RogueStore } = load('server/fantasy-rogue/store');
	const { RogueEngine } = load('server/fantasy-rogue/engine');
	const { RogueManager } = load('server/fantasy-rogue/manager');
	const { AIChallengeManager } = load('server/fantasy-ai/manager');
	const { createPreviewContent } = load('server/fantasy-rogue/preview-content');
	const { Dex, toID } = load('sim/dex');
	const { extractChannelMessages } = load('sim/battle');
	const { rankMultiChoices } = load('server/fantasy-ai/multi-policy');
	const { enumerateDoublesChoices } = load('server/fantasy-ai/doubles-actions');
	const { inventoryItem } = load('server/fantasy-rogue/team');
	const dex = Dex.mod('gen9fantasy'), content = createPreviewContent();
	const oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
	Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
	Config.fantasyrogue = { enabled: true, publicAccess: true };
	const originalRandom = crypto.randomInt;
	const restoreEnvironment = () => {
		crypto.randomInt = originalRandom;
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	};
	let rng = previous?.rngState ?? ((seed + 199) | 0);
	crypto.randomInt = (min, max) => {
		if (max === undefined) { max = min; min = 0; }
		rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
		return min + (rng >>> 0) % (max - min);
	};
	const store = new RogueStore(path.join(output, 'isolated.db'));
	const engine = new RogueEngine(store, content, max => crypto.randomInt(max));
	const ai = new AIChallengeManager([], { enabled: true, workers: 1, maxBattles: 1 });
	const manager = new RogueManager(engine, () => ai);
	const users = [makeUser(`Coop Probe A ${seed}`, '127.9.1.1'), makeUser(`Coop Probe B ${seed}`, '127.9.1.2')];
	const starterPairs = [['fuecoco', 'mudkip'], ['bulbasaur', 'popplio'], ['torchic', 'squirtle']];
	const report = previous || { version: 2, profile, seed, stop, started: new Date().toISOString(),
		conditions: { difficulty: 0, startersPerPlayer: 2, statBoosts: 0, spirit: false, nativeRooms: true,
			privateOpponentState: false, productionNPC: true, normalResources: true },
		floors: [], battles: [], captureAttempts: [], issues: [], commands: 0 };
	report.stop = stop; delete report.outcome;
	let sessionId, room;
	const saved = () => sessionId ? store.coopSession(sessionId) : store.coopSessionForUser(users[0].id);
	const view = (user = users[0]) => manager.coop.view(user).session?.adventure;
	const own = user => saved().adventure.members[user.id];
	const record = (type, data) => fs.appendFileSync(path.join(output, 'actions.jsonl'), JSON.stringify({ type, ...data }) + '\n');
	const snapshot = () => {
		report.rngState = rng;
		report.driverHash = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
		fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2));
		if (saved()) fs.writeFileSync(path.join(output, 'final-session.json'), JSON.stringify(saved(), null, 2));
		fs.writeFileSync(path.join(output, 'final-accounts.json'), JSON.stringify(users.map(user => store.get(user.id)), null, 2));
	};
	const command = (user, action, extra = {}) => {
		const before = saved()?.adventure;
		const result = manager.coop.command(user, { action, id: crypto.randomUUID(), ...extra });
		report.commands++;
		record('command', { user: user.id, floor: before?.floor, action, ...extra });
		return result;
	};
	const both = (action, extra = {}) => { for (const user of users) command(user, action, extra); };
	const compact = user => own(user).team.map(m => ({ id: m.id, species: m.set.species, level: m.set.level,
		hp: m.hp, maxhp: m.maxhp, item: m.set.item, moves: m.set.moves }));
	function resourceWall() {
		const recoveries = users.map(user => view(user).recovery);
		if (!recoveries.some(r => r && !r.locked && r.allFainted && !r.items.length && r.money < r.cost)) return false;
		report.outcome = 'resource-wall'; record('resource-wall', { phase: view().phase, views: recoveries,
			parties: users.map(compact), bags: users.map(u => own(u).bag), money: users.map(u => own(u).money) });
		return true;
	}
	function moveValue(id, mon) {
		const move = dex.moves.get(id), species = dex.species.get(mon.set.species);
		if (move.category === 'Status') return ['protect', 'detect'].includes(move.id) ? 44 :
			['tailwind', 'spore', 'sleeppowder', 'recover', 'synthesis', 'roost'].includes(move.id) ? 55 : 0;
		const attack = move.category === 'Physical' ? species.baseStats.atk : species.baseStats.spa;
		return (move.basePower || 50) * (move.accuracy === true ? 1 : move.accuracy / 100) *
			(species.types.includes(move.type) ? 1.5 : 1) * attack / Math.max(species.baseStats.atk, species.baseStats.spa) /
			(move.flags.charge || move.self?.volatileStatus === 'mustrecharge' ? 2 : 1);
	}
	function growth() {
		for (const user of users) for (let step = 0; step < 100; step++) {
			const v = view(user), pending = v?.pendingMove, evolution = v?.liveGrowth?.evolutions[0];
			if (pending) {
				const mon = own(user).team.find(m => m.id === pending.member), slots = mon.set.moves.map((id, slot) => ({ slot, value: moveValue(id, mon) }));
				slots.sort((a, b) => a.value - b.value);
				const take = !mon.set.moves.some(id => toID(id) === pending.move) && moveValue(pending.move, mon) > slots[0].value;
				command(user, 'learn', { member: pending.member, move: pending.move, visit: v.liveGrowth?.key,
					value: take ? String(slots[0].slot) : 'skip' });
			} else if (evolution) command(user, 'evolutionnotice', { member: evolution.member, visit: v.liveGrowth.key });
			else break;
		}
	}
	function prepare(user) {
		for (let step = 0; step < 150; step++) {
			growth(); const v = view(user), state = own(user), recovery = v.recovery, inventory = v.inventory;
			if (!inventory || inventory.locked || inventory.suppliesLocked || v.pendingCapture) break;
			const items = Object.keys(state.bag).filter(id => state.bag[id] > 0).map(id => inventoryItem(content, id)).filter(Boolean);
			const faint = state.team.find(m => !m.hp && !m.egg), revive = items.find(i => i.kind === 'revive');
			if (faint && revive && !recovery?.locked) { command(user, 'useitem', { member: faint.id, value: revive.id }); continue; }
			if (recovery?.emergency && v.money >= recovery.cost) { command(user, 'emergency'); continue; }
			const evolution = inventory.members.flatMap(m => m.evolutions.filter(e => e.ready).map(e => ({ member: m.member, ...e })))[0];
			if (evolution) { command(user, 'evolve', { member: evolution.member, value: toID(evolution.species) }); continue; }
			const fantasy = profile === 'experienced' && inventory.members.find(m => m.fantasyReady && m.fantasyOptions.length);
			if (fantasy) {
				command(user, 'fantasize', { member: fantasy.member, value: fantasy.fantasyOptions[0].species, confirmed: true }); continue;
			}
			const unarmed = inventory.members.find(m => !m.item && ['leftovers', 'shellbell', 'sitrusberry', 'oranberry'].some(id => m.equipment.includes(id)));
			if (unarmed) {
				const item = ['leftovers', 'shellbell', 'sitrusberry', 'oranberry'].find(id => unarmed.equipment.includes(id));
				command(user, 'equip', { member: unarmed.member, value: item }); continue;
			}
			const candy = inventory.supplies.find(i => i.kind === 'candy' && i.targets.length);
			if (candy) {
				const eligible = state.team.filter(m => m.hp && !m.egg && m.set.level < 100 && candy.targets.some(t => t.member === m.id));
				const core = profile === 'experienced' ? eligible.filter(m => m.initialPartner) : eligible;
				const target = (core.length ? core : eligible).sort((a, b) => a.set.level - b.set.level)[0];
				if (target) { command(user, 'use', { member: target.id, value: candy.id, count: 1 }); continue; }
			}
			const injured = state.team.find(m => m.hp > 0 && m.hp < m.maxhp * 0.7), heal = items.find(i => i.kind === 'heal');
			if (injured && heal) { command(user, 'useitem', { member: injured.id, value: heal.id }); continue; }
			const drained = state.team.find(m => m.hp && m.pp.some(p => p.pp < 3 && dex.moves.get(p.id).category !== 'Status'));
			const ether = items.find(i => i.kind === 'ether');
			if (drained && ether) {
				command(user, 'useitem', { member: drained.id, value: ether.id,
					slot: drained.pp.findIndex(p => p.pp < 3 && dex.moves.get(p.id).category !== 'Status') }); continue;
			}
			break;
		}
	}
	function shop(user) {
		// Buy only from the real, individually priced stock. No inventory grants.
		for (let step = 0; step < 100; step++) {
			const quote = view(user).recycling;
			if (!quote || quote.locked) break;
			const item = quote.items.find(i => inventoryItem(content, i.id)?.kind === 'treasure');
			if (!item) break;
			command(user, 'sell', { value: item.id, quote: quote.quote, confirmed: true });
		}
		const targets = { revive: 2, heal: 4, ether: 3, ball: 6 };
		for (const [kind, target] of Object.entries(targets)) {
			const v = view(user), state = own(user);
			const have = Object.entries(state.bag).reduce((n, [id, count]) =>
				n + (inventoryItem(content, id)?.kind === kind ? count : 0), 0);
			const item = v.shopItems.filter(i => i.kind === kind && i.price > 0 && i.remaining !== 0)
				.sort((a, b) => a.price - b.price)[0];
			if (!item) continue;
			const count = Math.min(target - have, Math.floor(Math.max(0, v.money - 300) / item.price), item.remaining ?? target);
			if (count > 0) command(user, 'buy', { value: item.id, count });
		}
	}
	// Rotate the two human seats into the NPC scorer's coordinate system. Only the
	// two collaborating players' own requests and public spectator messages enter it.
	const rotate = text => text.replace(/\bp([1-4])(?=[a-z]?:|\b)/g, (_, n) => `p${Number(n) % 2 ? Number(n) + 1 : Number(n) - 1}`);
	function playerCommands(requests, log, fixed, excluded) {
		const mapped = Object.fromEntries(Object.entries(requests).map(([side, req]) => [rotate(side), JSON.parse(rotate(JSON.stringify(req)))]));
		const options = { allowSwitch: profile === 'experienced', jointTurns: profile === 'experienced',
			fixed: Object.fromEntries(Object.entries(fixed).map(([side, value]) => [rotate(side), value])),
			excluded: Object.fromEntries(Object.entries(excluded).map(([side, value]) => [rotate(side), value])) };
		const ranked = mapped.p2 && mapped.p4 ? rankMultiChoices(mapped, log.map(rotate), 'gen9fantasy', options) : [];
		return ranked[0] ? { p1: ranked[0].commands.p2, p3: ranked[0].commands.p4 } : {};
	}
	async function fight() {
		if (!room) command(users[0], 'preparebattle', { visit: view().battleSelectionKey });
		room = Rooms.get(saved().roomid); assert(room?.battle);
		const row = { floor: view().floor, name: view().selectedRoute?.name, parties: users.map(compact),
			moneyBefore: users.map(u => own(u).money), choices: [], errors: [], npcDecisions: [] };
		const requests = {}, sent = new Map(), captureTurns = new Set(), seenRequest = new Map(), targetAttempts = new Map();
		const excluded = { p1: new Set(), p3: new Set() };
		const receive = room.battle.receive.bind(room.battle);
		room.battle.receive = lines => {
			if (lines[0] === 'sideupdate' && /^\|error\|/.test(lines[2] || '')) {
				const side = lines[1]; row.errors.push({ side, message: lines[2] });
				if (excluded[side]) {
					const previousChoice = row.choices.findLast(c => c.side === side)?.choice;
					if (previousChoice) excluded[side].add(previousChoice);
					sent.delete(side);
				}
			}
			receive(lines);
		};
		let lastDecision, lastActivity = Date.now();
		const deadline = Date.now() + 180000;
		while (['battle', 'battle-starting'].includes(saved().adventure.phase)) {
			if (Date.now() > deadline || Date.now() - lastActivity > 25000) throw new Error(`Native battle stalled at floor ${row.floor}`);
			growth();
			const decision = room.battle.rogueCoop?.lastDecision;
			if (decision && decision !== lastDecision) {
				row.npcDecisions.push(structuredClone(decision)); lastDecision = decision; lastActivity = Date.now();
			}
			const seats = [room.battle.p1, room.battle.p3];
			for (const seat of seats) {
				if (!seat.request.request) continue;
				if (seenRequest.get(seat.slot) !== seat.request.rqid) {
					excluded[seat.slot].clear(); seenRequest.set(seat.slot, seat.request.rqid);
				}
				const request = JSON.parse(seat.request.request);
				if (!request.wait) requests[seat.slot] = request;
			}
			const publicLog = extractChannelMessages(room.battle.stream.battle.log.join('\n'), [0])[0];
			let captured = false;
			if (seats.every(s => !s.request.isWait && !s.request.choice && requests[s.slot]?.active)) {
				const turnKey = seats.map(s => s.request.rqid).join(':');
				if (!captureTurns.has(turnKey)) {
					const candidates = users.map((user, i) => ({ user, i, team: own(user).team })).sort((a, b) => a.team.length - b.team.length);
					for (const { user, i, team } of candidates) {
						if (team.length >= 6) continue;
						const ball = ['ultraball', 'greatball', 'pokeball'].find(id => own(user).bag[id] > 0);
						const request = requests[seats[i].slot], target = request.fantasyRogue?.captureTargets?.find(t =>
							t.hp > 0 && (targetAttempts.get(t.id) || 0) < 2 && t.chances?.[ball] >= 0.35);
						if (target && ball && room.battle.canStartCoopCapture(user.id, ball, target.key, target.id)) {
							command(user, 'proposecapture', { ball, captureTarget: target.key });
							const other = users[1 - i], proposal = view(other).captureProposal;
							command(other, 'respondcapture', { id: proposal.id, value: 'accept' });
							captureTurns.add(turnKey); captured = true; lastActivity = Date.now();
							targetAttempts.set(target.id, (targetAttempts.get(target.id) || 0) + 1);
							report.captureAttempts.push({ floor: row.floor, owner: user.id, ball, target: target.id }); break;
						}
					}
				}
			}
			if (captured) { await delay(5); continue; }
			const fixed = Object.fromEntries(seats.filter(s => s.request.isWait || s.request.choice).map(s => [s.slot, s.request.choice || null]));
			const planned = playerCommands(requests, publicLog, fixed, excluded);
			for (const [index, seat] of seats.entries()) {
				if (!seat.request.request || seat.request.isWait || seat.request.choice || sent.get(seat.slot) === seat.request.rqid) continue;
				const request = JSON.parse(seat.request.request); if (request.wait) continue;
				let choice = planned[seat.slot];
				if (request.teamPreview) {
					const chosen = request.side.pokemon.map((m, i) => ({ i, level: Number(/L(\d+)/.exec(m.details)?.[1] || 100) }))
						.filter(m => !request.side.pokemon[m.i].condition.endsWith('fnt')).sort((a, b) => b.level - a.level).slice(0, 3);
					choice = `team ${chosen.map(m => m.i + 1).join(',')}`;
				} else if (!choice) choice = enumerateDoublesChoices(request, { mod: 'gen9fantasy', allowSwitch: false })[0]?.choice || 'default';
				room.battle.choose(users[index], `${choice}|${seat.request.rqid}`);
				row.choices.push({ side: seat.slot, rqid: seat.request.rqid, choice });
				sent.set(seat.slot, seat.request.rqid); lastActivity = Date.now();
			}
			await delay(5);
		}
		const native = room.battle.stream.battle;
		assert(native.ended); row.turns = native.turn; row.won = !!saved().adventure.battleResult?.won;
		row.after = users.map(compact); row.moneyAfter = users.map(u => own(u).money);
		row.errors.push(...native.log.filter(line => /^\|(?:error|bigerror)\|/.test(line)));
		fs.writeFileSync(path.join(output, `battle-${report.battles.length + 1}.log`), native.log.join('\n'));
		report.battles.push(row); record('battle', row); snapshot();
		room.destroy(); room = undefined;
	}
	try {
		if (previous) {
			sessionId = saved().id;
			record('resume', { floor: saved().adventure.floor, phase: saved().adventure.phase, previousHash: previous.driverHash });
			if (['battle', 'battle-starting'].includes(saved().adventure.phase)) {
				both('recoverbattle'); room = Rooms.get(saved().roomid); assert(room?.battle);
			}
		} else {
			for (const [i, user] of users.entries()) {
				for (const [action, value] of [['onboarding'], ['upgrade', 'slot']]) engine.command(user.id,
					{ id: crypto.randomUUID(), revision: store.get(user.id).revision, action, value }, user.name);
				assert.equal(store.get(user.id).slots, 2); assert.equal(store.get(user.id).points, 0);
				record('starter-budget', { user: user.id, slots: 2, points: 0, starters: starterPairs[(seed - 1 + i) % 3] });
			}
			command(users[0], 'invite', { target: users[1].id, difficulty: 0 });
			command(users[1], 'accept', { id: store.coopInvitations(users[1].id)[0].id }); sessionId = saved().id;
			for (const [i, user] of users.entries()) command(user, 'selectstarters', { starters: starterPairs[(seed - 1 + i) % 3] });
		}
		for (let step = 0; step < 10000; step++) {
			growth(); const session = saved(), v = view();
			if (session.status !== 'active' || v.floor > stop) { report.outcome = session.status === 'active' ? 'checkpoint' : session.status; break; }
			if (v.comeback) {
				both('comeback', { visit: v.comeback.visit,
					value: v.comeback.answer ? 'continue' : v.comeback.page === 0 ? 'next' : 'yes' });
				continue;
			}
			if (report.floors.at(-1)?.floor !== v.floor) {
				report.floors.push({ floor: v.floor, parties: users.map(compact), money: users.map(u => own(u).money) });
				console.log(JSON.stringify({ floor: v.floor, battles: report.battles.length })); snapshot();
			}
			if (v.phase === 'blessing-selection') {
				const options = v.coopBlessing.round.options;
				both('blessingchoice', { slot: options.findIndex(o => !o.chosen) });
			} else if (v.phase === 'blessing-reward') {
				for (const user of users) {
					const b = view(user).coopBlessing;
					if (b?.ownStage) command(user, 'blessingreward', { value: b.ownStage.options.find(o => !o.disabled).id });
					else if (b?.ownPending.length) {
						const reward = b.ownPending[0];
						command(user, 'blessingreward', { member: reward.id,
							value: reward.kind === 'gift' ? (own(user).team.length < 6 ? 'join' : 'release') : reward.options?.find(o => !o.disabled)?.id });
					}
				}
			} else if (v.phase === 'area-selection') {
				for (const user of users) prepare(user);
				const priority = ['rest', 'boss', 'wild', 'elite', 'trainer', 'reward', 'trade', 'event'];
				const rank = kind => priority.includes(kind) ? priority.indexOf(kind) : priority.length;
				const route = v.routeChoices.filter(r => r.available).sort((a, b) => rank(a.kind) - rank(b.kind))[0];
				assert(route && !/秘闻/.test(route.name)); both('selectarea', { value: route.id });
			} else if (['battle-selection', 'battle', 'battle-starting'].includes(v.phase)) {
				for (const user of users) prepare(user);
				if (v.phase === 'battle-selection' && resourceWall()) break;
				await fight();
			} else if (v.phase === 'settlement') {
				for (const user of users) prepare(user);
				const result = view().battleResult;
				const canContinue = result?.won || result?.eventResolved || result?.companionRescue || result?.shopClosed;
				if (!canContinue && !view().canRetryTogether) {
					assert(resourceWall(), 'Retry is blocked for a reason other than exhausted recovery'); break;
				}
				both(canContinue ? 'continuebattle' : 'retrybattle');
			} else if (v.phase === 'route-interaction') {
				for (const user of users) prepare(user);
				if (v.coopChallenge) {
					const challenge = v.coopChallenge;
					const choice = challenge.choices.find(c => c.id === 'skip' || c.id === 'leave') || challenge.choices[0];
					const prize = challenge.prizes?.find(p => !p.disabled && p.id !== 'star');
					assert(choice || prize, 'Challenge needs an explicit supported choice');
					both('challenge', { visit: challenge.key, value: choice?.id || `prize:${prize.id}` });
					continue;
				}
				if (v.coopEvent && (!v.coopEvent.ownComplete || !v.coopEvent.partnerComplete)) {
					if (!v.coopEvent.branchResolved) {
						const option = v.coopEvent.branchOptions.find(o => !o.disabled); assert(option);
						both('eventchoice', { visit: v.coopEvent.key, value: option.id });
					} else for (const user of users) {
						const event = view(user).coopEvent; if (!event || event.ownComplete) continue;
						const option = event.options.find(o => !o.disabled); assert(option);
						command(user, 'eventchoice', { visit: event.key, value: option.id });
					}
					continue;
				}
				if (v.mentor && !v.mentor.card) both('mentorcard', { visit: v.mentor.key, value: 'balanced' });
				if (['rest', 'trade'].includes(v.selectedRoute.kind)) for (const user of users) shop(user);
				if (v.selectedRoute.kind === 'rest') for (const user of users) {
					const current = view(user);
					if (current.centerCare?.needed && current.centerCare.cost <= current.money) command(user, 'heal');
				}
				for (const user of users) prepare(user);
				both('finishroute');
			} else if (v.phase === 'postgame') both('godchallenge', { visit: v.postgame.key, value: 'decline' });
			else if (v.phase === 'affection') both('affection', { visit: v.coopAffection.visit, value: v.coopAffection.options[0].id });
			else throw new Error(`Unimplemented campaign phase ${v.phase}`);
		}
		assert(report.outcome, 'Driver step budget exhausted');
		return report;
	} catch (error) {
		report.issues.push({ message: error.message, stack: error.stack, floor: saved()?.adventure.floor });
		if (room?.battle?.stream?.battle) fs.writeFileSync(path.join(output, 'interrupted-battle.log'), room.battle.stream.battle.log.join('\n'));
		throw error;
	} finally {
		report.finished = new Date().toISOString(); report.lastFloor = saved()?.adventure.floor;
		report.lastPhase = saved()?.adventure.phase; snapshot();
		await ai.dispose(); room?.destroy();
		for (const user of users) { user.disconnectAll(); user.destroy(); }
		store.close(); restoreEnvironment();
	}
}

module.exports = { runCoopPlaytest };
