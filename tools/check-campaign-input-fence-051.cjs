'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./check-campaign-js-051.cjs');
const ROOT=path.resolve(__dirname,'..'),FILE='app/src/main/assets/warzone-campaign-hud.js',source=fs.readFileSync(path.join(ROOT,FILE),'utf8');
const CONTROL='/data/base/script/campaign/mobile/campaign-control.json',checks=[];
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const control=h=>JSON.parse(h.values.get(CONTROL));
function pointer(h,type,id=1,pointerType='touch',isTrusted=true){h.window.dispatchEvent({type,pointerId:id,pointerType,isTrusted});}
async function setup(){const h=harness();h.run('warzone-campaign-hud.js');const api=h.window.__warzoneCampaign;api.poll();api.accept({mode:'campaign',session:'cam1a_1',mission:'cam1a',gameTime:2000});api.toggleAllCombat(true);await h.settle();return{h,api};}
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS: '+name);}
async function main(){
 await check('Physical input fence is registered on iframe window capture before document touch interception',()=>{
  for(const[type,handler]of[['pointerdown','beginPhysicalInput'],['pointerup','endPhysicalInput'],['pointercancel','endPhysicalInput']])assert.ok(source.includes("window.addEventListener('"+type+"',"+handler+",true)"));
 });
 await check('A complete quick tap between HUD polls immediately suspends native ALL intent and keeps it fenced through release settling',async()=>{
  const{h,api}=await setup();assert.equal(control(h).suspended,false);
  pointer(h,'pointerdown');assert.equal(api.report().physicalPointerCount,1);assert.equal(control(h).suspended,true);
  h.advance(20);pointer(h,'pointerup');assert.equal(api.report().physicalPointerCount,0);assert.equal(api.report().inputSettling,true);assert.equal(control(h).suspended,true);
  h.advance(200);assert.equal(api.report().inputSettling,true);assert.equal(control(h).suspended,true);
  h.advance(60);api.poll();await h.settle();assert.equal(control(h).suspended,false);assert.equal(api.report().allCombat,true);
 });
 await check('Pending native click acknowledgement extends suspension beyond the250ms physical release fence',async()=>{
  const{h,api}=await setup();pointer(h,'pointerdown');pointer(h,'pointerup');h.touchState.pendingClicks=1;
  h.advance(300);const requests=api.report().selectionRequests;api.poll();await h.settle();assert.equal(api.report().inputSettling,false);assert.equal(control(h).suspended,true);assert.equal(api.report().selectionRequests,requests);
  h.touchState.pendingClicks=0;api.poll();await h.settle();assert.equal(control(h).suspended,false);
 });
 await check('Multiple pointers remain fenced until every physical pointer is released or cancelled',async()=>{
  const{h,api}=await setup();pointer(h,'pointerdown',1);pointer(h,'pointerdown',2);assert.equal(api.report().physicalPointerCount,2);
  pointer(h,'pointerup',1);h.advance(300);api.poll();assert.equal(api.report().physicalPointerCount,1);assert.equal(control(h).suspended,true);
  pointer(h,'pointercancel',2);assert.equal(api.report().physicalPointerCount,0);assert.equal(control(h).suspended,true);
  h.advance(300);api.poll();await h.settle();assert.equal(control(h).suspended,false);
 });
 await check('Adapter-forwarded mouse events cannot create or release physical touch fences',async()=>{
  const{h,api}=await setup();pointer(h,'pointerdown',99,'mouse',false);assert.equal(api.report().physicalPointerCount,0);assert.equal(control(h).suspended,false);
  pointer(h,'pointerdown',1);pointer(h,'pointerup',1,'mouse',false);assert.equal(api.report().physicalPointerCount,1);assert.equal(control(h).suspended,true);
  pointer(h,'pointercancel',1);assert.equal(api.report().physicalPointerCount,0);
 });
 await check('Blur, mission reset, battle end and pagehide clear stale physical IDs without leaving native ALL enabled on exit',async()=>{
  for(const action of['blur','mission','warzone-battle-ended','pagehide']){
   const{h,api}=await setup();pointer(h,'pointerdown',1);
   if(action==='mission')api.accept({mode:'campaign',session:'cam1b_2',mission:'cam1b',gameTime:2000});else h.window.dispatchEvent({type:action});
   assert.equal(api.report().physicalPointerCount,0,action);
   if(action==='warzone-battle-ended'||action==='pagehide'){assert.equal(control(h).enabled,false);assert.equal(api.report().allCombat,false);}
   else{assert.equal(control(h).suspended,true);h.advance(300);api.poll();await h.settle();assert.equal(control(h).suspended,false);}
  }
 });
 const result={version:'0.51',passed:true,checksPassed:checks.length,checks,emulatorUsed:false,actualNativeEngineExecuted:false,
  scope:'Actual campaign controller event/intent VM checks. Native idempotent-selection behavior and world orders are verified by native checks and the delivery emulator journey.',
  sources:[{path:FILE,sha256:sha(source)},{path:'tools/check-campaign-input-fence-051.cjs',sha256:sha(fs.readFileSync(__filename))}],recordedUTC:new Date().toISOString()};
 fs.writeFileSync(path.join(ROOT,'archive/campaign-input-fence-js-0.51-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,checksPassed:checks.length}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
