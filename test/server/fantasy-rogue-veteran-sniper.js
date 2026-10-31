'use strict';
const assert = require('assert').strict;
const {Battle} = require('../../dist/sim/battle');
const {Dex} = require('../../dist/sim/dex');
const {rogueBattleResult} = require('../../dist/sim/fantasy-rogue');
const {blessing, blessingLevelCost} = require('../../dist/sim/rogue-blessing-data');
const {strongestSniperMember, assignedExtraAbilities} = require('../../dist/sim/rogue-blessing-permanent');
const {veteranSniper, sniperTrainingProgress} = require('../../dist/sim/rogue-sniper');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const b = require('../../dist/server/fantasy-rogue/blessings');
const {rollEncounterIVs} = require('../../dist/sim/rogue-quality');
const {moveCategoryHelp, bracketMoveCategories} = require('../../dist/server/fantasy-rogue/move-categories');
const {gainAffection} = require('../../dist/server/fantasy-rogue/affection');
const {affectionThemeGift, AFFECTION_FANTASY_CHOICES} = require('../../dist/server/fantasy-rogue/affection-gifts');
const {TRAVELLERS} = require('../../dist/server/fantasy-rogue/traveller-profiles');
const {COMPANIONS} = require('../../dist/sim/rogue-companions');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
const {randomUUID} = require('crypto');
const {stats, set, content} = require('../fixtures/fantasy-rogue');
const rng = seed => max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };

