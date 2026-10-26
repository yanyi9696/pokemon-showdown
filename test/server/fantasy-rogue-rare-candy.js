'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {stats,set,commandAfterOpening} = require('../fixtures/fantasy-rogue');
const {RogueEngine,createRoguePokemon} = require('../../dist/server/fantasy-rogue/engine');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {experienceAtLevel,rogueSpeciesData} = require('../../dist/sim/fantasy-rogue-rules');
const {initializeExperience} = require('../../dist/server/fantasy-rogue/progression');
const {normalizeBlessings} = require('../../dist/server/fantasy-rogue/blessings');
const {beginJourneyActivity,settleJourneyActivity} = require('../../dist/server/fantasy-rogue/journey-activities');
const {chooseEventOption} = require('../../dist/server/fantasy-rogue/events');

describe('Fantasy Rogue rare candy is a limited event reward, separate from experience candy',function(){
 this.timeout(30000);
 const content=createPreviewContent();
 let store,engine;
 const user='candytester',account=()=>store.get(user);
 const cmd=(action,details={})=>commandAfterOpening(engine,user,{id:randomUUID(),revision:account().revision,action,...details});
 beforeEach(()=>{store=new RogueStore(':memory:');engine=new RogueEngine(store,content,max=>Math.min(1,max-1));});
 afterEach(()=>store.close());
 function setup(level=15){
  cmd('start',{starters:['bulbasaur']});cmd('select',{value:'wild0'});
  store.change(user,a=>{
   a.run.team=[createRoguePokemon(set('Bulbasaur','Overgrow',level,['Tackle']),stats(0))];
   initializeExperience(a.run.team[0]);a.run.bag.rarecandy=3;
  });return account().run.team[0].id;
 }
 it('levels exactly once from partial experience, preserves wounds and offers normal evolution',()=>{
  const id=setup();store.change(user,a=>{a.run.team[0].experience+=17;a.run.team[0].hp-=4;});
  cmd('use',{value:'rarecandy',member:id});const r=account().run,m=r.team[0];
  assert.equal(m.set.level,16);assert.equal(m.set.species,'Bulbasaur');assert(m.evolutionNotice);
  assert.equal(m.experience,experienceAtLevel(rogueSpeciesData('Bulbasaur').growth,16));
  assert.equal(m.maxhp-m.hp,4);assert.equal(r.bag.rarecandy,2);
 });
 it('offers newly learned moves and deduplicates an identical command',()=>{
  const id=setup(8);store.change(user,a=>{a.run.team[0].set.moves=['Tackle','Growl','Protect','Rest'];});
  const request={id:randomUUID(),revision:account().revision,action:'use',value:'rarecandy',member:id};
  engine.command(user,request);engine.command(user,request);
  assert.equal(account().run.team[0].set.level,9);assert.equal(account().run.bag.rarecandy,2);
  assert(account().run.pendingMoves?.length,'level-nine move must be offered');
 });
 it('caps at the actual level limit and rejects fixed, fainted, egg and bulk targets without consumption',()=>{
  const id=setup(99);cmd('use',{value:'rarecandy',member:id});assert.equal(account().run.team[0].set.level,100);
  assert.throws(()=>cmd('use',{value:'rarecandy',member:id}));assert.equal(account().run.bag.rarecandy,2);
  for(const change of [{fixedLevel:true},{hp:0},{egg:{cycles:1}},{bulk:true}]){
   store.change(user,a=>{a.run.pendingMoves=[];const m=createRoguePokemon(set('Bulbasaur','Overgrow',20),stats(0));m.id=id;Object.assign(m,change);a.run.team=[m];});
   assert.throws(()=>cmd('use',{value:'rarecandy',member:id,count:change.bulk?2:1}));assert.equal(account().run.bag.rarecandy,2);
  }
 });
 it('respects an existing uncapped-level blessing without granting more than one level',()=>{
  const id=setup(100);store.change(user,a=>{a.run.team[0].uncappedLevel=true;});
  cmd('use',{value:'rarecandy',member:id});assert.equal(account().run.team[0].set.level,101);
 });
 function eventRun(id){
  const r={id:randomUUID(),floor:40,phase:'event',team:[createRoguePokemon(set('Mew','Synchronize',30,['Ember','Water Gun','Gust']),stats(0))],
   boosts:stats(0),money:0,bag:{},encounter:0,node:{id,kind:'event',encounters:[],reward:{money:0,items:{}},event:{id,key:randomUUID(),stage:'choice'}}};
  normalizeBlessings(r);beginJourneyActivity(r,()=>0);return r;
 }
 function puzzle(r,perfect=true){
  for(const type of ['Fire','Water','Flying']) chooseEventOption({run:r},r,content,()=>0,r.node.event.key,perfect?'type:'+type:'help');
 }
 it('replaces one PP supply only on the first perfect puzzle, with no repeated reward',()=>{
  const r=eventRun('relicpuzzle');puzzle(r);assert.equal(r.bag.rarecandy,1);assert(!r.bag.ether);
  assert.throws(()=>chooseEventOption({run:r},r,content,()=>0,r.node.event.key,'type:Flying'));
  r.node=eventRun('relicpuzzle').node;puzzle(r);assert.equal(r.bag.rarecandy,1);assert.equal(r.bag.ether,1);
  const failed=eventRun('relicpuzzle');puzzle(failed,false);assert(!failed.bag.rarecandy);assert.equal(failed.bag.ether,1);
 });
 it('awards escort candy only after victory with the ally alive, once per run',()=>{
  const r=eventRun('lostescort');r.node.encounters=[{team:[]}];r.node.event.activity.allySurvived=true;
  settleJourneyActivity({run:r},r,content,()=>0,true,false);assert.equal(r.bag.rarecandy,1);
  r.node=eventRun('lostescort').node;r.node.encounters=[{team:[]}];r.node.event.activity.allySurvived=true;
  settleJourneyActivity({run:r},r,content,()=>0,true,false);assert.equal(r.bag.rarecandy,1);assert.equal(r.bag.ether,1);
  for(const [won,alive] of [[false,true],[true,false]]){
   const f=eventRun('lostescort');f.node.encounters=[{team:[]}];f.node.event.activity.allySurvived=alive;
   settleJourneyActivity({run:f},f,content,()=>0,won,false);assert(!f.bag.rarecandy);
  }
 });
 it('never enters ordinary candy, shop or configured route reward pools',()=>{
  const candy=content.items.find(i=>i.id==='rarecandy');assert.equal(candy.kind,'rarecandy');assert.equal(candy.shopFloor,false);
  assert(content.items.filter(i=>i.kind==='candy').every(i=>i.id.startsWith('expcandy')));
  for(const routes of Object.values(content.floors))for(const node of routes)assert(!node.reward?.items?.rarecandy);
  assert(!content.initialBag.rarecandy);
 });
});
