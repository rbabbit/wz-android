
#include <nlohmann/json.hpp>
#include <cstdint>
#include <iostream>
#include <vector>
constexpr unsigned REPAIRLEV_LOW=50,REPAIRLEV_HIGH=75,TILE_UNITS=128;
enum SECONDARY_STATE{DSS_REPLEV_NEVER,DSS_REPLEV_LOW,DSS_REPLEV_HIGH};
enum SECONDARY_ORDER{DSO_REPAIR_LEVEL};enum QUEUE_MODE{ModeImmediate,ModeQueue};
enum DroidOrderType{DORDER_NONE=0,DORDER_STOP=1,DORDER_MOVE=2,DORDER_RTB=13,DORDER_RTR=14,DORDER_GUARD=25,DORDER_REARM=32,DORDER_RTR_SPECIFIED=35};
enum DROID_ACTION{DACTION_NONE=0,DACTION_WAITFORREPAIR=26,DACTION_MOVETOREPAIRPOINT=27,DACTION_WAITDURINGREPAIR=28,
 DACTION_MOVETOREARM=32,DACTION_WAITFORREARM=33,DACTION_MOVETOREARMPOINT=34,DACTION_WAITDURINGREARM=35,DACTION_CLEARREARMPAD=37};
struct Vec{int x=0,y=0,z=0;};struct Obj{uint32_t id=0;};
struct DROID{uint32_t id=0,body=205,originalBody=205,player=0;struct{unsigned nStat=1;}asWeaps[1];
 bool selected=false,selectable=true,transport=false;Vec pos;
 struct{DroidOrderType type=DORDER_GUARD;Obj*psObj=nullptr;Vec pos;}order;
 DROID_ACTION action=DACTION_NONE;SECONDARY_STATE actual=DSS_REPLEV_NEVER,queued=DSS_REPLEV_NEVER;
 unsigned queueCalls=0,stopCalls=0;bool supports=true;bool isTransporter()const{return transport;}};
bool isSelectable(const DROID*d){return d->selectable;}
SECONDARY_STATE secondaryGetState(const DROID*d,SECONDARY_ORDER,QUEUE_MODE mode=ModeImmediate){return mode==ModeQueue?d->queued:d->actual;}
bool secondarySetState(DROID*d,SECONDARY_ORDER,SECONDARY_STATE value,QUEUE_MODE mode){
 if(mode!=ModeQueue){std::cerr<<"Policy bypassed synchronized orders";std::exit(2);}if(!d->supports)return false;
 d->queued=value;++d->queueCalls;return true;}
#include "mobile-repair-policy-v93.h"
#include "mobile-combat-latch-v93.h"
nlohmann::json checks=nlohmann::json::array();
void check(bool ok,const char*name){if(!ok){std::cerr<<"FAILED: "<<name<<"\n";std::exit(1);}checks.push_back(name);}
void synced(std::vector<DROID*>&units){for(auto*d:units)d->actual=d->queued;}

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
namespace offlineKey{
MappableFunction kf_OrderDroid(const DroidOrderType order)
{
	return [order]() {
		/* not supported if a spectator */
		SPECTATOR_NO_OP();

		for (DROID* psDroid : apsDroidLists[selectedPlayer])
		{
			if (psDroid->selected && (order != DORDER_STOP || !mobileCombatProtectsV93(psDroid)))
			{
				orderDroid(psDroid, order, ModeQueue);
			}
		}
		intRefreshOrder();
	};
}


}
namespace mpKey{
MappableFunction kf_OrderDroid(const DroidOrderType order)
{
	return [order]() {
		/* not supported if a spectator */
		SPECTATOR_NO_OP();

		for (DROID* psDroid : apsDroidLists[selectedPlayer])
		{
			if (psDroid->selected && (order != DORDER_STOP || !mobileCombatProtectsV93(psDroid)))
			{
				orderDroid(psDroid, order, ModeQueue);
			}
		}
		intRefreshOrder();
	};
}


}

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
