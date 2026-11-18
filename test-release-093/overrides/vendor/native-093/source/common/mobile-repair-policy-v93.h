#pragma once
// The caller supplies the native DROID/order API and the owned command context.
// All simulation changes below are normal synchronized secondary orders.
#include <nlohmann/json.hpp>
#include <cstdio>
#include <cstdint>
#include <set>
#include <string>
#include <vector>

static bool mobileRepairCombatEligibleV93(const DROID *droid)
{
    return droid && droid->asWeaps[0].nStat>0 && !droid->isTransporter() && isSelectable(droid);
}

static unsigned mobileRepairThresholdV93(SECONDARY_STATE state)
{
    // The historical enum names are inverse to damage severity. Native Medium
    // Damage is DSS_REPLEV_LOW and means <=75% remaining health.
    if(state==DSS_REPLEV_LOW)return REPAIRLEV_HIGH;
    if(state==DSS_REPLEV_HIGH)return REPAIRLEV_LOW;
    return 0;
}

static bool mobileRepairBelowV93(const DROID *droid,unsigned threshold)
{
    return threshold && droid->originalBody>0
        && uint64_t(droid->body)*100<=uint64_t(droid->originalBody)*threshold;
}

static bool mobileRepairActiveTripV93(const DROID *droid)
{
    switch(droid->order.type)
    {
    case DORDER_RTR:case DORDER_RTR_SPECIFIED:case DORDER_REARM:return true;
    case DORDER_RTB:return droid->body<droid->originalBody;
    default:break;
    }
    switch(droid->action)
    {
    case DACTION_WAITFORREPAIR:case DACTION_MOVETOREPAIRPOINT:case DACTION_WAITDURINGREPAIR:
    case DACTION_MOVETOREARM:case DACTION_WAITFORREARM:case DACTION_MOVETOREARMPOINT:
    case DACTION_WAITDURINGREARM:case DACTION_CLEARREARMPAD:return true;
    default:return false;
    }
}

struct MobileRepairPolicyV93
{
    bool enabled=false,managed=false,applied=false,pending=false,canIssueOrders=false,worldSafe=false;
    std::string context,requestNonce,reason="no-owned-world";
    uint64_t revision=0;
    std::set<uint32_t> combatIds,appliedIds,pendingIds,protectedIds,failedIds;
    nlohmann::json units=nlohmann::json::array();

    void observeContext(bool owned,const std::string &current)
    {
        canIssueOrders=owned;
        if(context!=(owned?current:std::string()))
        {
            context=owned?current:std::string();requestNonce.clear();
            enabled=false;managed=false;applied=false;pending=false;
            combatIds.clear();appliedIds.clear();pendingIds.clear();protectedIds.clear();failedIds.clear();
            units=nlohmann::json::array();reason=owned?"unmanaged":"no-owned-world";++revision;
        }
    }

    bool intent(const nlohmann::json &request)
    {
        if(!canIssueOrders || context.empty() || !request.is_object()
            || !request.contains("enabled") || !request["enabled"].is_boolean())return false;
        for(const char *key:{"nonce","context"})
            if(!request.contains(key)||!request[key].is_string()||request[key].get<std::string>().size()>160)return false;
        const auto nonce=request["nonce"].get<std::string>();
        if(nonce.empty()||nonce==requestNonce||request["context"].get<std::string>()!=context)return false;
        requestNonce=nonce;enabled=request["enabled"].get<bool>();managed=true;applied=false;++revision;
        return true;
    }

    void readIntent(const char *path)
    {
        FILE *file=fopen(path,"rb");if(!file)return;
        char bytes[1025];const auto length=fread(bytes,1,sizeof(bytes),file);fclose(file);
        if(length>1024)return;
        intent(nlohmann::json::parse(bytes,bytes+length,nullptr,false));
    }

