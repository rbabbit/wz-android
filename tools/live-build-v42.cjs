"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {execFileSync}=require("node:child_process");
const {adb}=require('./android-sdk.cjs');
const out=path.join(__dirname,"../qa/v4.2");
const socket=new WebSocket(fs.readFileSync(path.join(__dirname,"live-cdp-url.txt"),"utf8").trim());
let sequence=0;const pending=new Map();
socket.addEventListener("message",e=>{const m=JSON.parse(String(e.data)),p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)});
const evaluate=expression=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve:r=>r.exceptionDetails?reject(r.exceptionDetails):resolve(r.result.value),reject});socket.send(JSON.stringify({id,method:"Runtime.evaluate",params:{expression:`document.getElementById('warzone-game-frame').contentWindow.eval(${JSON.stringify(expression)})`,returnByValue:true,awaitPromise:true}}))});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function tap(x,y){execFileSync(adb,["-s","emulator-5554","shell","input","tap",String(Math.round(x*2)),String(Math.round(y*2))]);await wait(400)}
async function button(id){const p=await evaluate(`(()=>{const e=parent.document.getElementById(${JSON.stringify(id)})||document.getElementById(${JSON.stringify(id)}),r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2+(e.ownerDocument===document?50:0)]})()`);await tap(...p)}
function screenshot(name){execFileSync(adb,["-s","emulator-5554","shell","screencap","-p","/sdcard/towers-v42-build.png"]);execFileSync(adb,["-s","emulator-5554","pull","/sdcard/towers-v42-build.png",path.join(out,name+".png")],{stdio:"ignore"})}
async function main(){
 await new Promise(r=>socket.addEventListener("open",r,{once:true}));
 const before=await evaluate("({view:[innerWidth,innerHeight],t:__kalaWarzoneTouch.report(),w:__warzoneTowersWaves.report()})");
 assert.deepEqual(before.view,[1280,750]);assert.equal(before.t.hudVisible,true);
 await button("blocknight-zoom-battle");await button("blocknight-base");
 // Default is a fresh battlefield. Use --panel-open when resuming with Build open.
 if(process.argv.includes("--panel-open"))await tap(105,745);
 await tap(105,745);await tap(500,755);
 if(!await evaluate("__kalaWarzoneTouch.report().queueMode"))await button("blocknight-queue-orders");
 await button("blocknight-zoom-battle"); // parent toolbar must not cancel +Q
 assert.equal(await evaluate("__kalaWarzoneTouch.report().queueMode"),true);
 assert.equal(await evaluate("__kalaWarzoneTouch.report().queueModifierHeld"),false);
 await tap(56,363);await tap(103,398); // defence page, HMG tower ONCE
 screenshot("defence-selected-once");
 const ordersBefore=await evaluate("__kalaWarzoneTouch.report().queuedOrders");
 for(const y of [450,375,300])await tap(710,y);
 screenshot("three-placement-taps");
 const placements=await evaluate("__kalaWarzoneTouch.report()");
 assert.equal(placements.queuedOrders-ordersBefore,3);assert.equal(placements.queueMode,true);
 await wait(18500);
 const wave=await evaluate("__warzoneTowersWaves.report().snapshot");
 assert.ok(wave.humanPower>=100,"at least one actual armed defence must finish construction");
 await button("blocknight-queue-orders");
 await button("blocknight-zoom-map");await button("blocknight-zoom-close");await button("blocknight-zoom-battle");
 await wait(700);
 const zoom=await evaluate("__kalaWarzoneTouch.report()");assert.equal(zoom.zoomPreset,"battle");assert.equal(zoom.zoomPending,false);assert.equal(zoom.cameraFacings,1);
 execFileSync(adb,["-s","emulator-5554","shell","input","swipe","1400","900","1650","900","300"]);await wait(500);
 await button("blocknight-tech");await wait(500);
 await evaluate("__blockNightResearch.selectLab(0);__blockNightResearch.selectTopic(0);__blockNightResearch.assignSelectedTopic();true");
 await evaluate("document.querySelector('.bn-tech-done').click();true");await wait(1100);
 const research=await evaluate("__blockNightResearch.report()");
 assert.equal(research.open,false);assert.ok(research.commandAcks>=1);assert.equal(research.commandRejects,0);assert.equal(research.commandTimeouts,0);
 const after=await evaluate("({touch:__kalaWarzoneTouch.report(),waves:__warzoneTowersWaves.report(),research:__blockNightResearch.report(),frame:parent.document.getElementById('warzone-game-frame').getBoundingClientRect().toJSON(),canvas:canvas.getBoundingClientRect().toJSON()})");
 assert.ok(after.touch.pans>before.t.pans);assert.equal(after.touch.gestureActive,false);assert.deepEqual(after.touch.heldKeys,[]);assert.equal(after.touch.cameraFacings,1);assert.equal(after.frame.x,0);assert.equal(after.frame.width,1280);assert.equal(after.frame.y,50);assert.equal(after.canvas.width,1280);assert.equal(after.canvas.height,750);
 screenshot("battle-after-touch-and-research");
 fs.writeFileSync(path.join(out,"gameplay-results.json"),JSON.stringify({before,placements,wave,zoom,after},null,2));console.log(JSON.stringify({placements:placements.queuedOrders-ordersBefore,wave,zoom,after}));socket.close();
}
const timeout=setTimeout(()=>{console.error("Live build test timed out");process.exit(1)},55000);
main().then(()=>{clearTimeout(timeout);process.exit(0)}).catch(e=>{console.error(e);socket.close();process.exit(1)});
