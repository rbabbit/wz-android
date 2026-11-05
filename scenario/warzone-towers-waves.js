/* Mobile HUD/Skip adapter. The supplied Tower Defense config owns every round. */
namespace("warzoneTowersWaves_");
var warzoneTowersWaves_state = { phase:"build", wave:0, deadline:0, waiting:false,
    lastCommand:"", rewardCount:0, rewardPower:0, lastReward:null };
var warzoneTowersWaves_lastSignature = "";
var warzoneTowersWaves_configCheck = null;

const warzoneTowersOriginalNext = next;
next = function () {
    warzoneTowersWaves_state.waiting = false;
    warzoneTowersOriginalNext();
};
const warzoneTowersOriginalRound = processRound;
processRound = function (action) {
    warzoneTowersWaves_state.wave = action.round;
    warzoneTowersWaves_state.phase = "active";
    warzoneTowersWaves_state.deadline = 0;
    warzoneTowersOriginalRound(action);
    warzoneTowersWaves_emit(true);
};
const warzoneTowersOriginalWait = processWait;
processWait = function (action) {
    warzoneTowersWaves_state.waiting = true;
    warzoneTowersWaves_state.deadline = gameTime + action.seconds * 1000;
    warzoneTowersWaves_state.phase = "countdown";
    warzoneTowersOriginalWait(action);
    // The host HUD displays this same deadline; avoid a second native clock.
    setMissionTime(-1);
    warzoneTowersWaves_emit(true);
};
const warzoneTowersOriginalDestroyed = td_eventDestroyed;
td_eventDestroyed = function (object) {
    const eligible = object.type !== FEATURE && object.player === scavAI;
    const before = eligible ? playerPower(selectedPlayer) : 0;
    warzoneTowersOriginalDestroyed(object);
    if (eligible && selectedPlayer !== scavAI) {
        const credited = playerPower(selectedPlayer) - before;
        const reward = { id:object.id, type:object.type, cost:object.cost,
            expected:powerRewardFunction(object.cost), credited:credited,
            player:selectedPlayer, before:before, after:playerPower(selectedPlayer), gameTime:gameTime };
        warzoneTowersWaves_state.rewardCount += 1;
        warzoneTowersWaves_state.rewardPower += credited;
        warzoneTowersWaves_state.lastReward = reward;
        dump("BNTDREWARD:" + JSON.stringify(reward));
        warzoneTowersWaves_emit(true);
    }
};

function warzoneTowersWaves_eventStartLevel() {
    const names = Array.from(new Set(actions.filter(a => a.type === "spawn").flatMap(a => a.templatePool)));
    const missing = names.filter(name => !Template.fromString(name));
    warzoneTowersWaves_configCheck = { rounds:totalRounds, templates:names.length, missing:missing };
    dump("BNTDCONFIG:" + JSON.stringify(warzoneTowersWaves_configCheck));
    setTimer("warzoneTowersWaves_tick", 500);
    warzoneTowersWaves_emit(true);
}
function warzoneTowersWaves_eventGameLoaded() {
    // Native timers and var state are restored; do not restart the config reader.
    warzoneTowersWaves_emit(true);
}
function warzoneTowersWaves_tick() {
    const command = includeJSON("warzone-towers-wave-command.json");
    const state = warzoneTowersWaves_state;
    if (command && command.nonce && command.nonce !== state.lastCommand) {
        state.lastCommand = command.nonce;
        if (command.action === "next" && state.waiting && state.wave < totalRounds
            && state.phase !== "defeated" && state.phase !== "victory") {
            // removeTimer removes queued callbacks too. Cancel the old wait so
            // it cannot advance the config again after an early call.
            removeTimer("next");
            next();
        }
    }
    warzoneTowersWaves_emit(false);
}
function warzoneTowersWaves_emit(force) {
    const state = warzoneTowersWaves_state;
    const enemies = enumDroid(scavAI, DROID_ANY);
    const payload = { version:3, mode:"tower-defense", gameTime:gameTime,
        lastCommand:state.lastCommand, phase:state.phase, wave:state.wave, totalRounds:totalRounds,
        nextWave:Math.min(totalRounds, state.wave + 1),
        nextWaveIn:state.waiting ? Math.max(0, Math.ceil((state.deadline-gameTime)/1000)) : null,
        canSkip:state.waiting && state.wave < totalRounds,
        enemyDroids:enemies.length, queuedEnemies:Spawner.queue.length,
        enemyPlayer:scavAI, entrances:Spawner.locations.length,
        power:playerPower(selectedPlayer), rewardCount:state.rewardCount,
        rewardPower:state.rewardPower, lastReward:state.lastReward };
    const signature = JSON.stringify(payload);
    if (force || signature !== warzoneTowersWaves_lastSignature) {
        warzoneTowersWaves_lastSignature = signature;
        dump("BNWAVE:" + signature);
    }
}
