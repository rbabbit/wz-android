'use strict';
// Real native Pause -> Quit -> Confirm. No result/lifecycle callbacks are injected.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(!process.env.WZ_NATIVE_QA)process.env.WZ_NATIVE_QA=path.join(__dirname,'../qa/test-02','quit-journey-'+new Date().toISOString().replace(/[:.]/g,'-'));
const live=require('./native-live.cjs'),j=require('./lab-journey.cjs'),paused=require('./test-02-paused-returns.cjs');
const {adb,screen,nativeTap,out,delay,tree}=live;
const target=path.join(out,'test-02-quit-journey.json');
const write=r=>fs.writeFileSync(target,JSON.stringify(r,null,2)+'\n');
async function nativePoint(c,offset){
 const v=await paused.measureResume(c),b=v.canvas,f=v.frame;
 v.offsetCssPixels=offset;v.childPoint={x:b.x+b.width/2,y:b.y+b.height/2+offset};
 v.hostPoint={x:f.x+v.childPoint.x,y:f.y+v.childPoint.y};
 v.devicePoint={x:Math.round(v.hostPoint.x*v.device.width/v.hostWidth),y:Math.round(v.hostPoint.y*v.device.height/v.hostHeight)};
 const hit=await c.evaluate(`({child:document.elementFromPoint(${v.childPoint.x},${v.childPoint.y})?.id,host:parent.document.elementFromPoint(${v.hostPoint.x},${v.hostPoint.y})?.id})`);
 assert.equal(hit.child,'canvas');assert.equal(hit.host,'warzone-game-frame');
 return v;
}
async function tapNative(c,offset){const v=await nativePoint(c,offset);adb('shell','input','tap',String(v.devicePoint.x),String(v.devicePoint.y));return v;}
const isNeutral=n=>n.text?.includes('BATTLE ENDED')&&n.text.includes('return to the start screen');
async function waitNeutral(timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const nodes=tree().nodes;if(nodes.some(isNeutral))return nodes.map(n=>({text:n.text,label:n['content-desc'],bounds:n.bounds}));await delay(150);}throw Error('Native neutral BATTLE ENDED screen did not appear');}
async function endedState(c){return c.evaluate(`(()=>{
 const s=__warzoneCommands.report(),t=__kalaWarzoneTouch.report(),r=__blockNightResearch.report(),d=parent.document,f=d.getElementById('warzone-game-frame'),g=WarzoneBuildDisplay.report();
 return {session:__towersHtml.report(),frameInert:f.inert,frameVisibility:parent.getComputedStyle(f).visibility,
  hostEnded:d.body.dataset.battleEnded,hostPlaying:d.body.dataset.playing,headerHidden:d.getElementById('warzone-command-strip').hidden,
  dockHidden:d.getElementById('lab-ops')?.hidden,page:s.page,buildOpen:s.buildOpen,placement:s.placement,nativeMenu:s.nativeMenu,
  snapshotCleared:s.snapshot===null,pending:s.pending,battleActive:t.battleActive,hudVisible:t.hudVisible,pendingClicks:t.pendingClicks,
  researchOpen:r.open,researchOpening:r.opening,researchRunner:r.runner,researchPendingClose:r.pendingClose,
  ghostSites:g.acceptedSites,ghostPreview:g.preview,ghostDrawnCache:g.drawn};
 })()`);}
