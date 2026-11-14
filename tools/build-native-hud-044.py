"""Bounded Towers power-gauge presentation and native autosave opt-out.

Only intdisplay.cpp and loadsave.cpp compile in the matched v0.43 cache. Actual
power accounting and explicit saveGame calls remain unchanged. No runtime test.
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
OUT = ROOT / 'archive/native-hud-0.44'
PREVIOUS = ROOT / 'archive/native-queue-0.43/native-build.json'
ORIGINAL = {
    'intdisplay.cpp': 'c3e78b002a00be9b6d0843120f63c63fcccca1aa5e1a0fb39043a6bc4541e673',
    'loadsave.cpp': 'fe62f8484ec76549b4ef113afafd12ddc6cb21c76346bf5be1fd8e39829227e6',
}
EXPECTED_OBJECTS = ['src/CMakeFiles/warzone2100.dir/intdisplay.cpp.o',
                    'src/CMakeFiles/warzone2100.dir/loadsave.cpp.o']
AUTOSAVE_GATE = '''
// The phone Towers host owns explicit Save; never schedule native autosaves.
static bool towersDisablesAutoSave()
{
#ifdef __EMSCRIPTEN__
\tFILE *marker = fopen("/tmp/warzone-towers-ui-v34", "rb");
\tif (!marker) return false;
\tconst bool enabled = fgetc(marker) == '1';
\tfclose(marker);
\treturn enabled;
#else
\treturn false;
#endif
}

'''


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def replace_once(text, before, after):
    assert text.count(before) == 1, 'Unexpected source anchor: ' + before[:90]
    return text.replace(before, after, 1)


def reconstruct(name, original):
    assert sha256(original).hexdigest() == ORIGINAL[name], 'Original source differs: ' + name
    text = original.decode()
    if name == 'intdisplay.cpp':
        text = replace_once(text, '\tdouble desiredPower = getPowerMinusQueued(selectedPlayer);\n',
                            '\tconst bool sage = towersSageTheme();\n\tconst UDWORD previewPower = ManuPower;\n\tdouble desiredPower = getPowerMinusQueued(selectedPlayer);\n')
        text = replace_once(text, '\tBarWidth -= textWidth;\n', '''\tBarWidth -= textWidth;

\tif (sage)
\t{
\t\t// This is a display scale, not a power-storage limit. The original
\t\t// fixed pixels-per-power scale was already full around 2500 power.
\t\tdouble displayRange = 5000.;
\t\twhile (std::max(displayPower, static_cast<double>(previewPower)) > displayRange)
\t\t\tdisplayRange *= 2.;
\t\tManPow = static_cast<SDWORD>(previewPower * static_cast<double>(BarWidth) / displayRange);
\t\tAvail = static_cast<SDWORD>(displayPower * BarWidth / displayRange);
\t\tif (displayPower < 0 && Avail == 0) Avail = -1;
\t}
''')
        text = replace_once(text, '\tconst bool sage = towersSageTheme();\n\t// Keep the exact original segment positions and work values; only pixels differ.\n',
                            '\t// Actual resource values stay native; the Towers scale leaves visible headroom.\n')
    elif name == 'loadsave.cpp':
        text = replace_once(text, '#include <ctime>\n', '#include <ctime>\n#include <cstdio>\n')
        text = replace_once(text, 'static bool doAutoSave()\n{\n', AUTOSAVE_GATE + 'static bool doAutoSave()\n{\n\tif (towersDisablesAutoSave()) return false;\n')
        text = replace_once(text, 'bool autoSave(bool force)\n{\n',
                            'bool autoSave(bool force)\n{\n\tif (towersDisablesAutoSave()) return false;\n')
    else:
        raise ValueError(name)
    return text.encode()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8', newline='\n')


def prepare():
    OUT.mkdir(parents=True, exist_ok=True)
    previous = json.loads(PREVIOUS.read_text())
    patch = ''
    originals, afters = {}, {}
    for name in ORIGINAL:
        before = OUT / ('original-' + name)
        original = before.read_bytes()
        after = reconstruct(name, original)
        (OUT / name).write_bytes(after)
        patch += ''.join(difflib.unified_diff(original.decode().splitlines(True), after.decode().splitlines(True),
                                            fromfile='a/src/' + name, tofile='b/src/' + name))
        originals[name] = digest(before)
        afters[name] = sha256(after).hexdigest()
    (OUT / 'native-hud.patch').write_text(patch, encoding='utf-8', newline='\n')
    record = {'version':'0.44', 'guardPassed':True,
              'scope':'Towers-only power-gauge headroom/contrast; actual power accounting untouched; disable native automatic-save trigger and queued write only',
              'originalSources':originals, 'sourceOverlays':afters,
              'patch':'archive/native-hud-0.44/native-hud.patch', 'patchSHA256':digest(OUT/'native-hud.patch'),
              'previousNativeBuild':'archive/native-queue-0.43/native-build.json', 'previousNativeBuildSHA256':digest(PREVIOUS),
              'preservedSourceOverlays':previous['sourceOverlays'],
              'originalBuildRecipeSHA256':digest(ROOT/'tools/build-native-blueprint.sh')}
    write_json(OUT/'source-overlay.json', record)
    return record, previous


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--incremental-cache',type=Path)
    parser.add_argument('--raw-out',type=Path,default=ROOT.parent/'_release-records/native-hud044/raw')
    parser.add_argument('--prepare-only',action='store_true')
    args=parser.parse_args()
    overlay,previous=prepare()
    if args.prepare_only:
        print(json.dumps(overlay)); return
    assert os.name!='nt' and args.incremental_cache
    cache=args.incremental_cache.resolve()
    for name,expected in previous['sourceOverlays'].items():
        assert digest(cache/'source/src'/name)==expected, 'Earlier source overlay changed: '+name
    for name,expected in ORIGINAL.items():
        assert digest(cache/'source/src'/name)==expected, 'Baseline render/save source changed: '+name
    for row in previous['raw']:
        assert digest(cache/'build/src'/row['file'])==row['sha256'], 'Raw v0.43 output differs'
    assert ROOT not in args.raw_out.resolve().parents
    args.raw_out.mkdir(parents=True,exist_ok=True)
    for name in ORIGINAL: shutil.copyfile(OUT/name,cache/'source/src'/name)
    log=OUT/'native-build.log'
    command=['bash','-c','source "$1/emsdk/emsdk_env.sh" && cmake --build "$1/build" --target warzone2100 --parallel 4',
             'native-hud-044',str(cache)]
    start=time.monotonic()
    with log.open('w') as stream:
        subprocess.run(command,stdout=stream,stderr=subprocess.STDOUT,check=True,timeout=240)
    elapsed=time.monotonic()-start
    text=log.read_text(); compiled=re.findall(r'Building CXX object (\S+)',text)
    assert sorted(compiled)==EXPECTED_OBJECTS, 'Unexpected compile scope: '+str(compiled)
    assert len(re.findall(r'Linking CXX executable[^\n]*warzone2100',text))==1
    for name,expected in previous['sourceOverlays'].items():
        if name not in ORIGINAL: assert digest(cache/'source/src'/name)==expected
    record={'version':'0.44','passed':True,'emulatorUsed':False,'androidRuntimeExecuted':False,'gameplayVerified':False,
            'nativeBuildPerformed':True,'nativeFullFreshBuildPerformed':False,'relinkedNativeEngine':True,
            'compiledObjects':compiled,'elapsedSeconds':round(elapsed,3),'command':command,'cachePath':str(cache),
            'previousNativeBuild':overlay['previousNativeBuild'],'previousNativeBuildSHA256':digest(PREVIOUS),
            'sourceOverlay':'archive/native-hud-0.44/source-overlay.json','sourceOverlaySHA256':digest(OUT/'source-overlay.json'),
            'preservedSourceOverlays':previous['sourceOverlays'],
            'sourceOverlays':dict(previous['sourceOverlays'],**{name:digest(OUT/name) for name in ORIGINAL}),
            'log':'archive/native-hud-0.44/native-build.log','logSHA256':digest(log),
            'recordedUTC':datetime.now(timezone.utc).isoformat(),'raw':[]}
    for name in ['warzone2100.js','warzone2100.wasm']:
        target=args.raw_out/name;shutil.copy2(cache/'build/src'/name,target)
        record['raw'].append({'file':name,'bytes':target.stat().st_size,'sha256':digest(target)})
    write_json(OUT/'native-build.json',record)
    print(json.dumps(record))


if __name__=='__main__':main()
