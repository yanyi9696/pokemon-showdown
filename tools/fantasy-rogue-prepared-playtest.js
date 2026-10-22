'use strict';
// Prepared, zero-stat-meta campaign probe. Real account commands and native battles;
// initial 20 points buy only the second slot. No forced wins, grants, save rewinds or enemy-state access.
// Trainer bosses use production search; wild bosses use the same immediate policy as live play.
// This is a scripted playtest, not browser/human usability validation.
const fs = require('fs');
const {randomUUID} = require('crypto');
const {Dex, toID} = require('../dist/sim/dex');
const {Teams} = require('../dist/sim/teams');
const {Battle, extractChannelMessages} = require('../dist/sim/battle');
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
const {coverageView} = require('../dist/server/fantasy-rogue/coverage');
const {growthOffers} = require('../dist/server/fantasy-rogue/growth');
const {centerCare} = require('../dist/server/fantasy-rogue/economy');
const {inventoryItem, healingLocked} = require('../dist/server/fantasy-rogue/team');
const {InformationView} = require('../dist/server/fantasy-ai/information');
const {captureInitialMoves} = require('../dist/server/fantasy-ai/initial-snapshot');
const {emergencyChoice} = require('../dist/server/fantasy-ai/fallback');
const {RulePolicy} = require('../dist/server/fantasy-ai/policy');
const {RolloutPolicy} = require('../dist/server/fantasy-ai/rollout');
const {DecisionTimeManager} = require('../dist/server/fantasy-ai/time-management');
const {DEFAULT_LIMITS} = require('../dist/server/fantasy-ai/types');
const {enumerateRequestChoices} = require('../dist/server/fantasy-ai/actions');
const {companionView} = require('../dist/server/fantasy-rogue/companions');
const {RIVAL_STYLES} = require('../dist/server/fantasy-rogue/rival-responses');
const {BEGINNER_GUIDE} = require('../dist/server/fantasy-rogue/beginner-guide');
const {roguePartyLimit} = require('../dist/sim/fantasy-rogue-spirits');
const {travellingRoster} = require('../dist/server/fantasy-rogue/travellers');
const {petSpecies} = require('../dist/sim/rogue-pets');
const {emergencyCost} = require('../dist/server/fantasy-rogue/early-balance');
const assert = require('assert').strict;
const profile = 'prepared6', seed = Number(process.argv[2] || 1), stop = Number(process.argv[3] || 200);
const desiredTier = process.argv[4] || 'adaptive';
const tacticalRetry = process.argv.includes('--tactical-retry');
const attritionRetry = process.argv.includes('--attrition-retry');
const stopAfterBattle = process.argv.includes('--stop-after-battle');
const starters = [['fuecoco', 'mudkip'], ['bulbasaur', 'popplio'], ['torchic', 'mudkip']][(seed - 1) % 3];
const starter = starters[0];
const out = process.argv[5] || `docs/playtests/2026-10-22/run-${seed}-${desiredTier}`;
fs.mkdirSync(out, {recursive: true});
const resumed = fs.existsSync(out + '/driver-state.json');
const savedDriver = resumed ? JSON.parse(fs.readFileSync(out + '/driver-state.json')) : undefined;
const guided = fs.existsSync(out + '/guided-preparation.json') ? JSON.parse(fs.readFileSync(out + '/guided-preparation.json')) : undefined;
const dex = Dex.mod('gen9fantasy'), content = {...createPreviewContent(), story: true};
const rng = new PRNG(savedDriver?.rng || [2026, 10, 22, seed]);
const store = new RogueStore(out + '/campaign.db'), engine = new RogueEngine(store, content, max => rng.random(max));
const user = 'preparedqa', events = [], metrics = savedDriver?.metrics || {profile, seed, starter, starters, startingSlots: 2, desiredTier, driverVersion: 5,
	driverHash: require('crypto').createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
	conditions: {spirit: false, statBoosts: 0, slotPurchase: 20, hiddenOpponentState: false, enemyBossSearchBudgetMs: 4500},
	battles: [], purchases: [], floors: [], choices: [], issues: [], started: new Date().toISOString()};
const checkpoint = () => fs.writeFileSync(out + '/driver-state.json', JSON.stringify({rng: rng.getSeed(), metrics}));
const account = () => store.get(user), run = () => account().run;
const partyLimit = () => roguePartyLimit(run().spirit, run().blessings);
const record = (type, data) => {events.push({type, ...data}); fs.appendFileSync(out + '/actions.jsonl', JSON.stringify({type, ...data}) + '\n');};
const cmd = (action, data = {}) => {
	const before = run(), result = engine.command(user, {id: randomUUID(), revision: account().revision, action, ...data});
	if (['buy', 'buygrowth', 'heal', 'emergency'].includes(action)) metrics.purchases.push({floor: before.floor, action, item: data.value, coins: before.money - result.run.money});
	if (action === 'previewresult' && metrics.battles.length) metrics.battles.at(-1).accepted = data.value === 'accept';
	record('action', {floor: before?.floor, action, ...data}); checkpoint(); return result;
};
function potential(name, seen = new Set()) {
	const sp = dex.species.get(name); if (seen.has(sp.id)) return sp.bst; seen.add(sp.id);
	return Math.max(sp.bst, ...sp.evos.map(e => potential(e, seen)));
}
function synergy(mon) {
	if (mon.egg) return 0;
	const families = new Set(run()?.blessings?.owned.map(b => b.family) || []), name = dex.species.get(mon.set.species).baseSpecies;
	return (families.has('godrobe') && /Zangoose|Yveltal/.test(name) ? 300 : 0) +
		(families.has('puregodrobe') && /Espurr|Meowstic|Reshiram/.test(name) ? 260 : 0) +
		(families.has('spiral') && /Drilbur|Excadrill/.test(name) ? 240 : 0) +
		(families.has('spindance') && name === 'Spinda' ? 180 : 0) +
		(families.has('cats') && petSpecies(mon.set.species, 'cats') ? 200 : 0) +
		(families.has('dogs') && petSpecies(mon.set.species, 'dogs') ? 120 : 0);
}
const strength = mon => mon.egg ? 360 : dex.species.get(mon.set.species).bst * .75 + potential(mon.set.species) * .25 +
	mon.set.level * 9 + (mon.initialPartner ? 40 : 0) + ((mon.stars || 1) - 1) * 100 + synergy(mon);
