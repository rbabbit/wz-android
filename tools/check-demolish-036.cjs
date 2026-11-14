'use strict';
// Focused code/geometry checks. These do not establish native gameplay results.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const harness=fs.readFileSync('tools/test-command-bridge.cjs','utf8');
const setup=vm.runInNewContext(harness.slice(0,harness.indexOf('const defence='))+'\nsetup;', {require,__dirname:path.join(root,'tools'),console});
const copy=value=>JSON.parse(JSON.stringify(value));
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS: '+name);};
check('actual preRun seeds missing inert intent before native init, preserves existing tokens and exposes genuine FS errors',()=>{
 const html=fs.readFileSync('app/src/main/assets/warzone/index.html','utf8'),start=html.indexOf('      function blockNightPrepareDemolitionIntent(module) {'),end=html.indexOf('\n      }',start)+8;
 assert.ok(start>0&&end>start);assert.match(html.slice(end),/Module\['preRun'\]\.push\(blockNightPrepareDemolitionIntent\)/);
 const c=vm.createContext({});vm.runInContext(html.slice(start,end)+'\nglobalThis.seed=blockNightPrepareDemolitionIntent;',c);
 const file=new Map(),calls=[],p='/data/mp/multiplay/script/rules/warzone-towers-demolition-intent.json';
 const nativeFS={analyzePath:path=>({exists:file.has(path)}),mkdirTree:path=>calls.push(['mkdir',path]),writeFile:(path,text)=>{calls.push(['write',path]);file.set(path,text);}};
 c.seed({FS:nativeFS});assert.deepEqual(JSON.parse(file.get(p)),{intent:'',active:false});assert.deepEqual(calls.map(v=>v[0]),['mkdir','write']);
 const inert=file.get(p);c.seed({FS:nativeFS});assert.equal(file.get(p),inert);assert.equal(calls.length,2);
 const active=JSON.stringify({intent:'already-armed',active:true});file.set(p,active);c.seed({FS:nativeFS});assert.equal(file.get(p),active,'existing active runtime token is never overwritten by initialization');
 assert.throws(()=>c.seed({FS:{analyzePath:()=>({exists:false}),mkdirTree(){},writeFile(){throw Error('filesystem failure');}}}),/filesystem failure/);
});
function fixture(){
 const t=setup(),include=t.c.includeJSON;t.intent={intent:'demo-1',active:true};t.c.DORDER_DEMOLISH=77;t.c.ALL_PLAYERS=-1;
 t.c.includeJSON=file=>file==='warzone-towers-demolition-intent.json'?t.intent:include(file);
 t.c.enumStruct=(player,type)=>t.structures.filter(s=>s.player===player&&(type===undefined||s.stattype===type||s.itemId===type));
 t.c.enumRange=()=>t.droids.filter(d=>d.player===0);
 t.c.propulsionCanReach=prop=>!t.unreachable.has(Number(prop));
 t.droids.forEach(d=>{d.propulsion=String(d.id);d.z=0;d.action=0;});
 t.c.orderDroidObj=(d,order,s)=>{if(t.reject?.has(d.id))return false;t.calls.push({op:'native-object',truck:d.id,order,target:s.id});d.order=order;return true;};
 t.c.removeObject=()=>{throw Error('Demolition must not instantly delete a structure');};
 t.c.setPower=()=>{throw Error('Demolition must not manufacture/refund power');};
 t.c.wtreward_add=()=>{throw Error('Demolition must not refund crystal purchases');};
 t.c.wtcmd_started=true;t.select([t.droids[0]]);
 t.building=(id=101,props={})=>{const s={id,player:0,type:1,stattype:8,itemId:'A0ResearchFacility',name:'Research Facility',x:12,y:13,z:0,status:1,modules:0,health:100,...props};t.structures.push(s);return s;};
 t.demolish=(targetId=101,workerIds=[1],props={})=>t.send('demolish',{targetId,workerIds,intent:'demo-1',issuedGameTime:t.c.gameTime,...props});
 return t;
}
function unchanged(t,run){const before=JSON.stringify({calls:t.calls,jobs:t.c.wtcmd_jobs,workers:t.c.wtcmd_workers,production:t.c.wtcmd_production,droids:t.droids});const reply=run();assert.equal(JSON.stringify({calls:t.calls,jobs:t.c.wtcmd_jobs,workers:t.c.wtcmd_workers,production:t.c.wtcmd_production,droids:t.droids}),before);return reply;}
check('exact selected constructors; no offscreen or stale group fallback',()=>{
 for(const workers of [[],[2],[1,2],[999],[1,1],[0],['1']]){const t=fixture();t.building();assert.equal(unchanged(t,()=>t.demolish(101,workers)).ok,false);}
 const t=fixture();t.building();t.select([]);assert.equal(unchanged(t,()=>t.demolish()).reason,'selection-changed');
 t.droids.push({id:3,player:0,type:0,droidType:0});t.select([t.droids[2]]);assert.equal(unchanged(t,()=>t.demolish(101,[3])).reason,'selection-changed');
 t.select([t.droids[0],t.droids[2]]);assert.equal(t.demolish().ok,true);assert.deepEqual(copy(t.calls),[{op:'native-object',truck:1,order:77,target:101}]);
});
check('owned structures and foundations only; HQ protected',()=>{
 for(const props of [{stattype:7},{player:1}]){const t=fixture();t.building(101,props);assert.equal(unchanged(t,()=>t.demolish()).ok,false);}
 const t=fixture();assert.equal(unchanged(t,()=>t.demolish()).reason,'friendly-structure');
 for(const status of [0,1]){const f=fixture();f.building(101,{status});assert.equal(f.demolish().ok,true);assert.equal(f.structures.length,1,'real engine owns destruction');}
});
check('unselected active builders and known en-route foundation groups stay intact',()=>{
 const t=fixture();t.building(101,{status:0});Object.assign(t.droids[1],{x:12,y:14,action:2,order:10});
 assert.equal(unchanged(t,()=>t.demolish()).reason,'construction-busy');
 t.select(t.droids);assert.equal(t.demolish(101,[1,2]).ok,true);assert.equal(t.calls.length,2);
 const queued=fixture();queued.building(101,{status:0});queued.c.wtcmd_jobs.push({id:'q',itemId:'A0ResearchFacility',x:12,y:13,status:'travelling',workers:[2]});
 queued.c.wtcmd_workers['2']=['q'];assert.equal(unchanged(queued,()=>queued.demolish()).reason,'construction-busy');
});
check('reachability/engine rejection preserve existing orders and queues',()=>{
 const t=fixture();t.building();t.c.wtcmd_jobs.push({id:'q',itemId:'A0ResearchFacility',x:30,y:30,status:'queued',workers:[1]});t.c.wtcmd_workers['1']=['q'];
 t.unreachable.add(1);assert.equal(unchanged(t,()=>t.demolish()).reason,'unreachable');
 t.unreachable.clear();t.reject=new Set([1]);assert.equal(unchanged(t,()=>t.demolish()).reason,'engine-rejected');
});
check('accepted native order detaches only its constructors; unrelated queues/production preserved',()=>{
 const t=fixture();t.building();t.c.wtcmd_jobs.push({id:'a',itemId:'GuardTower1',x:8,y:8,status:'queued',workers:[1]},{id:'b',itemId:'GuardTower1',x:30,y:30,status:'queued',workers:[2]});
 t.c.wtcmd_workers={'1':['a'],'2':['b']};t.c.wtcmd_production={'500':[{id:'produce',status:'queued'}]};const production=JSON.stringify(t.c.wtcmd_production);
 assert.equal(t.demolish().ok,true);assert.equal(t.c.wtcmd_jobs[0].status,'cancelled');assert.equal(t.c.wtcmd_jobs[1].status,'queued');assert.deepEqual(copy(t.c.wtcmd_workers['2']),['b']);assert.equal(JSON.stringify(t.c.wtcmd_production),production);
 const count=t.calls.length;t.replay();assert.equal(t.calls.length,count,'same mutation nonce cannot issue a second order');
 t.intent.active=false;t.replay();assert.equal(t.calls.length,count,'successful cached reply survives later intent revoke');
});
check('cancelled, missing or mismatched intent blocks delayed native order',()=>{
 for(const intent of [null,{active:false,intent:'demo-1'},{active:true,intent:'other'}]){const t=fixture();t.building();t.intent=intent;assert.equal(unchanged(t,()=>t.demolish()).reason,'cancelled');}
 const t=fixture();t.building();assert.equal(unchanged(t,()=>t.demolish(101,[1],{intent:''})).reason,'cancelled');
});
check('native restore rejects a previously active/pending token before any DOM clock poll',()=>{
 const t=fixture();t.building();const originalClock=t.c.gameTime;
 // Simulate a save predating the uncached command: identical selected IDs and
 // target survive restore, and the shared FS still holds the active old token.
 t.c.wtcmd_replies={};t.c.wtcmd_demolitionRevokedIntent='';t.c.gameTime=originalClock-100;
 t.c.wtcmd_eventGameLoaded();assert.equal(t.c.wtcmd_demolitionRevokedIntent,'demo-1');
 assert.equal(unchanged(t,()=>t.demolish(101,[1],{issuedGameTime:originalClock})).reason,'game-reloaded');
 t.c.gameTime=originalClock+100;assert.equal(unchanged(t,()=>t.demolish()).reason,'game-reloaded','same token is also invalid after loading a newer or same-clock save');
 t.intent={active:true,intent:'fresh-after-load'};assert.equal(t.demolish(101,[1],{intent:'fresh-after-load'}).ok,true,'fresh explicit targeting works after load');
 const early=fixture();early.building();early.c.gameTime=100;assert.equal(unchanged(early,()=>early.demolish(101,[1],{issuedGameTime:200})).reason,'game-reloaded','issued clock rejects rewind before the callback is observed');
});
check('demolition state reports HQ/foundation geometry and avoids persistent snapshot bloat',()=>{
 const t=fixture();t.building(101,{status:0});t.building(102,{stattype:7,itemId:'A0CommandCentre',name:'Command Centre'});
 const before=t.c.wtcmd_replyOrder.length;const reply=t.send('demolish-state');assert.equal(reply.ok,true);assert.equal(t.c.wtcmd_replyOrder.length,before);
 assert.deepEqual(copy(reply.result.workerIds),[1]);assert.equal(reply.result.targets[0].foundation,true);assert.equal(reply.result.targets[1].protected,true);assert.equal(reply.result.targets[1].eligible,false);
});
check('native demolition journal clears on STOP, missing worker, missing target and clock rewind',()=>{
 const t=fixture();const s=t.building();assert.equal(t.demolish().ok,true);
 let state=t.c.wtcmd_constructionState();assert.equal(state.active[0].status,'demolishing');assert.equal(state.active[0].remaining,null);
 t.droids[0].order=1;t.c.gameTime+=1501;assert.equal(t.c.wtcmd_demolitionRecord(s),null);assert.equal(t.c.wtcmd_constructionState().active.length,0);
 t.intent.active=true;t.demolish();t.c.gameTime-=1;assert.equal(t.c.wtcmd_demolitionRecord(s),null);
 t.c.gameTime+=2;t.demolish();t.droids.splice(0,1);t.c.gameTime+=1501;assert.equal(t.c.wtcmd_demolitionRecord(s),null);
});
const frontend=fs.readFileSync('app/src/main/assets/warzone-command-pages.js','utf8');
const part=(source,start,end)=>{const a=source.indexOf('  function '+start+'('),b=source.indexOf('  function '+end+'(',a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
function uiFixture(){
 const state={demolitionSerial:0,demolition:null,demolitionOpening:false,navigationSerial:0,catalog:{}};const file=new Map(),notices=[],requests=[],handlers={};
 const view={setDemolitionTargets(){},clearDemolition(){},highlightDemolition(){},pickDemolitionTarget:()=>({id:101,eligible:true,name:'Research Facility'})};
 const w={__towersHtml:{session:'battle',isEnded:()=>false},__kalaWarzoneTouch:{report:()=>({manualSelectionRevision:0})},WarzoneBuildDisplay:view};
 const text={textContent:'',title:''},button={textContent:''},bar={hidden:true,querySelector:s=>s==='span'?text:button};
 const c=vm.createContext({state,window:w,host:{},doc:{addEventListener(){}},document:{addEventListener:(name,fn)=>handlers[name]=fn},polishedTowers:true,module:()=>({FS:{writeFile:(p,s)=>file.set(p,s),rename:(a,b)=>{file.set(b,file.get(a));file.delete(a);}}}),element:id=>id==='wt-demolish-bar'?bar:null,install(){},notify:text=>notices.push(text),reason:code=>code,requestState(){},pause:()=>new Promise(()=>{}),send:(action,data)=>new Promise(resolve=>requests.push({action,data,resolve})),selectMode:async()=>true,Date,Math,Boolean,Promise});
 vm.runInContext(part(frontend,'sameDemolitionWorkers','selectMode'),c);
 const acceptStart=frontend.indexOf('  function accept('),acceptEnd=frontend.indexOf("  window.addEventListener('warzone-command-reply'",acceptStart);vm.runInContext(frontend.slice(acceptStart,acceptEnd),c);
 return{c,state,w,file,notices,requests,handlers,read:()=>JSON.parse(Array.from(file.values()).at(-1))};
}
check('real touch routing consumes taps/long holds/cancelled targeting without stock selection or orders',()=>{
 const touch=fs.readFileSync('app/src/main/assets/warzone-touch-controls.js','utf8');
 const state={pointers:new Map(),physicalPointers:new Set(),primaryId:null,single:null,multi:null,boxMode:false,queueMode:false,manualSelectionRevision:0};
 const events=[],target={},w={__warzoneCommands:{isPlacement:()=>false,isDemolishing:()=>true,previewDemolish:()=>events.push('preview'),demolishAt:()=>{events.push('demolish');return true;}},WarzoneTerrain:{active(){}}};
 const c=vm.createContext({state,window:w,canvas:()=>target,radarPoint:()=>null,isBattlefieldPoint:()=>true,focusCanvas(){},mouseMove(){},performance:{now:()=>100},TAP_SLOP:8,LONG_PRESS_MS:450,BOX_SELECT_START:12,PAN_START:14,
  setTimeout:()=>{throw Error('Demolition must not arm long-press stock input');},clearLongPress(){},own(){},capturePointer(){},releasePointer(){},feedback(){},vibrate(){},coalesced:e=>[e],click:()=>{throw Error('Demolition gesture leaked into a native selection/move');},releaseMouse:()=>events.push('camera-release'),
  beginPan:g=>{g.panning=true;events.push('pan');},advancePan(){},Math,Number});
 vm.runInContext(part(touch,'beginSingle','beginBoxSelection')+part(touch,'processPointer','releaseAll'),c);
 const e=(type,x=20,timeStamp=100)=>({type,clientX:x,clientY:20,timeStamp,pointerId:1,target});
 c.processPointer(e('pointerdown'));assert.equal(state.single.demolition,true);assert.equal(state.manualSelectionRevision,0);
 c.processPointer(e('pointerup',20,900));assert.equal(events.filter(s=>s==='demolish').length,1,'slow taps do not become stock right-clicks');
 c.processPointer(e('pointerdown'));w.__warzoneCommands.demolishAt=()=>false;c.processPointer(e('pointerup'));assert.equal(state.manualSelectionRevision,0,'cancelled mode retains ownership of its in-flight touch');
 c.processPointer(e('pointerdown'));c.processPointer(e('pointermove',60,120));c.processPointer(e('pointerup',60,150));assert.ok(events.includes('pan'));assert.equal(events.filter(s=>s==='demolish').length,1,'camera pan never becomes demolition');
});
async function settle(){for(let i=0;i<8;i++)await Promise.resolve();}
(async()=>{
 const hotkey=uiFixture();const hotkeyArm=hotkey.c.toggleDemolish();await settle();hotkey.handlers.keydown({key:'F8',preventDefault(){throw Error('QuickLoad must retain its native hotkey');}});hotkey.requests[0].resolve({ok:true,result:{workerIds:[1],targets:[],gameTime:100}});assert.equal(await hotkeyArm,false);assert.equal(hotkey.state.demolition,null);
 const nativeReset=uiFixture();const resetArm=nativeReset.c.toggleDemolish();await settle();nativeReset.c.accept({action:'demolish-reset',gameTime:10000});nativeReset.requests[0].resolve({ok:true,result:{workerIds:[1],targets:[],gameTime:100}});assert.equal(await resetArm,false);assert.equal(nativeReset.state.demolition,null);checks++;console.log('PASS: F8 and direct native load event cancel an opening UI without waiting for clock rewind');
 const ui=uiFixture();const opening=ui.c.toggleDemolish();await settle();assert.equal(ui.requests[0].action,'demolish-state');ui.c.cancelDemolish();ui.requests[0].resolve({ok:true,result:{workerIds:[1],targets:[],gameTime:1}});assert.equal(await opening,false);assert.equal(ui.state.demolition,null);checks++;console.log('PASS: delayed arm response cannot reopen a cancelled tool');
 const ready=uiFixture();const arm=ready.c.toggleDemolish();await settle();ready.requests[0].resolve({ok:true,result:{workerIds:[1],targets:[],gameTime:1}});assert.equal(await arm,true);assert.equal(ready.read().active,true);
 assert.equal(ready.c.demolishAt(10,10),true);assert.equal(ready.requests[1].data.intent,ready.state.demolition.intent);ready.c.cancelDemolish();assert.equal(ready.read().active,false);ready.requests[1].resolve({ok:true});await Promise.resolve();assert.equal(ready.state.demolition,null);checks++;console.log('PASS: targeting cancellation revokes intent and delayed order acknowledgement cannot reopen UI');
 const fresh=uiFixture();const p=fresh.c.toggleDemolish();await settle();fresh.requests[0].resolve({ok:true,result:{workerIds:[1],targets:[],gameTime:1}});await p;fresh.c.acceptDemolitionState(fresh.state.demolition,{ok:true,result:{workerIds:[2],targets:[],gameTime:2}});assert.equal(fresh.state.demolition,null);assert.equal(fresh.read().active,false);checks++;console.log('PASS: manual selected-group change invalidates targeting without recruiting another truck');
 const geometrySource=fs.readFileSync('tools/test-module-target-display.cjs','utf8');
 const setupGeometry=vm.runInNewContext(geometrySource.slice(0,geometrySource.indexOf('(async()=>'))+'\nfixture;', {require,console});
 const geometry=await setupGeometry(),catalog=JSON.parse(fs.readFileSync('app/src/main/assets/warzone/command-catalog.json'));
 geometry.api.setDemolitionTargets([{id:20,itemId:'A0ResearchFacility',name:'Research Facility',x:5,y:5,z:0,width:2,breadth:2,eligible:true},{id:21,itemId:'A0CommandCentre',name:'Command Centre',x:9,y:5,z:0,width:2,breadth:2,eligible:false,protected:true}],catalog,[]);
 let report=geometry.api.demolitionReport(true);assert.ok(report.targets[0].hitPoints.length,'actual model supplies targeting points');const hit=report.targets[0].hitPoints[0];assert.equal(geometry.api.pickDemolitionTarget(hit.x,hit.y).id,20);
 geometry.api.highlightDemolition(20);geometry.frame();assert.equal(geometry.api.report().error,'');
 const roof=report.targets[0].hitPoints.map(p=>({...p}));geometry.api.setDemolitionTargets([{id:20,itemId:'A0ResearchFacility',name:'Research Facility',x:5,y:5,z:0,width:2,breadth:2,eligible:true,foundation:true}],catalog,[]);report=geometry.api.demolitionReport(true);assert.ok(report.targets[0].hitPoints.length);assert.notDeepEqual(copy(report.targets[0].hitPoints),roof,'foundation uses footprint instead of future complete mesh');geometry.api.clearDemolition();assert.equal(geometry.api.pickDemolitionTarget(hit.x,hit.y),null);checks++;console.log('PASS: actual model/footprint targeting, render and cancellation execute in geometry fixture');
 const createHash=require('node:crypto').createHash;
 const proof={version:'0.36',scope:'Demolish focused code/VM/geometry checks; no native gameplay or emulator verification',passed:true,checks,recordedUTC:new Date().toISOString(),sources:['app/src/main/assets/warzone/index.html','scenario/warzone-towers-commands.js','app/src/main/assets/warzone-command-pages.js','app/src/main/assets/warzone-touch-controls.js','app/src/main/assets/warzone/ui/build-display.js','tools/check-demolish-036.cjs'].map(path=>({path,sha256:createHash('sha256').update(fs.readFileSync(path)).digest('hex')}))};
 fs.mkdirSync('qa/0.36-demolish',{recursive:true});fs.writeFileSync('qa/0.36-demolish/source-checks.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
})().catch(error=>{console.error(error);process.exitCode=1;});
