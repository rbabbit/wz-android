/* Portable shop stock, applied to this human match only. Native var state saves. */
namespace("wtreward_");
var wtreward_match = {version:2,session:"",applied:false,error:"",config:null,
    supplyApplied:false,researchApplied:false,labRates:{},entries:{},lassatPending:null,transactions:{}};
var wtreward_types = {
    fortress:{id:"X-Super-Cannon",research:"R-Defense-Super-Cannon",fortress:true},
    missile_fortress:{id:"X-Super-Missile",research:"R-Defense-Super-Missile",fortress:true},
    mass_driver_fortress:{id:"X-Super-MassDriver",research:"R-Defense-MassDriver",fortress:true},
    rocket_bastion:{id:"X-Super-Rocket",research:"R-Defense-Super-Rocket",fortress:true},
    gauss_hardpoint:{id:"WallTower-Rail3",research:"R-Defense-WallTower-Rail3"},
    gauss_emplacement:{id:"Emplacement-Rail3",research:"R-Defense-Rail3"},
    scourge_hardpoint:{id:"WallTower-Atmiss",research:"R-Defense-WallTower-A-Tmiss"},
    pulse_hardpoint:{id:"WallTower-PulseLas",research:"R-Defense-WallTower-PulseLas"},
    heavy_laser:{id:"Emplacement-HeavyLaser",research:"R-Defense-HeavyLas"},
    emp_hardpoint:{id:"WallTower-EMP",research:"R-Defense-EMPCannon"},
    emp_mortar:{id:"Emplacement-MortarEMP",research:"R-Defense-EMPMortar"},
    archangel:{id:"Emplacement-HvART-pit",research:"R-Defense-HvyArtMissile"},
    ripple:{id:"Emplacement-Rocket06-IDF",research:"R-Defense-IDFRocket"},
    hellstorm:{id:"Emplacement-RotHow",research:"R-Defense-RotHow"},
    ground_shaker:{id:"Emplacement-Howitzer150",research:"R-Defense-HvyHowitzer"},
    wide_sensor:{id:"Sys-SensoTowerWS",research:"R-Sys-Sensor-WSTower"},
    laser_sat:{id:"A0LasSatCommand",research:"R-Wpn-LasSat"}
};

function wtreward_statName(id,group)
{
    return Object.keys(Stats[group || "Building"] || {}).filter(function(name) {
        return Stats[group || "Building"][name].Id === id;
    })[0] || "";
}

function wtreward_config(request)
{
    const config={items:{},research:false,supply:false};
    for (const key of ["research","supply"]) {
        if (request[key]!==undefined && typeof request[key]!=="boolean") throw Error("reward-config-invalid");
        config[key]=request[key]===true;
    }
    let items=request.items;
    if (items===undefined) items=request.fortress===true ? {fortress:1} : {};
    if (!items || typeof items!=="object" || Array.isArray(items)) throw Error("reward-items-invalid");
    let fortresses=0;
    Object.keys(items).sort().forEach(function(key) {
        const quantity=items[key];
        if (!Object.prototype.hasOwnProperty.call(wtreward_types,key) || !Number.isInteger(quantity) || quantity<0 || quantity>999)
            throw Error("reward-item-invalid");
        if (!quantity) return;
        if (key==="laser_sat" && quantity>1) throw Error("reward-lassat-limit");
        if (wtreward_types[key].fortress) fortresses+=quantity;
        config.items[key]=quantity;
    });
    if (fortresses>3) throw Error("reward-fortress-limit");
    return config;
}

function wtreward_migrate()
{
    const s=wtreward_match;if (s.version===2) {if (!s.transactions) s.transactions={};return;}
    s.entries={};s.lassatPending=null;
    if (s.config) {
        const config=wtreward_config(s.config);
        if (config.items.fortress && s.fortressApplied) {
            const seen={};if (s.fortressId) seen[String(s.fortressId)]=true;
            s.entries.fortress={quantity:1,consumed:s.fortressUsed?1:0,seen:seen,preexisting:{},
                natural:Boolean(s.fortressNatural),originalLimit:Number(s.fortressOriginalLimit || 0)};
        }
        s.config=config;
    }
    s.version=2;s.transactions={};
}

