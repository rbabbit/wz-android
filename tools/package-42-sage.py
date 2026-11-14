"""Package v0.42's app-owned sage presentation without running the game.

Build/package integrity only: this never starts Android, an emulator, a browser,
or the native engine. It preserves the immutable complete v0.41 source archive,
raw-copies unchanged compressed ZIP members, and verifies every output member.
"""
from copy import copy
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
import argparse
import difflib
import json
import os
import re
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
COMMON = runpy.run_path(str(ROOT / 'tools/package-24-home.py'), run_name='package_042_common')
require, digest, zip_digest = (COMMON[k] for k in ('require', 'digest', 'zip_digest'))
MANIFEST, NATIVE_SOURCE, STORED, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[k] for k in (
    'MANIFEST', 'NATIVE_SOURCE', 'STORED', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
FALLBACK = 'archive/fallback-0.42.json'
RECORD = 'archive/release-0.42-source-build-only.json'
GRADLE = 'app/build.gradle.kts'
BASELINE_SHA = '39e2527c0e47c15e036a96bf0d1a20d562e4c1b861c03e290a2e27c0ef8bc31e'
SOURCE_SHA = '7a81918c9a86a0a6301c06efade35409eaf4969522f7fb72389c18579ce75253'
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
JAVA_SCOPE = {JAVA + n for n in ('TowersTheme.java', 'GraphicsSetupView.java',
    'MapPreviewPager.java', 'RewardsView.java', 'SavedGamesView.java',
    'RewardReceiptView.java', 'WarzoneSplashView.java', 'BattleBriefingView.java',
    'MainActivity.java', 'MusicSetupView.java')}
RESOURCE_SCOPE = {'app/src/main/res/values/colors.xml', 'app/src/main/res/values/styles.xml'}
JS_SCOPE = {'app/src/main/assets/' + n for n in ('warzone-command-pages.js',
    'warzone-touch-controls.js', 'warzone-mobile-research.js', 'warzone-intelligence.js',
    'warzone-towers-notices.js', 'warzone-towers-wave-hud.js', 'warzone-html-session.js',
    'warzone/index.html', 'warzone/briefing.js', 'warzone/saved-games.js')}
POLICY_JAVA = {JAVA + n for n in ('RewardLedger.java', 'RewardStore.java',
    'RewardedAdsController.java', 'SaveGameStore.java', 'RewardCatalog.java',
    'BattleLaunchSpec.java', 'MapLevelCatalog.java', 'MapMusicIndex.java',
    'MusicTrackCatalog.java', 'MusicTrackResponse.java', 'MusicPackStore.java')}
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
TEST_AD_UNIT = b'ca-app-pub-3940256099942544/5224354917'
LIVE_AD_UNIT = b'ca-app-pub-3430279660625393/5338770704'
NATIVE_ASSETS = {'assets/warzone/warzone2100.' + ext for ext in ('js', 'wasm')}
NATIVE_FOLDER = 'archive/native-theme-0.42/'
NATIVE_ORIGINAL = {
    'console.cpp': '358562db314857c7150b340adb7aec57af7c4bc4de085bbd578dfdace86d7ce8',
    'intdisplay.cpp': '6e01e3e4f202a5d326b15775bca6f636c2bd0b8e64f28446d8b76a19ee73e7e0',
}


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def app_theme_source(name):
    return (name in JAVA_SCOPE | RESOURCE_SCOPE | JS_SCOPE
            or name.removeprefix('app/src/main/') in NATIVE_ASSETS
            or name.startswith('app/src/main/assets/warzone/ui/') and name.endswith('.css'))


def repo_path(path):
    path = path.resolve()
    require(path.is_relative_to(ROOT), 'Source outside repository: ' + str(path))
    return path.relative_to(ROOT).as_posix()


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    require(saved.get('version') == '0.42' and saved.get('baseline') == '0.41', 'Wrong fallback record')
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.is_file() and path.stat().st_size == entry['bytes']
                and digest(path) == entry['sha256'], 'Fallback changed: ' + str(path))
    apk = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.41-Test-Ads.apk')
    source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.41-source.zip')
    require(digest(apk) == BASELINE_SHA and digest(source) == SOURCE_SHA, 'Wrong immutable baseline')
    return apk, source


