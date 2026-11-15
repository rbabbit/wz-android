"""Compile and exercise the actual079 room helper with recording native seams.

This is a host C++ harness, not a network/game/emulator test. Official request
functions are recording stubs; their source call sites and unchanged protocol
are checked separately. Run with Windows Python (WSL compiler) or WSL Python.
"""
from pathlib import Path
import hashlib, json, os, subprocess

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/multiplayer-room-079'
QA.mkdir(parents=True,exist_ok=True)
HARNESS=r'''
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
constexpr unsigned MAX_CONNECTED_PLAYERS=6;
constexpr int AI_CLOSED=-2, MAX_CONSOLE_STRING_LENGTH=255, MULTIOP_CHATBOX=1;
constexpr int LEV_LOW=0,LEV_MED=1,LEV_HI=2,CAMP_CLEAN=0,CAMP_BASE=1,CAMP_WALLS=2;
constexpr int ALLIANCES=1,ALLIANCES_TEAMS=2,ALLIANCES_UNSHARED=3;
constexpr int NO_SCAVENGERS=0,SCAVENGERS=1,ULTIMATE_SCAVENGERS=2,MPFLAGS_NO_VTOLS=4;
#define LOBBY_COMMAND_PREFIX "/"
struct Player {std::string name;unsigned position=0,team=0,colour=0;bool allocated=false,ready=false,isSpectator=false;int ai=AI_CLOSED;};
struct {std::array<Player,6> players;bool isHost=false,bComms=true;unsigned hostPlayer=0;} NetPlay;
struct {std::string name="Actual room",map="Actual map";unsigned maxPlayers=4;int power=2,base=1,alliance=2,scavengers=0,techLevel=1,blindMode=0;} game;
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
#define __EMSCRIPTEN__ 1
#include "ROOM_INCLUDE"
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
 std::cout<<nlohmann::json(passed).dump();return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
'''

linux_root='/mnt/c/timerApp/wz-towers-lab'
text=HARNESS.replace('ROOM_INCLUDE',linux_root+'/vendor/multiplayer/native-079/mobile-room-native.cpp.inc')
(QA/'native-host-harness.cpp').write_text(text,newline='\n')
command=['bash','-lc','g++ -std=c++17 -O0 -I/home/punkech/wz-mp-070/source/3rdparty/json/include '+linux_root+'/qa/multiplayer-room-079/native-host-harness.cpp -o /tmp/mp-room-native-079-host && /tmp/mp-room-native-079-host']
if os.name=='nt':command=['wsl','-d','Ubuntu-24.04','--']+command
result=subprocess.run(command,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
if result.returncode:raise SystemExit(result.stderr or result.stdout)
checks=json.loads(result.stdout)
native=ROOT/'vendor/multiplayer/native-079'
bridge=(native/'mobile-room-native.cpp.inc').read_text()
multi=(native/'multiint.cpp').read_text()
old=ROOT/'vendor/multiplayer/native-071'
for name in ['main_sdl.cpp','hci.cpp','display3d.cpp','wrappers.cpp','mobile-ui-bootstrap.js','netplay_config.h','autorevision.cache']:
 assert (native/name).read_bytes()==(old/name).read_bytes(),name
checks.append('All071 non-room overlays and protocol/autorevision/bootstrap bytes remain identical')
assert multi.count('mpMobileRoomMessage(message);')==1
assert multi.count('mobile-room-native.cpp.inc')==1
assert 'sendReadyRequest(static_cast<UBYTE>(selectedPlayer),target)' in bridge
assert 'SendTeamRequest(static_cast<UBYTE>(selectedPlayer)' in bridge
assert 'SendPlayerSlotTypeRequest(selectedPlayer,target)' in bridge
assert 'sendRoomChatMessage(text.c_str(),mode != "enabled")' in bridge
checks.append('One native message hook and official Ready/team/spectator/chat request call sites are retained')
paths=['tools/test-multiplayer-room-native-079.py','vendor/multiplayer/native-079/mobile-room-native.cpp.inc','vendor/multiplayer/native-079/mobile-ui-native.cpp.inc','vendor/multiplayer/native-079/multiint.cpp','vendor/multiplayer/native-079/quickjs_backend.cpp','tools/prepare-multiplayer-native-079.py','tools/build-multiplayer-native-079.py','tools/integrate-multiplayer-native-079.py']
proof={'version':'0.79','passed':True,'emulatorUsed':False,'actualNativeEngineExecuted':False,'actualHostCppHelperExecuted':True,'nativeNetworkHandlersStubbed':True,'checks':checks,'checksPassed':len(checks),'sources':[{'path':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest()}for p in paths]}
(QA/'native-checks.json').write_text(json.dumps(proof,indent=2))
print(json.dumps({'passed':True,'checksPassed':len(checks),'scope':'Actual room helper in host C++; official request seams stubbed, no gameplay/network/emulator execution'}))
