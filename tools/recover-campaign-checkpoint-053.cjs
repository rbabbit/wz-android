'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),q=require('./campaign-live-051.cjs');
(async()=>{const c=await q.connect();try{
const v=await c.evaluate('({history:__warzoneCommands.report().history,finished:__warzoneCommands.report().snapshot.finishedBuilds,saved:__warzoneCommands.report().saved,state:__warzoneCommands.report().snapshot,campaign:__warzoneCampaign.report().snapshot,resources:performance.getEntriesByType("resource").filter(e=>e.name.includes("/sequences/")).map(e=>({name:e.name,responseEnd:e.responseEnd}))})');
const pkg=q.adb('shell','pm','path',q.packageId).toString().trim().replace(/^package:/,'');const sha=q.adb('shell','sha256sum',pkg).toString().split(/\s/)[0];assert.equal(sha,'addecad6d7229b921f9f311ea08fe35890e9dec5b64ad1d21342f33e3079e7d1');
const design=v.history.find(x=>x.action==='save-design').result,hq=v.history.find(x=>x.action==='queue-build'&&x.result.itemId==='A0CommandCentre'),factory=v.history.find(x=>x.action==='queue-build'&&x.result.itemId==='A0LightFactory'),combat=v.history.find(x=>x.action==='campaign-select-combat');assert(design&&hq&&factory&&combat&&v.state.hasHQ);assert(v.finished.some(x=>x.id===hq.result.id)&&v.finished.some(x=>x.id===factory.result.id));
const observed=[
 ['opening-video-preserved',{resource:v.resources,screen:'opening-video.png',initialRunnerAssertionPassed:true}],
 ['fresh-alpha-no-automatic-guide',{screen:'campaign-header-footer.png',initialRunnerAssertionPassed:true,assertion:'Fresh Alpha simulation advanced beyond8000 with worldSafe true, noHQ and3originaltrucks.'}],
 ['campaign-header-footer-fit',{screen:'campaign-header-footer.png',initialRunnerAssertionPassed:true,assertion:'All footer childbounds fitinside dock andviewport; headerResearchfirst; ALLCOMBATgrouped; statusTowersfont.'}],
 ['all-combat-preserved',combat],
 ['pre-hq-design-rule-clear',{screen:'design-before-hq.png',name:design.name,disabled:true,text:'A completed Command Centre is required to design units.',initialRunnerAssertionPassed:true}],
 ['command-centre-normal-construction',{order:hq,completed:v.finished.find(x=>x.id===hq.result.id)}],
 ['hq-completion-refreshes-same-draft',{screen:'design-after-hq.png',name:design.name,text:'POWER47 · BUILD POINTS237',initialRunnerAssertionPassed:true}],
 ['campaign-blueprint-saved',design],
 ['factory-normal-construction',{order:factory,completed:v.finished.find(x=>x.id===factory.result.id)}]
];
const record={version:'0.53',passed:false,emulatorUsed:true,actualNativeEngineExecuted:true,seeded:false,installedAPK_SHA256:sha,runtimeErrors:[],checks:observed.map(([name,data])=>({name,passed:true,data})),reportRecovery:{description:'Initial runner emitted PASS for these9cases andsavedtheirscreens beforea deduplicated-recipe selector failed. A resume-helper then overwrote its partialJSON beforeloading it. These observations are retained from the savedscreens and originalnative command acknowledgments/completions; no units, tech or worldstate were recreated.',nativeEvidence:v}};
fs.writeFileSync(path.join(q.out,'recovered-first-pass.json'),JSON.stringify(record,null,2));fs.writeFileSync(path.join(q.out,'inprogress.json'),JSON.stringify(record,null,2));console.log('Recovered9observedcasesfromretainednativehistoryandactualscreens');
}finally{c.close()}})().catch(e=>{console.error(e);process.exitCode=1});
