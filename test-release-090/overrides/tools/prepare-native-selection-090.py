"""Prepare source-only0.90 selection/render overlays from frozen0.89 sources."""
from pathlib import Path
from hashlib import sha256
import argparse,difflib,json,re,shutil
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/native-090'

ACK=r'''
static nlohmann::json mobileCombatAckV90(const MobileCombatLatchV90 &policy,
    const nlohmann::json &combat, const nlohmann::json &selected)
{
    return {{"enabled",policy.enabled},{"suspended",policy.suspended},{"requestedSuspended",policy.requestedSuspended},
        {"reason",policy.reason},{"requestNonce",policy.requestNonce},{"activation",policy.activation},{"context",policy.context},
        {"pendingDeselect",policy.pendingDeselect},{"deselectNonce",policy.deselectNonce},{"deselectAppliedNonce",policy.deselectAppliedNonce},
        {"combatIds",combat},{"selectedIds",selected},{"revision",policy.revision}};
}
'''

REQUEST=r'''
static void READ_REQUEST()
{
    FILE *file=fopen("REQUEST_PATH","rb"); if(!file)return;
    char bytes[2049];const auto length=fread(bytes,1,2049,file);fclose(file);if(length>2048)return;
    const auto request=nlohmann::json::parse(bytes,bytes+length,nullptr,false);
    if(!request.is_object() || !request.contains("nonce") || !request["nonce"].is_string()
        || !request.contains("enabled") || !request["enabled"].is_boolean()
        || !request.contains("suspended") || !request["suspended"].is_boolean()
        || !request.contains("activation") || !request["activation"].is_string()
        || !request.contains("context") || !request["context"].is_string()
        || !request.contains("deselect") || !request["deselect"].is_boolean())return;
    const auto nonce=request["nonce"].get<std::string>(),activation=request["activation"].get<std::string>(),context=request["context"].get<std::string>();
    if(nonce.empty() || nonce.size()>160 || activation.size()>160 || context.size()>160)return;
    POLICY.intent(request["enabled"].get<bool>(),request["suspended"].get<bool>(),nonce,activation,context,request["deselect"].get<bool>());
}
'''

