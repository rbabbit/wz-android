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
  view:{width:1600,height:1000,camera:{x:2048,y:2048,yaw:10000,pitch:60000,distance:2600}},combatLock:{context:'fixture-world-1',enabled:false,suspended:true,requestNonce:'initial',revision:0,combatIds:[11,12],selectedIds:[]}},
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
module.exports={fixture};
