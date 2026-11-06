'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'scenario/warzone-towers-catalog.json')));
const source=fs.readFileSync(path.join(root,'scenario/warzone-towers-commands.js'),'utf8');
function setup(){
 let templates=[];let droids=[{id:1,x:8,y:8,order:0,type:0,player:0,droidType:2},{id:2,x:30,y:30,order:0,type:0,player:0,droidType:2}],structures=[],selected=[],commands,enumerations=0;
 const unavailable=new Set(),unreachable=new Set(),calls=[],replies=[],stats={Building:{}};
 for(const b of catalog.buildings)stats.Building[b.name]={Id:b.id,BuildPower:b.power};
 for(const [group,parts]of Object.entries(catalog.components)){stats[group]={};for(const p of parts)stats[group][p.name]={Id:p.id,BuildPower:p.power,WeaponSlots:p.slots||1};}
 const upgrades=[{Construct:Object.fromEntries(catalog.components.Construct.map(p=>[p.name,{ConstructorPoints:9}]))}];
 const c=vm.createContext({namespace(){},includeJSON:file=>file.includes('catalog')?catalog:commands,Stats:stats,Upgrades:upgrades,DROID:0,STRUCTURE:1,DROID_ANY:99,DROID_CONSTRUCT:2,DROID_CYBORG_CONSTRUCT:3,
 selectedPlayer:0,gameTime:2000,mapWidth:64,mapHeight:64,BUILT:1,FACTORY:4,CYBORG_FACTORY:5,VTOL_FACTORY:6,HQ:7,RESEARCH_LAB:8,POWER_GEN:9,
 DORDER_STOP:1,DORDER_BUILD:10,DORDER_HELPBUILD:11,DORDER_LINEBUILD:12,TER_WATER:1,TER_CLIFFFACE:2,
 enumDroid:()=>droids,enumSelected:()=>selected,enumStruct:(p,type)=>{enumerations++;return structures.filter(s=>type===undefined||s.stattype===type||s.itemId===type);},
 getObject:(type,p,id)=>(type===0?droids:structures).find(o=>o.player===p&&o.id===id),
 componentAvailable:id=>!unavailable.has(id),isStructureAvailable:id=>!unavailable.has(id),getStructureLimit:()=>1000,
 playerPower:()=>1000,structureIdle:s=>!s.busy,droidCanReach:(d)=>!unreachable.has(d.id),terrainType:()=>0,
 pickStructLocation:(d,id,x,y)=>{const b=catalog.buildings.find(b=>b.id===id);return{x:x+Math.floor(b.width/2),y:y+Math.floor(b.breadth/2)};},
 orderDroidBuild:(d,o,id,x,y)=>{calls.push({op:'build',truck:d.id,id,x,y});d.order=o;return true;},orderDroidObj:(d,o,s)=>{calls.push({op:'help',truck:d.id,id:s.id});d.order=o;return true;},
 orderDroid:(d,o)=>{d.order=o;calls.push({op:'stop',truck:d.id});return true;},
 enumTemplates:()=>templates,makeTemplate:(p,name,body,prop,n,...turrets)=>({fullname:name,body,propulsion:prop,cost:123,points:456,droidType:0,weapons:turrets}),
 buildDroid:(s,name,body,prop,n,a,...turrets)=>{calls.push({op:'produce',factory:s.id,name,body,prop,turrets});s.busy=true;return true;},
 dump:line=>{if(line.startsWith('WTCMD:'))replies.push(JSON.parse(line.slice(6)));},setTimer(){},queue(){},showInterface(){},hideInterface(){},showReticuleWidget(){}});
 vm.runInContext(source,c);c.wtcmd_initialize();let serial=0;
 return{c,calls,replies,droids,structures,templates,unavailable,unreachable,select:s=>selected=s,resetEnumerations:()=>enumerations=0,enumerations:()=>enumerations,
 send:(action,data={})=>{commands={revision:String(++serial),commands:[{nonce:`test-${serial}`,action,...data}]};c.wtcmd_poll();return replies.at(-1);},
 replay:()=>{commands.revision=String(++serial);c.wtcmd_poll();return replies.at(-1);}};
}
const defence=catalog.buildings.find(b=>b.category==='DEFENCES'&&b.width===1),body=catalog.components.Body[0],prop=catalog.components.Propulsion[0],weapon=catalog.components.Weapon[0];
{
 const t=setup();t.send('queue-build',{itemId:defence.id,x:12,y:12,workerIds:[1]});
 t.send('queue-build',{itemId:defence.id,x:15,y:15,workerIds:[1]});
 t.droids[0].order=99;t.c.wtcmd_tick();assert.equal(t.c.wtcmd_openJobs().length,0,'replacement native movement overrides the truck build FIFO');
 const count=t.calls.length;t.droids[0].order=0;t.c.gameTime+=2500;t.c.wtcmd_tick();assert.equal(t.calls.length,count,'completed replacement movement must not restart cancelled construction');
}

