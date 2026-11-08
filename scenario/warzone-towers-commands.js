/* Player-command bridge. Orders stay FIFO; no free objects or automatic research. */
namespace("wtcmd_");
var wtcmd_catalog = includeJSON("warzone-towers-catalog.json");
var wtcmd_buildings = {};
var wtcmd_components = {};
var wtcmd_native = {};
var wtcmd_jobs = [];
var wtcmd_workers = {};
var wtcmd_production = {};
var wtcmd_factoryActive = {};
var wtcmd_replies = {};
var wtcmd_replyOrder = [];
var wtcmd_revision = "";
var wtcmd_serial = 0;
var wtcmd_sessionWorkers = {};
var wtcmd_started = false;
var wtcmd_nativeMenu = "";
var wtcmd_finishedUnits = [];
var wtcmd_finishedBuilds = [];
var wtcmd_structureCache = null;
var wtcmd_buildGeneration = 0;
// A display journal for ordinary Ctrl-build input. These entries never issue
// orders: Warzone owns the real queue, pathfinding, power and blueprints.
var wtcmd_nativeSites = [];
var wtcmd_siteHealth = {};

function wtcmd_bindNativeSites(structures)
{
    wtcmd_nativeSites.forEach(function(j){
        if(j.parentId){j.structureId=j.parentId;return;}
        if(j.structureId||j.status==='done'||j.status==='interrupted')return;
        const item=wtcmd_buildings[j.itemId],known=j.knownStructures||[];
        // Native cursor rounding and the terrain observer can disagree at an
        // even footprint's grid boundary. Bind a newly observed foundation,
        // never an older neighbouring building or another journal's target.
        const dx=item.width%2===0?1:0,dy=item.breadth%2===0?1:0;
        const candidates=structures.filter(function(s){return s.name===item.name&&known.indexOf(s.id)<0&&Math.abs(s.x-j.x)<=dx&&Math.abs(s.y-j.y)<=dy&&!wtcmd_nativeSites.some(function(other){return other!==j&&other.structureId===s.id;});});
        candidates.sort(function(a,b){return Math.hypot(a.x-j.x,a.y-j.y)-Math.hypot(b.x-j.x,b.y-j.y)||a.id-b.id;});
        if(candidates.length){j.structureId=candidates[0].id;j.nativeX=candidates[0].x;j.nativeY=candidates[0].y;}
    });
}

function wtcmd_constructorRate(droid)
{
    const group = Stats.Construct || {};
    // Stock trucks and combat engineers use these original construction tools.
    // Droid script objects expose body/propulsion, not their construction slot.
    const tool = /^Cyborg/.test(droid.body) ? "CyborgSpade" : "Spade1Mk1";
    const key = Object.keys(group).filter(function (name) { return group[name].Id === tool; })[0];
    return key ? Number(Upgrades[selectedPlayer].Construct[key].ConstructorPoints || 0) : 0;
}

function wtcmd_constructionState()
{
    const structures = enumStruct(selectedPlayer), trucks = wtcmd_builders();
    wtcmd_bindNativeSites(structures);
    const active = structures.filter(function (s) { return s.status !== BUILT; });
    const assignments = {};
    trucks.filter(function (d) { return d.action === 2 || d.action === 21; }).forEach(function (d) {
        // Public scripts expose the worker action, but not its order target.
        // Associate only a nearby unfinished footprint; never count travellers.
        const nearest = active.map(function (s) {
            const item = wtcmd_catalog.buildings.filter(function (b) { return b.name === s.name; })[0];
            return { s: s, distance: Math.hypot(d.x-s.x,d.y-s.y), reach: Math.max(item ? item.width : 1,item ? item.breadth : 1)/2+2 };
        }).filter(function (v) { return v.distance <= v.reach; }).sort(function (a,b) { return a.distance-b.distance; })[0];
        if (nearest) { const key=String(nearest.s.id);if(!assignments[key])assignments[key]=[];assignments[key].push(d); }
    });
    const rows = active.map(function (s) {
        const journal = wtcmd_nativeSites.filter(function (j) { return s.id===j.structureId&&j.status!=="done"&&j.status!=="interrupted"; })[0];
        const item = journal ? wtcmd_buildings[journal.itemId] : wtcmd_catalog.buildings.filter(function (b) { return b.name === s.name; })[0];
        const workers=assignments[String(s.id)]||[],rate=workers.reduce(function (n,d) { return n+wtcmd_constructorRate(d); },0);
        const health=Number(s.health),previous=wtcmd_siteHealth[String(s.id)];
        const changed=!previous||previous.health!==health;
        wtcmd_siteHealth[String(s.id)]={health:health,changed:changed?gameTime:previous.changed};
        const moduleWork=Boolean(item&&item.category==='MODULES'&&journal);
        const stalled=!changed&&gameTime-previous.changed>=750;
        const waitingPower=(health<=10||moduleWork)&&stalled&&playerPower(selectedPlayer)<Number(item?item.power:0);
        // Foundations start at 10% body. Health gives a coarse, damage-sensitive
        // estimate, not the engine's private currentBuildPts. Label it as such.
        if(moduleWork){
            // A module extends an existing building, whose body is not a fresh
            // 10% foundation. Integrate observed work in simulation time instead.
            const elapsed=journal.sampleAt==null?0:Math.max(0,Math.min(1500,gameTime-journal.sampleAt));
            journal.estimatedPoints=(journal.estimatedPoints||0)+(!waitingPower?elapsed*Math.min(rate,journal.sampleRate||0)/1000:0);
            journal.sampleAt=gameTime;journal.sampleRate=waitingPower?0:rate;
        }
        const progress=Math.max(0,Math.min(.99,moduleWork?journal.estimatedPoints/Math.max(1,item.points):(health-10)/90));
        return {id:s.id,itemId:item?item.id:"",name:item?item.name:s.name||"Structure",x:s.x,y:s.y,
            progress:progress,approximate:true,workers:workers.length,rate:rate,
            status:waitingPower?"waiting-power":rate?"building":"waiting-trucks",
            remaining:!waitingPower&&rate&&item?Math.max(1,Math.ceil(item.points*(1-progress)/rate)):null};
    });
    wtcmd_nativeSites.forEach(function (j) {
        if(j.status==="done"||j.status==="interrupted")return;
        const item=wtcmd_buildings[j.itemId];
        const target=structures.filter(function(s){return s.id===j.structureId;})[0];
        const live=target&&rows.filter(function(r){return r.id===target.id;})[0];
        // Two reserved factory levels share one native parent. Its current
        // construction row belongs only to the active level, not the next one.
        if(j.parentId&&target&&Number(target.modules||0)<j.targetModules&&wtcmd_nativeSites.some(function(other){
            return other!==j&&other.parentId===j.parentId&&other.targetModules<j.targetModules
                && !['done','cancelled','interrupted'].includes(other.status)&&!wtcmd_done(other);
        })){j.idleAt=null;j.status='queued';j.progress=0;j.remaining=null;j.workersActive=0;return;}
        if(live){j.idleAt=null;j.status=live.status;j.observed=true;j.structureId=target.id;j.progress=live.progress;j.remaining=live.remaining;j.workersActive=live.workers;return;}
        if(target&&target.status===BUILT&&(!j.parentId||target.modules>=j.targetModules)){j.status="done";j.completed=gameTime;return;}
        const assigned=trucks.filter(function(d){return j.workers.indexOf(d.id)>=0;});
        const orders=[DORDER_BUILD,DORDER_HELPBUILD,DORDER_LINEBUILD];if(typeof DORDER_BUILDMODULE!=="undefined")orders.push(DORDER_BUILDMODULE);
        // Native FIFO handoff briefly reports idle before the next foundation
        // exists. Require sustained simulation time, not one idle sample.
        const idle=gameTime-j.created>2000&&assigned.every(function(d){return !orders.includes(d.order);});
        if(!idle)j.idleAt=null;else if(j.idleAt==null)j.idleAt=gameTime;
        if(!assigned.length||(idle&&gameTime-j.idleAt>=1200)) {j.status="interrupted";j.remaining=null;return;}
        j.status=wtcmd_nativeSites.some(function(a){return a!==j&&a.created<=j.created&&["building","waiting-power","waiting-trucks"].includes(a.status)&&a.workers.some(function(id){return j.workers.indexOf(id)>=0;});})?"queued":"travelling";
        j.remaining=null;
    });
    return {active:rows,sites:wtcmd_nativeSites.filter(function(j){return !j.completed||gameTime-j.completed<4000;})};
}

