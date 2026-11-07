'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs'),m=require('./test-04-module-journey.cjs'),p=require('./test-05-preview-journey.cjs');
const r={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),method:'Reuse the real completed Dustfall two-group state. Purpose-built nativeSelectClick emits real native selection input; catalogue and terrain build taps use ADB. No native state edits or granted units.',checks:{}};
const write=()=>fs.writeFileSync(path.join(l.out,'manual-selection.json'),JSON.stringify(r,null,2)+'\n');
(async()=>{let c;try{c=await j.connectReady();await j.resume(c);
 if(process.argv.includes('--resume-completed')){
  const prior=JSON.parse(fs.readFileSync(path.join(l.out,'manual-selection.json')));assert.equal(prior.identity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);assert.match(prior.failure,/snapshot.selectedUnits.length/);assert.deepEqual(prior.order.result.workers,[160001]);
  Object.assign(r,prior);delete r.failure;delete r.failureScreen;delete r.cleanupFailure;delete r.pausedAt;r.fixtureCorrections=[{source:'qa/test-06/iteration-manual-clear-fixture/manual-selection.json',cause:'Native empty-ground click preserves selection; that was an incorrect clearing fixture assumption, not a product failure.',correction:'Retain the actual verified one-truck selection/order and inspect its native completion. Manual clear safety is covered separately by the focused source regression.'}];
 }else{
 const a=await require('./audit-smooth-building.cjs').controls(c);await a.camera(8,72);r.baseline=await c.save('manual-selection-native-before');await c.tap('#wt-open-build');await c.tap('#wt-build-sidebar [data-category="DEFENCES"]');await c.tap('#wt-sidebar-catalogue [data-build="A0TankTrap"]');await c.wait('!__warzoneCommands.report().selectingTrucks');
 const native=Object.values(r.baseline['droid.json']).find(t=>t.id===160001);assert.ok(native);await c.evaluate('WarzoneTerrain.refresh();true');
 r.point=await c.evaluate(`WarzoneTerrain.project(${native.position[0]},${native.position[1]},${native.position[2]+24})`);assert.ok(r.point);
 await c.evaluate(`__kalaWarzoneTouch.nativeSelectClick(${r.point.x},${r.point.y});true`);
 await c.wait('__warzoneCommands.report().snapshot.selectedUnits.length===1&&__warzoneCommands.report().snapshot.selectedUnits[0].id===160001',10000);
 r.selected=await m.fresh(c);r.group=await c.evaluate('__warzoneCommands.report().nativeBuildGroup');assert.deepEqual(r.group,[160001]);l.screen('one-native-truck-selected');
 let site;for(const [x,y]of [[9,70],[9,69],[7,69]]){const v=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:'A0TankTrap',x:${x},y:${y},workerIds:[160001]})`);if(v.ok){site={x,y};break}}assert.ok(site);
 const before=await c.evaluate('__warzoneCommands.report().history.length'),point=await p.projectTile(c,site.x,site.y);await a.touch(point.x,point.y);await c.wait(`__warzoneCommands.report().history.slice(${before}).some(x=>x.action==='queue-build'&&x.ok)`);r.order=await c.evaluate(`__warzoneCommands.report().history.slice(${before}).find(x=>x.action==='queue-build'&&x.ok)`);assert.deepEqual(r.order.result.workers,[160001]);
 }
 await m.exitBuild(c);await c.wait(`__warzoneCommands.report().snapshot.finishedBuilds.some(x=>x.id===${JSON.stringify(r.order.result.id)})`,40000);r.completed=await c.save('manual-selection-native-complete');assert.ok(r.completed.commands.snapshot.finishedBuilds.some(x=>x.id===r.order.result.id));r.checks.manualSelection=true;r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{r.failureScreen=l.screen('manual-selection-failure')}catch(_){}throw e;
 }finally{if(c){try{r.pausedAt=await j.pause(c)}catch(e){r.cleanupFailure=String(e);r.passed=false}c.close()}write()}
})().catch(e=>{console.error(e);process.exitCode=1});