{
 const t=setup();t.select([t.droids[1]]);
 const r=t.send('queue-build',{itemId:defence.id,x:12,y:12,workerIds:[1]});
 assert.equal(r.ok,true);assert.deepEqual(r.result.workers,[1],'catalogue local group cannot be replaced by a previously selected combat/other group');
 assert.equal(t.send('queue-build',{itemId:defence.id,x:15,y:15,workerIds:[999]}).reason,'unreachable','dead or foreign requested workers cannot silently reassign work across the map');
 t.unreachable.add(1);assert.equal(t.send('queue-build',{itemId:defence.id,x:16,y:16,workerIds:[1]}).reason,'unreachable');
}

{
 const t=setup(),snapshot=t.send('state').result;
 assert.ok(t.c.wtcmd_native.A0TankTrap,'same-name corner stats must not erase straight Tank Traps');
 assert.ok(snapshot.nativeBuildOptions.includes('A0TankTrap'),'native picker keeps the otherwise missing Tank Traps slot');
 assert.ok(snapshot.nativeBuildOptions.indexOf('A0TankTrap')<snapshot.nativeBuildOptions.indexOf('GuardTower6'),'subsequent native picker indices account for the recovered slot');
 assert.ok(!snapshot.nativeBuildOptions.includes('TankTrapC'),'automatic corner pieces are not offered as manual build choices');
 t.unavailable.add('A0VTolFactory1');t.c.getStructureLimit=()=>1;t.structures.push({id:88,stattype:4,status:1,modules:2});
 assert.ok(!t.send('state').result.nativeBuildOptions.includes('A0FacMod1'),'locked VTOL capacity must not keep a fully used factory-module picker slot alive');
}
{
 const t=setup();t.droids[0].order=99;
 let r=t.send('queue-build',{itemId:defence.id,x:12,y:12,session:'same'});assert.equal(r.ok,true);assert.equal(r.result.workers[0],1);assert.equal(t.calls.length,0,'busy native orders must not be overwritten');
 t.replay();assert.equal(t.c.wtcmd_jobs.length,1,'retry must not duplicate order');
 r=t.send('queue-build',{itemId:defence.id,x:28,y:28,session:'same'});assert.equal(r.result.workers[0],1,'same placement session retains assigned truck');
 t.droids[0].order=0;t.c.wtcmd_tick();assert.equal(t.calls.at(-1).x,12,'first job starts first');t.c.wtcmd_tick();assert.equal(t.calls.length,1,'busy builder is not reissued');
 t.structures.push({id:10,type:1,player:0,itemId:defence.id,x:12,y:12,status:1});t.droids[0].order=0;t.c.gameTime+=2000;t.c.wtcmd_tick();assert.equal(t.calls.at(-1).x,28,'completion advances to second job');
 assert.equal(t.send('queue-build',{itemId:defence.id,x:28,y:28,session:'same'}).reason,'already-queued');
 t.c.wtcmd_stopWorkers([1]);assert.equal(t.c.wtcmd_openJobs().length,0,'STOP clears pending automatic jobs');
}
{
 const t=setup();t.select([t.droids[1]]);assert.equal(t.send('queue-build',{itemId:defence.id,x:10,y:10}).result.workers[0],2,'manual truck overrides nearest');
 t.select([t.droids[0],t.droids[1]]);assert.equal(t.send('queue-build',{itemId:defence.id,x:15,y:15}).result.workers.length,2,'manual group retained');
 t.unavailable.add(defence.id);assert.equal(t.send('queue-build',{itemId:defence.id,x:20,y:20}).reason,'unavailable');
 t.unavailable.clear();t.unreachable.add(1);t.unreachable.add(2);assert.equal(t.send('queue-build',{itemId:defence.id,x:20,y:20}).reason,'unreachable');
 assert.equal(t.send('queue-build',{itemId:defence.id,x:-1,y:20}).ok,false);
}
{
 const t=setup(),design={name:'My cannon',body:body.id,propulsion:prop.id,turrets:[weapon.id]};
 assert.equal(t.send('save-design',{design}).reason,'hq-required');t.structures.push({id:20,type:1,player:0,stattype:7,status:1});
 let r=t.send('save-design',{design});assert.equal(r.ok,true);assert.equal(r.result.cost,123,'native computed power returned');assert.equal(t.calls.length,0,'saving must not manufacture or add free units');
 t.unavailable.add(weapon.id);assert.equal(t.send('save-design',{design}).reason,'components-unavailable');t.unavailable.clear();
 assert.equal(t.send('save-design',{design:{...design,turrets:[weapon.id,weapon.id,weapon.id,weapon.id]}}).ok,false);
 const a={id:31,type:1,player:0,stattype:4,status:1,busy:true},b={id:32,type:1,player:0,stattype:4,status:1};t.structures.push(a,b);
 assert.equal(t.send('queue-production',{factoryId:31,count:2,design}).ok,true);assert.equal(t.calls.length,0,'busy factory must keep existing work');
 t.send('queue-production',{factoryId:32,count:1,design});assert.equal(t.calls.length,1);a.busy=false;t.c.wtcmd_tick();assert.equal(t.calls.length,2);
 assert.notEqual(t.calls[0].name,t.calls[1].name,'factories must not cancel each other through equal-name native templates');
 t.c.wtcmd_eventDroidBuilt({id:100,player:0},a);a.busy=false;t.c.gameTime+=2000;t.c.wtcmd_tick();assert.equal(t.calls.length,3,'second unit produces only after first native completion');
 assert.equal(t.c.wtcmd_finishedUnits[0].id,100);assert.equal(t.send('queue-production',{factoryId:999,count:1,design}).ok,false);
}
{
 const t=setup();t.droids.forEach(d=>d.order=99);
 for(let i=0;i<100;i++)assert.equal(t.send('queue-build',{itemId:defence.id,x:2+(i%20)*2,y:2+Math.floor(i/20)*2,session:'stress'}).ok,true);
 assert.equal(t.c.wtcmd_openJobs().length,100);t.resetEnumerations();t.c.wtcmd_tickBuilds();
 assert.ok(t.enumerations()<=2,'100 queued sites must reuse native structure enumeration, not marshal 100 native arrays every tick');
 assert.equal(t.calls.length,0,'100 waiting jobs still must not overwrite busy native work');
}
{
 const t=setup();for(let i=0;i<13;i++)t.droids.push({id:10+i,x:8+i%3,y:8+Math.floor(i/3)%3,order:0,type:0,player:0,droidType:2});
 const r=t.send('queue-build',{itemId:defence.id,x:9,y:9});assert.equal(r.result.workers.length,14,'automatic group has no one-truck or three-truck cap');assert.ok(!r.result.workers.includes(2),'distant group is excluded');
}
{
 const t=setup();t.structures.push({id:31,type:1,player:0,stattype:4,status:1});t.templates.push({id:'',fullname:'Generated design F31',name:'',body:body.id,propulsion:prop.id,weapons:[weapon.id],droidType:0,cost:123,points:456});
 t.templates.push({...t.templates[0]});const snapshot=t.send('state').result;assert.equal(snapshot.templates.length,1,'equivalent generated native templates appear once');
 const key=snapshot.templates[0].id;assert.ok(key.startsWith('native:'));assert.equal(t.send('queue-production',{factoryId:31,count:1,templateId:key}).ok,true,'generated native designs with empty engine IDs remain producible');
}
{
 const t=setup();t.c.getDroidLimit=(player,type)=>type===2?2:150;t.structures.push({id:31,type:1,player:0,stattype:4,status:1});
 const construct=catalog.components.Construct[0];t.templates.push({id:'Constructor',fullname:'Constructor',body:body.id,propulsion:prop.id,weapons:[],construct:construct.id,droidType:2,cost:62,points:310});
 assert.equal(t.send('queue-production',{factoryId:31,count:1,templateId:'Constructor'}).ok,true);assert.equal(t.calls.length,0,'capacity wait must not start an impossible native build');
 assert.equal(t.send('state').result.factories[0].waitingReason.kind,'constructors');t.droids.pop();t.c.wtcmd_tickProduction();assert.equal(t.calls.at(-1).op,'produce','normal production resumes after capacity frees');
}
console.log('PASS: FIFO builds, manual/automatic workers, sticky sessions, STOP, deduplication, validation, factory queues and bounded 100-job polling');
{
 const t=setup(),item=catalog.buildings.find(b=>b.id==='GuardTower1');
 const building={id:70,player:0,type:1,stattype:20,status:0,name:item.name,x:8,y:9,health:10};t.structures.push(building);
 Object.assign(t.droids[0],{body:'Body1REC',action:18,x:8,y:8,order:10});
 let row=t.send('state').result.construction[0];assert.equal(row.remaining,null,'travel is not construction time');assert.equal(row.rate,0);
 t.droids[0].action=2;building.health=55;row=t.send('state').result.construction[0];assert.equal(row.rate,9);assert.equal(row.remaining,17);
 Object.assign(t.droids[1],{body:'Body1REC',action:2,x:9,y:9,order:10});row=t.send('state').result.construction[0];assert.equal(row.rate,18);assert.equal(row.remaining,9,'live worker arrivals shorten the estimate');
 t.c.playerPower=()=>0;building.health=10;t.send('state');t.c.gameTime+=1000;row=t.send('state').result.construction[0];assert.equal(row.status,'waiting-power');assert.equal(row.remaining,null);
 t.c.playerPower=()=>1000;building.health=19;row=t.send('state').result.construction[0];assert.equal(row.status,'building');assert.equal(row.remaining,15);
 const paused=JSON.stringify(row);assert.equal(JSON.stringify(t.send('state').result.construction[0]),paused,'a paused simulation cannot tick down an estimate');
 t.select([t.droids[0]]);const before=t.calls.length,plan=t.send('track-site',{itemId:item.id,x:11,y:11});assert.equal(plan.ok,true);assert.equal(t.calls.length,before,'the display journal must not issue or replace native orders');
 t.structures.push({id:71,player:0,type:1,stattype:20,status:1,name:item.name,x:12,y:11,health:100});
 assert.notEqual(t.send('state').result.constructionSites[0].status,'done','an adjacent building cannot complete the queued site');
 t.structures.push({id:72,player:0,type:1,stattype:20,status:1,name:item.name,x:11,y:11,health:100});
 assert.equal(t.send('state').result.constructionSites[0].status,'done');
}
{
 const t=setup(),factory={id:80,player:0,type:1,stattype:4,status:1,name:'Factory',x:8,y:9,health:60,modules:1};t.structures.push(factory);t.select([t.droids[0]]);
 Object.assign(t.droids[0],{body:'Body1REC',action:2,order:10});assert.equal(t.send('track-site',{itemId:'A0FacMod1',x:8,y:9}).ok,true);
 factory.status=0;t.send('state');t.c.gameTime+=500;let j=t.send('state').result.constructionSites[0];assert.ok(j.estimatedPoints>0);const points=j.estimatedPoints;
 j=t.send('state').result.constructionSites[0];assert.equal(j.estimatedPoints,points,'module work uses simulation time, not polling frequency');
 factory.modules=2;factory.status=1;assert.equal(t.send('state').result.constructionSites[0].status,'done');
}
console.log('PASS: construction ETA follows actual worker actions/upgrades, pauses and power; modules use observed work; journal never replaces native orders');
{
 const t=setup(),item=catalog.buildings.find(b=>b.id==='A0ResearchFacility');t.select([t.droids[0]]);
 const old={id:90,player:0,type:1,stattype:8,status:1,name:item.name,x:8,y:38,health:100};t.structures.push(old);
 Object.assign(t.droids[0],{body:'Body1REC',action:2,order:10,x:9,y:37});
 assert.equal(t.send('track-site',{itemId:item.id,x:9,y:37}).ok,true);
 let j=t.send('state').result.constructionSites[0];assert.notEqual(j.status,'done','an old adjacent facility cannot satisfy a new order');
 const foundation={id:91,player:0,type:1,stattype:8,status:0,name:item.name,x:9,y:38,health:28};t.structures.push(foundation);
 j=t.send('state').result.constructionSites[0];assert.equal(j.structureId,91);assert.equal(j.nativeY,38);assert.equal(j.y,37);assert.equal(j.observed,true);assert.equal(j.status,'building');assert.ok(j.remaining>0);
 foundation.status=1;foundation.health=100;assert.equal(t.send('state').result.constructionSites[0].status,'done','even-footprint snapping preserves native completion matching');
}
console.log('PASS: a snapped 2x2 foundation binds to its own queue entry without matching older adjacent buildings');
{
 const t=setup(),item=catalog.buildings.find(b=>b.id==='PillBox1');t.select([t.droids[0]]);Object.assign(t.droids[0],{body:'Body1REC',order:10});
 assert.equal(t.send('track-site',{itemId:item.id,x:11,y:11}).ok,true);t.c.gameTime+=2500;t.droids[0].order=0;
 let j=t.send('state').result.constructionSites[0];assert.notEqual(j.status,'interrupted','one native idle sample during FIFO handoff must not discard a queued site');
 t.c.gameTime+=500;Object.assign(t.droids[0],{order:10,action:2,x:11,y:10});const foundation={id:101,player:0,type:1,stattype:20,status:0,name:item.name,x:11,y:11,health:28};t.structures.push(foundation);
 j=t.send('state').result.constructionSites[0];assert.equal(j.status,'building');assert.equal(j.structureId,101);foundation.status=1;assert.equal(t.send('state').result.constructionSites[0].status,'done');
 assert.equal(t.send('track-site',{itemId:item.id,x:13,y:11}).ok,true);t.c.gameTime+=2500;t.droids[0].order=0;t.send('state');t.c.gameTime+=1200;assert.equal(t.send('state').result.constructionSites[0].status,'interrupted','sustained native idle after cancelled work is still detected');
}
console.log('PASS: native queue handoff preserves progress/completion; sustained cancellation still interrupts');
{
 const t=setup();t.structures.push({id:31,type:1,player:0,stattype:4,status:1});const construct=catalog.components.Construct[0];
 t.templates.push({id:'ConstructionDroid',fullname:'Truck',body:body.id,propulsion:prop.id,weapons:[],construct:construct.id,droidType:2,cost:62,points:310});
 t.templates.push({...t.templates[0],id:'',fullname:'Truck · F31'});assert.equal(t.send('state').result.templates.length,1,'stock and generated templates with equivalent parts merge');
 assert.equal(t.send('queue-production',{factoryId:31,count:1,templateId:t.send('state').result.templates[0].id}).ok,true);
}
