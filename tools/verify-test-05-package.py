"""Verify the scoped 0.5 package, including an explicitly source-built engine.

This verifies provenance, package/source identity and preservation, not gameplay.
Native build provenance is archive/native-blueprint-build.json with sourceVersion,
sourceCommit, sourceBundle/patch/recipe {path,sha256}, and runtimeArtifacts records.
All provenance paths are project-relative; sourceBundle contains the complete
native source tree, not a local build cache, toolchain, credentials or binaries.
"""
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
from hashlib import sha256
import argparse
import json
import math
import os
import re
import runpy
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent
QA = ROOT/'qa/test-05'
legacy = runpy.run_path(str(ROOT/'tools/package-test-04.py'), run_name='historical_helpers')
digest, read, require, local = (legacy[n] for n in ('digest', 'read', 'require', 'local'))
FROZEN = dict(legacy['FROZEN'], **{
    'Warzone-Towers-0.4.apk': '6f143ed3ca0f0678cd805e59fda00d97e8e859373e73b438f725e301f7201734',
    'warzone-towers-0.4-source.zip': '234c3e31f739009a27be2f2d09fc78206ed405f6c07386da86eacbab9866fae3',
    'Warzone-Towers-0.4-SHA256.txt': '4d5c6489aa17f17839e2d1f62f6411466995a5737e3156d9b87fa8f97b851cb9',
})
FALLBACK = BASE/'fallbacks/towers-before-preview-fix-20261107'
UI_ASSETS = {'assets/'+n for n in ('warzone-command-pages.js', 'warzone-terrain-picker.js', 'warzone/ui/build-display.js')}
MODELS_ASSET = 'assets/warzone/build-ghost-models.json'
NATIVE_PATH = 'archive/native-blueprint-build.json'
EMULATOR_CHECKS = {
    'queuedBlueprintAlignment', 'evenFootprints', 'oddFootprints',
    'ordinaryConstruction', 'moduleConstruction', 'mixedQueues',
    'selectionAndMovement', 'normalProduction', 'saveLoad', 'inputReturns', 'layout', 'previewPerformance',
}
CODE_CHECKS = {'ordinaryPreviewRenderer', 'mixedModuleRendering', 'invalidTerrainClearsPreview',
               'pendingPreviewFeedback', 'terrainHeightInvalidation', 'heightLookupIndex', 'terrainUploadMirror'}
NATIVE_SOURCE_SUBMODULES = (
    '3rdparty/EmbeddedJSONSignature', '3rdparty/GameNetworkingSockets',
    '3rdparty/GameNetworkingSockets/src/external/abseil',
    '3rdparty/GameNetworkingSockets/src/external/picojson',
    '3rdparty/GameNetworkingSockets/src/external/webrtc',
    '3rdparty/SQLiteCpp', '3rdparty/SQLiteCpp/googletest', '3rdparty/basis_universal',
    '3rdparty/date', '3rdparty/discord-rpc', '3rdparty/discord-rpc/thirdparty/rapidjson',
    '3rdparty/discord-rpc/thirdparty/rapidjson/thirdparty/gtest', '3rdparty/expected',
    '3rdparty/fmt', '3rdparty/glm', '3rdparty/launchinfo', '3rdparty/libplum',
    '3rdparty/quickjs-wz', '3rdparty/re2', '3rdparty/readerwriterqueue',
    '3rdparty/utf8proc', '3rdparty/utfcpp', 'lib/ivis_opengl/3rdparty/libjpeg-turbo',
    'lib/netplay/3rdparty/miniupnp', 'lib/sound/3rdparty/opusfile', 'tools/maptools-cli',
)


def record(path):
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path)}


