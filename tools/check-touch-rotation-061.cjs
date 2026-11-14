'use strict';
/* Actual touch adapter with the prepared DOM/SDL fixture; no native engine or device. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture,readRelease}=require('./check-touch-pan-050.cjs');
const root=path.resolve(__dirname,'..'),file='app/src/main/assets/warzone-touch-controls.js';
const source=fs.readFileSync(path.join(root,file),'utf8'),checks=[];
function setup(mode='towers',options={}){
  const prefix=mode==='campaign'?"window.__warzoneCampaignMode=true;window.__warzoneCampaign={nativeUiActive:()=>Boolean(window.__testNativeUi)};\n"
    :mode==='ffa'?"window.__warzoneFfaConfig={mode:'ffa'};window.__warzoneFfa={nativeUiActive:()=>Boolean(window.__testNativeUi)};\n":'';
  const seam='  const canvas = () => document.getElementById("canvas");';assert.equal(source.split(seam).length,2);
  const script=prefix+source.replace(seam,'  window.__fixtureTouchState=state;\n'+seam);
  const f=fixture(script,{normalizeMiddleDoubleClick:true,...options});
  f.window.__towersHtml.report=()=>({menuRequested:Boolean(f.window.__testMenu)});
  f.commands.nativeMenuOpen=()=>Boolean(f.window.__testNativeUi);
  f.keys=[];for(const type of['keydown','keyup'])f.canvas.addEventListener(type,e=>f.keys.push({type,code:e.code,location:e.location,ctrl:e.ctrlKey}));
  return f;
}
function points(angle,{cx=500,cy=250,r=90}={}){const dx=r*Math.cos(angle),dy=r*Math.sin(angle);return[{x:cx-dx,y:cy-dy},{x:cx+dx,y:cy+dy}];}
function down(f,angle=0,geometry={}){for(const[p,index]of points(angle,geometry).map((p,index)=>[p,index]))f.fire('pointerdown',p.x,p.y,index+11);}
async function move(f,angle,geometry={},frames=2){for(const[p,index]of points(angle,geometry).map((p,index)=>[p,index]))f.fire('pointermove',p.x,p.y,index+11);await f.frames(frames);}
async function up(f,angle,geometry={}){for(const[p,index]of points(angle,geometry).map((p,index)=>[p,index]))f.fire('pointerup',p.x,p.y,index+11);await f.frames(8);}
async function twist(f,start=0,travel=Math.PI,steps=36){down(f,start);for(let i=1;i<=steps;i++)await move(f,start+travel*i/steps);}
const approx=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const downs=f=>f.keys.filter(e=>e.type==='keydown');
const clear=f=>{assert.equal(f.api.report().rotationHeld,null);assert.equal(f.api.report().tiltHeld,null);assert.deepEqual(Array.from(f.api.report().heldKeys),[]);assert.equal(f.api.report().gestureActive,false);};
async function check(name,run){await run();checks.push(name);console.log('PASS: '+name);}
async function main(){
  await check('Accepted one-finger pan functions remain byte-for-byte identical to delivered0.60',()=>{
    const before=readRelease('0.60');
    const block=(text,name)=>{const start=text.indexOf('  function '+name+'(');assert(start>=0,name);const end=text.indexOf('\n  function ',start+1);return text.slice(start,end<0?text.length:end);};
    for(const name of['advancePan','panPoint','clearPanMove','flushPanMove','schedulePanMove','clearPanReleaseCallbacks','panPhase','releasePanEndpoint','schedulePanRelease','advancePanRelease','finishFramePan','cancelFramePan','deferPanPointer','pumpPanPointerQueue','beginPan'])assert.equal(block(source,name),block(before,name),name);
  });
  await check('Opposing fingers through180deg lock yaw only in Towers, Campaign and FFA, with both native directions and location3',async()=>{
    for(const mode of['towers','campaign','ffa'])for(const direction of[-1,1]){
      const f=setup(mode);await twist(f,0,direction*Math.PI);
      approx(f.window.__fixtureTouchState.multi.angleTravel,direction*Math.PI);
      assert.equal(f.window.__fixtureTouchState.multi.gesture,'rotate');assert(f.api.report().rotationMoves>0);assert(f.api.report().rotationSteps>0);
      assert.equal(f.api.report().pans,0);assert.equal(f.api.report().pinchSteps,0);assert.equal(f.api.report().tiltMoves,0);
      assert(downs(f).length>0);assert(downs(f).every(e=>e.code===(direction>0?'Numpad6':'Numpad4')&&e.location===3&&!e.ctrl));
      await up(f,direction*Math.PI);clear(f);const count=f.keys.length;await f.frames(30);assert.equal(f.keys.length,count,'No yaw may continue after lift');
    }
  });
  await check('Signed twist crosses plus/minuspi and accumulates beyond180deg without reversal or span/centre contamination',async()=>{
    for(const direction of[-1,1]){
      const f=setup();const start=direction*170*Math.PI/180,travel=direction*210*Math.PI/180;
      await twist(f,start,travel,42);approx(f.window.__fixtureTouchState.multi.angleTravel,travel);
      assert(downs(f).every(e=>e.code===(direction>0?'Numpad6':'Numpad4')));await up(f,start+travel);clear(f);
    }
  });
  await check('Reversing a twist releases the old direction immediately; collapsed finger spacing cancels unstable angle input',async()=>{
    const f=setup();await twist(f,0,Math.PI/2,9);const count=f.keys.length;
    await move(f,Math.PI/2-0.15);assert(f.keys.slice(count).some(e=>e.type==='keyup'&&e.code==='Numpad6'));
    assert(downs(f).at(-1).code==='Numpad4');assert.equal(f.api.report().rotationHeld,'Numpad4');
    await move(f,Math.PI/2-0.2,{r:5});assert.equal(f.api.report().rotationHeld,null);assert.equal(f.window.__fixtureTouchState.multi,null);
    await up(f,Math.PI/2-0.2,{r:5});clear(f);
  });
  await check('Short angular jitter stays unclassified; radial pinch and parallel vertical tilt preserve their separate gestures',async()=>{
    const jitter=setup();down(jitter);await move(jitter,3*Math.PI/180);assert.equal(jitter.window.__fixtureTouchState.multi.gesture,null);assert.equal(downs(jitter).length,0);await up(jitter,3*Math.PI/180);clear(jitter);
    const pinch=setup();down(pinch);for(let i=1;i<=6;i++)await move(pinch,0,{r:90+i*8});assert.equal(pinch.window.__fixtureTouchState.multi.gesture,'zoom');assert(pinch.api.report().pinchSteps>0);assert.equal(pinch.api.report().rotationMoves,0);assert.equal(pinch.api.report().pans,0);await up(pinch,0,{r:138});clear(pinch);
    const tilt=setup();down(tilt);for(let i=1;i<=12;i++)await move(tilt,0,{cy:250-i*4});assert.equal(tilt.window.__fixtureTouchState.multi.gesture,'tilt');assert(tilt.api.report().tiltMoves>0);assert.equal(tilt.api.report().rotationMoves,0);assert.equal(tilt.api.report().pans,0);assert(downs(tilt).every(e=>e.code==='Numpad2'));await up(tilt,0,{cy:202});clear(tilt);
  });
  await check('Gesture lock prevents a twist from becoming pinch/tilt; one lifted finger never starts a pan or tap',async()=>{
    const f=setup();await twist(f,0,Math.PI/2,18);await move(f,Math.PI/2,{r:140,cy:300});assert.equal(f.window.__fixtureTouchState.multi.gesture,'rotate');assert.equal(f.api.report().pinchSteps,0);assert.equal(f.api.report().tiltMoves,0);
    const p=points(Math.PI/2,{r:140,cy:300});f.fire('pointerup',p[0].x,p[0].y,11);assert.equal(f.api.report().rotationHeld,null);const moves=f.api.report().rotationMoves;
    f.fire('pointermove',p[1].x+70,p[1].y+30,12);await f.frames(5);assert.equal(f.api.report().rotationMoves,moves);assert.equal(f.api.report().pans,0);assert.equal(f.api.report().taps,0);
    f.fire('pointerup',p[1].x+70,p[1].y+30,12);await f.frames(6);clear(f);
    f.fire('pointerdown',300,220,21);f.fire('pointermove',370,250,21);await f.frames(3);assert.equal(f.api.report().pans,1);f.fire('pointerup',370,250,21);await f.frames(10);clear(f);assert.equal(f.native.panStarts,1);
  });
  await check('A third finger cancels the original pair and cannot rebind remaining fingers before all lift',async()=>{
    const f=setup();await twist(f,0,Math.PI/3,12);f.fire('pointerdown',650,350,13);assert.equal(f.api.report().rotationHeld,null);assert.equal(f.window.__fixtureTouchState.multi,null);
    const count=downs(f).length;f.fire('pointerup',455,172,11);f.fire('pointermove',510,360,12);f.fire('pointermove',660,330,13);await f.frames(8);assert.equal(downs(f).length,count);assert.equal(f.api.report().pans,0);
    f.fire('pointerup',510,360,12);f.fire('pointerup',660,330,13);await f.frames(6);clear(f);
    await twist(f,0,-Math.PI/3,12);assert(downs(f).slice(count).some(e=>e.code==='Numpad4'));await up(f,-Math.PI/3);clear(f);
  });
  await check('Native UI fences survive follow-on pointer moves, and a newly opened menu cancels held rotation',async()=>{
    for(const mode of['campaign','ffa','towers']){
      const f=setup(mode);f.window.__testNativeUi=true;await twist(f,0,Math.PI/2,18);assert.equal(f.api.report().rotationMoves,0);assert.equal(downs(f).length,0);await up(f,Math.PI/2);clear(f);
      const panel=setup(mode);panel.window.__testNativeUi=true;down(panel);await move(panel,0,{cy:330});assert.equal(panel.api.report().pans,0);assert.equal(panel.api.report().tiltMoves,0);assert.equal(panel.api.report().pinchSteps,0);await up(panel,0,{cy:330});clear(panel);
      const g=setup(mode);await twist(g,0,Math.PI/3,12);g.window.__testMenu=true;await move(g,Math.PI/2);assert.equal(g.api.report().rotationHeld,null);const count=downs(g).length;await g.frames(20);assert.equal(downs(g).length,count);await up(g,Math.PI/2);clear(g);
    }
  });
  await check('Without animation frames the timer fallback remains bounded and lift discards its queued rotation',async()=>{
    const f=setup('towers',{noRaf:true});await twist(f,0,Math.PI/2,18);assert(f.api.report().rotationSteps>0);await up(f,Math.PI/2);clear(f);const count=downs(f).length;f.tick(1000);assert.equal(downs(f).length,count);
  });
  await check('Cancel, blur, releaseAll and battle retirement release yaw and discard callbacks/budget under both frame orders',async()=>{
    for(const nativeFirst of[true,false])for(const transition of['cancel','blur','release','battle']){
      const f=setup('towers',{nativeFirst});await twist(f,0,Math.PI/2,6);
      if(transition==='cancel'){const p=points(Math.PI/2);f.fire('pointercancel',p[0].x,p[0].y,11);f.fire('pointercancel',p[1].x,p[1].y,12);}
      else if(transition==='blur')f.win('blur');else if(transition==='release')f.api.releaseAll(false,false);else f.api.setBattleActive(false);
      await f.frames(10);clear(f);const count=downs(f).length;await f.frames(30);assert.equal(downs(f).length,count);assert.equal(f.window.__fixtureTouchState.rotationBudget,0);
    }
  });
  await check('Ordinary and rapid one-finger pans retain native frame release/rearm without yaw, pitch or zoom',async()=>{
    for(const nativeFirst of[true,false]){
      const f=setup('towers',{nativeFirst});f.fire('pointerdown',300,220);f.fire('pointermove',380,250);await f.frames(2);f.fire('pointerup',400,260);f.fire('pointerdown',600,300);f.fire('pointermove',640,320);f.fire('pointerup',660,330);await f.frames(14);
      assert.equal(f.native.panStarts,2);assert.equal(f.api.report().rotationMoves,0);assert.equal(f.api.report().tiltMoves,0);assert.equal(f.api.report().pinchSteps,0);clear(f);
    }
  });
  console.log(JSON.stringify({passed:true,checksPassed:checks.length,emulatorUsed:false,actualNativeEngineExecuted:false}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
