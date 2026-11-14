'use strict';
// Native-script API fixture. This does not execute the engine or Android UI.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),mod='vendor/tower-defense/mod/multiplay/script/';
const clone=value=>JSON.parse(JSON.stringify(value));
const checks=[];
function check(name,run){run();checks.push(name);}
function fixture(){
  const packets=[],stock=[],spectators=[],rng=[],enemies=[],queued=[];
  let serial=100,power=2000;
  const pool=['Machinegun Viper Wheels','Flamer Viper Wheels','Light Cannon Viper Wheels'];
  const actions=[{type:'wait',seconds:180},{type:'round',round:1},{type:'spawn',count:5,templatePool:pool},
    {type:'spawn',count:2,templatePool:[pool[2]]},{type:'wait',seconds:100},{type:'round',round:2},{type:'spawn',count:3,templatePool:[pool[0]]}];
  const c=vm.createContext({namespace(){},SaveLoad:{persist(){}},
    Stats:{Body:{Viper:{Id:'Body1REC',WeaponSlots:1}},Propulsion:{Wheels:{Id:'wheeled01'}},
      Weapon:{Machinegun:{Id:'MG1Mk1'},Flamer:{Id:'Flame1Mk1'},'Light Cannon':{Id:'Cannon1Mk1'}},
      Construct:{},Repair:{},Sensor:{},ECM:{},Brain:{'Z NULL BRAIN':{RankThresholds:[0,1,2]}}},
    actions,index:0,ranks:[0,1,2],totalRounds:2,selectedPlayer:0,scavAI:1,gameTime:2000,
    FEATURE:2,DROID:0,STRUCTURE:1,HQ:7,DROID_ANY:99,NO_ALLIANCES:0,ALLIANCES:1,alliancesType:0,
    maxPlayers:2,gameTimeLimit:0,hqAlive:true,failSpawn:false,
    playerData:[{isHuman:true,team:0},{isHuman:false,team:1}],
    _:s=>s,console(){},playSound(){},setMissionTime(){},hackNetOff(){},hackNetOn(){},setDroidExperience(){},
    syncRandom:n=>{const value=rng.length%n;rng.push(n);return value;},
    playerPower:()=>power,powerRewardFunction:()=>5,td_eventDestroyed:o=>{if(o.player===1)power+=5;},
    enumStruct:p=>p===0&&c.hqAlive?[{id:1,type:1,player:0}]:[],enumDroid:p=>p===1?enemies:[],
    countDroid:()=>enemies.length,isSpectator:()=>false,transformPlayerToSpectator:p=>spectators.push(p),
    gameOverMessage:won=>stock.push(won),includeJSON:()=>null,setTimer(){},removeTimer(){},
    queue:(name,delay)=>queued.push({name,delay}),
    addDroid:(p,x,y,name)=>{if(c.failSpawn)return null;const d={id:++serial,type:0,player:p,x,y,name,cost:10};enemies.push(d);return d;},
    dump:line=>{if(line.startsWith('BNWAVE:'))packets.push(JSON.parse(line.slice(7)));}});
  const load=name=>vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),c,{filename:name});
  load(mod+'mods/Template.js');load(mod+'mods/Spawner.js');load(mod+'mods/configReader.js');load(mod+'rules/endconditions.js');
  load('scenario/warzone-towers-waves.js');load('scenario/warzone-towers-objective.js');
  const spawner=vm.runInContext('Spawner',c);spawner.player=1;spawner.locations=[[1,1]];
  return {c,packets,stock,spectators,rng,enemies,spawner,queued,actions,
    round:n=>c.processRound({type:'round',round:n}),
    batch:i=>c.processSpawn(actions[i]),
    spawn:()=>spawner.spawn(),
    kill:d=>{enemies.splice(enemies.indexOf(d),1);c.td_eventDestroyed(d);},
    incoming:()=>clone(c.warzoneTowersWaves_incoming())};
}

