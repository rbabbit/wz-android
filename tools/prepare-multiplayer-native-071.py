"""Prepare/rebuild the MP-only native client from matched upstream source.
No synchronized rules/data inputs are modified. The retained warm cache is copied
before this tool runs. This script restores prior UI overlays, adds reviewed
client UI hooks, and records a complete source patch against upstream4.7.0.
"""
from pathlib import Path
import re,json,subprocess,difflib,shutil,hashlib
ROOT=Path('/mnt/c/timerApp/wz-towers-lab')
CACHE=Path('/home/punkech/wz-mp-070')
PREVIOUS=Path('/home/punkech/wz-blueprint-20261107')
OUT=ROOT/'vendor/multiplayer/native-071'
source=CACHE/'source'; build=CACHE/'build'

def fn(text,name):
 start=text.index('function '+name+'(');brace=text.index('{',start);depth=1;quote=None;escape=False;i=brace+1
 # Source functions use regex literals containing braces; count line-brace
 # boundaries by parsing through the project's retained acorn below instead.
 return start

def original(name):
 return subprocess.check_output(['git','-C',str(source),'show','HEAD:'+name]).decode()

def put(name,text):
 p=source/name;p.write_text(text,encoding='utf8',newline='\n')

changed=subprocess.check_output(['git','-C',str(source),'diff','--name-only'],text=True).splitlines()
for name in changed:put(name,original(name))
# Warm build paths are internal cache locations, not product runtime paths.
for directory in (build,):
 for p in directory.rglob('*'):
  if not p.is_file() or p.suffix not in ('.ninja','.txt','.cmake','.h','.rsp') or p.stat().st_size>10_000_000:continue
  try:text=p.read_text()
  except (UnicodeDecodeError,OSError):continue
  if str(PREVIOUS) in text:p.write_text(text.replace(str(PREVIOUS),str(CACHE)))

# Reuse the previously reviewed read-only factory observation and exact-native
# cancellation binding. The MP cancellation uses ModeQueue to synchronize it.
quick=(PREVIOUS/'source/src/quickjs_backend.cpp').read_text()
start=quick.index('#include <cstdio>\n#include "structure.h"')
end=quick.index('JSValue convStructure(',start)
helper=quick[start:end]
# No Campaign dependency or marker policy in this MP-only client build.
a=helper.index('// These campaign APIs');b=helper.index('// Towers-only read-only native production observation.')
helper=helper[:a]+'static JSContext *mpMobileUIContext=nullptr;\nstatic bool mobileProductionEnabled(JSContext *ctx){return ctx==mpMobileUIContext;}\n'+helper[b:]
helper=helper.replace('mobileProductionEnabled()', 'mobileProductionEnabled(ctx)')
helper=helper.replace('cancelProduction(structure, ModeImmediate, false);\n\treturn JS_NewBool(ctx, factory.psSubject == nullptr);','cancelProduction(structure, ModeQueue, false);\n\treturn JS_TRUE;')
quick=original('src/quickjs_backend.cpp').replace('#include "hci.h"','#include "hci.h"\n#include "selection.h"')
quick=quick.replace('JSValue convStructure(const STRUCTURE *psStruct, JSContext *ctx)\n{',helper+'JSValue convStructure(const STRUCTURE *psStruct, JSContext *ctx)\n{',1)
# Own-factory state only, exposed as an extra read-only snapshot field.
marker='\treturn value;\n}\n\n//;; ## Droid object'
# Locate the end of convStructure using following function definition.
cs=quick.index('JSValue convStructure(const STRUCTURE *psStruct, JSContext *ctx)\n{');nextfn=quick.index('\n}\n',cs)+3
segment=quick[cs:nextfn];at=segment.rfind('\treturn value;')
assert at>=0
extra='''\tif (psStruct->player == selectedPlayer && ctx == mpMobileUIContext) {
        JSValue observation=towersProductionState(psStruct,ctx);
        if(!JS_IsUndefined(observation))QuickJS_DefinePropertyValue(ctx,value,"towersProduction",observation,JS_PROP_ENUMERABLE);
        if(psStruct->pFunctionality && psStruct->pStructureType->type==REF_RESEARCH) {
            const auto &lab=psStruct->pFunctionality->researchFacility;
            const RESEARCH *topic=lab.psSubject?lab.psSubject:lab.psSubjectPending;
            if(topic){
                const int total=std::max(1,int(topic->researchPoints));
                const int points=int(asPlayerResList[selectedPlayer][topic->index].currentPoints);
                const int rate=getBuildingResearchPoints(psStruct);
                const bool wait=checkPowerRequest(psStruct)>=0;
                JSValue r=JS_NewObject(ctx);
                QuickJS_DefinePropertyValue(ctx,r,"topicId",JS_NewString(ctx,getID(topic)),JS_PROP_ENUMERABLE);
                QuickJS_DefinePropertyValue(ctx,r,"progress",JS_NewFloat64(ctx,std::min(1.0,double(points)/total)),JS_PROP_ENUMERABLE);
                QuickJS_DefinePropertyValue(ctx,r,"remainingSeconds",rate>0&&!wait?JS_NewInt32(ctx,(std::max(0,total-points)+rate-1)/rate):JS_NULL,JS_PROP_ENUMERABLE);
                QuickJS_DefinePropertyValue(ctx,r,"waitingPower",JS_NewBool(ctx,wait),JS_PROP_ENUMERABLE);
                QuickJS_DefinePropertyValue(ctx,value,"towersResearch",r,JS_PROP_ENUMERABLE);
            }
        }
    }
'''
segment=segment[:at]+extra+segment[at:];quick=quick[:cs]+segment+quick[nextfn:]
quick=quick.replace('\tbool loadScript(const WzString& path, int player, int difficulty);','\tbool loadScript(const WzString& path, int player, int difficulty);\n\tbool initializeMultiplayerUI(const std::string& script);\n\tvoid tickMultiplayerUI();')
quick=quick.replace('\tJS_REGISTER_FUNC2(buildDroid, 7, 7 + MAX_JS_VARARGS);','\tif(ctx==mpMobileUIContext){ JS_REGISTER_FUNC_NAME(towersCancelProduction, 3, towersCancelProductionJS); }\n\tJS_REGISTER_FUNC2(buildDroid, 7, 7 + MAX_JS_VARARGS);')
registered=set(re.findall(r'JS_REGISTER_FUNC(?:2)?\(\s*(\w+)',quick))|set(re.findall(r'JS_REGISTER_FUNC_NAME(?:2)?\(\s*(\w+)',quick))
native=(OUT/'mobile-ui-native.cpp.inc').read_text(encoding='utf-8-sig').replace('MP_REGISTERED_FUNCTIONS',','.join(json.dumps(n) for n in sorted(registered)))
quick+='\n'+native
put('src/quickjs_backend.cpp',quick)