function wtcmd_trackSite(command)
{
    const plan=wtcmd_planBuild(command);
    if(plan.error){wtcmd_answer(command,false,plan.error);return;}
    if(wtcmd_nativeSites.some(function(j){return j.itemId===plan.job.itemId&&j.x===plan.job.x&&j.y===plan.job.y&&!['done','interrupted'].includes(j.status);})){wtcmd_answer(command,false,'already-queued');return;}
    wtcmd_nativeSites=wtcmd_nativeSites.filter(function(j){return !['done','interrupted'].includes(j.status);}).slice(-127);
    plan.job.knownStructures=enumStruct(selectedPlayer).filter(function(s){return s.name===wtcmd_buildings[plan.job.itemId].name;}).map(function(s){return s.id;});
    const existing=wtcmd_structAt(plan.job);if(existing&&existing.status!==BUILT)plan.job.structureId=existing.id;
    wtcmd_nativeSites.push(plan.job);
    wtcmd_answer(command,true,'',plan.job);
}

wtcmd_catalog.buildings.forEach(function (item) { wtcmd_buildings[item.id] = item; });
Object.keys(wtcmd_catalog.components).forEach(function (group) {
    wtcmd_catalog.components[group].forEach(function (item) { wtcmd_components[item.id] = item; });
});

function wtcmd_indexStats()
{
    wtcmd_native = {};
    Object.keys(Stats).forEach(function (group) {
        Object.keys(Stats[group]).forEach(function (name) {
            const value = Stats[group][name];
            if (value && value.Id) wtcmd_native[value.Id] = { name: name, group: group, value: value };
        });
    });
    // The stock scripting Stats object is keyed by display name. Two structures
    // named "Tank Traps" overwrite one another there, although both IDs remain
    // in the native build list. Recover same-name IDs from the packaged stats so
    // our picker indices and native choices stay aligned.
    wtcmd_catalog.buildings.forEach(function(item){
        const shared=(Stats.Building||{})[item.name];
        if(!wtcmd_native[item.id]&&shared)wtcmd_native[item.id]={name:item.name,group:"Building",value:Object.assign({},shared,{Id:item.id,BuildPower:item.power})};
    });
}

function wtcmd_isBuilder(droid)
{
    return droid && droid.type === DROID && droid.player === selectedPlayer
        && (droid.droidType === DROID_CONSTRUCT
            || (typeof DROID_CYBORG_CONSTRUCT !== "undefined" && droid.droidType === DROID_CYBORG_CONSTRUCT));
}

function wtcmd_builders()
{
    return enumDroid(selectedPlayer, DROID_ANY).filter(wtcmd_isBuilder);
}

function wtcmd_structAt(job)
{
    if (job.parentId) return getObject(STRUCTURE, selectedPlayer, job.parentId);
    let structures;
    if (wtcmd_structureCache) {
        if (!wtcmd_structureCache[job.itemId]) wtcmd_structureCache[job.itemId] = enumStruct(selectedPlayer, job.itemId);
        structures = wtcmd_structureCache[job.itemId];
    } else structures = enumStruct(selectedPlayer, job.itemId);
    return structures.filter(function (s) {
        return s.x === job.x && s.y === job.y;
    })[0] || null;
}

function wtcmd_done(job)
{
    const structure = wtcmd_structAt(job);
    return structure && structure.status === BUILT
        && (!job.parentId || Number(structure.modules || 0) >= job.targetModules);
}

function wtcmd_openJobs()
{
    return wtcmd_jobs.filter(function (job) { return job.status !== "done" && job.status !== "cancelled"; });
}

function wtcmd_idle(droid)
{
    return droid.order === 0 || droid.order === DORDER_STOP;
}

function wtcmd_partAvailable(id)
{
    return Boolean(wtcmd_components[id] && wtcmd_native[id] && componentAvailable(id));
}

