'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'qa/v5.4');
const read=name=>JSON.parse(fs.readFileSync(path.join(base,name),'utf8'));
const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'app/build/outputs/apk/debug/app-debug.apk'))).digest('hex');
const cases=[['short','v54-lab-sidebar'],['compact','v54-lab-layout']];
for(const [folder,name] of cases){const r=read(`${folder}/${name}-results.json`);assert.equal(r.apkSHA256,hash);assert.ok(r.completedAt);}
const short=read('short/v54-lab-sidebar-results.json');
for(const key of ['fourRealLabs','hoverIndependent','nativeTargetsVerified','repeatedSwitches','filterAndMenuReturns','queueRemoveAndReadd','completionFollowed'])assert.equal(short[key],true,key);
assert.equal(short.bridgeErrors,0);assert.equal(short.prepared.labs.length,4);assert.ok(short.prepared.queues.every(q=>q.length===1));
for(const view of short.views){assert.equal(view.current,view.lab.topicName);assert.equal(view.preview,'Hover Propulsion');assert.equal(view.total,'2 ITEMS');assert.equal(view.previewOutside,true);}
const started=read('short/labs-native-started.json'),completed=read('short/labs-native-advanced.json');
for(const lab of short.prepared.labs)assert.equal(Object.values(started['struct.json']).find(s=>s.id===lab.id)['Research/target'],lab.topicId);
assert.equal(Object.values(completed['struct.json']).find(s=>s.id===short.advanced.lab.id)['Research/target'],short.advanced.lab.topicId);
assert.equal(Object.values(completed['resstate.json']).find(r=>r.name===short.prepared.labs[1].topicId).researched[0]&4,4);
const compact=read('compact/v54-lab-layout-results.json');for(const key of ['allFourLabs','repeatedSwitches','filteredContext','previewAndButtonVisible','extraLargeAndStandard','returns'])assert.equal(compact[key],true,key);
const preservation=read('preservation.json');assert.equal(preservation.candidateAPK_SHA256,hash);assert.equal(preservation.newDataBytes,preservation.previousDataBytes);
for(const key of ['officialEngineCodeIdentical','wasmIdentical','frozenDataPrefixPreserved','editableAssetsMatchCandidate','embeddedScenarioMatchesSource'])assert.equal(preservation[key],true,key);
const consoleCheck=read('console-check.json');assert.equal(consoleCheck.apkSHA256,hash);assert.equal(consoleCheck.bridgeErrors,0);assert.deepEqual(consoleCheck.scriptExceptions,[]);
const report={passed:true,versionCode:54,apkSHA256:hash,completedAt:new Date().toISOString(),cases:cases.map(([folder,name])=>`${folder}/${name}`),viewports:[[1280,576],[1080,600]],fourNativeLabTargets:true,currentTopicAndImageFollowLab:true,waitingQueuesFollowLab:true,independentCataloguePreview:true,nativeCompletionAndAdvancement:true,queueEditingAndReturns:true,engineAndScenarioUnchanged:true,limits:['Research time/progress remain estimates.','Existing emulator black terrain, physical-device, HQ, audio and general Save/Load limits remain.']};
fs.writeFileSync(path.join(base,'delivery-gate.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
