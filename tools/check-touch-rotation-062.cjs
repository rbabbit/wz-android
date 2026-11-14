'use strict';
/* Actual gesture adapter with prepared DOM/SDL plumbing; this never runs a device/native game. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture,readRelease}=require('./check-touch-pan-050.cjs');
const root=path.resolve(__dirname,'..'),file='app/src/main/assets/warzone-touch-controls.js',source=fs.readFileSync(path.join(root,file),'utf8'),checks=[];
function setup(mode='towers',script=source){
  const prefix=mode==='campaign'?"window.__warzoneCampaignMode=true;window.__warzoneCampaign={nativeUiActive:()=>Boolean(window.__testNativeUi)};\n"
    :mode==='ffa'?"window.__warzoneFfaConfig={mode:'ffa'};window.__warzoneFfa={nativeUiActive:()=>Boolean(window.__testNativeUi)};\n":'';
  const seam='  const canvas = () => document.getElementById("canvas");';assert.equal(script.split(seam).length,2);
  const f=fixture(prefix+script.replace(seam,'  window.__gestureFixtureState=state;\n'+seam),{normalizeMiddleDoubleClick:true});
  f.window.__towersHtml.report=()=>({menuRequested:Boolean(f.window.__testMenu)});f.commands.nativeMenuOpen=()=>Boolean(f.window.__testNativeUi);
  f.keys=[];for(const type of['keydown','keyup'])f.canvas.addEventListener(type,event=>f.keys.push({type,code:event.code,location:event.location}));
  return f;
}
function pivot(angle,span=40,swap=false,noise=0){
  const fixed=[400+noise*Math.sin(angle*7),250+noise*Math.sin(angle*11)],moving=[400+span*Math.cos(angle),250+span*Math.sin(angle)];
  return swap?[moving,fixed]:[fixed,moving];
}
function diameter(angle,first=80,second=80){return[[500-first*Math.cos(angle),250-first*Math.sin(angle)],[500+second*Math.cos(angle),250+second*Math.sin(angle)]];}
function down(f,points){points.forEach((p,i)=>f.fire('pointerdown',p[0],p[1],i+11));}
async function move(f,points,frames=2){points.forEach((p,i)=>f.fire('pointermove',p[0],p[1],i+11));await f.frames(frames);}
async function lift(f,points){points.forEach((p,i)=>f.fire('pointerup',p[0],p[1],i+11));await f.frames(8);}
async function run(f,geometry,steps=72,frames=2){down(f,geometry(0));for(let i=1;i<=steps;i++)await move(f,geometry(i/steps),frames);}
const internal=f=>f.window.__gestureFixtureState,downs=f=>f.keys.filter(event=>event.type==='keydown');
const close=(f)=>{f.api.releaseAll(true,false);};
const approx=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const noCameraLeak=f=>{assert.equal(f.api.report().rotationHeld,null);assert.equal(f.api.report().tiltHeld,null);assert.equal(f.api.report().gestureActive,false);assert.deepEqual(Array.from(f.api.report().heldKeys),[]);};
function assertYawOnly(f,direction){const r=f.api.report();assert.equal(internal(f).multi?.gesture,'rotate');assert(r.rotationMoves>0&&r.rotationSteps>0);assert.equal(r.tiltMoves,0);assert.equal(r.pans,0);assert.equal(r.pinchSteps,0);assert(downs(f).length);assert(downs(f).every(event=>event.code===(direction>0?'Numpad6':'Numpad4')&&event.location===3));}
async function check(name,body){await body();checks.push({name,passed:true});console.log('PASS: '+name);}
async function main(){
  const baseline=readRelease('0.61');
  await check('Delivered0.61 reproduces stationary-pivot full-circle tilt instead of yaw in both directions',async()=>{
    for(const direction of[-1,1]){const f=setup('ffa',baseline),geometry=t=>pivot(direction*2*Math.PI*t,120);await run(f,geometry);assert.equal(internal(f).multi.gesture,'tilt');approx(internal(f).multi.angleTravel,direction*2*Math.PI);assert.equal(f.api.report().rotationMoves,0);assert(f.api.report().tiltMoves>0);assert(downs(f).some(event=>/^Numpad[28]$/.test(event.code)));close(f);}
  });
  await check('Adjacent40px stationary pivots recognize a complete circle in either direction and with either finger stationary in all three modes',async()=>{
    for(const mode of['towers','campaign','ffa'])for(const direction of[-1,1])for(const swap of[false,true]){
      const f=setup(mode),geometry=t=>pivot(direction*2*Math.PI*t,40,swap);await run(f,geometry);assertYawOnly(f,direction);approx(internal(f).multi.angleTravel,direction*2*Math.PI);await lift(f,geometry(1));noCameraLeak(f);
    }
  });
  await check('Normal and wide stationary pivots keep yaw through full circles without producing pitch, translation or zoom',async()=>{
    for(const span of[60,120,180])for(const direction of[-1,1]){const f=setup(),geometry=t=>pivot(direction*2*Math.PI*t,span);await run(f,geometry);assertYawOnly(f,direction);await lift(f,geometry(1));noCameraLeak(f);}
  });
  await check('A nearly anchored finger and strongly unequal opposing arcs remain rotation rather than midpoint tilt',async()=>{
    for(const mode of['towers','campaign','ffa'])for(const direction of[-1,1]){
      for(const geometry of[t=>pivot(direction*2*Math.PI*t,60,false,.5),t=>diameter(direction*2*Math.PI*t,5,115)]){
        const f=setup(mode);await run(f,geometry);assertYawOnly(f,direction);await lift(f,geometry(1));noCameraLeak(f);
      }
    }
  });
  await check('Adjacent equal and unequal opposing vertical strokes recognize angular intent in both directions',async()=>{
    for(const direction of[-1,1])for(const ratio of[1,.35]){
      const f=setup(),geometry=t=>[[480,250-direction*50*t],[520,250+direction*50*t*ratio]];await run(f,geometry,40);assertYawOnly(f,direction);await lift(f,geometry(1));noCameraLeak(f);
    }
  });
  await check('Continuous diametric and stationary two-circle strokes accumulate beyond360deg with no angular ceiling',async()=>{
    for(const direction of[-1,1])for(const shape of['diameter','pivot']){
      const f=setup(),geometry=t=>shape==='diameter'?diameter(direction*4*Math.PI*t):pivot(direction*4*Math.PI*t,60);await run(f,geometry,144);assertYawOnly(f,direction);approx(internal(f).multi.angleTravel,direction*4*Math.PI);assert(f.api.report().rotationSteps>100,'Rotation must continue through a second circle');await lift(f,geometry(1));noCameraLeak(f);
    }
  });
  await check('A long pivot reverses while the same pointers remain active and releases the previous yaw direction',async()=>{
    const f=setup(),geometry=t=>pivot(2.5*Math.PI*t,60);await run(f,geometry,90);const before=downs(f).length;for(let i=1;i<=90;i++)await move(f,pivot(2.5*Math.PI*(1-i/90),60));approx(internal(f).multi.angleTravel,0);assert(downs(f).slice(before).some(event=>event.code==='Numpad4'));assert.equal(f.api.report().tiltMoves,0);assert.equal(f.api.report().pinchSteps,0);await lift(f,pivot(0,60));noCameraLeak(f);
  });
  await check('True parallel vertical travel and modest unequal parallel travel retain native tilt, with no yaw or pinch',async()=>{
    for(const mode of['towers','campaign','ffa'])for(const unequal of[false,true]){
      const f=setup(mode),geometry=t=>[[440,250-60*t],[560,250-(unequal?48:60)*t]];await run(f,geometry,24);assert.equal(internal(f).multi.gesture,'tilt');assert(f.api.report().tiltMoves>0);assert.equal(f.api.report().rotationMoves,0);assert.equal(f.api.report().pans,0);assert.equal(f.api.report().pinchSteps,0);assert(downs(f).every(event=>event.code==='Numpad2'));await lift(f,geometry(1));noCameraLeak(f);
    }
  });
  await check('Delivered0.61 loses fractional slow tilt; the current adapter retains that travel until a real pitch step',async()=>{
    const geometry=t=>[[440,250+60*t],[560,250+60*t]];
    const old=setup('towers',baseline);await run(old,geometry,120,1);assert.equal(internal(old).multi.gesture,'tilt');assert.equal(old.api.report().tiltMoves,0);assert.equal(downs(old).length,0);close(old);
    const f=setup();await run(f,geometry,120,1);assert.equal(internal(f).multi.gesture,'tilt');assert(f.api.report().tiltMoves>0);assert(downs(f).some(event=>event.code==='Numpad8'));assert.equal(f.api.report().rotationMoves,0);await lift(f,geometry(1));noCameraLeak(f);
  });
  await check('Parallel horizontal two-finger travel remains native pan and never becomes rotation',async()=>{
    const f=setup(),geometry=t=>[[400+80*t,250],[560+80*t,250]];await run(f,geometry,24);assert.equal(internal(f).multi.gesture,'pan');assert.equal(f.api.report().pans,1);assert.equal(f.api.report().rotationMoves,0);assert.equal(f.api.report().tiltMoves,0);assert.equal(f.api.report().pinchSteps,0);await lift(f,geometry(1));noCameraLeak(f);assert.equal(f.native.panStarts,1);
  });
  await check('Radial pinch remains zoom with both fingers moving or one fixed, expanding and contracting',async()=>{
    for(const anchored of[false,true])for(const direction of[-1,1]){
      const f=setup(),geometry=t=>{const span=120+direction*60*t;return anchored?[[400,250],[400+span,250]]:[[500-span/2,250],[500+span/2,250]];};await run(f,geometry,24);assert.equal(internal(f).multi.gesture,'zoom');assert(f.api.report().pinchSteps>0);assert.equal(f.api.report().rotationMoves,0);assert.equal(f.api.report().tiltMoves,0);assert.equal(f.api.report().pans,0);await lift(f,geometry(1));noCameraLeak(f);
    }
  });
  await check('Lifting the moving pivot finger fences its stationary partner until all up, then a new opposite stroke works',async()=>{
    const f=setup(),geometry=t=>pivot(Math.PI*t,60);await run(f,geometry,36);const end=geometry(1);f.fire('pointerup',...end[1],12);assert.equal(f.api.report().rotationHeld,null);const before=f.api.report().rotationMoves;f.fire('pointermove',end[0][0]+70,end[0][1],11);await f.frames(6);assert.equal(f.api.report().rotationMoves,before);assert.equal(f.api.report().pans,0);f.fire('pointerup',end[0][0]+70,end[0][1],11);await f.frames(8);noCameraLeak(f);
    const reverse=t=>pivot(-Math.PI*t,60);await run(f,reverse,36);assert(downs(f).some(event=>event.code==='Numpad4'));await lift(f,reverse(1));noCameraLeak(f);
  });
  await check('Native menu fences block pivot rotation and release an existing pivot without replay after return',async()=>{
    for(const mode of['towers','campaign','ffa']){
      const blocked=setup(mode);blocked.window.__testNativeUi=true;const geometry=t=>pivot(2*Math.PI*t,60);await run(blocked,geometry);assert.equal(blocked.api.report().rotationMoves,0);assert.equal(blocked.api.report().tiltMoves,0);close(blocked);
      const f=setup(mode);await run(f,t=>pivot(Math.PI*t,60),36);f.window.__testMenu=true;await move(f,pivot(Math.PI+.2,60));assert.equal(f.api.report().rotationHeld,null);const count=downs(f).length;await f.frames(20);assert.equal(downs(f).length,count);await lift(f,pivot(Math.PI+.2,60));noCameraLeak(f);
    }
  });
  await check('One-finger pan, yaw pulse timing and release/fence functions retain their exact delivered0.61 bodies',()=>{
    const body=(text,name)=>{const start=text.indexOf('  function '+name+'(');assert(start>=0,name);const end=text.indexOf('\n  function ',start+1);return text.slice(start,end<0?text.length:end);};
    for(const name of['advancePan','panPoint','clearPanMove','flushPanMove','schedulePanMove','clearPanReleaseCallbacks','panPhase','releasePanEndpoint','schedulePanRelease','advancePanRelease','finishFramePan','cancelFramePan','deferPanPointer','pumpPanPointerQueue','beginPan','rotationAllowed','releaseRotation','pumpRotation','advanceRotation','endMultiIfNeeded','cancelMulti','releaseAll'])assert.equal(body(source,name),body(baseline,name),name);
  });
  const inputs=[file,'tools/check-touch-rotation-062.cjs'];
  const report={version:'0.62',passed:true,checksPassed:checks.length,checks,emulatorUsed:false,actualNativeEngineExecuted:false,
    scope:'Actual touch JavaScript and prepared DOM/SDL protocol fixtures. Native camera yaw/pitch and visual feel require the exact-APK emulator journey.',
    sources:inputs.map(name=>({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')})),recordedUTC:new Date().toISOString()};
  const output=path.join(root,'archive/rotation-0.62-host-checks.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,checksPassed:checks.length,emulatorUsed:false,actualNativeEngineExecuted:false,report:path.relative(root,output).replaceAll('\\','/')}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});