def source_inventory(baseline_names):
    result = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    candidates = set(filter(None, result.decode('utf-8').split('\0'))) | baseline_names | {RECORD, MANIFEST}
    files = {}
    for name in sorted(candidates):
        rel = Path(name)
        if any(part in SKIP for part in rel.parts) or name in TRANSIENT or rel.suffix in {'.partial', '.tmp'}:
            require(name not in baseline_names, 'Baseline member would be omitted: ' + name)
            continue
        require(rel.suffix.lower() not in PRIVATE_SUFFIXES and not rel.name.startswith('.env')
                and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local file: ' + name)
        require(not name.endswith(('.apk', '-source.zip', '-data.tar')), 'Delivery/emulator archive in source: ' + name)
        path = ROOT / name
        repo_path(path)
        require(path.is_file() or name in {RECORD, MANIFEST}, 'Source removed: ' + name)
        files[name] = path
    require(baseline_names <= set(files), 'Complete baseline source must be retained')
    return files


def validate_source(source, files):
    changed, preserved = [], 0
    with ZipFile(source) as archive:
        require(len(archive.namelist()) == len(set(archive.namelist())), 'Duplicate baseline source member')
        prior = read_json_bytes(archive.read(MANIFEST))
        indexed = {e['path']: e for e in prior['files']}
        require(set(indexed) == set(archive.namelist()) - {MANIFEST}, 'Incomplete baseline source manifest')
        expected = archive.read(GRADLE).replace(b'versionCode = 41', b'versionCode = 42').replace(
            b'versionName = "0.41"', b'versionName = "0.42"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond version 42')
        for name, old in indexed.items():
            actual = digest(files[name])
            require(files[name].stat().st_size == old['bytes'] or actual != old['sha256'], 'Source size/hash contradiction: ' + name)
            if actual == old['sha256']:
                preserved += 1
                continue
            require(name in {GRADLE, 'AGENTS.md', 'README.md', 'design-qa.md'} or app_theme_source(name),
                    'Existing source changed beyond app presentation: ' + name)
            require(name not in POLICY_JAVA, 'Wallet/save/ads/maps policy changed: ' + name)
            changed.append({'path': name, 'beforeSHA256': old['sha256'], 'sha256': actual})
        new_app = {n for n in files if n.startswith('app/src/main/') and n not in indexed}
        require(all(app_theme_source(n) for n in new_app), 'Unexpected new app source: ' + str(sorted(new_app)))
        require(any(n['path'].endswith('/towers-monochrome.css') for n in changed), 'Whole-app theme stylesheet not changed')
        return {'changedSources': changed, 'preservedBaselineFiles': preserved,
                'addedAppSources': sorted(new_app), 'baselineSourceEntries': len(archive.namelist()),
                'baselineSourceSHA256': SOURCE_SHA}


def read_json_bytes(value):
    return json.loads(value.decode('utf-8-sig'))


def sdk_paths():
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'AppData/Local/Android/Sdk')))
    java = Path(os.environ.get('JAVA_HOME', 'C:/Program Files/Android/Android Studio/jbr')) / 'bin/java.exe'
    return sdk / 'build-tools/36.1.0/aapt2.exe', java, sdk / 'build-tools/36.1.0/lib/apksigner.jar'


def certificate(path, java, signer):
    output = subprocess.check_output([str(java), '-jar', str(signer), 'verify', '--verbose', '--print-certs', str(path)], text=True, encoding='utf-8')
    require('Verified using v2 scheme (APK Signature Scheme v2): true' in output, 'Invalid APK v2 signature')
    match = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)', output)
    require(match, 'Signing certificate missing')
    return match[1].lower()


