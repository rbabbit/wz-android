/* Player-private UI queues; this file is evaluated by the native UI context,
   never registered with the synchronized game rules or its timer system. */
var eventChat=function(){},eventResearched=function(){};
var mpMobileTimers=[];
function namespace(){}
function setTimer(){}
function queue(name,delay,arg){mpMobileTimers.push({name:name,due:gameTime+Number(delay||0),arg:arg});}
function hideInterface(){}
function showInterface(){}
function showReticuleWidget(){}
var blockNightV28Queues={},blockNightV28ContinueAttempts={},blockNightV28Responses={};
var blockNightV32LastQueueNonce='',blockNightLabTopics={},warzoneTowersLabResearch={},blockNightLastResearchSnapshot='';
function blockNightResearchCategory(topic){return '';}
function mpMobileTick(){
 if(!wtcmd_started){wtcmd_indexStats();wtcmd_started=true;dump('WTREADY:'+JSON.stringify({version:70,alwaysQueue:true}));}
 wtcmd_poll();blockNightV32PollQueueCommand();
 Object.keys(blockNightV28Queues).forEach(function(id){blockNightV28StartNext(Number(id));});
 wtcmd_tickBuilds();wtcmd_tickProduction();
 var due=mpMobileTimers.filter(function(t){return t.due<=gameTime;});mpMobileTimers=mpMobileTimers.filter(function(t){return t.due>gameTime;});
 due.slice(0,32).forEach(function(t){if(typeof globalThis[t.name]==='function')globalThis[t.name](t.arg);});
 blockNightEmitResearchSnapshotV23();
}
function blockNightEmitResearchSnapshotV23(){
 var topics=blockNightV28AvailableResearch().map(function(t,index){return {id:t.id,name:t.fullname,power:t.power,points:t.points,started:t.started,done:t.done,nativeIndex:index};});
 var labs=enumStruct(selectedPlayer,RESEARCH_LAB).filter(function(l){return l.status===BUILT;}).sort(function(a,b){return a.id-b.id;}).map(function(l,index){
  var n=l.towersResearch||{},a=warzoneTowersLabResearch[String(l.id)]||blockNightLabTopics[String(l.id)];
  var topic=n.topicId?getResearch(n.topicId,selectedPlayer):a?getResearch(a.topicId,selectedPlayer):null;
  if(topic&&topic.done){delete warzoneTowersLabResearch[String(l.id)];delete blockNightLabTopics[String(l.id)];topic=null;}
  return {id:l.id,nativeIndex:index,idle:structureIdle(l)&&!topic,modules:l.modules,health:l.health,topicId:topic?topic.id:'',topicName:topic?topic.fullname:'',
   estimatedProgress:n.progress||0,remainingSeconds:n.remainingSeconds==null?null:n.remainingSeconds,waitingPower:!!n.waitingPower};
 });
 var value={version:70,gameTime:gameTime,power:playerPower(selectedPlayer),topics:topics,labs:labs};
 var stable=JSON.stringify(value);if(stable!==blockNightLastResearchSnapshot){blockNightLastResearchSnapshot=stable;dump('BNTECH:'+stable);}
}

function blockNightV32PollQueueCommand()
{
	let command = null;
	try
	{
		command = includeJSON("blocknight-queue-command.json");
	}
	catch (error)
	{
		return;
	}
	if (!command || typeof command.nonce !== "string" || !command.nonce || command.nonce === blockNightV32LastQueueNonce) return;
	blockNightV32LastQueueNonce = command.nonce;

	if (blockNightV28Responses[command.nonce])
	{
		dump("BNQUEUE:" + JSON.stringify(blockNightV28Responses[command.nonce]));
		return;
	}
	if (!Array.isArray(command.labs) || command.labs.length < 1 || command.labs.length > 16)
	{
		blockNightV28EmitQueueState(command.nonce, false, "invalid", []);
		return;
	}

	const available = blockNightV28AvailableResearch();
	const availableById = {};
	for (let availableIndex = 0; availableIndex < available.length; ++availableIndex)
	{
		availableById[String(available[availableIndex].id)] = available[availableIndex];
	}
	const prepared = [];
	const seenLabs = {};
	const seenTopics = {};
	for (let commandIndex = 0; commandIndex < command.labs.length; ++commandIndex)
	{
		const requested = command.labs[commandIndex];
		const labId = Number(requested && requested.labId);
		const lab = Number.isFinite(labId) ? getObject(STRUCTURE, selectedPlayer, labId) : null;
		if (!lab || lab.player !== selectedPlayer || lab.stattype !== RESEARCH_LAB || lab.status !== BUILT || seenLabs[String(labId)])
		{
			blockNightV28EmitQueueState(command.nonce, false, "lab-missing", []);
			return;
		}
		if (!Array.isArray(requested.topicIds) || requested.topicIds.length > 64)
		{
			blockNightV28EmitQueueState(command.nonce, false, "invalid", []);
			return;
		}
		seenLabs[String(labId)] = true;
		const topicIds = [];
		for (let topicIndex = 0; topicIndex < requested.topicIds.length; ++topicIndex)
		{
			const topicId = String(requested.topicIds[topicIndex]);
			if (!availableById[topicId] || seenTopics[topicId])
			{
				blockNightV28EmitQueueState(command.nonce, false, "topic-unavailable", []);
				return;
			}
			seenTopics[topicId] = true;
			topicIds.push(topicId);
		}
		prepared.push({ labId: labId, topicIds: topicIds });
	}

	const labsToStart = [];
	for (let preparedIndex = 0; preparedIndex < prepared.length; ++preparedIndex)
	{
		const entry = prepared[preparedIndex];
		blockNightV28Queues[String(entry.labId)] = entry.topicIds.slice();
		labsToStart.push(entry.labId);
	}
	const started = [];
	for (let labIndex = 0; labIndex < labsToStart.length; ++labIndex)
	{
		const assignment = blockNightV28StartNext(labsToStart[labIndex]);
		if (assignment) started.push(assignment);
	}
	if (typeof blockNightLastResearchSnapshot === "string") blockNightLastResearchSnapshot = "";
	if (typeof blockNightEmitResearchSnapshotV23 === "function") queue("blockNightEmitResearchSnapshotV23", 80);
	blockNightV28EmitQueueState(command.nonce, true, "synced", started);
}

function blockNightV28AvailableResearch()
{
	return enumResearch().sort(function (a, b) {
		const rankA = typeof blockNightResearchRank === "function" ? blockNightResearchRank(a) : -1;
		const rankB = typeof blockNightResearchRank === "function" ? blockNightResearchRank(b) : -1;
		const rankDelta = rankA - rankB;
		return rankDelta !== 0 ? rankDelta : (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));
	});
}

function blockNightV28QueuePayload()
{
	const queues = [];
	Object.keys(blockNightV28Queues).forEach(function (key) {
		queues.push({ labId: Number(key), topicIds: blockNightV28Queues[key].slice() });
	});
	return queues;
}

function blockNightV28EmitQueueState(nonce, ok, reason, started)
{
	const payload = {
		version: 32,
		nonce: nonce || "",
		ok: ok !== false,
		reason: reason || "synced",
		started: started || [],
		queues: blockNightV28QueuePayload(),
		gameTime: gameTime
	};
	if (payload.nonce) blockNightV28Responses[payload.nonce] = payload;
	dump("BNQUEUE:" + JSON.stringify(payload));
}
function blockNightV28StartNext(labId)
{
	const key = String(labId);
	const queued = blockNightV28Queues[key] || [];
	const lab = getObject(STRUCTURE, selectedPlayer, Number(labId));
	if (!lab || lab.player !== selectedPlayer || lab.stattype !== RESEARCH_LAB || lab.status !== BUILT)
	{
		delete blockNightV28Queues[key];
		return null;
	}
	if (!structureIdle(lab)) return null;
	const current = warzoneTowersLabResearch[key];
	if (current && !getResearch(current.topicId, selectedPlayer).done) return null;

	while (queued.length)
	{
		const topicId = queued[0];
		const topic = getResearch(topicId, selectedPlayer);
		if (!topic || topic.done || topic.started)
		{
			queued.shift();
			continue;
		}
		if (pursueResearch(lab, topicId))
		{
			queued.shift();
			if (typeof blockNightLabTopics === "object")
			{
				blockNightLabTopics[key] = { topicId: topicId, assignedAt: gameTime, estimatePaid: playerPower(selectedPlayer) >= topic.power };
				warzoneTowersLabResearch[key] = blockNightLabTopics[key];
			}
			return { labId: lab.id, topicId: topicId };
		}
		return null;
	}
	return null;
}

