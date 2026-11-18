/* Authoritative scenario identity, saved with ordinary native script globals. */
const survivalConfig = includeJSON("survival-config.json");
var survivalIdentity = null;

function survivalValidateIdentity()
{
    // mapName is the engine's read-only level constant, also used by the
    // existing Towers config router. No browser/query identity is accepted.
    const nativeLevel = typeof mapName === "string" ? mapName : "";
    if (!survivalConfig || survivalConfig.mode !== "survival"
        || !["tdn2", "wave"].includes(survivalConfig.map)
        || survivalConfig.level !== (survivalConfig.map === "tdn2" ? "Survival-TDN2-T1" : "Survival-Wave-T1")
        || nativeLevel !== survivalConfig.level
        || selectedPlayer !== 0 || maxPlayers !== 2 || scavAI !== 1
        || !playerData[0].isHuman || !playerData[1].isAI || IS_HACK)
        throw Error("Survival native scenario identity is invalid.");
    if (survivalIdentity && (survivalIdentity.mode !== "survival"
        || survivalIdentity.map !== survivalConfig.map || survivalIdentity.level !== nativeLevel))
        throw Error("The saved game belongs to another Survival map.");
    survivalIdentity = {version:94, mode:"survival", profile:"survival", map:survivalConfig.map,
        level:nativeLevel, player:0, enemyPlayer:1};
    return true;
}

namespace("survival_");
function survival_eventStartLevel() { survivalValidateIdentity(); }
function survival_eventGameLoaded() { survivalValidateIdentity(); }
