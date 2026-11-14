"""Add campaign opt-ins to the matched v0.50 native source; four objects/one link."""
from pathlib import Path
from hashlib import sha256
import argparse, difflib, json, os, shutil, subprocess, time
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'archive/native-campaign-0.51'
PREV=ROOT/'archive/native-touch-0.50/native-build.json'
MARKER='/tmp/warzone-campaign-mobile-v51'

def digest(p): return sha256(p.read_bytes()).hexdigest()
def write(p,x): p.write_text(json.dumps(x,indent=2)+'\n',encoding='utf-8',newline='\n')
def replace(s,a,b):
    assert s.count(a)==1, a[:100]
    return s.replace(a,b,1)

def marker_gate(variable='marker', std=''):
    return f'''FILE *{variable} = {std}fopen("/tmp/warzone-towers-ui-v34", "rb");
\tif ({variable}) {{ const bool enabled = {std}fgetc({variable}) == '1'; {std}fclose({variable}); if (enabled) return true; }}
\t{variable} = {std}fopen("{MARKER}", "rb");
\tif (!{variable}) return false;
\tconst bool enabled = {std}fgetc({variable}) == '1';
\t{std}fclose({variable});
\treturn enabled;'''

HCI=r'''
// Campaign opts into touch/native observation without Towers autosave/UI policy.
static bool campaignMobileEnabled()
{
#if defined(__EMSCRIPTEN__)
    FILE *file = fopen("/tmp/warzone-campaign-mobile-v51", "rb");
    if (!file) return false;
    const bool enabled = fgetc(file) == '1'; fclose(file); return enabled;
#else
    return false;
#endif
}

std::string campaignMobileNativeStateJSON()
{
    const bool video = loop_GetVideoStatus();
    const bool paused = gamePaused() || gameUpdatePaused();
    const bool help = intHelpOverlayIsUp();
    const bool menu = InGameOpUp || isInGamePopupUp || bLoadSaveUp || help || intMode != INT_NORMAL;
    const bool playing = GetGameMode() == GS_NORMAL && game.type == LEVEL_TYPE::CAMPAIGN;
    return nlohmann::json{{"mode","campaign"},{"gameTime",gameTime},{"nativeLevel",getLevelName()},
        {"realTime",realTime},{"video",video},{"paused",paused},{"nativeMode",intMode},
        {"playing",playing},{"transportOpen",intMode == INT_TRANSPORTER},
        {"intelligenceOpen",intMode == INT_INTELMAP},{"nativeMenuOpen",menu},
        {"worldSafe",playing && !video && !paused && !menu}}.dump();
}

void campaignMobileFrame()
{
    if (!campaignMobileEnabled()) return;
    const auto value = campaignMobileNativeStateJSON();
    FILE *file = fopen("/tmp/warzone-campaign-state-v51.json.tmp", "wb");
    if (!file) return;
    fwrite(value.data(),1,value.size(),file); fclose(file);
    rename("/tmp/warzone-campaign-state-v51.json.tmp","/tmp/warzone-campaign-state-v51.json");
}

'''

QJS=r'''
// These campaign APIs are observational or ordinary native selection only.
extern std::string campaignMobileNativeStateJSON();
static bool campaignMobileScriptEnabled()
{
#if defined(__EMSCRIPTEN__)
    FILE *file = fopen("/tmp/warzone-campaign-mobile-v51", "rb");
    if (!file) return false;
    const bool enabled = fgetc(file) == '1'; fclose(file); return enabled;
#else
    return false;
#endif
}
static bool mobileProductionEnabled()
{
    FILE *file = fopen("/tmp/warzone-towers-ui-v34", "rb");
    if (file) { const bool enabled = fgetc(file) == '1'; fclose(file); if (enabled) return true; }
    return campaignMobileScriptEnabled();
}
static JSValue campaignMobileStateJS(JSContext *ctx, JSValueConst, int, JSValueConst *)
{
    if (!campaignMobileScriptEnabled()) return JS_UNDEFINED;
    const auto value = campaignMobileNativeStateJSON();
    return JS_ParseJSON(ctx,value.c_str(),value.size(),"campaign-mobile-state");
}
static JSValue campaignSelectCombatJS(JSContext *ctx, JSValueConst, int, JSValueConst *)
{
    if (!campaignMobileScriptEnabled() || game.type != LEVEL_TYPE::CAMPAIGN
        || engineToInstanceMap.at(ctx)->player() != selectedPlayer) return JS_FALSE;
    const auto state = nlohmann::json::parse(campaignMobileNativeStateJSON());
    if (!state.value("worldSafe",false)) return JS_FALSE;
    // Re-read the latest HTML intent; an in-flight command must not steal a
    // builder/transport selection after the user opens another control.
    FILE *file = fopen("/data/base/script/campaign/mobile/campaign-control.json","rb");
    if (!file) return JS_FALSE;
    char buffer[4097]; const size_t length = fread(buffer,1,4096,file); fclose(file);
    const auto control = nlohmann::json::parse(buffer,buffer+length,nullptr,false);
    if (!control.is_object() || !control.value("enabled",false) || control.value("suspended",true)) return JS_FALSE;
    const unsigned count = selDroidSelection(selectedPlayer,DS_BY_TYPE,DST_ALL_COMBAT,false);
    JSValue result = JS_NewObject(ctx), ids = JS_NewArray(ctx); uint32_t index=0;
    for (const DROID *droid : apsDroidLists[selectedPlayer])
        if (droid->selected) JS_SetPropertyUint32(ctx,ids,index++,JS_NewUint32(ctx,droid->id));
    JS_SetPropertyStr(ctx,result,"ok",JS_TRUE);
    JS_SetPropertyStr(ctx,result,"count",JS_NewUint32(ctx,count));
    JS_SetPropertyStr(ctx,result,"selectedIds",ids);
    return result;
}

'''

