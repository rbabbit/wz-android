'use strict';
// Actual generated native scripts under deterministic API stubs; no emulator input.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),src=__dirname;
const read=n=>fs.readFileSync(path.join(src,n),'utf8');
const policy=JSON.parse(read('policy.json')),research=JSON.parse(read('research.json'));
function body(text,name){const start=text.indexOf('function '+name+'(');assert.ok(start>=0,name);let at=text.indexOf('{',start),depth=1,end=at+1;while(depth){depth+=(text[end]==='{')-(text[end]==='}');end++;}return text.slice(start,end);}
function fixture(branch){
 const done=[new Set(),new Set()],enabled=[new Set(),new Set()],powers=[],packets=[],hq=[{id:10,type:1,stattype:2,status:3,player:0,x:24,y:14,health:100},{id:20,type:1,stattype:2,status:3,player:1,x:12,y:60,health:100}],timers=[];
 const context=vm.createContext({selectedPlayer:0,me:1,timeAdvancedBaseTech:384,STRUCTURE:1,HQ:2,BUILT:3,DROID_ANY:4,RESEARCH_LAB:5,FACTORY:6,
  gameTime:0,mapWidth:37,mapHeight:75,receiveAllEvents(){},namespace(){},queue(){},setTimer:n=>timers.push(n),removeTimer(){},blockNightEmitResearchSnapshotV23(){},
  enumDroid:()=>[],enumStruct:(p,type)=>hq[p]?[hq[p]]:[],playerPower:()=>2500,
  includeJSON:n=>{assert.ok(!n.includes('/'),'native includeJSON is scriptPath-relative, not a data-root include');return n==='duel-policy.json'?policy:{mode:'duel',humanBranch:branch,botBranch:branch==='cannon'?'rockets':'cannon'};},
  enableResearch:(id,p)=>enabled[p].add(id),completeResearch:(id,p)=>done[p].add(id),setPower:(n,p)=>powers.push([n,p]),setStructureLimits(){},
  dump:s=>packets.push(JSON.parse(s.slice(s.indexOf('{')))),gameOverMessage:win=>context.finished=win});
 context.include=n=>{
  if(n==='tests/duel-policy.js')vm.runInContext(read('policy.js'),context);
  if(n==='multiplay/script/rules/includes.js')vm.runInContext(read('stock/camTechEnabler.js'),context);
 };
 vm.runInContext(read('rules.js'),context);
 for(const p of [0,1]){context.setupResearch(p);context.setupBase(p);}
 const available=(id,p)=>{const r=research[id];return r&&!done[p].has(id)&&(enabled[p].has(id)||(r.requiredResearch?.length&&r.requiredResearch.every(x=>done[p].has(x))));};
 return {context,done,enabled,powers,available,hq,packets,timers};
}

