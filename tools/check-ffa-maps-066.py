"""Check all six original maps and the isolated FFA payload against v0.65.

No native engine or device is executed. Gameplay/AI/pathfinding validation is
explicitly reserved for the exact delivery APK on the prepared emulator.
"""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
from PIL import Image
import json
import re
import runpy
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets/warzone"
HELPERS = runpy.run_path(str(ROOT / "tools/build-ffa-package.py"),run_name="ffa066_check_helpers")
PACKAGE = HELPERS["package_call"]


def digest(value):
    return sha256(value).hexdigest()


def file_digest(path):
    result=sha256()
    with path.open("rb") as stream:
        for block in iter(lambda:stream.read(4*1024*1024),b""):result.update(block)
    return result.hexdigest()


def read_vfs(js,data):
    a,b,_,package=PACKAGE(js)
    assert package["remote_package_size"]==len(data)
    assert len(package["files"])==len({row["filename"] for row in package["files"]})
    assert all(0<=row["start"]<=row["end"]<=len(data) for row in package["files"])
    return js[:a]+"PACKAGE"+js[b:],{row["filename"]:data[row["start"]:row["end"]] for row in package["files"]}


def function_sections(source):
    matches=list(re.finditer(r"^function ([A-Za-z0-9_]+)\(",source,re.M))
    return {match[1]:source[match.start():matches[i+1].start() if i+1<len(matches) else len(source)] for i,match in enumerate(matches)}


