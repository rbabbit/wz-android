'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),cp=require('child_process');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs'),adb=require('./android-sdk.cjs').adb;
const action=process.argv[2]||'start';
const r={action,identity:j.installedIdentity(),passed:false,started:new Date().toISOString()};
const file=path.join(l.out,'delivery-'+action+'.json');
const write=()=>fs.writeFileSync(file,JSON.stringify(r,null,2));
async function record() {
 const remote='/sdcard/towers035-'+action+'.mp4',output='C:/timerApp/_release-records/towers035-'+action+'.mp4';
 const p=cp.spawn(adb,['-s',l.device,'shell','screenrecord','--bit-rate','2000000','--time-limit','100',remote],{stdio:'ignore',windowsHide:true});
 const done=new Promise(resolve=>p.on('exit',resolve));
 return async()=>{
  let ids='';try{ids=l.adb('shell','pidof','screenrecord').toString().trim()}catch{}
  for(const id of ids.split(/\s+/).filter(v=>/^\d+$/.test(v))){
   let cmd='';try{cmd=l.adb('shell','cat','/proc/'+id+'/cmdline').toString()}catch{}
   if(cmd.includes(remote))l.adb('shell','kill','-2',id);
  }
  await done;cp.execFileSync(adb,['-s',l.device,'pull',remote,output],{stdio:'ignore',windowsHide:true});
  r.video=output;
 };
}
(async()=>{let c,stop;try{
 if(action==='start'){
  stop=await record();l.nativeTap('PLAY');
  for(let i=0;i<45&&!c;i++){try{c=await l.connect()}catch{await l.delay(300)}}
  assert.ok(c,'Actual game WebView');
  await c.wait('window.WarzoneBriefing?.report().phase==="paused"',100000);
  r.pause=await c.evaluate('WarzoneBriefing.report()');
  await l.delay(100);r.pausedAgain=await c.evaluate('WarzoneBriefing.report()');
  r.frame=l.screen('delivery-start-briefing');
  assert.equal(r.pausedAgain.clock,r.pause.clock,'Native clock stays stopped behind intro');
  await c.wait('WarzoneBriefing.report().phase==="released"',12000);
  await l.delay(300);r.after=await c.evaluate('({briefing:WarzoneBriefing.report(),notices:WarzoneNotices.report(),commands:__warzoneCommands.report(),html:__towersHtml.report()})');
  r.gameplayFrame=l.screen('delivery-after-start');assert.ok(r.after.briefing.clock>r.pause.clock);
  assert.equal(r.after.briefing.owned,false);r.passed=true;
 }else if(action==='messages'){
  c=await l.connect();
  const before=await c.evaluate('WarzoneNotices.report().nativeEvents');
  await c.evaluate('__kalaWarzoneTouch.faceOpponent("td1");true');
  await c.wait('WarzoneNotices.report().nativeEvents>'+before+'&&WarzoneNotices.report().lastNative?.kind==="camera"',12000);
  r.camera=await c.evaluate('WarzoneNotices.report()');
  r.cameraFrame=l.screen('delivery-camera-notice');
  await c.wait('!__kalaWarzoneTouch.report().cameraFacingPending',10000);
  await c.tap('#warzone-towers-next-wave');
  await c.wait('WarzoneNotices.report().lastNative?.kind==="round"',10000);
  r.round=await c.evaluate('WarzoneNotices.report()');
  r.presentation=await c.host('(()=>{const n=document.querySelector("#wt-game-notice"),w=document.querySelector("#wt-wave-incoming");return {text:n.textContent,background:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color,notice:n.getBoundingClientRect().toJSON(),incoming:w.getBoundingClientRect().toJSON()}})()');
  assert.equal(r.presentation.text,'Round 1 / 15');assert.equal(r.presentation.background,'rgb(8, 8, 8)');assert.equal(r.presentation.color,'rgb(255, 255, 255)');
  assert.ok(r.presentation.notice.right<=r.presentation.incoming.left);
  r.roundFrame=l.screen('delivery-round-notice');
  for(let i=0;i<2;i++){await c.tap('#wt-open-build');await c.wait('__warzoneCommands.report().buildOpen');await c.tap('#wt-open-build');await c.wait('!__warzoneCommands.report().buildOpen')}
  await c.tap('#blocknight-save');await c.wait('!WarzoneSavedGames.report().busy',30000);
  r.save=await c.evaluate('WarzoneSavedGames.report()');assert.equal(r.save.phase,'saved');r.saveFrame=l.screen('delivery-game-saved');
  r.passed=true;
 }else if(action==='defeat'){
  c=await l.connect();await c.save('delivery-genuine-before-hq-fixture');
  r.fixtureDisclosure='Complete genuine native save copied; only the human Command Centre entry removed from struct.json, then native F8. Tests authoritative HQ detection, not a naturally lost match.';
  r.mutation=await c.evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave',s=JSON.parse(f.readFile(p+'/struct.json',{encoding:'utf8'})),hq=Object.entries(s).find(([,v])=>v.player===0&&v.name==='A0CommandCentre');if(!hq)throw Error('Missing HQ');delete s[hq[0]];f.writeFile(p+'/struct.json',JSON.stringify(s));return {removed:hq};})()`);
  stop=await record();await l.delay(200);await c.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true');
  const end=Date.now()+90000;let firstHome=0;
  while(Date.now()<end){
   const tree=l.tree().nodes;
   if(tree.some(n=>n.text==='Your Command Centre was Destroyed')){r.nativeCaptionSeen=true;if(!r.frame)r.frame=l.screen('delivery-defeat-briefing')}
   if(tree.some(n=>n.text==='PLAY')){
    if(!firstHome)firstHome=Date.now();
    if(Date.now()-firstHome>4000&&!tree.some(n=>n.text==='Your Command Centre was Destroyed')){r.home=tree;r.homeFrame=l.screen('delivery-after-defeat');break}
   }
   await l.delay(100);
  }
  assert.ok(r.home?.some(n=>n.text==='GREENHAVEN'),'Same map selected after defeat');r.passed=true;
 }else throw Error('Unknown action');
 }catch(e){r.error=String(e.stack||e);try{r.failureFrame=l.screen('failure-'+action)}catch{}throw e}
 finally{if(c)c.close();if(stop)await stop();write()}})().catch(e=>{console.error(e);process.exitCode=1});
