"""Prepare the one-file native Intelligence metadata/render/audio extension.

Checks the ready v0.35 cache and full bundled source before installing the full
hci.cpp overlay. It does not build, install an APK, or change authored game data.
"""
from pathlib import Path
from hashlib import sha256
import argparse
import difflib
import json
import tarfile

ROOT = Path(__file__).resolve().parents[1]
BEFORE = 'aefa455ef2b228f8590b7d9a0aa6b18be70eb1dc2b82fde63116a57846782462'
WASM = '120457e5db655d819436f3c5315991cb013f771e01ace7a872469e0844796380'
RAW_JS = '8a6a88e7d302722ce1095d3c2d194a5f1212fd947e36ded4c3a8679d4145e0c2'
PRESERVED = {'display3d.cpp':'3b5c1a41144011805819d15e9bfac6f1289d726da276433bfeb237904c0fa15f',
             'research.cpp':'06b8999191bb0160e6b73c268f8ddd69347102133ecc221aee23504973dc918a',
             'keybind.cpp':'5730cf9a2b791a6a437f4e0da040e9dbb75e8befb48dc02caefb1a8e824355ed'}


def digest(value):
    return sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache',type=Path,required=True)
    args = parser.parse_args()
    source = args.cache / 'source/src/hci.cpp'
    before = source.read_bytes()
    refresh = digest(before) != BEFORE
    if refresh:
        previous = json.loads((ROOT / 'archive/native-intelligence-0.36/source-overlay.json').read_text())
        assert digest(before) == previous['afterSHA256'], 'Ready source differs from this reviewed overlay'
        before = (ROOT.parent / '_release-records/native-intelligence036/before/hci.cpp').read_bytes()
    assert digest(before) == BEFORE
    if not refresh:
        with tarfile.open(ROOT / 'archive/native-blueprint-4.7.0-source.tar.gz') as archive:
            assert archive.extractfile('source/src/hci.cpp').read() == before
    for name,expected in PRESERVED.items():
        assert digest((args.cache / 'source/src' / name).read_bytes()) == expected
    assert digest((args.cache / 'build/src/warzone2100.js').read_bytes()) == RAW_JS
    assert digest((args.cache / 'build/src/warzone2100.wasm').read_bytes()) == WASM
    assert digest((ROOT / 'app/src/main/assets/warzone/warzone2100.wasm').read_bytes()) == WASM
    output = ROOT / 'archive/native-intelligence-0.36'
    helper = (output / 'intelligence-helper.inc').read_bytes()
    headers = b'''#include <cstdio>
#include <cmath>
#include <unordered_set>
#include <vector>
#include "mapdisplay.h"
#include "structure.h"
#include "intimage.h"
#include "lib/ivis_opengl/pieclip.h"
#include "lib/ivis_opengl/piematrix.h"
#include "lib/ivis_opengl/piemode.h"
#include "lib/sound/mixer.h"
#include "lib/sound/track.h"
#include "lib/sound/audio.h"
#ifdef __EMSCRIPTEN__
#include <GLES3/gl3.h>
#endif

'''
    after = before
    anchor = b'bool intInitialise()\n{'
    assert after.count(anchor) == 1
    after = after.replace(anchor,b'namespace { static void towersIntelligenceReset(); }\n\n'+anchor+b'\n\ttowersIntelligenceReset();',1)
    anchor = b'void interfaceShutDown()\n{'
    assert after.count(anchor) == 1
    after = after.replace(anchor,anchor+b'\n\ttowersIntelligenceReset();',1)
    anchor = b'void intDisplayWidgets()\n'
    assert after.count(anchor) == 1
    after = after.replace(anchor,headers+helper+b'\n'+anchor,1)
    anchor = b'''\tif (bLoadSaveUp)
\t{
\t\tdisplayLoadSave();
\t}
}

void intShowWidgetHelp()'''
    assert after.count(anchor) == 1
    after = after.replace(anchor,anchor.replace(b'\n}\n\nvoid intShowWidgetHelp()',b'\n\ttowersIntelligenceFrame();\n}\n\nvoid intShowWidgetHelp()'),1)
    patch = ''.join(difflib.unified_diff(before.decode().splitlines(True),after.decode().splitlines(True),
                                        fromfile='a/src/hci.cpp',tofile='b/src/hci.cpp'))
    backup = ROOT.parent / '_release-records/native-intelligence036/before';backup.mkdir(parents=True,exist_ok=True)
    (backup / 'hci.cpp').write_bytes(before)
    (output / 'hci.cpp').write_bytes(after)
    (output / 'native-intelligence.patch').write_text(patch,encoding='utf-8',newline='\n')
    record = {'version':'0.36','guardPassed':True,'nativeBuildPerformed':False,
              'archivedSourceVerified':True,'priorArchiveVerificationReused':refresh,
              'baselineSourceBundle':'archive/native-blueprint-4.7.0-source.tar.gz',
              'baselineSourceEntry':'source/src/hci.cpp','beforeSHA256':BEFORE,
              'changedSource':'archive/native-intelligence-0.36/hci.cpp','afterSHA256':digest(after),
              'helper':'archive/native-intelligence-0.36/intelligence-helper.inc','helperSHA256':digest(helper),
              'patch':'archive/native-intelligence-0.36/native-intelligence.patch','patchSHA256':digest(patch.encode()),
              'baselineRawJSSHA256':RAW_JS,'baselineWasmSHA256':WASM,'preservedSourceOverlays':PRESERVED,
              'scope':'Towers-marker-gated, read-only completed research metadata and real native PIE renderer/category audio through transient MEMFS files. No stock Intelligence UI, research mutation, camera/order/RNG changes or global audio stop.'}
    (output / 'source-overlay.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8',newline='\n')
    source.write_bytes(after)
    print(json.dumps(record))


if __name__ == '__main__':
    main()
