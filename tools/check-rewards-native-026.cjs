'use strict';
// Native-API fixtures, not an emulator or proof of in-game construction/combat.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'scenario/warzone-towers-catalog.json')));
const commandSource = fs.readFileSync(path.join(root, 'scenario/warzone-towers-commands.js'), 'utf8');
const rewardSource = fs.readFileSync(path.join(root, 'scenario/warzone-towers-rewards.js'), 'utf8');
const fortress = 'X-Super-Cannon', checks = [];
const clone = value => JSON.parse(JSON.stringify(value));

function baseSetup() {
    let commands, serial = 0, power = 2000, researchDone = false;
    const structures = [], calls = [], replies = [], available = new Set(), limits = {};
    const droids = [{id:1,type:0,player:0,x:7,y:7,order:99,droidType:2}];
    const stats = {Building:{}}, upgrades = [{Building:{},Construct:{}}, {Building:{}}];
    for (const item of catalog.buildings) {
        stats.Building[item.name] = {Id:item.id,BuildPower:item.power};
        if (item.id !== fortress) available.add(item.id);
        limits[item.id] = 999;
    }
    for (const [group, entries] of Object.entries(catalog.components)) {
        stats[group] = {};
        for (const item of entries) stats[group][item.name] = {Id:item.id,BuildPower:item.power};
    }
    const labName = catalog.buildings.find(item => item.id === 'A0ResearchFacility').name;
    upgrades[0].Building[labName] = {ResearchPoints:100,ModuleResearchPoints:50};
    upgrades[1].Building[labName] = {ResearchPoints:100,ModuleResearchPoints:50};
    for (const tool of catalog.components.Construct) upgrades[0].Construct[tool.name] = {ConstructorPoints:9};
    const c = vm.createContext({namespace(){},includeJSON:name => name.includes('catalog') ? catalog : commands,
        Stats:stats,Upgrades:upgrades,selectedPlayer:0,gameTime:2000,mapWidth:64,mapHeight:64,
        DROID:0,STRUCTURE:1,DROID_ANY:99,DROID_CONSTRUCT:2,DROID_CYBORG_CONSTRUCT:3,
        BUILT:1,FACTORY:4,CYBORG_FACTORY:5,VTOL_FACTORY:6,HQ:7,RESEARCH_LAB:8,POWER_GEN:9,
        DORDER_STOP:1,DORDER_BUILD:10,DORDER_HELPBUILD:11,DORDER_LINEBUILD:12,TER_WATER:1,TER_CLIFFFACE:2,
        enumDroid:() => droids,enumSelected:() => [],
        enumStruct:(player,type) => structures.filter(s => s.player === player && (type === undefined || s.itemId === type || s.stattype === type)),
        getObject:(type,player,id) => (type === 0 ? droids : structures).find(o => o.player === player && o.id === id),
        componentAvailable:() => true,
        isStructureAvailable:(id,player) => available.has(id) && structures.filter(s => s.player === player && s.itemId === id).length < limits[id],
        getStructureLimit:id => limits[id],setStructureLimits:(id,n,player) => {calls.push({kind:'limit',id,n,player});limits[id]=n;},
        enableStructure:(id,player) => {calls.push({kind:'unlock',id,player});available.add(id);},
        getResearch:id => ({id,done:researchDone}),playerPower:() => power,
        setPower:(value,player) => {power=value;calls.push({kind:'power',value,player});},
        structureIdle:() => true,droidCanReach:() => true,terrainType:() => 0,
        pickStructLocation:(d,id,x,y) => {const b=catalog.buildings.find(b=>b.id===id);return{x:x+Math.floor(b.width/2),y:y+Math.floor(b.breadth/2)};},
        orderDroidBuild:(d,o,id,x,y) => {calls.push({kind:'build',id,x,y});d.order=o;return true;},
        orderDroidObj:(d,o,s) => {calls.push({kind:'help',id:s.id});d.order=o;return true;},
        orderDroid:(d,o) => {d.order=o;return true;},enumTemplates:() => [],
        dump:line => {if(line.startsWith('WTCMD:'))replies.push(JSON.parse(line.slice(6)));},
        setTimer(){},queue(){},showInterface(){},hideInterface(){},showReticuleWidget(){}});
    vm.runInContext(commandSource,c);vm.runInContext(rewardSource,c);c.wtcmd_initialize();
    return {c,structures,droids,calls,limits,available,upgrades,labName,
        power:() => power,setPower:n => power=n,completeResearch:() => researchDone=true,
        send:(action,data={}) => {commands={revision:String(++serial),commands:[{nonce:'r-'+serial,action,...data}]};c.wtcmd_poll();return replies.at(-1);}};
}

