'use strict';
// Actual adapter execution with a virtual browser/native-frame input oracle.
// No Android, browser, emulator, native game, camera rendering or live ads run.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),FILE='app/src/main/assets/warzone-touch-controls.js';
const source=()=>fs.readFileSync(path.join(ROOT,FILE),'utf8');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex');

function fixture(script=source(),options={}) {
 let now=0,next=0,nativeFrame=0,context,rendering=options.rendering!==false;
 const bounds=options.bounds||{x:0,y:0,left:0,top:0,right:1000,bottom:600,width:1000,height:600};
 const timers=new Map(),rafs=new Map(),nodes=new Map(),docEvents=new Map(),winEvents=new Map(),events=[],samples=[],calls=[];
 const native={x:0,y:0,buttons:new Set(),anchor:null,view:{x:0,y:0}};
 const style=()=>({setProperty(n,v){this[n]=v;},removeProperty(n){delete this[n];},getPropertyValue(n){return this[n]||'';}});
 class Event {
  constructor(type,init={}){this.type=type;this.defaultPrevented=false;this.stopped=false;Object.assign(this,init);}
  preventDefault(){this.defaultPrevented=true;}stopPropagation(){}stopImmediatePropagation(){this.stopped=true;}
 }
 const listen=(map,name,fn)=>{if(!map.has(name))map.set(name,[]);map.get(name).push(fn);};
 class Node {
  constructor(tag){this.tagName=tag.toUpperCase();this.style=style();this.dataset={};this.children=[];this.attributes=new Map();this.hidden=false;this.inert=false;this.listeners=new Map();const set=new Set();this.classList={add:(...v)=>v.forEach(x=>set.add(x)),remove:(...v)=>v.forEach(x=>set.delete(x)),contains:x=>set.has(x),toggle:(x,on)=>{if(on===undefined)on=!set.has(x);on?set.add(x):set.delete(x);return on;}};}
  set id(v){this._id=v;nodes.set(v,this);}get id(){return this._id||'';}
  append(...v){this.children.push(...v);}appendChild(v){this.append(v);return v;}remove(){}
  setAttribute(n,v){this.attributes.set(n,String(v));}getAttribute(n){return this.attributes.get(n)||null;}
  addEventListener(n,fn){listen(this.listeners,n,fn);}querySelector(){return null;}querySelectorAll(){return [];}
  focus(){document.activeElement=this;}setPointerCapture(){}releasePointerCapture(){}hasPointerCapture(){return false;}
  getBoundingClientRect(){return bounds;}
  dispatchEvent(e){e.target=this;for(const fn of docEvents.get(e.type)||[]){fn(e);if(e.stopped)break;}if(e.pointerType==='mouse'&&!e.stopped){events.push({type:e.type,x:e.clientX,y:e.clientY,button:e.button,buttons:e.buttons,ctrl:e.ctrlKey,time:now,frame:nativeFrame});native.x=e.clientX;native.y=e.clientY;if(e.type==='pointerdown'){native.buttons.add(e.button);if(e.button===1)native.anchor={x:e.clientX,y:e.clientY,view:{...native.view}};}if(e.type==='pointerup'){native.buttons.delete(e.button);if(e.button===1)native.anchor=null;}}for(const fn of this.listeners.get(e.type)||[])fn(e);return true;}
 }
 const canvas=new Node('canvas');canvas.id='canvas';
 const document={body:new Node('body'),head:new Node('head'),documentElement:new Node('html'),activeElement:null,
  createElement:tag=>new Node(tag),getElementById:id=>nodes.get(id)||null,addEventListener:(n,fn)=>listen(docEvents,n,fn),hasFocus:()=>false};
 document.body.append(canvas);
 const timeout=(fn,delay=0,repeat=0)=>{const id=++next;timers.set(id,{fn,at:now+Math.max(0,Number(delay)||0),repeat});return id;};
 const gl={COLOR_BUFFER_BIT:16384,FRAMEBUFFER_BINDING:36006,getParameter:()=>null,clear:()=>7};
 let placing=Boolean(options.placement),demolishing=Boolean(options.demolition);
 const commands={tower:true,isPlacement:()=>placing,isDemolishing:()=>demolishing,nativeMenuOpen:()=>false,nativeBuildOpen:()=>false,nativeHudHidden:()=>false,
  report:()=>({page:'',nativeMenu:'',buildOpen:false,placement:placing,demolition:demolishing,snapshot:{mapWidth:64,mapHeight:64,facilityTargets:[],selectedUnits:[],trucks:[]}}),
  hidePreview(){calls.push(['hide-preview']);},previewAt:(x,y)=>calls.push(['preview',x,y]),placeAt:(x,y)=>{calls.push(['place',x,y]);return true;},
  previewDemolish:(x,y)=>calls.push(['demolish-preview',x,y]),demolishAt:(x,y)=>{calls.push(['demolish',x,y]);return true;},
  beginLinePlacement:(x,y)=>options.line?{id:'line',x,y}:null,updateLinePlacement:(line,x,y)=>calls.push(['line-move',x,y]),
  endLinePlacement:(line,x,y)=>{calls.push(['line-end',x,y]);return true;},cancelLinePlacement:()=>calls.push(['line-cancel']),
  cancelDemolish:()=>{demolishing=false;},cancelPlacement:()=>{placing=false;},send:()=>Promise.resolve({ok:true})};
 const window={document,parent:null,devicePixelRatio:2,innerWidth:1000,innerHeight:600,PointerEvent:Event,
  __warzoneCommands:commands,__towersHtml:{isEnded:()=>false},WarzoneTerrain:{active:()=>calls.push(['terrain'])},
  LaunchedModule:{ctx:options.noContext?null:gl,FS:{readFile:()=> 'radarZoom=24\nvoicevol=100\nfxvol=100\n',writeFile(){},rename(){}}},
  addEventListener:(n,fn)=>listen(winEvents,n,fn),dispatchEvent:e=>{for(const fn of winEvents.get(e.type)||[])fn(e);return true;},matchMedia:()=>({matches:false,addEventListener(){}})};
 window.parent=window;
 if(options.duel)window.__warzoneDuelConfig={mode:'duel'};
 context=vm.createContext({window,document,innerWidth:1000,innerHeight:600,navigator:{vibrate:()=>true},performance:{now:()=>now},
  PointerEvent:Event,KeyboardEvent:class extends Event {constructor(type,init){super(type,init);events.push({type,code:init.code,time:now});}},
  WheelEvent:class extends Event{constructor(type,init){super(type,init);events.push({type,delta:init.deltaY,time:now});}},CustomEvent:Event,
  setTimeout:(fn,ms)=>timeout(fn,ms),clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>timeout(fn,ms,ms),clearInterval:id=>timers.delete(id),
  requestAnimationFrame:options.noRaf?undefined:fn=>{const id=++next;rafs.set(id,fn);return id;},cancelAnimationFrame:id=>rafs.delete(id),
  Map,Set,WeakSet,WeakMap,Math,Number,JSON,Promise,Date,console});
 vm.runInContext(script,context,{filename:FILE});
 const api=window.__kalaWarzoneTouch;
 function tick(ms){const end=now+ms;for(let i=0;i<10000;i++){const item=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item){now=end;return;}const[id,t]=item;timers.delete(id);now=t.at;if(t.repeat)timers.set(id,{...t,at:now+t.repeat});t.fn();}throw Error('Bounded virtual timer fixture exhausted');}
 function frame(ms=16){tick(ms);for(const[id,fn]of [...rafs]){if(!rafs.has(id))continue;rafs.delete(id);fn(now);}if(rendering&&native.buttons.has(1)&&native.anchor){native.view={x:native.anchor.view.x+native.x-native.anchor.x,y:native.anchor.view.y+native.y-native.anchor.y};}samples.push({frame:nativeFrame,x:native.x,y:native.y,middle:native.buttons.has(1),view:{...native.view}});if(rendering){gl.clear(gl.COLOR_BUFFER_BIT);nativeFrame++;}}
 async function frames(count=1,ms=16){for(let i=0;i<count;i++){frame(ms);for(let n=0;n<8;n++)await Promise.resolve();}}
 function fire(type,x,y,id=1,extra={}){const e=new Event(type,{pointerType:'touch',pointerId:id,isPrimary:id===1,clientX:x,clientY:y,button:type==='pointerdown'?0:-1,buttons:/pointerup|pointercancel/.test(type)?0:1,timeStamp:now,...extra});canvas.dispatchEvent(e);return e;}
 const win=(name,event={})=>{for(const fn of winEvents.get(name)||[])fn({target:window,...event});};
 return {api,window,document,commands,canvas,events,samples,calls,native,fire,tick,frame,frames,win,time:()=>now,pendingFrames:()=>rafs.size,
  placing:v=>placing=v,rendering:v=>rendering=v,clear:()=>{api.releaseAll(true,false);events.length=0;samples.length=0;}};
}

