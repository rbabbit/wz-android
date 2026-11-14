"""Build one exact-subject Towers cancellation hook in the matched v0.42 cache.

Only quickjs_backend.cpp is compiled. Existing native cancellation owns refunds;
this does not alter production, costs, timers or queue processing globally.
"""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import argparse
import difflib
import json
import os
import re
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'archive/native-queue-0.43'
PREVIOUS = ROOT / 'archive/native-theme-0.42/native-build.json'
BEFORE = 'a3096beab0f866dd53176fe4d705ed1eee9da50da2e322608efcec2b57f80072'
EXPECTED_OBJECTS = ['src/CMakeFiles/warzone2100.dir/quickjs_backend.cpp.o']
HELPER = r'''
// A deliberate Towers command may cancel only the exact observed current unit.
// Keep refunds and power requests in the original native cancellation routine.
static JSValue towersCancelProductionJS(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
#ifdef __EMSCRIPTEN__
\tif (argc != 3 || engineToInstanceMap.at(ctx)->player() != selectedPlayer) return JS_FALSE;
\tFILE *marker = fopen("/tmp/warzone-towers-ui-v34", "rb");
\tif (!marker) return JS_FALSE;
\tconst bool enabled = fgetc(marker) == '1';
\tfclose(marker);
\tif (!enabled) return JS_FALSE;
\tuint32_t identity[3];
\tfor (int i = 0; i < 3; ++i)
\t{
\t\tdouble value;
\t\tif (!JS_IsNumber(argv[i]) || JS_ToFloat64(ctx, &value, argv[i]) < 0
\t\t\t|| !(value >= 0 && value <= std::numeric_limits<uint32_t>::max())
\t\t\t|| value != static_cast<uint32_t>(value)) return JS_FALSE;
\t\tidentity[i] = static_cast<uint32_t>(value);
\t}
\tSTRUCTURE *structure = IdToStruct(identity[0], selectedPlayer);
\tif (!structure || structure->player != selectedPlayer || structure->status != SS_BUILT
\t\t|| !structure->isFactory() || !structure->pFunctionality) return JS_FALSE;
\tFACTORY &factory = structure->pFunctionality->factory;
\tif (!factory.psSubject || factory.psSubject->multiPlayerID != identity[1]
\t\t|| factory.timeStarted != identity[2] || factory.pendingCount != 0
\t\t|| factory.productionLoops != 0 || productionPlayer != selectedPlayer
\t\t|| !factory.psAssemblyPoint || factory.psAssemblyPoint->factoryType >= NUM_FACTORY_TYPES) return JS_FALSE;
\t// App FIFO entries live in the scenario. Never clear or rewrite a stock run.
\tconst auto &runs = asProductionRun[factory.psAssemblyPoint->factoryType];
\tif (factory.psAssemblyPoint->factoryInc < runs.size())
\t{
\t\tfor (const auto &entry : runs[factory.psAssemblyPoint->factoryInc])
\t\t{
\t\t\tif (entry.numRemaining() > 0) return JS_FALSE;
\t\t}
\t}
\tcancelProduction(structure, ModeImmediate, false);
\treturn JS_NewBool(ctx, factory.psSubject == nullptr);
#else
\treturn JS_FALSE;
#endif
}

'''.replace('\\t', '\t')


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def reconstruct(original):
    assert sha256(original).hexdigest() == BEFORE
    text = original.decode()
    anchor = 'JSValue convStructure(const STRUCTURE *psStruct, JSContext *ctx)\n'
    assert text.count(anchor) == 1
    text = text.replace(anchor, HELPER + anchor, 1)
    anchor = '\tJS_REGISTER_FUNC(getDroidProduction, 1); // WZAPI\n'
    assert text.count(anchor) == 1
    text = text.replace(anchor, anchor + '\tJS_REGISTER_FUNC_NAME(towersCancelProduction, 3, towersCancelProductionJS); // Towers exact-current cancellation\n', 1)
    return text.encode()


reconstruct_source = reconstruct


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8', newline='\n')


