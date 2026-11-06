'use strict';
// Continue the same ordinary battle after the movement-camera fixture failure.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect,adb,out,delay}=require('./native-live.cjs');
let c,a,report;
async function observe(minimum,timeout){const end=Date.now()+timeout;let last=0;while(Date.now()<end){const s=await c.evaluate('__warzoneTowersWaves.report().snapshot');assert.ok((await a.ui()).gameVisible,'native battle remains active');if(s.gameTime-last>=10000){report.samples.push({...s,wallTime:new Date().toISOString()});console.log('Native battle wave '+s.wave+', enemies '+s.enemyDroids+', pending '+s.queuedEnemies+', rewards '+s.rewardCount);last=s.gameTime;}if(s.rewardCount>=minimum)return s;await delay(500);}throw Error('Required native rewards not observed; inspect actual AI/positions');}
(async()=>{c=await connect();try{
 report=JSON.parse(fs.readFileSync(path.join(out,'audit-native-combat-failure.json'),'utf8'));
 assert.ok(report.produced&&report.blueprint&&report.tankId,'prior real research/design/production evidence');
 report.fixtureRecoveries=[report.fixtureContinuation,{source:'audit-native-combat-failure.json',reason:'Move destination was outside the camera view centred on factory spawn',reusedTankId:report.tankId,reusedOrdinaryTowers:report.sites,worldStateEdited:false}];
 delete report.failure;delete report.nativeFailure;delete report.ui;delete report.recoveryError;
 report.samples=[];report.cases??=[];a=require('./native-audit-controls.cjs')(c,report);
 const apk=adb('shell','pm','path','com.rbabbit.warzonetowers').toString().trim().replace('package:','');assert.equal(adb('shell','sha256sum',apk).toString().split(/\s/)[0],report.installedAPK_SHA256);
 await a.resume();await a.camera(9,40);report.beforeMove=await c.save('combat-cobra-visible-destination-fixture');
 assert.ok(Object.values(report.beforeMove['droid.json']).some(d=>d.id===report.tankId&&d.parts?.body==='Body5REC'),'reuse the real normally produced Cobra');
 assert.ok(report.beforeMove.commands.snapshot.selectedUnits.some(d=>d.id===report.tankId),'same native tank selection retained');
 const goal=report.moveGoal;assert.ok(goal);const preview=await c.evaluate('__warzoneCommands.send("preview-build",{itemId:"GuardTower1",x:'+goal.x+',y:'+goal.y+'})');assert.ok(preview.ok,'same clear reachable native destination');
 await a.tile(goal.x,goal.y);await c.wait('__warzoneCommands.report().snapshot.selectedUnits.some(u=>u.id==='+report.tankId+'&&Math.hypot(u.x-'+(goal.x+.5)+',u.y-'+(goal.y+.5)+')<1.25)',45000);
 report.moved=await c.save('combat-researched-cobra-moved');const moved=Object.values(report.moved['droid.json']).find(u=>u.id===report.tankId);assert.ok(moved&&Math.hypot(moved.position[0]/128-(goal.x+.5),moved.position[1]/128-(goal.y+.5))<1.25,'actual native Cobra arrived');await a.capture('combat-researched-cobra-arrived');
 await a.camera(13,47);report.nativeCombat=await observe(5,180000);report.beforeSecond=await c.save('combat-native-kills-and-rewards');
 const enemy=report.beforeSecond.waves.snapshot.enemyPlayer,oldIds=Object.values(report.beforeSecond['droid.json']).filter(u=>u.player===enemy).map(u=>u.id);assert.ok(oldIds.length,'native enemies survive before advancing');
 const beforeWave=report.beforeSecond.waves.snapshot.wave;await a.tap('SKIP WAVE');await c.wait('__warzoneTowersWaves.report().snapshot.wave>'+beforeWave);report.afterSecond=await c.save('combat-native-second-wave');
 report.survivingIds=Object.values(report.afterSecond['droid.json']).filter(u=>oldIds.includes(u.id)).map(u=>u.id);assert.ok(report.survivingIds.length,'old native enemies survive Skip Wave');await observe(report.nativeCombat.rewardCount+2,120000);
 report.finalNative=await c.save('combat-native-final');const hq=Object.values(report.finalNative['struct.json']).find(s=>s.name==='A0CommandCentre'&&s.player===report.finalNative.commands.snapshot.player);assert.ok(hq&&hq.health>0,'native HQ alive during this finite journey');report.hq={id:hq.id,health:hq.health};assert.ok(report.finalNative.waves.snapshot.rewardPower>report.firstWave.waves.snapshot.rewardPower,'native kill reward power increased');
 report.blueprintsAfter=await c.evaluate('__warzoneCommands.report().saved');await a.capture('combat-native-live-battle');await a.pause();report.errors=c.errors;assert.deepEqual(c.errors,[]);report.passed=true;report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'audit-native-combat.json'),JSON.stringify(report,null,2));console.log('PASS: actual ordinary research/design/save/production/movement, five-tower native combat, kills/rewards, survivors and live HQ');
 }catch(e){report??={};report.failure=String(e.stack||e);try{a??=require('./native-audit-controls.cjs')(c,report);await a.capture('combat-finish-failure');report.ui=await a.ui();report.nativeFailure=await c.save('combat-finish-failure-native');if(report.ui.gameVisible)await a.pause();}catch(x){report.recoveryError=String(x);}fs.writeFileSync(path.join(out,'audit-native-combat-finish-failure.json'),JSON.stringify(report,null,2));throw e;}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
