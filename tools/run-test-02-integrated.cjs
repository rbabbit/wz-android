'use strict';
// One guarded emulator, ordinary complete saves and real native input only.
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const live=require('./native-live.cjs'),j=require('./lab-journey.cjs');
const root=live.root,qa=path.join(root,'qa/test-02'),apk=path.join(root,'app/build/outputs/apk/debug/app-debug.apk');
const report={passed:false,started:new Date().toISOString(),phases:[],preparations:[]};
const file=path.join(qa,'integrated-journey.json');
function write(){fs.writeFileSync(file,JSON.stringify(report,null,2));}
async function child(name,script,folder,args=[]){
 console.log('START '+name);report.current=name;write();const out=path.join(qa,folder);fs.mkdirSync(out,{recursive:true});
 const log=fs.createWriteStream(path.join(out,'integrated-run.log'));
 const code=await new Promise((resolve,reject)=>{const p=cp.spawn(process.execPath,[path.join(root,'tools',script),...args],{cwd:root,env:{...process.env,WZ_NATIVE_QA:out,WZ_QA_APK:apk,WZ_QA_EXPECTED_APK_SHA256:report.identity.candidateAPK_SHA256}});p.stdout.on('data',b=>{log.write(b);process.stdout.write(b)});p.stderr.on('data',b=>{log.write(b);process.stderr.write(b)});p.on('error',reject);p.on('close',resolve)});
 await new Promise(r=>log.end(r));assert.equal(code,0,name+' process must pass');
 assert.equal(j.installedIdentity(apk).candidateAPK_SHA256,report.identity.candidateAPK_SHA256);
 report.phases.push({name,passed:true,folder});write();console.log('PASS '+name);
}
async function prepare(name,fixture,paused=false){
 report.current='prepare-'+name;write();const c=await j.connectReady(),record={name,fixture,paused};
 try{record.native=await j.restoreFixture(c,fixture,record);if(paused)record.pausedAt=await j.pause(c);report.preparations.push(record);write();}
 finally{c.close()}
}
async function prepareQuit(){
 await prepare('ordinary-quit-queue','early');const c=await j.connectReady();
 try{
  const a=await require('./audit-smooth-building.cjs').controls(c);await a.camera(10,38);
  await c.tap('#wt-open-build');await c.tap('#wt-build-sidebar [data-category="DEFENCES"]');await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');
  await c.wait('!__warzoneCommands.report().selectingTrucks');
  const selected=(await j.commandState(c)).selectedUnits;assert.deepEqual(selected.map(t=>t.id).sort((a,b)=>a-b),[160003,160005,160011]);
  for(const [x,y]of [[8,40],[9,40],[9,42]]){
   const p=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:'GuardTower1',x:${x},y:${y},workerIds:__warzoneCommands.report().nativeBuildGroup})`);assert.equal(p.ok,true,'legal reachable quit-fixture site');await a.tile(x,y);await c.wait(`__warzoneCommands.report().snapshot.jobs.some(j=>j.x===${x}&&j.y===${y})`);
  }
  await c.tap('#wt-build-sidebar [data-action="select-mode"]');await c.wait('!__warzoneCommands.report().exitingBuild');
  await c.wait('WarzoneBuildDisplay.report().acceptedSites.length>=2');report.quitFixture={native:await j.commandState(c),ghosts:await c.evaluate('WarzoneBuildDisplay.report()')};
  assert.ok(report.quitFixture.native.jobs.length>=2);report.quitFixture.pausedAt=await j.pause(c);write();live.screen('integrated-quit-fixture-paused');
 }finally{c.close()}
}
(async()=>{
 const identity=j.installedIdentity(apk),resumeFIFO=process.argv.includes('--resume-fifo'),resumeSave=process.argv.includes('--resume-save'),resume=resumeFIFO||resumeSave;
 if(resume){const prior=JSON.parse(fs.readFileSync(file));assert.equal(prior.identity.candidateAPK_SHA256,identity.candidateAPK_SHA256);assert.equal(prior.current,resumeSave?'genuine-native-save-load':'three-site-mixed-fifo');assert.equal(prior.phases.length,resumeSave?7:5);assert.ok(prior.phases.every(p=>p.passed));Object.assign(report,prior);(report.fixtureRetries??=[]).push({phase:prior.current,reason:prior.failure,correction:resumeSave?'Research observer now reads actual native script logs and completion events; genuine F8 had already rewound the native clock. Reuse prepared paused world; no game-source change.':'Read-only reachability preview now waits for the completed real selection after the deliberately immediate first item tap; no game-source change.'});delete report.failure;delete report.failureState;delete report.recoveryFailure;}
 report.identity=identity;write();
 try{
  if(!resume){
  const c=await j.connectReady();try{const library=await c.evaluate('JSON.parse(BlockNightAndroid.loadDesigns())'),before=JSON.parse(fs.readFileSync(path.join(qa,'test-library-before-final-update.json')));assert.deepEqual(library,before,'updating the test APK preserves every existing phone design');report.libraryPreservedAcrossUpdate=true;}finally{c.close()}
  await child('native-build-navigation','test-02-native-build-navigation.cjs','navigation',['--apk',apk]);
  await child('paused-returns','test-02-paused-returns.cjs','paused-returns',['--apk',apk]);
  await child('research-production-models-and-returns','lab-journey.cjs','gameplay-delivery',['all','--apk',apk]);
  const all=JSON.parse(fs.readFileSync(path.join(qa,'gameplay-delivery/lab-journey-all.json')));assert.ok(all.passed&&all.researchQueue&&all.researchCompletion);
  fs.writeFileSync(path.join(qa,'gameplay-delivery/research-verified.json'),JSON.stringify({passed:true,identity:all.identity,verifiedPhases:['research','research-completion'],scope:'Native research phases from the completed integrated gameplay run',researchQueue:all.researchQueue,researchCompletion:all.researchCompletion,runtimeErrorsByPhase:all.runtimeErrorsByPhase},null,2));
  // Keep the independently named exact-APK reports used by the packaging gate.
  for(const phase of ['production','designs'])fs.writeFileSync(path.join(qa,'gameplay-delivery/lab-journey-'+phase+'.json'),JSON.stringify({...all,phase,cases:[phase],scope:'Completed '+phase+' phase of the successful integrated all-journey run'},null,2));
  await child('keyboard-returns','lab-journey.cjs','gameplay-delivery',['keyboard','--apk',apk]);
  await prepare('wide-building','early',true);
  await child('wide-stop-movement-and-building','audit-building-wide.cjs','building/wide-controls');
  await prepare('three-site-fifo','early');
  }else if(resumeFIFO){const c=await j.connectReady();try{await j.resume(c);const s=await j.commandState(c);assert.equal(s.mapHeight,64);assert.equal(s.jobs.length,0);assert.ok(s.trucks.filter(t=>[160003,160005,160011].includes(t.id)).every(t=>[0,1].includes(t.order)&&t.x===7),'reuse the validated unchanged ordinary workers');}finally{c.close()}}
  if(!resumeSave){
  await child('three-site-mixed-fifo','audit-smooth-building.cjs','building/fifo-delivery');
  await child('compact-layouts','lab-layout-journey.cjs','layout-delivery');
  await prepare('genuine-save-roundtrip','research');
  }
  await child('genuine-native-save-load','test-02-save-roundtrip.cjs','save-roundtrip',['--apk',apk]);
  await prepareQuit();
  await child('native-quit-confirm-and-new-battle','test-02-quit-journey.cjs','quit-delivery',['--apk',apk]);
  await child('dustfall-camera-and-construction','audit-build-display-td1.cjs','dustfall');
  report.afterIdentity=j.installedIdentity(apk);assert.equal(report.afterIdentity.candidateAPK_SHA256,report.identity.candidateAPK_SHA256);report.passed=true;report.current='completed';
 }catch(error){report.failure=String(error.stack||error);try{live.screen('integrated-failure');const c=await j.connectReady();try{report.failureState=await c.evaluate('({commands:__warzoneCommands.report(),waves:__warzoneTowersWaves.report(),session:__towersHtml.report()})');await j.pause(c)}finally{c.close()}}catch(recovery){report.recoveryFailure=String(recovery)}throw error;}
 finally{report.finished=new Date().toISOString();write()}
})().catch(e=>{console.error(e);process.exitCode=1});
