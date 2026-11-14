"""Package v0.44's HUD, Home, explicit-save and live rewarded-ad configuration.

Source/build/archive integrity only. Never starts Android, an emulator, browser,
native gameplay or an ad request. Retains every complete v0.43 source ZIP entry
and raw-copies unchanged compressed members, including the full native source.
"""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
import argparse
import difflib
import json
import re
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PRIOR = runpy.run_path(str(ROOT / 'tools/package-43-home-queue.py'), run_name='package_044_helpers')
COMMON = PRIOR['COMMON']
require, digest, zip_digest = (COMMON[n] for n in ('require', 'digest', 'zip_digest'))
MANIFEST, NATIVE_SOURCE, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[n] for n in (
    'MANIFEST', 'NATIVE_SOURCE', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
read_json, write_json, sdk_paths, certificate, write_source_zip = (PRIOR[n] for n in (
    'read_json', 'write_json', 'sdk_paths', 'certificate', 'write_source_zip'))
FALLBACK = 'archive/fallback-0.44.json'
RECORD = 'archive/release-0.44-source-build-only.json'
GRADLE = 'app/build.gradle.kts'
BASELINE_SHA = '297d1e0736e0c04fc6371edec22b2ca00d0d27d82c58f28796ba4387e60a09ef'
SOURCE_SHA = '1998981d406d3a76414f2fe5d469ec9180333d4ac93c72154b61fc782de8f35e'
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
LIVE_UNIT = 'ca-app-pub-3430279660625393/5338770704'
SAMPLE_UNIT = 'ca-app-pub-3940256099942544/5224354917'
BUILD_CONFIG = 'app/build/generated/source/buildConfig/debug/com/rbabbit/blocknight/warzone/BuildConfig.java'
NATIVE_FOLDER = 'archive/native-hud-0.44/'
ORIGINAL = {
    'intdisplay.cpp': 'c3e78b002a00be9b6d0843120f63c63fcccca1aa5e1a0fb39043a6bc4541e673',
    'loadsave.cpp': 'fe62f8484ec76549b4ef113afafd12ddc6cb21c76346bf5be1fd8e39829227e6',
}
NATIVE_ASSETS = {'assets/warzone/warzone2100.' + ext for ext in ('js', 'wasm')}
SOURCE_SCOPE = {JAVA + n for n in ('MainActivity.java', 'GraphicsSetupView.java',
    'WarzoneSplashView.java', 'RewardReceiptView.java')}
SOURCE_SCOPE |= {'app/src/main/assets/' + n for n in ('warzone-touch-controls.js',
    'warzone-command-pages.js', 'warzone-towers-wave-hud.js', 'warzone/ui/lab-ui.js',
    'warzone/ui/towers-status.js', 'warzone/music-loader.js', 'warzone/index.html')}
SOURCE_SCOPE |= {'app/src/main/' + n for n in NATIVE_ASSETS}


def allowed_source(name):
    return name in SOURCE_SCOPE or name.startswith('app/src/main/assets/warzone/ui/') and name.endswith('.css')


def repo_path(path):
    path = path.resolve()
    require(path.is_relative_to(ROOT), 'Source outside repository: ' + str(path))
    return path.relative_to(ROOT).as_posix()


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    require(saved.get('version') == '0.44' and saved.get('baseline') == '0.43', 'Wrong fallback record')
    for row in saved['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'],
                'Immutable v0.43 fallback changed: ' + str(path))
    apk = next(Path(r['path']) for r in saved['files'] if r['path'].endswith('Warzone-Towers-0.43-Test-Ads.apk'))
    source = next(Path(r['path']) for r in saved['files'] if r['path'].endswith('warzone-towers-0.43-source.zip'))
    require(digest(apk) == BASELINE_SHA and digest(source) == SOURCE_SHA, 'Wrong v0.43 baseline')
    return apk, source


