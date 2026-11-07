'use strict';
// Continue only the already observed fresh battle after a startup transport timeout.
// Then repeat the real Quit path and stop at the actual start screen for visual review.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
process.env.WZ_NATIVE_QA ||= path.join(__dirname,'../qa/test-04/quit-return');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs'),p=require('./test-02-paused-returns.cjs'),q=require('./test-02-quit-journey.cjs');
const file=path.join(l.out,'test-02-quit-journey.json'),masterFile=path.join(l.root,'qa/test-04/integrated-journey.json');
const write=r=>fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');
const neutral=n=>n.text?.includes('BATTLE ENDED')&&n.text.includes('return to the start screen');
async function nodesUntil(test,label){const end=Date.now()+15000;while(Date.now()<end){const nodes=l.tree().nodes;if(nodes.some(test))return nodes;await l.delay(150);}throw Error(label);}
async function nativeTouch(c,offset){const v=await q.nativePoint(c,offset);l.adb('shell','input','tap',String(v.devicePoint.x),String(v.devicePoint.y));return v;}
(async()=>{const r=JSON.parse(fs.readFileSync(file)),identity=j.installedIdentity();assert.equal(r.identity.candidateAPK_SHA256,identity.candidateAPK_SHA256);
 if(process.argv.includes('--accept-observed-start')){
  assert.equal(r.stage,'awaiting-settled-start-review');assert.equal(r.newBattleInput.battleActive,true);assert.equal(r.newBattleInput.frameInert,false);assert.equal(r.reviewQuit.ended.session.result,'exited');
  const start=await nodesUntil(n=>n['content-desc']===r.startLabel||n.text===r.startLabel,'actual own start control is still visible');
  assert.ok(start.some(n=>n.text==='WARZONE TOWERS'));assert.ok(!start.some(n=>/Single Player|Multi Player|Continue Last Save/i.test(n.text||'')));
  const screenshot=path.join(l.out,'quit-settled-own-start.png');assert.ok(fs.existsSync(screenshot));r.settledStartReview={screen:screenshot,sha256:crypto.createHash('sha256').update(fs.readFileSync(screenshot)).digest('hex'),actualNativeStartNodes:start.map(n=>({text:n.text,label:n['content-desc'],bounds:n.bounds}))};
  r.returnedStartScreen=screenshot;r.afterIdentity=identity;r.passed=true;r.stage='completed';r.finished=new Date().toISOString();write(r);
  const master=JSON.parse(fs.readFileSync(masterFile));assert.equal(master.identity.candidateAPK_SHA256,identity.candidateAPK_SHA256);assert.equal(master.phases.length,6);assert.equal(master.current,'native-quit-and-fresh-battle');
  (master.fixtureRetries??=[]).push({phase:master.current,failure:master.failure,correction:'Observed the already started fresh battle after the20s startup transport timeout. Verified its distinct native session, actual Queue/Back and Pause/Resume. Repeated real Quit/Confirm and inspected the settled own start screen. No APK or game-code changes.'});delete master.failure;
  master.phases.push({name:master.current,passed:true,folder:'quit-return'});master.current='completed';master.afterIdentity=identity;master.passed=true;master.finished=r.finished;fs.writeFileSync(masterFile,JSON.stringify(master,null,2)+'\n');console.log(JSON.stringify({passed:true,identity,settledStart:screenshot}));return;
 }
 assert.equal(r.passed,false);assert.match(r.failure,/CDP timeout Runtime.evaluate after 20000ms/);assert.equal(r.ended.session.result,'exited');assert.equal(r.ended.frameInert,true);assert.equal(r.ended.headerHidden,true);
 r.startupReadinessCorrection={failure:r.failure,diagnostic:'quit-startup-readiness-diagnostic.json',reason:'The actual fresh battle was running after the initial readiness evaluation timed out; reuse it rather than start another fixture.'};delete r.failure;r.returnedStartScreenInitiallyCaptured=r.returnedStartScreen;r.stage='fresh-battle-input-recovery';write(r);
 let c=await j.connectReady();try{
  await j.resume(c);r.newBattle=await j.commandState(c);assert.equal(r.newBattle.mapHeight,r.map==='td1'?79:64);assert.equal(r.newBattle.hasHQ,true);const session=await c.evaluate('__towersHtml.report()');assert.equal(session.phase,'playing');assert.notEqual(session.session,r.ended.session.session,'distinct actual fresh native battle session');r.recoveredFreshSession=session;
  const before=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');r.newBattleClock=await j.waitAdvancingClock(c,before,10000);
  await c.tap('#wt-open-queue');await c.wait('__warzoneCommands.report().page==="queue"');r.newQueueScreen=await j.capture(c,'quit-recovered-new-battle-queue');l.adb('shell','input','keyevent','4');await c.wait('!__warzoneCommands.report().page');r.newBattleInput=await p.ui(c);p.assertClosed(r.newBattleInput,'recovered fresh battle input');
  r.newBattlePause={};await p.pauseByBack(c,'quit-recovered-new-battle',r.newBattlePause);r.newBattleResume={};await p.resumeByTouch(c,'quit-recovered-new-battle',r.newBattleResume);r.finalPause={};await p.pauseByBack(c,'quit-recovered-final',r.finalPause);
  const review={};r.reviewQuit=review;review.quitTouch=await nativeTouch(c,54);await p.requirePaused(c,'second real native Quit confirmation');review.confirmationScreen=l.screen('quit-review-native-confirmation');review.confirmTouch=await nativeTouch(c,10);await c.wait('__towersHtml.isEnded()',12000);review.ended=await q.endedState(c);
  assert.equal(review.ended.session.result,'exited');assert.equal(review.ended.frameInert,true);assert.equal(review.ended.headerHidden,true);assert.equal(review.ended.dockHidden,true);assert.equal(review.ended.ghostSites.length,0);assert.equal(review.ended.ghostPreview,'');
  const nodes=await nodesUntil(neutral,'actual neutral end screen');review.neutralScreen=l.screen('quit-review-neutral');const n=nodes.find(neutral),b=[...n.bounds.matchAll(/\d+/g)].map(m=>Number(m[0]));assert.equal(b.length,4);c.close();c=null;
  l.adb('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));r.startLabel='Start game, '+(r.map==='td1'?'Dustfall':'Iron Valley');
  await nodesUntil(n=>n['content-desc']===r.startLabel||n.text===r.startLabel,'own native start screen appears');r.stage='awaiting-settled-start-review';r.startScreenBeforeReview=l.screen('quit-start-before-visual-review');write(r);console.log(JSON.stringify({stage:r.stage,identity,screen:r.startScreenBeforeReview}));
 }catch(error){r.recoveryFailure=String(error.stack||error);r.recoveryScreen=l.screen('quit-recovery-failure');write(r);throw error;}finally{c?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