function wtcmd_selectedUnits()
{
    return enumSelected().filter(function(d){return d.type===DROID&&d.player===selectedPlayer;}).map(function(d){return {id:d.id,x:d.x,y:d.y,z:d.z,order:d.order,constructor:wtcmd_isBuilder(d)};});
}
function wtcmd_templateKey(t)
{
    return t.id || "native:" + JSON.stringify([t.fullname||t.name,t.body,t.propulsion,t.weapons||[],t.construct||"",t.sensor||"",t.repair||"",t.brain||"",t.ecm||""]);
}
function wtcmd_capacityWait(design)
{
    if (!design || typeof getDroidLimit !== "function") return null;
    const units=enumDroid(selectedPlayer,DROID_ANY),general=getDroidLimit(selectedPlayer);
    if (units.length>=general) return {kind:"units",current:units.length,limit:general};
    if (design.droidType===DROID_CONSTRUCT) {
        const count=units.filter(wtcmd_isBuilder).length,limit=getDroidLimit(selectedPlayer,DROID_CONSTRUCT);
        if(count>=limit)return {kind:"constructors",current:count,limit:limit};
    }
    if (typeof DROID_COMMAND!=="undefined" && design.droidType===DROID_COMMAND) {
        const count=units.filter(function(d){return d.droidType===DROID_COMMAND;}).length,limit=getDroidLimit(selectedPlayer,DROID_COMMAND);
        if(count>=limit)return {kind:"commanders",current:count,limit:limit};
    }
    return null;
}

function wtcmd_moduleSpec(structure)
{
    if (!structure) return null;
    if (structure.stattype === RESEARCH_LAB) return { itemId: "A0ResearchFacility", moduleId: "A0ResearchModule1", maximum: 1 };
    if (structure.stattype === POWER_GEN) return { itemId: "A0PowerGenerator", moduleId: "A0PowMod1", maximum: 1 };
    if (structure.stattype === FACTORY) return { itemId: "A0LightFactory", moduleId: "A0FacMod1", maximum: 2 };
    if (structure.stattype === VTOL_FACTORY) return { itemId: "A0VTolFactory1", moduleId: "A0FacMod1", maximum: 2 };
    return null;
}

function wtcmd_moduleTarget(structure)
{
    const spec = wtcmd_moduleSpec(structure);
    if (!spec || structure.player !== selectedPlayer) return null;
    const item = wtcmd_buildings[structure.name] || wtcmd_catalog.buildings.filter(function (b) {
        return b.category !== "MODULES" && b.name === structure.name;
    })[0] || wtcmd_buildings[spec.itemId];
    const modules = Number(structure.modules || 0), pending = {};
    const nativeOnly = wtcmd_nativeSites.filter(function (site) {
        return !wtcmd_jobs.some(function (job) { return job.id === site.id; });
    });
    wtcmd_openJobs().concat(nativeOnly).forEach(function (job) {
        if (job.parentId === structure.id && !["done", "cancelled", "interrupted"].includes(job.status)
            && !wtcmd_done(job)) pending[job.id] = job;
    });
    const jobs = Object.keys(pending).map(function (id) { return pending[id]; });
    // Native capacity includes the module being built. Reserve only levels not
    // yet reflected by that capacity, rather than counting the active job twice.
    const occupied = jobs.reduce(function (n, job) { return Math.max(n, Number(job.targetModules || 0)); }, modules);
    const upgrading = structure.status !== BUILT && modules > 0;
    let status = jobs.length ? structure.status === BUILT ? "queued" : "upgrading" : upgrading ? "upgrading" : "eligible";
    let statusReason = "";
    if (structure.status !== BUILT && !upgrading && !jobs.length) { status = "unfinished"; statusReason = "module-parent"; }
    else if (occupied >= spec.maximum) {
        if (jobs.length || upgrading) statusReason = "module-pending";
        else { status = "full"; statusReason = "module-limit"; }
    }
    else if (!wtcmd_native[spec.moduleId] || !isStructureAvailable(spec.moduleId, selectedPlayer)) {
        status = "unavailable"; statusReason = "unavailable";
    }
    return { id: structure.id, itemId: item.id, name: structure.name || item.name, kind: item.kind,
        moduleId: spec.moduleId, x: structure.x, y: structure.y, z: Number(structure.z || 0),
        width: item.width, breadth: item.breadth, modules: modules, maximum: spec.maximum,
        reserved: Math.max(0, occupied - modules), nativeStatus: structure.status,
        status: status, eligible: !statusReason, statusReason: statusReason };
}

function wtcmd_moduleTargets()
{
    return enumStruct(selectedPlayer).map(wtcmd_moduleTarget).filter(Boolean).sort(function (a, b) { return a.id - b.id; });
}

function wtcmd_nativeBuildOptions()
{
    const structures=enumStruct(selectedPlayer),available=Object.keys(wtcmd_native).filter(function(id){return wtcmd_native[id].group==="Building"&&isStructureAvailable(id,selectedPlayer);}).sort();
    const count=function(kind){return structures.filter(function(b){return b.stattype===kind;}).length;};
    const limit=function(kind,id){return count(kind)||isStructureAvailable(id,selectedPlayer)?getStructureLimit(id,selectedPlayer):0;};
    const modules=function(kind){return structures.filter(function(b){return b.stattype===kind&&b.status===BUILT;}).reduce(function(n,b){return n+(b.modules||0);},0);};
    return available.filter(function(id){
        const item=wtcmd_buildings[id];if(!item)return wtcmd_native[id].value.Type==="Demolish";
        if(/CORNER|WALLCORNER/.test(item.kind))return false;
        if(item.kind==='RESEARCH MODULE')return count(RESEARCH_LAB)>0&&modules(RESEARCH_LAB)<getStructureLimit('A0ResearchFacility',selectedPlayer);
        if(item.kind==='FACTORY MODULE')return count(FACTORY)+count(VTOL_FACTORY)>0&&modules(FACTORY)+modules(VTOL_FACTORY)<2*(limit(FACTORY,'A0LightFactory')+limit(VTOL_FACTORY,'A0VTolFactory1'));
        if(item.kind==='POWER MODULE')return count(POWER_GEN)>0&&modules(POWER_GEN)<getStructureLimit('A0PowerGenerator',selectedPlayer);
        return true;
    });
}

// Read-only observations for facility taps and the current-work footer rail.
// No selections, orders, research assignments or game rules are changed here.
function wtcmd_facilityTargets()
{
    return enumStruct(selectedPlayer).filter(function(s) {
        return s.status === BUILT && [RESEARCH_LAB, FACTORY, CYBORG_FACTORY, VTOL_FACTORY].indexOf(s.stattype) >= 0;
    }).map(function(s) {
        const kind = s.stattype === RESEARCH_LAB ? 'research' : s.stattype === CYBORG_FACTORY ? 'cyborg' : s.stattype === VTOL_FACTORY ? 'vtol' : 'factory';
        const itemId = kind === 'research' ? 'A0ResearchFacility' : kind === 'cyborg' ? 'A0CyborgFactory' : kind === 'vtol' ? 'A0VTolFactory1' : 'A0LightFactory';
        const item = wtcmd_buildings[itemId];
        return {id:s.id, kind:kind, itemId:itemId, x:s.x, y:s.y, z:s.z, modules:s.modules || 0,
            moduleId:kind === 'research' ? 'A0ResearchModule1' : kind === 'cyborg' ? '' : 'A0FacMod1',
            width:item ? item.width : 1, breadth:item ? item.breadth : 1, ready:true, nativeStatus:s.status};
    }).sort(function(a,b) { return a.id-b.id; });
}