sdl=original('lib/sdl/main_sdl.cpp')
sdl=sdl.replace('void wzEventLoopOneFrame(void* arg)','extern void mpMobileBeforeFrame();\nextern void mpMobileFrame();\nvoid wzEventLoopOneFrame(void* arg)')
sdl=sdl.replace('\tmainLoop();\t\t\t\t// WZ does its thing','\tmpMobileBeforeFrame();\n\tmainLoop();\t\t\t\t// WZ does its thing\n\tmpMobileFrame();')
put('lib/sdl/main_sdl.cpp',sdl)

multi=original('src/multiint.cpp')
multi=multi.replace('static void updateInActualHostedLobby(bool value)','extern void mpMobileSetLobby(bool);\nextern void mpMobileDidDrawLobby(bool);\nstatic void updateInActualHostedLobby(bool value)')
multi=multi.replace('\tbInActualHostedLobby = value;','\tbInActualHostedLobby = value;\n\tmpMobileSetLobby(value);')
marker='\twidgDisplayScreen(psWScreen);\t\t\t\t\t\t\t\t\t// show the widgets currently running'
assert multi.count(marker)==1
multi=multi.replace(marker,marker+'\n\tmpMobileDidDrawLobby(bInActualHostedLobby && ingame.localOptionsReceived && ingame.side == InGameSide::MULTIPLAYER_CLIENT);')
multi=multi.replace('\tbInActualHostedLobby = false; // don\'t bother calling updateInActualHostedLobby here because we\'re destroying everything','\tbInActualHostedLobby = false; mpMobileSetLobby(false); // private UI lifecycle only')
put('src/multiint.cpp',multi)

wrappers=original('src/wrappers.cpp')
wrappers=wrappers.replace('void initLoadingScreen(bool drawbdrop)','extern void mpMobileSetLoading(bool);\nvoid initLoadingScreen(bool drawbdrop)')
wrappers=wrappers.replace('void initLoadingScreen(bool drawbdrop)\n{','void initLoadingScreen(bool drawbdrop)\n{\n\tmpMobileSetLoading(true);')
wrappers=wrappers.replace('void closeLoadingScreen()\n{','void closeLoadingScreen()\n{\n\tmpMobileSetLoading(false);')
put('src/wrappers.cpp',wrappers)

