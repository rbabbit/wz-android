
#include <cassert>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <iostream>
#include <nlohmann/json.hpp>
enum {DROID_CONSTRUCT=1,DROID_CYBORG_CONSTRUCT=2,DROID_WEAPON=3,WD_UNITS_LOST=4,WD_UNITS_KILLED=5,ID_SOUND_UNIT_DESTROYED=6,UNIT_LOST_DELAY=7,MAX_PLAYERS=8};
struct DROID{unsigned id;char aName[128];int droidType;unsigned player;struct {int x,y,z;}pos;};
unsigned gameTime=123400,selectedPlayer=0;int stockNotices=0,lost=0,killed=0,sounds=0;bool marker=false;char markerContent='1';
FILE*fixtureOpen(const char*path,const char*){assert(std::string(path)=="/tmp/warzone-towers-ui-v34");return marker?fmemopen(&markerContent,1,"r"):nullptr;}
const char*objInfo(const DROID*d){return d->aName;}
void scoreUpdateVar(int value){if(value==WD_UNITS_LOST)++lost;else if(value==WD_UNITS_KILLED)++killed;else assert(false);}
void audio_QueueTrackMinDelayPos(int,int,int,int,int){++sounds;}
bool aiCheckAlliances(unsigned,unsigned){return false;}
#define CONPRINTF(...) (++stockNotices)
#define _(x) x
#define fopen fixtureOpen
#if defined(__EMSCRIPTEN__)
#include <nlohmann/json.hpp>

// Only the custom Towers UI consumes this notice. Campaign, Duel and ordinary
// native builds retain their stock console notice, score and loss sound.
static bool towersUnitLossNoticeEnabled()
{
    FILE *file = fopen("/tmp/warzone-towers-ui-v34", "rb");
    if (!file) return false;
    const bool enabled = fgetc(file) == '1';
    fclose(file);
    return enabled;
}

static void towersUnitLossNotice(const DROID *droid)
{
    const nlohmann::json notice = {
        {"kind", "unit-lost"}, {"id", droid->id}, {"name", droid->aName},
        {"constructor", droid->droidType == DROID_CONSTRUCT || droid->droidType == DROID_CYBORG_CONSTRUCT},
        {"player", droid->player}, {"gameTime", gameTime}
    };
    const std::string packet = notice.dump(-1, ' ', false, nlohmann::json::error_handler_t::replace);
    fprintf(stderr, "BNNOTICE:%s\n", packet.c_str());
}
#endif


void fatalLoss(DROID*psDroid){		// Deal with score increase/decrease and messages to the player
		if (psDroid->player == selectedPlayer)
		{
#if defined(__EMSCRIPTEN__)
			if (towersUnitLossNoticeEnabled()) towersUnitLossNotice(psDroid);
			else
#endif
			{
				// TRANSLATORS: Refers to the loss of a single unit, known by its name
				CONPRINTF(_("%s Lost!"), objInfo(psDroid));
			}
			scoreUpdateVar(WD_UNITS_LOST);
			audio_QueueTrackMinDelayPos(ID_SOUND_UNIT_DESTROYED, UNIT_LOST_DELAY,
										psDroid->pos.x, psDroid->pos.y, psDroid->pos.z);
		}
		// only counts as a kill if it's not our ally
		else if (selectedPlayer < MAX_PLAYERS && !aiCheckAlliances(psDroid->player, selectedPlayer))
		{
			scoreUpdateVar(WD_UNITS_KILLED);
		}
}
#undef fopen
int main(){
 DROID d{42,"initial",DROID_CONSTRUCT,0,{1,2,3}};
 std::strcpy(d.aName,"Truck \"Viper\"\nWheels \xc2\xa3");
 marker=false;fatalLoss(&d);assert(stockNotices==1&&lost==1&&sounds==1);
 marker=true;markerContent='0';fatalLoss(&d);assert(stockNotices==2&&lost==2&&sounds==2);
 markerContent='1';fatalLoss(&d);
#if defined(__EMSCRIPTEN__)
 assert(stockNotices==2);
#else
 assert(stockNotices==3);
#endif
 d.id=43;d.droidType=DROID_CYBORG_CONSTRUCT;fatalLoss(&d);
 d.id=44;d.droidType=DROID_WEAPON;std::strcpy(d.aName,"Tank");fatalLoss(&d);
 d.id=45;d.player=1;fatalLoss(&d);assert(lost==5&&sounds==5&&killed==1);
 std::cout<<"caller score/audio preserved, marker and stock branches passed\n";
}