function wtcmd_facilityBlockers(targets)
{
    if (!targets.length || typeof enumRange !== 'function') return [];
    return enumRange(Math.floor(mapWidth/2), Math.floor(mapHeight/2), Math.max(mapWidth,mapHeight), ALL_PLAYERS, true)
        .filter(function(d) { return d.type === DROID && targets.some(function(t) { return Math.abs(d.x-t.x) <= 5 && Math.abs(d.y-t.y) <= 5; }); })
        .map(function(d) { return {id:d.id, x:d.x, y:d.y, z:d.z, bodySize:d.bodySize || 1}; });
}

function wtcmd_currentProduction(factory)
{
    if (typeof getDroidProduction !== 'function' || factory.status !== BUILT) return null;
    const current = getDroidProduction(factory);
    if (!current) return null;
    const source = {name:current.name, body:current.body, propulsion:current.propulsion, droidType:current.droidType,
        weapons:(current.weapons || []).map(function(w) { return typeof w === 'string' ? w : w.id || w.name; })};
    ['construct','repair','brain','ecm','sensor'].forEach(function(key) { source[key] = current[key]; });
    return wtcmd_templateParts(source);
}

function wtcmd_snapshot()
{
    const construction = wtcmd_constructionState();
    const buildings = wtcmd_catalog.buildings.filter(function (item) {
        return wtcmd_native[item.id] && isStructureAvailable(item.id, selectedPlayer);
    }).map(function (item) {
        return { id: item.id, power: Number(wtcmd_native[item.id].value.BuildPower || 0) };
    });
    const parts = Object.keys(wtcmd_components).filter(wtcmd_partAvailable);
    // buildDroid may leave equivalent generated templates with empty engine IDs.
    // Present one producible entry per stable key rather than repeated cards.
    const templateKeys = new Set();
    const templates = enumTemplates(selectedPlayer).filter(wtcmd_templateAvailable).filter(function (t) {
        const d=wtcmd_templateParts(t),key=JSON.stringify([d.body,d.propulsion,d.turrets,d.droidType]);
        if (templateKeys.has(key)) return false;
        templateKeys.add(key); return true;
    });
    const factories = enumStruct(selectedPlayer).filter(function (s) {
        return s.stattype === FACTORY || s.stattype === CYBORG_FACTORY || s.stattype === VTOL_FACTORY;
    }).sort(function (a, b) { return a.id - b.id; }).map(function (s, index) {
        return { id: s.id, number: index + 1, x: s.x, y: s.y, type: s.stattype,
            kind: s.stattype === CYBORG_FACTORY ? "Cyborg factory" : s.stattype === VTOL_FACTORY ? "VTOL factory" : "Factory",
            templates: templates.filter(function (t) { return wtcmd_factoryAllows(wtcmd_templateParts(t), s); }).map(wtcmd_templateKey),
            modules: s.modules || 0, ready: s.status === BUILT, idle: structureIdle(s),
            active: wtcmd_factoryActive[String(s.id)] || null,
            currentProduction: wtcmd_currentProduction(s),
            waitingReason: wtcmd_capacityWait((wtcmd_factoryActive[String(s.id)] || (wtcmd_production[String(s.id)] || [])[0])?.design),
            queue: wtcmd_production[String(s.id)] || [] };
    });
    const facilityTargets = wtcmd_facilityTargets();
    return { version: 1, gameTime: gameTime, player: selectedPlayer, power: playerPower(selectedPlayer),
        facilityTargets:facilityTargets, facilityBlockers:wtcmd_facilityBlockers(facilityTargets),
        mapWidth: mapWidth, mapHeight: mapHeight, alwaysQueue: true,
        researchQueues: enumStruct(selectedPlayer, RESEARCH_LAB).map(function(lab) {
            return {labId: lab.id, topicIds: (typeof blockNightV28Queues === "object" && blockNightV28Queues[String(lab.id)] || []).slice()};
        }),
        hasHQ: enumStruct(selectedPlayer, HQ).some(function (s) { return s.status === BUILT; }),
        selectedUnits: wtcmd_selectedUnits(),
        construction: construction.active, constructionSites: construction.sites,
        nativeBuildOptions: wtcmd_nativeBuildOptions(), moduleTargets: wtcmd_moduleTargets(), buildings: buildings, parts: parts, trucks: wtcmd_builders().map(function (d) {
            return { id: d.id, x: d.x, y: d.y, z: d.z, selected: Boolean(d.selected), order: d.order, action:d.action,rate:wtcmd_constructorRate(d),
                building: d.order===DORDER_BUILD||d.order===DORDER_HELPBUILD||(typeof DORDER_LINEBUILD!=="undefined"&&d.order===DORDER_LINEBUILD)||(typeof DORDER_BUILDMODULE!=="undefined"&&d.order===DORDER_BUILDMODULE),
                queued: (wtcmd_workers[String(d.id)] || []).length };
        }), jobs: wtcmd_openJobs(), factories: factories, nativeMenu: wtcmd_nativeMenu,
        templates: templates.map(function(t){return Object.assign({},t,{id:wtcmd_templateKey(t)});}), finishedUnits: wtcmd_finishedUnits.slice(-16), finishedBuilds: wtcmd_finishedBuilds.slice(-32) };
}

function wtcmd_answer(command, ok, reason, result)
{
    const response = { nonce: command.nonce, action: command.action, ok: ok,
        reason: reason || "", result: result || null, gameTime: gameTime };
    wtcmd_replies[command.nonce] = response;
    wtcmd_replyOrder.push(command.nonce);
    while (wtcmd_replyOrder.length > 128) delete wtcmd_replies[wtcmd_replyOrder.shift()];
    dump("WTCMD:" + JSON.stringify(response));
}

function wtcmd_overlap(a, b)
{
    const aw = wtcmd_buildings[a.itemId], bw = wtcmd_buildings[b.itemId];
    if (!aw || !bw || a.parentId || b.parentId) return false;
    const ax = a.x - Math.floor(aw.width / 2), ay = a.y - Math.floor(aw.breadth / 2);
    const bx = b.x - Math.floor(bw.width / 2), by = b.y - Math.floor(bw.breadth / 2);
    return ax < bx + bw.width && bx < ax + aw.width && ay < by + bw.breadth && by < ay + aw.breadth;
}

