/* Actual MP controls/adapter in browser-clock and VFS fixtures. Native selection
 * and live multiplayer gameplay are verified separately; this is not an APK test. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
const controls=fs.readFileSync(root+'/app/src/main/assets/multiplayer/mobile-controls.js','utf8');
const adapter=fs.readFileSync(root+'/app/src/main/assets/multiplayer/native-ui-adapter.js','utf8');
let checks=0;const results=[];
async function check(label,fn){await fn();checks++;results.push(label);}
function fixture(){
 let now=0,id=0,queryResolve=null,failWrites=false;
 const timers=new Map(),listeners=new Map(),windowListeners=new Map(),events=[],calls=[],intents=[],trace=[];
 const flags={page:false,build:false,placement:false,trucks:false,demolish:false,intel:false,research:false};
 const add=(map,type,fn)=>{if(!map.has(type))map.set(type,[]);map.get(type).push(fn);};
 const timeout=(fn,delay=0)=>{const key=++id;timers.set(key,{fn,due:now+Math.max(0,Number(delay)||0)});return key;};
 class Event{constructor(type,value={}){this.type=type;Object.assign(this,value);}preventDefault(){}stopImmediatePropagation(){}}
 const rect={left:20,top:10,right:820,bottom:510,width:800,height:500};
 const canvas={style:{},getBoundingClientRect:()=>rect,focus(){},setPointerCapture(){},releasePointerCapture(){},
  dispatchEvent(event){event.target=canvas;events.push(event);trace.push(['event',event.type,event.code||event.button]);for(const fn of listeners.get(event.type)||[])fn(event);}};
 const document={hidden:false,getElementById:id=>id==='canvas'?canvas:null,addEventListener:(type,fn)=>add(listeners,type,fn)};
 const native={combatLockIntent:null,state:{worldReady:true,worldSafe:true,nativeMenuOpen:false,
  view:{width:1600,height:1000,camera:{x:2048,y:2048,yaw:10000,pitch:60000,distance:2600}},combatLock:{enabled:false,suspended:true,requestNonce:'initial',revision:0}},
  setCombatLock(value){if(failWrites)return false;const request={...value,nonce:'intent-'+intents.length};intents.push(request);trace.push(['intent',value.enabled,value.suspended]);this.combatLockIntent=request;return true;},
  setCamera(){return true;},cancelCamera(){return true;},
  command(action,data){calls.push({action,data});trace.push(['command',action]);if(action==='select-box')return new Promise(resolve=>{queryResolve=resolve;});return Promise.resolve({ok:true});}};
 const commands={report:()=>({page:flags.page?'factory':'',buildOpen:flags.build,placement:flags.placement?'factory':'',selectingTrucks:flags.trucks}),
  isOpen:()=>flags.page,isPlacement:()=>flags.placement,isDemolishing:()=>flags.demolish,
  beginLinePlacement:()=>null,selectNearbyTrucks:()=>{trace.push(['trucks']);return Promise.resolve([101]);}};
 const state={phase:'game',worldReady:true,worldSafe:true,nativeMenuOpen:false};
 const window={document,PcMultiplayerState:state,PcMultiplayerNative:native,__warzoneCommands:commands,
  __warzoneIntelligence:{isOpen:()=>flags.intel},__blockNightResearch:{report:()=>({open:flags.research})},
  addEventListener:(type,fn)=>add(windowListeners,type,fn)};
 window.parent=window;
 vm.runInNewContext(controls,{window,document,devicePixelRatio:2,performance:{now:()=>now},setTimeout:timeout,clearTimeout:key=>timers.delete(key),
  requestAnimationFrame:fn=>timeout(()=>fn(now),16),PointerEvent:Event,KeyboardEvent:Event,console});
 const control=window.PcMultiplayerControls,touch=window.__kalaWarzoneTouch;control.enable();
 const micro=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
 async function advance(ms){const end=now+ms;await micro();let turns=0;while(turns++<20000){const next=[...timers.entries()].sort((a,b)=>a[1].due-b[1].due)[0];if(!next||next[1].due>end)break;timers.delete(next[0]);now=next[1].due;next[1].fn();await micro();}assert.ok(turns<20000,'Fixture clock did not settle');now=end;await micro();}
 function ack(extra={}){native.state.combatLock={...native.state.combatLock,...native.combatLockIntent,requestNonce:native.combatLockIntent?.nonce,revision:native.state.combatLock.revision+1,...extra};}
 const emit=(type,x=250,y=180,pointerId=1)=>{const event=new Event(type,{target:canvas,pointerType:'touch',pointerId,clientX:x,clientY:y});for(const fn of listeners.get(type)||[])fn(event);};
 const fire=type=>{for(const fn of windowListeners.get(type)||[])fn();};
 const fireDocument=type=>{for(const fn of listeners.get(type)||[])fn();};
 const idle=()=>!control.report().activeJob&&!control.report().queued;
 async function until(predicate){for(let i=0;i<200;i++){if(predicate())return;await advance(16);}throw Error('Fixture timed out');}
 return{control,touch,flags,native,state,document,events,calls,intents,trace,advance,ack,emit,fire,fireDocument,idle,until,
  queryResult(value={ok:true}){queryResolve?.(value);queryResolve=null;},failWrites(value){failWrites=value;},dispose(){fire('pagehide');timers.clear();}};
}
async function scenario(label,fn){await check(label,async()=>{const f=fixture();try{await fn(f);}finally{f.dispose();}});}
async function armed(f){await f.advance(200);f.ack();assert.equal(f.control.setCombatLock(true),true);assert.equal(f.control.report().combatLock,false,'Pending native enable must not claim a selected army');f.ack();assert.equal(f.control.report().combatLock,true);}
async function adapterChecks(){
 const files=new Map(),writes=[],handlers=new Map();let denied=false;
 const sandbox={Promise,Date,performance,console:{warn(){}},setInterval(){},setTimeout,addEventListener:(type,fn)=>handlers.set(type,fn),
  document:{body:{addEventListener(){}},documentElement:{},getElementById(){return{};}},parent:{},dispatchEvent(){},CustomEvent:class{}};
 vm.runInNewContext(adapter,sandbox);const native=sandbox.PcMultiplayerNative;
 const FS={readFile(name){if(!files.has(name))throw Error('ENOENT');return files.get(name);},writeFile(name,text){if(denied)throw Error('Fixture denied write');files.set(name,text);writes.push(name);},
  rename(from,to){files.set(to,files.get(from));files.delete(from);},unlink(name){if(!files.delete(name))throw Error('ENOENT');}};
 sandbox.PcMultiplayerNativeUI.attach({FS});
 await check('Adapter rejects malformed and unready ON without writing',()=>{assert.equal(native.setCombatLock({enabled:true,suspended:false,activation:'one'}),false);for(const value of[null,{}, {enabled:1,suspended:false},{enabled:true,suspended:'false'}])assert.equal(native.setCombatLock(value),false);assert.equal(writes.length,0);});
 native.state={worldReady:true,worldSafe:true};
 await check('Adapter is atomic latest-write-only and does not fake native confirmation',()=>{assert.equal(native.setCombatLock({enabled:true,suspended:false}),false);assert.equal(native.setCombatLock({enabled:true,suspended:false,activation:'one'}),true);const first=JSON.parse(files.get('/tmp/mp-mobile-combat.json'));assert.equal(native.state.combatLock,undefined);assert.equal(native.setCombatLock({enabled:false,suspended:true}),true);const last=JSON.parse(files.get('/tmp/mp-mobile-combat.json'));assert.notEqual(first.nonce,last.nonce);assert.equal(last.enabled,false);assert.equal(last.suspended,true);assert.equal(last.activation,'one');assert.deepEqual({...native.combatLockIntent},last);assert.equal(files.has('/tmp/mp-mobile-combat.json.tmp'),false);assert.ok(writes.every(name=>name.endsWith('.tmp')));});
 await check('OFF is accepted in unsafe exit, rejected writes retain the last successful intent',()=>{native.state.worldReady=false;native.state.worldSafe=false;assert.equal(native.setCombatLock({enabled:false,suspended:true}),true);const before=native.combatLockIntent;denied=true;assert.equal(native.setCombatLock({enabled:false,suspended:true}),false);assert.equal(native.combatLockIntent,before);denied=false;});
 await check('Adapter page exit writes OFF before stopping and rejects every later ON',()=>{native.state.worldReady=true;native.setCombatLock({enabled:true,suspended:false,activation:'two'});handlers.get('pagehide')();assert.equal(JSON.parse(files.get('/tmp/mp-mobile-combat.json')).enabled,false);assert.equal(native.setCombatLock({enabled:true,suspended:false,activation:'three'}),false);assert.equal(native.setCombatLock({enabled:false,suspended:true}),true);});
}
(async()=>{
 await adapterChecks();
 await scenario('Enable waits for native authority and never synthesizes Ctrl+A',async f=>{await armed(f);assert.equal(f.control.report().combatLockRequested,true);assert.equal(f.native.combatLockIntent.suspended,false);assert.ok(!f.events.length&&!f.calls.length);const count=f.intents.length;await f.advance(1000);assert.equal(f.intents.length,count,'Idle policy must not repeatedly select/deselect units');});
 await scenario('Old OFF acknowledgement cannot cancel a new ON; acknowledged manual OFF is authoritative',async f=>{await f.advance(200);f.ack();f.control.setCombatLock(true);f.control.refreshCombatLock();assert.equal(f.control.report().combatLockRequested,true);f.ack();f.native.state.combatLock.enabled=false;f.native.state.combatLock.reason='manual-selection';f.control.refreshCombatLock();assert.equal(f.control.report().combatLockRequested,false);assert.equal(f.native.combatLockIntent.enabled,false);assert.equal(f.control.toggleCombatLock(),true);assert.equal(f.native.combatLockIntent.enabled,true);});
 await scenario('Late unsuspend retains its activation; only a deliberate enable can re-arm native manual OFF',async f=>{await armed(f);const activation=f.native.combatLockIntent.activation;assert.ok(activation);f.emit('pointerdown');assert.equal(f.native.combatLockIntent.activation,activation);f.emit('pointerup');await f.until(f.idle);assert.equal(f.native.combatLockIntent.activation,activation,'Input completion invented a new activation');f.ack({enabled:false,reason:'manual-selection'});f.control.refreshCombatLock();assert.equal(f.native.combatLockIntent.enabled,false);assert.equal(f.control.setCombatLock(true),true);assert.notEqual(f.native.combatLockIntent.activation,activation,'A deliberate new enable reused the blocked activation');});
 await scenario('Build, placement, demolition and research suspend intent then resume without orders',async f=>{await armed(f);for(const key of['build','placement','trucks','demolish','page','research','intel']){f.flags[key]=true;f.control.refreshCombatLock();assert.equal(f.native.combatLockIntent.enabled,true,key+' disabled the standing intent');assert.equal(f.native.combatLockIntent.suspended,true,key+' did not suspend selection');f.flags[key]=false;f.control.refreshCombatLock();assert.equal(f.native.combatLockIntent.suspended,false,key+' did not resume');}assert.ok(!f.events.length&&!f.calls.length);});
 await scenario('Automatic visible-truck box queries suspend before native selection and resume after acknowledgement',async f=>{await armed(f);f.trace.length=0;const query=f.touch.nativeBoxSelect(40,30,240,130,true);assert.deepEqual(f.trace.slice(0,2),[['intent',true,true],['command','select-box']]);assert.equal(f.native.combatLockIntent.suspended,true);await f.advance(300);assert.equal(f.native.combatLockIntent.suspended,true,'Pending query resumed before its result');f.queryResult();assert.equal(await query,true);assert.equal(f.control.report().combatLockRequested,true);assert.equal(f.native.combatLockIntent.suspended,false);});
 await scenario('Explicit Trucks, All Units and Deselect turn OFF before their native selection path',async f=>{for(const action of['trucks','all-units','deselect']){await armed(f);f.trace.length=0;await Promise.resolve(f.control.command(action));await f.until(f.idle);assert.deepEqual(f.trace[0],['intent',false,false],action+' must clear lock before selecting');assert.equal(f.control.report().combatLockRequested,false);if(action==='all-units')assert.ok(f.events.some(e=>e.type==='keydown'&&e.code==='KeyU'&&e.ctrlKey),'All Units lost stock Ctrl+U');}});
 await scenario('Manual box selection clears intent; ordinary battlefield taps and Stop retain it',async f=>{await armed(f);f.emit('pointerdown');f.emit('pointerup');await f.until(f.idle);assert.equal(f.control.report().combatLockRequested,true,'Contextual move/attack tap disabled lock');f.control.command('stop');await f.until(f.idle);assert.equal(f.control.report().combatLockRequested,true);assert.ok(f.events.some(e=>e.type==='keydown'&&e.code==='KeyS'));f.emit('pointerdown',200,150);await f.advance(280);f.emit('pointermove',250,200);assert.equal(f.control.report().combatLockRequested,false,'Manual selection kept automatic selection active');f.emit('pointerup',260,210);await f.until(f.idle);assert.equal(f.control.report().boxes,1);});
 await scenario('Pan keeps intent, queued input suspends it and cancellation leaves no later input',async f=>{await armed(f);f.emit('pointerdown',200,150);assert.equal(f.native.combatLockIntent.suspended,true);f.emit('pointermove',240,180);await f.until(()=>f.control.report().heldMouse===1);assert.equal(f.control.report().combatLockRequested,true);f.emit('pointerup',260,190);await f.until(f.idle);assert.equal(f.native.combatLockIntent.suspended,false);const click=f.touch.nativeWorldClick(250,200);f.control.releaseAll();const before=f.events.length;assert.equal(await click,false);await f.advance(300);assert.equal(f.events.length,before);assert.equal(f.control.report().combatLockRequested,true);assert.equal(f.native.combatLockIntent.suspended,false);});
 await scenario('Hidden pages suspend and phase departure/page exit permanently clear standing intent',async f=>{await armed(f);f.document.hidden=true;f.fireDocument('visibilitychange');assert.equal(f.native.combatLockIntent.enabled,true);assert.equal(f.native.combatLockIntent.suspended,true);f.document.hidden=false;f.fireDocument('visibilitychange');await f.advance(200);assert.equal(f.native.combatLockIntent.suspended,false);f.control.setPhase('loading');assert.equal(f.native.combatLockIntent.enabled,false);f.control.setPhase('game');await f.advance(300);assert.equal(f.control.report().combatLockRequested,false);await armed(f);f.fire('pagehide');const count=f.intents.length;assert.equal(f.native.combatLockIntent.enabled,false);await f.advance(1000);assert.equal(f.intents.length,count);assert.equal(f.control.report().enabled,false);assert.equal(f.control.setCombatLock(true),false);});
 await scenario('Failed native enable/override cannot fake a toggle or steal explicit selection',async f=>{await f.advance(200);f.failWrites(true);assert.equal(f.control.setCombatLock(true),false);assert.equal(f.control.report().combatLockRequested,false);f.failWrites(false);await armed(f);f.failWrites(true);assert.equal(f.control.command('trucks'),false);assert.ok(!f.trace.some(row=>row[0]==='trucks'));assert.equal(f.control.report().combatLockRequested,true);});
 const result={passed:true,checks,fixture:'Actual JS with deterministic browser clock and VFS. Native selection/new-unit behavior and APK gameplay are separate checks.',results};
 fs.mkdirSync(root+'/qa/multiplayer-071',{recursive:true});fs.writeFileSync(root+'/qa/multiplayer-071/combat-controls-host.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
