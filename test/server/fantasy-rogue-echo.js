'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
const {storyView} = require('../../dist/server/fantasy-rogue/story');
const {echoView, rollEchoShiny, awardEcho, awardGodEcho} = require('../../dist/server/fantasy-rogue/echo');
const {emptyEchoUpgrades, ECHO_TYPES, ECHO_SYSTEMS} = require('../../dist/sim/rogue-echo');
const {COLLAPSE_ENTRIES} = require('../../dist/sim/rogue-collapse-data');
const {grantSystem, gymSystemGift, treasure} = require('../../dist/server/fantasy-rogue/blessings');
const {treasureBudget} = require('../../dist/sim/rogue-blessing-data');
const {content, commandAfterOpening, stats} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue echo: persistence, clear awards and duplicate system gifts', function () {
 this.timeout(30000);
 let store, engine, data;
 const user='echoqa', account=()=>store.get(user);
 const cmd=(action, extra={})=>commandAfterOpening(engine,user,{id:randomUUID(),revision:account().revision,action,...extra});
 const seed=(points=1000)=>store.change(user,a=>{a.echo={unlocked:true,points,earned:points,upgrades:emptyEchoUpgrades()};});
 const start=(difficulty=0)=>cmd('start',{starters:['bulbasaur'],difficulty});
 beforeEach(()=>{store=new RogueStore(':memory:');data=content();data.blessings=true;engine=new RogueEngine(store,data,()=>0,true);});
 afterEach(()=>store.close());
 it('awards another 2/4/6/8/10 only for legitimate god victories, once across reloads',()=>{
  for(let tier=1;tier<=5;tier++) {
   const a={}; const r={floor:200,difficulty:tier,collapse:COLLAPSE_ENTRIES.slice(0,tier*2).map(e=>e.id),postgame:{stage:'won'}};
   awardEcho(a,r); assert.equal(awardGodEcho(a,r),tier*2); assert.equal(a.echo.points,tier*4);
   assert.equal(awardGodEcho(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(r))),0);
   assert.equal(r.postgame.echoAwarded,tier*2);
  }
  for(const override of [{postgame:{stage:'lost'}},{postgame:{stage:'declined'}},{difficulty:0},
   {difficulty:'easy'},{difficultyTest:true},{floor:199},{collapse:[]}]) {
   const a={},r={floor:200,difficulty:1,collapse:COLLAPSE_ENTRIES.slice(0,2).map(e=>e.id),postgame:{stage:'won'},...override};
   assert.equal(awardGodEcho(a,r),0); assert(!a.echo);
  }
 });
 it('settles god echo and the existing twenty growth points in the same saved outcome',()=>{
  start(1); seed(0);
  store.change(user,a=>{
   const r=a.run;r.floor=200;r.difficultyTest=false;
   r.postgame={stage:'battle',before:structuredClone({team:r.team,bag:r.bag,money:r.money}),node:structuredClone(data.floors[20][0]),encounter:0};
   engine.finishGodChallenge(a,r,'won');
  });
  const points=account().points;
  assert.equal(account().echo.points,2); assert.equal(account().run.lastReward.points,20);
  engine=new RogueEngine(store,data,()=>0,true);engine.migrate(user);
  store.change(user,a=>engine.finishGodChallenge(a,a.run,'won'));
  assert.equal(account().points,points);assert.equal(account().echo.points,2);
 });
 it('is hidden before clearing and rejects spending; migrates old clear evidence without retroactive currency',()=>{
  assert(!echoView(account())); assert.throws(()=>cmd('echo',{value:'guard'}),/首次通关/);
  store.change(user,a=>{a.difficulties={highest:2,cleared:['0','1'],spirits:['0','1']};});
  engine.migrate(user);assert.equal(account().echo.points,0);assert(account().echo.unlocked);
 });
 it('awards first clear only after the elder scene; repeated settlement and reopening cannot duplicate points',()=>{
  start(1);
  store.change(user,a=>{const r=a.run;r.floor=200;r.difficultyTest=false;r.phase='ready';
   r.node=structuredClone(data.floors[20][0]);r.encounter=r.node.encounters.length;engine.finishAdventure(a,r);});
  assert.equal(account().run.story.stage,'interlude');assert(!account().echo);
  engine=new RogueEngine(store,data,()=>0,true);engine.migrate(user);
  const pages=[];
  while(account().run.story?.stage==='interlude') {
   const view=storyView(account(),false,true);pages.push(view.text);
   cmd('storynext',{value:view.key});
  }
  assert(pages.some(p=>p.includes('谢谢你')));assert.equal(account().echo.points,2);
  assert(account().echo.introSeen);assert.equal(account().run.phase,'complete');
  store.change(user,a=>{awardEcho(a,a.run);engine.finishAdventure(a,a.run);});
  assert.equal(account().echo.points,2);assert.equal(account().run.echoAwarded,2);
 });
 it('awards 2/4/6/8/10 per legitimate clear and excludes practice and incomplete runs',()=>{
  for(let tier=1;tier<=5;tier++) {
   const a={}; const r={floor:200,difficulty:tier,collapse:COLLAPSE_ENTRIES.slice(0,tier*2).map(e=>e.id)};
   assert.equal(awardEcho(a,r),tier*2);assert.equal(awardEcho(a,r),0);assert.equal(a.echo.points,tier*2);
  }
  for(const r of [{floor:199,difficulty:1,collapse:['power','vitality']}, {floor:200,difficulty:0,collapse:[]},
   {floor:200,difficulty:'easy',collapse:[]}, {floor:200,difficulty:1,difficultyTest:true,collapse:['power','vitality']}]) {
   const a={};assert.equal(awardEcho(a,r),0);assert(!a.echo);
  }
 });
 it('charges exact costs, enforces maxima and snapshots purchases only into new runs without free items',()=>{
  seed();
  for(const type of Object.keys(ECHO_TYPES))cmd('echo',{value:'type/'+type});
  cmd('echo',{value:'guard'});
  for(let i=0;i<5;i++){cmd('echo',{value:'shiny'});cmd('echo',{value:'catch'});}
  for(const system of Object.keys(ECHO_SYSTEMS))cmd('echo',{value:'system/'+system});
  assert.equal(account().echo.points,510);
  for(const value of ['type/Fire','guard','shiny','catch','system/mega','type/Water/extra','system/no','__proto__']) {
   assert.throws(()=>cmd('echo',{value}));assert.equal(account().echo.points,510);
  }
  start();const r=account().run;
  for(const system of Object.keys(ECHO_SYSTEMS)) {assert(r[system+'Unlocked']);assert(r.checkpoint[system+'Unlocked']);}
  assert.deepEqual(r.bag,data.initialBag);assert.deepEqual(r.echo,account().echo.upgrades);
  assert.throws(()=>cmd('echo',{value:'exchange'}),/结束或放弃/);
  store.change(user,a=>{a.echo.upgrades.types=[];});
  engine.migrate(user);assert.equal(account().run.echo.types.length,18,'ongoing run snapshot stays fixed');
 });
 it('deduplicates purchases and guards overflow conversion with all old upgrades maxed',()=>{
  seed(20); const request={action:'echo',value:'guard',id:randomUUID(),revision:account().revision};
  engine.command(user,request);engine.command(user,request);assert.equal(account().echo.points,10);
  assert.throws(()=>cmd('echo',{value:'system/mega'}),/不足/);assert.equal(account().echo.points,10);
  store.change(user,a=>{a.points=200;a.boosts=stats(10);a.slots=5;});
  assert.throws(()=>cmd('echo',{value:'exchange'}),/全部升满/);
  store.change(user,a=>{a.slots=6;});cmd('echo',{value:'exchange'});
  assert.equal(account().points,100);assert.equal(account().echo.points,11);
  cmd('echo',{value:'exchange'});assert.throws(()=>cmd('echo',{value:'exchange'}),/100/);
 });
 it('increases shiny chances with one draw and keeps old RNG semantics without the perk',()=>{
  let calls=0;
  assert(rollEchoShiny({},n=>{calls++;assert.equal(n,1000);return 9;},10));
  assert(rollEchoShiny({echo:{shiny:5}},n=>{calls++;assert.equal(n,10000);return 149;},10));
  assert(!rollEchoShiny({echo:{shiny:5}},()=>150,10));assert.equal(calls,2);
 });
 function duplicate(system='mega') {
  store.change(user,a=>{a.run[system+'Unlocked']=true;grantSystem(a.run,system,'测试赠礼');
   a.run.phase='blessing';a.run.blessingRewardResume='choose';});
  return account().run.blessings.pending[0];
 }
 function take(value) {const r=account().run.blessings.pending[0];return cmd('blessingreward',{member:r.id,value});}
 for(const tier of [0,'easy',5]) it(`offers duplicate-system alternatives and persists one claim in tier ${tier}`,()=>{
  start(tier);const reward=duplicate();assert.equal(reward.kind,'systemfallback');
  assert(!reward.options.includes('unlock:mega'));assert(reward.options.includes('unlock:tera'));
  assert(reward.text.includes('既然你已经有了'));engine=new RogueEngine(store,data,()=>0,true);engine.migrate(user);
  assert.equal(account().run.blessings.pending[0].id,reward.id);
  const request={action:'blessingreward',member:reward.id,value:'shards',revision:account().revision,id:randomUUID()};
  engine.command(user,request);engine.command(user,request);assert.equal(account().run.blessings.shards,100);
  assert.equal(account().run.phase,'choose');
 });
 it('offers another system with its item, or another item for the existing system',()=>{
  start();duplicate();take('unlock:tera');assert(account().run.teraUnlocked);
  assert.equal(account().run.blessings.pending[0].kind,'tera');take('Water');
  assert.equal(account().run.bag.terashardwater,50);
  duplicate('gmega');take('item:gmega');assert.equal(account().run.bag.gmegawishingstar,1);
  duplicate('z');take('item:z');assert.equal(account().run.blessings.pending[0].kind,'stone');take('normaliumz');
  assert.equal(account().run.bag.normaliumz,1);
  duplicate();take('item:mega');take('charizarditex');assert.equal(account().run.bag.charizarditex,1);
 });
 it('offers a fallback when all gym systems are unlocked and returns to battle preparation',()=>{
  start();store.change(user,a=>{for(const s of Object.keys(ECHO_SYSTEMS))a.run[s+'Unlocked']=true;gymSystemGift(a.run);});
  const reward=account().run.blessings.pending[0];assert.equal(reward.kind,'systemfallback');
  assert(!reward.options.some(s=>s.startsWith('unlock:')));take('shards');assert.equal(account().run.phase,'ready');
 });
 it('grants the rich treasure bag through the normal reward generator with doubled budget',()=>{
  start();duplicate();const expected=structuredClone(account().run);treasure(expected,data,()=>0,treasureBudget(expected.floor));
  take('treasure');assert.deepEqual(account().run.bag,expected.bag);assert.equal(account().run.money,expected.money);
 });
});