display=original('src/display3d.cpp')
display=display.replace('glm::mat4 getBiasedShadowMapMVPMatrix(', 'extern void mpMobileSetView(const float*);\nglm::mat4 getBiasedShadowMapMVPMatrix(',1)
marker='\tconst glm::mat4 perspectiveViewMatrix = perspectiveMatrix * viewMatrix;'
assert display.count(marker)==1
display=display.replace(marker,marker+'\n\tmpMobileSetView(&perspectiveViewMatrix[0][0]);')
# The shell owns the game HUD; suppress only the stock map/timer decoration.
marker='\tif (getWidgetsStatus() && !gamePaused())\n\t{\n\t\tchar buildInfo[255];'
assert display.count(marker)==1
display=display.replace(marker,'#if !defined(__EMSCRIPTEN__)\n'+marker)
marker='\t\ttxtCurrentTime.render(RET_X + 134, 422 + E_H, WZCOL_TEXT_MEDIUM);\n\t}'
assert display.count(marker)==1
display=display.replace(marker,marker+'\n#endif')
marker='#define NETWORK_BUT_ID 0xFAAB'
assert display.count(marker)==1
display=display.replace(marker,marker+'\nWIDGET *mpMobileNetworkStatusWidget() { return widgGetFromID(psWScreen, NETWORK_FORM_ID); }')
put('src/display3d.cpp',display)

hci=original('src/hci.cpp')
hci=hci.replace('void intObjectSelected(BASE_OBJECT *psObj)','extern bool mpMobileObjectSelected(BASE_OBJECT*);\nvoid intObjectSelected(BASE_OBJECT *psObj)')
hci=hci.replace('void intObjectSelected(BASE_OBJECT *psObj)\n{','void intObjectSelected(BASE_OBJECT *psObj)\n{\n\tif(mpMobileObjectSelected(psObj))return;')
hci=hci.replace('void intDisplayWidgets()\n{','void intDisplayWidgets()\n{\n#ifdef __EMSCRIPTEN__\n\t// These screens are replaced by the mobile HTML controls. Closing native\n\t// forms may outlive intMode, so remove their animation widgets before draw.\n\tif (intMode == INT_OBJECT || intMode == INT_STAT || intMode == INT_ORDER || intMode == INT_CMDORDER) intResetScreen(true);\n\tif (widgGetFromID(psWScreen, IDORDER_FORM)) intRemoveOrderNoAnim();\n\tif (widgGetFromID(psWScreen, IDSTAT_FORM)) intRemoveStatsNoAnim();\n\tif (widgGetFromID(psWScreen, IDOBJ_FORM)) intRemoveObjectNoAnim();\n\tforceHidePowerBar(false); // The mobile shell renders the observed player power.\n#endif')
marker='bool setController(std::shared_ptr<BaseObjectsController> controller, INTMODE newIntMode, OBJECT_MODE newObjMode)\n{'
assert hci.count(marker)==1
hci=hci.replace(marker,marker+'\n#ifdef __EMSCRIPTEN__\n\t// The dedicated multiplayer client dispatches these actions through its\n\t// custom pages, never through an underlying native object controller.\n\tintResetScreen(true);\n\treturn false;\n#endif')
hci=hci.replace('INT_RETVAL intRunWidgets()','extern void mpMobileStatusDraw(bool);\nINT_RETVAL intRunWidgets()')
marker='\t\tWidgetTriggers const &triggers = widgRunScreen(psWScreen);'
assert hci.count(marker)==1
hci=hci.replace(marker,'\t\tmpMobileStatusDraw(true);\n'+marker+'\n\t\tmpMobileStatusDraw(false);')
marker='\twidgDisplayScreen(psWScreen);'
assert hci.count(marker)==1
hci=hci.replace(marker,'\tmpMobileStatusDraw(true);\n'+marker+'\n\tmpMobileStatusDraw(false);')
put('src/hci.cpp',hci)


# Persist an auditable source patch and source-overlay files with build recipes.
patch=[];records=[]
for name in ['src/quickjs_backend.cpp','lib/sdl/main_sdl.cpp','src/multiint.cpp','src/wrappers.cpp','src/display3d.cpp','src/hci.cpp']:
 data=(source/name).read_bytes();records.append({'path':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
 patch.append(''.join(difflib.unified_diff(original(name).splitlines(True),data.decode().splitlines(True),fromfile='a/'+name,tofile='b/'+name)))
 (OUT/Path(name).name).write_bytes(data)
(OUT/'native-ui.patch').write_text(''.join(patch),newline='\n')
(OUT/'source-overlays.json').write_text(json.dumps({'upstreamCommit':'7d3d8e51a61ceee89e6bf672a41337e1a9cd7392','nativeDataUnchanged':True,'simulationSourcesUnchanged':True,'changed':records},indent=2))
print(json.dumps(records))