def main():
    fallback=json.loads((ROOT/"archive/fallback-0.66.json").read_text())
    assert fallback["version"]=="0.66" and fallback["baseline"]=="0.65"
    paths={}
    for row in fallback["files"]:
        path=Path(row["path"]);assert path.stat().st_size==row["bytes"] and file_digest(path)==row["sha256"]
        paths[path.suffix.lower()]=path
    catalogue=json.loads((ROOT/"app/src/main/assets/ffa-maps.json").read_text())
    manifest=json.loads((ROOT/"vendor/ffa-maps/PROVENANCE.json").read_text())
    maps=catalogue["maps"]
    assert [row["id"] for row in maps]==["emag","contact","templar-ffa","rb-simple","rb-usefull","emaj-6p"]
    assert [row["players"] for row in maps]==[4,4,4,4,4,6]
    assert len({row["level"] for row in maps})==6
    current_js=(ASSETS/"warzone2100-ffa.js").read_text(encoding="utf-8")
    current_data=(ASSETS/"warzone2100-ffa.data").read_bytes()
    body,vfs=read_vfs(current_js,current_data)
    package_proof=json.loads((ROOT/"scenario/ffa/PACKAGE.json").read_text())
    assert package_proof["nativePreloadDirectories"]==sorted({str(Path(name).parent).replace('\\','/') for name in vfs}),"Preload parent coverage changed"
    frozen={}
    authorized_wrapper_changes=[]
    with ZipFile(paths[".apk"]) as old,ZipFile(paths[".zip"]) as source:
        old_body,before=read_vfs(old.read("assets/warzone/warzone2100-ffa.js").decode(),old.read("assets/warzone/warzone2100-ffa.data"))
        assert body==old_body,"Compiled FFA program changed"
        assert digest(current_data[:HELPERS["STOCK_SIZE"]])==HELPERS["STOCK_HASH"]
        for name in old.namelist():
            if not name.startswith("assets/warzone/") or name.endswith("/"):continue
            base=Path(name).name
            if "-ffa" in base or not base.startswith(("warzone2100","index","mobile")):continue
            path=ASSETS/base
            baseline=old.read(name)
            if base=="index-campaign.html":
                current=path.read_text(encoding="utf-8")
                normalized=current.replace('    <script src="music-catalog.js"></script>\n','',1).replace('    <script src="music-loader.js"></script>\n','',1)
                normalized=normalized.replace("const musicConfig = 'music_enabled=0\\n' + audioLevels;","const musicConfig = 'music_enabled=1\\n' + audioLevels;",1)
                assert normalized==baseline.decode("utf-8").replace("\r\n","\n"),"Campaign wrapper changed outside authorized music integration"
                authorized_wrapper_changes.append({"path":path.relative_to(ROOT).as_posix(),"scope":"Root-owned music loader includes and native music disable only","sha256":file_digest(path)})
                continue
            assert path.read_bytes()==baseline,"Other mode native asset changed: "+base
            frozen[path.relative_to(ROOT).as_posix()]=file_digest(path)
        touch=ROOT/"app/src/main/assets/warzone-touch-controls.js"
        touch_before=old.read("assets/warzone-touch-controls.js").decode("utf-8").replace("\r\n","\n")
        touch_current=touch.read_text(encoding="utf-8")
        touch_normalized=touch_current.replace("        if(campaign||ffa)rewards.remove();", "        if(campaign){music.remove();rewards.remove();}\n        if(ffa){music.remove();rewards.remove();}",1)
        assert touch_normalized==touch_before,"Touch/input changed outside authorized music button visibility"
        authorized_wrapper_changes.append({"path":touch.relative_to(ROOT).as_posix(),"scope":"Root-owned music button visibility only; all gesture/input lines preserved","sha256":file_digest(touch)})
        changed_existing=sorted(name for name in before if before[name]!=vfs.get(name))
        allowed={"/data/mp/addon.lev","/data/mp/tests/ffa-policy.js","/data/mp/tests/ffa-rules.js","/data/mp/multiplay/script/rules/init.js"}
        allowed.update("/data/mp/"+folder+"/ffa-config.json" for folder in ("multiplay/script","multiplay/script/rules","multiplay/skirmish"))
        assert set(changed_existing)==allowed,"Unexpected existing FFA VFS changes: "+str(set(changed_existing)^allowed)
        assert set(before)<=set(vfs),"Existing native VFS file removed"
        cobra=json.loads((ROOT/"scenario/ffa/COBRA.json").read_text())
        for row in cobra["files"]:
            assert before[row["path"]]==vfs[row["path"]] and digest(vfs[row["path"]])==row["sha256"]
        for name in ("/data/mp/multiplay/skirmish/ffa-nullbot.js","/data/mp/multiplay/skirmish/ffa-nullbot.json"):
            assert before[name]==vfs[name]
        unchanged_sources=["ai.js","ai.json","command-policy.js","commands.js","research-bridge.js","research.json","templates.json","policy.json","endconditions.js","camTechEnabler.js"]
        for name in unchanged_sources:
            assert (ROOT/"scenario/ffa"/name).read_bytes()==source.read("scenario/ffa/"+name),"Unrelated FFA source changed: "+name
        old_rules=source.read("scenario/ffa/rules.js").decode().replace("\r\n","\n")
        new_rules=(ROOT/"scenario/ffa/rules.js").read_text(encoding="utf-8")
        old_functions,new_functions=function_sections(old_rules),function_sections(new_rules)
        assert set(new_functions)-set(old_functions)=={"ffaPlayerIds","ffaApplyAuthoredStructureLimits"}
        allowed_functions={"ffaApplyAirLimits","ffaNativeMatchBotType","ffaPlayerDiagnostic","ffaEmit","ffa_eventGameInit","ffa_eventResearched"}
        changed_functions=[]
        for name,content in old_functions.items():
            current=new_functions[name]
            if name=="ffaSetTimer":
                # Added player-range helper is located later among globals;
                # compare the original timer helper's own function only.
                content=content[:content.index('include("tests/ffa-policy.js")')]
                current=current[:current.index('include("tests/ffa-policy.js")')]
            if content!=current:
                # ffaPlayerIds sits between old saved globals and ffaPartId,
                # extending the prior applyLimitSet function slice only.
                if name=="ffaApplyAirLimits" or name in allowed_functions:changed_functions.append(name)
                else:assert False,"Unrelated FFA function changed: "+name
        for name in ("ffaStart","ffaSetTimer","ffa_eventStartLevel","ffa_eventGameLoaded"):
            assert old_functions[name].split('include("tests/ffa-policy.js")')[0]==new_functions[name].split('include("tests/ffa-policy.js")')[0],"Timer ownership changed: "+name
    map_results=[]
    for row,proof in zip(maps,manifest["maps"]):
        assert row["id"]==proof["id"] and row["players"]==len(proof["starts"]) and row["bots"]==row["players"]-1
        original=ROOT/proof["source"];assert file_digest(original)==row["sourceSHA256"]==proof["sourceSHA256"]
        with ZipFile(original) as archive:
            for mapping in proof["mappings"]:
                raw=archive.read(mapping["original"])
                assert raw==(ROOT/mapping["host"]).read_bytes()==vfs[mapping["virtual"]]
                assert digest(raw)==mapping["sha256"]
        for difficulty in ("easy","medium","hard"):
            challenge=json.loads(vfs["/data/mp/tests/ffa-"+row["id"]+"-"+difficulty+".json"])
            assert challenge["challenge"]["map"]==row["level"] and challenge["challenge"]["maxPlayers"]==row["players"]
            assert challenge["challenge"]["alliances"]==challenge["challenge"]["scavengers"]==0
            assert set(key for key in challenge if key.startswith("player_"))=={"player_"+str(i) for i in range(row["players"])}
            for player in range(row["players"]):
                slot=challenge["player_"+str(player)];assert slot["team"]==slot["position"]==player
                if player:assert slot["ai"]=="multiplay/skirmish/Cobra.js" and slot["difficulty"]==difficulty.title()
                else:assert "ai" not in slot
        assert proof["descriptor"].encode() in vfs["/data/mp/addon.lev"]
        assert ("dataset MULTI_CAM_2" in proof["descriptor"])==(row["tileset"]=="urban")
        preview=ROOT/"app/src/main/assets"/row["preview"]
        with Image.open(preview) as image:assert image.size==(row["width"]*4,row["height"]*4)
        map_results.append({"id":row["id"],"players":row["players"],"sourceSHA256":row["sourceSHA256"],"nativeFilesByteIdentical":True,"mapVersion":proof["mapVersion"],"starts":proof["starts"],"oilLocations":proof["oilLocations"],"previewSHA256":file_digest(preview)})
    assert maps[0]["level"]=="FFA-EMAG-T1" and map_results[2]["mapVersion"]==10
    for script in ["scenario/ffa/policy.js","scenario/ffa/rules.js","app/src/main/assets/warzone-ffa-hud.js","app/src/main/assets/warzone/saved-games.js"]:
        subprocess.run(["node","--check",str(ROOT/script)],check=True,capture_output=True)
    report={"version":"0.66","passed":True,"fallbackBaseline":"0.65","noNativeBuild":True,"compiledFFAProgramUnchanged":True,
        "stockPrefixSHA256":HELPERS["STOCK_HASH"],"frozenOtherNativeAssetsAndTouch":frozen,"changedExistingVirtualFiles":changed_existing,
        "authorizedRootWrapperChanges":authorized_wrapper_changes,
        "newVirtualFiles":sorted(set(vfs)-set(before)),"mapResults":map_results,"stockCobraSourcesUnchanged":True,"legacyNullBotUnchanged":True,
        "unchangedFFASources":unchanged_sources,"changedNativeFunctions":changed_functions,"nativeTimerOwnershipUnchanged":True,
        "actualNativeEngineExecuted":False,"deviceQARemainsRequired":True,
        "nativePreloadDirectoriesDerivedFromEveryVFSParent":True,
        "outputs":[{"path":str(path.relative_to(ROOT)).replace('\\','/'),"sha256":file_digest(path)} for path in [ASSETS/"warzone2100-ffa.js",ASSETS/"warzone2100-ffa.data",ASSETS/"index-ffa.html",ASSETS/"mobile-ffa.html",ROOT/"app/src/main/assets/ffa-maps.json"]]}
    (ROOT/"archive/ffa-maps-0.66-payload.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8",newline="\n")
    print(json.dumps({"passed":True,"maps":len(maps),"nativeChallenges":18,"frozenAssets":len(frozen),"compiledNativeUnchanged":True,"deviceQARemainsRequired":True},indent=2))


if __name__=="__main__":main()
