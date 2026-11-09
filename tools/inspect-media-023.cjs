'use strict';
process.env.WZ_NATIVE_QA=require('node:path').resolve(__dirname,'../qa/0.23-music');
const fs=require('node:fs'),l=require('./native-live.cjs');
(async()=>{const c=await l.connect();try{
 const report={state:await c.evaluate('WarzoneMusic.report()'),objects:{}};
 for(const name of ['HTMLAudioElement','HTMLMediaElement','Audio']){
  const p=(await c.call('Runtime.evaluate',{expression:`document.getElementById('warzone-game-frame').contentWindow.${name}.prototype`})).result.objectId;
  const array=(await c.call('Runtime.queryObjects',{prototypeObjectId:p})).objects.objectId;
  report.objects[name]=(await c.call('Runtime.callFunctionOn',{objectId:array,functionDeclaration:`function(){return this.map(x=>({tag:x.tagName,src:x.currentSrc,paused:x.paused,time:x.currentTime,ready:x.readyState,proto:Object.getPrototypeOf(x).constructor.name}));}`,returnByValue:true})).result.value;
 }
 fs.writeFileSync(l.out+'/media-inspection.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