function setup() {
    const t=baseSetup(),done=new Set(),enemies=[];
    for(const type of Object.values(t.c.wtreward_types))t.available.delete(type.id);
    t.c.getResearch=id=>({id,done:done.has(id)});
    t.c.scavAI=1;
    t.c.Stats.Weapon.LasSat={Id:'LasSat',FirePause:1000};t.upgrades[0].Weapon={LasSat:{FirePause:1000}};
    t.c.getObject=(type,p,id)=>[...t.structures,...t.droids,...enemies].find(o=>o.type===type&&o.player===p&&o.id===id);
    t.c.enumRange=(x,y,r,p,visible)=>enemies.filter(o=>o.player===p&&Math.hypot(o.x-x,o.y-y)<=r&&(!visible||o.visible!==false));
    t.c.activateStructure=(s,target)=>{assert.equal(s.player,0);assert.equal(s.selected,true);assert.equal(s.status,1);
        t.calls.push({kind:'laser',structure:s.id,target:target.id});s.weapons[0].lastFired=t.c.gameTime;return true;};
    t.done=done;t.enemies=enemies;
    t.apply=(items={},extra={})=>t.send('apply-rewards',{rewards:{session:'native026',items,...extra}});
    t.add=(slug,id,x=15,y=15,status=0)=>{
        const type=t.c.wtreward_types[slug],item=catalog.buildings.find(b=>b.id===type.id);
        const object={id,type:1,player:0,itemId:type.id,name:item.name,x,y,status,health:100};
        t.structures.push(object);return object;
    };
    t.destroy=object=>{t.structures.splice(t.structures.indexOf(object),1);t.c.wtreward_eventDestroyed(object);};
    return t;
}
function check(name,run){run();checks.push(name);}
check('No purchased items preserve ordinary native availability, rates, power and commands',()=>{
    const t=setup(),before=clone(t.upgrades);assert.equal(t.apply().ok,true);t.c.wtreward_tick();
    assert.deepEqual(t.upgrades,before);assert.equal(t.power(),2000);assert.equal(t.calls.length,0);
    const ordinary=catalog.buildings.find(b=>b.category==='DEFENCES'&&b.width===1);
    assert.equal(t.send('queue-build',{itemId:ordinary.id,x:20,y:20,workerIds:[1]}).ok,true);
});
check('All17 reviewed item types map to actual catalog structures and only purchased types unlock',()=>{
    const t=setup(),types=clone(t.c.wtreward_types);assert.equal(Object.keys(types).length,17);
    for(const type of Object.values(types))assert.ok(catalog.buildings.some(b=>b.id===type.id),type.id);
    assert.equal(t.apply({archangel:20,wide_sensor:1}).ok,true);
    assert.deepEqual(t.calls.filter(c=>c.kind==='unlock').map(c=>c.id).sort(),['Emplacement-HvART-pit','Sys-SensoTowerWS']);
    assert.equal(t.c.wtreward_state().remaining.archangel,20);
    for(const quantity of [5,10,15,20,999]){
        const bulk=setup();assert.equal(bulk.apply({archangel:quantity}).ok,true);
        assert.equal(bulk.c.wtreward_state().remaining.archangel,quantity);
        assert.equal(bulk.limits['Emplacement-HvART-pit'],quantity);
    }
});
check('Three mixed fortresses are allowed; fourth, excess LasSat, unknown and invalid stock fail closed',()=>{
    const good=setup();assert.equal(good.apply({fortress:1,missile_fortress:1,rocket_bastion:1}).ok,true);
    for(const items of [{fortress:4},{fortress:2,mass_driver_fortress:2},{laser_sat:2},{trucks:1},{ripple:1000},{ripple:1.5},{ripple:-1}]){
        const t=setup();assert.equal(t.apply(items).ok,false,JSON.stringify(items));assert.equal(t.calls.length,0);
    }
});
check('Bulk artillery reserves the paid quantity, cancellation releases unplaced stock, duplicate apply does not refill',()=>{
    const t=setup();assert.equal(t.apply({archangel:5}).ok,true);
    const id=t.c.wtreward_types.archangel.id,jobs=[];
    for(let i=0;i<5;i++){const r=t.send('queue-build',{itemId:id,x:6+i*7,y:20,workerIds:[1]});assert.equal(r.ok,true);jobs.push(r.result.id);}
    assert.equal(t.send('queue-build',{itemId:id,x:45,y:30,workerIds:[1]}).reason,'reward-reserved');
    assert.equal(t.c.wtreward_state().reserved.archangel,5);
    assert.equal(t.send('cancel-job',{jobId:jobs[0]}).ok,true);
    assert.equal(t.send('queue-build',{itemId:id,x:45,y:30,workerIds:[1]}).ok,true);
    assert.equal(t.apply({archangel:5}).ok,true);assert.equal(t.c.wtreward_state().remaining.archangel,5);
});
check('Each foundation consumes one item permanently; unused stock remains transferable after destruction and load',()=>{
    const t=setup();t.apply({ripple:5});const object=t.add('ripple',201);t.c.wtreward_tick();
    assert.equal(t.c.wtreward_state().remaining.ripple,4);t.destroy(object);
    assert.equal(t.c.wtreward_state().remaining.ripple,4);assert.equal(t.limits[t.c.wtreward_types.ripple.id],4);
    const loaded=setup();loaded.c.wtreward_match=clone(t.c.wtreward_match);loaded.c.wtreward_eventGameLoaded();
    assert.equal(loaded.c.wtreward_state().remaining.ripple,4);
    assert.equal(loaded.send('reward-inventory').result.remaining.ripple,4);
});
check('Destroying a just-created foundation before a timer sample consumes it; duplicate callbacks do not double-spend',()=>{
    const t=setup();t.apply({heavy_laser:2});const object=t.add('heavy_laser',301);t.destroy(object);
    t.c.wtreward_eventDestroyed(object);assert.equal(t.c.wtreward_state().remaining.heavy_laser,1);
    const unrelated={...object,id:302,player:1};t.c.wtreward_eventDestroyed(unrelated);
    assert.equal(t.c.wtreward_state().remaining.heavy_laser,1);
});
check('Naturally researched structures preserve ordinary allowance and unused paid stock',()=>{
    const t=setup();t.done.add('R-Defense-HvyArtMissile');t.available.add('Emplacement-HvART-pit');
    t.apply({archangel:5});const object=t.add('archangel',401);t.c.wtreward_tick();
    assert.equal(t.c.wtreward_state().remaining.archangel,5);assert.equal(t.limits[object.itemId],999);
    const later=setup();later.apply({fortress:2});later.add('fortress',402);
    later.done.add('R-Defense-Super-Cannon');later.c.wtreward_eventResearched({},null,0);
    assert.equal(later.limits[fortress],999);assert.equal(later.c.wtreward_state().remaining.fortress,1);
});
check('Research and supply retain once-only, natural-upgrade and native-load semantics with expanded stock',()=>{
    const t=setup();t.apply({emp_mortar:20},{research:true,supply:true});assert.equal(t.power(),3000);
    const rate=t.upgrades[0].Building[t.labName];assert.deepEqual(rate,{ResearchPoints:125,ModuleResearchPoints:63});
    for(let i=0;i<20;i++){t.c.wtreward_tick();t.apply({emp_mortar:20},{supply:true,research:true});}
    assert.equal(t.power(),3000);rate.ResearchPoints+=20;rate.ModuleResearchPoints+=5;t.c.wtreward_eventResearched({},null,0);
    assert.deepEqual(rate,{ResearchPoints:150,ModuleResearchPoints:69});
    const loaded=setup();loaded.c.wtreward_match=clone(t.c.wtreward_match);loaded.setPower(3000);
    Object.assign(loaded.upgrades[0].Building[loaded.labName],{ResearchPoints:120,ModuleResearchPoints:55});
    loaded.c.wtreward_eventGameLoaded();loaded.c.wtreward_eventGameLoaded();
    assert.deepEqual(loaded.upgrades[0].Building[loaded.labName],rate);assert.equal(loaded.power(),3000);
});
check('Old0.25 native state migrates without renewing a consumed fortress or duplicating supply',()=>{
    const t=setup();t.c.wtreward_match={session:'old',applied:true,error:'',config:{fortress:true,research:false,supply:true},supplyApplied:true,researchApplied:false,labRates:{},fortressApplied:true,fortressNatural:false,fortressOriginalLimit:999,fortressUsed:true,fortressId:501};
    t.c.wtreward_eventGameLoaded();const state=t.c.wtreward_state();assert.equal(state.remaining.fortress,0);
    assert.equal(state.items.fortress,1);assert.equal(t.power(),2000);assert.equal(t.limits[fortress],0);
    assert.equal(t.c.wtreward_apply({session:'old',items:{fortress:1},supply:true}).ok,true);
});
check('Session and changed inventory conflicts cannot apply a second set of bonuses',()=>{
    const t=setup();t.apply({ripple:5});assert.equal(t.apply({ripple:10}).reason,'reward-config-conflict');
    assert.equal(t.send('apply-rewards',{rewards:{session:'different',items:{ripple:5}}}).reason,'reward-session-conflict');
    assert.equal(t.c.wtreward_state().items.ripple,5);
});
check('LasSat requires an owned completed selected command post and an actual visible enemy target',()=>{
    const t=setup();t.apply({laser_sat:1});const laser=t.add('laser_sat',601,10,10,1);laser.weapons=[{id:'LasSat',lastFired:0}];
    t.enemies.push({id:701,type:0,player:1,x:20,y:20});
    assert.equal(t.send('reward-lassat',{x:20,y:20}).reason,'lassat-select-required');laser.selected=true;
    assert.equal(t.send('reward-lassat',{x:30,y:30}).reason,'lassat-target-missing');
    t.enemies[0].visible=false;assert.equal(t.send('reward-lassat',{x:20,y:20}).reason,'lassat-target-missing');
    t.enemies[0].visible=true;assert.equal(t.send('reward-lassat',{x:20,y:20}).ok,true);
    assert.equal(t.calls.filter(c=>c.kind==='laser').length,1);
    assert.equal(t.send('reward-lassat',{x:20,y:20}).reason,'lassat-cooling');
    assert.equal(t.c.wtreward_state().lasSats[0].remainingMs,1001);
    t.c.gameTime+=1001;assert.equal(t.send('reward-lassat',{targetId:701,targetType:0,targetPlayer:1}).ok,true);
});
check('LasSat uses the native damaged-structure doubled fire pause',()=>{
    const t=setup();t.apply({laser_sat:1});const laser=t.add('laser_sat',602,10,10,1);
    laser.selected=true;laser.health=20;laser.weapons=[{id:'LasSat',lastFired:1000}];
    assert.equal(t.c.wtreward_state().lasSats[0].remainingMs,1001);
    t.c.gameTime=3001;assert.equal(t.c.wtreward_state().lasSats[0].ready,true);
});

