/* Duel-only native policy. No Towers script imports this file. */
// QuickJS includeJSON searches only the native root scriptPath. Rules and AI
// therefore have explicit policy/config mirrors beside their canonical scripts.
var duelPolicy = includeJSON("duel-policy.json");
var duelConfig = includeJSON("duel-config.json");
if (!duelConfig || ["cannon", "rockets"].indexOf(duelConfig.humanBranch) < 0) throw new Error("Invalid Duel launch policy");
duelConfig = {mode:"duel", humanBranch:duelConfig.humanBranch, botBranch:duelConfig.humanBranch === "cannon" ? "rockets" : "cannon"};

function duelBranch(player) { return player === 0 ? duelConfig.humanBranch : duelConfig.botBranch; }
function duelResearchAllowed(id, player) {
    const kind = duelPolicy.researchClass[id];
    return kind === "core" || kind === duelBranch(player);
}
function duelWeaponAllowed(id, player) {
    return !id || !duelPolicy.weaponClass[id] || duelPolicy.weaponClass[id] === duelBranch(player);
}
function duelPartAllowed(id, player) {
    return duelWeaponAllowed(id, player) && duelPolicy.airComponents.indexOf(id) < 0;
}
function duelDesignAllowed(design, player) {
    return Boolean(design && duelPolicy.airComponents.indexOf(design.body) < 0 && duelPolicy.airComponents.indexOf(design.propulsion) < 0
        && Array.isArray(design.turrets) && design.turrets.length
        && design.turrets.every(function (id) { return duelPartAllowed(id, player); }));
}
function duelFilterWeapons(value, player) {
    if (Array.isArray(value)) return value.filter(function (id) { return duelPartAllowed(id, player); });
    return duelPartAllowed(value, player) ? value : [];
}
function duelResearchPlan(player) {
    return duelPolicy.researchPlan[duelBranch(player)].slice();
}
