'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),mod=path.join(root,'vendor/tower-defense/mod');
function setup(){let enemies=[],timers=[],current,command={},sequence=0;const balances=[2500,2500,2500],wins=[],research=[],wavePackets=[];
 const c=vm.createContext({namespace(){},_:s=>s,gameTime:0,selectedPlayer:0,scavengerPlayer:10,scavengers:0,maxPlayers:2,powerType:1,baseType:2,CAMP_CLEAN:0,CAMP_BASE:1,CAMP_WALLS:2,FEATURE:2,STRUCTURE:1,DROID:0,HQ:0,DROID_ANY:99,DORDER_ATTACK:3,TER_CLIFFFACE:9,TER_WATER:8,NO_ALLIANCES:0,ALLIANCES:1,alliancesType:0,gameTimeLimit:0,playerData:[{isAI:false,isHuman:true,team:0},{isAI:true,isHuman:false,team:1}],Stats:{Brain:{'Z NULL BRAIN':{RankThresholds:[0,4,8,16,32,64,128,256,512]}}},timeBaseTech:180,timeAdvancedBaseTech:384,timeT2:1020,timeT3:1560,
 getMultiTechLevel:()=>1,hackNetOff(){},hackNetOn(){},getScrollLimits:()=>({x:0,y:0,x2:64,y2:64}),terrainType:()=>0,propulsionCanReach:()=>true,syncRandom:()=>0,
 playerPower:p=>balances[p],setPower:(n,p)=>balances[p]=n,completeResearch:(id,p)=>research.push({id,p}),setStructureLimits(){},setDroidExperience:(d,n)=>d.rank=n,removeObject(){},orderDroidObj(){},playSound(){},console(){},dump(line){if(line.startsWith('BNWAVE:'))wavePackets.push(JSON.parse(line.slice(7)));},setMissionTime(){},isSpectator:()=>false,transformPlayerToSpectator(){},gameOverMessage:win=>wins.push(win),
 enumStruct:p=>p===0&&c.hqAlive?[{id:1,x:14,y:54}]:[],enumDroid:p=>p===1?enemies:[],countDroid:(type,p)=>p===1?enemies.length:0,
 includeJSON:()=>command,queue:(name,delay=0)=>timers.push({name,due:c.gameTime+Math.max(10,delay),id:++sequence}),setTimer:(name,delay)=>timers.push({name,due:c.gameTime+delay,period:delay,id:++sequence}),removeTimer:name=>{timers=timers.filter(t=>t.name!==name);if(current?.name===name)current.cancelled=true;}});
 c.hqAlive=true;
 const load=p=>vm.runInContext(fs.readFileSync(p,'utf8'),c,{filename:p});
 for(const name of ['SaveLoad','Template','tools','Spawner','Scavengers','towerDefense','configAPI','configReader'])load(path.join(mod,'multiplay/script/mods',name+'.js'));
 load(path.join(mod,'config.js'));load(path.join(mod,'multiplay/script/rules/endconditions.js'));
 load(path.join(root,'scenario/warzone-towers-waves.js'));load(path.join(root,'scenario/warzone-towers-objective.js'));
 // Native component resolution is checked separately against the live engine.
 vm.runInContext('Template.fromString=name=>({name});Template.spawn=(t,p,x,y)=>testSpawn(t,p,x,y)',c);
 c.testSpawn=(t,p,x,y)=>{const d={...t,id:100+enemies.length,player:p,type:0,cost:30,x,y};enemies.push(d);return d;};
 function advance(target){let steps=0;while(true){timers.sort((a,b)=>a.due-b.due||a.id-b.id);if(!timers[0]||timers[0].due>target)break;assert.ok(++steps<200000,'scheduler must settle');current=timers.shift();c.gameTime=current.due;c[current.name]();if(current.period&&!current.cancelled){current.due+=current.period;timers.push(current);}current=null;}c.gameTime=target;}
 c.tdspawner_eventStartLevel();c.td_eventStartLevel();c.warzoneTowersWaves_eventStartLevel();c.conditions_eventGameInit();
 return {c,advance,balances,research,wins,wavePackets,setCommand:v=>command=v,clearEnemies:()=>enemies=[],enemies:()=>enemies,timers:()=>timers};
}
const first=setup(),c=first.c;
assert.equal(vm.runInContext('totalRounds',c),30);assert.equal(c.warzoneTowersWaves_state.deadline,180000);
first.advance(179999);assert.equal(first.enemies().length,0);first.advance(183000);assert.equal(c.warzoneTowersWaves_state.wave,1);assert.equal(first.enemies().length,35);
const expected=vm.runInContext('actions.filter(a=>a.type==="spawn").reduce((n,a)=>n+a.count,0)',c);
while(c.warzoneTowersWaves_state.wave<30)first.advance(c.warzoneTowersWaves_state.deadline+4000);
assert.equal(first.enemies().length,expected);assert.equal(c.warzoneTowersWaves_state.waiting,false);assert.ok(first.research.every(r=>r.p===1),'enemy progression must not grant human research');
const rewardBefore=first.balances[0];c.td_eventDestroyed({id:9,type:0,player:1,cost:100});assert.equal(first.balances[0]-rewardBefore,46);assert.equal(first.balances[1],2500);assert.equal(c.warzoneTowersWaves_state.rewardCount,1);assert.equal(c.warzoneTowersWaves_state.rewardPower,46);
c.td_eventDestroyed({id:10,type:2,player:1,cost:100});c.td_eventDestroyed({id:11,type:0,player:0,cost:100});assert.equal(first.balances[0],rewardBefore+46);
for(const p of [0,1,2]){c.powerType=p;assert.equal(vm.runInContext('defaultPowerRewardFunction()(100)',c),Math.ceil(900**[.51,.56,.60][p]));}
first.clearEnemies();first.advance(c.gameTime+4000);assert.equal(c.warzoneTowersWaves_state.phase,'victory');assert.deepEqual(first.wins,[],'selected human victory uses host result flow, not stock UI');
assert.equal(first.wavePackets.at(-1).phase,'victory');assert.equal(first.wavePackets.at(-1).canSkip,false);assert.equal(first.wavePackets.at(-1).enemyDroids,0);
const skip=setup();skip.advance(1000);skip.setCommand({nonce:'one',action:'next'});skip.c.warzoneTowersWaves_tick();skip.advance(4000);assert.equal(skip.enemies().length,35);assert.equal(skip.c.warzoneTowersWaves_state.wave,1);skip.c.warzoneTowersWaves_tick();assert.equal(skip.c.warzoneTowersWaves_state.wave,1);skip.advance(180000);assert.equal(skip.c.warzoneTowersWaves_state.wave,2,'cancelled prep callback must not advance a second time');assert.equal(skip.enemies().length,110,'survivors stay when the scheduled next round arrives');
const lose=setup();lose.c.hqAlive=false;lose.advance(4000);assert.equal(lose.c.warzoneTowersWaves_state.phase,'defeated');assert.deepEqual(lose.wins,[],'selected human defeat uses host result flow, not stock UI');
assert.equal(lose.wavePackets.at(-1).phase,'defeated');assert.equal(lose.wavePackets.at(-1).canSkip,false);
const results={passed:true,scope:'Native-script API fixture only; no engine or emulator execution',emulatorUsed:false,gameplayVerified:false,rounds:30,configuredEnemies:expected,firstRoundEnemies:35,reward100Medium:46,enemyResearchOnly:true,skipDeduplicated:true,oldWaitCancelled:true,survivorsRetained:true,victory:true,hqDefeat:true,terminalPackets:true,selectedHumanStockResultsSuppressed:true,nativeComponentResolution:'not exercised by this fixture'};
fs.mkdirSync(path.join(root,'qa/0.34-notices'),{recursive:true});fs.writeFileSync(path.join(root,'qa/0.34-notices/tower-defense-source-fixture.json'),JSON.stringify(results,null,2));console.log('PASS:',JSON.stringify(results));
