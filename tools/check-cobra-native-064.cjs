'use strict';
// Evaluate the exact retained Cobra sources. The small native-API fixture
// checks include/timer ownership only; device QA owns actual AI gameplay.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),stock=path.join(root,'scenario/ffa/stock/cobra');
for(const difficulty of [1,2,3]){
  const timers=[],queues=[],calls=[],cache={};
  const c={console,Math,Date,JSON,Infinity,me:1,maxPlayers:4,EASY:1,CAMP_CLEAN:0,CAMP_BASE:1,CAMP_WALLS:2,baseType:2,
    difficulty,gameTime:0,ALL_PLAYERS:-1,NO_SCAVENGERS:0,scavengers:0,scavengerPlayer:10,
    startPositions:[{x:15,y:16},{x:112,y:16},{x:15,y:112},{x:112,y:112}],
    playerData:[{isHuman:true},{isAI:true},{isAI:true},{isAI:true}],enumFeature:()=>[],enumStruct:()=>Array(40).fill({}),
    debugGetCallerFuncObject:()=>cache,setTimer:(name,ms)=>{timers.push({name,ms});return true;},queue:(...args)=>queues.push(args)};
  vm.createContext(c);
  c.include=name=>{
    const relative=name.replace(/^\/?multiplay\/skirmish\//,'');
    assert(!relative.includes('..'));
    vm.runInContext(fs.readFileSync(path.join(stock,relative),'utf8'),c,{filename:relative});
  };
  vm.runInContext(fs.readFileSync(path.join(stock,'Cobra.js'),'utf8'),c,{filename:'Cobra.js'});
  assert.equal(timers.length,0,'Cobra inclusion must not allocate native timer IDs before save restoration');
  assert.equal(queues.length,0,'Cobra inclusion must not create queued callbacks before save restoration');
  c.initCobraVars=()=>calls.push('init');c.recycleForHover=()=>calls.push('recycle');c.buildOrders=()=>calls.push('build');
  c.eventStartLevel();
  assert.deepEqual(calls,['init','recycle','build']);
  assert.equal(timers.length,13);assert.equal(new Set(timers.map(row=>row.name)).size,13);
  const easy=difficulty===1?5000:0;
  assert.equal(timers.find(row=>row.name==='buildOrders').ms,400+2*easy);
  assert.equal(timers.find(row=>row.name==='produce').ms,500+easy);
  assert.equal(timers.find(row=>row.name==='cobraDoResearch').ms,900+3*easy);
  c.initCobraGroups=()=>calls.push('loaded-groups');c.eventGameLoaded();
  assert.equal(calls.at(-1),'loaded-groups');assert.equal(timers.length,13,'Loading leaves native saved timer ownership intact');
}
const index=fs.readFileSync(path.join(root,'app/src/main/assets/warzone/index-ffa.html'),'utf8');
const bootstrap=index.match(/<script>\s*const ffaRequestedDifficulty[\s\S]*?<\/script>/)[0].replace(/^<script>/,'').replace(/<\/script>$/,'');
for(const query of ['', '?bnFfaBotType=nullbot', '?bnFfaBotType=unknown', '?bnFfaRestore=1&bnFfaBotType=cobra', '?bnFfaRestore=1&bnFfaBotType=nullbot']){
  const c={URLSearchParams,location:{search:query},window:{}};vm.createContext(c);vm.runInContext(bootstrap,c);
  assert.equal(c.window.__warzoneFfaConfig.botType,query.includes('Restore=1')&&query.includes('BotType=nullbot')?'nullbot':'cobra');
}
assert(index.includes("Module.arguments.push('--skirmish=ffa-' + ffaMap.id + '-' + ffaDifficulty + '.json');"));
assert(!index.includes("--skirmish=ffa-nullbot"),'Query metadata cannot select a legacy AI for a new game');
console.log('PASS: exact stock Cobra includes create no early timers, native1/2/3 lifecycle timing remains stock, restore leaves timers intact, and new-game challenge cannot be selected by bot query');