describe('Fantasy Rogue veteran sniper and reward refinements', function () {
 this.timeout(30000);
 let battle;
 afterEach(() => {battle?.destroy(); battle = null;});
 function party(sets = [set('Inteleon', 'Sniper', 70, ['Snipe Shot', 'Gunk Shot', 'Bullet Seed', 'Surf'])]) {
  const run = {id:'sniper-run', floor:50, phase:'ready', difficulty:0, difficultyRulesVersion:4,
   boosts:stats(0), money:0, bag:{}, team:sets.map((s,i)=>({...createRoguePokemon(s,stats(0)),joinOrder:i+1}))};
  b.normalizeBlessings(run);run.blessings.owned=[{...blessing('veteransniper'),floor:1}];b.syncBlessingParty(run);return run;
 }
 function start(run, foes = [set('Blissey','Natural Cure',100,['Splash'])], id = 'sniper-battle') {
  battle = new Battle({formatid:'gen9fantasyrogue',seed:[1,2,3,4],fantasyRogue:{encounterId:id,team:structuredClone(run.team),
   boosts:stats(0),bag:{},balls:[],catchable:false,blessings:structuredClone(run.blessings)},
   p1:{team:run.team.map(m=>m.set)},p2:{team:foes}});
  battle.makeChoices('team 1','team '+foes.map((_,i)=>i+1).join('')); battle.randomizer=n=>n;
  return battle.p1.active[0];
 }
 function defense(stat, moveID, value=400) {
  const source=battle.p1.active[0],target=battle.p2.active[0],move=battle.dex.getActiveMove(moveID);
  battle.setActiveMove(move,source,target);
  const result=battle.runEvent(stat,target,source,move,value);battle.clearActiveMove();return result;
 }
 it('makes Hero prismatic, and grants the targeted Sniper plus exactly one Fantasy Scope Lens', () => {
  assert.equal(blessing('hero').tier,'prismatic');assert.equal(blessingLevelCost(blessing('hero').tier,1,true),10);
  const run=party([set('Inteleon','Torrent',70)]),a={run};run.blessings.owned=[];
  run.phase='blessing';run.blessings.round={floor:50,tier:'gold',remaining:1,
   options:[{id:'veteransniper',refreshes:1}],familiesSeen:['veteransniper']};
  b.handleBlessingCommand(a,run,content(),{action:'blessing',slot:0},rng(2));
  assert.equal(run.bag.fantasyscopelens,1);const reward=run.blessings.pending[0];
  b.handleBlessingCommand(a,run,content(),{action:'blessingreward',member:reward.id,value:run.team[0].id},rng(2));
  assert(assignedExtraAbilities(run.team[0],run.team,run.blessings).includes('sniper'));
  assert.equal(run.team[0].set.ability,'Torrent');assert(start(run).hasAbility('sniper'));
 });
 it('uses the strongest real Sniper holder; another partner cannot inherit its training', () => {
  const run=party([set('Inteleon','Sniper',30),set('Inteleon','Sniper',70)]);
  run.team[0].sniperKOs=15;assert.equal(strongestSniperMember(run.team,run.blessings).id,run.team[1].id);
  const mon=start(run);assert(!veteranSniper(mon));assert.equal(defense('ModifySpD','snipeshot'),400);
 });
 for (const [stat,move,ruin] of [['ModifyDef','gunkshot','swordofruin'],['ModifySpD','snipeshot','beadsofruin']]) {
  it(`multiplies 20% defense ignore with ${ruin}, only after 15 KOs and only on shooting moves`, () => {
   const run=party();run.team[0].sniperKOs=14;run.team[0].extraAbilities=[ruin];start(run);
   assert.equal(defense(stat,move),300);
   battle.fantasyRogue.team[0].sniperKOs=15;
   assert.equal(defense(stat,move),240);assert.equal(defense(stat,'surf'),300);
   const snapshot=battle.toJSON();battle.destroy();battle=Battle.fromJSON(snapshot);
   assert.equal(defense(stat,move),240);
  });
 }
 it('counts a real critical shooting KO once and unlocks the next shot during the same battle', () => {
  const run=party();run.team[0].sniperKOs=14;const mon=start(run,[set('Magikarp','Swift Swim',1,['Splash']),set('Blissey','Natural Cure',100,['Splash'])]);
  mon.addVolatile('laserfocus');battle.makeChoices('move snipeshot','move splash');
  assert.equal(battle.fantasyRogue.blessingProgress.kos.length,1);
  assert(battle.fantasyRogue.blessingProgress.kos[0].sniper);assert.equal(sniperTrainingProgress(mon),15);
  battle.makeChoices('', 'switch 2');assert.equal(defense('ModifySpD','snipeshot'),320);
  const result=rogueBattleResult(battle);result.won=true;
  b.settleBlessingBattle({run},run,content(),result,()=>0);assert.equal(run.team[0].sniperKOs,15);
  b.settleBlessingBattle({run},run,content(),result,()=>0);assert.equal(run.team[0].sniperKOs,15);
 });
 for (const [move,critical,counts] of [['snipeshot',false,false],['surf',true,false],['bulletseed',true,true]]) {
  it(`counts ${move} critical=${critical} by defeated opponent, not by hit`, () => {
   const run=party();const mon=start(run,[set('Magikarp','Swift Swim',1,['Splash'])]);
   if(critical) mon.addVolatile('laserfocus');else battle.p2.active[0].setAbility('Battle Armor');
   battle.makeChoices('move '+move,'move splash');
   assert.equal(battle.fantasyRogue.blessingProgress.kos.filter(k=>k.sniper).length,counts?1:0);
  });
 }
 it('does not commit shooting training on escape, and retains it across saved runs', () => {
  const run=party();run.team[0].sniperKOs=4;const result={encounterId:'retry',won:false,
   blessingProgress:{kos:[{id:'foe',member:run.team[0].id,sniper:true}],swords:0,insight:{}}};
  b.settleBlessingBattle({run},run,content(),result,()=>0,true);assert.equal(run.team[0].sniperKOs,4);
  b.settleBlessingBattle({run},run,content(),{...result,won:true},()=>0);assert.equal(run.team[0].sniperKOs,5);
  const saved=JSON.parse(JSON.stringify(run));assert.equal(b.blessingView(saved).sniperTraining.progress,5);
 });
 it('rolls blessing IVs from each tier elite distribution while ordinary event gifts stay ordinary', () => {
  for(const tier of ['easy',0,1,2,3,4,5]) {
   const run=party();run.difficulty=tier;
   for(const elite of [true,false]) {
    const mon=b.drawBlessingGift(run,content(),rng(17),{species:'Bulbasaur',eliteIVs:elite});
    assert.deepEqual(mon.set.ivs,rollEncounterIVs(rng(17),tier,elite));
   }
  }
 });
 it('also gives the drill and both robe partners the current tier elite IV distribution', () => {
  const data=require('../../dist/server/fantasy-rogue/preview-content').createPreviewContent();
  for(const tier of ['easy',0,1,2,3,4,5]) for(const id of ['spiral','godrobe','puregodrobe']) {
   const run=party();run.difficulty=tier;run.phase='blessing';run.caught=[];run.blessings.owned=[];
			if (id === 'spiral') run.floor = 1;
			run.blessings.round = { floor: run.floor, tier: 'prismatic', remaining: 1, options: [{ id, refreshes: 1 }], familiesSeen: [id] };
   const account={run,captures:{},unlocked:[]};
   b.handleBlessingCommand(account,run,data,{action:'blessing',slot:0},rng(17));
   const mon=run.blessings.pending.find(reward=>reward.kind==='gift').pokemon;
   assert.deepEqual(mon.set.ivs,rollEncounterIVs(rng(17),tier,true),`${id} tier ${tier}`);
  }
 });
 it('includes effective custom and original move categories and brackets category aliases', () => {
  const help=moveCategoryHelp();assert(help.shooting.moves.includes('snipeshot'));assert(help.shooting.moves.includes('baoyulihua'));
  assert(help.slicing.moves.includes('sacredsword'));
  assert.equal(bracketMoveCategories('切割招式、【射击类招式】；免疫'), '【切斩类招式】、【射击类招式】；免疫');
  for(const category of Object.values(help)) assert.equal(new Set(category.moves).size,category.moves.length);
 });
 it('gives every trainer a different advanced theme gift and allows every Fantasy item exactly once', () => {
  for(const id of new Set([...Object.keys(TRAVELLERS),...Object.keys(COMPANIONS)])) {
   const low=affectionThemeGift(id,50),high=affectionThemeGift(id,100);
   assert.notEqual(low.id,high.id,id);assert(high.id==='maxelixir' || Dex.mod('gen9fantasy').items.get(high.id).exists,id);
  }
  for(const item of AFFECTION_FANTASY_CHOICES) {
   let run=party();gainAffection(run,'nessa',100,'full');run=JSON.parse(JSON.stringify(run));
   run.phase='blessing';const reward=run.blessings.pending[0];assert.deepEqual(reward.options,AFFECTION_FANTASY_CHOICES);
   assert.equal(run.bag.rarecandy,2);assert.equal(run.bag.goldbottlecap,1);assert.equal(run.bag.mysticwater,1);assert.equal(run.bag.lifeorb,1);
   assert(!run.bag.bottlecap && !run.bag.expcandyl && run.blessings.shards===0);
   assert.throws(()=>b.handleBlessingCommand({run},run,content(),{action:'blessingreward',member:reward.id,value:'masterball'},()=>0));
   b.handleBlessingCommand({run},run,content(),{action:'blessingreward',member:reward.id,value:item},()=>0);assert.equal(run.bag[item],1);
   assert.throws(()=>b.handleBlessingCommand({run},run,content(),{action:'blessingreward',member:reward.id,value:item},()=>0));
   gainAffection(run,'nessa',100,'again');assert.equal(run.bag.rarecandy,2);assert.equal(run.blessings.pending.length,0);
  }
 });
 for (const phase of ['choose','ready','rest','reward','event']) for (const blessings of [true,false]) {
  it(`resumes the same ${phase} screen after the saved companion dialogue and free item choice, blessings=${blessings}`, () => {
   const store=new RogueStore(':memory:');
   try {
    const data=content();data.blessings=blessings;const engine=new RogueEngine(store,data,()=>0);
    store.change('snipertest',a=>{const run=party();run.phase=phase;run.contentVersion=data.version;
     run.encounter=0;run.attempt=0;run.caught=[];run.checkpoint={team:structuredClone(run.team),bag:{},money:0};
     gainAffection(run,'nessa',100,'first');a.run=run;});
    const cmd=(action,extra={})=>engine.command('snipertest',{id:randomUUID(),revision:store.get('snipertest').revision,action,...extra});
    cmd('affection',{member:'nessa',value:'thanks'});
    let run=store.get('snipertest').run;assert.equal(run.phase,'blessing');assert.equal(run.blessingRewardResume,phase);
    cmd('affection',{member:'nessa',value:'friends'});
    run=store.get('snipertest').run;const reward=run.blessings.pending[0];
    cmd('blessingreward',{member:reward.id,value:'fantasyscopelens'});
    run=store.get('snipertest').run;assert.equal(run.phase,phase);assert.equal(run.floor,50);
    assert.equal(run.bag.fantasyscopelens,1);assert(!run.blessingRewardResume);assert.equal(run.blessings.pending.length,0);
   } finally {store.close();}
  });
 }
});
