/* Isolated two-player Challenge on an exact supplied authored map. */
receiveAllEvents(true);
// Saved with native timer records; a restored match keeps exactly one of each
// Challenge bridge timer instead of adding a second timer on every menu/load return.
var ffaTimers = {};
function ffaSetTimer(name, milliseconds) {
    if (ffaTimers[name]) return true;
    const created = setTimer(name, milliseconds);
    if (created === true) ffaTimers[name] = true;
    return created;
}
include("tests/challenge-policy.js");
// Retain the Guide for deliberate access without its automatic modal pauses.
(function () {
    const nativeAddGuideTopic = addGuideTopic;
    addGuideTopic = function () {
        const args = Array.prototype.slice.call(arguments);
        if (args.length >= 2) args[1] = 0;
        return nativeAddGuideTopic.apply(this, args);
    };
})();
include("multiplay/script/rules/includes.js");
function ffaApplyAuthoredStructureLimits(player) {
    const limits = ffaMap.structureLimits || {};
    Object.keys(limits).forEach(function (id) { setStructureLimits(id, limits[id], player); });
}
function ffaApplyAirLimits() {
    ffaPlayerIds().forEach(function (player) {
        ffaApplyAuthoredStructureLimits(player);

    });
}
var ffaOriginalSetupStructureLimit = setupStructureLimit;
setupStructureLimit = function (player) {
    ffaOriginalSetupStructureLimit(player);
    ffaApplyAuthoredStructureLimits(player);

};
// The stock eventGameInit applies the lobby limit set after its per-player
// setup. Preserve authored structure capacities after that native call.
var ffaOriginalApplyLimitSet = applyLimitSet;
applyLimitSet = function () {
    const result = ffaOriginalApplyLimitSet();
    ffaApplyAirLimits();
    return result;
};

var blockNightLabTopics = {};
var blockNightLastResearchSnapshot = "";
function blockNightResearchCategory(topic) { return ffaPolicy.researchCategory[topic.id] || ""; }
function blockNightResearchRank(topic) { return 0; }
include("tests/challenge-research-bridge.js");
include("tests/challenge-rewards.js");
include("tests/challenge-commands.js");

var ffaReady = false;
var ffaSession = "";
var ffaOutcome = "";
var ffaLastSnapshot = "";
var ffaResearchFinished = Array.from({length:ffaMap.players}, function () { return []; });

function ffaPlayerIds() {
    const players = [];
    for (let player = 0; player < maxPlayers; player++) players.push(player);
    return players;
}