def complete_package_index(script, data):
    """Parse the complete generated literal, including scientific-notation offsets.

    Do not use the historical entry regex: Emscripten minification writes offsets
    such as 6544e3, which that regex silently omitted. The entire package call is
    additionally compared byte-for-byte (UTF-8) against the frozen APK below.
    """
    starts = list(re.finditer(r'\bloadPackage\(\s*\{\s*(?:files|"files")\s*:', script))
    require(len(starts) == 1, 'Expected exactly one literal package index')
    start = starts[0].start()
    brace = script.index('{', start)
    depth, quote, escaped, close = 0, None, False, None
    for i in range(brace, len(script)):
        char = script[i]
        if quote:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == quote:
                quote = None
        elif char in ('"', "'"):
            quote = char
        elif char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                close = i
                break
    require(close is not None, 'Unterminated literal package index')
    suffix = re.match(r'\s*\)', script[close+1:])
    require(suffix is not None, 'Missing package-call closing parenthesis')
    end = close + 1 + suffix.end()
    # Generated Emscripten metadata is JSON with plain identifier keys unquoted.
    # json.loads parses the complete object, rather than selecting matching rows.
    metadata = json.loads(re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z_0-9]*)\s*:', r'\1"\2":', script[brace:close+1]))
    integral = lambda n: type(n) in (int, float) and math.isfinite(n) and n == int(n)
    size = metadata.get('remote_package_size')
    require(integral(size) and size == len(data), 'Package metadata has stale/invalid data length')
    entries = metadata.get('files')
    require(isinstance(entries, list) and entries, 'Missing package file table')
    files = {}
    for entry in entries:
        require(isinstance(entry, dict), 'Invalid package file entry')
        name, a, b = (entry.get(k) for k in ('filename', 'start', 'end'))
        require(isinstance(name, str) and name.startswith('/'), 'Invalid virtual filename')
        require(name not in files, 'Duplicate virtual filename: '+name)
        require(integral(a) and integral(b) and 0 <= a <= b <= len(data), 'Invalid virtual file offsets: '+name)
        files[name] = (int(a), int(b))
    require(len(files) == len(entries), 'Package file table was not parsed completely')
    return script[start:end], metadata, files


def native_inputs(path=ROOT/NATIVE_PATH):
    manifest = read(path)
    require(manifest.get('sourceVersion') == '4.7.0', 'Native source version must be explicit/exact')
    require(re.fullmatch(r'[a-fA-F0-9]{40}', manifest.get('sourceCommit', '')) is not None, 'Native source commit missing')
    records = []
    for name in ('sourceBundle', 'patch', 'recipe'):
        entry = manifest.get(name, {})
        require(isinstance(entry.get('path'), str) and entry['path'], 'Missing native '+name)
        file = local(entry['path'])
        require(file.is_file() and digest(file) == entry.get('sha256'), 'Native '+name+' hash mismatch')
        records.append(record(file))
    artifacts = manifest.get('runtimeArtifacts', [])
    require(len(artifacts) >= 2, 'Matched source-built runtime artifacts required')
    names = [e.get('path') for e in artifacts]
    require(len(set(names)) == len(names), 'Duplicate native runtime path')
    require({'app/src/main/assets/warzone/warzone2100.js', 'app/src/main/assets/warzone/warzone2100.wasm'} <= set(names), 'Matched JS/WASM pair missing')
    for entry in artifacts:
        name = entry['path']
        require(re.fullmatch(r'app/src/main/assets/warzone/warzone2100(?:[.][a-zA-Z0-9_-]+)*[.](?:js|wasm)', name) is not None, 'Unexpected native runtime artifact: '+name)
        file = local(name)
        require(file.is_file() and digest(file) == entry.get('sha256'), 'Native runtime hash mismatch: '+name)
        records.append(record(file))
    bundle = local(manifest['sourceBundle']['path'])
    if bundle.suffix.lower() == '.zip':
        with ZipFile(bundle) as archive:
            require(archive.testzip() is None, 'Native source archive CRC mismatch')
            members = archive.namelist()
    else:
        with tarfile.open(bundle, 'r:*') as archive:
            members = archive.getnames()
    for name in members:
        p = PurePosixPath(name.replace('\\', '/'))
        require(not p.is_absolute() and '..' not in p.parts, 'Unsafe native archive path')
        require(not any(part in {'.git', '.ssh', '.aws', 'node_modules', '__pycache__'} for part in p.parts), 'Private/build metadata in native archive')
        require(p.suffix.lower() not in {'.jks', '.keystore', '.pem', '.p12', '.pfx'} and not p.name.startswith('.env'), 'Secret file in native archive')
    renderer_paths = [n for n in members if n.endswith('/src/display3d.cpp') or n == 'src/display3d.cpp']
    require(len(renderer_paths) == 1, 'Expected one native renderer source tree')
    source_prefix = renderer_paths[0][:-len('src/display3d.cpp')]
    source_members = {n[len(source_prefix):] for n in members if n.startswith(source_prefix)}
    source_suffixes = {'.cpp', '.cc', '.c', '.h', '.hpp', '.inl', '.m', '.mm'}
    for submodule in NATIVE_SOURCE_SUBMODULES:
        require(any(n.startswith(submodule+'/') and PurePosixPath(n).suffix.lower() in source_suffixes for n in source_members), 'Native submodule source absent: '+submodule)
    require('CMakeLists.txt' in source_members and 'build_tools/autorevision.cache' in source_members, 'Source-only native configure/version inputs absent')
    require(any(n.endswith('CMakeLists.txt') for n in members) and sum(n.endswith('.cpp') for n in members) >= 100, 'Native source bundle incomplete')
    records.append(record(path))
    return manifest, records


