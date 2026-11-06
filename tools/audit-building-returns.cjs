'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {connect,adb,screen,out,delay}=require('./native-live.cjs'),{controls,probe}=require('./audit-smooth-building.cjs');
(async()=>{const c=await connect(),r={passed:false,cases:[]};try{
 const a=await controls(c),before=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await c.evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+before);await probe(c);
 for(let i=0;i<2;i++){
  await c.tap('#wt-open-build');await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');
  await c.tap('#blocknight-help');await c.wait('!parent.document.getElementById("warzone-towers-help-overlay").hidden');screen('returns-help-'+i);await c.tap('.wt-help-back');
  await c.tap('#wt-open-design');await c.wait('__warzoneCommands.report().page==="design"');await c.tap('#wt-design-name');
  let end=Date.now()+7000;const ime=()=>/mInputShown=true/.test(adb('shell','dumpsys','input_method').toString());while(Date.now()<end&&!ime())await delay(150);assert.ok(ime(),'real keyboard opens');screen('returns-keyboard-'+i);
  adb('shell','input','keyevent','4');end=Date.now()+7000;while(Date.now()<end&&ime())await delay(150);assert.ok(!ime(),'real keyboard dismisses before game return');
  await c.tap('#wt-command-pages [data-action="back"]');await c.wait('!__warzoneCommands.report().page');
  await c.tap('#wt-open-build');await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'GuardTower1');
  adb('shell','input','keyevent','4');await c.wait('!__warzoneCommands.report().buildOpen');assert.ok(await c.evaluate('document.getElementById("wt-build-ghost").hasAttribute("hidden")'));
  r.cases.push('help, keyboard, Build and Android Back return '+(i+1));
 }
 for(let i=0;i<2;i++){await c.evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');await delay(900);const t=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await delay(900);assert.equal(await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime'),t);screen('returns-pause-'+i);await c.evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');await c.wait('__warzoneTowersWaves.report().snapshot.gameTime>'+t);r.cases.push('native pause and return '+(i+1));}
 await a.camera(10,41);await c.tap('#wt-open-build');await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');
 const rejected=await c.evaluate('__warzoneCommands.report().history.length');await a.tile(8,40);await c.wait(`__warzoneCommands.report().history.slice(${rejected}).some(r=>r.action==='queue-build'&&!r.ok)`);assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'GuardTower1');r.cases.push('occupied terrain rejected, choice retained');
 const valid=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:'GuardTower1',x:11,y:42,workerIds:__warzoneCommands.report().nativeBuildGroup})`);assert.ok(valid.ok,JSON.stringify(valid));await a.tile(11,42);
 await c.wait('__warzoneCommands.report().history.some(r=>r.action==="queue-build"&&r.ok&&r.result.x===11&&r.result.y===42)');assert.ok(await c.host('document.getElementById("wt-sidebar-notice").hidden'),'a valid accepted order clears the previous blocked-site message');
 await c.wait(`__warzoneCommands.report().snapshot.finishedBuilds.some(s=>s.itemId==='GuardTower1'&&s.x===11&&s.y===42)`,35000);await c.wait('!__warzoneCommands.report().buildOpen',10000);assert.ok(await c.evaluate('document.getElementById("wt-build-ghost").hasAttribute("hidden")'));screen('returns-building-completed');r.cases.push('post-menu actual tower completion and automatic exit');
 await a.camera(5,39);await c.tap('#wt-open-build');await c.tap('#wt-build-sidebar [data-category="MODULES"]');await c.tap('#wt-sidebar-catalogue [data-build="A0FacMod1"]');
 const module=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:'A0FacMod1',x:4,y:38,workerIds:__warzoneCommands.report().nativeBuildGroup})`);assert.ok(module.ok,JSON.stringify(module));await a.tile(4,38);
 await c.wait(`__warzoneCommands.report().snapshot.constructionSites.some(s=>s.itemId==='A0FacMod1'&&s.status==='building')`,20000);screen('returns-module-progress');
 await c.wait(`__warzoneCommands.report().snapshot.finishedBuilds.some(s=>s.itemId==='A0FacMod1')`,50000);await c.wait('!__warzoneCommands.report().buildOpen',10000);
 const save=await c.save('returns-native-completed');r.factory=Object.values(save['struct.json']).find(s=>s.id===160167);assert.equal(r.factory.modules,2,'real native factory module completed');r.cases.push('normal factory module progress and completion');
 const d=await c.evaluate('clearInterval(__smoothAudit.timer);__smoothAudit');r.clicks=d.clicks;r.samples=d.samples;const first=d.samples[0];assert.ok(d.samples.every(s=>!s.frozen)&&d.samples.filter(s=>s.placement).every(s=>s.frame.join()===first.frame.join()&&s.canvas.join()===first.canvas.join()),'stable live viewport on every return');assert.ok(d.samples.every(s=>s.zoom.join()===first.zoom.join()),'no automatic zoom');
 await c.evaluate('__kalaWarzoneTouch.nativePressKey("Escape","Escape",27);true');await delay(1100);const t=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await delay(1100);assert.equal(await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime'),t);r.passed=true;console.log(JSON.stringify({passed:true,cases:r.cases}));
 }finally{fs.writeFileSync(path.join(out,'audit-building-returns.json'),JSON.stringify(r,null,2));c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
