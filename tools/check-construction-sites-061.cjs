'use strict';
// Real command functions under a bounded native-API fixture. Device gameplay
// and native order/completion evidence are deliberately checked separately.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const old=require('./check-construction-recovery-052.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
const checks=[];
function check(name,body){body();checks.push(name);}
function fixture(mode){
  const f=old.fixture(mode==='campaign');
  if(mode==='campaign'){
    const read=f.c.includeJSON;f.c.includeJSON=name=>name.endsWith('warzone-towers-catalog.json')?f.catalog:read(name);
    vm.runInContext(fs.readFileSync(path.join(old.root,'campaign/commands.js'),'utf8'),f.c);
  }
  f.c.wtcmd_started=true;
  f.catalog.buildings.find(b=>b.id==='Factory').width=3;f.catalog.buildings.find(b=>b.id==='Factory').breadth=3;
  for(const item of [{id:'HQ',name:'HQ',kind:'HQ',width:2,breadth:2},{id:'Cyborg',name:'Cyborg',kind:'CYBORG FACTORY',width:1,breadth:2},{id:'Repair',name:'Repair',kind:'REPAIR FACILITY',width:1,breadth:1}]){
    Object.assign(item,{category:'STRUCTURES',power:100,points:100});f.catalog.buildings.push(item);f.c.wtcmd_buildings[item.id]=item;
  }
  for(const item of f.catalog.buildings)f.c.wtcmd_native[item.id]={group:'Building',value:{BuildPower:100}};
  const blocked=new Set();
  f.c.pickStructLocation=(d,id,x,y)=>blocked.has(id+':'+x+':'+y)?null:{x:x+Math.floor(f.c.wtcmd_buildings[id].width/2),y:y+Math.floor(f.c.wtcmd_buildings[id].breadth/2)};
  const worker=f.truck(10,{x:19,y:18});f.setBuilders([worker]);f.setSelected([worker]);
  return {...f,mode,worker,blocked,plan:(id,x,y,extra={})=>f.dispatch('preview-build',{itemId:id,x,y,workerIds:[10],...extra}),
    queue:(id,x,y,extra={})=>f.dispatch('queue-build',{itemId:id,x,y,workerIds:[10],...extra}),
    retry:job=>f.dispatch('retry-job',{jobId:job.id,workerIds:[10],issuedGameTime:f.c.gameTime,recoveryContext:f.c.wtcmd_recoveryContext})};
}
for(const mode of ['towers','campaign']){
  check(mode+': pending factories reserve native spacing before any foundation exists',()=>{
    const f=fixture(mode),a=f.queue('Factory',25,20);assert.equal(a.ok,true);
    assert.equal(f.plan('Factory',28,20).reason,'site-too-close');
    assert.equal(f.plan('Factory',27,20).reason,'already-queued');
    assert.equal(f.plan('Factory',29,20).ok,true);
    assert.equal(f.queue('Factory',28,20).ok,false);assert.equal(f.c.wtcmd_jobs.length,1);
    assert.equal(f.c.wtcmd_buildReservations().length,1,'Job and its journal reserve once');
    assert.equal(f.orders.length,1);
  });
  check(mode+': original native queue journals reserve footprints and clearance too',()=>{
    const f=fixture(mode);assert.equal(f.dispatch('track-site',{itemId:'Factory',x:25,y:20}).ok,true);
    assert.equal(f.c.wtcmd_jobs.length,0);
    assert.equal(f.plan('Factory',28,20).reason,'site-too-close');
    assert.equal(f.plan('Factory',25,20).reason,'already-queued');
    assert.equal(f.plan('Factory',29,20).ok,true);
  });
  check(mode+': native packability retains contiguous defences and odd/even footprints',()=>{
    const f=fixture(mode);f.queue('Tower',10,10);assert.equal(f.plan('Tower',11,10).ok,true);
    assert.equal(f.plan('Repair',11,10).reason,'site-too-close');
    const g=fixture(mode);g.queue('Factory',20,20);
    assert.equal(g.plan('Cyborg',22,20).reason,'site-too-close');
    assert.equal(g.plan('Cyborg',23,20).ok,true);
    assert.equal(g.plan('HQ',23,20).reason,'site-too-close');
    assert.equal(g.plan('HQ',24,20).ok,true);
    assert.equal(g.plan('Tower',22,20).ok,true,'Defence can touch ordinary base structure');
  });
  check(mode+': cancelled observer reservations release their original site',()=>{
    const f=fixture(mode),a=f.queue('Factory',25,20);f.dispatch('cancel-job',{jobId:a.result.id});
    assert.equal(f.plan('Factory',25,20).ok,true);
    assert.equal(f.dispatch('track-site',{itemId:'Factory',x:25,y:20}).ok,true);
  });
  check(mode+': old close plans keep the earlier head valid and visibly block the later plan',()=>{
    const f=fixture(mode),a=f.job('old-a',{itemId:'Factory',x:25,y:20,status:'queued',created:1}),
      b=f.job('old-b',{itemId:'Factory',x:28,y:20,status:'queued',created:2}),
      c=f.job('old-c',{itemId:'Tower',x:35,y:20,status:'queued',created:3});
    f.add(a);f.add(b);f.add(c);f.c.wtcmd_tickBuildsImpl();
    assert.equal(f.orders[0].x,25,'Later reservation must not block its original earlier head');
    const complete=f.structure(50,{itemId:'Factory',name:'Factory',x:25,y:20,status:2});f.setStructures([complete]);
    f.blocked.add('Factory:27:19');f.worker.order=0;f.c.gameTime+=1500;f.c.wtcmd_tickBuildsImpl();
    assert.equal(a.status,'done');assert.equal(b.status,'blocked');assert.equal(b.reason,'invalid-site');
    assert.equal(f.c.wtcmd_nativeSites.find(j=>j.id==='old-b').status,'blocked');
    assert.deepEqual(clone(f.c.wtcmd_workers[10]),['old-b','old-c']);
    assert.equal(f.retry(b).ok,false);assert.equal(b.reason,'invalid-site');
    assert.equal(f.orders.length,1,'Invalid accepted plan must not issue another native build');
    f.dispatch('cancel-job',{jobId:b.id});f.worker.order=0;f.c.wtcmd_tickBuildsImpl();
    assert.equal(f.orders.at(-1).item,'Tower','Explicit cancellation releases the next original FIFO job');
  });
  check(mode+': old reservations block only later jobs, with a stable reason',()=>{
    const f=fixture(mode),other=f.truck(11,{order:77});f.setBuilders([other,f.worker]);
    const a=f.job('first',{itemId:'Factory',x:25,y:20,status:'queued',created:1,workers:[11]}),
      b=f.job('second',{itemId:'Factory',x:28,y:20,status:'queued',created:2});
    f.add(a);f.add(b);f.c.wtcmd_tickBuildsImpl();
    assert.equal(b.status,'blocked');assert.equal(b.reason,'site-too-close');assert.equal(a.status,'queued');
    f.c.gameTime+=5000;f.c.wtcmd_constructionState();assert.equal(f.c.wtcmd_nativeSites.find(j=>j.id==='second').status,'blocked');
    assert.equal(f.orders.length,0);
  });
  check(mode+': explicit retry retains same-group FIFO and never borrows remote workers',()=>{
    const f=fixture(mode),remote=f.truck(99,{x:80,y:80,order:77});f.setBuilders([f.worker,remote]);
    const a=f.job('retry',{itemId:'Tower',x:25,y:20,status:'blocked',reason:'build-blocked'}),
      b=f.job('next',{itemId:'Tower',x:30,y:20,status:'queued'});f.add(a);f.add(b);
    const before=clone(f.c.wtcmd_workers);f.setSelected([]);assert.equal(f.retry(a).ok,false);assert.deepEqual(clone(f.c.wtcmd_workers),before);
    f.setSelected([f.worker]);const retry=f.retry(a);assert.equal(retry.ok,true,mode+': '+JSON.stringify(retry));
    assert.deepEqual(retry.result.jobIds,['retry']);assert.deepEqual(retry.result.workerIds,[10]);
    assert.deepEqual(clone(f.c.wtcmd_workers[10]),['retry','next']);assert.equal(remote.order,77);
    assert.ok(f.orders.every(o=>o.worker===10));
  });
  check(mode+': native site changes after acceptance block dispatch without deleting plans',()=>{
    const f=fixture(mode),a=f.job('changed',{itemId:'Factory',x:25,y:20,status:'queued'});f.add(a);
    f.blocked.add('Factory:24:19');f.c.wtcmd_tickBuildsImpl();
    assert.equal(a.status,'blocked');assert.equal(a.reason,'invalid-site');assert.equal(f.orders.length,0);
    assert.equal(f.c.wtcmd_jobs.length,1);assert.equal(f.c.wtcmd_workers[10][0],a.id);
  });
}
console.log(JSON.stringify({passed:true,emulatorUsed:false,actualNativeEngineExecuted:false,checksPassed:checks.length,checks},null,2));