const pointerEvents=f=>f.events.filter(e=>e.type.startsWith('pointer'));
const middleDowns=f=>pointerEvents(f).filter(e=>e.type==='pointerdown'&&e.button===1);
const middleUps=f=>pointerEvents(f).filter(e=>e.type==='pointerup'&&e.button===1);
const middleMoves=f=>pointerEvents(f).filter(e=>e.type==='pointermove'&&e.buttons===4);
const checks=[];
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS: '+name);}
async function main(){
 const baseline=cp.execFileSync('python',['-c','import zipfile,sys; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',path.resolve(ROOT,'../warzone-towers-0.48-source.zip'),FILE],{encoding:'utf8',maxBuffer:1024*1024});
 const baselineSourceSha256=crypto.createHash('sha256').update(baseline).digest('hex');
 let baselineReproduction;
 await check('Preserved v0.48 source reproduces the unrendered dispatch burst and missing final held endpoint',async()=>{
  const f=fixture(baseline);f.fire('pointerdown',300,220);f.fire('pointermove',310,220);await f.frames(1);f.events.length=0;
  for(let i=1;i<=40;i++)f.fire('pointermove',310+i,220+i/2);
  const burst=middleMoves(f).length;assert.equal(burst,40);
  const g=fixture(baseline);g.fire('pointerdown',300,220);g.fire('pointermove',340,240);await g.frames(1);g.fire('pointermove',360,250);g.fire('pointerup',375,265);await g.frames(8);
  assert.deepEqual(g.native.view,{x:40,y:20});baselineReproduction={version:'0.48',sourceSha256:baselineSourceSha256,dispatchesWithoutRender:burst,retainedDelta:g.native.view,intendedDelta:{x:75,y:45}};
 });
 await check('High-rate coalesced finger samples publish the latest absolute target once per display frame, without keyboard/zoom commands',async()=>{
  const f=fixture();f.fire('pointerdown',300,220);f.fire('pointermove',310,220);await f.frames(1);f.events.length=0;
  for(let i=1;i<=40;i++)f.fire('pointermove',310+i,220+i/2,1,{getCoalescedEvents:()=>[{clientX:309+i,clientY:220+(i-1)/2},{clientX:310+i,clientY:220+i/2}]});
  assert.equal(middleMoves(f).length,0,'physical-event burst must wait for its single frame flush');await f.frames(1);
  assert.equal(middleMoves(f).length,1);assert.equal(middleMoves(f)[0].x,350);assert.equal(middleMoves(f)[0].y,240);
  assert.ok(!f.events.some(e=>e.type==='wheel'||e.type.startsWith('key')));f.fire('pointercancel',350,240);await f.frames(4);assert.equal(f.api.isGestureActive(),false);
 });
 await check('The final pointer-up position is consumed while middle pan remains held, then releases without losing distance',async()=>{
  const f=fixture();f.fire('pointerdown',300,220);f.fire('pointermove',340,240);await f.frames(1);f.fire('pointermove',360,250);f.fire('pointerup',375,265);
  await f.frames(8);assert.ok(f.samples.some(s=>s.middle&&s.x===375&&s.y===265),'engine frame must consume the final held target');assert.deepEqual(f.native.view,{x:75,y:45});
  assert.equal(middleDowns(f).length,1);assert.equal(middleUps(f).length,1);assert.equal(f.api.isGestureActive(),false);
 });
 await check('Pointer cancellation and real blur discard queued pan work and release immediately, with no later ghost movement',async()=>{
  for(const action of ['cancel','blur','inactive']){const f=fixture();f.fire('pointerdown',300,220);f.fire('pointermove',350,220);await f.frames(1);f.fire('pointermove',400,220);
   action==='cancel'?f.fire('pointercancel',400,220):action==='blur'?f.win('blur'):f.api.setBattleActive(false);
   const end=pointerEvents(f).length;assert.equal(f.native.buttons.has(1),false,action+' must release immediately');await f.frames(6);
   assert.equal(pointerEvents(f).length,end,action+' must not dispatch later motion');assert.equal(f.api.isGestureActive(),false);}
 });
 await check('Different native frame cadences and many raw samples retain identical full drag distance',async()=>{
  for(const step of [8,16,33]){const f=fixture();f.fire('pointerdown',200,200);for(let i=1;i<=32;i++){f.fire('pointermove',200+i*3,200+i);if(i%8===0)await f.frames(1,step);}f.fire('pointerup',302,234);await f.frames(8,step);assert.deepEqual(f.native.view,{x:102,y:34});assert.equal(f.native.buttons.size,0);}
 });
 await check('Slow display frames batch once, and missing GL context or a stopped native renderer release within the bounded deadline',async()=>{
  const f=fixture();f.fire('pointerdown',300,220);f.fire('pointermove',330,230);f.tick(90);assert.equal(middleMoves(f).length,0);await f.frames(1,1);assert.equal(middleMoves(f).length,1);f.api.releaseAll(true,false);
  const g=fixture(undefined,{noContext:true});g.fire('pointerdown',300,220);g.fire('pointermove',340,240);g.fire('pointerup',375,265);await g.frames(1);assert.equal(g.native.buttons.has(1),true);assert.deepEqual(g.native.view,{x:75,y:45});await g.frames(1);assert.equal(g.native.buttons.has(1),false);
  const h=fixture(undefined,{rendering:false});h.fire('pointerdown',300,220);h.fire('pointermove',340,240);h.fire('pointerup',375,265);h.tick(149);assert.equal(h.native.buttons.has(1),true);h.tick(1);assert.equal(h.native.buttons.has(1),false);const count=pointerEvents(h).length;await h.frames(6);assert.equal(pointerEvents(h).length,count);
  const j=fixture(undefined,{noContext:true,noRaf:true});j.fire('pointerdown',300,220);j.fire('pointermove',340,240);j.fire('pointerup',375,265);await j.frames(1);assert.equal(j.native.buttons.has(1),true);assert.deepEqual(j.native.view,{x:75,y:45});await j.frames(1);assert.equal(j.native.buttons.has(1),false);
 });
 await check('Capture excursions stay within an offset canvas without wrapping, and ordinary interior motion retains its full distance',async()=>{
  const bounds={x:40,y:30,left:40,top:30,right:960,bottom:570,width:920,height:540};
  for(const end of [{x:-200,y:-100,want:{x:-252,y:-182}},{x:1300,y:800,want:{x:652,y:342}}]){
   const f=fixture(undefined,{bounds});f.fire('pointerdown',300,220);f.fire('pointermove',end.x,end.y);f.fire('pointerup',end.x,end.y);await f.frames(4);assert.deepEqual(f.native.view,end.want);
   assert.ok(pointerEvents(f).filter(e=>e.buttons===4).every(e=>e.x>=48&&e.x<=952&&e.y>=38&&e.y<=562));
  }
  const f=fixture(undefined,{bounds});f.fire('pointerdown',300,220);f.fire('pointermove',375,265);f.fire('pointerup',375,265);await f.frames(4);assert.deepEqual(f.native.view,{x:75,y:45});
 });
 await check('A rapid new touch and pagehide cancel pending final release without releasing or moving a later gesture',async()=>{
  const f=fixture();f.fire('pointerdown',300,220);f.fire('pointermove',340,240);f.fire('pointerup',375,265);f.fire('pointerdown',400,240);assert.equal(f.native.buttons.has(1),false);f.fire('pointermove',450,260);await f.frames(1);assert.equal(f.native.buttons.has(1),true);f.fire('pointerup',470,270);await f.frames(8);assert.equal(middleDowns(f).length,2);assert.equal(middleUps(f).length,2);assert.equal(f.api.isGestureActive(),false);
  const g=fixture();g.fire('pointerdown',300,220);g.fire('pointermove',340,240);g.fire('pointerup',375,265);g.win('pagehide');assert.equal(g.native.buttons.has(1),false);const count=pointerEvents(g).length;await g.frames(8);assert.equal(pointerEvents(g).length,count);
  const h=fixture();h.fire('pointerdown',300,220);h.fire('pointermove',340,240);h.fire('pointerup',375,265);h.api.nativeClick(400,300);assert.equal(pointerEvents(h).filter(e=>e.type==='pointerdown'&&e.button===0).length,0);await h.frames(15);const ups=pointerEvents(h).findIndex(e=>e.type==='pointerup'&&e.button===1),click=pointerEvents(h).findIndex(e=>e.type==='pointerdown'&&e.button===0);assert.ok(ups>=0&&click>ups);assert.equal(h.native.buttons.size,0);
 });
 await check('A normal stationary tap remains one contextual left click and a deliberate long drag remains a left-button box selection',async()=>{
  const f=fixture();f.fire('pointerdown',300,220);f.fire('pointerup',300,220);await f.frames(15);assert.equal(middleDowns(f).length,0);assert.equal(pointerEvents(f).filter(e=>e.type==='pointerdown'&&e.button===0).length,1);
  f.clear();f.fire('pointerdown',300,220);f.tick(280);f.fire('pointermove',350,255);f.fire('pointerup',350,255);await f.frames(5);assert.equal(middleDowns(f).length,0);assert.equal(f.api.report().boxSelections,1);assert.equal(f.api.isGestureActive(),false);
 });
 await check('Single-site placement and line-placement keep their own input and never leak orders or camera pans',async()=>{
  const f=fixture(undefined,{placement:true});f.fire('pointerdown',300,220);f.fire('pointermove',307,224);f.fire('pointerup',307,224);await f.frames(3);assert.equal(f.calls.filter(c=>c[0]==='place').length,1);assert.equal(middleDowns(f).length,0);
  const g=fixture(undefined,{placement:true,line:true});g.fire('pointerdown',300,220);g.fire('pointermove',450,240);g.fire('pointerup',450,240);await g.frames(3);assert.equal(g.calls.filter(c=>c[0]==='line-end').length,1);assert.equal(middleDowns(g).length,0);assert.equal(pointerEvents(g).filter(e=>e.type==='pointerdown').length,0);
 });
 await check('Pinch remains zoom-only, horizontal two-finger motion pans without zoom, and dropping one finger does not restart a gesture',async()=>{
  const f=fixture();f.fire('pointerdown',300,220,1);f.fire('pointerdown',440,220,2);f.fire('pointermove',270,220,1);f.fire('pointermove',470,220,2);await f.frames(2);assert.ok(f.api.report().pinchSteps>0);assert.equal(middleDowns(f).length,0);f.fire('pointercancel',270,220,1);f.fire('pointercancel',470,220,2);await f.frames(3);assert.equal(f.api.isGestureActive(),false);
  const g=fixture();g.fire('pointerdown',300,220,1);g.fire('pointerdown',440,220,2);g.fire('pointermove',340,220,1);g.fire('pointermove',480,220,2);await g.frames(2);assert.equal(g.api.report().pinchSteps,0);assert.equal(middleDowns(g).length,1);g.fire('pointerup',340,220,1);g.fire('pointermove',500,220,2);g.fire('pointerup',500,220,2);await g.frames(8);assert.equal(middleDowns(g).length,1);assert.equal(g.api.isGestureActive(),false);
 });
 await check('Minimap drags retain the native right-button path and do not invoke battlefield middle pan',async()=>{
  const f=fixture();f.fire('pointerdown',850,460);f.fire('pointermove',890,490);f.fire('pointerup',890,490);await f.frames(5);assert.equal(middleDowns(f).length,0);assert.equal(pointerEvents(f).filter(e=>e.type==='pointerdown'&&e.button===2).length,1);assert.equal(f.api.report().radarDrags,1);assert.equal(f.api.isGestureActive(),false);
 });
 await check('Duel retains its existing immediate one-finger pan; native tap, build, radar, multi-touch, camera and order helpers are unchanged',async()=>{
  const f=fixture(undefined,{duel:true});f.fire('pointerdown',300,220);f.fire('pointermove',330,230);assert.equal(middleMoves(f).length,1);f.fire('pointermove',340,240);assert.equal(middleMoves(f).length,2);f.fire('pointerup',340,240);assert.equal(f.native.buttons.has(1),false);
  const fn=(s,name)=>{const start=s.indexOf('  function '+name+'(');assert.notEqual(start,-1,name);const end=s.indexOf('\n  function ',start+1);return s.slice(start,end<0?s.length:end).trim();};
  for(const name of ['mouse','mouseMove','mouseButtonMask','observeNativeFrames','clickStep','click','nativeMenuClick','nativeWorldClick','nativeBoxSelect','nativeSelectionBounds','tapNormalized','nativeUiClick','tapFrontend','pressMouse','dispatchKey','contextualClick','zoom','advancePan','releaseTilt','pumpTilt','advanceTilt','radarPoint','isBattlefieldPoint','nativeUiRects','inRect','trackNativePanelTap','isQueuePlacementPoint','beginSingle','beginBoxSelection','beginMulti','clearMultiMove','flushMultiMove','scheduleMultiMove','handleMultiMove','endMultiIfNeeded','openFacilityAt'])assert.equal(fn(source(),name),fn(baseline,name),name+' must remain unchanged');
  assert.equal(f.api.version,56);assert.equal(f.api.report().version,56);
 });
 new vm.Script(source(),{filename:FILE});
 const report={version:'0.49',passed:true,checks,checksPassed:checks.length,emulatorUsed:false,browserUsed:false,androidRuntimeExecuted:false,actualNativeEngineExecuted:false,gameplayVerified:false,screensVerified:false,
  scope:'Actual current touch adapter in a virtual DOM/RAF plus absolute-mouse native-frame input oracle; no real native camera render or touch-screen verification.',
  baselineReproduction,sources:[{path:FILE,sha256:hash(FILE)},{path:'tools/check-touch-pan-049.cjs',sha256:hash('tools/check-touch-pan-049.cjs')}],recordedUTC:new Date().toISOString()};
 fs.writeFileSync(path.join(ROOT,'archive/touch-pan-0.49-checks.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:true,checksPassed:checks.length,report:'archive/touch-pan-0.49-checks.json',emulatorUsed:false}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture};
