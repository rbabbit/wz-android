'use strict';
// Actual JS controllers/transport in bounded VM fixtures. Native selection,
// production, rendering and exact-APK gameplay are separate delivery evidence.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'app/src/main/assets');
const read=name=>fs.readFileSync(path.join(assets,name),'utf8').replace(/\r\n/g,'\n');
const touch=read('warzone-touch-controls.js'),mp=read('multiplayer/mobile-controls.js'),campaign=read('warzone-campaign-hud.js');
const {fixture:mpFixture}=require('./combat-ui-fixture-090.cjs');
const checks=[];
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
function between(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,start);return source.slice(a,b);}
function fn(source,name){const match=new RegExp('^  (?:async )?function '+name+'\\(','m').exec(source);assert(match,name);const after=source.slice(match.index+match[0].length),next=/^  (?:async )?function /m.exec(after);return source.slice(match.index,next?match.index+match[0].length+next.index:source.length).trim();}
function button(){const classes=new Set();return{dataset:{},attrs:{},style:{},classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name),contains:name=>classes.has(name)},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];}};}
function offline(){
 let now=1000,packet={schemaVersion:89,frame:1,gameTime:1000,realTime:1000,player:0,playing:true,worldSafe:true,
  combatSelection:{player:0,combatIds:[11,12],selectedIds:[]},combatLock:{context:'offline-world-1',enabled:false,activation:'',combatIds:[11,12],selectedIds:[]}};
 const nodes=new Map(['wt-all-combat','wt-campaign-all-combat','blocknight-select-all','blocknight-base','wt-open-factory'].map(id=>[id,button()]));
 const doc={hidden:false,activeElement:null,getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[]};
 const flags={page:'',buildOpen:false,placement:false,selectingTrucks:false,nativeMenu:'',exitingBuild:false};
 const requests=[],files=new Map(),timers=new Map(),orders=[],keys=[];let timer=0;
 const module=()=>({calledRun:true,FS:{readFile:name=>{if(name==='/tmp/warzone-combat-selection-v89.json')return JSON.stringify(packet);if(files.has(name))return files.get(name);throw Error('ENOENT');},
  writeFile:(name,value)=>files.set(name,value),rename:(a,b)=>{files.set(b,files.get(a));files.delete(a);requests.push(JSON.parse(files.get(b)));}}});
 const window={LaunchedModule:module(),__towersHtml:{session:'match1',isEnded:()=>false},__warzoneCommands:{report:()=>flags,cancelLinePlacement(){}},__blockNightResearch:{report:()=>({})},WarzoneSavedGames:{ready:true}};
 const state={combatLock:false,autoFight:false,battleActive:true,hudVisible:true,pointers:new Map(),physicalPointers:new Set(),mouseButton:null,heldKeys:new Set(),single:null,multi:null,panRelease:null,queueModifierHeld:false,queueMode:false,boxMode:false,
  pointerQueue:[],panDeferredPointers:[],afterInput:[],primaryId:null,ignoreUntilAllUp:false,combatOrders:0,patrolOrders:0};
 const context=vm.createContext({window,document:doc,state,ZOOM_PRESETS:{},Date:{now:()=>now},performance:{now:()=>now},Set,Map,JSON,Number,Math,
  commandDocument:()=>doc,pendingNativeInput:()=>false,canvas:()=>({inert:false}),setTimeout:(callback,ms)=>{const id=++timer;timers.set(id,{callback,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
  contextualClick:(...args)=>orders.push(args),feedback(){},vibrate(){},pressKey:(...args)=>keys.push(args),dispatchKey:(...args)=>keys.push(args),
  cancelFacilityNavigation(){},cancelFramePan(){},clearMultiMove(){},clearLongPress(){},releaseTilt(){},releaseRotation(){},releaseCameraKeys(){},cancelClicks(){},releasePointer(){},setQueueModifier(){}});
 vm.runInContext('let combatSerial=0,patrolArmed=false;const combatTimers=new Set();function cancelCombatInput(){combatSerial++;for(const id of combatTimers)clearTimeout(id);combatTimers.clear();patrolArmed=false;return false;}function combatLater(callback,delay){const generation=combatSerial;const id=setTimeout(()=>{if(generation===combatSerial)callback();},delay);combatTimers.add(id);}\n'+
  between(touch,'  let combatSelectionWatch =','  function updateCombatHud()')+'\n'+fn(touch,'updateCombatHud')+'\n'+fn(touch,'toggleCombatLock')+'\n'+fn(touch,'releaseAll')+'\n'+fn(touch,'queueCombatOrder')+'\n'+fn(touch,'setHeaderMenuState')+
  '\nthis.api={refreshCombatLock,refreshCombatSelection,toggleCombatLock,holdCombatSelection,resumeCombatSelection,resetCombatMode,releaseAll,queueCombatOrder,setHeaderMenuState,nativeSelectVisibleTrucks,cancelConstructorSelection};',context);
 const micro=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 async function advance(ms){const end=now+ms;await micro();for(let n=0;n<10000;n++){const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;timers.delete(next[0]);now=next[1].at;next[1].callback();await micro();}now=end;await micro();}
 const last=()=>requests.filter(request=>typeof request.enabled==='boolean').at(-1);
 function consume(extra={}){const request=last();Object.assign(packet.combatLock,{enabled:request.enabled,suspended:request.suspended,requestedSuspended:request.suspended,activation:request.activation,context:request.context,requestNonce:request.nonce,...(request.deselect?{deselectNonce:request.nonce}:{}),...extra});packet.frame++;packet.gameTime+=100;packet.realTime+=100;}
 context.api.refreshCombatSelection();
 return{api:context.api,context,state,flags,doc,nodes,window,requests,last,orders,keys,advance,consume,get packet(){return packet;},newModule(){window.LaunchedModule=module();}};
}
function assertOn(f){assert.equal(f.state.combatLock,true);assert.equal(f.nodes.get('wt-all-combat').dataset.combatEnabled,'true');assert.equal(f.nodes.get('wt-all-combat').attrs['aria-pressed'],'true');}
async function main(){
 await check('Offline requested latch is independent of empty/manual/partial/new native selection',()=>{
  const f=offline();assert.equal(f.api.toggleCombatLock(true),true);assertOn(f);f.consume({enabled:true});
  for(const ids of[[],[11],[11,12],[11,12,13]]){f.packet.combatSelection={player:0,combatIds:[11,12,13],selectedIds:ids};f.api.refreshCombatSelection();assertOn(f);}
  assert.equal(f.keys.length,0,'No synthetic combat-selection keys');
 });
 await check('Offline OFF survives suspension mailbox rewrite before native consumes it, then retires only on matching ACK',()=>{
  const f=offline();f.api.toggleCombatLock(true);f.consume();const activation=f.last().activation;f.api.toggleCombatLock(false);const first=f.last();assert.equal(first.deselect,true);
  f.flags.page='factory';f.api.refreshCombatLock();assert.equal(f.last().deselect,true);assert.equal(f.last().activation,activation);assert.notEqual(f.last().nonce,first.nonce);assert.equal(f.nodes.get('wt-all-combat').dataset.combatEnabled,'false');
  f.consume();f.api.refreshCombatLock();f.flags.page='';f.api.refreshCombatLock();assert.equal(f.last().deselect,false);assert.equal(f.state.combatLock,false);
  f.packet.combatSelection.selectedIds=[11,12];f.api.refreshCombatSelection();assert.equal(f.nodes.get('wt-all-combat').dataset.combatEnabled,'false','Manual complete selection while OFF never turns requested mode on');
 });
 await check('Offline same-context cleanup disables without deselect and keeps native activation token',()=>{
  const f=offline();f.api.toggleCombatLock(true);f.consume();const activation=f.last().activation;f.api.resetCombatMode();assert.equal(f.last().enabled,false);assert.equal(f.last().deselect,false);assert.equal(f.last().activation,activation);
 });
 await check('Ordinary release, constructor hold/build move and actual menu-close preserve request and resume effectively',()=>{
  const f=offline();f.api.toggleCombatLock(true);f.consume();f.api.holdCombatSelection('constructors');f.api.releaseAll(true);assertOn(f);assert.equal(f.last().suspended,true);
  f.api.setHeaderMenuState('factory',false);assert.equal(f.last().suspended,true,'Already-closed periodic header updates do not release constructor override');
  f.flags.buildOpen=true;f.api.resumeCombatSelection();assert.equal(f.last().suspended,true);f.flags.buildOpen=false;f.api.refreshCombatLock();assert.equal(f.last().suspended,false);assertOn(f);
  f.api.holdCombatSelection('constructors');f.api.setHeaderMenuState('factory',true);f.api.setHeaderMenuState('factory',false);assert.equal(f.last().suspended,false);assertOn(f);
 });
 await check('Offline context/module/session change resets without an explicit deselect operation',()=>{
  for(const change of[f=>f.packet.combatLock.context='offline-world-2',f=>f.newModule(),f=>f.window.__towersHtml.session='match2']){const f=offline();f.api.toggleCombatLock(true);f.consume();change(f);f.api.refreshCombatLock();assert.equal(f.state.combatLock,false);assert.equal(f.last().deselect,false);}
 });
 await check('Offline ON-order ACK wait cannot issue a late order after newer OFF or changed context',async()=>{
  for(const abort of[f=>f.api.toggleCombatLock(false),f=>{f.packet.combatLock.context='new';f.api.refreshCombatLock();}]){const f=offline();f.api.toggleCombatLock(true);const pending=f.api.queueCombatOrder(100,100,false);await f.advance(20);assert.equal(f.orders.length,0);abort(f);await f.advance(40);assert.equal(await pending,false);assert.equal(f.orders.length,0);}
 });
 await check('Offline order waits for actual native selected IDs and preserves native Patrol after ACK',async()=>{
  const f=offline();f.api.toggleCombatLock(true);const pending=f.api.queueCombatOrder(100,100,false);await f.advance(20);assert.equal(f.orders.length,0);f.consume();f.packet.combatSelection.selectedIds=[11,12];await f.advance(20);assert.equal(await pending,true);assert.equal(f.orders.length,1);
  const patrol=f.api.queueCombatOrder(110,120,true);assert.equal(await patrol,true);assert.equal(f.keys.at(-1)[0],'q');await f.advance(67);assert.equal(f.orders.length,2);assert.equal(f.state.patrolOrders,1);
 });
 await check('Offline native constructor request waits for exact suspension ACK and validates its scoped result',async()=>{
  const f=offline();f.api.toggleCombatLock(true);f.consume();const pending=f.api.nativeSelectVisibleTrucks();await f.advance(20);
  assert.equal(f.requests.filter(r=>r.action==='select-visible-trucks').length,0,'No request before suspension ACK');
  f.consume();await f.advance(25);const request=f.requests.filter(r=>r.action==='select-visible-trucks').at(-1);
  assert(request);assert.equal(request.combatIntentNonce,f.last().nonce);assert.equal(request.context,f.packet.combatLock.context);
  f.packet.constructorSelection={...request,ok:true,selectedIds:[21,22]};await f.advance(25);const reply=await pending;
  assert.equal(reply.ok,true);assert.deepEqual(Array.from(reply.selectedIds),[21,22]);assert.equal(reply.current(),true);assert.equal(f.keys.length,0);
 });
 await check('Offline native constructor empty ACK succeeds; mismatched result and stale user/context/manual work fail closed',async()=>{
  for(const ids of[[],[21,21]]){const f=offline();const pending=f.api.nativeSelectVisibleTrucks();f.consume();await f.advance(25);
   const request=f.requests.filter(r=>r.action==='select-visible-trucks').at(-1);f.packet.constructorSelection={...request,ok:true,selectedIds:ids};await f.advance(25);
   assert.equal((await pending).ok,ids.length===0);}
  for(const abort of[f=>f.api.toggleCombatLock(false),f=>{f.packet.combatLock.context='new';},f=>{f.state.manualSelectionRevision++;}]){
   const f=offline();f.api.toggleCombatLock(true);f.consume();const pending=f.api.nativeSelectVisibleTrucks();f.consume();await f.advance(25);
   const request=f.requests.filter(r=>r.action==='select-visible-trucks').at(-1);assert(request);abort(f);await f.advance(25);
   assert.equal((await pending).ok,false);assert.equal(f.requests.at(-1).action,'cancel','Pending native selector invalidated before late consumption');}
 });
 await check('Shared native picker commits exact constructor IDs, accepts empty and fences failed same-view retries',async()=>{
  const source=read('warzone-command-pages.js');
  for(const kind of['valid','empty','mixed','missing']){
   const calls=[],state={selectionPromise:null,selectionSerial:0,selectionEventSerial:0,nativeBuildGroup:[],truckSelectionCache:new Map()},node={hidden:true};
   const ids=kind==='empty'?[]:[21],units=kind==='empty'?[]:[{id:21,constructor:kind!=='mixed'}];
   const adapter={holdCombatSelection:()=>calls.push('hold'),resumeCombatSelection:()=>calls.push('resume'),releaseAll:()=>{},resumeInput:()=>{},report:()=>({manualSelectionRevision:0}),
    nativeSelectVisibleTrucks:async()=>{calls.push('native');return {ok:true,selectedIds:ids,player:0,current:()=>true};}};
   if(kind==='missing')delete adapter.nativeSelectVisibleTrucks;
   const context=vm.createContext({state,window:{__kalaWarzoneTouch:adapter},performance:{now:()=>1000},element:()=>node,buildSelectionView:()=> 'view1',awaitNativeClose:async()=>({ok:true}),
    selectionState:async()=>({ok:true,result:{player:0,selectedUnits:units,trucks:kind==='empty'?[]:[{id:21,selected:true}]}}),updateHUD(){},notify(){},renderSidebar(){},Promise,Set,Map,Number});
   vm.runInContext(fn(source,'selectedBuildGroup')+'\n'+fn(source,'selectVisibleTrucks')+'\nthis.pick=selectVisibleTrucks;',context);
   const selected=await context.pick();assert.equal(state.truckSelection.boxes,0);assert.equal(state.buildSelectionView,'view1');
   assert.equal(selected.length,kind==='valid'?1:0);assert.equal(state.truckSelection.phase,kind==='valid'?'selected':kind==='empty'?'empty':'stopped');
   vm.runInContext('function syncBuildGroup(){}\n'+fn(source,'refreshBuildSelection')+'\nthis.refresh=refreshBuildSelection;',context);
   const before=calls.filter(x=>x==='native').length;assert.equal(context.refresh(),null);assert.equal(calls.filter(x=>x==='native').length,before);
  }
 });
 await check('MP requested latch remains ON through actual selection changes and ordinary release/menu suspension',async()=>{
  const f=mpFixture();try{await f.advance(200);assert.equal(f.control.setCombatLock(true),true);f.ack({selectedIds:[]});for(const selectedIds of[[],[11],[11,12],[11,12,13]]){f.ack({combatIds:[11,12,13],selectedIds});f.control.refreshCombatLock();assert.equal(f.control.report().combatLockRequested,true);}
   f.control.releaseAll();f.flags.page=true;f.control.refreshCombatLock();assert.equal(f.native.combatLockIntent.enabled,true);assert.equal(f.native.combatLockIntent.suspended,true);f.flags.page=false;await f.advance(200);assert.equal(f.native.combatLockIntent.enabled,true);
  }finally{f.dispose();}
 });
 await check('MP OFF transport bit survives a pre-native suspension rewrite and cleanup retains activation',async()=>{
  const f=mpFixture();try{await f.advance(200);f.control.setCombatLock(true);f.ack();const activation=f.native.combatLockIntent.activation;f.control.setCombatLock(false);assert.equal(f.native.combatLockIntent.deselect,true);f.flags.page=true;f.control.refreshCombatLock();assert.equal(f.native.combatLockIntent.deselect,true);const nonce=f.native.combatLockIntent.nonce;f.ack({deselectNonce:nonce});f.control.refreshCombatLock();f.flags.page=false;await f.advance(200);assert.equal(f.native.combatLockIntent.deselect,false);
   f.control.setCombatLock(true);f.ack();const next=f.native.combatLockIntent.activation;assert.notEqual(next,activation);f.control.resetCombatMode();assert.equal(f.native.combatLockIntent.activation,next);assert.equal(f.native.combatLockIntent.enabled,false);assert.equal(f.native.combatLockIntent.deselect,false);
  }finally{f.dispose();}
 });
 await check('MP constructor hold persists until explicit combat return, preserving requested ON',async()=>{
  const f=mpFixture();try{await f.advance(200);f.control.setCombatLock(true);f.ack();f.touch.holdCombatSelection('constructors');f.control.releaseAll();await f.advance(200);assert.equal(f.control.report().combatLockRequested,true);assert.equal(f.native.combatLockIntent.suspended,true);f.touch.resumeCombatSelection();assert.equal(f.native.combatLockIntent.suspended,false);assert.equal(f.control.report().combatLockRequested,true);
  }finally{f.dispose();}
 });
 await check('MP native constructor facade waits for suspension ACK, returns exact IDs and cancels stale work',async()=>{
  const f=mpFixture();try{await f.advance(200);f.native.state.player=0;f.control.setCombatLock(true);f.ack();
   f.native.command=async(action,data,current)=>{assert.equal(action,'select-visible-trucks');assert.equal(current(),true);f.calls.push({action});return {ok:true,selectedIds:[21,22]};};
   const pending=f.touch.nativeSelectVisibleTrucks();await f.advance(20);assert.equal(f.calls.length,0);
   f.ack({requestedSuspended:true});await f.advance(25);const reply=await pending;assert.equal(reply.ok,true);assert.deepEqual(Array.from(reply.selectedIds),[21,22]);assert.equal(reply.player,0);assert.equal(reply.current(),true);
   f.touch.resumeCombatSelection();const cancelled=f.touch.nativeSelectVisibleTrucks();f.control.setCombatLock(false);await f.advance(25);assert.equal((await cancelled).ok,false);
  }finally{f.dispose();}
 });
 await check('Actual MP adapter refuses stale queued selectors and cancels only its own pending selection nonce',async()=>{
  const source=read('multiplayer/native-ui-adapter.js');
  for(const newer of[false,true]){
   let allowed=true,now=0;const files=new Map(),timers=[];
   const context=vm.createContext({module:{FS:{writeFile:(name,value)=>files.set(name,value)}},native:{state:{worldReady:true}},stopped:false,serial:0,queue:Promise.resolve(),guardedInput:null,
    read:name=>files.has(name)?JSON.parse(files.get(name)):null,ordersAllowed:()=>true,poll(){},fail(){},performance:{now:()=>now},setTimeout:fn=>timers.push(fn),Promise,Math,JSON,Date});
   vm.runInContext(between(source,' function cancelGuardedInput()',' function roomCommand(')+'\nthis.command=command;this.cancel=cancelGuardedInput;',context);
   const stale=await context.command('select-visible-trucks',{},()=>false);assert.equal(stale.ok,false);assert.equal(files.size,0);
   const pending=context.command('select-visible-trucks',{},()=>allowed);for(let i=0;i<5;i++)await Promise.resolve();
   const own=JSON.parse(files.get('/tmp/mp-mobile-input.json'));assert.equal(own.action,'select-visible-trucks');
   if(newer)files.set('/tmp/mp-mobile-input.json',JSON.stringify({nonce:'new-user-request',action:'deselect'}));
   allowed=false;context.cancel();const current=JSON.parse(files.get('/tmp/mp-mobile-input.json'));
   assert.equal(current.action,newer?'deselect':'cancel');assert.equal(current.nonce,newer?'new-user-request':own.nonce+'-cancel');
   now=20;timers.shift()();assert.equal((await pending).ok,false);
  }
 });
 await check('Latest ON supersedes an unconsumed OFF in both transports without reviving its deselect bit',async()=>{
  const f=offline();f.api.toggleCombatLock(true);f.consume();f.api.toggleCombatLock(false);const off=f.last();f.api.toggleCombatLock(true);assert.equal(f.last().enabled,true);assert.equal(f.last().deselect,false);assert.notEqual(f.last().activation,off.activation);Object.assign(f.packet.combatLock,{deselectNonce:off.nonce,activation:off.activation});f.api.refreshCombatLock();assertOn(f);
  const m=mpFixture();try{await m.advance(200);m.control.setCombatLock(true);m.ack();m.control.setCombatLock(false);const old=m.native.combatLockIntent;m.control.setCombatLock(true);assert.equal(m.native.combatLockIntent.enabled,true);assert.equal(m.native.combatLockIntent.deselect,false);assert.notEqual(m.native.combatLockIntent.activation,old.activation);m.native.state.combatLock.deselectNonce=old.nonce;m.control.refreshCombatLock();assert.equal(m.control.report().combatLockRequested,true);}finally{m.dispose();}
 });
 await check('MP rapid ON-order cannot leak a click after OFF/context/ownership loss and releases held input',async()=>{
  for(const abort of[f=>f.control.setCombatLock(false),f=>{f.native.state.combatLock.context='other';f.control.refreshCombatLock();},f=>{f.state.canIssueOrders=false;f.control.refreshCombatLock();}]){const f=mpFixture();try{await f.advance(200);f.control.setCombatLock(true);const pending=f.touch.nativeWorldClick(200,200);await f.advance(40);assert.equal(f.events.filter(e=>e.type==='pointerdown'&&e.button===0).length,0);abort(f);await f.advance(200);assert.equal(await pending,false);assert.equal(f.events.filter(e=>e.type==='pointerdown'&&e.button===0).length,0);assert.equal(f.control.report().heldMouse,null);assert.equal(f.control.report().heldKeys.length,0);}finally{f.dispose();}}
 });
 await check('MP native selection ACK unblocks a legitimate order without Ctrl+A selection spam',async()=>{
  const f=mpFixture();try{await f.advance(200);f.control.setCombatLock(true);const pending=f.touch.nativeWorldClick(200,200);await f.advance(40);f.ack({selectedIds:[11,12]});await f.advance(500);assert.equal(await pending,true);assert.equal(f.events.filter(e=>e.code==='KeyA').length,0);assert.equal(f.events.filter(e=>e.type==='pointerdown'&&e.button===0).length,1);}finally{f.dispose();}
 });
 await check('Campaign delegates all intent and has no competing selection command/file writer',()=>{
  assert(!campaign.includes('campaign-select-combat'));assert(!campaign.includes('campaign-control.json'));assert(campaign.includes('toggleCombatLock?.(force)'));assert(campaign.includes('combatLockRequested===true'));
 });
 await check('Shared constructor workflow preserves override during TRUCKS preparation and resumes on build exit',async()=>{
  const source=read('warzone-command-pages.js'),calls=[],state={exitPromise:null,selectionPromise:null,siteChecks:0,nativePendingSites:[],buildOpen:true,selectionSerial:0,menuRevision:0,cancelSerial:0};
  const node={hidden:false,focus(){}},adapter={releaseAll(){calls.push('release');},resumeCombatSelection(){assert.equal(state.exitingBuild,false);calls.push('resume');},report:()=>({queuedPointerEvents:0})};
  const context=vm.createContext({state,window:{__kalaWarzoneTouch:adapter},document:{getElementById:()=>node},host:{WarzoneHost:{restoreBattlefield(){}}},element:()=>node,cancelDemolish(){},cancelLinePlacement(){},cancelPlacement(){},drainBuildInput:async()=>{},close:async()=>{},closeNative:async()=>({ok:true}),awaitNativeClose:async value=>value,renderSidebar(){},updateHUD(){},Promise});
  vm.runInContext(fn(source,'selectMode')+'\nthis.selectMode=selectMode;',context);await context.selectMode(false,false,false,true);assert(!calls.includes('resume'));await context.selectMode();assert(calls.includes('resume'));
  const events=[new Map(),new Map()],removed=[],windows=events.map(map=>({addEventListener:(type,handler)=>map.set(type,handler),removeEventListener:(type,handler,capture)=>{assert.equal(capture,true);assert.equal(map.get(type),handler);map.delete(type);removed.push(type);}}));
  const child={defaultView:windows[0]},parent={defaultView:windows[1]},samples=[];
  const fence=vm.createContext({document:child,window:windows[0],commandDocument:()=>parent,Set,forwardedPointers:new WeakSet(),combatPhysicalPointers:new Set(),combatOrderSerial:0,combatInteractionUntil:0,combatNow:()=>1000,
   combatFenceDisposed:false,combatSelectionWatch:{},allCombatSelected:true,cancelConstructorSelection(){},setInterval:()=>1,clearInterval(){},refreshCombatSelection(){},refreshCombatLock(){samples.push(fence.combatPhysicalPointers.size);}});
  vm.runInContext(fn(touch,'physicalCombatInput').split('  const combatFenceTargets =')[0]+'\n'+between(touch,'  const combatFenceTargets =','  return "warzone-towers-touch'),fence);
  for(const map of events){map.get('pointerdown')({pointerType:'touch',pointerId:1,type:'pointerdown'});assert.equal(samples.at(-1),1);map.get('pointerup')({pointerType:'touch',pointerId:1,type:'pointerup'});assert.equal(samples.at(-1),0);}
  events[1].get('pointerdown')({pointerType:'touch',pointerId:2,type:'pointerdown'});events[0].get('pagehide')();
  assert.equal(removed.length,6);assert.equal(fence.combatPhysicalPointers.size,0);assert.equal(fence.combatFenceDisposed,true);
  for(const map of events)for(const type of['pointerdown','pointerup','pointercancel'])assert.equal(map.has(type),false);

 });
 const baseline=JSON.parse(fs.readFileSync(path.join(root,'tools/camera-function-baseline-089.json'),'utf8')),camera=[];
 await check('All 35 actual camera functions match retained normal89; no088 focus/preset pilot code',()=>{
  for(const row of baseline.functions){const current=sha(fn(read(row.path),row.function));assert.equal(current,row.sha256,row.path+' '+row.function);camera.push({...row,currentSHA256:current,unchanged:true});}
  assert(!mp.includes('setCameraFocused'));assert(!mp.includes('focusWorld'));assert(!touch.includes('camera-test-0.88'));
 });
 const edited=['warzone-touch-controls.js','warzone-campaign-hud.js','warzone-command-pages.js','multiplayer/mobile-controls.js','multiplayer/session.js','multiplayer/native-ui-adapter.js','warzone/ui/towers-game-controls.css'];
 for(const name of edited.filter(name=>name.endsWith('.js')))new vm.Script(read(name),{filename:name});
 const css=read('warzone/ui/towers-game-controls.css');assert(css.includes('--wt-button-bg:#000!important'));assert(css.includes('[data-combat-enabled=true]'));
 const report={passed:true,checks,checksPassed:checks.length,sources:edited.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(assets,name)))})),cameraFunctions:camera,
  inputIntegrationSeamsChanged:['pointer input suspension/gesture cancellation','input pump native selection ACK barrier','constructor hold and native selection intent'],normal089CameraFunctionsPreserved:true,abandoned088PilotExcluded:true,
  scope:'Actual JS/VFS/DOM VM checks; native reconciliation/production/selected-decoration rendering and exact-APK gameplay are verified separately.'};
 fs.writeFileSync(path.join(root,'release-records/all-combat-ui-090-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:checks.length,editedAssets:edited.length,cameraFunctions:camera.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
