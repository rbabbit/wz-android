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
function wtcmd_snapshot()
{
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
        const key = wtcmd_templateKey(t);
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
            waitingReason: wtcmd_capacityWait((wtcmd_factoryActive[String(s.id)] || (wtcmd_production[String(s.id)] || [])[0])?.design),
            queue: wtcmd_production[String(s.id)] || [] };
    });
    return { version: 1, gameTime: gameTime, player: selectedPlayer, power: playerPower(selectedPlayer),
        mapWidth: mapWidth, mapHeight: mapHeight, alwaysQueue: true,
        hasHQ: enumStruct(selectedPlayer, HQ).some(function (s) { return s.status === BUILT; }),
        selectedUnits: wtcmd_selectedUnits(),
        buildings: buildings, parts: parts, trucks: wtcmd_builders().map(function (d) {
            return { id: d.id, x: d.x, y: d.y, z: d.z, selected: Boolean(d.selected), order: d.order,
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
    let candidates = selected;
    let automatic = false;
    if (!candidates.length) {
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
    const x = Number(command.x), y = Number(command.y);
    if (!item || !wtcmd_native[item.id] || !Number.isInteger(x) || !Number.isInteger(y)
        || x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return { error: "invalid" };
    if (!isStructureAvailable(item.id, selectedPlayer)) return { error: "unavailable" };
    if (wtcmd_openJobs().length >= 256) return { error: "queue-full" };
    const choice = wtcmd_chooseWorkers(command, x, y);
    if (!choice.units.length) return { error: wtcmd_builders().length ? "unreachable" : "no-truck" };
    const job = { id: String(command.nonce), itemId: item.id, x: x, y: y,
        workers: choice.units.map(function (d) { return d.id; }), automatic: choice.automatic,
        status: "queued", created: gameTime, attempts: {}, issued: {}, parentId: 0, targetModules: 0, reason: "" };
    if (item.category === "MODULES") {
        const parentTypes = { FACTORY_MODULE: FACTORY, RESEARCH_MODULE: RESEARCH_LAB, POWER_MODULE: POWER_GEN };
        const parentType = parentTypes[item.kind.replace(/[ -]/g, "_")];
        const parent = enumStruct(selectedPlayer).filter(function (s) {
            return s.status === BUILT && s.stattype === parentType && Math.abs(s.x - x) <= 1 && Math.abs(s.y - y) <= 1;
        }).sort(function (a, b) { return Math.abs(a.x - x) + Math.abs(a.y - y) - Math.abs(b.x - x) - Math.abs(b.y - y); })[0];
        if (!parent) return { error: "module-parent" };
        const reserved = wtcmd_openJobs().filter(function (j) { return j.parentId === parent.id; }).length;
        const maximum = parent.stattype === FACTORY ? 2 : 1;
        if ((parent.modules || 0) + reserved >= maximum) return { error: "module-limit" };
        job.parentId = parent.id; job.x = parent.x; job.y = parent.y;
        job.targetModules = (parent.modules || 0) + reserved + 1;
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
        if (!ids.length || !wtcmd_idle(droid)) return;
        const job = wtcmd_jobs.filter(function (j) { return j.id === ids[0]; })[0];
        if (!job || job.status === "blocked") return;
        const key = String(droid.id);
        if (job.issued[key] && gameTime - job.issued[key] < 1200) return;
        if ((job.attempts[key] || 0) >= 3) { job.status = "blocked"; job.reason = "build-blocked"; return; }
        const existing = wtcmd_structAt(job);
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
        const validation = wtcmd_validateDesign(command.design, false);
        if (validation.error) { wtcmd_answer(command, false, validation.error); return; }
        design = validation.design;
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
                if(command.menu==="build")++wtcmd_buildGeneration;
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
