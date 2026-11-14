'use strict';
// Real Android WebView input and native terrain projection evidence. No seeded units.
const fs=require('node:fs'),path=require('node:path');
const {connect,delay,screen,out,adb}=require('./native-live.cjs');
const label=process.argv[2]||'audit';
const audit={label,startedUTC:new Date().toISOString(),seeded:false};
async function main(){
 const c=await connect();
 try{
  await c.wait('window.__kalaWarzoneTouch?.ready&&window.WarzoneTerrain?.view?.()',20000);
  audit.viewport=await c.host('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
  audit.start=await c.evaluate('({touch:__kalaWarzoneTouch.report(),terrain:WarzoneTerrain.report(),view:WarzoneTerrain.view()})');
  await c.evaluate(`(()=>{
   window.__panAudit?.stop?.();
   const a=window.__panAudit={frames:[],events:[],running:true,lastObservation:-1};
   WarzoneTerrain.active(true,false);
   const record=e=>{if(a.running&&['pointerdown','pointermove','pointerup','pointercancel'].includes(e.type))a.events.push({at:performance.now(),type:e.type,kind:e.pointerType,button:e.button,buttons:e.buttons,x:e.clientX,y:e.clientY,trusted:e.isTrusted});};
   window.addEventListener('pointerdown',record,true);window.addEventListener('pointermove',record,true);window.addEventListener('pointerup',record,true);window.addEventListener('pointercancel',record,true);
   const original=HTMLCanvasElement.prototype.dispatchEvent;
   HTMLCanvasElement.prototype.dispatchEvent=function(e){if(this.id==='canvas'&&e.pointerType==='mouse')record(e);return original.call(this,e);};
   const sample=()=>{if(!a.running)return;const t=WarzoneTerrain.report(),v=WarzoneTerrain.view();if(t.observations!==a.lastObservation){a.lastObservation=t.observations;a.frames.push({at:performance.now(),observations:t.observations,point:WarzoneTerrain.project(32*128,60*128,128),matrix:v&&Array.from(v.matrix),touch:__kalaWarzoneTouch.report()});}a.raf=requestAnimationFrame(sample);};
   a.stop=()=>{a.running=false;cancelAnimationFrame(a.raf);HTMLCanvasElement.prototype.dispatchEvent=original;for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])window.removeEventListener(type,record,true);};sample();return true;
  })()`);
  // A direct saved-game load need not have installed the touch frame observer
  // yet. Observe actual terrain draws for pre-input readiness instead.
  const frame=await c.evaluate('WarzoneTerrain.report().observations');
  await c.wait('WarzoneTerrain.report().observations>'+String(frame+2),10000);
  // CSS coordinates are derived from the observed 1280x576 game viewport;
  // stay in open battlefield, away from header/footer, units and radar.
  const w=audit.viewport.width,h=audit.viewport.height;
  const start={x:w*.70,y:h*.35},end={x:w*.78,y:h*.42};
  audit.stroke={start,end};
  const png=adb('exec-out','screencap','-p');
  const sx=png.readUInt32BE(16)/w,sy=png.readUInt32BE(20)/h;
  audit.inputMethod='Android input touchscreen swipe; no per-event CDP round-trip delays';
  adb('shell','input','touchscreen','swipe',String(Math.round(start.x*sx)),String(Math.round(start.y*sy)),String(Math.round(end.x*sx)),String(Math.round(end.y*sy)),'650');
  const finishFrame=await c.evaluate('__kalaWarzoneTouch.report().nativeRenderFrames');
  await c.wait('__kalaWarzoneTouch.report().nativeRenderFrames>'+String(finishFrame+8)+'&&!__kalaWarzoneTouch.report().gestureActive',15000);
  audit.trace=await c.evaluate('(()=>{const a=__panAudit;a.stop();return {events:a.events,frames:a.frames,touch:__kalaWarzoneTouch.report()};})()');
  if(audit.trace.touch.pans<=audit.start.touch.pans)throw Error('Invalid fixture: Android stroke did not enter camera pan');
  audit.screenshot=screen('pan-'+label);
  audit.runtimeErrors=c.errors;
  const apk=adb('shell','pm','path','com.rbabbit.warzonetowers.lab').toString().trim().replace('package:','');
  audit.installedAPK_SHA256=adb('shell','sha256sum',apk).toString().split(/\s/)[0];
  fs.writeFileSync(path.join(out,'pan-'+label+'.json'),JSON.stringify(audit,null,2));
  console.log(JSON.stringify({label,events:audit.trace.events.length,frames:audit.trace.frames.length,stroke:audit.stroke,positions:audit.trace.frames.map(f=>({at:f.at,x:f.point?.x,y:f.point?.y})),mouse:audit.trace.events.filter(e=>e.kind==='mouse'&&e.button===1),file:path.join(out,'pan-'+label+'.json')}));
 }finally{c.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
