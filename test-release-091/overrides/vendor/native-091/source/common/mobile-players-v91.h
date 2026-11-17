#pragma once
#include "mobile-players-policy-v91.h"
#include "ai.h"
#include "component.h"
#include "hci.h"
#include "levels.h"
#include "loop.h"
#include "multimenu.h"
#include "multiplay.h"
#include "multistat.h"
#include "power.h"
#include "research.h"
#include "spectatorwidgets.h"
#include "stats.h"
#include "lib/ivis_opengl/piepalette.h"
#include "lib/netplay/netreplay.h"
#include <nlohmann/json.hpp>
#include <cstdio>
#include <set>
#include <string>
#include <vector>

extern bool mobileSpectatorStatsOpenV91();
extern void specStatsViewClose();
using PlayersJsonV91=nlohmann::json;
static std::string mobilePlayersContextV91,mobilePlayersSignatureV91,mobilePlayersNavNonceV91;
static std::set<uint32_t> mobilePlayersDiscoveredV91;
static uint64_t mobilePlayersContextSerialV91=0,mobilePlayersFrameSerialV91=0;
static uint32_t mobilePlayersLastGameV91=0,mobilePlayersLastPublishV91=0;
static bool mobilePlayersWorldV91=false,mobilePlayersPublishedV91=false;

