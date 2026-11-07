'use strict';
process.env.WZ_NATIVE_QA ||= require('path').join(__dirname,'../qa/test-03/audit');
const fs=require('fs'),j=require('./lab-journey.cjs'),l=require('./native-live.cjs');
(async()=>{const c=await j.connectReady();try{
 await j.resume(c);await j.closeOverlays(c);
 if(!await c.host('!document.getElementById("wt-field-centre").inert'))await c.tap('#wt-field-toggle');
 await c.tap('#blocknight-box-select');
 const v=await c.evaluate('({x1:innerWidth*.40,y1:innerHeight*.40,x2:innerWidth*.65,y2:innerHeight*.72,f:parent.document.getElementById("warzone-game-frame").getBoundingClientRect().y})');
 l.adb('shell','input','swipe',String(Math.round(v.x1)),String(Math.round(v.y1+v.f)),String(Math.round(v.x2)),String(Math.round(v.y2+v.f)),'650');
 await c.wait('__warzoneCommands.report().snapshot.selectedUnits.length===2');
 const s=(await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})')).result;
 fs.writeFileSync(l.out+'/native-box-proof.json',JSON.stringify({selected:s.selectedUnits,trucks:s.trucks},null,2));
 console.log(JSON.stringify(s.selectedUnits));l.screen('native-box-selects-moved-trucks');
}finally{await j.pause(c);c.close()}})().catch(e=>{console.error(e);process.exitCode=1});
