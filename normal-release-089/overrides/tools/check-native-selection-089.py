"""Execute the actual extracted0.89 C++ render/frame helpers with host fixtures."""
from pathlib import Path
import argparse,json,subprocess
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/native-089'

HEAD=r'''
#include <vector>
#include <set>
#include <array>
#include <string>
#include <tuple>
#include <cassert>
#include <iostream>
#include <nlohmann/json.hpp>
using UDWORD=unsigned;using PIELIGHT=int;
#define PERCENT(a,b) ((a)*100/(b))
constexpr int REPAIRLEV_HIGH=66,REPAIRLEV_LOW=33;
constexpr int WZCOL_BLACK=1,WZCOL_HEALTH_HIGH=2,WZCOL_HEALTH_HIGH_SHADOW=3,WZCOL_HEALTH_MEDIUM=4,WZCOL_HEALTH_MEDIUM_SHADOW=5,WZCOL_HEALTH_LOW=6,WZCOL_HEALTH_LOW_SHADOW=7,WZCOL_WHITE=8,WZCOL_RELOAD_BACKGROUND=9,WZCOL_LBLUE=10;
struct DROID{unsigned id=0,body=100,originalBody=100;int shieldPoints=-1;bool selected=false,transport=false,selectable=true;struct{int nStat=0;}asWeaps[1];struct{unsigned screenR=20;int screenX=100,screenY=100;}sDisplay;bool isTransporter()const{return transport;}};
static int droidGetMaxShieldPoints(const DROID*){return 100;}
static bool isSelectable(const DROID*d){return d->selectable;}
struct Rect{long long a,b,c,d;int color;size_t group=0;bool operator==(const Rect&o)const{return std::tie(a,b,c,d,color,group)==std::tie(o.a,o.b,o.c,o.d,o.color,o.group);}};
static Rect PIERECT_DrawRequest(long long a,long long b,long long c,long long d,int color){return{a,b,c,d,color,0};}
struct BatchedMultiRectRenderer{std::vector<Rect>rects;void addRect(Rect r,size_t g=0){r.group=g;rects.push_back(r);}};
'''
HEALTH_TEST=r'''
int main(){unsigned cases=0;for(bool selected:{false,true})for(bool box:{false,true})for(unsigned body:{10u,50u,100u})for(int shield:{-1,0,50}){
 DROID d;d.selected=selected;d.body=body;d.shieldPoints=shield;BatchedMultiRectRenderer before,after;
 original(&d,box,before,3);updated(&d,box,after,3);
 auto expected=before.rects;if(selected){auto first=box?4:0;expected.erase(expected.begin()+first,expected.begin()+first+3);}
 assert(after.rects==expected);assert(d.selected==selected&&d.body==body&&d.shieldPoints==shield);++cases;
}std::cout<<"{\"passed\":true,\"cases\":"<<cases<<",\"selectedHorizontalRectanglesRemoved\":3,\"unselectedCornersShieldsPreserved\":true}";}
'''
FRAME_STUB=r'''
constexpr unsigned MAX_PLAYERS=4;constexpr int GS_NORMAL=1,INT_NORMAL=0;
unsigned selectedPlayer=0,realSelectedPlayer=0,gameTime=1000,realTime=1000;bool gameInitialised=true;
int mode=GS_NORMAL,intMode=INT_NORMAL;bool video=false,paused=false,updatePaused=false,InGameOpUp=false,popup=false,bLoadSaveUp=false,help=false;
bool&isInGamePopupUp=popup;
int GetGameMode(){return mode;}bool loop_GetVideoStatus(){return video;}bool gamePaused(){return paused;}bool gameUpdatePaused(){return updatePaused;}bool intHelpOverlayIsUp(){return help;}
struct{struct P{bool isSpectator=false;};std::array<P,MAX_PLAYERS>players;}NetPlay;
std::array<std::vector<DROID*>,MAX_PLAYERS>apsDroidLists;
struct ProbeFile{};ProbeFile handle;std::string scratch,published;
ProbeFile*probeOpen(const char*,const char*){scratch.clear();return &handle;}
size_t probeWrite(const void*p,size_t a,size_t b,ProbeFile*){scratch.append(static_cast<const char*>(p),a*b);return b;}
int probeClose(ProbeFile*){return 0;}int probeRename(const char*,const char*){published=scratch;return 0;}
#define FILE ProbeFile
#define fopen probeOpen
#define fwrite probeWrite
#define fclose probeClose
#define rename probeRename
'''
FRAME_TEST=r'''
int main(){DROID a,b,c,d,e;a.id=9;b.id=2;c.id=4;d.id=7;e.id=11;for(auto*p:{&a,&b,&c,&d,&e})p->selected=true;
 a.asWeaps[0].nStat=b.asWeaps[0].nStat=c.asWeaps[0].nStat=d.asWeaps[0].nStat=1;c.selectable=false;d.transport=true;apsDroidLists[0]={&a,&b,&c,&d,&e};
 normalMobileCombatSelectionFrame();auto s=nlohmann::json::parse(published);assert(s["schemaVersion"]==89&&s["playing"]==true&&s["worldSafe"]==true);
 assert(s["combatSelection"]["combatIds"]==nlohmann::json::array({2,9}));assert(s["combatSelection"]["selectedIds"]==nlohmann::json::array({2,4,7,9,11}));
 auto f=s["frame"].get<uint64_t>();realTime+=100;normalMobileCombatSelectionFrame();s=nlohmann::json::parse(published);assert(s["frame"].get<uint64_t>()>f&&s["realTime"]==1100);
 for(unsigned reason=0;reason<4;++reason){if(reason==0)mode=0;if(reason==1)gameInitialised=false;if(reason==2)realSelectedPlayer=1;if(reason==3)NetPlay.players[0].isSpectator=true;
 normalMobileCombatSelectionFrame();s=nlohmann::json::parse(published);assert(s["playing"]==false&&s["worldSafe"]==false&&s["combatSelection"]["combatIds"].empty()&&s["combatSelection"]["selectedIds"].empty());
 mode=GS_NORMAL;gameInitialised=true;realSelectedPlayer=0;NetPlay.players[0].isSpectator=false;}
 for(bool*p:{&video,&paused,&updatePaused,&InGameOpUp,&popup,&bLoadSaveUp,&help}){*p=true;normalMobileCombatSelectionFrame();s=nlohmann::json::parse(published);assert(s["playing"]==true&&s["worldSafe"]==false);*p=false;}
 intMode=1;normalMobileCombatSelectionFrame();assert(nlohmann::json::parse(published)["worldSafe"]==false);intMode=0;
 selectedPlayer=MAX_PLAYERS;normalMobileCombatSelectionFrame();s=nlohmann::json::parse(published);assert(s["playing"]==false&&s["combatSelection"]["selectedIds"].empty());
 for(auto*p:{&a,&b,&c,&d,&e})assert(p->selected);
 std::cout<<"{\"passed\":true,\"exactEligibilityAndSortedIds\":true,\"noncombatSelectedIdsRetained\":true,\"outsideOwnedWorldEmpty\":true,\"menuPauseVideoFailClosed\":true,\"readOnly\":true}";}
'''
def extract_health(text):
 start=text.index('static void queueDroidPowerBarsRects(DROID *psDroid, bool drawBox, BatchedMultiRectRenderer& batchedMultiRectRenderer, size_t rectGroup)\n{')
 return text[start:text.index('\nstatic void queueDroidEnemyHealthBarsRects',start)]