for(const branch of ['cannon','rockets']){
 const f=fixture(branch),c=f.context;
 assert.deepEqual(f.powers,[[2500,0],[2500,1]],'ordinary symmetric initial power only');
 for(const player of [0,1]){
  const selected=c.duelBranch(player),opposite=selected==='cannon'?'rockets':'cannon';
  assert.ok(f.done[player].has('R-Duel-License-'+selected));assert.ok(!f.done[player].has('R-Duel-License-'+opposite));
  assert.ok(f.done[player].has(policy.starters[selected].research));
  for(const [id,kind] of Object.entries(policy.researchClass)){
   if(kind!==selected&&kind!=='core')assert.ok(!f.done[player].has(id)&&!f.available(id,player),'native prerequisite gate: '+id);
  }
  assert.ok(!f.available('R-Duel-Locked',player));assert.ok(!f.available('R-Duel-License-'+opposite,player));
  const unlocked=[...f.done[player]].flatMap(id=>research[id]?.resultComponents||[]);
  assert.ok(unlocked.includes(policy.starters[selected].weapon),'selected factory starter is researched');
  assert.ok(unlocked.every(id=>!policy.weaponClass[id]||policy.weaponClass[id]===selected),'no other weapon branch initially unlocked');
  const plan=Array.from(c.duelResearchPlan(player));assert.ok(plan.length>50);assert.ok(plan.every(id=>c.duelResearchAllowed(id,player)));
  assert.ok(c.duelDesignAllowed({propulsion:'wheeled01',turrets:[policy.starters[selected].weapon]},player));
  assert.ok(!c.duelDesignAllowed({propulsion:'wheeled01',turrets:[policy.starters[opposite].weapon]},player));
  assert.ok(!c.duelDesignAllowed({propulsion:'V-Tol',turrets:[policy.starters[selected].weapon]},player));
  assert.ok(!c.duelDesignAllowed({body:'TransporterBody',propulsion:'wheeled01',turrets:[policy.starters[selected].weapon]},player));
  assert.ok(!c.duelDesignAllowed({body:'SuperTransportBody',propulsion:'V-Tol',turrets:[policy.starters[selected].weapon]},player));
  assert.ok(!c.duelDesignAllowed({propulsion:'Naval',turrets:[policy.starters[selected].weapon]},player));
  assert.ok(c.duelDesignAllowed({propulsion:'wheeled01',turrets:['Spade1Mk1']},player),'constructors remain valid');
  const allowed=new Set(Object.keys(policy.researchClass).filter(id=>c.duelResearchAllowed(id,player))),future=new Set(f.done[player]);
  let changed=true;
  while(changed){changed=false;for(const id of allowed)if(!future.has(id)&&(f.enabled[player].has(id)||research[id].requiredResearch?.length&&research[id].requiredResearch.every(dep=>future.has(dep)))){future.add(id);changed=true;}}
  assert.deepEqual([...allowed].filter(id=>!future.has(id)),[],'entire selected/core progression is reachable from actual bootstrap');
  for(const [id,kind] of Object.entries(policy.researchClass))if(!allowed.has(id))assert.ok(!research[id].requiredResearch.every(dep=>future.has(dep)),'other doctrines remain inaccessible after all allowed research: '+id);
  assert.equal(policy.researchClass['R-Cyborg-Transport'],'blocked');assert.equal(policy.researchClass['R-SuperTransport'],'blocked');
 }
 // No human topic starts from opening/selection; bootstrap is confined to match initialization.
 f.powers.length=0;c.gameTime=5000;c.duelStart();c.duelTick();assert.equal(f.powers.length,0);
 assert.equal(f.packets.at(-1).mode,'duel');assert.equal(f.packets.at(-1).phase,'active');
 f.hq[1]=null;c.duel_eventDestroyed({type:1,stattype:2,player:1});assert.equal(f.packets.at(-1).phase,'victory');assert.equal(c.finished,true);
 const g=fixture(branch);g.context.duelStart();g.hq[0]=null;g.context.duel_eventDestroyed({type:1,stattype:2,player:0});assert.equal(g.packets.at(-1).phase,'defeated');assert.equal(g.context.finished,false);

 // Execute the real generated NullBot research function and production choke point.
 const ai=fixture(branch).context;let produced=null,targets=null;
 ai.duelPhase='active';ai.pursueResearch=(lab,ids)=>{targets=ids;return true;};
 vm.runInContext(body(read('ai-research.js'),'doResearch'),ai);assert.equal(ai.doResearch({id:99}),true);
 assert.ok(Array.from(targets).every(id=>ai.duelResearchAllowed(id,1)));
 ai.buildDroid=(...args)=>{produced=args;return true;};ai.componentAvailable=()=>true;
 ai.bodyStatsToList=x=>x;ai.propulsionStatsToList=x=>x;ai.weaponStatsToList=x=>x;
 vm.runInContext(body(read('ai-production.js'),'ourBuildDroid'),ai);
 const own=policy.starters[ai.duelBranch(1)].weapon,foreign=policy.starters[ai.duelBranch(0)].weapon;
 // The stock function maps a stats choice object through its helper; use the
 // actual native argument shape from its unchanged call site.
 ai.isStructureAvailable=()=>true;ai.getDroidProduction=()=>null;
 ai.groupAddDroid=()=>{};
 try {
  ai.ourBuildDroid({id:88},'native policy',['Body1REC'],['wheeled01'],[foreign]);
  assert.equal(produced,null,'bot cannot produce opponent weapon');
  assert.equal(ai.ourBuildDroid({id:88},'native policy',['Body1REC'],['wheeled01'],[foreign,own]),true);
  assert.deepEqual(Array.from(produced[6]),[own],'bot production retains only its own permitted weapon');
  produced=null;assert.equal(ai.ourBuildDroid({id:88},'air transport',['TransporterBody'],['V-Tol'],[own]),false);assert.equal(produced,null);
 }catch(error){throw new Error('NullBot production guard: '+error.message);}
 console.log('PASS native Duel policy/bootstrap/objective/AI research and foreign production: '+branch);
}