def source_inventory(baseline_names):
    result = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    candidates = set(filter(None, result.decode('utf-8').split('\0'))) | baseline_names | {RECORD, MANIFEST}
    files = {}
    for name in sorted(candidates):
        rel = Path(name)
        if any(part in SKIP for part in rel.parts) or name in TRANSIENT or rel.suffix in {'.partial', '.tmp'}:
            require(name not in baseline_names, 'Prior source entry would be omitted: ' + name)
            continue
        require(rel.suffix.lower() not in PRIVATE_SUFFIXES and not rel.name.startswith('.env')
                and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local source file: ' + name)
        require(not name.endswith(('.apk', '-source.zip', '-data.tar')), 'Delivery/runtime archive in source tree: ' + name)
        path = ROOT / name
        repo_path(path)
        require(path.is_file() or name in {RECORD, MANIFEST}, 'Required prior source was removed: ' + name)
        files[name] = path
    require(baseline_names <= set(files), 'Complete prior source archive must be retained')
    return files


def gradle_program(value):
    # Comment-only explanation updates may accompany the live-default change.
    return '\n'.join(line.rstrip() for line in value.replace('\r\n', '\n').splitlines()
                     if not re.match(r'^\s*//', line))


def validate_source(source, files):
    changed, preserved = [], 0
    with ZipFile(source) as archive:
        names = set(archive.namelist())
        require(len(names) == len(archive.namelist()), 'Duplicate baseline source ZIP member')
        prior = json.loads(archive.read(MANIFEST))
        indexed = {r['path']: r for r in prior['files']}
        require(set(indexed) == names - {MANIFEST}, 'Prior source manifest incomplete')
        expected = archive.read(GRADLE).decode().replace('versionCode = 43', 'versionCode = 44').replace(
            'versionName = "0.43"', 'versionName = "0.44"').replace('.orElse(false).get()', '.orElse(true).get()')
        require(gradle_program(files[GRADLE].read_text(encoding='utf-8')) == gradle_program(expected),
                'Gradle changed beyond version44, live-ad default and comments')
        for name, before in indexed.items():
            actual = digest(files[name])
            if actual == before['sha256']:
                preserved += 1
                continue
            require(name in {GRADLE, 'AGENTS.md', 'README.md', 'design-qa.md'} or allowed_source(name),
                    'Existing source changed outside HUD/Home/autosave/live-config scope: ' + name)
            changed.append({'path': name, 'beforeSHA256': before['sha256'], 'sha256': actual})
        new_app = {n for n in files if n.startswith('app/src/main/') and n not in indexed}
        require(not new_app, 'No new app files/assets are authorized: ' + str(sorted(new_app)))
        require({'app/src/main/assets/warzone-touch-controls.js',
                 'app/src/main/assets/warzone-command-pages.js', JAVA + 'GraphicsSetupView.java',
                 'app/src/main/assets/warzone/index.html'} <= {r['path'] for r in changed}, 'Required HUD/Home/autosave changes missing')
    return {'changedSources': changed, 'preservedBaselineFiles': preserved,
            'addedAppSources': [], 'baselineSourceEntries': len(indexed) + 1,
            'baselineSourceSHA256': SOURCE_SHA, 'scenarioDataArtMusicPolicySourcesFrozen': True}


def verify_native_hud(candidate, baseline):
    """Bind exactly two source-built objects while keeping all43 VFS data frozen."""
    folder = ROOT / NATIVE_FOLDER
    build_path, overlay_path = folder / 'native-build.json', folder / 'source-overlay.json'
    runtime_path, payload_path = folder / 'native-runtime-integration.json', folder / 'native-payload.json'
    build, overlay, runtime, payload = (read_json(p) for p in (build_path, overlay_path, runtime_path, payload_path))
    prior_path = ROOT / 'archive/native-queue-0.43/native-build.json'
    prior = read_json(prior_path)
    recipe_path = ROOT / 'tools/build-native-hud-044.py'
    recipe = runpy.run_path(str(recipe_path), run_name='package_044_native_recipe')
    require(recipe['ORIGINAL'] == ORIGINAL, 'Native original power/save source identities differ')
    proof_paths = {repo_path(p) for p in (build_path, overlay_path, runtime_path, payload_path, recipe_path)}
    expected_patch, source_hashes = '', {}
    for name, before in ORIGINAL.items():
        original, current = folder / ('original-' + name), folder / name
        require(digest(original) == before, 'Original native source differs: ' + name)
        after = recipe['reconstruct'](name, original.read_bytes())
        require(current.read_bytes() == after, 'Native source differs from guarded reconstruction: ' + name)
        source_hashes[name] = digest(current)
        expected_patch += ''.join(difflib.unified_diff(original.read_text().splitlines(True), after.decode().splitlines(True),
            fromfile='a/src/' + name, tofile='b/src/' + name))
        proof_paths.update((repo_path(original), repo_path(current)))
    patch = folder / 'native-hud.patch'
    require(patch.read_bytes() == expected_patch.encode(), 'Native HUD/autosave patch differs')
    require(overlay.get('version') == '0.44' and overlay.get('guardPassed') is True
            and overlay.get('originalSources') == ORIGINAL and overlay.get('sourceOverlays') == source_hashes
            and overlay.get('patchSHA256') == digest(patch)
            and overlay.get('previousNativeBuildSHA256') == digest(prior_path)
            and overlay.get('preservedSourceOverlays') == prior['sourceOverlays'], 'Native source/retained-overlay lineage differs')
    require(overlay.get('originalBuildRecipeSHA256') == digest(ROOT / 'tools/build-native-blueprint.sh'),
            'Original matching native build recipe changed')
    require(prior['sourceOverlays']['intdisplay.cpp'] == ORIGINAL['intdisplay.cpp'], 'Prior accepted power theme differs')
    expected_sources = prior['sourceOverlays'] | source_hashes
    objects = ['src/CMakeFiles/warzone2100.dir/intdisplay.cpp.o', 'src/CMakeFiles/warzone2100.dir/loadsave.cpp.o']
    require(build.get('version') == '0.44' and build.get('passed') is True
            and build.get('nativeBuildPerformed') is True and build.get('nativeFullFreshBuildPerformed') is False
            and build.get('relinkedNativeEngine') is True and build.get('compiledObjects') == objects
            and build.get('sourceOverlays') == expected_sources
            and build.get('preservedSourceOverlays') == prior['sourceOverlays']
            and build.get('previousNativeBuildSHA256') == digest(prior_path)
            and build.get('sourceOverlaySHA256') == digest(overlay_path), 'Two-object native HUD/save build provenance differs')
    log = ROOT / build['log']; repo_path(log)
    log_text = log.read_text(encoding='utf-8')
    require(digest(log) == build['logSHA256']
            and sorted(re.findall(r'Building CXX object (\S+)', log_text)) == objects
            and len(re.findall(r'Linking CXX executable[^\n]*warzone2100', log_text)) == 1,
            'Native build exceeds approved two objects and one link')
    require(runtime.get('version') == payload.get('version') == '0.44'
            and runtime.get('passed') is True and payload.get('passed') is True
            and runtime['baselineAPK']['sha256'] == payload.get('baselineSHA256') == BASELINE_SHA
            and payload.get('nativeBuildProofSHA256') == digest(build_path)
            and payload.get('nativeRuntimeProofSHA256') == digest(runtime_path)
            and payload.get('changedVFSFiles') == payload.get('addedVFSFiles') == payload.get('removedVFSFiles') == [],
            'Native runtime/frozen-VFS proof differs')
    raw_rows = {r['file']: r for r in build['raw']}
    require(set(raw_rows) == {'warzone2100.js', 'warzone2100.wasm'}, 'Unexpected generated native output')
    raw_js_path, raw_wasm_path = Path(runtime['raw']['jsPath']), Path(runtime['raw']['wasmPath'])
    for filename, path in (('warzone2100.js', raw_js_path), ('warzone2100.wasm', raw_wasm_path)):
        require(path.is_file() and path.stat().st_size == raw_rows[filename]['bytes']
                and digest(path) == raw_rows[filename]['sha256'], 'Source-built native output differs: ' + filename)
    helper = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='package_044_runtime_helpers')
    with ZipFile(baseline) as old, ZipFile(candidate) as apk:
        old_js = old.read('assets/warzone/warzone2100.js').decode()
        old_data = old.read('assets/warzone/warzone2100.data')
        script = apk.read('assets/warzone/warzone2100.js').decode()
        data = apk.read('assets/warzone/warzone2100.data')
        raw_js = raw_js_path.read_text(encoding='utf-8')
        _, _, frozen_index, frozen_meta = helper['package_call'](old_js)
        _, _, index, meta = helper['package_call'](script)
        begin, end, _, _ = helper['package_call'](raw_js)
        names = helper['verify_index'](frozen_meta, old_data)
        require(data == old_data and meta == frozen_meta and index == frozen_index
                and helper['verify_index'](meta, data) == names, 'Authored native data/VFS/index changed')
        hooks = re.findall(r'var out=console\.log\.bind\(console\);var blockNightOutputChannel=.*?;var wasmBinary;', old_js, re.S)
        require(len(hooks) == 1, 'Exact prior worker-output hook missing')
        original_hook = 'var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;'
        require(raw_js.count(original_hook) == 1 and 'blockNightOutputChannel' not in raw_js, 'Generated stdout hook differs')
        expected_js = (raw_js[:begin] + frozen_index + raw_js[end:]).replace(original_hook, hooks[0], 1)
        require(script == expected_js, 'Native loader changed beyond exact43index and output hook')
        require(apk.read('assets/warzone/warzone2100.wasm') == raw_wasm_path.read_bytes(), 'Native WASM differs from two-object build')
        contract = helper['verify_runtime_contract'](old_js, raw_js)
        require(runtime.get('generatedCodeUnchangedOutsideIndexAndExistingWorkerHook') is True
                and runtime.get('frozenVirtualFiles') == payload.get('unchangedVirtualFiles') == len(names)
                and runtime.get('frozenDataSHA256') == payload.get('frozenDataSHA256') == sha256(data).hexdigest()
                and runtime.get('frozenPackageIndexSHA256') == payload.get('frozenPackageIndexSHA256') == sha256(index.encode()).hexdigest()
                and runtime.get('frozenWorkerOutputHookSHA256') == payload.get('frozenWorkerOutputHookSHA256') == sha256(hooks[0].encode()).hexdigest(),
                'Frozen native authored-data summaries differ')
        require(runtime['integrated'] == payload['outputs'], 'Native runtime/payload output summaries differ')
        for row in payload['outputs']:
            member = 'assets/warzone/' + row['file']
            require(apk.getinfo(member).file_size == row['bytes'] and zip_digest(apk, member) == row['sha256'],
                    'Native final output hash differs: ' + row['file'])
    proof_paths.update((repo_path(patch), repo_path(log), 'tools/integrate-native-hud-044.py'))
    return {'nativeBuildPerformed': True, 'nativeFullFreshBuildPerformed': False,
            'changedCPPFiles': sorted(ORIGINAL), 'compiledObjects': objects,
            'priorNativeOverlaysRetained': True, 'changedVFSFiles': [], 'unchangedVirtualFiles': len(names),
            'nativeDataAndIndexFrozen': True, 'runtimeContract': contract,
            'proofInputs': [{'path': n, 'sha256': digest(ROOT / n)} for n in sorted(proof_paths)]}


