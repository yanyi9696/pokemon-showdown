'use strict';
// Controlled native battles at selected checkpoints. These fixtures deliberately do NOT
// represent a completed campaign, paid acquisitions, human players, or population win rates.
const fs = require('fs');
const {Battle} = require('../dist/sim/battle');
const {Dex} = require('../dist/sim/dex');
const {Teams} = require('../dist/sim/teams');
const {PRNG} = require('../dist/sim/prng');
const {createRoguePokemon, levelMoves} = require('../dist/server/fantasy-rogue/progression');
const {eliteBossCandidates} = require('../dist/server/fantasy-rogue/elite-bosses');
const {trainerBossCandidates, chooseTrainer} = require('../dist/server/fantasy-rogue/trainer-bosses');
const {summitEncounter} = require('../dist/server/fantasy-rogue/final-bosses');
const {InformationView} = require('../dist/server/fantasy-ai/information');
const {captureInitialMoves} = require('../dist/server/fantasy-ai/initial-snapshot');
const {emergencyChoice} = require('../dist/server/fantasy-ai/fallback');
const {RulePolicy} = require('../dist/server/fantasy-ai/policy');
const {rogueBossChoice} = require('../dist/sim/rogue-bosses');
const {blessingLevelCost} = require('../dist/sim/rogue-blessing-data');
const dex = Dex.mod('gen9fantasy'), stats = n => ({hp:n, atk:n, def:n, spa:n, spd:n, spe:n});
const root = 'docs/playtests/2026-10-17/stable';
fs.mkdirSync(root, {recursive:true});
const output = {method:'Artificial equal-level six-member teams; neutral natures, IV20, controlled EVs, level-up moves only, no held items or blessing power. Same seeds at zero and +5 permanent stats. Production NPC policy. Not full-playthrough or human win-rate evidence.', cases:[], stats:[], levelCosts:[], gyms:{}};
const rng = new PRNG([2026,10,17,77]);
const gymCandidates = trainerBossCandidates(20, 15);
for (let i = 0; i < 10000; i++) {
 const picked = chooseTrainer({floor:20, trainerHistory:{gyms:[], eliteFour:[]}}, gymCandidates, n => rng.random(n));
 output.gyms[picked.trainer.id] = (output.gyms[picked.trainer.id] || 0) + 1;
}
for (const [species, level] of [['Fuecoco',5],['Fuecoco',11],['Crocalor',25],['Skeledirge',50],['Skeledirge',100]]) {
 const set = {species, level, ability:dex.species.get(species).abilities[0], nature:'Hardy', evs:stats(0), ivs:stats(20), moves:['Tackle']};
 output.stats.push({species, level, zero:createRoguePokemon(set,stats(0)).stats, half:createRoguePokemon(set,stats(5)).stats});
}
for (const floor of [10,20,50,100,150,190,200]) {
 const paid = [1,50,100,150].filter(n => n < floor || n === 1);
 output.levelCosts.push({floor, silver:0, gold:paid.reduce((s,n) => s+blessingLevelCost('gold',n,true),0), prismatic:paid.reduce((s,n) => s+blessingLevelCost('prismatic',n,true),0)});
}
function party(level, meta) {
 const names = [level < 16 ? 'Mudkip' : level < 36 ? 'Marshtomp' : 'Swampert',
  level < 18 ? 'Rookidee' : level < 38 ? 'Corvisquire' : 'Corviknight',
  level < 15 ? 'Shinx' : level < 30 ? 'Luxio' : 'Luxray', level < 24 ? 'Houndour' : 'Houndoom',
  level < 21 ? 'Oddish' : 'Gloom', level < 20 ? 'Wooper' : 'Quagsire'];
 return names.map((species,index) => {
  const s = dex.species.get(species), attack = s.baseStats.atk >= s.baseStats.spa ? 'atk' : 'spa';
  const evs = stats(Math.min(24,level)); evs[attack] = Math.min(180,level*2); evs.hp = Math.min(100,level);
  const chosen = [], pool = [...new Set(levelMoves(species).filter(m => m.level <= level).map(m => m.move))];
  function value(id) {
   const m = dex.moves.get(id);
   if (m.category === 'Status') return m.heal ? 75 : ['leechseed','willowisp','toxic','yawn','swordsdance','nastyplot','bulkup'].includes(id) ? 50 : 0;
   return (m.basePower || 50)*(s.types.includes(m.type)?1.5:1)*(m.accuracy === true ? 1 : m.accuracy/100)*
    ((m.category === 'Physical') === (attack === 'atk') ? 1 : .7)*(chosen.some(c => dex.moves.get(c).type === m.type) ? .25 : 1);
  }
  while (chosen.length < 4 && pool.length) {pool.sort((a,b) => value(b)-value(a)); chosen.push(pool.shift());}
  return createRoguePokemon({species,level,ability:s.abilities[0],nature:'Hardy',evs,ivs:stats(20),moves:chosen,item:''},stats(meta),'fixture'+index);
 });
}
function play(floor, foe, meta) {
 const level = floor === 10 ? 11 : Math.min(100,5+Math.ceil(floor/2));
 const team = party(level,meta), requests = {};
 const battle = new Battle({formatid:'gen9fantasyrogue',seed:[2026,10,floor,77],
  fantasyRogue:{encounterId:'checkpoint',team,boosts:stats(meta),bag:{},balls:[],catchable:false,mentorCard:'balanced',
   boss:foe.boss,tera:{player:floor>=100,opponent:true},systems:{player:{mega:floor>=100,z:floor>=100,gmega:floor>=100}}},
  send(type,data) {if(type==='sideupdate' && typeof data==='string' && data.slice(3).startsWith('|request|')) requests[data.slice(0,2)]=JSON.parse(data.slice(12));},
  p1:{name:'Fixture',team:team.map(m=>m.set)},p2:{name:'NPC',team:foe.team}});
 const views = ['p1','p2'].map((side,i)=>new InformationView({ownSide:side,difficulty:'normal',partySize:i?6:foe.team.length,
  ...(i?{opponentMoves:captureInitialMoves(battle,'p1')}:{}),rogueBoosts:stats(meta)}));
 const policy = new RulePolicy({format:'gen9fantasyrogue',style:'balanced',packedTeam:Teams.pack(team.map(m=>m.set)),keyMembers:[],resourcePreferences:['mega','zmove','terastallize']});
 let cursor=0;
 try {
  for(let step=0;!battle.ended && step<1200 && battle.turn<=100;step++) {
   const update=battle.log.slice(cursor).join('\n'); cursor=battle.log.length;
   views.forEach(v=>v.receiveUpdate(update));
   for(let i=0;i<2;i++) {
    const side=battle.sides[i], request=requests[side.id];
    if(battle.ended || !request || request.wait || side.isChoiceDone()) continue;
    const observation=views[i].observe(request);
    const choice=i?(foe.boss && rogueBossChoice(request))||emergencyChoice(observation,'gen9fantasyrogue',[],true):
     policy.decide(observation,[2026,10,floor,step+1]).choice;
    if(!battle.choose(side.id,choice)) {
     const retry=emergencyChoice(observation,'gen9fantasyrogue',[choice],true);
     if(!battle.choose(side.id,retry)) throw Error('Invalid fixture choice '+choice+' / '+retry);
    }
   }
  }
  const row={floor,level,meta,foe:foe.trainer?.name||foe.team[0].species,won:battle.ended?battle.winner==='Fixture':null,
   turns:battle.turn,faints:battle.log.filter(l=>l.startsWith('|faint|p1')).length,
   partyRemaining:battle.p1.pokemon.filter(p=>p.hp).length,opponentRemaining:battle.p2.pokemon.filter(p=>p.hp).length};
  output.cases.push(row); console.log(JSON.stringify(row));
  fs.writeFileSync(root+'/boss-benchmark.json',JSON.stringify(output,null,2));
 } finally {battle.destroy();}
}
for(const floor of [10,50,100,150,190,200]) {
 const candidates = floor===200?[summitEncounter(100)]:eliteBossCandidates(floor).map(set=>({team:[set]}));
 if(!candidates.length) candidates.push(...trainerBossCandidates(floor,Math.min(100,5+Math.ceil(floor/2))));
 // All first elites; a fixed small sample of later authored pools avoids a single matchup claim.
 for(const foe of floor===10?candidates:candidates.slice(0,3)) for(const meta of [0,5]) play(floor,foe,meta);
}
fs.writeFileSync(root+'/boss-benchmark.json',JSON.stringify(output,null,2));