// Native evidence records generic DROID=9 and produced WEAPON=0. The unchanged
// command snapshot groups recipes by parts AND that native type. Exercise its
// actual grouping after ordinary production creates an equivalent recipe.
{
 const templates=JSON.parse(read('templates.json')),commands=read('commands.js');
 const group=commands.slice(commands.indexOf('    const templateKeys = new Set();'),commands.indexOf('    const factories = enumStruct(selectedPlayer)',commands.indexOf('function wtcmd_snapshot()')));
 for(const branch of ['cannon','rockets']){
  const starter=templates['Duel-Starter-'+branch];
  const original={...starter,droidType:({WEAPON:0,DROID:9})[starter.type]};
  const produced={...starter,id:'',name:'',fullname:starter.name+' · F123',droidType:0};
  const c=vm.createContext({selectedPlayer:0,enumTemplates:()=>[original,produced],wtcmd_templateAvailable:()=>true});
  vm.runInContext(body(commands,'wtcmd_templateParts')+'\nfunction visible(){'+group+'return templates;}',c);
  assert.equal(c.visible().length,1,'one native factory card after normal '+branch+' production');
 }
 console.log('PASS native starter/produced recipe deduplication for both doctrines');
}

// A persisted library/template cannot bypass native validation or a queued-job check.
{
 const c=fixture('cannon').context;c.duelPhase='active';c.VTOL_FACTORY=8;
 c.wtcmd_partAvailable=()=>true;c.wtcmd_validateDesign=r=>({design:r});c.wtcmd_templateParts=t=>t;c.wtcmd_templateAvailable=()=>true;c.wtcmd_factoryAllows=()=>true;
 c.wtcmd_production={'1':[{id:'saved-old',design:{body:'Body1REC',propulsion:'wheeled01',turrets:['Rocket-Pod']},status:'queued'}]};
 let starts=0;c.wtcmd_tickProduction=()=>{for(const jobs of Object.values(c.wtcmd_production))if(jobs[0]&&jobs[0].status!=='blocked')starts++;};
 vm.runInContext(read('command-policy.js'),c);
 assert.equal(c.wtcmd_partAvailable('Rocket-Pod'),false);assert.equal(c.wtcmd_partAvailable('Cannon1Mk1'),true);
 assert.equal(c.wtcmd_validateDesign({propulsion:'wheeled01',turrets:['Rocket-Pod']},false).error,'components-unavailable');
 assert.equal(c.wtcmd_templateAvailable({propulsion:'wheeled01',turrets:['Rocket-Pod']}),false);
 c.wtcmd_tickProduction();assert.equal(starts,0);assert.equal(c.wtcmd_production['1'][0].status,'blocked');
 assert.equal(c.wtcmd_factoryAllows({propulsion:'wheeled01',turrets:['Cannon1Mk1']},{stattype:8}),false);
 console.log('PASS persisted/custom/template/queued production policy guards');
}

// Use the actual frozen generated preRun/monitor ordering, not a synthetic promise assumption.
{
 const runtime=fs.readFileSync(path.join(root,'app/src/main/assets/warzone/warzone2100.js'),'utf8');
 assert.ok(runtime.includes('var addOnPreRun=cb=>onPreRuns.push(cb)'));
 assert.ok(runtime.includes('callbacks.shift()(Module)'));
 assert.ok(runtime.includes('Module["monitorRunDependencies"]?.(runDependencies);if(runDependencies==0)'));
 const preRun=body(runtime,'preRun');
 for(const immediateCache of [true,false]){
  const events=[],config={mode:'duel',humanBranch:'rockets',botBranch:'cannon'},stored=new Map();let exists=false;
  const module={preRun:[],monitorRunDependencies(){},FS:{mkdirTree:n=>events.push('mkdir:'+n),analyzePath:()=>({exists}),writeFile:(n,value)=>{events.push('config');stored.set(n,value);}}};
  const c=vm.createContext({Module:module,onPreRuns:[],addOnPreRun(cb){c.onPreRuns.push(cb);},callRuntimeCallbacks(list){while(list.length)list.shift()(module);}});
  vm.runInContext(read('runtime-prepare.js')+'\n'+preRun,c);c.prepareDuelModule(module,config);
  // Generated loadPackage appends runWithFS only after config construction.
  module.preRun.push(()=>{assert.ok(events.some(s=>s.includes('duel-ro-half')));events.push('package-parents-ready');if(immediateCache)exists=true;});
  c.preRun();if(!immediateCache)exists=true;
  module.monitorRunDependencies(0);events.push('native-main');
  assert.equal(stored.size,3);for(const value of stored.values())assert.deepEqual(JSON.parse(value),config);
  assert.ok(events.lastIndexOf('config')<events.indexOf('native-main'));assert.ok(module.duelConfigInstalled);
 }
 console.log('PASS actual loader FIFO (cached/async) and branch config before native main');
}
console.log('PASS Duel backend source checks; actual installed gameplay requires separate emulator evidence.');

