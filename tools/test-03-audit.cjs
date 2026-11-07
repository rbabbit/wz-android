'use strict';
process.env.WZ_NATIVE_QA ||= require('path').join(__dirname,'../qa/test-03/audit');
const fs=require('fs'),path=require('path'),live=require('./native-live.cjs'),j=require('./lab-journey.cjs');
(async()=>{const c=await j.connectReady(),r={changedAppCode:false,seeded:false,identity:j.installedIdentity(),started:new Date().toISOString()};
try{
 await j.resume(c);await j.closeOverlays(c);const ctl=await require('./audit-smooth-building.cjs').controls(c);await ctl.camera(8,72);
 r.before=(await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})')).result;
 const p=await c.evaluate('({x:innerWidth*.55,y:innerHeight*.35})');
 await c.evaluate(`__kalaWarzoneTouch.nativeWorldClick(${p.x},${p.y},false,2)`);
 r.cleared=(await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})')).result.selectedUnits;
 await c.tap('#wt-open-build');await c.tap('#wt-build-sidebar [data-category="DEFENCES"]');await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');await c.wait('!__warzoneCommands.report().selectingTrucks',12000);
 r.selection=await c.evaluate('({group:__warzoneCommands.report().nativeBuildGroup,selected:__warzoneCommands.report().snapshot.selectedUnits,trucks:__warzoneCommands.report().snapshot.trucks,notice:parent.document.getElementById("wt-command-toast")?.textContent})');
 live.screen('after-moved-workers-build');
 r.powerPreviews=[];
 for(let x=5;x<=7;x++)for(let y=56;y<=58;y++){
  const v=await c.evaluate(`__warzoneCommands.send('preview-build',{itemId:'A0PowMod1',x:${x},y:${y},workerIds:[160001,160003]})`);
  r.powerPreviews.push({x,y,ok:v.ok,reason:v.reason,result:v.result});
 }
 await c.tap('#wt-build-sidebar [data-action="select-mode"]');await c.wait('!__warzoneCommands.report().exitingBuild');
 r.native=await c.save('audit-moved-workers');
 r.geometry=await c.evaluate(`(${JSON.stringify(Object.values(r.native['droid.json']).filter(d=>[160001,160003].includes(d.id)).map(d=>({id:d.id,pos:d.position})))}).map(d=>{const t=__warzoneCommands.report().snapshot.trucks.find(t=>t.id===d.id);return{id:d.id,world:d.pos,tile:[t.x,t.y],actual:WarzoneTerrain.project(d.pos[0],d.pos[1],d.pos[2]+32),guessed:WarzoneTerrain.project((t.x+.5)*128,(t.y+.5)*128,WarzoneTerrain.heightAt((t.x+.5)*128,(t.y+.5)*128)+32)}})`);
 console.log(JSON.stringify({selection:r.selection,power:r.powerPreviews.map(({x,y,ok,reason})=>({x,y,ok,reason})),geometry:r.geometry},null,2));
}catch(e){r.failure=String(e.stack||e);live.screen('audit-failure');throw e;}finally{try{r.paused=await j.pause(c)}catch(e){r.cleanup=String(e)};fs.writeFileSync(path.join(live.out,'audit.json'),JSON.stringify(r,null,2));c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
