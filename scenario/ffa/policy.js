/* Isolated FFA policy. Ground technology, costs and research remain stock. */
var ffaPolicy = includeJSON("ffa-policy.json");
var ffaConfig = includeJSON("ffa-config.json");
var ffaMaps = includeJSON("ffa-maps.json").maps;
var ffaMap = ffaMaps.filter(function (map) { return ffaConfig && map.id === ffaConfig.map; })[0];
if (!ffaConfig || ffaConfig.mode !== "ffa" || !ffaMap
    || ["easy", "medium", "hard"].indexOf(ffaConfig.difficulty) < 0
    || ffaConfig.player !== 0
    || (typeof ffaConfig.players !== "undefined" ? ffaConfig.players !== ffaMap.players : ffaMap.id !== "emag")
    || (typeof ffaConfig.bots !== "undefined" ? ffaConfig.bots !== ffaMap.bots : ffaMap.id !== "emag")
    || (typeof ffaConfig.level !== "undefined" ? ffaConfig.level !== ffaMap.level : ffaMap.id !== "emag"))
    throw new Error("Invalid FFA launch config");
function ffaResearchAllowed(id) {
    return id !== "R-FFA-Air-Locked" && ffaPolicy.blockedResearch.indexOf(id) < 0;
}
function ffaPartAllowed(id) { return ffaPolicy.airComponents.indexOf(id) < 0; }
function ffaDesignAllowed(design) {
    return Boolean(design && ffaPartAllowed(design.body) && ffaPartAllowed(design.propulsion)
        && Array.isArray(design.turrets) && design.turrets.every(ffaPartAllowed));
}
