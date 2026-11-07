'use strict';
process.env.WZ_NATIVE_QA ||= require('path').join(__dirname,'../qa/test-03/branding');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
(async()=>{const r={passed:false,identity:j.installedIdentity()};l.adb('shell','am','force-stop',l.packageId);l.adb('shell','am','start','-n',l.packageId+'/com.rbabbit.blocknight.warzone.MainActivity','--es','map','td1');
const end=Date.now()+15000;let nodes=[];while(Date.now()<end){nodes=l.tree().nodes;if(nodes.some(n=>n.text==='WARZONE TOWERS'))break;await l.delay(150);}
assert.ok(nodes.some(n=>n.text==='WARZONE TOWERS'),'actual native startup uses the normal name');assert.ok(!nodes.some(n=>/TOWERS TEST|TOWERS LAB|LAB 0?1/i.test(n.text||'')),'no removed wording in the visible native startup');r.nodes=nodes.map(({text,bounds,'content-desc':label})=>({text,label,bounds}));r.screen=l.screen('normal-warzone-towers-startup');r.passed=true;fs.writeFileSync(path.join(l.out,'branding.json'),JSON.stringify(r,null,2));console.log(JSON.stringify({passed:true,identity:r.identity,screen:r.screen}));})().catch(e=>{console.error(e);process.exitCode=1});