function wtreward_unplacedJobs(id,structures)
{
    const jobs=typeof wtcmd_jobs==="object" ? wtcmd_jobs : [];
    const at=function(job) { return structures.some(function(s) {return s.x===job.x && s.y===job.y;}); };
    const pending=jobs.filter(function(job) {
        return job.itemId===id && job.status!=="done" && job.status!=="cancelled" && !at(job);
    });
    const sites=typeof wtcmd_nativeSites==="object" ? wtcmd_nativeSites : [];
    return pending.concat(sites.filter(function(site) {
        return site.itemId===id && ["done","cancelled","interrupted"].indexOf(site.status)<0 && !at(site)
            && !jobs.some(function(job) {return job.id===site.id;});
    }));
}

function wtreward_syncItems()
{
    wtreward_migrate();const s=wtreward_match;
    Object.keys(s.entries).forEach(function(key) {
        const entry=s.entries[key],type=wtreward_types[key];
        if (entry.natural) return;
        const structures=enumStruct(selectedPlayer,type.id);
        structures.forEach(function(structure) {
            const id=String(structure.id);
            if (!entry.seen[id] && !entry.preexisting[id]) {entry.seen[id]=true;entry.consumed++;}
        });
        if (getResearch(type.research,selectedPlayer).done) {
            entry.natural=true;setStructureLimits(type.id,entry.originalLimit,selectedPlayer);return;
        }
        const remaining=Math.max(0,entry.quantity-entry.consumed),limit=structures.length+remaining;
        // Extant foundations remain valid for native saves. Destroyed copies do
        // not replenish stock; cancelling before a foundation spends nothing.
        if (getStructureLimit(type.id,selectedPlayer)!==limit) setStructureLimits(type.id,limit,selectedPlayer);
        if (!remaining) wtreward_unplacedJobs(type.id,structures).forEach(function(job) {
            if (typeof wtcmd_finishJob==="function" && wtcmd_jobs.indexOf(job)>=0) wtcmd_finishJob(job,"cancelled");
            else {job.status="interrupted";job.remaining=null;}
        });
    });
}

function wtreward_canBuild(itemId)
{
    wtreward_syncItems();
    const key=Object.keys(wtreward_match.entries).filter(function(key) {return wtreward_types[key].id===itemId;})[0];
    if (!key) return "";
    const entry=wtreward_match.entries[key];if (entry.natural) return "";
    const remaining=Math.max(0,entry.quantity-entry.consumed);
    if (!remaining) return "reward-used";
    return wtreward_unplacedJobs(itemId,enumStruct(selectedPlayer,itemId)).length>=remaining ? "reward-reserved" : "";
}

/* Frozen Compat upgrades add a base-stat delta. Remove only our old bonus. */
function wtreward_syncResearch()
{
    const s=wtreward_match;if (!s.researchApplied) return;
    Object.keys(s.labRates).forEach(function(name) {
        const upgrade=Upgrades[selectedPlayer].Building[name],fields=s.labRates[name];
        ["ResearchPoints","ModuleResearchPoints"].forEach(function(field) {
            const record=fields[field],current=Number(upgrade[field]);
            if (!Number.isFinite(current) || current<0) throw Error("research-rate-invalid");
            if (current!==record.last) record.base=Math.max(0,current-record.bonus);
            record.bonus=Math.ceil(record.base/4);const desired=record.base+record.bonus;
            if (current!==desired) upgrade[field]=desired;record.last=desired;
        });
    });
}

function wtreward_lasSats()
{
    if (!wtreward_statName("A0LasSatCommand")) return [];
    const structures=enumStruct(selectedPlayer,"A0LasSatCommand").filter(function(s) {return s.status===BUILT;});
    let pending=wtreward_match.lassatPending;
    if (pending && (!structures.some(function(s) {return s.id===pending.id;}) || gameTime-pending.at>1500))
        wtreward_match.lassatPending=pending=null;
    return structures.map(function(structure) {
        const weapon=(structure.weapons || [])[0],name=weapon && wtreward_statName(weapon.id || weapon.name,"Weapon");
        const pause=name && Upgrades[selectedPlayer].Weapon[name] && Number(Upgrades[selectedPlayer].Weapon[name].FirePause);
        const last=weapon && Number(weapon.lastFired);
        if (pending && pending.id===structure.id && last>pending.last) wtreward_match.lassatPending=pending=null;
        const interval=Number.isFinite(pause) && pause>=0 ? pause*(Number(structure.health)<25 ? 2 : 1) : null;
        const remaining=interval===null || !Number.isFinite(last) ? null : Math.max(0,last+interval+1-gameTime);
        return {id:structure.id,x:structure.x,y:structure.y,selected:Boolean(structure.selected),remainingMs:remaining,
            pending:Boolean(pending && pending.id===structure.id),ready:remaining===0 && !(pending && pending.id===structure.id)};
    });
}

