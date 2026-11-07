'use strict';
// Real Android touches on one already prepared Iron Valley battle.
// No saves, designs, units, research, power, orders, or fixture files are changed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(!process.env.WZ_NATIVE_QA)process.env.WZ_NATIVE_QA=path.join(__dirname,'../qa/test-02','paused-returns-'+new Date().toISOString().replace(/[:.]/g,'-'));
const live=require('./native-live.cjs'),journey=require('./lab-journey.cjs');
const {adb,screen,out}=live;
const reportPath=path.join(out,'test-02-paused-returns.json');
const clock=c=>c.evaluate('__warzoneTowersWaves.report().snapshot?.gameTime');
function write(report){fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
async function ui(c){return c.evaluate(`(()=>{
 const s=__warzoneCommands.report(),t=__kalaWarzoneTouch.report(),r=__blockNightResearch.report();
 const d=parent.document,f=d.getElementById('warzone-game-frame'),help=d.getElementById('warzone-towers-help-overlay');
 return {clock:__warzoneTowersWaves.report().snapshot?.gameTime,session:__towersHtml.report(),
  frameInert:f.inert,frameHidden:f.hidden,frameVisibility:parent.getComputedStyle(f).visibility,
  page:s.page,buildOpen:s.buildOpen,placement:s.placement,nativeMenu:s.nativeMenu,
  nativeBackVisible:!d.getElementById('wt-native-back')?.hidden,
  exitingBuild:s.exitingBuild,buildingOpening:s.buildingOpening,selectingTrucks:s.selectingTrucks,
  pendingItem:s.pendingItem,pendingCommands:s.pending,pendingClicks:t.pendingClicks,
  researchOpen:r.open,researchOpening:r.opening,researchPendingClose:r.pendingClose,
  researchRunner:r.runner,helpOpen:!!help&&!help.hidden,hudVisible:t.hudVisible,battleActive:t.battleActive,
  mapWidth:s.snapshot?.mapWidth,mapHeight:s.snapshot?.mapHeight};
})()`);}
function assertClosed(state,label){
 assert.equal(state.session.phase,'playing',label+': live battle lifecycle');
 assert.equal(state.frameInert,false,label+': frame accepts input');
 assert.equal(state.frameHidden,false,label+': frame is present');
 assert.equal(state.frameVisibility,'visible',label+': frame is visible');
 for(const key of ['page','placement','nativeMenu','pendingItem'])assert.equal(state[key],'',label+': cleared '+key);
 for(const key of ['buildOpen','exitingBuild','buildingOpening','selectingTrucks','nativeBackVisible','researchOpen','researchOpening','researchPendingClose','helpOpen'])assert.equal(Boolean(state[key]),false,label+': cleared '+key);
 assert.equal(Boolean(state.pendingClicks),false,label+': no queued pointer input');
 assert.equal(state.hudVisible,true,label+': battle commands remain available');
 // Script transports can legitimately remain pending while the native game is
 // paused. They must not own an inert frame or a visible busy/overlay state.
}
async function requirePaused(c,label){
 const stopped=await journey.waitPausedClock(c,5000);
 assert.notEqual(stopped,null,label+': native wave clock is stopped');
 assert.ok(Number.isFinite(stopped),label+': native clock exists');
 return stopped;
}
async function measureResume(c){
 const view=await c.evaluate(`(()=>{
  const f=parent.document.getElementById('warzone-game-frame'),fr=f.getBoundingClientRect(),v=document.getElementById('canvas'),b=v.getBoundingClientRect();
  const x=b.left+b.width/2,y=b.top+b.height/2-32;
  return {hostWidth:parent.innerWidth,hostHeight:parent.innerHeight,frame:{x:fr.x,y:fr.y,width:fr.width,height:fr.height},
   canvas:{x:b.x,y:b.y,width:b.width,height:b.height,pixelWidth:v.width,pixelHeight:v.height},
   childPoint:{x,y},hostPoint:{x:x+fr.x,y:y+fr.y},
   hostHit:parent.document.elementFromPoint(x+fr.x,y+fr.y)?.id,
   childHit:document.elementFromPoint(x,y)?.id,frameInert:f.inert};
 })()`);
 assert.ok(view.hostWidth>view.hostHeight,'measured landscape viewport');
 assert.ok(view.canvas.width>=642&&view.canvas.height>=482,'prepared native minimum viewport');
 assert.equal(view.hostHit,'warzone-game-frame','resume touch reaches measured iframe');
 assert.equal(view.childHit,'canvas','resume touch reaches native canvas');
 assert.equal(view.frameInert,false,'resume touch is not blocked by an inert frame');
 const png=adb('exec-out','screencap','-p');
 view.device={width:png.readUInt32BE(16),height:png.readUInt32BE(20),fontScale:adb('shell','settings','get','system','font_scale').toString().trim()};
 assert.ok(Math.abs(view.device.width/view.device.height-view.hostWidth/view.hostHeight)<.03,'physical screenshot agrees with measured viewport');
 // Coordinates were checked against the exact APK's native Pause screenshot:
 // 1080x600 physical, ~1077x542 CSS canvas, 1616x813 backing buffer. Native UI
 // auto-scaling cancels the 1.5 framebuffer ratio; widget offsets are CSS px.
 assert.equal(view.device.width,1080,'calibrated native Pause fixture width');
 assert.equal(view.device.height,600,'calibrated native Pause fixture height');
 assert.ok(Math.abs(view.canvas.width-1077)<=4&&Math.abs(view.canvas.height-542)<=3,'calibrated native Pause CSS viewport; refuse to guess on another profile');
 assert.ok(Math.abs(view.canvas.pixelHeight/view.canvas.height-1.5)<.03,'calibrated native UI/framebuffer scale');
 view.coordinateBasis='Exact-APK native Pause screenshot; Resume offset -32 CSS px, native UI scale 150%';
 view.devicePoint={x:Math.round(view.hostPoint.x*view.device.width/view.hostWidth),y:Math.round(view.hostPoint.y*view.device.height/view.hostHeight)};
 return view;
}
async function resumeByTouch(c,label,record){
 const stopped=await requirePaused(c,label+' before Resume');
 assertClosed(await ui(c),label+' before Resume');
 record.pauseScreen=screen(label+'-native-pause-before-resume');
 // The supplied prepared fixture has the native Pause menu open. The screenshot
 // above is retained for visual inspection; never toggle Escape to guess state.
 record.resumeViewport=await measureResume(c);
 const p=record.resumeViewport.devicePoint;
 adb('shell','input','tap',String(p.x),String(p.y));
 record.resumeClock={before:stopped,after:await journey.waitAdvancingClock(c,stopped,10000)};
 record.nativeAfterResume=await journey.commandState(c);
 assert.equal(record.nativeAfterResume.mapHeight,64,'Iron Valley remains loaded');
 record.afterResume=await ui(c);assertClosed(record.afterResume,label+' after Resume');
 record.resumedScreen=screen(label+'-resumed');
}
async function pauseByBack(c,label,record){
 const current=await clock(c);await journey.waitAdvancingClock(c,current,10000);
 assertClosed(await ui(c),label+' before Pause');
 adb('shell','input','keyevent','4');
 record.pauseClock=await requirePaused(c,label+' after one Android Back');
 record.pausedAgainScreen=screen(label+'-paused-again');
}
async function run(options={}){
 const report={passed:false,started:new Date().toISOString(),seeded:false,fixture:'existing ordinary Iron Valley battle; initially native Pause menu is visibly open',identity:journey.installedIdentity(options.apk),rounds:[],screensRequireVisualInspection:true};
 let c;
 try{
  c=await journey.connectReady();
  report.initial=await ui(c);assertClosed(report.initial,'initial ready fixture');
  assert.equal(report.initial.mapHeight,64,'reuse the prepared Iron Valley fixture');
  report.initialPausedClock=await requirePaused(c,'initial fixture');
  report.initialScreen=screen('paused-returns-initial');write(report);
  const cases=[['factory','#wt-open-factory','page'],['design','#wt-open-design','page'],['queue','#wt-open-queue','page'],['tech','#blocknight-tech','tech'],['help','#blocknight-help','help'],['stats','#wt-open-stats','native']];
  for(let round=1;round<=2;round++){
   const result={round,cases:[]};report.rounds.push(result);
   for(const [name,selector,kind]of cases){
    const label='paused-return-'+round+'-'+name,record={name,kind};result.cases.push(record);
    record.before=await ui(c);assertClosed(record.before,label+' before open');
    record.stoppedClock=await requirePaused(c,label+' before open');
    await c.tap(selector);
    const opened=kind==='page'?`__warzoneCommands.report().page===${JSON.stringify(name)}`:kind==='tech'?'__blockNightResearch.report().open':kind==='help'?'parent.document.getElementById("warzone-towers-help-overlay")?.hidden===false':'__warzoneCommands.report().nativeMenu==="stats"';
    await c.wait(opened,6000);
    record.opened=await ui(c);record.openedScreen=screen(label+'-opened');
    adb('shell','input','keyevent','4');
    await c.wait('!__warzoneCommands.report().page&&!__warzoneCommands.report().nativeMenu&&!__blockNightResearch.report().open&&!__blockNightResearch.report().opening&&parent.document.getElementById("warzone-towers-help-overlay")?.hidden!==false',6000);
    record.returned=await ui(c);assertClosed(record.returned,label+' after Back');
    record.returnedScreen=screen(label+'-returned');
    record.stillPausedClock=await requirePaused(c,label+' after overlay Back');
    assert.equal(record.stillPausedClock,record.stoppedClock,label+': overlay navigation did not resume simulation');
    await resumeByTouch(c,label,record);
    await pauseByBack(c,label,record);
    write(report);console.log(JSON.stringify({round,name,resumed:record.resumeClock,frameInputRestored:!record.returned.frameInert}));
   }
  }
  report.final=await ui(c);assertClosed(report.final,'final fixture');
  report.finalPausedClock=await requirePaused(c,'final fixture');
  report.errors=c.errors;assert.deepEqual(c.errors,[],'no unhandled WebView exceptions');
  report.passed=true;console.log('PASS: two paused return rounds, actual native Resume touches and observed simulation clocks on exact installed APK');
 }catch(error){
  report.failure=String(error.stack||error);
  if(c){try{report.failureState=await ui(c);report.failureScreen=screen('paused-returns-failure');}catch(capture){report.captureFailure=String(capture);}}
  throw error;
 }finally{report.finished=new Date().toISOString();write(report);c?.close();}
 return report;
}
module.exports={run,ui,assertClosed,requirePaused,measureResume,resumeByTouch,pauseByBack};
if(require.main===module){const args=process.argv.slice(2),n=args.indexOf('--apk');run({apk:n>=0?args[n+1]:undefined}).catch(error=>{console.error(error);process.exitCode=1});}
