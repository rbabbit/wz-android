'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const source=fs.readFileSync('app/src/main/assets/warzone/briefing.js','utf8'),checks=[];
function fixture(){
 const m={now:0,base:10000,at:0,running:true,timers:[],keys:0,active:true,saveBusy:false,adHeld:false,ignorePause:false,ignoreResume:false};
 const clock=()=>m.base+(m.running?Math.floor((m.now-m.at)/500)*500:0);
 const listeners={};const w={__towersHtml:{session:'document',isActive:()=>m.active},
  __warzoneTowersWaves:{report:()=>({snapshot:{gameTime:clock()}})},
  WarzoneSavedGames:{get busy(){return m.saveBusy}},WarzoneRewards:{busy:false},
  WarzoneRewardedAds:{report:()=>({held:m.adHeld})},addEventListener:(n,f)=>listeners[n]=f,
  __kalaWarzoneTouch:{releaseAll(){},nativePressKey(){m.keys++;if(m.running&&m.ignorePause||!m.running&&m.ignoreResume)return;m.base=clock();m.at=m.now;m.running=!m.running;}}};
 vm.runInNewContext(source,{window:w,performance:{now:()=>m.now},setTimeout:(f,ms)=>m.timers.push({f,at:m.now+ms})});
 async function tick(){m.now+=50;for(const t of m.timers.filter(t=>t.at<=m.now)){m.timers.splice(m.timers.indexOf(t),1);t.f()}for(let i=0;i<5;i++)await Promise.resolve()}
 async function finish(p){let done=false,value;p.then(v=>{done=true;value=v});for(let i=0;i<250&&!done;i++)await tick();assert.ok(done);return value}
 return {m,w,api:w.WarzoneBriefing,finish,tick,end:()=>{m.active=false;listeners['warzone-battle-ended']()}};
}
(async()=>{
 let f=fixture();assert.equal(await f.finish(f.api.prepare('document')),true);assert.equal(f.api.report().phase,'paused');assert.equal(f.m.keys,1);assert.equal(f.m.running,false);
 const stopped=f.api.report().clock;for(let i=0;i<20;i++)await f.tick();assert.equal(f.api.report().clock,stopped);checks.push('Actual helper owns one pause and holds its simulated native clock');
 assert.equal(await f.finish(f.api.prepare('document')),false);assert.equal(f.m.keys,1);assert.equal(await f.finish(f.api.release('wrong')),false);checks.push('Duplicate acquisition and wrong-session release cannot toggle input');
 assert.equal(await f.finish(f.api.release('document')),true);assert.ok(f.api.report().clock>stopped);assert.equal(f.m.keys,2);assert.equal(await f.finish(f.api.release('document')),false);assert.equal(f.m.keys,2);checks.push('Owned release waits for native clock advance and cannot double-toggle');
 f=fixture();f.m.ignorePause=true;assert.equal(await f.finish(f.api.prepare('document')),false);assert.equal(f.api.report().phase,'error');assert.equal(f.m.keys,1);checks.push('A native pause failure is bounded and never claims readiness');
 f=fixture();assert.equal(await f.finish(f.api.prepare('document')),true);f.m.ignoreResume=true;assert.equal(await f.finish(f.api.release('document')),false);assert.equal(f.m.keys,2);checks.push('A native resume failure is bounded and never uncovers paused gameplay');
 f=fixture();const pending=f.api.prepare('document');f.end();assert.equal(await f.finish(pending),false);assert.equal(await f.finish(f.api.release('document')),false);checks.push('Terminal invalidation blocks late acquire/release callbacks');
 for(const name of ['saveBusy','adHeld']){f=fixture();f.m[name]=true;assert.equal(await f.finish(f.api.prepare('document')),false);assert.equal(f.m.keys,0)}checks.push('Conflicting save/ad operations reject a briefing without native input');
 const r={passed:true,emulatorUsed:false,gameplayVerified:false,groups:checks.length,checks,sourceSHA256:crypto.createHash('sha256').update(source).digest('hex')};
 fs.mkdirSync('qa/0.35-briefings',{recursive:true});fs.writeFileSync('qa/0.35-briefings/pause-source-checks.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
})().catch(e=>{console.error(e);process.exitCode=1});
