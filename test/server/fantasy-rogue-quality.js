"use strict";
const assert = require('assert').strict;
const { PRNG } = require('../../dist/sim/prng');
const { Dex } = require('../../dist/sim/dex');
const { encounterIVWeights, rollEncounterIVs, qualityFor, hiddenAbilityChance } = require('../../dist/sim/rogue-quality');
const { randomEncounterAbility } = require('../../dist/server/fantasy-rogue/encounter-sets');
const { syncRunDifficulty } = require('../../dist/server/fantasy-rogue/difficulty');
const { pickQualityBiomeSlot, pickQualitySpecies, rareEncounterScale, legendaryEventScale } = require('../../dist/server/fantasy-rogue/encounter-quality');
const { drawBlessingGift } = require('../../dist/server/fantasy-rogue/blessings');
const { exclusiveCatalog, neededExclusiveItems, exclusiveEncounterChance, grantExclusiveItem } = require('../../dist/server/fantasy-rogue/exclusive-items');
const { chooseEvent } = require('../../dist/server/fantasy-rogue/events');
const { inventoryItem } = require('../../dist/server/fantasy-rogue/team');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { starterTraits } = require('../../dist/server/fantasy-rogue/starter-traits');
const { stats, set } = require('../fixtures/fantasy-rogue');
const rng = seed => {const p = new PRNG([2026, 10, 25, seed]); return n => p.random(n);};
const run = (difficulty = 0) => ({id:'quality', floor:120, difficulty, difficultyRulesVersion:4, team:[], box:[], boost:stats(0), boosts:stats(0), bag:{}, money:1000, caught:[], notices:[]});

