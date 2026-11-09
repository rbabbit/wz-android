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

function setup() {
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

function check(name, run) {run();checks.push(name);}
check('No selected bonuses leave native rules and rates unchanged', () => {
    const t=setup(),before=clone(t.upgrades),r=t.send('apply-rewards',{rewards:{session:'none'}});
    assert.equal(r.ok,true);t.c.wtreward_tick();assert.equal(t.calls.length,0);assert.deepEqual(t.upgrades,before);
    const ordinary=catalog.buildings.find(b=>b.category==='DEFENCES'&&b.width===1);
    assert.equal(t.send('queue-build',{itemId:ordinary.id,x:15,y:15,workerIds:[1]}).ok,true);
});
check('Supply applies once across repeat commands, state polls and native save-state restore', () => {
    const t=setup(),config={session:'supply',supply:true};
    assert.equal(t.send('apply-rewards',{rewards:config}).ok,true);assert.equal(t.power(),3000);
    t.send('apply-rewards',{rewards:config});t.c.wtreward_tick();assert.equal(t.power(),3000);
    const loaded=setup();loaded.c.wtreward_match=clone(t.c.wtreward_match);loaded.setPower(t.power());
    loaded.c.wtreward_eventGameLoaded();loaded.send('apply-rewards',{rewards:config});assert.equal(loaded.power(),3000);
    assert.equal(loaded.calls.filter(c=>c.kind==='power').length,0);
});
check('Changed session, changed choices, invalid values and excess choices fail closed', () => {
    const t=setup();t.send('apply-rewards',{rewards:{session:'sealed',supply:true}});
    assert.equal(t.send('apply-rewards',{rewards:{session:'another',supply:true}}).reason,'reward-session-conflict');
    assert.equal(t.send('apply-rewards',{rewards:{session:'sealed',fortress:true}}).reason,'reward-config-conflict');
    assert.equal(t.send('apply-rewards',{rewards:{session:'bad',supply:1}}).ok,false);
    assert.equal(t.send('apply-rewards',{rewards:{session:'bad',fortress:true,research:true,supply:true}}).reason,'reward-selection-limit');
    assert.equal(t.power(),3000);
});
check('Research increases both lab and module rates for only the human without compounding', () => {
    const t=setup(),config={session:'research',research:true};t.send('apply-rewards',{rewards:config});
    const rate=t.upgrades[0].Building[t.labName];assert.deepEqual(rate,{ResearchPoints:125,ModuleResearchPoints:63});
    for(let i=0;i<100;i++){t.c.wtreward_tick();t.send('apply-rewards',{rewards:config});}
    assert.deepEqual(rate,{ResearchPoints:125,ModuleResearchPoints:63});
    assert.deepEqual(t.upgrades[1].Building[t.labName],{ResearchPoints:100,ModuleResearchPoints:50});
    // Actual native Compat research applies a base-stat delta to the current value.
    rate.ResearchPoints+=20;rate.ModuleResearchPoints+=5;t.c.wtreward_eventResearched({id:'natural-upgrade'},null,0);
    assert.deepEqual(rate,{ResearchPoints:150,ModuleResearchPoints:69});
    t.c.wtreward_tick();assert.deepEqual(rate,{ResearchPoints:150,ModuleResearchPoints:69});
    const loaded=setup();loaded.c.wtreward_match=clone(t.c.wtreward_match);
    // Native load replays natural research rather than saving custom Upgrades.
    Object.assign(loaded.upgrades[0].Building[loaded.labName],{ResearchPoints:120,ModuleResearchPoints:55});
    loaded.c.wtreward_eventGameLoaded();
    assert.deepEqual(loaded.upgrades[0].Building[loaded.labName],rate);
    loaded.c.wtreward_eventGameLoaded();assert.deepEqual(loaded.upgrades[0].Building[loaded.labName],rate);
    rate.ResearchPoints+=20;t.c.wtreward_tick();assert.equal(rate.ResearchPoints,175);
});
check('Purchased fortress exposes only its own native structure, with a one-foundation limit', () => {
    const t=setup();assert.equal(t.send('apply-rewards',{rewards:{session:'fortress',fortress:true}}).ok,true);
    assert.deepEqual(t.calls.filter(c=>c.kind==='unlock'),[{kind:'unlock',id:fortress,player:0}]);
    assert.equal(t.limits[fortress],1);assert.equal(t.send('state').result.buildings.some(b=>b.id===fortress),true);
    assert.equal(t.send('state').result.nativeBuildOptions.includes(fortress),true);
    assert.equal(t.c.wtreward_canBuild('GuardTower1'), '');
});
check('Accepted FIFO reserves the fortress; cancellation before a foundation releases the slot', () => {
    const t=setup();t.send('apply-rewards',{rewards:{session:'reserve',fortress:true}});
    const first=t.send('queue-build',{itemId:fortress,x:15,y:15,workerIds:[1]});assert.equal(first.ok,true);
    assert.equal(t.send('queue-build',{itemId:fortress,x:22,y:22,workerIds:[1]}).reason,'fortress-reserved');
    assert.equal(t.send('preview-build',{itemId:fortress,x:22,y:22,workerIds:[1]}).reason,'fortress-reserved');
    assert.equal(t.send('cancel-job',{jobId:first.result.id}).ok,true);
    assert.equal(t.send('queue-build',{itemId:fortress,x:22,y:22,workerIds:[1]}).ok,true);
    assert.equal(t.c.wtreward_state().fortressUsed,false);
});
check('A foundation spends the token even if cancelled or destroyed; no rebuild after destruction', () => {
    const t=setup();t.send('apply-rewards',{rewards:{session:'foundation',fortress:true}});
    const pending=t.send('queue-build',{itemId:fortress,x:15,y:15,workerIds:[1]});assert.equal(pending.ok,true);
    const ordinary=catalog.buildings.find(b=>b.category==='DEFENCES'&&b.width===1);
    const later=t.send('queue-build',{itemId:ordinary.id,x:30,y:30,workerIds:[1]});assert.equal(later.ok,true);
    const name=catalog.buildings.find(b=>b.id===fortress).name;
    const foundation={id:201,type:1,player:0,itemId:fortress,name,status:0,x:15,y:15};
    t.structures.push(foundation);t.c.wtreward_tick();assert.equal(t.c.wtreward_state().fortressUsed,true);
    assert.equal(t.limits[fortress],1);assert.equal(t.c.wtreward_canBuild(fortress),'fortress-used');
    t.structures.pop();t.c.wtreward_eventDestroyed(foundation);assert.equal(t.limits[fortress],0);
    assert.equal(t.c.wtcmd_jobs.find(job=>job.id===pending.result.id).status,'cancelled');
    assert.equal(t.c.wtcmd_jobs.find(job=>job.id===later.result.id).status,'queued');
    t.droids[0].order=0;t.c.wtcmd_tickBuilds();assert.equal(t.calls.filter(c=>c.kind==='build').at(-1).id,ordinary.id);
    assert.equal(t.send('queue-build',{itemId:fortress,x:22,y:22,workerIds:[1]}).reason,'fortress-used');
    const loaded=setup();loaded.c.wtreward_match=clone(t.c.wtreward_match);loaded.c.wtreward_eventGameLoaded();
    assert.equal(loaded.limits[fortress],0);assert.equal(loaded.c.wtreward_canBuild(fortress),'fortress-used');
});
check('Destruction before the first timer sample still spends the fortress; enemy destruction does not', () => {
    const t=setup();t.send('apply-rewards',{rewards:{session:'fast-destroy',fortress:true}});
    const name=catalog.buildings.find(b=>b.id===fortress).name;
    t.c.wtreward_eventDestroyed({id:210,type:1,player:1,name});assert.equal(t.c.wtreward_state().fortressUsed,false);
    t.c.wtreward_eventDestroyed({id:211,type:1,player:0,name});assert.equal(t.c.wtreward_state().fortressUsed,true);
    assert.equal(t.limits[fortress],0);
});
check('Normal researched fortress availability and later normal completion retain original limits', () => {
    const t=setup();t.completeResearch();t.available.add(fortress);
    t.send('apply-rewards',{rewards:{session:'natural',fortress:true}});
    assert.equal(t.c.wtreward_state().fortressNatural,true);assert.equal(t.limits[fortress],999);
    assert.equal(t.c.wtreward_canBuild(fortress),'');
    const later=setup();later.send('apply-rewards',{rewards:{session:'later',fortress:true}});
    later.c.wtreward_match.fortressUsed=true;later.c.wtreward_tick();assert.equal(later.limits[fortress],0);
    later.completeResearch();later.c.wtreward_eventResearched({id:'R-Defense-Super-Cannon'},null,0);
    assert.equal(later.limits[fortress],999);assert.equal(later.c.wtreward_canBuild(fortress),'');
});
console.log(JSON.stringify({emulatorUsed:false,gameplayVerified:false,passed:checks.length,checks},null,2));
