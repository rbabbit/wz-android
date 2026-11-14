'use strict';
/* Natural gesture families run the actual adapter with prepared DOM/SDL plumbing. No device/native game. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture,readRelease}=require('./check-touch-pan-050.cjs');
const root=path.resolve(__dirname,'..'),file='app/src/main/assets/warzone-touch-controls.js',source=fs.readFileSync(path.join(root,file),'utf8'),checks=[];
const modes=['towers','campaign','ffa'];
function setup(mode='towers',script=source,options={}){
  const prefix=mode==='campaign'?"window.__warzoneCampaignMode=true;window.__warzoneCampaign={nativeUiActive:()=>Boolean(window.__nativeUi)};\n":mode==='ffa'?"window.__warzoneFfaConfig={mode:'ffa'};window.__warzoneFfa={nativeUiActive:()=>Boolean(window.__nativeUi)};\n":'';
  const seam='  const canvas = () => document.getElementById("canvas");';assert.equal(script.split(seam).length,2);
  const f=fixture(prefix+script.replace(seam,'  window.__gestureState=state;\n'+seam),{normalizeMiddleDoubleClick:true,...options});
  f.window.__towersHtml.session='doc-A';f.window.__towersHtml.report=()=>({menuRequested:Boolean(f.window.__menu)});f.commands.nativeMenuOpen=()=>Boolean(f.window.__nativeUi);
  f.keys=[];for(const type of['keydown','keyup'])f.canvas.addEventListener(type,event=>f.keys.push({type,code:event.code,location:event.location,panActive:f.native.panActive,middle:f.native.states.get(1),time:f.time()}));
  return f;
}
const s=f=>f.window.__gestureState,r=f=>f.api.report(),yaw=f=>f.keys.filter(event=>/^Numpad[46]$/.test(event.code)),pitch=f=>f.keys.filter(event=>/^Numpad[28]$/.test(event.code));
const pivot=(angle,span=80,x=400,y=240,swap=false)=>{const points=[[x,y],[x+span*Math.cos(angle),y+span*Math.sin(angle)]];return swap?points.reverse():points;};
const prefixShape=(kind,amount=14,angle=2*Math.PI)=>t=>{const first=Math.min(t/.2,1),turn=Math.max(0,(t-.2)/.8);return pivot(angle*turn,80+(kind==='span'?amount*first:0),400+(kind==='pan'?amount*first:0),240+(kind==='tilt'?amount*first:0));};
function down(f,points){points.forEach((p,i)=>f.fire('pointerdown',...p,i+11));}
async function move(f,points,{unpaired=false,gap=1,frames=2,reverseOrder=false}={}){const order=reverseOrder?[1,0]:[0,1];f.fire('pointermove',...points[order[0]],order[0]+11);if(unpaired)await f.frames(gap);f.fire('pointermove',...points[order[1]],order[1]+11);await f.frames(frames);}
async function drive(f,geometry,steps=48,options={},observe=()=>{}){down(f,geometry(0));for(let i=1;i<=steps;i++){await move(f,geometry(i/steps),options);observe(f,i);}return f;}
async function lift(f,points){points.forEach((p,i)=>f.fire('pointerup',...p,i+11));await f.frames(10);}
const approx=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function released(f){assert.equal(r(f).rotationHeld,null);assert.equal(r(f).tiltHeld,null);assert.equal(r(f).gestureActive,false);assert.deepEqual(Array.from(r(f).heldKeys),[]);}
async function finish(f,points){await lift(f,points);released(f);const count=f.keys.length;await f.frames(30);assert.equal(f.keys.length,count,'Late camera input after lift');}
function rotates(f){assert.equal(s(f).multi?.gesture,'rotate');assert(r(f).rotationSteps>0);assert(yaw(f).some(event=>event.type==='keydown'));}
async function check(name,body){await body();checks.push({name,passed:true});console.log('PASS: '+name);}
async function main(){
  const baseline=readRelease('0.62');
  await check('0.62 baseline: adjacent40px20deg short twist emits no rotation',async()=>{const f=setup('ffa',baseline),g=t=>pivot(Math.PI/9*t,40);await drive(f,g,12);assert.equal(r(f).rotationMoves,0);assert.equal(s(f).multi.gesture,null);f.api.releaseAll(true,false);});
  await check('0.62 baseline:12px opening consumes the stroke as zoom without any wheel, discarding the following full circle',async()=>{const f=setup('ffa',baseline),g=prefixShape('span',12);await drive(f,g);assert.equal(s(f).multi.gesture,'zoom');assert.equal(r(f).rotationMoves,0);assert.equal(r(f).pinchSteps,0);f.api.releaseAll(true,false);});
  await check('0.62 baseline:14px parallel setup permanently captures the later full circle as tilt',async()=>{const f=setup('ffa',baseline),g=prefixShape('tilt',14);await drive(f,g);assert.equal(s(f).multi.gesture,'tilt');assert.equal(r(f).rotationMoves,0);assert(r(f).tiltMoves>0);f.api.releaseAll(true,false);});
  await check('Short20deg adjacent twists at30/40/60px reliably capture yaw in all modes and directions',async()=>{
    for(const mode of modes)for(const span of[30,40,60])for(const direction of[-1,1]){const f=setup(mode),g=t=>pivot(direction*Math.PI/9*t,span);await drive(f,g,12);rotates(f);assert.equal(r(f).tiltMoves,0);assert.equal(r(f).pinchSteps,0);await finish(f,g(1));}
  });
  await check('Short twists tolerate different initial pair angles and either anchored finger',async()=>{
    for(const start of[0,Math.PI/4,Math.PI/2,170*Math.PI/180])for(const swap of[false,true]){const f=setup(),g=t=>pivot(start+Math.PI/9*t,40,400,240,swap);await drive(f,g,12);rotates(f);await finish(f,g(1));}
  });
  await check('Provisional12px zoom hands off to full-circle yaw without replaying span or old angular history',async()=>{
    for(const mode of modes)for(const direction of[-1,1]){const f=setup(mode),g=prefixShape('span',12,direction*2*Math.PI);let first=true;await drive(f,g,48,{},()=>{if(first&&s(f).multi?.gesture==='rotate'){first=false;assert(Math.abs(s(f).rotationBudget)<=Math.PI/60+1e-8,'Handoff replayed a large old angle');}});rotates(f);assert.equal(r(f).pinchSteps,0);assert.equal(pitch(f).length,0);await finish(f,g(1));}
  });
  await check('A real radial pinch can deliberately hand off to yaw while retaining its already emitted zoom only',async()=>{
    const f=setup(),g=prefixShape('span',35);let atHandoff;await drive(f,g,60,{},()=>{if(s(f).multi?.gesture==='rotate'&&atHandoff===undefined)atHandoff=r(f).pinchSteps;});rotates(f);assert(atHandoff>0);assert.equal(r(f).pinchSteps,atHandoff);await finish(f,g(1));
  });
  await check('Provisional14px tilt hands off and discards its unused pitch budget',async()=>{
    for(const mode of modes){const f=setup(mode),g=prefixShape('tilt',14);await drive(f,g);rotates(f);assert.equal(pitch(f).length,0,'Unused setup movement leaked native pitch');assert.equal(s(f).tiltBudget,0);await finish(f,g(1));}
  });
  await check('A committed tilt hands off cleanly without replaying pitch after yaw starts',async()=>{
    const f=setup(),g=prefixShape('tilt',65);let atHandoff;await drive(f,g,60,{},()=>{if(s(f).multi?.gesture==='rotate'&&atHandoff===undefined)atHandoff=pitch(f).length;});rotates(f);assert(atHandoff>0);assert.equal(pitch(f).length,atHandoff);assert.equal(s(f).tiltBudget,0);await finish(f,g(1));
  });
  await check('Pan-to-yaw waits for native MMB release/rearm under both frame orders',async()=>{
    for(const nativeFirst of[true,false]){const f=setup('towers',source,{nativeFirst}),g=prefixShape('pan',14);await drive(f,g);rotates(f);assert.equal(r(f).pans,1);assert(yaw(f).filter(event=>event.type==='keydown').every(event=>!event.panActive&&event.middle==='UP'),'Yaw overlapped a native released-frame pan');await finish(f,g(1));}
  });
  await check('Committed pan-to-yaw keeps bounded endpoints and stale deferred lift/session callbacks cannot begin yaw',async()=>{
    const f=setup(),g=prefixShape('pan',80);await drive(f,g,60);rotates(f);assert(f.native.frames.filter(frame=>frame.panActive).every(frame=>Math.abs(frame.target.x)<110&&Math.abs(frame.target.y)<40),'Pan target jumped while handing off');await finish(f,g(1));
    for(const cancel of['lift','session','menu']){const h=setup(),shape=prefixShape('pan',30);down(h,shape(0));let pending=false;for(let i=1;i<=96;i++){await move(h,shape(i/96),{frames:1});if(s(h).multi?.gesture==='rotate'&&s(h).panRelease){pending=true;break;}}assert(pending,'Fixture did not reach the real pending native release barrier');if(cancel==='lift')shape(1).forEach((p,i)=>h.fire('pointerup',...p,i+11));else if(cancel==='session')h.window.__towersHtml.session='doc-B';else h.window.__menu=true;await h.frames(20);assert.equal(yaw(h).length,0,'Retired handoff began yaw');h.api.releaseAll(true,false);}
  });
  await check('A rotating asymmetric pair with common centroid drift wins over its provisional translation',async()=>{
    for(const direction of[-1,1]){const f=setup(),g=t=>{const a=direction*Math.PI*t;return[[480-20*Math.cos(a),180+150*t-20*Math.sin(a)],[480+60*Math.cos(a),180+150*t+60*Math.sin(a)]];};await drive(f,g);rotates(f);await finish(f,g(1));}
  });
  await check('Noncircular opposed diagonal finger strokes retain angular intent despite changing span',async()=>{
    for(const mode of modes)for(const direction of[-1,1]){const f=setup(mode),g=t=>[[480-20*t,240-direction*40*t],[520+20*t,240+direction*40*t]];await drive(f,g,24);rotates(f);assert.equal(r(f).pinchSteps,0);await finish(f,g(1));}
  });
  await check('Unequal opposing strokes and a lightly wandering pivot capture rotation',async()=>{
    for(const g of[t=>[[460-10*t,240-50*t],[540+5*t,240+15*t]],t=>{const a=2*Math.PI*t;return[[400+.5*Math.sin(7*a),240+.5*Math.sin(11*a)],[400+60*Math.cos(a),240+60*Math.sin(a)]];}]){const f=setup();await drive(f,g);rotates(f);await finish(f,g(1));}
  });
  await check('Separately rendered parallel vertical updates with jitter remain tilt without yaw',async()=>{
    for(const reverseOrder of[false,true]){const f=setup(),g=t=>[[440+.4*Math.sin(t*20),240+80*t],[560+.4*Math.sin(t*20+1),240+80*t]];await drive(f,g,5,{unpaired:true,reverseOrder});assert.equal(s(f).multi.gesture,'tilt');assert.equal(yaw(f).length,0);assert(r(f).tiltMoves>0);assert.equal(r(f).pinchSteps,0);await finish(f,g(1));}
  });
  await check('Separately rendered parallel horizontal updates do not become transient zoom or yaw',async()=>{
    for(const reverseOrder of[false,true]){const f=setup(),g=t=>[[400+80*t,240+.3*Math.sin(t*10)],[560+80*t,240+.3*Math.sin(t*10+1)]];await drive(f,g,5,{unpaired:true,reverseOrder});assert.equal(s(f).multi.gesture,'pan');assert.equal(yaw(f).length,0);assert.equal(r(f).pinchSteps,0);assert.equal(r(f).pans,1);await finish(f,g(1));}
  });
  await check('Separately rendered radial pinch with small angular jitter remains zoom in both directions',async()=>{
    for(const direction of[-1,1])for(const reverseOrder of[false,true]){const f=setup(),g=t=>{const span=120+direction*60*t,a=.025*Math.sin(t*18);return[[500-span/2*Math.cos(a),240-span/2*Math.sin(a)],[500+span/2*Math.cos(a),240+span/2*Math.sin(a)]];};await drive(f,g,24,{unpaired:true,reverseOrder});assert.equal(s(f).multi.gesture,'zoom');assert.equal(yaw(f).length,0);assert.equal(r(f).tiltMoves,0);assert.equal(r(f).pans,0);assert(r(f).pinchSteps>0);await finish(f,g(1));}
    for(const direction of[-1,1]){
      const f=setup(),strong=t=>{const a=direction*t*20*Math.PI/180,rad=20+80*t;return[[500-rad*Math.cos(a),240-rad*Math.sin(a)],[500+rad*Math.cos(a),240+rad*Math.sin(a)]];};
      await drive(f,strong,40);assert.equal(s(f).multi.gesture,'zoom');assert.equal(yaw(f).length,0,'Strong emitted pinch lost ownership to incidental angular drift');assert(r(f).zoomWheelEvents>=10);
      const end=strong(1);await f.frames(12);assert.equal(yaw(f).length,0,'Paused old pinch angle replayed as yaw');
      for(let i=1;i<=12;i++){const a=direction*(20+Math.sin(i)*2)*Math.PI/180;await move(f,[[500-100*Math.cos(a),240-100*Math.sin(a)],[500+100*Math.cos(a),240+100*Math.sin(a)]]);}assert.equal(yaw(f).length,0,'Small post-pinch jitter replayed old angular drift');
      for(let i=1;i<=16;i++){const a=direction*(20+40*i/16)*Math.PI/180;await move(f,[[500-100*Math.cos(a),240-100*Math.sin(a)],[500+100*Math.cos(a),240+100*Math.sin(a)]]);}rotates(f);const a=direction*60*Math.PI/180;await finish(f,[[500-100*Math.cos(a),240-100*Math.sin(a)],[500+100*Math.cos(a),240+100*Math.sin(a)]]);
    }
  });
  await check('Paired parallel tilt with slight unequal motion and angular wobble stays predictable',async()=>{
    for(const mode of modes){const f=setup(mode),g=t=>[[440+.4*Math.sin(t*16),240+70*t],[560+.4*Math.cos(t*16),240+60*t]];await drive(f,g,32);assert.equal(s(f).multi.gesture,'tilt');assert.equal(yaw(f).length,0);assert.equal(r(f).pinchSteps,0);assert(r(f).tiltMoves>0);await finish(f,g(1));}
  });
  await check('Start-and-reverse angular jitter cannot accumulate false confidence or emit yaw',async()=>{
    for(const span of[40,80]){const f=setup(),angles=[0,3,-3,5,-5,6,-6,0,4,-4,0].map(deg=>deg*Math.PI/180);down(f,pivot(0,span));for(const angle of angles.slice(1))await move(f,pivot(angle,span));await f.frames(10);assert.equal(yaw(f).length,0);assert.equal(r(f).rotationMoves,0);assert.equal(r(f).pinchSteps,0);await finish(f,pivot(0,span));}
  });
  await check('Staggered touchdown preserves an initial one-finger pan and then accepts the two-finger twist',async()=>{
    for(const leadMove of[0,10]){const f=setup(),g=t=>pivot(Math.PI/9*t,40);const p=g(0);f.fire('pointerdown',...p[0],11);if(leadMove)f.fire('pointermove',p[0][0]+leadMove,p[0][1],11);await f.frames(2);f.fire('pointerdown',...p[1],12);for(let i=1;i<=12;i++)await move(f,g(i/12));rotates(f);assert.equal(r(f).pans,leadMove?1:0);assert(yaw(f).filter(event=>event.type==='keydown').every(event=>!event.panActive));await finish(f,g(1));}
  });
  await check('One stopped20deg sample has one bounded settle confirmation and no perpetual timer activity',async()=>{
    const f=setup(),p=pivot(20*Math.PI/180,40);down(f,pivot(0,40));await move(f,p,{frames:1});assert.equal(r(f).rotationMoves,0);await f.frames(4);rotates(f);assert.equal(s(f).rotationIntentTimer,null);await f.frames(50);const steps=r(f).rotationSteps;await f.frames(50);assert.equal(r(f).rotationSteps,steps);await finish(f,p);
  });
  await check('Settle candidates die on lift, third finger, native menu or document retirement',async()=>{
    for(const cancellation of['lift','third','menu','session']){const f=setup(),p=pivot(20*Math.PI/180,40);down(f,pivot(0,40));await move(f,p,{frames:1});assert.equal(r(f).rotationMoves,0);if(cancellation==='lift')p.forEach((point,i)=>f.fire('pointerup',...point,i+11));else if(cancellation==='third')f.fire('pointerdown',600,300,13);else if(cancellation==='menu')f.window.__menu=true;else f.window.__towersHtml.session='doc-B';await f.frames(12);assert.equal(yaw(f).length,0);f.api.releaseAll(true,false);released(f);}
    const collapsed=setup();down(collapsed,pivot(0,30));await move(collapsed,pivot(20*Math.PI/180,30),{frames:1});await move(collapsed,pivot(20*Math.PI/180,23),{frames:1});await collapsed.frames(8);assert.equal(yaw(collapsed).length,0,'Settle emitted yaw before rejecting unstable finger spacing');collapsed.api.releaseAll(true,false);released(collapsed);
  });
  await check('Continuous imperfect720deg strokes and reversal retain unlimited yaw with the same pair',async()=>{
    for(const direction of[-1,1]){const f=setup(),g=t=>pivot(direction*4*Math.PI*t,60+2*Math.sin(t*30));await drive(f,g,144);rotates(f);approx(s(f).multi.angleTravel,direction*4*Math.PI);const count=yaw(f).length;for(let i=1;i<=144;i++)await move(f,g(1-i/144));approx(s(f).multi.angleTravel,0);assert(yaw(f).slice(count).some(event=>event.type==='keydown'&&event.code===(direction>0?'Numpad4':'Numpad6')));await finish(f,g(0));}
  });
  await check('Menu returns and world fences require fresh valid pointers before accepting another gesture',async()=>{
    for(const mode of modes){const f=setup(mode),g=t=>pivot(Math.PI/9*t,40);f.window.__nativeUi=true;await drive(f,g,12);assert.equal(yaw(f).length,0);await lift(f,g(1));f.window.__nativeUi=false;await drive(f,g,12);rotates(f);await finish(f,g(1));f.api.releaseAll(true,false);}
  });
  await check('Accepted one-finger pan bodies stay byte-identical to0.62 and rapid native release/rearm remains intact',async()=>{
    const body=(text,name)=>{const start=text.indexOf('  function '+name+'(');assert(start>=0,name);const end=text.indexOf('\n  function ',start+1);return text.slice(start,end<0?text.length:end);};
    for(const name of['advancePan','panPoint','clearPanMove','flushPanMove','schedulePanMove','clearPanReleaseCallbacks','panPhase','releasePanEndpoint','schedulePanRelease','advancePanRelease','finishFramePan','cancelFramePan','deferPanPointer','pumpPanPointerQueue','beginPan'])assert.equal(body(source,name),body(baseline,name),name);
    for(const nativeFirst of[true,false]){const f=setup('towers',source,{nativeFirst});f.fire('pointerdown',300,220);f.fire('pointermove',380,250);await f.frames(2);f.fire('pointerup',400,260);f.fire('pointerdown',600,300);f.fire('pointermove',640,320);f.fire('pointerup',660,330);await f.frames(14);assert.equal(f.native.panStarts,2);assert.equal(yaw(f).length,0);released(f);}
  });
  assert.equal(checks.length,25,'Keep this focused on the requested25 motion families');
  const inputs=[file,'tools/check-touch-rotation-063.cjs'];const report={version:'0.63',passed:true,checksPassed:checks.length,checks,emulatorUsed:false,actualNativeEngineExecuted:false,
    scope:'Actual touch adapter with prepared DOM/SDL input fixtures. Native camera behavior and visual acceptance remain exact-APK emulator checks.',sources:inputs.map(name=>({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')})),recordedUTC:new Date().toISOString()};
  const output=path.join(root,'archive/rotation-0.63-host-checks.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checksPassed:checks.length,emulatorUsed:false,actualNativeEngineExecuted:false,report:path.relative(root,output).replaceAll('\\','/')}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
