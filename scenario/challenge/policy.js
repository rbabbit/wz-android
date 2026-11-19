/* Challenge retains original stock ground and air research. */
var ffaPolicy = includeJSON("challenge-policy.json");
var ffaConfig = includeJSON("challenge-config.json");
var ffaMaps = includeJSON("challenge-maps.json").maps;
var ffaMap = ffaMaps.filter(function (map) { return ffaConfig && map.id === ffaConfig.map; })[0];
if (!ffaConfig || ffaConfig.mode !== "challenge" || !ffaMap
    || ["easy","medium","hard"].indexOf(ffaConfig.difficulty) < 0
    || ["cannon","rockets"].indexOf(ffaConfig.weapon) < 0
    || ffaConfig.player !== 0 || ffaConfig.players !== 2 || ffaConfig.bots !== 1
    || ffaConfig.botType !== "dumbot25a" || ffaConfig.vtol !== true
    || ffaConfig.level !== ffaMap.level)
    throw new Error("Invalid Challenge launch config");
function ffaResearchAllowed(id) { return true; }
function ffaPartAllowed(id) { return true; }
function ffaDesignAllowed(design) {
    return Boolean(design && Array.isArray(design.turrets));
}