async function freshBattleReady(report){
 // A new native engine can occupy the WebView thread during startup. Keep
 // the larger transport timeout here only; ordinary UI operations retain 20s.
 let c,last;const until=Date.now()+15000;
 while(Date.now()<until){try{c=await live.connect();break;}catch(error){last=error;if(!/not ready|ECONNREFUSED|fetch failed/i.test(String(error)))throw error;await delay(150);}}
 if(!c)throw last||Error('Fresh game WebView did not register');
 const began=Date.now();
 try{
  await c.wait('Boolean(window.__warzoneCommands?.report().snapshot&&window.__kalaWarzoneTouch?.report().hudVisible&&!window.__kalaWarzoneTouch.report().cameraFacingPending&&window.WarzoneBuildDisplay?.report().models===165)',90000,{timeoutMs:90000});
  const before=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime',{timeoutMs:90000});
  const startupClient={...c,evaluate:(expression,options={})=>c.evaluate(expression,{...options,timeoutMs:90000})};
  const clock=await j.waitAdvancingClock(startupClient,before,10000);
  const fresh=await c.evaluate('__warzoneCommands.send("state",{}, {fresh:true})',{timeoutMs:90000});assert.equal(fresh.ok,true);
  report.newBattle=fresh.result;report.startupReadiness={transportTimeoutMs:90000,wallMs:Date.now()-began,beforeClock:before,advancingClock:clock,method:'Observed HUD and advancing native simulation before a fresh native acknowledgement; no keys or world changes.'};
  return c;
 }catch(error){c.close();throw error;}
}
async function run(options={}){
 const report={passed:false,started:new Date().toISOString(),seeded:false,identity:j.installedIdentity(options.apk),
  fixture:'existing ordinary battle with native Pause menu visibly open',screensRequireVisualInspection:true,
  officialGeometry:{source:'local unchanged Warzone2100 4.7.0 src/ingameop.cpp + ingameop.h + hci.h',pauseLines:6,
   resumeCentreOffset:-33.5,quitCentreOffset:51.5,quitTouchOffset:54,confirmationLines:3,confirmCentreOffset:9.5,confirmTouchOffset:10,
   explanation:'17px widget rows, 10px margin, 15px buttons; D_H uses 460px base while form anchor is 240px, adding 10px to the centre. Exact-APK screenshot calibration uses CSS offsets because native UI 150% scaling cancels framebuffer DPR; measured fixture is constrained before input.'}};
 let c;
 try{
  if(options.resumeStartup){
   const previous=JSON.parse(fs.readFileSync(target,'utf8'));
   assert.equal(previous.passed,false);assert.match(previous.failure,/CDP timeout Runtime\.evaluate after 20000ms/);
   assert.ok(previous.returnedStartScreen&&!previous.newBattle,'resume only the interrupted fresh-start readiness');
   assert.equal(previous.ended?.session?.exitReason,'quit');assert.equal(previous.ended?.frameVisibility,'hidden');
   assert.equal(previous.identity.candidateAPK_SHA256,report.identity.candidateAPK_SHA256);
   Object.assign(report,previous);report.fixtureRetries=[{phase:'fresh-battle-startup-readiness',failure:previous.failure,sourceReport:'qa/test-05/iteration-r4-quit-readiness/quit-return/test-02-quit-journey.json',correction:'Reuse the visibly running fresh battle from this exact real Quit/start sequence; wait on native readiness with a scoped 90s startup transport budget.'}];delete report.failure;delete report.finished;
   c=await freshBattleReady(report);
   assert.notEqual(await c.evaluate('__towersHtml.report().session'),report.ended.session.session,'fresh battle uses a new native session');
  }else{
  c=await j.connectReady();report.before=await paused.ui(c);paused.assertClosed(report.before,'before native Quit');
  report.map=await c.evaluate('new URLSearchParams(location.search).get("map")||"td2"');
  report.pausedClock=await paused.requirePaused(c,'before native Quit');
  report.beforeGhostSites=await c.evaluate('WarzoneBuildDisplay.report().acceptedSites');
  report.pauseScreen=screen('quit-journey-01-native-pause');write(report);
  report.quitTouch=await tapNative(c,54);
  report.confirmationPausedClock=await paused.requirePaused(c,'native confirmation');
  report.confirmation=await paused.ui(c);
  assert.equal(report.confirmation.session.phase,'playing','first Quit opens confirmation before ending the battle');
  assert.equal(report.confirmationPausedClock,report.pausedClock,'native confirmation keeps simulation paused');
  report.confirmationScreen=screen('quit-journey-02-native-confirmation');write(report);
  report.confirmTouch=await tapNative(c,10);
  await c.wait('__towersHtml.isEnded()',12000);
  report.ended=await endedState(c);
  assert.equal(report.ended.session.result,'exited','ordinary native Quit is neutral');
  assert.equal(report.ended.session.exitReason,'quit');
  assert.equal(report.ended.frameInert,true);assert.equal(report.ended.frameVisibility,'hidden');
  assert.equal(report.ended.hostEnded,'true');assert.equal(report.ended.hostPlaying,'false');
  assert.equal(report.ended.headerHidden,true);assert.equal(report.ended.dockHidden,true);
  assert.equal(report.ended.battleActive,false);assert.equal(report.ended.hudVisible,false);assert.equal(Boolean(report.ended.pendingClicks),false);
  assert.equal(report.ended.snapshotCleared,true);assert.equal(report.ended.pending,0);
  for(const key of ['page','placement','nativeMenu','ghostPreview'])assert.equal(report.ended[key],'');
  for(const key of ['buildOpen','researchOpen','researchOpening','researchPendingClose'])assert.equal(Boolean(report.ended[key]),false);
  assert.equal(report.ended.researchRunner,null);assert.equal(report.ended.ghostSites.length,0);
  report.nativeEndScreen=await waitNeutral();report.endedScreen=screen('quit-journey-03-neutral-ended');write(report);
  c.close();c=null;
  const returnNode=report.nativeEndScreen.find(isNeutral),bounds=[...returnNode.bounds.matchAll(/\d+/g)].map(m=>Number(m[0]));
  assert.equal(bounds.length,4,'actual native neutral return bounds');
  adb('shell','input','tap',String(Math.round((bounds[0]+bounds[2])/2)),String(Math.round((bounds[1]+bounds[3])/2)));
  // This is the app's own start screen, never the engine's stock frontend.
  const startLabel='Start game, '+(report.map==='td1'?'Dustfall':'Iron Valley');
  report.returnedStartScreen=screen('quit-journey-04-returned-start');
  await nativeTap(startLabel);
  c=await freshBattleReady(report);
  }
  assert.equal(report.newBattle.mapHeight,report.map==='td1'?79:64);
  assert.equal(await c.evaluate('__towersHtml.isActive()'),true);
  const prior=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');
  report.newBattleClock=await j.waitAdvancingClock(c,prior,10000);
  await c.tap('#wt-open-queue');await c.wait('__warzoneCommands.report().page==="queue"');
  report.newQueueScreen=screen('quit-journey-05-new-battle-queue');
  adb('shell','input','keyevent','4');await c.wait('!__warzoneCommands.report().page');
  report.newBattleInput=await paused.ui(c);paused.assertClosed(report.newBattleInput,'new battle input');
  report.newBattlePause={};await paused.pauseByBack(c,'quit-journey-new-battle',report.newBattlePause);
  report.newBattleResume={};await paused.resumeByTouch(c,'quit-journey-new-battle',report.newBattleResume);
  report.finalPause={};await paused.pauseByBack(c,'quit-journey-final',report.finalPause);
  report.errors=c.errors;assert.deepEqual(c.errors,[]);report.passed=true;
  console.log('PASS: real native Quit/Confirm, neutral guarded exit, app start return and restored native input in a fresh battle');
 }catch(error){report.failure=String(error.stack||error);if(c){try{report.failureState=await paused.ui(c);report.failureScreen=screen('quit-journey-failure');}catch(e){report.captureFailure=String(e);}}throw error;
 }finally{report.finished=new Date().toISOString();write(report);c?.close();}
 return report;
}
module.exports={run,nativePoint,endedState};
if(require.main===module){const args=process.argv.slice(2),n=args.indexOf('--apk');run({apk:n>=0?args[n+1]:undefined,resumeStartup:args.includes('--resume-startup')}).catch(error=>{console.error(error);process.exitCode=1});}