static std::string mobilePlayersTextV91(const char *text)
{
 return text?std::string(text).substr(0,160):std::string();
}
static bool mobilePlayersWriteV91(const char *path,const PlayersJsonV91 &value)
{
 try
 {
  // Replace malformed/truncated UTF8 instead of letting a player name abort a frame.
  const auto data=value.dump(-1,' ',false,PlayersJsonV91::error_handler_t::replace);
  const auto temporary=std::string(path)+".tmp";FILE *file=fopen(temporary.c_str(),"wb");if(!file)return false;
  const bool good=fwrite(data.data(),1,data.size(),file)==data.size();fclose(file);
  return good&&rename(temporary.c_str(),path)==0;
 }
 catch(const std::exception &){return false;}
}
static PlayersJsonV91 mobilePlayersMenuV91()
{
 return {{"players",MultiMenuUp},{"spectatorStats",mobileSpectatorStatsOpenV91()}};
}
static void mobilePlayersNavigationV91(bool world,const MobilePlayersCapabilitiesV91 &cap)
{
 FILE *file=fopen("/tmp/warzone-players-nav-v91.json","rb");if(!file)return;
 char bytes[1025];const auto length=fread(bytes,1,sizeof(bytes),file);fclose(file);if(length>1024)return;
 const auto request=PlayersJsonV91::parse(bytes,bytes+length,nullptr,false);if(!request.is_object())return;
 for(const char *key:{"nonce","context","action"})
  if(!request.contains(key)||!request[key].is_string()||request[key].get<std::string>().size()>160)return;
 const auto nonce=request["nonce"].get<std::string>(),context=request["context"].get<std::string>(),action=request["action"].get<std::string>();
 if(nonce.empty()||nonce==mobilePlayersNavNonceV91)return;mobilePlayersNavNonceV91=nonce;
 PlayersJsonV91 result={{"nonce",nonce},{"context",context},{"action",action},{"ok",false},{"reason",""}};
 const bool safe=world&&!loop_GetVideoStatus()&&!bLoadSaveUp&&!InGameOpUp&&!isInGamePopupUp;
 if(!safe)result["reason"]="world-not-ready";
 else if(context.empty()||context!=mobilePlayersContextV91)result["reason"]="stale-context";
 else if(action=="legacy-players")
 {
  if(!cap.legacyPlayers)result["reason"]="native-menu-not-allowed";
  else{if(!MultiMenuUp)intAddMultiMenu();result["ok"]=MultiMenuUp;if(!MultiMenuUp)result["reason"]="native-menu-not-open";}
 }
 else if(action=="legacy-spectator-stats")
 {
  if(!cap.legacyStats)result["reason"]="native-stats-not-allowed";
  else{specStatsViewCreate();result["ok"]=mobileSpectatorStatsOpenV91();if(!mobileSpectatorStatsOpenV91())result["reason"]="native-stats-not-open";}
 }
 else if(action=="close")
 {
  if(MultiMenuUp)intCloseMultiMenu();if(mobileSpectatorStatsOpenV91())specStatsViewClose();
  result["ok"]=!MultiMenuUp&&!mobileSpectatorStatsOpenV91();
 }
 else result["reason"]="unknown-action";
 result["nativeMenu"]=mobilePlayersMenuV91();mobilePlayersWriteV91("/tmp/warzone-players-nav-result-v91.json",result);
}
static bool mobilePlayersVisibleSideV91(unsigned side,unsigned viewer)
{
 if(viewer>=MAX_PLAYERS)return false;
 for(const DROID *droid:apsDroidLists[side])if(droid->visible[viewer]>0)return true;
 for(const STRUCTURE *structure:apsStructLists[side])if(structure->visible[viewer]>0)return true;
 return false;
}
static void mobilePlayersFrameV91(bool world)
{
 const bool valid=world&&selectedPlayer<NetPlay.players.size()&&realSelectedPlayer<NetPlay.players.size();
 const bool replay=NETisReplay(),network=NetPlay.bComms&&!replay,campaign=game.type==LEVEL_TYPE::CAMPAIGN;
#ifdef MOBILE_PLAYERS_SCENARIO91
 const bool scenario=true;
#else
 const bool scenario=false;
#endif
 const bool viewedSpec=valid&&NetPlay.players[selectedPlayer].isSpectator,realSpec=valid&&NetPlay.players[realSelectedPlayer].isSpectator;
 const auto cap=mobilePlayersCapabilitiesV91(valid,replay,selectedPlayer,realSelectedPlayer,NetPlay.players.size(),MAX_PLAYERS,viewedSpec,realSpec,bMultiPlayer,intMode==INT_INTELMAP);
 const std::string mode=replay?"replay":network?"multiplayer":campaign?"campaign":scenario?"offline-scenario":"offline-skirmish";
 const std::string signature=mode+":"+std::to_string(selectedPlayer)+":"+std::to_string(realSelectedPlayer)+":"+std::to_string(viewedSpec)+":"+std::to_string(realSpec)+":"+std::to_string(isBlindPlayerInfoState())+":"+mobilePlayersTextV91(getLevelName());
 const bool changed=valid&&(!mobilePlayersWorldV91||signature!=mobilePlayersSignatureV91||gameTime<mobilePlayersLastGameV91);
 if(changed)
 {
  mobilePlayersContextV91="players91:"+std::to_string(realTime)+":"+std::to_string(++mobilePlayersContextSerialV91);
  mobilePlayersSignatureV91=signature;mobilePlayersDiscoveredV91.clear();mobilePlayersNavNonceV91.clear();mobilePlayersPublishedV91=false;
 }
 const bool lost=!valid&&mobilePlayersWorldV91;
 if(!valid){mobilePlayersContextV91.clear();mobilePlayersSignatureV91.clear();mobilePlayersDiscoveredV91.clear();}
 mobilePlayersWorldV91=valid;mobilePlayersLastGameV91=gameTime;
 mobilePlayersNavigationV91(valid,cap);
 if(!changed&&!lost&&mobilePlayersPublishedV91&&(!valid||uint32_t(realTime-mobilePlayersLastPublishV91)<1000))return;
 PlayersJsonV91 packet={{"schemaVersion",91},{"context",mobilePlayersContextV91},{"frame",++mobilePlayersFrameSerialV91},
  {"gameTime",gameTime},{"realTime",realTime},{"ready",valid},{"mode",mode},
  {"viewer",{{"realPlayer",realSelectedPlayer},{"viewedPlayer",selectedPlayer},
   {"role",replay?"replay":realSpec?"spectator":cap.owns?(network?"player":"local"):"view-only"},
   {"ownsViewedPlayer",cap.owns},{"canIssueOrders",cap.owns}}},
  {"capabilities",{{"readOnly",true},{"teamMode",!campaign&&!scenario&&alliancesSetTeamsBeforeGame(game.alliance)},
   {"fullSpectatorStats",cap.fullStats},{"legacyPlayers",cap.legacyPlayers},{"legacySpectatorStats",cap.legacyStats}}},
  {"players",PlayersJsonV91::array()},{"spectators",PlayersJsonV91::array()},{"nativeMenu",mobilePlayersMenuV91()}};
 if(valid)
 {
  std::vector<unsigned> sides;
  for(unsigned id=0;id<MAX_PLAYERS&&id<NetPlay.players.size();++id)
  {
   const auto &p=NetPlay.players[id];const bool ai=!p.allocated&&p.ai>=0&&p.difficulty!=AIDifficulty::DISABLED;
   const bool former=(network||replay)&&!p.allocated&&p.difficulty==AIDifficulty::HUMAN;
   const bool self=cap.owns&&id==realSelectedPlayer,ally=cap.owns&&aiCheckAlliances(realSelectedPlayer,id);
   bool include=false;
   if(!network&&!replay&&(campaign||scenario))
   {
    if(mobilePlayersVisibleSideV91(id,realSelectedPlayer))mobilePlayersDiscoveredV91.insert(id);
    include=mobilePlayersScenarioRowV91(self,ally,!apsDroidLists[id].empty()||!apsStructLists[id].empty(),mobilePlayersDiscoveredV91.count(id));
   }
   else include=mobilePlayersNetworkRowV91(id,game.maxPlayers,MAX_PLAYERS,
    p.isSpectator&&!(p.allocated||ai||former),p.allocated,ai,former);
   if(include)sides.push_back(id);
  }
  std::vector<WEAPON_SUBCLASS> weaponColumns;
  if(cap.fullStats)for(int cl=0;cl<WSC_NUM_WEAPON_SUBCLASSES;++cl)
  {
   const auto sub=static_cast<WEAPON_SUBCLASS>(cl);bool present=false;
   for(unsigned id:sides)if(getNumWeaponImpactClassUpgrades(id,sub)>0){present=true;break;}
   if(present)weaponColumns.push_back(sub);
  }
  auto row=[&](unsigned id,bool spectator)
  {
   const auto &p=NetPlay.players[id];const bool playable=id<MAX_PLAYERS;
   const bool ai=playable&&!p.allocated&&p.ai>=0&&p.difficulty!=AIDifficulty::DISABLED;
   const bool former=network&&!p.allocated&&p.difficulty==AIDifficulty::HUMAN;
   const bool self=cap.owns&&id==realSelectedPlayer,ally=cap.owns&&playable&&aiCheckAlliances(realSelectedPlayer,id);
   const auto access=mobilePlayersStatsAccessV91(cap.fullStats,cap.owns,self,ally,network);
   const std::string kind=spectator?"spectator":replay?(p.difficulty==AIDifficulty::HUMAN||p.allocated?"recorded-human":"recorded-ai"):
    self?"local":network?(former?"former-human":p.allocated?"human":"ai"):ai&&!scenario&&!campaign?"ai":"scenario";
   PlayersJsonV91 color=nullptr,colorIndex=nullptr;
   if(playable){const auto index=getPlayerColour(id);if(index<16){const auto c=pal_GetTeamColour(index);colorIndex=index;color=PlayersJsonV91::array({c.byte.r,c.byte.g,c.byte.b});}}
   PlayersJsonV91 flags=PlayersJsonV91::array(),connection=nullptr;
   if(network&&p.allocated)
   {
    for(const auto &item:std::vector<std::pair<CONNECTION_STATUS,const char*>>{{CONNECTIONSTATUS_PLAYER_DROPPED,"dropped"},{CONNECTIONSTATUS_PLAYER_LEAVING,"leaving"},{CONNECTIONSTATUS_DESYNC,"desync"},{CONNECTIONSTATUS_WAITING_FOR_PLAYER,"waiting"}})
     if(NETcheckPlayerConnectionStatus(item.first,id))flags.push_back(item.second);
    connection=p.heartbeat?"connected":"unresponsive";
   }
   else if(former)connection="former";
   PlayersJsonV91 stats={{"score",nullptr},{"kills",nullptr},{"units",nullptr},{"structures",nullptr},{"power",nullptr},{"pingMs",nullptr}},details=nullptr;
   if(playable&&!spectator)
   {
    const auto &st=getMultiStats(id);
    if(!(Cheated&&NetPlay.bComms))stats["score"]=static_cast<int32_t>(st.recentScore);stats["kills"]=st.recentKills;
    if(access.units)stats["units"]=getNumDroids(id)+getNumTransporterDroids(id);
    if(access.structures)stats["structures"]=apsStructLists[id].size();
    if(access.power)stats["power"]=getPower(id);
    if(network&&p.allocated&&id!=realSelectedPlayer&&ingame.PingTimes[id]<PING_LIMIT)stats["pingMs"]=ingame.PingTimes[id];
    if(cap.fullStats)
    {
     details={{"power",getPower(id)},{"powerRate",getApproxPowerGeneratedPerSecForDisplay(id)},
      {"powerLost",std::to_string(st.recentPowerLost)},{"powerWon",std::to_string(st.recentPowerWon)},
      {"labUsePercent",st.recentResearchPotential?PlayersJsonV91(100.0*st.recentResearchPerformance/st.recentResearchPotential):PlayersJsonV91(nullptr)},
      {"kills",st.recentKills},{"units",getNumDroids(id)+getNumTransporterDroids(id)},
      {"kineticArmor",{{"tank",getNumBodyClassArmourUpgrades(id,BodyClass::Tank)},{"cyborg",getNumBodyClassArmourUpgrades(id,BodyClass::Cyborg)}}},
      {"thermalArmor",{{"tank",getNumBodyClassThermalArmourUpgrades(id,BodyClass::Tank)},{"cyborg",getNumBodyClassThermalArmourUpgrades(id,BodyClass::Cyborg)}}},
      {"weaponGrades",PlayersJsonV91::array()}};
     for(const auto cl:weaponColumns)details["weaponGrades"].push_back({{"id",static_cast<int>(cl)},{"name",mobilePlayersTextV91(getWeaponSubClassDisplayName(cl,true))},{"grade",getNumWeaponImpactClassUpgrades(id,cl)}});
    }
   }
   return PlayersJsonV91{{"id",id},{"position",p.position>=0?PlayersJsonV91(p.position):PlayersJsonV91(nullptr)},
    {"name",mobilePlayersTextV91(getPlayerName(id,true))},
    {"kind",kind},{"state",spectator?"spectator":replay?"recorded":p.isSpectator?(p.allocated?"spectating":"inactive"):former?"former":kind=="scenario"?"scenario":"active"},
    {"allocated",p.allocated},{"human",network&&p.allocated},{"ai",ai},{"spectator",p.isSpectator},
    {"local",id==realSelectedPlayer},{"viewed",id==selectedPlayer},{"host",network&&id==NetPlay.hostPlayer},
    {"team",!p.isSpectator&&!campaign&&!scenario&&alliancesSetTeamsBeforeGame(game.alliance)&&p.team>=0&&p.team<MAX_PLAYERS?PlayersJsonV91(p.team):PlayersJsonV91(nullptr)},
    {"colorIndex",colorIndex},{"colorRGB",color},
    {"relationship",replay||realSpec?"observer":self?"self":cap.owns?(ally?"ally":"opponent"):"unknown"},
    {"connectionState",connection},{"connectionFlags",flags},{"stats",stats},{"observerDetails",details}};
  };
  for(unsigned id:sides)packet["players"].push_back(row(id,false));
  if(network)for(unsigned id=0;id<NetPlay.players.size()&&id<MAX_CONNECTED_PLAYERS;++id)
   if(NetPlay.players[id].isSpectator&&NetPlay.players[id].allocated)packet["spectators"].push_back(row(id,true));
 }
 if(mobilePlayersWriteV91("/tmp/warzone-players-v91.json",packet))
 {mobilePlayersLastPublishV91=realTime;mobilePlayersPublishedV91=true;}
}
