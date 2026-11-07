'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
// Reuse the real bridge VM fixture without executing its unrelated journeys.
const harness=fs.readFileSync(path.join(__dirname,'test-command-bridge.cjs'),'utf8');
const setup=vm.runInNewContext(harness.slice(0,harness.indexOf('const defence='))+'\nsetup;',{
 require,__dirname,console
});
const copy=value=>JSON.parse(JSON.stringify(value));
function structure(t,id,stattype,props={}){
 const data={8:['A0ResearchFacility','Research Facility'],9:['A0PowerGenerator','Power Generator'],4:['A0LightFactory','Factory'],6:['A0VTolFactory1','VTOL Factory']};
 const [itemId,name]=data[stattype]||['A0CyborgFactory','Cyborg Factory'];
 const s={id,player:0,type:1,stattype,itemId,name,x:12,y:13,z:3,status:1,modules:0,health:100,...props};
 t.structures.push(s);return s;
}
const state=t=>t.send('state').result;
const target=(t,id)=>state(t).moduleTargets.find(s=>s.id===id);
const command=(itemId,parentId,workerIds=[1],props={})=>({itemId,parentId,workerIds,...props});
function assertNoMutation(t,run){
 const before=JSON.stringify({calls:t.calls,jobs:t.c.wtcmd_jobs,workers:t.c.wtcmd_workers,droids:t.droids,production:t.c.wtcmd_production});
 const result=run();
 assert.equal(JSON.stringify({calls:t.calls,jobs:t.c.wtcmd_jobs,workers:t.c.wtcmd_workers,droids:t.droids,production:t.c.wtcmd_production}),before,'target validation never changes orders, positions, queues or production');
 return result;
}
{
 const t=setup();structure(t,101,6);t.unavailable.add('A0LightFactory');t.c.getStructureLimit=()=>1;
 assert.equal(state(t).nativeBuildOptions.includes('A0FacMod1'),true,'an own VTOL-only factory still offers its supported module');
 t.structures[0].modules=2;
 assert.equal(state(t).nativeBuildOptions.includes('A0FacMod1'),false,'fully used VTOL-only capacity respects native limits and locked ordinary factories');
}
{
 const t=setup();structure(t,101,8);structure(t,102,9,{modules:1});structure(t,103,4,{status:0});structure(t,104,6,{modules:1});
 structure(t,105,8,{player:1});structure(t,106,5);
 const rows=state(t).moduleTargets;
 assert.deepEqual(copy(rows.map(s=>s.id)),[101,102,103,104],'only own compatible native structure types are exposed');
 const research=rows[0];
 assert.deepEqual(copy([research.itemId,research.name,research.kind,research.moduleId,research.x,research.y,research.z,research.width,research.breadth,research.maximum]),
 ['A0ResearchFacility','Research Facility','RESEARCH','A0ResearchModule1',12,13,3,2,2,1]);
 assert.equal(research.status,'eligible');assert.equal(research.eligible,true);assert.equal(research.nativeStatus,1);
 assert.equal(rows[1].status,'full');assert.equal(rows[1].statusReason,'module-limit');assert.equal(rows[1].eligible,false);
 assert.equal(rows[2].status,'unfinished');assert.equal(rows[2].statusReason,'module-parent');
 assert.equal(rows[3].maximum,2);assert.equal(rows[3].moduleId,'A0FacMod1');assert.equal(rows[3].eligible,true);
 t.unavailable.add('A0ResearchModule1');assert.equal(target(t,101).status,'unavailable');assert.equal(target(t,101).eligible,false);
}
{
 const t=setup(),parent=structure(t,101,8);
 let r=assertNoMutation(t,()=>t.send('preview-build',command('A0ResearchModule1',101,[1],{x:-100,y:9999})));
 assert.equal(r.ok,true);assert.deepEqual([r.result.parentId,r.result.x,r.result.y,r.result.targetModules],[101,12,13,1],'authoritative parent ID supplies its own coordinates before bounds/reach checks');
 r=t.send('queue-build',command('A0ResearchModule1',101));assert.equal(r.ok,true);
 assert.equal(t.calls.length,1);assert.deepEqual(copy(t.calls[0]),{op:'build',truck:1,id:'A0ResearchModule1',x:12,y:13},'normal native module order pipeline is retained');
 const jobs=t.c.wtcmd_jobs.length;t.replay();assert.equal(t.c.wtcmd_jobs.length,jobs,'same command nonce remains idempotent');
 let row=target(t,101);assert.equal(row.status,'queued');assert.equal(row.reserved,1);assert.equal(row.eligible,false);assert.equal(row.statusReason,'module-pending');
 assert.equal(assertNoMutation(t,()=>t.send('queue-build',command('A0ResearchModule1',101))).reason,'module-pending');
 parent.modules=1;parent.status=0;
 row=target(t,101);assert.equal(row.status,'upgrading');assert.equal(row.modules,1);assert.equal(row.reserved,0,'native in-progress capacity is not reserved twice');
 assert.equal(assertNoMutation(t,()=>t.send('queue-build',command('A0ResearchModule1',101))).reason,'module-pending','repeat on active upgrade reports pending rather than wrong parent');
 parent.status=1;
 row=target(t,101);assert.equal(row.status,'full');assert.equal(row.reserved,0,'completed jobs do not reserve a stale slot before the next tick');
 assert.equal(assertNoMutation(t,()=>t.send('queue-build',command('A0ResearchModule1',101))).reason,'module-limit');
}
{
 const t=setup();structure(t,101,8);structure(t,102,9);structure(t,103,8,{player:1});structure(t,104,8,{status:0});
 for(const id of [999,0,-1,NaN,'wrong',103,102]){
  const r=assertNoMutation(t,()=>t.send('queue-build',command('A0ResearchModule1',id)));
  assert.equal(r.reason,'module-parent',`invalid, foreign, missing and mismatched parent ${id} cannot fall back to another nearby building`);
 }
 assert.equal(assertNoMutation(t,()=>t.send('queue-build',command('A0ResearchModule1',104))).reason,'module-parent');
 t.unreachable.add(1);assert.equal(assertNoMutation(t,()=>t.send('queue-build',command('A0ResearchModule1',101))).reason,'unreachable');
}
{
 const t=setup();structure(t,101,9);
 const r=t.send('queue-build',{itemId:'A0PowMod1',x:11,y:12,workerIds:[1]});
 assert.equal(r.ok,true);assert.deepEqual([r.result.parentId,r.result.x,r.result.y],[101,12,13],'legacy nearby terrain route remains supported and snaps to the real parent');
 assert.equal(t.send('queue-build',{itemId:'A0PowMod1',x:11,y:12,workerIds:[1]}).reason,'module-pending');
}
for(const kind of [4,6]){
 const t=setup(),parent=structure(t,101,kind);
 t.droids[0].order=99;
 const first=t.send('queue-build',command('A0FacMod1',101,[1]));assert.equal(first.result.targetModules,1);assert.equal(t.calls.length,0,'queueing never overrides a busy native order');
 let row=target(t,101);assert.equal(row.status,'queued');assert.equal(row.eligible,true);assert.equal(row.reserved,1);
 const second=t.send('queue-build',command('A0FacMod1',101,[2]));assert.equal(second.ok,true);assert.equal(second.result.targetModules,2);
 assert.equal(t.calls.length,0,'another worker cannot start factory level two before level one');
 assert.equal(t.send('queue-build',command('A0FacMod1',101,[2])).reason,'module-pending','concurrent third request cannot overbook capacity');
 t.droids[0].order=0;t.c.wtcmd_tickBuilds();assert.equal(t.calls.length,1);assert.equal(t.calls[0].truck,1);
 parent.modules=1;parent.status=0;
 row=target(t,101);assert.deepEqual([row.modules,row.reserved,row.maximum],[1,1,2]);assert.equal(row.status,'upgrading');assert.equal(row.eligible,false);
 const journal=state(t).constructionSites.find(j=>j.id===second.result.id);
 assert.equal(journal.status,'queued','second reserved factory level must not inherit the first level native construction row');assert.equal(journal.progress,0);assert.equal(journal.remaining,null);
 t.c.wtcmd_tickBuilds();assert.equal(t.calls.length,1,'second group waits through the first native upgrade');
 parent.status=1;t.droids[0].order=0;t.c.gameTime+=1500;t.c.wtcmd_tickBuilds();assert.equal(t.calls.length,2);assert.equal(t.calls[1].truck,2);
 parent.modules=2;parent.status=0;assert.equal(target(t,101).statusReason,'module-pending');
 parent.status=1;t.c.gameTime+=1500;t.c.wtcmd_tickBuilds();assert.equal(target(t,101).status,'full');
 assert.equal(t.send('queue-build',command('A0FacMod1',101)).reason,'module-limit');
}
{
 const t=setup(),parent=structure(t,101,4);
 t.send('queue-build',command('A0FacMod1',101));parent.modules=1;parent.status=0;
 let row=target(t,101);assert.equal(row.eligible,true);assert.equal(row.reserved,0);
 const second=t.send('queue-build',command('A0FacMod1',101,[2]));assert.equal(second.ok,true);assert.equal(second.result.targetModules,2,'factory spare slot remains available after native capacity increments at upgrade start');
}
{
 const t=setup();structure(t,101,8);t.select([t.droids[0]]);
 assert.equal(t.send('track-site',{itemId:'A0ResearchModule1',x:12,y:13}).ok,true);
 assert.equal(t.calls.length,0,'native journal remains display only');
 assert.equal(target(t,101).reserved,1);assert.equal(t.send('queue-build',command('A0ResearchModule1',101)).reason,'module-pending','legacy native journal reservations cannot be duplicated by ID-targeted UI');
}
{
 const t=setup();structure(t,101,8);t.droids[0].order=99;
 const r=t.send('queue-build',command('A0ResearchModule1',101));assert.equal(target(t,101).reserved,1);
 assert.equal(t.send('cancel-job',{jobId:r.result.id}).ok,true);
 assert.equal(target(t,101).reserved,0,'a cancelled script job cannot retain a reservation through its stale display journal');
 assert.equal(target(t,101).eligible,true);assert.equal(t.droids[0].order,99,'cancelling waiting module preserves the unrelated active native order');
}
console.log('PASS: own authoritative module targets, ID validation/snap, native capacity and pending feedback, legacy coordinates, VTOL/factory two-slot serialization, concurrent reservations, and order/production preservation');