MAIN=r'''
// Only the separate Campaign host opts into native intro playback and state.
extern void campaignMobileFrame();
static bool campaignMobileStartup()
{
#if defined(__EMSCRIPTEN__)
    FILE *file = fopen("/tmp/warzone-campaign-mobile-v51", "rb");
    if (!file) return false;
    const bool enabled = fgetc(file) == '1'; fclose(file); return enabled;
#else
    return false;
#endif
}

'''

def patch(path,s):
    if path=='lib/sdl/main_sdl.cpp':
        old='''FILE *marker = std::fopen("/tmp/warzone-towers-ui-v34", "rb");
\tif (!marker) return false;
\tconst bool enabled = std::fgetc(marker) == '1';
\tstd::fclose(marker);
\treturn enabled;'''
        return replace(s,old,marker_gate(std='std::'))
    if path=='src/hci.cpp':
        old='''FILE *file = fopen("/tmp/warzone-towers-ui-v34", "rb");
\tif (!file) return false;
\tconst bool enabled = fgetc(file) == '1';
\tfclose(file);
\treturn enabled;'''
        s=replace(s,old,marker_gate('file'))
        return replace(s,'void intDisplayWidgets()\n{',HCI+'void intDisplayWidgets()\n{')
    if path=='src/quickjs_backend.cpp':
        s=replace(s,'#include "hci.h"','#include "hci.h"\n#include "selection.h"')
        s=replace(s,'// Towers-only read-only native production observation.',QJS+'// Towers-only read-only native production observation.')
        old='''FILE *marker = fopen("/tmp/warzone-towers-ui-v34", "rb");
\tif (!marker) return JS_UNDEFINED;
\tconst bool enabled = fgetc(marker) == '1';
\tfclose(marker);
\tif (!enabled) return JS_UNDEFINED;'''
        s=replace(s,old,'if (!mobileProductionEnabled()) return JS_UNDEFINED;')
        old=old.replace('JS_UNDEFINED','JS_FALSE')
        s=replace(s,old,'if (!mobileProductionEnabled()) return JS_FALSE;')
        return replace(s,'// Register functions to the script engine here',
            'JS_CFUNC_DEF_PLACEHOLDER\n\t// Register functions to the script engine here').replace('JS_CFUNC_DEF_PLACEHOLDER',
            'JS_SetPropertyStr(ctx,global_obj,"campaignMobileState",JS_NewCFunction(ctx,campaignMobileStateJS,"campaignMobileState",0));\n\tJS_SetPropertyStr(ctx,global_obj,"campaignSelectCombat",JS_NewCFunction(ctx,campaignSelectCombatJS,"campaignSelectCombat",0));')
    if path=='src/main.cpp':
        s=replace(s,'void mainLoop()\n{',MAIN+'void mainLoop()\n{')
        s=replace(s,'\twzApplyCursor();\n\trunNotifications();','\tcampaignMobileFrame();\n\twzApplyCursor();\n\trunNotifications();')
        old='''\tcase GS_NORMAL:
\t\tif (!startGameLoop())
\t\t{
\t\t\t// Attempted to load straight into a game from the command-line'''
        new='''\tcase GS_NORMAL:
\t\tif (campaignMobileStartup() && game.type == LEVEL_TYPE::CAMPAIGN && strcmp(aLevelName,"CAM_1A") == 0)
\t\t{
\t\t\t// Reuse the ordinary title-video -> queued STARTGAME path. Loading a
\t\t\t// campaign save uses GS_SAVEGAMELOAD and never replays this intro.
\t\t\tstartTitleLoop(true);
\t\t\tSPinit(LEVEL_TYPE::CAMPAIGN); sstrcpy(aLevelName,"CAM_1A");
\t\t\tqueuedTilecodeChange = TITLECODE_STARTGAME;
\t\t\tseq_ClearSeqList(); seq_AddSeqToList("cam1/c001.ogg",nullptr,"cam1/c001.txa",false);
\t\t\tseq_StartNextFullScreenVideo();
\t\t}
\t\telse if (!startGameLoop())
\t\t{
\t\t\t// Attempted to load straight into a game from the command-line'''
        return replace(s,old,new)
    raise AssertionError(path)

