'use strict';
// Observe the real installed APK and browser media element; never replace playback.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
process.env.WZ_NATIVE_QA=path.resolve(__dirname,'../qa/0.23-music');
const l=require('./native-live.cjs');
(async()=>{
 const c=await l.connect();
 try{
  await c.wait('window.__kalaWarzoneTouch?.report().hudVisible',60000);
  const file=path.join(l.root,'app/build/outputs/apk/debug/app-debug.apk'),candidate=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const installed=l.adb('shell','pm','path',l.packageId).toString().trim().slice(8);
  assert.equal(l.adb('shell','sha256sum',installed).toString().trim().split(/\s/)[0],candidate);
  await c.evaluate(`(()=>{if(window.__qaMusicAudio)return;window.__qaMusicAudio=[];const Original=window.Audio;function Observed(...args){const a=new Original(...args);__qaMusicAudio.push(a);return a;}Observed.prototype=Original.prototype;Object.setPrototypeOf(Observed,Original);window.Audio=Observed;})()`);
  if(!await c.evaluate('Boolean(parent.document.querySelector("#wt-map-music-menu:not([hidden])"))'))await c.tap('#blocknight-music');
  await c.tap('[data-music-enabled="false"]');await c.tap('[data-music-enabled="true"]');
  await c.wait('WarzoneMusic.report().playing||WarzoneMusic.report().error',15000);
  const state=await c.evaluate('WarzoneMusic.report()');assert.equal(state.error,'');assert.equal(state.playing,true);
  const media=()=>c.evaluate(`__qaMusicAudio.map(a=>({time:a.currentTime,paused:a.paused,ready:a.readyState,network:a.networkState,src:a.currentSrc,error:a.error?{code:a.error.code,message:a.error.message}:null,capture:typeof a.captureStream}))`);
  const before=await media();await l.delay(1800);const after=await media();
  const a=before.find(a=>a.src.startsWith('blob:')&&!a.paused),b=after.find(v=>v.src===a?.src);
  assert.ok(a&&b&&b.time>a.time+.5,'Actual media clock must advance');
  const capture=await c.evaluate(`(async()=>{const a=__qaMusicAudio.find(a=>a.currentSrc.startsWith('blob:')&&!a.paused);if(typeof a.captureStream!=='function')return {available:false};const w=a.ownerDocument.defaultView,stream=a.captureStream(),ctx=new (w.AudioContext||w.webkitAudioContext)();await ctx.resume();const source=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser(),gain=ctx.createGain();gain.gain.value=0;source.connect(analyser);analyser.connect(gain);gain.connect(ctx.destination);w.__qaMusicPCM={ctx,analyser,stream,source,gain};return {available:true,tracks:stream.getAudioTracks().map(t=>({ready:t.readyState,enabled:t.enabled})),context:ctx.state};})()`);
  await l.delay(1000);
  const pcm=await c.evaluate(`(()=>{const p=window.__qaMusicPCM;if(!p)return null;const values=new Float32Array(p.analyser.fftSize);p.analyser.getFloatTimeDomainData(values);return {rms:Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length),peak:Math.max(...values.map(Math.abs)),context:p.ctx.state};})()`);
  l.screen('delivery23-playing');
  await c.tap('[data-music-enabled="false"]');
  const off=await c.evaluate('WarzoneMusic.report()');assert.equal(off.enabled,false);assert.equal(off.playing,false);
  const offMedia=await media();assert.ok(offMedia.every(a=>a.paused||!a.src));
  await c.tap('[data-music-enabled="true"]');await c.wait('WarzoneMusic.report().playing||WarzoneMusic.report().error',15000);
  const on=await c.evaluate('WarzoneMusic.report()');assert.equal(on.playing,true);assert.equal(on.error,'');
  await c.evaluate(`(()=>{const p=window.__qaMusicPCM;if(p){p.source.disconnect();p.gain.disconnect();p.ctx.close();delete window.__qaMusicPCM;}return true;})()`);
  const result={candidateAPK_SHA256:candidate,emulatorUsed:true,musicPlaybackObserved:true,gameplayVerified:false,cacheFixture:'Canonical optional pack copied to app-private cache and hash-verified by the real app; download flow not tested.',instrumentation:'Audio constructor observer returns the original native browser element unchanged; play/fetch/decoder are not replaced.',observations:{initialState:state,mediaBefore:before,mediaAfter:after,capture,pcm,offState:off,offMedia,onState:on},playbackEvidence:{mediaTimeAdvanced:true,decodedPCMNonZero:Boolean(pcm&&pcm.rms>0.000001),audioOutputObserved:false,hostAudioSinkAvailable:false},audioOutputLimitation:'Speaker output was not monitored. The prior emulator session logged audio HAL I/O errors; following recovery the media clock and decoded PCM are measured independently.'};
  fs.writeFileSync(path.join(l.out,'playback-observed.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
 }finally{c.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
