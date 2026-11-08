'use strict';
process.env.WZ_NATIVE_QA ||= require('path').resolve(__dirname,'../qa/test-13/diagnostics/help-touch');
const fs=require('fs'),path=require('path'),j=require('./lab-journey.cjs'),l=require('./native-live.cjs');
(async()=>{const c=await j.connectReady();try{
 await j.closeOverlays(c);await c.tap('#blocknight-help');await c.wait('!parent.document.getElementById("warzone-towers-help-overlay").hidden');
 const inspect=()=>c.host(`(()=>{const el=document.querySelector('.wt-help-content'),r=el.getBoundingClientRect(),a=[];for(let e=el;e;e=e.parentElement){const s=getComputedStyle(e);a.push({tag:e.tagName,id:e.id,class:e.className,box:e.getBoundingClientRect().toJSON(),touch:s.touchAction,overflow:s.overflow,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,inert:e.inert})}return{a,scroll:el.scrollTop,point:document.elementFromPoint(r.x+r.width*.65,r.bottom-14)?.outerHTML.slice(0,220),viewport:[innerWidth,innerHeight]}})()`);
 const before=await inspect();console.log(JSON.stringify(before));
 const png=l.adb('exec-out','screencap','-p'),b=before.a[0].box,sx=png.readUInt32BE(16)/before.viewport[0],sy=png.readUInt32BE(20)/before.viewport[1];
 l.adb('shell','input','swipe',String(Math.round((b.x+b.width*.65)*sx)),String(Math.round((b.bottom-14)*sy)),String(Math.round((b.x+b.width*.65)*sx)),String(Math.round((b.top+14)*sy)),'350');await c.paint();await l.delay(500);
 const after=await inspect();console.log(JSON.stringify({after}));
 fs.writeFileSync(path.join(l.out,'touch.json'),JSON.stringify({before,after},null,2));l.screen('actual-swipe');
 }finally{await j.closeOverlays(c);await j.pause(c);c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
