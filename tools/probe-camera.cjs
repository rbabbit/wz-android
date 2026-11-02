"use strict";
// Read camera evidence from native QuickSave metadata, never by guessing from
// touch counters. This writes only the emulator's disposable QuickSave slot.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {adb}=require('./android-sdk.cjs');
const socket=new WebSocket(fs.readFileSync(path.join(__dirname,"live-cdp-url.txt"),"utf8").trim());
let seq=0;const pending=new Map();
socket.addEventListener("message",e=>{const m=JSON.parse(String(e.data)),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
async function evaluate(expression){const id=++seq;const r=await new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method:"Runtime.evaluate",params:{expression:`document.getElementById('warzone-game-frame').contentWindow.eval(${JSON.stringify(expression)})`,returnByValue:true,awaitPromise:true}}))});if(r.exceptionDetails)throw r.exceptionDetails;return r.result.value}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function capture(name){
 await evaluate('__kalaWarzoneTouch.nativePressKey("F7","F7",118)');await wait(650);
 return {name,...await evaluate(`(()=>{const j=JSON.parse(Module.FS.readFile('/warzone2100/savegames/skirmish/QuickSave/gam.json',{encoding:'utf8'}));return {position:j.viewDataP,rotation:j.viewDataR,limits:[j.ScrollMinX,j.ScrollMinY,j.ScrollMaxX,j.ScrollMaxY],touch:__kalaWarzoneTouch.report()}})()`)};
}
async function main(){
 await new Promise(r=>socket.addEventListener("open",r,{once:true}));
 const results=[await capture('before')];
 for(const [name,coords] of [['up',[1400,1050,1400,650]],['down',[1400,650,1400,1050]],['left',[1500,900,1100,900]],['right',[1100,900,1500,900]]]){
  execFileSync(adb,['-s','emulator-5554','shell','input','swipe',...coords.map(String),'400']);await wait(250);results.push(await capture(name));
 }
 const file=process.argv[2]||'../qa/camera-baseline.json';const output=path.resolve(__dirname,file);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({name,position,rotation})=>({name,position,rotation}))));socket.close();
}
const timer=setTimeout(()=>process.exit(1),30000);main().then(()=>{clearTimeout(timer);process.exit(0)}).catch(e=>{console.error(e);socket.close();process.exit(1)});
