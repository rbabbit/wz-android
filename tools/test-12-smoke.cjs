'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),l=require('./native-live.cjs'),j=require('./lab-journey.cjs'),w=require('./test-12-world-taps.cjs'),{controls}=require('./audit-smooth-building.cjs');
const r={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),started:new Date().toISOString(),screens:[],worldCases:[]};
(async()=>{let c;try{c=await j.start('td2');const s=await j.commandState(c);r.facilities=s.facilityTargets;assert.ok(s.facilityTargets.length>=6);
 for(const kind of ['research','production']){await c.wait('parent.TowersLab.report().visible');await c.tap('#lab-ops-'+kind);await c.wait('parent.TowersStatus.report().kind==='+JSON.stringify(kind));r.screens.push(await j.capture(c,'12-'+kind+'-sidebar'));assert.equal(await c.evaluate('__blockNightResearch.report().open'),false);assert.equal(await c.evaluate('__warzoneCommands.report().page'),'');l.adb('shell','input','keyevent','4');await c.wait('!parent.TowersStatus.report().open');assert.equal(await c.evaluate('__towersHtml.report().menuRequested'),false);}
 const ctl=await controls(c),labs=await c.evaluate('__blockNightResearch.report().labs');for(const kind of ['research','factory']){const t=w.targets(s,labs,kind)[0];await ctl.camera(t.x,t.y);const result=await w.runCase(c,{kind,id:t.id,apk:process.env.WZ_QA_APK,name:'ironvalley-'+kind});r.worldCases.push(result);await j.closeOverlays(c);}
 r.pausedAt=await j.pause(c);r.errors=c.errors;assert.deepEqual(c.errors,[]);r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{r.failureScreen=l.screen('12-smoke-failure')}catch(_){}throw e}
 finally{if(c){try{await j.pause(c)}catch(_){}c.close()}r.finished=new Date().toISOString();fs.writeFileSync(path.join(l.out,'smoke.json'),JSON.stringify(r,null,2)+'\n')}
 console.log({passed:r.passed,hash:r.identity.candidateAPK_SHA256,world:r.worldCases.length});
})().catch(e=>{console.error(e);process.exitCode=1});
