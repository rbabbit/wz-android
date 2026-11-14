/* Additive namespace hooks: original campaign and cam_ callbacks remain intact. */
namespace("campmobile_");

// Campaign topics remain available in the native Game Guide, but adding one
// must not interrupt touch play with an unsolicited modal pause. Keep the
// original native function inside this closure, outside serialized globals.
(function () {
    if (typeof addGuideTopic !== "function" || addGuideTopic.__warzoneCampaignManualGuide === true) return;
    const nativeAddGuideTopic = addGuideTopic;
    const manualGuideTopic = function () {
        const args = Array.prototype.slice.call(arguments);
        if (args.length >= 2) args[1] = 0;
        return nativeAddGuideTopic.apply(this, args);
    };
    Object.defineProperty(manualGuideTopic, "__warzoneCampaignManualGuide", { value:true });
    addGuideTopic = manualGuideTopic;
})();

var campmobile_level = "";
var campmobile_session = "";
var blockNightLabTopics = {};
var blockNightLastResearchSnapshot = "";
// Saved with this script context alongside Warzone's native timer records.
// Fresh missions own no timers yet; removeTimer on an absent name logs ERROR.
var campmobile_timers = {};

function campmobile_setTimer(name, milliseconds)
{
    if (campmobile_timers[name]) return true;
    const created = setTimer(name, milliseconds);
    if (created === true) campmobile_timers[name] = true;
    return created;
}

function blockNightResearchCategory(topic)
{
    const id = String(topic.id);
    if (/^R-Wpn/.test(id)) return "WEAPONS";
    if (/^R-Defense/.test(id)) return "DEFENCE";
    if (/^R-Vehicle/.test(id)) return "VEHICLES";
    if (/^R-Cyborg/.test(id)) return "CYBORG";
    if (/^R-Struc/.test(id)) return "STRUCTURES";
    return "SYSTEMS";
}

function campmobile_status()
{
    const native = typeof campaignMobileState === "function" ? campaignMobileState() : {};
    dump("BNCAMPAIGN:" + JSON.stringify({mode:"campaign", mission:campmobile_level,
        session:campmobile_session, gameTime:gameTime, missionTime:getMissionTime(),
        missionType:getMissionType(), nativeLevel:native.nativeLevel || "", paused:Boolean(native.paused),
        video:Boolean(native.video), ui:native,
        ended:typeof __camLevelEnded !== "undefined" && Boolean(__camLevelEnded)}));
}

function campmobile_resetSession()
{
    campmobile_session = campmobile_level + "-" + Date.now();
    // Native script contexts are replaced on mission/load. Never replay an old
    // context's command, pending selection or demolition intent into the new one.
    const prefix="mobile/";
    wtcmd_revision=includeJSON(prefix+"warzone-towers-command.json").revision || "";
    blockNightV32LastQueueNonce=includeJSON(prefix+"blocknight-queue-command.json").nonce || "";
    blockNightV31LastZoomNonce=includeJSON(prefix+"blocknight-zoom-command.json").nonce || "";
    warzoneTowersLastControlNonce=includeJSON(prefix+"warzone-towers-control-command.json").nonce || "";
    Object.keys(campmobile_timers).forEach(function (name) {
        if (campmobile_timers[name]) removeTimer(name);
    });
    campmobile_timers = {};
    // A mission can immediately pause for its original tutorial. Publish the
    // new context before simulation-time timers wait behind that native pause.
    campmobile_status();
    queue("campmobile_initialize",200);
}

function campmobile_reconcileCombat()
{
    // The native call re-reads current HTML intent and actual video/pause/menu
    // state before selecting. New factory units and reinforcements are included.
    if (typeof campaignSelectCombat === "function") campaignSelectCombat();
}

function campmobile_initialize()
{
    campmobile_setTimer("blockNightV32PollBridgeCommands",120);
    campmobile_setTimer("blockNightEmitResearchSnapshotV23",1000);
    campmobile_setTimer("campmobile_status",500);
    campmobile_setTimer("campmobile_reconcileCombat",500);
    blockNightLastResearchSnapshot="";
    campmobile_status();blockNightEmitResearchSnapshotV23();
    blockNightV28EmitQueueState("",true,"loaded",[]);
}

function campmobile_eventStartLevel() { campmobile_resetSession(); }
function campmobile_eventGameLoaded() { campmobile_resetSession(); }
function campmobile_eventDroidBuilt() { queue("campmobile_reconcileCombat",1); }
function campmobile_eventTransporterLanded() { queue("campmobile_reconcileCombat",1); }
function campmobile_eventObjectTransfer() { queue("campmobile_reconcileCombat",1); }
function campmobile_eventResearched(research,structure,player)
{
    if (player !== selectedPlayer) return;
    if (structure) {
        delete warzoneTowersLabResearch[String(structure.id)];
        delete blockNightLabTopics[String(structure.id)];
        blockNightV28ContinueAttempts[String(structure.id)]=0;
        queue("blockNightV28ContinueQueue",300,structure);
    }
    dump("BNTECHDONE:"+JSON.stringify({id:research.id,name:research.fullname,player:player,
        labId:structure?structure.id:null,gameTime:gameTime}));
}
