"""Guard the ready matching v0.36 cache, compile one observer object, then link.

Run under Linux/WSL. Large raw JS/WASM output stays outside the repository.
The original complete source archive, toolchain recipe and four prior overlays
remain the reproduction base. This never builds Android or runs the engine.
"""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import argparse
import difflib
import json
import os
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'archive/native-production-0.40'
ORIGINAL = 'a6ed9d1e08c0c28dee6cceb641380ab60388a72e8e989f32a8ba73080dc00084'
RAW_JS = 'cfdd813c040f55c759cdc38835f57d6e91325165946267d28ae3efc1f0c2d032'
WASM = 'b7d117295d901abf96cafdf8a4c780a56007b4e2310267897395419d455a3503'
RECIPE = '6f3835c7eb8441c216f7e0b056affe22b34eb60e2985341029c866ca75e9bc26'
PRESERVED = {
    'display3d.cpp': '3b5c1a41144011805819d15e9bfac6f1289d726da276433bfeb237904c0fa15f',
    'research.cpp': '06b8999191bb0160e6b73c268f8ddd69347102133ecc221aee23504973dc918a',
    'keybind.cpp': '5730cf9a2b791a6a437f4e0da040e9dbb75e8befb48dc02caefb1a8e824355ed',
    'hci.cpp': '9db6bef46703c3975d920a23cc071ea46ab938a3972204ca5325440e8e66e842',
}
HEADERS = b'#include <cstdio>\n#include "structure.h"\n#include "power.h"\n#include "cmddroid.h"\n#include "group.h"\n\n'
FUNCTION_ANCHOR = b'JSValue convStructure(const STRUCTURE *psStruct, JSContext *ctx)\n{'
PROPERTY = b'''\tJSValue productionObservation = towersProductionState(psStruct, ctx);
\tif (!JS_IsUndefined(productionObservation))
\t{
\t\tQuickJS_DefinePropertyValue(ctx, value, "towersProduction", productionObservation, JS_PROP_ENUMERABLE);
\t}
'''


def reconstruct_source(original):
    """Two exact additive insertions; callable by independent package guards."""
    assert sha256(original).hexdigest() == ORIGINAL
    helper = (OUT / 'production-helper.inc').read_bytes()
    assert original.count(FUNCTION_ANCHOR) == 1
    result = original.replace(FUNCTION_ANCHOR, HEADERS + helper + b'\n' + FUNCTION_ANCHOR, 1)
    position = result.index(b'\tJSValue weaponlist = JS_NewArray(ctx);', result.index(FUNCTION_ANCHOR))
    return result[:position] + PROPERTY + result[position:]