function wtcmd_chooseWorkers(command, x, y)
{
    const builders = wtcmd_builders();
    const selected = enumSelected().filter(wtcmd_isBuilder);
    // The mobile build catalogue supplies its local group directly; opening
    // stock selection widgets just to assign these trucks stalls the live view.
    let candidates = Array.isArray(command.workerIds)
        ? builders.filter(function (d) { return command.workerIds.indexOf(d.id) >= 0; }) : selected;
    let automatic = false;
    if (!candidates.length && !Array.isArray(command.workerIds)) {
        automatic = true;
        const pinned = wtcmd_sessionWorkers[String(command.session || "")] || [];
        candidates = builders.filter(function (d) { return pinned.indexOf(d.id) >= 0; });
        if (!candidates.length) candidates = builders;
    }
    candidates = candidates.filter(function (d) { return droidCanReach(d, x, y); });
    candidates.sort(function (a, b) {
        const da = (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y);
        const db = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
        return da - db || a.id - b.id;
    });
    if (automatic && candidates.length) {
        const anchor = candidates[0];
        candidates = candidates.filter(function (d) { return Math.hypot(d.x - anchor.x, d.y - anchor.y) <= 8; });
    }
    return { units: candidates, automatic: automatic };
}

function wtcmd_planBuild(command)
{
    const item = wtcmd_buildings[String(command.itemId || "")];
    let x = Number(command.x), y = Number(command.y), parent = null, target = null;
    if (!item || !wtcmd_native[item.id]) return { error: "invalid" };
    if (item.category === "MODULES") {
        if (Object.prototype.hasOwnProperty.call(command, "parentId")) {
            const id = Number(command.parentId);
            if (!Number.isInteger(id) || id <= 0) return { error: "module-parent" };
            parent = getObject(STRUCTURE, selectedPlayer, id);
            const spec = wtcmd_moduleSpec(parent);
            if (!parent || parent.player !== selectedPlayer || !spec || spec.moduleId !== item.id) return { error: "module-parent" };
        } else {
            parent = enumStruct(selectedPlayer).filter(function (s) {
                const spec = wtcmd_moduleSpec(s);
                return s.player === selectedPlayer && spec && spec.moduleId === item.id
                    && Math.abs(s.x - x) <= 1 && Math.abs(s.y - y) <= 1;
            }).sort(function (a, b) {
                return Math.abs(a.x - x) + Math.abs(a.y - y) - Math.abs(b.x - x) - Math.abs(b.y - y) || a.id - b.id;
            })[0];
        }
        if (!parent) return { error: "module-parent" };
        target = wtcmd_moduleTarget(parent);
        if (!target.eligible) return { error: target.statusReason };
        x = parent.x; y = parent.y;
    }
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return { error: "invalid" };
    if (!isStructureAvailable(item.id, selectedPlayer)) return { error: "unavailable" };
    if (wtcmd_openJobs().length >= 256) return { error: "queue-full" };
    const choice = wtcmd_chooseWorkers(command, x, y);
    if (!choice.units.length) return { error: wtcmd_builders().length ? "unreachable" : "no-truck" };
    const job = { id: String(command.nonce), itemId: item.id, x: x, y: y,
        workers: choice.units.map(function (d) { return d.id; }), automatic: choice.automatic,
        status: "queued", created: gameTime, attempts: {}, issued: {}, parentId: 0, targetModules: 0, reason: "" };
    if (item.category === "MODULES") {
        job.parentId = parent.id; job.x = parent.x; job.y = parent.y;
        job.targetModules = target.modules + target.reserved + 1;
    } else {
        if (wtcmd_openJobs().some(function (pending) { return wtcmd_overlap(job, pending); })) return { error: "already-queued" };
        const existing = wtcmd_structAt(job);
        if (existing && existing.status === BUILT) return { error: "occupied" };
        if (!existing) {
            const left = x - Math.floor(item.width / 2), top = y - Math.floor(item.breadth / 2);
            if (left < 0 || top < 0 || left + item.width > mapWidth || top + item.breadth > mapHeight) return { error: "invalid-site" };
            for (let tx = left; tx < left + item.width; tx++) for (let ty = top; ty < top + item.breadth; ty++) {
                if (terrainType(tx, ty) === TER_WATER || terrainType(tx, ty) === TER_CLIFFFACE) return { error: "invalid-site" };
            }
            const location = pickStructLocation(choice.units[0], item.id, left, top, -1);
            if (!location || location.x !== x || location.y !== y) return { error: "invalid-site" };
        }
        const limit = getStructureLimit(item.id, selectedPlayer);
        const reserved = wtcmd_openJobs().filter(function (j) { return j.itemId === item.id && !wtcmd_structAt(j); }).length;
        if (!existing && enumStruct(selectedPlayer, item.id).length + reserved >= limit) return { error: "structure-limit" };
    }
    return { job: job };
}

function wtcmd_queueBuild(command)
{
    const plan = wtcmd_planBuild(command);
    if (plan.error) { wtcmd_answer(command, false, plan.error); return; }
    const job = plan.job;
    wtcmd_jobs.push(job);
    // Reuse the construction journal for live travel/progress/module display.
    // This copy observes the real orders; it never drives the worker queue.
    const journal = Object.assign({}, job, { workers: job.workers.slice(),
        knownStructures: enumStruct(selectedPlayer).filter(function (s) {
            return s.name === wtcmd_buildings[job.itemId].name;
        }).map(function (s) { return s.id; }) });
    const existing = wtcmd_structAt(job);
    if (existing && existing.status !== BUILT) journal.structureId = existing.id;
    wtcmd_nativeSites = wtcmd_nativeSites.filter(function (j) { return !['done','interrupted'].includes(j.status); });
    wtcmd_nativeSites.push(journal);
    job.workers.forEach(function (id) {
        const key = String(id); if (!wtcmd_workers[key]) wtcmd_workers[key] = [];
        wtcmd_workers[key].push(job.id);
    });
    if (job.automatic && command.session) wtcmd_sessionWorkers[String(command.session)] = job.workers.slice();
    wtcmd_answer(command, true, "queued", job);
    wtcmd_tickBuilds();
}

function wtcmd_finishJob(job, status)
{
    if (status === "done" && job.status !== "done") wtcmd_finishedBuilds.push({
        id: job.id, itemId: job.itemId, x: job.x, y: job.y, workers: job.workers.slice(), gameTime: gameTime });
    wtcmd_finishedBuilds = wtcmd_finishedBuilds.slice(-32);
    job.status = status;
    Object.keys(wtcmd_workers).forEach(function (key) {
        wtcmd_workers[key] = wtcmd_workers[key].filter(function (id) { return id !== job.id; });
    });
}

