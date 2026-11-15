// Client-side mobile UI context for the official 4.7 multiplayer engine.
// It is not a registered game/rules script, owns no simulation timers, and is
// not included in synchronized script saves or the game's DATA_SCRIPT hash.
// Its only mutations are ordinary native queued player orders/local selection.
#if defined(__EMSCRIPTEN__)
#include <emscripten.h>
#include "main.h"
#include "multiint.h"
#include "ingameop.h"
#include "power.h"
#include "structure.h"
#include "selection.h"
#include "lib/ivis_opengl/piedef.h"
#include "lib/ivis_opengl/piestate.h"
#include <deque>
#include <set>
#include "terrain.h"
#include "geometry.h"
#include "display.h"
#include "lib/widget/label.h"
#include "lib/sound/mixer.h"
#include "intfac.h"
#include <array>
#include <fstream>
#include <memory>
#include <cmath>

static std::unique_ptr<quickjs_scripting_instance> mpMobileVM;
static std::deque<std::string> mpMobileEvents;
static unsigned long mpMobileEventSerial = 0;
static unsigned long mpMobileWrittenEventSerial = 0;
static unsigned long mpMobileFrameSerial = 0;
static bool mpMobileLoading = false;
static bool mpMobileLobby = false;
static bool mpMobileLobbyRendered = false;
static bool mpMobileViewReady = false;
static std::array<float,16> mpMobileMatrix{};
static uint32_t mpMobileLastTick = 0, mpMobileLastTerrain = 0;
static std::string mpMobileInputNonce;
static std::string mpMobileCameraInputNonce,mpMobileAppliedCameraNonce;
static bool mpMobileInitialKnown=false;
static std::set<std::string> mpMobileInitialResearch;
static AUDIO_STREAM *mpMobileReportAudio=nullptr;
extern WIDGET *mpMobileNetworkStatusWidget();

// BEGIN MP_MOBILE_OWNER_CAPABILITY
// A spectator may view another player's units. Viewed-player identity must
// never grant that observer an owned command context or player selection.
struct MpMobileOwnerCapability { bool spectator; bool ownsViewedPlayer; };
static MpMobileOwnerCapability mpMobileOwnerCapability(unsigned viewedPlayer,unsigned realPlayer,unsigned playablePlayers,
    bool realSlotExists,bool realSlotSpectator,bool viewedSlotExists,bool viewedSlotSpectator)
{
    const bool spectator=!realSlotExists||realPlayer>=playablePlayers||realSlotSpectator;
    return {spectator,!spectator&&viewedPlayer==realPlayer&&viewedPlayer<playablePlayers&&viewedSlotExists&&!viewedSlotSpectator};
}
// END MP_MOBILE_OWNER_CAPABILITY
static MpMobileOwnerCapability mpMobileOwner()
{
    const bool realExists=realSelectedPlayer<NetPlay.players.size(),viewedExists=selectedPlayer<NetPlay.players.size();
    return mpMobileOwnerCapability(selectedPlayer,realSelectedPlayer,MAX_PLAYERS,
        realExists,realExists&&NetPlay.players[realSelectedPlayer].isSpectator,
        viewedExists,viewedExists&&NetPlay.players[selectedPlayer].isSpectator);
}
static bool mpMobileCanIssueOrders()
{
    return GetGameMode()==GS_NORMAL&&gameInitialised&&!mpMobileLoading&&mpMobileViewReady&&mpMobileOwner().ownsViewedPlayer;
}

