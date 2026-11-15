
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>
const unsigned MAX_PLAYERS=11;
enum Mode { GS_TITLE_SCREEN, GS_NORMAL };
Mode mode=GS_NORMAL; Mode GetGameMode(){return mode;}
bool gameInitialised=true,mpMobileLoading=false,mpMobileViewReady=true;
unsigned selectedPlayer=0,realSelectedPlayer=0;
struct Player { bool isSpectator=false; };
struct Network { std::vector<Player> players=std::vector<Player>(23); } NetPlay;
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


int main(){
 std::vector<std::string> checks;
 auto check=[&](bool ok,const char *name){if(!ok)throw std::runtime_error(name);checks.emplace_back(name);};
 bool all=true;
 for(unsigned p=0;p<MAX_PLAYERS;++p){selectedPlayer=realSelectedPlayer=p;all=all&&mpMobileCanIssueOrders()&&!mpMobileOwner().spectator;}
 check(all,"Every actual normal human player retains owned UI capability");
 all=true;
 for(unsigned p=MAX_PLAYERS;p<23;++p){selectedPlayer=realSelectedPlayer=p;NetPlay.players[p].isSpectator=true;all=all&&!mpMobileCanIssueOrders()&&mpMobileOwner().spectator;}
 check(all,"All reserved observer slots including actual fixture14 reject owned context and orders");
 selectedPlayer=2;realSelectedPlayer=14;
 check(mpMobileOwner().spectator&&!mpMobileCanIssueOrders(),"Observer watching player2 cannot acquire that player's owned UI");
 selectedPlayer=realSelectedPlayer=3;NetPlay.players[3].isSpectator=true;
 check(mpMobileOwner().spectator&&!mpMobileCanIssueOrders(),"In-game spectator flag on a playable index rejects commands");
 selectedPlayer=2;realSelectedPlayer=3;
 check(!mpMobileCanIssueOrders(),"Flagged spectator remains read-only after changing viewed player");
 NetPlay.players[3].isSpectator=false;selectedPlayer=realSelectedPlayer=0;
 check(mpMobileCanIssueOrders(),"Returning to an actual own non-observer identity restores capability");
 selectedPlayer=1;
 check(!mpMobileCanIssueOrders(),"Normal human cannot use another viewed player's ownership either");
 selectedPlayer=realSelectedPlayer=24;
 check(mpMobileOwner().spectator&&!mpMobileCanIssueOrders(),"Missing real native slot fails closed without array access");
 realSelectedPlayer=0;
 check(!mpMobileCanIssueOrders(),"Missing viewed native slot fails closed without array access");
 selectedPlayer=realSelectedPlayer=0;NetPlay.players[0].isSpectator=true;
 check(!mpMobileCanIssueOrders(),"Authoritative real-player spectator flag outranks an in-range index");
 NetPlay.players[0].isSpectator=false;gameInitialised=false;
 check(!mpMobileCanIssueOrders(),"Uninitialized world cannot create a private owner VM");gameInitialised=true;
 mpMobileLoading=true;check(!mpMobileCanIssueOrders(),"Native loading blocks owner requests");mpMobileLoading=false;
 mpMobileViewReady=false;check(!mpMobileCanIssueOrders(),"Owner capability waits for actual rendered native view");mpMobileViewReady=true;
 mode=GS_TITLE_SCREEN;check(!mpMobileCanIssueOrders(),"Waiting room cannot issue game orders");mode=GS_NORMAL;
 check(mpMobileCanIssueOrders(),"All normal world-ready gates preserve existing player capability");
 std::cout<<nlohmann::json(checks).dump();
}