function waveFixture(){
    let serial=1000,hqAlive=true,command={};const enemies=[],packets=[],queued=[];
    const actions=[{type:'round',round:1},{type:'spawn',count:1,templatePool:['tank']},{type:'wait',seconds:1},
        {type:'spawn',count:1,templatePool:['tank']},{type:'round',round:2},{type:'spawn',count:1,templatePool:['tank']},
        {type:'round',round:3},{type:'spawn',count:1,templatePool:['tank']}];
    const context={namespace(){},SaveLoad:{persist(){}},Stats:{Brain:{'Z NULL BRAIN':{RankThresholds:[0,1,2,3]}}},
        Template:{fromString:name=>({name}),spawn:(template,p,x,y)=>{if(context.failSpawn)return null;const d={id:++serial,type:0,player:p,x,y,cost:10};enemies.push(d);return d;}},
        actions,index:0,ranks:[0,1,2,3],totalRounds:3,selectedPlayer:0,scavAI:1,gameTime:2000,
        FEATURE:2,DROID:0,STRUCTURE:1,HQ:7,DROID_ANY:99,TER_CLIFFFACE:9,TER_WATER:8,maxPlayers:2,
        _:s=>s,console(){},playSound(){},setMissionTime(){},syncRandom:()=>0,setDroidExperience(){},
        playerPower:()=>2000,powerRewardFunction:()=>0,td_eventDestroyed(){},finalizePlayer:(p,won)=>packets.push({finalized:won}),
        enumStruct:p=>p===0&&hqAlive?[{id:1,type:1,player:0}]:[],enumDroid:p=>p===1?enemies:[],
        includeJSON:()=>command,setTimer(){},removeTimer(){},queue:(name,delay)=>queued.push({name,delay}),
        dump:line=>{if(line.startsWith('BNWAVE:'))packets.push(JSON.parse(line.slice(7)));}};
    const c=vm.createContext(context),mod='vendor/tower-defense/mod/multiplay/script/mods/';
    vm.runInContext(fs.readFileSync(path.join(root,mod+'Spawner.js'),'utf8'),c);
    vm.runInContext(fs.readFileSync(path.join(root,mod+'configReader.js'),'utf8'),c);
    const spawner=vm.runInContext('Spawner',c);spawner.player=1;spawner.locations=[[1,1]];
    vm.runInContext(fs.readFileSync(path.join(root,'scenario/warzone-towers-waves.js'),'utf8'),c);
    vm.runInContext(fs.readFileSync(path.join(root,'scenario/warzone-towers-objective.js'),'utf8'),c);
    return{c,spawner,enemies,packets,actions,
        round:n=>c.processRound({round:n}),batch:n=>c.processSpawn({count:n,templatePool:['tank']}),
        spawn:()=>{spawner.spawn();return enemies.at(-1);},
        kill:o=>{const i=enemies.indexOf(o);if(i>=0)enemies.splice(i,1);c.td_eventDestroyed(o);},
        clears:()=>clone(c.warzoneTowersWaves_state.completedWaves||[]),
        hq:value=>hqAlive=value,setCommand:value=>command=value};
}
check('A wave pays only after all authored spawn batches are issued, queued enemies spawned and every own unit killed',()=>{
    const t=waveFixture();t.round(1);assert.deepEqual(t.clears(),[]);t.batch(1);t.kill(t.spawn());
    assert.deepEqual(t.clears(),[],'later spawn action still missing');t.batch(2);t.kill(t.spawn());
    assert.deepEqual(t.clears(),[],'one enemy still in native spawn queue');t.kill(t.spawn());
    assert.deepEqual(t.clears(),[1]);t.c.warzoneTowersWaves_emit(true);assert.deepEqual(t.clears(),[1]);
});
check('Overlapping waves retain separate queued templates and native unitIDs; a later clear cannot clear its survivors',()=>{
    const t=waveFixture();t.round(1);t.batch(1);const first=t.spawn();t.batch(1);const other=t.spawn();
    t.round(2);t.batch(1);const second=t.spawn();t.kill(second);assert.deepEqual(t.clears(),[2]);
    t.kill(first);assert.deepEqual(t.clears(),[2]);t.kill(other);assert.deepEqual(t.clears(),[1,2]);
});
check('Starting/skipping rounds and removing units without destruction callbacks never manufacture completed waves',()=>{
    const t=waveFixture();t.round(1);t.round(2);assert.deepEqual(t.clears(),[]);
    t.batch(1);t.spawn();t.enemies.length=0;t.c.warzoneTowersWaves_tick();assert.deepEqual(t.clears(),[]);
});
check('HQ loss prevents post-loss clears and preserves only waves actually cleared beforehand',()=>{
    const t=waveFixture();t.round(2);t.batch(1);t.kill(t.spawn());assert.deepEqual(t.clears(),[2]);
    t.round(3);t.batch(1);const third=t.spawn();t.hq(false);t.kill(third);t.c.finalizePlayer(0,false);
    assert.deepEqual(t.clears(),[2]);assert.equal(t.packets.findLast(p=>p.phase)?.phase,'defeated');
});
check('Terminal wave packet includes actual completed IDs and fresh native remaining inventory',()=>{
    const t=waveFixture();t.c.wtreward_state=()=>({applied:true,remaining:{archangel:7}});
    t.round(3);t.batch(1);t.kill(t.spawn());t.c.finalizePlayer(0,true);
    const terminal=t.packets.findLast(p=>p.phase==='victory');assert.deepEqual(terminal.completedWaves,[3]);
    assert.deepEqual(terminal.rewards.remaining,{archangel:7});
});
check('Native save-state retains wave/unit associations and tagged pending spawn entries without awarding twice',()=>{
    const t=waveFixture();t.round(1);t.batch(1);const first=t.spawn();t.batch(1);
    const loaded=waveFixture();loaded.c.warzoneTowersWaves_state=clone(t.c.warzoneTowersWaves_state);
    loaded.spawner.queue=clone(t.spawner.queue);loaded.enemies.push(clone(first));
    loaded.c.warzoneTowersWaves_eventGameLoaded();assert.deepEqual(loaded.clears(),[]);
    loaded.kill(loaded.enemies[0]);loaded.kill(loaded.spawn());assert.deepEqual(loaded.clears(),[1]);
    loaded.c.warzoneTowersWaves_eventGameLoaded();assert.deepEqual(loaded.clears(),[1]);
});
check('Legacy0.25 native saves and failed native spawns do not receive guessed wave credits',()=>{
    const old=waveFixture();old.c.warzoneTowersWaves_state={phase:'active',wave:9,waiting:false,deadline:0,rewardCount:0,rewardPower:0};
    old.c.warzoneTowersWaves_eventGameLoaded();assert.deepEqual(old.clears(),[]);
    const failed=waveFixture();failed.round(2);failed.batch(1);failed.c.failSpawn=true;failed.spawn();
    failed.c.warzoneTowersWaves_emit(true);assert.deepEqual(failed.clears(),[]);
    const partial=waveFixture();partial.round(1);partial.batch(1);partial.kill(partial.spawn());
    partial.c.Template.fromString=()=>null;partial.batch(1);partial.c.warzoneTowersWaves_emit(true);
    assert.deepEqual(partial.clears(),[]);assert.equal(partial.c.warzoneTowersWaves_state.waveRows['1'].failed,true);
});
console.log(JSON.stringify({emulatorUsed:false,gameplayVerified:false,passed:checks.length,checks,
    types:clone(setup().c.wtreward_types)},null,2));

