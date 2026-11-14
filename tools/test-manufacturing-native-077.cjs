'use strict';
// Actual script queue/policy functions with a deterministic native API fixture.
// No Android, WASM, network game or emulator is executed by these checks.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const acorn=require('../vendor/multiplayer/native-070/tooling/acorn.cjs');
const root=path.resolve(__dirname,'..'),checks=[];
const files={towers:'scenario/warzone-towers-commands.js',ffa:'scenario/ffa/commands.js',campaign:'campaign/commands.js',multiplayer:'app/src/main/assets/multiplayer/mobile-ui-runtime.js'};
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),clone=v=>JSON.parse(JSON.stringify(v));
const check=(name,fn)=>{fn();checks.push(name);};
function fixture(mode){
 const factories=new Map(),units=[],logs=[],starts=[],cancels=[],queuedTimers=[];let serial=0,revision=0,input=null,accepted=true,nativeCancel=true;
 const templates=[{id:'gun',name:'Cannon Viper Wheels',body:'Body1',propulsion:'Wheels',weapons:['Cannon1'],droidType:1,cost:100,points:100},
  {id:'truck',name:'Truck Viper Wheels',body:'Body1',propulsion:'Wheels',construct:'Spade1Mk1',weapons:[],droidType:2,cost:62,points:100},
  {id:'cyborg',name:'Machinegunner',body:'CyborgLightBody',propulsion:'CyborgLegs',weapons:['CyborgMG'],droidType:1,cost:40,points:50}];
 const c={console,Date,selectedPlayer:0,gameTime:50000,STRUCTURE:1,DROID:2,BUILT:1,FACTORY:1,CYBORG_FACTORY:2,VTOL_FACTORY:3,DROID_ANY:0,DROID_CONSTRUCT:2,DROID_COMMAND:3,
  namespace(){},includeJSON(name){if(name.endsWith('warzone-towers-command.json'))return input;return{buildings:[],components:{}};},
  queue(name,delay){queuedTimers.push({name,delay});},setTimer(){},hideInterface(){},showInterface(){},showReticuleWidget(){},
  dump(text){if(text.startsWith('WTCMD:'))logs.push(JSON.parse(text.slice(6)));},
  getObject(type,player,id){const f=factories.get(id);return f&&f.player===player?f:null;},
  enumStruct(player,type){return Array.from(factories.values()).filter(f=>f.player===player&&(type===undefined||f.stattype===type));},
  enumTemplates(){return templates;},componentAvailable(id){return id!=='Unavailable';},
  structureIdle:f=>f.idle,getDroidProduction:f=>f.subject||null,
  getDroidLimit(player,type){return type===2?3:8;},enumDroid(){return units;},
  buildDroid(f,name,body,propulsion,_reserved,_unused,...turrets){
   starts.push({factoryId:f.id,name,body,propulsion,turrets:clone(turrets),accepted});if(!accepted)return false;
   const truck=turrets.includes('Spade1Mk1'),subject={name,body,propulsion,weapons:truck?[]:turrets,construct:truck?'Spade1Mk1':undefined,droidType:truck?2:1};
   const templateId=++serial;f.subject=subject;f.idle=false;
   f.towersProduction={active:true,nativeQueueEmpty:true,templateId,timeStarted:c.gameTime,currentName:name,
    subjectDesign:{...subject,templateId},totalBuildPoints:100,remainingBuildPoints:100,buildPointsPerSecond:10,state:'building'};return true;
  },
  towersCancelProduction(factoryId,templateId,timeStarted){
   const f=factories.get(factoryId),raw=f?.towersProduction;
   cancels.push({factoryId,templateId,timeStarted});if(!nativeCancel||!raw?.active||raw.templateId!==templateId||raw.timeStarted!==timeStarted)return false;
   f.idle=true;f.subject=null;f.towersProduction={active:false,nativeQueueEmpty:true};return true;
  },
  ffaPartAllowed:()=>true,ffaDesignAllowed:d=>d&&d.propulsion!=='V-Tol',ffaOutcome:'',ffaSetTimer(){}
 };
 vm.createContext(c);vm.runInContext(read(files[mode]),c,{filename:files[mode]});
 c.wtcmd_started=true;
 for(const id of ['Body1','Wheels','Cannon1','Spade1Mk1','CyborgLightBody','CyborgLegs','CyborgMG'])c.wtcmd_native[id]={value:{Size:0}};
 c.wtcmd_components.Wheels={propulsionType:'Wheeled'};c.wtcmd_components.CyborgLegs={propulsionType:'Legged'};
 const factory=(id=10,type=1,player=0)=>{const f={id,player,stattype:type,status:1,idle:true,modules:0,towersProduction:{active:false,nativeQueueEmpty:true}};factories.set(id,f);return f;};
 const first=factory(),other=factory(20);
 const send=(action,values={},nonce)=>{
  input={revision:'fixture-'+(++revision),commands:[{action,nonce:nonce||'cmd-'+revision,...values}]};
  c.wtcmd_poll();return logs.at(-1);
 };
 const finish=(f=first)=>{
  assert.ok(f.subject,'Fixture must have a real in-progress native subject before completion');
  const d={id:1000+(++serial),player:f.player};f.idle=true;f.subject=null;f.towersProduction={active:false,nativeQueueEmpty:true};
  c.gameTime+=2000;c.wtcmd_eventDroidBuilt(d,f);return d;
 };
 return{c,factories,first,other,templates,units,logs,starts,cancels,queuedTimers,factory,send,finish,
  accept:value=>accepted=value,cancelAccept:value=>nativeCancel=value,tick(){c.gameTime+=2000;c.wtcmd_tickProduction();},
  policy:f=>clone(c.wtcmd_productionRepeatState(f||first)),save(){return clone(Object.fromEntries(['wtcmd_productionRepeats','wtcmd_productionRepeatPlayer','wtcmd_production','wtcmd_factoryActive','wtcmd_serial','wtcmd_replies','wtcmd_replyOrder'].map(k=>[k,c[k]])));}};
}
for(const mode of Object.keys(files)){
 check(mode+': finite manufacturing preserves batch/FIFO validation and starts only explicitly requested units',()=>{
  const f=fixture(mode);let r=f.send('queue-production',{factoryId:10,templateId:'gun',count:1,repeat:false});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.result.repeat.enabled,false);assert.equal(f.starts.length,1);
  f.finish();f.tick();assert.equal(f.starts.length,1);assert.equal(f.c.wtcmd_production['10'].length,0);
  r=f.send('queue-production',{factoryId:10,templateId:'gun',count:2});assert.equal(r.ok,true);assert.equal(f.c.wtcmd_production['10'].length,1);
  f.finish();f.tick();assert.equal(f.starts.length,3);f.finish();f.tick();assert.equal(f.starts.length,3);
  for(const count of [0,-1,21,1.5]){const before=f.starts.length;const response=f.send('queue-production',{factoryId:10,templateId:'gun',count});
   if(count===0)assert.equal(response.ok,true,'Retain legacy count0->1 normalization');else assert.equal(response.ok,false);assert.equal(f.starts.length,before+(count===0?1:0));}
 });
 check(mode+': repeat schedules one native continuation after each completion without an unbounded waiting queue',()=>{
  const f=fixture(mode),r=f.send('queue-production',{factoryId:10,templateId:'gun',count:1,repeat:true});assert.equal(r.ok,true);assert.equal(r.result.repeat.enabled,true);assert.equal(r.result.repeat.design.body,'Body1');
  for(let i=0;i<12;i++){assert.equal(f.c.wtcmd_production['10'].length,0);const old=f.c.wtcmd_factoryActive['10'].id;f.finish();f.tick();assert.notEqual(f.c.wtcmd_factoryActive['10'].id,old);}
  assert.equal(f.starts.length,13);assert.equal(f.policy().enabled,true);assert.equal(f.c.wtcmd_finishedUnits.length,12);
 });
 check(mode+': power/constructor/capacity waits and native rejection do not bypass ordinary engine authority',()=>{
  const f=fixture(mode);for(let i=0;i<3;i++)f.units.push({type:2,player:0,droidType:2});
  let r=f.send('queue-production',{factoryId:10,templateId:'truck',count:1,repeat:true});assert.equal(r.ok,true);assert.equal(f.starts.length,0);assert.equal(f.c.wtcmd_production['10'].length,1);assert.equal(f.c.wtcmd_production['10'][0].status,'waiting');
  for(let i=0;i<20;i++)f.tick();assert.equal(f.starts.length,0);assert.equal(f.c.wtcmd_production['10'].length,1);
  f.units.pop();f.tick();assert.equal(f.starts.length,1);f.first.towersProduction.state='waiting-power';f.first.towersProduction.remainingBuildPoints=80;
  for(let i=0;i<8;i++)f.tick();assert.equal(f.starts.length,1,'A native power wait cannot manufacture another subject');
  f.finish();f.accept(false);f.tick();assert.equal(f.c.wtcmd_production['10'].length,1);assert.equal(f.c.wtcmd_production['10'][0].status,'blocked');
  const attempts=f.starts.length;for(let i=0;i<8;i++)f.tick();assert.equal(f.starts.length,attempts,'A blocked native rejection is not retried every tick');
 });
 check(mode+': repeat OFF retains the current unit and explicit FIFO but removes automatic unstarted continuations',()=>{
  const f=fixture(mode);f.send('queue-production',{factoryId:10,templateId:'gun',count:1,repeat:true});
  let r=f.send('set-production-repeat',{factoryId:10,enabled:false,templateId:'gun'});assert.equal(r.ok,true);assert.equal(r.result.enabled,false);assert.equal(f.cancels.length,0);
  f.finish();f.tick();assert.equal(f.starts.length,1);
  f.send('queue-production',{factoryId:10,templateId:'truck',count:1,repeat:true});f.finish();for(let i=0;i<3;i++)f.units.push({type:2,player:0,droidType:2});f.tick();
  assert.equal(f.c.wtcmd_production['10'][0].repeat,true);r=f.send('set-production-repeat',{factoryId:10,enabled:false});assert.equal(r.ok,true);assert.equal(f.c.wtcmd_production['10'].length,0);
  f.units.length=0;f.tick();assert.equal(f.starts.length,2);
 });
 check(mode+': live repeat toggles require an actual matching plan; idle toggles cannot create a unit',()=>{
  const f=fixture(mode);let r=f.send('set-production-repeat',{factoryId:10,enabled:true,templateId:'gun'});assert.equal(r.ok,false);assert.equal(f.starts.length,0);assert.equal(f.policy().enabled,false);
  f.send('queue-production',{factoryId:10,templateId:'gun',count:1,repeat:false});r=f.send('set-production-repeat',{factoryId:10,enabled:true,templateId:'gun'});assert.equal(r.ok,true);assert.equal(r.result.enabled,true);
  r=f.send('set-production-repeat',{factoryId:10,enabled:false,templateId:'truck'});assert.equal(r.ok,false);assert.equal(f.policy().enabled,true,'A stale different-design toggle cannot disable the current policy');
  r=f.send('set-production-repeat',{factoryId:10,enabled:true,templateId:'truck'});assert.equal(r.ok,false);assert.equal(f.starts.length,1);
 });
 check(mode+': one STOP atomically cancels native current, clears all waiting/repeat and leaves other factories unchanged',()=>{
  const f=fixture(mode);f.send('queue-production',{factoryId:10,templateId:'gun',count:3,repeat:true});f.send('queue-production',{factoryId:20,templateId:'truck',count:2,repeat:true});
  const otherBefore=clone({active:f.c.wtcmd_factoryActive['20'],queue:f.c.wtcmd_production['20'],policy:f.policy(f.other)});
  const r=f.send('stop-production',{factoryId:10});assert.equal(r.ok,true);assert.equal(r.result.currentCancelled,1);assert.equal(r.result.waitingCancelled,2);assert.equal(r.result.removedJobIds.length,2);
  assert.equal(f.cancels.length,1);assert.equal(f.first.idle,true);assert.equal(f.policy().enabled,false);assert.equal(f.c.wtcmd_production['10'].length,0);assert.equal(f.c.wtcmd_factoryActive['10'],undefined);
  f.tick();assert.equal(f.starts.filter(s=>s.factoryId===10).length,1);
  assert.deepEqual(clone({active:f.c.wtcmd_factoryActive['20'],queue:f.c.wtcmd_production['20'],policy:f.policy(f.other)}),otherBefore);
  const again=f.send('stop-production',{factoryId:10});assert.equal(again.ok,true);assert.equal(again.result.currentCancelled,0);assert.equal(again.result.waitingCancelled,0);
 });
 check(mode+': STOP failures preserve queue/policy and cannot acknowledge a false native cancellation',()=>{
  const f=fixture(mode);f.send('queue-production',{factoryId:10,templateId:'gun',count:2,repeat:true});const before=f.save();f.cancelAccept(false);
  let r=f.send('stop-production',{factoryId:10});assert.equal(r.ok,false);assert.equal(r.reason,'production-changed');assert.deepEqual(clone(f.c.wtcmd_production),before.wtcmd_production);assert.equal(f.policy().enabled,true);assert.ok(f.c.wtcmd_factoryActive['10']);
  f.first.towersProduction.nativeQueueEmpty=false;r=f.send('stop-production',{factoryId:10});assert.equal(r.ok,false);assert.equal(r.reason,'production-unavailable');assert.equal(f.policy().enabled,true);
 });
 check(mode+': repeat identity survives script save/load but clears on new level, destruction, ownership or player change',()=>{
  const f=fixture(mode);f.send('queue-production',{factoryId:10,templateId:'gun',count:1,repeat:true});const saved=f.save(),restored=fixture(mode);
  Object.assign(restored.c,clone(saved));Object.assign(restored.first,clone(f.first));restored.c.wtcmd_eventGameLoaded();assert.equal(restored.policy().enabled,true);
  restored.finish();restored.tick();assert.equal(restored.starts.length,1,'Restored repeat resumes after the saved current subject completes');
  restored.c.wtcmd_eventStartLevel();assert.equal(restored.policy().enabled,false);
  f.first.player=1;f.tick();assert.equal(f.policy().enabled,false);f.first.player=0;f.tick();assert.equal(f.policy().enabled,false,'Returning ownership does not resurrect repeat');
  f.send('set-production-repeat',{factoryId:10,enabled:true,templateId:'gun'});f.factories.delete(10);f.tick();assert.equal(Object.keys(f.c.wtcmd_productionRepeats).length,0);
  const p=fixture(mode);p.send('queue-production',{factoryId:10,templateId:'gun',count:1,repeat:true});p.c.selectedPlayer=1;p.tick();assert.equal(Object.keys(p.c.wtcmd_productionRepeats).length,0);
 });
 check(mode+': duplicate command nonces never restart manufacture or repeat a completed STOP',()=>{
  const f=fixture(mode);const start=f.send('queue-production',{factoryId:10,templateId:'gun',count:1,repeat:true},'same-start');
  assert.equal(f.send('queue-production',{factoryId:10,templateId:'gun',count:1,repeat:true},'same-start').nonce,start.nonce);assert.equal(f.starts.length,1);
  const stop=f.send('stop-production',{factoryId:10},'same-stop');assert.equal(stop.ok,true);f.send('stop-production',{factoryId:10},'same-stop');assert.equal(f.cancels.length,1);
 });
 check(mode+': ownership, factory compatibility, invalid repeat values and 64-job cap stay enforced',()=>{
  const f=fixture(mode);f.factory(30,1,1);assert.equal(f.send('queue-production',{factoryId:30,templateId:'gun',repeat:true}).ok,false);
  assert.equal(f.send('stop-production',{factoryId:30}).ok,false);assert.equal(f.send('set-production-repeat',{factoryId:30,enabled:true}).ok,false);
  for(const id of [-1,10.5,4294967296,'bad']){assert.equal(f.send('stop-production',{factoryId:id}).ok,false);assert.equal(f.send('set-production-repeat',{factoryId:id,enabled:true}).ok,false);}
  assert.equal(f.send('queue-production',{factoryId:10,templateId:'cyborg',repeat:true}).ok,false);
  assert.equal(f.send('queue-production',{factoryId:10,templateId:'gun',repeat:'true'}).ok,false);assert.equal(f.send('set-production-repeat',{factoryId:10,enabled:1}).ok,false);
  f.first.idle=false;f.c.wtcmd_production['10']=Array.from({length:64},(_,i)=>({id:'old-'+i,design:{name:'old'},status:'queued'}));
  assert.equal(f.send('queue-production',{factoryId:10,templateId:'gun',repeat:true}).reason,'queue-full');assert.equal(f.policy().enabled,false);assert.equal(f.c.wtcmd_production['10'].length,64);
 });
}
check('all four mode snapshots expose authoritative per-factory repeat alongside native subject/progress',()=>{
 for(const [mode,file]of Object.entries(files)){
  const source=read(file),ast=acorn.parse(source,{ecmaVersion:'latest'}),fn=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='wtcmd_snapshot');
  assert.ok(fn,mode);assert.match(source.slice(fn.start,fn.end),/repeat:\s*wtcmd_productionRepeatState\(s\)/);
 }
});
check('Multiplayer native completion observation continues repeat even without a synchronized script event callback',()=>{
 const f=fixture('multiplayer');f.send('queue-production',{factoryId:10,templateId:'gun',count:1,repeat:true});
 const previous=f.c.wtcmd_factoryActive['10'];f.first.idle=true;f.first.subject=null;f.first.towersProduction={active:false,nativeQueueEmpty:true};
 f.tick();assert.equal(previous.status,'done');assert.equal(f.starts.length,2);assert.notEqual(f.c.wtcmd_factoryActive['10'].id,previous.id);
 assert.equal(f.c.wtcmd_production['10'].length,0);
});
check('one STOP also clears an idle capacity-blocked continuation without issuing a native refund/cancel',()=>{
 const f=fixture('towers');for(let i=0;i<8;i++)f.units.push({type:2,player:0,droidType:1});
 f.send('queue-production',{factoryId:10,templateId:'gun',count:1,repeat:true});assert.equal(f.starts.length,0);
 const r=f.send('stop-production',{factoryId:10});assert.equal(r.ok,true);assert.equal(r.result.waitingCancelled,1);assert.equal(r.result.currentCancelled,0);assert.equal(f.cancels.length,0);
 f.units.length=0;f.tick();assert.equal(f.starts.length,0);assert.equal(f.policy().enabled,false);
});
check('Towers/Campaign production implementations match and FFA keeps its original no-air/end-of-match policy',()=>{
 const functions=file=>{const s=read(file);return Object.fromEntries(acorn.parse(s,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,s.slice(n.start,n.end).replace(/\r\n/g,'\n')]));};
 const a=functions(files.towers),b=functions(files.campaign);
 for(const name of ['wtcmd_productionDesignKey','wtcmd_reconcileProductionRepeats','wtcmd_productionRepeatState','wtcmd_setProductionRepeatPlan','wtcmd_resolveProductionDesign','wtcmd_setProductionRepeat','wtcmd_stopProduction','wtcmd_queueProduction','wtcmd_tickProduction'])assert.equal(a[name],b[name],name);
 const f=fixture('ffa');f.c.ffaOutcome='defeat';f.send('queue-production',{factoryId:10,templateId:'gun',count:1,repeat:true});assert.equal(f.starts.length,0);
 assert.ok(read(files.ffa).endsWith(read('scenario/ffa/command-policy.js').replace(/\r\n/g,'\n')));
});
cp.execFileSync(process.execPath,[path.join(__dirname,'compose-manufacturing-077.cjs'),'--check'],{cwd:root,stdio:'pipe'});
const inputs=[...Object.values(files),'scenario/ffa/command-policy.js','campaign/mobile-events.js','campaign/research-bridge.js','tools/compose-manufacturing-077.cjs','tools/compose-multiplayer-ui-077.cjs','tools/test-manufacturing-native-077.cjs'];
const report={version:'0.77',passed:true,emulatorUsed:false,actualNativeEngineExecuted:false,
 scope:'Actual four-mode command/policy functions and synthetic native API lifecycle, limits, save-state, cancellation and FIFO fixtures; no Android/WASM/network gameplay execution.',
 checksPassed:checks.length,checks,sources:inputs.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}))};
fs.mkdirSync(path.join(root,'qa/manufacturing-clean-077'),{recursive:true});fs.writeFileSync(path.join(root,'qa/manufacturing-clean-077/native.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,checksPassed:checks.length,emulatorUsed:false,actualNativeEngineExecuted:false,report:'qa/manufacturing-clean-077/native.json'}));