describe('Fantasy Rogue capture quality and signature item access', function () {
 this.timeout(30000);
 let content; before(() => {content = createPreviewContent();});
 for (const tier of ['easy',0,1,2,3,4,5]) for (const elite of [false,true]) it(`rolls independent, bounded stats for ${tier}/${elite}`, () => {
  const weights = encounterIVWeights(tier, elite), total = weights.reduce((a,b)=>a+b,0);
  const mean = weights.reduce((a,w,i)=>a+w*i,0)/total;
  const target = tier === 'easy' ? 10 : qualityFor(tier)[elite?'elite':'wild'];
  assert(Math.abs(mean-target) < .35, `${mean}/${target}`);
  if(tier!=='easy') {assert(weights[0]>0);assert(weights[31]>0);}
  const random=rng(31); let varied=false;
  for(let i=0;i<1000;i++) {const ivs=Object.values(rollEncounterIVs(random,tier,elite));assert(ivs.every(v=>Number.isInteger(v)&&v>=0&&v<=(tier==='easy'?15:31)));if(new Set(ivs).size>1)varied=true;}
  assert(varied);
  if(tier===0&&!elite) assert(1-(1-weights.slice(21).reduce((a,b)=>a+b,0)/total)**6<.01);
  if(tier===5&&elite) assert(weights[31]/total>.899 && weights[31]/total<.901);
 });
 it('rolls all capturable event teams once but preserves authored boss IVs and tactical zeros', () => {
  const r=run(), boss={...set('Mew'),ivs:{...stats(31),atk:0,spe:0}};
  r.node={kind:'event',encounters:[{catchable:true,team:[set()]},{catchable:false,team:[boss]}]};
  let rolls=0;const random=n=>{rolls++;return Math.floor(n/2);};syncRunDifficulty(r,random);
  assert.deepEqual(r.node.encounters[0].team[0].ivs,stats(15));assert.deepEqual(boss.ivs,{...stats(31),atk:0,spe:0});
  const restored=JSON.parse(JSON.stringify(r));syncRunDifficulty(restored,()=>{throw Error('rerolled');});assert.equal(rolls,8);
  r.difficulty='easy';delete boss.fantasyRogueIVAdjusted;syncRunDifficulty(r,random);assert(Object.values(boss.ivs).every(v=>v<=15));
 });
 for(const tier of ['easy',0,1,2,3,4,5]) for(const elite of [false,true]) it(`uses the configured hidden-ability probability for ${tier}/${elite}`, () => {
  let hidden=0;
  for(let n=0;n<100;n++) {
   const ability=randomEncounterAbility('Bulbasaur', max=>max===100?n:0, elite,tier);
   if(ability==='Chlorophyll')hidden++;else assert.equal(ability,'Overgrow');
   assert.equal(randomEncounterAbility('Mew',()=>0,elite,tier),'Synchronize');
  }
  assert.equal(hidden,hiddenAbilityChance(tier,elite));
 });
 it('generates gifts at the current tier and caps easy partners, including explicit perfect-IV rewards', () => {
  for(const tier of ['easy',0,3,5]) {
   const r=run(tier);const mon=drawBlessingGift(r,content,rng(5),{species:'Bulbasaur',perfect:1});r.team=[mon];syncRunDifficulty(r);
   if(tier==='easy') assert(Object.values(mon.set.ivs).every(v=>v<=15));else assert(Object.values(mon.set.ivs).includes(31));
  }
  assert.deepEqual(starterTraits({},'bulbasaur').ivs.max,stats(15));
  assert(content.starters.filter(s=>s.availableInitially).every(s=>Object.values(s.set.ivs).every(v=>v===15)));
 });
 it('restores base rarity in tier 3 and makes lower-tier rare branches measurably rarer', () => {
  const slots=[{weight:6,species:['Bulbasaur']},{weight:4,species:['Charmander']},{weight:2,species:['Mew']}];
  const results=[];
  for(let tier=0;tier<=5;tier++) {
   const random=rng(71),r=run(tier),counts={Bulbasaur:0,Charmander:0,Mew:0};
   for(let n=0;n<15000;n++) counts[pickQualityBiomeSlot(slots,random,r)]++;
   results.push(counts);assert.equal(legendaryEventScale(r,'kubfumaster'),rareEncounterScale(r));
  }
  assert(results[0].Mew<results[3].Mew/3);assert(results[5].Mew>results[3].Mew);
  assert(results[0].Charmander<results[3].Charmander);assert(Math.abs(results[3].Mew/15000-1/6)<.02);
  let low=0,high=0;const a=rng(3),b=rng(3);
  for(let i=0;i<5000;i++){low+=pickQualitySpecies(['Pidgey','Mewtwo-Fantasy'],a,run(0))==='Mewtwo-Fantasy';high+=pickQualitySpecies(['Pidgey','Mewtwo-Fantasy'],b,run(5))==='Mewtwo-Fantasy';}
  assert(low<high);
 });
 it('makes Cubone clues frequent, guarantees an offer within four eligible events, then stops after acquisition', () => {
  const r=run();r.team=[createRoguePokemon(set('Cubone','Rock Head'),stats(0))];
  assert(neededExclusiveItems(r).some(i=>i.id==='thickclub'));assert.equal(exclusiveEncounterChance(r,'thickclub'),35);
  const seen=[];for(let n=0;n<4;n++){const id=chooseEvent(r,max=>max-1);seen.push(id);(r.eventHistory||=[]).push({id,floor:r.floor});r.floor++;if(id==='exclusiveclue')break;}
  assert(seen.includes('exclusiveclue'));assert(grantExclusiveItem(r,'thickclub'));delete r.bag.thickclub;
  assert(!neededExclusiveItems(r).some(i=>i.id==='thickclub'));assert.equal(exclusiveEncounterChance(r,'thickclub'),0);
 });
 it('covers every usable species-specific item and form artifact without duplicates or missing inventory actions', () => {
  const d=Dex.mod('gen9fantasy'),catalog=exclusiveCatalog(),ids=new Set(catalog.map(i=>i.id));assert.equal(ids.size,catalog.length);
  for(const i of catalog) assert(inventoryItem(content,i.id),i.id);
  for(const i of d.items.all()) if(i.exists&&!['CAP','Unobtainable'].includes(i.isNonstandard)&&i.id!=='gmegawishingstar'&&
   (i.itemUser?.length||i.megaEvolves||i.forcedForme||i.onDrive||i.onMemory||i.onPlate||i.auraBursts)) assert(ids.has(i.id),i.id);
  for(const [species,item] of [['Cubone','thickclub'],['Marowak-Alola-Fantasy','firiumz'],['Lurantis-Fantasy','grassiumz'],['Primarina-Fantasy','primariumz']]) {
   const r=run();r.team=[createRoguePokemon(set(species),stats(0))];assert(neededExclusiveItems(r).some(i=>i.id===item),species+'/'+item);
  }
 });
});
