/* Actual UI STOP routing/ACK functions; transport, native simulation and Android are separate checks. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..'),A=path.join(ROOT,'app/src/main/assets');
const source=name=>fs.readFileSync(path.join(A,name),'utf8');
const offline=source('warzone-touch-controls.js'),mp=source('multiplayer/mobile-controls.js'),adapter=source('multiplayer/native-ui-adapter.js');
function fn(text,name){const m=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(').exec(text);assert(m,name);let start=text.indexOf('{',m.index),depth=0;for(let i=start;i<text.length;i++){if(text[i]==='{')depth++;else if(text[i]==='}'&&!--depth)return text.slice(m.index,i+1);}throw Error(name);}
function ctx(text){const c=vm.createContext({console,Date,Promise,performance:{now:()=>1}});vm.runInContext(text,c);return c;}
const ev=(c,s)=>vm.runInContext(s,c),lit=JSON.stringify;
const checks=[];function check(name,run){run();checks.push(name);}
const request={nonce:'n',context:'c',activation:'a'};
const good={schemaVersion:93,...request,ok:true,reason:'queued',stoppedIds:[1],protectedIds:[2],selectedIds:[1,2]};
check('Offline and MP ACKs bind schema/nonce/context/activation and exact stopped/protected selected partition',()=>{
 for(const text of [offline,mp]){
  const c=ctx(fn(text,'guardedStopAckMatches'));
  for(const [patch,want]of [[{},true],[{nonce:'old'},false],[{context:'other'},false],[{activation:'other'},false],[{schemaVersion:92},false],
   [{stoppedIds:[1,2]},false],[{stoppedIds:[1,1]},false],[{stoppedIds:[3]},false],[{protectedIds:[]},false],
   [{ok:false},false],[{ok:false,stoppedIds:[],protectedIds:[],selectedIds:[]},true],
   [{stoppedIds:[],protectedIds:[1,2],selectedIds:[1,2],reason:'no-commandable-selection'},true]])
   assert.equal(ev(c,`guardedStopAckMatches(${lit({...good,...patch})},${lit(request)})`),want);
  const ids=Array.from({length:300},(_,i)=>i+1),large={...good,stoppedIds:ids.slice(0,299),protectedIds:[300],selectedIds:ids};
  assert.equal(ev(c,`guardedStopAckMatches(${lit(large)},${lit(request)})`),true);
 }
});
const setup=`
const files=new Map(),writes=[],timers=new Map();let nextTimer=0;
function setTimeout(cb){const n=++nextTimer;timers.set(n,cb);return n;}function clearTimeout(n){timers.delete(n);}
const nativeFS={writeFile(p,d){files.set(p,d);},rename(a,b){files.set(b,files.get(a));files.delete(a);writes.push({path:b,value:JSON.parse(files.get(b))});},readFile(p){if(!files.has(p))throw Error('missing');return files.get(p);}};
const window={Module:{calledRun:true,FS:nativeFS},__towersHtml:{session:'s',isEnded:()=>false},__warzoneCommands:{cancelLinePlacement(){}},BlockNightAndroid:{showNotice(){}}};
const document={hidden:false};const state={stopNonce:null,stopTimer:null,stopOrders:0,stopAcks:0,stoppedUnitIds:[],autoFight:false,battleActive:true,combatLock:true};
let combatOverride='',combatWorld={context:'c'},combatActivation='a',combatPacket={},pendingCombatStop=null,lastCombatStopAck=null,lastCombatStopRequest=null,lastStopRoute='',combatStopError='',combatStopSerial=0;
const campaign=false;function zoomModule(){return window.Module;}function releaseAll(){}function updateCombatHud(){}function toggleQueueMode(){}function vibrate(){}
`;
const oc=ctx(setup+['guardedStopAckMatches','guardedCombatStopCurrent','cancelGuardedCombatStop','pollGuardedCombatStop','startGuardedCombatStop','stopSelected'].map(n=>fn(offline,n)).join('\n'));
check('Offline ALL COMBAT STOP posts native mailbox and only matching native ACK completes diagnostics',()=>{
 assert.equal(ev(oc,'stopSelected()'),true);assert.equal(ev(oc,'lastStopRoute'),'native-combat-v93');
 assert.equal(ev(oc,'writes[0].path'),'/tmp/warzone-combat-stop-v93.json');
 ev(oc,`combatPacket.combatStop=${lit(good)};pollGuardedCombatStop();`);assert.equal(ev(oc,'state.stopAcks'),0);
 ev(oc,`combatPacket.combatStop={...${lit(good)},...pendingCombatStop.request};pollGuardedCombatStop();`);
 assert.equal(ev(oc,'state.stopAcks'),1);assert.equal(ev(oc,'JSON.stringify(state.stoppedUnitIds)'),'[1]');assert.equal(ev(oc,'pendingCombatStop'),null);
 assert.equal(ev(oc,'lastCombatStopAck.nonce===lastCombatStopRequest.nonce'),true);
});
check('Offline protected-only ACK is a successful no-op; stale world cancels without later success',()=>{
 ev(oc,'stopSelected();');ev(oc,`combatPacket.combatStop={...${lit(good)},...pendingCombatStop.request,stoppedIds:[],protectedIds:[1,2]};pollGuardedCombatStop();`);
 assert.equal(ev(oc,'state.stopAcks'),2);assert.equal(ev(oc,'state.stoppedUnitIds.length'),0);
 ev(oc,'stopSelected();combatWorld.context="new";pollGuardedCombatStop();');
 assert.equal(ev(oc,'pendingCombatStop'),null);assert.equal(ev(oc,'writes.at(-1).value.cancel'),true);assert.equal(ev(oc,'state.stopAcks'),2);
});
check('Offline timeout replaces pending native request with cancel and clears pending state',()=>{
 ev(oc,'combatWorld.context="c";stopSelected();timers.get(state.stopTimer)();');
 assert.equal(ev(oc,'writes.at(-1).value.cancel'),true);assert.equal(ev(oc,'state.stopNonce'),null);assert.equal(ev(oc,'combatStopError'),'native-stop-timeout');
});
check('Offline ordinary, constructor FIFO and Duel STOP retain legacy rule path, including tool teardown',()=>{
 for(const [lock,override,duel]of [[false,'',false],[true,'constructors',false],[true,'',true]]){
  const c=ctx(setup+fn(offline,'stopSelected')+`let guarded=0;function startGuardedCombatStop(){guarded++;return true;}`);
  ev(c,`state.combatLock=${lock};combatOverride=${lit(override)};window.__warzoneDuelConfig={mode:${lit(duel?'duel':'towers')}};window.__warzoneCommands.cancelLinePlacement=()=>{combatOverride='';};stopSelected();`);
  assert.equal(ev(c,'guarded'),0);assert.equal(ev(c,'writes[0].value.action'),'stop-selected');
  assert.equal(ev(c,'writes[0].path').endsWith('warzone-towers-control-command.json'),true);
 }
});
const route=ctx(`let allowed=true,combatLock=true,combatOverride='',nativeCalls=0,legacyCalls=0,manualSelectionRevision=0,single=null,multi=null,lastStopRoute='',lastAction='';const window={};const counts={commandCalls:0};const commands={stop:{value:'s',code:'KeyS',number:83}};function game(){return true;}function ordersAllowed(){return allowed;}function startGuardedCombatStop(){nativeCalls++;return true;}function clearLong(){}function releaseAll(){}function enqueue(){legacyCalls++;return true;}`+fn(mp,'command'));
check('MP route is guarded only while ALL COMBAT owns selection; worker/manual/observer behavior stays distinct',()=>{
 ev(route,'command("stop")');assert.equal(ev(route,'nativeCalls'),1);assert.equal(ev(route,'legacyCalls'),0);
 ev(route,'combatOverride="constructors";command("stop");combatLock=false;combatOverride="";command("stop")');assert.equal(ev(route,'legacyCalls'),2);
 ev(route,'allowed=false;command("stop")');assert.equal(ev(route,'nativeCalls'),1);assert.equal(ev(route,'legacyCalls'),2);
});
const ac=ctx(`const files=new Map(),writes=[];let guardedInput=null;const module={FS:{writeFile(p,d){files.set(p,d);writes.push(JSON.parse(d));}}};function read(p){return files.has(p)?JSON.parse(files.get(p)):null;}function fail(e){throw e;}`+fn(adapter,'cancelGuardedInput'));
check('MP pending STOP/truck cancellation replaces only its own current mailbox request',()=>{
 for(const action of ['stop-selected','select-visible-trucks']){
  ev(ac,`guardedInput={nonce:'n',action:${lit(action)},current:()=>false};files.set('/tmp/mp-mobile-input.json',JSON.stringify({nonce:'n',action:${lit(action)}}));cancelGuardedInput();`);
  assert.equal(ev(ac,'writes.at(-1).action'),'cancel');assert.equal(ev(ac,'guardedInput'),null);
 }
 const before=ev(ac,'writes.length');ev(ac,"guardedInput={nonce:'old',action:'stop-selected',current:()=>false};files.set('/tmp/mp-mobile-input.json',JSON.stringify({nonce:'new',action:'stop-selected'}));cancelGuardedInput();");assert.equal(ev(ac,'writes.length'),before);
});
async function asyncChecks(){
 const mc=ctx(`let enabled=true,phase='game',combatPageHidden=false,combatLock=true,combatOverride='',combatContext='c',combatActivation='a',pendingCombatStop=null,lastCombatStopAck=null,lastCombatStopRequest=null,lastStopRoute='',combatStopError='',stoppedUnitIds=[],lastError='',lastAction='',done;
 const counts={commandCalls:0,stopOrders:0,stopAcks:0},document={hidden:false},timers=new Map();let timer=0,cancels=0;
 function setTimeout(cb){timers.set(++timer,cb);return timer;}function clearTimeout(n){timers.delete(n);}function game(){return true;}function ordersAllowed(){return true;}function releaseAll(){}
 const native={combatStopIntent:null,cancelGuardedInput(){cancels++;},command(action,data,current){this.combatStopIntent={...data,nonce:'mp-n'+counts.stopOrders,action};if(!current())return Promise.resolve({ok:false,reason:'cancelled'});return new Promise(resolve=>{done=resolve;});}};const window={PcMultiplayerNative:native};
 `+['guardedStopAckMatches','cancelGuardedCombatStop','startGuardedCombatStop'].map(n=>fn(mp,n)).join('\n'));
 const result=ev(mc,'startGuardedCombatStop()');ev(mc,`done({...${lit(good)},...native.combatStopIntent});`);
 assert.equal(await result,true);assert.equal(ev(mc,'counts.stopAcks'),1);assert.equal(ev(mc,'JSON.stringify(stoppedUnitIds)'),'[1]');
 const stale=ev(mc,'startGuardedCombatStop()');ev(mc,`combatContext='other';done({...${lit(good)},...native.combatStopIntent});`);assert.equal(await stale,false);assert.equal(ev(mc,'counts.stopAcks'),1);
 const cancelled=ev(mc,"combatContext='c';startGuardedCombatStop()");ev(mc,"cancelGuardedCombatStop('selection-overridden')");assert.equal(await cancelled,false);assert.equal(ev(mc,'pendingCombatStop'),null);
 checks.push('MP queued STOP completes only its matching live ACK; context change and cancellation cannot count stale success');
 assert(adapter.includes("native.combatStopIntent=Object.freeze(request)"));
 console.log(JSON.stringify({passed:true,scope:'Actual extracted UI routes and ACK validation; native/Android checks separate',checkCount:checks.length,checks},null,2));
}
asyncChecks().catch(error=>{console.error(error);process.exitCode=1;});
