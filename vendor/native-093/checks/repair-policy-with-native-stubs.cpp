
#include <nlohmann/json.hpp>
#include <cstdint>
#include <iostream>
#include <vector>
constexpr unsigned REPAIRLEV_LOW=50,REPAIRLEV_HIGH=75,TILE_UNITS=128;
enum SECONDARY_STATE{DSS_REPLEV_NEVER,DSS_REPLEV_LOW,DSS_REPLEV_HIGH};
enum SECONDARY_ORDER{DSO_REPAIR_LEVEL};enum QUEUE_MODE{ModeImmediate,ModeQueue};
enum DroidOrderType{DORDER_NONE=0,DORDER_MOVE=2,DORDER_RTB=13,DORDER_RTR=14,DORDER_GUARD=25,DORDER_REARM=32,DORDER_RTR_SPECIFIED=35};
enum DROID_ACTION{DACTION_NONE=0,DACTION_WAITFORREPAIR=26,DACTION_MOVETOREPAIRPOINT=27,DACTION_WAITDURINGREPAIR=28,
 DACTION_MOVETOREARM=32,DACTION_WAITFORREARM=33,DACTION_MOVETOREARMPOINT=34,DACTION_WAITDURINGREARM=35,DACTION_CLEARREARMPAD=37};
struct Vec{int x=0,y=0,z=0;};struct Obj{uint32_t id=0;};
struct DROID{uint32_t id=0,body=205,originalBody=205,player=0;struct{unsigned nStat=1;}asWeaps[1];
 bool selected=false,selectable=true,transport=false;Vec pos;
 struct{DroidOrderType type=DORDER_GUARD;Obj*psObj=nullptr;Vec pos;}order;
 DROID_ACTION action=DACTION_NONE;SECONDARY_STATE actual=DSS_REPLEV_NEVER,queued=DSS_REPLEV_NEVER;
 unsigned queueCalls=0;bool supports=true;bool isTransporter()const{return transport;}};
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
int main(){
 MobileRepairPolicyV93 p;p.observeContext(true,"world-a");
 DROID low;low.id=1;low.body=153;DROID above;above.id=2;above.body=154;
 DROID healthy;healthy.id=3;DROID truck;truck.id=4;truck.asWeaps[0].nStat=0;
 truck.actual=truck.queued=DSS_REPLEV_HIGH;
 std::vector<DROID*>units{&low,&above,&healthy,&truck};
 p.frame(true,true,units);check(!p.managed&&low.queueCalls==0&&truck.queueCalls==0,"Unmanaged context preserves existing unit/factory settings");
 check(!p.intent({{"enabled",true},{"nonce","old"},{"context","stale"}}),"Stale context cannot enable repair");
 check(p.intent({{"enabled",true},{"nonce","on"},{"context","world-a"}}),"Current owner request accepted");
 p.frame(true,true,units);
 check(p.pending&&!p.applied&&p.pendingIds.size()==3,"ON waits for actual synchronized native levels");
 check(p.protectedIds==std::set<uint32_t>{1},"205HP boundary:153 retreats,154 remains commandable");
 check(low.queued==DSS_REPLEV_LOW&&above.queued==DSS_REPLEV_LOW&&healthy.queued==DSS_REPLEV_LOW,"Medium native secondary setting queued for every combat unit");
 check(truck.queueCalls==0&&truck.actual==DSS_REPLEV_HIGH,"Constructor remains untouched");
 p.frame(true,true,units);check(low.queueCalls==1&&above.queueCalls==1&&healthy.queueCalls==1,"Pending state prevents duplicate queued network orders");
 synced(units);p.frame(true,true,units);check(p.applied&&!p.pending&&p.appliedIds.size()==3,"Initial green ACK requires actual native application");
 low.order.type=DORDER_RTR;low.action=DACTION_WAITFORREPAIR;
 check(p.intent({{"enabled",false},{"nonce","off"},{"context","world-a"}}),"OFF request accepted independently of selection");
 p.frame(true,true,units);synced(units);p.frame(true,true,units);
 check(p.applied&&low.actual==DSS_REPLEV_NEVER&&low.order.type==DORDER_RTR&&p.protectedIds.count(1),"OFF stops future retreats without cancelling active return/queue");
 low.body=205;low.order.type=DORDER_GUARD;low.action=DACTION_NONE;p.frame(true,true,units);
 check(!p.protectedIds.count(1),"Fully repaired and released unit returns to commandable pool");
 p.intent({{"enabled",true},{"nonce","on2"},{"context","world-a"}});p.frame(true,true,units);synced(units);p.frame(true,true,units);
 DROID born;born.id=5;units.push_back(&born);p.frame(true,true,units);
 check(born.queued==DSS_REPLEV_LOW&&p.pendingIds.count(5),"Ordinary newborn is enrolled from native enumeration");
 p.frame(true,true,units);check(born.queueCalls==1,"Newborn synchronization also deduplicates");synced(units);p.frame(true,true,units);
 check(p.appliedIds.count(5)&&p.applied,"Newborn actual Medium state is acknowledged");
 low.body=153;low.order.type=DORDER_RTB;p.frame(true,true,units);low.order.type=DORDER_GUARD;low.body=170;p.frame(true,true,units);
 check(p.protectedIds.count(1),"ON retains damaged HQ/repair trip protection until full restoration");
 low.body=205;p.frame(true,true,units);check(!p.protectedIds.count(1),"Full restoration releases sticky HQ protection");
 healthy.order.type=DORDER_RTB;p.frame(true,true,units);check(!p.protectedIds.count(3),"Healthy ordinary return-to-base is not trapped as repair");
 healthy.order.type=DORDER_REARM;healthy.action=DACTION_WAITDURINGREARM;p.frame(true,true,units);
 check(p.protectedIds.count(3),"Full-health aircraft stays protected while rearming");
 healthy.order.type=DORDER_GUARD;healthy.action=DACTION_CLEARREARMPAD;p.frame(true,true,units);
 check(p.protectedIds.count(3),"Aircraft remains protected while clearing its pad");
 healthy.action=DACTION_NONE;p.frame(true,true,units);check(!p.protectedIds.count(3),"Rearmed aircraft rejoins after pad action ends");
 p.intent({{"enabled",false},{"nonce","off2"},{"context","world-a"}});p.frame(true,true,units);synced(units);p.frame(true,true,units);
 low.body=153;low.order.type=DORDER_RTB;p.frame(true,true,units);check(p.protectedIds.count(1),"OFF preserves an active damaged return-to-base trip");
 low.order.type=DORDER_GUARD;p.frame(true,true,units);check(!p.protectedIds.count(1),"OFF releases damaged HQ unit after the existing trip ends");
 low.order.type=DORDER_RTR_SPECIFIED;p.frame(true,true,units);check(p.protectedIds.count(1),"Manual return to specified repair facility is protected while toggle OFF");
 const auto oldCalls=low.queueCalls;p.intent({{"enabled",true},{"nonce","held"},{"context","world-a"}});p.frame(true,false,units);
 check(low.queueCalls==oldCalls&&!p.applied&&p.pending,"Native unsafe menu delays simulation policy changes");
 p.observeContext(false,"");p.frame(false,false,{});check(!p.enabled&&!p.managed&&p.context.empty()&&p.combatIds.empty(),"Observer/context loss resets policy and diagnostics");
 check(!p.intent({{"enabled",true},{"nonce","spectator"},{"context","world-a"}}),"Observer cannot enable command policy");
 MobileCombatLatchV90 latch;latch.observeWorld(true,0,100,1000);const auto context=latch.context;
 check(latch.intent(true,false,"one","activation",context,false),"ALL COMBAT activates independently");
 std::vector<MobileCombatUnitV90>combat{{1,true,true,true},{2,true,false,false},{4,false,true,false}};
 auto change=latch.reconcile(combat,true);
 check(change.select==std::set<uint32_t>{2}&&change.deselect==std::set<uint32_t>{1,4},"ALL COMBAT selects ready units and excludes repairing units/constructors");
 latch.intent(true,true,"hold","activation",context,false);change=latch.reconcile(combat,true);
 check(change.select.empty()&&change.deselect==std::set<uint32_t>{1},"Gesture hold still deselects a newly damaged unit before grouped order");
 latch.intent(true,false,"resume","activation",context,false);change=latch.reconcile({{1,true,false,true}},true);
 check(latch.enabled&&change.select.empty(),"ALL COMBAT stays ON safely when every unit is repairing");
 change=latch.reconcile({{1,true,false,false}},true);check(change.select==std::set<uint32_t>{1},"Repaired unit automatically rejoins the latched combat group");
 latch.intent(false,false,"stop","activation",context,true);change=latch.reconcile({{1,true,true,true}},true);
 check(!latch.enabled&&change.deselect.count(1)&&latch.deselectAppliedNonce=="stop","ALL COMBAT OFF still deselects all combat units");
 MobileRepairPolicyV93 rapid;rapid.observeContext(true,"rapid");DROID changing;changing.id=100;std::vector<DROID*>one{&changing};
 rapid.intent({{"enabled",true},{"nonce","r1"},{"context","rapid"}});rapid.frame(true,true,one);
 rapid.intent({{"enabled",false},{"nonce","r2"},{"context","rapid"}});rapid.frame(true,true,one);
 rapid.intent({{"enabled",true},{"nonce","r3"},{"context","rapid"}});rapid.frame(true,true,one);rapid.frame(true,true,one);
 check(changing.queueCalls==3&&changing.queued==DSS_REPLEV_LOW&&rapid.requestNonce=="r3","Rapid ON/OFF/ON uses last pending native intent without duplicate sends");
 synced(one);rapid.frame(true,true,one);check(rapid.applied&&!rapid.pending&&rapid.enabled,"Rapid-toggle final synchronized Medium state is acknowledged");
 MobileRepairPolicyV93 large;large.observeContext(true,"large");std::vector<DROID>army(300);std::vector<DROID*>many;
 for(unsigned i=0;i<army.size();++i){army[i].id=1000+i;many.push_back(&army[i]);}army[299].body=153;
 large.intent({{"enabled",true},{"nonce","l1"},{"context","large"}});large.frame(true,true,many);
 auto snapshot=large.snapshot();check(snapshot["units"].size()==256&&snapshot["diagnosticUnitsTruncated"]&&snapshot["combatIds"].size()==300&&snapshot["pendingIds"].size()==300,"Diagnostic cap never truncates native combat/pending membership");
 check(large.protectedIds==std::set<uint32_t>{1299},"Beyond diagnostic cap, off-screen damaged unit remains protected");
 std::cout<<nlohmann::json{{"passed",true},{"checks",checks}}.dump();
}
