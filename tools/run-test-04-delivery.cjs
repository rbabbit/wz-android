'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict'),j=require('./lab-journey.cjs'),l=require('./native-live.cjs');
const qa=path.join(l.root,'qa/test-04'),apk=path.join(l.root,'app/build/outputs/apk/debug/app-debug.apk'),file=path.join(qa,'integrated-journey.json');
const phases=[
 ['research-power-and-native-save-load','test-04-module-journey.cjs','module-journey',['--phase','dustfall']],
 ['factory-two-levels-and-normal-production','test-04-module-journey.cjs','factory-journey',['--phase','factory']],
 ['module-layout-and-same-item-reselection','test-04-module-layout.cjs','module-layout',[]],
 ['mixed-selection-fifo-movement-and-returns','test-03-mixed-selection.cjs','mixed-regression',[]],
 ['twelve-paused-returns','test-02-paused-returns.cjs','paused-returns',['--apk',apk]],
 ['keyboard-returns','lab-journey.cjs','keyboard-returns',['keyboard','--apk',apk]],
 ['native-quit-and-fresh-battle','test-02-quit-journey.cjs','quit-return',['--apk',apk]]
];
const r={passed:false,identity:j.installedIdentity(apk),started:new Date().toISOString(),phases:[]};
const write=()=>fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');
(async()=>{try{
 const resume=process.argv.includes('--resume-mixed');
 if(resume){const previous=JSON.parse(fs.readFileSync(file));assert.equal(previous.current,phases[3][0]);assert.equal(previous.phases.length,3);assert.equal(previous.identity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);Object.assign(r,previous);(r.fixtureRetries??=[]).push({phase:previous.current,failure:previous.failure,correction:'Inspected the actual Pause/world and advancing native clock, then reused the eight stationary prepared units. Allow a bounded8-second fresh terrain observation after native QuickSave; no app/APK changes or unit grants.'});delete r.failure;delete r.finished;}
 for(const [index,[name,tool,folder,args]]of phases.entries()){
  if(resume&&index<3)continue;
  r.current=name;write();console.log('START '+name);const out=path.join(qa,folder);fs.mkdirSync(out,{recursive:true});const log=fs.createWriteStream(path.join(out,'delivery-run.log'));
  const actualArgs=resume&&index===3?['--reuse']:args;
  const code=await new Promise((resolve,reject)=>{const child=cp.spawn(process.execPath,[path.join(l.root,'tools',tool),...actualArgs],{cwd:l.root,env:{...process.env,WZ_NATIVE_QA:out,WZ_QA_APK:apk,WZ_QA_EXPECTED_APK_SHA256:r.identity.candidateAPK_SHA256}});for(const stream of ['stdout','stderr'])child[stream].on('data',b=>{log.write(b);process[stream].write(b)});child.on('error',reject);child.on('close',resolve);});
  await new Promise(done=>log.end(done));assert.equal(code,0,name+' must pass');r.phases.push({name,passed:true,folder});write();console.log('PASS '+name);
 }
 r.afterIdentity=j.installedIdentity(apk);assert.equal(r.afterIdentity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);r.current='completed';r.passed=true;
}catch(error){r.failure=String(error.stack||error);throw error;}finally{r.finished=new Date().toISOString();write();}})().catch(error=>{console.error(error);process.exitCode=1;});