// BEGIN MP_COMBAT_SELECTION_POLICY
// Client selection only: this helper cannot issue orders or change control groups.
struct MpCombatSelectionUnit { uint32_t id; bool combat; bool selected; };
struct MpCombatSelectionPolicy {
    bool enabled=false,requestedSuspended=false,suspended=false,baseline=false;
    unsigned long revision=0;
    std::string reason="off",requestNonce,activation,blockedActivation;
    std::set<uint32_t> observedOwn,expectedSelection;
    void stop(const char *why) {
        if(enabled&&std::string(why)=="manual-selection"&&!activation.empty())blockedActivation=activation;
        if(enabled||requestedSuspended||baseline){++revision;}
        enabled=false;requestedSuspended=false;suspended=false;baseline=false;
        reason=why;observedOwn.clear();expectedSelection.clear();
    }
    void intent(bool on,bool pause,const std::string &nonce,const std::string &token="") {
        requestNonce=nonce;
        const auto nextActivation=token.empty()?nonce:token;
        if(on&&nextActivation==blockedActivation){if(!enabled)reason="manual-selection";++revision;return;}
        if(!enabled||requestedSuspended!=pause||activation!=nextActivation)baseline=false;
        enabled=on;requestedSuspended=on&&pause;suspended=requestedSuspended;
        activation=nextActivation;++revision;
        if(!on){stop("off");return;}
        reason=pause?"temporary":"on";
    }
    bool reconcile(const std::vector<MpCombatSelectionUnit> &units,bool safe) {
        if(!enabled)return false;
        suspended=requestedSuspended||!safe;
        if(suspended){reason=requestedSuspended?"temporary":"world-unsafe";baseline=false;return false;}
        std::set<uint32_t> own,combat,current;
        for(const auto &unit:units){own.insert(unit.id);if(unit.combat)combat.insert(unit.id);if(unit.selected)current.insert(unit.id);}
        if(baseline){
            // Death/ownership changes prune expectations. Newly created units
            // may inherit stock group selection; that is not a manual override.
            bool manual=false;
            for(const auto id:expectedSelection)if(combat.count(id)&&!current.count(id)){manual=true;break;}
            if(!manual)for(const auto id:current)if(!expectedSelection.count(id)&&observedOwn.count(id)){manual=true;break;}
            if(manual){stop("manual-selection");return false;}
        }
        const bool changed=current!=combat;
        if(changed||expectedSelection!=combat)++revision;
        observedOwn=std::move(own);expectedSelection=std::move(combat);baseline=true;reason="on";
        return changed;
    }
};
// END MP_COMBAT_SELECTION_POLICY
static MpCombatSelectionPolicy mpMobileCombatPolicy;
static std::string mpMobileCombatInputNonce;
static nlohmann::json mpMobileCombatState={{"enabled",false},{"suspended",false},{"reason","off"},{"combatIds",nlohmann::json::array()},{"selectedIds",nlohmann::json::array()},{"revision",0},{"requestNonce",""}};
static bool mpMobileCombatEligible(const DROID *droid)
{
    return droid->player==selectedPlayer&&droid->asWeaps[0].nStat>0&&!droid->isTransporter()&&isSelectable(droid);
}
static void mpMobileCombatIntent();
static void mpMobileCombatFrame(bool world,bool safe);

void mpMobileStatusDraw(bool suppress)
{
    // Update callbacks and audio keep running normally. Only this draw pass is
    // replaced by the app HUD, using the exact observed timer/status content.
    static bool restoreTimer=false,restoreNetwork=false;
    auto *timer=widgGetFromID(psWScreen,IDTIMER_FORM);
    auto *network=mpMobileNetworkStatusWidget();
    if(suppress){
        restoreTimer=timer&&timer->visible();restoreNetwork=network&&network->visible();
        if(restoreTimer)timer->hide();if(restoreNetwork)network->hide();
    }else{
        if(restoreTimer&&timer)timer->show();if(restoreNetwork&&network)network->show();
        restoreTimer=false;restoreNetwork=false;
    }
}
static nlohmann::json mpMobileStatus()
{
    std::string timerText,connectionText;
    auto *timer=widgGetFromID(psWScreen,IDTIMER_FORM);
    auto *label=widgGetFromID(psWScreen,IDTIMER_DISPLAY);
    if(timer&&timer->visible()&&label&&label->visible()&&label->type==WIDG_LABEL)timerText=static_cast<const W_LABEL*>(label)->getString().toUtf8();
    auto connections=nlohmann::json::array();
    for(unsigned i=0;i<CONNECTIONSTATUS_NORMAL;++i){
        const auto status=static_cast<CONNECTION_STATUS>(i);
        if(!NETcheckPlayerConnectionStatus(status,NET_ALL_PLAYERS))continue;
        const char *kind=nullptr,*text=nullptr;
        switch(status){
        case CONNECTIONSTATUS_PLAYER_LEAVING:kind="left";text=_("Player left");break;
        case CONNECTIONSTATUS_PLAYER_DROPPED:kind="dropped";text=_("Player dropped");break;
        case CONNECTIONSTATUS_WAITING_FOR_PLAYER:kind="waiting";text=_("Waiting for other players");break;
        case CONNECTIONSTATUS_DESYNC:kind="desync";text=_("Out of sync");break;
        default:continue;
        }
        auto players=nlohmann::json::array();
        for(unsigned p=0;p<MAX_PLAYERS;++p)if(NETcheckPlayerConnectionStatus(status,p))players.push_back({{"player",p},{"position",NetPlay.players[p].position}});
        if(!connectionText.empty())connectionText+=" · ";connectionText+=text;
        connections.push_back({{"kind",kind},{"text",text},{"players",players}});
    }
    return {{"timerText",timerText},{"connectionText",connectionText},{"kind",connections.empty()?"normal":"warning"},{"connections",connections}};
}

