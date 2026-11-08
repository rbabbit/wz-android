'use strict';
// Actual TRUCKS taps on ordinary authored Dustfall units. No orders or units injected.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs'),p=require('./test-05-preview-journey.cjs'),s=require('./test-02-selection-journey.cjs');
const r={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),seeded:false,selections:[],checks:{},started:new Date().toISOString()};
const write=()=>fs.writeFileSync(path.join(l.out,'trucks.json'),JSON.stringify(r,null,2)+'\n');
const read=c=>c.evaluate('({native:__warzoneCommands.report().snapshot,trace:__warzoneCommands.report().truckSelection,touch:__kalaWarzoneTouch.report(),terrain:WarzoneTerrain.report()})');
const orders=v=>v.native.trucks.map(t=>[t.id,t.x,t.y,t.order,t.action,t.queued]);
(async()=>{let c,rec,recording;try{
 c=process.argv.includes('--reuse')?await j.connectReady():await p.start();await j.resume(c);await s.cameraFixture(c,[8,72],[160001,160003]);
 await s.revealField(c);await c.tap('#blocknight-select-all');await c.wait('__warzoneCommands.report().snapshot.selectedUnits.length===0');await s.monitor(c);
 const remote='/sdcard/towers-07-trucks-after.mp4';
 rec=spawn(require('./android-sdk.cjs').adb,['-s',l.device,'shell','screenrecord','--bit-rate','2000000','--time-limit','15',remote],{windowsHide:true});
 recording=new Promise((resolve,reject)=>{rec.once('exit',code=>code===0?resolve():reject(Error('screenrecord '+code)));rec.once('error',reject)});
 for(let n=0;n<3;n++){
  const before=await read(c);await s.truckButton(c,[160001,160003]);const after=await read(c);
  assert.deepEqual(orders(after),orders(before),'selection preserves native positions and orders');
  assert.equal(after.terrain.gpuBufferReads,before.terrain.gpuBufferReads,'TRUCKS cannot read full native GPU mesh');
  assert.equal(after.trace.phase,'selected');
  if(n>0){assert.equal(after.trace.boxes,0);assert.equal(after.trace.retained,true);}
  r.selections.push({attempt:n+1,trace:after.trace,selected:after.native.selectedUnits,boxCount:after.touch.boxSelections,terrainReads:after.terrain.gpuBufferReads});
  l.screen('trucks-after-'+n);write();
 }
 r.firstArea=r.selections[0].trace.regions.map(b=>(b.right-b.left)*(b.bottom-b.top));
 const bounds=await c.evaluate('__kalaWarzoneTouch.nativeSelectionBounds()'),area=(bounds.right-bounds.left)*(bounds.bottom-bounds.top);
 assert.ok(r.firstArea.every(a=>a<=area*.12+1),'native feedback stays in small local regions');
 await recording;rec=null;
 l.adb('pull',remote,path.join(l.out,'trucks-after.mp4'));r.recording='trucks-after.mp4';
 await s.cameraFixture(c,[27,21],[160005]);await s.truckButton(c,[160005]);r.otherSide=await read(c);l.screen('trucks-other-side');
 r.monitor=await s.stopMonitor(c);const samples=r.monitor.samples;
 assert.ok(samples.length>3&&samples.every(v=>!v.covered&&!v.ended));
 assert.ok(samples.every(v=>v.frame.join()===samples[0].frame.join()&&v.canvas.join()===samples[0].canvas.join()&&v.zoom.join()===samples[0].zoom.join()));
 assert.ok(samples.at(-1).clock>samples[0].clock&&samples.at(-1).frames>samples[0].frames);
 r.checks={localizedNativeFeedback:true,repeatWithoutGestures:true,nativeIDsHighlightsAndOrders:true,cameraGroupRefresh:true,noMeshRead:true,noCoverOrAutomaticZoom:true};r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{r.failureScreen=l.screen('trucks-failure');if(c)r.failureState=await read(c)}catch(_){}throw e}
 finally{if(rec){try{l.adb('shell','pkill','-INT','screenrecord')}catch(_){}}if(c){try{r.pausedAt=await j.pause(c)}catch(e){r.cleanupFailure=String(e);r.passed=false}c.close()}r.finished=new Date().toISOString();write()}
})().catch(e=>{console.error(e);process.exitCode=1});