function wtreward_state()
{
    wtreward_syncItems();const s=wtreward_match,config=s.config || {},items={},remaining={},reserved={},natural={},nativeItems={};
    Object.keys(s.entries).forEach(function(key) {
        const entry=s.entries[key],id=wtreward_types[key].id;items[key]=entry.quantity;
        remaining[key]=Math.max(0,entry.quantity-entry.consumed);natural[key]=entry.natural;nativeItems[id]=key;
        reserved[key]=entry.natural ? 0 : wtreward_unplacedJobs(id,enumStruct(selectedPlayer,id)).length;
    });
    return {version:2,ok:s.applied && !s.error,session:s.session,applied:s.applied,error:s.error,
        items:items,remaining:remaining,reserved:reserved,natural:natural,nativeItems:nativeItems,lasSats:wtreward_lasSats(),
        research:s.researchApplied,supply:s.supplyApplied,researchMultiplier:s.researchApplied ? 1.25 : 1,
        baseConfig:s.config,transactions:Object.keys(s.transactions).filter(function(id) {return s.transactions[id].applied;}),
        pendingTransactions:Object.keys(s.transactions).filter(function(id) {return !s.transactions[id].applied;}),
        supplyPower:s.supplyApplied ? 1000 : 0,fortress:Boolean(items.fortress),fortressType:"X-Super-Cannon",
        fortressUsed:Boolean(items.fortress && !remaining.fortress),fortressReserved:Boolean(reserved.fortress),fortressNatural:Boolean(natural.fortress)};
}

function wtreward_apply(request)
{
    if (!request || typeof request!=="object" || typeof request.session!=="string"
        || !/^[A-Za-z0-9_-]{1,96}$/.test(request.session)) return {ok:false,error:"reward-session-invalid"};
    wtreward_migrate();let config;try {config=wtreward_config(request);} catch(error) {return {ok:false,error:error.message};}
    const s=wtreward_match;
    if (s.session && s.session!==request.session) return {ok:false,error:"reward-session-conflict"};
    if (s.config && JSON.stringify(config)!==JSON.stringify(s.config)) return {ok:false,error:"reward-config-conflict"};
    if (s.applied) return wtreward_state();
    for (const key of Object.keys(config.items)) if (!wtreward_statName(wtreward_types[key].id)) return {ok:false,error:"reward-structure-unavailable"};
    const labName=config.research ? wtreward_statName("A0ResearchFacility") : "";
    if (config.research && (!labName || !Upgrades[selectedPlayer].Building[labName])) return {ok:false,error:"research-unavailable"};
    if (config.research && !["ResearchPoints","ModuleResearchPoints"].every(function(field) {
        return Number.isFinite(Number(Upgrades[selectedPlayer].Building[labName][field])) && Number(Upgrades[selectedPlayer].Building[labName][field])>=0;
    })) return {ok:false,error:"research-rate-invalid"};
    if (config.supply && !Number.isFinite(Number(playerPower(selectedPlayer)))) return {ok:false,error:"power-invalid"};
    s.session=request.session;s.config=config;s.error="";
    try {
        Object.keys(config.items).forEach(function(key) {
            if (s.entries[key]) return;const type=wtreward_types[key],preexisting={};
            enumStruct(selectedPlayer,type.id).forEach(function(o) {preexisting[String(o.id)]=true;});
            const natural=Boolean(getResearch(type.research,selectedPlayer).done || isStructureAvailable(type.id,selectedPlayer));
            s.entries[key]={quantity:config.items[key],consumed:0,seen:{},preexisting:preexisting,natural:natural,originalLimit:getStructureLimit(type.id,selectedPlayer)};
            if (!natural) enableStructure(type.id,selectedPlayer);
        });
        wtreward_syncItems();
        if (config.research && !s.researchApplied) {
            const lab=Upgrades[selectedPlayer].Building[labName],fields={};
            ["ResearchPoints","ModuleResearchPoints"].forEach(function(field) {const current=Number(lab[field]);fields[field]={base:current,bonus:0,last:current};});
            s.labRates[labName]=fields;s.researchApplied=true;wtreward_syncResearch();
        }
        if (config.supply && !s.supplyApplied) {setPower(playerPower(selectedPlayer)+1000,selectedPlayer);s.supplyApplied=true;}
        s.applied=true;
    } catch(error) {s.error=String(error.message || error);}
    return wtreward_state();
}