static std::string mpMobileReadFile(const char *path, size_t limit = 4*1024*1024)
{
    FILE *f = fopen(path,"rb"); if (!f) return {};
    std::string result; char buffer[8192]; size_t count;
    while ((count = fread(buffer,1,sizeof buffer,f)) > 0) {
        if (result.size()+count > limit) { result.clear(); break; }
        result.append(buffer,count);
    }
    fclose(f); return result;
}
static bool mpMobileWriteFile(const char *path, const std::string &value)
{
    const auto temporary=std::string(path)+".tmp";
    FILE *f=fopen(temporary.c_str(),"wb"); if(!f)return false;
    const bool ok=fwrite(value.data(),1,value.size(),f)==value.size();
    const bool closed=fclose(f)==0;
    return ok&&closed&&rename(temporary.c_str(),path)==0;
}
static void mpMobileCombatIntent()
{
    const auto data=mpMobileReadFile("/tmp/mp-mobile-combat.json",1024);
    if(data.empty())return;
    const auto request=nlohmann::json::parse(data,nullptr,false);
    if(!request.is_object()||!request.contains("nonce")||!request["nonce"].is_string()
        ||!request.contains("enabled")||!request["enabled"].is_boolean()
        ||!request.contains("suspended")||!request["suspended"].is_boolean()
        ||!request.contains("activation")||!request["activation"].is_string())return;
    const auto nonce=request["nonce"].get<std::string>();
    if(nonce.empty()||nonce==mpMobileCombatInputNonce)return;
    mpMobileCombatInputNonce=nonce;
    const bool world=mpMobileCanIssueOrders();
    const auto activation=request["activation"].get<std::string>();
    if(request["enabled"].get<bool>()&&(activation.empty()||activation.size()>160))return;
    mpMobileCombatPolicy.intent(world&&request["enabled"].get<bool>(),request["suspended"].get<bool>(),nonce,activation);
}
static void mpMobileCombatFrame(bool world,bool safe)
{
    std::vector<MpCombatSelectionUnit> units;
    if(world&&selectedPlayer<MAX_PLAYERS)for(const DROID *droid:apsDroidLists[selectedPlayer])units.push_back({droid->id,mpMobileCombatEligible(droid),droid->selected!=0});
    if(!world)mpMobileCombatPolicy.stop("session-ended");
    if(world&&mpMobileCombatPolicy.reconcile(units,safe)){
        for(DROID *droid:apsDroidLists[selectedPlayer]){
            const bool wanted=mpMobileCombatPolicy.expectedSelection.count(droid->id)>0;
            if(wanted&&!droid->selected)SelectDroid(droid,true);
            else if(!wanted&&droid->selected)DeSelectDroid(droid);
        }
        intRefreshScreen();triggerEventSelected();
    }
    auto combat=nlohmann::json::array(),selected=nlohmann::json::array();
    std::set<uint32_t> combatIds,selectedIds;
    if(world&&selectedPlayer<MAX_PLAYERS)for(const DROID *droid:apsDroidLists[selectedPlayer]){
        if(mpMobileCombatEligible(droid))combatIds.insert(droid->id);
        if(droid->selected)selectedIds.insert(droid->id);
    }
    for(const auto id:combatIds)combat.push_back(id);for(const auto id:selectedIds)selected.push_back(id);
    mpMobileCombatState={{"enabled",mpMobileCombatPolicy.enabled},{"suspended",mpMobileCombatPolicy.suspended},
        {"requestedSuspended",mpMobileCombatPolicy.requestedSuspended},{"reason",mpMobileCombatPolicy.reason},
        {"combatIds",combat},{"selectedIds",selected},{"revision",mpMobileCombatPolicy.revision},{"requestNonce",mpMobileCombatPolicy.requestNonce},{"activation",mpMobileCombatPolicy.activation}};
}
static void mpMobilePruneEvents()
{
    const auto text=mpMobileReadFile("/tmp/mp-mobile-events-ack",32);
    unsigned long consumed=0;
    if(sscanf(text.c_str(),"%lu",&consumed)!=1)return;
    consumed=std::min(consumed,mpMobileEventSerial);
    while(!mpMobileEvents.empty()&&mpMobileEventSerial-mpMobileEvents.size()+1<=consumed)mpMobileEvents.pop_front();
}
static JSValue mpMobileDump(JSContext *ctx,JSValueConst,int argc,JSValueConst *argv)
{
    for(int i=0;i<argc;i++) {
        const char *text=JS_ToCString(ctx,argv[i]); if(!text)continue;
        mpMobileEvents.push_back(std::string(text)); JS_FreeCString(ctx,text);
        ++mpMobileEventSerial;
        while(mpMobileEvents.size()>160)mpMobileEvents.pop_front();
    }
    return JS_UNDEFINED;
}
static JSValue mpMobileIncludeJSON(JSContext *ctx,JSValueConst,int argc,JSValueConst *argv)
{
    if(argc<1)return JS_ThrowTypeError(ctx,"A local UI mailbox filename is required");
    const char *raw=JS_ToCString(ctx,argv[0]); if(!raw)return JS_EXCEPTION;
    const std::string name(raw); JS_FreeCString(ctx,raw);
    const std::set<std::string> files={"warzone-towers-catalog.json","warzone-towers-command.json",
        "blocknight-queue-command.json","blocknight-zoom-command.json","warzone-towers-control.json",
        "warzone-towers-demolition-intent.json"};
    if(files.count(name)==0)return JS_ThrowTypeError(ctx,"Not a local UI mailbox");
    const auto path=std::string("/data/mp/multiplay/script/rules/")+name;
    const auto data=mpMobileReadFile(path.c_str());
    if(data.empty())return JS_ThrowInternalError(ctx,"Local UI mailbox not ready");
    return JS_ParseJSON(ctx,data.data(),data.size(),name.c_str());
}

