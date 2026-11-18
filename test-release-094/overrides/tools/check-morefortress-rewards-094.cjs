'use strict';
// Actual native-script functions under simulated native APIs. No emulator/gameplay claim.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'scenario/warzone-towers-catalog.json')));
const rewardSource=fs.readFileSync(path.join(root,'scenario/warzone-towers-rewards.js'),'utf8');
const commandSource=fs.readFileSync(path.join(root,'scenario/warzone-towers-commands.js'),'utf8');
const retained=fs.readFileSync(path.join(root,'tools/check-rewards-native-027.cjs'),'utf8');
const baseSource=retained.slice(retained.indexOf('function baseSetup()'),retained.indexOf('\nfunction setup()')).replace('setTimer(){},queue(){}','setTimer(){},removeTimer(){},queue(){}');
const baseSetup=new Function('vm','catalog','commandSource','rewardSource','fortress',baseSource+';return baseSetup;')(vm,catalog,commandSource,rewardSource,'X-Super-Cannon');
const clone=v=>JSON.parse(JSON.stringify(v)),checks=[];
const saveSort=v=>Array.isArray(v)?v.map(saveSort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,saveSort(v[k])])):v;
function check(name,fn){fn();checks.push(name);}
function fixture(){
 const t=baseSetup();let actual={profile:'survival',map:'tdn2'},components=new Set(),researchCalls=[];
 t.c.wt_rewardContext=()=>actual;
 t.context=v=>actual=v;
 for(const item of catalog.buildings){
  t.c.Stats.Building[item.name].Type=['DEFENSE','WALL','WALLCORNER','CORNER WALL','GATE','FORTRESS'].includes(item.kind)?'Wall':'Structure';
  t.c.Stats.Building[item.name].HitPoints=1000;
  t.upgrades[0].Building[item.name]={HitPoints:1000,ResearchPoints:100,ModuleResearchPoints:50};
  t.upgrades[1].Building[item.name]={HitPoints:1000,ResearchPoints:100,ModuleResearchPoints:50};
 }
 t.c.Stats.Sensor.FortressSensor={Id:'FortressSensor',Range:2048};
 t.upgrades[0].Sensor={FortressSensor:{Range:2048}};t.upgrades[1].Sensor={FortressSensor:{Range:2048}};
 t.c.getResearch=id=>{assert.ok(id,'New types must not call getResearch(undefined)');researchCalls.push(id);return{id,done:false};};
 t.c.completeResearch=()=>{throw Error('A purchase may not complete research');};
 t.componentErrors=[];
 t.c.componentAvailable=(componentType,componentName)=>{
  // Upstream componentAvailable([deprecatedType,]componentName) uses script-player context.
  const id=componentName===undefined?componentType:String(componentName);
  if(!t.c.wtcmd_native[id]){t.componentErrors.push(id);return false;}
  return id!=='Rocket-ATGM'||components.has(id);
 };
 t.c.makeComponentAvailable=(id,p)=>{assert.equal(p,0);components.add(id);t.calls.push({kind:'component',id,player:p});};
 t.components=components;t.researchCalls=researchCalls;
 t.request=(items={},extra={})=>({session:'mf094',profile:actual?.profile||'survival',map:actual?.map||'tdn2',items,...extra});
 t.apply=(items={},extra={})=>t.c.wtreward_apply(t.request(items,extra));
 t.add=(items,id)=>t.c.wtreward_add(t.request(items,{transactionId:id}));
 return t;
}
check('Twelve new purchase types and actual additive catalogs, with one designable weapon',()=>{
 const t=fixture();assert.equal(Object.keys(t.c.wtreward_types).filter(k=>k.startsWith('mf_')).length,12);
 for(const [key,type]of Object.entries(t.c.wtreward_types))if(type.more&&t.c.wtreward_structure(type))assert.ok(catalog.buildings.some(b=>b.id===type.id));
 assert.equal(catalog.components.Weapon.filter(w=>w.id==='Rocket-ATGM').length,1);
 assert.ok(!rewardSource.includes('completeResearch('));
});
check('Unpaid structures and ATGM design remain gated even after an accidental availability grant',()=>{
 const t=fixture();t.components.add('Rocket-ATGM');t.c.wtreward_tick();
 for(const [key,type]of Object.entries(t.c.wtreward_types))if(type.more&&t.c.wtreward_structure(type)){
  assert.equal(t.limits[type.id],0,key);assert.equal(t.c.wtreward_canBuild(type.id),'reward-not-owned');
 }
 assert.equal(t.c.wtcmd_partAvailable('Rocket-ATGM'),false);
 assert.equal(t.c.wtcmd_templateAvailable({body:'Body1REC',propulsion:'wheeled01',weapons:['Rocket-ATGM'],name:'Saved ATGM'}),false);
 assert.equal(t.upgrades[0].Sensor.FortressSensor.Range,2048);
});
check('One purchased fortress is quota limited, never natural, and destruction does not replenish it',()=>{
 const t=fixture();assert.equal(t.apply({mf_howitzer:1}).ok,true);const id='X-Super-Howitzer';
 assert.equal(t.limits[id],1);assert.equal(t.c.wtreward_match.entries.mf_howitzer.natural,false);
 t.structures.push({id:701,player:0,itemId:id,x:12,y:12,status:1});t.c.wtreward_syncItems();
 assert.equal(t.c.wtreward_state().remaining.mf_howitzer,0);t.structures.length=0;t.c.wtreward_syncItems();
 assert.equal(t.limits[id],0);assert.equal(t.c.wtreward_canBuild(id),'reward-used');assert.deepEqual(t.researchCalls,[]);
});
check('Missing or conflicting actual profile/map denies new purchases before side effects',()=>{
 for(const change of [{profile:'towers',map:'other'},{map:'wave'},{profile:undefined,map:undefined}]){
  const t=fixture(),before=clone(t.upgrades);assert.equal(t.apply({mf_fortress_sensor:1},change).ok,false);assert.deepEqual(t.upgrades,before);assert.equal(t.calls.length,0);
 }
 const t=fixture();t.context(null);assert.equal(t.apply({mf_atgm_design:1}).ok,false);assert.equal(t.components.size,0);
});
check('ATGM licence uses native availability arity without component0 errors or repeated grants',()=>{
 const t=fixture();assert.equal(t.c.wtcmd_partAvailable('Rocket-ATGM'),false);
 assert.equal(t.apply({mf_atgm_design:1}).ok,true);assert.equal(t.c.wtcmd_partAvailable('Rocket-ATGM'),true);
 assert.equal(t.c.wtcmd_templateAvailable({body:'Body1REC',propulsion:'wheeled01',weapons:['Rocket-ATGM'],name:'ATGM'}),true);
 assert.deepEqual(t.calls.filter(c=>c.kind==='component').map(c=>c.id),['Rocket-ATGM']);
 assert.equal(t.c.wtreward_state().remaining.mf_atgm_design,0);assert.equal(t.c.wtreward_state().moreFortressEffects.atgmDesign.allowed,true);
 assert.equal(t.c.wtreward_state().moreFortressEffects.atgmDesign.available,true);
 t.c.wtreward_tick();t.c.wtreward_tick();
 assert.deepEqual(t.componentErrors,[],'Availability uses native one-argument signature without component0 errors');
 assert.equal(t.calls.filter(c=>c.kind==='component').length,1,'An already available licensed component is not granted again each tick');
 assert.equal(t.c.wtreward_canBuild('Emplacement-ATGM'),'reward-not-owned');assert.deepEqual(t.researchCalls,[]);
});
check('Sensor adds48 percent of base only once, preserving unrelated upgrades and the other player',()=>{
 const t=fixture();t.upgrades[0].Sensor.FortressSensor.Range=2304;
 assert.equal(t.apply({mf_fortress_sensor:1}).ok,true);assert.equal(t.upgrades[0].Sensor.FortressSensor.Range,3288);
 t.c.wtreward_tick();assert.equal(t.apply({mf_fortress_sensor:1}).ok,true);assert.equal(t.upgrades[0].Sensor.FortressSensor.Range,3288);
 t.upgrades[0].Sensor.FortressSensor.Range+=50;t.c.wtreward_tick();assert.equal(t.upgrades[0].Sensor.FortressSensor.Range,3338);
 assert.equal(t.upgrades[1].Sensor.FortressSensor.Range,2048);assert.equal(t.c.wtreward_state().moreFortressEffects.fortressSensor.bonus,984);
});
check('Concrete tiers each add100 percent base defensive HP, sequentially, without healing or HQ change',()=>{
 const t=fixture(),hq=catalog.buildings.find(b=>b.id==='A0CommandCentre').name,fort=catalog.buildings.find(b=>b.id==='X-Super-Howitzer').name;
 assert.equal(t.apply({mf_concrete_1:1,mf_concrete_2:1,mf_concrete_3:1}).ok,true);
 assert.equal(t.upgrades[0].Building[fort].HitPoints,4000);assert.equal(t.upgrades[0].Building[hq].HitPoints,1000);assert.equal(t.upgrades[1].Building[fort].HitPoints,1000);
 t.c.wtreward_tick();assert.equal(t.upgrades[0].Building[fort].HitPoints,4000);
 const quote=t.c.wtreward_state();assert.deepEqual(clone(quote.moreFortressEffects.concrete.tiers),[1,2,3]);assert.equal(quote.moreFortressEffects.concrete.passiveHealing,false);
 for(const items of [{mf_concrete_2:1},{mf_concrete_1:1,mf_concrete_3:1},{mf_concrete_1:2}]){const x=fixture();assert.equal(x.apply(items).ok,false);assert.equal(x.calls.length,0);}
});
check('Live transactions replay once; concrete dependencies and per-run licence/effect caps fail closed',()=>{
 const t=fixture();assert.equal(t.apply().ok,true);
 const a=t.add({mf_fortress_sensor:1},'sensor-1');assert.equal(a.ok,true);const value=t.upgrades[0].Sensor.FortressSensor.Range;
 assert.equal(t.add({mf_fortress_sensor:1},'sensor-1').ok,true);assert.equal(t.upgrades[0].Sensor.FortressSensor.Range,value);
 assert.equal(t.add({mf_atgm_design:1},'sensor-1').ok,false);assert.equal(t.add({mf_fortress_sensor:1},'sensor-2').ok,false);
 assert.equal(t.add({mf_concrete_2:1},'bad-2').ok,false);assert.equal(t.c.wtreward_match.transactions['bad-2'],undefined);
 for(const tier of [1,2,3])assert.equal(t.add({['mf_concrete_'+tier]:1},'tier-'+tier).ok,true);
 assert.equal(t.add({mf_concrete_3:1},'tier-extra').ok,false);
});
check('Restoring an older native world reapplies later funded effects once without increasing phone caps',()=>{
 const t=fixture();assert.equal(t.apply().ok,true);const saved=clone(t.c.wtreward_match),before=clone(t.upgrades[0]);
 assert.equal(t.add({mf_fortress_sensor:1},'after-save').ok,true);
 t.c.wtreward_match=saved;t.upgrades[0].Sensor.FortressSensor.Range=before.Sensor.FortressSensor.Range;
 const request=t.request({mf_fortress_sensor:1},{remaining:{mf_fortress_sensor:0}});
 assert.equal(t.c.wtreward_resume(request).resumed,true);assert.equal(t.upgrades[0].Sensor.FortressSensor.Range,3032);
 assert.equal(t.c.wtreward_resume(request).resumed,true);assert.equal(t.upgrades[0].Sensor.FortressSensor.Range,3032);
});
check('Sorted native save JSON restores readiness and paid deltas over reconstructed researched stats in both profiles',()=>{
 for(const profile of ['survival','towers']){
  const t=fixture();t.context({profile,map:profile==='survival'?'tdn2':'waves-map'});
  const fort=catalog.buildings.find(b=>b.id==='X-Super-Howitzer').name;
  t.c.Stats.Building[fort].HitPoints=4000;t.upgrades[0].Building[fort].HitPoints=6400;
  t.c.Stats.Sensor.FortressSensor.Range=1536;t.upgrades[0].Sensor.FortressSensor.Range=1536;
  const reconstructed=clone(t.upgrades[0]),items={mf_howitzer:1,mf_atgm_design:1,mf_fortress_sensor:1,mf_concrete_1:1};
  assert.equal(t.apply(items).ok,true);
  t.structures.push({id:901,player:0,itemId:'X-Super-Howitzer',x:14,y:14,status:1});t.c.wtreward_syncItems();
  assert.equal(t.upgrades[0].Building[fort].HitPoints,10400);assert.equal(t.upgrades[0].Sensor.FortressSensor.Range,2274);
  for(let load=0;load<2;load++){
   // Real engine semantics: persisted JS state survives, direct Upgrades writes
   // are absent, and completed stock research reconstructs6400/1536 instead.
   const saved=saveSort(clone(t.c.wtreward_match)),entries=clone(saved.entries),transactions=clone(saved.transactions);
   t.c.wtreward_match=saved;
   for(const group of Object.keys(reconstructed))t.upgrades[0][group]=clone(reconstructed[group]);
   t.c.wtreward_eventGameLoaded();
   assert.equal(t.upgrades[0].Building[fort].HitPoints,10400,profile+' concrete restored once');
   assert.equal(t.upgrades[0].Sensor.FortressSensor.Range,2274,profile+' sensor restored once');
   assert.equal(t.apply(items).ok,true,'Equivalent recursively sorted save config passes native apply readiness');
   assert.equal(t.apply({...items,mf_howitzer:2}).error,'reward-config-conflict','Changed paid quantity still fails strict equality');
   assert.equal(t.upgrades[0].Building[fort].HitPoints,10400,'readiness apply never stacks or renews the bonus');
   assert.deepEqual(clone(t.c.wtreward_match.entries),entries,'load does not renew purchased/consumed tokens');
   assert.deepEqual(clone(t.c.wtreward_match.transactions),transactions,'load does not alter paid transaction journal');
   assert.equal(t.c.wtreward_state().remaining.mf_howitzer,0,'already-built fortress stays spent');
   assert.equal(t.c.wtreward_state().moreFortressEffects.atgmDesign.available,true,'persisted licence remains actually available');
   t.c.wtreward_tick();t.c.wtreward_tick();
   const caps=t.request(items,{remaining:{mf_howitzer:0,mf_atgm_design:0,mf_fortress_sensor:0,mf_concrete_1:0}});
   assert.equal(t.c.wtreward_resume(caps).resumed,true);
   assert.equal(t.upgrades[0].Building[fort].HitPoints,10400,'ticks/resume never stack the restored concrete bonus');
   assert.equal(t.upgrades[0].Sensor.FortressSensor.Range,2274,'ticks/resume never stack the restored sensor bonus');
  }
 }
 const unpaid=fixture();assert.equal(unpaid.apply().ok,true);const before=clone(unpaid.upgrades);
 unpaid.c.wtreward_eventGameLoaded();assert.deepEqual(unpaid.upgrades,before,'unpaid run has no load-time stat delta');
});
check('Mixed old and new fortress stock shares cap3, and legacy stock still uses normal quota logic',()=>{
 const t=fixture();assert.equal(t.apply({fortress:1,mf_assault_gun:1,mf_howitzer:1}).ok,true);
 assert.equal(t.add({mf_flamer:1},'fourth').ok,false);
 const legacy=fixture();legacy.available.delete('Emplacement-Rocket06-IDF');assert.equal(legacy.apply({ripple:2}).ok,true);assert.equal(legacy.limits['Emplacement-Rocket06-IDF'],2);
 assert.equal(legacy.power(),2000);assert.equal(legacy.components.size,0);
});
const report={scope:'Actual reward/command source in Node VM with simulated native APIs; not emulator or gameplay proof',checksPassed:checks.length,checks,componentAvailabilityContract:'componentAvailable([deprecatedComponentType,]componentName) uses the current script player; makeComponentAvailable(componentName,player) retains its player argument',arityRegression:'Licensed component is actually available; no unknown component0 lookup and only one makeAvailable call across repeated ticks',saveLoadRegression:'Saved JS namespace keys are recursively sorted; native Upgrades reconstruct from completed research without direct writes; GameLoaded restores paid deltas, canonical apply readiness succeeds, repeated ticks/resume and second load do not stack or renew stock',emulatorUsed:false,researchCompleted:false};
fs.mkdirSync(path.join(root,'qa/survival-094'),{recursive:true});fs.writeFileSync(path.join(root,'qa/survival-094/morefortress-native-purchase-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