def verify_native_theme(candidate, baseline):
    """Bind the two guarded palette objects and reconstruct the loader exactly.

    This is file/provenance verification, not native runtime execution. The
    preserved 0.41 source manifest already freezes every prior native overlay.
    """
    overlay_path = ROOT / NATIVE_FOLDER / 'source-overlay.json'
    build_path = ROOT / NATIVE_FOLDER / 'native-build.json'
    runtime_path = ROOT / NATIVE_FOLDER / 'native-runtime-integration.json'
    payload_path = ROOT / NATIVE_FOLDER / 'native-payload.json'
    overlay, build, runtime = (read_json(p) for p in (overlay_path, build_path, runtime_path))
    payload = read_json(payload_path)
    prior_path = ROOT / 'archive/native-production-0.41/native-build.json'
    prior = read_json(prior_path)
    require(overlay.get('version') == '0.42' and overlay.get('guardPassed') is True
            and overlay.get('baselineSourceBundle') == NATIVE_SOURCE
            and overlay.get('previousNativeBuildSHA256') == digest(prior_path), 'Native source baseline proof differs')
    recipe_path = ROOT / 'tools/build-native-theme-042.py'
    recipe = runpy.run_path(str(recipe_path), run_name='package_042_palette_recipe')
    require(recipe['ORIGINAL'] == NATIVE_ORIGINAL, 'Original presentation-source identities differ')
    require({r['file'] for r in overlay['sources']} == set(NATIVE_ORIGINAL), 'Native source scope exceeds two presentation files')
    expected_patch = ''
    source_hashes = {}
    proofs = {repo_path(p) for p in (overlay_path, build_path, runtime_path, payload_path, recipe_path)}
    for row in overlay['sources']:
        original, current = ROOT / row['originalPath'], ROOT / row['path']
        repo_path(original); repo_path(current)
        require(digest(original) == row['originalSHA256'] == NATIVE_ORIGINAL[row['file']], 'Original native presentation source differs')
        after = recipe['reconstruct'](row['file'], original.read_bytes())
        require(current.read_bytes() == after and digest(current) == row['sha256'], 'Native palette source differs from guarded reconstruction')
        source_hashes[row['file']] = row['sha256']
        expected_patch += ''.join(difflib.unified_diff(original.read_text().splitlines(True), after.decode().splitlines(True),
            fromfile='a/src/' + row['file'], tofile='b/src/' + row['file']))
        proofs.update((repo_path(original), repo_path(current)))
    patch = ROOT / overlay['patch']; repo_path(patch)
    require(patch.read_bytes() == expected_patch.encode() and digest(patch) == overlay['patchSHA256'], 'Native palette patch differs')
    proofs.add(repo_path(patch))
    prior_sources = {
        'display3d.cpp': 'archive/native-hud-0.31/display3d.cpp',
        'research.cpp': 'archive/native-notices-0.34/research.cpp',
        'keybind.cpp': 'archive/native-notices-0.35/keybind.cpp',
        'hci.cpp': 'archive/native-intelligence-0.36/hci.cpp',
        'quickjs_backend.cpp': 'archive/native-production-0.41/quickjs_backend.cpp',
    }
    retained = {n: digest(ROOT / p) for n, p in prior_sources.items()}
    require(retained == prior['sourceOverlays'] == overlay['preservedSourceOverlays']
            == build['preservedSourceOverlays'], 'Earlier native overlays changed')
    expected_objects = ['src/CMakeFiles/warzone2100.dir/console.cpp.o',
                        'src/CMakeFiles/warzone2100.dir/intdisplay.cpp.o']
    require(build.get('version') == '0.42' and build.get('passed') is True
            and build.get('nativeBuildPerformed') is True and build.get('nativeFullFreshBuildPerformed') is False
            and build.get('relinkedNativeEngine') is True and sorted(build['compiledObjects']) == expected_objects
            and build['sourceOverlays'] == retained | source_hashes
            and build['sourceOverlaySHA256'] == digest(overlay_path)
            and build['previousNativeBuildSHA256'] == digest(prior_path), 'Native two-object build/source lineage differs')
    require(overlay['originalBuildRecipeSHA256'] == prior['originalBuildRecipeSHA256']
            == digest(ROOT / 'tools/build-native-blueprint.sh'), 'Original native build recipe changed')
    log = ROOT / build['log']; repo_path(log)
    log_text = log.read_text()
    require(digest(log) == build['logSHA256']
            and sorted(re.findall(r'Building CXX object (\S+)', log_text)) == expected_objects
            and len(re.findall(r'Linking CXX executable[^\n]*warzone2100', log_text)) == 1, 'Native compile log exceeds two palette objects')
    proofs.add(repo_path(log))
    require(runtime.get('version') == '0.42' and runtime.get('passed') is True
            and runtime['baselineAPK']['sha256'] == BASELINE_SHA
            and runtime.get('generatedCodeUnchangedOutsideIndexAndExistingWorkerHook') is True,
            'Matched native loader integration proof missing')
    require(payload.get('version') == '0.42' and payload.get('passed') is True
            and payload.get('baselineSHA256') == BASELINE_SHA
            and payload.get('nativeRuntimeProofSHA256') == digest(runtime_path)
            and payload.get('changedVFSFiles') == payload.get('addedVFSFiles') == payload.get('removedVFSFiles') == [],
            'Authored VFS preservation proof differs')
    raw_by_name = {r['file']: r for r in build['raw']}
    require(set(raw_by_name) == {'warzone2100.js', 'warzone2100.wasm'}, 'Unexpected native generated output')
    raw_js_path, raw_wasm_path = Path(runtime['raw']['jsPath']), Path(runtime['raw']['wasmPath'])
    for name, path, field in (('warzone2100.js', raw_js_path, 'jsSHA256'), ('warzone2100.wasm', raw_wasm_path, 'wasmSHA256')):
        require(path.is_file() and path.stat().st_size == raw_by_name[name]['bytes']
                and digest(path) == raw_by_name[name]['sha256'] == runtime['raw'][field], 'Native generated bytes differ: ' + name)
    integrator = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='package_042_loader_helpers')
    with ZipFile(baseline) as old, ZipFile(candidate) as apk:
        old_js = old.read('assets/warzone/warzone2100.js').decode()
        data = old.read('assets/warzone/warzone2100.data')
        raw_js = raw_js_path.read_text(encoding='utf-8')
        _, _, frozen_index, metadata = integrator['package_call'](old_js)
        start, stop, _, _ = integrator['package_call'](raw_js)
        hooks = re.findall(r'var out=console\.log\.bind\(console\);var blockNightOutputChannel=.*?;var wasmBinary;', old_js, re.S)
        require(len(hooks) == 1, 'Exact frozen worker hook missing')
        original = 'var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;'
        require(raw_js.count(original) == 1 and 'blockNightOutputChannel' not in raw_js, 'Generated native stdout hook differs')
        expected_js = (raw_js[:start] + frozen_index + raw_js[stop:]).replace(original, hooks[0], 1).encode()
        require(apk.read('assets/warzone/warzone2100.js') == expected_js, 'Native loader changed beyond exact frozen index/output hook')
        require(apk.read('assets/warzone/warzone2100.data') == data, 'Native data/scenario/VFS bytes changed')
        require(zip_digest(apk, 'assets/warzone/warzone2100.wasm') == raw_by_name['warzone2100.wasm']['sha256'], 'Native WASM changed after source build')
        contract = integrator['verify_runtime_contract'](old_js, raw_js)
        virtual_files = integrator['verify_index'](metadata, data)
        require(runtime['frozenVirtualFiles'] == len(virtual_files)
                and runtime['frozenDataSHA256'] == sha256(data).hexdigest()
                and runtime['frozenPackageIndexSHA256'] == sha256(frozen_index.encode()).hexdigest()
                and runtime['frozenWorkerOutputHookSHA256'] == sha256(hooks[0].encode()).hexdigest(), 'Frozen native authored-data proof differs')
        require(len(runtime['integrated']) == 3 and runtime['integrated'] == payload['outputs']
                and payload['unchangedVirtualFiles'] == len(virtual_files), 'Native payload summary differs')
        for row in runtime['integrated']:
            name = 'assets/warzone/' + row['file']
            require(apk.getinfo(name).file_size == row['bytes'] and zip_digest(apk, name) == row['sha256'], 'Native integrated output hash differs')
    proofs.add('tools/integrate-native-theme-042.py')
    return {'changedCPPFiles': sorted(NATIVE_ORIGINAL), 'sourceBuiltPaletteOnly': True,
            'nativeBuildPerformed': True, 'nativeFullFreshBuildPerformed': False,
            'compiledObjects': expected_objects, 'frozenVirtualFiles': len(virtual_files),
            'priorNativeOverlaysFrozen': True, 'generatedLoaderExactlyReconstructed': True,
            'nativeDataUnchanged': True, 'runtimeContract': contract,
            'proofInputs': [{'path': n, 'sha256': digest(ROOT / n)} for n in sorted(proofs)]}


