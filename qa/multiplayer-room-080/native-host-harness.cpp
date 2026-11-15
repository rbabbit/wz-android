
#include <nlohmann/json.hpp>
#include <algorithm>
#include <array>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>
using UBYTE=unsigned char;
constexpr unsigned MAX_CONNECTED_PLAYERS=6,MAX_PLAYERS=4;
constexpr int AI_CLOSED=-2, MAX_CONSOLE_STRING_LENGTH=255, MULTIOP_CHATBOX=1;
constexpr int LEV_LOW=0,LEV_MED=1,LEV_HI=2,CAMP_CLEAN=0,CAMP_BASE=1,CAMP_WALLS=2;
constexpr int ALLIANCES=1,ALLIANCES_TEAMS=2,ALLIANCES_UNSHARED=3;
constexpr int NO_SCAVENGERS=0,SCAVENGERS=1,ULTIMATE_SCAVENGERS=2,MPFLAGS_NO_VTOLS=4;
#define LOBBY_COMMAND_PREFIX "/"
struct Player {std::string name;unsigned position=0,team=0,colour=0;bool allocated=false,ready=false,isSpectator=false;int ai=AI_CLOSED;};
struct {std::array<Player,6> players;bool isHost=false,bComms=true;unsigned hostPlayer=0;} NetPlay;
struct Hash {std::string value="actual-hash";std::string toString()const{return value;}};
struct {Hash hash;std::string name="Actual room",map="Actual map";unsigned maxPlayers=4;int power=2,base=1,alliance=2,scavengers=0,techLevel=1,blindMode=0;} game;
struct {bool teams=false,spectators=false,readybeforefull=false;} locked;
struct {std::array<unsigned,6> PingTimes{};unsigned flags=4;bool localJoiningInProgress=true;} ingame;
struct Stats {std::string identity="recorded-identity";};std::array<Stats,6> stats;
unsigned selectedPlayer=1;bool bMultiPlayer=true,bInActualHostedLobby=true;
unsigned downloadProgress=100,spectatorSlots=1;bool downloaded=true,canCheck=true,openSlot=false,muted=false;int disallow=-1;
enum RoomMessageType{RoomMessagePlayer,RoomMessageSystem,RoomMessageNotify};
struct PlayerReference {unsigned index;bool detached=false;const Player*operator->()const{return &NetPlay.players[index];}bool isDetached()const{return detached;}unsigned originalIndex()const{return index;}};
struct RoomMessage {std::shared_ptr<PlayerReference> sender;std::string text;RoomMessageType type=RoomMessageSystem;};
struct ChatBoxWidget {enum class ChatBoxSendMode{DISABLED,HOSTMSG_ONLY,ENABLED};ChatBoxSendMode mode=ChatBoxSendMode::ENABLED;ChatBoxSendMode mobileSendMode()const{return mode;}} chat;
int psWScreen=0;void*widgGetFromID(int,int){return &chat;}
std::vector<int> NET_getDownloadingWzFiles(){return downloaded?std::vector<int>{}:std::vector<int>{1};}
unsigned NETgetDownloadProgress(unsigned p){if(p!=selectedPlayer&&!NetPlay.isHost)throw std::runtime_error("remote client download assertion");return downloadProgress;}
Stats&getMultiStats(unsigned p){return stats[p];}
bool multiplayPlayersCanCheckReady(){return canCheck;}
bool multiplayHasOpenPlayerSlot(){return openSlot;}
bool alliancesSetTeamsBeforeGame(int a){return a==ALLIANCES_TEAMS||a==ALLIANCES_UNSHARED;}
int allPlayersOnSameTeam(int){return disallow;}
bool isHostOrAdmin(){return NetPlay.isHost;}
bool isHumanPlayer(unsigned p){return NetPlay.players[p].allocated;}
struct SpectatorInfo{unsigned availableSpectatorSlots()const{return spectatorSlots;}};
SpectatorInfo NETGameGetSpectatorInfo(){return {};}
bool isBlindSimpleLobby(int mode){return mode!=0;}
bool isBlindPlayerInfoState(){return game.blindMode!=0;}
const char*getPlayerName(unsigned p,bool){return game.blindMode&&p!=selectedPlayer?"Generic":NetPlay.players[p].name.c_str();}
std::optional<int> playerSpamMutedUntil(unsigned){return muted?std::optional<int>(1):std::nullopt;}
std::vector<std::string> calls;std::string lastText;bool lastSkip=false;
bool sendReadyRequest(UBYTE p,bool ready){calls.push_back("ready:"+std::to_string(p)+":"+std::to_string(ready));return true;}
void resetReadyStatus(bool,bool){calls.push_back("reset-ready");}
bool SendTeamRequest(UBYTE p,UBYTE team){calls.push_back("team:"+std::to_string(p)+":"+std::to_string(team));return true;}
bool SendPlayerSlotTypeRequest(unsigned p,bool target){calls.push_back("spectator:"+std::to_string(p)+":"+std::to_string(target));return true;}
void sendRoomChatMessage(const char*text,bool skip){calls.push_back("chat");lastText=text;lastSkip=skip;}
namespace WzMap {struct MapPreviewImage {std::vector<uint8_t> imageData;uint32_t width=0,height=0,channels=3;};}
#define __EMSCRIPTEN__ 1
#include "/mnt/c/timerApp/wz-towers-lab/vendor/multiplayer/native-080/mobile-room-map-preview.cpp.inc"
#include "/mnt/c/timerApp/wz-towers-lab/vendor/multiplayer/native-080/mobile-room-native.cpp.inc"
std::vector<std::string> passed;
void check(bool value,const char*name){if(!value)throw std::runtime_error(name);passed.push_back(name);}
nlohmann::json request(const char*action){return {{"generation",mpRoomGeneration},{"nonce","one"},{"action",action}};}
void input(nlohmann::json r){mpRoomWrite("/tmp/mp-mobile-room-input.json",r.dump());mpMobileRoomFrame(true);}
int main(){try{
 for(unsigned i=0;i<6;++i){NetPlay.players[i].name="Player"+std::to_string(i);NetPlay.players[i].position=i;}
 NetPlay.players[0].allocated=true;NetPlay.players[1].allocated=true;NetPlay.players[2].ai=0;
 mpMobileRoomLifecycle(true);auto generation=mpMobileRoomGeneration();
 check(!generation.empty(),"Actual-room lifecycle creates a generation");
 auto s=mpRoomSnapshot(true);check(s["ready"]==true&&s["localPlayer"]==1&&s["localPosition"]==1,"Ready snapshot exports actual local slot and position");
 check(s["players"].size()==4&&s["options"][0]["value"]=="High","Actual roster and native options are exported without client download assertions");
 check(s["permissions"]["canReady"]==true,"Ordinary player can request ready");
 auto r=request("ready");r["ready"]=true;auto ack=mpRoomAction(r,true);
 check(ack["ok"]==true&&calls.back()=="ready:1:1"&&!NetPlay.players[1].ready,"Ready calls official request and does not fake host confirmation");
 downloaded=false;check(!mpRoomAction(r,true)["ok"].get<bool>(),"Ready rejected during local download");downloaded=true;
 stats[1].identity="";check(!mpRoomAction(r,true)["ok"].get<bool>(),"Ready rejected before identity exists");stats[1].identity="id";
 canCheck=false;check(!mpRoomAction(r,true)["ok"].get<bool>(),"Ready respects native full-slot/opposing-team checks");canCheck=true;
 auto t=request("team");t["team"]=2u;calls.clear();check(mpRoomAction(t,true)["ok"]==true&&calls.size()==2&&calls[0]=="reset-ready"&&calls[1]=="team:1:2","Own team change uses official reset and SendTeamRequest");
 locked.teams=true;check(!mpRoomAction(t,true)["ok"].get<bool>(),"Host team lock is enforced");locked.teams=false;
 disallow=2;check(!mpRoomAction(t,true)["ok"].get<bool>(),"Team that would leave one opposing team is excluded");disallow=-1;
 auto spec=request("spectator");spec["spectator"]=true;check(mpRoomAction(spec,true)["ok"]==true&&!NetPlay.players[1].isSpectator,"Spectator uses official request without mutating slot");
 spectatorSlots=0;check(!mpRoomAction(spec,true)["ok"].get<bool>(),"Spectator requires an available native slot");spectatorSlots=1;
 locked.spectators=true;check(!mpRoomAction(spec,true)["ok"].get<bool>(),"Host spectator lock is enforced");locked.spectators=false;
 selectedPlayer=0;check(!mpRoomAction(spec,true)["ok"].get<bool>(),"Own host slot cannot be moved to spectator");selectedPlayer=1;
 auto c=request("chat");c["text"]="Hello "+std::string("\xf0\x9f\x91\x8b");calls.clear();check(mpRoomAction(c,true)["ok"]==true&&calls.size()==1&&lastText==c["text"]&&!lastSkip,"UTF8 chat uses official sender and native self echo");
 chat.mode=ChatBoxWidget::ChatBoxSendMode::HOSTMSG_ONLY;c["text"]="Host question";check(mpRoomAction(c,true)["ok"]==true&&lastText=="/hostmsg Host question"&&lastSkip,"Host-only chat preserves official prefix and private echo policy");
 c["text"]=std::string(250,'x');check(!mpRoomAction(c,true)["ok"].get<bool>(),"Chat reserves native host-prefix bytes");
 chat.mode=ChatBoxWidget::ChatBoxSendMode::DISABLED;c["text"]="Hello";check(!mpRoomAction(c,true)["ok"].get<bool>(),"Disabled free chat cannot send");chat.mode=ChatBoxWidget::ChatBoxSendMode::ENABLED;
 muted=true;check(!mpRoomAction(c,true)["ok"].get<bool>(),"Native spam mute cannot be bypassed");muted=false;
 check(!mpRoomValidText(std::string("bad\0text",8),254)&&!mpRoomValidText("\xc0\x80",254)&&!mpRoomValidText("\xed\xa0\x80",254)&&!mpRoomValidText("\xf4\x90\x80\x80",254),"NUL, overlong, surrogate and out-of-range UTF8 are rejected");
 check(!mpRoomValidText("   ",254)&&!mpRoomValidText("new\nline",254)&&!mpRoomValidText("\xe2\x82",254),"Blank, control and incomplete UTF8 messages are rejected");
 auto stale=c;stale["generation"]="old-room";calls.clear();check(!mpRoomAction(stale,true)["ok"].get<bool>()&&calls.empty(),"Stale generation cannot send");
 check(!mpRoomAction(c,false)["ok"].get<bool>()&&calls.empty(),"Unrendered/world transition cannot send");
 ingame.localJoiningInProgress=false;check(!mpRoomAction(c,true)["ok"].get<bool>()&&calls.empty(),"Game start closes the room action guard");ingame.localJoiningInProgress=true;
 c["nonce"]="dedupe";input(c);input(c);check(calls.size()==1,"Repeated same-generation nonce sends chat once");
 RoomJson result;{std::ifstream f("/tmp/mp-mobile-room-input-result.json");f>>result;}RoomJson observed;{std::ifstream f("/tmp/mp-mobile-room.json");f>>observed;}
 check(result["ok"]==true&&observed["revision"].get<uint64_t>()>result["revision"].get<uint64_t>(),"Accepted ACK is followed by a fresh observed revision");
 game.blindMode=1;s=mpRoomSnapshot(true);check(s["blind"]==true&&s["players"].size()==1&&s["players"][0]["local"]==true&&s["readyPlayers"]==1,"Blind-simple lobby exposes only local row and native-safe aggregate counts");game.blindMode=0;
 NetPlay.players[4].allocated=true;NetPlay.players[4].isSpectator=true;selectedPlayer=4;s=mpRoomSnapshot(true);
 check(mpMobileRoomGeneration()==generation&&s["localPlayer"]==4&&s["permissions"]["canReady"]==false&&s["permissions"]["canPlay"]==true,"Spectator-only own slot retains generation and official auto-ready policy");
 RoomMessage m;m.text="Actual system message";for(unsigned i=0;i<120;++i)mpMobileRoomMessage(m);
 check(mpRoomMessages.size()==100&&mpRoomMessages.back()["seq"]==120,"Actual native message feed is sequenced and bounded");
 auto sender=std::make_shared<PlayerReference>();sender->index=1;m.sender=sender;m.type=RoomMessagePlayer;m.text="Actual player message";mpMobileRoomMessage(m);
 check(mpRoomMessages.back()["playerId"]==1&&mpRoomMessages.back()["name"]=="Player1","Actual player messages carry native display identity");
 mpMobileRoomLifecycle(false);check(mpMobileRoomGeneration().empty()&&mpRoomMessages.empty()&&mpRoomResults.empty(),"Room exit clears messages, pending input and dedupe session");
 mpMobileRoomLifecycle(true);check(mpMobileRoomGeneration()!=generation,"Rejoin gets a distinct generation");

 selectedPlayer=1;game.blindMode=0;downloaded=true;
 WzMap::MapPreviewImage image;image.width=3;image.height=2;image.imageData={0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,255};
 mpMobileMapPreviewBegin();mpMobileMapPreviewCapture(image);auto preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="ready"&&preview["width"]==3&&preview["height"]==2&&preview["channels"]==3,"Actual native RGB dimensions and channels are exported uncropped");
 std::ifstream rgb("/tmp/mp-mobile-room-preview.rgb",std::ios::binary);std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(rgb)),{});rgb.close();
 check(bytes==image.imageData,"Exported file preserves every actual RGB byte and row order");
 const auto firstRevision=mpRoomPreviewRevision;mpMobileMapPreviewCapture(image);
 check(mpRoomPreviewRevision==firstRevision,"Repeated identical native previews reuse one binary revision");
 check(preview["generation"]==mpRoomGeneration&&preview["mapHash"]==game.hash.toString(),"Preview metadata identifies actual room generation and map hash");
 game.hash.value="downloaded-custom-map-hash";preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="loading"&&mpRoomPreviewPixels.empty()&&!std::ifstream("/tmp/mp-mobile-room-preview.rgb"),"Changed hash invalidates a same-named prior map and its RGB file");
 image.imageData[0]=245;mpMobileMapPreviewCapture(image);preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="ready"&&preview["mapHash"]=="downloaded-custom-map-hash"&&mpRoomPreviewPixels[0]==245,"Downloaded custom-map pixels are captured without map-name thumbnail lookup");
 NetPlay.players[1].colour++;preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="loading"&&mpRoomPreviewPixels.empty(),"Changed player colour mapping invalidates stale preview pixels");mpMobileMapPreviewCapture(image);
 NetPlay.players[1].position=3;preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="loading","Changed start-position mapping invalidates stale preview pixels");mpMobileMapPreviewCapture(image);
 downloaded=false;preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="loading"&&preview["reason"]=="Downloading map / mods"&&mpRoomPreviewPixels.empty(),"Incomplete custom-map download cannot expose a previous ready image");
 mpMobileMapPreviewCapture(image);check(mpRoomPreviewStatus=="loading"&&mpRoomPreviewPixels.empty(),"Capture during download is rejected");downloaded=true;mpMobileMapPreviewCapture(image);
 game.blindMode=1;preview=mpMobileMapPreviewSnapshot(mpRoomGeneration);
 check(preview["status"]=="blind"&&mpRoomPreviewPixels.empty()&&preview["file"]=="","Blind-simple client rooms fail closed and remove exported pixels");
 mpMobileMapPreviewCapture(image);check(mpRoomPreviewStatus=="blind"&&mpRoomPreviewPixels.empty(),"Hidden native map cannot be exported through capture");game.blindMode=0;
 image.width=0;mpMobileMapPreviewCapture(image);check(mpRoomPreviewStatus=="unavailable","Zero image dimensions are rejected");
 image.width=257;mpMobileMapPreviewCapture(image);check(mpRoomPreviewStatus=="unavailable","Oversized native image is rejected before copying");
 image.width=3;image.channels=4;mpMobileMapPreviewCapture(image);check(mpRoomPreviewStatus=="unavailable","Non-RGB native image is rejected");
 image.channels=3;image.imageData.pop_back();mpMobileMapPreviewCapture(image);check(mpRoomPreviewStatus=="unavailable","Incomplete RGB byte count is rejected");image.imageData.push_back(255);
 mpMobileMapPreviewCapture(image);mpMobileMapPreviewUnavailable();check(mpRoomPreviewStatus=="unavailable"&&mpRoomPreviewPixels.empty(),"Official empty/question-mark fallback does not become an exported map image");
 mpMobileMapPreviewCapture(image);mpMobileRoomLifecycle(false);check(mpRoomPreviewPixels.empty()&&!std::ifstream("/tmp/mp-mobile-room-preview.rgb"),"Actual room exit removes cached RGB and preview file");

 std::cout<<nlohmann::json(passed).dump();return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
