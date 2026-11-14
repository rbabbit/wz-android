"""Prepare the narrowly scoped Towers routine-notification source overlay.

Checks both cached sources against the complete frozen native bundle before
writing. No compilation, data packaging or installation is performed here.
"""
from pathlib import Path
from hashlib import sha256
import argparse
import difflib
import json
import tarfile

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = {
    'research.cpp': '7ed1d110344d6db40f40954380bde3b5648f69b962f0b66b5ccab6cae12800ff',
    'keybind.cpp': 'fc44389817ad6f1e4452db02ce4253ce701aca9406554770a33ad8c7fa9cda4b',
}
DISPLAY = '3b5c1a41144011805819d15e9bfac6f1289d726da276433bfeb237904c0fa15f'
RAW_JS = 'a210b24220efc30a3e5e9bf87f50d61fd4564b0c5b56e1ce9e964e7eaf18d179'
BASELINE_WASM = 'c69a9d1a3873aa23e774524b67db0cb1257a8326904ed06eddca7b45691eba78'
MARKER = '/tmp/warzone-towers-ui-v34'
HELPER = '''// Only the Towers HTML host opts in. This transient libc/MEMFS marker is
// never stored with saves/preferences; other modes retain their stock notices.
static bool towersOwnsRoutineNotices()
{
#ifdef __EMSCRIPTEN__
\tFILE *marker = fopen("/tmp/warzone-towers-ui-v34", "rb");
\tif (!marker)
\t{
\t\treturn false;
\t}
\tconst bool enabled = fgetc(marker) == '1';
\tfclose(marker);
\treturn enabled;
#else
\treturn false;
#endif
}

'''


def digest(data):
    return sha256(data).hexdigest()


def replace_once(data, before, after):
    assert data.count(before) == 1, 'Expected source anchor is not unique'
    return data.replace(before, after, 1)


def patched(name, data):
    data = replace_once(data, b'#include "lib/framework/frame.h"',
                        b'#include <stdio.h>\n\n#include "lib/framework/frame.h"')
    if name == 'research.cpp':
        data = replace_once(data, b'// The stores for the research stats',
                            HELPER.encode() + b'// The stores for the research stats')
        old = b'''\tif (player == selectedPlayer && bDisplay)
\t{
\t\t//add console text message
\t\tsnprintf(consoleMsg, MAX_RESEARCH_MSG_SIZE, _("Research completed: %s"), getLocalizedStatsName(pResearch));
\t\taddConsoleMessage(consoleMsg, LEFT_JUSTIFY, SYSTEM_MESSAGE);
\t}'''
        new = old.replace(b'&& bDisplay)', b'&& bDisplay && !towersOwnsRoutineNotices())', 1)
        return replace_once(data, old, new)
    data = replace_once(data, b'extern char\tScreenDumpPath[];',
                        HELPER.encode() + b'extern char\tScreenDumpPath[];')
    return replace_once(data,
        b'''\tif (saveGame(filename, GTYPE_SAVE_MIDMISSION)) // still expects a .gam filename... TODO: FIX
\t{
\t\tconsole(_("QuickSave"));
\t}''',
        b'''\tif (saveGame(filename, GTYPE_SAVE_MIDMISSION)) // still expects a .gam filename... TODO: FIX
\t{
\t\tif (!towersOwnsRoutineNotices())
\t\t{
\t\t\tconsole(_("QuickSave"));
\t\t}
\t}''')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    baseline = ROOT / 'archive/native-blueprint-4.7.0-source.tar.gz'
    assert digest((args.cache / 'source/src/display3d.cpp').read_bytes()) == DISPLAY
    assert digest((args.cache / 'build/src/warzone2100.js').read_bytes()) == RAW_JS
    assert digest((args.cache / 'build/src/warzone2100.wasm').read_bytes()) == BASELINE_WASM
    assert digest((ROOT / 'app/src/main/assets/warzone/warzone2100.wasm').read_bytes()) == BASELINE_WASM
    records = []
    changes = []
    with tarfile.open(baseline) as bundle:
        for name, expected in ORIGINAL.items():
            before = (args.cache / 'source/src' / name).read_bytes()
            assert digest(before) == expected, f'Cached {name} differs from frozen source'
            assert before == bundle.extractfile('source/src/' + name).read()
            after = patched(name, before)
            changes.append((name, before, after))
            records.append({'file': name, 'beforeSHA256': expected,
                            'afterSHA256': digest(after)})
    record = {'version': '0.34', 'guardPassed': True, 'nativeBuildPerformed': False,
              'baselineSourceBundle': 'archive/native-blueprint-4.7.0-source.tar.gz',
              'baselineSourceBundleSHA256': digest(baseline.read_bytes()),
              'priorDisplayOverlaySHA256': DISPLAY,
              'baselineRawJSSHA256': RAW_JS, 'baselineWasmSHA256': BASELINE_WASM,
              'markerPath': MARKER, 'markerContents': '1',
              'scope': 'Only the stock research-completion console block and successful QuickSave console call are suppressed while the transient Towers host marker is enabled. Completion audio, research upgrades/events, save writer, failures and all other console messages remain unchanged.',
              'files': records}
    if not args.verify_only:
        output = ROOT / 'archive/native-notices-0.34'
        backup = ROOT.parent / '_release-records/native-notices034/before'
        output.mkdir(parents=True, exist_ok=True)
        backup.mkdir(parents=True, exist_ok=True)
        patch = ''
        for name, before, after in changes:
            (backup / name).write_bytes(before)
            (output / name).write_bytes(after)
            patch += ''.join(difflib.unified_diff(
                before.decode().splitlines(True), after.decode().splitlines(True),
                fromfile='a/src/' + name, tofile='b/src/' + name))
            (args.cache / 'source/src' / name).write_bytes(after)
        (output / 'native-notices.patch').write_text(patch, encoding='utf-8', newline='\n')
        record['patchSHA256'] = digest(patch.encode())
        (output / 'source-overlay.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps(record))


if __name__ == '__main__':
    main()
