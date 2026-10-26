"use strict";
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { collapseState } = require('../../dist/sim/rogue-collapse');
const { collapseEntries, collapseParameters } = require('../../dist/sim/rogue-collapse-data');
const { difficultyScale, difficultyCardScale } = require('../../dist/sim/rogue-difficulty');
const { collapseShopPrice, collapseMedicine } = require('../../dist/server/fantasy-rogue/collapse');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue capture-quality difficulty: softened native mechanics', function () {
 this.timeout(30000);
 let battle;
 afterEach(() => { battle?.destroy(); battle = null; });
 function begin(ids = [], version = 4) {
  battle?.destroy();
  const difficulty = { tier: 5, floor: 200, version };
  const team = [createRoguePokemon(set('Mew', 'No Guard', 50, ['Splash']), stats(0))];
  team[0].difficulty = difficulty;
  battle = new Battle({formatid: 'gen9fantasyrogue', seed: [11, 22, 33, 44],
   fantasyRogue: {encounterId: 'quality-v4', team, boosts: stats(0), bag: {}, balls: [], catchable: true, collapse: ids, difficulty},
   p1: {name: 'Player', team: team.map(m => m.set)},
   p2: {name: 'Enemy', team: [set('Blissey', 'Healer', 50, ['Splash']), set('Blissey', 'Healer', 50, ['Splash'])]}});
  battle.makeChoices('team 1', 'team 1'); battle.randomizer = n => n;
  return battle.p2.active[0];
 }
 function use(name, enemy = false, extra = {}) {
  const source = (enemy ? battle.p2 : battle.p1).active[0], target = (enemy ? battle.p1 : battle.p2).active[0];
  const move = Object.assign(battle.dex.getActiveMove(name), {willCrit: false, accuracy: true}, extra);
  const hp = target.hp; battle.actions.useMove(move, source, {target: move.target === 'self' ? source : target});
  return hp - target.hp;
 }
 it('has no tier-granted battle or clear-card multiplier at any ordinary floor', () => {
  for (let tier = 0; tier <= 5; tier++) for (let floor = 1; floor <= 200; floor++) {
   assert.equal(difficultyScale(tier, floor), 1); assert.equal(difficultyScale(tier, floor, true), 1);
   assert.equal(difficultyCardScale(tier), 1);
  }
  assert.equal(difficultyScale(5, 200, false, 3), 1.15);
  assert.equal(difficultyCardScale('easy'), 0.9);
 });
 it('keeps all ten choices, softens numbers and adds no common opening guard', () => {
  assert.equal(collapseEntries(4).length, 10);
  assert.equal(collapseParameters(4).power, 1.15); assert.equal(collapseParameters(4).erosion, 0.50);
  begin(); const normal = use('Water Gun'), attack = use('Tackle', true);
  const foe = begin(['environment', 'vigilance']);
  assert.equal(use('Water Gun'), normal); assert.equal(use('Tackle', true), attack);
  assert(!collapseState(foe).openingUsed);
  begin(['power']); assert.equal(use('Tackle', true), battle.modify(attack, 1.15));
  assert.equal(use('Seismic Toss', true), 50);
 });
 it('uses five-percent whole-move adaptation, capped at fifteen percent', () => {
  const foe = begin(['adaptation']), damage = [];
  for (let i = 0; i < 5; i++) {foe.hp = foe.maxhp; damage.push(use('Water Gun'));}
  assert.deepEqual(damage, damage.map((_, i) => battle.modify(damage[0], 1 - Math.min(i, 3) * .05)));
  foe.hp = foe.maxhp; use('Double Hit'); assert.equal(collapseState(foe).adaptation.Normal, 1);
  const saved = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(saved);
  assert.equal(collapseState(battle.p2.active[0]).adaptation.Water, 3);
 });
 it('uses one 25-percent vigilance bonus in current journeys, without stacking', () => {
  const foe = begin(['vigilance']), player = battle.p1.active[0];
  const base = use('Water Gun', true, {basePower: 80}); player.hp = player.maxhp;
  use('Swords Dance'); use('Swords Dance');
  assert(collapseState(foe).vigilance);
  const damage = use('Water Gun', true, {basePower: 80});
  assert(Math.abs(damage - battle.modify(base, 1.25)) <= 1);
  assert(!collapseState(foe).vigilance);
  assert.equal(battle.fantasyRogue.collapseMetrics.triggers.vigilance, 1);
  assert.equal(collapseParameters(4).vigilance, 1.25);
  assert(collapseEntries(4).find(e => e.id === 'vigilance').text.includes('25%'));
 });
 it('reduces outside damage by fifty percent without reducing self costs', () => {
  const foe = begin(['erosion']);
  assert.equal(battle.damage(100, foe, battle.p1.active[0], battle.dex.conditions.get('psn')), 50);
  assert.equal(battle.damage(20, foe, foe, battle.dex.conditions.get('recoil')), 20);
  assert.equal(use('Seismic Toss'), 50);
 });
 it('keeps vitality HP at 15 percent and its one-time recovery at 10 percent', () => {
  const base=begin().maxhp, foe=begin(['vitality']); assert.equal(foe.maxhp,Math.floor(base*1.15));
  foe.maxhp=200;foe.hp=150;use('Seismic Toss');assert.equal(foe.hp,100);assert(!collapseState(foe).emergencyUsed);
  use('Seismic Toss');assert.equal(foe.hp,70);assert(collapseState(foe).emergencyUsed);
 });
 it('keeps half the adverse environment bonus', () => {
  begin();battle.field.setWeather('raindance',battle.p1.active[0]);const rain=use('Water Gun');
  begin(['environment']);battle.field.setWeather('raindance',battle.p1.active[0]);const adapted=use('Water Gun');
  assert(Math.abs(adapted/rain-1.25/1.5)<.05);
 });
 it('cleanses at the fifth active end turn, including attachments, without preventing their application', () => {
  const foe=begin(['cleanse']); assert(use('Salt Cure')>0); use('Leech Seed'); use('Thunder Wave'); use('Growl');
  assert(foe.volatiles.saltcure && foe.volatiles.leechseed); assert.equal(foe.status,'par'); assert.equal(foe.boosts.atk,-1);
  foe.boosts.spa=2; use('Substitute',true);
  for(let i=0;i<4;i++) {foe.hp=foe.maxhp;battle.makeChoices('move 1','move 1');}
  assert.equal(collapseState(foe).activeTurns,4);assert(foe.status && foe.volatiles.saltcure);
  foe.hp=foe.maxhp;battle.makeChoices('move 1','move 1');
  assert.equal(foe.status,'');assert(!foe.volatiles.saltcure && !foe.volatiles.leechseed);
  assert.equal(foe.boosts.atk,0);assert.equal(foe.boosts.spa,2);assert(foe.volatiles.substitute);assert(foe.hp<foe.maxhp);
  foe.removeVolatile('substitute'); use('Thunder Wave');assert.equal(foe.status,'par');
  assert(battle.log.some(l=>l.includes('净化还需 5 回合')));
 });
 it('preserves the five-turn counter across bench, forme change and serialization', () => {
  let foe=begin(['cleanse']);battle.makeChoices('move 1','move 1');battle.makeChoices('move 1','move 1');
  battle.makeChoices('move 1','switch 2');battle.makeChoices('move 1','move 1');
  assert.equal(collapseState(foe).activeTurns,2);
  battle.makeChoices('move 1','switch 2');assert.equal(collapseState(foe).activeTurns,3);
  foe.formeChange('Blissey',battle.dex.conditions.get('rogueemergency')); assert.equal(collapseState(foe).activeTurns,3);
  const saved=JSON.stringify(battle.toJSON());battle.destroy();battle=Battle.fromJSON(saved);foe=battle.p2.active[0];
  use('Thunder Wave');foe.boosts.def=-2;battle.makeChoices('move 1','move 1');assert.equal(foe.status,'par');
  battle.makeChoices('move 1','move 1');assert.equal(foe.status,'');assert.equal(foe.boosts.def,0);
 });
 it('clears stacked status and harmful volatiles but retains beneficial effects', () => {
  const foe=begin(['cleanse']),source=battle.p1.active[0];
  foe.setStatus('brn',source);foe.m.rogueStatusStack={brn:foe.statusState,par:battle.initEffectState({id:'par',target:foe,source})};
  for(const id of ['saltcure','leechseed','curse','taunt','healblock']) foe.addVolatile(id,source);
  foe.boosts.spe=-3;foe.boosts.evasion=2;
  collapseState(foe).activeTurns=4;
  battle.makeChoices('move 1','move 1');
  assert.equal(foe.status,'');assert(!foe.m.rogueStatusStack);assert.equal(foe.boosts.spe,0);assert.equal(foe.boosts.evasion,2);
  for(const id of ['saltcure','leechseed','curse','taunt','healblock']) assert(!foe.volatiles[id],id);
 });
 it('retains the old one-shot shield for version-three journeys', () => {
  const foe=begin(['cleanse'],3);use('Thunder Wave');assert(!foe.status);assert(collapseState(foe).shieldUsed);
 });
 it('applies weaker price and medicine restrictions consistently with their descriptions', () => {
  const run = {difficulty: 5, difficultyRulesVersion: 4, collapse: ['inflation','medicine']};
  assert.equal(collapseShopPrice(run, 100), 120); assert.equal(collapseMedicine(run, 100), 80);
  assert(collapseEntries(4).find(e => e.id === 'inflation').text.includes('20%'));
  run.difficultyRulesVersion = 3; assert.equal(collapseShopPrice(run, 100), 125); assert.equal(collapseMedicine(run, 100), 75);
 });
 it('can serialize, reconnect and finish a battle with all ten active', () => {
  begin(collapseEntries(4).map(e => e.id)); use('Swords Dance'); use('Tackle', true); use('Toxic'); use('Water Gun');
  const saved = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(saved);
  assert.equal(battle.fantasyRogue.collapse.length, 10);
  battle.win('p1'); assert(battle.ended); assert.equal(battle.winner, 'Player');
 });
});
