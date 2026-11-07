'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict'),j=require('./lab-journey.cjs'),l=require('./native-live.cjs');
const qa=path.join(l.root,'qa/test-03'),apk=path.join(l.root,'app/build/outputs/apk/debug/app-debug.apk'),file=path.join(qa,'integrated-journey.json');
const r={passed:false,identity:j.installedIdentity(apk),started:new Date().toISOString(),phases:[]};
const write=()=>fs.writeFileSync(file,JSON.stringify(r,null,2));
async function child(name,tool,folder,args=[]){
 r.current=name;write();console.log('START '+name);const out=path.join(qa,folder);fs.mkdirSync(out,{recursive:true});const log=fs.createWriteStream(path.join(out,'delivery-run.log'));
 const code=await new Promise((resolve,reject)=>{const p=cp.spawn(process.execPath,[path.join(l.root,'tools',tool),...args],{cwd:l.root,env:{...process.env,WZ_NATIVE_QA:out,WZ_QA_APK:apk,WZ_QA_EXPECTED_APK_SHA256:r.identity.candidateAPK_SHA256}});for(const stream of ['stdout','stderr'])p[stream].on('data',b=>{log.write(b);process[stream].write(b)});p.on('error',reject);p.on('close',resolve)});await new Promise(done=>log.end(done));assert.equal(code,0,name+' must pass');r.phases.push({name,passed:true,folder});write();console.log('PASS '+name);
}
(async()=>{const resume=process.argv.includes('--resume-mixed');if(resume){const previous=JSON.parse(fs.readFileSync(file));assert.equal(previous.current,'mixed-units-fifo-movement-and-returns');assert.equal(previous.identity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);assert.equal(previous.phases.length,3);Object.assign(r,previous);(r.fixtureRetries??=[]).push({phase:previous.current,reason:previous.failure,correction:'Wait for observable DevTools game-tab registration after Play. Reuse the already launched Iron Valley; no app-source or APK change.'});delete r.failure;delete r.cleanupFailure;}try{
 if(!resume){
 await child('normal-branding','test-03-branding-qa.cjs','branding');
 await child('original-moved-truck-reproduction','test-03-repro-check.cjs','repro-delivery');
 await child('research-and-power-modules-save-load','test-03-module-journey.cjs','module-journey');
 }
 await child('mixed-units-fifo-movement-and-returns','test-03-mixed-selection.cjs','mixed-selection',resume?['--reuse-start']:[]);
 await child('wide-and-compact-selection','test-03-layout-selection.cjs','layout-selection',['--prepare-early']);
 await child('twelve-paused-returns','test-02-paused-returns.cjs','paused-returns',['--apk',apk]);
 await child('keyboard-returns','lab-journey.cjs','keyboard-returns',['keyboard','--apk',apk]);
 await child('native-quit-and-fresh-battle','test-02-quit-journey.cjs','quit-delivery',['--apk',apk]);
 r.afterIdentity=j.installedIdentity(apk);r.current='completed';r.passed=true;
}catch(e){r.failure=String(e.stack||e);try{const c=await j.connectReady();try{l.screen('delivery-integrated-failure');await j.pause(c)}finally{c.close()}}catch(x){r.cleanupFailure=String(x)}throw e;}finally{r.finished=new Date().toISOString();write()}})().catch(e=>{console.error(e);process.exitCode=1});
