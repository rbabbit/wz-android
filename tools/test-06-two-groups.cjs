'use strict';
// Real authored Dustfall units, real catalogue/radar/world touches. No grants,
// native state edits or script-sent construction orders.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const live=require('./native-live.cjs'),j=require('./lab-journey.cjs'),p=require('./test-05-preview-journey.cjs'),m=require('./test-04-module-journey.cjs');
const {controls}=require('./audit-smooth-building.cjs');
const original=process.argv.includes('--reproduce'),out=live.out;
const r={passed:false,seeded:false,method:'Fresh authored Dustfall; real ADB catalogue, radar and ground/mesh touches. No granted units or world edits.',identity:j.installedIdentity(process.env.WZ_QA_APK),expectedBug:original,orders:[],checks:{}};
const write=()=>fs.writeFileSync(path.join(out,'two-groups.json'),JSON.stringify(r,null,2)+'\n');
const ids=a=>a.slice().sort((x,y)=>x-y);
async function choose(c,item,category='DEFENCES'){await c.tap('#wt-build-sidebar [data-category="'+category+'"]');await c.tap('#wt-sidebar-catalogue [data-build="'+item+'"]');await c.wait('!__warzoneCommands.report().selectingTrucks',20000);}
async function order(c,a,site,workers){
 const before=await c.evaluate('__warzoneCommands.report().history.length'),point=await p.projectTile(c,site.x,site.y);await a.touch(point.x,point.y);
 await c.wait(`__warzoneCommands.report().history.slice(${before}).some(x=>x.action==='queue-build')`,20000);
 const reply=await c.evaluate(`__warzoneCommands.report().history.slice(${before}).find(x=>x.action==='queue-build')`);
 assert.equal(reply.ok,true,JSON.stringify(reply));assert.equal(reply.result.itemId,site.itemId);assert.deepEqual([reply.result.x,reply.result.y],[site.x,site.y]);
 if(workers)assert.deepEqual(ids(reply.result.workers),ids(workers));r.orders.push({site,reply});write();return reply.result;
}
(async()=>{let c;try{
 c=await p.start();r.phoneDesigns=await c.evaluate('BlockNightAndroid.loadDesigns()');const a=await controls(c);
 await a.camera(8,72);await c.tap('#wt-open-build');await choose(c,'GuardTower1');
 r.groupA=await m.fresh(c);assert.deepEqual(ids(r.groupA.selectedUnits.map(t=>t.id)),[160001,160003]);
 const first=await order(c,a,{itemId:'GuardTower1',x:8,y:71},[160001,160003]);live.screen('group-a-first-order');
 await a.camera(28,20);assert.equal(await c.evaluate('__warzoneCommands.report().placement'),'GuardTower1');
 r.beforeB=await m.fresh(c);r.localTruck=r.beforeB.trucks.find(t=>t.id===160005);assert.ok(r.localTruck);
 // Keep the same active catalogue item across the camera move, the reported path.
 const second=await order(c,a,{itemId:'GuardTower1',x:32,y:18},original?null:[160005]);live.screen('group-b-same-item-order');
 if(original){r.reproduced=ids(second.workers).join()===ids(first.workers).join()&&!second.workers.includes(160005);assert.equal(r.reproduced,true,'0.5 sends the old group across the map');r.passed=true;return;}
 r.checks.cameraSelectionRefresh=true;r.checks.truckJobIsolation=true;
 assert.deepEqual((await m.fresh(c)).jobs.find(x=>x.id===first.id)?.workers||first.workers,first.workers,'existing A job retains its original trucks');
 await choose(c,'A0FacMod1','MODULES');await m.group(c,[160005],'local B module');
 const factory=await m.tapParent(c,a,160121,'A0FacMod1','upper','group-b-factory-module',true);r.orders.push({site:{itemId:'A0FacMod1',parentId:160121},reply:factory.reply});write();
 await a.camera(8,72);await choose(c,'A0ResearchModule1','MODULES');await m.group(c,[160001,160003],'local A module after return');
 const lab=await m.tapParent(c,a,160127,'A0ResearchModule1','lower','group-a-research-module',true);r.orders.push({site:{itemId:'A0ResearchModule1',parentId:160127},reply:lab.reply});write();
 r.checks.moduleQueueIsolation=true;
 await m.exitBuild(c);const wanted=r.orders.map(x=>x.reply.result.id);
 await c.wait(`(()=>{const s=__warzoneCommands.report().snapshot;if(!s?.hasHQ)throw Error('HQ lost');return ${JSON.stringify(wanted)}.every(id=>s.finishedBuilds.some(j=>j.id===id));})()`,150000);
 r.final=await c.save('two-groups-native-completed');const structs=Object.values(r.final['struct.json']);
 for(const site of [{x:8,y:71},{x:32,y:18}]){const s=structs.find(s=>s.name==='GuardTower1'&&s.position[0]===(site.x+.5)*128&&s.position[1]===(site.y+.5)*128);assert.equal(s?.currentBuildPts,300);}
 assert.equal(structs.find(s=>s.id===160121)?.modules,1);assert.equal(structs.find(s=>s.id===160127)?.modules,1);
 const done=r.final.commands.snapshot.finishedBuilds;
 for(const group of [[0,3],[1,2]])assert.ok(done.findIndex(x=>x.id===wanted[group[0]])<done.findIndex(x=>x.id===wanted[group[1]]),'each group keeps its own FIFO');
 assert.equal(await c.evaluate('BlockNightAndroid.loadDesigns()'),r.phoneDesigns);r.checks.phoneDesignsPreserved=true;live.screen('independent-groups-completed');r.passed=true;
 }catch(e){r.failure=String(e.stack||e);if(c)try{r.failureState=await c.evaluate('({commands:__warzoneCommands.report(),html:__towersHtml.report()})');r.failureScreen=live.screen('two-groups-failure');}catch(_){}throw e;
 }finally{if(c){try{r.pausedAt=await j.pause(c)}catch(e){r.cleanupFailure=String(e);r.passed=false;}c.close()}r.finished=new Date().toISOString();write();}
})().catch(e=>{console.error(e);process.exitCode=1});
