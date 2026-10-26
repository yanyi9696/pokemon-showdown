'use strict';
const assert = require('assert').strict;
const {Battle} = require('../../dist/sim/battle');
const {collapseState, collapseGasActive, collapseSTAB} = require('../../dist/sim/rogue-collapse');
const {COLLAPSE_ENTRIES, collapseEntries} = require('../../dist/sim/rogue-collapse-data');
const {emptyEchoUpgrades} = require('../../dist/sim/rogue-echo');
const {rogueCaptureChance, throwRogueBall} = require('../../dist/sim/fantasy-rogue');
const {roguePowerModifiers, rogueAbilityInfo} = require('../../dist/sim/fantasy-rogue-blessings');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {set, stats} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue collapse v5 and echo: real battle rules', function () {
 this.timeout(30000);
 let battle;
 afterEach(() => { battle?.destroy(); battle = null; });
 function begin(ids = [], options = {}) {
  battle?.destroy();
  const team = [createRoguePokemon({...set('Mew', 'No Guard', 50, ['Splash']), ...options.player}, stats(0)),
   createRoguePokemon(set('Mew', 'Synchronize', 50, ['Splash']), stats(0))];
  if (options.extra) team[0].extraAbilities = options.extra;
  battle = new Battle({formatid: 'gen9fantasyrogue', seed: [11,22,33,44],
   fantasyRogue: {encounterId: 'v5', team, boosts: stats(0), bag: {}, balls: [], catchable: true,
    collapse: ids, difficulty: {tier: 5, floor: 200, version: 5}, ...options.rules},
   p1: {name: 'Player', team: team.map(m => m.set)}, p2: {name: 'Enemy', team: [
    {...set('Blissey', 'Healer', 50, ['Splash']), ...options.foe}, set('Blissey', 'Healer', 50, ['Splash'])]}});
  battle.makeChoices('team 1', 'team 1'); battle.randomizer = n => n;
  return battle.p2.active[0];
 }
 function use(name, enemy = false, extra = {}) {
  const source = (enemy ? battle.p2 : battle.p1).active[0], target = (enemy ? battle.p1 : battle.p2).active[0];
  const move = Object.assign(battle.dex.getActiveMove(name), {willCrit: false, accuracy: true}, extra);
  const hp = target.hp;
  battle.actions.useMove(move, source, {target: move.target === 'self' ? source : target});
  return hp - target.hp;
 }
 it('publishes exactly the requested order while retaining version-four choices', () => {
  assert.deepEqual(COLLAPSE_ENTRIES.map(e => e.name), ['数值膨胀','特性超模','威力过量','回复泛滥','增益无度',
   '打击溢面','机制恼人','异常失控','环境独霸','沉没成本']);
  assert(collapseEntries(4).some(e => e.id === 'medicine'));
  assert(!COLLAPSE_ENTRIES.some(e => ['erosion','adaptation','medicine'].includes(e.id)));
 });
 it('applies six-stat and HP multipliers without copying enemy permissions through Transform', () => {
  const normal = begin(), hp = normal.maxhp, base = {...normal.storedStats};
  const foe = begin(['statbloat','vitality']);
  assert.equal(foe.maxhp, Math.floor(Math.floor(hp * 1.1) * 1.2));
  for (const key of ['atk','def','spa','spd','spe']) assert.equal(foe.getStat(key), Math.floor(base[key] * 1.1));
  assert.equal(foe.m.rogueCollapseBaseHP, hp);
  const p = battle.p1.active[0]; p.transformInto(foe);
  assert.equal(p.getStat('spe'), base.spe); assert.equal(foe.getStat('spe'), Math.floor(base.spe * 1.1));
 });
 it('boosts ordinary enemy damage by 20 percent but not fixed damage', () => {
  begin(); const base = use('Water Gun', true);
  begin(['power']); assert.equal(use('Water Gun', true), battle.modify(base, 1.2));
  assert.equal(use('Seismic Toss', true), 50);
 });
 it('reduces only non-STAB ordinary damage, including Substitute, after actual type changes', () => {
  begin(); const normal = use('Water Gun'), psychic = use('Confusion');
  let foe = begin(['coverage']); assert.equal(use('Water Gun'), battle.modify(normal, .75));
  assert.equal(use('Confusion'), psychic); assert.equal(use('Seismic Toss'), 50);
  const p = battle.p1.active[0];
  p.terastallized = 'Water';
  assert(collapseSTAB(p, battle.dex.getActiveMove('Water Gun')));
  assert(collapseSTAB(p, battle.dex.getActiveMove('Confusion')));
  p.terastallized = 'Stellar'; assert(!collapseSTAB(p, battle.dex.getActiveMove('Water Gun')));
  foe = begin(['coverage']); use('Substitute', true); const sub = foe.volatiles.substitute.hp;
  use('Water Gun'); assert.equal(sub - foe.volatiles.substitute.hp, battle.modify(normal, .75));
 });
 it('survives once without full HP, even at one HP; later multi-hits can KO', () => {
  let foe = begin(['steadfast']); foe.hp = 15; use('Seismic Toss');
  assert.equal(foe.hp, 1); assert(collapseState(foe).steadfastUsed);
  const saved = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(saved);
  foe = battle.p2.active[0]; assert(collapseState(foe).steadfastUsed);
  use('Seismic Toss'); assert.equal(foe.hp, 0);
  foe = begin(['steadfast']); foe.hp = 1; use('Seismic Toss'); assert.equal(foe.hp, 1);
  foe = begin(['steadfast']); foe.hp = 2; use('Double Hit'); assert.equal(foe.hp, 0);
 });
 it('does not spend survival on residual damage or steal a successful native Sash', () => {
  let foe = begin(['steadfast']); foe.hp = 4;
  battle.damage(5, foe, battle.p1.active[0], battle.dex.conditions.get('psn'));
  assert.equal(foe.hp, 0); assert(!collapseState(foe).steadfastUsed);
  foe = begin(['steadfast'], {foe: {item: 'Focus Sash'}});
  use('Seismic Toss', false, {damage: 10000});
  assert.equal(foe.hp, 1); assert(!collapseState(foe).steadfastUsed);
  use('Seismic Toss'); assert.equal(foe.hp, 1); assert(collapseState(foe).steadfastUsed);
 });
 it('merges indirect resistance and five-turn cleansing, but keeps v4 cleansing unchanged', () => {
  let foe = begin(['cleanse']);
  assert.equal(battle.damage(100, foe, battle.p1.active[0], battle.dex.conditions.get('psn')), 50);
  assert.equal(battle.damage(20, foe, foe, battle.dex.conditions.get('recoil')), 20);
  assert.equal(use('Seismic Toss'), 50);
  assert(use('Salt Cure') > 0); use('Leech Seed'); use('Thunder Wave'); use('Growl');
  assert(foe.volatiles.saltcure && foe.volatiles.leechseed); assert.equal(foe.status, 'par');
  for (let i=0; i<4; i++) { foe.hp=foe.maxhp; battle.makeChoices('move 1','move 1'); }
  assert(foe.volatiles.saltcure); foe.hp=foe.maxhp; battle.makeChoices('move 1','move 1');
  assert(!foe.volatiles.saltcure && !foe.volatiles.leechseed); assert.equal(foe.status, ''); assert.equal(foe.boosts.atk, 0);
  foe = begin(['cleanse'], {rules: {difficulty: {tier: 1, floor: 1, version: 4}}});
  assert.equal(battle.damage(100, foe, battle.p1.active[0], battle.dex.conditions.get('psn')), 100);
 });
 it('suppresses player entrance and extra abilities for exactly five turns, then starts them once', () => {
  const foe = begin(['abilitygas'], {player: {ability: 'Intimidate'}, extra: ['speedboost']});
  const p = battle.p1.active[0];
  assert.equal(foe.boosts.atk, 0); assert(!p.hasAbility('intimidate')); assert(!p.hasAbility('speedboost'));
  assert(battle.log.some(line => line.includes('气体压制还需 5 回合')));
  for(let i=0; i<4; i++) battle.makeChoices('move 1','move 1');
  assert(collapseGasActive(battle)); assert.equal(p.boosts.spe, 0);
  assert(battle.log.some(line => line.includes('气体压制还需 1 回合')));
  const saved = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(saved);
  battle.makeChoices('move 1','move 1'); assert.equal(battle.turn, 6);
  assert(!collapseGasActive(battle)); assert(battle.p1.active[0].hasAbility('intimidate'));
  assert.equal(battle.p2.active[0].boosts.atk, -1);
  battle.makeChoices('move 1','move 1'); assert.equal(battle.p1.active[0].boosts.spe, 1);
  assert.equal(battle.p2.active[0].boosts.atk, -1);
  battle.makeChoices('switch 2','move 1'); assert(battle.p1.active[0].hasAbility('synchronize'));
 });
 it('leaves enemy abilities, Ability Shield and unsuppressible abilities intact, independently of extras', () => {
  let foe = begin(['abilitygas'], {player: {ability: 'Intimidate', item: 'Ability Shield'}, foe: {ability: 'Intimidate'}});
  assert.equal(foe.boosts.atk, -1); assert.equal(battle.p1.active[0].boosts.atk, -1);
  begin(['abilitygas'], {player: {ability: 'Multitype'}, extra: ['speedboost']});
  assert(battle.p1.active[0].hasAbility('multitype')); assert(!battle.p1.active[0].hasAbility('speedboost'));
 });
 it('echo guard reduces enemy direct ordinary/fixed damage, never residual, confusion or recoil', () => {
  begin(); const base = use('Water Gun', true);
  begin([], {rules: {echo: {...emptyEchoUpgrades(), guard: true}}});
  assert.equal(use('Water Gun', true), battle.modify(base, .9));
  assert.equal(use('Seismic Toss', true), 45);
  const p = battle.p1.active[0]; p.hp = p.maxhp;
  assert.equal(battle.damage(10, p, battle.p2.active[0], battle.dex.conditions.get('psn')), 10);
  assert.equal(battle.damage(10, p, p, battle.dex.conditions.get('recoil')), 10);
  const self = Object.assign(battle.dex.getActiveMove('confused'), {basePower: 40, willCrit: false});
  const guarded = battle.actions.getDamage(p,p,self);
  battle.fantasyRogue.echo.guard=false; assert.equal(battle.actions.getDamage(p,p,self), guarded);
 });
 it('echo buffs only purchased types and never buffs the enemy', () => {
  begin(); const water=use('Water Gun'), fire=use('Ember'), enemy=use('Water Gun',true);
  begin([], {rules: {echo: {...emptyEchoUpgrades(), types: ['Water']}}});
  assert(use('Water Gun') > water); assert.equal(use('Ember'),fire); assert.equal(use('Water Gun',true),enemy);
  const p = battle.p1.active[0];
  assert(roguePowerModifiers(p, battle.dex.moves.get('watergun'), true).some(m => m.source === '崩坏回响' && m.factor === 1.1));
  assert(!roguePowerModifiers(p, battle.dex.moves.get('ember'), true).some(m => m.source === '崩坏回响'));
  battle.fantasyRogue.echo.guard = true;
  assert(rogueAbilityInfo(p).statSources.some(text => text.includes('敌方招式的直接伤害 ×0.9')));
 });
 it('uses the displayed capture multiplier and strips collapse stats from captured partners', () => {
  const baseHP=begin().maxhp;
  const foe=begin(['statbloat','vitality'], {rules: {echo:{...emptyEchoUpgrades(),catch:5},
   bag:{pokeball:1},balls:[{id:'pokeball',name:'精灵球',chance:.4}]}});
  const ball=battle.fantasyRogue.balls[0];
  assert(Math.abs(rogueCaptureChance(battle,ball)-.6)<1e-9);
  let used=false;battle.randomChance=(n,d)=>{used=true;assert.equal(n,600000);assert.equal(d,1000000);return true;};
  throwRogueBall(battle,'pokeball');assert(used);
  const mon=battle.fantasyRogue.captured;
  assert.equal(mon.maxhp,baseHP);assert(mon.hp<=mon.maxhp);assert(!mon.set.fantasyRogueStats);
  assert(!mon.m?.rogueCollapse);assert(foe.maxhp>mon.maxhp);
 });
});