function wtcmd_stopWorkers(ids)
{
    const stopped = {};
    ids.forEach(function (id) { stopped[String(id)] = true; wtcmd_workers[String(id)] = []; });
    wtcmd_openJobs().forEach(function (job) {
        job.workers = job.workers.filter(function (id) { return !stopped[String(id)]; });
        if (!job.workers.length) wtcmd_finishJob(job, "cancelled");
    });
    Object.keys(wtcmd_sessionWorkers).forEach(function (key) {
        wtcmd_sessionWorkers[key] = wtcmd_sessionWorkers[key].filter(function (id) { return !stopped[String(id)]; });
    });
}

function wtcmd_activeAutoWorkers()
{
    const ids = {};
    wtcmd_openJobs().filter(function (j) { return j.automatic; }).forEach(function (j) {
        j.workers.forEach(function (id) { ids[String(id)] = true; });
    });
    return wtcmd_builders().filter(function (d) { return ids[String(d.id)]; });
}

function wtcmd_tickBuilds()
{
    const outer = wtcmd_structureCache;
    wtcmd_structureCache = outer || {};
    try { wtcmd_tickBuildsImpl(); } finally { wtcmd_structureCache = outer; }
}

function wtcmd_tickBuildsImpl()
{
    wtcmd_openJobs().forEach(function (job) { if (wtcmd_done(job)) wtcmd_finishJob(job, "done"); });
    const builders = wtcmd_builders();
    const alive = {};
    builders.forEach(function (d) { alive[String(d.id)] = d; });
    wtcmd_openJobs().forEach(function (job) {
        job.workers = job.workers.filter(function (id) { return Boolean(alive[String(id)]); });
        if (!job.workers.length) { job.status = "blocked"; job.reason = "builder-lost"; }
    });
    builders.forEach(function (droid) {
        const ids = wtcmd_workers[String(droid.id)] || [];
        if (!ids.length) return;
        const job = wtcmd_jobs.filter(function (j) { return j.id === ids[0]; })[0];
        if (!job || job.status === "blocked") return;
        const key = String(droid.id);
        // A new native move/stop/other order overrides this truck's build FIFO,
        // just as it overrides ordinary Ctrl-build orders. Never restart the
        // old plan after the player's replacement movement finishes.
        const building = droid.order === DORDER_BUILD || droid.order === DORDER_HELPBUILD
            || droid.order === DORDER_LINEBUILD
            || (typeof DORDER_BUILDMODULE !== "undefined" && droid.order === DORDER_BUILDMODULE);
        if (job.issued[key] && droid.order !== 0 && !building) {
            wtcmd_stopWorkers([droid.id]);return;
        }
        if (!wtcmd_idle(droid)) return;
        if (job.issued[key] && gameTime - job.issued[key] < 1200) return;
        if ((job.attempts[key] || 0) >= 3) { job.status = "blocked"; job.reason = "build-blocked"; return; }
        const existing = wtcmd_structAt(job);
        // Module levels serialize per parent even when different worker groups
        // queue them. A group may still join the level already being built.
        if (job.parentId && existing && job.targetModules > Number(existing.modules || 0)
            && (existing.status !== BUILT || Number(existing.modules || 0) < job.targetModules - 1)) return;
        let accepted;
        if (existing && !job.parentId) accepted = orderDroidObj(droid, DORDER_HELPBUILD, existing);
        else accepted = orderDroidBuild(droid, DORDER_BUILD, job.itemId, job.x, job.y);
        job.attempts[key] = (job.attempts[key] || 0) + 1; job.issued[key] = gameTime;
        if (accepted) job.status = "working";
        else { job.status = "blocked"; job.reason = "engine-rejected"; }
    });
    if (wtcmd_jobs.length > 320) wtcmd_jobs = wtcmd_jobs.filter(function (job) {
        return (job.status !== "done" && job.status !== "cancelled") || gameTime - job.created < 10000;
    });
}

function wtcmd_validateDesign(request, requireHQ)
{
    if (!request || typeof request !== "object") return { error: "invalid" };
    const name = String(request.name || "").replace(/[\x00-\x1f]/g, " ").trim().slice(0, 48);
    const body = String(request.body || ""), propulsion = String(request.propulsion || "");
    const turrets = Array.isArray(request.turrets) ? request.turrets.map(String) : [];
    if (!name || !body || !propulsion || !turrets.length || turrets.length > 3) return { error: "incomplete-design" };
    if (requireHQ && !enumStruct(selectedPlayer, HQ).some(function (s) { return s.status === BUILT; })) return { error: "hq-required" };
    const b = wtcmd_components[body], p = wtcmd_components[propulsion];
    if (!b || b.group !== "Body" || !p || p.group !== "Propulsion"
        || !wtcmd_partAvailable(body) || !wtcmd_partAvailable(propulsion)
        || turrets.some(function (id) { return !wtcmd_partAvailable(id); })) return { error: "components-unavailable" };
    const first = wtcmd_components[turrets[0]];
    const slots = wtcmd_native[body].value.WeaponSlots || b.slots || 1;
    if (turrets.length > slots || first.group === "Body" || first.group === "Propulsion"
        || (first.group !== "Weapon" && turrets.length !== 1)
        || turrets.some(function (id) { return wtcmd_components[id].group !== first.group; })) return { error: "incompatible-design" };
    const native = makeTemplate.apply(null, [selectedPlayer, name, body, propulsion, null].concat(turrets));
    if (!native || (first.group === "Weapon" && native.weapons.length !== turrets.length)) return { error: "incompatible-design" };
    return { design: { id: String(request.id || "").slice(0, 80), name: name, body: body,
        propulsion: propulsion, turrets: turrets, cost: native.cost, points: native.points,
        droidType: native.droidType, native: native } };
}

function wtcmd_templateParts(template)
{
    let turrets = template.weapons && template.weapons.length ? template.weapons.slice() : [];
    if (!turrets.length) {
        ["construct", "repair", "brain", "ecm", "sensor"].some(function (key) {
            const id = template[key];
            if (id && !/null/i.test(id)) { turrets = [id]; return true; }
            return false;
        });
    }
    return { name: String(template.fullname || template.name).replace(/(?: · F\d+)+$/, ""), body: template.body,
        propulsion: template.propulsion, turrets: turrets, cost: template.cost,
        points: template.points, droidType: template.droidType };
}

