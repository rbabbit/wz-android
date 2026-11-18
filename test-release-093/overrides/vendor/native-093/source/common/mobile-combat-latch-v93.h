#pragma once
// Local UI selection policy only. No orders, production or simulation mutations.
#include <cstdint>
#include <set>
#include <string>
#include <vector>

struct MobileCombatUnitV90
{
    uint32_t id;
    bool combat;
    bool selected;
    bool protectedForRepair=false;
};
struct MobileCombatChangesV90
{
    std::set<uint32_t> select, deselect;
    bool changed() const { return !select.empty() || !deselect.empty(); }
};
struct MobileCombatLatchV90
{
    bool enabled=false, requestedSuspended=true, suspended=true, pendingDeselect=false;
    std::string reason="off", requestNonce, activation, context, deselectNonce, deselectAppliedNonce;
    uint64_t revision=0, worldSerial=0;
    bool previousOwned=false, endedActivation=false;
    uint32_t previousPlayer=0, previousGameTime=0;
    std::set<std::string> retiredActivations;

    void observeWorld(bool owned, uint32_t player, uint32_t time, uint32_t real)
    {
        const bool changed=owned && (!previousOwned || player!=previousPlayer || time<previousGameTime);
        if ((!owned && previousOwned) || changed)
        {
            enabled=false; requestedSuspended=true; suspended=true; pendingDeselect=false;
            requestNonce.clear(); activation.clear(); deselectNonce.clear(); deselectAppliedNonce.clear();
            retiredActivations.clear(); endedActivation=false; ++revision;
            context=changed ? "native-combat90:"+std::to_string(real)+":"+std::to_string(++worldSerial)+":"+std::to_string(player) : "";
            reason=changed ? "off" : "session-ended";
        }
        previousOwned=owned;
        if (owned) { previousPlayer=player; previousGameTime=time; }
    }

    bool intent(bool on, bool pause, const std::string &nonce, const std::string &token,
                const std::string &requestContext, bool deselect)
    {
        if (!previousOwned || context.empty() || requestContext!=context || nonce.empty() || nonce==requestNonce) return false;
        if (on && (token.empty() || retiredActivations.count(token) || (token==activation && endedActivation))) return false;
        if (!on && !token.empty() && retiredActivations.count(token)) return false;
        if (!on && token.empty() && !activation.empty()) return false;
        requestNonce=nonce; requestedSuspended=pause; ++revision;
        if (!token.empty() && token!=activation)
        {
            if (!activation.empty()) retiredActivations.insert(activation);
            activation=token; endedActivation=false;
        }
        if (on)
        {
            enabled=true; pendingDeselect=false; endedActivation=false;
            reason=pause ? "temporary" : "on";
        }
        else
        {
            enabled=false;
            if (deselect && !token.empty() && !endedActivation)
            {
                pendingDeselect=true; deselectNonce=nonce;
            }
            endedActivation=!activation.empty();
            reason=pendingDeselect ? "pending-deselect" : "off";
        }
        return true;
    }

    MobileCombatChangesV90 reconcile(const std::vector<MobileCombatUnitV90> &units, bool safe)
    {
        MobileCombatChangesV90 result;
        suspended=requestedSuspended || !safe;
        if (!previousOwned) return result;
        // A gesture suspension must not let a newly damaged unit receive the
        // next group order. Never select while held; deselection is protective.
        if(enabled && safe)for(const auto &unit:units)
            if(unit.combat && unit.protectedForRepair && unit.selected)result.deselect.insert(unit.id);
        if (suspended)
        {
            reason=enabled ? (requestedSuspended ? "temporary" : "world-unsafe") : (pendingDeselect ? "pending-deselect" : "off");
            if(result.changed())++revision;
            return result;
        }
        if (pendingDeselect)
        {
            for (const auto &unit:units) if (unit.combat && unit.selected) result.deselect.insert(unit.id);
            pendingDeselect=false; deselectAppliedNonce=deselectNonce; reason="off"; ++revision;
        }
        else if (enabled)
        {
            for (const auto &unit:units)
            {
                if (unit.combat && !unit.protectedForRepair && !unit.selected) result.select.insert(unit.id);
                else if ((!unit.combat || unit.protectedForRepair) && unit.selected) result.deselect.insert(unit.id);
            }
            reason="on";
            if (result.changed()) ++revision;
        }
        else reason="off";
        return result;
    }
};
