'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
process.env.WZ_NATIVE_QA=path.resolve(__dirname,'../qa/0.32-offline-small');
process.env.WZ_QA_UI_INPUT='adb-scaled';
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const write=(n,v)=>fs.writeFileSync(path.join(l.out,n+'.json'),JSON.stringify(v,null,2)+'\n');
async function scroll(c,selector,name){
 const inspect=()=>c.evaluate(`(()=>{const e=parent.document.querySelector(${JSON.stringify(selector)})||document.querySelector(${JSON.stringify(selector)});if(!e)return null;const b=e.getBoundingClientRect(),f=e.ownerDocument===document?parent.document.getElementById('warzone-game-frame').getBoundingClientRect():{x:0,y:0};return {x:b.x+f.x,y:b.y+f.y,w:b.width,h:b.height,viewportW:parent.innerWidth,viewportH:parent.innerHeight,scroll:e.scrollTop,total:e.scrollHeight,client:e.clientHeight,display:getComputedStyle(e).display};})()`);
 const before=await inspect();assert(before&&before.w>0&&before.h>0&&before.display!=='none',selector+' actually visible');
 if(before.total>before.client+8){const p=l.adb('exec-out','screencap','-p'),sx=p.readUInt32BE(16)/before.viewportW,sy=p.readUInt32BE(20)/before.viewportH;
 l.adb('shell','input','swipe',String(Math.round((before.x+before.w*.70)*sx)),String(Math.round((before.y+before.h*.80)*sy)),String(Math.round((before.x+before.w*.70)*sx)),String(Math.round((before.y+before.h*.20)*sy)),'360');await c.paint();await c.wait(`(()=>{const e=parent.document.querySelector(${JSON.stringify(selector)})||document.querySelector(${JSON.stringify(selector)});return e.scrollTop>${before.scroll}+4;})()`,5000);}
 const after=await inspect();l.screen(name);return {selector,before,after,physicalTouchUsed:true};
}
async function layouts(){const c=await l.connect();try{const checks=[];
 await c.tap('#blocknight-help');await c.tap('[data-ui-size="1.4"]');await c.paint();checks.push(await scroll(c,'.wt-help-content','game-xl-help-scroll'));await c.tap('#blocknight-help');
 await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open',10000);checks.push(await scroll(c,'.bn-tech-list','game-xl-research-scroll'));await c.tap('#blocknight-tech');
 await c.tap('#wt-open-build');await c.wait('__warzoneCommands.report().buildOpen',10000);checks.push(await scroll(c,'#wt-sidebar-catalogue','game-xl-build-scroll'));await c.tap('#wt-open-build');
 await c.tap('#wt-open-factory');await c.paint();l.screen('game-xl-production');
 const buttons=await c.evaluate('Array.from(parent.document.querySelectorAll("#wt-command-pages button")).filter(e=>e.getBoundingClientRect().height).map(e=>({text:e.textContent.trim(),id:e.id,attrs:Array.from(e.attributes).filter(a=>a.name.startsWith("data-")).map(a=>[a.name,a.value])}))');
 await c.tap('#wt-open-factory');await c.tap('#blocknight-help');await c.tap('[data-ui-size="1"]');await c.tap('#blocknight-help');
 write('game-xl-scroll',{identity:j.installedIdentity(),checks,productionButtons:buttons,errors:c.errors});
 }finally{c.close();}}
async function music(){const c=await l.connect();try{
 await c.evaluate(`(()=>{window.__music032Audio=[];const O=window.Audio;function A(...args){const a=new O(...args);__music032Audio.push(a);return a;}A.prototype=O.prototype;Object.setPrototypeOf(A,O);window.Audio=A;return true;})()`);
 await c.tap('#blocknight-music');await c.tap('[data-music-enabled="false"]');const off=await c.evaluate('WarzoneMusic.report()');assert(!off.playing&&!off.enabled);
 await c.tap('[data-music-enabled="true"]');await c.wait('WarzoneMusic.report().playing&&WarzoneMusic.report().mediaReadyState===4',15000);
 const first=await c.evaluate('WarzoneMusic.report()');await c.wait('WarzoneMusic.report().mediaTimeSeconds>'+first.mediaTimeSeconds+'+1',6000);const second=await c.evaluate('WarzoneMusic.report()');
 const capture=await c.evaluate(`(async()=>{const a=__music032Audio.find(a=>a.currentSrc.startsWith('blob:')&&!a.paused);if(!a?.captureStream)return {available:false};const ctx=new AudioContext();await ctx.resume();const stream=a.captureStream(),source=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser(),gain=ctx.createGain();gain.gain.value=0;source.connect(analyser);analyser.connect(gain);gain.connect(ctx.destination);window.__pcm032={ctx,source,analyser,gain,stream};return {available:true,context:ctx.state};})()`);
 await l.delay(500);const pcm=await c.evaluate(`(()=>{const p=window.__pcm032;if(!p)return null;const a=new Float32Array(p.analyser.fftSize);p.analyser.getFloatTimeDomainData(a);const r={rms:Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length),peak:Math.max(...a.map(Math.abs))};p.source.disconnect();p.gain.disconnect();p.ctx.close();return r;})()`);
 assert(pcm&&pcm.rms>0.000001,'actual decoded soundtrack PCM is nonzero');
 await c.tap('[data-music-enabled="false"]');await c.tap('#blocknight-music');
 write('music-controls-pcm',{identity:j.installedIdentity(),off,first,second,capture,pcm,outputSpeakerMonitored:false,instrumentation:'Audio observer returns the original browser element; captureStream measures actual decoded samples without replacing playback.'});
 }finally{c.close();}}
(async()=>{if(process.argv[2]==='layouts')await layouts();else if(process.argv[2]==='music')await music();else throw Error('Unknown stage');})().catch(e=>{console.error(e);process.exitCode=1;});
