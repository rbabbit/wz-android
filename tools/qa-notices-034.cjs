'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const l=require('./native-live.cjs'), j=require('./lab-journey.cjs');
const action=process.argv[2], prefix=process.argv[3]||'delivery', cfile=path.join(l.out,prefix+'-'+action+'.json');
const record={action,prefix,started:new Date().toISOString(),passed:false,identity:j.installedIdentity()};
const write=()=>fs.writeFileSync(cfile,JSON.stringify(record,null,2));
(async()=>{const c=await l.connect();try {
 if(action==='research'){
  await c.evaluate('window.__qaCompletion=null;window.addEventListener("blocknight-research-completed",e=>window.__qaCompletion=e.detail);true');
  if(!await c.evaluate('__blockNightResearch.report().open'))await c.tap('#blocknight-tech');
  const topic=await c.evaluate('Array.from(document.querySelectorAll(".bn-tech-card")).find(e=>/1,200 RESEARCH/.test(e.textContent))?.dataset.topicId');
  assert.ok(topic);record.topic=topic;
  await c.tap('[data-topic-id="'+topic+'"]');await c.tap('.bn-tech-assign');await c.tap('#blocknight-tech');
  await c.wait('window.__qaCompletion',100000);record.event=await c.evaluate('__qaCompletion');
  record.notice=await c.host('document.querySelector("#wt-game-notice")?.outerHTML');
  record.frame=l.screen(prefix+'-research-completion');
  record.passed=prefix==='baseline'||Boolean(record.notice?.includes('Research complete')&&record.notice?.includes(record.event.name));
 }else if(action==='defeat'){
  await c.save(prefix+'-genuine-before-hq-fixture');
  record.fixtureDisclosure='Complete genuine native save copied; removed only human Command Centre from struct.json, then native F8. This verifies native HQ detection, not a naturally lost match.';
  const mutation=await c.evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave',s=JSON.parse(f.readFile(p+'/struct.json',{encoding:'utf8'})),hq=Object.entries(s).find(([,v])=>v.player===0&&v.name==='A0CommandCentre');if(!hq)throw Error('Missing fixture HQ');delete s[hq[0]];f.writeFile(p+'/struct.json',JSON.stringify(s));return {removed:hq,remaining:Object.keys(s).length};})()`);
  record.mutation=mutation;write();
  const cp=require('child_process'),adb=require('./android-sdk.cjs').adb,remote='/sdcard/towers034-'+prefix+'.mp4';
  const video=cp.spawn(adb,['-s',l.device,'shell','screenrecord','--time-limit','80',remote],{stdio:'ignore'});const videoDone=new Promise(r=>video.on('exit',r));
  await l.delay(400);
  await c.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true');
  const stop=Date.now()+80000;let home=false;while(Date.now()<stop){try{home=l.tree().nodes.some(n=>n.text==='PLAY');if(home)break;}catch{}await l.delay(250)}
  record.home=home;record.tree=l.tree().nodes.filter(n=>n.text||n['content-desc']);record.frame=l.screen(prefix+'-defeat-home');record.passed=home;await videoDone;record.video='C:/timerApp/_release-records/towers034-'+prefix+'-defeat.mp4';cp.execFileSync(adb,['-s',l.device,'pull',remote,record.video],{stdio:'ignore'});
 }else if(action==='save'){
  await c.tap('#blocknight-save');record.immediate=await c.evaluate('WarzoneSavedGames.report()');
  await c.wait('!WarzoneSavedGames.report().busy',30000);record.saved=await c.evaluate('WarzoneSavedGames.report()');
  record.notice=await c.host('document.querySelector("#wt-game-notice")?.outerHTML');record.frame=l.screen(prefix+'-game-saved');
  assert.equal(record.saved.phase,'saved');assert.equal(record.saved.status,'Game saved');record.passed=true;
 }else throw Error('Unknown action');
 }finally{write();c.close()}})().catch(e=>{record.error=String(e.stack||e);write();console.error(e);process.exitCode=1});
