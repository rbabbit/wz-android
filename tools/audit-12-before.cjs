'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),l=require('./native-live.cjs'),j=require('./lab-journey.cjs'),w=require('./test-12-world-taps.cjs'),{controls}=require('./audit-smooth-building.cjs');
const r={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),started:new Date().toISOString(),cases:[]};
(async()=>{let c;try{c=await j.connectReady();await j.resume(c);
 for(const [selector,condition,name]of [['#lab-ops-research','__blockNightResearch.report().open','footer-research-full-page'],['#lab-ops-production','__warzoneCommands.report().page==="factory"','footer-production-full-page']]){await j.closeOverlays(c);await c.wait('parent.TowersLab.report().visible');await c.tap(selector);await c.wait(condition);r.cases.push({name,screen:await j.capture(c,'12-before-'+name)});}
 await j.closeOverlays(c);const ctl=await controls(c),snapshot=await j.commandState(c),labs=await c.evaluate('__blockNightResearch.report().labs');
 for(const kind of ['research','factory']){const t=w.targets(snapshot,labs,kind)[0];assert.ok(t);await ctl.camera(t.x,t.y);const sample=await w.candidates(c,kind,t.id),point=sample.points[0];await ctl.touch(point.x,point.y);await c.wait('__kalaWarzoneTouch.report().pendingClicks===0');await c.paint();r.cases.push({name:'world-'+kind+'-stock-panel',nativeId:t.id,point,screen:l.screen('12-before-world-'+kind),towersOpen:await c.evaluate('({research:__blockNightResearch.report().open,page:__warzoneCommands.report().page,nativeMenu:__warzoneCommands.report().nativeMenu})')});await c.evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');await j.resume(c);}
 r.pausedAt=await j.pause(c);r.errors=c.errors;r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{r.failureScreen=l.screen('12-before-failure')}catch(_){}throw e}
 finally{c?.close();r.finished=new Date().toISOString();fs.writeFileSync(path.join(l.out,'audit.json'),JSON.stringify(r,null,2)+'\n')}
 console.log({passed:r.passed,cases:r.cases.map(v=>v.name)});
})().catch(e=>{console.error(e);process.exitCode=1});
