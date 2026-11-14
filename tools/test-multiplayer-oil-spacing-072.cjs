'use strict';
// Execute the actual generated MP adapter against bounded native-API fixtures.
// These checks do not run the native engine, emulator, pathfinding or a server.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const old=require('./check-construction-recovery-052.cjs');
const root=path.resolve(__dirname,'..'),runtimePath='app/src/main/assets/multiplayer/mobile-ui-runtime.js';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const runtime=read(runtimePath),catalog=JSON.parse(read('app/src/main/assets/warzone/command-catalog.json'));
const OIL='A0ResourceExtractor',FACTORY='A0LightFactory',LAB='A0ResearchFacility';
const checks=[];function check(name,body){body();checks.push(name);}
function fixture(){
 const f=old.fixture(),load=f.c.includeJSON,oil=new Set(),terrain=new Map(),pickCalls=[];
 let denied=false,moved=false;
 f.c.includeJSON=name=>name==='warzone-towers-catalog.json'?catalog:load(name);
 vm.runInContext(runtime,f.c,{filename:runtimePath});
 f.c.wtcmd_started=true;
 for(const b of catalog.buildings)f.c.wtcmd_native[b.id]={group:'Building',value:{BuildPower:b.power}};
 const worker=f.truck(10,{x:8,y:8});f.setBuilders([worker]);f.setSelected([worker]);
 f.c.terrainType=(x,y)=>terrain.get(x+':'+y)||0;
 f.c.pickStructLocation=(d,id,left,top)=>{
  pickCalls.push({id,left,top});
  const b=f.c.wtcmd_buildings[id],x=left+Math.floor(b.width/2),y=top+Math.floor(b.breadth/2);
  if(denied||id===OIL&&!oil.has(x+':'+y))return null;
  return {x:x+(moved?1:0),y};
 };
 return {...f,worker,oil,terrain,pickCalls,
  plan:(id,x,y)=>f.dispatch('preview-build',{itemId:id,x,y,workerIds:[10]}),
  queue:(id,x,y)=>f.dispatch('queue-build',{itemId:id,x,y,workerIds:[10]}),
  denyNative:value=>{denied=value;},moveNative:value=>{moved=value;},
  tick:()=>f.c.wtcmd_tickBuilds(),
  at:(x,y,extra={})=>f.job('oil-'+x+'-'+y,{itemId:OIL,x,y,status:'queued',...extra})};
}
check('Only the MP tooClose function changes relative to the retained 070 compositor',()=>{
 let historical='';
 const output=path.join(root,runtimePath);
 const intercepted=Object.create(fs);
 intercepted.writeFileSync=(file,data)=>{assert.equal(path.resolve(file),output);historical=String(data);};
 vm.runInNewContext(read('tools/compose-multiplayer-ui-070.cjs'),{
  require:id=>id==='fs'?intercepted:id==='acorn'?require('../vendor/multiplayer/native-070/tooling/acorn.cjs'):require(id),
  __dirname:path.join(root,'tools'),process:{argv:[]},console:{log(){}},Buffer
 },{filename:'historical-compositor-read-only'});
 const change='    if(aw.kind==="RESOURCE EXTRACTOR")return gap<0;\n';
 assert.equal(runtime.split(change).length,2);
 assert.equal(runtime.replace(change,''),historical,'No queue, simulation, protocol or other runtime edits');
 assert.equal(crypto.createHash('sha256').update(historical).digest('hex'),
  '1412e48843d2ccbac32852869ec81c2c8abecdaea046232082bdc8b61a2627b2');
});
check('The previous real queue predicate reproduces adjacent-oil rejection',()=>{
 const f=fixture(),a=f.at(20,20),b=f.at(21,20);
 const original=read('scenario/warzone-towers-commands.js');
 const start=original.indexOf('function wtcmd_tooClose('),end=original.indexOf('\nfunction wtcmd_buildReservations',start);
 vm.runInContext(original.slice(start,end),f.c);
 assert.equal(f.c.wtcmd_tooClose(b,a),true);
});
check('Sixteen dense adjacent oil jobs retain FIFO, distinct reservations and ordinary native dispatch',()=>{
 const f=fixture();for(let x=20;x<24;x++)for(let y=20;y<24;y++)f.oil.add(x+':'+y);
 for(let x=20;x<24;x++)for(let y=20;y<24;y++)assert.equal(f.queue(OIL,x,y).ok,true);
 assert.equal(f.c.wtcmd_jobs.length,16);assert.equal(f.c.wtcmd_buildReservations().length,16);
 assert.equal(f.orders.length,1);assert.equal(f.orders[0].item,OIL);assert.equal(f.orders[0].order,f.c.DORDER_BUILD);
 assert.equal(f.orders[0].x,20);assert.equal(f.orders[0].y,20);
 assert.deepEqual(old.clone(f.c.wtcmd_workers[10]),old.clone(f.c.wtcmd_jobs.map(j=>j.id)));
});
check('Adjacent oil respects both app queued/working jobs and native-only queued/building journals',()=>{
 for(const status of ['queued','working']){
  const f=fixture();f.oil.add('21:20');f.add(f.at(20,20,{status}));
  assert.equal(f.plan(OIL,21,20).ok,true,status);
 }
 for(const status of ['queued','building']){
  const f=fixture();f.oil.add('21:20');f.c.wtcmd_nativeSites=[f.at(20,20,{status})];
  assert.equal(f.plan(OIL,21,20).ok,true,status);
  assert.equal(f.plan(OIL,20,20).reason,'already-queued');
 }
});
check('Built and unfinished adjacent derricks defer to native placement; same unfinished derrick receives HELPBUILD',()=>{
 for(const status of [1,2]){
  const f=fixture();f.oil.add('21:20');
  f.setStructures([f.structure(50,{itemId:OIL,name:'Oil Derrick',x:20,y:20,status})]);
  assert.equal(f.plan(OIL,21,20).ok,true);assert.equal(f.pickCalls.length,1);
 }
 const f=fixture(),foundation=f.structure(50,{itemId:OIL,name:'Oil Derrick',x:20,y:20,status:1});
 f.setStructures([foundation]);assert.equal(f.queue(OIL,20,20).ok,true);
 assert.equal(f.orders[0].order,f.c.DORDER_HELPBUILD);assert.equal(f.orders[0].target,50);
});
check('Same-tile duplicates and overlapping different footprints remain rejected before native dispatch',()=>{
 const f=fixture();f.oil.add('20:20');assert.equal(f.queue(OIL,20,20).ok,true);
 assert.equal(f.plan(OIL,20,20).reason,'already-queued');assert.equal(f.c.wtcmd_jobs.length,1);
 const g=fixture();g.add(g.at(20,20,{itemId:FACTORY}));g.oil.add('21:20');
 assert.equal(g.plan(OIL,21,20).reason,'already-queued');assert.equal(g.orders.length,0);
 const h=fixture();h.setStructures([h.structure(50,{itemId:OIL,x:20,y:20,status:2})]);
 assert.equal(h.plan(OIL,20,20).reason,'occupied');
});
check('Ordinary factory/lab spacing is unchanged; the oil exception is directional',()=>{
 const f=fixture();f.add(f.at(20,20,{itemId:FACTORY}));
 assert.equal(f.plan(FACTORY,23,20).reason,'site-too-close');
 assert.equal(f.plan(FACTORY,24,20).ok,true);
 assert.equal(f.plan(LAB,23,20).reason,'site-too-close');
 f.oil.add('22:20');assert.equal(f.plan(OIL,22,20).ok,true,'Oil candidate may touch a normal reservation');
 const g=fixture();g.add(g.at(22,20));assert.equal(g.plan(FACTORY,20,20).reason,'site-too-close');
});
check('Earlier-only reservation validation preserves the original first job and later dense oil jobs',()=>{
 const f=fixture(),a=f.at(20,20,{created:1}),b=f.at(21,20,{created:2});f.add(a);f.add(b);
 assert.equal(f.c.wtcmd_reservationError(a,true),'');assert.equal(f.c.wtcmd_reservationError(b,true),'');
 f.oil.add('20:20');f.oil.add('21:20');f.tick();assert.equal(a.status,'working');
 f.setStructures([f.structure(50,{itemId:OIL,x:20,y:20,status:2})]);
 f.worker.order=0;f.c.gameTime+=1500;f.tick();
 assert.equal(a.status,'done');assert.equal(b.status,'working');assert.equal(f.orders[1].x,21);
});
check('Cancelled/done/interrupted native journals release oil reservations',()=>{
 for(const status of ['done','cancelled','interrupted']){
  const f=fixture();f.oil.add('20:20');f.c.wtcmd_nativeSites=[f.at(20,20,{status})];
  assert.equal(f.plan(OIL,20,20).ok,true,status);
 }
});
check('No oil, native invalid result and relocated native result all remain invalid-site',()=>{
 const f=fixture();assert.equal(f.plan(OIL,20,20).reason,'invalid-site');
 f.oil.add('20:20');f.denyNative(true);assert.equal(f.plan(OIL,20,20).reason,'invalid-site');
 f.denyNative(false);f.moveNative(true);assert.equal(f.plan(OIL,20,20).reason,'invalid-site');
 assert.equal(f.orders.length,0);
});
check('Unreachable, water/cliff and out-of-map sites still cannot issue construction orders',()=>{
 const f=fixture();f.oil.add('20:20');f.worker.unreachable=true;
 assert.equal(f.plan(OIL,20,20).reason,'unreachable');
 assert.equal(f.c.wtcmd_buildSiteError(f.at(20,20),[f.worker],false),'construction-unreachable');
 f.worker.unreachable=false;
 for(const kind of [f.c.TER_WATER,f.c.TER_CLIFFFACE]){
  f.terrain.set('20:20',kind);assert.equal(f.plan(OIL,20,20).reason,'invalid-site');
 }
 f.terrain.clear();assert.equal(f.plan(OIL,128,20).reason,'invalid');
 assert.equal(f.c.wtcmd_buildSiteError(f.at(-1,20),[f.worker],false),'invalid-site');
 assert.equal(f.orders.length,0);
});
check('A native site change after acceptance blocks dispatch without deleting/reordering the oil FIFO',()=>{
 const f=fixture();f.oil.add('20:20');f.oil.add('21:20');f.worker.order=77;
 assert.equal(f.queue(OIL,20,20).ok,true);assert.equal(f.queue(OIL,21,20).ok,true);
 f.denyNative(true);f.worker.order=0;f.tick();
 assert.equal(f.c.wtcmd_jobs[0].reason,'invalid-site');assert.equal(f.c.wtcmd_jobs[0].status,'blocked');
 assert.equal(f.c.wtcmd_jobs.length,2);assert.equal(f.c.wtcmd_workers[10].length,2);assert.equal(f.orders.length,0);
});
check('Ordinary native order rejection is retained as engine-rejected',()=>{
 const f=fixture();f.oil.add('20:20');let attempts=0;
 f.c.orderDroidBuild=()=>{attempts++;return false;};
 assert.equal(f.queue(OIL,20,20).ok,true);
 assert.equal(attempts,1);assert.equal(f.c.wtcmd_jobs[0].status,'blocked');
 assert.equal(f.c.wtcmd_jobs[0].reason,'engine-rejected');
});
check('Shared scenario, historical 070/071 tools/proofs and matching native JS/WASM/data remain byte-identical',()=>{
 const baseline=JSON.parse(read('qa/multiplayer-072/oil-preservation-baseline.json'));
 for(const [p,record] of Object.entries(baseline.files)){
  assert.equal(fs.statSync(path.join(root,p)).size,record.bytes,p);assert.equal(sha(p),record.sha256,p);
 }
 assert.ok(Object.keys(baseline.files).length>=376);
});
const inputs=[runtimePath,'tools/compose-multiplayer-ui-072.cjs','tools/test-multiplayer-oil-spacing-072.cjs',
 'scenario/warzone-towers-commands.js','app/src/main/assets/warzone/command-catalog.json'];
const report={version:'0.72',passed:true,emulatorUsed:false,actualNativeEngineExecuted:false,
 gameplayVerified:false,scope:'Actual generated Multiplayer queue functions with synthetic native APIs; no native gameplay claim',
 checksPassed:checks.length,checks,sources:inputs.map(p=>({path:p,sha256:sha(p)})),
 preservedFiles:Object.keys(JSON.parse(read('qa/multiplayer-072/oil-preservation-baseline.json')).files).length};
fs.writeFileSync(path.join(root,'qa/multiplayer-072/oil-spacing-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,checksPassed:checks.length,emulatorUsed:false,actualNativeEngineExecuted:false,
 report:'qa/multiplayer-072/oil-spacing-checks.json'}));
