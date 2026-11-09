'use strict';
// Focused real-device observations. No game-state seeding or synthetic playback.
const fs=require('node:fs'),path=require('node:path');
process.env.WZ_NATIVE_QA=path.resolve(__dirname,'../qa/0.23-music');
const l=require('./native-live.cjs');
(async()=>{
 const c=await l.connect();
 try{
  await c.evaluate(`(()=>{if(window.__qaMusicAudio)return true;window.__qaMusicAudio=[];window.__qaMusicEvents=[];const Original=window.Audio;function Observed(...args){const a=new Original(...args);__qaMusicAudio.push(a);for(const e of ['loadstart','loadedmetadata','canplay','playing','waiting','stalled','error','pause'])a.addEventListener(e,()=>__qaMusicEvents.push({event:e,time:performance.now(),src:a.currentSrc,ready:a.readyState,network:a.networkState,error:a.error?{code:a.error.code,message:a.error.message}:null}));return a;}Observed.prototype=Original.prototype;Object.setPrototypeOf(Observed,Original);window.Audio=Observed;return true;})()`);
  await c.wait('window.__kalaWarzoneTouch?.report().hudVisible',45000);
  await c.tap('#blocknight-music');
  await c.tap('[data-music-enabled="true"]');
  const first=await c.evaluate('WarzoneMusic.report()');
  await l.delay(1500);
  const result=await c.evaluate(`({state:WarzoneMusic.report(),events:__qaMusicEvents,audios:__qaMusicAudio.map(a=>({src:a.currentSrc,paused:a.paused,ready:a.readyState,network:a.networkState,time:a.currentTime,error:a.error?{code:a.error.code,message:a.error.message}:null,canOpus:a.canPlayType('audio/ogg; codecs=opus')})),resources:performance.getEntriesByType('resource').filter(e=>e.name.includes('map-music')).map(e=>({url:e.name,duration:e.duration,size:e.transferSize,body:e.decodedBodySize}))})`);
  result.initial=first;result.scope='Real delivered APK; diagnostic Audio wrapper records actual browser events without replacing playback.';
  const stem=process.argv[2]||'delivered22';fs.writeFileSync(path.join(l.out,stem+'-observed.json'),JSON.stringify(result,null,2)+'\n');l.screen(stem+'-music');
  console.log(JSON.stringify(result));
 }finally{c.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