def main():
    p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--raw-out',type=Path,required=True);p.add_argument('--prepare-only',action='store_true');p.add_argument('--resume',action='store_true');a=p.parse_args()
    assert os.name!='nt';cache=a.cache.resolve();build=cache/'build';prev=json.loads(PREV.read_text())
    assert ROOT not in a.raw_out.resolve().parents
    draft=json.loads((OUT/'source-overlay.json').read_text()) if a.resume else None
    for name,h in prev['sourceOverlays'].items():
        path=name if '/' in name else 'src/'+name
        assert digest(cache/'source'/path) in [h,draft['sources'].get(path,{}).get('after') if draft else None],path
    for row in prev['raw']: assert digest(build/'src'/row['file'])==row['sha256']
    original_main=(OUT/'original-main.cpp').read_bytes() if a.resume else (cache/'source/src/main.cpp').read_bytes()
    assert subprocess.check_output(['git','-C',str(cache/'source'),'show','HEAD:src/main.cpp'])==original_main
    paths=['lib/sdl/main_sdl.cpp','src/hci.cpp','src/quickjs_backend.cpp','src/main.cpp']
    targets=['lib/sdl/CMakeFiles/sdl-backend.dir/main_sdl.cpp.o']+['src/CMakeFiles/warzone2100.dir/'+Path(name).name+'.o' for name in paths[1:]]
    OUT.mkdir(parents=True,exist_ok=True);sources={};delta=''
    before_objects=draft['preBuildObjects'] if draft else {str(q.relative_to(build)):digest(q) for folder in ['src','lib'] for q in (build/folder).rglob('*.o')}
    for name in paths:
        before=(OUT/('original-'+Path(name).name)).read_bytes() if a.resume else (cache/'source'/name).read_bytes();after=patch(name,before.decode()).encode()
        if draft: assert sha256(before).hexdigest()==draft['sources'][name]['before']
        assert after!=before
        (OUT/('original-'+Path(name).name)).write_bytes(before);(OUT/Path(name).name).write_bytes(after)
        sources[name]={'before':sha256(before).hexdigest(),'after':sha256(after).hexdigest()}
        delta+=''.join(difflib.unified_diff(before.decode().splitlines(True),after.decode().splitlines(True),fromfile='a/'+name,tofile='b/'+name))
    (OUT/'native-campaign.patch').write_text(delta,encoding='utf-8',newline='\n')
    commands=[]
    for target in targets+['lib/sdl/libsdl-backend.a','warzone2100']:
        commands.append(subprocess.check_output(['ninja','-C',str(build),'-t','commands',target],text=True).splitlines()[-1])
    for target,command in zip(targets,commands):assert target in command and ' -c ' in command
    assert 'emar qc lib/sdl/libsdl-backend.a' in commands[-2] and ' -o src/warzone2100.html ' in commands[-1]
    proof={'version':'0.51','guardPassed':True,'previousProof':str(PREV.relative_to(ROOT)),'previousSHA256':digest(PREV),'sources':sources,'commands':commands,'preservedOverlays':prev['sourceOverlays'],'preBuildObjects':before_objects,'recipeSHA256':digest(Path(__file__))}
    write(OUT/'source-overlay.json',proof)
    if a.prepare_only: print('campaign native source prepared');return
    for name in paths:shutil.copyfile(OUT/Path(name).name,cache/'source'/name)
    started=time.monotonic();log=OUT/'native-build.log'
    with log.open('w') as stream:
        for i,command in enumerate(commands):
            stream.write('\n[step '+str(i)+']\n'+command+'\n');stream.flush()
            subprocess.run(['bash','-c','source "$1/emsdk/emsdk_env.sh" >/dev/null 2>&1 && cd "$1/build" && eval "$2"','campaign051',str(cache),command],stdout=stream,stderr=subprocess.STDOUT,check=True,timeout=240)
    after_objects={str(q.relative_to(build)):digest(q) for folder in ['src','lib'] for q in (build/folder).rglob('*.o')}
    changed=sorted(name for name,h in before_objects.items() if after_objects[name]!=h);assert changed==sorted(targets),changed
    for name,h in prev['sourceOverlays'].items():
        path=name if '/' in name else 'src/'+name
        assert digest(cache/'source'/path)==(sources[path]['after'] if path in sources else h)
    a.raw_out.mkdir(parents=True,exist_ok=True)
    result={'version':'0.51','passed':True,'nativeFullFreshBuildPerformed':False,'compiledObjects':targets,'changedObjects':changed,'otherObjectsUnchanged':len(before_objects)-len(changed),'executableLinks':1,'elapsedSeconds':round(time.monotonic()-started,3),'sourceOverlaySHA256':digest(OUT/'source-overlay.json'),'logSHA256':digest(log),'raw':[],'recordedUTC':datetime.now(timezone.utc).isoformat()}
    for name in ['warzone2100.js','warzone2100.wasm']:
        dest=a.raw_out/name;shutil.copy2(build/'src'/name,dest);result['raw'].append({'file':name,'bytes':dest.stat().st_size,'sha256':digest(dest)})
    write(OUT/'native-build.json',result);print(json.dumps(result))

if __name__=='__main__':main()
