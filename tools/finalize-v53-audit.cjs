'use strict';
// This gate consumes real, installed-APK emulator evidence. It does not replace
// the screenshot review or generate passing gameplay results.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'qa/v5.3');
const read=name=>JSON.parse(fs.readFileSync(path.join(base,name),'utf8'));
const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'app/build/outputs/apk/debug/app-debug.apk'))).digest('hex');
const cases=[['verified-short','v53-research'],['verified-short','tactical-build'],['verified-short','v53-production'],['verified-compact','v53-layout'],['verified-wide','v53-layout'],['verified-compact','v53-build-visual'],['verified-wide','v53-build-visual']];
for(const [folder,name] of cases){const r=read(`${folder}/${name}-results.json`);assert.equal(r.apkSHA256,hash,`${folder}/${name} must test the delivery APK`);assert.ok(r.completedAt);}
const research=read('verified-short/v53-research-results.json');
for(const key of ['startedWhileOpen','queueRemoval','twoLabs','orderedAdvance','repeatedReturns'])assert.equal(research[key],true,key);
assert.equal(research.advanced.bridgeErrors,0);
const progress=read('verified-short/research-native-progress.json'),advanced=read('verified-short/research-native-advanced.json');
const topic=(save,name)=>Object.values(save['resstate.json']).find(item=>item.name===name);
assert.ok(topic(progress,'R-Vehicle-Prop-Hover').currentPoints[0]>0);
assert.equal(topic(advanced,'R-Vehicle-Prop-Hover').researched[0]&4,4);
assert.equal(topic(advanced,'R-Vehicle-Metals01').researched[0]&4,4);
assert.equal(Object.values(advanced['struct.json']).find(s=>s.id===160169)['Research/target'],'R-Vehicle-Body05');
const removed=topic(advanced,'R-Vehicle-Engine03');assert.ok(!removed || (!removed.currentPoints[0] && !(removed.researched[0]&4)));
const construction=read('verified-short/tactical-build-results.json');
assert.equal(construction.threeCompleted,true);assert.equal(construction.automaticPlacementExit,true);assert.equal(construction.truckMovement,true);assert.equal(construction.sites.length,3);
const production=read('verified-short/v53-production-results.json');assert.equal(production.ordinaryProduction,true);assert.equal(production.moved,true);
for(const folder of ['verified-compact','verified-wide']){const r=read(`${folder}/v53-layout-results.json`);assert.equal(r.fullNativeStripCovered,true);assert.equal(r.keyboardReturn,true);assert.equal(r.extraLargeAndStandard,true);}
for(const folder of ['verified-compact','verified-wide']){const r=read(`${folder}/v53-build-visual-results.json`);assert.equal(r.readyPlacementScreen,true);assert.equal(r.nativeToolCleared,true);assert.equal(r.footer.visible,true);assert.equal(r.footer.hit,true);}
const preservation=read('preservation.json');assert.equal(preservation.candidateAPK_SHA256,hash);
for(const key of ['officialEngineCodeIdentical','wasmIdentical','frozenDataPrefixPreserved','editableAssetsMatchCandidate','embeddedScenarioMatchesSource'])assert.equal(preservation[key],true,key);
const consoleCheck=read('console-check.json');assert.equal(consoleCheck.apkSHA256,hash);assert.equal(consoleCheck.scriptExceptions.length,0);assert.equal(consoleCheck.bridgeErrors,0);
const result={passed:true,apkSHA256:hash,completedAt:new Date().toISOString(),viewports:[[1280,576],[1080,600],[1600,720]],cases:cases.map(([folder,name])=>`${folder}/${name}`),nativeResearchProgressAndCompletion:true,nativeConstructionCompletionAndMovement:true,ordinaryProduction:true,officialEnginePreserved:true,limits:['Research time/progress are labelled estimates.','Existing emulator black terrain remains; see KNOWN-ISSUES.','No physical tablet, HQ appearance, audio or general Save/Load certification.']};
fs.writeFileSync(path.join(base,'delivery-gate.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
