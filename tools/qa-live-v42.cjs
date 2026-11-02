"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {execFileSync}=require("node:child_process");
const {adb}=require('./android-sdk.cjs');
const out=path.join(__dirname,"../qa/v4.2");fs.mkdirSync(out,{recursive:true});
const socket=new WebSocket(fs.readFileSync(path.join(__dirname,"live-cdp-url.txt"),"utf8").trim());
let seq=0;const pending=new Map();
socket.addEventListener("message",e=>{const m=JSON.parse(String(e.data));const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw r.exceptionDetails;return r.result.value};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function shot(name){execFileSync(adb,["-s","emulator-5554","shell","screencap","-p","/sdcard/towers-v42-qa.png"]);execFileSync(adb,["-s","emulator-5554","pull","/sdcard/towers-v42-qa.png",path.join(out,name+".png")],{stdio:"ignore"})}
async function inspect(){return evaluate(`(()=>{
 const f=document.getElementById('warzone-game-frame'),w=f.contentWindow,c=w.document.getElementById('canvas');
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
 const bar=document.getElementById('blocknight-combat-hud');
 return {host:[innerWidth,innerHeight,devicePixelRatio],frame:rect(f),engine:[w.innerWidth,w.innerHeight],canvas:rect(c),buffer:[c.width,c.height],
  transform:w.getComputedStyle(w.document.getElementById('emscripten_container')).transform,
  bar:rect(bar),barScroll:[bar.scrollWidth,bar.clientWidth],playing:document.body.dataset.playing,research:document.body.dataset.research,
  isolation:[crossOriginIsolated,w.crossOriginIsolated,typeof w.SharedArrayBuffer],touch:w.__kalaWarzoneTouch.report()};})()`)}
function check(m,research=false){
 const [width,height]=m.host;const top=research?0:50;
 assert.equal(m.frame.x,0);assert.equal(m.frame.y,top);assert.equal(m.frame.width,width);assert.equal(m.frame.height,height-top);
 assert.deepEqual(m.engine,[width,height-top]);
 assert.equal(m.canvas.x,0);assert.equal(m.canvas.y,0);
 assert.ok(Math.abs(m.canvas.width-width)<1 && Math.abs(m.canvas.height-(height-top))<1,"canvas must fill the actual engine viewport");
 assert.equal(m.transform,"none","finished engine frame must never be scaled or translated");
 assert.ok(Math.abs(m.buffer[0]/m.buffer[1]-width/(height-top))<.005,"render buffer must preserve the displayed aspect ratio");
 assert.deepEqual(m.isolation,[true,true,"function"]);
 if(!research){assert.ok(m.bar.bottom<=50);assert.ok(m.barScroll[0]<=m.barScroll[1]+1,"all commands must fit")}
 assert.equal(m.touch.cameraFacings,1,"resize and research must not turn the camera");
}
async function main(){
 await new Promise(r=>socket.addEventListener("open",r,{once:true}));
 const results=[];let m=await inspect();check(m);results.push({name:"native-tablet",metrics:m});shot("native-tablet-full-width");
 for(const [name,width,height] of [["phone-wide",1182,532],["tablet-four-three",1024,768],["minimum",642,532]]){
  await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:2,mobile:false});await wait(1000);
  m=await inspect();check(m);assert.deepEqual(m.host.slice(0,2),[width,height]);results.push({name,metrics:m});shot(name+"-full-width");
  await evaluate("document.getElementById('blocknight-tech').click()");await wait(700);
  m=await inspect();check(m,true);
  assert.equal(await evaluate("document.getElementById('warzone-game-frame').contentWindow.__blockNightResearch.report().open"),true);
  shot(name+"-research");
  await evaluate("document.getElementById('warzone-game-frame').contentDocument.querySelector('.bn-tech-done').click()");await wait(700);
  m=await inspect();check(m);results.push({name:name+"-after-research",metrics:m});
  await evaluate("document.getElementById('blocknight-help').click()");
  const help=await evaluate("(()=>{const d=document.getElementById('warzone-towers-help'),r=d.getBoundingClientRect();return {open:d.open,top:r.top,bottom:r.bottom}})()");
  assert.equal(help.open,true);assert.ok(help.top>=0&&help.bottom<=height+1);
  await evaluate("(()=>{const d=document.getElementById('warzone-towers-help');d.scrollTop=d.scrollHeight})()");shot(name+"-help");
  await evaluate("document.querySelector('#warzone-towers-help .wt-help-back').click()");
 }
 await send("Emulation.clearDeviceMetricsOverride");await wait(900);
 for(let i=0;i<3;i++){await evaluate("dispatchEvent(new Event('resize'));true");await wait(300)}
 m=await inspect();check(m);results.push({name:"native-after-three-resizes",metrics:m});shot("native-final-full-width");
 fs.writeFileSync(path.join(out,"viewport-results.json"),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(r=>({name:r.name,host:r.metrics.host,frame:r.metrics.frame,canvas:r.metrics.canvas,buffer:r.metrics.buffer}))));
 socket.close();
}
const timeout=setTimeout(()=>{console.error("Layout test timed out");process.exit(1)},55000);
main().then(()=>{clearTimeout(timeout);process.exit(0)}).catch(e=>{console.error(e);socket.close();process.exit(1)});
