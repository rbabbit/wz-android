'use strict';
// Matched-state real Android captures for the approved compact mock comparison.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect,adb,out}=require('./native-live.cjs');
(async()=>{const c=await connect(),report={seeded:false,cases:[]},a=require('./native-audit-controls.cjs')(c,report);try{
 const apk=adb('shell','pm','path','com.rbabbit.warzonetowers').toString().trim().replace('package:','');report.installedAPK_SHA256=adb('shell','sha256sum',apk).toString().split(/\s/)[0];
 await a.resume();await a.menu('Help & interface size');await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).page==="help"');await a.scrollTo('Standard');await a.tap('Standard');await a.close();
 if(!(await a.ui()).views.some(v=>v.label==='TRUCKS'))await a.tap('UNIT CONTROLS');await a.tap('TRUCKS');await c.wait('__warzoneCommands.report().snapshot.selectedUnits.length===3');
 if((await a.ui()).views.some(v=>v.label==='UNIT CONTROLS'&&v.text==='Close'))await a.tap('UNIT CONTROLS');
 await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).views.some(v=>v.label==="UNIT CONTROLS"&&v.text==="Orders")');await a.capture('reference-match-battle');
 await a.tap('TECH');await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).page==="research"');
 const labs=await c.evaluate('__blockNightResearch.report().labs.map(l=>l.id).sort((a,b)=>a-b)');
 async function select(n){if((await a.ui()).selectedLab===labs[n-1])return;await a.tap('Choose laboratory');const choice=(await a.ui()).views.find(v=>v.text.startsWith('Lab '+n+' '));assert.ok(choice);await a.tap(choice.text);await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).selectedLab==='+labs[n-1]);}
 await select(1);await a.tap('ADD Medium Body - Cobra');await c.wait('__blockNightResearch.report().labs.find(l=>l.id===160169).topicId==="R-Vehicle-Body05"');await a.tap('ADD Fuel Injection Engine Mk3');await c.wait('__blockNightResearch.model().queueItems.some(q=>q.labId===160169&&q.topics.some(t=>t.name==="Fuel Injection Engine Mk3"))');
 await select(2);await a.tap('ADD Composite Alloys');await c.wait('__blockNightResearch.report().labs.find(l=>l.id===160171).topicId==="R-Vehicle-Metals01"');await select(1);await a.capture('reference-match-research');report.researchUI=await a.ui();
 for(const label of ['ACTIVE Medium Body - Cobra','QUEUED Fuel Injection Engine Mk3'])assert.ok(report.researchUI.views.some(v=>v.label===label),'same visit retains real active/waiting rows');
 assert.ok(report.researchUI.views.some(v=>v.text==='Composite Alloys'),'same visit retains the other laboratory topic');
 await a.close();await a.pause();assert.deepEqual(c.errors,[]);report.passed=true;fs.writeFileSync(path.join(out,'reference-matched-state.json'),JSON.stringify(report,null,2));console.log('PASS: native matched-state battle/research comparison captures');
 }finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
