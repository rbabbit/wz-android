'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
process.env.WZ_NATIVE_QA ||= path.resolve(__dirname,'../qa/test-14/r1-smoke');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const r={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),screens:[],pages:[]};
const shot=name=>{const p=l.screen(name);r.screens.push(path.relative(l.root,p).replaceAll('\\','/'));return p;};
const box=e=>e?.getBoundingClientRect().toJSON();
(async()=>{let c;try{
 l.adb('shell','am','force-stop',l.packageId);l.adb('shell','am','start','-n',l.packageId+'/com.rbabbit.blocknight.warzone.MainActivity');
 await l.nativeTap('Towers');l.tree();shot('14-start');await l.nativeTap('Music settings');
 for(let n=0;n<10&&!l.tree().nodes.some(n=>n.text==='MUSIC');n++)await l.delay(150);
 assert.ok(l.tree().nodes.some(n=>n.text==='MUSIC'));shot('14-music');await l.nativeTap('BACK');
 c=await j.start('td2');r.navigation=await c.host('Array.from(document.querySelectorAll("#blocknight-combat-hud button"),e=>({id:e.id,text:e.innerText}))');
 assert.ok(!r.navigation.some(b=>b.id==='wt-open-design'));assert.equal(r.navigation.find(b=>b.id==='wt-open-factory').text,'PRODUCTION');
 await c.tap('#wt-open-factory');await c.wait('__warzoneCommands.report().page==="factory"');
 for(const page of ['factory','design','saved']){
  if(page!=='factory'){await c.tap('#wt-command-tabs [data-page="'+page+'"]');await c.wait('__warzoneCommands.report().page==='+JSON.stringify(page));}
  await c.paint();shot('14-'+page);r.pages.push(await c.host('(()=>{const p=document.getElementById("wt-command-pages"),content=document.getElementById("wt-page-content");return{page:p.dataset.page,box:p.getBoundingClientRect().toJSON(),viewport:[innerWidth,innerHeight],overflow:[content.scrollWidth,content.clientWidth,content.scrollHeight,content.clientHeight],text:p.innerText}})()'));
 }
 await j.closeOverlays(c);await c.tap('#wt-open-queue');await c.wait('__warzoneCommands.report().page==="queue"');await c.paint();shot('14-orders');
 await j.closeOverlays(c);await c.tap('#blocknight-tech');await c.wait('__blockNightResearch.report().open&&__blockNightResearch.report().catalogCount>0');await c.paint();shot('14-research');
 await j.closeOverlays(c);await c.tap('#blocknight-help');await c.wait('!parent.document.getElementById("warzone-towers-help-overlay").hidden');await c.paint();shot('14-help');
 await j.closeOverlays(c);await c.tap('#wt-field-toggle');await c.paint();shot('14-field-controls');
 await c.tap('#wt-open-build');await c.wait('__warzoneCommands.report().buildOpen');await c.paint();shot('14-build');await c.tap('#wt-build-sidebar [data-category="MODULES"]');await c.paint();shot('14-modules');
 await j.closeOverlays(c);r.errors=c.errors;assert.deepEqual(c.errors,[]);r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{shot('14-smoke-failure')}catch(_){}throw e;}
 finally{if(c){await j.closeOverlays(c);r.pausedAt=await j.pause(c);c.close();}fs.writeFileSync(path.join(l.out,'smoke.json'),JSON.stringify(r,null,2));}
 console.log({passed:r.passed,screens:r.screens,identity:r.identity});
})().catch(e=>{console.error(e);process.exitCode=1});
