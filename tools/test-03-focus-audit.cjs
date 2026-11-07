'use strict';
process.env.WZ_NATIVE_QA ||= require('path').join(__dirname,'../qa/test-03/focus-audit');
const fs=require('fs'),path=require('path'),j=require('./lab-journey.cjs'),l=require('./native-live.cjs');
(async()=>{const c=await j.connectReady(),r={identity:j.installedIdentity(),cases:[]};try{
 await j.resume(c);await j.closeOverlays(c);
 await c.evaluate(`window.__selectionFocus=[];window.addEventListener('blur',e=>{__selectionFocus.push({type:e.type,target:e.target===window?'window':e.target?.id,at:performance.now(),hostFocus:parent.document.hasFocus(),commands:__warzoneCommands.report().truckSelection,selecting:__warzoneCommands.report().selectingTrucks,input:__kalaWarzoneTouch.report().pendingClicks})},true);true`);
 for(const immediate of [false,true]){
  await j.closeOverlays(c);await c.evaluate('__kalaWarzoneTouch.nativeWorldClick(innerWidth*.55,innerHeight*.35,false,2)');
  await c.tap('#wt-open-build');
  if(immediate)await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');
  await c.wait('!__warzoneCommands.report().selectingTrucks',15000);
  const state=await c.evaluate('({group:__warzoneCommands.report().nativeBuildGroup,trace:__warzoneCommands.report().truckSelection,focus:__selectionFocus})');
  r.cases.push({immediate,...state});l.screen(immediate?'immediate-item':'build-without-item');
 }
 console.log(JSON.stringify(r,null,2));
}finally{await j.pause(c);fs.writeFileSync(path.join(l.out,'focus-audit.json'),JSON.stringify(r,null,2));c.close()}})().catch(e=>{console.error(e);process.exitCode=1});
