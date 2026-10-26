'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {stats, set, content} = require('../fixtures/fantasy-rogue');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {normalizeBlessings} = require('../../dist/server/fantasy-rogue/blessings');
const {beginRival, chooseRival, rivalView} = require('../../dist/server/fantasy-rogue/rivals');
const {rivalChapterReplay} = require('../../dist/server/fantasy-rogue/rival-dialogue');
const {beginSocialEvent, chooseSocialEvent, socialCandidates} = require('../../dist/server/fantasy-rogue/social-events');
const {requestCompanion, travellingRoster, chooseCompanionInvitation} = require('../../dist/server/fantasy-rogue/travellers');
const {gainAffection, affectionScene, affectionCommand, affectionChat} = require('../../dist/server/fantasy-rogue/affection');
const {rogueCodex} = require('../../dist/server/fantasy-rogue/codex');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
function run(id, chapter = 4) {
 const r = {id:randomUUID(),floor:65,phase:'event',team:[createRoguePokemon(set('Bulbasaur','Overgrow',35),stats(0))],
  money:1000,bag:{},boosts:stats(0),encounter:0,caught:[],
  node:{id:'event',kind:'adventure',name:'旅途',reward:{money:0,items:{}},encounters:[]}};
 normalizeBlessings(r);
 if (id) r.rival={id,completed:chapter-1,lastFloor:40,affection:8};
 return r;
}
function family(r) {
 beginRival(r,()=>0);
 for(let turn=0;turn<2;turn++) {delete r.dialogue; chooseRival(r,content(),()=>0,rivalView(r).options[0].id);}
 delete r.dialogue;
}
describe('Fantasy Rogue Lusamine family meetings and companion', () => {
 for(const id of ['lillie','gladion']) for(const chapter of [2,4,6,8]) {
  it(`adds a saved family interaction to ${id} chapter ${chapter} and returns to the original chapter`, () => {
   let r=run(id,chapter);family(r);assert.equal(r.node.event.rival.step,'lusamine');
   assert.equal(rivalView(r).rivalPortrait,'lusamine');
   assert(rivalView(r).options.some(o=>o.id==='lusamine:join') === (chapter>=4));
   assert.equal(r.trainerBonds.lusamine.score,2);
   const store=new RogueStore(':memory:');
   try {store.change('familyqa',a=>{a.run=r;});r=store.get('familyqa').run;} finally{store.close();}
   chooseRival(r,content(),()=>0,'lusamine:trust');
   assert.equal(r.trainerBonds.lusamine.score,5);
   assert.equal(r.rival.completed,chapter-1);
   assert.equal(r.node.event.rival.step,chapter===4?'talk':undefined);
   assert(r.dialogue.pages.some(p=>p.portrait==='lusamine'));
   assert.throws(()=>chooseRival(r,content(),()=>0,'lusamine:trust'));
   assert.equal(r.trainerBonds.lusamine.score,5);
   const replay=rivalChapterReplay(id,chapter);
   assert(Object.values(replay.pages).some(p=>p.portrait==='lusamine'));
   for(const [key,page] of Object.entries(replay.pages)) if(key.startsWith('answer1:')) assert.equal(page.options[0].next,'family0');
   assert.equal(replay.pages['family:care'].options[0].next,'activity');
  });
 }
 it('does not displace other chapters or add family invitations before chapter four', () => {
  for(const id of ['lillie','gladion']) for(const chapter of [1,3,5,7]) {
   const r=run(id,chapter);family(r);
   assert.notEqual(r.node.event.rival.step,'lusamine');assert(!r.trainerBonds.lusamine);
  }
  const r=run('lillie',2);family(r);
  assert.throws(()=>chooseRival(r,content(),()=>0,'lusamine:join'));
 });
 it('uses the shared two slots and carries the same bond into permanent travel', () => {
  const r=run('gladion');requestCompanion(r,{id:'brock',origin:'event'});requestCompanion(r,{id:'viola',origin:'event'});
  delete r.dialogue;family(r);chooseRival(r,content(),()=>0,'lusamine:join');
  assert.equal(travellingRoster(r).length,2);assert.equal(r.companionInvitations[0].id,'lusamine');
  delete r.dialogue;const invite=r.companionInvitations[0];chooseCompanionInvitation(r,invite.key,'brock');
  assert.deepEqual(travellingRoster(r).map(c=>c.id),['viola','lusamine']);
  assert.equal(r.trainerBonds.lusamine.score,4);
  assert(!socialCandidates(r).some(c=>c.id==='lusamine'));
  requestCompanion(r,{id:'lusamine',origin:'event'});
  assert.equal(travellingRoster(r).filter(c=>c.id==='lusamine').length,1);
 });
 it('can meet and recruit her in ordinary event areas without choosing either child as rival', () => {
  const r=run('kieran');const index=socialCandidates(r).findIndex(c=>c.id==='lusamine');assert(index>=0);
  assert(beginSocialEvent(r,()=>index));assert.equal(r.node.event.social.trainer,'lusamine');
  delete r.dialogue;chooseSocialEvent(r,'pokemon',()=>0);chooseSocialEvent(r,'pokemon',()=>0);
  assert.equal(r.node.event.social.step,'invite');chooseSocialEvent(r,'join',()=>0);
  assert(travellingRoster(r).some(c=>c.id==='lusamine'));
  assert.equal(r.trainerBonds.lusamine.score,8);
 });
 it('has distinct gifts, affectionate family dialogue and a discoverable companion entry', () => {
  const r=run();gainAffection(r,'lusamine',50,'fifty');
  assert.equal(r.bag.miracleseed,1);assert.equal(affectionScene(r).id,'lusamine');
  assert(require('../../dist/server/fantasy-rogue/preview-content').createPreviewContent()
   .items.some(item=>item.id==='miracleseed' && item.kind==='held'));
  affectionCommand(r,{member:'lusamine',value:'thanks'});
  gainAffection(r,'lusamine',50,'hundred');
  assert.equal(r.bag.leftovers,1);assert.equal(r.bag.rarecandy,2);assert.equal(r.bag.goldbottlecap,1);
  assert.equal(r.blessings.pending.length,1);assert(affectionScene(r).text.includes('家'));
  assert.notEqual(affectionChat(r,'lusamine','普通闲聊'),'普通闲聊');
  gainAffection(r,'lusamine',50,'again');assert.equal(r.bag.leftovers,1);
  const entry=rogueCodex(undefined,'events',true).entries.find(e=>e.portrait==='lusamine' && e.roles);
  assert(entry.roles.includes('companion'));assert(entry.text.includes('奇迹种子'));
 });
});