def verify_live_configuration(apk, files):
    # The controller intentionally retains Google's sample unit for emulator
    # fallback. Presence of that literal must not be mistaken for a test build.
    generated = ROOT / BUILD_CONFIG
    require(generated.is_file(), 'Generated final BuildConfig missing')
    text = generated.read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*44\s*;', text)
            and re.search(r'\bVERSION_NAME\s*=\s*"0\.44"\s*;', text)
            and re.search(r'\bADMOB_TEST_ADS\s*=\s*false\s*;', text)
            and re.search(r'\bADMOB_REWARDED_AD_UNIT_ID\s*=\s*"' + re.escape(LIVE_UNIT) + r'"\s*;', text),
            'Final generated BuildConfig must select live rewarded ads for phones')
    dex = [apk.read(n) for n in apk.namelist() if re.fullmatch(r'classes(?:\d+)?\.dex', n)]
    require(any(LIVE_UNIT.encode() in v for v in dex), 'Production rewarded unit missing from compiled APK')
    require(any(SAMPLE_UNIT.encode() in v for v in dex), 'Existing emulator sample fallback missing from compiled APK')
    controller = JAVA + 'RewardedAdsController.java'
    require(controller in files, 'Existing ad controller missing from full source')
    return {'phoneLiveAdsConfigured': True, 'ADMOB_TEST_ADS': False,
            'rewardedAdUnit': LIVE_UNIT, 'publisherConsentAppId': APP_ID,
            'emulatorSampleFallbackRetained': True, 'adRequestsMade': False,
            'generatedBuildConfig': {'path': BUILD_CONFIG, 'sha256': digest(generated)},
            'unchangedController': {'path': controller, 'sha256': digest(files[controller])}}


