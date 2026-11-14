"""Prepare only four camera-success notice replacements over native v0.34.

The ready source/cache and shipped WASM must still match v0.34. This prepares
the full cumulative keybind.cpp overlay; no build or runtime installation occurs.
"""
from pathlib import Path
from hashlib import sha256
import argparse
import difflib
import json

ROOT = Path(__file__).resolve().parents[1]
BEFORE = 'f131e88aef09ddf53f1338b76061863424984e93afb568bde5a3fed722000ce3'
RESEARCH = '06b8999191bb0160e6b73c268f8ddd69347102133ecc221aee23504973dc918a'
DISPLAY = '3b5c1a41144011805819d15e9bfac6f1289d726da276433bfeb237904c0fa15f'
RAW_JS = '13db60da65ce9352f3ef1a7fbe379f249f58a8b9f40eee1d5e832a97dd083971'
WASM = '20a3e83127f21d85105c91f43c8eb7144461a09cfc53ef34bbfc1d274fa7368f'
HELPER = '''// Emit only after the existing native camera action has completed. The
// original camera mutations and non-Towers console behavior are unchanged.
static void towersCameraAlignmentNotice(const char *direction, const char *stockMessage)
{
\tif (!towersOwnsRoutineNotices())
\t{
\t\tCONPRINTF("%s", stockMessage);
\t\treturn;
\t}
#ifdef __EMSCRIPTEN__
\tfprintf(stderr, "BNNOTICE:{\\"kind\\":\\"camera\\",\\"direction\\":\\"%s\\",\\"gameTime\\":%u}\\n",
\t        direction, static_cast<unsigned int>(gameTime));
#endif
}

'''


def digest(value):
    return sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args()
    cache = args.cache
    source = cache / 'source/src/keybind.cpp'
    before = source.read_bytes()
    assert digest(before) == BEFORE
    assert before == (ROOT / 'archive/native-notices-0.34/keybind.cpp').read_bytes()
    for name, expected in [('research.cpp', RESEARCH), ('display3d.cpp', DISPLAY)]:
        assert digest((cache / 'source/src' / name).read_bytes()) == expected
    assert digest((cache / 'build/src/warzone2100.js').read_bytes()) == RAW_JS
    assert digest((cache / 'build/src/warzone2100.wasm').read_bytes()) == WASM
    assert digest((ROOT / 'app/src/main/assets/warzone/warzone2100.wasm').read_bytes()) == WASM
    after = before
    anchor = b'extern char\tScreenDumpPath[];'
    assert after.count(anchor) == 1
    after = after.replace(anchor, HELPER.encode() + anchor, 1)
    for direction in ['North', 'South', 'East', 'West']:
        old = f'\tCONPRINTF("%s", _("View Aligned to {direction}"));'.encode()
        new = f'\ttowersCameraAlignmentNotice("{direction.lower()}", _("View Aligned to {direction}"));'.encode()
        assert after.count(old) == 1
        after = after.replace(old, new, 1)
    output = ROOT / 'archive/native-notices-0.35'
    backup = ROOT.parent / '_release-records/native-notices035/before'
    output.mkdir(parents=True, exist_ok=True)
    backup.mkdir(parents=True, exist_ok=True)
    patch = ''.join(difflib.unified_diff(before.decode().splitlines(True), after.decode().splitlines(True),
                                       fromfile='a/src/keybind.cpp', tofile='b/src/keybind.cpp'))
    (backup / 'keybind.cpp').write_bytes(before)
    (output / 'keybind.cpp').write_bytes(after)
    (output / 'native-camera-notices.patch').write_text(patch, encoding='utf-8', newline='\n')
    record = {'version':'0.35', 'guardPassed':True, 'nativeBuildPerformed':False,
              'priorSource':'archive/native-notices-0.34/keybind.cpp', 'beforeSHA256':BEFORE,
              'changedSource':'archive/native-notices-0.35/keybind.cpp', 'afterSHA256':digest(after),
              'patch':'archive/native-notices-0.35/native-camera-notices.patch', 'patchSHA256':digest(patch.encode()),
              'preservedResearchSourceSHA256':RESEARCH, 'preservedDisplaySourceSHA256':DISPLAY,
              'baselineRawJSSHA256':RAW_JS, 'baselineWasmSHA256':WASM,
              'markerPath':'/tmp/warzone-towers-ui-v34', 'markerContents':'1',
              'scope':'Only North/South/East/West success CONPRINTF calls become BNNOTICE camera packets under the existing transient Towers marker. Camera actions, native sounds, failure/error messages and v0.34 research/save changes stay unchanged.'}
    (output / 'source-overlay.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8', newline='\n')
    source.write_bytes(after)
    print(json.dumps(record))


if __name__ == '__main__':
    main()
