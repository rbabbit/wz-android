"""Build one guarded Towers MMB-input change in the matched prepared cache.

Uses exactly the cache's existing object, static-archive and executable-link
commands. No CMake regeneration, dependency rebuild, game run or asset install.
The root delivery step integrates the paired outputs with its frozen VFS.
"""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
from zipfile import ZipFile
import argparse
import difflib
import json
import os
import re
import shutil
import subprocess
import tarfile
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'archive/native-touch-0.50'
PREVIOUS = ROOT / 'archive/native-theme-0.46/native-build.json'
SOURCE = 'lib/sdl/main_sdl.cpp'
ORIGINAL_SHA256 = '1c2bee5cfa62ad1840333a481e4af68f812ca1576e733c563c446e5f38466983'
OBJECT = 'lib/sdl/CMakeFiles/sdl-backend.dir/main_sdl.cpp.o'
LIBRARY = 'lib/sdl/libsdl-backend.a'
HELPER = '''// The Towers WebView uses middle-button presses only for touch-camera drags.
// A rapid second swipe must remain a held drag, not the desktop double-click
// state that inputNewFrame clears even while the finger is still down.
static bool towersTouchMiddleDrag()
{
#if defined(__EMSCRIPTEN__)
\tFILE *marker = std::fopen("/tmp/warzone-towers-ui-v34", "rb");
\tif (!marker) return false;
\tconst bool enabled = std::fgetc(marker) == '1';
\tstd::fclose(marker);
\treturn enabled;
#else
\treturn false;
#endif
}

'''


def digest(path):
    value = sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8', newline='\n')


def object_hashes(build):
    return {str(path.relative_to(build)): digest(path)
            for folder in ['src', 'lib'] for path in sorted((build / folder).rglob('*.o'))}


def host_path(value):
    if re.match(r'^[A-Za-z]:[\\/]', value):
        return Path('/mnt/' + value[0].lower() + '/' + value[3:].replace('\\', '/'))
    return Path(value)


