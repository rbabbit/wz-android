'use strict';
process.env.WZ_NATIVE_QA ||= require('path').join(__dirname,'../qa/test-03/preflight-5168');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),j=require('./lab-journey.cjs'),l=require('./native-live.cjs'),s=require('./test-02-selection-journey.cjs');
(async()=>{const c=await j.connectReady(),r={passed:false,identity:j.installedIdentity(),inputCadenceMs:350};try{
 await j.resume(c);await j.closeOverlays(c);await s.revealField(c);const at=await c.evaluate('__kalaWarzoneTouch.report().stopAcks');await c.tap('#blocknight-stop');await c.wait('__kalaWarzoneTouch.report().stopAcks>'+at);
 const before=await c.save('paced-box-native-before');r.before=Object.values(before['droid.json']).filter(d=>typeof d==='object'&&Number.isFinite(d.id)).map(d=>({id:d.id,position:d.position,order:d['order/type']}));assert.ok(r.before.every(d=>[0,1].includes(d.order)));
 r.regions=await c.evaluate('__warzoneCommands.report().truckSelection.regions');assert.equal(r.regions.length,5);
 for(const [i,b]of r.regions.entries()){await l.delay(350);assert.equal(await c.evaluate(`__kalaWarzoneTouch.nativeBoxSelect(${b.left},${b.top},${b.right},${b.bottom},${i>0})`),true);}
 const reply=await c.evaluate('__warzoneCommands.send("state",{},{fresh:true})');r.selected=reply.result.selectedUnits;assert.deepEqual(r.selected.map(d=>d.id).sort((a,b)=>a-b),[160001,160003]);
 const after=await c.save('paced-box-native-after');r.after=Object.values(after['droid.json']).filter(d=>typeof d==='object'&&Number.isFinite(d.id)).map(d=>({id:d.id,position:d.position,order:d['order/type']}));assert.deepEqual(r.after,r.before,'same native boxes at safe cadence do not issue orders/move units');l.screen('paced-box-real-highlights');r.passed=true;console.log(JSON.stringify({passed:r.passed,selected:r.selected,units:r.after}));
}catch(e){r.failure=String(e.stack||e);throw e;}finally{await j.pause(c);fs.writeFileSync(path.join(l.out,'paced-box-proof.json'),JSON.stringify(r,null,2));c.close()}})().catch(e=>{console.error(e);process.exitCode=1});