function blockNightV28ContinueQueue(lab)
{
	if (!lab || typeof lab.id !== "number") return;
	const labId = lab.id;
	const key = String(labId);
	const started = blockNightV28StartNext(labId);
	const remaining = blockNightV28Queues[key] || [];
	const attempt = Number(blockNightV28ContinueAttempts[key] || 0);
	if (!started && remaining.length && attempt < 12)
	{
		blockNightV28ContinueAttempts[key] = attempt + 1;
		queue("blockNightV28ContinueQueue", 300, lab);
		return;
	}
	delete blockNightV28ContinueAttempts[key];
	if (typeof blockNightLastResearchSnapshot === "string") blockNightLastResearchSnapshot = "";
	if (typeof blockNightEmitResearchSnapshotV23 === "function") queue("blockNightEmitResearchSnapshotV23", 80);
	blockNightV28EmitQueueState("", true, started ? "continued" : remaining.length ? "waiting" : "idle", started ? [started] : []);
}
/* Player-command bridge. Orders stay FIFO; no free objects or automatic research. */

var wtcmd_catalog = includeJSON("warzone-towers-catalog.json");
var wtcmd_buildings = {};
var wtcmd_components = {};
var wtcmd_native = {};
var wtcmd_jobs = [];
var wtcmd_workers = {};
var wtcmd_production = {};
var wtcmd_factoryActive = {};
// Saved with ordinary script globals. One policy per owned factory; repeating
// never materializes an unbounded queue or changes native unit/power limits.
var wtcmd_productionRepeats = {};
var wtcmd_productionRepeatPlayer = -1;
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
// Display/ownership records for real native demolition orders. No refund or
// destruction is performed here; Warzone owns both.
var wtcmd_demolitionOrders = {};
// Replaced synchronously by eventGameLoaded, after saved script globals are
// restored. The active UI token belongs to the world that was just replaced.
var wtcmd_demolitionRevokedIntent = '';
// A display journal for ordinary Ctrl-build input. These entries never issue
// orders: Warzone owns the real queue, pathfinding, power and blueprints.
var wtcmd_nativeSites = [];
var wtcmd_siteHealth = {};
var wtcmd_recoveryContext = "";

// The separate Campaign package retains its accepted v0.51 bridge. These
// guards also keep the recovery policy inactive if this source is inspected
// in a Campaign script context.
function wtcmd_recoveryEnabled() { return typeof campmobile_level === "undefined"; }

function wtcmd_rememberBuildGroup(job)
{
    if (!wtcmd_recoveryEnabled()) return;
    const journal = wtcmd_nativeSites.filter(function(j) { return j.id === job.id; })[0];
    if (!Array.isArray(job.originalWorkers)) job.originalWorkers = ((journal && journal.originalWorkers)
        || (job.workers.length ? job.workers : journal && journal.workers) || []).slice().sort(function(a,b) { return a-b; });
    if (!job.recoveryGroup) job.recoveryGroup = job.buildSession && job.originalWorkers.length
        ? JSON.stringify([job.buildSession,job.originalWorkers]) : "legacy:" + job.id;
    if (journal && journal !== job) {
        journal.originalWorkers = job.originalWorkers.slice();
        journal.buildSession = job.buildSession || "";
        journal.recoveryGroup = job.recoveryGroup;
    }
}

function wtcmd_reconcileBuilders(builders)
{
    if (!wtcmd_recoveryEnabled()) return;
    const alive = {};
    builders.forEach(function(d) { alive[String(d.id)] = true; });
    wtcmd_openJobs().forEach(function(job) {
        wtcmd_rememberBuildGroup(job);
        job.workers = job.workers.filter(function(id) { return alive[String(id)]; });
        if (!job.workers.length && !wtcmd_done(job)) { job.status = "blocked"; job.reason = "builder-lost"; }
        const journal = wtcmd_nativeSites.filter(function(j) { return j.id === job.id; })[0];
        if (journal) {
            journal.workers = job.workers.slice();
            if (job.reason === "builder-lost" && !job.workers.length && !wtcmd_done(job)) {
                journal.status = "waiting-trucks"; journal.reason = "builder-lost";
                journal.remaining = null; journal.workersActive = 0;
            }
        }
    });
    wtcmd_nativeSites.forEach(function(journal) {
        if (wtcmd_jobs.some(function(j) { return j.id === journal.id; }) || ["done","cancelled","interrupted"].includes(journal.status)) return;
        wtcmd_rememberBuildGroup(journal);
        const before = journal.workers.length;
        journal.workers = journal.workers.filter(function(id) { return alive[String(id)]; });
        if (!journal.workers.length && (before || journal.reason === "builder-lost") && !wtcmd_done(journal)) {
            const existing=wtcmd_structAt(journal);
            // A legacy Ctrl-build plan belongs to its native droid queue. If
            // its last droid dies before a foundation exists, that queue no
            // longer exists. Only a real unfinished structure is resumable.
            const unfinished=existing&&existing.status!==BUILT&&(!journal.parentId||Number(existing.modules||0)>=journal.targetModules);
            journal.status = unfinished ? "waiting-trucks" : "interrupted"; journal.reason = "builder-lost";
            if(unfinished)journal.structureId=existing.id;
            journal.remaining = null; journal.workersActive = 0;
        }
    });
    Object.keys(wtcmd_workers).forEach(function(key) { if (!alive[key]) delete wtcmd_workers[key]; });
}

function wtcmd_siteQueueState(site, trucks)
{
    const job=wtcmd_openJobs().filter(function(j){return j.id===site.id;})[0];
    const assigned=trucks.filter(function(d){return (job?job.workers:site.workers).indexOf(d.id)>=0;});
    if(!assigned.length)return "waiting-trucks";
    const travelling=assigned.some(function(d){
        const orders=[DORDER_BUILD,DORDER_HELPBUILD,DORDER_LINEBUILD];
        if(typeof DORDER_BUILDMODULE!=="undefined")orders.push(DORDER_BUILDMODULE);
        if(orders.indexOf(d.order)<0)return false;
        if(job)return (wtcmd_workers[String(d.id)]||[])[0]===job.id
            && Object.prototype.hasOwnProperty.call(job.issued||{},String(d.id)) && job.status!=="blocked";
        // Observer-only legacy Ctrl-build journals have no app FIFO. Preserve
        // their original ordering rather than treating every later site as
        // the current destination of the same native constructor.
        return !wtcmd_nativeSites.some(function(other){return other!==site
            && !["done","cancelled","interrupted"].includes(other.status)
            && other.created<=site.created && other.workers.indexOf(d.id)>=0;});
    });
    return travelling?"travelling":"queued";
}

function wtcmd_recoveryWorkers(command)
{
    const ids = command.workerIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 256
        || ids.some(function(id) { return !Number.isInteger(id) || id <= 0; }) || new Set(ids).size !== ids.length)
        return {error:"no-selected-trucks"};
    if (command.recoveryContext !== wtcmd_recoveryContext || !Number.isFinite(command.issuedGameTime)
        || command.issuedGameTime < 0 || command.issuedGameTime > gameTime) return {error:"construction-changed"};
    const selected = enumSelected().filter(wtcmd_isBuilder).sort(function(a,b) { return a.id-b.id; });
    const expected = ids.slice().sort(function(a,b) { return a-b; });
    if (selected.length !== expected.length || selected.some(function(d,i) {
        return d.id !== expected[i] || !getObject(DROID,selectedPlayer,d.id);
    })) return {error:"construction-selection-changed"};
    return {units:selected,ids:expected};
}

function wtcmd_recoverySite(job, units)
{
    const existing = wtcmd_structAt(job), item = wtcmd_buildings[job.itemId];
    if (!item || wtcmd_done(job) || (job.parentId || job.resumeStructureId) && !existing)
        return {error:"construction-changed"};
    if (existing && (existing.player !== selectedPlayer || existing.type !== STRUCTURE)) return {error:"construction-changed"};
    if (existing && wtcmd_demolitionRecord(existing)) return {error:"demolishing"};
    if (units.some(function(d) { return !droidCanReach(d,job.x,job.y); })) return {error:"construction-unreachable"};
    const siteError=wtcmd_buildSiteError(job,units,true);
    if(siteError)return {error:siteError};
    return {existing:existing};
}

