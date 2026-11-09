/* Mobile HUD/Skip adapter. The supplied Tower Defense config owns every round. */
namespace("warzoneTowersWaves_");
var warzoneTowersWaves_state = { phase:"build", wave:0, deadline:0, waiting:false,
    lastCommand:"", rewardCount:0, rewardPower:0, lastReward:null,
    completedWaves:[],waveRows:{},unitWaves:{} };
var warzoneTowersWaves_lastSignature = "";
var warzoneTowersWaves_configCheck = null;

function warzoneTowersWaves_tracking()
{
    const state=warzoneTowersWaves_state;
    // A 0.25 save has no trustworthy unit-to-wave history. Track future rounds
    // rather than inventing clears for its already-running waves.
    if (!state.completedWaves) state.completedWaves=[];
    if (!state.waveRows) state.waveRows={};
    if (!state.unitWaves) state.unitWaves={};
    return state;
}

function warzoneTowersWaves_refreshClears()
{
    const state=warzoneTowersWaves_tracking();
    if (["defeated","victory"].indexOf(state.phase)>=0 || !enumStruct(selectedPlayer,HQ).length) return;
    Object.keys(state.waveRows).forEach(function(key) {
        const row=state.waveRows[key];
        if (row.cleared || row.failed || row.batches<row.expectedBatches || !row.spawned
            || Object.keys(row.units).length || Spawner.queue.some(function(template) {return template.__towersWave===row.wave;})) return;
        row.cleared=true;
        if (state.completedWaves.indexOf(row.wave)<0) state.completedWaves.push(row.wave);
    });
    state.completedWaves.sort(function(a,b) {return a-b;});
}

const warzoneTowersOriginalSpawnTemplate=Template.spawn;
Template.spawn=function(template,player,x,y) {
    const droid=warzoneTowersOriginalSpawnTemplate.call(Template,template,player,x,y);
    const state=warzoneTowersWaves_tracking(),row=state.waveRows[String(template.__towersWave)];
    if (player===scavAI && row) {
        if (droid) {row.spawned++;row.units[String(droid.id)]=true;state.unitWaves[String(droid.id)]=row.wave;}
        else row.failed=true;
    }
    return droid;
};
const warzoneTowersOriginalSpawnAction=processSpawn;
processSpawn=function(action) {
    const state=warzoneTowersWaves_tracking(),row=state.waveRows[String(state.wave)],before=Spawner.queue.length;
    const result=warzoneTowersOriginalSpawnAction(action);
    if (row) {
        row.batches++;
        if (action.count>0 && Spawner.queue.length-before!==action.count) row.failed=true;
        for (let i=before;i<Spawner.queue.length;i++) Spawner.queue[i].__towersWave=row.wave;
    }
    return result;
};

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
    const state=warzoneTowersWaves_tracking();let round=0,expected=0;
    actions.forEach(function(entry) {if (entry.type==="round") round=entry.round;else if (entry.type==="spawn" && round===action.round) expected++;});
    state.waveRows[String(action.round)]={wave:action.round,expectedBatches:expected,batches:0,spawned:0,units:{},failed:false,cleared:false};
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
    const state=warzoneTowersWaves_tracking(),wave=state.unitWaves[String(object.id)];
    if (object.type===DROID && wave!==undefined && state.waveRows[String(wave)]) {
        delete state.waveRows[String(wave)].units[String(object.id)];delete state.unitWaves[String(object.id)];
        warzoneTowersWaves_refreshClears();
    }
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
    warzoneTowersWaves_refreshClears();
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
        rewardPower:state.rewardPower, lastReward:state.lastReward,
        completedWaves:state.completedWaves.slice(),
        rewards:typeof wtreward_state==="function" ? wtreward_state() : null };
    const signature = JSON.stringify(payload);
    if (force || signature !== warzoneTowersWaves_lastSignature) {
        warzoneTowersWaves_lastSignature = signature;
        dump("BNWAVE:" + signature);
    }
}
