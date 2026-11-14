'use strict';
// Focused installed-APK camera/input journey; all movement is real Android/CDP input.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect,adb,delay,screen,out}=require('./native-live.cjs');
const report={version:'0.50',startedUTC:new Date().toISOString(),emulatorUsed:true,androidRuntimeExecuted:true,actualNativeEngineExecuted:true,seeded:false,cases:[],errors:[]};
let c,stage='startup',geo;
const write=()=>fs.writeFileSync(path.join(out,'camera-journey-050.json'),JSON.stringify(report,null,2));
async function state(){return c.evaluate('({touch:__kalaWarzoneTouch.report(),terrain:WarzoneTerrain.report(),view:WarzoneTerrain.view(),time:__warzoneCommands.report().snapshot?.gameTime,selected:__warzoneCommands.report().snapshot?.selectedUnits?.map(u=>({id:u.id,order:u.order,x:u.x,y:u.y}))})');}
async function frames(n=3){const f=await c.evaluate('__kalaWarzoneTouch.report().nativeRenderFrames');await c.wait('__kalaWarzoneTouch.report().nativeRenderFrames>='+String(f+n),15000);}
async function idle(){await c.wait('!__kalaWarzoneTouch.report().gestureActive&&__kalaWarzoneTouch.report().panPhase==="idle"&&!__kalaWarzoneTouch.report().panQueuedPointers&&!__kalaWarzoneTouch.report().pendingClicks',15000);}
async function point(){return c.evaluate('WarzoneTerrain.project(32*128,60*128,128)');}
async function tap(selector){await c.tap(selector);await c.paint();}
async function base(){await idle();await tap('#blocknight-base');await frames(5);}
function physical(p){return {x:Math.round(p.x*geo.sx),y:Math.round(p.y*geo.sy)};}
async function swipe(a,b,ms=450){const p=physical(a),q=physical(b);adb('shell','input','touchscreen','swipe',String(p.x),String(p.y),String(q.x),String(q.y),String(ms));await idle();await frames(3);}
async function touch(type,points){await c.call('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({radiusX:3,radiusY:3,force:.5,...p}))});}
async function capture(name){await c.paint();return screen('camera50-'+name);}
async function check(name,fn){stage=name;const before=await state();const result=await fn(before);await idle();const after=await state();assert.equal(after.touch.heldKeys.length,0);assert.equal(after.touch.panUnobservedRearms,0);assert.equal(after.touch.panHeldTimeouts,0);assert.equal(after.touch.panQueueOverflows,0);report.cases.push({name,passed:true,before,result,after});write();console.log('PASS: '+name);}
async function main(){
 c=await connect();try{
  await c.wait('__kalaWarzoneTouch?.version===57&&__warzoneCommands.report().snapshot?.hasHQ',20000);
  await c.evaluate('WarzoneTerrain.active(true,false);true');await frames(2);
  const png=adb('exec-out','screencap','-p');const viewport=await c.host('({width:innerWidth,height:innerHeight})');
  const canvas=await c.host('(()=>{const b=document.getElementById("warzone-game-frame").getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}})()');
  geo={...viewport,frame:canvas,sx:png.readUInt32BE(16)/viewport.width,sy:png.readUInt32BE(20)/viewport.height};report.viewport=geo;
  const installed=adb('shell','pm','path','com.rbabbit.warzonetowers.lab').toString().trim().replace('package:','');report.installedAPK_SHA256=adb('shell','sha256sum',installed).toString().split(/\s/)[0];
  assert.equal(report.installedAPK_SHA256,'b0e75ce1cbd960594da99531862b65873c3a8a3f27f5daede89d3de2800119c7');
  await check('Four-direction normal Android finger drags move the native camera and settle without held input',async()=>{
   const result=[];for(const [name,a,b] of [['right',{x:650,y:220},{x:760,y:220}],['left',{x:760,y:220},{x:650,y:220}],['down',{x:700,y:200},{x:700,y:270}],['up',{x:700,y:270},{x:700,y:200}]]){
    await base();const before=await point(),count=await c.evaluate('__kalaWarzoneTouch.report().pans');await swipe(a,b);const after=await point();assert.equal(await c.evaluate('__kalaWarzoneTouch.report().pans'),count+1);assert.ok(Math.hypot(after.x-before.x,after.y-before.y)>5,name+' changes actual native projection');const stable=await point();await frames(5);const final=await point();assert.ok(Math.hypot(final.x-stable.x,final.y-stable.y)<.5,name+' settles');result.push({name,before,after,final});
   }return result;
  });
  await check('Rapid repeated short swipes acquire separate native camera movement within the desktop double-click interval',async()=>{
   await base();const start=await state(),before=await point();const samples=[];
   const sampler=await c.evaluate('(()=>{window.__rapidSamples=[];window.__rapidRun=true;const f=()=>{if(!__rapidRun)return;__rapidSamples.push({at:performance.now(),p:WarzoneTerrain.project(32*128,60*128,128),pans:__kalaWarzoneTouch.report().pans,phase:__kalaWarzoneTouch.report().panPhase});requestAnimationFrame(f)};f();return performance.now()})()');
   for(let stroke=0;stroke<3;stroke++){
    await touch('touchStart',[{id:41,x:700,y:240}]);
    await touch('touchMove',[{id:41,x:718,y:240}]);
    await delay(12);await touch('touchMove',[{id:41,x:742,y:240}]);
    await delay(12);await touch('touchMove',[{id:41,x:765,y:240}]);
    await touch('touchEnd',[]);await delay(12);
   }
   await idle();await frames(5);const after=await state();assert.equal(after.touch.pans,start.touch.pans+3);
   const trace=await c.evaluate('(()=>{__rapidRun=false;return __rapidSamples})()');
   for(let n=1;n<=3;n++){const period=trace.filter(s=>s.pans===start.touch.pans+n);assert.ok(period.length>0,'stroke '+n+' observed');const x=period.map(s=>s.p?.x).filter(Number.isFinite);assert.ok(Math.max(...x)-Math.min(...x)>1,'stroke '+n+' moves actual camera');}
   return {before,after:await point(),traceStart:sampler,trace};
  });
  await check('Captured drag across the game/header boundary stays bounded and the next drag works',async()=>{
   await base();const before=await state();await swipe({x:800,y:150},{x:800,y:15},350);const after=await state();assert.equal(after.touch.pans,before.touch.pans+1);assert.ok(after.view.matrix&&Object.values(after.view.matrix).every(Number.isFinite));await base();const a=await point();await swipe({x:700,y:220},{x:760,y:220},250);const b=await point();assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>5);return {before:a,after:b};
  });
  await check('Minimap drag moves the native view separately, then normal battlefield dragging remains available',async()=>{
   await base();const before=await point(),r=await c.evaluate('__kalaWarzoneTouch.report()');const b=geo.frame;
   const side=192,cx=b.width-24-side/2,cy=b.y+b.height-24-side/2;
   await swipe({x:cx+12,y:cy+18},{x:cx-25,y:cy-18},450);
   const after=await point(),end=await c.evaluate('__kalaWarzoneTouch.report()');assert.equal(end.radarDrags,r.radarDrags+1);assert.equal(end.pans,r.pans);assert.ok(Math.hypot(after.x-before.x,after.y-before.y)>5);await base();await swipe({x:700,y:220},{x:760,y:220},300);return {before,after,screenshot:await capture('minimap-then-pan')};
  });
  await check('One-finger pan hands off to two-finger pan, and pinch zoom restores normal input',async()=>{
   await base();const before=await c.evaluate('__kalaWarzoneTouch.report()');
   await touch('touchStart',[{id:51,x:500,y:260}]);await touch('touchMove',[{id:51,x:540,y:260}]);await frames(2);
   await touch('touchStart',[{id:51,x:540,y:260},{id:52,x:650,y:260}]);
   await touch('touchMove',[{id:51,x:570,y:260},{id:52,x:680,y:260}]);await frames(4);await touch('touchEnd',[]);await idle();
   const handoff=await c.evaluate('__kalaWarzoneTouch.report()');assert.equal(handoff.pans,before.pans+2);assert.equal(handoff.pinchSteps,before.pinchSteps);
   await touch('touchStart',[{id:61,x:500,y:260},{id:62,x:700,y:260}]);await touch('touchMove',[{id:61,x:470,y:260},{id:62,x:730,y:260}]);await frames(3);await touch('touchEnd',[]);await idle();
   const after=await c.evaluate('__kalaWarzoneTouch.report()');assert.ok(after.pinchSteps>handoff.pinchSteps);await swipe({x:700,y:220},{x:760,y:220},300);return {handoff,after};
  });
  report.screenshot=await capture('gestures-complete');report.runtimeErrors=c.errors;assert.deepEqual(c.errors,[]);report.passed=true;write();console.log(JSON.stringify({passed:true,cases:report.cases.length,report:path.join(out,'camera-journey-050.json')}));
 }catch(e){report.passed=false;report.failure={stage,error:String(e.stack||e)};try{report.failure.state=await state();report.failure.screenshot=await capture('failure');}catch(_){}write();throw e;}finally{c.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
