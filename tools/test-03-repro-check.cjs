'use strict';
// The exact ordinary Dustfall save that reproduced the delivered picker bug.
process.env.WZ_NATIVE_QA ||= require('path').join(__dirname,'../qa/test-03/repro-delivery');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),j=require('./lab-journey.cjs'),l=require('./native-live.cjs');
const fixture=JSON.parse(fs.readFileSync(path.join(l.root,'qa/test-03/fixtures/dustfall-moved.json'))),file=path.join(l.out,'repro-check.json');
const ids=x=>x.map(d=>d.id).sort((a,b)=>a-b),wanted=[160001,160003];
async function fresh(c){const r=await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})');assert.equal(r.ok,true);return r.result;}
(async()=>{const r={passed:false,seeded:false,identity:j.installedIdentity(),fixtureSHA256:fixture.sha256,started:new Date().toISOString(),phase:'startup'},c=process.argv.includes('--reuse')?await j.connectReady():await j.start('td1');try{
 await j.resume(c);
 r.startupScreen=l.screen('repro-new-started');
 await c.save('repro-new-native-slot');
 // Restore all 24 bytes-for-byte native files together. This is the preserved
 // ordinary save, never a patch to world objects, modules, time or ownership.
 await c.evaluate(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave';f.mkdirTree(p);for(const [n,b]of Object.entries(${JSON.stringify(fixture.files)})){if(!/^[a-zA-Z0-9_.-]+$/.test(n))throw Error('Invalid complete fixture path');f.writeFile(p+'/'+n,new Uint8Array(b));}return true})()`);
 r.phase='load-preserved-ordinary-world';await c.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true',{timeoutMs:90000});
 await c.wait(`__warzoneTowersWaves.report().snapshot.gameTime>=${fixture.gameTime-500}`,90000,{timeoutMs:90000});
 r.load=await require('./observe-native-load.cjs').observe(c,{label:'repro-preserved-dustfall'});r.before=await fresh(c);assert.equal(r.before.mapHeight,79);
 await c.evaluate('WarzoneTerrain.refresh()');
 const clear=async()=>{await j.closeOverlays(c);const p=await c.evaluate('({x:innerWidth*.55,y:innerHeight*.35})');assert.equal(await c.evaluate(`__kalaWarzoneTouch.isBattlefieldPoint(${p.x},${p.y})`),true);await c.evaluate(`__kalaWarzoneTouch.nativeWorldClick(${p.x},${p.y},false,2)`);assert.deepEqual((await fresh(c)).selectedUnits,[]);};
 await clear();r.phase='build-after-original-construction';await c.tap('#wt-open-build');await c.tap('#wt-sidebar-catalogue [data-build="GuardTower1"]');
 assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'GuardTower1','first item does not shift under the touch');
 await c.wait('!__warzoneCommands.report().selectingTrucks',15000);r.build=await fresh(c);r.buildTrace=await c.evaluate('__warzoneCommands.report().truckSelection');
 assert.deepEqual(ids(r.build.selectedUnits),wanted,'original failing moved workers are genuinely selected');assert.deepEqual(await c.evaluate('__warzoneCommands.report().nativeBuildGroup.slice().sort((a,b)=>a-b)'),wanted);l.screen('repro-build-two-native-highlights');
 await j.closeOverlays(c);await clear();r.phase='trucks-after-original-construction';
 if(!await c.host('!document.getElementById("wt-field-centre").inert'))await c.tap('#wt-field-toggle');await c.tap('#wt-select-trucks');await c.wait('!__warzoneCommands.report().selectingTrucks',15000);
 r.trucks=await fresh(c);r.trucksTrace=await c.evaluate('__warzoneCommands.report().truckSelection');assert.deepEqual(ids(r.trucks.selectedUnits),wanted);l.screen('repro-trucks-two-native-highlights');
 const save=await c.save('repro-after-selection-native'),original=JSON.parse(Buffer.from(fixture.files['droid.json']));
 r.nativeUnits=Object.values(save['droid.json']).filter(d=>typeof d==='object'&&Number.isFinite(d.id)).map(d=>({id:d.id,position:d.position,order:d['order/type']}));
 for(const old of Object.values(original).filter(d=>typeof d==='object'&&Number.isFinite(d.id))){const now=r.nativeUnits.find(d=>d.id===old.id);assert.ok(now);assert.deepEqual(now.position,old.position,'selection does not move native unit '+old.id);assert.equal(now.order,old['order/type'],'selection does not issue an order '+old.id);}
 r.errors=c.errors;assert.deepEqual(c.errors,[]);r.afterIdentity=j.installedIdentity();r.passed=true;
}catch(e){r.failure=String(e.stack||e);l.screen('repro-check-failure');throw e;}finally{try{r.paused=await j.pause(c)}catch(e){r.cleanup=String(e)}r.finished=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(r,null,2));c.close();}console.log(JSON.stringify({passed:r.passed,identity:r.identity,buildTrace:r.buildTrace,trucksTrace:r.trucksTrace}));})().catch(e=>{console.error(e);process.exitCode=1});
