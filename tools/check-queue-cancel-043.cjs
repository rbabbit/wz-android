'use strict';
// Controlled source/VM checks only: no Android, browser, native engine or emulator.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'scenario/warzone-towers-commands.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'app/src/main/assets/warzone-command-pages.js'),'utf8');
const checks=[];
const fn=name=>{const start=source.indexOf('function '+name+'('),next=source.indexOf('\nfunction ',start+1);assert(start>=0);return source.slice(start,next<0?source.length:next);};
const design={name:'Truck Viper Wheels',body:'Body1REC',propulsion:'wheeled01',turrets:['Spade1Mk1']};
const raw={active:true,nativeQueueEmpty:true,currentName:design.name+' · F11',templateId:501,timeStarted:1000,totalBuildPoints:100,remainingBuildPoints:60,buildPointsPerSecond:5,state:'building'};
const factories={11:{id:11,player:0,status:1,stattype:2,towersProduction:raw},12:{id:12,player:0,status:1,stattype:2,towersProduction:{...raw,templateId:502}}};
const active={'11':{id:'first-0',design:{...design},started:1000},'12':{id:'other-0',design:{...design},started:1000}};
const waiting={'11':[{id:'second-0',design:{...design}},{id:'third-0',design:{...design}}],'12':[{id:'other-1',design:{...design}}]};
const replies=[],nativeCalls=[],started=[];
const ctx=vm.createContext({console,STRUCTURE:1,FACTORY:2,CYBORG_FACTORY:3,VTOL_FACTORY:4,BUILT:1,selectedPlayer:0,gameTime:2500,
 wtcmd_factoryActive:active,wtcmd_production:waiting,
 getObject:(type,player,id)=>player===0?factories[id]:null,
 wtcmd_currentProduction:f=>f.towersProduction.active?{...design,nativeTemplateId:f.towersProduction.templateId}:null,
 wtcmd_answer:(command,ok,reason,result)=>replies.push({ok,reason,result}),
 towersCancelProduction:(factoryId,templateId,timeStarted)=>{nativeCalls.push({factoryId,templateId,timeStarted});factories[factoryId].towersProduction.active=false;return true;},
 enumStruct:()=>Object.values(factories),structureIdle:f=>!f.towersProduction.active,
 wtcmd_capacityWait:()=>null,buildDroid:(f,name)=>{started.push({factoryId:f.id,name});f.towersProduction.active=true;return true;}
});
vm.runInContext(fn('wtcmd_productionObservation')+'\n'+fn('wtcmd_cancelProduction')+'\n'+fn('wtcmd_tickProduction'),ctx);
const cancel=(jobId='first-0',currentId='11:501:1000',factoryId=11)=>ctx.wtcmd_cancelProduction({factoryId,jobId,currentId});
const originalOther=JSON.stringify({active:active['12'],waiting:waiting['12']});
cancel('old-job');assert.equal(replies.at(-1).reason,'production-changed');assert.equal(nativeCalls.length,0);
cancel('first-0','11:999:1000');assert.equal(replies.at(-1).reason,'production-changed');assert.equal(nativeCalls.length,0);
cancel('first-0','11:501:999');assert.equal(replies.at(-1).reason,'production-changed');assert.equal(nativeCalls.length,0);
cancel('first-0','12:501:1000');assert.equal(replies.at(-1).reason,'production-changed');assert.equal(nativeCalls.length,0);
checks.push('Stale job, template, start time and wrong factory identity cannot reach native cancellation');
raw.nativeQueueEmpty=false;cancel();assert.equal(replies.at(-1).reason,'production-changed');assert.equal(nativeCalls.length,0);raw.nativeQueueEmpty=true;
ctx.towersCancelProduction=()=>false;cancel();assert.equal(replies.at(-1).reason,'production-changed');assert.equal(active['11'].id,'first-0');
ctx.towersCancelProduction=(factoryId,templateId,timeStarted)=>{nativeCalls.push({factoryId,templateId,timeStarted});factories[factoryId].towersProduction.active=false;return true;};
checks.push('Unknown native queue or rejected native identity leaves the current job and FIFO intact');
cancel();assert.equal(replies.at(-1).ok,true);assert.equal(replies.at(-1).reason,'production-cancelled');assert.equal(active['11'],undefined);assert.deepEqual(waiting['11'].map(x=>x.id),['second-0','third-0']);assert.equal(nativeCalls.length,1);
assert.equal(JSON.stringify({active:active['12'],waiting:waiting['12']}),originalOther);
ctx.wtcmd_tickProduction();assert.equal(active['11'].id,'second-0');assert.deepEqual(waiting['11'].map(x=>x.id),['third-0']);assert.equal(started.length,1);assert.equal(started[0].factoryId,11);
cancel();assert.equal(replies.at(-1).reason,'production-changed');assert.equal(nativeCalls.length,1);assert.equal(active['11'].id,'second-0');
checks.push('Acknowledged exact cancellation preserves other factories and waiting entries; ordinary FIFO advances and old repeated tap cannot cancel the next unit');
const removeStart=source.indexOf('else if (command.action === "remove-production")'),removeEnd=source.indexOf('else if (command.action === "clear-production")',removeStart);
const remove=vm.runInContext('(function(command){'+source.slice(removeStart,removeEnd).replace(/^else /,'')+'})',ctx);
remove({action:'remove-production',factoryId:11,jobIds:['second-0','third-0']});assert.equal(replies.at(-1).ok,true);assert.equal(active['11'].id,'second-0');assert.equal(waiting['11'].length,0);assert.equal(nativeCalls.length,1);assert.equal(waiting['12'].length,1);
checks.push('Group cancellation removes only exact still-waiting IDs, retaining a promoted unit and other factories');
assert(ui.includes('data-production-cancel-factory=')&&ui.includes('data-production-cancel-current=')&&ui.includes('data-production-cancel-ids='));
assert(ui.includes("currentId?'cancel-production':'remove-production'")&&ui.includes('state.productionCancellations.has(factoryId)')&&ui.includes('requestState();refreshLive();'));
assert(ui.includes('production.map(queueFactoryRow)')&&ui.includes('group.jobs.length>1?productionCancelControl(f,[group.jobs[0]])')&&ui.includes('productionCancelControl(f,group.jobs)'));
new vm.Script(ui);
checks.push('Queue exposes compact current, one-waiting and waiting-group controls with busy guard, acknowledgement and fresh snapshot refresh; UI JavaScript parses');
const native=fs.readFileSync(path.join(root,'archive/native-queue-0.43/quickjs_backend.cpp'),'utf8');
assert(native.includes('cancelProduction(structure, ModeImmediate, false);'));
for(const token of ['engineToInstanceMap.at(ctx)->player() != selectedPlayer','/tmp/warzone-towers-ui-v34','factory.psSubject->multiPlayerID != identity[1]','factory.timeStarted != identity[2]','factory.pendingCount != 0','entry.numRemaining() > 0'])assert(native.includes(token));
checks.push('Compiled native hook source gates Towers/player and exact subject, rejects pending/internal runs, and delegates refunds to existing native cancellation');
const files=['scenario/warzone-towers-commands.js','app/src/main/assets/warzone-command-pages.js','app/src/main/assets/warzone/ui/towers-commands.css','archive/native-queue-0.43/quickjs_backend.cpp'];
const report={version:'0.43',passed:true,emulatorUsed:false,browserUsed:false,androidRuntimeExecuted:false,actualNativeEngineExecuted:false,gameplayVerified:false,
 scope:'Controlled source/VM production cancellation checks only. Native cancellation/refunds are source-inspected and compiled, not executed; no emulator or native runtime.',
 checks,checksPassed:checks.length,sources:files.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')})),recordedUTC:new Date().toISOString()};
fs.writeFileSync(path.join(root,'archive/queue-cancel-0.43-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