CONSTRUCTORS=r'''
// A separate one-shot mailbox cannot rewrite the persistent combat intent.
static nlohmann::json normalMobileConstructorAckV90={{"nonce",""},{"ok",false},{"reason","idle"},{"selectedIds",nlohmann::json::array()}};
static std::string normalMobileConstructorNonceV90,normalMobileConstructorContextV90;
static void normalMobileConstructorFrameV90(bool owned,bool safe)
{
    const auto &policy=normalMobileCombatPolicyV90;
    if(normalMobileConstructorContextV90!=policy.context)
    {
        normalMobileConstructorContextV90=policy.context;normalMobileConstructorNonceV90.clear();
        normalMobileConstructorAckV90={{"nonce",""},{"context",policy.context},{"ok",false},{"reason","idle"},{"selectedIds",nlohmann::json::array()}};
    }
    FILE *file=fopen("/tmp/warzone-constructor-selection-v90.json","rb");if(!file)return;
    char bytes[2049];const auto length=fread(bytes,1,2049,file);fclose(file);if(length>2048)return;
    const auto request=nlohmann::json::parse(bytes,bytes+length,nullptr,false);
    if(!request.is_object())return;
    for(const char *key:{"nonce","action","context","activation","combatIntentNonce"})
        if(!request.contains(key)||!request[key].is_string()||request[key].get<std::string>().size()>160)return;
    const auto nonce=request["nonce"].get<std::string>();
    if(nonce.empty()||nonce==normalMobileConstructorNonceV90)return;
    normalMobileConstructorNonceV90=nonce;
    const auto context=request["context"].get<std::string>(),activation=request["activation"].get<std::string>(),intent=request["combatIntentNonce"].get<std::string>();
    normalMobileConstructorAckV90={{"nonce",nonce},{"context",context},{"activation",activation},{"combatIntentNonce",intent},
        {"ok",false},{"reason","not-world-safe"},{"selectedIds",nlohmann::json::array()}};
    if(!owned||!safe)return;
    if(context.empty()||context!=policy.context){normalMobileConstructorAckV90["reason"]="stale-context";return;}
    if(activation!=policy.activation||intent.empty()||intent!=policy.requestNonce){normalMobileConstructorAckV90["reason"]="stale-combat-intent";return;}
    if(!policy.requestedSuspended){normalMobileConstructorAckV90["reason"]="selection-not-held";return;}
    if(request["action"]!="select-visible-trucks"){normalMobileConstructorAckV90["reason"]="unknown-action";return;}
    std::set<uint32_t> wanted;
    for(DROID *droid:apsDroidLists[selectedPlayer])
        if(isSelectable(droid)&&objectOnScreen(droid,0)
            &&(droid->droidType==DROID_CONSTRUCT||droid->droidType==DROID_CYBORG_CONSTRUCT))wanted.insert(droid->id);
    bool changed=false;
    for(DROID *droid:apsDroidLists[selectedPlayer])
    {
        if(wanted.count(droid->id)&&!droid->selected){SelectDroid(droid,true);changed=true;}
        else if(!wanted.count(droid->id)&&droid->selected){DeSelectDroid(droid);changed=true;}
    }
    if(changed){intRefreshScreen();triggerEventSelected();}
    std::set<uint32_t> selected;
    for(const DROID *droid:apsDroidLists[selectedPlayer])if(droid->selected)selected.insert(droid->id);
    for(const auto id:selected)normalMobileConstructorAckV90["selectedIds"].push_back(id);
    normalMobileConstructorAckV90["ok"]=selected==wanted;
    normalMobileConstructorAckV90["reason"]=selected==wanted?"":"selection-not-applied";
}
'''

OFFLINE=r'''
// BEGIN NORMAL090_NATIVE_COMBAT_LATCH
#include "geometry.h"
#include "mobile-combat-latch-v90.h"
static MobileCombatLatchV90 normalMobileCombatPolicyV90;
ACK_FUNCTION
REQUEST_FUNCTION
CONSTRUCTOR_FUNCTION
// This hook runs for every main frame, including Towers/FFA and frontend.
static void normalMobileCombatSelectionFrame()
{
#if defined(__EMSCRIPTEN__)
    static uint64_t publicationSerial=0;
    const bool playing=GetGameMode()==GS_NORMAL && gameInitialised && selectedPlayer<MAX_PLAYERS
        && realSelectedPlayer==selectedPlayer && !NetPlay.players[selectedPlayer].isSpectator;
    const bool video=loop_GetVideoStatus(),paused=gamePaused()||gameUpdatePaused();
    const bool menu=InGameOpUp||isInGamePopupUp||bLoadSaveUp||intHelpOverlayIsUp()||intMode!=INT_NORMAL;
    const bool safe=playing&&!video&&!paused&&!menu;
    normalMobileCombatPolicyV90.observeWorld(playing,selectedPlayer,gameTime,realTime);
    normalMobileCombatIntentV90();
    normalMobileConstructorFrameV90(playing,safe);
    std::vector<MobileCombatUnitV90> units;
    if(playing)for(const DROID *droid:apsDroidLists[selectedPlayer])
        units.push_back({droid->id,droid->asWeaps[0].nStat>0&&!droid->isTransporter()&&isSelectable(droid),droid->selected!=0});
    const auto changes=normalMobileCombatPolicyV90.reconcile(units,safe);
    if(changes.changed())
    {
        for(DROID *droid:apsDroidLists[selectedPlayer])
            if(changes.select.count(droid->id))SelectDroid(droid,true);
            else if(changes.deselect.count(droid->id))DeSelectDroid(droid);
        intRefreshScreen();triggerEventSelected();
    }
    std::set<uint32_t> combat,selected;
    if(playing)for(const DROID *droid:apsDroidLists[selectedPlayer])
    {
        if(droid->asWeaps[0].nStat>0&&!droid->isTransporter()&&isSelectable(droid))combat.insert(droid->id);
        if(droid->selected)selected.insert(droid->id);
    }
    auto combatIds=nlohmann::json::array(),selectedIds=nlohmann::json::array();
    for(const auto id:combat)combatIds.push_back(id);
    for(const auto id:selected)selectedIds.push_back(id);
    const auto value=nlohmann::json{{"schemaVersion",89},{"frame",++publicationSerial},
        {"gameTime",gameTime},{"realTime",realTime},{"player",selectedPlayer},{"playing",playing},{"worldSafe",safe},
        {"combatSelection",{{"player",selectedPlayer},{"combatIds",combatIds},{"selectedIds",selectedIds}}},
        {"combatLock",mobileCombatAckV90(normalMobileCombatPolicyV90,combatIds,selectedIds)},
        {"constructorSelection",normalMobileConstructorAckV90}}.dump();
    FILE *file=fopen("/tmp/warzone-combat-selection-v89.json.tmp","wb");if(!file)return;
    fwrite(value.data(),1,value.size(),file);fclose(file);
    rename("/tmp/warzone-combat-selection-v89.json.tmp","/tmp/warzone-combat-selection-v89.json");
#endif
}
// END NORMAL090_NATIVE_COMBAT_LATCH
'''

