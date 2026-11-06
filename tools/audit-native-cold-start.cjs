'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {connect,adb,out,root}=require('./native-live.cjs');
const report={started:new Date().toISOString(),seeded:false,cases:[],starts:[]};let c,a;
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
(async()=>{try{
 c=await connect();report.libraryBefore=await c.evaluate('__warzoneCommands.report().saved');
 const combat=JSON.parse(fs.readFileSync(path.join(out,'audit-native-combat.json'),'utf8'));
 assert.equal(combat.passed,true,'ordinary researched Cobra journey passed first');
 report.researchedBlueprintId=combat.blueprint.id;
 assert.ok(report.libraryBefore.some(d=>d.id===report.researchedBlueprintId&&d.body==='Body5REC'));
 await c.evaluate('new Promise((r,j)=>LaunchedModule.FS.syncfs(false,e=>e?j(e):r(true)))');c.close();c=null;
 const apk=adb('shell','pm','path','com.rbabbit.warzonetowers').toString().trim().replace('package:','');report.installedAPK_SHA256=adb('shell','sha256sum',apk).toString().split(/\s/)[0];
 const beforeANR=adb('shell','dumpsys','activity','lastanr');report.initialANRRecordSHA256=digest(beforeANR);
 for(const map of ['td1','td2']){
  const args=['tools/start-native-qa.cjs',...(map==='td1'?['--td1']:[]),'--pause'];
  const result=execFileSync(process.execPath,args,{cwd:root,env:process.env,timeout:180000,maxBuffer:4*1024*1024}).toString();
  console.log('Cold '+map+' actual game ready: '+result.trim());
  c=await connect();a=require('./native-audit-controls.cjs')(c,report);await c.wait('(()=>{const d=JSON.parse(BlockNightAndroid.nativeDiagnostics());return d.gameVisible&&d.windowFocused&&!d.layoutPending;})()',15000);
  const snapshot=await c.evaluate('({commands:__warzoneCommands.report().snapshot,labs:__blockNightResearch.report().labs,saved:__warzoneCommands.report().saved})');
  assert.equal(snapshot.commands.trucks.length,map==='td1'?4:6,'fresh authored truck count');assert.equal(snapshot.labs.length,map==='td1'?2:4,'fresh authored labs');assert.equal(snapshot.commands.finishedUnits.length,0,'cold new battle did not load previously produced units');
  assert.deepEqual(snapshot.saved,report.libraryBefore,'private saved blueprints survive each actual process restart');
  assert.ok(!snapshot.commands.parts.includes('Body5REC'),'new battle requires Cobra research again');
  await a.resume();await a.tap('FACTORY');await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).page==="factory"');
  await a.scrollTo('PRODUCE '+combat.designName);const locked=(await a.ui()).views.find(v=>v.label==='PRODUCE '+combat.designName);
  assert.ok(locked&&!locked.enabled,'persisted researched model is disabled until current-battle research');
  await a.capture('cold-'+map+'-persisted-cobra-locked');await a.close();
  await a.tap('TECH');await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).page==="research"');await a.close();if(!(await a.ui()).views.some(v=>v.label==='TRUCKS'))await a.tap('UNIT CONTROLS');await a.tap('TRUCKS');await c.wait('__warzoneCommands.report().snapshot.selectedUnits.length>0');await a.capture('cold-'+map+'-native-input');await a.pause();
  const afterANR=adb('shell','dumpsys','activity','lastanr');assert.equal(digest(afterANR),report.initialANRRecordSHA256,'no new Android ANR during cold start/input');
  report.starts.push({map,pid:adb('shell','pidof','com.rbabbit.warzonetowers').toString().trim(),authoredTrucks:snapshot.commands.trucks.length,labs:snapshot.labs.length,libraryCount:snapshot.saved.length,noNewANR:true,ui:await a.ui(),errors:c.errors});assert.deepEqual(c.errors,[]);c.close();c=null;
 }
 assert.notEqual(report.starts[0].pid,report.starts[1].pid,'actual different app processes');report.passed=true;fs.writeFileSync(path.join(out,'audit-native-cold-start.json'),JSON.stringify(report,null,2));console.log('PASS: actual cold starts on both maps, no new ANR, fresh native world, preserved blueprints and working input');
}catch(e){report.failure=String(e.stack||e);try{if(!c)c=await connect();a=require('./native-audit-controls.cjs')(c,report);await a.capture('cold-start-failure');report.ui=await a.ui();const now=await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime');await new Promise(r=>setTimeout(r,1200));if(now!==await c.evaluate('__warzoneTowersWaves.report().snapshot.gameTime'))await a.pause();fs.writeFileSync(path.join(out,'cold-start-anr.txt'),adb('shell','dumpsys','activity','lastanr'));}catch(x){report.recoveryError=String(x);}fs.writeFileSync(path.join(out,'audit-native-cold-start-failure.json'),JSON.stringify(report,null,2));throw e;}finally{c?.close();}})().catch(e=>{console.error(e);process.exitCode=1});
