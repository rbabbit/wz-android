'use strict';
// Fixture/readiness helper only. A stopped script clock is not proof of Pause.
const fs=require('node:fs'),assert=require('node:assert/strict');
const live=require('./native-live.cjs');
async function advancingClock(c,timeout=10000){
 const end=Date.now()+timeout,samples=[];let last,advances=0,rewinds=0;
 while(Date.now()<end){
  const value=await c.evaluate('__warzoneTowersWaves.report().snapshot?.gameTime');
  if(Number.isFinite(value)){
   if(last!==undefined&&value<last){advances=0;rewinds++;}
   else if(last!==undefined&&value>last)advances++;
   last=value;samples.push({ms:Date.now(),clock:value});
   if(advances>=2)return {running:true,clock:value,rewinds,samples};
  }
  await live.delay(200);
 }
 return {running:false,clock:last,rewinds,samples};
}
async function observe(c,options={}){
 const label=options.label||'native-load',proof={source:'native wave clock after load; no stale command snapshot',before:await advancingClock(c,options.timeout||10000)};
 if(proof.before.running)return proof;
 proof.stoppedScreen=live.screen(label+'-clock-not-advancing');
 // A human must inspect the actual current native Pause screen. Never turn a
 // timeout, stale snapshot, or loading delay into an Escape/menu toggle.
 if(!options.confirmedPauseScreenshot){
  const error=new Error('Loaded native clock is not advancing. Inspect '+proof.stoppedScreen+'; no Resume/Escape was sent and no script state acknowledgement was requested.');
  error.nativeLoadProof=proof;throw error;
 }
 assert.ok(fs.existsSync(options.confirmedPauseScreenshot),'explicitly inspected current Pause screenshot exists');
 proof.confirmedPauseScreenshot=options.confirmedPauseScreenshot;
 const paused=require('./test-02-paused-returns.cjs');
 paused.assertClosed(await paused.ui(c),'confirmed Pause after load');
 proof.resumeViewport=await paused.measureResume(c);
 const p=proof.resumeViewport.devicePoint;
 live.adb('shell','input','tap',String(p.x),String(p.y));
 proof.after=await advancingClock(c,10000);
 if(!proof.after.running){const error=new Error('One Resume touch on the explicitly confirmed Pause screen did not restore the native clock; no retry or Escape was sent.');error.nativeLoadProof=proof;throw error;}
 proof.resumedScreen=live.screen(label+'-after-confirmed-native-resume');
 return proof;
}
module.exports={advancingClock,observe};
