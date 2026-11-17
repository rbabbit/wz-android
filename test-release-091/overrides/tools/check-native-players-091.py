"""Compile/exercise actual roster/navigation helper with disclosed native-read stubs."""
from pathlib import Path
import json,hashlib,subprocess
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/native-091'
HEAD=r'''
#include "mobile-players-policy-v91.h"
#include <nlohmann/json.hpp>
#include <cstdio>
#include <set>
#include <string>
#include <vector>
#include <iostream>
#include <cassert>
constexpr unsigned MAX_PLAYERS=11,MAX_CONNECTED_PLAYERS=23,PING_LIMIT=4000;
enum class LEVEL_TYPE{CAMPAIGN,SKIRMISH};enum class AIDifficulty{DISABLED,HUMAN,EASY};
enum class BodyClass{Tank,Cyborg};enum WEAPON_SUBCLASS{WSC_A,WSC_B,WSC_NUM_WEAPON_SUBCLASSES};
enum CONNECTION_STATUS{CONNECTIONSTATUS_PLAYER_DROPPED,CONNECTIONSTATUS_PLAYER_LEAVING,CONNECTIONSTATUS_DESYNC,CONNECTIONSTATUS_WAITING_FOR_PLAYER};
constexpr int INT_NORMAL=0,INT_INTELMAP=2;
struct P{char name[128]{};int position=-1,ai=-1,team=0;AIDifficulty difficulty=AIDifficulty::DISABLED;bool allocated=false,isSpectator=false,heartbeat=true;};
struct {std::vector<P>players=std::vector<P>(23);bool bComms=true;unsigned hostPlayer=0;}NetPlay;
struct {LEVEL_TYPE type=LEVEL_TYPE::SKIRMISH;unsigned maxPlayers=4;int alliance=1;}game;
struct {unsigned PingTimes[23]{};}ingame;
struct DROID{unsigned visible[11]{};};struct STRUCTURE{unsigned visible[11]{};};
std::vector<DROID*>apsDroidLists[11];std::vector<STRUCTURE*>apsStructLists[11];
struct Stats{uint32_t recentScore=uint32_t(-10),recentKills=7;uint64_t recentPowerLost=9007199254740993ULL,recentPowerWon=2,recentResearchPotential=4,recentResearchPerformance=3;};
Stats statistics[11];unsigned selectedPlayer=0,realSelectedPlayer=0,gameTime=100,realTime=1000;
bool bMultiPlayer=true,bLoadSaveUp=false,InGameOpUp=false,isInGamePopupUp=false,Cheated=false,MultiMenuUp=false;
bool replay=false,specOpen=false,blind=false,video=false;int intMode=INT_NORMAL;unsigned opens=0,closes=0;std::string level="map";
bool NETisReplay(){return replay;}bool loop_GetVideoStatus(){return video;}bool isBlindPlayerInfoState(){return blind;}
const char*getLevelName(){return level.c_str();}bool alliancesSetTeamsBeforeGame(int a){return a==1;}
bool aiCheckAlliances(unsigned a,unsigned b){return a==b||(a==0&&b==2);}
bool mobileSpectatorStatsOpenV91(){return specOpen;}
void specStatsViewClose(){specOpen=false;++closes;}void specStatsViewCreate(){specOpen=true;++opens;}
bool intCloseMultiMenu(){MultiMenuUp=false;++closes;return true;}bool intAddMultiMenu(){MultiMenuUp=true;++opens;return true;}
const char*getPlayerName(unsigned id,bool nonHost){assert(nonHost);return blind?"Alpha":NetPlay.players[id].name[0]?NetPlay.players[id].name:"Commander";}
unsigned getPlayerColour(unsigned id){return id<11?id:0;}
struct Color{struct{unsigned char r,g,b;}byte;};Color pal_GetTeamColour(unsigned id){return{{(unsigned char)id,2,3}};}
bool NETcheckPlayerConnectionStatus(CONNECTION_STATUS,unsigned){return false;}
const Stats&getMultiStats(unsigned id){return statistics[id];}unsigned getNumDroids(unsigned id){return 10+id;}
unsigned getNumTransporterDroids(unsigned){return 1;}int getPower(unsigned id){return 100+id;}
std::string getApproxPowerGeneratedPerSecForDisplay(unsigned){return "+7";}
unsigned getNumWeaponImpactClassUpgrades(unsigned id,WEAPON_SUBCLASS cl){return cl==WSC_A?id+1:0;}
unsigned getNumBodyClassArmourUpgrades(unsigned,BodyClass c){return c==BodyClass::Tank?2:3;}
unsigned getNumBodyClassThermalArmourUpgrades(unsigned,BodyClass c){return c==BodyClass::Tank?4:5;}
const char*getWeaponSubClassDisplayName(WEAPON_SUBCLASS,bool){return "Machinegun";}
'''
TEST=r'''
nlohmann::json read(const char*path){FILE*f=fopen(path,"rb");assert(f);std::string s;char b[4096];size_t n;while((n=fread(b,1,sizeof(b),f)))s.append(b,n);fclose(f);return nlohmann::json::parse(s);}
void request(std::string nonce,std::string context,std::string action){const auto s=nlohmann::json{{"nonce",nonce},{"context",context},{"action",action}}.dump();FILE*f=fopen("warzone-players-nav-v91.json","wb");fwrite(s.data(),1,s.size(),f);fclose(f);}
int main(){unsigned checks=0;
 mobilePlayersFrameV91(false);auto p=read("warzone-players-v91.json");assert(!p["ready"]&&p["players"].empty());++checks;
 for(unsigned i:{0u,1u,2u,3u,13u}){NetPlay.players[i].position=i;std::snprintf(NetPlay.players[i].name,128,"Name%u",i);}
 NetPlay.players[0].allocated=true;NetPlay.players[0].difficulty=AIDifficulty::HUMAN;
 for(unsigned i:{1u,2u}){NetPlay.players[i].ai=0;NetPlay.players[i].difficulty=AIDifficulty::EASY;}
 NetPlay.players[3].difficulty=AIDifficulty::HUMAN;
 NetPlay.players[13].allocated=true;NetPlay.players[13].isSpectator=true;
 mobilePlayersFrameV91(true);p=read("warzone-players-v91.json");assert(p["players"].size()==4&&p["spectators"].size()==1&&p["spectators"][0]["id"]==13);++checks;
 assert(p["viewer"]["ownsViewedPlayer"]&&p["capabilities"]["legacyPlayers"]&&!p["capabilities"]["fullSpectatorStats"]);++checks;
 assert(p["players"][1]["stats"]["units"].is_null()&&p["players"][1]["stats"]["power"].is_null()&&p["players"][1]["stats"]["structures"].is_null());
 assert(p["players"][0]["stats"]["power"]==100&&p["players"][2]["stats"]["units"]==13&&p["players"][2]["stats"]["structures"].is_null());++checks;
 assert(p["players"][0]["stats"]["score"]==-10&&p["players"][3]["kind"]=="former-human"&&p["players"][3]["connectionState"]=="former");++checks;
 const auto first=p["frame"];realTime+=999;mobilePlayersFrameV91(true);assert(read("warzone-players-v91.json")["frame"]==first);realTime++;mobilePlayersFrameV91(true);assert(read("warzone-players-v91.json")["frame"]!=first);++checks;
 blind=true;realTime+=1000;mobilePlayersFrameV91(true);p=read("warzone-players-v91.json");assert(p["players"][0]["name"]=="Alpha");blind=false;++checks;
 realSelectedPlayer=selectedPlayer=13;mobilePlayersFrameV91(true);p=read("warzone-players-v91.json");const auto specContext=p["context"].get<std::string>();
 assert(p["viewer"]["role"]=="spectator"&&!p["viewer"]["canIssueOrders"]&&p["capabilities"]["fullSpectatorStats"]&&!p["capabilities"]["legacyPlayers"]);++checks;
 auto details=p["players"][1]["observerDetails"];assert(details["powerRate"]=="+7"&&details["powerLost"]=="9007199254740993"&&details["labUsePercent"]==75.0&&details["weaponGrades"].size()==1&&details["kineticArmor"]["tank"]==2);++checks;
 NetPlay.players[0].isSpectator=true;realTime+=1000;mobilePlayersFrameV91(true);p=read("warzone-players-v91.json");
 assert(p["players"][0]["state"]=="spectating"&&p["players"][0]["kind"]=="human"&&p["players"][0]["allocated"]&&p["players"][0]["connectionState"]=="connected"&&p["players"][0]["observerDetails"].is_object()&&p["spectators"].size()==2);NetPlay.players[0].isSpectator=false;++checks;
 request("bad",specContext,"legacy-players");mobilePlayersFrameV91(true);assert(!read("warzone-players-nav-result-v91.json")["ok"]&&!MultiMenuUp);++checks;
 request("open",specContext,"legacy-spectator-stats");mobilePlayersFrameV91(true);assert(read("warzone-players-nav-result-v91.json")["ok"]&&specOpen);const auto count=opens;mobilePlayersFrameV91(true);assert(opens==count);++checks;
 request("close",specContext,"close");mobilePlayersFrameV91(true);assert(read("warzone-players-nav-result-v91.json")["ok"]&&!specOpen);++checks;
 request("stale","old","legacy-spectator-stats");mobilePlayersFrameV91(true);assert(read("warzone-players-nav-result-v91.json")["reason"]=="stale-context"&&!specOpen);++checks;
 selectedPlayer=0;mobilePlayersFrameV91(true);p=read("warzone-players-v91.json");assert(!p["capabilities"]["fullSpectatorStats"]&&p["players"][0]["observerDetails"].is_null()&&!p["viewer"]["ownsViewedPlayer"]);++checks;
 mobilePlayersFrameV91(false);p=read("warzone-players-v91.json");assert(!p["ready"]&&p["context"]==""&&p["players"].empty()&&p["spectators"].empty());++checks;
 NetPlay.bComms=false;realSelectedPlayer=selectedPlayer=0;game.type=LEVEL_TYPE::CAMPAIGN;DROID hidden;apsDroidLists[1]={&hidden};
 mobilePlayersFrameV91(true);p=read("warzone-players-v91.json");assert(p["mode"]=="campaign"&&p["players"].size()==1&&p["players"][0]["team"].is_null()&&p["spectators"].empty());++checks;
 NetPlay.players[0].name[0]=0;realTime+=1000;mobilePlayersFrameV91(true);assert(read("warzone-players-v91.json")["players"][0]["name"]=="Commander");++checks;
 hidden.visible[0]=255;realTime+=1000;mobilePlayersFrameV91(true);p=read("warzone-players-v91.json");assert(p["players"].size()==2&&p["players"][1]["kind"]=="scenario"&&p["players"][1]["stats"]["units"].is_null());hidden.visible[0]=0;realTime+=1000;mobilePlayersFrameV91(true);assert(read("warzone-players-v91.json")["players"].size()==2);++checks;
 std::snprintf(NetPlay.players[0].name,128,"Broken%c",char(0xff));realTime+=1000;mobilePlayersFrameV91(true);p=read("warzone-players-v91.json");assert(p["players"][0]["name"].get<std::string>().find("\xef\xbf\xbd")!=std::string::npos);++checks;
 game.type=LEVEL_TYPE::SKIRMISH;level="another-map";mobilePlayersFrameV91(true);p=read("warzone-players-v91.json");
#ifdef MOBILE_PLAYERS_SCENARIO91
 assert(p["mode"]=="offline-scenario"&&p["players"].size()==1&&p["players"][0]["team"].is_null());
#else
 assert(p["mode"]=="offline-skirmish"&&p["players"].size()==3&&p["players"][1]["kind"]=="ai");
#endif
 ++checks;
 replay=true;realSelectedPlayer=selectedPlayer=13;mobilePlayersFrameV91(true);p=read("warzone-players-v91.json");assert(p["mode"]=="replay"&&!p["viewer"]["canIssueOrders"]&&p["spectators"].empty());++checks;
 std::cout<<"{\"checks\":"<<checks<<",\"passed\":true,\"actualExtractedHelper\":true}";
}
'''
def main():
 checks=OUT/'checks';checks.mkdir(parents=True,exist_ok=True);header=OUT/'source/common/mobile-players-v91.h'
 body='\n'.join(line for line in header.read_text().splitlines()if not line.startswith(('#include','#pragma'))).replace('/tmp/','')
 source=checks/'players-helper.cpp';source.write_text(HEAD+body+TEST);results={}
 for variant in ['generic','towers']:
  exe=checks/('players-'+variant);cmd=['g++','-std=c++17','-O2','-I',str(OUT/'source/common'),'-I','/home/punkech/wz-blueprint-20261107/source/3rdparty/json/include']
  if variant=='towers':cmd.append('-DMOBILE_PLAYERS_SCENARIO91=1')
  subprocess.run(cmd+[str(source),'-o',str(exe)],check=True)
  folder=checks/('fixture-'+variant);folder.mkdir(exist_ok=True)
  results[variant]=json.loads(subprocess.check_output([str(exe)],cwd=folder,text=True))
 report=dict(passed=True,actualAndroidRun=False,nativeReadAndMenuCallsStubbed=True,sourceSHA256=hashlib.sha256(header.read_bytes()).hexdigest(),variants=results,
  scope='Actual extracted native roster/navigation helper, visibility/capability and JSON serialization; exact APK/runtime remains separate')
 (checks/'source-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