MPFRAME=r'''
static void mpMobileCombatFrame(bool world,bool safe)
{
    std::vector<MobileCombatUnitV90> units;
    if(world&&selectedPlayer<MAX_PLAYERS)for(const DROID *droid:apsDroidLists[selectedPlayer])
        units.push_back({droid->id,mpMobileCombatEligible(droid),droid->selected!=0});
    const auto changes=mpMobileCombatPolicy.reconcile(units,safe);
    if(changes.changed())
    {
        for(DROID *droid:apsDroidLists[selectedPlayer])
            if(changes.select.count(droid->id))SelectDroid(droid,true);
            else if(changes.deselect.count(droid->id))DeSelectDroid(droid);
        intRefreshScreen();triggerEventSelected();
    }
    auto combat=nlohmann::json::array(),selected=nlohmann::json::array();
    std::set<uint32_t> combatIds,selectedIds;
    if(world&&selectedPlayer<MAX_PLAYERS)for(const DROID *droid:apsDroidLists[selectedPlayer])
    {
        if(mpMobileCombatEligible(droid))combatIds.insert(droid->id);
        if(droid->selected)selectedIds.insert(droid->id);
    }
    for(const auto id:combatIds)combat.push_back(id);
    for(const auto id:selectedIds)selected.push_back(id);
    mpMobileCombatState=mobileCombatAckV90(mpMobileCombatPolicy,combat,selected);
}
'''

def write(path,data):path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
def digest(data):return sha256(data).hexdigest()
def request(function,path,policy):
    return REQUEST.replace('READ_REQUEST',function).replace('REQUEST_PATH',path).replace('POLICY',policy)