// Load the complete real NullBot include graph in its own player-one context.
// API constants/functions are deterministic engine stubs, not a simulated match.
{
 const runtime=fs.readFileSync(path.join(root,'app/src/main/assets/warzone/warzone2100-duel.js'),'utf8');
 const data=fs.readFileSync(path.join(root,'app/src/main/assets/warzone/warzone2100-duel.data'));
 const at=runtime.indexOf('loadPackage({')+12;let depth=1,end=at+1;
 while(depth){depth+=(runtime[end]==='{')-(runtime[end]==='}');end++;}
 const records=new Map(JSON.parse(runtime.slice(at,end)).files.map(e=>[e.filename,e]));
 const virtual=n=>{const e=records.get('/data/mp/'+n.replace(/^\//,''));assert.ok(e,'AI VFS include '+n);return data.subarray(e.start,e.end).toString('utf8');};
 for(const branch of ['cannon','rockets']){
  const loaded=[],globals={me:1,selectedPlayer:0,maxPlayers:2,gameTime:0,difficulty:2,baseType:3,mapWidth:37,mapHeight:75,
   startPositions:[{x:24,y:14},{x:12,y:60}],playerData:[{isHuman:true},{isHuman:false}],Stats:{},Upgrades:[{},{}],
   debug(){},dump(){},namespace(){},receiveAllEvents(){},setTimer(){},queue(){},removeTimer(){},
   getResearch:id=>({id,done:false}),componentAvailable:()=>true,isStructureAvailable:()=>true,
   enumDroid:()=>[],enumStruct:()=>[],enumFeature:()=>[],enumGateways:()=>[],enumResearch:()=>[],allianceExistsBetween:()=>false,playerPower:()=>2500};
  for(const name of ['CAMP_CLEAN','CAMP_BASE','CAMP_WALLS','EASY','MEDIUM','HARD','INSANE','ALL_PLAYERS','ALLIES','ENEMIES',
   'DROID_ANY','DROID_WEAPON','DROID_CONSTRUCT','DROID_CYBORG','DROID_CYBORG_CONSTRUCT','DROID_REPAIR','DROID_SENSOR',
   'HQ','FACTORY','CYBORG_FACTORY','VTOL_FACTORY','RESEARCH_LAB','POWER_GEN','RESOURCE_EXTRACTOR','REPAIR_FACILITY','DEFENSE','GATE','WALL',
   'DORDER_ATTACK','DORDER_BUILD','DORDER_HELPBUILD','DORDER_MOVE','DORDER_RTB','DORDER_STOP','DORDER_SCOUT','BUILT','DROID','STRUCTURE'])globals[name]=Object.keys(globals).length;
  const c=vm.createContext(globals);
  c.include=n=>{loaded.push(n);vm.runInContext(virtual(n),c,{filename:n,timeout:1000});};
  c.includeJSON=n=>{
   // Exact native QuickJS semantics: every JSON path is relative to the main
   // script root, including JSON loaded by a globally included helper.
   const value=JSON.parse(virtual('multiplay/skirmish/'+n));
   return n==='duel-config.json'?{...value,humanBranch:branch,botBranch:branch==='cannon'?'rockets':'cannon'}:value;
  };
  c.include('multiplay/skirmish/duel-ai.js');
  assert.ok(loaded.some(n=>n.endsWith('nb_includes/produce.js')));
  assert.ok(loaded.some(n=>n.endsWith('nb_includes/research.js')));
  assert.equal(vm.runInContext('Object.keys(subpersonalities).length',c),1);
  assert.equal(vm.runInContext('subpersonalities.DUEL.vtolness',c),0);
  assert.equal(c.duelBranch(1),branch==='cannon'?'rockets':'cannon');
  console.log('PASS complete stock NullBot native include context, fixed opposite branch: '+branch+' ('+loaded.length+' scripts)');
 }
}