function wtreward_reject(request,error)
{
    const s=wtreward_match,id=request && request.transactionId,transaction=typeof id==="string" && s.transactions[id];
    // A refund quote is proof of no native effects, not a generic error. A
    // pending/committed journal entry can never produce that proof.
    const clean=Boolean(request && request.session===s.session && s.applied && typeof id==="string"
        && /^[A-Za-z0-9_-]{1,96}$/.test(id) && !transaction);
    return {ok:false,error:error,session:s.session,transactionId:typeof id==="string" ? id : "",rejected:clean,
        transactionApplied:Boolean(transaction && transaction.applied),transactionPending:Boolean(transaction && !transaction.applied)};
}

function wtreward_add(request)
{
    wtreward_migrate();const s=wtreward_match;
    if (!request || request.session!==s.session || !s.applied || s.error) return wtreward_reject(request,"reward-session-conflict");
    const id=request.transactionId;
    if (typeof id!=="string" || !/^[A-Za-z0-9_-]{1,96}$/.test(id)) return wtreward_reject(request,"reward-transaction-invalid");
    let config;try {config=wtreward_config(request);} catch(error) {return wtreward_reject(request,error.message);}
    const canonical=JSON.stringify(config),previous=s.transactions[id];
    if (previous && previous.config!==canonical) return wtreward_reject(request,"reward-transaction-conflict");
    if (previous && previous.applied) return Object.assign(wtreward_state(),{transactionId:id,transactionApplied:true,transactionPending:false});
    if (config.research && s.researchApplied && !(previous && previous.researchStarted)) return wtreward_reject(request,"reward-research-active");
    if (config.supply && s.supplyApplied && !(previous && previous.supplyStarted)) return wtreward_reject(request,"reward-supply-active");
    let fortresses=Object.keys(s.entries).reduce(function(sum,key) {return sum+(wtreward_types[key].fortress?s.entries[key].quantity:0);},0);
    for (const key of Object.keys(config.items)) {
        if (!wtreward_statName(wtreward_types[key].id)) return wtreward_reject(request,"reward-structure-unavailable");
        const quantity=(s.entries[key]?.quantity || 0)+(previous?.itemsApplied[key] ? 0 : config.items[key]);
        if (quantity>999) return wtreward_reject(request,"reward-item-limit");
        if (key==="laser_sat" && quantity>1) return wtreward_reject(request,"reward-lassat-limit");
        if (wtreward_types[key].fortress && !previous?.itemsApplied[key]) fortresses+=config.items[key];
    }
    if (fortresses>3) return wtreward_reject(request,"reward-fortress-limit");
    const labName=config.research ? wtreward_statName("A0ResearchFacility") : "";
    if (config.research && (!labName || !Upgrades[selectedPlayer].Building[labName]
        || !["ResearchPoints","ModuleResearchPoints"].every(function(field) {return Number.isFinite(Number(Upgrades[selectedPlayer].Building[labName][field])) && Number(Upgrades[selectedPlayer].Building[labName][field])>=0;})))
        return wtreward_reject(request,"research-rate-invalid");
    if (config.supply && !Number.isFinite(Number(playerPower(selectedPlayer)))) return wtreward_reject(request,"power-invalid");
    const transaction=previous || {config:canonical,applied:false,itemsApplied:{},researchStarted:false,supplyStarted:false,error:""};
    s.transactions[id]=transaction;
    try {
        Object.keys(config.items).forEach(function(key) {
            const type=wtreward_types[key];let entry=s.entries[key];
            if (!entry) {
                const preexisting={};enumStruct(selectedPlayer,type.id).forEach(function(o) {preexisting[String(o.id)]=true;});
                entry=s.entries[key]={quantity:0,consumed:0,seen:{},preexisting:preexisting,
                    natural:Boolean(getResearch(type.research,selectedPlayer).done || isStructureAvailable(type.id,selectedPlayer)),
                    originalLimit:getStructureLimit(type.id,selectedPlayer)};
            }
            if (!transaction.itemsApplied[key]) {entry.quantity+=config.items[key];transaction.itemsApplied[key]=config.items[key];}
            if (!entry.natural) enableStructure(type.id,selectedPlayer);
        });
        wtreward_syncItems();
        if (config.research) {
            transaction.researchStarted=true;
            if (!s.researchApplied) {
                const lab=Upgrades[selectedPlayer].Building[labName],fields={};
                ["ResearchPoints","ModuleResearchPoints"].forEach(function(field) {const current=Number(lab[field]);fields[field]={base:current,bonus:0,last:current};});
                s.labRates[labName]=fields;s.researchApplied=true;
            }
            wtreward_syncResearch();
        }
        if (config.supply) {
            transaction.supplyStarted=true;
            if (!s.supplyApplied) {setPower(playerPower(selectedPlayer)+1000,selectedPlayer);s.supplyApplied=true;}
        }
        transaction.applied=true;transaction.error="";
    } catch(error) {transaction.error=String(error.message || error);}
    const result=wtreward_state();
    return Object.assign(result,{ok:transaction.applied,transactionId:id,transactionApplied:transaction.applied,
        transactionPending:!transaction.applied,rejected:false,error:transaction.error});
}

