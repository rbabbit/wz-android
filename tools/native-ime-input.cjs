'use strict';
const assert=require('node:assert/strict'),{adb,delay}=require('./native-live.cjs');
// Real keyboard input only. Four-character batches are observed before the next batch.
module.exports=async function edit(c,a,report,label,value,page='design'){
 const visible=()=>{const d=adb('shell','dumpsys','input_method').toString();return /\bmInputShown=true\b/.test(d)&&/\bm(?:DecorViewVisible|WindowVisible)=true\b/.test(d);};
 const served=()=>adb('shell','dumpsys','input_method').toString().match(/^\s*mServedView=android\.widget\.EditText\{([0-9a-f]+)/m)?.[1];
 await a.tap(label);let end=Date.now()+8000;while(Date.now()<end&&!visible())await delay(100);assert.ok(visible(),'actual Android keyboard is visible before editing');
 const identity=served();assert.ok(identity,'native served EditText identity');adb('shell','input','keycombination','113','29');
 const trace=[];
 for(let offset=0;offset<value.length;offset+=4){const part=value.slice(offset,offset+4);adb('shell','input','text',part.replace(/ /g,'%s'));const prefix=value.slice(0,offset+part.length);await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).views.some(v=>v.label==='+JSON.stringify(label)+'&&v.text==='+JSON.stringify(prefix)+')',5000);assert.equal(served(),identity,'same actual EditText accepts every batch');trace.push({value:prefix,servedEditText:identity});}
 assert.ok(visible(),'IME remains visibly open before Back');adb('shell','input','keyevent','4');end=Date.now()+8000;while(Date.now()<end&&visible())await delay(100);assert.ok(!visible(),'keyboard dismissed');await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).page==='+JSON.stringify(page));(report.keyboardBatches??=[]).push({label,trace,keyboardReturned:true});
};
