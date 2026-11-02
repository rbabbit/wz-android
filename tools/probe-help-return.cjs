"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {adb}=require('./android-sdk.cjs'),device=process.env.WZ_QA_DEVICE||'emulator-5556',out=path.join(__dirname,'../qa/v4.4');fs.mkdirSync(out,{recursive:true});
const socket=new WebSocket(fs.readFileSync(path.join(__dirname,'live-cdp-url.txt'),'utf8').trim());let seq=0;const pending=new Map(),exceptions=[];
socket.addEventListener('message',e=>{const m=JSON.parse(String(e.data)),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params)});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
async function host(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw r.exceptionDetails;return r.result.value}
const engine=e=>host(`document.getElementById('warzone-game-frame').contentWindow.eval(${JSON.stringify(e)})`),wait=ms=>new Promise(r=>setTimeout(r,ms));
const adbRun=args=>execFileSync(adb,['-s',device,...args]);
function shot(name){const b=adbRun(['exec-out','screencap','-p']);fs.writeFileSync(path.join(out,name+'.png'),b);return [b.readUInt32BE(16),b.readUInt32BE(20)]}
let screen;
async function tap(selector){const p=await host(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return [(r.x+r.width/2)/innerWidth,(r.y+r.height/2)/innerHeight]})()`);assert.ok(p.every(v=>v>=0&&v<=1),'tap target must be visible');adbRun(['shell','input','tap',String(Math.round(p[0]*screen[0])),String(Math.round(p[1]*screen[1]))]);await wait(450)}
async function inspect(){return host(`(()=>{const f=document.getElementById('warzone-game-frame'),w=f.contentWindow,b=document.getElementById('blocknight-combat-hud'),h=document.getElementById('warzone-towers-help'),o=document.getElementById('warzone-towers-help-overlay'),c=w.document.getElementById('canvas');const r=e=>e?.getBoundingClientRect().toJSON();return {view:[innerWidth,innerHeight],hostState:{...document.body.dataset},scroll:[scrollX,scrollY,document.documentElement.scrollTop,document.body.scrollTop],frame:r(f),canvas:r(c),childScroll:[w.scrollX,w.scrollY],bar:r(b),barHidden:b?.hidden,barStyle:b&&[getComputedStyle(b).display,getComputedStyle(b).visibility,getComputedStyle(b).opacity],helpOpen:o?!o.hidden:h?.open,inert:[f.inert,document.getElementById('warzone-command-strip').inert],helpScroll:h&&[h.scrollTop,h.scrollHeight,h.clientHeight],dialogs:[...document.querySelectorAll('dialog[open]')].map(x=>x.id),active:document.activeElement?.id,childActive:w.document.activeElement?.id,touch:w.__kalaWarzoneTouch.report(),wave:w.__warzoneTowersWaves.report().snapshot}})()`)}
async function main(){
 await new Promise(r=>socket.addEventListener('open',r,{once:true}));await send('Runtime.enable');
 let ready=false;for(let i=0;i<140;i++){ready=await engine('Boolean(window.__kalaWarzoneTouch?.report().hudVisible&&!window.__kalaWarzoneTouch?.report().cameraFacingPending)');if(ready)break;await wait(500)}assert.ok(ready);await wait(800);
 if(await host("Boolean(document.getElementById('warzone-towers-preparation')?.open)"))await host("document.querySelector('#warzone-towers-preparation button').click();true");
 await host(`(()=>{window.__helpTrace=[];const note=(scope,e)=>__helpTrace.push({scope,type:e.type,target:e.target?.id||e.target?.className,key:e.key,xy:[e.clientX,e.clientY],scroll:[scrollX,scrollY],time:performance.now()});for(const t of ['pointerdown','pointerup','click','focusin','focusout','keydown','keyup'])document.addEventListener(t,e=>note('host',e),true);const w=document.getElementById('warzone-game-frame').contentWindow;for(const t of ['keydown','keyup','focus','blur'])w.addEventListener(t,e=>note('engine',e),true);return true})()`);
 screen=shot('before-help');const results=[{stage:'before',state:await inspect()}];
 for(let cycle=0;cycle<3;cycle++){
  await tap('#blocknight-help');assert.equal((await inspect()).helpOpen,true);shot('help-open-'+cycle);
  for(let i=0;i<6;i++){
   const footer=await host("(()=>{const r=document.querySelector('#warzone-towers-help .wt-help-back').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight}})()");
   if(footer.top>=0&&footer.bottom<footer.height)break;
   adbRun(['shell','input','swipe',String(Math.round(screen[0]*.65)),String(Math.round(screen[1]*.78)),String(Math.round(screen[0]*.65)),String(Math.round(screen[1]*.27)),'400']);await wait(250);
  }
  results.push({stage:'help-scrolled-'+cycle,state:await inspect()});
  await tap('#warzone-towers-help .wt-help-back');await wait(750);const state=await inspect();shot('after-help-'+cycle);results.push({stage:'returned-'+cycle,state});
  fs.writeFileSync(path.join(out,'help-probe-results.json'),JSON.stringify({results,trace:await host('__helpTrace'),exceptions},null,2));
  console.log(JSON.stringify({cycle,state}));
  assert.equal(state.helpOpen,false);assert.deepEqual(state.scroll,[0,0,0,0]);assert.deepEqual(state.inert,[false,false]);assert.ok(state.bar.y>=0&&state.bar.bottom<=state.frame.y);assert.equal(state.barHidden,false);assert.equal(state.barStyle[0],'flex');assert.equal(state.barStyle[1],'visible');assert.equal(state.frame.x,0);assert.equal(state.frame.width,state.view[0]);
  if(process.argv.includes('--controls')){
   const before=await engine('__kalaWarzoneTouch.report()');
   adbRun(['shell','input','swipe',String(Math.round(screen[0]*.46)),String(Math.round(screen[1]*.55)),String(Math.round(screen[0]*.62)),String(Math.round(screen[1]*.55)),'350']);await wait(400);
   const panned=await engine('__kalaWarzoneTouch.report()');assert.ok(panned.pans>before.pans,'battlefield must accept a real pan after HELP return');assert.equal(panned.gestureActive,false);
   const preset=['close','map','battle'][cycle];await tap('#blocknight-zoom-'+preset);
   let zoom;for(let i=0;i<30;i++){zoom=await engine('__kalaWarzoneTouch.report()');if(zoom.zoomAcks>before.zoomAcks&&!zoom.zoomPending)break;await wait(100)}
   assert.equal(zoom.zoomPreset,preset);assert.ok(zoom.zoomAcks>before.zoomAcks,'top menu must reach the actual engine after returning');assert.equal(zoom.gestureActive,false);assert.deepEqual(zoom.heldKeys,[]);
   results.push({stage:'controls-working-'+cycle,touch:zoom});shot('after-help-controls-'+cycle);
   fs.writeFileSync(path.join(out,'help-probe-results.json'),JSON.stringify({results,trace:await host('__helpTrace'),exceptions},null,2));
  }
 }
 if(process.argv.includes('--controls')){
  const view=await host('[innerWidth,innerHeight]');adbRun(['shell','input','tap',String(Math.round(105/view[0]*screen[0])),String(Math.round((view[1]-55)/view[1]*screen[1]))]);await wait(700);shot('native-build-menu-after-help');
 }
 console.log('PASS: three actual HELP scroll → BACK TO BATTLE cycles');socket.close();
}
const timer=setTimeout(()=>process.exit(1),100000);main().then(()=>{clearTimeout(timer);process.exit(0)}).catch(e=>{console.error(e);socket.close();process.exit(1)});
