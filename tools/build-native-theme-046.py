"""Compile only two Towers renderer colour changes in the matched v0.44 cache.

This does not run the game. All v0.44 power scaling, automatic-save guards and
earlier gameplay overlays are retained byte for byte outside colour literals.
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
OUT = ROOT / 'archive/native-theme-0.46'
PREVIOUS = ROOT / 'archive/native-hud-0.44/native-build.json'
ORIGINAL_PATHS = {
    'console.cpp': 'archive/native-theme-0.42/console.cpp',
    'intdisplay.cpp': 'archive/native-hud-0.44/intdisplay.cpp',
}
ORIGINAL = {
    'console.cpp': '72bfd88aa0535a6adcf098f6f4b0fcb035ecca43f1927430d1e511893f51f570',
    'intdisplay.cpp': '5cdf6dab907eb44c95dbb59b8c41d3db8545dd9fb021bf15ab27172550282e87',
}
COLOURS = {
    'towersSageColour(220,232,207)': 'towersSageColour(17,17,17)',
    'towersSageColour(16,23,12)': 'towersSageColour(244,244,244)',
    'towersSageColour(52,65,46)': 'towersSageColour(188,188,188)',
    'towersSageColour(182,201,158)': 'towersSageColour(112,112,112)',
    'towersSageColour(203,220,186)': 'towersSageColour(37,37,37)',
}
EXPECTED_OBJECTS = ['src/CMakeFiles/warzone2100.dir/console.cpp.o',
                    'src/CMakeFiles/warzone2100.dir/intdisplay.cpp.o']


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8', newline='\n')


def reconstruct(name, original):
    assert sha256(original).hexdigest() == ORIGINAL[name], 'Frozen source differs: ' + name
    text = original.decode()
    assert COLOURS.keys() & set(re.findall(r'towersSageColour\(\d+,\d+,\d+\)', text))
    for before, after in COLOURS.items():
        text = text.replace(before, after)
    return text.encode()


def prepare():
    OUT.mkdir(parents=True, exist_ok=True)
    previous = json.loads(PREVIOUS.read_text())
    patch, sources = '', []
    for name, source in ORIGINAL_PATHS.items():
        original = (ROOT / source).read_bytes()
        after = reconstruct(name, original)
        (OUT / ('original-' + name)).write_bytes(original)
        (OUT / name).write_bytes(after)
        patch += ''.join(difflib.unified_diff(original.decode().splitlines(True), after.decode().splitlines(True),
                                            fromfile='a/src/' + name, tofile='b/src/' + name))
        sources.append({'file': name, 'originalPath': source, 'originalSHA256': ORIGINAL[name],
                        'path': 'archive/native-theme-0.46/' + name, 'sha256': sha256(after).hexdigest()})
    (OUT / 'native-theme.patch').write_text(patch, encoding='utf-8', newline='\n')
    proof = {'version': '0.46', 'guardPassed': True, 'colourLiteralsOnly': True,
             'scope': 'Towers-only native console and power HUD black/white colours; calculations, geometry, lifetimes and non-Towers branches unchanged',
             'sources': sources, 'previousNativeBuild': 'archive/native-hud-0.44/native-build.json',
             'previousNativeBuildSHA256': digest(PREVIOUS), 'preservedSourceOverlays': previous['sourceOverlays'],
             'patch': 'archive/native-theme-0.46/native-theme.patch', 'patchSHA256': digest(OUT / 'native-theme.patch'),
             'originalBuildRecipeSHA256': digest(ROOT / 'tools/build-native-blueprint.sh')}
    write_json(OUT / 'source-overlay.json', proof)
    return proof, previous


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--incremental-cache', type=Path)
    parser.add_argument('--raw-out', type=Path, default=ROOT.parent / '_release-records/native-theme046/raw')
    parser.add_argument('--prepare-only', action='store_true')
    args = parser.parse_args()
    overlay, previous = prepare()
    if args.prepare_only:
        print(json.dumps(overlay)); return
    assert os.name != 'nt' and args.incremental_cache, 'Use only the matching prepared Linux/WSL cache'
    cache = args.incremental_cache.resolve()
    for name, expected in previous['sourceOverlays'].items():
        assert digest(cache / 'source/src' / name) == expected, 'Earlier source overlay changed: ' + name
    for row in previous['raw']:
        assert digest(cache / 'build/src' / row['file']) == row['sha256'], 'Raw v0.44 output differs'
    assert ROOT not in args.raw_out.resolve().parents
    args.raw_out.mkdir(parents=True, exist_ok=True)
    for name in ORIGINAL:
        shutil.copyfile(OUT / name, cache / 'source/src' / name)
    log = OUT / 'native-build.log'
    command = ['bash', '-c', 'source "$1/emsdk/emsdk_env.sh" && cmake --build "$1/build" --target warzone2100 --parallel 4',
               'native-theme-046', str(cache)]
    start = time.monotonic()
    with log.open('w') as stream:
        subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT, check=True, timeout=180)
    elapsed = time.monotonic() - start
    text = log.read_text()
    compiled = re.findall(r'Building CXX object (\S+)', text)
    assert sorted(compiled) == EXPECTED_OBJECTS, 'Unexpected compile scope: ' + str(compiled)
    assert len(re.findall(r'Linking CXX executable[^\n]*warzone2100', text)) == 1
    for name, expected in previous['sourceOverlays'].items():
        assert digest(cache / 'source/src' / name) == (digest(OUT / name) if name in ORIGINAL else expected)
    proof = {'version': '0.46', 'passed': True, 'emulatorUsed': False, 'androidRuntimeExecuted': False,
             'gameplayVerified': False, 'nativeBuildPerformed': True, 'nativeFullFreshBuildPerformed': False,
             'relinkedNativeEngine': True, 'colourLiteralsOnly': True, 'compiledObjects': compiled,
             'elapsedSeconds': round(elapsed, 3), 'command': command, 'cachePath': str(cache),
             'previousNativeBuild': overlay['previousNativeBuild'], 'previousNativeBuildSHA256': digest(PREVIOUS),
             'sourceOverlay': 'archive/native-theme-0.46/source-overlay.json',
             'sourceOverlaySHA256': digest(OUT / 'source-overlay.json'),
             'preservedSourceOverlays': previous['sourceOverlays'],
             'sourceOverlays': dict(previous['sourceOverlays'], **{name: digest(OUT / name) for name in ORIGINAL}),
             'log': 'archive/native-theme-0.46/native-build.log', 'logSHA256': digest(log),
             'recordedUTC': datetime.now(timezone.utc).isoformat(), 'raw': []}
    for name in ['warzone2100.js', 'warzone2100.wasm']:
        path = args.raw_out / name
        shutil.copy2(cache / 'build/src' / name, path)
        proof['raw'].append({'file': name, 'bytes': path.stat().st_size, 'sha256': digest(path)})
    write_json(OUT / 'native-build.json', proof)
    print(json.dumps(proof))


if __name__ == '__main__':
    main()
