#pragma once
// Read-only roster/visibility policy. No engine state or gameplay operations.
#include <cstdint>
struct MobilePlayersCapabilitiesV91
{
 bool owns=false,fullStats=false,legacyPlayers=false,legacyStats=false;
};
static MobilePlayersCapabilitiesV91 mobilePlayersCapabilitiesV91(bool world,bool replay,
 uint32_t viewed,uint32_t real,uint32_t slots,uint32_t playable,bool viewedSpec,bool realSpec,
 bool multiPlayer,bool intelMap)
{
 const bool valid=world&&viewed<slots&&real<slots;
 const bool owns=valid&&!replay&&viewed==real&&real<playable&&!viewedSpec&&!realSpec;
 const bool full=valid&&viewedSpec&&realSpec;
 return {owns,full,owns&&multiPlayer&&!intelMap,full};
}
static bool mobilePlayersNetworkRowV91(uint32_t id,uint32_t maxPlayers,uint32_t playable,
 bool spectator,bool allocated,bool enabledAI,bool formerHuman)
{
 return id<maxPlayers&&id<playable&&!spectator&&(allocated||enabledAI||formerHuman);
}
static bool mobilePlayersScenarioRowV91(bool self,bool ally,bool presence,bool discovered)
{
 return self||(ally&&presence)||discovered;
}
struct MobilePlayersStatsAccessV91 {bool units,structures,power;};
static MobilePlayersStatsAccessV91 mobilePlayersStatsAccessV91(bool full,bool owned,bool self,bool ally,bool network)
{
 return {full||(owned&&(self||ally)),full||(!network&&owned&&(self||ally)),full||(owned&&self)};
}
