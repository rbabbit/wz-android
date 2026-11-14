/* Behavioral input checks against the actual MP adapter, with a deterministic browser/input clock. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/src/main/assets/multiplayer/mobile-controls.js','utf8');
let checks=0;const failures=[];
const check=(value,label)=>{checks++;if(!value)failures.push(label);};
const equal=(value,expected,label)=>check(JSON.stringify(value)===JSON.stringify(expected),`${label}: ${JSON.stringify(value)} vs ${JSON.stringify(expected)}`);
function fixture(options={}){
  let now=0,serial=0;const timers=new Map(),listeners=new Map(),windowListeners=new Map(),events=[],calls=[],menus=[];
  const cameraRequests=[];let pendingCamera=null,cameraCancels=0;
  const flags={intel:false,commands:false,research:false,blocker:false};
  const rect={left:20,top:10,right:820,bottom:510,width:800,height:500};
  const frameRect={left:100,top:58,right:900,bottom:558,width:800,height:500};
  const add=(map,type,fn)=>{if(!map.has(type))map.set(type,[]);map.get(type).push(fn);};
  const timeout=(fn,delay=0)=>{const id=++serial;timers.set(id,{fn,due:now+Math.max(0,Number(delay)||0)});return id;};
  const clear=id=>timers.delete(id);
  class Event{
    constructor(type,options={}){this.type=type;Object.assign(this,options);}
    preventDefault(){this.defaultPrevented=true;}stopImmediatePropagation(){this.stopped=true;}
  }
  const node=id=>({id,hidden:false,setAttribute(name,value){this[name]=value;},classList:{toggle(){}},closest(){return null;}});
  const nodes=new Map();
  const frameElement={id:'warzone-game-frame',getBoundingClientRect:()=>frameRect,closest:s=>s==='#warzone-game-frame'?frameElement:null};
  const blocker=node('wt-build-sidebar');
  const parentDocument={body:{dataset:{research:'false'}},getElementById:id=>nodes.get(id)||null,
    elementFromPoint:()=>flags.blocker?blocker:frameElement};
  const canvas={id:'canvas',style:{},getBoundingClientRect:()=>rect,focus(){},setPointerCapture(){},releasePointerCapture(){},
    dispatchEvent(event){event.target=canvas;events.push(event);for(const fn of listeners.get(event.type)||[])fn(event);return true;}};
  const document={hidden:false,getElementById:id=>id==='canvas'?canvas:nodes.get(id)||null,
    addEventListener:(type,fn)=>add(listeners,type,fn),elementFromPoint:()=>flags.intel?node('mp-intelligence'):canvas};
  const limits={yawPeriod:65536,pitchMin:49516,pitchMax:65353,distanceMin:0,distanceMax:5000};
  const camera={x:2048,y:2048,yaw:10000,pitch:60000,distance:2600,limits};
  function applyCamera(target){
    if(Number.isFinite(target.yaw))camera.yaw=((Math.round(target.yaw)%65536)+65536)%65536;
    if(Number.isFinite(target.pitch))camera.pitch=Math.max(limits.pitchMin,Math.min(limits.pitchMax,Math.round(target.pitch)));
    if(Number.isFinite(target.distance))camera.distance=Math.max(limits.distanceMin,Math.min(limits.distanceMax,target.distance));
  }
  const native={state:{worldReady:true,nativeMenuOpen:false,view:{width:1600,height:1000,camera},radar:{visible:true,left:1200,top:600,right:1600,bottom:1000}},
    setCamera:target=>{cameraRequests.push({at:now,...target});pendingCamera={...target};if(!options.deferCamera){applyCamera(pendingCamera);pendingCamera=null;}return true;},
    cancelCamera:()=>{cameraCancels++;pendingCamera=null;return true;},
    command:(action,payload)=>{calls.push({action,payload});return Promise.resolve({ok:true});}};
  const commands={isOpen:()=>flags.commands,isPlacement:()=>false,isDemolishing:()=>false,beginLinePlacement:()=>null,
    selectNearbyTrucks:()=>{calls.push({action:'visible-trucks'});return Promise.resolve([101]);},toggle:()=>true};
  const parent={document:parentDocument,WarzoneHost:{},PcMultiplayerSession:{command:action=>{menus.push(action);return true;}}};
  const state={phase:'game',worldReady:true,nativeMenuOpen:false};
  const window={document,parent,frameElement,PcMultiplayerState:state,PcMultiplayerNative:native,__warzoneCommands:commands,
    __warzoneIntelligence:{isOpen:()=>flags.intel,report:()=>({open:flags.intel}),close:()=>{flags.intel=false;}},
    __blockNightResearch:{report:()=>({open:flags.research}),close:()=>{flags.research=false;}},
    addEventListener:(type,fn)=>add(windowListeners,type,fn)};
  vm.runInNewContext(source,{window,document,devicePixelRatio:2,performance:{now:()=>now},
    setTimeout:timeout,clearTimeout:clear,requestAnimationFrame:fn=>timeout(()=>fn(now),16),
    PointerEvent:Event,KeyboardEvent:Event,WheelEvent:Event,console});
  const control=window.PcMultiplayerControls,touch=window.__kalaWarzoneTouch;control.enable();
  const micro=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  async function advance(ms){const end=now+ms;await micro();let turns=0;
    while(turns++<20000){const next=[...timers.entries()].sort((a,b)=>a[1].due-b[1].due)[0];if(!next||next[1].due>end)break;
      timers.delete(next[0]);now=next[1].due;next[1].fn();await micro();}
    now=end;await micro();
  }
  async function until(predicate,label,limit=2500){for(let elapsed=0;elapsed<=limit;elapsed+=16){await micro();if(predicate())return true;await advance(16);}failures.push('Timed out: '+label);return false;}
  async function result(promise,label){let settled=false,value;Promise.resolve(promise).then(v=>{settled=true;value=v;},error=>{settled=true;failures.push(label+': '+error);});await until(()=>settled,label);return value;}
  const emit=(type,x,y,id=1)=>{const event=new Event(type,{pointerType:'touch',pointerId:id,clientX:x,clientY:y,target:canvas});for(const fn of listeners.get(type)||[])fn(event);return event;};
  const fire=(type)=>{for(const fn of windowListeners.get(type)||[])fn();};
  const idle=()=>!control.report().queued&&!control.report().activeJob;
  return {control,touch,flags,nodes,events,calls,menus,emit,advance,until,result,idle,fire,state,native,document,parentDocument,camera,cameraRequests,
    consumeCamera(){if(pendingCamera){applyCamera(pendingCamera);pendingCamera=null;}},cameraCancels:()=>cameraCancels,
    rect,frameRect,window,dispose(){fire('pagehide');timers.clear();}};
}
async function scenario(name,run,options){const f=fixture(options);try{await run(f);}catch(error){failures.push(name+': '+(error.stack||error));}finally{f.dispose();}}
function unwrapYaw(requests,start=10000){let previous=start,total=0;for(const request of requests){if(!Number.isFinite(request.yaw))continue;let delta=request.yaw-previous;delta=((delta+32768)%65536+65536)%65536-32768;total+=delta;previous=request.yaw;}return total;}
function cameraInput(events){return events.some(e=>e.type==='wheel'||e.type==='keydown'&&/^Numpad[2468]$/.test(e.code||''));}
async function fingerSpan(f,span,centre={x:400,y:220}){f.emit('pointermove',centre.x-span/2,centre.y,1);f.emit('pointermove',centre.x+span/2,centre.y,2);}
function downSpan(f,span=100,centre={x:400,y:220}){f.emit('pointerdown',centre.x-span/2,centre.y,1);f.emit('pointerdown',centre.x+span/2,centre.y,2);}
function liftSpan(f,span=100,centre={x:400,y:220}){f.emit('pointerup',centre.x-span/2,centre.y,1);f.emit('pointerup',centre.x+span/2,centre.y,2);}
(async()=>{
 await scenario('Custom command routing',async f=>{
   for(const action of ['research','manufacturing','build','queue'])check(f.control.command(action)!==false,'Custom command refused: '+action);
   await f.advance(200);equal(f.menus,['research','manufacturing','build','queue'],'Custom page commands bypassed session');
   check(!f.events.some(e=>/^F[123]$/.test(e.code||'')),'Custom page opened native F1/F2/F3');
 });
 await scenario('CSS/native selection coordinates',async f=>{
   const b=f.touch.nativeSelectionBounds();equal(b.radar,{left:620,top:310,right:820,bottom:510},'Radar scaling/offset mismatch');
   equal([b.left,b.top,b.right,b.bottom],[20,10,820,486],'Selection viewport bounds mismatch');
   check(await f.touch.nativeBoxSelect(40,30,240,130,true),'Native selection query failed');
   equal(f.calls.at(-1),{action:'select-box',payload:{left:40,top:40,right:440,bottom:240,add:true}},'Box coordinates not converted to native framebuffer');
   check(!f.touch.isBattlefieldPoint(700,400),'Radar incorrectly treated as battlefield');
   check(f.touch.isBattlefieldPoint(300,200),'Clear terrain blocked');
   check(!await f.touch.nativeBoxSelect(-1,30,240,130),'Out-of-bounds selection accepted');
   f.native.state.view.width=NaN;
   check(!await f.touch.nativeBoxSelect(40,30,240,130),'Invalid native viewport accepted');
 });
 await scenario('Parent/child panels and readiness',async f=>{
   f.flags.blocker=true;check(!f.touch.isBattlefieldPoint(300,200),'Parent panel not excluded');f.flags.blocker=false;
   f.flags.intel=true;check(!f.touch.isBattlefieldPoint(300,200),'Child Intelligence not excluded');
   check(!await f.result(f.touch.nativeWorldClick(300,200),'Intel world click'),'World click accepted behind child Intelligence');
   check(!await f.touch.nativeBoxSelect(100,100,200,200),'Box query accepted behind child Intelligence');f.flags.intel=false;
   f.flags.commands=true;check(!f.touch.isBattlefieldPoint(300,200),'Custom command page not excluded');f.flags.commands=false;
   f.flags.research=true;f.parentDocument.body.dataset.research='true';check(!f.touch.isBattlefieldPoint(300,200),'Research page not excluded');
   f.flags.research=false;f.parentDocument.body.dataset.research='false';
   f.state.worldReady=false;f.native.state.worldReady=false;
   check(!f.touch.isBattlefieldPoint(300,200),'Unready world is interactive');
   check(!await f.result(f.touch.nativeWorldClick(300,200),'Unready world click'),'Unready world click accepted');
   check(!await f.touch.nativeBoxSelect(100,100,200,200),'Unready world selection accepted');
 });
 await scenario('Programmatic world clicks respect field geometry',async f=>{
   check(!await f.result(f.touch.nativeWorldClick(-10,200),'Outside world click'),'Outside world click clamped into battlefield');
   check(!await f.result(f.touch.nativeWorldClick(700,400),'Radar world click'),'World click accepted on radar');
   f.flags.blocker=true;
   check(!await f.result(f.touch.nativeWorldClick(300,200),'Covered world click'),'World click accepted under parent panel');
 });
 await scenario('Cancellation settles queued and active click promises',async f=>{
   const settled=[];const a=f.touch.nativeWorldClick(200,100).then(value=>settled.push(['a',value]));
   const b=f.touch.nativeWorldClick(220,120,true).then(value=>settled.push(['b',value]));
   await f.until(()=>f.control.report().activeJob==='click','Active click');f.control.releaseAll();await f.advance(200);await Promise.all([a,b]);
   equal(settled.sort(),[['a',false],['b',false]],'Cancelled click promises not settled false');
   const report=f.control.report();check(report.heldMouse===null&&!report.heldKeys.length&&!report.pointers&&!report.queued,'Cancellation retained input');
   let ok;const c=f.touch.nativeWorldClick(300,150).then(value=>ok=value);await f.until(f.idle,'New click after cancellation');await c;check(ok===true,'Fresh click failed after cancellation');
 });
 await scenario('One-finger pan lifecycle',async f=>{
   f.emit('pointerdown',200,150);f.emit('pointermove',240,170);await f.until(()=>f.control.report().heldMouse===1,'Middle button pan down');
   f.emit('pointermove',270,180);await f.advance(32);f.emit('pointerup',270,180);await f.until(f.idle,'Pan release');
   check(f.control.report().pans===1,'Pan not recognized');
   check(f.events.some(e=>e.type==='pointerdown'&&e.button===1),'Pan did not use native middle button');
   check(f.events.some(e=>e.type==='pointerup'&&e.button===1),'Pan button was not released');
   check(!f.control.report().gestureActive,'Pan left input held');
 });
 await scenario('Pinch lifecycle and OS cancellation',async f=>{
   f.emit('pointerdown',250,200,1);f.emit('pointerdown',350,200,2);
   f.emit('pointermove',220,200,1);f.emit('pointermove',380,200,2);await f.advance(20);
   check(f.cameraRequests.some(request=>Number.isFinite(request.distance)),'Pinch did not target native camera distance');
   check(!cameraInput(f.events),'Pinch used uncontrolled wheel/key gain');
   f.emit('pointerup',220,200,1);f.emit('pointerup',380,200,2);await f.until(f.idle,'Pinch cleanup');check(!f.control.report().gestureActive,'Pinch left input held');
   f.events.length=0;f.cameraRequests.length=0;
   f.emit('pointerdown',250,200,1);f.emit('pointerdown',350,200,2);
   f.emit('pointermove',220,200,1);f.emit('pointermove',380,200,2);
   f.emit('pointercancel',380,200,2);f.emit('pointerup',220,200,1);await f.advance(100);
   check(!f.events.some(e=>e.type==='wheel'||e.type==='keydown')&&!f.cameraRequests.length,'Cancelled pending gesture emitted camera input');
   check(!f.control.report().gestureActive,'Cancelled pinch retained input');
 });
 await scenario('Long press box selection lifecycle',async f=>{
   f.emit('pointerdown',200,150);await f.advance(280);f.emit('pointermove',250,200);
   await f.until(()=>f.control.report().heldMouse===0,'Box selection left button down');
   f.emit('pointerup',260,210);await f.until(f.idle,'Box selection release');
   check(f.control.report().boxes===1,'Long press drag did not become selection');
   check(!f.control.report().gestureActive,'Box selection retained held input');
 });
 await scenario('Tilt lifecycle',async f=>{
   f.emit('pointerdown',250,200,1);f.emit('pointerdown',350,200,2);
   f.emit('pointermove',250,250,1);f.emit('pointermove',350,250,2);await f.advance(20);
   await f.until(()=>f.cameraRequests.some(request=>Number.isFinite(request.pitch)),'Native tilt target');
   f.emit('pointerup',250,250,1);f.emit('pointerup',350,250,2);await f.advance(200);
   check(!f.control.report().gestureActive,'Tilt retained held keys');
   check(!cameraInput(f.events),'Tilt used uncontrolled native key duration');
 });
 await scenario('Rotation lifecycle',async f=>{
   f.emit('pointerdown',250,200,1);f.emit('pointerdown',350,200,2);
   f.emit('pointermove',346.59,225.88,2);await f.advance(20);
   f.emit('pointermove',336.6,250,2);await f.advance(20);
   await f.until(()=>f.cameraRequests.some(request=>Number.isFinite(request.yaw)),'Native yaw target');
   f.emit('pointerup',250,200,1);f.emit('pointerup',336.6,250,2);await f.advance(200);
   check(!f.control.report().gestureActive,'Rotation retained held keys');
   check(!cameraInput(f.events),'Rotation used uncontrolled native key duration');
 });
 await scenario('One complete finger turn equals one unwrapped native turn',async f=>{
   const centre={x:400,y:220},radius=70;downSpan(f,radius*2,centre);
   for(let step=1;step<=48;step++){
     const angle=step*Math.PI/24,dx=Math.cos(angle)*radius,dy=Math.sin(angle)*radius;
     f.emit('pointermove',centre.x-dx,centre.y-dy,1);f.emit('pointermove',centre.x+dx,centre.y+dy,2);await f.advance(24);
   }
   liftSpan(f,radius*2,centre);await f.advance(200);
   const yaw=unwrapYaw(f.cameraRequests);check(Math.abs(Math.abs(yaw)-65536)<=2,`Full finger turn produced ${yaw} native units, expected one65536 turn`);
   check(!cameraInput(f.events),'Full turn used repeating keys/wheels');
   check(!f.control.report().gestureActive,'Full turn retained input');
 },{deferCamera:true});
 await scenario('Pinch distance is a span ratio without native frame feedback',async f=>{
   downSpan(f,90);for(let span=100;span<=170;span+=10){await fingerSpan(f,span);await f.advance(24);}
   const last=f.cameraRequests.filter(request=>Number.isFinite(request.distance)).at(-1);
   check(last&&Math.abs(last.distance-2600*90/170)<=1,`90→170 pinch target was ${last?.distance}, expected proportional1376.47`);
   for(let span=160;span>=90;span-=10){await fingerSpan(f,span);await f.advance(24);}
   const returned=f.cameraRequests.filter(request=>Number.isFinite(request.distance)).at(-1);
   check(returned&&Math.abs(returned.distance-2600)<=1,'Reverse pinch did not return to starting distance');
   liftSpan(f,90);await f.advance(200);check(!cameraInput(f.events),'Proportional pinch emitted old wheel input');
 },{deferCamera:true});
 await scenario('Tilt is bounded and independent of event cadence',async f=>{
   downSpan(f,100);for(let y=230;y<=470;y+=20){await fingerSpan(f,100,{x:400,y});await f.advance(24);}
   const targets=f.cameraRequests.filter(request=>Number.isFinite(request.pitch));check(targets.length>0,'Tilt has no native targets');
   check(targets.every(request=>request.pitch>=49516&&request.pitch<=65353),'Tilt target exceeded native bounds');
   check(targets.at(-1)?.pitch!==60000,'Tilt did not move from baseline');
   liftSpan(f,100,{x:400,y:470});await f.advance(100);check(!cameraInput(f.events),'Tilt emitted old key input');
 },{deferCamera:true});
 const cadence=[];
 for(const delay of [2,40])await scenario('Tilt cadence '+delay,async f=>{
   downSpan(f,100);for(let y=230;y<=290;y+=10){await fingerSpan(f,100,{x:400,y});await f.advance(delay);}
   liftSpan(f,100,{x:400,y:290});await f.advance(200);cadence.push(f.cameraRequests.filter(request=>Number.isFinite(request.pitch)).at(-1)?.pitch);
 },{deferCamera:true});
 check(cadence.length===2&&Number.isFinite(cadence[0])&&Math.abs(cadence[0]-cadence[1])<=1,'Tilt gain depends on move event cadence');
 await scenario('Close-finger zoom-to-rotation handoff is bounded',async f=>{
   const centre={x:400,y:220};downSpan(f,40,centre);await fingerSpan(f,52,centre);await f.advance(24);
   check(f.cameraRequests.some(request=>Number.isFinite(request.distance)),'Close-finger pinch did not start');
   for(let degrees=10;degrees<=60;degrees+=10){const angle=degrees*Math.PI/180,dx=Math.cos(angle)*26,dy=Math.sin(angle)*26;
     f.emit('pointermove',centre.x-dx,centre.y-dy,1);f.emit('pointermove',centre.x+dx,centre.y+dy,2);await f.advance(24);}
   const yaw=f.cameraRequests.filter(request=>Number.isFinite(request.yaw));
   check(yaw.length>0,'Close-finger gesture remained locked to zoom');
   const travel=Math.abs(unwrapYaw(yaw));check(travel>0&&travel<=65536/6+2,'Zoom-to-rotation handoff replayed excess angle');
   f.control.releaseAll();const before=f.cameraRequests.length;await f.advance(1000);
   check(f.cameraRequests.length===before,'Camera requests continued after handoff cancellation');
 },{deferCamera:true});
 await scenario('Cancelled camera mailboxes cannot apply after menus or exit',async f=>{
   downSpan(f,90);await fingerSpan(f,150);await f.advance(24);
   check(f.cameraRequests.length>0,'Camera cancellation fixture never queued a target');
   f.control.releaseAll();const before=f.cameraRequests.length;await f.advance(1000);f.consumeCamera();
   check(f.cameraRequests.length===before,'Camera callback survived releaseAll');
   check(f.camera.distance===2600,'Pending native camera target survived cancellation');
   check(f.cameraCancels()>0,'Native camera mailbox was not cancelled');
   f.flags.intel=true;downSpan(f,90);await fingerSpan(f,170);await f.advance(200);
   check(f.cameraRequests.length===before,'Intelligence allowed camera request');
 },{deferCamera:true});
 await scenario('Third finger cancels an existing native camera mailbox',async f=>{
   downSpan(f,90);await fingerSpan(f,150);await f.advance(24);
   check(f.cameraRequests.length>0,'Third-finger cancellation fixture has no pending camera');
   f.emit('pointerdown',500,280,3);f.consumeCamera();
   check(f.camera.distance===2600,'Third finger left an existing native camera target pending');
 },{deferCamera:true});
 await scenario('Room Ready remains usable; loading does not accept world input',async f=>{
   f.control.setPhase('room');f.state.phase='room';f.state.worldReady=false;
   f.emit('pointerdown',300,200);f.emit('pointerup',300,200);await f.until(f.idle,'Room UI click');
   check(f.events.some(e=>e.type==='pointerdown'&&e.button===0),'Room UI click blocked');
   f.events.length=0;f.control.setPhase('loading');f.state.phase='loading';
   f.emit('pointerdown',300,200);f.emit('pointerup',300,200);await f.advance(200);
   check(!f.events.some(e=>e.type==='pointerdown'),'Loading phase accepted native input');
 });
 await scenario('Phase changes and page exit release input',async f=>{
   f.emit('pointerdown',200,150);f.emit('pointermove',240,170);await f.until(()=>f.control.report().heldMouse===1,'Pan before phase change');
   f.control.setPhase('loading');await f.advance(200);check(!f.control.report().gestureActive,'Phase change retained input');
   f.control.setPhase('game');f.state.worldReady=true;
   let result;const pending=f.touch.nativeWorldClick(300,200).then(value=>result=value);
   f.fire('pagehide');await f.advance(200);await pending;check(result===false,'Page exit did not cancel click');
   check(!f.control.report().enabled&&!f.control.report().gestureActive,'Page exit retained enabled/held input');
 });
 console.log(JSON.stringify({checks,failures,passed:failures.length===0},null,2));if(failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
