"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const expected=process.argv[2]||'normal',out=path.join(__dirname,'../qa/v4.5'),device=process.env.WZ_QA_DEVICE||'emulator-5556';
const {adb}=require('./android-sdk.cjs');
const ws=new WebSocket(fs.readFileSync(path.join(__dirname,'live-cdp-url.txt'),'utf8').trim());let id=0;const calls=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data)),p=calls.get(m.id);if(p){calls.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
async function evaluate(expression,engine=true){const n=++id,r=await new Promise((resolve,reject)=>{calls.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method:'Runtime.evaluate',params:{expression:engine?`document.getElementById('warzone-game-frame').contentWindow.eval(${JSON.stringify(expression)})`:expression,returnByValue:true,awaitPromise:true}}))});if(r.exceptionDetails)throw r.exceptionDetails;return r.result.value}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){await new Promise(r=>ws.addEventListener('open',r,{once:true}));let r;
 for(let i=0;i<180;i++){r=await evaluate('({graphics:WarzoneGraphics.report(),touch:window.__kalaWarzoneTouch?.report(),wave:window.__warzoneTowersWaves?.report().snapshot,errors:window.errorLog})');if(r.graphics.error)throw new Error(r.graphics.error);if(r.touch?.hudVisible&&!r.touch.cameraFacingPending&&r.wave)break;await wait(500)}
 assert.equal(r.graphics.requested,expected);assert.equal(r.touch.hudVisible,true);assert.ok(r.wave&&r.wave.mode==='numbered-waves');
 if(expected==='high'){assert.equal(r.graphics.archiveLoaded,true);assert.equal(r.graphics.bytes,99639408);assert.equal(r.graphics.terrainMode,'2');assert.ok(r.graphics.nativeArchiveOpens>0);assert.ok(r.graphics.nativeArchiveReadBytes>1048576,'engine must read actual HQ texture data, not only expose a quality label')}
 else{assert.equal(r.graphics.archiveLoaded,false);assert.equal(r.graphics.terrainMode,'1');assert.equal(r.graphics.nativeArchiveOpens,0)}
 let button;
 for(let i=0;i<30;i++){
  button=await evaluate("(()=>{const d=document.getElementById('warzone-towers-preparation');if(!d?.open)return null;const r=d.querySelector('button').getBoundingClientRect();return [(r.x+r.width/2)/innerWidth,(r.y+r.height/2)/innerHeight]})()",false);
  if(button)break;await wait(200);
 }
 assert.ok(button,'four-minute preparation dialog appears');
 const surface=execFileSync(adb,['-s',device,'exec-out','screencap','-p']);
 execFileSync(adb,['-s',device,'shell','input','tap',String(Math.round(button[0]*surface.readUInt32BE(16))),String(Math.round(button[1]*surface.readUInt32BE(20)))]);
 await wait(700);assert.equal(await evaluate("document.getElementById('warzone-towers-preparation').open",false),false);
 r=await evaluate('({graphics:WarzoneGraphics.report(),touch:__kalaWarzoneTouch.report(),wave:__warzoneTowersWaves.report().snapshot,errors:window.errorLog})');
 fs.writeFileSync(path.join(out,expected+'-gameplay-results.json'),JSON.stringify(r,null,2));
 const png=execFileSync(adb,['-s',device,'exec-out','screencap','-p']);fs.writeFileSync(path.join(out,expected+'-battle.png'),png);console.log(JSON.stringify(r));ws.close();
}
const timer=setTimeout(()=>{console.error('Graphics gameplay check timed out');process.exit(1)},120000);main().then(()=>{clearTimeout(timer);process.exit(0)}).catch(e=>{console.error(e);ws.close();process.exit(1)});
