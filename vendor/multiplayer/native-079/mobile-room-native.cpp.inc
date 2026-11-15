// Private Android waiting-room presentation bridge. No simulation / protocol changes.
#if defined(__EMSCRIPTEN__)
#include <fstream>
#include <deque>
#include <unordered_map>

namespace {
using RoomJson = nlohmann::json;
static bool mpRoomLive = false;
static uint64_t mpRoomSerial = 0, mpRoomRevision = 0, mpRoomMessageSerial = 0;
static std::string mpRoomGeneration, mpRoomLastSnapshot;
static std::deque<RoomJson> mpRoomMessages;
static std::deque<std::string> mpRoomRequestOrder;
static std::unordered_map<std::string, RoomJson> mpRoomResults;

static bool mpRoomWrite(const char *path, const std::string &text)
{
    std::ofstream stream(path, std::ios::binary | std::ios::trunc);
    if (!stream) return false;
    stream << text;
    return bool(stream);
}

// Validate complete UTF-8, rather than truncating a multi-byte character in the
// fixed-size native NetworkTextMessage. Also reject embedded NUL/control bytes.
static bool mpRoomValidText(const std::string &text, size_t limit)
{
    if (text.empty() || text.size() > limit) return false;
    bool visible = false;
    for (size_t i = 0; i < text.size();)
    {
        const unsigned char c = text[i++];
        if (c < 0x80) {
            if (c < 0x20 || c == 0x7f) return false;
            visible = visible || c != ' ';
            continue;
        }
        unsigned cp = 0, count = 0, minimum = 0;
        if (c >= 0xc2 && c <= 0xdf) { cp = c & 31; count = 1; minimum = 0x80; }
        else if (c >= 0xe0 && c <= 0xef) { cp = c & 15; count = 2; minimum = 0x800; }
        else if (c >= 0xf0 && c <= 0xf4) { cp = c & 7; count = 3; minimum = 0x10000; }
        else return false;
        if (i + count > text.size()) return false;
        while (count--) {
            const unsigned char next = text[i++];
            if ((next & 0xc0) != 0x80) return false;
            cp = (cp << 6) | (next & 63);
        }
        if (cp < minimum || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return false;
        visible = true;
    }
    return visible;
}

static ChatBoxWidget *mpRoomChatBox()
{
    return static_cast<ChatBoxWidget *>(widgGetFromID(psWScreen, MULTIOP_CHATBOX));
}

static RoomJson mpRoomPermissions()
{
    const auto &self = NetPlay.players[selectedPlayer];
    const bool downloading = !NET_getDownloadingWzFiles().empty() || NETgetDownloadProgress(selectedPlayer) != 100;
    const bool identity = !getMultiStats(selectedPlayer).identity.empty();
    const bool canCheck = multiplayPlayersCanCheckReady();
    const bool ready = !self.isSpectator && !downloading && identity && canCheck;
    std::string readyReason = self.isSpectator ? "Spectators are readied automatically" :
        downloading ? "Downloading map / mods" : !identity ? "Player identity is not ready" :
        !canCheck ? (locked.readybeforefull && multiplayHasOpenPlayerSlot() ? "Waiting for all player slots to fill" : "Waiting for host to configure opposing teams") : "";
    RoomJson teams = RoomJson::array();
    const bool teamAllowed = !locked.teams && !self.isSpectator && alliancesSetTeamsBeforeGame(game.alliance);
    int disallow = allPlayersOnSameTeam(selectedPlayer);
    if (bMultiPlayer && NetPlay.bComms && isHostOrAdmin()) disallow = -1;
    if (teamAllowed) for (unsigned i = 0; i < game.maxPlayers; ++i) if (int(i) != disallow) teams.push_back(i);
    const bool slotAllowed = !locked.spectators && NetPlay.bComms && isHumanPlayer(selectedPlayer) && selectedPlayer != NetPlay.hostPlayer;
    const bool canSpectate = slotAllowed && !self.isSpectator && NETGameGetSpectatorInfo().availableSpectatorSlots() > 0;
    const bool canPlay = slotAllowed && self.isSpectator;
    const auto chat = mpRoomChatBox();
    const auto mode = chat ? chat->mobileSendMode() : ChatBoxWidget::ChatBoxSendMode::DISABLED;
    const char *chatMode = mode == ChatBoxWidget::ChatBoxSendMode::ENABLED ? "enabled" : mode == ChatBoxWidget::ChatBoxSendMode::HOSTMSG_ONLY ? "host-only" : "disabled";
    // Reserve the official /hostmsg prefix when free chat is host-restricted.
    const size_t chatMax = MAX_CONSOLE_STRING_LENGTH - 1 - (mode == ChatBoxWidget::ChatBoxSendMode::HOSTMSG_ONLY ? sizeof(LOBBY_COMMAND_PREFIX "hostmsg ") - 1 : 0);
    return RoomJson{{"canReady",ready},{"readyReason",readyReason},{"canTeam",teamAllowed && !teams.empty()},{"allowedTeams",teams},
        {"canSpectate",canSpectate},{"canPlay",canPlay},{"spectatorReason",locked.spectators ? "Spectator changes are locked by the host" : selectedPlayer == NetPlay.hostPlayer ? "The host cannot change its own slot type" : !self.isSpectator && !canSpectate ? "No open spectator slots" : self.isSpectator ? "Joining a player slot requires host approval" : ""},
        {"chatMode",chatMode},{"chatMaxBytes",chatMax}};
}

static RoomJson mpRoomOptions()
{
    const char *power = game.power == LEV_LOW ? "Low" : game.power == LEV_MED ? "Medium" : game.power == LEV_HI ? "High" : "Unknown";
    const char *bases = game.base == CAMP_CLEAN ? "No bases" : game.base == CAMP_BASE ? "Bases" : game.base == CAMP_WALLS ? "Advanced bases" : "Unknown";
    const char *alliances = game.alliance == ALLIANCES_TEAMS ? "Locked teams" : game.alliance == ALLIANCES_UNSHARED ? "Locked teams, no shared research" : game.alliance == ALLIANCES ? "Allow alliances" : "No alliances";
    const char *scavengers = game.scavengers == NO_SCAVENGERS ? "Off" : game.scavengers == SCAVENGERS ? "On" : game.scavengers == ULTIMATE_SCAVENGERS ? "Ultimate" : "Unknown";
    return RoomJson::array({{{"label","Power"},{"value",power}},{{"label","Bases"},{"value",bases}},
        {{"label","Technology"},{"value","T" + std::to_string(game.techLevel)}},{{"label","Alliances"},{"value",alliances}},
        {{"label","Scavengers"},{"value",scavengers}},{{"label","VTOL"},{"value",(ingame.flags & MPFLAGS_NO_VTOLS) ? "Off" : "Allowed"}}});
}

static RoomJson mpRoomSnapshot(bool ready)
{
    if (!ready) return RoomJson{{"version",79},{"ready",false},{"generation",mpRoomGeneration},{"revision",mpRoomRevision}};
    const auto &self = NetPlay.players[selectedPlayer];
    const bool blind = isBlindSimpleLobby(game.blindMode) && !NetPlay.isHost;
    RoomJson players = RoomJson::array();
    unsigned readyPlayers = 0, waitingPlayers = 0;
    for (unsigned i = 0; i < NetPlay.players.size() && i < MAX_CONNECTED_PLAYERS; ++i)
    {
        const auto &p = NetPlay.players[i];
        if (i < game.maxPlayers && (p.allocated || p.ai >= 0)) {
            if (p.ready || (!p.allocated && p.ai >= 0)) ++readyPlayers; else ++waitingPlayers;
        }
        // Native blind waiting rooms deliberately hide the other player rows.
        if (blind && i != selectedPlayer) continue;
        if (i != selectedPlayer && ((p.isSpectator && !p.allocated) || (!p.isSpectator && p.position >= game.maxPlayers))) continue;
        players.push_back({{"id",i},{"position",p.position},{"name",std::string(getPlayerName(i,true))},
            {"team",p.team},{"color",p.colour},{"ready",p.ready},{"spectator",p.isSpectator},{"allocated",p.allocated},
            {"ai",p.ai >= 0 && !p.allocated},{"closed",p.ai == AI_CLOSED && !p.allocated},
            {"ping",p.allocated && i != selectedPlayer ? RoomJson(ingame.PingTimes[i]) : RoomJson(nullptr)},
            // Other clients' transfer objects exist only on the host. Calling
            // NETgetDownloadProgress for them would assert on an ordinary client.
            {"downloading",p.allocated && (i == selectedPlayer || NetPlay.isHost) && NETgetDownloadProgress(i) != 100},{"local",i == selectedPlayer},{"host",i == NetPlay.hostPlayer}});
    }
    return RoomJson{{"version",79},{"ready",true},{"generation",mpRoomGeneration},{"revision",mpRoomRevision},
        {"localPlayer",selectedPlayer},{"localPosition",self.position},{"hostPlayer",NetPlay.hostPlayer},{"isHost",NetPlay.isHost},
        {"roomName",std::string(game.name)},{"mapName",std::string(game.map)},{"maxPlayers",game.maxPlayers},{"blind",blind},
        {"readyPlayers",readyPlayers},{"waitingPlayers",waitingPlayers},{"players",players},{"options",mpRoomOptions()},
        {"permissions",mpRoomPermissions()},{"local",{{"ready",self.ready},{"spectator",self.isSpectator},{"downloading",!NET_getDownloadingWzFiles().empty()}}},
        {"messages",mpRoomMessages}};
}

static RoomJson mpRoomAction(const RoomJson &request, bool ready)
{
    const auto nonce = request.value("nonce",std::string());
    const auto generation = request.value("generation",std::string());
    RoomJson result{{"nonce",nonce},{"generation",generation},{"ok",false},{"reason",""},{"revision",mpRoomRevision}};
    auto reject = [&](const char *why) {result["reason"]=why;return result;};
    if (nonce.empty() || nonce.size() > 96) return reject("Invalid request identity");
    if (!ready || !mpRoomLive || generation != mpRoomGeneration || !ingame.localJoiningInProgress) return reject("The waiting room has changed");
    if (selectedPlayer >= NetPlay.players.size() || !NetPlay.players[selectedPlayer].allocated) return reject("Your player slot is unavailable");
    const auto permissions = mpRoomPermissions();
    const auto action = request.value("action",std::string());
    bool accepted = false;
    if (action == "ready") {
        if (!request.contains("ready") || !request["ready"].is_boolean()) return reject("Invalid ready state");
        if (!permissions["canReady"].get<bool>()) {result["reason"]=permissions["readyReason"];return result;}
        const bool target=request["ready"].get<bool>();
        accepted = target == NetPlay.players[selectedPlayer].ready || sendReadyRequest(static_cast<UBYTE>(selectedPlayer),target);
    } else if (action == "team") {
        if (!request.contains("team") || !request["team"].is_number_unsigned()) return reject("Invalid team");
        const auto team=request["team"].get<unsigned>();
        const auto &allowed=permissions["allowedTeams"];
        if (!permissions["canTeam"].get<bool>() || std::find(allowed.begin(),allowed.end(),RoomJson(team)) == allowed.end()) return reject("This team change is not available");
        if (team == NetPlay.players[selectedPlayer].team) accepted=true;
        else { resetReadyStatus(false,isBlindSimpleLobby(game.blindMode)); accepted=SendTeamRequest(static_cast<UBYTE>(selectedPlayer),static_cast<UBYTE>(team)); }
    } else if (action == "spectator") {
        if (!request.contains("spectator") || !request["spectator"].is_boolean()) return reject("Invalid spectator state");
        const bool target=request["spectator"].get<bool>();
        if (target == NetPlay.players[selectedPlayer].isSpectator) accepted=true;
        else if (!(target ? permissions["canSpectate"].get<bool>() : permissions["canPlay"].get<bool>())) {result["reason"]=permissions["spectatorReason"];return result;}
        else accepted=SendPlayerSlotTypeRequest(selectedPlayer,target);
    } else if (action == "chat") {
        if (!request.contains("text") || !request["text"].is_string()) return reject("Invalid chat message");
        auto text=request["text"].get<std::string>();
        if (!mpRoomValidText(text,permissions["chatMaxBytes"].get<size_t>())) return reject("Enter a shorter valid chat message");
        const auto mode=permissions["chatMode"].get<std::string>();
        if (mode == "disabled") return reject("The host has disabled free chat");
        if (NetPlay.bComms && playerSpamMutedUntil(selectedPlayer).has_value()) return reject("Please wait before sending another message");
        if (mode == "host-only" && text.compare(0,sizeof(LOBBY_COMMAND_PREFIX "hostmsg")-1,LOBBY_COMMAND_PREFIX "hostmsg") != 0) text=LOBBY_COMMAND_PREFIX "hostmsg " + text;
        sendRoomChatMessage(text.c_str(),mode != "enabled"); accepted=true;
    } else return reject("Unknown waiting-room action");
    result["ok"]=accepted;
    if (!accepted) result["reason"]="The native request was not accepted";
    return result;
}
} // namespace

void mpMobileRoomLifecycle(bool live)
{
    if (live == mpRoomLive) return;
    mpRoomLive=live;
    mpRoomGeneration=live ? "mp-room-" + std::to_string(++mpRoomSerial) : "";
    mpRoomMessages.clear();mpRoomResults.clear();mpRoomRequestOrder.clear();mpRoomMessageSerial=0;
    mpRoomLastSnapshot.clear();++mpRoomRevision;
    std::remove("/tmp/mp-mobile-room-input.json");
    std::remove("/tmp/mp-mobile-room-input-result.json");
}

std::string mpMobileRoomGeneration() { return mpRoomGeneration; }

void mpMobileRoomMessage(const RoomMessage &message)
{
    if (!mpRoomLive) return;
    RoomJson item{{"seq",++mpRoomMessageSerial},{"kind",message.type == RoomMessagePlayer ? "player" : "system"},{"text",message.text.substr(0,2048)}};
    if (message.sender) {
        if (!message.sender->isDetached()) {
            const auto id=message.sender->originalIndex();
            item["playerId"]=id;item["name"]=std::string(getPlayerName(id,true));
        } else item["name"]=isBlindPlayerInfoState() ? "Player" : std::string((*message.sender)->name);
    }
    mpRoomMessages.push_back(std::move(item));
    while (mpRoomMessages.size()>100) mpRoomMessages.pop_front();
}

void mpMobileRoomFrame(bool ready)
{
    if (!bInActualHostedLobby && mpRoomLive) mpMobileRoomLifecycle(false);
    std::ifstream input("/tmp/mp-mobile-room-input.json",std::ios::binary);
    if (input) {
        const std::string text((std::istreambuf_iterator<char>(input)),{}); input.close();
        std::remove("/tmp/mp-mobile-room-input.json");
        if (text.size() <= 4096) try {
            const auto request=RoomJson::parse(text);
            const auto nonce=request.value("nonce",std::string());
            const auto key=request.value("generation",std::string())+"/"+nonce;
            const auto previous=mpRoomResults.find(key);
            RoomJson result;
            if(previous!=mpRoomResults.end()) result=previous->second;
            else {
                result=mpRoomAction(request,ready);
                if(!nonce.empty()&&nonce.size()<=96) {
                    mpRoomResults[key]=result;mpRoomRequestOrder.push_back(key);
                    while(mpRoomRequestOrder.size()>128){mpRoomResults.erase(mpRoomRequestOrder.front());mpRoomRequestOrder.pop_front();}
                }
            }
            mpRoomWrite("/tmp/mp-mobile-room-input-result.json",result.dump(-1,' ',false,RoomJson::error_handler_t::replace));
            // Even a no-op accepted target has a later observed snapshot. The
            // UI can distinguish its ACK revision from actual confirmation.
            if (result.value("ok",false)) mpRoomLastSnapshot.clear();
        } catch (const std::exception &) { /* malformed input never enters native handlers */ }
    }
    auto snapshot=mpRoomSnapshot(ready);
    snapshot.erase("revision");
    const auto content=snapshot.dump(-1,' ',false,RoomJson::error_handler_t::replace);
    if(content!=mpRoomLastSnapshot) {
        mpRoomLastSnapshot=content;snapshot["revision"]=++mpRoomRevision;
        mpRoomWrite("/tmp/mp-mobile-room.json",snapshot.dump(-1,' ',false,RoomJson::error_handler_t::replace));
    }
}
#else
void mpMobileRoomLifecycle(bool) {}
std::string mpMobileRoomGeneration() { return {}; }
void mpMobileRoomMessage(const RoomMessage &) {}
void mpMobileRoomFrame(bool) {}
#endif
