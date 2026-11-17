"""Recompile only offline HCI; relink shared/Towers without touching frozen caches."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,runpy,shutil
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/native-090'
H=runpy.run_path(str(ROOT/'tools/build-native-selection-089.py'));digest=H['digest'];jwrite=H['jwrite']
def main():
    history=ROOT/'release-records/native-before-constructor-api';old=json.loads((history/'native-build.json').read_text())
    assert old['passed'] and digest(OUT/'native-build.json')==digest(history/'native-build.json'),'Preserve any later build before rerunning'
    cache=Path(old['cacheRoots']['offline']);before=H['frozen'](cache)
    jwrite(OUT/'proof/offline-constructor-cache-before.json',before)
    for link in old['links']:
        for row in link['raw']:assert digest(OUT/'raw'/link['variant']/row['file'])==row['sha256']
    env=H['environment'](cache);source=OUT/'source/offline/src/hci.cpp';obj=OUT/'objects/offline/hci-constructors.cpp.o'
    original,command=H['compile_command'](cache,'src/hci.cpp',source,obj);command[1:1]=['-iquote',str(OUT/'source/common')]
    seconds=H['execute'](command,cache,env,OUT/'logs/compile-offline-hci-constructors.log')
    compile_row=dict(family='offline',path='src/hci.cpp',object=str(obj.relative_to(OUT)),sha256=digest(obj),seconds=seconds,
                     originalCommand=original,isolatedCommand=command)
    print(json.dumps(dict(compiledConstructorHCI=compile_row['sha256'],seconds=seconds)),flush=True)
    def link_one(variant):
        replacements={H['target']('src/display3d.cpp'):OUT/'objects/offline/display3d.cpp.o',H['target']('src/hci.cpp'):obj}
        if variant=='shared':replacements[H['target']('src/droid.cpp')]=OUT/'objects/shared051/droid.cpp.o'
        output=OUT/'raw'/('constructor-'+variant);output.mkdir(parents=True,exist_ok=True)
        original,command,omitted=H['link_command'](cache,replacements,output)
        seconds=H['execute'](command,cache,env,OUT/'logs'/('link-constructors-'+variant+'.log'))
        rows=[dict(file=name,bytes=(output/name).stat().st_size,sha256=digest(output/name))for name in ['warzone2100.js','warzone2100.wasm']]
        for row in rows:shutil.copy2(output/row['file'],OUT/'raw'/variant/row['file'])
        print(json.dumps(dict(linked=variant,seconds=seconds,raw=rows)),flush=True)
        return dict(variant=variant,originalCommand=original,isolatedCommand=command,omittedMissingGeneratedPreloads=omitted,seconds=seconds,raw=rows)
    with ThreadPoolExecutor(max_workers=2)as pool:links=list(pool.map(link_one,['shared','towers']))
    after=H['frozen'](cache);jwrite(OUT/'proof/offline-constructor-cache-after.json',after);assert before==after
    proof=dict(old);proof['sourceChanges']=json.loads((OUT/'source-preparation.json').read_text())['sourceChanges']
    proof['links']=links+[next(x for x in old['links']if x['variant']=='multiplayer')]
    proof['compileResults']=[x for x in old['compileResults']if not(x['family']=='offline'and x['path']=='src/hci.cpp')]+[compile_row]
    proof['compiles']=[x for x in old['compiles']if not(x['family']=='offline'and x['path']=='src/hci.cpp')]+[compile_row]
    proof['sourceInputs']=[dict(path=p.relative_to(ROOT).as_posix(),sha256=digest(p))for p in sorted((OUT/'source').rglob('*'))if p.is_file()]
    proof['constructorAPIRebuild']=dict(previousBuildSHA256=digest(history/'native-build.json'),previousProofDirectory=str(history.relative_to(ROOT)),
        compiledObjects=['offline/hci-constructors.cpp.o'],relinked=['shared','towers'],multiplayerPairUnchanged=True,offlineCacheUnchanged=True)
    jwrite(OUT/'native-build.json',proof)
    print(json.dumps(dict(passed=True,offlineOnlyRebuild=True,multiplayerNativeUnchanged=True)),flush=True)
if __name__=='__main__':main()