function wtreward_resume(request)
{
    wtreward_migrate();const s=wtreward_match;
    if (!request || request.session!==s.session || !s.applied || s.error) return {ok:false,error:"resume-session-conflict"};
    if (!request.items || typeof request.items!=="object" || Array.isArray(request.items)
        || !request.remaining || typeof request.remaining!=="object" || Array.isArray(request.remaining)) return {ok:false,error:"resume-inventory-invalid"};
    let config;try {config=wtreward_config(request);} catch(error) {return {ok:false,error:error.message};}
    for (const key of Object.keys(request.remaining)) {
        const cap=request.remaining[key];
        if (!Object.prototype.hasOwnProperty.call(wtreward_types,key) || !Number.isInteger(cap) || cap<0 || cap>(config.items[key] || 0))
            return {ok:false,error:"resume-allowance-invalid"};
    }
    wtreward_syncItems();
    const keys=Array.from(new Set(Object.keys(s.entries).concat(Object.keys(config.items)))),plans=[];let fortresses=0;
    for (const key of keys) {
        const type=wtreward_types[key],entry=s.entries[key],savedQuantity=entry ? entry.quantity : 0;
        if (!type || !wtreward_statName(type.id) || !Number.isInteger(savedQuantity) || savedQuantity<0 || savedQuantity>999)
            return {ok:false,error:"resume-item-invalid"};
        const quantity=Math.max(savedQuantity,config.items[key] || 0),cap=request.remaining[key] || 0;
        const savedRemaining=entry ? Math.max(0,savedQuantity-entry.consumed) : 0;
        // Preserve unused purchases funded after this save, without renewing a
        // single old spent token: phone remaining is the monotonic upper bound.
        const allowance=entry ? Math.min(cap,savedRemaining+Math.max(0,(config.items[key] || 0)-savedQuantity)) : cap;
        if (type.fortress) fortresses+=quantity;
        if (key==="laser_sat" && quantity>1) return {ok:false,error:"reward-lassat-limit"};
        plans.push({key:key,quantity:quantity,allowance:allowance});
    }
    if (fortresses>3) return {ok:false,error:"reward-fortress-limit"};
    const labName=config.research && !s.researchApplied ? wtreward_statName("A0ResearchFacility") : "";
    if (config.research && !s.researchApplied && (!labName || !Upgrades[selectedPlayer].Building[labName]
        || !["ResearchPoints","ModuleResearchPoints"].every(function(field) {return Number.isFinite(Number(Upgrades[selectedPlayer].Building[labName][field])) && Number(Upgrades[selectedPlayer].Building[labName][field])>=0;})))
        return {ok:false,error:"research-rate-invalid"};
    try {
        plans.forEach(function(plan) {
            const type=wtreward_types[plan.key];let entry=s.entries[plan.key];
            if (!entry) {
                const preexisting={};enumStruct(selectedPlayer,type.id).forEach(function(o) {preexisting[String(o.id)]=true;});
                entry=s.entries[plan.key]={quantity:0,consumed:0,seen:{},preexisting:preexisting,
                    natural:Boolean(getResearch(type.research,selectedPlayer).done || isStructureAvailable(type.id,selectedPlayer)),
                    originalLimit:getStructureLimit(type.id,selectedPlayer)};
            }
            entry.quantity=plan.quantity;entry.consumed=Math.max(entry.consumed,plan.quantity-plan.allowance);
            if (!entry.natural && plan.allowance>0) enableStructure(type.id,selectedPlayer);
        });
        wtreward_syncItems();
        if (config.research && !s.researchApplied) {
            const lab=Upgrades[selectedPlayer].Building[labName],fields={};
            ["ResearchPoints","ModuleResearchPoints"].forEach(function(field) {const current=Number(lab[field]);fields[field]={base:current,bonus:0,last:current};});
            s.labRates[labName]=fields;s.researchApplied=true;wtreward_syncResearch();
        }
        // A saved world already records its exact power balance. A later phone
        // purchase is marked spent, never replayed as another +1000 on restore.
        if (config.supply) s.supplyApplied=true;
    } catch(error) {return {ok:false,error:String(error.message || error),resumed:false};}
    return Object.assign(wtreward_state(),{resumed:true});
}