function ffaPartId(part) {
    return typeof part === "string" ? part : part && (part.id || part.name) || "";
}
function ffaNativeBotType(data) {
    if (data.isHuman) return "human";
    if (!data.isAI) return "unknown";
    const file = String(data.scriptName || "").split("/").pop();
    return file === "challenge-dumb25a.js" ? "dumbot25a" : "unknown";
}
function ffaNativeMatchBotType(players) {
    const bots = players.filter(function (player) { return player.player !== selectedPlayer && player.isAI; });
    if (bots.length !== ffaMap.players - 1 || bots.some(function (player) { return player.botType !== "dumbot25a"; })) return "unknown";
    return bots.every(function (player) { return player.botType === bots[0].botType; }) ? bots[0].botType : "mixed";
}
function ffaPlayerDiagnostic(player) {
    const data = playerData[player];
    const structures = enumStruct(player).map(function (s) {
        return {id:s.id, name:s.name, stattype:s.stattype, type:s.type, status:s.status,
            x:s.x, y:s.y, modules:s.modules || 0, health:s.health, idle:structureIdle(s),
            production:(s.stattype === FACTORY || s.stattype === CYBORG_FACTORY || s.stattype === VTOL_FACTORY)
                && typeof getDroidProduction === "function" ? getDroidProduction(s) : null};
    });
    const units = enumDroid(player, DROID_ANY).map(function (d) {
        return {id:d.id, name:d.name, type:d.droidType, body:ffaPartId(d.body), propulsion:ffaPartId(d.propulsion),
            x:d.x, y:d.y, order:d.order, health:d.health, selected:Boolean(d.selected),
            weapons:(d.weapons || []).map(ffaPartId)};
    });
    return {player:player, isHuman:Boolean(data.isHuman), isAI:Boolean(data.isAI),
        name:data.name, scriptName:data.scriptName || "", botType:ffaNativeBotType(data), difficulty:data.difficulty, team:data.team, position:data.position,
        start:startPositions[player], power:playerPower(player),
        powerGeneratorLimit:getStructureLimit("A0PowerGenerator",player),
        vtolFactoryLimit:getStructureLimit("A0VTolFactory1",player), vtolPadLimit:getStructureLimit("A0VtolPad",player),
        structures:structures, units:units, researchCompleted:(ffaResearchFinished[player] || []).slice().sort(),
        researchCompletedCount:(ffaResearchFinished[player] || []).length,
        aircraft:units.filter(function (d) { return ffaPolicy.airComponents.indexOf(d.propulsion) >= 0; }).length};
}
function ffaEmit(force) {
    if (!ffaReady) return;
    const native = typeof campaignMobileState === "function" ? campaignMobileState() : {};
    const ids = ffaPlayerIds(), players = ids.map(ffaPlayerDiagnostic);
    const packet = {version:2, mode:"challenge", map:ffaMap.id, mapName:ffaMap.name, playersCount:maxPlayers, bots:maxPlayers-1,
        requestedLevel:ffaMap.level, nativeLevel:native.nativeLevel || "", difficulty:ffaConfig.difficulty, weapon:ffaConfig.weapon,
        session:ffaSession, botType:ffaNativeMatchBotType(players), paused:Boolean(native.paused), video:Boolean(native.video), ui:native,
        player:selectedPlayer, playing:!ffaOutcome, phase:ffaOutcome === "victory" ? "victory" : ffaOutcome ? "defeated" : "active",
        outcome:ffaOutcome, gameTime:gameTime, mapWidth:mapWidth, mapHeight:mapHeight, maxPlayers:maxPlayers,
        vtol:true, alliancesType:alliancesType, players:players,
        scavengers:Boolean(ffaMap.scavengers),
        scavengerStructures:ffaMap.scavengers ? enumStruct(scavengerPlayer).length : 0,
        scavengerDroids:ffaMap.scavengers ? enumDroid(scavengerPlayer,DROID_ANY).length : 0,
        airTechnology:{researchPresent:Boolean(getResearch("R-Vehicle-Prop-VTOL",selectedPlayer)),
            propulsionAvailable:componentAvailable("V-Tol"),
            factoryAvailable:isStructureAvailable("A0VTolFactory1",selectedPlayer)},
        wave:0,totalWaves:0,completedWaves:[],rewards:typeof wtreward_state === "function" ? wtreward_state() : null,
        selectedIds:enumSelected().map(function (d) { return d.id; }).sort(function (a,b) { return a-b; }),
        alliances:ids.map(function (a) { return ids.map(function (b) { return allianceExistsBetween(a,b); }); })};
    const key = JSON.stringify(packet);
    if (force || key !== ffaLastSnapshot) { ffaLastSnapshot = key; dump("BNFFA:" + key); }
}
// Called by the stock endcondition's Player.finalizeGame immediately before
// its ordinary native gameOverMessage. It never decides who wins or loses.
function ffaNativePlayerResult(player, state) {
    if (player !== selectedPlayer || ffaOutcome || (state !== "winner" && state !== "loser")) return;
    ffaOutcome = state === "winner" ? "victory" : "defeat";
    ffaEmit(true);
}
function ffaTick() { ffaEmit(false); }
function ffaStart() {
    // Covers ordinary new starts and restored native saves before publishing
    // their first authoritative packet. No structures or units are altered.
    ffaApplyAirLimits();
    ffaReady = true;
    ffaSetTimer("blockNightV32PollBridgeCommands", 120);
    ffaSetTimer("blockNightEmitResearchSnapshotV23", 750);
    ffaSetTimer("ffaTick", 1000);
    blockNightEmitResearchSnapshotV23();
    ffaEmit(true);
}
namespace("ffa_");
function ffa_eventGameInit() {
    if (!ffaSession) ffaSession = ffaMap.level + "-" + Date.now();
    ffaApplyAirLimits();
}
function ffa_eventStartLevel() { queue("ffaStart", 200); }
function ffa_eventGameLoaded() { queue("ffaStart", 200); }
function ffa_eventResearched(research, structure, player) {
    if (player < 0 || player >= maxPlayers || !research || !research.id) return;
    if (!ffaResearchFinished[player]) ffaResearchFinished[player] = [];
    if (ffaResearchFinished[player].indexOf(research.id) < 0) ffaResearchFinished[player].push(research.id);
}
