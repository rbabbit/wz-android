"""Exercise actual UI STOP and keyboard dispatch after a stale selection ACK.

Native droid/network APIs are explicit stubs. No Android or real-time race claim.
"""
from pathlib import Path
import argparse,hashlib,json,runpy,subprocess
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/native-093'
SETUP=r'''
#include <functional>
void orderDroid(DROID*d,DroidOrderType order,QUEUE_MODE mode){
 if(mode!=ModeQueue){std::cerr<<"Unsynchronized STOP";std::exit(2);}
 ++d->stopCalls;d->order.type=order;d->action=DACTION_NONE;
}
#include "mobile-guarded-stop-v93.h"
using MappableFunction=std::function<void()>;
#define SPECTATOR_NO_OP() do{}while(0)
unsigned selectedPlayer=0;std::vector<DROID*>apsDroidLists[1];
MobileRepairPolicyV93*liveRepair=nullptr;bool liveCombat=true;
bool mobileCombatProtectsV93(const DROID*d){return liveCombat&&liveRepair&&liveRepair->protects(d);}
void intRefreshOrder(){}
'''
TESTS=r'''
int main(){
 MobileRepairPolicyV93 repair;repair.observeContext(true,"world");
 DROID newlyRetreating;newlyRetreating.id=1;newlyRetreating.selected=true;
 DROID ready;ready.id=2;ready.selected=true;
 DROID truck;truck.id=3;truck.selected=true;truck.asWeaps[0].nStat=0;
 DROID foreign;foreign.id=4;foreign.selected=true;foreign.player=1;
 std::vector<DROID*>droids{&newlyRetreating,&ready,&truck,&foreign};
 repair.intent({{"enabled",true},{"nonce","repair-on"},{"context","world"}});
 repair.frame(true,true,droids);synced(droids);repair.frame(true,true,droids);
 check(repair.protectedIds.empty(),"Selection ACK initially contains only healthy commandable units");
 // The actual dispatch reads changed native state without another frame/ACK.
 newlyRetreating.body=153;newlyRetreating.order.type=DORDER_RTR;
 newlyRetreating.action=DACTION_MOVETOREPAIRPOINT;
 MobileGuardedStopV93 stop;
 auto request=[](const char*nonce){return nlohmann::json{{"nonce",nonce},{"context","world"},{"activation","active"}};};
 auto issue=[&](nlohmann::json r,bool safe=true,bool enabled=true){return stop.apply(r,true,safe,enabled,"world","active",0,droids,[&](const DROID*d){return repair.protects(d);});};
 check(issue(request("race")),"New current-context UI STOP is consumed");
 check(newlyRetreating.stopCalls==0&&newlyRetreating.order.type==DORDER_RTR&&newlyRetreating.action==DACTION_MOVETOREPAIRPOINT,
  "An active RTR introduced after the selection ACK is not cancelled by UI STOP");
 check(ready.stopCalls==1&&ready.order.type==DORDER_STOP&&truck.stopCalls==0&&foreign.stopCalls==0,
  "Guarded UI STOP sends a synchronized order only to ready selected owned combat units");
 check(stop.ack["selectedIds"]==nlohmann::json({1,2})&&stop.ack["stoppedIds"]==nlohmann::json({2})&&stop.ack["protectedIds"]==nlohmann::json({1}),
  "ACK reports a complete disjoint stopped/protected selected-unit partition");
 check(!issue(request("race"))&&ready.stopCalls==1,"Duplicate UI STOP cannot issue twice");
 ready.selected=false;newlyRetreating.order.type=DORDER_RTB;repair.enabled=false;
 newlyRetreating.actual=newlyRetreating.queued=DSS_REPLEV_NEVER;
 issue(request("off-trip"));check(newlyRetreating.stopCalls==0&&newlyRetreating.order.type==DORDER_RTB,
  "Repair OFF does not let UI STOP cancel the active damaged RTB");
 check(stop.ack["ok"]==true&&stop.ack["stoppedIds"].empty()&&stop.ack["reason"]=="no-commandable-selection",
  "Zero-ready selection is acknowledged as a harmless no-op");
 newlyRetreating.order.type=DORDER_GUARD;newlyRetreating.action=DACTION_NONE;
 repair.enabled=true;issue(request("threshold"));check(newlyRetreating.stopCalls==0,
  "Threshold crossing before the retreat order is also protected at dispatch");
 newlyRetreating.body=170;repair.protectedIds.insert(1);issue(request("hq-wait"));check(newlyRetreating.stopCalls==0,
  "ON protects a damaged HQ fallback waiter above the retreat threshold");
 newlyRetreating.body=205;issue(request("healed"));check(newlyRetreating.stopCalls==1,
  "Fully healed ready unit can receive UI STOP");
 const auto calls=newlyRetreating.stopCalls;issue(request("unsafe"),false);
 check(stop.ack["ok"]==false&&stop.ack["reason"]=="world-unsafe"&&newlyRetreating.stopCalls==calls,
  "Unsafe UI STOP is rejected without an order");
 issue(request("unsafe"));check(newlyRetreating.stopCalls==calls,"An unsafe request is consumed and cannot execute later");
 auto cancel=request("cancel");cancel["cancel"]=true;issue(cancel,false,false);
 check(stop.ack["ok"]==true&&stop.ack["reason"]=="cancelled"&&newlyRetreating.stopCalls==calls,
  "Cancellation is a consumed no-op even while unsafe or combat is OFF");
 MobileGuardedStopV93 replaced;auto unsent=request("unsent");unsent["cancel"]=true;
 replaced.apply(unsent,true,true,true,"world","active",0,droids,[&](const DROID*d){return repair.protects(d);});
 check(replaced.ack["reason"]=="cancelled"&&!replaced.apply(request("unsent"),true,true,true,"world","active",0,droids,[&](const DROID*d){return repair.protects(d);})&&newlyRetreating.stopCalls==calls,
  "Same-nonce cancellation replaces an unconsumed mailbox request and prevents later STOP replay");
 auto stale=request("stale-context");stale["context"]="previous-world";issue(stale);
 check(stop.ack["reason"]=="stale-context"&&newlyRetreating.stopCalls==calls,"Stale context cannot stop units");
 stale=request("stale-activation");stale["activation"]="retired";issue(stale);
 check(stop.ack["reason"]=="stale-activation"&&newlyRetreating.stopCalls==calls,"Retired combat activation cannot stop units");
 issue(request("off"),true,false);check(stop.ack["reason"]=="combat-off"&&newlyRetreating.stopCalls==calls,
  "ALL COMBAT OFF rejects its old UI stop request");
 stop.apply(request("observer"),false,true,true,"world","active",0,droids,[](const DROID*){return false;});
 check(stop.ack["reason"]=="no-owned-world"&&newlyRetreating.stopCalls==calls,"Observer cannot issue UI STOP");
 // Execute the actual two family keybind functions, not a mirrored predicate.
 liveRepair=&repair;liveCombat=true;apsDroidLists[0]={&newlyRetreating,&ready};ready.selected=true;
 for(auto keyboard:{offlineKey::kf_OrderDroid(DORDER_STOP),mpKey::kf_OrderDroid(DORDER_STOP)}){
  newlyRetreating.body=153;newlyRetreating.order.type=DORDER_RTR;newlyRetreating.action=DACTION_MOVETOREPAIRPOINT;
  const auto damagedCalls=newlyRetreating.stopCalls,readyCalls=ready.stopCalls;
  keyboard();check(newlyRetreating.stopCalls==damagedCalls&&newlyRetreating.order.type==DORDER_RTR&&ready.stopCalls==readyCalls+1,
   "Actual retained-family physical S dispatch skips a newly active RTR but stops the ready unit");
 }
 newlyRetreating.body=205;newlyRetreating.order.type=DORDER_REARM;newlyRetreating.action=DACTION_WAITDURINGREARM;
 const auto rearmCalls=newlyRetreating.stopCalls;offlineKey::kf_OrderDroid(DORDER_STOP)();
 check(newlyRetreating.stopCalls==rearmCalls&&newlyRetreating.order.type==DORDER_REARM,"Physical S also preserves active full-health rearming");
 liveCombat=false;mpKey::kf_OrderDroid(DORDER_STOP)();check(newlyRetreating.stopCalls==rearmCalls+1,
  "Ordinary manual physical STOP remains available when ALL COMBAT is OFF");
 std::cout<<nlohmann::json{{"passed",true},{"checks",checks}}.dump();
}
'''

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--json-include',type=Path,default=Path('/home/punkech/wz-blueprint-20261107/source/3rdparty/json/include'));a=p.parse_args()
 base=runpy.run_path(str(ROOT/'tools/check-native-repair-policy-093.py'))['HEAD'].split('int main(){',1)[0]
 base=base.replace('DORDER_NONE=0,DORDER_MOVE=2','DORDER_NONE=0,DORDER_STOP=1,DORDER_MOVE=2')
 base=base.replace('unsigned queueCalls=0;','unsigned queueCalls=0,stopCalls=0;')
 native=[];rows=[]
 for family,namespace in [('offline','offlineKey'),('multiplayer','mpKey')]:
  path=OUT/'source'/family/'src/keybind.cpp';s=path.read_text();start=s.index('MappableFunction kf_OrderDroid(const DroidOrderType order)')
  block=s[start:s.index('// --------------------------------------------------------------------------',start)]
  assert block.count('order != DORDER_STOP || !mobileCombatProtectsV93(psDroid)')==1
  native.append('namespace '+namespace+'{\n'+block+'\n}\n');rows.append({'family':family,'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 checks=OUT/'checks';checks.mkdir(parents=True,exist_ok=True);source=checks/'guarded-stop-with-native-stubs.cpp'
 source.write_text(base+SETUP+''.join(native)+TESTS);exe=checks/'guarded-stop-with-native-stubs'
 subprocess.run(['g++','-std=c++17','-O2','-I',str(OUT/'source/common'),'-I',str(a.json_include),str(source),'-o',str(exe)],check=True)
 result=json.loads(subprocess.check_output([str(exe)],text=True))
 result.update(actualAndroidRun=False,nativeDroidAndNetworkCallsStubbed=True,staleSelectionThenNativeStateTransition=True,
  extractedActualKeyboardFunctions=rows,helperSHA256=hashlib.sha256((OUT/'source/common/mobile-guarded-stop-v93.h').read_bytes()).hexdigest(),
  scope='Actual shared UI STOP helper and both actual keyboard functions with native APIs stubbed; no physical Android input or real-time race reproduction claim')
 (checks/'guarded-stop-source-checks.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
