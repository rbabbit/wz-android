#pragma once
// UI-only STOP dispatch. Never used by synchronized simulation order handlers.
#include <nlohmann/json.hpp>
#include <set>
#include <string>
#include <vector>

struct MobileGuardedStopV93
{
    std::string context,lastNonce;
    nlohmann::json ack={{"schemaVersion",93},{"action","stop-selected"},{"nonce",""},
        {"context",""},{"activation",""},{"ok",false},{"reason","idle"},
        {"selectedIds",nlohmann::json::array()},{"stoppedIds",nlohmann::json::array()},
        {"protectedIds",nlohmann::json::array()},{"skippedProtectedIds",nlohmann::json::array()}};

    void observeContext(const std::string &current)
    {
        if(context==current)return;
        context=current;lastNonce.clear();
        ack={{"schemaVersion",93},{"action","stop-selected"},{"nonce",""},
            {"context",context},{"activation",""},{"ok",false},{"reason","idle"},
            {"selectedIds",nlohmann::json::array()},{"stoppedIds",nlohmann::json::array()},
            {"protectedIds",nlohmann::json::array()},{"skippedProtectedIds",nlohmann::json::array()}};
    }

    template<typename Protected>
    bool apply(const nlohmann::json &request,bool owned,bool safe,bool enabled,
        const std::string &currentContext,const std::string &activation,uint32_t player,
        const std::vector<DROID*> &droids,Protected protects)
    {
        observeContext(owned?currentContext:std::string());
        if(!request.is_object())return false;
        for(const char *key:{"nonce","context","activation"})
            if(!request.contains(key)||!request[key].is_string()||request[key].get<std::string>().size()>160)return false;
        const auto nonce=request["nonce"].get<std::string>();
        if(nonce.empty()||nonce==lastNonce)return false;
        lastNonce=nonce;
        ack={{"schemaVersion",93},{"action","stop-selected"},{"nonce",nonce},
            {"context",request["context"]},{"activation",request["activation"]},{"ok",false},
            {"reason","no-owned-world"},{"selectedIds",nlohmann::json::array()},
            {"stoppedIds",nlohmann::json::array()},{"protectedIds",nlohmann::json::array()},
            {"skippedProtectedIds",nlohmann::json::array()}};
        if(!owned)return true;
        if(context.empty()||request["context"]!=context){ack["reason"]="stale-context";return true;}
        if(activation.empty()||request["activation"]!=activation){ack["reason"]="stale-activation";return true;}
        if(request.contains("cancel")&&request["cancel"].is_boolean()&&request["cancel"].get<bool>())
        {ack["ok"]=true;ack["reason"]="cancelled";return true;}
        if(!enabled){ack["reason"]="combat-off";return true;}
        // A failed/unsafe command is consumed, never deferred to a later frame.
        if(!safe){ack["reason"]="world-unsafe";return true;}
        std::set<uint32_t> selected,stopped,protectedIds;
        for(DROID *droid:droids)
        {
            if(!droid||droid->player!=player||!droid->selected||!mobileRepairCombatEligibleV93(droid))continue;
            selected.insert(droid->id);
            // Evaluate native order/action/health now, not an earlier JSON ACK.
            if(protects(droid)){protectedIds.insert(droid->id);continue;}
            orderDroid(droid,DORDER_STOP,ModeQueue);stopped.insert(droid->id);
        }
        ack["selectedIds"]=selected;ack["stoppedIds"]=stopped;
        ack["protectedIds"]=protectedIds;ack["skippedProtectedIds"]=protectedIds;
        ack["ok"]=true;ack["reason"]=stopped.empty()?"no-commandable-selection":"queued";
        return true;
    }
};
