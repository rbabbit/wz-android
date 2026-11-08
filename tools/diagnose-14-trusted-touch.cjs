'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),l=require('./native-live.cjs');
(async()=>{const c=await l.connect();try{
 await c.host(`window.__qaTrusted=[];window.__qaTrustedListener=e=>__qaTrusted.push({type:e.type,trusted:e.isTrusted,stamp:e.timeStamp,at:performance.now(),page:e.target.closest?.('button')?.dataset.page,target:e.target.id});for(const k of ['pointerdown','pointerup','click'])document.addEventListener(k,__qaTrustedListener,true);true`);
 for(const[selector,page]of [['#wt-open-factory','factory'],['#wt-command-tabs [data-page="saved"]','saved']]){
  await c.tap(selector);await c.wait('__warzoneCommands.report().page==='+JSON.stringify(page),5000);
 }
 const r={passed:true,identity:require('./lab-journey.cjs').installedIdentity(process.env.WZ_QA_APK),mode:'Standard CDP dispatchTouchEvent on actual emulator WebView; ordered 60ms raw touch, not JS click or experimental synthetic gesture',events:await c.host('__qaTrusted'),screen:l.screen('14-trusted-touch-blueprints')};assert.ok(r.events.every(e=>e.trusted));const downs=r.events.filter(e=>e.type==='pointerdown'),ups=r.events.filter(e=>e.type==='pointerup');r.durations=downs.map((d,i)=>ups[i].stamp-d.stamp);assert.equal(downs.length,2);assert.ok(r.durations.every(ms=>Math.abs(ms-60)<1));assert.equal(r.events.filter(e=>e.type==='click').length,2);fs.writeFileSync(path.join(l.out,'trusted-touch.json'),JSON.stringify(r,null,2));console.log(r);
}finally{await c.host(`for(const k of ['pointerdown','pointerup','click'])document.removeEventListener(k,__qaTrustedListener,true);delete window.__qaTrusted;delete window.__qaTrustedListener;true`);c.close()}})().catch(e=>{console.error(e);process.exitCode=1});
