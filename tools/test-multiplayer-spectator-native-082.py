"""Execute the actual082 owned-UI capability helper in host C++, not gameplay.
Also verify every private owner dispatch is gated and the080 simulation prefix,
room bridge, camera implementation, protocol and data inputs remain frozen.
"""
from pathlib import Path
import hashlib, json, os, re, subprocess

ROOT=Path(__file__).resolve().parents[1]; QA=ROOT/'qa/multiplayer-spectator-082'
NATIVE=ROOT/'vendor/multiplayer/native-082'; OLD=ROOT/'vendor/multiplayer/native-080'
QA.mkdir(parents=True,exist_ok=True)
text=(NATIVE/'mobile-ui-native.cpp.inc').read_text()
start=text.index('// BEGIN MP_MOBILE_OWNER_CAPABILITY')
end=text.index('// BEGIN MP_COMBAT_SELECTION_POLICY')
helper=text[start:end]
harness=r'''
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
HELPER
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
'''.replace('HELPER',helper)
(QA/'native-capability-host.cpp').write_text(harness,newline='\n')
linux_root=str(ROOT).replace('\\','/')
if os.name=='nt':linux_root='/mnt/'+linux_root[0].lower()+linux_root[2:]
command=['bash','-lc','g++ -std=c++17 -O0 -I/home/punkech/wz-mp-070/source/3rdparty/json/include '+linux_root+'/qa/multiplayer-spectator-082/native-capability-host.cpp -o /tmp/mp-spectator-capability-082 && /tmp/mp-spectator-capability-082']
if os.name=='nt':command=['wsl','-d','Ubuntu-24.04','--']+command
result=subprocess.run(command,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
if result.returncode:raise SystemExit(result.stderr or result.stdout)
checks=json.loads(result.stdout)
def function(source,name):
    begin=source.index(name);brace=source.index('{',begin);depth=1;i=brace+1
    while depth:
        if source[i]=='{':depth+=1
        elif source[i]=='}':depth-=1
        i+=1
    return source[begin:i]
assert 'const bool world=mpMobileCanIssueOrders();' in function(text,'static void mpMobileCombatIntent()\n{')
assert 'const bool allowed=mpMobileCanIssueOrders();' in function(text,'static void mpMobileInput()\n{')
assert 'if(!mpMobileOwner().ownsViewedPlayer)return reports;' in function(text,'static nlohmann::json mpMobileReports()')
assert 'if(!mpMobileCanIssueOrders())return true;' in function(text,'bool mpMobileObjectSelected(')
assert 'if(player()!=selectedPlayer||!mpMobileCanIssueOrders())return false;' in function(text,'bool quickjs_scripting_instance::initializeMultiplayerUI(')
assert 'if(player()!=selectedPlayer||!mpMobileCanIssueOrders())return;' in function(text,'void quickjs_scripting_instance::tickMultiplayerUI()')
checks.append('Actual native combat/input/facility/report/VM initializer and tick dispatches use owner capability')
frame=function(text,'void mpMobileFrame()')
assert 'mpMobileCombatFrame(canIssueOrders,safe&&canIssueOrders)' in frame
assert 'if(canIssueOrders&&!mpMobileVM)' in frame and 'if(canIssueOrders&&mpMobileVM&&' in frame
assert 'if(!canIssueOrders&&mpMobileVM){mpMobileUIContext=nullptr;mpMobileVM.reset();' in frame
assert 'mpMobileEvents.clear();++mpMobileEventSerial;' in frame
checks.append('Observer transition disposes stale owner VM/events and cannot continue private queues or combat selection')
old_text=(OLD/'mobile-ui-native.cpp.inc').read_text()
assert function(text,'static void mpMobileCamera()')==function(old_text,'static void mpMobileCamera()')
assert 'const bool world=GetGameMode()==GS_NORMAL&&gameInitialised&&!mpMobileLoading&&mpMobileViewReady;' in frame
assert '{"cameraSafe",safe}' in frame and '{"worldReady",world}' in frame and 'mpMobileTerrain();' in frame
checks.append('Actual camera helper and view/render readiness remain byte-identical and independent of ownership')
for field in ['realPlayer','spectator','canIssueOrders','cameraSafe']:assert '{"'+field+'",' in frame
assert '{"power",canIssueOrders?getPower(selectedPlayer):0}' in frame
checks.append('Native snapshot exports actual real/view identity, observer state, camera safety and owner capability')
for name in ['main_sdl.cpp','multiint.cpp','hci.cpp','display3d.cpp','wrappers.cpp','mobile-room-native.cpp.inc','mobile-room-map-preview.cpp.inc','mobile-ui-bootstrap.js','autorevision.cache','netplay_config.h','upstream-tags.txt']:
    assert (NATIVE/name).read_bytes()==(OLD/name).read_bytes(),name
marker='// Client-side mobile UI context for the official 4.7 multiplayer engine.'
assert (NATIVE/'quickjs_backend.cpp').read_text().split(marker)[0]==(OLD/'quickjs_backend.cpp').read_text().split(marker)[0]
checks.append('All080 non-owner bridge code, official QJS APIs, room/blind privacy, camera hooks and protocol inputs are frozen')
q=(NATIVE/'quickjs_backend.cpp').read_text();registered=re.search(r'const std::set<std::string> registered=\{([^\n]+)\};',q).group(1)
assert q.split(marker)[0]+text.replace('MP_REGISTERED_FUNCTIONS',registered)==q
assert hashlib.sha256((ROOT/'app/src/main/assets/multiplayer/warzone2100.data').read_bytes()).hexdigest()=='9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424'
checks.append('Generated native QJS body exactly composes reviewed helper and retains frozen multiplayer data bytes')
paths=['tools/test-multiplayer-spectator-native-082.py','tools/prepare-multiplayer-native-082.py','tools/build-multiplayer-native-082.py','tools/integrate-multiplayer-native-082.py','vendor/multiplayer/native-082/mobile-ui-native.cpp.inc','vendor/multiplayer/native-082/quickjs_backend.cpp']
proof={'version':'0.82','passed':True,'emulatorUsed':False,'actualNativeEngineExecuted':False,
       'actualHostCppHelperExecuted':True,'checks':checks,'checksPassed':len(checks),
       'sources':[{'path':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest()} for p in paths]}
(QA/'native-checks.json').write_text(json.dumps(proof,indent=2))
print(json.dumps({'passed':True,'checksPassed':len(checks),'scope':'Actual capability helper in host C++; dispatch/preservation source assertions. No gameplay.'}))