def validate_apk(candidate, baseline, candidate_sha):
    require(candidate.is_file() and digest(candidate) == candidate_sha, 'Candidate APK hash differs')
    aapt, java, signer = sdk_paths()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(candidate)], text=True, encoding='utf-8')
    require(all(v in badging for v in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='42'",
            "versionName='0.42'", "application-label:'Warzone Towers'", 'application-debuggable')), 'Wrong APK identity/version')
    xml = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(candidate), '--file', 'AndroidManifest.xml'], text=True, encoding='utf-8')
    require(APP_ID in xml, 'Publisher consent app ID changed')
    resources = subprocess.check_output([str(aapt), 'dump', 'resources', str(candidate)], text=True, encoding='utf-8').lower()
    require('#ffdce8cf' in resources and '#ff10170c' in resources, 'Compiled sage/ink palette missing')
    signing_sha = certificate(candidate, java, signer)
    require(signing_sha == certificate(baseline, java, signer), 'Signing identity changed')
    with ZipFile(candidate) as apk, ZipFile(baseline) as old:
        names, old_names = set(apk.namelist()), set(old.namelist())
        require(len(names) == len(apk.namelist()) and apk.testzip() is None, 'Duplicate/corrupt APK member')
        require({n for n in names if n.startswith('assets/')} == {n for n in old_names if n.startswith('assets/')}, 'App asset inventory changed')
        changed = []
        native = {}
        for name in sorted(names | old_names):
            same = name in names & old_names and zip_digest(apk, name) == zip_digest(old, name)
            if name in {'assets/warzone/warzone2100.' + ext for ext in ('js', 'data', 'wasm')}:
                native[name] = zip_digest(apk, name)
            if same:
                continue
            allowed_asset = name.startswith('assets/') and app_theme_source('app/src/main/' + name)
            allowed_compiled = COMMON['metadata'](name) or name.startswith('res/')
            require(allowed_asset or allowed_compiled, 'APK changed beyond approved app presentation: ' + name)
            changed.append(name)
        require(len(native) == 3, 'Native engine/loader/data missing')
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in names and digest(path) == zip_digest(apk, name), 'Stale APK asset: ' + name)
        music = 'assets/warzone/music/music.data'
        require(apk.getinfo(music).compress_type == ZIP_STORED and zip_digest(apk, music) == zip_digest(old, music), 'Original bundled music changed/compressed')
        dex = [apk.read(n) for n in names if re.fullmatch(r'classes(?:\d+)?\.dex', n)]
        require(any(TEST_AD_UNIT in v for v in dex) and not any(LIVE_AD_UNIT in v for v in dex), 'Only sample ads may ship')
    native_theme = verify_native_theme(candidate, baseline)
    return {'changedAPKMembers': changed, 'nativeAssetSHA256': native,
            'sameSigningCertificateAs041': True, 'certificateSHA256': signing_sha,
            'nativePresentationIntegration': native_theme,
            'nativeDataMapsMusicAndArtworkUnchanged': True, 'testAdsOnly': True}


