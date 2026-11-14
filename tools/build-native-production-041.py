"""Build only the complete-subject observer in the verified matching v0.40 cache.

Large native outputs stay outside the repository; all v0.40 proof files are read
only. Reproduction is guarded both against the exact v0.40 file and full original
source. No Android build or engine/runtime execution is performed.
"""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import argparse
import difflib
import json
import os
import re
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'archive/native-production-0.40'
OUT = ROOT / 'archive/native-production-0.41'
PRIOR = runpy.run_path(str(ROOT / 'tools/build-native-production-040.py'), run_name='production_041_base')
BEFORE = '6f3033eb6ea18da2e2f640f521e40483c5f5af8ab63a22b567d26c4f6997217e'
RAW_JS = '17348f32f1e7fec429c3e927f81e6f30b9ed961279872bcc3e81866edc662eb7'
WASM = '39d04627b1cc269c1a8a6820f29c3d85affc7bac516e22a32923a14edb2d061b'
ANCHOR = b'\tQuickJS_DefinePropertyValue(ctx, value, "currentName", JS_NewString(ctx, getStatsName(subject)), JS_PROP_ENUMERABLE);\n'
ADDITION = b'''\tJSValue subjectDesign = convTemplate(subject, ctx);
\tQuickJS_DefinePropertyValue(ctx, subjectDesign, "templateId", JS_NewUint32(ctx, subject->multiPlayerID), JS_PROP_ENUMERABLE);
\tQuickJS_DefinePropertyValue(ctx, value, "subjectDesign", subjectDesign, JS_PROP_ENUMERABLE);
'''


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def reconstruct_source(previous):
    """Exact additive v0.40 -> v0.41 observer delta; exported for package guards."""
    assert sha256(previous).hexdigest() == BEFORE
    assert previous.count(ANCHOR) == 1
    return previous.replace(ANCHOR, ANCHOR + ADDITION, 1)


def patch(before, after):
    return ''.join(difflib.unified_diff(before.decode().splitlines(True), after.decode().splitlines(True),
                                      fromfile='a/src/quickjs_backend.cpp', tofile='b/src/quickjs_backend.cpp')).encode()