function wtcmd_resumeBuilds(command)
{
    const choice=wtcmd_recoveryWorkers(command);
    if (choice.error) { wtcmd_answer(command,false,choice.error); return; }
    const ids=command.action==="retry-job"?[command.jobId]:command.jobIds;
    if (!Array.isArray(ids) || !ids.length || ids.length>256 || new Set(ids).size!==ids.length
        || ids.some(function(id) { return typeof id!=="string"; })) { wtcmd_answer(command,false,"construction-changed"); return; }
    wtcmd_reconcileBuilders(wtcmd_builders());
    const jobs=wtcmd_openJobs().filter(function(job) { return ids.indexOf(job.id)>=0; });
    if (jobs.length!==ids.length || jobs.some(function(job,i) { return job.id!==ids[i] || job.status!=="blocked"; })) {
        wtcmd_answer(command,false,"construction-changed"); return;
    }
    if (command.action==="resume-builds") {
        const group=jobs[0].recoveryGroup;
        const current=wtcmd_openJobs().filter(function(job) { return job.status==="blocked" && job.reason==="builder-lost" && job.recoveryGroup===group; });
        if (group!==command.recoveryGroup || current.length!==jobs.length || current.some(function(job,i) { return job.id!==ids[i]; })) {
            wtcmd_answer(command,false,"construction-changed"); return;
        }
    }
    const sites=[];
    for (const job of jobs) {
        const site=wtcmd_recoverySite(job,choice.units);
        if (site.error) { wtcmd_answer(command,false,site.error); return; }
        sites.push(site);
    }
    // Validation is complete before any queue changes. Preserve accepted job
    // identities, module reservations and original order; append to only the
    // explicitly selected group's current FIFO without stopping other work.
    wtcmd_assignBuildWorkers(jobs,choice.ids);
    jobs.forEach(function(job,index) {
        if (sites[index].existing) job.resumeStructureId=sites[index].existing.id;
        let journal=wtcmd_nativeSites.filter(function(j) { return j.id===job.id; })[0];
        if (!journal) { journal=Object.assign({},job);wtcmd_nativeSites.push(journal); }
        journal.workers=choice.ids.slice();journal.status="queued";journal.reason="";journal.idleAt=null;
        journal.workersActive=0;journal.sampleAt=gameTime;journal.sampleRate=0;
        if (sites[index].existing) journal.structureId=sites[index].existing.id;
        wtcmd_rememberBuildGroup(job);
    });
    wtcmd_answer(command,true,"",{jobIds:ids.slice(),workerIds:choice.ids.slice()});
    wtcmd_tickBuilds();
}

function wtcmd_resumeStructure(command)
{
    const choice=wtcmd_recoveryWorkers(command);
    if(choice.error){wtcmd_answer(command,false,choice.error);return;}
    const target=Number.isInteger(command.structureId)&&getObject(STRUCTURE,selectedPlayer,command.structureId);
    if(!target || target.type!==STRUCTURE || target.player!==selectedPlayer || target.status===BUILT
        || wtcmd_openJobs().some(function(job){const s=wtcmd_structAt(job);return s&&s.id===target.id;})) {
        wtcmd_answer(command,false,"construction-changed");return;
    }
    if(wtcmd_openJobs().length>=256){wtcmd_answer(command,false,"queue-full");return;}
    if(wtcmd_demolitionRecord(target)){wtcmd_answer(command,false,"demolishing");return;}
    if(choice.units.some(function(d){return !droidCanReach(d,target.x,target.y);})){wtcmd_answer(command,false,"construction-unreachable");return;}
    const old=wtcmd_nativeSites.filter(function(j){return j.structureId===target.id&&(!j.parentId||j.targetModules<=Number(target.modules||0));})[0];
    const item=old&&wtcmd_buildings[old.itemId]||wtcmd_catalog.buildings.filter(function(b){return b.category!=="MODULES"&&b.name===target.name;})[0];
    if(!item){wtcmd_answer(command,false,"construction-changed");return;}
    const job={id:command.nonce,itemId:item.id,x:target.x,y:target.y,workers:choice.ids.slice(),originalWorkers:choice.ids.slice(),
        buildSession:"recover-"+target.id,status:"queued",created:gameTime,attempts:{},issued:{},automatic:false,
        parentId:old&&old.parentId||0,targetModules:old&&old.targetModules||0,resumeStructureId:target.id,reason:""};
    if(old) {old.status="interrupted";old.remaining=null;}
    wtcmd_jobs.push(job);wtcmd_rememberBuildGroup(job);
    wtcmd_nativeSites.push(Object.assign({},job,{workers:job.workers.slice(),structureId:target.id}));
    choice.ids.forEach(function(id){const key=String(id);if(!wtcmd_workers[key])wtcmd_workers[key]=[];wtcmd_workers[key].push(job.id);});
    wtcmd_answer(command,true,"",{jobIds:[job.id],workerIds:choice.ids.slice(),structureId:target.id});
    wtcmd_tickBuilds();
}

function wtcmd_bindNativeSites(structures)
{
    wtcmd_nativeSites.forEach(function(j){
        if(j.parentId){j.structureId=j.parentId;return;}
        if(j.structureId||j.status==='done'||j.status==='interrupted'||wtcmd_recoveryEnabled()&&j.status==='cancelled')return;
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
    wtcmd_reconcileBuilders(trucks);
    wtcmd_bindNativeSites(structures);
    const active = structures.filter(function (s) { return s.status !== BUILT || wtcmd_demolitionRecord(s); });
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
        const journal = wtcmd_nativeSites.filter(function (j) { return s.id===j.structureId&&j.status!=="done"&&j.status!=="interrupted"&&(!wtcmd_recoveryEnabled()||j.status!=="cancelled"); })[0];
        const item = journal ? wtcmd_buildings[journal.itemId] : wtcmd_catalog.buildings.filter(function (b) { return b.name === s.name; })[0];
        const demolition=wtcmd_demolitionRecord(s);
        const workers=demolition?demolition.workers:assignments[String(s.id)]||[],rate=workers.reduce(function (n,d) { return n+wtcmd_constructorRate(d); },0);
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
            progress:demolition?null:progress,approximate:true,workers:workers.length,rate:demolition?0:rate,
            status:demolition?'demolishing':waitingPower?"waiting-power":rate?"building":wtcmd_recoveryEnabled()&&journal?wtcmd_siteQueueState(journal,trucks):"waiting-trucks",
            remaining:!demolition&&!waitingPower&&rate&&item?Math.max(1,Math.ceil(item.points*(1-progress)/rate)):null};
    });
    wtcmd_nativeSites.forEach(function (j) {
        if(j.status==="done"||j.status==="interrupted"||wtcmd_recoveryEnabled()&&j.status==="cancelled")return;
        const blocked=wtcmd_openJobs().filter(function(job){return job.id===j.id&&job.status==="blocked"&&job.reason!=="builder-lost";})[0];
        if(blocked){j.status="blocked";j.reason=blocked.reason;j.remaining=null;j.workersActive=0;j.idleAt=null;return;}
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
        if(wtcmd_recoveryEnabled()&&j.reason==="builder-lost"&&!j.workers.length){j.status="waiting-trucks";j.remaining=null;return;}
        const assigned=trucks.filter(function(d){return j.workers.indexOf(d.id)>=0;});
        const orders=[DORDER_BUILD,DORDER_HELPBUILD,DORDER_LINEBUILD];if(typeof DORDER_BUILDMODULE!=="undefined")orders.push(DORDER_BUILDMODULE);
        // Native FIFO handoff briefly reports idle before the next foundation
        // exists. Require sustained simulation time, not one idle sample.
        const idle=gameTime-j.created>2000&&assigned.every(function(d){return !orders.includes(d.order);});
        if(!idle)j.idleAt=null;else if(j.idleAt==null)j.idleAt=gameTime;
        if(!assigned.length||(idle&&gameTime-j.idleAt>=1200)) {j.status="interrupted";j.remaining=null;return;}
        j.status=wtcmd_recoveryEnabled()?wtcmd_siteQueueState(j,trucks):wtcmd_nativeSites.some(function(a){return a!==j&&a.created<=j.created&&["building","waiting-power","waiting-trucks"].includes(a.status)&&a.workers.some(function(id){return j.workers.indexOf(id)>=0;});})?"queued":"travelling";
        j.remaining=null;
    });
    return {active:rows,sites:wtcmd_nativeSites.filter(function(j){return !j.completed||gameTime-j.completed<4000;})};
}

