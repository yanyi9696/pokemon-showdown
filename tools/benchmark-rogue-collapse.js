'use strict';
// Paired native-battle probes, not campaign/human win rates. No saves, server or network involved.
const fs = require('fs');
const {Battle} = require('../dist/sim/battle');
const {Dex} = require('../dist/sim/dex');
const {Teams} = require('../dist/sim/teams');
const {createRoguePokemon} = require('../dist/server/fantasy-rogue/progression');
const {trainerBossCandidates} = require('../dist/server/fantasy-rogue/trainer-bosses');
const {InformationView} = require('../dist/server/fantasy-ai/information');
const {captureInitialMoves} = require('../dist/server/fantasy-ai/initial-snapshot');
const {emergencyChoice} = require('../dist/server/fantasy-ai/fallback');
const {RulePolicy} = require('../dist/server/fantasy-ai/policy');
const {qualityFor} = require('../dist/sim/rogue-quality');
const {collapseParameters} = require('../dist/sim/rogue-collapse-data');
const {difficultyScale, difficultyRewardScale} = require('../dist/sim/rogue-difficulty');
const dex = Dex.mod('gen9fantasy'), stats = n => ({hp:n,atk:n,def:n,spa:n,spd:n,spe:n});
const builds = {
 direct: [['Garchomp','Earthquake','Dragon Claw','Rock Slide','Fire Fang'],['Primarina','Moonblast','Surf','Ice Beam','Psychic'],['Scizor','Bullet Punch','X-Scissor','Close Combat','Knock Off']],
 setup: [['Garchomp','Swords Dance','Earthquake','Dragon Claw','Fire Fang'],['Volcarona','Quiver Dance','Fiery Dance','Bug Buzz','Giga Drain'],['Gyarados','Dragon Dance','Waterfall','Crunch','Ice Fang']],
 weather: [['Pelipper','Hurricane','Surf','Roost','U-turn'],['Swampert','Waterfall','Earthquake','Ice Punch','Rock Slide'],['Kingdra','Surf','Dragon Pulse','Ice Beam','Rain Dance']],
 attrition: [['Venusaur','Leech Seed','Sludge Bomb','Giga Drain','Sleep Powder'],['Garganacl','Salt Cure','Recover','Earthquake','Protect'],['Gliscor','Toxic','Earthquake','Roost','Protect']],
};
// Deliberately choose lesser-impact rules first for each build. Resource rules incur no cost
// in a single battle; the separate economy ratios below quantify their campaign pressure.
const preference = {
 direct:['environment','vigilance','erosion','cleanse','inflation','medicine','adaptation','steadfast','vitality','power'],
 setup:['environment','erosion','cleanse','inflation','medicine','adaptation','steadfast','vitality','vigilance','power'],
 weather:['vigilance','erosion','cleanse','inflation','medicine','adaptation','steadfast','vitality','environment','power'],
 attrition:['environment','vigilance','steadfast','inflation','medicine','adaptation','power','vitality','cleanse','erosion'],
};
const version = process.argv.includes('--v5') ? 5 : 4;
if (version === 5) Object.assign(preference, {
 direct:['inflation','environment','vigilance','cleanse','abilitygas','coverage','steadfast','power','vitality','statbloat'],
 setup:['inflation','environment','cleanse','coverage','abilitygas','steadfast','vigilance','power','vitality','statbloat'],
 weather:['inflation','vigilance','cleanse','coverage','steadfast','power','vitality','statbloat','environment','abilitygas'],
 attrition:['inflation','environment','vigilance','coverage','steadfast','power','vitality','statbloat','abilitygas','cleanse'],
});
const mirror = process.argv.includes('--mirror');
const resultDir = version === 5 ? 'docs/playtests/2026-10-26' : 'docs/playtests/2026-10-25';
const resultPath = resultDir + '/capture-quality-' + (mirror ? 'mirror' : 'benchmark') + '.json';
const output = {version,mirror,method:'Native battle probes: four three-member archetypes, three authored boss checkpoints, three paired seeds, tiers 0-5. Fresh profile keeps IV15 at every tier; captured profile uses the tier wild mean in all stats as a representative approximation, not a random sample or guaranteed catch. Enemy boss sets unchanged. Mirror uses fixed IV31 enemy rosters at all tiers. Balanced preboss support is included for player. Lesser-impact rules selected first. No items/blessings, echo upgrades, PP attrition, resource acquisition or human decisions. Not a full 200-floor clear-rate estimate.',cases:[],summary:[],economy:[]};
function play(build, floor, seed, tier, profile) {
 const playerIV=profile==='fresh'?15:qualityFor(tier).wild;
 const level = Math.min(100, 5 + Math.ceil(floor/2));
 const roster = builds[build].map(([species,...moves],i) => {
  const s = dex.species.get(species), set={species,level,moves,nature:'Hardy',ability:s.abilities[0],ivs:stats(playerIV),evs:stats(64)};
  if(build==='weather' && species==='Pelipper') set.ability='Drizzle';
  if(build==='weather' && species==='Kingdra') set.ability='Swift Swim';
  const mon = createRoguePokemon(set,stats(0),'probe'+i); mon.difficulty={tier,floor,version}; return mon;
 });
 const candidates=trainerBossCandidates(floor,level), foe=mirror ? {team:roster.map(m=>({...structuredClone(m.set),ivs:stats(31)})),trainer:{name:'paired mirror'}} : candidates[seed % candidates.length];
 if(!foe) throw Error('No trainer fixture at '+floor);
 const requests={}, collapse=preference[build].slice(0,tier*2);
 const b=new Battle({formatid:'gen9fantasyrogue',seed:[2026,10,floor,seed],
  fantasyRogue:{encounterId:'balance',team:roster,boosts:stats(0),bag:{},balls:[],catchable:false,mentorCard:'balanced',mentorTier:'gym',collapse,difficulty:{tier,floor,version}},
  send(type,data){if(type==='sideupdate'&&typeof data==='string'&&data.slice(3).startsWith('|request|')) requests[data.slice(0,2)]=JSON.parse(data.slice(12));},
  p1:{name:'Probe',team:roster.map(m=>m.set)},p2:{name:'NPC',team:foe.team}});
 const views=['p1','p2'].map((ownSide,i)=>new InformationView({ownSide,difficulty:'normal',partySize:i?roster.length:foe.team.length,...(i?{opponentMoves:captureInitialMoves(b,'p1')}:{})}));
 const policy=new RulePolicy({format:'gen9fantasyrogue',style:'balanced',packedTeam:Teams.pack(roster.map(m=>m.set)),keyMembers:[],resourcePreferences:[]});
 const enemyPolicy=new RulePolicy({format:'gen9fantasyrogue',style:'balanced',packedTeam:Teams.pack(foe.team),keyMembers:[],resourcePreferences:[]});
 let cursor=0;
 try {
  for(let step=0;!b.ended && b.turn<=80 && step<1000;step++) {
   const update=b.log.slice(cursor).join('\n');cursor=b.log.length;views.forEach(v=>v.receiveUpdate(update));
   for(let i=0;i<2;i++) {
    const side=b.sides[i],request=requests[side.id];if(b.ended||!request||request.wait||side.isChoiceDone()) continue;
    const obs=views[i].observe(request),choice=i?(mirror?enemyPolicy.decide(obs,[2026,10,seed,step+1],[],{quick:true}).choice:emergencyChoice(obs,'gen9fantasyrogue',[],true)):policy.decide(obs,[2026,10,seed,step+1],[],{quick:true}).choice;
    if(!b.choose(side.id,choice)&&!b.choose(side.id,emergencyChoice(obs,'gen9fantasyrogue',[choice],true))) throw Error('Illegal benchmark choice');
   }
  }
  return {build,floor,seed,tier,version,profile,playerIV,collapse,opponent:foe.trainer?.name,won:b.ended?b.winner==='Probe':null,turns:b.turn,playerRemaining:b.p1.pokemon.filter(p=>p.hp).length,enemyRemaining:b.p2.pokemon.filter(p=>p.hp).length,remainingHP:b.p1.pokemon.reduce((s,p)=>s+p.hp/p.maxhp,0)/roster.length,triggers:b.fantasyRogue.collapseMetrics?.triggers||{}};
 } finally {b.destroy();}
}
for(const profile of ['fresh','captured']) for(const tier of [0,1,2,3,4,5]) {
 for(const build of Object.keys(builds)) for(const floor of [20,100,180]) for(const seed of [1,2,3]) output.cases.push(play(build,floor,seed,tier,profile));
 const rows=output.cases.filter(r=>r.profile===profile&&r.tier===tier),finished=rows.filter(r=>r.won!==null);
 const row={profile,tier,battles:rows.length,timeouts:rows.length-finished.length,wins:finished.filter(r=>r.won).length,meanTurns:rows.reduce((s,r)=>s+r.turns,0)/rows.length,meanRemainingHP:rows.reduce((s,r)=>s+r.remainingHP,0)/rows.length};output.summary.push(row);console.log(JSON.stringify(row));
 fs.mkdirSync(resultDir,{recursive:true});fs.writeFileSync(resultPath,JSON.stringify(output,null,2));
}
for(let tier=1;tier<=5;tier++) output.economy.push({tier,playerPeak:difficultyScale(tier,200),coinMultiplier:difficultyRewardScale(tier,200),purchasingPowerWithInflation:1/collapseParameters(version).inflation,healingPerCurrencyWithBoth:(version===5?1:collapseParameters(version).medicine)/collapseParameters(version).inflation});
fs.writeFileSync(resultPath,JSON.stringify(output,null,2));
