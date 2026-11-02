"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const {execFileSync}=require("node:child_process");
const {adb}=require('./android-sdk.cjs');
const url=fs.readFileSync(path.join(__dirname,"live-cdp-url.txt"),"utf8").trim();
const socket=new WebSocket(url);
let sequence=0;
const pending=new Map();
socket.addEventListener("message",event=>{const m=JSON.parse(String(event.data));if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
const evaluate=expression=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve:r=>r.exceptionDetails?reject(r.exceptionDetails):resolve(r.result.value),reject});socket.send(JSON.stringify({id,method:"Runtime.evaluate",params:{expression,returnByValue:true,awaitPromise:true}}))});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function tap(x,y){execFileSync(adb,["-s","emulator-5554","shell","input","tap",String(Math.round(x*2)),String(Math.round(y*2))]);await wait(400)}
async function button(id){const p=await evaluate(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await tap(...p)}
function screenshot(name){execFileSync(adb,["-s","emulator-5554","shell","screencap","-p","/sdcard/towers-qa.png"]);execFileSync(adb,["-s","emulator-5554","pull","/sdcard/towers-qa.png",path.join(__dirname,"../qa/v4/"+name+".png")],{stdio:"ignore"})}
async function main(){
 await new Promise(r=>socket.addEventListener("open",r,{once:true}));
 const before=await evaluate("({view:[innerWidth,innerHeight],t:__kalaWarzoneTouch.report(),w:__warzoneTowersWaves.report()})");
 assert.deepEqual(before.view,[1280,800]);assert.equal(before.t.hudVisible,true);assert.equal(before.w.snapshot.wave,0);
 const bounds=await evaluate("(()=>{const r=canvas.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()");
 const native=(x,y)=>tap(bounds.x+x*bounds.width/1280,bounds.y+y*bounds.height/800);
 await native(105,745);await native(500,755);
 await button("blocknight-queue-orders");
 assert.equal(await evaluate("__kalaWarzoneTouch.report().queueModifierHeld"),false);
 await native(56,363);await native(103,398); // one defence selection
 screenshot("defence-selected-once");
 for(const y of [450,375,300])await native(710,y);
 screenshot("three-placement-taps");
 const placements=await evaluate("__kalaWarzoneTouch.report()");
 assert.equal(placements.queuedOrders,3);assert.equal(placements.queueMode,true);
 await wait(18500);
 let wave=await evaluate("__warzoneTowersWaves.report().snapshot");
 assert.ok(wave.humanPower>=100,"a real armed defence must finish construction");
 await button("blocknight-queue-orders");
 await button("blocknight-zoom-battle");await button("blocknight-base");
 const camera=await evaluate("__kalaWarzoneTouch.report()");
 assert.equal(camera.cameraFacings,1);assert.equal(camera.zoomPreset,"battle");
 const history=[wave];
 for(let i=0;i<6;i++){
  wave=await evaluate("__warzoneTowersWaves.report().snapshot");
  if(wave.wave>=6)break;
  await button("warzone-towers-next-wave");await wait(900);
  history.push(await evaluate("__warzoneTowersWaves.report().snapshot"));
 }
 wave=await evaluate("__warzoneTowersWaves.report().snapshot");assert.ok(wave.wave>=6);
 await button("blocknight-queue-orders");
 screenshot("wave6-tablet");
 const after=await evaluate("({touch:__kalaWarzoneTouch.report(),waves:__warzoneTowersWaves.report(),research:__blockNightResearch.report()})");
 assert.equal(after.touch.cameraFacings,1);assert.equal(after.touch.zoomPreset,"battle");
 fs.writeFileSync(path.join(__dirname,"../qa/v4/gameplay-results.json"),JSON.stringify({before,placements,history,after},null,2));
 console.log(JSON.stringify({placements:placements.queuedOrders,history,after}));socket.close();
}
const timeout=setTimeout(()=>{console.error("Live build test timed out");process.exit(1)},55000);
main().then(()=>{clearTimeout(timeout);process.exit(0)}).catch(e=>{console.error(e);socket.close();process.exit(1)});