bool quickjs_scripting_instance::initializeMultiplayerUI(const std::string &script)
{
    if(player()!=selectedPlayer||!mpMobileCanIssueOrders())return false;
    mpMobileUIContext=ctx;
    if(!registerFunctions("mobile-client-ui")){mpMobileUIContext=nullptr;return false;}
    // Remove every registered game API except the reviewed observations and
    // normal player commands used by this UI. No arbitrary JS command endpoint
    // is exposed to the WebView; all request payloads remain plain JSON.
    const std::set<std::string> allowed={"_","getObject","enumTemplates","makeTemplate",
        "structureIdle","enumRange","propulsionCanReach","enumStruct","enumDroid","enumSelected","enumResearch","getResearch",
        "pursueResearch","playerPower","queuedPower","isStructureAvailable","pickStructLocation",
        "structureCanFit","droidCanReach","terrainType","orderDroidBuild","orderDroidObj",
        "orderDroid","buildDroid","componentAvailable","getDroidProduction","getDroidLimit",
        "getStructureLimit","countStruct","countDroid","towersCancelProduction"};
    const std::set<std::string> registered={MP_REGISTERED_FUNCTIONS};
    for(const auto &name:registered) {
        if(allowed.count(name))continue;
        JSAtom atom=JS_NewAtom(ctx,name.c_str()); JS_DeleteProperty(ctx,global_obj,atom,0); JS_FreeAtom(ctx,atom);
    }
    JS_SetPropertyStr(ctx,global_obj,"dump",JS_NewCFunction(ctx,mpMobileDump,"dump",1));
    JS_SetPropertyStr(ctx,global_obj,"includeJSON",JS_NewCFunction(ctx,mpMobileIncludeJSON,"includeJSON",1));
    setSpecifiedGlobalVariables({{"me",selectedPlayer},{"selectedPlayer",selectedPlayer},
        {"mapWidth",mapWidth},{"mapHeight",mapHeight},{"maxPlayers",game.maxPlayers},
        {"isMultiplayer",true},{"scriptName","mobile-client-ui"},{"scriptPath","/tmp"}});
    setSpecifiedGlobalVariable("Stats",wzapi::constructStatsObject());
    setSpecifiedGlobalVariables(wzapi::getUsefulConstants());
    updateGameTime(gameTime);
    JSValue value=JS_Eval_BypassLimitedContext(ctx,script.data(),script.size(),"<mobile-client-ui>",JS_EVAL_TYPE_GLOBAL);
    if(JS_IsException(value)) { const auto error=QuickJS_DumpError(ctx); debug(LOG_ERROR,"Mobile UI initialization: %s",error.c_str()); JS_FreeValue(ctx,value); return false; }
    JS_FreeValue(ctx,value); return true;
}
void quickjs_scripting_instance::tickMultiplayerUI()
{
    if(player()!=selectedPlayer||!mpMobileCanIssueOrders())return;
    updateGameTime(gameTime);
    const char script[]="mpMobileTick()";
    JSValue value=JS_Eval_BypassLimitedContext(ctx,script,sizeof(script)-1,"<mobile-client-ui-tick>",JS_EVAL_TYPE_GLOBAL);
    if(JS_IsException(value)){const auto error=QuickJS_DumpError(ctx);debug(LOG_ERROR,"Mobile UI tick: %s",error.c_str());}
    JS_FreeValue(ctx,value);
}
void mpMobileSetView(const float *matrix)
{
    std::copy(matrix,matrix+16,mpMobileMatrix.begin());mpMobileViewReady=true;++mpMobileFrameSerial;
}
extern void mpMobileRoomLifecycle(bool);
extern std::string mpMobileRoomGeneration();
extern void mpMobileRoomFrame(bool);
void mpMobileSetLobby(bool ready) { mpMobileLobby=ready;if(!ready)mpMobileLobbyRendered=false;mpMobileRoomLifecycle(ready); }
void mpMobileDidDrawLobby(bool ready) { mpMobileLobbyRendered=ready; }
void mpMobileSetLoading(bool loading) { mpMobileLoading=loading; }
static nlohmann::json mpMobileReports()
{
    auto reports=nlohmann::json::array();
    if(!mpMobileOwner().ownsViewedPlayer)return reports;
    for(auto &research:asResearch) {
        if(!IsResearchCompleted(&asPlayerResList[selectedPlayer][research.index]))continue;
        bool hasMessage=false,read=true;
        for(const MESSAGE *m:apsMessages[selectedPlayer])if(m->type==MSG_RESEARCH&&m->pViewData&&m->pViewData==research.pViewData){hasMessage=true;read=read&&m->read;}
        const auto id=research.id.toUtf8();
        if(!mpMobileInitialKnown)mpMobileInitialResearch.insert(id);
        if(!hasMessage)continue;
        auto description=nlohmann::json::array();
        if(research.pViewData&&research.pViewData->type==VIEW_RES)for(const auto &p:research.pViewData->textMsg)description.push_back(p.toUtf8());
        auto unlocks=nlohmann::json::array();
        for(const auto index:research.pStructureResults)if(index<numStructureStats)unlocks.push_back({{"id",asStructureStats[index].id.toUtf8()},{"name",getLocalizedStatsName(&asStructureStats[index])},{"kind","structure"}});
        for(const auto *stat:research.componentResults)if(stat)unlocks.push_back({{"id",stat->id.toUtf8()},{"name",getLocalizedStatsName(stat)},{"kind","component"}});
        reports.push_back({{"id",id},{"name",getLocalizedStatsName(&research)},{"completed",true},{"hasMessage",true},{"read",read},
            {"initialGrant",mpMobileInitialResearch.count(id)>0},{"description",description},{"results",research.results},{"unlocks",unlocks}});
    }
    mpMobileInitialKnown=true;return reports;
}
static const char *mpMobileReportCategoryAudio(const RESEARCH &research)
{
    switch(research.iconID){
    case IMAGE_RES_DROIDTECH:case IMAGE_RES_CYBORGTECH:return "sequenceaudio/res_droid.ogg";
    case IMAGE_RES_WEAPONTECH:return "sequenceaudio/res_weapons.ogg";
    case IMAGE_RES_COMPUTERTECH:return "sequenceaudio/res_com.ogg";
    case IMAGE_RES_POWERTECH:return "sequenceaudio/res_pow.ogg";
    case IMAGE_RES_SYSTEMTECH:return "sequenceaudio/res_systech.ogg";
    case IMAGE_RES_STRUCTURETECH:case IMAGE_RES_DEFENCE:return "sequenceaudio/res_strutech.ogg";
    default:return nullptr;}
}
static void mpMobileInput()
{
    const auto data=mpMobileReadFile("/tmp/mp-mobile-input.json",16384);
    if(data.empty())return;
    const auto request=nlohmann::json::parse(data,nullptr,false);
    if(!request.is_object())return;
    const auto nonce=request.value("nonce",std::string());
    if(nonce.empty()||nonce==mpMobileInputNonce)return;
    mpMobileInputNonce=nonce;
    const auto action=request.value("action",std::string());bool ok=false;
    const bool allowed=mpMobileCanIssueOrders();
    if(allowed&&(action=="deselect"||action=="select-box"||action=="select-visible-trucks")) {
        if(mpMobileCombatPolicy.enabled&&!mpMobileCombatPolicy.requestedSuspended)mpMobileCombatPolicy.stop("manual-selection");
        const bool add=request.value("add",false);
        double left=request.value("left",0.0),top=request.value("top",0.0),right=request.value("right",0.0),bottom=request.value("bottom",0.0);
        if(action!="select-box"||(std::isfinite(left)&&std::isfinite(top)&&std::isfinite(right)&&std::isfinite(bottom))) {
            if(!add||action!="select-box")selDroidDeselect(selectedPlayer);
            for(DROID *droid:apsDroidLists[selectedPlayer]) {
                if(action=="deselect"||!isSelectable(droid)||!objectOnScreen(droid,0))continue;
                const bool match=action=="select-visible-trucks"?(droid->droidType==DROID_CONSTRUCT||droid->droidType==DROID_CYBORG_CONSTRUCT)
                    :droid->sDisplay.screenX>=left&&droid->sDisplay.screenX<=right&&droid->sDisplay.screenY>=top&&droid->sDisplay.screenY<=bottom;
                if(match)SelectDroid(droid);
            }
            intRefreshScreen();triggerEventSelected();ok=true;
        }
    }
    if(allowed&&(action=="report-read"||action=="report-stop")){
        if(mpMobileReportAudio){sound_StopStream(mpMobileReportAudio);mpMobileReportAudio=nullptr;}
        ok=action=="report-stop";
        if(action=="report-read")for(auto &research:asResearch)if(research.id.toUtf8()==request.value("id",std::string())&&IsResearchCompleted(&asPlayerResList[selectedPlayer][research.index])){
            bool present=false;
            for(MESSAGE *m:apsMessages[selectedPlayer])if(m->type==MSG_RESEARCH&&m->pViewData&&m->pViewData==research.pViewData){m->read=true;present=true;}
            if(present){ok=true;if(const auto name=mpMobileReportCategoryAudio(research))mpMobileReportAudio=audio_PlayStream(name,sound_GetUIVolume(),[](const AUDIO_STREAM *stream,const void*){if(stream==mpMobileReportAudio)mpMobileReportAudio=nullptr;},nullptr);}
        }
    }
    auto ids=nlohmann::json::array();if(allowed)for(const DROID *d:apsDroidLists[selectedPlayer])if(d->selected)ids.push_back(d->id);
    mpMobileWriteFile("/tmp/mp-mobile-input-result.json",nlohmann::json{{"nonce",nonce},{"ok",ok},{"selectedIds",ids}}.dump());
}
static void mpMobileCamera()
{
    const auto data=mpMobileReadFile("/tmp/mp-mobile-camera.json",1024);
    if(data.empty())return;
    const auto request=nlohmann::json::parse(data,nullptr,false);
    if(!request.is_object())return;
    const auto nonce=request.value("nonce",std::string());
    if(nonce.empty()||nonce==mpMobileCameraInputNonce)return;
    // Discard stale gestures if the native world became unsafe before this frame.
    mpMobileCameraInputNonce=nonce;
    if(GetGameMode()!=GS_NORMAL||!gameInitialised||mpMobileLoading||!mpMobileViewReady
        ||InGameOpUp||isInGamePopupUp||bLoadSaveUp||intMode!=INT_NORMAL||gamePaused()||gameUpdatePaused())return;
    bool changed=false;
    for(const char *key:{"yaw","pitch","distance"})if(request.contains(key)){
        if(!request[key].is_number()||!std::isfinite(request[key].get<double>()))return;
        changed=true;
    }
    if(!changed)return;
    setWarCamActive(false);
    if(request.contains("yaw")){
        const auto wrapped=std::fmod(std::fmod(request["yaw"].get<double>(),double(DEG(360)))+DEG(360),double(DEG(360)));
        playerPos.r.y=static_cast<int32_t>(std::lround(wrapped))%DEG(360);
    }
    if(request.contains("pitch"))playerPos.r.x=static_cast<int32_t>(std::lround(std::max(double(DEG(360+MIN_PLAYER_X_ANGLE)),std::min(double(DEG(360+MAX_PLAYER_X_ANGLE)),request["pitch"].get<double>()))));
    if(request.contains("distance")){
        const auto distance=static_cast<float>(std::max(double(MINDISTANCE),std::min(double(NETisReplay()?MAXDISTANCE_REPLAY:MAXDISTANCE),request["distance"].get<double>())));
        // Replace the wheel animation's target as well as the current distance.
        animateToViewDistance(distance,0.f);setViewDistance(distance);
    }
    playerPos.r.z=0;camInformOfRotation(&playerPos.r);
    mpMobileAppliedCameraNonce=nonce;
}
static void mpMobileTerrain()
{
    if(mpMobileLastTerrain&&gameTime-mpMobileLastTerrain<1000)return;
    mpMobileLastTerrain=gameTime;
    mpMobileWriteFile("/tmp/mp-mobile-reports.json",nlohmann::json{{"ready",true},{"player",selectedPlayer},{"gameTime",gameTime},{"reports",mpMobileReports()}}.dump());
    auto heights=nlohmann::json::array();
    for(int y=0;y<=mapHeight;y++)for(int x=0;x<=mapWidth;x++)heights.push_back(x<=0||y<=0||x>=mapWidth||y>=mapHeight?0:getTerrainShaderQuality()==TerrainShaderQuality::CLASSIC?map_TileHeightSurface(x,y):map_TileHeight(x,y));
    mpMobileWriteFile("/tmp/mp-mobile-terrain.json",nlohmann::json{{"width",mapWidth},{"height",mapHeight},{"tileSize",128},{"vertexWidth",mapWidth+1},{"vertexHeight",mapHeight+1},{"heights",heights},{"revision",gameTime}}.dump());
}
bool mpMobileObjectSelected(BASE_OBJECT *object)
{
    if(GetGameMode()!=GS_NORMAL||!gameInitialised||!object||object->player!=selectedPlayer)return false;
    // Consume only this native object-menu dispatch; keep normal spectator
    // world viewing/camera behavior, without opening an owned or stock panel.
    if(!mpMobileCanIssueOrders())return true;
    if(object->type==OBJ_DROID&&mpMobileCombatPolicy.enabled)mpMobileCombatPolicy.stop("manual-selection");
    intResetScreen(true);
    if(object->type==OBJ_STRUCTURE){
        const auto *structure=castStructure(object);
        if(structure->status==SS_BUILT&&(structure->isFactory()||structure->pStructureType->type==REF_RESEARCH)){
            const char *kind=structure->isFactory()?"factory":"research";
            MAIN_THREAD_EM_ASM({if(typeof wz_js_mp_facility_selected==='function')wz_js_mp_facility_selected($0,UTF8ToString($1));},structure->id,kind);
        }
    }
    return true;
}
void mpMobileBeforeFrame()
{
    mpMobileCombatIntent();
    if(GetGameMode()==GS_NORMAL&&gameInitialised){intRemoveReticule();mpMobileCamera();}
}
void mpMobileFrame()
{
    const bool world=GetGameMode()==GS_NORMAL&&gameInitialised&&!mpMobileLoading&&mpMobileViewReady;
    const bool room=GetGameMode()==GS_TITLE_SCREEN&&mpMobileLobby&&mpMobileLobbyRendered&&!mpMobileLoading&&selectedPlayer<NetPlay.players.size()&&NetPlay.players[selectedPlayer].allocated;
    mpMobileRoomFrame(room);
    const bool nativeMenu=InGameOpUp||isInGamePopupUp||bLoadSaveUp||intMode!=INT_NORMAL;
    const bool safe=world&&!nativeMenu&&!gamePaused()&&!gameUpdatePaused();
    const auto owner=mpMobileOwner();
    const bool canIssueOrders=world&&owner.ownsViewedPlayer;
    if(!canIssueOrders&&mpMobileVM){mpMobileUIContext=nullptr;mpMobileVM.reset();mpMobileLastTick=0;mpMobileEvents.clear();++mpMobileEventSerial;}
    mpMobileCombatIntent();
    if(world)mpMobileInput();
    mpMobileCombatFrame(canIssueOrders,safe&&canIssueOrders);
    const char *phase=world?"game":room?"room":mpMobileLoading?"loading":"frontend";
    auto radar=nlohmann::json{{"visible",false}};
    if(world)if(const auto widget=getRadarWidget())radar={{"visible",widget->visible()},{"left",widget->x()},{"top",widget->y()},{"right",widget->x()+widget->width()},{"bottom",widget->y()+widget->height()}};
    const auto state=nlohmann::json{{"phase",phase},{"roomGeneration",room?mpMobileRoomGeneration():std::string()},{"lobbyReady",room},{"worldReady",world},{"rendered",world||room},
        {"nativeMenuOpen",nativeMenu},{"worldSafe",safe},{"cameraSafe",safe},{"player",selectedPlayer},{"realPlayer",realSelectedPlayer},{"spectator",owner.spectator},{"canIssueOrders",canIssueOrders},{"playerName",std::string(sPlayer)},{"networkName",realSelectedPlayer<NetPlay.players.size()?std::string(NetPlay.players[realSelectedPlayer].name):std::string()},{"protocolMajor",NETGetMajorVersion()},{"protocolMinor",NETGetMinorVersion()},{"gameTime",gameTime},
        {"power",canIssueOrders?getPower(selectedPlayer):0},{"queuedPower",canIssueOrders?getQueuedPower(selectedPlayer):0},
        {"uiStatus",world?mpMobileStatus():nlohmann::json{{"timerText",""},{"connectionText",""},{"kind","normal"},{"connections",nlohmann::json::array()}}},
        {"combatLock",mpMobileCombatState},
        {"view",{{"matrix",mpMobileMatrix},{"frame",mpMobileFrameSerial},{"capturedAt",realTime},{"width",pie_GetVideoBufferWidth()},{"height",pie_GetVideoBufferHeight()},{"left",0},{"top",0},
        {"camera",{{"x",playerPos.p.x},{"y",playerPos.p.z},{"yaw",playerPos.r.y},{"pitch",playerPos.r.x},{"distance",getViewDistance()},
        {"requestNonce",mpMobileAppliedCameraNonce},{"limits",{{"yawPeriod",DEG(360)},{"pitchMin",DEG(360+MIN_PLAYER_X_ANGLE)},{"pitchMax",DEG(360+MAX_PLAYER_X_ANGLE)},{"distanceMin",MINDISTANCE},{"distanceMax",NETisReplay()?MAXDISTANCE_REPLAY:MAXDISTANCE}}}}}}},{"radar",radar}};
    const auto text=state.dump();mpMobileWriteFile("/tmp/mp-mobile-state.json",text);
    MAIN_THREAD_EM_ASM({if(typeof wz_js_mp_native_state==='function')wz_js_mp_native_state(UTF8ToString($0));},text.c_str());
    if(!world){if(GetGameMode()!=GS_NORMAL)mpMobileViewReady=false;return;}
    mpMobilePruneEvents();
    if(canIssueOrders&&!mpMobileVM){const auto script=mpMobileReadFile("/tmp/mp-mobile-ui.js");if(!script.empty()){
        auto vm=std::make_unique<quickjs_scripting_instance>(selectedPlayer,"mobile-client-ui","/tmp");
        if(vm->initializeMultiplayerUI(script))mpMobileVM=std::move(vm);else mpMobileUIContext=nullptr;
    }}
    if(canIssueOrders&&mpMobileVM&&gameTime-mpMobileLastTick>=100){mpMobileLastTick=gameTime;mpMobileVM->tickMultiplayerUI();}
    mpMobileTerrain();
    if(mpMobileWrittenEventSerial!=mpMobileEventSerial){
        if(mpMobileWriteFile("/tmp/mp-mobile-events.json",nlohmann::json{{"serial",mpMobileEventSerial},{"first",mpMobileEventSerial-mpMobileEvents.size()+1},{"messages",mpMobileEvents}}.dump()))mpMobileWrittenEventSerial=mpMobileEventSerial;
    }
}
#else
void mpMobileBeforeFrame(){}
void mpMobileFrame(){}
void mpMobileSetLobby(bool){}
void mpMobileDidDrawLobby(bool){}
void mpMobileSetLoading(bool){}
void mpMobileSetView(const float*){}
bool mpMobileObjectSelected(BASE_OBJECT*){return false;}
void mpMobileStatusDraw(bool){}
#endif