function wtreward_fireLasSat(command)
{
    const selected=wtreward_lasSats().filter(function(s) {return s.selected && (!command.structureId || s.id===command.structureId);})[0];
    if (!selected) return {ok:false,error:"lassat-select-required"};
    if (!selected.ready) return {ok:false,error:"lassat-cooling",remainingMs:selected.remainingMs};
    let targets=[];
    if (Number.isInteger(command.targetId) && [DROID,STRUCTURE].indexOf(command.targetType)>=0 && command.targetPlayer===scavAI) {
        const object=getObject(command.targetType,command.targetPlayer,command.targetId);
        if (object) targets=enumRange(object.x,object.y,1,scavAI,true).filter(function(o) {return o.id===object.id;});
    } else if (Number.isInteger(command.x) && Number.isInteger(command.y) && command.x>=0 && command.y>=0 && command.x<mapWidth && command.y<mapHeight) {
        targets=enumRange(command.x,command.y,2,scavAI,true).filter(function(o) {return o.player===scavAI && [DROID,STRUCTURE].indexOf(o.type)>=0;});
        targets.sort(function(a,b) {return Math.hypot(a.x-command.x,a.y-command.y)-Math.hypot(b.x-command.x,b.y-command.y) || a.id-b.id;});
    }
    const target=targets[0],structure=getObject(STRUCTURE,selectedPlayer,selected.id);
    if (!target || target.player!==scavAI || !structure || structure.status!==BUILT) return {ok:false,error:"lassat-target-missing"};
    const last=Number(structure.weapons[0].lastFired);
    if (!activateStructure(structure,target)) return {ok:false,error:"lassat-rejected"};
    wtreward_match.lassatPending={id:structure.id,at:gameTime,last:last};
    return {ok:true,queued:true,structureId:structure.id,targetId:target.id};
}

function wtreward_tick() {wtreward_migrate();if (wtreward_match.session) {wtreward_syncItems();wtreward_syncResearch();}}
function wtreward_eventStartLevel() {setTimer("wtreward_tick",250);}
function wtreward_eventGameLoaded()
{
    wtreward_migrate();
    if (wtreward_match.researchApplied) Object.keys(wtreward_match.labRates).forEach(function(name) {
        const upgrade=Upgrades[selectedPlayer].Building[name],fields=wtreward_match.labRates[name];
        ["ResearchPoints","ModuleResearchPoints"].forEach(function(field) {const current=Number(upgrade[field]),record=fields[field];if (current!==record.last) {record.base=current;record.bonus=0;record.last=current;}});
    });
    wtreward_tick();
}
function wtreward_eventResearched(research,structure,player) {if (player===selectedPlayer) wtreward_tick();}
function wtreward_eventStructureBuilt(structure) {if (structure.player===selectedPlayer) wtreward_syncItems();}
function wtreward_eventDestroyed(object)
{
    wtreward_migrate();if (object.player!==selectedPlayer || object.type!==STRUCTURE) return;
    Object.keys(wtreward_match.entries).forEach(function(key) {
        const entry=wtreward_match.entries[key],id=String(object.id);
        if (!entry.natural && !entry.seen[id] && !entry.preexisting[id] && object.name===wtreward_statName(wtreward_types[key].id)) {entry.seen[id]=true;entry.consumed++;}
    });
    wtreward_syncItems();
}