function wtcmd_trackSite(command)
{
    const plan=wtcmd_planBuild(command);
    if(plan.error){wtcmd_answer(command,false,plan.error);return;}
    wtcmd_nativeSites=wtcmd_nativeSites.filter(function(j){return !['done','cancelled','interrupted'].includes(j.status);}).slice(-127);
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
    if (wtcmd_recoveryEnabled() && job.resumeStructureId) {
        const structure=getObject(STRUCTURE,selectedPlayer,job.resumeStructureId);
        return structure&&structure.type===STRUCTURE&&structure.player===selectedPlayer?structure:null;
    }
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
    if (wtcmd_demolitionRecord(structure)) { status='demolishing';statusReason='demolishing'; }
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

function wtcmd_demolitionRecord(structure)
{
    const key = String(structure.id), entry = wtcmd_demolitionOrders[key];
    if (!entry) return null;
    const workers = entry.workers.map(function(id) { return getObject(DROID, selectedPlayer, id); })
        .filter(function(d) { return wtcmd_isBuilder(d) && d.order === DORDER_DEMOLISH; });
    if (gameTime < entry.created || !workers.length && gameTime - entry.created > 1500) {
        delete wtcmd_demolitionOrders[key]; return null;
    }
    return {workers:workers, created:entry.created};
}

function wtcmd_demolitionBuilderAssignments()
{
    const assignments = {};
    const active = enumStruct(selectedPlayer).filter(function(s) { return s.status !== BUILT; });
    // Public droids expose their action, not their private native order target.
    // Reuse the construction observer's conservative nearest-footprint test.
    wtcmd_builders().forEach(function(d) {
        if (d.action !== 2 && d.action !== 21) return;
        const nearest = active.map(function(s) {
            const item = wtcmd_catalog.buildings.filter(function(b) { return b.name === s.name; })[0];
            return {id:s.id, distance:Math.hypot(d.x-s.x,d.y-s.y), reach:Math.max(item ? item.width : 1,item ? item.breadth : 1)/2+2};
        }).filter(function(v) { return v.distance <= v.reach; }).sort(function(a,b) { return a.distance-b.distance || a.id-b.id; })[0];
        if(nearest){const key=String(nearest.id);if(!assignments[key])assignments[key]=[];assignments[key].push(d);}
    });
    const byId={},bySite={};
    active.forEach(function(s) {
        byId[String(s.id)]=s;
        wtcmd_catalog.buildings.filter(function(b) { return b.name===s.name; }).forEach(function(b) { bySite[b.id+':'+s.x+':'+s.y]=s; });
    });
    // Accepted queue records supply exact target IDs even before their trucks
    // arrive. Build this lookup once for the whole target list, not per wall.
    wtcmd_openJobs().concat(wtcmd_nativeSites.filter(function(j) { return j.status!=='done'&&j.status!=='interrupted'; }))
        .forEach(function(j) {
            const target=byId[String(j.parentId||j.structureId)]||bySite[j.itemId+':'+j.x+':'+j.y];if(!target)return;
            const key=String(target.id);if(!assignments[key])assignments[key]=[];
            (j.workers||[]).forEach(function(id) {const d=getObject(DROID,selectedPlayer,id);
                if(wtcmd_isBuilder(d)&&!assignments[key].some(function(w) { return w.id===id; }))assignments[key].push(d);
            });
        });
    return assignments;
}

function wtcmd_demolitionBuilders(structure, assignments)
{
    return structure.status === BUILT ? [] : (assignments || wtcmd_demolitionBuilderAssignments())[String(structure.id)] || [];
}

function wtcmd_demolitionState()
{
    const workers = enumSelected().filter(wtcmd_isBuilder).map(function(d) { return d.id; }).sort(function(a,b) { return a-b; });
    const assignments = wtcmd_demolitionBuilderAssignments();
    const targets = enumStruct(selectedPlayer).map(function(s) {
        const item = wtcmd_catalog.buildings.filter(function(b) { return b.name === s.name; })[0];
        const protectedHQ = s.stattype === HQ;
        const busy = !protectedHQ && wtcmd_demolitionBuilders(s,assignments).some(function(d) { return workers.indexOf(d.id) < 0; });
        return {id:s.id, itemId:item ? item.id : '', name:item ? item.name : s.name || 'Structure',
            x:s.x,y:s.y,z:Number(s.z || 0),width:item ? item.width : 1,breadth:item ? item.breadth : 1,
            modules:Number(s.modules || 0),moduleId:'',nativeStatus:s.status,
            foundation:s.status !== BUILT && !s.modules, protected:protectedHQ,
            eligible:!protectedHQ && !busy, statusReason:protectedHQ ? 'hq-protected' : busy ? 'construction-busy' : ''};
    }).sort(function(a,b) { return a.id-b.id; });
    return {workerIds:workers,targets:targets,blockers:wtcmd_facilityBlockers(targets),gameTime:gameTime};
}

function wtcmd_demolish(command)
{
    if (typeof DORDER_DEMOLISH === 'undefined' || typeof orderDroidObj !== 'function') {
        wtcmd_answer(command,false,'demolition-unavailable'); return;
    }
    // Revoked before STOP, movement or navigation can replace this tool. A
    // delayed command must never resurrect an order the player cancelled.
    let intent;
    try { intent=includeJSON('warzone-towers-demolition-intent.json',true); } catch (_) {}
    if (typeof command.intent !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(command.intent)
        || !intent || intent.active !== true || intent.intent !== command.intent) {
        wtcmd_answer(command,false,'cancelled'); return;
    }
    if (command.intent === wtcmd_demolitionRevokedIntent || !Number.isFinite(command.issuedGameTime)
        || command.issuedGameTime < 0 || command.issuedGameTime > gameTime) {
        wtcmd_answer(command,false,'game-reloaded'); return;
    }
    const ids = command.workerIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 256 || ids.some(function(id) { return !Number.isInteger(id) || id <= 0; })
        || new Set(ids).size !== ids.length || !Number.isInteger(command.targetId) || command.targetId <= 0) {
        wtcmd_answer(command,false,'invalid'); return;
    }
    const selected = enumSelected().filter(wtcmd_isBuilder).sort(function(a,b) { return a.id-b.id; });
    const expected = ids.slice().sort(function(a,b) { return a-b; });
    if (selected.length !== expected.length || selected.some(function(d,i) { return d.id !== expected[i]; })) {
        wtcmd_answer(command,false,'selection-changed'); return;
    }
    const target = getObject(STRUCTURE, selectedPlayer, command.targetId);
    if (!target || target.type !== STRUCTURE || target.player !== selectedPlayer) { wtcmd_answer(command,false,'friendly-structure'); return; }
    if (target.stattype === HQ) { wtcmd_answer(command,false,'hq-protected'); return; }
    if (wtcmd_demolitionBuilders(target).some(function(d) { return expected.indexOf(d.id) < 0; })) {
        wtcmd_answer(command,false,'construction-busy'); return;
    }
    const reachable = selected.filter(function(d) { return propulsionCanReach(d.propulsion,d.x,d.y,target.x,target.y); });
    if (!reachable.length) { wtcmd_answer(command,false,'unreachable'); return; }
    const accepted = [];
    reachable.forEach(function(d) { if (orderDroidObj(d,DORDER_DEMOLISH,target)) accepted.push(d.id); });
    if (!accepted.length) { wtcmd_answer(command,false,'engine-rejected'); return; }
    // This explicit new order replaces only these constructors' old FIFO, as a
    // real move/stop order does. Never select, stop or recruit another truck.
    wtcmd_stopWorkers(accepted);
    wtcmd_openJobs().filter(function(job) {
        const structure = wtcmd_structAt(job); return job.parentId === target.id || structure && structure.id === target.id;
    }).forEach(function(job) { wtcmd_finishJob(job,'cancelled'); });
    wtcmd_bindNativeSites(enumStruct(selectedPlayer));
    wtcmd_nativeSites.forEach(function(site) {
        if (site.structureId === target.id || site.parentId === target.id) { site.status='interrupted';site.remaining=null; }
    });
    Object.keys(wtcmd_demolitionOrders).forEach(function(key) {
        const entry=wtcmd_demolitionOrders[key];entry.workers=entry.workers.filter(function(id) { return accepted.indexOf(id)<0; });
        if (!entry.workers.length) delete wtcmd_demolitionOrders[key];
    });
    wtcmd_demolitionOrders[String(target.id)]={workers:accepted,created:gameTime};
    wtcmd_answer(command,true,'',{targetId:target.id,name:target.name || 'Structure',workerIds:accepted,gameTime:gameTime});
}

function wtcmd_currentProduction(factory)
{
    if (typeof getDroidProduction !== 'function' || factory.status !== BUILT) return null;
    const current = getDroidProduction(factory);
    if (!current) return null;
    const source = {name:current.name, body:current.body, propulsion:current.propulsion, droidType:current.droidType,
        weapons:(current.weapons || []).map(function(w) { return typeof w === 'string' ? w : w.id || w.name; })};
    ['construct','repair','brain','ecm','sensor'].forEach(function(key) { source[key] = current[key]; });
    const virtual = wtcmd_templateParts(source), raw = factory.towersProduction, subject = raw && raw.subjectDesign;
    // convDroid omits non-weapon systems. Use the exact native subject template,
    // never an app job or a similarly named design, to recover its equipment.
    if (raw && raw.active === true && subject && Number.isInteger(raw.templateId)
        && subject.templateId === raw.templateId) {
        const complete = wtcmd_templateParts(subject);
        const name = String(raw.currentName || "").replace(/(?: · F\d+)+$/, "");
        if (complete.name === name && complete.name === virtual.name
            && complete.body === virtual.body && complete.propulsion === virtual.propulsion) {
            ['construct','repair','brain','ecm','sensor'].forEach(function(key) { complete[key] = subject[key]; });
            complete.weapons = (subject.weapons || []).slice();
            // Command brains carry a linked gun in the native weapon array;
            // the native droid type identifies the actual chosen system turret.
            const systems = [[typeof DROID_CONSTRUCT === 'undefined' ? null : DROID_CONSTRUCT, 'construct'],
                [typeof DROID_REPAIR === 'undefined' ? null : DROID_REPAIR, 'repair'],
                [typeof DROID_COMMAND === 'undefined' ? null : DROID_COMMAND, 'brain'],
                [typeof DROID_ECM === 'undefined' ? null : DROID_ECM, 'ecm'],
                [typeof DROID_SENSOR === 'undefined' ? null : DROID_SENSOR, 'sensor']];
            const system = systems.find(function(pair) { return pair[0] !== null && pair[0] === virtual.droidType; });
            if (system && subject[system[1]] && !/null/i.test(subject[system[1]])) complete.turrets = [subject[system[1]]];
            complete.nativeTemplateId = raw.templateId;
            return complete;
        }
    }
    return virtual;
}

