'use strict';
const assert = require('assert').strict;
const {Battle, Dex} = require('../../dist/sim');
const {set, stats} = require('../fixtures/fantasy-rogue');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {blessing} = require('../../dist/sim/rogue-blessing-data');
const {addSpiral, robeDurability} = require('../../dist/sim/rogue-awakening');
const {robeMultiplier, bloodRequest} = require('../../dist/sim/fantasy-rogue-awakening');
const {assignedExtraAbilities} = require('../../dist/sim/rogue-blessing-permanent');
const {rogueAbilityInfo} = require('../../dist/sim/fantasy-rogue-blessings');
const {rogueBattleResult} = require('../../dist/sim/fantasy-rogue');
const {normalizeBlessings, settleBlessingBattle, prepareBlessingEncounter, handleBlessingCommand, syncBlessingParty, blessingCandidates, repairBlessingRound} = require('../../dist/server/fantasy-rogue/blessings');
const {createBlessingRound, blessingQualityWeights, refreshBlessingOption} = require('../../dist/server/fantasy-rogue/blessing-selection');
const {beginRival, chooseRival, settleRival, expireRival, rivalView, rivalCompanionViews, activeRivalTraveller} = require('../../dist/server/fantasy-rogue/rivals');
const {beginPoliceEncounter, choosePoliceRegion, settlePoliceBattle} = require('../../dist/server/fantasy-rogue/police-events');
const {TRAVELLING_TRAINERS, prepareTravellingTrainer} = require('../../dist/server/fantasy-rogue/travelling-trainers');
const {minimumEvolutionLevel} = require('../../dist/server/fantasy-rogue/evolution');
const {createBiomeRoutes} = require('../../dist/server/fantasy-rogue/biome-routes');
const {rogueCodex} = require('../../dist/server/fantasy-rogue/codex');
const {recordRogueDiscoveries} = require('../../dist/server/fantasy-rogue/discoveries');
const {recordClear} = require('../../dist/server/fantasy-rogue/legacy');
const {buildRogueDuelState} = require('../../dist/server/fantasy-rogue/duels');
const {syncAffection} = require('../../dist/server/fantasy-rogue/affection');
const content = createPreviewContent();
const owned = ids => ids.map(id => {
 const {family, tier, type} = blessing(id);
 return {id, family, tier, type, floor: 100};
});
const member = s => createRoguePokemon(s, stats(0));
function run(floor = 100, ids = []) {
 const r = {floor, team: [member(set('Zangoose', 'Immunity', 50, ['Splash']))], bag: {}, money: 10000, boosts: stats(0),
  caught: [], phase: 'event', encounter: 0, node: {name: '测试', kind: 'trainer', reward: {money: 0, items: {}}, encounters: []}};
 normalizeBlessings(r); r.blessings.owned = owned(ids); return r;
}
function native(player, ids = [], configure = () => {}, foes = [set('Blissey', 'Natural Cure', 100, ['Splash'])]) {
 const team = player.map(member), state = {encounterId: 'awakening-test', team, boosts: stats(0), bag: {}, balls: [], catchable: false,
  progression: true, blessings: {owned: owned(ids)}};
 configure(state);
 const b = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
  p1: {name: 'Player', team: team.map(m => m.set)}, p2: {name: 'Foe', team: foes}});
 b.makeChoices('team 1', 'team 1'); b.randomizer = damage => damage; return b;
}
describe('Fantasy Rogue awakening and narrative expansion', function () {
 this.timeout(20000);
 it('offers the new Speed Boost entitlement once to old saves without interrupting their current event', () => {
  const r = run(100, ['speedpower']), account = {captures: {}, unlocked: []};
  normalizeBlessings(r); normalizeBlessings(r);
  assert.equal(r.phase, 'event'); assert.equal(r.blessings.pending.length, 1);
  const reward = r.blessings.pending[0]; assert(reward.options.includes(r.team[0].id));
  r.phase = 'blessing'; // The existing settlement flow presents queued rewards after the event.
  handleBlessingCommand(account, r, content, {action: 'blessingreward', member: reward.id, value: r.team[0].id}, () => 0);
  assert(assignedExtraAbilities(r.team[0], r.team, r.blessings).includes('speedboost'));
  normalizeBlessings(r); assert.equal(r.blessings.pending.length, 0);
 });
 it('does not duplicate a newly acquired or already pending Speed Boost reward', () => {
  const r = run(1), account = {captures: {}, unlocked: []}; r.phase = 'blessing';
  r.blessings.round = {floor: 1, tier: 'prismatic', remaining: 1,
   options: [{id: 'speedpower', refreshes: 1, chosen: false}], familiesSeen: []};
  handleBlessingCommand(account, r, content, {action: 'blessing', slot: 0}, () => 0);
  assert.equal(r.blessings.pending.filter(p => p.blessing === 'speedpower').length, 1);
  delete r.blessings.speedBoostOffered;
  normalizeBlessings(r); assert.equal(r.blessings.pending.length, 1);
 });
 it('persists the receipt when an old Speed Boost reward has no eligible recipient', () => {
  const r = run(100, ['speedpower']), account = {captures: {}, unlocked: []}; r.team[0].set.ability = 'Speed Boost';
  normalizeBlessings(r); const reward = r.blessings.pending[0]; assert.deepEqual(reward.options, ['skip']);
  r.phase = 'blessing';
  handleBlessingCommand(account, r, content, {action: 'blessingreward', member: reward.id, value: 'skip'}, () => 0);
  const restored = JSON.parse(JSON.stringify(r)); normalizeBlessings(restored); assert.equal(restored.blessings.pending.length, 0);
 });
 it('uses the agreed continuous durability anchors and a finite low-HP cap', () => {
  assert.equal(robeDurability(100, 100), 1); assert.equal(robeDurability(50, 100), 1.5);
  assert(Math.abs(robeDurability(25, 100) - 3) < 1e-9); assert.equal(robeDurability(1, 100), 6);
  for (let hp = 100; hp > 1; hp--) assert(robeDurability(hp - 1, 100) >= robeDurability(hp, 100));
  assert(robeDurability(50, 100, true) > 1.5); assert.equal(robeDurability(1, 100, true), 6);
 });
 it('accumulates fixed participation and KO points without a cap or diminishing returns', () => {
  let points = 0;
  for (let battle = 0; battle < 50; battle++) { points = addSpiral(points, 1); for (let ko = 0; ko < 4; ko++) points = addSpiral(points, 1); }
  assert.equal(points, 250);
  assert.equal(addSpiral(800, 1) - 800, addSpiral(100, 1) - 100); assert.equal(addSpiral(1000, 2), 1002);
 });
 it('persists participation without a KO and exposes the real attack increase', () => {
  const b = native([set('Excadrill', 'Sand Rush', 50, ['Splash'])], ['spiral'], s => { s.blessings.owned[0].target = s.team[0].id; });
  try {
   const m = b.p1.active[0];
   assert.equal(m.getStat('atk'), Math.floor(m.storedStats.atk * 1.001));
   assert(rogueAbilityInfo(m).statSources.some(s => s.includes('螺旋力')));
   assert.equal(rogueBattleResult(b).blessingProgress.spiral[m.set.fantasyRogueId], 1);
  } finally { b.destroy(); }
 });
 it('survives lethal damage only once per battle after the spiral threshold', () => {
  const b = native([set('Excadrill', 'Sand Rush', 50, ['Splash'])], ['spiral'], s => { s.blessings.owned[0].target = s.team[0].id; s.team[0].spiral = 99; });
  try {
   const m = b.p1.active[0], foe = b.p2.active[0];
   b.damage(m.maxhp * 10, m, foe, b.dex.moves.get('tackle')); assert.equal(m.hp, 1);
   b.damage(10, m, foe, b.dex.moves.get('tackle')); assert.equal(m.hp, 0);
  } finally { b.destroy(); }
 });
 it('assigns the two pure-robe abilities only to the strongest eligible female', () => {
  const team = [member(set('Espurr', 'Keen Eye', 50)), member({...set('Meowstic-F', 'Competitive', 40), gender: 'F'}), member({...set('Espurr', 'Keen Eye', 20), gender: 'F'})];
  const effects = {owned: owned(['puregodrobe'])};
  assert.deepEqual(assignedExtraAbilities(team[0], team, effects), []);
  assert.deepEqual(assignedExtraAbilities(team[1], team, effects).sort(), ['sheerforce', 'stalwart']);
  assert.deepEqual(assignedExtraAbilities(team[2], team, effects), []);
 });
 it('restores blood-robe HP on its first lethal hit, and calculates live defenses', () => {
  const b = native([set('Zangoose', 'Immunity', 50, ['Splash'])], ['godrobe']);
  try {
   const m = b.p1.active[0], foe = b.p2.active[0]; m.hp = Math.floor(m.maxhp / 2);
   assert(m.getStat('def') >= Math.floor(m.storedStats.def * 1.5)); assert(robeMultiplier(m) >= 1.5);
   b.damage(m.maxhp * 10, m, foe, b.dex.moves.get('tackle')); assert.equal(m.hp, Math.floor(m.maxhp / 2));
   b.damage(m.maxhp * 10, m, foe, b.dex.moves.get('tackle')); assert.equal(m.hp, 0);
  } finally { b.destroy(); }
 });
 it('marks only the eligible Zangoose with the native blood aura and restores it on re-entry', () => {
  const b=native([set('Zangoose','Immunity',50,['Splash']),set('Mew','Synchronize',50,['Splash'])],['godrobe']);
  try {
   assert(b.p1.active[0].volatiles.roguebloodrobe);assert(!b.p2.active[0].volatiles.roguebloodrobe);
   b.makeChoices('switch 2','move 1');assert(!b.p1.active[0].volatiles.roguebloodrobe);
   b.makeChoices('switch 2','move 1');assert(b.p1.active[0].volatiles.roguebloodrobe);
   assert(b.log.some(line=>line.includes('|Rogue Blood Robe|[silent]')));
  } finally {b.destroy();}
 });
 it('consumes the optional blood cost only for the selected damaging action and boosts its damage', () => {
  const damage = [];
  for (const selected of [false, true]) {
   const b = native([set('Zangoose', 'Immunity', 50, ['Flamethrower'])], ['godrobe']);
   try {
    const mon = b.p1.active[0], foe = b.p2.active[0], hp = mon.hp;
    assert.equal(bloodRequest(mon).factor, 1.5);
    b.makeChoices((selected ? 'rogueblood ' : '') + 'move 1', 'move 1');
    damage.push(foe.maxhp - foe.hp);
    if (selected) assert(b.log.some(line => line.includes('消耗 ' + Math.ceil(hp / 10) + ' HP')));
    else assert.equal(mon.hp, hp);
   } finally { b.destroy(); }
  }
  assert(Math.abs(damage[1] / damage[0] - 1.5) < 0.06, String(damage));
 });
 it('does not amplify or charge blood for fixed damage, nor allow an ineligible user to select it', () => {
  const b = native([set('Zangoose', 'Immunity', 50, ['Dragon Rage'])], ['godrobe']);
  try { const m = b.p1.active[0], f = b.p2.active[0], hp = m.hp; b.makeChoices('rogueblood move 1', 'move 1'); assert.equal(f.maxhp - f.hp, 40); assert.equal(m.hp, hp); }
  finally { b.destroy(); }
  const other = native([set('Mew', 'Synchronize', 50, ['Tackle'])], ['godrobe']);
  try { assert.equal(other.p1.choose('rogueblood move 1'), false); } finally { other.destroy(); }
 });
 it('triggers pure-robe half-HP awakening only once, and its upgrade removes confusion and reduces drain', () => {
  for (const upgraded of [false, true]) {
   const b = native([{...set('Meowstic-F', 'Keen Eye', 50, ['Splash']), gender: 'F'}], ['puregodrobe'], s => { s.blessings.owned[0].completed = upgraded; });
   try {
    const m = b.p1.active[0]; m.hp = Math.floor(m.maxhp / 2); const hp = m.hp;
    b.makeChoices('move 1', 'move 1');
    assert.equal(m.hp, hp - Math.ceil(hp * (upgraded ? 0.07 : 0.1)));
    assert.equal(m.boosts.spa, 1); assert.equal(!!m.volatiles.confusion, !upgraded);
    m.removeVolatile('confusion'); m.hp = m.maxhp;
    b.makeChoices('move 1', 'move 1'); m.hp = Math.floor(m.maxhp / 2); b.makeChoices('move 1', 'move 1');
    assert.equal(m.boosts.spa, 1);
   } finally { b.destroy(); }
  }
 });
 it('uses the Mega drill ability against Flying immunity, Levitate and contact protection', () => {
  for (const [species, ability, foeMove] of [['Zapdos', 'Pressure', 'Protect'], ['Weezing', 'Levitate', 'Splash']]) {
   const b = native([{...set('Excadrill', 'Sand Rush', 50, ['Drill Run']), item: 'Excadrite'}], ['spiral'], s => { s.systems = {player: {mega: true, z: false}}; s.blessings.owned[0].target = s.team[0].id; }, [set(species, ability, 50, [foeMove])]);
   try {
    b.makeChoices('move 1 mega', 'move 1');
    assert(b.p1.active[0].species.isMega); assert.equal(b.p1.active[0].ability, 'heavenpiercingdrill');
    assert(b.p2.active[0].hp < b.p2.active[0].maxhp, b.log.join('\n'));
   } finally { b.destroy(); }
  }
 });
 it('gives the Mega stone at 250 points once, independently of the current floor', () => {
  const r = run(90, ['spiral']); r.blessings.owned[0].target = r.team[0].id;
  r.team[0].spiral = 249; syncBlessingParty(r); assert(!r.bag.excadrite);
  r.team[0].spiral = 250; syncBlessingParty(r); syncBlessingParty(r);
  assert.equal(r.bag.excadrite, 1); assert(r.megaUnlocked);
 });
 it('guarantees Kill la Girl in prismatic slots only with both robes after 150', () => {
  const r = run(150, ['godrobe', 'puregodrobe']), options = blessingCandidates(r, content);
  assert(options.some(b => b.id === 'killlagirl')); r.floor = 149; assert(!blessingCandidates(r, content).some(b => b.id === 'killlagirl'));
  const round = createBlessingRound({floor: 150, killlaReady: true, spirit: 'terapagos'}, options, () => 0);
  assert.equal(round.options[0].id, 'killlagirl'); assert.equal(round.options[0].refreshes, 0);
  assert.throws(() => refreshBlessingOption(round, 0, options, () => 0));
  assert(blessingQualityWeights({floor: 150, killlaReady: true}).prismatic > blessingQualityWeights({floor: 150}).prismatic);
 });
 it('repairs an invalid guaranteed offer from an older save without granting a refresh', () => {
  const r = run(1); r.blessings.round = {floor: 1, tier: 'prismatic', remaining: 1,
   options: [{id: 'killlagirl', refreshes: 0, chosen: false}], familiesSeen: []};
  repairBlessingRound(r, content, () => 0);
  assert.notEqual(r.blessings.round.options[0].id, 'killlagirl'); assert.equal(r.blessings.round.options[0].refreshes, 0);
 });
 it('archives new effects and renders their actual sources on both sides of a clear-card duel', () => {
  const cards = [0, 1].map(index => {
   const r = run(200, ['spiral', index ? 'puregodrobe' : 'godrobe']);
   const robe = member(index ? {...set('Meowstic-F', 'Keen Eye', 50, ['Splash']), gender: 'F'} : set('Zangoose', 'Immunity', 50, ['Splash']));
   const drill = member(set('Excadrill', 'Sand Rush', 50, ['Splash'])); drill.spiral = 300;
   r.team = [robe, drill]; r.blessings.owned[0].target = drill.id; robe.hp = Math.floor(robe.maxhp / 2);
   r.rival = {id: 'kieran', completed: 8, affection: 10, permanent: true, carmine: {affection: 8, permanent: true}};
   Object.assign(r, {id: 'clear-' + index, owner: {id: 'owner' + index, name: 'Player ' + index}, phase: 'complete', contentVersion: content.version});
   const account = {captures: {}, unlocked: []}; recordClear(account, r);
   const card = account.cards[0], details = card.snapshot.memberDetails;
   assert(details[drill.id].sources.some(s => s.text.includes('攻击 +30%') && s.text.includes('已解锁')));
   assert(details[robe.id].sources.some(s => s.name.startsWith('神衣') && s.text.includes('约战开始恢复满血')));
   assert(card.snapshot.rival.carmine.permanent); return card;
  });
  const state = buildRogueDuelState(...cards);
  const b = new Battle({formatid: 'gen9fantasyrogueduel', seed: [1, 2, 3, 4], fantasyRogue: state,
   p1: {name: 'A', team: state.team.map(m => m.set)}, p2: {name: 'B', team: state.duel.team.map(m => m.set)}});
  try {
   b.makeChoices('team 1', 'team 1');
   assert.equal(b.p1.active[0].hp, b.p1.active[0].maxhp); assert.equal(b.p2.active[0].hp, b.p2.active[0].maxhp);
   assert.equal(rogueAbilityInfo(b.p1.active[0]).abilitySources.sharpness, '神衣鲜血');
   assert.equal(rogueAbilityInfo(b.p2.active[0]).abilitySources.stalwart, '神衣纯洁');
   assert(b.p2.active[0].hasAbility('sheerforce')); assert(bloodRequest(b.p1.active[0]).available);
   b.makeChoices('switch 2', 'switch 2');
   for (const side of [b.p1, b.p2]) {
    const mon = side.active[0]; assert(mon.getStat('atk') >= Math.floor(mon.storedStats.atk * 1.3));
    b.damage(mon.maxhp * 10, mon, side.foe.active[0], b.dex.moves.get('tackle')); assert.equal(mon.hp, 1);
   }
   assert(cards.every(card => card.snapshot.team[1].spiral === 300), 'PVP does not mutate the archived progress');
  } finally { b.destroy(); }
 });
 it('offers each legendary once, preserves max training, and permits inheritance only after both join', () => {
  const r = run(150, ['godrobe', 'puregodrobe', 'killlagirl']), account = {captures: {}, unlocked: []};
  for (const [index, name] of ['Yveltal', 'Reshiram'].entries()) {
   r.node = {kind: 'elite', name: '精英', encounters: [], reward: {money: 0, items: {}}};
   prepareBlessingEncounter(r, () => 0); assert.equal(r.node.awakeningLegend, name);
   const opponent = r.node.encounters[0].team[0]; assert.deepEqual(opponent.ivs, stats(31)); assert.deepEqual(opponent.evs, stats(252));
   const result = {encounterId: 'legend' + index, won: true, team: r.team, bag: {}, defeated: [], blessingProgress: {kos: [], insight: {}, swords: 0}};
   settleBlessingBattle(account, r, content, result, () => 0); const size = r.blessings.pending.length;
   settleBlessingBattle(account, r, content, result, () => 0); assert.equal(r.blessings.pending.length, size);
   const gift = r.blessings.pending.find(p => p.pokemon?.set.species === name); assert(gift); r.team.push(gift.pokemon);
   if (!index) assert.throws(() => handleBlessingCommand(account, r, content, {action: 'inheritrobe', value: 'godrobe'}, () => 0));
  }
  handleBlessingCommand(account, r, content, {action: 'inheritrobe', value: 'godrobe'}, () => 0);
  const transferred = r.team.find(m => m.set.species === 'Yveltal');
  assert.equal(r.blessings.owned[0].target, transferred.id); assert(assignedExtraAbilities(transferred, r.team, r.blessings).includes('sharpness'));
 });
 it('upgrades a robe for a retained capture on escape but commits no defeated legend or spiral progress', () => {
  const r = run(120, ['godrobe', 'puregodrobe']), account = {captures: {}, unlocked: []};
  const capture = member(set('Yveltal', 'Dark Aura', 60));
  settleBlessingBattle(account, r, content, {encounterId: 'escape', won: false, team: r.team, bag: {}, captures: [capture],
   defeated: [{species: 'Reshiram'}], blessingProgress: {kos: [], insight: {}, swords: 0, spiral: {[r.team[0].id]: 300}}}, () => 0, true);
  assert(r.blessings.owned[0].completed); assert(!r.blessings.owned[1].completed); assert.equal(r.team[0].spiral, undefined);
 });
 it('attracts robe legends only at legal wild levels', () => {
  const templates = [{id: 'wild', kind: 'wild', name: '野外', encounters: [], reward: {money: 0, items: {}}}];
  const generate = floor => createBiomeRoutes(floor, templates, n => n, () => 0, undefined, undefined, ['Yveltal'])[0].encounters[0].team;
  assert(!generate(50).some(m => m.species === 'Yveltal')); assert(generate(120).some(m => m.species === 'Yveltal'));
 });
 it('keeps Carmine affection and short company independent from Kieran', () => {
  const r = run(40); r.rival = {id: 'kieran', completed: 1, affection: 0, lastFloor: 1, carmine: {affection: 2}};
  syncAffection({run: r}); // Import the legacy two-point relationship before continuing its story.
  beginRival(r, () => 0); chooseRival(r, content, () => 0, 'greet:honest'); chooseRival(r, content, () => 0, 'greet:honest');
  assert.equal(r.node.event.rival.step, 'carmine');
  chooseRival(r, content, () => 0, 'carmine:listen'); assert.equal(r.rival.carmine.affection, 8); assert.equal(r.rival.affection, 10);
  assert.equal(r.rival.carmine.affection, r.trainerBonds.carmine.score); assert.equal(r.rival.affection, r.trainerBonds.kieran.score);
  chooseRival(r, content, () => 0, 'start'); r.encounter = r.node.encounters.length - 1; settleRival(r, () => 0, true);
  const ids = rivalView(r).options.map(o => o.id); assert(ids.includes('joincarmine')); assert(ids.includes('join'));
  chooseRival(r, content, () => 0, 'joincarmine'); assert.equal(activeRivalTraveller(r).id, 'carmine');
 });
 it('offers Carmine permanent company after the final challenge while retaining Kieran as the main rival', () => {
  const r = run(150); r.rival = {id: 'kieran', completed: 7, affection: 8, lastFloor: 130, carmine: {affection: 6}};
  r.trainerBonds = { kieran: { score: 35, gifts: [], pending: [] }, carmine: { score: 25, gifts: [], pending: [] } };
  beginRival(r, () => 0); chooseRival(r, content, () => 0, 'greet:honest'); chooseRival(r, content, () => 0, 'greet:honest');
  chooseRival(r, content, () => 0, 'carmine:trust'); chooseRival(r, content, () => 0, 'start');
  settleRival(r, () => 0, false); assert(r.rival.permanent); assert.equal(r.node.event.rival.step, 'carminefinal');
  chooseRival(r, content, () => 0, 'carmine:stay'); assert.equal(rivalCompanionViews(r).length, 2); assert.equal(r.rival.id, 'kieran');
 });
 it('shows a farewell and gives each expiring companion one personal gift, never replaying the payout', () => {
  const r = run(50); r.rival = {id: 'kieran', completed: 3, affection: 7, lastFloor: 45, temporaryUntil: 50, carmine: {affection: 6, temporaryUntil: 50}};
  assert(expireRival(r, 51)); assert.equal(r.dialogue.resume, 'advance'); assert.equal(r.dialogue.pages.length, 4);
  assert.equal(r.bag.potion, 2); assert(!r.bag.dragonfang && !r.bag.spelltag); assert.equal(r.rival.affection, 7);
  assert(!expireRival(r, 51)); assert.equal(r.bag.potion, 2);
 });
 it('stages police escalation as two, three and four grunts, then the complete ordered Star leadership', () => {
  const r = run(20); r.rival = {id: 'penny', completed: 1, affection: 0, lastFloor: 1};
  r.node.event = {stage: 'choice', police: {choices: ['paldea'], round: 0}};
  choosePoliceRegion(r, 'police:paldea', () => 0);
  assert.equal(r.node.encounters.length, 2); assert(r.dialogue.pages.some(p => p.portrait === 'penny' && p.text.includes('……')));
  for (let round = 0; round <= 8; round++) {
   assert.equal(r.node.encounters.length, round < 3 ? round + 2 : 1);
   if (round >= 3) assert.equal(r.node.encounters[0].trainer.id, ['giacomo', 'mela', 'atticus', 'ortega', 'eri', 'penny'][round - 3]);
   r.encounter = r.node.encounters.length - 1; settlePoliceBattle(r, true);
   const money = r.money; settlePoliceBattle(r, true); assert.equal(r.money, money);
   if (round < 8) { r.floor += 8; assert(beginPoliceEncounter(r, () => 0)); }
  }
  assert.equal(r.police.regions.paldea.status, 'cleared'); assert(r.dialogue.pages[0].text.includes('解决'));
 });
 it('ends Giovanni’s Johto branch safely after a lost friendly battle and retains Marnie’s fan sequence', () => {
  const r = run(60); r.blessings.companions = [{id: 'giovanni'}]; r.node.event = {stage: 'choice', police: {choices: ['johto']}};
  choosePoliceRegion(r, 'police:johto', () => 0); assert(r.node.event.police.friendly);
  r.team[0].hp = 0; settlePoliceBattle(r, false); assert.equal(r.team[0].hp, r.team[0].maxhp); assert.equal(r.police.regions.johto.status, 'averted');
  const fans = run(30); fans.rival = {id: 'marnie', completed: 3, affection: 8, permanent: true};
  fans.node.event = {stage: 'choice', police: {choices: ['galar']}}; choosePoliceRegion(fans, 'police:galar', () => 0);
  assert(fans.node.event.police.fans); fans.encounter = 1; settlePoliceBattle(fans, true); assert.equal(fans.police.regions.galar.status, 'pending');
 });
 it('applies a newly joined leader’s intervention to an already pending police chain', () => {
  for (const [region, id] of [['johto', 'giovanni'], ['alola', 'guzma']]) {
   const r = run(80); r.blessings.companions = [{id}];
   r.police = {nextFloor: 60, regions: {[region]: {floor: 52, revengeAfter: 60, status: 'pending', round: 1}}};
   assert(beginPoliceEncounter(r, () => 0)); assert(r.dialogue.pages.some(p => p.portrait === id && p.side === 'left'));
   if (region === 'johto') {
    assert(r.node.event.police.friendly); assert.equal(r.node.encounters[0].trainer.id, 'archer');
    r.team[0].hp = 0; settlePoliceBattle(r, false); assert.equal(r.team[0].hp, r.team[0].maxhp);
   } else { assert.equal(r.node.encounters.length, 0); assert.equal(r.bag.superpotion, 1); }
   assert.equal(r.police.regions[region].status, 'averted');
  }
 });
 it('includes all new people and eight chapters in the local codex without unlocking remote accounts', () => {
  const account = {captures: {}, unlocked: []}, before = JSON.stringify(account);
  const preview = rogueCodex(account, 'events', true).entries;
  for (const id of ['kieran', 'carmine', 'penny', 'giacomo', 'mela', 'atticus', 'ortega', 'eri', 'archie', 'hiker']) assert(preview.some(e => e.portrait === id && e.unlocked), id);
  assert.equal(preview.filter(e => e.category === 'adventure').length, 96); assert.equal(JSON.stringify(account), before);
		assert(rogueCodex(account, 'events').entries.filter(e => e.category !== 'ecology').every(e => !e.unlocked));
  account.run = run(20); account.run.phase = 'story'; account.run.story = {stage: 'interlude', page: 0};
  account.run.dialogue = {pages: [{portrait: 'carmine'}, {portrait: 'penny'}]}; recordRogueDiscoveries(account);
  assert(account.discoveries.trainers.includes('carmine')); assert(!account.discoveries.trainers.includes('penny'));
 });
 it('creates all authored travelling trainers with legal early stages and thematic teams', () => {
  assert(TRAVELLING_TRAINERS.length >= 20);
  for (let index = 0; index < TRAVELLING_TRAINERS.length; index++) {
   const r = run(10); prepareTravellingTrainer(r, n => n === TRAVELLING_TRAINERS.length ? index : 0);
   const encounter = r.node.encounters[0]; assert.equal(encounter.trainer.id, TRAVELLING_TRAINERS[index].id);
   assert.equal(encounter.team.length, 3); assert(!encounter.catchable);
   for (const mon of encounter.team) { assert(Dex.mod('gen9fantasy').species.get(mon.species).exists); assert(minimumEvolutionLevel(mon.species) <= mon.level, mon.species); }
  }
 });
});
