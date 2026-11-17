"""Exercise the actual offline one-shot constructor helper with native-call stubs."""
from pathlib import Path
import argparse,hashlib,json,runpy,subprocess
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/native-090'
HEAD=r'''
#include "mobile-combat-latch-v90.h"
#include <nlohmann/json.hpp>
#include <cassert>
#include <cstdio>
#include <iostream>
enum {DROID_CONSTRUCT=1,DROID_CYBORG_CONSTRUCT=2,DROID_WEAPON=3};
struct DROID{uint32_t id;int droidType;bool selected,selectable,visible;};
std::vector<DROID*> apsDroidLists[2];unsigned selectedPlayer=0,selectionCalls=0,refreshes=0;
bool refuseSelection=false;
bool isSelectable(const DROID*d){return d->selectable;}
bool objectOnScreen(const DROID*d,int){return d->visible;}
void SelectDroid(DROID*d,bool){++selectionCalls;if(!refuseSelection)d->selected=true;}
void DeSelectDroid(DROID*d){++selectionCalls;d->selected=false;}
void intRefreshScreen(){++refreshes;}void triggerEventSelected(){}
MobileCombatLatchV90 normalMobileCombatPolicyV90;
'''
TEST=r'''
int main(){unsigned checks=0;auto&p=normalMobileCombatPolicyV90;
 DROID a{10,DROID_CONSTRUCT,false,true,true},b{11,DROID_CYBORG_CONSTRUCT,false,true,true},
 hidden{12,DROID_CONSTRUCT,false,true,false},blocked{13,DROID_CONSTRUCT,false,false,true},tank{20,DROID_WEAPON,true,true,true};
 apsDroidLists[0]={&a,&b,&hidden,&blocked,&tank};p.observeWorld(true,0,1,1);
 assert(p.intent(true,true,"hold","activation",p.context,false));
 auto req=[&](std::string nonce,std::string ctx,std::string act,std::string intent,std::string action="select-visible-trucks"){
  const auto data=nlohmann::json{{"nonce",nonce},{"context",ctx},{"activation",act},{"combatIntentNonce",intent},{"action",action}}.dump();
  FILE*f=fopen("constructor-request.json","wb");assert(f);fwrite(data.data(),1,data.size(),f);fclose(f);};
 req("valid",p.context,p.activation,p.requestNonce);normalMobileConstructorFrameV90(true,true);
 assert(normalMobileConstructorAckV90["ok"]&&normalMobileConstructorAckV90["selectedIds"]==nlohmann::json({10,11}));
 assert(a.selected&&b.selected&&!hidden.selected&&!blocked.selected&&!tank.selected&&selectionCalls==3);++checks;
 const auto calls=selectionCalls;normalMobileConstructorFrameV90(true,true);assert(selectionCalls==calls);++checks;
 req("context","old",p.activation,p.requestNonce);normalMobileConstructorFrameV90(true,true);assert(normalMobileConstructorAckV90["reason"]=="stale-context"&&selectionCalls==calls);++checks;
 req("activation",p.context,"old",p.requestNonce);normalMobileConstructorFrameV90(true,true);assert(normalMobileConstructorAckV90["reason"]=="stale-combat-intent"&&selectionCalls==calls);++checks;
 req("new-intent",p.context,p.activation,p.requestNonce);assert(p.intent(false,true,"off",p.activation,p.context,true));normalMobileConstructorFrameV90(true,true);assert(normalMobileConstructorAckV90["reason"]=="stale-combat-intent"&&selectionCalls==calls);++checks;
 req("unsafe",p.context,p.activation,p.requestNonce);normalMobileConstructorFrameV90(true,false);assert(normalMobileConstructorAckV90["reason"]=="not-world-safe"&&selectionCalls==calls);++checks;
 req("not-owned",p.context,p.activation,p.requestNonce);normalMobileConstructorFrameV90(false,true);assert(normalMobileConstructorAckV90["reason"]=="not-world-safe"&&selectionCalls==calls);++checks;
 assert(p.intent(false,false,"resume",p.activation,p.context,false));req("not-held",p.context,p.activation,p.requestNonce);normalMobileConstructorFrameV90(true,true);assert(normalMobileConstructorAckV90["reason"]=="selection-not-held"&&selectionCalls==calls);++checks;
 assert(p.intent(false,true,"off-hold",p.activation,p.context,false));a.selected=b.selected=false;tank.selected=true;
 req("off-valid",p.context,p.activation,p.requestNonce);normalMobileConstructorFrameV90(true,true);assert(normalMobileConstructorAckV90["ok"]&&a.selected&&b.selected&&!tank.selected&&!p.enabled);++checks;
 req("unknown",p.context,p.activation,p.requestNonce,"invalid");normalMobileConstructorFrameV90(true,true);assert(normalMobileConstructorAckV90["reason"]=="unknown-action");++checks;
 a.selected=false;refuseSelection=true;req("verify",p.context,p.activation,p.requestNonce);normalMobileConstructorFrameV90(true,true);assert(!normalMobileConstructorAckV90["ok"]&&normalMobileConstructorAckV90["reason"]=="selection-not-applied");++checks;
 p.observeWorld(false,0,2,2);normalMobileConstructorFrameV90(false,false);assert(normalMobileConstructorAckV90["context"]!=p.context||!normalMobileConstructorAckV90["ok"]);++checks;
 std::remove("constructor-request.json");std::cout<<"{\"passed\":true,\"constructorChecks\":"<<checks<<",\"actualExtractedHelper\":true,\"engineAndAndroidRun\":false}";
}
'''
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--json-include',type=Path,default=Path('/home/punkech/wz-blueprint-20261107/source/3rdparty/json/include'));a=p.parse_args()
 source=OUT/'source/offline/src/hci.cpp';text=source.read_text();start=text.index('// A separate one-shot mailbox');end=text.index('// This hook runs for every main frame',start)
 helper=text[start:end].replace('/tmp/warzone-constructor-selection-v90.json','constructor-request.json')
 assert text.index('normalMobileCombatIntentV90();')<text.index('normalMobileConstructorFrameV90(playing,safe);')<text.index('normalMobileCombatPolicyV90.reconcile(units,safe)')
 tests=OUT/'checks';tests.mkdir(exist_ok=True);cpp=tests/'constructors.cpp';exe=tests/'constructors';cpp.write_text(HEAD+helper+TEST)
 subprocess.run(['g++','-std=c++17','-O2','-I',str(a.json_include),'-I',str(OUT/'source/common'),str(cpp),'-o',str(exe)],check=True)
 result=json.loads(subprocess.check_output([str(exe)],cwd=tests,text=True));result.update(sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),combatIntentBeforeConstructorBeforeReconcile=True,scope='Actual one-shot native helper; native selection/render calls stubbed, exact APK runtime remains required')
 (tests/'constructor-checks.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
