/* Canonical init for the isolated stock-data Duel package. */
receiveAllEvents(true);
include("multiplay/script/rules/includes.js");
include("tests/duel-policy.js");

var blockNightLabTopics = {};
var blockNightLastResearchSnapshot = "";
function blockNightResearchCategory(topic) { return duelPolicy.researchCategory[topic.id] || ""; }
function blockNightResearchRank(topic) { return 0; }

// Preserve authored bases and ordinary equal starting power. Only bootstrap
// core prerequisites and the chosen basic weapon; all subsequent research costs
// power/time and only the human's explicit queue chooses human topics.
setupResearch = function (player) {
    ["R-Sys-Sensor-Turret01", "R-Sys-Engineering01"].forEach(function (id) { enableResearch(id, player); });
};
setupBase = function (player) {
    setPower(2500, player);
    completeResearch("R-Duel-License-" + duelBranch(player), player);
    Object.keys(allRes).forEach(function (id) {
        if (allRes[id] <= timeAdvancedBaseTech && duelPolicy.researchClass[id] === "core") completeResearch(id, player);
    });
    completeResearch(duelPolicy.starters[duelBranch(player)].research, player);
};
setupTechLevel = function () { /* Challenge is locked to T1; never completeAllResearch. */ };

include("tests/duel-research-bridge.js");
include("tests/duel-commands.js");

var duelPhase = "active";
var duelReady = false;
var duelLastSnapshot = "";
var duelFinished = false;

function duelHQ(player) {
    const hq = enumStruct(player, HQ).filter(function (s) { return s.status === BUILT; })[0];
    return hq ? {alive:true, health:hq.health, x:hq.x, y:hq.y} : {alive:false};
}
function duelPlayerDiagnostic(player) {
    const units = enumDroid(player, DROID_ANY);
    return {player:player, branch:duelBranch(player), power:playerPower(player),
        units:units.map(function (d) { return {id:d.id, x:d.x, y:d.y, order:d.order, health:d.health,
            weapons:(d.weapons || []).map(function (w) { return typeof w === "string" ? w : w.id || w.name; })}; }),
        laboratories:enumStruct(player, RESEARCH_LAB).length,
        factories:enumStruct(player, FACTORY).length};
}
function duelEmit(force) {
    if (!duelReady) return;
    const human = duelHQ(0), enemy = duelHQ(1);
    if (duelPhase === "active") {
        if (!human.alive) duelPhase = "defeated";
        else if (!enemy.alive) duelPhase = "victory";
    }
    const packet = {version:1, mode:"duel", phase:duelPhase, gameTime:gameTime, player:0, enemyPlayer:1,
        humanBranch:duelConfig.humanBranch, botBranch:duelConfig.botBranch,
        humanHQ:human, enemyHQ:enemy, mapWidth:mapWidth, mapHeight:mapHeight,
        diagnostics:{players:[duelPlayerDiagnostic(0), duelPlayerDiagnostic(1)]}};
    const key = JSON.stringify(packet);
    if (force || key !== duelLastSnapshot) { duelLastSnapshot = key; dump("BNDUEL:" + key); }
    if (duelPhase !== "active" && !duelFinished) {
        duelFinished = true;
        removeTimer("duelTick");
        // Native game-over follows the authoritative packet, so the app can
        // cover the stock frontend before it paints.
        gameOverMessage(duelPhase === "victory");
    }
}
function duelTick() { duelEmit(false); }
function duelStart() {
    duelReady = true;
    setTimer("blockNightEmitResearchSnapshotV23", 750);
    setTimer("duelTick", 750);
    blockNightEmitResearchSnapshotV23();
    duelEmit(true);
}

namespace("duel_");
function duel_eventGameInit() {
    [0, 1].forEach(function (player) {
        setStructureLimits("A0VTolFactory1", 0, player);
        setStructureLimits("A0CommandCentre", 1, player);
    });
}
function duel_eventStartLevel() { queue("duelStart", 200); }
function duel_eventGameLoaded() { queue("duelStart", 200); }
function duel_eventDestroyed(object) {
    if (duelReady && duelPhase === "active" && object.type === STRUCTURE && object.stattype === HQ
        && (object.player === 0 || object.player === 1)) {
        duelPhase = object.player === 0 ? "defeated" : "victory";
        duelEmit(true);
    }
}