function wtcmd_productionObservation(factory, current, active)
{
    // Sample real native work on this exact subject. Never extrapolate from the
    // app queue's started time; it includes holds, power waits and native delay.
    const raw = factory.towersProduction;
    const none = { available:false, currentId:"", currentName:"", templateId:null,
        completedBuildPoints:null, totalBuildPoints:null, ratio:null,
        state:"unavailable" };
    if (raw && factory.status === BUILT && raw.active === false && !current) none.state = "idle";
    const sameDesign = current && active && active.design
        && current.name === active.design.name && current.body === active.design.body
        && current.propulsion === active.design.propulsion
        && JSON.stringify(current.turrets || []) === JSON.stringify(active.design.turrets || []);
    const queueKnown = Boolean(raw && factory.status === BUILT && raw.nativeQueueEmpty === true
        && (raw.active === false && !current || raw.active === true && sameDesign));
    if (!raw || factory.status !== BUILT || raw.active !== true || !current) {
        return { progress:none, queueKnown:queueKnown };
    }
    const name = String(raw.currentName || "").replace(/(?: · F\d+)+$/, "");
    const total = Number(raw.totalBuildPoints), remaining = Number(raw.remainingBuildPoints);
    const templateId = Number(raw.templateId), started = Number(raw.timeStarted);
    const states = ["building", "paused", "waiting-power", "waiting-capacity"];
    if (!name || name !== current.name || !Number.isFinite(total) || total <= 0
        || !Number.isFinite(remaining) || remaining < 0 || remaining > total
        || !Number.isInteger(templateId) || templateId < 0 || !Number.isInteger(started) || started < 0
        || current.nativeTemplateId !== undefined && current.nativeTemplateId !== templateId
        || states.indexOf(raw.state) < 0) return { progress:none, queueKnown:false };
    const completed = total - remaining;
    const progress = { available:true, currentId:factory.id + ":" + templateId + ":" + started,
        currentName:name, templateId:templateId, completedBuildPoints:completed,
        totalBuildPoints:total, ratio:completed / total, state:raw.state };
    const rate = Number(raw.buildPointsPerSecond);
    // Estimated remaining native simulation seconds at the current real rate;
    // a held/power/capacity sample has no running countdown. No wall clock cache.
    if (raw.state === "building" && Number.isFinite(rate) && rate > 0 && remaining > 0)
        progress.remainingSeconds = Math.ceil(remaining / rate);
    return { progress:progress, queueKnown:queueKnown };
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
        const current = wtcmd_currentProduction(s), active = wtcmd_factoryActive[String(s.id)] || null;
        const observation = wtcmd_productionObservation(s, current, active);
        return { id: s.id, number: index + 1, x: s.x, y: s.y, type: s.stattype,
            kind: s.stattype === CYBORG_FACTORY ? "Cyborg factory" : s.stattype === VTOL_FACTORY ? "VTOL factory" : "Factory",
            templates: templates.filter(function (t) { return wtcmd_factoryAllows(wtcmd_templateParts(t), s); }).map(wtcmd_templateKey),
            modules: s.modules || 0, ready: s.status === BUILT, idle: structureIdle(s),
            active: active, currentProduction: current,
            progress: observation.progress, queueKnown: observation.queueKnown,
            repeat: wtcmd_productionRepeatState(s),
            waitingReason: wtcmd_capacityWait((wtcmd_factoryActive[String(s.id)] || (wtcmd_production[String(s.id)] || [])[0])?.design),
            queue: wtcmd_production[String(s.id)] || [] };
    });
    const facilityTargets = wtcmd_facilityTargets();
    return { version: 1, gameTime: gameTime, player: selectedPlayer, power: playerPower(selectedPlayer),
        rewards:typeof wtreward_state === "function" ? wtreward_state() : null,
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
        ...(wtcmd_recoveryEnabled()?{recoveryContext:wtcmd_recoveryContext}:{}),
        templates: templates.map(function(t){return Object.assign({},t,{id:wtcmd_templateKey(t)});}), finishedUnits: wtcmd_finishedUnits.slice(-16), finishedBuilds: wtcmd_finishedBuilds.slice(-32) };
}

