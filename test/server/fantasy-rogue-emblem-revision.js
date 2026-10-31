'use strict';
const assert = require('assert').strict;
const {Battle} = require('../../dist/sim');
const {set, stats} = require('../fixtures/fantasy-rogue');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {editParty} = require('../../dist/server/fantasy-rogue/team');
const {normalizeBlessings, syncBlessingParty, blessingCandidates, handleBlessingCommand} = require('../../dist/server/fantasy-rogue/blessings');
const {assignedExtraAbilities, permanentMemberTypes} = require('../../dist/sim/rogue-blessing-permanent');
const {blessing, EMBLEM_MOVES} = require('../../dist/sim/rogue-blessing-data');
const {replaceTreasureWithEmblem, emblemLootChance} = require('../../dist/server/fantasy-rogue/emblem-loot');
const content = createPreviewContent();
const owned = id => ({...blessing(id), floor: 1});
function setup(names = ['Infernape'], ids = ['monkeyking']) {
 const r = {floor: 1, team: names.map(name => createRoguePokemon(set(name, 'Blaze', 50, ['Tackle', 'Splash']), stats(0))),
  caught: [], boosts: stats(0), phase: 'choose', bag: {rogueemblemrock: 1, rogueemblemflying: 1}, money: 0, encounter: 0};
 normalizeBlessings(r); r.blessings.owned = ids.map(owned); syncBlessingParty(r); return r;
}
function equip(r, value, slot) {
 editParty(r, {action: 'equipemblem', member: r.team[0].id, value, slot}, content); syncBlessingParty(r);
}
function native(r, foes = [set('Blissey', 'Natural Cure', 100, ['Splash'])]) {
 const b = new Battle({formatid: 'gen9fantasyrogue', seed: [1,2,3,4], fantasyRogue: {encounterId: 'emblem',
  team: r.team, boosts: r.boosts, bag: {}, balls: [], catchable: false, blessings: r.blessings},
  p1: {name: 'Player', team: r.team.map(m => m.set)}, p2: {name: 'Foe', team: foes}});
 b.makeChoices('team 1', 'team 1'); b.randomizer = n => n; return b;
}
describe('Fantasy Rogue emblem slots, Monkey King and fixed spiral progression', function () {
 this.timeout(20000);
 it('replaces either dual-type slot, persists it and never spends a second emblem on a slot change', () => {
  const r = setup(); equip(r, 'rogueemblemrock', 0);
  assert.deepEqual(permanentMemberTypes(r.team[0]), ['Rock', 'Fighting']); assert.equal(r.bag.rogueemblemrock, 0);
  equip(r, 'rogueemblemrock', 1); assert.deepEqual(permanentMemberTypes(r.team[0]), ['Fire', 'Rock']);
  assert.equal(r.bag.rogueemblemrock, 0);
  const restored = JSON.parse(JSON.stringify(r)); syncBlessingParty(restored);
  assert.deepEqual(permanentMemberTypes(restored.team[0]), ['Fire', 'Rock']);
  const b = native(restored); try {assert.deepEqual(b.p1.active[0].getTypes(), ['Fire', 'Rock']);} finally {b.destroy();}
  equip(r, ''); assert.deepEqual(permanentMemberTypes(r.team[0]), ['Fire', 'Fighting']); assert.equal(r.bag.rogueemblemrock, 1);
  assert.throws(() => equip(r, 'rogueemblemrock', 2));
 });
 it('adds a type to single-type partners, supports old second-slot saves and preserves temporary move PP', () => {
  const r = setup(['Pikachu'], []); equip(r, 'rogueemblemrock', 0);
  assert.deepEqual(permanentMemberTypes(r.team[0]), ['Electric', 'Rock']);
  r.team[0].blessingPP.find(m => m.id === 'headsmash').pp = 1;
  equip(r, ''); equip(r, 'rogueemblemrock');
  assert.equal(r.team[0].blessingPP.find(m => m.id === 'headsmash').pp, 1);
  const old = setup(); old.team[0].emblem = 'rogueemblemflying'; syncBlessingParty(old);
  assert.deepEqual(permanentMemberTypes(old.team[0]), ['Fire', 'Flying']);
  assert(EMBLEM_MOVES.Electric.includes('wildcharge')); assert(EMBLEM_MOVES.Flying.includes('airslash'));
 });
 it('grants only the strongest Infernape branch abilities, matching the permanent final type pair', () => {
  const r = setup(['Infernape', 'Infernape']); r.team[1].set.level = 40; r.team[1].emblem = 'rogueemblemrock';
  equip(r, 'rogueemblemrock', 0);
  let abilities = assignedExtraAbilities(r.team[0], r.team, r.blessings);
  assert(abilities.includes('mishi') && abilities.includes('rockhead') && abilities.includes('fierygoldeneyes'));
  assert(!abilities.includes('contrary')); assert.equal(assignedExtraAbilities(r.team[1], r.team, r.blessings).length, 0);
  equip(r, 'rogueemblemflying', 1); abilities = assignedExtraAbilities(r.team[0], r.team, r.blessings);
  assert(abilities.includes('serenegrace') && abilities.includes('bigpecks') && abilities.includes('contrary'));
  assert(!abilities.includes('fierygoldeneyes')); equip(r, ''); assert.equal(assignedExtraAbilities(r.team[0], r.team, r.blessings).length, 0);
 });
 it('halves enemy direct move damage including fixed damage, but not poison, Life Orb or allied damage', () => {
  const r = setup(); equip(r, 'rogueemblemrock', 0); const b = native(r);
  try {const m = b.p1.active[0], foe = b.p2.active[0];
   for (const [effect, source, expected] of [['dragonrage', foe, 20], ['tox', foe, 40], ['lifeorb', m, 40], ['tackle', m, 40]]) {
    m.hp = m.maxhp; b.damage(40, m, source, effect === 'tox' || effect === 'lifeorb' ? b.dex.conditions.get(effect) : b.dex.moves.get(effect));
    assert.equal(m.maxhp - m.hp, expected, effect);
   }
  } finally {b.destroy();}
 });
 it('increases Flying branch speed by 50% in battle and removes the bonus when unequipped', () => {
  const r = setup(); equip(r, 'rogueemblemflying', 1); const b = native(r);
  try {assert.equal(b.p1.active[0].getStat('spe'), Math.floor(b.p1.active[0].storedStats.spe * 1.5));} finally {b.destroy();}
  equip(r, ''); const plain = native(r); try {assert.equal(plain.p1.active[0].getStat('spe'), plain.p1.active[0].storedStats.spe);} finally {plain.destroy();}
 });
 it('makes Normal and Fighting super effective against the Ghost component, preserves other type components and Protect', () => {
  for (const [species, expected] of [['Mismagius', 1], ['Froslass', 1], ['Aegislash', 0]]) {
   const r = setup(); equip(r, 'rogueemblemrock', 0); const b = native(r, [set(species, 'No Ability', 100, ['Splash'])]);
   try {const m = b.p1.active[0], foe = b.p2.active[0]; let seen;
    b.onEvent('ModifyMove', b.format, -100, function (move) {if (move.id === 'tackle') seen = foe.runEffectiveness(move);});
    b.makeChoices('move 1', 'move 1'); assert.equal(seen, expected, b.log.join('\n')); assert(foe.hp < foe.maxhp);
    b.boost({accuracy: -1}, m, foe, b.dex.moves.get('sandattack')); assert.equal(m.boosts.accuracy, 0);
   } finally {b.destroy();}
  }
  const r = setup(); equip(r, 'rogueemblemrock', 0); const b = native(r, [set('Mismagius','No Ability',100,['Protect'])]);
  try {b.makeChoices('move 1','move 1'); assert.equal(b.p2.active[0].hp,b.p2.active[0].maxhp);} finally {b.destroy();}
 });
 it('uses the always-hit effect through the extra-ability dispatcher, even with negative accuracy', () => {
  const r = setup(); r.team[0].set.moves = ['zapcannon']; equip(r, 'rogueemblemrock', 0); const b = native(r);
  try {b.p1.active[0].boosts.accuracy = -6; b.p2.active[0].boosts.evasion = 6; b.makeChoices('move 1','move 1'); assert(b.p2.active[0].hp < b.p2.active[0].maxhp, b.log.join('\n'));} finally {b.destroy();}
 });
 it('offers Monkey King only with Infernape and grants the selected emblem exactly once', () => {
  const r = setup(['Infernape'], []); assert(blessingCandidates(r,content).some(b => b.id === 'monkeyking'));
  assert(!blessingCandidates(setup(['Chimchar'], []), content).some(b => b.id === 'monkeyking'));
  r.phase = 'blessing'; r.blessings.round = {floor:1, tier:'prismatic', remaining:1, familiesSeen:[], options:[{id:'monkeyking',refreshes:0,chosen:false}]};
  const account={captures:{},unlocked:[]}; handleBlessingCommand(account,r,content,{action:'blessing',slot:0},()=>0);
  const reward=r.blessings.pending.find(p=>p.title.includes('大圣')); assert(reward);
  handleBlessingCommand(account,r,content,{action:'blessingreward',member:reward.id,value:'rogueemblemflying'},()=>0);
  assert.equal(r.bag.rogueemblemflying,2); assert(!r.blessings.pending.some(p=>p.id===reward.id));
 });
 it('learns the singer move only on the strongest Meloetta and no longer grants Extreme Intelligence', () => {
  const r = setup(['Meloetta','Meloetta'],['singer']); r.team[1].set.level=60;
  r.team.forEach(m=>m.moveMemory=[]); syncBlessingParty(r);
  assert(!r.team[0].moveMemory.some(m=>m.id==='raoliangzhiyin')); assert(r.team[1].moveMemory.some(m=>m.id==='raoliangzhiyin'));
  assert(!assignedExtraAbilities(r.team[1],r.team,r.blessings).includes('jizhineng'));
 });
 it('only offers the drill on floor one and awards Drilbur, not its evolved form', () => {
  const r=setup(['Pikachu'],[]); assert(blessingCandidates(r,content).some(b=>b.id==='spiral'));
  for(const f of [50,100,150]){r.floor=f;assert(!blessingCandidates(r,content).some(b=>b.id==='spiral'));}
  r.floor=1;r.phase='blessing';r.blessings.round={floor:1,tier:'prismatic',remaining:1,familiesSeen:[],options:[{id:'spiral',refreshes:0,chosen:false}]};
  handleBlessingCommand({captures:{},unlocked:[]},r,content,{action:'blessing',slot:0},()=>0);
  const gift = r.blessings.pending.find(p => p.kind === 'gift'); assert(gift);
  handleBlessingCommand({captures:{},unlocked:[]},r,content,{action:'blessingreward',member:gift.id,value:'join'},()=>0);
  const mon=r.team.find(m=>m.id===r.blessings.owned.find(b=>b.id==='spiral').target);
  assert(mon);assert.equal(mon.set.species,'Drilbur');assert.equal(mon.set.level,5);
 });
 it('replaces only treasure, enforces the quiet period and caps incidental drops at two across reloads', () => {
  let r=setup();r.floor=20;const loot={bigmushroom:1,expcandyxs:2,potion:1};replaceTreasureWithEmblem(r,loot,()=>0);
  assert.equal(loot.bigmushroom,undefined);assert.equal(loot.expcandyxs,2);assert.equal(loot.potion,1);
  assert.equal(Object.keys(loot).filter(k=>k.startsWith('rogueemblem')).length,1);
  r=JSON.parse(JSON.stringify(r));for(const floor of [21,60,100]){r.floor=floor;assert.equal(emblemLootChance(r),0);}
  r.floor=120;const next={bignugget:1};replaceTreasureWithEmblem(r,next,()=>0);assert.equal(r.emblemLoot.count,2);
  r.floor=190;assert.equal(emblemLootChance(r),0);
 });
});
