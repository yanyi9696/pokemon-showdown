'use strict';
// Isolated campaign playtest: real commands, native battles and the production NPC policy.
// No forced victories or resource grants. Half-meta starts with six +5 upgrades and three starter slots.
// Automated policies are repeatable probes, not a substitute for human usability testing.
const fs = require('fs');
const {randomUUID} = require('crypto');
const {Dex, toID} = require('../dist/sim/dex');
const {Teams} = require('../dist/sim/teams');
const {Battle} = require('../dist/sim/battle');
const {PRNG} = require('../dist/sim/prng');
const {rogueBattleResult} = require('../dist/sim/fantasy-rogue');
const {rogueBossChoice} = require('../dist/sim/rogue-bosses');
const {RogueStore} = require('../dist/server/fantasy-rogue/store');
const {RogueEngine} = require('../dist/server/fantasy-rogue/engine');
const {createPreviewContent} = require('../dist/server/fantasy-rogue/preview-content');
const {evolutionOptions} = require('../dist/server/fantasy-rogue/progression');
const {blessingView, fantasyForm} = require('../dist/server/fantasy-rogue/blessings');
const {eventView} = require('../dist/server/fantasy-rogue/events');
const {storyView} = require('../dist/server/fantasy-rogue/story');
const {shopStock, machineMoves} = require('../dist/server/fantasy-rogue/trading');
const {rewardSceneView} = require('../dist/server/fantasy-rogue/reward-scenes');
const {growthOffers} = require('../dist/server/fantasy-rogue/growth');
const {centerCare} = require('../dist/server/fantasy-rogue/economy');
const {inventoryItem, healingLocked} = require('../dist/server/fantasy-rogue/team');
const {InformationView} = require('../dist/server/fantasy-ai/information');
const {captureInitialMoves} = require('../dist/server/fantasy-ai/initial-snapshot');
const {emergencyChoice} = require('../dist/server/fantasy-ai/fallback');
const {RulePolicy} = require('../dist/server/fantasy-ai/policy');
const profile = process.argv[2] || 'prepared', seed = Number(process.argv[3] || 1), stop = Number(process.argv[4] || 200);
const desiredTier = process.argv[5] || 'silver';
const starter = ['fuecoco', 'mudkip', 'bulbasaur', 'popplio'][(seed - 1) % 4];
const starters = profile === 'halfmeta' ? [starter, ...['fuecoco', 'mudkip', 'bulbasaur'].filter(id =>
	id !== starter && !(starter === 'popplio' && id === 'mudkip'))].slice(0, 3) : [starter];