check('Selected human defeat publishes a fresh terminal packet without stock results or spectator conversion',()=>{
  const f=fixture();f.c.wtreward_state=()=>({session:'current',remaining:{fortress:2}});f.c.hqAlive=false;
  f.c.finalizePlayer(0,false);
  const p=f.packets.at(-1);assert.equal(p.phase,'defeated');assert.equal(p.canSkip,false);
  assert.deepEqual(p.rewards,{session:'current',remaining:{fortress:2}});
  assert.deepEqual(f.stock,[]);assert.deepEqual(f.spectators,[]);
});
check('Selected human victory retains reconciled completed waves and fresh reward inventory',()=>{
  const f=fixture();f.round(2);f.batch(6);while(f.spawner.queue.length)f.spawn();
  for(const d of [...f.enemies])f.kill(d);
  f.c.wtreward_state=()=>({remaining:{archangel:7}});f.c.finalizePlayer(0,true);
  const p=f.packets.at(-1);assert.equal(p.phase,'victory');assert.deepEqual(p.completedWaves,[2]);
  assert.deepEqual(p.rewards.remaining,{archangel:7});assert.deepEqual(f.stock,[]);
});
check('Other humans and selected nonhuman players retain original native finalization',()=>{
  const other=fixture();other.c.playerData[1].isHuman=true;other.c.finalizePlayer(1,false);
  assert.deepEqual(other.spectators,[1]);assert.deepEqual(other.stock,[]);assert.equal(other.packets.length,0);
  const ai=fixture();ai.c.playerData[0].isHuman=false;ai.c.finalizePlayer(0,true);
  assert.deepEqual(ai.stock,[true]);assert.equal(ai.packets.at(-1).phase,'victory');
});
check('Original checkGameOver stops scheduling after selected human loss without native result UI',()=>{
  const f=fixture();f.c.hqAlive=false;f.c.checkGameOver();
  assert.equal(f.packets.at(-1).phase,'defeated');assert.deepEqual(f.stock,[]);
  assert(!f.queued.some(t=>t.name==='checkGameOver'));
});
check('Roster uses actual native selections with no additional random choices, counts or queue callbacks',()=>{
  const f=fixture();f.round(1);f.rng.length=0;f.queued.length=0;f.batch(2);
  assert.equal(f.rng.length,5);assert.deepEqual(f.rng,[3,3,3,3,3]);
  assert.equal(f.spawner.queue.length,5);assert.deepEqual(f.queued,[{name:'next',delay:undefined}]);
  assert.deepEqual(f.incoming(),{wave:1,total:5,spawned:0,complete:false,units:[
    {name:'Flamer Viper Wheels',count:2,spawned:0},{name:'Light Cannon Viper Wheels',count:1,spawned:0},
    {name:'Machinegun Viper Wheels',count:2,spawned:0}]});
  const names=f.spawner.queue.map(t=>vm.runInContext('Template',f.c).toString(t));
  const unchanged=JSON.stringify(f.spawner.queue),rngCount=f.rng.length;
  for(let i=0;i<10;i++){f.c.warzoneTowersWaves_emit(true);f.incoming();}
  assert.equal(f.rng.length,rngCount);assert.equal(JSON.stringify(f.spawner.queue),unchanged);
  assert.deepEqual(Array.from(names),[poolName(0),poolName(1),poolName(2),poolName(0),poolName(1)]);
  f.batch(3);assert.equal(f.incoming().complete,true);assert.equal(f.incoming().total,7);
});
function poolName(n){return ['Machinegun Viper Wheels','Flamer Viper Wheels','Light Cannon Viper Wheels'][n];}
check('Only successful spawns increment spawned counts; a failed native spawn cannot remain in incoming totals',()=>{
  const f=fixture();f.round(1);f.batch(2);f.spawn();
  assert.equal(f.incoming().spawned,1);assert.equal(f.incoming().total,5);
  f.kill(f.enemies[0]);assert.equal(f.incoming().spawned,1);assert.equal(f.incoming().total,5,'composition includes casualties');
  f.c.failSpawn=true;f.spawn();assert.equal(f.incoming().total,4);assert.equal(f.incoming().spawned,1);
  assert.equal(f.c.warzoneTowersWaves_state.waveRows['1'].failed,true);
});
check('Save/load retains plain roster records and continues pending selections without duplicate counts',()=>{
  const f=fixture();f.round(1);f.batch(2);f.spawn();
  const saved=clone(f.c.warzoneTowersWaves_state),queue=clone(f.spawner.queue);
  const loaded=fixture();loaded.c.warzoneTowersWaves_state=saved;loaded.spawner.queue=queue;
  loaded.c.warzoneTowersWaves_eventGameLoaded();assert.deepEqual(loaded.incoming(),f.incoming());
  loaded.spawn();assert.equal(loaded.incoming().spawned,2);assert.equal(loaded.incoming().total,5);
  assert(saved.waveRows['1'].roster);assert(!JSON.stringify(saved.waveRows['1'].roster).includes('player'));
});
check('Older saves omit unknown composition and start trustworthy composition on the next authored round',()=>{
  const f=fixture();f.round(1);f.batch(2);delete f.c.warzoneTowersWaves_state.waveRows['1'].roster;
  delete f.c.warzoneTowersWaves_state.waveRows['1'].rosterKnown;
  f.c.warzoneTowersWaves_eventGameLoaded();assert.equal(f.incoming(),null);
  f.batch(3);assert.equal(f.incoming(),null);f.round(2);f.batch(6);assert.equal(f.incoming().total,3);
  f.c.warzoneTowersWaves_state={phase:'active',wave:9,waiting:false,deadline:0};
  f.c.warzoneTowersWaves_eventGameLoaded();assert.equal(f.incoming(),null);
});
check('All authored schedules expose only exact predetermined next-wave totals without RNG or pool mutation',()=>{
  const paths=['vendor/tower-defense/mod/config.js','scenario/beginner/config.js',
    ...fs.readdirSync(path.join(root,'scenario/levels')).filter(n=>/^(easy|medium|hard)\d+\.js$/.test(n)).map(n=>'scenario/levels/'+n)];
  const f=fixture();let rounds=0;
  for(const name of paths){
    const actions=[];let totalRounds=0;
    const config={round(){actions.push({type:'round',round:++totalRounds});},wait(seconds){actions.push({type:'wait',seconds});},
      spawn(count,templatePool){actions.push({type:'spawn',count,templatePool});},setResearchDelay(){},setPowerRewardFunction(){},defaultPowerRewardFunction:()=>x=>x};
    vm.runInNewContext(fs.readFileSync(path.join(root,name),'utf8'),config,{filename:name});
    f.c.actions=actions;f.c.totalRounds=totalRounds;const before=JSON.stringify(actions),randomBefore=f.rng.length;
    let round=0;const expected={};for(const a of actions){if(a.type==='round'){round=a.round;expected[round]=0;}else if(a.type==='spawn')expected[round]+=a.count;}
    for(let n=1;n<=totalRounds;n++){
      f.c.warzoneTowersWaves_state.wave=n-1;f.c.warzoneTowersWaves_state.waiting=true;
      assert.deepEqual(clone(f.c.warzoneTowersWaves_upcoming()),{wave:n,total:expected[n]},name+' wave '+n);rounds++;
    }
    assert.equal(JSON.stringify(actions),before);assert.equal(f.rng.length,randomBefore);
    f.c.warzoneTowersWaves_state.wave=totalRounds;assert.equal(f.c.warzoneTowersWaves_upcoming(),null);
  }
  assert.equal(paths.length,45);assert.equal(rounds,895);
});
console.log(JSON.stringify({passed:checks.length,scope:'Native-script API fixtures only; no engine or emulator execution',emulatorUsed:false,gameplayVerified:false,checks},null,2));