def validate_apk(candidate, baseline, candidate_sha, files):
    require(candidate.is_file() and digest(candidate) == candidate_sha, 'Candidate APK hash differs')
    aapt, java, signer = sdk_paths()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(candidate)], text=True, encoding='utf-8')
    require(all(token in badging for token in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='44'",
            "versionName='0.44'", "application-label:'Warzone Towers'", 'application-debuggable')), 'Wrong APK identity/version')
    xml = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(candidate), '--file', 'AndroidManifest.xml'], text=True, encoding='utf-8')
    require(APP_ID in xml, 'Publisher consent app ID changed')
    signing = certificate(candidate, java, signer)
    require(signing == certificate(baseline, java, signer), 'Signing certificate changed')
    with ZipFile(candidate) as apk, ZipFile(baseline) as old:
        names, old_names = set(apk.namelist()), set(old.namelist())
        require(len(names) == len(apk.namelist()) and apk.testzip() is None, 'Corrupt/duplicate APK entry')
        require({n for n in names if n.startswith('assets/')} == {n for n in old_names if n.startswith('assets/')},
                'App asset inventory changed')
        changed = []
        for name in sorted(names | old_names):
            if name in names & old_names and zip_digest(apk, name) == zip_digest(old, name):
                continue
            require(name.startswith('assets/') and allowed_source('app/src/main/' + name)
                    or COMMON['metadata'](name) or name.startswith('res/'), 'APK changed beyond approved HUD/Home scope: ' + name)
            changed.append(name)
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in names and digest(path) == zip_digest(apk, name), 'APK asset differs from current source: ' + name)
        music = 'assets/warzone/music/music.data'
        require(apk.getinfo(music).compress_type == ZIP_STORED and zip_digest(apk, music) == zip_digest(old, music),
                'Bundled soundtrack changed/compressed')
        live = verify_live_configuration(apk, files)
    native = verify_native_hud(candidate, baseline)
    return {'changedAPKMembers': changed, 'sameSigningCertificateAs043': True,
            'certificateSHA256': signing, 'nativeHUDIntegration': native, 'liveAdConfiguration': live,
            'mapsMusicArtRewardSaveCodecsAdControllerAndSDKsUnchanged': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery output must stay outside source tree')
    apk_out, source_out, checksums = (args.output / n for n in ('Warzone-Towers-0.44-Live-Ads.apk',
        'warzone-towers-0.44-source.zip', 'Warzone-Towers-0.44-Live-Ads-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksums, partial)), 'Existing output/partial must not be overwritten')
    baseline, source = baseline_paths()
    with ZipFile(source) as archive:
        names = set(archive.namelist())
    files = source_inventory(names)
    preservation = validate_source(source, files)
    apk = validate_apk(args.apk, baseline, args.expected_sha256.lower(), files)
    require({r['path'] for r in apk['nativeHUDIntegration']['proofInputs']} <= set(files),
            'Exact native HUD/autosave source/build proof missing from complete source')
    record = {'version': '0.44', 'versionCode': 44,
        'scope': 'Requested HUD labels/styles/positions, power gauge, explicit-save-only behaviour, Home/receipt/default-map fixes and live rewarded ads on phones.',
        'emulatorUsed': False, 'browserUsed': False, 'androidRuntimeExecuted': False, 'actualNativeEngineExecuted': False,
        'gameplayVerified': False, 'gpuRenderingVerified': False, 'layoutRuntimeVerified': False, 'adRequestsMade': False,
        'candidateAPK_SHA256': args.expected_sha256.lower(), 'sourcePreservation': preservation,
        'fallbackRecord': {'path': FALLBACK, 'sha256': digest(ROOT / FALLBACK)},
        'sourceInventory': 'Every prior complete-source ZIP entry plus current source; caches/private/transient files excluded.',
        'githubPublished': False, 'vpsChanged': False,
        'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'), **apk}
    if args.validate_only:
        print(json.dumps({'packageValidationPassed': True, 'deliveryWritten': False, 'sourceFiles': len(files),
            'changedSources': preservation['changedSources'], 'changedAPKMembers': apk['changedAPKMembers'],
            'liveAdConfiguration': apk['liveAdConfiguration'], 'emulatorUsed': False}, indent=2))
        return
    write_json(ROOT / RECORD, record)
    entries = [{'path': n, 'bytes': p.stat().st_size, 'sha256': digest(p)} for n, p in files.items() if n != MANIFEST]
    write_json(ROOT / MANIFEST, {'schemaVersion': 1, 'files': entries})
    args.output.mkdir(parents=True, exist_ok=True)
    reused = write_source_zip(source, partial, files, entries)
    require(digest(args.apk) == args.expected_sha256.lower(), 'Candidate APK changed during packaging')
    shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == args.expected_sha256.lower(), 'Delivered APK differs from compiled candidate')
    partial.rename(source_out)
    source_sha = digest(source_out)
    checksums.write_text(f'{args.expected_sha256.lower()}  {apk_out.name}\n{source_sha}  {source_out.name}\n', encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed': True, 'emulatorUsed': False, 'gameplayVerified': False,
        'adRequestsMade': False, 'phoneLiveAdsConfigured': True,
        'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size, 'candidateAPK_SHA256': args.expected_sha256.lower(),
        'source': str(source_out), 'sourceBytes': source_out.stat().st_size, 'sourceZIP_SHA256': source_sha,
        'sourceFiles': len(files), 'rawCopiedUnchangedZIPMembers': reused,
        'sourceWithin2GiB': source_out.stat().st_size < 2 * 1024 ** 3,
        'streamedEverySourceEntryCRCAndSHA': True, 'checksums': str(checksums)}, indent=2))


if __name__ == '__main__':
    main()
