'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {stats, set} = require('../fixtures/fantasy-rogue');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const b = require('../../dist/server/fantasy-rogue/blessings');
const tera = require('../../dist/server/fantasy-rogue/tera-shards');
const master = require('../../dist/server/fantasy-rogue/master-ball');
const affection = require('../../dist/server/fantasy-rogue/affection');
const {TRAVELLERS} = require('../../dist/server/fantasy-rogue/traveller-profiles');
const {AFFECTION_LINES} = require('../../dist/server/fantasy-rogue/affection-dialogue');
const {grantCompanion} = require('../../dist/server/fantasy-rogue/companions');
const {Battle} = require('../../dist/sim/battle');
const {rogueCaptureChance, throwRogueBall} = require('../../dist/sim/fantasy-rogue');
const {BEGINNER_GUIDE} = require('../../dist/server/fantasy-rogue/beginner-guide');
function run(floor = 1) {
 const r = {id:randomUUID(), contentVersion:'test', floor, phase:'choose', encounter:0, attempt:0, team:[createRoguePokemon(set(),stats(0))],
  boosts:stats(0), money:0, bag:{}, caught:[], startingSlots:1, difficulty:0, difficultyRulesVersion:4};
 r.checkpoint = {team:structuredClone(r.team), money:0,bag:{}}; b.normalizeBlessings(r); return r;
}
describe('Fantasy Rogue journey history, relationships and special supplies', function () {
 this.timeout(20000);
 it('archives abandonment, all observed blessings and departed battle members once, privately', () => {
  const store = new RogueStore(':memory:');
  try {
   store.change('alice', a => { a.run=run(8); a.run.phase='battle'; a.run.blessings.owned=[{id:'bignumber',family:'bignumber',floor:1}]; });
   const id=store.get('alice').run.id;
   store.change('alice', a => { a.run.phase='choose'; a.run.floor=10; a.run.blessings.owned=[]; a.run.team=[createRoguePokemon(set('Squirtle'),stats(0))]; });
   store.change('alice', a => { delete a.run; });
   const h=store.history('alice'); assert.equal(h.total,1); assert.equal(h.records[0].id,id);
   assert.equal(h.records[0].floor,10); assert.equal(h.records[0].outcome,'abandoned');
   assert.equal(h.records[0].snapshot.blessings[0].id,'bignumber'); assert.equal(h.records[0].snapshot.box.length,1);
   assert.equal(h.records[0].snapshot.blessings[0].tier,'gold');
   assert.equal(store.history('bob').total,0);
   store.change('alice', () => {}); assert.equal(store.history('alice').total,1);
  } finally {store.close();}
 });
 it('fills missing historical quality metadata without rewriting old names, effects or stored records', () => {
  const {journeyDisplay}=require('../../dist/server/fantasy-rogue/history');
  const record={snapshot:{blessings:[
   {id:'latebloom',name:'旧名字',text:'原来的效果',floor:1},
   {id:'hero',name:'曾经的黄金英雄',tier:'gold',floor:1},
   {id:'unknown-old',name:'未知旧祝福',floor:1},
  ]}};
  const before=JSON.stringify(record), visible=journeyDisplay(record);
  assert.equal(visible.snapshot.blessings[0].tier,'prismatic');
  assert.equal(visible.snapshot.blessings[0].name,'旧名字');
  assert.equal(visible.snapshot.blessings[0].text,'原来的效果');
  assert.equal(visible.snapshot.blessings[1].tier,'gold');
  assert.equal(visible.snapshot.blessings[2].tier,undefined);
  assert.equal(JSON.stringify(record),before);
 });
 it('preserves terminal snapshots even when cards are deleted and paginates without a retention cap', () => {
  const store=new RogueStore(':memory:');
  try {
   for(let i=0;i<14;i++) store.change('user', a=> {a.run=run(10+i);a.run.phase=i%2?'complete':'defeated';});
   assert.equal(store.history('user').total,14); assert.equal(store.history('user').records.length,12);
   assert.equal(store.history('user',12).records.length,2);
   const before=JSON.stringify(store.history('user'));
   store.change('user', a=>{a.cards=[];a.run.team[0].set.level=99;});
   assert.equal(JSON.stringify(store.history('user')),before);
  } finally {store.close();}
 });
 it('imports legacy typed shards once and combines future rewards in the visible bag', () => {
  const r=run();r.blessings.teraShards={Fire:35};r.blessingCheckpoint=structuredClone(r.blessings);
  tera.migrateTeraShards(r);tera.migrateTeraShards(r);tera.giveTeraShards(r,'Fire',15);
  assert.equal(r.bag.terashardfire,50);assert.equal(r.checkpoint.bag.terashardfire,35);assert(!r.blessings.teraShards);
  const a={run:r};r.phase='choose';r.team[0].set.teraType='Water';
  b.handleBlessingCommand(a,r,{items:[]},{action:'settera',member:r.team[0].id,value:'Fire'},()=>0);
  assert.equal(r.bag.terashardfire,0);assert.equal(r.team[0].set.teraType,'Fire');assert(!r.teraUnlocked);
  assert.throws(()=>b.handleBlessingCommand(a,r,{items:[]},{action:'settera',member:r.team[0].id,value:'Fire'},()=>0));
 });
 it('rejects invalid shard spending without losing materials', () => {
  const r=run();tera.giveTeraShards(r,'Water',50);const a={run:r};r.phase='battle';
  assert.throws(()=>b.handleBlessingCommand(a,r,{items:[]},{action:'settera',member:r.team[0].id,value:'Water'},()=>0));
  assert.equal(r.bag.terashardwater,50);assert.throws(()=>tera.giveTeraShards(r,'fake',50));
 });
 it('keeps migrated shards when returning from a legacy postgame inventory', () => {
  const r=run(200);r.blessings.teraShards={Water:50};r.postgame={before:{bag:{potion:3}}};
  tera.migrateTeraShards(r);tera.migrateTeraShards(r);
  assert.equal(r.bag.terashardwater,50);assert.equal(r.postgame.before.bag.terashardwater,50);
 });
 it('uses the same rare Master Ball chance at all floors and difficulties, preserving existing routes', () => {
  for(const floor of [1,70,160,199]) for(const difficulty of ['easy',0,1,2,3,4,5]) {
   const r=run(floor);r.difficulty=difficulty;r.choices=[{id:'rival',kind:'adventure'}];
   master.addMasterBallRoute(r,max=>{assert.equal(max,10000);return 5;});assert(!r.masterBallQuest);
   master.addMasterBallRoute(r,()=>4);assert.equal(r.choices.length,2);assert.equal(r.choices[0].id,'rival');
   master.addMasterBallRoute(r,()=>0);assert.equal(r.choices.length,2);
  }
 });
 it('grants one Master Ball through the two areas, never restores spent balls or carries stock to another run', () => {
  const store=new RogueStore(':memory:');
  try {
   store.change('u', a=> {a.run=run(161);a.run.choices=[{id:'wild',kind:'wild'}];master.addMasterBallRoute(a.run,()=>0);});
   store.change('u', a=> {
    const r=a.run;assert(master.selectMasterBallRoute(r,'masterballgift'));
    for(const option of master.masterBallEventView(r).options) assert.equal(typeof option.text,'string');
    master.chooseMasterBall(a,r,{member:master.masterBallEventView(r).key,value:'promise'});
    assert(!r.bag.masterball);assert.equal(r.choices.length,2);
    assert(master.selectMasterBallRoute(r,'masterballreward'));
    for(const option of master.masterBallEventView(r).options) assert.equal(typeof option.text,'string');
    master.chooseMasterBall(a,r,{member:master.masterBallEventView(r).key,value:'claim'});
   });
   assert.equal(store.get('u').run.masterBallLedger.remaining,1);assert.equal(store.get('u').run.bag.masterball,1);
   store.change('u',a=>{a.run.bag.masterball--;});assert.equal(store.get('u').masterBalls.used,1);
   store.change('u',a=>{a.run.bag.masterball=1;});assert(!store.get('u').run.bag.masterball);
   assert.equal(store.get('u').masterBalls.obtained.length,1);
   store.change('u',a=>{delete a.run;});store.change('u',a=>{a.run=run();});
   assert(!store.get('u').run.bag.masterball);
   store.change('u',a=>{a.run.masterBallLedger={remaining:1,used:0};a.run.bag.masterball=1;});
   store.change('u',a=>{delete a.run;});store.change('u',a=>{a.run=run();});
   assert(!store.get('u').run.bag.masterball); // Unused stock does not carry either.
  } finally {store.close();}
 });
 it('guarantees a full-health rare wild capture, but not a trainer capture', () => {
  const r=run(); const ball={id:'masterball',name:'大师球',multiplier:1};
  const battle=new Battle({formatid:'gen9fantasyrogue',seed:[1,2,3,4], fantasyRogue:{encounterId:'master',team:r.team,boosts:stats(0),bag:{masterball:1},balls:[ball],catchable:true,wild:true},
   p1:{name:'Player',team:r.team.map(m=>m.set)},p2:{name:'Wild',team:[set('Mewtwo','Pressure',80)]}});
  try {battle.makeChoices('team 1','team 1');assert.equal(rogueCaptureChance(battle,ball),1);
   battle.fantasyRogue.npcCapture=true;assert.equal(rogueCaptureChance(battle,ball),null);throwRogueBall(battle,'masterball');assert.equal(battle.fantasyRogue.bag.masterball,1);
   battle.fantasyRogue.npcCapture=false;throwRogueBall(battle,'masterball');assert.equal(battle.fantasyRogue.bag.masterball,0);assert(battle.fantasyRogue.captured || battle.fantasyRogue.captures?.length);
  } finally {battle.destroy();}
 });
 it('pays each 50/100 milestone once per run and resets affection for each new adventure', () => {
  const store=new RogueStore(':memory:');
  try {
   store.change('u',a=>{a.run=run();});
   store.change('u',a=>{affection.gainAffection(a.run,'bea',50,'first');});
   let a=store.get('u');assert.equal(a.run.trainerBonds.bea.score,50);assert.equal(a.run.bag.blackbelt,1);assert.equal(affection.affectionScene(a.run).stage,50);
   store.change('u',a=>{affection.affectionCommand(a.run,{member:'bea',value:'thanks'});});
   store.change('u',a=>{affection.gainAffection(a.run,'bea',50,'second');});
   a=store.get('u');assert.deepEqual(a.run.trainerBonds.bea.gifts,[50,100]);assert.equal(a.run.bag.blackbelt,1);assert.equal(a.run.bag.choiceband,1);assert.equal(a.run.bag.goldbottlecap,1);assert.equal(a.run.bag.rarecandy,2);assert.equal(a.run.blessings.shards,0);
   store.change('u',a=>{affection.gainAffection(a.run,'bea',50,'third');});assert.equal(store.get('u').run.bag.goldbottlecap,1);
   store.change('u',a=>{delete a.run;});store.change('u',a=>{a.run=run();});
   assert(!store.get('u').run.trainerBonds.bea);
   store.change('u',a=>{affection.gainAffection(a.run,'bea',50,'first');});
   assert.equal(store.get('u').run.bag.blackbelt,1);assert.equal(store.get('u').run.trainerBonds.bea.score,50);
  } finally {store.close();}
 });
 it('deduplicates floor affection and random gifts, pauses departed companions, preserves young friendship', () => {
  const r=run(101);grantCompanion(r,'poppy');affection.affectionFloor(r,()=>0);affection.affectionFloor(r,()=>0);
  assert.equal(r.trainerBonds.poppy.score,1);assert.equal(r.bag.expcandyxs,1);
  r.blessings.companions[0].away=true;r.floor++;affection.affectionFloor(r,()=>0);assert.equal(r.trainerBonds.poppy.score,1);
  for(const id of Object.keys(TRAVELLERS)) assert(AFFECTION_LINES[id],id);
  affection.gainAffection(r,'poppy',100,'friendship');assert(affection.affectionScene(r).options.every(o=>o.id==='thanks'));
 });
 it('keeps fifty close to fifteen preferred choices and rewards longer company without high-floor acceleration', () => {
  for(const start of [1,101,161]) {
   const r=run(start);grantCompanion(r,'bea');
   for(let i=0;i<20;i++) {
    r.floor=start+i;affection.affectionFloor(r,()=>99);
    if(i<15) affection.gainAffection(r,'bea',affection.AFFECTION_RULES.preference,'preference:'+i);
   }
   assert.equal(r.trainerBonds.bea.score,50);assert.equal(r.bag.blackbelt,1);
   for(let i=20;i<70;i++){r.floor=start+i;affection.affectionFloor(r,()=>99);}
   assert.equal(r.trainerBonds.bea.score,100);assert.deepEqual(r.trainerBonds.bea.gifts,[50,100]);
  }
 });
 it('unlocks character-specific daily lines at fifty and one hundred without chat farming', () => {
  const {AFFECTION_CHAT_LINES}=require('../../dist/server/fantasy-rogue/affection-dialogue');
  const r=run();for(const id of Object.keys(AFFECTION_LINES)) {
   assert.equal(AFFECTION_CHAT_LINES[id]?.length,2,id);
   assert.equal(affection.affectionChat(r,id,'original'),'original');
   affection.gainAffection(r,id,50,'stage1');assert.equal(affection.affectionChat(r,id,'original'),AFFECTION_CHAT_LINES[id][0]);
   assert.equal(affection.affectionChat(r,id,'original'),'original');
   affection.gainAffection(r,id,50,'stage2');r.trainerBonds[id].chats=0;
   assert.equal(affection.affectionChat(r,id,'original'),AFFECTION_CHAT_LINES[id][1]);
   for(let i=0;i<20;i++)affection.affectionChat(r,id,'original');assert.equal(r.trainerBonds[id].score,100);
  }
 });
 it('allows declining an adult confession without losing rewards', () => {
  const r=run();affection.gainAffection(r,'nessa',100,'test');
  affection.affectionCommand(r,{member:'nessa',value:'thanks'});const before=JSON.stringify(r.bag);
  affection.affectionCommand(r,{member:'nessa',value:'friends'});assert.equal(JSON.stringify(r.bag),before);assert.equal(r.trainerBonds.nessa.responses[100],'friends');
 });
 it('does not add an affection gate to story invitations and migrates old gift progress within this run', () => {
  const t=require('../../dist/server/fantasy-rogue/travellers'),r=run();
  t.requestCompanion(r,{id:'brock',origin:'event'});
  assert.equal(t.travellingRoster(r)[0].id,'brock');
  const old=run();old.socialCompanions=[{id:'viola',origin:'event',preferences:4,counted:[]}];
  const account={run:old};affection.syncAffection(account);
  assert.equal(old.trainerBonds.viola.score,13);assert(!account.trainerBonds);
 });
 it('orders the tower and routes before advanced difficulty and has one copy of every section', () => {
  assert.equal(BEGINNER_GUIDE[0].title,'幻想杯与这座塔');
  assert(BEGINNER_GUIDE.findIndex(s=>s.title.startsWith('战斗区域'))<BEGINNER_GUIDE.findIndex(s=>s.title.startsWith('幻想崩坏')));
  assert.equal(new Set(BEGINNER_GUIDE.map(s=>s.title)).size,BEGINNER_GUIDE.length);
 });
});