def raw_copy_member(old, target, info, end):
    """Keep original compressed/local-header bytes, rebuilding only central offsets."""
    require(not target._writing, 'Cannot copy while ZIP entry writer is active')
    target.fp.seek(target.start_dir)
    copied = copy(info)
    copied.header_offset = target.fp.tell()
    old.fp.seek(info.header_offset)
    left = end - info.header_offset
    require(left >= info.compress_size, 'Invalid source member span')
    while left:
        block = old.fp.read(min(left, 4 * 1024 * 1024))
        require(block, 'Unexpected end of frozen source ZIP')
        target.fp.write(block)
        left -= len(block)
    target.filelist.append(copied)
    target.NameToInfo[copied.filename] = copied
    target.start_dir = target.fp.tell()
    target._didModify = True


def write_source_zip(source, partial, files, entries):
    expected = {e['path']: e for e in entries}
    reused = 0
    with ZipFile(source) as old, ZipFile(partial, 'w', ZIP_DEFLATED, compresslevel=3, allowZip64=True) as target:
        old_order = sorted(old.infolist(), key=lambda i: i.header_offset)
        ends = {info.filename: (old_order[i + 1].header_offset if i + 1 < len(old_order) else old.start_dir)
                for i, info in enumerate(old_order)}
        old_manifest = {e['path']: e for e in read_json_bytes(old.read(MANIFEST))['files']}
        for name, path in files.items():
            if name in old_manifest and expected[name]['sha256'] == old_manifest[name]['sha256']:
                raw_copy_member(old, target, old.getinfo(name), ends[name])
                reused += 1
            else:
                target.write(path, name, compress_type=ZIP_STORED if path.suffix.lower() in STORED else ZIP_DEFLATED)
    with ZipFile(partial) as archive:
        require(len(archive.namelist()) == len(files) and set(archive.namelist()) == set(files), 'Source archive inventory differs')
        require(archive.getinfo(NATIVE_SOURCE).file_size > 100 * 1024 * 1024, 'Full native source missing/LFS pointer')
        for name, path in files.items():
            actual = zip_digest(archive, name)  # Reading to EOF also verifies CRC.
            require(actual == digest(path) and (name == MANIFEST or actual == expected[name]['sha256']), 'Source changed/corrupt while packaging: ' + name)
    return reused


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Output must remain outside source tree')
    apk_out = args.output / 'Warzone-Towers-0.42-Test-Ads.apk'
    source_out = args.output / 'warzone-towers-0.42-source.zip'
    checksums = args.output / 'Warzone-Towers-0.42-Test-Ads-SHA256.txt'
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksums, partial)), 'Existing output/partial must not be overwritten')
    baseline, source = baseline_paths()
    with ZipFile(source) as archive:
        baseline_names = set(archive.namelist())
    files = source_inventory(baseline_names)
    preservation = validate_source(source, files)
    apk_record = validate_apk(args.apk, baseline, args.expected_sha256.lower())
    require({e['path'] for e in apk_record['nativePresentationIntegration']['proofInputs']} <= set(files),
            'Native theme source/build reproduction proof omitted from complete source inventory')
    record = {'version': '0.42', 'versionCode': 42,
        'scope': 'Approved option 1 light sage/black presentation across app-owned native and WebView screens; build/package integrity only.',
        'emulatorUsed': False, 'browserFixturesUsed': False, 'androidRuntimeExecuted': False,
        'actualNativeEngineExecuted': False, 'nativeBuildPerformed': True, 'gameplayVerified': False,
        'gpuRenderingVerified': False, 'layoutRuntimeVerified': False, 'liveAdsTested': False,
        'candidateAPK_SHA256': args.expected_sha256.lower(), 'sourcePreservation': preservation,
        'fallbackRecord': {'path': FALLBACK, 'sha256': digest(ROOT / FALLBACK)},
        'sourceInventory': 'Complete prior ZIP plus current git source inventory; caches/private/transient files excluded.',
        'githubPublished': False, 'vpsChanged': False,
        'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'), **apk_record}
    if args.validate_only:
        print(json.dumps({'packageValidationPassed': True, 'deliveryWritten': False,
            'sourceFiles': len(files), 'changedSources': preservation['changedSources'],
            'changedAPKMembers': apk_record['changedAPKMembers'], 'emulatorUsed': False}, indent=2))
        return
    write_json(ROOT / RECORD, record)
    entries = [{'path': name, 'bytes': path.stat().st_size, 'sha256': digest(path)}
               for name, path in files.items() if name != MANIFEST]
    write_json(ROOT / MANIFEST, {'schemaVersion': 1, 'files': entries})
    args.output.mkdir(parents=True, exist_ok=True)
    reused = write_source_zip(source, partial, files, entries)
    require(digest(args.apk) == args.expected_sha256.lower(), 'Candidate APK changed during source packaging')
    shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == args.expected_sha256.lower(), 'Delivery APK differs from compiled candidate')
    partial.rename(source_out)
    source_sha = digest(source_out)
    checksums.write_text(f'{args.expected_sha256.lower()}  {apk_out.name}\n{source_sha}  {source_out.name}\n', encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed': True, 'emulatorUsed': False, 'gameplayVerified': False,
        'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size, 'candidateAPK_SHA256': args.expected_sha256.lower(),
        'source': str(source_out), 'sourceBytes': source_out.stat().st_size, 'sourceZIP_SHA256': source_sha,
        'sourceFiles': len(files), 'rawCopiedUnchangedZIPMembers': reused,
        'sourceWithin2GiB': source_out.stat().st_size < 2 * 1024 ** 3,
        'streamedEverySourceEntryCRCAndSHA': True, 'checksums': str(checksums)}, indent=2))


if __name__ == '__main__':
    main()