def reconstruct(original):
    assert sha256(original).hexdigest() == ORIGINAL_SHA256, 'Original SDL source differs'
    text = original.decode('utf-8')
    before = '#include <chrono>\n'
    assert text.count(before) == 1
    text = text.replace(before, before + '#include <cstdio>\n', 1)
    before = '/*!\n * Handle mouse button events (We can handle up to 5)\n */\n'
    assert text.count(before) == 1
    text = text.replace(before, HELPER + before, 1)
    before = '\t\t\tif (realTime - aMouseState[mouseKeyCode].lastdown < DOUBLE_CLICK_INTERVAL)\n'
    after = ('\t\t\tconst bool towersPanPress = mouseKeyCode == MOUSE_MMB && towersTouchMiddleDrag();\n'
             '\t\t\tif (!towersPanPress && realTime - aMouseState[mouseKeyCode].lastdown < DOUBLE_CLICK_INTERVAL)\n')
    assert text.count(before) == 1
    text = text.replace(before, after, 1)
    # Reversing the three explicit edits must recover every original byte.
    recovered = text.replace(after, before, 1).replace(HELPER, '', 1).replace('#include <cstdio>\n', '', 1)
    assert recovered.encode('utf-8') == original
    return text.encode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--incremental-cache', type=Path, required=True)
    parser.add_argument('--raw-out', type=Path, required=True)
    parser.add_argument('--prepare-only', action='store_true')
    args = parser.parse_args()
    assert os.name != 'nt', 'Use the matching Linux/WSL cache'
    cache = args.incremental_cache.resolve()
    assert ROOT not in args.raw_out.resolve().parents, 'Raw output must stay outside repository'
    previous = json.loads(PREVIOUS.read_text())
    blueprint = json.loads((ROOT / 'archive/native-blueprint-build.json').read_text())
    bundle = ROOT / blueprint['sourceBundle']['path']
    assert bundle.stat().st_size == blueprint['sourceBundle']['bytes']
    assert digest(bundle) == blueprint['sourceBundle']['sha256'], 'Original source archive differs'
    with tarfile.open(bundle) as archive:
        original = archive.extractfile('source/' + SOURCE).read()
    assert digest(cache / 'source' / SOURCE) == ORIGINAL_SHA256
    assert sha256(original).hexdigest() == ORIGINAL_SHA256
    commit = subprocess.check_output(['git', '-C', str(cache / 'source'), 'rev-parse', 'HEAD'], text=True).strip()
    assert commit == blueprint['sourceCommit'], 'Prepared source commit differs'
    for name, expected in previous['sourceOverlays'].items():
        assert digest(cache / 'source/src' / name) == expected, 'Earlier source overlay differs: ' + name
    changed_sources = subprocess.check_output(['git', '-C', str(cache / 'source'), 'diff', '--name-only'], text=True).splitlines()
    assert set(changed_sources) == {'src/' + name for name in previous['sourceOverlays']}, 'Unexpected source changes'
    for entry in previous['raw']:
        path = cache / 'build/src' / entry['file']
        assert path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'], 'Earlier raw output differs'
    fallback = json.loads((ROOT / 'archive/fallback-0.50.json').read_text(encoding='utf-8-sig'))
    assert fallback['version'] == '0.50' and fallback['baseline'] == '0.49'
    apk_entry = next(entry for entry in fallback['files'] if entry['path'].endswith('.apk'))
    apk = host_path(apk_entry['path'])
    assert apk.stat().st_size == apk_entry['bytes'] and digest(apk) == apk_entry['sha256']
    payload = json.loads((ROOT / 'archive/native-theme-0.46/native-payload.json').read_text())
    with ZipFile(apk) as archive:
        for entry in payload['outputs']:
            data = archive.read('assets/warzone/' + entry['file'])
            assert len(data) == entry['bytes'] and sha256(data).hexdigest() == entry['sha256'], 'Delivered 0.49 native payload differs from 0.46'
    after = reconstruct(original)
    commands = []
    for target in [OBJECT, LIBRARY, 'warzone2100']:
        lines = subprocess.check_output(['ninja', '-C', str(cache / 'build'), '-t', 'commands', target], text=True).splitlines()
        assert lines
        commands.append(lines[-1])
    assert len(subprocess.check_output(['ninja', '-C', str(cache / 'build'), '-t', 'commands', OBJECT], text=True).splitlines()) == 1
    assert ' -c ' in commands[0] and SOURCE in commands[0] and OBJECT in commands[0]
    assert 'emar qc ' + LIBRARY in commands[1] and 'emranlib ' + LIBRARY in commands[1]
    assert ' -o src/warzone2100.html ' in commands[2] and ' -c ' not in commands[2]
    pre = {name: digest(cache / 'build' / name) for name in [OBJECT, LIBRARY, 'src/warzone2100.js', 'src/warzone2100.wasm']}
    objects_before = object_hashes(cache / 'build')
    assert OBJECT in objects_before and len(objects_before) > 100
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'original-main_sdl.cpp').write_bytes(original)
    (OUT / 'main_sdl.cpp').write_bytes(after)
    patch = ''.join(difflib.unified_diff(original.decode().splitlines(True), after.decode().splitlines(True),
                                       fromfile='a/' + SOURCE, tofile='b/' + SOURCE))
    (OUT / 'native-touch.patch').write_text(patch, encoding='utf-8', newline='\n')
    overlay = {'version': '0.50', 'guardPassed': True, 'sourceCommit': commit,
               'scope': 'Emscripten Towers marker plus MMB only: rapid camera presses remain KEY_PRESSED instead of KEY_DOUBLECLICK; all drag thresholds, release states, camera trackers and other buttons unchanged',
               'previousNativeBuild': str(PREVIOUS.relative_to(ROOT)), 'previousNativeBuildSHA256': digest(PREVIOUS),
               'sourceBundleSHA256': digest(bundle), 'originalSource': 'archive/native-touch-0.50/original-main_sdl.cpp',
               'originalSourceSHA256': ORIGINAL_SHA256, 'source': 'archive/native-touch-0.50/main_sdl.cpp',
               'sourceSHA256': sha256(after).hexdigest(), 'patchSHA256': digest(OUT / 'native-touch.patch'),
               'preservedSourceOverlays': previous['sourceOverlays'], 'preBuildHashes': pre,
               'preBuildObjects': objects_before,
               'priorChangedNativeSources': changed_sources,
               'frozenAPK': apk_entry, 'delivered049NativePayloadMatches046': True,
               'commands': commands, 'recipeSHA256': digest(Path(__file__))}
    write_json(OUT / 'source-overlay.json', overlay)
    if args.prepare_only:
        print(json.dumps(overlay)); return
    shutil.copyfile(OUT / 'main_sdl.cpp', cache / 'source' / SOURCE)
    assert digest(cache / 'source' / SOURCE) == overlay['sourceSHA256']
    start = time.monotonic()
    log = OUT / 'native-build.log'
    with log.open('w') as stream:
        for label, command in zip(['compile-one-object', 'archive-existing-SDL-objects', 'link-one-executable'], commands):
            stream.write('\n[' + label + ']\n' + command + '\n'); stream.flush()
            subprocess.run(['bash', '-c', 'source "$1/emsdk/emsdk_env.sh" && cd "$1/build" && eval "$2"',
                            'native-touch-050', str(cache), command], stdout=stream, stderr=subprocess.STDOUT,
                           check=True, timeout=180)
    post = {name: digest(cache / 'build' / name) for name in pre}
    objects_after = object_hashes(cache / 'build')
    assert set(objects_before) == set(objects_after)
    changed_objects = [name for name in objects_before if objects_before[name] != objects_after[name]]
    assert changed_objects == [OBJECT], 'Unexpected object change: ' + str(changed_objects)
    for name, expected in previous['sourceOverlays'].items():
        assert digest(cache / 'source/src' / name) == expected
    assert all(post[name] != pre[name] for name in [OBJECT, LIBRARY, 'src/warzone2100.wasm'])
    args.raw_out.mkdir(parents=True, exist_ok=True)
    proof = {'version': '0.50', 'passed': True, 'nativeBuildPerformed': True, 'nativeFullFreshBuildPerformed': False,
             'emulatorUsed': False, 'androidRuntimeExecuted': False, 'gameplayVerified': False,
             'compileScope': [OBJECT], 'compiledObjects': [OBJECT], 'staticArchives': [LIBRARY], 'executableLinks': 1,
             'engineObjectsChecked': len(objects_before), 'changedObjects': changed_objects,
             'allOtherEngineObjectsUnchanged': True,
             'execution': 'Only three exact prepared Ninja commands; no dependency planning/regeneration or other compilation',
             'cachePath': str(cache), 'elapsedSeconds': round(time.monotonic() - start, 3),
             'sourceOverlay': 'archive/native-touch-0.50/source-overlay.json', 'sourceOverlaySHA256': digest(OUT / 'source-overlay.json'),
             'sourceOverlays': dict(previous['sourceOverlays'], **{SOURCE: overlay['sourceSHA256']}),
             'previousNativeBuild': overlay['previousNativeBuild'], 'previousNativeBuildSHA256': digest(PREVIOUS),
             'preBuildHashes': pre, 'postBuildHashes': post, 'commands': commands,
             'log': 'archive/native-touch-0.50/native-build.log', 'logSHA256': digest(log),
             'recordedUTC': datetime.now(timezone.utc).isoformat(), 'raw': []}
    for name in ['warzone2100.js', 'warzone2100.wasm']:
        path = args.raw_out / name
        shutil.copy2(cache / 'build/src' / name, path)
        proof['raw'].append({'file': name, 'bytes': path.stat().st_size, 'sha256': digest(path)})
    write_json(OUT / 'native-build.json', proof)
    print(json.dumps({key: proof[key] for key in ['version', 'passed', 'compileScope', 'executableLinks', 'elapsedSeconds', 'raw']}))


if __name__ == '__main__':
    main()