if (!['newcomer', 'prepared', 'halfmeta'].includes(profile)) throw Error('Unknown profile');
const out = `docs/playtests/2026-10-17/permanent/v9-${profile}-${seed}-${desiredTier}`;
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(out + '/actions.jsonl', '');
const dex = Dex.mod('gen9fantasy'), content = {...createPreviewContent(), story: true};
const rng = new PRNG([2026, 10, 17, seed]);
const store = new RogueStore(':memory:'), engine = new RogueEngine(store, content, max => rng.random(max));
const user = 'combatqa', events = [], metrics = {profile, seed, starter, starters, startingSlots: starters.length, desiredTier, driverVersion: 9, halfMeta: profile === 'halfmeta', battles: [], purchases: [], floors: [], choices: [], issues: []};
const account = () => store.get(user), run = () => account().run;
const record = (type, data) => {events.push({type, ...data}); fs.appendFileSync(out + '/actions.jsonl', JSON.stringify({type, ...data}) + '\n');};
const cmd = (action, data = {}) => {
	const before = run(), result = engine.command(user, {id: randomUUID(), revision: account().revision, action, ...data});
	if (['buy', 'buygrowth', 'heal', 'emergency'].includes(action)) metrics.purchases.push({floor: before.floor, action, item: data.value, coins: before.money - result.run.money});
	record('action', {floor: before?.floor, action, ...data}); return result;
};
function potential(name, seen = new Set()) {
	const sp = dex.species.get(name); if (seen.has(sp.id)) return sp.bst; seen.add(sp.id);
	return Math.max(sp.bst, ...sp.evos.map(e => potential(e, seen)));
}
const strength = mon => potential(mon.set.species) + mon.set.level * 7 + (mon.initialPartner ? 140 : 0) + ((mon.stars || 1) - 1) * 100;
function moveValue(id, mon) {
	const move = dex.moves.get(id), species = dex.species.get(mon.set.species);
	if (move.category === 'Status') return ['recover', 'roost', 'slackoff', 'synthesis'].includes(move.id) ? 72 :
		['swordsdance', 'dragondance', 'quiverdance', 'calmmind', 'bulkup'].includes(move.id) ? 55 : 0;
	const atk = mon.stats?.atk || species.baseStats.atk, spa = mon.stats?.spa || species.baseStats.spa;
	return (move.basePower || 55) * (move.accuracy === true ? 1 : move.accuracy / 100) *
		(species.types.includes(move.type) ? 1.5 : 1) * (move.category === 'Physical' ? atk : spa) / Math.max(atk, spa) /
		(move.flags.charge || move.self?.volatileStatus === 'mustrecharge' ? 1.8 : 1) + (move.id === 'torchsong' ? 35 : 0);
}
function preparation() {
	let r = run(); if (healingLocked(r)) return;
	for (let steps = 0; steps < 160; steps++) {
		r = run(); if (r.phase === 'blessing' || r.pendingMoves?.length || r.pendingCapture) return;
		const items = Object.keys(r.bag).filter(id => r.bag[id] > 0).map(id => inventoryItem(content, id)).filter(Boolean);
		const revive = items.find(i => i.kind === 'revive'), faint = r.team.find(m => !m.hp);
		if (faint && revive) {cmd('use', {member: faint.id, value: revive.id}); continue;}
		const evolver = r.team.find(m => m.hp && evolutionOptions(m, r).some(e => !e.item || r.bag[e.item] > 0));
		if (evolver) {cmd('evolve', {member: evolver.id, value: toID(evolutionOptions(evolver, r).find(e => !e.item || r.bag[e.item] > 0).species)}); continue;}
		const fantasy = r.team.filter(m => m.hp && fantasyForm(m.set.species)).sort((a, b) => strength(b) - strength(a))[0];
		if (r.blessings.shards >= 100 && fantasy && ['choose', 'ready', 'rest', 'reward'].includes(r.phase)) {cmd('fantasize', {member: fantasy.id}); continue;}
		const candy = items.filter(i => i.kind === 'candy').sort((a, b) => b.amount - a.amount)[0];
		if (candy) {
			const core = r.team.filter(m => m.hp && !m.fixedLevel && m.set.level < 100).sort((a, b) => b.set.level - a.set.level).slice(0, profile === 'newcomer' ? 3 : 2);
			const nextEvolution = m => evolutionOptions(m, r).length ? 0 : Math.min(...dex.species.get(m.set.species).evos.map(e => dex.species.get(e).evoLevel || 100));
			const nearEvolution = core.filter(m => nextEvolution(m) - m.set.level > 0 && nextEvolution(m) - m.set.level <= 3);
			const target = nearEvolution.sort((a, b) => nextEvolution(a) - a.set.level - (nextEvolution(b) - b.set.level))[0] || core.sort((a, b) => a.set.level - b.set.level)[0];
			if (target) {cmd('use', {member: target.id, value: candy.id, count: Math.min(r.bag[candy.id], Math.max(1, Math.ceil((target.set.level ** 2) / candy.amount)))}); continue;}
		}
		let acted = false;
		for (const mon of r.team.filter(m => m.hp)) {
			const machine = items.find(i => i.kind === 'machine' && machineMoves(mon).includes(i.move));
			if (machine) {cmd('use', {member: mon.id, value: machine.id}); acted = true; break;}
			if (r.node?.kind !== 'rest' && mon.hp < mon.maxhp * (r.node?.kind === 'boss' ? 0.98 : 0.65)) {
				const heal = items.filter(i => i.kind === 'heal').sort((a, b) => Math.abs(a.amount - (mon.maxhp - mon.hp)) - Math.abs(b.amount - (mon.maxhp - mon.hp)))[0];
				if (heal) {cmd('use', {member: mon.id, value: heal.id}); acted = true; break;}
			}
			const cure = items.find(i => i.kind === 'cure' && mon.status && (!i.cureStatuses || i.cureStatuses.includes(mon.status)));
			if (cure) {cmd('use', {member: mon.id, value: cure.id}); acted = true; break;}
			const ppSlot = mon.pp.findIndex(p => r.node?.kind !== 'rest' && p.pp < Math.min(3, p.maxpp) && dex.moves.get(p.id).category !== 'Status');
			const ether = items.find(i => i.kind === 'ether');
			if (ppSlot >= 0 && ether) {cmd('use', {member: mon.id, value: ether.id, slot: ppSlot}); acted = true; break;}
			const chosen = [], pool = (mon.moveMemory || mon.pp).filter(p => p.pp > 0).map(p => p.id);
			while (pool.length && chosen.length < 4) {
				const score = id => moveValue(id, mon) * (dex.moves.get(id).category !== 'Status' && chosen.some(m => dex.moves.get(m).category !== 'Status' && dex.moves.get(m).type === dex.moves.get(id).type) ? .25 : 1);
				pool.sort((a, b) => score(b) - score(a)); chosen.push(pool.shift());
			}
			const slot = chosen.findIndex((move, i) => move !== toID(mon.set.moves[i]));
			if (slot >= 0) {cmd('setmove', {member: mon.id, slot, value: chosen[slot]}); acted = true; break;}
			if (!mon.set.item) {
				const species = dex.species.get(mon.set.species);
				const boosters = {Fire: 'charcoal', Water: 'mysticwater', Grass: 'miracleseed', Electric: 'magnet', Ground: 'softsand', Dragon: 'dragonfang', Ghost: 'spelltag', Psychic: 'twistedspoon'};
				const preferred = ['leftovers', 'shellbell', ...species.types.map(t => boosters[t]).filter(Boolean), ...(dex.species.get(mon.set.species).evos.length ? ['eviolite'] : []), 'expertbelt', 'sitrusberry', 'oranberry'];
				const item = preferred.find(id => r.bag[id] > 0);
				if (item) {cmd('equip', {member: mon.id, value: item}); acted = true; break;}
			}
		}
		if (!acted) return;
	}
	throw Error('Preparation loop exceeded limit');
}
function combat() {
	const r = run(), encounter = r.node.encounters[r.encounter], ticket = r.battle, state = engine.battleState(user);
	const requests = {};
	const battle = new Battle({formatid: 'gen9fantasyrogue', seed: [2026, seed, r.floor, metrics.battles.length + 1], fantasyRogue: state,
		send(type, data) {
			if (type === 'sideupdate' && typeof data === 'string' && data.slice(3).startsWith('|request|')) {
				requests[data.slice(0, 2)] = JSON.parse(data.slice(12));
			}
		},
		p1: {name: 'Player', team: r.team.map(m => m.set)}, p2: {name: 'NPC', team: encounter.team}});
	const views = ['p1', 'p2'].map((side, i) => new InformationView({ownSide: side, difficulty: 'normal',
		...(i ? {opponentMoves: captureInitialMoves(battle, 'p1')} : {}), partySize: i ? r.team.length : encounter.team.length,
		rogueBoosts: r.boosts, rogueBlessings: state.blessings}));
	const policy = new RulePolicy({format: 'gen9fantasyrogue', style: 'balanced', packedTeam: Teams.pack(r.team.map(m => m.set)), keyMembers: [], resourcePreferences: ['mega', 'zmove', 'terastallize']});
	let cursor = 0, escaped = false, catches = 0, rejected = 0;
	try {
		for (let step = 0; !battle.ended && step < 1200; step++) {
			if (battle.turn > 100) {cmd('retreat'); escaped = true; break;}
			const update = battle.log.slice(cursor).join('\n'); cursor = battle.log.length;
			for (const v of views) v.receiveUpdate(update);
			for (let i = 0; i < 2; i++) {
				const side = battle.sides[i], request = requests[side.id];
				if (battle.ended || !request || request.wait || side.isChoiceDone()) continue;
				const observation = views[i].observe(request);
				let choice;
				if (request.teamPreview) {
					const slots = request.side.pokemon.map((mon, index) => ({mon, index}));
					const leadSpecies = encounter.trainer || encounter.boss || r.node.kind === 'elite' ? dex.species.get(encounter.team[0].species) : undefined;
					const leadScore = slot => {
						const mon = r.team[slot.index]; if (!mon.hp) return -10000;
						const ours = dex.species.get(mon.set.species);
						const offense = Math.max(...mon.set.moves.map(m => { const move = dex.moves.get(m); return moveValue(m, mon) * (!leadSpecies ? 1 : dex.getImmunity(move.type, leadSpecies) ? 2 ** dex.getEffectiveness(move.type, leadSpecies) : 0); }));
						const danger = !leadSpecies ? 1 : Math.max(...leadSpecies.types.map(t => dex.getImmunity(t, ours) ? 2 ** dex.getEffectiveness(t, ours) : 0));
						return (offense + mon.set.level * 2) / Math.max(.5, danger) * mon.hp / mon.maxhp;
					};
					if (!i) slots.sort((a, b) => leadScore(b) - leadScore(a));
					choice = 'team ' + slots.map(slot => slot.index + 1).join('');
				}
				if (!i && request.fantasyRogue?.dragonKing?.pending) {
					const king = request.fantasyRogue.dragonKing;
					choice = 'rogueking ' + king.options[0] + ' ' + king.token;
				}
				if (!i && request.fantasyRogue?.catchable && !request.forceSwitch && !request.teamPreview && catches < 3) {
					const foeLine = battle.log.filter(l => /^\|(switch|drag)\|p2/.test(l)).at(-1);
					const species = dex.species.get(foeLine?.split('|')[3]?.split(',')[0] || '');
					const useful = species.bst >= 430 || potential(species.name) >= 500;
					const want = useful && species.exists && !r.team.some(m => dex.species.get(m.set.species).baseSpecies === species.baseSpecies) &&
					(r.team.length < 6 || potential(species.name) + (Number(foeLine?.split(', L')[1]?.split(',')[0]) || 1) * 7 > Math.min(...r.team.map(strength)) + 80);
					const ball = request.fantasyRogue.balls?.filter(b => b.count > 0).sort((a, b) => b.chance - a.chance)[0];
					if (want && ball && ball.chance >= .35) {choice = 'rogueball ' + ball.id; catches++;}
				}
				if (!choice) choice = i ? (encounter.boss && rogueBossChoice(request)) || emergencyChoice(observation, 'gen9fantasyrogue', [], true) :
					profile === 'newcomer' ? emergencyChoice(observation, 'gen9fantasyrogue', [], true) : policy.decide(observation, [2026, seed, r.floor, step + 1]).choice;
				if (!choice || !battle.choose(side.id, choice)) {
					rejected++; const retry = emergencyChoice(observation, 'gen9fantasyrogue', choice ? [choice] : [], true);
					if (!battle.choose(side.id, retry)) throw Error(`Rejected combat choice: ${choice} / ${retry}`);
				}
			}
		}
		if (!battle.ended && !escaped) throw Error('Native battle request loop exhausted');
		const result = rogueBattleResult(battle);
		engine.settle(user, ticket.token, result);
		const row = {floor: r.floor, kind: r.node.kind, name: encounter.trainer?.name || r.node.name, won: result.won, escaped,
			turns: battle.turn, faints: battle.log.filter(l => l.startsWith('|faint|p1')).length, caught: result.captures?.length || 0,
			team: r.team.map(m => ({species: m.set.species, level: m.set.level})), foe: encounter.team.map(m => ({species: m.species, level: m.level})),
			moneyBefore: r.money, moneyAfter: run().money, rescue: run().emergencyRecovery, rejected};
		metrics.battles.push(row); record('battle', row);
		if (r.node.kind === 'boss' || !result.won) console.log(JSON.stringify({profile, seed, ...row}));
		if (r.node.kind === 'boss' || !result.won) fs.writeFileSync(`${out}/battle-${metrics.battles.length}.log`, battle.log.join('\n'));
	} finally {battle.destroy();}
}
try {
	if (profile === 'halfmeta') store.change(user, a => {
		a.boosts = {hp: 5, atk: 5, def: 5, spa: 5, spd: 5, spe: 5}; a.slots = 3;
	});
	for (let i = 0; i < 20; i++) {
		const opening = storyView(account(), true, false);
		if (!opening?.key) break;
		cmd('storynext', {value: opening.key});
	}
	cmd('start', {starters, useSpirit: false});
	let previousFloor = 0;
	for (let step = 0; step < 18000; step++) {
		let r = run();
		if (r.floor !== previousFloor) {
			previousFloor = r.floor; metrics.floors.push({floor: r.floor, money: r.money, team: r.team.map(m => ({species: m.set.species, level: m.set.level})), bag: r.bag});
			fs.writeFileSync(out + '/progress.json', JSON.stringify(metrics));
		}
		if (r.floor > stop || r.phase === 'complete' && !r.story) break;
		const story = storyView(account(), true, false);
		if (story?.key) {cmd('storynext', {value: story.key}); continue;}
		if (story?.stage === 'cards') {cmd('startcard', {value: 'all'}); continue;}
		if (r.phase === 'battle') {combat(); continue;}
		if (r.pendingMoves?.length) {
			const p = r.pendingMoves[0], mon = r.team.find(m => m.id === p.member);
			const worst = mon.set.moves.map((m, slot) => ({slot, value: moveValue(m, mon)})).sort((a, b) => a.value - b.value)[0];
			cmd('learn', {member: mon.id, value: moveValue(p.move, mon) > worst.value ? String(worst.slot) : 'skip'}); continue;
		}
		if (r.pendingCapture) {
			const worst = r.team.slice().sort((a, b) => strength(a) - strength(b))[0];
			cmd('replace', {value: r.team.length < 6 ? 'join' : strength(r.pendingCapture) > strength(worst) ? worst.id : 'release'}); continue;
		}
		if (r.phase === 'blessing') {
			const b = blessingView(r), p = b.pending[0];
			if (p) {
				let value = p.options?.[0]?.id;
				if (p.kind === 'gift') {const worst = r.team.slice().sort((a, b) => strength(a) - strength(b))[0]; value = r.team.length < 6 ? 'join' : strength(p.pokemon) > strength(worst) ? worst.id : 'release';}
				if (p.kind === 'ability') value = p.options.find(o => o.id !== 'hugepower' && o.id !== 'skip')?.id || value;
				if (p.kind === 'target') value = r.team.filter(m => p.options.some(o => o.id === m.id)).sort((a, b) =>
					((b.stats?.spa || 0) + b.set.level * 3 + (b.initialPartner ? 50 : 0)) - ((a.stats?.spa || 0) + a.set.level * 3 + (a.initialPartner ? 50 : 0)))[0]?.id || value;
				cmd('blessingreward', {member: p.id, value}); continue;
			}
			if (b.stage) {cmd('blessing', {value: b.stage.options.find(o => o.id === 'moves' || o.id === 'power' || o.id === 'stat:spa')?.id || b.stage.options[0].id}); continue;}
			const choices = b.round.options.map((o, slot) => ({...o, slot})).filter(o => !o.chosen);
			const priority = {medic: 130, restinball: 120, hpgrowth: 115, powerchoice: 105, ordinary: 100, friend: 92,
				eventtask: 88, battletask: 86, money: 84, bigmoney: 80, hero: 78, drain: 75, execute: 74,
				arsenal: 72, capturebonus: 70, bond: 68, insight: 60, cephalosporin: 60, reservation: 58, supercombo: 56};
			const score = o => (priority[o.family || o.id] || 25) + (o.tier === 'silver' ? 10 : o.tier === 'gold' ? 0 : -15);
			choices.sort((a, b) => score(a) - score(b));
			const matching = choices.filter(o => o.tier === desiredTier);
			let pick = matching.at(-1) || choices.at(-1);
			if (score(pick) < 65) {
				const reroll = choices.find(o => o.refreshes > 0);
				if (reroll) {cmd('blessingrefresh', {slot: reroll.slot}); continue;}
			}

			metrics.choices.push({floor: r.floor, blessing: pick.id, tier: pick.tier}); cmd('blessing', {slot: pick.slot}); continue;
		}
		if (r.phase === 'postgame') {cmd('godchallenge', {value: 'decline'}); continue;}
		if (r.phase === 'event') {
			const event = eventView(r);
			if (event.stage === 'result') {
				preparation();
				if (!run().team.some(m => m.hp)) {metrics.issues.push({floor: r.floor, reason: 'no-living-member-no-revive', money: r.money}); break;}
				cmd('continue'); continue;
			}
			if (event.stage === 'fragments') {cmd('event', {member: event.key, value: r.blessings.shards < 300 ? 'fragments' : 'supplies'}); continue;}
			const preferred = {mysteryball: 'open', forest: 'mediate', mushrooms: 'trade', room: 'sleep', martial: 'technique', travel: 'leave', tutor: 'leave', bandits: 'coin', dice: 'leave', fishing: 'leave'};
			const options = event.options?.filter(o => !o.disabled) || [];
			const pick = options.find(o => o.id === preferred[event.id]) || options.find(o => o.id === 'leave') || options[0];
			if (!pick) {metrics.issues.push({floor: r.floor, event, reason: 'needs-interactive-event-policy'}); break;}
			cmd('event', {member: event.key, value: pick.id}); continue;
		}
		preparation(); r = run(); if (r.pendingMoves?.length || r.phase === 'blessing') continue;
		if (!r.team.some(m => m.hp)) {metrics.issues.push({floor: r.floor, reason: 'no-living-member-no-revive', money: r.money}); break;}
		if (r.phase === 'choose') {
			const healthy = r.team.filter(m => m.hp > m.maxhp * .65).length;
			const healing = Object.entries(r.bag).reduce((total, [id, count]) => total + (inventoryItem(content, id)?.kind === 'heal' ? count : 0), 0);
			const needsSupplies = healthy < 2 || healing < 2;
			const rank = n => n.kind === 'trade' ? (n.trade?.kind === 'growth' && r.money > 4000 ? 90 : r.money > 1600 && n.trade?.kind === 'candy' ? 85 : 10) : n.kind === 'wild' ? (needsSupplies ? 25 : 65) : n.kind === 'elite' ?
				(profile !== 'newcomer' && r.floor >= 40 && r.team.filter(m => m.hp > m.maxhp * .8).length >= 5 &&
					Math.max(...r.team.map(m => m.set.level)) >= 10 + Math.ceil(r.floor / 2) && healing >= 5 ? 80 : 20) : n.kind === 'event' ? (needsSupplies || r.floor % 4 === 0 ? 75 : 58) : n.kind === 'reward' ? (needsSupplies ? 85 : 60) : 25;
			const pick = r.choices.slice().sort((a, b) => rank(b) - rank(a))[0];
			record('route', {floor: r.floor, kind: pick.kind, name: pick.name}); cmd('select', {value: pick.id}); continue;
		}
		if (r.phase === 'ready') {
			const attempts = metrics.battles.filter(b => b.floor === r.floor && !b.won).length;
			if (attempts >= 4) {metrics.issues.push({floor: r.floor, reason: 'four-loss-wall'}); break;}
			const king = blessingView(r)?.dragonKing;
			if (king && !king.ability && king.options.length) {cmd('dragonking', {member: king.member, value: king.options[0]}); continue;}
			cmd('battle'); continue;
		}
		if (r.phase === 'reward') {
			const scene = rewardSceneView(r);
			if (scene && !scene.claimed) {
				if (scene.demonstrations.length) {cmd('rewardchoice', {value: 'show', member: scene.demonstrations[0].member}); continue;}
				const core = r.team.slice().sort((a, b) => strength(b) - strength(a))[0];
				const investment = scene.choices.find(c => c.id === ((core.training?.offense || 0) > (core.training?.defense || 0) ? 'defense' : 'offense'));
				const target = investment.targets?.find(t => t.member === core.id && t.amount >= 300);
				const train = target && ((r.floor >= 11 && !core.training?.offense) || r.floor >= 51 && r.floor % 3 !== 0 || core.set.level === 100);
				cmd('rewardchoice', {value: train ? investment.id : 'experience', ...(train ? {member: core.id} : {})}); continue;
			}
			cmd('continue'); continue;
		}
		if (r.phase === 'rest') {
			if (r.mentorOffer) {cmd('mentorcard', {value: 'balanced'}); continue;}
			if (Object.keys(r.bag).some(id => r.bag[id] > 0 && inventoryItem(content, id)?.kind === 'treasure')) {cmd('sell', {value: 'all'}); continue;}
			const care = r.node.kind === 'rest' && centerCare(r);
			if (care?.needed && r.money >= care.cost) {cmd('heal'); continue;}
			const stock = shopStock(content, r), reserve = 1000 + r.floor * 15;
			if (r.node.trade?.kind === 'growth') {
				const offers = growthOffers(r).filter(o => o.remaining && o.amount && r.money >= o.price + reserve &&
					(o.id !== 'experience' || r.floor < 100));
				offers.sort((a, b) => (r.growth?.[a.id] || 0) - (r.growth?.[b.id] || 0));
				if (offers.length) {cmd('buygrowth', {value: offers[0].id}); continue;}
			}
			const essentials = {revive: 1, ether: 3, potion: r.floor < 19 ? 6 : 0, superpotion: r.floor >= 19 && r.floor < 69 ? 5 : 0, hyperpotion: r.floor >= 69 ? 6 : 0};
			const supply = stock.find(i => (i.remaining ?? 1) > 0 && (r.bag[i.id] || 0) < (essentials[i.id] || 0) && r.money >= i.price + 250);
			if (supply) {cmd('buy', {value: supply.id}); continue;}
			const candy = stock.filter(i => i.kind === 'candy' && r.money >= i.price + 500 && (i.remaining ?? 1) > 0)
				.sort((a, b) => b.amount / b.price - a.amount / a.price)[0];
			if (candy) {cmd('buy', {value: candy.id}); continue;}
			const machine = stock.filter(i => i.kind === 'machine' && (i.remaining ?? 1) > 0 && r.money >= i.price + reserve).find(i => r.team.some(mon =>
				machineMoves(mon).includes(i.move) && moveValue(i.move, mon) > Math.min(...mon.set.moves.map(move => moveValue(move, mon))) + 45));
			if (machine) {cmd('buy', {value: machine.id}); continue;}
			const targets = {revive: 3, ether: 8, potion: r.floor < 30 ? 8 : 0, superpotion: r.floor >= 20 && r.floor < 80 ? 10 : 0,
				hyperpotion: r.floor >= 60 ? 10 : 0, fullheal: 3, pokeball: r.floor < 40 ? 10 : 0, greatball: r.floor >= 20 && r.floor < 80 ? 8 : 0, ultraball: r.floor >= 60 ? 8 : 0};
			const buy = stock.find(i => (i.remaining ?? 1) > 0 && (r.bag[i.id] || 0) < (targets[i.id] || 0) && r.money >= i.price + 400);
			if (buy) {cmd('buy', {value: buy.id}); continue;}
			const held = stock.find(i => ['leftovers', 'shellbell', 'eviolite'].includes(i.id) && !r.bag[i.id] &&
				r.team.some(m => !m.set.item) && r.money >= i.price + reserve);
			if (held) {cmd('buy', {value: held.id}); continue;}
			cmd('continue'); continue;
		}
		metrics.issues.push({floor: r.floor, phase: r.phase, reason: 'unhandled-phase'}); break;
	}
} catch (error) {metrics.issues.push({floor: run()?.floor, reason: 'driver-error', error: error.stack}); console.error(error.stack);
} finally {
	metrics.lastFloor = run()?.floor; metrics.phase = run()?.phase;
	fs.writeFileSync(out + '/summary.json', JSON.stringify(metrics, null, 2));
	fs.writeFileSync(out + '/final-save.json', JSON.stringify(account(), null, 2)); store.close();
	console.log(JSON.stringify({profile, seed, lastFloor: metrics.lastFloor, phase: metrics.phase, battles: metrics.battles.length, issues: metrics.issues}));
}