def validate_overlay():
    original = PRIOR['validate_overlay']()
    previous = (BASE / 'quickjs_backend.cpp').read_bytes()
    assert sha256(previous).hexdigest() == BEFORE
    old_helper = (BASE / 'production-helper.inc').read_bytes()
    assert old_helper.count(ANCHOR) == 1
    assert (OUT / 'production-helper.inc').read_bytes() == old_helper.replace(ANCHOR, ANCHOR + ADDITION, 1)
    after = reconstruct_source(previous)
    assert (OUT / 'quickjs_backend.cpp').read_bytes() == after
    assert (OUT / 'native-production.patch').read_bytes() == patch(previous, after)
    assert (OUT / 'native-production-cumulative.patch').read_bytes() == patch(original, after)
    return original


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8', newline='\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--incremental-cache', type=Path, required=True)
    parser.add_argument('--raw-out', type=Path, default=ROOT.parent / '_release-records/native-production041/raw')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    assert os.name != 'nt', 'Use the prepared Linux/WSL toolchain'
    validate_overlay()
    cache = args.incremental_cache.resolve()
    overlay = OUT / 'quickjs_backend.cpp'
    after = digest(overlay)
    assert digest(ROOT / 'tools/build-native-blueprint.sh') == PRIOR['RECIPE']
    for name, expected in PRIOR['PRESERVED'].items():
        assert digest(cache / 'source/src' / name) == expected, 'Earlier native fix changed: ' + name
    cached = cache / 'source/src/quickjs_backend.cpp'
    is_baseline = digest(cached) == BEFORE
    if is_baseline:
        assert digest(cache / 'build/src/warzone2100.js') == RAW_JS
        assert digest(cache / 'build/src/warzone2100.wasm') == WASM
    else:
        prior_build = json.loads((OUT / 'native-build.json').read_text())
        assert args.verify_only and digest(cached) == after == prior_build['sourceOverlays']['quickjs_backend.cpp']
        for row in prior_build['raw']:
            assert digest(cache / 'build/src' / row['file']) == row['sha256']
    known_wasm = {WASM}
    if (OUT / 'native-build.json').is_file():
        known_wasm.update(r['sha256'] for r in json.loads((OUT / 'native-build.json').read_text())['raw'] if r['file'].endswith('.wasm'))
    assert digest(ROOT / 'app/src/main/assets/warzone/warzone2100.wasm') in known_wasm
    source_record = {
        'version': '0.41', 'guardPassed': True, 'nativeBuildPerformed': False,
        'baselineSourceBundle': 'archive/native-blueprint-4.7.0-source.tar.gz',
        'baselineSourceEntry': 'source/src/quickjs_backend.cpp', 'originalSourceSHA256': PRIOR['ORIGINAL'],
        'deltaBaseSource': 'archive/native-production-0.40/quickjs_backend.cpp', 'beforeSHA256': BEFORE,
        'changedSource': 'archive/native-production-0.41/quickjs_backend.cpp', 'afterSHA256': after,
        'helper': 'archive/native-production-0.41/production-helper.inc', 'helperSHA256': digest(OUT / 'production-helper.inc'),
        'patch': 'archive/native-production-0.41/native-production.patch', 'patchSHA256': digest(OUT / 'native-production.patch'),
        'cumulativePatch': 'archive/native-production-0.41/native-production-cumulative.patch',
        'cumulativePatchSHA256': digest(OUT / 'native-production-cumulative.patch'),
        'baselineRawJSSHA256': RAW_JS, 'baselineWasmSHA256': WASM,
        'preservedSourceOverlays': PRIOR['PRESERVED'], 'originalBuildRecipeSHA256': PRIOR['RECIPE'],
        'scope': 'Three additive lines expose the exact subject via existing convTemplate plus its numeric native ID inside the existing Towers-only observer. Global convDroid, production behavior, work/identity/status logic, shaders and Duel remain unchanged.',
    }
    write_json(OUT / 'source-overlay.json', source_record)
    if args.verify_only:
        print(json.dumps({'passed': True, 'nativeBuildPerformed': False, 'preservedOverlays': list(PRIOR['PRESERVED'])}))
        return
    assert ROOT not in args.raw_out.resolve().parents, 'Raw outputs must stay outside repository'
    args.raw_out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(overlay, cached)
    log = OUT / 'native-build.log'
    command = ['bash', '-c', 'source "$1/emsdk/emsdk_env.sh" && cmake --build "$1/build" --target warzone2100 --parallel 4',
               'native-production-041', str(cache)]
    with log.open('w') as stream:
        subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT, check=True, timeout=480)
    text = log.read_text()
    compiled = re.findall(r'Building CXX object (\S+)', text)
    assert compiled == ['src/CMakeFiles/warzone2100.dir/quickjs_backend.cpp.o'], 'Unexpected compile scope'
    assert re.search(r'Linking CXX executable.*warzone2100', text)
    for name, expected in PRIOR['PRESERVED'].items():
        assert digest(cache / 'source/src' / name) == expected
    record = {
        'version': '0.41', 'passed': True, 'emulatorUsed': False, 'androidRuntimeExecuted': False,
        'nativeBuildPerformed': True, 'nativeFullFreshBuildPerformed': False,
        'compiledObjects': compiled, 'relinkedNativeEngine': True,
        'method': 'Verified matching v0.40 source cache; one quickjs_backend.cpp object compile and one matched JS/WASM link',
        'cachePath': str(cache), 'command': command, 'originalBuildRecipeSHA256': PRIOR['RECIPE'],
        'previousNativeBuild': 'archive/native-production-0.40/native-build.json',
        'previousNativeBuildSHA256': digest(BASE / 'native-build.json'),
        'sourceOverlay': 'archive/native-production-0.41/source-overlay.json',
        'sourceOverlaySHA256': digest(OUT / 'source-overlay.json'),
        'sourceOverlays': dict(PRIOR['PRESERVED'], **{'quickjs_backend.cpp': after}),
        'log': 'archive/native-production-0.41/native-build.log', 'logSHA256': digest(log),
        'recordedUTC': datetime.now(timezone.utc).isoformat(), 'raw': [],
    }
    for name in ['warzone2100.js', 'warzone2100.wasm']:
        target = args.raw_out / name
        shutil.copy2(cache / 'build/src' / name, target)
        record['raw'].append({'file': name, 'sha256': digest(target), 'bytes': target.stat().st_size})
    write_json(OUT / 'native-build.json', record)
    print(json.dumps(record))


if __name__ == '__main__':
    main()