def no_corners(text):
    start=text.index('static void queueDroidPowerBarsRects(DROID *psDroid, bool drawBox, BatchedMultiRectRenderer& batchedMultiRectRenderer, size_t rectGroup)\n{')
    end=text.index('\nstatic void queueDroidEnemyHealthBarsRects',start)
    body=text[start:end]
    block=re.search(r'\n\tif \(drawBox\)\n\t\{\n.*?\n\t\}\n',body,re.S)
    assert block and block.group().count('WZCOL_WHITE')==4
    body=body[:block.start()]+'\n\t// Test0.90: selected-unit brackets are intentionally not drawn.\n'+body[block.end():]
    body=body.replace('bool drawBox,','bool /* drawBox */,',1)
    assert 'if (!psDroid->selected)' in body and 'WZCOL_WHITE' not in body
    body=body.replace('// Normal0.89: retain selection corners and all unrelated status.','// Test0.90: selected health/background bars remain suppressed; unrelated status is retained.')
    return text[:start]+body+text[end:]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-project',type=Path,default=Path('C:/timerApp/candidates/normal-0.89-20261116'))
    args=parser.parse_args();baseline=args.baseline_project/'vendor/native-089';rows=[]
    sources=[('offline','src/display3d.cpp',baseline/'source/offline/src/display3d.cpp'),
             ('offline','src/hci.cpp',baseline/'source/offline/src/hci.cpp'),
             ('multiplayer','src/display3d.cpp',baseline/'source/multiplayer/src/display3d.cpp'),
             ('multiplayer','src/quickjs_backend.cpp',baseline/'bootstrap/multiplayer/source/src/quickjs_backend.cpp')]
    for family,name,path in sources:
        before=path.read_text();after=before
        if name.endswith('display3d.cpp'):after=no_corners(before)
        elif family=='offline':
            replacement=OFFLINE.replace('ACK_FUNCTION',ACK).replace('REQUEST_FUNCTION',request('normalMobileCombatIntentV90','/tmp/warzone-combat-lock-v90.json','normalMobileCombatPolicyV90')).replace('CONSTRUCTOR_FUNCTION',CONSTRUCTORS)
            after,count=re.subn(r'// BEGIN NORMAL089_READONLY_COMBAT_SELECTION.*?// END NORMAL089_READONLY_COMBAT_SELECTION',lambda _:replacement.strip(),before,flags=re.S);assert count==1
        else:
            after,count=re.subn(r'// BEGIN MP_COMBAT_SELECTION_POLICY.*?// END MP_COMBAT_SELECTION_POLICY',lambda _:'#include "mobile-combat-latch-v90.h"\nusing MpCombatSelectionPolicy=MobileCombatLatchV90;\n'+ACK,before,flags=re.S);assert count==1
            anchor='static void mpMobileCombatIntent()\n{';start=after.index(anchor);end=after.index('\nstatic void mpMobilePruneEvents()',start)
            intent=request('mpMobileCombatReadIntentV90','/tmp/mp-mobile-combat.json','mpMobileCombatPolicy')
            intent+='\nstatic void mpMobileCombatIntent()\n{\n    mpMobileCombatPolicy.observeWorld(mpMobileCanIssueOrders(),selectedPlayer,gameTime,realTime);\n    mpMobileCombatReadIntentV90();\n}\n'
            after=after[:start]+intent+MPFRAME+after[end:]
            line='        if(mpMobileCombatPolicy.enabled&&!mpMobileCombatPolicy.requestedSuspended)mpMobileCombatPolicy.stop("manual-selection");\n'
            assert after.count(line)==1;after=after.replace(line,'',1)
            line='    if(object->type==OBJ_DROID&&mpMobileCombatPolicy.enabled)mpMobileCombatPolicy.stop("manual-selection");\n'
            assert after.count(line)==1;after=after.replace(line,'',1)
            assert 'mpMobileCombatPolicy.stop(' not in after and 'expectedSelection' not in after
        target=OUT/'source'/family/name;write(target,after.encode())
        patch=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+name,tofile='b/'+name))
        write(OUT/'patches'/family/(Path(name).name+'.patch'),patch.encode())
        rows.append(dict(family=family,path=name,beforeSHA256=digest(before.encode()),afterSHA256=digest(after.encode())))
    write(OUT/'source-preparation.json',(json.dumps(dict(passed=True,baselineVersion='0.89',version='0.90',sourceChanges=rows),indent=2)+'\n').encode())
    print(json.dumps({'prepared':True,'sourceFiles':len(rows),'compiled':False},indent=2))

if __name__=='__main__':main()