    bool protects(const DROID *droid) const
    {
        if(!canIssueOrders||!mobileRepairCombatEligibleV93(droid))return false;
        if(mobileRepairActiveTripV93(droid))return true;
        if(enabled && (mobileRepairBelowV93(droid,REPAIRLEV_HIGH)
            || (protectedIds.count(droid->id)&&droid->body<droid->originalBody)))return true;
        // Respect an existing native/manual retreat setting, and the interval
        // before a synchronized OFF request replaces its previous threshold.
        return mobileRepairBelowV93(droid,mobileRepairThresholdV93(secondaryGetState(droid,DSO_REPAIR_LEVEL)))
            || mobileRepairBelowV93(droid,mobileRepairThresholdV93(secondaryGetState(droid,DSO_REPAIR_LEVEL,ModeQueue)));
    }

    void frame(bool owned,bool safe,const std::vector<DROID*> &droids)
    {
        canIssueOrders=owned;worldSafe=safe;
        combatIds.clear();appliedIds.clear();pendingIds.clear();failedIds.clear();
        auto nextProtected=std::set<uint32_t>();units=nlohmann::json::array();
        const auto wanted=enabled?DSS_REPLEV_LOW:DSS_REPLEV_NEVER;
        if(owned)for(DROID *droid:droids)
        {
            if(!mobileRepairCombatEligibleV93(droid))continue;
            combatIds.insert(droid->id);
            // ModeQueue is the engine's pending state. Do not enqueue the same
            // network secondary order every display frame while awaiting sync.
            if(managed && safe && secondaryGetState(droid,DSO_REPAIR_LEVEL,ModeQueue)!=wanted)
                if(!secondarySetState(droid,DSO_REPAIR_LEVEL,wanted,ModeQueue))failedIds.insert(droid->id);
            if(managed)
            {
                if(secondaryGetState(droid,DSO_REPAIR_LEVEL)==wanted)appliedIds.insert(droid->id);
                else pendingIds.insert(droid->id);
            }
            if(protects(droid))nextProtected.insert(droid->id);
            if(units.size()<256)
            {
                const auto level=secondaryGetState(droid,DSO_REPAIR_LEVEL);
                const auto queued=secondaryGetState(droid,DSO_REPAIR_LEVEL,ModeQueue);
                units.push_back({{"id",droid->id},{"health",droid->body},{"maxHealth",droid->originalBody},
                    {"body",droid->body},{"originalBody",droid->originalBody},
                    {"healthPercent",droid->originalBody?uint64_t(droid->body)*100/droid->originalBody:0},
                    {"repairLevel",mobileRepairThresholdV93(level)},{"pendingRepairLevel",mobileRepairThresholdV93(queued)},
                    {"order",droid->order.type},{"action",droid->action},
                    {"x",droid->pos.x},{"y",droid->pos.y},{"z",droid->pos.z},
                    {"worldPosition",{{"x",droid->pos.x},{"y",droid->pos.y},{"z",droid->pos.z}}},
                    {"tilePosition",{{"x",double(droid->pos.x)/TILE_UNITS},{"y",double(droid->pos.y)/TILE_UNITS}}},
                    {"orderTargetId",droid->order.psObj?droid->order.psObj->id:0},
                    {"orderPosition",{{"x",droid->order.pos.x},{"y",droid->order.pos.y}}},
                    {"protected",nextProtected.count(droid->id)!=0},{"selected",droid->selected!=0}});
            }
        }
        if(nextProtected!=protectedIds){protectedIds=std::move(nextProtected);++revision;}
        pending=managed&&!pendingIds.empty();applied=owned&&managed&&!pending&&!failedIds.size();
        reason=!owned?"no-owned-world":!managed?"unmanaged":pending?(safe?"pending-native":"world-unsafe"):enabled?"on":"off";
    }

    nlohmann::json snapshot() const
    {
        return {{"schemaVersion",93},{"enabled",enabled},{"managed",managed},{"applied",applied},{"pending",pending},
            {"canIssueOrders",canIssueOrders},{"worldSafe",worldSafe},{"context",context},{"requestNonce",requestNonce},
            {"reason",reason},{"thresholdHealthPercent",75},{"scope","owned-combat-map"},
            {"combatIds",combatIds},{"appliedIds",appliedIds},{"pendingIds",pendingIds},{"protectedIds",protectedIds},
            {"failedIds",failedIds},{"units",units},{"diagnosticUnitsTruncated",combatIds.size()>units.size()},{"revision",revision}};
    }
};