def frozen_artifacts():
    records = []
    for name, expected in FROZEN.items():
        p = BASE/name
        require(digest(p) == expected, 'Frozen older artifact changed: '+name)
        records.append({'path': str(p), 'sha256': expected})
    for name in ('Warzone-Towers-0.4.apk', 'warzone-towers-0.4-source.zip', 'Warzone-Towers-0.4-SHA256.txt'):
        p = FALLBACK/name
        require(digest(p) == FROZEN[name], 'Copied initial fallback changed: '+name)
        records.append({'path': str(p), 'sha256': FROZEN[name]})
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--out', type=Path, default=QA/'package-verification.json')
    args = parser.parse_args()
    preserved_artifacts = frozen_artifacts()
    provenance, native_files = native_inputs()
    native_assets = {entry['path'].removeprefix('app/src/main/') for entry in provenance['runtimeArtifacts']}
    allowed = UI_ASSETS | native_assets | {MODELS_ASSET}
    with ZipFile(BASE/'Warzone-Towers-0.4.apk') as old, ZipFile(args.apk) as apk, ZipFile(BASE/'warzone-towers-0.4-source.zip') as source:
        require(apk.testzip() is None, 'APK CRC mismatch')
        old_assets = {n for n in old.namelist() if n.startswith('assets/') and not n.endswith('/')}
        assets = {n for n in apk.namelist() if n.startswith('assets/') and not n.endswith('/')}
        require(not old_assets-assets and assets-old_assets <= native_assets, 'Unexpected asset inventory changes')
        changed_assets = {n for n in old_assets & assets if old.read(n) != apk.read(n)} | (assets-old_assets)
        require(changed_assets <= allowed, 'Asset change outside preview scope: '+str(changed_assets-allowed))
        require({'assets/warzone/warzone2100.js', 'assets/warzone/warzone2100.wasm'} <= changed_assets, 'Expected source-built engine pair did not change')
        current = {'assets/'+p.relative_to(ROOT/'app/src/main/assets').as_posix(): p for p in (ROOT/'app/src/main/assets').rglob('*') if p.is_file()}
        require(current.keys() == assets, 'Source/APK asset inventory differs')
        for name, p in current.items():
            require(apk.read(name) == p.read_bytes(), 'Stale packaged source asset: '+name)
        old_models = json.loads(old.read(MODELS_ASSET))
        new_models = json.loads(apk.read(MODELS_ASSET))
        require(old_models.get('models', {}).keys() == new_models.get('models', {}).keys(), 'Original model inventory changed')
        for model in new_models['models'].values():
            bounds = model.pop('structureBounds', None)
            require(isinstance(bounds, dict) and set(bounds) == {'min', 'max'}, 'Exact native structure bounds missing')
            require(all(isinstance(bounds[k], list) and len(bounds[k]) == 3 and all(type(v) is int for v in bounds[k]) for k in ('min', 'max')), 'Invalid native structure bounds')
            require(all(a <= b for a,b in zip(bounds['min'], bounds['max'])), 'Inverted native structure bounds')
        require(old_models == new_models, 'Original model geometry or metadata changed beyond added structureBounds')
        data_name = 'assets/warzone/warzone2100.data'
        old_data, new_data = old.read(data_name), apk.read(data_name)
        require(old_data == new_data, 'Original engine data/scenario bytes changed')
        old_call, old_metadata, before = complete_package_index(old.read('assets/warzone/warzone2100.js').decode(), old_data)
        new_call, new_metadata, after = complete_package_index(apk.read('assets/warzone/warzone2100.js').decode(), new_data)
        require(len(before) == len(after) == 3849, 'Expected all 3849 frozen virtual files')
        require(old_call == new_call, 'Complete frozen loadPackage call changed')
        require(old_metadata == new_metadata and before == after, 'Complete package metadata/virtual file mapping changed')
        old_resources = {n for n in old.namelist() if n.startswith(('res/', 'lib/')) and not n.endswith('/')}
        resources = {n for n in apk.namelist() if n.startswith(('res/', 'lib/')) and not n.endswith('/')}
        require(resources == old_resources and all(apk.read(n) == old.read(n) for n in resources), 'Original Android resources/icon/native libraries changed')
        for name in ('classes.dex',):
            require(apk.read(name) == old.read(name), 'Android implementation changed')
        allowed_runtime = {'app/src/main/'+n for n in allowed} | {'app/build.gradle.kts'}
        baseline_runtime = {n for n in source.namelist() if not n.endswith('/') and n.startswith('app/src/')} | {'app/build.gradle.kts'}
        runtime = sorted(p for p in (ROOT/'app/src').rglob('*') if p.is_file())+[ROOT/'app/build.gradle.kts']
        runtime_names = {p.relative_to(ROOT).as_posix() for p in runtime}
        require(not baseline_runtime-runtime_names and runtime_names-baseline_runtime <= allowed_runtime, 'Unexpected runtime source inventory changes')
        changed_runtime = {n for n in baseline_runtime if local(n).read_bytes() != source.read(n)} | (runtime_names-baseline_runtime)
        require(changed_runtime <= allowed_runtime, 'Source change outside preview scope: '+str(changed_runtime-allowed_runtime))
        preserved_names = {n for n in source.namelist() if not n.endswith('/') and n.startswith(('vendor/', 'map/', 'scenario/', 'app/src/main/res/'))}
        current_preserved = {p.relative_to(ROOT).as_posix() for folder in ('vendor', 'map', 'scenario', 'app/src/main/res') for p in (ROOT/folder).rglob('*') if p.is_file()}
        require(preserved_names == current_preserved, 'Authored map/mod/scenario/resource source inventory changed')
        for name in preserved_names:
            require(local(name).read_bytes() == source.read(name), 'Preserved map/mod/scenario/resource changed: '+name)
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home()/'AppData/Local/Android/Sdk')))
    aapt = sdk/'build-tools/36.1.0/aapt2.exe'
    require(aapt.is_file(), 'Configure Android SDK build-tools 36.1.0')
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    for token in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='5'", "versionName='0.5'", "application-label:'Warzone Towers'"):
        require(token in badging, 'Wrong APK identity: '+token)
    report = {'passed': True, 'verification': 'Package/source/provenance only; exact-APK gameplay and visual checks separately required',
              'candidateAPK_SHA256': digest(args.apk), 'package': 'com.rbabbit.warzonetowers.lab', 'label': 'Warzone Towers', 'version': '0.5', 'versionCode': 5,
              'baselineAPK_SHA256': FROZEN['Warzone-Towers-0.4.apk'], 'sourceBuiltNativePreviewCorrection': True,
              'compiledEngineIdentical': False, 'engineDataAndPackageIndexUnchanged': True, 'originalResourcesMapsModRulesAndIconPreserved': True,
              'completeFrozenVirtualFiles': len(before), 'frozenFullPackageCallSHA256': sha256(old_call.encode('utf-8')).hexdigest(),
              'frozenEngineDataSHA256': sha256(old_data).hexdigest(),
              'modifiedAssets': sorted(changed_assets), 'changedRuntimeFiles': sorted(changed_runtime),
              'sourceAssetsMatchAPK': len(current), 'sourceFiles': [record(p) for p in runtime],
              'scenarioSourceFiles': [record(local(n)) for n in sorted(current_preserved) if n.startswith('scenario/')],
              'nativeSourceFiles': native_files, 'nativeSourceVersion': provenance['sourceVersion'], 'nativeSourceCommit': provenance['sourceCommit'],
              'preservedArtifacts': preserved_artifacts}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in {'sourceFiles', 'scenarioSourceFiles', 'nativeSourceFiles', 'preservedArtifacts'}}, indent=2))


if __name__ == '__main__':
    main()