def prepare():
    OUT.mkdir(parents=True, exist_ok=True)
    original = (ROOT / 'archive/native-production-0.41/quickjs_backend.cpp').read_bytes()
    after = reconstruct(original)
    before_path = OUT / 'original-quickjs_backend.cpp'
    before_path.write_bytes(original)
    (OUT / 'quickjs_backend.cpp').write_bytes(after)
    patch = ''.join(difflib.unified_diff(original.decode().splitlines(True), after.decode().splitlines(True),
                                      fromfile='a/src/quickjs_backend.cpp', tofile='b/src/quickjs_backend.cpp'))
    (OUT / 'native-queue.patch').write_text(patch, encoding='utf-8', newline='\n')
    previous = json.loads(PREVIOUS.read_text())
    record = {'version':'0.43','guardPassed':True,
              'scope':'One Towers-only exact-current cancellation hook; existing native refund and custom FIFO preserved',
              'baselineSource':'archive/native-production-0.41/quickjs_backend.cpp',
              'originalSource':'archive/native-queue-0.43/original-quickjs_backend.cpp','beforeSHA256':BEFORE,
              'source':'archive/native-queue-0.43/quickjs_backend.cpp','afterSHA256':sha256(after).hexdigest(),
              'patch':'archive/native-queue-0.43/native-queue.patch','patchSHA256':digest(OUT/'native-queue.patch'),
              'previousNativeBuild':'archive/native-theme-0.42/native-build.json','previousNativeBuildSHA256':digest(PREVIOUS),
              'preservedSourceOverlays':previous['sourceOverlays'],
              'originalBuildRecipeSHA256':digest(ROOT/'tools/build-native-blueprint.sh')}
    write_json(OUT/'source-overlay.json', record)
    return record, previous


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--incremental-cache',type=Path)
    p.add_argument('--raw-out',type=Path,default=ROOT.parent/'_release-records/native-queue043/raw')
    p.add_argument('--prepare-only',action='store_true')
    a=p.parse_args()
    overlay,previous=prepare()
    if a.prepare_only:
        print(json.dumps(overlay)); return
    assert os.name!='nt' and a.incremental_cache
    cache=a.incremental_cache.resolve()
    for name,expected in previous['sourceOverlays'].items():
        assert digest(cache/'source/src'/name)==expected,'Earlier source overlay changed: '+name
    for row in previous['raw']:
        assert digest(cache/'build/src'/row['file'])==row['sha256'],'Raw v0.42 output differs'
    assert ROOT not in a.raw_out.resolve().parents
    a.raw_out.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(OUT/'quickjs_backend.cpp',cache/'source/src/quickjs_backend.cpp')
    log=OUT/'native-build.log'
    command=['bash','-c','source "$1/emsdk/emsdk_env.sh" && cmake --build "$1/build" --target warzone2100 --parallel 4',
             'native-queue-043',str(cache)]
    start=time.monotonic()
    with log.open('w') as stream:
        subprocess.run(command,stdout=stream,stderr=subprocess.STDOUT,check=True,timeout=240)
    elapsed=time.monotonic()-start
    text=log.read_text();compiled=re.findall(r'Building CXX object (\S+)',text)
    assert compiled==EXPECTED_OBJECTS,'Unexpected compile scope: '+str(compiled)
    assert len(re.findall(r'Linking CXX executable[^\n]*warzone2100',text))==1
    for name,expected in previous['sourceOverlays'].items():
        if name!='quickjs_backend.cpp': assert digest(cache/'source/src'/name)==expected
    record={'version':'0.43','passed':True,'emulatorUsed':False,'androidRuntimeExecuted':False,
            'gameplayVerified':False,'nativeBuildPerformed':True,'nativeFullFreshBuildPerformed':False,
            'relinkedNativeEngine':True,'compiledObjects':compiled,'elapsedSeconds':round(elapsed,3),'command':command,
            'cachePath':str(cache),'previousNativeBuild':overlay['previousNativeBuild'],
            'previousNativeBuildSHA256':digest(PREVIOUS),'sourceOverlay':'archive/native-queue-0.43/source-overlay.json',
            'sourceOverlaySHA256':digest(OUT/'source-overlay.json'),
            'preservedSourceOverlays':previous['sourceOverlays'],
            'sourceOverlays':dict(previous['sourceOverlays'],**{'quickjs_backend.cpp':digest(OUT/'quickjs_backend.cpp')}),
            'log':'archive/native-queue-0.43/native-build.log','logSHA256':digest(log),
            'recordedUTC':datetime.now(timezone.utc).isoformat(),'raw':[]}
    for name in ['warzone2100.js','warzone2100.wasm']:
        target=a.raw_out/name;shutil.copy2(cache/'build/src'/name,target)
        record['raw'].append({'file':name,'bytes':target.stat().st_size,'sha256':digest(target)})
    write_json(OUT/'native-build.json',record)
    print(json.dumps(record))


if __name__=='__main__': main()