def validate_overlay():
    overlay = (OUT / 'quickjs_backend.cpp').read_bytes()
    helper = (OUT / 'production-helper.inc').read_bytes()
    insertion = HEADERS + helper + b'\n' + FUNCTION_ANCHOR
    assert overlay.count(insertion) == 1 and overlay.count(PROPERTY) == 1
    original = overlay.replace(insertion, FUNCTION_ANCHOR, 1).replace(PROPERTY, b'', 1)
    assert sha256(original).hexdigest() == ORIGINAL
    assert reconstruct_source(original) == overlay
    patch = ''.join(difflib.unified_diff(original.decode().splitlines(True), overlay.decode().splitlines(True),
                                        fromfile='a/src/quickjs_backend.cpp', tofile='b/src/quickjs_backend.cpp'))
    assert (OUT / 'native-production.patch').read_bytes() == patch.encode()
    return original


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8', newline='\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--incremental-cache', type=Path, required=True)
    parser.add_argument('--raw-out', type=Path, default=ROOT.parent / '_release-records/native-production040/raw')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    assert os.name != 'nt', 'Use the prepared Linux/WSL toolchain'
    cache = args.incremental_cache.resolve()
    overlay = OUT / 'quickjs_backend.cpp'
    validate_overlay()
    after = digest(overlay)
    assert digest(ROOT / 'tools/build-native-blueprint.sh') == RECIPE
    for name, expected in PRESERVED.items():
        assert digest(cache / 'source/src' / name) == expected, 'Earlier native fix changed: ' + name
    cached = cache / 'source/src/quickjs_backend.cpp'
    previous_build = json.loads((OUT / 'native-build.json').read_text()) if (OUT / 'native-build.json').is_file() else None
    known_source = {ORIGINAL, after}
    if previous_build:
        known_source.add(previous_build['sourceOverlays']['quickjs_backend.cpp'])
    assert digest(cached) in known_source, 'Unexpected native observer baseline'
    baseline_cache = (digest(cache / 'build/src/warzone2100.js') == RAW_JS
                      and digest(cache / 'build/src/warzone2100.wasm') == WASM)
    if not baseline_cache:
        assert previous_build['sourceOverlays']['quickjs_backend.cpp'] == digest(cached)
        for row in previous_build['raw']:
            assert digest(cache / 'build/src' / row['file']) == row['sha256']
        assert args.verify_only or digest(cached) != after, 'This exact observer is already built; reuse recorded raw outputs'
    known_wasm = {WASM}
    if (OUT / 'native-build.json').is_file():
        known_wasm.update(r['sha256'] for r in json.loads((OUT / 'native-build.json').read_text())['raw']
                          if r['file'].endswith('.wasm'))
    assert digest(ROOT / 'app/src/main/assets/warzone/warzone2100.wasm') in known_wasm
    # A reverse application must recreate the pinned original one-file source.
    result = subprocess.run(['patch', '--dry-run', '--reverse', '--silent', '-p1', '-d', str(cache / 'source')],
                            input=(OUT / 'native-production.patch').read_bytes(), capture_output=True)
    if digest(cached) == after:
        assert result.returncode == 0, result.stderr.decode()
    elif digest(cached) == ORIGINAL:
        result = subprocess.run(['patch', '--dry-run', '--silent', '-p1', '-d', str(cache / 'source')],
                                input=(OUT / 'native-production.patch').read_bytes(), capture_output=True)
        assert result.returncode == 0, result.stderr.decode()
    else:
        assert previous_build and digest(cached) == previous_build['sourceOverlays']['quickjs_backend.cpp']
    source_record = {
        'version': '0.40', 'guardPassed': True, 'nativeBuildPerformed': False,
        'baselineSourceBundle': 'archive/native-blueprint-4.7.0-source.tar.gz',
        'baselineSourceEntry': 'source/src/quickjs_backend.cpp', 'beforeSHA256': ORIGINAL,
        'changedSource': 'archive/native-production-0.40/quickjs_backend.cpp', 'afterSHA256': after,
        'helper': 'archive/native-production-0.40/production-helper.inc',
        'helperSHA256': digest(OUT / 'production-helper.inc'),
        'patch': 'archive/native-production-0.40/native-production.patch',
        'patchSHA256': digest(OUT / 'native-production.patch'),
        'baselineRawJSSHA256': RAW_JS, 'baselineWasmSHA256': WASM,
        'preservedSourceOverlays': PRESERVED, 'originalBuildRecipeSHA256': RECIPE,
        'scope': 'Add one Towers-marker-gated, read-only own-factory QuickJS property; no native gameplay, queue, power, timer, shader, renderer, save or RNG mutation.',
    }
    write_json(OUT / 'source-overlay.json', source_record)
    if args.verify_only:
        print(json.dumps({'passed': True, 'nativeBuildPerformed': False, 'preservedOverlays': list(PRESERVED)}))
        return
    assert ROOT not in args.raw_out.resolve().parents, 'Large native outputs must stay outside the repository'
    args.raw_out.mkdir(parents=True, exist_ok=True)
    if digest(cached) != after:
        shutil.copyfile(overlay, cached)
    log = OUT / 'native-build.log'
    command = ['bash', '-c', 'source "$1/emsdk/emsdk_env.sh" && cmake --build "$1/build" --target warzone2100 --parallel 4',
               'native-production-040', str(cache)]
    with log.open('w') as stream:
        subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT, check=True, timeout=480)
    build_text = log.read_text()
    compiled = re.findall(r'Building CXX object (\S+)', build_text)
    assert compiled == ['src/CMakeFiles/warzone2100.dir/quickjs_backend.cpp.o'], 'Unexpected native compile scope: ' + str(compiled)
    assert re.search(r'Linking CXX executable.*warzone2100', build_text)
    for name, expected in PRESERVED.items():
        assert digest(cache / 'source/src' / name) == expected
    record = {
        'version': '0.40', 'passed': True, 'emulatorUsed': False, 'androidRuntimeExecuted': False,
        'nativeBuildPerformed': True, 'nativeFullFreshBuildPerformed': False,
        'compiledObjects': compiled, 'relinkedNativeEngine': True,
        'method': 'Verified matching v0.36 source cache; one quickjs_backend.cpp object compile and one matched native link',
        'cachePath': str(cache), 'command': command, 'originalBuildRecipeSHA256': RECIPE,
        'sourceOverlay': 'archive/native-production-0.40/source-overlay.json',
        'sourceOverlaySHA256': digest(OUT / 'source-overlay.json'),
        'sourceOverlays': dict(PRESERVED, **{'quickjs_backend.cpp': after}),
        'log': 'archive/native-production-0.40/native-build.log', 'logSHA256': digest(log),
        'recordedUTC': datetime.now(timezone.utc).isoformat(), 'raw': [],
    }
    if not baseline_cache:
        record['sourceReviewRebuild'] = {
            'reason': 'Omit the observer property entirely when the Towers marker is absent',
            'previousObserverSHA256': previous_build['sourceOverlays']['quickjs_backend.cpp'],
            'previousRawOutputs': previous_build['raw'],
            'previousBuildPassed': previous_build['passed'],
        }
    for name in ['warzone2100.js', 'warzone2100.wasm']:
        target = args.raw_out / name
        shutil.copy2(cache / 'build/src' / name, target)
        record['raw'].append({'file': name, 'sha256': digest(target), 'bytes': target.stat().st_size})
    write_json(OUT / 'native-build.json', record)
    print(json.dumps(record))


if __name__ == '__main__':
    main()