function wtcmd_answer(command, ok, reason, result)
{
    const response = { nonce: command.nonce, action: command.action, ok: ok,
        reason: reason || "", result: result || null, gameTime: gameTime };
    // Read-only target lists may contain hundreds of walls. Do not persist a
    // large history of these snapshots in native saves; mutation replies retain
    // their existing idempotent cache below.
    if(command.action === 'demolish-state'){dump("WTCMD:" + JSON.stringify(response));return;}
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


// Match native isBlueprintTooClose/canPack: normal base buildings need a
// full tile between footprints; defences can touch except repair facilities.
function wtcmd_buildPackability(item)
{
    if (item.kind === "REPAIR FACILITY") return 3;
    return ["DEFENSE","WALL","CORNER WALL","GATE","REARM PAD","MISSILE SILO"].indexOf(item.kind) >= 0 ? 1 : 2;
}

function wtcmd_tooClose(a, b)
{
    const aw=wtcmd_buildings[a.itemId],bw=wtcmd_buildings[b.itemId];
    if(!aw||!bw||a.parentId||b.parentId)return false;
    const ax=a.x-Math.floor(aw.width/2),ay=a.y-Math.floor(aw.breadth/2);
    const bx=b.x-Math.floor(bw.width/2),by=b.y-Math.floor(bw.breadth/2);
    const gap=Math.max(bx-ax-aw.width,ax-bx-bw.width,by-ay-aw.breadth,ay-by-bw.breadth);
    if(aw.kind==="RESOURCE EXTRACTOR")return gap<0;
    return gap < (wtcmd_buildPackability(aw)+wtcmd_buildPackability(bw)<=3?0:1);
}

function wtcmd_buildReservations()
{
    const jobs=wtcmd_openJobs(),byId={},seen={},result=[];
    wtcmd_jobs.forEach(function(job){byId[job.id]=job;});
    // Journals preserve acceptance order across both original native Ctrl-build
    // plans and the app FIFO. Prefer the real job when both have the same ID.
    wtcmd_nativeSites.forEach(function(site){
        const job=byId[site.id]||site;
        if(seen[job.id]||["done","cancelled","interrupted"].indexOf(job.status)>=0)return;
        seen[job.id]=true;result.push(job);
    });
    jobs.forEach(function(job){if(!seen[job.id]){seen[job.id]=true;result.push(job);}});
    return result.map(function(job,index){return {job:job,index:index};}).sort(function(a,b){
        return Number(a.job.created||0)-Number(b.job.created||0)||a.index-b.index;
    }).map(function(entry){return entry.job;});
}

function wtcmd_reservationError(job, earlierOnly)
{
    const reservations=wtcmd_buildReservations();
    for(const other of reservations){
        if(other.id===job.id){if(earlierOnly)break;continue;}
        if(wtcmd_overlap(job,other))return "already-queued";
        if(wtcmd_tooClose(job,other))return "site-too-close";
    }
    return "";
}

function wtcmd_buildSiteError(job, units, earlierOnly)
{
    const item=wtcmd_buildings[job.itemId];
    if(!item)return "invalid-site";
    if(!units.length||units.some(function(d){return !droidCanReach(d,job.x,job.y);}))return "construction-unreachable";
    if(job.parentId)return "";
    const reserved=wtcmd_reservationError(job,earlierOnly);
    if(reserved)return reserved;
    if(wtcmd_structAt(job))return "";
    const left=job.x-Math.floor(item.width/2),top=job.y-Math.floor(item.breadth/2);
    if(left<0||top<0||left+item.width>mapWidth||top+item.breadth>mapHeight)return "invalid-site";
    for(let x=left;x<left+item.width;x++)for(let y=top;y<top+item.breadth;y++)
        if([TER_WATER,TER_CLIFFFACE].indexOf(terrainType(x,y))>=0)return "invalid-site";
    const location=pickStructLocation(units[0],job.itemId,left,top,-1);
    return location&&location.x===job.x&&location.y===job.y?"":"invalid-site";
}

function wtcmd_blockBuild(job, reason)
{
    job.status="blocked";job.reason=reason;
    wtcmd_nativeSites.filter(function(site){return site.id===job.id;}).forEach(function(site){
        site.status="blocked";site.reason=reason;site.remaining=null;site.idleAt=null;site.workersActive=0;
    });
}

function wtcmd_assignBuildWorkers(jobs, ids)
{
    const jobIds=jobs.map(function(job){return job.id;}),previous={};
    Object.keys(wtcmd_workers).forEach(function(key){
        previous[key]=wtcmd_workers[key].slice();
        wtcmd_workers[key]=wtcmd_workers[key].filter(function(id){return jobIds.indexOf(id)<0;});
    });
    ids.forEach(function(id){
        const key=String(id),old=previous[key]||[];
        // Retrying the same assigned group must not move its blocked head
        // behind later jobs. A deliberately new group keeps its existing FIFO.
        wtcmd_workers[key]=jobIds.every(function(jobId){return old.indexOf(jobId)>=0;})
            ?old:(wtcmd_workers[key]||[]).concat(jobIds);
    });
    jobs.forEach(function(job){job.workers=ids.slice();job.attempts={};job.issued={};job.status="queued";job.reason="";});
}

function wtcmd_explicitBuildWorkers(command)
{
    const ids=command.workerIds,selected=enumSelected().filter(wtcmd_isBuilder).sort(function(a,b){return a.id-b.id;});
    if(!Array.isArray(ids)||!ids.length||ids.length>256||new Set(ids).size!==ids.length
        ||ids.some(function(id){return !Number.isInteger(id)||id<=0;}))return {error:"no-selected-trucks"};
    const expected=ids.slice().sort(function(a,b){return a-b;});
    if(selected.length!==expected.length||selected.some(function(d,i){return d.id!==expected[i]||!getObject(DROID,selectedPlayer,d.id);}))
        return {error:"construction-selection-changed"};
    if(!Number.isFinite(command.issuedGameTime)||command.issuedGameTime<0||command.issuedGameTime>gameTime)
        return {error:"construction-changed"};
    return {units:selected,ids:expected};
}
function wtcmd_retryBuild(command, job)
{
    const choice=wtcmd_explicitBuildWorkers(command);
    if(choice.error){wtcmd_answer(command,false,choice.error);return;}
    if(job.status!=="blocked"){wtcmd_answer(command,false,"construction-changed");return;}
    const error=wtcmd_buildSiteError(job,choice.units,true);
    if(error){wtcmd_answer(command,false,error);return;}
    wtcmd_assignBuildWorkers([job],choice.ids);
    wtcmd_nativeSites.filter(function(site){return site.id===job.id;}).forEach(function(site){
        site.workers=choice.ids.slice();site.status="queued";site.reason="";site.idleAt=null;
    });
    wtcmd_answer(command,true,"",{jobIds:[job.id],workerIds:choice.ids.slice()});
    wtcmd_tickBuilds();
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
    if (typeof wtreward_canBuild === "function") {
        const rewardError = wtreward_canBuild(item.id);
        if (rewardError) return { error: rewardError };
    }
    if (!isStructureAvailable(item.id, selectedPlayer)) return { error: "unavailable" };
    if (wtcmd_openJobs().length >= 256) return { error: "queue-full" };
    const choice = wtcmd_chooseWorkers(command, x, y);
    if (!choice.units.length) return { error: wtcmd_builders().length ? "unreachable" : "no-truck" };
    const job = { id: String(command.nonce), itemId: item.id, x: x, y: y,
        workers: choice.units.map(function (d) { return d.id; }), automatic: choice.automatic,
        status: "queued", created: gameTime, attempts: {}, issued: {}, parentId: 0, targetModules: 0, reason: "" };
    if (wtcmd_recoveryEnabled()) {
        job.buildSession=typeof command.session==="string"?command.session:"";
        wtcmd_rememberBuildGroup(job);
    }
    if (item.category === "MODULES") {
        job.parentId = parent.id; job.x = parent.x; job.y = parent.y;
        job.targetModules = target.modules + target.reserved + 1;
    } else {
        const existing = wtcmd_structAt(job);
        if (existing && existing.status === BUILT) return { error: "occupied" };
        const siteError = wtcmd_buildSiteError(job, choice.units, false);
        if (siteError) return { error: siteError };
        const limit = getStructureLimit(item.id, selectedPlayer);
        const reserved = wtcmd_buildReservations().filter(function (j) { return j.itemId === item.id && !wtcmd_structAt(j); }).length;
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
    if (wtcmd_recoveryEnabled()) wtcmd_nativeSites.filter(function(j) { return j.id===job.id; }).forEach(function(j) {
        j.status=status;j.remaining=null;if(status==="done")j.completed=gameTime;
    });
    Object.keys(wtcmd_workers).forEach(function (key) {
        wtcmd_workers[key] = wtcmd_workers[key].filter(function (id) { return id !== job.id; });
    });
}

function wtcmd_stopWorkers(ids)
{
    const stopped = {};
    ids.forEach(function (id) { stopped[String(id)] = true; wtcmd_workers[String(id)] = []; });
    wtcmd_openJobs().forEach(function (job) {
        if (wtcmd_recoveryEnabled() && !job.workers.some(function(id) { return stopped[String(id)]; })) return;
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
    Object.keys(wtcmd_demolitionOrders).forEach(function(key) {
        const target=getObject(STRUCTURE,selectedPlayer,Number(key));
        if(!target)delete wtcmd_demolitionOrders[key];else wtcmd_demolitionRecord(target);
    });
    wtcmd_openJobs().forEach(function (job) { if (wtcmd_done(job)) wtcmd_finishJob(job, "done"); });
    const builders = wtcmd_builders();
    wtcmd_reconcileBuilders(builders);
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
        const siteError = wtcmd_buildSiteError(job, [droid], true);
        if (siteError) { wtcmd_blockBuild(job, siteError); return; }
        if ((job.attempts[key] || 0) >= 3) { wtcmd_blockBuild(job, "build-blocked"); return; }
        const existing = wtcmd_structAt(job);
        if(wtcmd_recoveryEnabled()&&(job.resumeStructureId||job.parentId)&&!existing){job.status="blocked";job.reason="construction-changed";return;}
        // Module levels serialize per parent even when different worker groups
        // queue them. A group may still join the level already being built.
        if (job.parentId && existing && job.targetModules > Number(existing.modules || 0)
            && (existing.status !== BUILT || Number(existing.modules || 0) < job.targetModules - 1)) return;
        let accepted;
        if (existing && (!job.parentId || wtcmd_recoveryEnabled() && existing.status!==BUILT && Number(existing.modules||0)>=job.targetModules)) accepted = orderDroidObj(droid, DORDER_HELPBUILD, existing);
        else accepted = orderDroidBuild(droid, DORDER_BUILD, job.itemId, job.x, job.y);
        job.attempts[key] = (job.attempts[key] || 0) + 1; job.issued[key] = gameTime;
        if (accepted) job.status = "working";
        else { wtcmd_blockBuild(job, "engine-rejected"); }
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

function wtcmd_cancelProduction(command)
{
    const factoryId = Number(command.factoryId);
    if (!Number.isInteger(factoryId) || factoryId < 0 || factoryId > 4294967295) {
        wtcmd_answer(command, false, "factory-missing"); return;
    }
    const factory = getObject(STRUCTURE, selectedPlayer, factoryId);
    if (!factory || factory.id !== factoryId || factory.player !== selectedPlayer || factory.status !== BUILT
        || [FACTORY, CYBORG_FACTORY, VTOL_FACTORY].indexOf(factory.stattype) < 0) {
        wtcmd_answer(command, false, "factory-missing"); return;
    }
    const key = String(factory.id), active = wtcmd_factoryActive[key];
    // A stale row must never cancel the next unit, even of the same design.
    if (!active || typeof command.jobId !== "string" || active.id !== command.jobId
        || typeof command.currentId !== "string" || command.currentId.length > 128) {
        wtcmd_answer(command, false, "production-changed"); return;
    }
    const current = wtcmd_currentProduction(factory);
    const observation = wtcmd_productionObservation(factory, current, active);
    if (!observation.queueKnown || !observation.progress.available
        || observation.progress.currentId !== command.currentId) {
        wtcmd_answer(command, false, "production-changed"); return;
    }
    if (typeof towersCancelProduction !== "function") {
        wtcmd_answer(command, false, "production-unavailable"); return;
    }
    const identity = command.currentId.split(":").map(Number);
    if (identity.length !== 3 || identity[0] !== factory.id
        || identity.some(function(value) { return !Number.isInteger(value) || value < 0 || value > 4294967295; })
        || !towersCancelProduction(identity[0], identity[1], identity[2])) {
        wtcmd_answer(command, false, "production-changed"); return;
    }
    // Only the native engine refunds the cancelled current unit. Keep every
    // waiting entry; the ordinary FIFO tick starts the next one when ready.
    active.status = "cancelled";
    delete wtcmd_factoryActive[key];
    wtcmd_answer(command, true, "production-cancelled", {
        factoryId:factory.id, jobId:active.id, currentId:command.currentId
    });
}

function wtcmd_productionDesignKey(design)
{
    return JSON.stringify([design.body, design.propulsion, design.turrets || []]);
}

function wtcmd_reconcileProductionRepeats()
{
    if (wtcmd_productionRepeatPlayer !== selectedPlayer) {
        Object.keys(wtcmd_production).forEach(function(key) {
            wtcmd_production[key] = wtcmd_production[key].filter(function(job) { return job.repeat !== true; });
        });
        wtcmd_productionRepeats = {}; wtcmd_productionRepeatPlayer = selectedPlayer;
    }
    Object.keys(wtcmd_productionRepeats).forEach(function(key) {
        const policy = wtcmd_productionRepeats[key], factory = getObject(STRUCTURE, selectedPlayer, Number(key));
        if (!policy || policy.enabled !== true || policy.player !== selectedPlayer || !factory
            || factory.player !== selectedPlayer || [FACTORY, CYBORG_FACTORY, VTOL_FACTORY].indexOf(factory.stattype) < 0)
        {
            delete wtcmd_productionRepeats[key];
            wtcmd_production[key] = (wtcmd_production[key] || []).filter(function(job) { return job.repeat !== true; });
        }
    });
}

function wtcmd_productionRepeatState(factory)
{
    wtcmd_reconcileProductionRepeats();
    const policy = wtcmd_productionRepeats[String(factory.id)];
    return policy ? { enabled:true, key:policy.key, design:policy.design } : { enabled:false, key:"", design:null };
}

function wtcmd_setProductionRepeatPlan(factory, design, enabled)
{
    wtcmd_reconcileProductionRepeats();
    const key = String(factory.id);
    // An unstarted automatic continuation is part of the repeat policy, not a
    // separately requested unit. Turning repeat off cannot leave one behind.
    wtcmd_production[key] = (wtcmd_production[key] || []).filter(function(job) { return job.repeat !== true; });
    if (enabled) wtcmd_productionRepeats[key] = { enabled:true, player:selectedPlayer,
        key:wtcmd_productionDesignKey(design), design:JSON.parse(JSON.stringify(design)) };
    else delete wtcmd_productionRepeats[key];
}

function wtcmd_resolveProductionDesign(command)
{
    let design;
    if (command.templateId) {
        const native = enumTemplates(selectedPlayer).filter(function(t) { return wtcmd_templateKey(t) === command.templateId; })[0];
        if (!native || !wtcmd_templateAvailable(native)) return { error:"template-unavailable" };
        design = wtcmd_templateParts(native);
    } else {
        const saved = command.design;
        const match = saved && saved.factoryTemplate && Array.isArray(saved.turrets)
            ? enumTemplates(selectedPlayer).find(function(t) {
                const d = wtcmd_templateParts(t);
                return wtcmd_templateAvailable(t) && d.body === saved.body && d.propulsion === saved.propulsion
                    && JSON.stringify(d.turrets) === JSON.stringify(saved.turrets);
            }) : null;
        if (match) {
            design = wtcmd_templateParts(match);
            design.name = String(saved.name || design.name).replace(/[\x00-\x1f]/g, " ").trim().slice(0, 48);
            if (!design.name) return { error:"incomplete-design" };
        } else {
            const validation = wtcmd_validateDesign(command.design, false);
            if (validation.error) return validation;
            design = validation.design;
        }
    }
    return { design:design };
}

function wtcmd_setProductionRepeat(command)
{
    const factoryId = Number(command.factoryId);
    if (!Number.isInteger(factoryId) || factoryId < 0 || factoryId > 4294967295) { wtcmd_answer(command, false, "factory-missing"); return; }
    const factory = getObject(STRUCTURE, selectedPlayer, factoryId);
    if (!factory || factory.id !== factoryId || factory.player !== selectedPlayer || factory.status !== BUILT
        || [FACTORY, CYBORG_FACTORY, VTOL_FACTORY].indexOf(factory.stattype) < 0) {
        wtcmd_answer(command, false, "factory-missing"); return;
    }
    if (typeof command.enabled !== "boolean") { wtcmd_answer(command, false, "invalid"); return; }
    if (command.all !== undefined && typeof command.all !== "boolean") { wtcmd_answer(command, false, "invalid"); return; }
    if (command.all === true) { wtcmd_setAllProductionRepeat(command, factory); return; }
    if (!command.enabled) {
        if ((command.templateId || command.design) && wtcmd_productionRepeatState(factory).enabled) {
            const resolved = wtcmd_resolveProductionDesign(command);
            if (resolved.error || wtcmd_productionDesignKey(resolved.design) !== wtcmd_productionRepeatState(factory).key) {
                wtcmd_answer(command, false, resolved.error || "production-changed"); return;
            }
        }
        wtcmd_setProductionRepeatPlan(factory, null, false);
        wtcmd_answer(command, true, "repeat-updated", wtcmd_productionRepeatState(factory)); return;
    }
    const key = String(factory.id), candidates = [wtcmd_factoryActive[key]?.design,
        wtcmd_currentProduction(factory)].concat((wtcmd_production[key] || []).filter(function(job) { return !job.repeat; }).map(function(job) { return job.design; })).filter(Boolean);
    const resolved = command.templateId || command.design ? wtcmd_resolveProductionDesign(command) : { design:candidates[0] };
    if (resolved.error) { wtcmd_answer(command, false, resolved.error); return; }
    const design = resolved.design;
    if (!design || !candidates.some(function(d) { return wtcmd_productionDesignKey(d) === wtcmd_productionDesignKey(design); })) {
        wtcmd_answer(command, false, "production-changed"); return;
    }
    if (!wtcmd_factoryAllows(design, factory)) { wtcmd_answer(command, false, "factory-incompatible"); return; }
    wtcmd_setProductionRepeatPlan(factory, design, true);
    wtcmd_answer(command, true, "repeat-updated", wtcmd_productionRepeatState(factory));
}

function wtcmd_allProductionFactories(factory, design)
{
    // Resolve the category from the actual owned factory, never from a UI list.
    // Only the first completed vehicle/cyborg factory exposes the batch scope.
    if (factory.stattype !== FACTORY && factory.stattype !== CYBORG_FACTORY) return { error:"factory-incompatible" };
    const peers = enumStruct(selectedPlayer).filter(function(s) {
        return s.player === selectedPlayer && s.status === BUILT && s.stattype === factory.stattype;
    }).sort(function(a,b) { return a.id-b.id; });
    if (!peers.length || peers[0].id !== factory.id) return { error:"production-changed" };
    return { factories:peers.filter(function(s) { return wtcmd_factoryAllows(design,s); }) };
}

function wtcmd_setAllProductionRepeat(command, factory)
{
    const resolved = wtcmd_resolveProductionDesign(command);
    if (resolved.error) { wtcmd_answer(command, false, resolved.error); return; }
    const design = resolved.design, targets = wtcmd_allProductionFactories(factory, design);
    if (targets.error) { wtcmd_answer(command, false, targets.error); return; }
    const designKey = wtcmd_productionDesignKey(design), eligible = targets.factories.filter(function(s) {
        const key = String(s.id), policy = wtcmd_productionRepeatState(s);
        if (!command.enabled) return policy.enabled && policy.key === designKey;
        const candidates = [wtcmd_factoryActive[key]?.design, wtcmd_currentProduction(s)]
            .concat((wtcmd_production[key] || []).filter(function(job) { return !job.repeat; }).map(function(job) { return job.design; })).filter(Boolean);
        return candidates.some(function(d) { return wtcmd_productionDesignKey(d) === designKey; });
    });
    if (command.enabled && !eligible.length) { wtcmd_answer(command, false, "production-changed"); return; }
    eligible.forEach(function(s) { wtcmd_setProductionRepeatPlan(s, design, command.enabled); });
    wtcmd_answer(command, true, "repeat-updated", { all:true, factoryId:factory.id,
        factories:eligible.map(function(s) { return { factoryId:s.id, repeat:wtcmd_productionRepeatState(s) }; }) });
}

function wtcmd_stopProduction(command)
{
    const factoryId = Number(command.factoryId);
    if (!Number.isInteger(factoryId) || factoryId < 0 || factoryId > 4294967295) { wtcmd_answer(command, false, "factory-missing"); return; }
    const factory = getObject(STRUCTURE, selectedPlayer, factoryId);
    if (!factory || factory.id !== factoryId || factory.player !== selectedPlayer || factory.status !== BUILT
        || [FACTORY, CYBORG_FACTORY, VTOL_FACTORY].indexOf(factory.stattype) < 0) {
        wtcmd_answer(command, false, "factory-missing"); return;
    }
    const key = String(factory.id), active = wtcmd_factoryActive[key], current = wtcmd_currentProduction(factory);
    // Validate the actual native subject before changing this factory's FIFO.
    // A failed native cancellation must never be acknowledged as a full Stop.
    const hadCurrent = Boolean(current || !structureIdle(factory));
    if (hadCurrent) {
        const observation = wtcmd_productionObservation(factory, current, active), identity = observation.progress.currentId.split(":").map(Number);
        if (!observation.queueKnown || !observation.progress.available || typeof towersCancelProduction !== "function") {
            wtcmd_answer(command, false, "production-unavailable"); return;
        }
        if (identity.length !== 3 || identity[0] !== factory.id
            || identity.some(function(value) { return !Number.isInteger(value) || value < 0 || value > 4294967295; })
            || !towersCancelProduction(identity[0], identity[1], identity[2])) {
            wtcmd_answer(command, false, "production-changed"); return;
        }
    }
    const removed = (wtcmd_production[key] || []).map(function(job) { return job.id; });
    wtcmd_setProductionRepeatPlan(factory, null, false);
    wtcmd_production[key] = [];
    if (active) active.status = "cancelled";
    delete wtcmd_factoryActive[key];
    wtcmd_answer(command, true, "production-stopped", { factoryId:factory.id, removedJobIds:removed,
        waitingCancelled:removed.length, currentCancelled:hadCurrent ? 1 : 0, repeat:{enabled:false,key:"",design:null} });
}

function wtcmd_queueProduction(command)
{
    const factory = getObject(STRUCTURE, selectedPlayer, Number(command.factoryId));
    if (!factory || factory.player !== selectedPlayer || factory.status !== BUILT
        || [FACTORY, CYBORG_FACTORY, VTOL_FACTORY].indexOf(factory.stattype) < 0) {
        wtcmd_answer(command, false, "factory-missing"); return;
    }
    if (command.repeat !== undefined && typeof command.repeat !== "boolean") { wtcmd_answer(command, false, "invalid"); return; }
    if (command.all !== undefined && typeof command.all !== "boolean") { wtcmd_answer(command, false, "invalid"); return; }
    const resolved = wtcmd_resolveProductionDesign(command);
    if (resolved.error) { wtcmd_answer(command, false, resolved.error); return; }
    const design = resolved.design;
    const count = Number(command.count || 1);
    if (!wtcmd_factoryAllows(design, factory)) { wtcmd_answer(command, false, "factory-incompatible"); return; }
    if (!Number.isInteger(count) || count < 1 || count > 20) { wtcmd_answer(command, false, "invalid"); return; }
    const targets = command.all === true ? wtcmd_allProductionFactories(factory, design) : { factories:[factory] };
    if (targets.error) { wtcmd_answer(command, false, targets.error); return; }
    const eligible = targets.factories.filter(function(s) { return (wtcmd_production[String(s.id)] || []).length + count <= 64; });
    if (!eligible.length) { wtcmd_answer(command, false, "queue-full"); return; }
    eligible.forEach(function(s) {
        const key = String(s.id);
        if (!wtcmd_production[key]) wtcmd_production[key] = [];
        if (command.repeat !== undefined) wtcmd_setProductionRepeatPlan(s, design, command.repeat);
        for (let i = 0; i < count; i++) wtcmd_production[key].push({
            id: command.nonce + (command.all === true ? "-"+s.id : "") + "-" + i,
            design: JSON.parse(JSON.stringify(design)), status: "queued", reason: "" });
    });
    wtcmd_answer(command, true, "queued", command.all === true ? { all:true, factoryId:factory.id,
        count:count*eligible.length, perFactoryCount:count, factoryIds:eligible.map(function(s) { return s.id; }),
        skippedFactoryIds:targets.factories.filter(function(s) { return eligible.indexOf(s) < 0; }).map(function(s) { return s.id; }),
        factories:eligible.map(function(s) { return { factoryId:s.id, repeat:wtcmd_productionRepeatState(s) }; }) }
        : { factoryId:factory.id, count:count, repeat:wtcmd_productionRepeatState(factory) });
    wtcmd_tickProduction();
}

function wtcmd_tickProduction()
{
    wtcmd_reconcileProductionRepeats();
    const factories = enumStruct(selectedPlayer).filter(function (s) {
        return [FACTORY, CYBORG_FACTORY, VTOL_FACTORY].indexOf(s.stattype) >= 0;
    }).sort(function (a, b) { return a.id - b.id; });
    factories.forEach(function (factory, index) {
        const key = String(factory.id), jobs = wtcmd_production[key] || [];
        if (factory.status !== BUILT || !structureIdle(factory)) return;
        const previous = wtcmd_factoryActive[key];
        if (previous && gameTime - previous.started < 1200) return;
        if (previous) {
            // Native production finished; explicit UI cancellation already removed its active record.
            previous.status = "done"; delete wtcmd_factoryActive[key];
        }
        const policy = wtcmd_productionRepeats[key];
        if (!jobs.length && policy) {
            const job = { id:"repeat-" + factory.id + "-" + (++wtcmd_serial),
                design:JSON.parse(JSON.stringify(policy.design)), status:"queued", reason:"", repeat:true };
            wtcmd_production[key] = jobs; jobs.push(job);
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
            else if (command.action === "demolish-state") wtcmd_answer(command,true,'',wtcmd_demolitionState());
            else if (command.action === "demolish") wtcmd_demolish(command);
            else if (command.action === "apply-rewards") {
                const result = typeof wtreward_apply === "function" ? wtreward_apply(command.rewards) : {ok:false,error:"rewards-unavailable"};
                wtcmd_answer(command, result.ok, result.error, result);
            }
            else if (command.action === "add-rewards") {
                const result=typeof wtreward_add === "function" ? wtreward_add(command.rewards) : {ok:false,error:"rewards-unavailable"};
                wtcmd_answer(command,result.ok,result.error,result);
            }
            else if (command.action === "resume-rewards") {
                const result=typeof wtreward_resume === "function" ? wtreward_resume(command.rewards) : {ok:false,error:"rewards-unavailable"};
                wtcmd_answer(command,result.ok,result.error,result);
            }
            else if (command.action === "reward-inventory") {
                const result=typeof wtreward_state === "function" ? wtreward_state() : {ok:false,error:"rewards-unavailable"};
                if (typeof warzoneTowersWaves_refreshClears === "function") {
                    warzoneTowersWaves_refreshClears();
                    result.completedWaves=warzoneTowersWaves_state.completedWaves.slice();
                }
                wtcmd_answer(command,result.ok,result.error,result);
            }
            else if (command.action === "reward-lassat") {
                const result=typeof wtreward_fireLasSat === "function" ? wtreward_fireLasSat(command) : {ok:false,error:"rewards-unavailable"};
                wtcmd_answer(command,result.ok,result.error,result);
            }
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
            else if (command.action === "cancel-production") wtcmd_cancelProduction(command);
            else if (command.action === "set-production-repeat") wtcmd_setProductionRepeat(command);
            else if (command.action === "stop-production") wtcmd_stopProduction(command);
            else if (wtcmd_recoveryEnabled() && command.action === "resume-builds") wtcmd_resumeBuilds(command);
            else if (wtcmd_recoveryEnabled() && command.action === "resume-structure") wtcmd_resumeStructure(command);
            else if (command.action === "cancel-job" || command.action === "retry-job") {
                if(wtcmd_recoveryEnabled()&&command.action==="retry-job"){wtcmd_resumeBuilds(command);return;}
                const job = wtcmd_openJobs().filter(function (j) { return j.id === command.jobId; })[0];
                if (!job) { wtcmd_answer(command, false, "job-missing"); return; }
                if (command.action === "cancel-job") {
                    job.workers.forEach(function (id) {
                        const droid = getObject(DROID, selectedPlayer, id), ids = wtcmd_workers[String(id)] || [];
                        const orders=[DORDER_BUILD,DORDER_HELPBUILD];
                        if(wtcmd_recoveryEnabled()){
                            if(typeof DORDER_LINEBUILD!=="undefined")orders.push(DORDER_LINEBUILD);
                            if(typeof DORDER_BUILDMODULE!=="undefined")orders.push(DORDER_BUILDMODULE);
                        }
                        if (droid && ids[0] === job.id && orders.indexOf(droid.order) >= 0) orderDroid(droid, DORDER_STOP);
                    });
                    wtcmd_finishJob(job, "cancelled");
                } else {
                    wtcmd_retryBuild(command,job);return;
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
                    
                }
                
                
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

function wtcmd_revokeDemolitionContext()
{
    if(wtcmd_recoveryEnabled())wtcmd_recoveryContext=String(gameTime)+"-"+String(Date.now());
    let intent;
    try { intent=includeJSON('warzone-towers-demolition-intent.json',true); } catch (_) {}
    wtcmd_demolitionRevokedIntent=intent&&typeof intent.intent==='string'?intent.intent:'';
    // Independent of gameTime: loading a newer save must also leave targeting.
    dump('WTCMD:'+JSON.stringify({nonce:'demolish-reset',action:'demolish-reset',ok:true,gameTime:gameTime}));
}
function wtcmd_eventStartLevel() { wtcmd_productionRepeatPlayer=-1;wtcmd_reconcileProductionRepeats();wtcmd_revokeDemolitionContext();queue("wtcmd_initialize", 160); }
function wtcmd_eventGameLoaded() { wtcmd_revokeDemolitionContext();queue("wtcmd_initialize", 160); }
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
