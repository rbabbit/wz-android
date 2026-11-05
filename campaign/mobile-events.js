/* Additive campaign hooks. The original cam_ and mission events remain intact. */
namespace("campmobile_");
var campmobile_level = "";
var campmobile_session = "";
var blockNightLabTopics = {};
var blockNightLastResearchSnapshot = "";

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
    dump("BNCAMPAIGN:" + JSON.stringify({mode: "campaign", mission: campmobile_level,
        session: campmobile_session, gameTime: gameTime, missionTime: getMissionTime(),
        missionType: getMissionType(), ended: typeof __camLevelEnded !== "undefined" && __camLevelEnded}));
}

function campmobile_initialize()
{
    campmobile_session = campmobile_level + "-" + Date.now();
    // Files outlive mission contexts. Do not replay a previous mission's input.
    const prefix = "mobile/";
    wtcmd_revision = includeJSON(prefix + "warzone-towers-command.json").revision || "";
    blockNightV32LastQueueNonce = includeJSON(prefix + "blocknight-queue-command.json").nonce || "";
    blockNightV31LastZoomNonce = includeJSON(prefix + "blocknight-zoom-command.json").nonce || "";
    warzoneTowersLastControlNonce = includeJSON(prefix + "warzone-towers-control-command.json").nonce || "";
    setTimer("blockNightV32PollBridgeCommands", 120);
    setTimer("blockNightEmitResearchSnapshotV23", 1000);
    setTimer("campmobile_status", 1000);
    blockNightLastResearchSnapshot = "";
    campmobile_status();
    blockNightEmitResearchSnapshotV23();
    blockNightV28EmitQueueState("", true, "loaded", []);
}

function campmobile_eventStartLevel() { queue("campmobile_initialize", 200); }
function campmobile_eventGameLoaded() { queue("campmobile_initialize", 200); }
function campmobile_eventResearched(research, structure, player)
{
    if (player !== selectedPlayer) return;
    if (structure) {
        delete warzoneTowersLabResearch[String(structure.id)];
        delete blockNightLabTopics[String(structure.id)];
        blockNightV28ContinueAttempts[String(structure.id)] = 0;
        queue("blockNightV28ContinueQueue", 300, structure);
    }
    dump("BNTECHDONE:" + JSON.stringify({id: research.id, name: research.fullname,
        player: player, labId: structure ? structure.id : null, gameTime: gameTime}));
}
