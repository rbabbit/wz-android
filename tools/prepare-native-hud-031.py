"""Prepare the two-draw-call HUD correction in the verified native source cache.

Does not build or install anything. The original complete source bundle remains
unchanged; archive/native-hud-0.31 contains the exact source overlay and diff.
"""
from pathlib import Path
from hashlib import sha256
import argparse
import difflib
import json
import tarfile

ROOT = Path(__file__).resolve().parents[1]
BEFORE = 'bcd73267db5cdceaae0b5ca609f549dec872a90f8393f976b0132aff95dd38cb'
WASM = 'd909a4ecb7475643107fa6f489279562c00deae1e0a0f531ddd1328457d78f1e'
RAW_JS = 'a210b24220efc30a3e5e9bf87f50d61fd4564b0c5b56e1ce9e964e7eaf18d179'


def digest(value):
    return sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args()
    source = args.cache / 'source/src/display3d.cpp'
    before = source.read_bytes()
    assert digest(before) == BEFORE, 'Prepared source differs from the frozen native bundle'
    assert digest((args.cache / 'build/src/warzone2100.wasm').read_bytes()) == WASM
    assert digest((ROOT / 'app/src/main/assets/warzone/warzone2100.wasm').read_bytes()) == WASM
    assert digest((args.cache / 'build/src/warzone2100.js').read_bytes()) == RAW_JS
    with tarfile.open(ROOT / 'archive/native-blueprint-4.7.0-source.tar.gz') as bundle:
        assert bundle.extractfile('source/src/display3d.cpp').read() == before
    after = before
    for line in (
        b'\t\ttxtLevelName.render(RET_X + 134, 410 + E_H, WZCOL_TEXT_MEDIUM);',
        b'\t\ttxtCurrentTime.render(RET_X + 134, 422 + E_H, WZCOL_TEXT_MEDIUM);',
    ):
        assert after.count(line) == 1
        after = after.replace(line, b'\t\t// Towers provides its map/wave status outside the native scene.', 1)
    output = ROOT / 'archive/native-hud-0.31'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'display3d.cpp').write_bytes(after)
    patch = ''.join(difflib.unified_diff(before.decode().splitlines(True), after.decode().splitlines(True),
                                       fromfile='a/src/display3d.cpp', tofile='b/src/display3d.cpp'))
    (output / 'native-hud.patch').write_text(patch, encoding='utf-8', newline='\n')
    record = {
        'version': '0.31', 'guardPassed': True, 'nativeBuildPerformed': False,
        'baselineSourceBundle': 'archive/native-blueprint-4.7.0-source.tar.gz',
        'baselineSourceEntry': 'source/src/display3d.cpp', 'baselineSourceSHA256': BEFORE,
        'baselineWasmSHA256': WASM, 'baselineRawJSSHA256': RAW_JS,
        'changedSource': 'archive/native-hud-0.31/display3d.cpp', 'changedSourceSHA256': digest(after),
        'patch': 'archive/native-hud-0.31/native-hud.patch', 'patchSHA256': digest(patch.encode()),
        'scope': 'Only suppress txtLevelName.render and txtCurrentTime.render. Clock calculation/state, debug-status rendering, minimap, widgets, input, orders and blueprint alignment stay unchanged.',
    }
    (output / 'source-overlay.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8', newline='\n')
    backup = ROOT.parent / '_release-records/native-hud031-before-display3d.cpp'
    backup.write_bytes(before)
    source.write_bytes(after)
    print(json.dumps(record))


if __name__ == '__main__':
    main()