function wtcmd_templateAvailable(template)
{
    const d = wtcmd_templateParts(template);
    return [d.body, d.propulsion].concat(d.turrets).every(function (id) {
        return wtcmd_native[id] && componentAvailable(id);
    });
}

function wtcmd_factoryAllows(design, factory)
{
    const cyborg = /cyborg/i.test(design.body) || /cyborg/i.test(design.propulsion);
    const propulsion = wtcmd_components[design.propulsion];
    const flying = /v-tol/i.test(design.propulsion) || (propulsion && propulsion.propulsionType === "Lift");
    if (cyborg) return factory.stattype === CYBORG_FACTORY;
    if (factory.stattype === CYBORG_FACTORY) return false;
    if (flying !== (factory.stattype === VTOL_FACTORY)) return false;
    const body = wtcmd_native[design.body];
    // Ordinary factories gain one body size per module. Native buildDroid
    // remains the final authority for every factory and component combination.
    return factory.stattype !== FACTORY || !body || body.value.Size === undefined
        || body.value.Size <= Number(factory.modules || 0);
}

function wtcmd_queueProduction(command)
{
    const factory = getObject(STRUCTURE, selectedPlayer, Number(command.factoryId));
    if (!factory || factory.player !== selectedPlayer || factory.status !== BUILT
        || [FACTORY, CYBORG_FACTORY, VTOL_FACTORY].indexOf(factory.stattype) < 0) {
        wtcmd_answer(command, false, "factory-missing"); return;
    }
    let design;
    if (command.templateId) {
        const native = enumTemplates(selectedPlayer).filter(function (t) { return wtcmd_templateKey(t) === command.templateId; })[0];
        if (!native || !wtcmd_templateAvailable(native)) { wtcmd_answer(command, false, "template-unavailable"); return; }
        design = wtcmd_templateParts(native);
    } else {
        // A stored factory template can contain native systems (e.g. cyborg
        // bodies) outside the custom designer catalogue. Match a currently
        // available engine template before accepting it; storage never grants
        // components or bypasses normal factory/module/research validation.
        const saved = command.design;
        const match = saved && saved.factoryTemplate && Array.isArray(saved.turrets)
            ? enumTemplates(selectedPlayer).find(function (t) {
                const d = wtcmd_templateParts(t);
                return wtcmd_templateAvailable(t) && d.body === saved.body && d.propulsion === saved.propulsion
                    && JSON.stringify(d.turrets) === JSON.stringify(saved.turrets);
            }) : null;
        if (match) {
            design = wtcmd_templateParts(match);
            design.name = String(saved.name || design.name).replace(/[\x00-\x1f]/g, " ").trim().slice(0, 48);
            if (!design.name) { wtcmd_answer(command, false, "incomplete-design"); return; }
        } else {
            const validation = wtcmd_validateDesign(command.design, false);
            if (validation.error) { wtcmd_answer(command, false, validation.error); return; }
            design = validation.design;
        }
    }
    const count = Number(command.count || 1);
    if (!wtcmd_factoryAllows(design, factory)) { wtcmd_answer(command, false, "factory-incompatible"); return; }
    if (!Number.isInteger(count) || count < 1 || count > 20) { wtcmd_answer(command, false, "invalid"); return; }
    const key = String(factory.id);
    if (!wtcmd_production[key]) wtcmd_production[key] = [];
    if (wtcmd_production[key].length + count > 64) { wtcmd_answer(command, false, "queue-full"); return; }
    for (let i = 0; i < count; i++) wtcmd_production[key].push({
        id: command.nonce + "-" + i, design: JSON.parse(JSON.stringify(design)), status: "queued", reason: "" });
    wtcmd_answer(command, true, "queued", { factoryId: factory.id, count: count });
    wtcmd_tickProduction();
}

function wtcmd_tickProduction()
{
    const factories = enumStruct(selectedPlayer).filter(function (s) {
        return [FACTORY, CYBORG_FACTORY, VTOL_FACTORY].indexOf(s.stattype) >= 0;
    }).sort(function (a, b) { return a.id - b.id; });
    factories.forEach(function (factory, index) {
        const key = String(factory.id), jobs = wtcmd_production[key] || [];
        if (factory.status !== BUILT || !structureIdle(factory)) return;
        const previous = wtcmd_factoryActive[key];
        if (previous && gameTime - previous.started < 1200) return;
        if (previous) {
            // Production was cancelled through the ordinary factory controls.
            previous.status = "cancelled"; delete wtcmd_factoryActive[key];
        }
        if (!jobs.length || jobs[0].status === "blocked") return;
        const job = jobs[0], d = job.design;
        if(wtcmd_capacityWait(d)){job.status="waiting";job.reason="unit-capacity";return;}
        job.status="queued";job.reason="";
        // buildDroid replaces equal-name templates. A stable factory suffix
        // prevents production at one factory cancelling another factory's unit.
        const nativeName = d.name + " · F" + factory.id;
        let accepted = false;
        try { accepted = buildDroid.apply(null, [factory, nativeName, d.body, d.propulsion, null, ""].concat(d.turrets)); }
        catch (_) { /* Native validation can reject an incompatible factory. Keep its queue. */ }
        if (accepted) {
            jobs.shift(); job.started = gameTime; job.status = "producing";
            wtcmd_factoryActive[key] = job;
        } else { job.status = "blocked"; job.reason = "factory-incompatible"; }
    });
}

