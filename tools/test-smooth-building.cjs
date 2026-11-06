'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warzone-command-pages.js','utf8');
const items=[{id:'PillBox1'},{id:'GuardTower1'}],requests=[],nodes=new Map();
const element=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,style:{}});return nodes.get(id)};
const state={snapshot:{trucks:[{id:11},{id:13},{id:15}]},nativeBuildGroup:[],serial:0,siteChecks:0,placements:0,
 nativeMenu:'',nativePendingSites:[],nativeHudHidden:false,menuRevision:0,navigationSerial:0,cancelSerial:0};
const c=vm.createContext({state,Date,Set,Promise,availableBuildings:()=>items,buildGroup:s=>s.trucks,
 element,renderSidebar(){},updateHUD(){},requestState(){},previewAt:(x,y)=>({x,y}),reason:x=>x,notify(){},
 document:{getElementById:()=>({focus(){},setAttribute(){},querySelector:()=>({setAttribute(){}})})},
 host:{WarzoneHost:{restoreBattlefield(){}}},
 window:{WarzoneTerrain:{active(){}},__kalaWarzoneTouch:{report:()=>({pendingClicks:0}),releaseAll(){}},__blockNightResearch:{pollOutput(){}}},
 send:(action,data)=>new Promise(resolve=>requests.push({action,data,resolve})),
 pause:()=>new Promise(r=>setImmediate(r)),flushNativeSites(){},freezeBattlefield(){throw Error('Building must keep the battlefield live')},
 releaseBattlefield(){throw Error('No captured battlefield should need releasing')},close:async()=>{},closeNative:async()=>{},
 cancelPlacement(){state.placement=null;state.nativeItem='';state.nativeToolReady=false;}});
vm.runInContext(source.slice(source.indexOf('  function beginPlacement('),source.indexOf('  function nativeBuildTap(')),c);
vm.runInContext(source.slice(source.indexOf('  function placeAt('),source.indexOf('  let validationTimer;')),c);
vm.runInContext(source.slice(source.indexOf('  async function drainBuildInput('),source.indexOf('  async function afterBuildExit(')),c);
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 assert.equal(c.beginPlacement('PillBox1'),undefined,'first choice must be immediate, without an engine/menu reply');
 assert.equal(state.placement.id,'PillBox1');assert.equal(requests.length,0);
 const session=state.session;c.placeAt(8,40);
 c.beginPlacement('GuardTower1');c.placeAt(9,42);
 c.beginPlacement('PillBox1');c.placeAt(9,40);
 assert.deepEqual(requests.map(r=>[r.action,r.data.itemId,r.data.x,r.data.y]),[
  ['queue-build','PillBox1',8,40],['queue-build','GuardTower1',9,42],['queue-build','PillBox1',9,40]
 ],'rapid mixed taps must retain each requested item and tile before replies arrive');
 assert.equal(state.session,session);assert.equal(state.siteChecks,3);
 assert.ok(requests.every(r=>r.data.workerIds.join()==='11,13,15'));
 const exit=c.selectMode();await tick();assert.ok(state.placement,'normal exit waits for accepted commands');
 for(const r of requests.splice(0))r.resolve({ok:true,result:{workers:[11,13,15]}});
 await exit;assert.equal(state.siteChecks,0);assert.equal(state.placement,null);
 assert.equal(state.nativeHudHidden,false);
 c.beginPlacement('GuardTower1');c.placeAt(10,42);
 const stop=c.selectMode(true);await tick();
 const order=requests.shift();assert.equal(order.action,'queue-build');order.resolve({ok:true,result:{workers:[11,13,15]}});
 await tick();await tick();
 const fresh=requests.shift();assert.equal(fresh.action,'state');fresh.resolve({ok:true,result:{jobs:[{id:'own',workers:[11]},{id:'other',workers:[99]}]}});
 await tick();const cancel=requests.shift();assert.equal(cancel.action,'cancel-job');assert.equal(cancel.data.jobId,'own');cancel.resolve({ok:true});
 await stop;assert.equal(requests.length,0,'STOP must preserve unrelated construction groups');
 console.log('PASS: immediate/repeated selection, immutable rapid mixed orders, accepted-input exit and scoped STOP; no frame freeze or viewport change');
})().catch(e=>{console.error(e);process.exitCode=1});
