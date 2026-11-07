'use strict';
// Module-specific asynchronous UI behaviour, with native replies deliberately delayed.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warzone-command-pages.js','utf8');
const lab={id:71,moduleId:'A0ResearchModule1',itemId:'A0ResearchFacility',x:4,y:71,modules:0,reserved:0,maximum:1,status:'eligible',eligible:true,statusReason:''};
const factory={...lab,id:18,moduleId:'A0FacMod1',itemId:'A0LightFactory',x:28,y:18,maximum:2};
const moduleItem={id:lab.moduleId,category:'MODULES',name:'Research Module'},factoryItem={id:factory.moduleId,category:'MODULES',name:'Factory Module'},tower={id:'GuardTower1',category:'DEFENCES'};
let hit=lab,clears=0,updates=0,terrainPicks=0;const notices=[],requests=[],nodes=new Map();
const element=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,style:{},setAttribute(){},innerHTML:''});return nodes.get(id);};
const state={placement:moduleItem,session:'module',nativeBuildGroup:[1,3],modulePending:new Map(),moduleSerial:0,snapshot:{moduleTargets:[lab],jobs:[],gameTime:1000},siteChecks:0,placements:0,cancelSerial:0,buildParticipants:[]};
const context=vm.createContext({state,Map,Set,Array,Number,Promise,Math,innerWidth:1000,innerHeight:600,element,notify:s=>notices.push(s),reason:s=>s,updateSidebarQueue:()=>updates++,requestState(){},
 document:{getElementById:()=>({querySelector:()=>null})},
 window:{__towersHtml:{isEnded:()=>false},WarzoneTerrain:{pick:(x,y)=>{terrainPicks++;return{x,y};}},WarzoneBuildDisplay:{pickModuleTarget:()=>hit,preview(){},clearPreview:()=>clears++}},
 send:(action,data)=>new Promise(resolve=>requests.push({action,data,resolve}))});
vm.runInContext(source.slice(source.indexOf('  function reconcileModuleRequests('),source.indexOf('  function openNative(')),context);
vm.runInContext(source.slice(source.indexOf('  function selectedBuildGroup('),source.indexOf('  function subtractSelectionRect(')),context);
state.buildSelectionView=context.buildSelectionView(); // This fixture already owns its verified [1,3] native group.
vm.runInContext(source.slice(source.indexOf('  function previewAt('),source.indexOf('  let validationTimer;')),context);
const tick=()=>new Promise(r=>setImmediate(r));
const target=id=>context.moduleTargets().find(t=>t.id===id);
const reset=(item,parent)=>{assert.equal(requests.length,0);state.placement=item;state.snapshot={moduleTargets:[{...parent}],jobs:[],gameTime:1000};state.modulePending.clear();state.previewPoint=null;hit=parent;};
(async()=>{
 state.category='MODULES';context.updateModuleGuidance();assert.match(element('wt-module-guidance').innerHTML,/highlighted research lab/);
 state.placement=null;context.updateModuleGuidance();assert.match(element('wt-module-guidance').innerHTML,/Choose a module/);
 state.placement=moduleItem;context.updateModuleGuidance();assert.match(element('wt-module-guidance').innerHTML,/highlighted research lab/,'reselecting the same module after cancellation restores its current guidance');
 assert.equal(context.placeAt(390,282),true);assert.equal(terrainPicks,0,'module roof hit identifies actual parent without a ground-ray fallback');
 assert.equal(target(71).eligible,false,'first touch immediately reserves the one slot while acknowledgement is outstanding');
 context.placeAt(390,282);await tick();assert.equal(requests.length,1,'rapid duplicate touch cannot queue a second one-slot upgrade');
 assert.equal(notices.at(-1),'module-pending');const first=requests.shift();assert.equal(first.action,'queue-build');assert.equal(first.data.parentId,71);assert.equal(first.data.x,4);assert.equal(first.data.y,71);assert.deepEqual(Array.from(first.data.workerIds),[1,3]);
 const beforeClear=clears;first.resolve({ok:true,gameTime:1100,result:{id:'lab-job',parentId:71,targetModules:1,workers:[1,3]}});await tick();assert.ok(clears>beforeClear,'accepted matching module clears preview');assert.equal(state.previewPoint,null);
 state.snapshot={moduleTargets:[{...lab,status:'upgrading',modules:1,reserved:0,eligible:false,statusReason:'module-pending'}],jobs:[{id:'lab-job'}],gameTime:1200};context.reconcileModuleRequests();assert.equal(state.modulePending.size,0);assert.equal(target(71).reserved,0,'native capacity already reflected at START is not counted twice');
 reset(factoryItem,factory);context.placeAt(100,100);context.placeAt(100,100);context.placeAt(100,100);await tick();assert.equal(requests.length,2,'factory supports two deliberate slot reservations but rejects a third');assert.equal(target(18).reserved,2);
 const [one,two]=requests.splice(0);one.resolve({ok:true,gameTime:1100,result:{id:'factory-1',parentId:18,targetModules:1,workers:[1,3]}});two.resolve({ok:true,gameTime:1100,result:{id:'factory-2',parentId:18,targetModules:2,workers:[1,3]}});await tick();
 state.snapshot={moduleTargets:[{...factory,modules:1,reserved:1,status:'upgrading',eligible:false,statusReason:'module-pending'}],jobs:[{id:'factory-1'},{id:'factory-2'}],gameTime:1200};context.reconcileModuleRequests();assert.equal(state.modulePending.size,0);assert.equal(target(18).modules+target(18).reserved,2);
 reset(moduleItem,lab);context.placeAt(10,10);await tick();const rejected=requests.shift();rejected.resolve({ok:false,reason:'unreachable'});await tick();assert.equal(state.modulePending.size,0,'rejection frees local slot for retry');assert.equal(target(71).eligible,true);
 context.placeAt(10,10);await tick();const delayed=requests.shift();state.placement=tower;state.previewPoint={x:8,y:40};const ordinaryClear=clears;delayed.resolve({ok:true,gameTime:1300,result:{id:'late-module',parentId:71,targetModules:1,workers:[1,3]}});await tick();assert.equal(clears,ordinaryClear,'old module acknowledgement cannot erase a newer ordinary-building preview');
 reset(moduleItem,{...lab,modules:1,status:'full',eligible:false,statusReason:'module-limit'});context.placeAt(10,10);await tick();assert.equal(requests.length,0);assert.equal(notices.at(-1),'module-limit');
 hit=null;context.placeAt(1,1);await tick();assert.equal(requests.length,0);assert.match(notices.at(-1),/highlighted matching building/);
 assert.ok(updates>0);console.log('PASS: actual-parent module targeting, immediate reservations, rapid duplicate suppression, two factory slots, capacity-start reconciliation, rejection retry and newer-preview preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