function wtcmd_poll()
{
    if (!wtcmd_started) return;
    let file;
    try { file = includeJSON("warzone-towers-command.json"); } catch (_) { return; }
    if (!file || !file.revision || file.revision === wtcmd_revision || !Array.isArray(file.commands)) return;
    wtcmd_revision = file.revision;
    const outer = wtcmd_structureCache;
    wtcmd_structureCache = outer || {};
    try { file.commands.slice(0, 8).forEach(function (command) {
        if (!command || typeof command.nonce !== "string" || !/^[a-zA-Z0-9_-]{1,96}$/.test(command.nonce)) return;
        if (wtcmd_replies[command.nonce]) { dump("WTCMD:" + JSON.stringify(wtcmd_replies[command.nonce])); return; }
        try {
            if (command.action === "state") wtcmd_answer(command, true, "", wtcmd_snapshot());
            else if (command.action === "track-site") wtcmd_trackSite(command);
            else if (command.action === "queue-build") wtcmd_queueBuild(command);
            else if (command.action === "preview-build") {
                const plan = wtcmd_planBuild(command);
                wtcmd_answer(command, !plan.error, plan.error, plan.job || null);
            }
            else if (command.action === "validate-design" || command.action === "save-design") {
                const validation = wtcmd_validateDesign(command.design, true);
                wtcmd_answer(command, !validation.error, validation.error, validation.design || null);
            }
            else if (command.action === "queue-production") wtcmd_queueProduction(command);
            else if (command.action === "cancel-job" || command.action === "retry-job") {
                const job = wtcmd_openJobs().filter(function (j) { return j.id === command.jobId; })[0];
                if (!job) { wtcmd_answer(command, false, "job-missing"); return; }
                if (command.action === "cancel-job") {
                    job.workers.forEach(function (id) {
                        const droid = getObject(DROID, selectedPlayer, id), ids = wtcmd_workers[String(id)] || [];
                        if (droid && ids[0] === job.id && [DORDER_BUILD, DORDER_HELPBUILD].indexOf(droid.order) >= 0) orderDroid(droid, DORDER_STOP);
                    });
                    wtcmd_finishJob(job, "cancelled");
                } else {
                    const choice = wtcmd_chooseWorkers({}, job.x, job.y);
                    if (!choice.units.length) { wtcmd_answer(command, false, "no-truck"); return; }
                    Object.keys(wtcmd_workers).forEach(function (key) { wtcmd_workers[key] = wtcmd_workers[key].filter(function (id) { return id !== job.id; }); });
                    job.workers = choice.units.map(function (d) { return d.id; });job.attempts = {};job.issued = {};job.status = "queued";job.reason = "";
                    job.workers.forEach(function (id) { const key = String(id);if (!wtcmd_workers[key]) wtcmd_workers[key] = [];wtcmd_workers[key].push(job.id); });
                }
                wtcmd_answer(command, true, "", job);
            }
            else if (command.action === "remove-production") {
                const factory = getObject(STRUCTURE, selectedPlayer, Number(command.factoryId));
                if (!factory || [FACTORY, CYBORG_FACTORY, VTOL_FACTORY].indexOf(factory.stattype) < 0) {
                    wtcmd_answer(command, false, "factory-missing"); return;
                }
                const ids = Array.isArray(command.jobIds) ? command.jobIds : [command.jobId];
                if (!ids.length || ids.length > 64 || ids.some(function (id) {
                    return typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id);
                })) { wtcmd_answer(command, false, "invalid"); return; }
                const key = String(factory.id), jobs = wtcmd_production[key] || [];
                const requested = new Set(ids), removed = jobs.filter(function (job) { return requested.has(job.id); });
                // A unit may have started since the player touched its waiting group.
                // Remove only exact IDs still waiting; active production is never touched.
                if (!removed.length) { wtcmd_answer(command, false, "job-missing"); return; }
                wtcmd_production[key] = jobs.filter(function (job) { return !requested.has(job.id); });
                wtcmd_answer(command, true, "waiting-units-removed", {
                    factoryId: factory.id, jobIds: removed.map(function (job) { return job.id; })
                });
            }
            else if (command.action === "clear-production") {
                const factory = getObject(STRUCTURE, selectedPlayer, Number(command.factoryId));
                if (!factory) { wtcmd_answer(command, false, "factory-missing"); return; }
                wtcmd_production[String(factory.id)] = [];
                wtcmd_answer(command, true, "queued-cleared");
            }
            else if (command.action === "retry-production") {
                const jobs = wtcmd_production[String(Number(command.factoryId))] || [];
                if (jobs.length) { jobs[0].status = "queued";jobs[0].reason = ""; }
                wtcmd_answer(command, true, "");
            }
            else if (command.action === "native-menu") {
                const codes = { stats: 5, commanders: 6, factory: 1, build: 3, close: 0 };
                if (!Object.prototype.hasOwnProperty.call(codes, command.menu)) { wtcmd_answer(command, false, "invalid"); return; }
                if(command.menu==="build"){
                    ++wtcmd_buildGeneration;
                    // Include researched obsolete structures consistently in our
                    // picker and the native tool. Never unlock new research.
                    Object.keys(wtcmd_native).forEach(function(id){if(wtcmd_native[id].group==="Building"&&isStructureAvailable(id,selectedPlayer))enableStructure(id,selectedPlayer);});
                }
                showInterface();showReticuleWidget(0);
                if (codes[command.menu]) showReticuleWidget(codes[command.menu]);
                hideInterface();wtcmd_nativeMenu = command.menu === "close" ? "" : command.menu;
                wtcmd_answer(command, true, "", { menu: wtcmd_nativeMenu, generation: wtcmd_buildGeneration });
            }
            else wtcmd_answer(command, false, "invalid");
        } catch (error) { wtcmd_answer(command, false, "engine-rejected", { detail: String(error.message || error) }); }
    }); } finally { wtcmd_structureCache = outer; }
}

function wtcmd_tick()
{
    if (typeof warzoneTowersObjective_failed !== "undefined" && warzoneTowersObjective_failed) return;
    wtcmd_tickBuilds();wtcmd_tickProduction();
}

function wtcmd_initialize()
{
    wtcmd_indexStats();hideInterface();wtcmd_started = true;
    setTimer("wtcmd_tick", 250);
    dump("WTREADY:" + JSON.stringify({ version: 1, alwaysQueue: true }));
}

function wtcmd_eventStartLevel() { queue("wtcmd_initialize", 160); }
function wtcmd_eventGameLoaded() { queue("wtcmd_initialize", 160); }
function wtcmd_eventDroidBuilt(droid, factory)
{
    if (!factory || droid.player !== selectedPlayer) return;
    const key = String(factory.id), active = wtcmd_factoryActive[key];
    if (!active) return;
    active.status = "done";delete wtcmd_factoryActive[key];
    wtcmd_finishedUnits.push({ id: droid.id, factoryId: factory.id, name: active.design.name,
        body: active.design.body, propulsion: active.design.propulsion, gameTime: gameTime });
    wtcmd_finishedUnits = wtcmd_finishedUnits.slice(-32);
}

function wtcmd_eventSelectionChanged()
{
    if (!wtcmd_started) return;
    dump("WTCMD:"+JSON.stringify({nonce:"selection",action:"selection",ok:true,result:wtcmd_selectedUnits(),gameTime:gameTime}));
}

function wtcmd_eventMenuBuildSelected()
{
    if(wtcmd_started)dump("WTCMD:"+JSON.stringify({nonce:"build-ready",action:"build-ready",ok:true,generation:wtcmd_buildGeneration,gameTime:gameTime}));
}
