'use strict';
// Retention smoke only: no new 1v1 work, units, research or rules.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const r={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),checks:{},started:new Date().toISOString()};
(async()=>{let c;try{
 l.adb('shell','am','force-stop',l.packageId);l.adb('shell','am','start','-n',l.packageId+'/com.rbabbit.blocknight.warzone.MainActivity','--es','match_mode','duel','--es','duel_weapon','cannon');await l.nativeTap('Start game, 1v1 vs Bot');c=await j.connectReady();await c.wait('__warzoneDuel.report().cameraReady',20000);r.mode=await c.evaluate('__warzoneDuel.report()');assert.equal(r.mode.snapshot.humanBranch,'cannon');assert.equal(r.mode.snapshot.botBranch,'rockets');r.phone=await c.evaluate('BlockNightAndroid.loadDesigns()');
 assert.equal(await c.host('document.body.classList.contains("wt-towers-polished")||document.documentElement.classList.contains("wt-towers-polished")'),false);
 assert.equal(await c.evaluate('document.body.classList.contains("wt-towers-polished")||document.documentElement.classList.contains("wt-towers-polished")'),false);
 await c.tap('#wt-open-factory');await c.wait('__warzoneCommands.report().page==="factory"');assert.equal(await c.host('Boolean(document.querySelector(".wt-towers-factory-screen"))'),false);r.factoryScreen=await j.capture(c,'11-duel-existing-factory');l.adb('shell','input','keyevent','4');await c.wait('!__warzoneCommands.report().page');
 await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open&&__blockNightResearch.report().labCount===5');r.research=await c.evaluate('({classes:document.getElementById("blocknight-research-shell").className,columns:getComputedStyle(document.querySelector(".bn-tech-main")).gridTemplateColumns,links:Array.from(document.querySelectorAll("link[rel=stylesheet]"),e=>e.href)})');assert.ok(!r.research.classes.includes('wt-towers-research'));assert.ok(r.research.links.every(s=>!s.includes('towers-research.css')));r.researchScreen=await j.capture(c,'11-duel-existing-research');l.adb('shell','input','keyevent','4');await c.wait('!__blockNightResearch.report().open');assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),r.phone);
 l.adb('shell','input','keyevent','4');await c.wait('__towersHtml.report().menuRequested');await l.nativeTap('Cancel');await c.wait('!__towersHtml.report().menuRequested');l.adb('shell','input','keyevent','4');await c.wait('__towersHtml.report().menuRequested');await l.nativeTap('Return');c.close();c=null;
 await l.nativeTap('Towers');r.menuScreen=l.screen('11-duel-return-towers-menu');r.checks.duelPreserved=true;r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{r.failureScreen=l.screen('11-duel-smoke-failure')}catch(_){}throw e}
 finally{c?.close();r.finished=new Date().toISOString();fs.writeFileSync(path.join(l.out,'smoke.json'),JSON.stringify(r,null,2)+'\n')}
 console.log({passed:r.passed,checks:r.checks});
})().catch(e=>{console.error(e);process.exitCode=1});
