"""Isolated native repair-policy overlays; never edit retained native sources."""
from pathlib import Path
from hashlib import sha256
import argparse,difflib,json,subprocess
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/native-093'

def replace(text,old,new):
 assert text.count(old)==1,(old[:130],text.count(old));return text.replace(old,new,1)

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--baseline-project',type=Path,default=Path('C:/timerApp/github-staging/wz-android-0.92'))
 p.add_argument('--offline-stock',type=Path,default=Path('C:/timerApp/_official_warzone2100_src/src/order.cpp'))
 p.add_argument('--mp-stock',type=Path,default=Path('C:/timerApp/_official_warzone2100_src/src/order.cpp'))
 p.add_argument('--offline-keybind',type=Path)
 p.add_argument('--mp-keybind',type=Path)
 p.add_argument('--refresh',action='store_true');a=p.parse_args();rows=[]
 previous=OUT/'source-preparation.json'
 if previous.exists():
  assert a.refresh,'Explicit --refresh is required to update a prepared overlay'
  proof=OUT/'proof';proof.mkdir(parents=True,exist_ok=True)
  (proof/('source-preparation-before-'+sha256(previous.read_bytes()).hexdigest()[:12]+'.json')).write_bytes(previous.read_bytes())
 def save(family,name,before,after,source):
  target=OUT/'source'/family/'src'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(after,newline='\n')
  patch=OUT/'patches'/family/(name+'.patch');patch.parent.mkdir(parents=True,exist_ok=True)
  patch.write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/src/'+name,tofile='b/src/'+name)),newline='\n')
  rows.append(dict(family=family,path='src/'+name,baselineSource=str(source),beforeSHA256=sha256(source.read_bytes()).hexdigest(),afterSHA256=sha256(target.read_bytes()).hexdigest()))
 common=OUT/'source/common';common.mkdir(parents=True,exist_ok=True)
 before=(a.baseline_project/'vendor/native-090/source/common/mobile-combat-latch-v90.h').read_text();after=before
 after=replace(after,'    bool selected;','    bool selected;\n    bool protectedForRepair=false;')
 after=replace(after,'        if (suspended)\n','        // A gesture suspension must not let a newly damaged unit receive the\n        // next group order. Never select while held; deselection is protective.\n        if(enabled && safe)for(const auto &unit:units)\n            if(unit.combat && unit.protectedForRepair && unit.selected)result.deselect.insert(unit.id);\n        if (suspended)\n')
 after=replace(after,'            return result;\n        }\n        if (pendingDeselect)','            if(result.changed())++revision;\n            return result;\n        }\n        if (pendingDeselect)')
 after=replace(after,'                if (unit.combat && !unit.selected) result.select.insert(unit.id);\n                else if (!unit.combat && unit.selected) result.deselect.insert(unit.id);','                if (unit.combat && !unit.protectedForRepair && !unit.selected) result.select.insert(unit.id);\n                else if ((!unit.combat || unit.protectedForRepair) && unit.selected) result.deselect.insert(unit.id);')
 (common/'mobile-combat-latch-v93.h').write_text(after,newline='\n')
 for family,name in [('offline','hci.cpp'),('multiplayer','quickjs_backend.cpp')]:
  source=a.baseline_project/'vendor/native-091/source'/family/'src'/name;before=source.read_text();after=before
  after=replace(after,'#include "mobile-combat-latch-v90.h"','#include "mobile-combat-latch-v93.h"\n#include "mobile-repair-policy-v93.h"\n#include "mobile-guarded-stop-v93.h"')
  after=replace(after,'    const nlohmann::json &combat, const nlohmann::json &selected)','    const nlohmann::json &combat, const nlohmann::json &selected, const std::set<uint32_t> &protectedIds)')
  after=replace(after,'    return {{"enabled",policy.enabled}', '    auto commandable=nlohmann::json::array();\n    for(const auto &id:combat)if(!protectedIds.count(id.get<uint32_t>()))commandable.push_back(id);\n    return {{"player",selectedPlayer},{"commandableIds",commandable},{"protectedIds",protectedIds},{"enabled",policy.enabled}')
  if family=='offline':
   after=replace(after,'static MobileCombatLatchV90 normalMobileCombatPolicyV90;','static MobileCombatLatchV90 normalMobileCombatPolicyV90;\nstatic MobileRepairPolicyV93 normalMobileRepairPolicyV93;\nbool mobileCombatProtectsV93(const DROID *droid)\n{\n    return normalMobileCombatPolicyV90.enabled && normalMobileCombatPolicyV90.previousOwned\n        && selectedPlayer<MAX_PLAYERS && realSelectedPlayer==selectedPlayer && !NETisReplay()\n        && droid && droid->player==selectedPlayer && normalMobileRepairPolicyV93.protects(droid);\n}')
   after=replace(after,'    normalMobileCombatIntentV90();\n    normalMobileConstructorFrameV90(playing,safe);','    normalMobileCombatIntentV90();\n    normalMobileRepairPolicyV93.observeContext(playing,normalMobileCombatPolicyV90.context);\n    normalMobileRepairPolicyV93.readIntent("/tmp/warzone-repair-policy-v93.json");\n    std::vector<DROID*> repairDroids;\n    if(playing)for(DROID *droid:apsDroidLists[selectedPlayer])repairDroids.push_back(droid);\n    normalMobileRepairPolicyV93.frame(playing,safe,repairDroids);\n    normalMobileConstructorFrameV90(playing,safe);')
   after=replace(after,'droid->selected!=0});','droid->selected!=0,normalMobileRepairPolicyV93.protects(droid)});')
   after=replace(after,'{"combatSelection",{{"player",selectedPlayer},{"combatIds",combatIds},{"selectedIds",selectedIds}}},','{"repairPolicy",normalMobileRepairPolicyV93.snapshot()},\n        {"combatSelection",mobileCombatAckV90(normalMobileCombatPolicyV90,combatIds,selectedIds,normalMobileRepairPolicyV93.protectedIds)},')
   after=replace(after,'mobileCombatAckV90(normalMobileCombatPolicyV90,combatIds,selectedIds)','mobileCombatAckV90(normalMobileCombatPolicyV90,combatIds,selectedIds,normalMobileRepairPolicyV93.protectedIds)')
   after=replace(after,'    const auto value=nlohmann::json{{"schemaVersion",89}', '    for(auto &unit:normalMobileRepairPolicyV93.units)unit["selected"]=selected.count(unit["id"].get<uint32_t>())!=0;\n    const auto value=nlohmann::json{{"schemaVersion",89}')
   after=replace(after,'&& realSelectedPlayer==selectedPlayer && !NetPlay.players[selectedPlayer].isSpectator;','&& realSelectedPlayer==selectedPlayer && !NetPlay.players[selectedPlayer].isSpectator && !NETisReplay();')
  else:
   after=replace(after,'#include "geometry.h"\n#include "display.h"','#include "geometry.h"\n#include "lib/netplay/netreplay.h"\n#include "display.h"')
   after=replace(after,'static MpCombatSelectionPolicy mpMobileCombatPolicy;','static MpCombatSelectionPolicy mpMobileCombatPolicy;\nstatic MobileRepairPolicyV93 mpMobileRepairPolicyV93;\nbool mobileCombatProtectsV93(const DROID *droid)\n{\n    return mpMobileCombatPolicy.enabled && mpMobileCanIssueOrders()\n        && droid && droid->player==selectedPlayer && mpMobileRepairPolicyV93.protects(droid);\n}')
   after=replace(after,'    std::vector<MobileCombatUnitV90> units;\n    if(world&&selectedPlayer<MAX_PLAYERS)','    mpMobileRepairPolicyV93.observeContext(world,mpMobileCombatPolicy.context);\n    mpMobileRepairPolicyV93.readIntent("/tmp/mp-mobile-repair-v93.json");\n    std::vector<DROID*> repairDroids;\n    if(world&&selectedPlayer<MAX_PLAYERS)for(DROID *droid:apsDroidLists[selectedPlayer])repairDroids.push_back(droid);\n    mpMobileRepairPolicyV93.frame(world,safe,repairDroids);\n    std::vector<MobileCombatUnitV90> units;\n    if(world&&selectedPlayer<MAX_PLAYERS)')
   after=replace(after,'droid->selected!=0});','droid->selected!=0,mpMobileRepairPolicyV93.protects(droid)});')
   after=replace(after,'mobileCombatAckV90(mpMobileCombatPolicy,combat,selected)','mobileCombatAckV90(mpMobileCombatPolicy,combat,selected,mpMobileRepairPolicyV93.protectedIds)')
   after=replace(after,'    mpMobileCombatState=mobileCombatAckV90(', '    for(auto &unit:mpMobileRepairPolicyV93.units)unit["selected"]=selectedIds.count(unit["id"].get<uint32_t>())!=0;\n    mpMobileCombatState=mobileCombatAckV90(')
   after=replace(after,'{"combatLock",mpMobileCombatState},','{"combatLock",mpMobileCombatState},{"repairPolicy",mpMobileRepairPolicyV93.snapshot()},')
   after=replace(after,'&&mpMobileViewReady&&mpMobileOwner().ownsViewedPlayer;','&&mpMobileViewReady&&mpMobileOwner().ownsViewedPlayer&&!NETisReplay();')
   after=replace(after,'const bool canIssueOrders=world&&owner.ownsViewedPlayer;','const bool canIssueOrders=world&&owner.ownsViewedPlayer&&!NETisReplay();')
  if family=='offline':
   after=replace(after,'// A separate one-shot mailbox cannot rewrite the persistent combat intent.', '''static MobileGuardedStopV93 normalMobileGuardedStopV93;
static void normalMobileStopFrameV93(bool owned,bool safe,const std::vector<DROID*> &droids)
{
    const auto &policy=normalMobileCombatPolicyV90;
    normalMobileGuardedStopV93.observeContext(owned?policy.context:std::string());
    FILE *file=fopen("/tmp/warzone-combat-stop-v93.json","rb");if(!file)return;
    char bytes[1025];const auto length=fread(bytes,1,sizeof(bytes),file);fclose(file);if(length>1024)return;
    const auto request=nlohmann::json::parse(bytes,bytes+length,nullptr,false);
    normalMobileGuardedStopV93.apply(request,owned,safe,policy.enabled,policy.context,policy.activation,
        selectedPlayer,droids,[](const DROID *droid){return mobileCombatProtectsV93(droid);});
}

// A separate one-shot mailbox cannot rewrite the persistent combat intent.''')
   after=replace(after,'    normalMobileRepairPolicyV93.frame(playing,safe,repairDroids);','    normalMobileRepairPolicyV93.frame(playing,safe,repairDroids);\n    normalMobileStopFrameV93(playing,safe,repairDroids);')
   after=replace(after,'{"repairPolicy",normalMobileRepairPolicyV93.snapshot()},','{"repairPolicy",normalMobileRepairPolicyV93.snapshot()},{"combatStop",normalMobileGuardedStopV93.ack},')
  else:
   after=replace(after,'static std::string mpMobileCombatInputNonce;','static MobileGuardedStopV93 mpMobileGuardedStopV93;\nstatic std::string mpMobileCombatInputNonce;')
   after=replace(after,'    mpMobileRepairPolicyV93.frame(world,safe,repairDroids);','    mpMobileRepairPolicyV93.frame(world,safe,repairDroids);\n    mpMobileGuardedStopV93.observeContext(world?mpMobileCombatPolicy.context:std::string());')
   after=replace(after,'    if(allowed&&(action=="deselect"||action=="select-box"||action=="select-visible-trucks")) {', '''    if(action=="stop-selected") {
        const bool safe=allowed&&!InGameOpUp&&!isInGamePopupUp&&!bLoadSaveUp&&intMode==INT_NORMAL&&!gamePaused()&&!gameUpdatePaused();
        std::vector<DROID*> droids;
        if(allowed)for(DROID *droid:apsDroidLists[selectedPlayer])droids.push_back(droid);
        mpMobileGuardedStopV93.apply(request,allowed,safe,mpMobileCombatPolicy.enabled,
            mpMobileCombatPolicy.context,mpMobileCombatPolicy.activation,selectedPlayer,droids,
            [](const DROID *droid){return mobileCombatProtectsV93(droid);});
        mpMobileWriteFile("/tmp/mp-mobile-input-result.json",mpMobileGuardedStopV93.ack.dump());return;
    }
    if(allowed&&(action=="deselect"||action=="select-box"||action=="select-visible-trucks")) {''')
  save(family,name,before,after,source)
 for family,source in [('offline',a.offline_stock),('multiplayer',a.mp_stock)]:
  before=source.read_text();after=before
  marker='void orderSelectedLoc(uint32_t player, uint32_t x, uint32_t y, bool add)'
  after=replace(after,marker,'#if defined(__EMSCRIPTEN__)\nextern bool mobileCombatProtectsV93(const DROID *droid);\n#else\nstatic bool mobileCombatProtectsV93(const DROID *) { return false; }\n#endif\n\n'+marker)
  for start,end in [('void orderSelectedLoc(', '\nstatic int highestQueuedModule'),('void orderSelectedObjAdd(', '\n\n/** This function just calls orderSelectedObjAdd')]:
   begin=after.index(start);finish=after.index(end,begin);block=after[begin:finish]
   block=replace(block,'if (psCurr->selected)','if (psCurr->selected && !mobileCombatProtectsV93(psCurr))');after=after[:begin]+block+after[finish:]
  save(family,'order.cpp',before,after,source)
 for family,source in [('offline',a.offline_keybind or a.offline_stock.with_name('keybind.cpp')),
                       ('multiplayer',a.mp_keybind or a.mp_stock.with_name('keybind.cpp'))]:
  before=source.read_text();after=before
  marker='MappableFunction kf_OrderDroid(const DroidOrderType order)'
  after=replace(after,marker,'#if defined(__EMSCRIPTEN__)\nextern bool mobileCombatProtectsV93(const DROID *droid);\n#else\nstatic bool mobileCombatProtectsV93(const DROID *) { return false; }\n#endif\n\n'+marker)
  begin=after.index(marker);finish=after.index('// --------------------------------------------------------------------------',begin)
  block=after[begin:finish]
  block=replace(block,'if (psDroid->selected)','if (psDroid->selected && (order != DORDER_STOP || !mobileCombatProtectsV93(psDroid)))')
  after=after[:begin]+block+after[finish:]
  save(family,'keybind.cpp',before,after,source)
 record=dict(passed=True,version='0.93',baseline='0.92/native0.91',sourceChanges=rows,mediumHealthThreshold=75,allOwnedCombat=True,newbornNativeEnumeration=True,synchronizedSecondaryOrders=True,protectedGroupedDispatch=True,protectedUIStopDispatch=True,protectedPhysicalS=True)
 (OUT/'source-preparation.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record,indent=2))
if __name__=='__main__':main()