function partyValue(mon) {
	if (mon.egg) return 360;
	const types = dex.species.get(mon.set.species).types;
	const others = (run()?.team || []).filter(m => m.id !== mon.id && !m.egg).flatMap(m => dex.species.get(m.set.species).types);
	return strength(mon) + types.reduce((value, type) => value + (others.includes(type) ? -20 : 35), 0);
}
function moveValue(id, mon) {
	const move = dex.moves.get(id), species = dex.species.get(mon.set.species);
	if (move.category === 'Status') return ['recover', 'roost', 'slackoff', 'synthesis'].includes(move.id) ? 72 :
		['swordsdance', 'dragondance', 'quiverdance', 'calmmind', 'bulkup'].includes(move.id) ? 55 : 0;
	const atk = mon.stats?.atk || species.baseStats.atk, spa = mon.stats?.spa || species.baseStats.spa;
	return (move.basePower || 55) * (move.accuracy === true ? 1 : move.accuracy / 100) *
		(species.types.includes(move.type) ? 1.5 : 1) * (move.category === 'Physical' ? atk : spa) / Math.max(atk, spa) /
		(move.flags.charge || move.self?.volatileStatus === 'mustrecharge' ? 1.8 : 1) + (move.id === 'torchsong' ? 35 : 0);
}
function avoidWastedMoves(observation) {
	const request = observation.request;
	if (!request.active) return [];
	let seeded = false, foeStatus = '', ownBoosts = {};
	for (const line of observation.publicLog) {
		const parts = line.split('|'), event = parts[1], target = parts[2] || '';
		if (['switch', 'drag'].includes(event) && target.startsWith('p2')) {seeded = false; foeStatus = (parts[4] || '').split(' ')[1] || '';}
		if (['switch', 'drag'].includes(event) && target.startsWith('p1')) ownBoosts = {};
		if (target.startsWith('p2')) {
			if (event === '-start' && toID(parts[3]) === 'leechseed') seeded = true;
			if (event === '-end' && toID(parts[3]) === 'leechseed') seeded = false;
			if (event === '-status') foeStatus = parts[3];
			if (event === '-curestatus') foeStatus = '';
		}
		if (target.startsWith('p1')) {
			if (event === '-boost' || event === '-unboost') ownBoosts[parts[3]] = (ownBoosts[parts[3]] || 0) + Number(parts[4]) * (event === '-boost' ? 1 : -1);
			if (event === '-clearboost') ownBoosts = {};
		}
	}
	const active = request.side.pokemon.find(p => p.active), full = active && active.condition.split(' ')[0].split('/').every((n, i, a) => n === a[0]);
	const slots = request.active[0].moves.map((m, i) => {
		const move = dex.moves.get(m.id);
		return seeded && move.id === 'leechseed' || full && move.heal || foeStatus && move.category === 'Status' && move.status ||
			move.boosts && move.target === 'self' && Object.entries(move.boosts).every(([stat, value]) => value <= 0 || (ownBoosts[stat] || 0) >= 6) ? i + 1 : 0;
	});
	const choices = enumerateRequestChoices(request), excluded = choices.filter(c => slots.includes(Number(/^move (\d+)/.exec(c)?.[1])));
	return excluded.length < choices.length ? excluded : [];
}
function preparation() {
	let r = run(); if (healingLocked(r)) return;
	for (let steps = 0; steps < 160; steps++) {
		r = run(); if (r.comeback?.pending || r.phase === 'blessing' || r.pendingMoves?.length || r.pendingCapture) return;
		const lessons = blessingView(r), coverage = coverageView(r);
		if (['choose', 'ready', 'rest', 'reward'].includes(r.phase)) {
			let taught = false;
			for (const [entries, action, slot] of [[lessons.soundLearning, 'learnbonus', 1], [lessons.learning, 'learnbonus', 0], [coverage.members, 'coverage', 0]]) {
				const candidates = (entries || []).flatMap(e => {const m = r.team.find(p => p.id === e.member); return e.moves.map(id => ({member: m, id, value: moveValue(id, m) * (m.set.moves.some(old => dex.moves.get(old).category !== 'Status' && dex.moves.get(old).type === dex.moves.get(id).type) ? .55 : 1)}));});
				candidates.sort((a, b) => b.value - a.value);
				if (candidates[0]) {cmd(action, {member: candidates[0].member.id, value: candidates[0].id, slot}); taught = true; break;}
			}
			if (taught) continue;
		}
		const items = Object.keys(r.bag).filter(id => r.bag[id] > 0).map(id => inventoryItem(content, id)).filter(Boolean);
		const revive = items.find(i => i.kind === 'revive'), faint = r.team.find(m => !m.hp && !m.egg);
		if (faint && revive) {cmd('use', {member: faint.id, value: revive.id}); continue;}
		const evolver = r.team.find(m => m.hp && evolutionOptions(m, r).some(e => !e.item || r.bag[e.item] > 0));
		if (evolver) {cmd('evolve', {member: evolver.id, value: toID(evolutionOptions(evolver, r).find(e => !e.item || r.bag[e.item] > 0).species)}); continue;}
		const fantasy = r.team.filter(m => m.hp && fantasyForm(m.set.species)).sort((a, b) => strength(b) - strength(a))[0];
		if (r.blessings.shards >= 100 && fantasy && ['choose', 'ready', 'rest', 'reward'].includes(r.phase)) {cmd('fantasize', {member: fantasy.id}); continue;}
		const candy = items.filter(i => i.kind === 'candy').sort((a, b) => b.amount - a.amount)[0];
		if (candy) {
		const eligible = r.team.filter(m => m.hp && !m.egg && !m.fixedLevel && (m.uncappedLevel || m.set.level < 100));
		const core = eligible.sort((a, b) => b.set.level * 9 + synergy(b) - a.set.level * 9 - synergy(a)).slice(0, r.floor >= 80 ? 3 : 2);
			const nextEvolution = m => evolutionOptions(m, r).length ? 0 : Math.min(...dex.species.get(m.set.species).evos.map(e => dex.species.get(e).evoLevel || 100));
			const nearEvolution = core.filter(m => nextEvolution(m) - m.set.level > 0 && nextEvolution(m) - m.set.level <= 3);
			const target = nearEvolution.sort((a, b) => nextEvolution(a) - a.set.level - (nextEvolution(b) - b.set.level))[0] || core.sort((a, b) => a.set.level - b.set.level)[0];
			if (target) {cmd('use', {member: target.id, value: candy.id, count: Math.min(r.bag[candy.id], Math.max(1, Math.ceil((target.set.level ** 2) / candy.amount)))}); continue;}
		}
		let acted = false;
		for (const mon of r.team.filter(m => m.hp)) {
			if (r.bag.goldbottlecap > 0 && Object.values(mon.set.ivs).some(value => value < 31)) {
				cmd('use', {member: mon.id, value: 'goldbottlecap'}); acted = true; break;
			}
			const machine = items.find(i => i.kind === 'machine' && machineMoves(mon).includes(i.move));
			if (machine) {cmd('use', {member: mon.id, value: machine.id}); acted = true; break;}
			if (r.node?.kind !== 'rest' && mon.hp < mon.maxhp * (r.node?.kind === 'boss' ? 0.98 : 0.65)) {
				const heal = items.filter(i => i.kind === 'heal').sort((a, b) => Math.abs(a.amount - (mon.maxhp - mon.hp)) - Math.abs(b.amount - (mon.maxhp - mon.hp)))[0];
				if (heal) {cmd('use', {member: mon.id, value: heal.id}); acted = true; break;}
			}
			const cure = items.find(i => i.kind === 'cure' && mon.status && (!i.cureStatuses || i.cureStatuses.includes(mon.status)));
			if (cure) {cmd('use', {member: mon.id, value: cure.id}); acted = true; break;}
			const ppSlot = mon.pp.findIndex(p => r.node?.kind !== 'rest' && p.pp < Math.min(3, p.maxpp) &&
				(dex.moves.get(p.id).category !== 'Status' || tacticalRetry && ['synthesis', 'sleeppowder', 'growth'].includes(p.id)));
			const ether = items.find(i => i.kind === 'ether');
			if (ppSlot >= 0 && ether) {cmd('use', {member: mon.id, value: ether.id, slot: ppSlot}); acted = true; break;}
			const chosen = [], pool = (mon.moveMemory || mon.pp).filter(p => p.pp > 0).map(p => p.id);
			if (r.blessings.owned.some(b => b.family === 'sololeveling') && r.floor >= 25) {
				// A sole attacker needs another attack type: a known immunity must not
				// turn repeated retries into an unchangeable mono-type moveset.
				const attacks = pool.filter(id => dex.moves.get(id).category !== 'Status').sort((a, b) => moveValue(b, mon) - moveValue(a, mon));
				if (attacks[0]) chosen.push(attacks[0]);
				const other = attacks.find(id => dex.moves.get(id).type !== dex.moves.get(attacks[0]).type);
				if (other) chosen.push(other);
				const recover = pool.find(id => ['synthesis', 'recover', 'roost', 'slackoff', 'milkdrink'].includes(id));
				if (recover) chosen.push(recover);
				const setup = pool.find(id => ['growth', 'swordsdance', 'calmmind', 'nastyplot', 'quiverdance', 'dragondance', 'bulkup'].includes(id));
				if (setup) chosen.push(setup);
				// Learn from a settled, visible encounter; do not read the next foe's hidden set.
				const witnessed = metrics.battles.filter(b => b.floor === r.floor);
				if (witnessed.some(b => b.foe.some(p => p.species === 'Shedinja'))) {
					const answer = pool.find(id => ['leechseed', 'toxic', 'poisonpowder'].includes(id)) ||
						attacks.find(id => ['Fire', 'Flying', 'Ghost', 'Dark', 'Rock'].includes(dex.moves.get(id).type));
					if (answer && !chosen.includes(answer)) chosen.splice(3, 1, answer);
				}
			}
			while (pool.length && chosen.length < 4) {
				const score = id => moveValue(id, mon) * (dex.moves.get(id).category !== 'Status' && chosen.some(m => dex.moves.get(m).category !== 'Status' && dex.moves.get(m).type === dex.moves.get(id).type) ? .25 : 1);
				pool.sort((a, b) => score(b) - score(a)); const next = pool.shift(); if (!chosen.includes(next)) chosen.push(next);
			}
			const planned = guided?.floor === r.floor && guided.moves?.[toID(mon.set.species)];
			if (planned) {
				assert(planned.length <= 4 && new Set(planned).size === planned.length);
				assert(planned.every(id => mon.moveMemory.some(p => p.id === id)));
				chosen.splice(0, chosen.length, ...planned);
			}
			const slot = chosen.findIndex((move, i) => move !== toID(mon.set.moves[i]));
			if (slot >= 0) {cmd('setmove', {member: mon.id, slot, value: chosen[slot]}); acted = true; break;}
			if (r.megaUnlocked && !mon.fusion) {
				const species = dex.species.get(mon.set.species);
				const stone = items.find(i => { const item = dex.items.get(i.id); return item.megaStone &&
					[item.megaEvolves].flat().some(name => name === species.name || name === species.baseSpecies); });
				if (stone && toID(mon.set.item) !== stone.id) {cmd('equip', {member: mon.id, value: stone.id}); acted = true; break;}
			}
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
	const cooperative = encounter.cooperative, format = cooperative ? 'gen9fantasyroguecoop' : 'gen9fantasyrogue';
	const ownTeam = state.team.filter(m => !m.egg), enemyTeam = cooperative ? encounter.team.slice(0, Math.ceil(encounter.team.length / 2)) : encounter.team;
	const requests = {};
	const battle = new Battle({formatid: format, seed: [2026, seed, r.floor, metrics.battles.length + 1], fantasyRogue: state,
		send(type, packet) {
			// Campaign controls (balls, robe activation, etc.) are present in the wire
			// request, not Side.activeRequest. Consume the same payload as the client.
			if (type === 'sideupdate' && typeof packet === 'string' && packet.slice(3).startsWith('|request|')) {
				requests[packet.slice(0, 2)] = JSON.parse(packet.slice(12));
			}
		},
		p1: {name: 'Prepared Player', team: ownTeam.map(m => m.set)}, p2: {name: 'NPC', team: enemyTeam},
		...(cooperative ? {p3: {name: cooperative.name, team: cooperative.team},
			p4: {name: 'NPC Partner', team: encounter.team.slice(Math.ceil(encounter.team.length / 2))}} : {})});
	const {RogueCoopController} = require('../dist/server/fantasy-rogue/coop-controller');
	const wild = !encounter.trainer && r.node.kind !== 'trainer' && encounter.boss?.kind !== 'summit';
	const coop = cooperative && new RogueCoopController({options: {fantasyRogue: {wild}}});
	const views = [new InformationView({ownSide: 'p1', difficulty: 'normal', partySize: enemyTeam.length,
		rogueBoosts: r.boosts, rogueBlessings: state.blessings}),
	new InformationView({ownSide: 'p2', difficulty: 'normal', ...(!cooperative ? {opponentMoves: captureInitialMoves(battle, 'p1')} : {}), partySize: ownTeam.length,
		rogueBoosts: r.boosts, rogueBlessings: state.blessings})];
	const playerTrainer = {format, style: 'balanced', packedTeam: Teams.pack(ownTeam.map(m => m.set)), keyMembers: [], resourcePreferences: ['mega', 'zmove', 'terastallize']};
	const player = !cooperative && new RulePolicy(playerTrainer);
	const preparedPlayer = !cooperative && new RolloutPolicy(playerTrainer);
	const opponent = !cooperative && new RolloutPolicy({format, style: encounter.style, packedTeam: Teams.pack(enemyTeam), keyMembers: [], resourcePreferences: []});
	const timing = new DecisionTimeManager(DEFAULT_LIMITS);
	let cursor = 0, catches = 0, rejected = 0, decisions = 0, enemySearchMs = 0;
	const decisionLog = [];
	try {
		for (let step = 0; !battle.ended && step < 4000; step++) {
			if (step % 10 === 0) fs.writeFileSync(out + '/live-battle.json', JSON.stringify({floor: r.floor, name: encounter.trainer?.name || r.node.name, turn: battle.turn, step}));
			if (battle.turn > 300) throw Error('Unfinished battle exceeded 300 turns; no forced settlement');
			const update = battle.log.slice(cursor).join('\n'); cursor = battle.log.length;
			const publicUpdate = extractChannelMessages(update, [0])[0].join('\n');
			for (const view of views) view.receiveUpdate(publicUpdate);
			if (coop) coop.update(publicUpdate);
			for (let i = 0; i < battle.sides.length; i++) {
				const side = battle.sides[i], request = requests[side.id];
				if (battle.ended || !request || request.wait || side.isChoiceDone()) continue;
				const observation = i < 2 ? views[i].observe(request) : undefined;
				let choice;
				try {
				if (cooperative) {
					choice = coop.choose(i === 0 ? 'p3' : side.id, request);
					if (i === 0) choice = choice.replace(/^(move \d+) -([12])/, (_, move, loc) => move + ' -' + (loc === '1' ? '2' : '1'));
				} else if (!i) choice = r.node.kind === 'boss' ?
					preparedPlayer.decide(observation, [2026, seed, r.floor, step + 1], {budgetMs: 4500, maxRollouts: null, excluded: avoidWastedMoves(observation)}).choice :
					player.decide(observation, [2026, seed, r.floor, step + 1], avoidWastedMoves(observation)).choice;
				else if (r.node.kind !== 'boss' || wild) {
					const excluded = wild && !request.forceSwitch ? enumerateRequestChoices(request).filter(c => c.startsWith('switch ')) : [];
					choice = rogueBossChoice(request) || emergencyChoice(observation, format, excluded, true, true, !wild);
				} else {
					const excluded = [];
					if (state.boss) {
						const party = request.side.pokemon, king = party.findIndex(m => /^Mewtwo.*Fantasy/.test(m.details));
						if (king >= 0 && party.some((m, index) => index !== king && !m.condition.endsWith(' fnt'))) {
							excluded.push(...enumerateRequestChoices(request).filter(c => c === `switch ${king + 1}` || c.startsWith(`team ${king + 1}`)));
						}
					}
					const start = performance.now(), window = timing.allocate(observation, battle.turn, start, format, excluded);
					choice = opponent.decide(observation, [2026, seed, r.floor, step + 1], {
						budgetMs: Math.min(4500, window.deadline - start), maxRollouts: DEFAULT_LIMITS.maxRollouts,
						critical: !!window.criticalReason, excluded,
					}).choice || emergencyChoice(observation, format, excluded, true);
					enemySearchMs += performance.now() - start;
				}
				} catch (error) {
					// Production scheduler also returns its legal fallback when a worker fails.
					metrics.issues.push({floor: r.floor, reason: 'policy-fallback', side: side.id, error: error.message});
					choice = cooperative ? 'default' : emergencyChoice(observation, format, [], true);
				}
				if (!i && request.fantasyRogue?.dragonKing?.pending) {
					const king = request.fantasyRogue.dragonKing; choice = 'rogueking ' + king.options[0] + ' ' + king.token;
				}
				if (!i && r.preview?.stage !== 'running' && request.fantasyRogue?.catchable && !request.forceSwitch && !request.teamPreview && catches < 5) {
					const line = extractChannelMessages(battle.log.join('\n'), [0])[0].filter(l => /^\|(switch|drag)\|p2/.test(l)).at(-1);
					const species = dex.species.get(line?.split('|')[3]?.split(',')[0] || '');
					const level = Number(/, L(\d+)/.exec(line || '')?.[1]) || 1;
					const candidate = {id: 'visible-foe', set: {species: species.name, level}};
					const stacked = species.types.every(t => r.team.filter(m => !m.egg && dex.species.get(m.set.species).types.includes(t)).length >= 2);
					const want = species.exists && !stacked && (species.bst >= 360 || potential(species.name) >= 480 || species.types.includes('Flying')) &&
						!r.team.some(m => dex.species.get(m.set.species).baseSpecies === species.baseSpecies) &&
						!(battle.fantasyRogue.captures || []).some(m => dex.species.get(m.set.species).baseSpecies === species.baseSpecies) &&
						(r.team.length < 6 || partyValue(candidate) > Math.min(...r.team.map(partyValue)) + 20);
					const ball = request.fantasyRogue.balls?.filter(b => b.count > 0).sort((a, b) => b.chance - a.chance)[0];
					if (want && ball && ball.chance >= (r.team.length < 4 || species.bst >= 600 ? .2 : .35)) {choice = 'rogueball ' + ball.id; catches++;}
				}
				if (request.teamPreview && /^team [1-9]+$/.test(choice || '')) {
					// The generic policy may rank an already fainted campaign member first.
					// Only rearrange using our own public request, as the party UI does.
					const order = choice.slice(5).split('');
					order.sort((a, b) => Number(request.side.pokemon[Number(a) - 1].condition.endsWith(' fnt')) -
						Number(request.side.pokemon[Number(b) - 1].condition.endsWith(' fnt')));
					choice = 'team ' + order.join('');
				}
				if (!i && /^move \d+/.test(choice || '')) {
					const slot = Number(/^move (\d+)/.exec(choice)[1]) - 1;
					const move = dex.moves.get(request.active?.[0]?.moves[slot]?.id || '');
					if (move.category !== 'Status') {
						if (request.fantasyRogue?.blood?.[0]?.available) choice = 'rogueblood ' + choice;
						else if (request.fantasyRogue?.eeveeZ?.[0]) choice = 'rogueeeveez ' + choice;
						const number = request.fantasyRogue?.number;
						if (number?.available) choice = 'roguenumber ' + (number.super ? 'all' : move.category === 'Physical' ? 'atk' : 'spa') + ' ' + choice;
					}
				}
				decisionLog.push({turn: battle.turn, side: side.id, choice}); decisions++;
				if (!choice || !battle.choose(side.id, choice)) {
					rejected++;
					const retry = cooperative ? 'default' : emergencyChoice(observation, format, choice ? [choice] : [], true);
					if (!battle.choose(side.id, retry)) throw Error(`Rejected combat choice: ${choice} / ${retry}`);
				}
			}
		}
		if (!battle.ended) throw Error('Native request loop exhausted; no forced settlement');
		const result = rogueBattleResult(battle);
		engine.settle(user, ticket.token, result);
		const row = {floor: r.floor, kind: r.node.kind, name: encounter.trainer?.name || r.node.name, biome: r.node.biome?.id, preview: r.preview?.stage === 'running',
			won: result.won, cooperative: !!cooperative, turns: battle.turn, faints: battle.log.filter(l => l.startsWith('|faint|p1')).length,
			caught: result.captures?.length || 0, decisions, enemySearchMs, rejected,
			team: ownTeam.map(m => ({species: m.set.species, level: m.set.level, hp: m.hp, maxhp: m.maxhp, ability: m.set.ability, item: m.set.item, moves: m.set.moves, stats: m.stats})),
			after: result.team.map(m => ({species: m.set.species, level: m.set.level, hp: m.hp, maxhp: m.maxhp})),
			foe: encounter.team.map(m => ({species: m.species, level: m.level})),
			moneyBefore: r.money, moneyAfter: run().money, rescue: run().emergencyRecovery, notices: run().notices,
			blessings: r.blessings.owned.map(b => b.id), growth: r.growth, numberProgress: result.blessingProgress};
		metrics.battles.push(row); record('battle', row); checkpoint();
		fs.writeFileSync(`${out}/battle-${metrics.battles.length}.log`, battle.log.join('\n'));
		fs.writeFileSync(`${out}/battle-${metrics.battles.length}-decisions.json`, JSON.stringify(decisionLog));
		if (r.node.kind === 'boss' || !result.won) console.log(JSON.stringify(row));
	} catch (error) {
		fs.writeFileSync(`${out}/interrupted-${r.floor}.log`, battle.log.join('\n'));
		fs.writeFileSync(`${out}/interrupted-${r.floor}-requests.json`, JSON.stringify(requests));
		throw error;
	} finally {battle.destroy();}
}


try {
	if (resumed) record('resume', {floor: run()?.floor, phase: run()?.phase, profile,
		driverHash: require('crypto').createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
		guided, reason: 'continue same persisted campaign after driver maintenance; all prior settled outcomes retained'});
	if (resumed && process.argv.includes('--recover-interrupted') && run()?.phase === 'battle') {
		const live = JSON.parse(fs.readFileSync(out + '/live-battle.json', 'utf8'));
		record('interrupted-recovery', {floor: run().floor, lastObservedTurn: live.turn,
			reason: 'Stopped an unsettled repeated-policy probe; production missing-room recovery preserves all previously settled losses. Not an uninterrupted clear.'});
		engine.recover(user, run().battle.token);
	}
	if (!resumed) {
		cmd('onboarding'); record('guide', {sections: BEGINNER_GUIDE}); cmd('upgrade', {value: 'slot'});
		assert.equal(account().slots, 2); assert.equal(account().points, 0);
		assert(Object.values(account().boosts).every(value => value === 0));
	for (let i = 0; i < 20; i++) {
		const opening = storyView(account(), true, false);
		if (!opening?.key) break;
		cmd('storynext', {value: opening.key});
	}
	cmd('start', {starters, useSpirit: false});
	}
	let previousFloor = 0;
	for (let step = 0; step < 50000; step++) {
		let r = run();
		if (r.floor !== previousFloor) {
			previousFloor = r.floor; metrics.floors.push({floor: r.floor, money: r.money, team: r.team.map(m => ({species: m.egg ? 'Egg' : m.set.species, level: m.egg ? undefined : m.set.level, hp: m.hp, maxhp: m.maxhp})), bag: r.bag});
			fs.writeFileSync(out + '/progress.json', JSON.stringify(metrics));
			if (r.floor % 10 === 1) console.log(JSON.stringify({progress: r.floor, money: r.money, team: metrics.floors.at(-1).team}));
		}
		if (r.floor > stop || r.phase === 'complete' && !r.story) break;
		if (r.comeback?.pending) {
			const c = r.comeback.pending;
			cmd('comeback', {member: c.key, value: c.answer ? 'continue' : !c.page ? 'next' : 'yes'}); continue;
		}
		const story = storyView(account(), true, false);
		if (story?.key) {record('dialogue', {floor: r.floor, story}); cmd('storynext', {value: story.key}); continue;}
		if (story?.stage === 'cards') {cmd('startcard', {value: 'all'}); continue;}
		if (r.phase === 'battle') {combat(); if (stopAfterBattle) break; continue;}
		if (r.preview?.stage === 'result') {
			const accept = r.preview.result.won && !(r.node.encounters[r.encounter].catchable && r.team.length < 6);
			cmd('previewresult', {value: accept ? 'accept' : 'personal'}); continue;
		}
		if (r.phase === 'defeated') {metrics.issues.push({floor: r.floor, reason: 'actual-terminal-defeat', failure: r.failure}); break;}
		if (r.companionInvitations?.length) {
			const invitation = r.companionInvitations[0];
			cmd('companioninvite', {member: invitation.key, value: travellingRoster(r).length < 2 ? 'accept' : 'decline'}); continue;
		}
		if (r.pendingMoves?.length) {
			const p = r.pendingMoves[0], mon = r.team.find(m => m.id === p.member);
			const worst = mon.set.moves.map((m, slot) => ({slot, value: moveValue(m, mon)})).sort((a, b) => a.value - b.value)[0];
			cmd('learn', {member: mon.id, value: moveValue(p.move, mon) > worst.value ? String(worst.slot) : 'skip'}); continue;
		}
		if (r.pendingCapture) {
			const worst = r.team.slice().sort((a, b) => partyValue(a) - partyValue(b))[0];
			cmd('replace', {value: r.team.length < partyLimit() ? 'join' : partyValue(r.pendingCapture) > partyValue(worst) ? worst.id : 'release'}); continue;
		}
		if (r.phase === 'blessing') {
			const b = blessingView(r), p = b.pending[0];
			if (p) {
				let value = p.options?.[0]?.id;
				if (p.kind === 'gift') {const worst = r.team.slice().sort((a, b) => strength(a) - strength(b))[0]; value = r.team.length < partyLimit() ? 'join' : strength(p.pokemon) > strength(worst) ? worst.id : 'release';}
				if (p.kind === 'ability') value = p.options.find(o => o.id !== 'hugepower' && o.id !== 'skip')?.id || value;
				if (['target', 'solo'].includes(p.kind)) value = r.team.filter(m => p.options.some(o => o.id === m.id)).sort((a, b) =>
					((b.stats?.spa || 0) + b.set.level * 3 + (b.initialPartner ? 50 : 0)) - ((a.stats?.spa || 0) + a.set.level * 3 + (a.initialPartner ? 50 : 0)))[0]?.id || value;
				cmd('blessingreward', {member: p.id, value}); continue;
			}
			if (b.stage) {cmd('blessing', {value: b.stage.options.find(o => o.id === 'moves' || o.id === 'power' || o.id === 'stat:spa')?.id || b.stage.options[0].id}); continue;}
			const choices = b.round.options.map((o, slot) => ({...o, slot})).filter(o => !o.chosen);
			const priority = {medic: 130, restinball: 135, hpgrowth: 115, powerchoice: 105, ordinary: 100, friend: 92,
				eventtask: 88, battletask: 86, money: 84, bigmoney: 80, hero: 78, drain: 75, execute: 74,
				arsenal: 105, capturebonus: 70, bond: 90, insight: 65, cephalosporin: 60, reservation: 74, supercombo: 78,
				godrobe: 102, puregodrobe: 99, spiral: 106, speedpower: 103, fantasysix: 108,
				bignumber: 110, supernumber: 170, sololeveling: 110, spindance: 90, weighttraining: 78,
				cats: 104, dogs: 80, potara: 45};
			const score = o => {
				const family = o.family || o.id;
				let value = (priority[family] || 25) + (o.tier === 'silver' ? 10 : o.tier === 'gold' ? 0 : -15);
				if (family === desiredTier) value += 400;
				if (r.floor === 1) {
					value -= o.tier === 'prismatic' ? 30 : o.tier === 'gold' ? 15 : 0;
					if (['fantasysix', 'bond', 'puregodrobe', 'ordinary'].includes(family)) value -= 40;
					if (family === 'powerchoice') value += 60;
					if (['godrobe', 'hero', 'friend'].includes(family)) value += 30;
				}
				return value;
			};
			choices.sort((a, b) => score(a) - score(b));
			const matching = choices.filter(o => o.tier === desiredTier || o.family === desiredTier);
			let pick = matching.at(-1) || choices.at(-1);
			if (score(pick) < (r.floor === 1 ? 105 : 65)) {
				const reroll = choices.find(o => o.refreshes > 0);
				if (reroll) {cmd('blessingrefresh', {slot: reroll.slot}); continue;}
			}

			metrics.choices.push({floor: r.floor, blessing: pick.id, tier: pick.tier, offers: choices.map(o => ({id: o.id, name: o.name, tier: o.tier}))}); cmd('blessing', {slot: pick.slot}); continue;
		}
		if (r.phase === 'postgame') {cmd('godchallenge', {value: 'decline'}); continue;}
		if (r.phase === 'event') {
			const event = eventView(r);
			if (event.stage === 'result') {
				preparation();
				if (run().pendingMoves?.length || run().pendingCapture || run().phase === 'blessing') continue;
				if (!run().team.some(m => m.hp)) {metrics.issues.push({floor: r.floor, reason: 'no-living-member-no-revive', money: r.money}); break;}
				cmd('continue'); continue;
			}
			if (event.stage === 'fragments') {cmd('event', {member: event.key, value: r.blessings.shards < 300 ? 'fragments' : 'supplies'}); continue;}
			record('event', {floor: r.floor, event});
			const preferred = {mysteryball: 'open', forest: 'mediate', mushrooms: 'trade', room: 'sleep', martial: 'technique', travel: 'leave', tutor: 'leave', bandits: 'coin', dice: 'leave', fishing: 'leave', quiz: 'leave'};
			const options = event.options?.filter(o => !o.disabled) || [];
			const style = RIVAL_STYLES[r.rival?.id]?.[0];
			const pick = options.find(o => o.id === 'greet:' + style) || options.find(o => o.id === 'shards' && r.blessings.shards < 100) ||
				options.find(o => o.id === 'join' || o.id === 'joinboth') ||
				options.find(o => o.id === preferred[event.id]) || options.find(o => o.id === 'leave') || options[0];
			if (!pick) {metrics.issues.push({floor: r.floor, event, reason: 'needs-interactive-event-policy'}); break;}
			cmd('event', {member: event.key, value: pick.id}); continue;
		}
		preparation(); r = run(); if (r.pendingMoves?.length || r.phase === 'blessing') continue;
		if (!r.team.some(m => m.hp)) {metrics.issues.push({floor: r.floor, reason: 'no-living-member-no-revive', money: r.money}); break;}
		if (r.phase === 'choose') {
			const healthy = r.team.filter(m => m.hp > m.maxhp * .65).length;
			const healing = Object.entries(r.bag).reduce((total, [id, count]) => total + (inventoryItem(content, id)?.kind === 'heal' ? count : 0), 0);
			const needsSupplies = healthy < Math.min(2, r.team.filter(p => !p.egg).length) || healing < 2;
			const rank = n => n.kind === 'adventure' ? 100 : n.kind === 'trade' ? (n.trade?.kind === 'growth' && r.money > 2500 ? 90 : r.money > 1600 && n.trade?.kind === 'candy' ? 85 : 10) : n.kind === 'wild' ? (needsSupplies ? 30 : 72) : n.kind === 'elite' ?
				(r.floor >= 11 && r.team.filter(m => !m.egg && m.hp > m.maxhp * .8).length >= 4 &&
					Math.max(...r.team.map(m => m.set.level)) >= 5 + Math.ceil(r.floor / 2) && healing >= 3 ? 80 : 20) : n.kind === 'event' ? (needsSupplies || r.floor % 4 === 0 ? 75 : 58) : n.kind === 'reward' ? (needsSupplies ? 85 : 60) :
				['trainer', 'encounter'].includes(n.kind) ? (r.floor % 5 === 0 ? 78 : 55) : 25;
			const pick = r.choices.slice().sort((a, b) => rank(b) - rank(a))[0];
				record('route', {floor: r.floor, kind: pick.kind, name: pick.name, alternatives: r.choices.map(n => ({id: n.id, kind: n.kind, name: n.name}))}); cmd('select', {value: pick.id}); continue;
		}
		if (r.phase === 'ready') {
			for (const [family, members, value] of [['companionai', ['sada', 'turo'], 'chooseai'], ['companionstreamer', ['iono', 'canari'], 'choosestreamer'],
				['companionwinter', ['grusha', 'rika'], 'choosewinter'], ['companionband', ['marnie', 'roxie'], 'chooseband']]) {
				if (r.blessings.owned.some(b => b.family === family) && !r.blessings.companions?.some(c => members.includes(c.id))) cmd('companion', {member: members[0], value});
			}
			const c = companionView(run()).find(c => !c.ability && (c.abilityOptions.length || c.typeOptions.some(t => t.member)));
			if (c) {const type = !c.type && c.typeOptions.find(t => t.member); cmd('companion', {member: c.id, value: type ? 'type:' + type.id : 'ability:' + c.abilityOptions[0]}); continue;}
			const attempts = metrics.battles.filter(b => b.floor === r.floor && !b.won && !b.preview).length;
			if (attempts >= (tacticalRetry ? 8 : 4)) {metrics.issues.push({floor: r.floor, reason: tacticalRetry ? 'eight-loss-wall-after-tactical-retry' : 'four-loss-wall'}); break;}
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
				const target = investment?.targets?.find(t => t.member === core.id && t.amount >= 300);
				const train = target && (core.set.level >= Math.ceil(r.floor / 2) + 8 || core.set.level === 100);
				const pick = train ? investment : scene.choices.find(c => c.id === 'experience' && !c.disabled) || scene.choices.find(c => !c.disabled);
				cmd('rewardchoice', {value: pick.id, ...(train ? {member: core.id} : {})}); continue;
			}
			cmd('continue'); continue;
		}
		if (r.phase === 'rest') {
			if (r.mentorOffer) {cmd('mentorcard', {value: 'balanced'}); continue;}
			if (Object.keys(r.bag).some(id => r.bag[id] > 0 && inventoryItem(content, id)?.kind === 'treasure')) {cmd('sell', {value: 'all'}); continue;}
			const care = r.node.kind === 'rest' && centerCare(r);
			if (care?.needed && r.money >= care.cost) {cmd('heal'); continue;}
			const stock = shopStock(content, r), reserve = emergencyCost(r.floor + 1);
			if (r.node.trade?.kind === 'growth') {
				const members = r.team.filter(p => !p.egg && !p.fusion).sort((a, b) => strength(b) - strength(a));
				const target = members.find(p => Object.values(p.campTraining || {}).reduce((a, b) => a + b, 0) < 15000);
				const stats = target && [target.stats.atk > target.stats.spa ? 'atk' : 'spa', 'def', 'spd', 'spe'].filter(s => (target.campTraining?.[s] || 0) < 6000);
				const offer = stats?.length && growthOffers(r).filter(o => o.remaining && r.money >= o.price * stats.length + reserve).at(-1);
				if (offer) {cmd('buygrowth', {value: offer.id, trainingMembers: [target.id], trainingStats: stats}); continue;}
			}
			const essentials = {revive: 2, ether: r.floor >= 100 ? 12 : 5, potion: r.floor < 19 ? 6 : 0, superpotion: r.floor >= 19 && r.floor < 69 ? 5 : 0, hyperpotion: r.floor >= 69 ? 6 : 0};
			const supply = stock.find(i => (i.remaining ?? 1) > 0 && (r.bag[i.id] || 0) < (essentials[i.id] || 0) && r.money >= i.price + 250);
			if (supply) {cmd('buy', {value: supply.id}); continue;}
			const machine = stock.filter(i => i.kind === 'machine' && (i.remaining ?? 1) > 0 && r.money >= i.price + reserve).find(i => r.team.some(mon =>
				machineMoves(mon).includes(i.move) && moveValue(i.move, mon) > 65 && !mon.set.moves.some(old => dex.moves.get(old).category !== 'Status' && dex.moves.get(old).type === dex.moves.get(i.move).type)));
			if (machine) {cmd('buy', {value: machine.id}); continue;}
			const candy = stock.filter(i => i.kind === 'candy' && r.money >= i.price + reserve && (i.remaining ?? 1) > 0)
				.sort((a, b) => b.amount / b.price - a.amount / a.price)[0];
			if (candy) {cmd('buy', {value: candy.id}); continue;}
			const targets = {revive: 4, ether: r.floor >= 100 ? 20 : 8, potion: r.floor < 30 ? 8 : 0, superpotion: r.floor >= 20 && r.floor < 80 ? 10 : 0,
				hyperpotion: r.floor >= 60 ? 10 : 0, fullheal: 3, pokeball: r.floor < 40 ? 10 : 0, greatball: r.floor >= 20 && r.floor < 80 ? 8 : 0, ultraball: r.floor >= 60 ? 8 : 0};
			const buy = stock.find(i => (i.remaining ?? 1) > 0 && (r.bag[i.id] || 0) < (targets[i.id] || 0) && r.money >= i.price + reserve);
			if (buy) {cmd('buy', {value: buy.id}); continue;}
			const held = stock.find(i => ['leftovers', 'shellbell', 'eviolite'].includes(i.id) && !r.bag[i.id] &&
				r.team.some(m => !m.set.item) && r.money >= i.price + reserve);
			if (held) {cmd('buy', {value: held.id}); continue;}
			cmd('continue'); continue;
		}
		if (r.phase === 'failed' && r.team.some(m => m.hp)) {cmd('retry'); continue;}
		metrics.issues.push({floor: r.floor, phase: r.phase, reason: 'unhandled-phase'}); break;
	}
} catch (error) {metrics.issues.push({floor: run()?.floor, reason: 'driver-error', error: error.stack}); console.error(error.stack);
} finally {
	metrics.lastFloor = run()?.floor; metrics.phase = run()?.phase;
	checkpoint();
	fs.writeFileSync(out + '/summary.json', JSON.stringify(metrics, null, 2));
	fs.writeFileSync(out + '/final-save.json', JSON.stringify(account(), null, 2)); store.close();
	console.log(JSON.stringify({profile, seed, lastFloor: metrics.lastFloor, phase: metrics.phase, battles: metrics.battles.length, issues: metrics.issues}));
}