def main():
 p=argparse.ArgumentParser();p.add_argument('--json-include',type=Path,default=Path('/home/punkech/wz-blueprint-20261107/source/3rdparty/json/include'));a=p.parse_args()
 tests=OUT/'checks';tests.mkdir(parents=True,exist_ok=True);report={}
 for family in ['offline','multiplayer']:
  old=(OUT/'bootstrap'/family/'source/src/display3d.cpp').read_text();new=(OUT/'source'/family/'src/display3d.cpp').read_text()
  source=HEAD+extract_health(old).replace('queueDroidPowerBarsRects','original')+extract_health(new).replace('queueDroidPowerBarsRects','updated')+HEALTH_TEST
  file=tests/(family+'-health.cpp');file.write_text(source);exe=tests/(family+'-health')
  subprocess.run(['g++','-std=c++17','-O2','-I',str(a.json_include),str(file),'-o',str(exe)],check=True)
  report[family+'Health']=json.loads(subprocess.check_output([str(exe)],text=True))
 text=(OUT/'source/offline/src/hci.cpp').read_text();helper=text[text.index('// BEGIN NORMAL089_READONLY_COMBAT_SELECTION'):text.index('// END NORMAL089_READONLY_COMBAT_SELECTION')]
 file=tests/'offline-frame.cpp';file.write_text(HEAD+FRAME_STUB+helper+FRAME_TEST);exe=tests/'offline-frame'
 subprocess.run(['g++','-std=c++17','-O2','-D__EMSCRIPTEN__','-I',str(a.json_include),str(file),'-o',str(exe)],check=True)
 report['offlineFrame']=json.loads(subprocess.check_output([str(exe)],text=True));report['actualGameOrAndroidRun']=False
 (tests/'source-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
