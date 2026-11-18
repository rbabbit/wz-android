/* Inserted into the native Rewards namespace. No research topic is created or completed. */
function wtreward_structure(type) {return !type.kind || type.kind==="structure";}
function wtreward_identity(request,hasMore)
{
    const actual=typeof wt_rewardContext==="function" ? wt_rewardContext() : null;
    if (request.profile!==undefined && typeof request.profile!=="string" || request.map!==undefined && typeof request.map!=="string")
        throw Error("reward-context-invalid");
    const profile=request.profile || actual?.profile || "towers",map=request.map || actual?.map || "";
    if (["towers","survival"].indexOf(profile)<0 || profile==="survival" && ["tdn2","wave"].indexOf(map)<0)
        throw Error("reward-profile-invalid");
    if (actual && (profile!==actual.profile || map!==actual.map)) throw Error("reward-context-conflict");
    if (hasMore && (!actual || request.profile!==actual.profile || request.map!==actual.map))
        throw Error("reward-morefortress-context-required");
    return {profile:profile,map:map};
}
function wtreward_natural(type)
{
    return !type.more && Boolean(type.research && getResearch(type.research,selectedPlayer).done || isStructureAvailable(type.id,selectedPlayer));
}
function wtreward_targets(type)
{
    const sensor=type.kind==="sensor",group=sensor?"Sensor":"Building",field=sensor?"Range":"HitPoints";
    return Object.keys(Stats[group] || {}).filter(function(name) {
        const stat=Stats[group][name];return sensor ? stat.Id==="FortressSensor" : stat.Type==="Wall";
    }).map(function(name) {
        const stat=Stats[group][name],base=Number(stat[field]),upgrade=Upgrades[selectedPlayer][group]?.[name],current=Number(upgrade?.[field]);
        if (!Number.isFinite(base) || base<0 || !Number.isFinite(current) || current<0) throw Error("reward-upgrade-stat-invalid");
        return {group:group,name:name,id:stat.Id,field:field,base:base,delta:Math.ceil(base*(sensor?48:100)/100)};
    });
}
function wtreward_typeAvailable(type)
{
    if (wtreward_structure(type)) return Boolean(wtreward_statName(type.id));
    if (type.kind==="component") return Boolean(wtreward_statName(type.id,"Weapon"));
    return wtreward_targets(type).length>0;
}
function wtreward_dependencies(items)
{
    Object.keys(items).forEach(function(key) {
        const dependency=wtreward_types[key].requires;
        if (items[key]>0 && dependency && !(items[dependency]>0)) throw Error("reward-upgrade-dependency");
    });
}
function wtreward_entry(key,quantity)
{
    const type=wtreward_types[key],preexisting={};
    if (wtreward_structure(type)) enumStruct(selectedPlayer,type.id).forEach(function(o) {preexisting[String(o.id)]=true;});
    return {quantity:quantity,consumed:0,seen:{},preexisting:preexisting,
        natural:wtreward_structure(type)?wtreward_natural(type):false,
        originalLimit:wtreward_structure(type)?getStructureLimit(type.id,selectedPlayer):0};
}
function wtreward_componentAllowed(id)
{
    if (id!=="Rocket-ATGM") return true;
    const entry=wtreward_match.entries.mf_atgm_design;
    return Boolean(entry && entry.quantity===1 && wtreward_match.applied && !wtreward_match.error);
}
function wtreward_guardUnpaid()
{
    Object.keys(wtreward_types).forEach(function(key) {
        const type=wtreward_types[key];
        if (type.more && wtreward_structure(type) && !wtreward_match.entries[key] && wtreward_statName(type.id)
            && getStructureLimit(type.id,selectedPlayer)!==0) setStructureLimits(type.id,0,selectedPlayer);
    });
}
function wtreward_syncEffects()
{
    const s=wtreward_match,totals={};if (!s.effectBonuses) s.effectBonuses={};
    Object.keys(s.entries).forEach(function(key) {
        const type=wtreward_types[key],entry=s.entries[key];if (wtreward_structure(type)) return;
        if (type.kind==="component") {
            if (entry.quantity>0 && !componentAvailable(type.id)) makeComponentAvailable(type.id,selectedPlayer);
        } else wtreward_targets(type).forEach(function(target) {
            const token=target.group+":"+target.name+":"+target.field;
            if (!totals[token]) totals[token]={target:target,bonus:0};
            totals[token].bonus+=target.delta;
        });
        entry.consumed=entry.quantity;
    });
    Object.keys(totals).forEach(function(token) {
        const plan=totals[token],t=plan.target,upgrade=Upgrades[selectedPlayer][t.group][t.name],current=Number(upgrade[t.field]);
        const previous=s.effectBonuses[token] || {bonus:0,last:current};
        // Compat research adds its own base-stat delta. Remove only our saved
        // old bonus, preserving all other upgrades; retry/load never stacks it.
        const base=Math.max(0,current-previous.bonus),desired=base+plan.bonus;
        if (current!==desired) upgrade[t.field]=desired;
        s.effectBonuses[token]={bonus:plan.bonus,last:desired,base:base};
    });
}
function wtreward_effectState()
{
    const s=wtreward_match,entry=function(key) {return Boolean(s.entries[key]?.quantity);};
    const sensorName=wtreward_statName("FortressSensor","Sensor"),sensorStat=Stats.Sensor?.[sensorName],sensorUpgrade=Upgrades[selectedPlayer].Sensor?.[sensorName];
    const tiers=[1,2,3].filter(function(tier) {return entry("mf_concrete_"+tier);});
    const paidStructures=Object.keys(s.entries).filter(function(key) {return wtreward_structure(wtreward_types[key]);}).map(function(key) {return wtreward_types[key].id;});
    const walls=Object.keys(Stats.Building || {}).filter(function(name) {return Stats.Building[name].Type==="Wall";});
    walls.sort(function(a,b) {return Number(paidStructures.indexOf(Stats.Building[b].Id)>=0)-Number(paidStructures.indexOf(Stats.Building[a].Id)>=0);});
    const samples=walls.slice(0,12).map(function(name) {
        const stat=Stats.Building[name],token="Building:"+name+":HitPoints";
        return {id:stat.Id,base:Number(stat.HitPoints),current:Number(Upgrades[selectedPlayer].Building[name]?.HitPoints),bonus:s.effectBonuses?.[token]?.bonus || 0};
    });
    return {atgmDesign:{paid:entry("mf_atgm_design"),available:Boolean(wtreward_statName("Rocket-ATGM","Weapon") && componentAvailable("Rocket-ATGM")),allowed:wtreward_componentAllowed("Rocket-ATGM")},
        fortressSensor:{paid:entry("mf_fortress_sensor"),id:"FortressSensor",base:sensorStat?Number(sensorStat.Range):null,current:sensorUpgrade?Number(sensorUpgrade.Range):null,
            bonus:s.effectBonuses?.["Sensor:"+sensorName+":Range"]?.bonus || 0},
        concrete:{tiers:tiers,percentOfBase:tiers.length*100,targetCount:walls.length,samples:samples,passiveHealing:false}};
}
