'use strict';
process.env.WZ_NATIVE_QA ||= require('path').join(__dirname,'../qa/test-03/layout-selection');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),j=require('./lab-journey.cjs'),l=require('./native-live.cjs'),s=require('./test-02-selection-journey.cjs'),{controls}=require('./audit-smooth-building.cjs');
const expected=[160003,160005,160011];
(async()=>{const c=await j.connectReady(),r={passed:false,identity:j.installedIdentity(),profiles:[]};try{
 if(process.argv.includes('--prepare-early'))await j.restoreFixture(c,'early',r);
 for(const [name,size,font,scale]of [['wide','2400x1080','1',1],['compact-enlarged','480x854','1.3',1.4]]){
  await j.pause(c);l.adb('shell','wm','size',size);l.adb('shell','settings','put','system','font_scale',font);await c.evaluate(`__warzoneCommands.setSize(${scale});true`);await c.paint();await j.resume(c);
  const a=await controls(c);await a.camera(5,37);const p={name,size,font,scale};r.profiles.push(p);
  await s.chooseFirst(c);p.build=await s.waitSelection(c,expected);p.trace=await c.evaluate('__warzoneCommands.report().truckSelection');p.screenshot=l.screen('selection-'+name);
  const geometry=await c.host('({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,sidebar:document.getElementById("wt-build-sidebar").getBoundingClientRect().toJSON()})');assert.ok(geometry.overflow<=2);p.geometry=geometry;
  assert.ok(p.build.selected.every(u=>u.constructor));await s.closeBuild(c);await s.truckButton(c,expected);p.trucks=await c.evaluate('__warzoneCommands.report().truckSelection');
 }
 assert.deepEqual(c.errors,[]);r.afterIdentity=j.installedIdentity();r.passed=true;
}catch(e){r.failure=String(e.stack||e);l.screen('layout-selection-failure');throw e;}finally{
 try{await j.pause(c);l.adb('shell','wm','size','600x1080');l.adb('shell','settings','put','system','font_scale','1');await c.evaluate('__warzoneCommands.setSize(1);true');await c.paint();r.pausedAt=await j.pause(c);}catch(e){r.cleanupFailure=String(e)}fs.writeFileSync(path.join(l.out,'layout-selection.json'),JSON.stringify(r,null,2));c.close();
}console.log(JSON.stringify({passed:r.passed,profiles:r.profiles.map(p=>({name:p.name,boxes:p.trace.boxes,queries:p.trace.queries}))}));})().catch(e=>{console.error(e);process.exitCode=1});
