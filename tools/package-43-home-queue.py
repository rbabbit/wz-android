"""Package v0.43 Home artwork/version branding and exact production cancellation.

Build/source/archive integrity only. Never starts an emulator, browser, Android,
or the native engine. Retains every v0.42 source entry and raw-copies unchanged
compressed ZIP members instead of recompressing the complete native source.
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
PRIOR = runpy.run_path(str(ROOT / 'tools/package-42-sage.py'), run_name='package_043_helpers')
COMMON = PRIOR['COMMON']
require, digest, zip_digest = (COMMON[n] for n in ('require', 'digest', 'zip_digest'))
MANIFEST, NATIVE_SOURCE, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[n] for n in (
    'MANIFEST', 'NATIVE_SOURCE', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
read_json, write_json, sdk_paths, certificate, write_source_zip = (PRIOR[n] for n in (
    'read_json', 'write_json', 'sdk_paths', 'certificate', 'write_source_zip'))
FALLBACK = 'archive/fallback-0.43.json'
RECORD = 'archive/release-0.43-source-build-only.json'
GRADLE = 'app/build.gradle.kts'
BASELINE_SHA = '1a2dd68d7e334f75789d6460af92e468cfc6ae24214c012678bb0271e3cbf81e'
SOURCE_SHA = 'a4fc0b93c8380810424ddf1fb2f43542af8e400303cfff4b9d3cb8e4280b43df'
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
ART = 'app/src/main/res/drawable-nodpi/towers_home_grey_tank.png'
VIRTUAL = '/data/mp/tests/warzone-towers-commands.js'
NATIVE_FOLDER = 'archive/native-queue-0.43/'
ORIGINAL_CPP = 'a3096beab0f866dd53176fe4d705ed1eee9da50da2e322608efcec2b57f80072'
NATIVE_ASSETS = {'assets/warzone/warzone2100.' + ext for ext in ('js', 'data', 'wasm')}
SOURCE_SCOPE = {JAVA + 'WarzoneSplashView.java', JAVA + 'GraphicsSetupView.java', ART,
    'app/src/main/assets/warzone-command-pages.js',
    'app/src/main/assets/warzone/ui/towers-commands.css',
    'scenario/warzone-towers-commands.js'} | {'app/src/main/' + n for n in NATIVE_ASSETS}


def repo_path(path):
    path = path.resolve()
    require(path.is_relative_to(ROOT), 'Source outside repository: ' + str(path))
    return path.relative_to(ROOT).as_posix()


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    require(saved.get('version') == '0.43' and saved.get('baseline') == '0.42', 'Wrong fallback record')
    for row in saved['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'],
                'Immutable v0.42 fallback changed: ' + str(path))
    apk = next(Path(r['path']) for r in saved['files'] if r['path'].endswith('Warzone-Towers-0.42-Test-Ads.apk'))
    source = next(Path(r['path']) for r in saved['files'] if r['path'].endswith('warzone-towers-0.42-source.zip'))
    require(digest(apk) == BASELINE_SHA and digest(source) == SOURCE_SHA, 'Wrong v0.42 baseline')
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


def validate_source(source, files):
    changed, preserved = [], 0
    with ZipFile(source) as archive:
        names = set(archive.namelist())
        require(len(names) == len(archive.namelist()), 'Duplicate baseline source ZIP member')
        prior = json.loads(archive.read(MANIFEST))
        indexed = {r['path']: r for r in prior['files']}
        require(set(indexed) == names - {MANIFEST}, 'Prior source manifest incomplete')
        expected = archive.read(GRADLE).replace(b'versionCode = 42', b'versionCode = 43').replace(
            b'versionName = "0.42"', b'versionName = "0.43"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond version 43')
        for name, before in indexed.items():
            actual = digest(files[name])
            if actual == before['sha256']:
                preserved += 1
                continue
            require(name in SOURCE_SCOPE | {GRADLE, 'AGENTS.md', 'README.md', 'design-qa.md'},
                    'Existing source changed outside Home/cancellation scope: ' + name)
            changed.append({'path': name, 'beforeSHA256': before['sha256'], 'sha256': actual})
        new_app = {n for n in files if n.startswith('app/src/main/') and n not in indexed}
        require(new_app == {ART}, 'Only the selected Home tank artwork may be a new app file: ' + str(sorted(new_app)))
        require({JAVA + 'WarzoneSplashView.java', JAVA + 'GraphicsSetupView.java',
                 'app/src/main/assets/warzone-command-pages.js', 'scenario/warzone-towers-commands.js'}
                <= {r['path'] for r in changed}, 'Home/version/Queue changes missing')
    java = files[JAVA + 'GraphicsSetupView.java'].read_text(encoding='utf-8')
    require('rbabbit v' in java and 'appVersion(context)' in java, 'Home must show rbabbit plus the dynamic app version')
    image = files[ART].read_bytes()
    require(image.startswith(b'\x89PNG\r\n\x1a\n') and len(image) > 10000, 'Real selected tank PNG missing')
    require(int.from_bytes(image[16:20], 'big') >= 500 and int.from_bytes(image[20:24], 'big') >= 300,
            'Tank artwork resolution is insufficient')
    return {'changedSources': changed, 'preservedBaselineFiles': preserved,
            'addedAppSources': sorted(new_app), 'baselineSourceEntries': len(indexed) + 1,
            'baselineSourceSHA256': SOURCE_SHA, 'homeVersionPrefix': 'rbabbit v',
            'selectedTankSource': {'path': ART, 'bytes': len(image), 'sha256': sha256(image).hexdigest()}}


def verify_native_queue(candidate, baseline):
    """Independently check the bounded build plus one authored VFS replacement."""
    folder = ROOT / NATIVE_FOLDER
    build_path, overlay_path = folder / 'native-build.json', folder / 'source-overlay.json'
    runtime_path, payload_path = folder / 'native-runtime-integration.json', folder / 'native-payload.json'
    build, overlay, runtime, payload = (read_json(p) for p in (build_path, overlay_path, runtime_path, payload_path))
    prior_path = ROOT / 'archive/native-theme-0.42/native-build.json'
    prior = read_json(prior_path)
    recipe_path = ROOT / 'tools/build-native-queue-043.py'
    recipe = runpy.run_path(str(recipe_path), run_name='package_043_native_recipe')
    original, current = folder / 'original-quickjs_backend.cpp', folder / 'quickjs_backend.cpp'
    require(digest(original) == ORIGINAL_CPP == prior['sourceOverlays']['quickjs_backend.cpp'],
            'Current-production cancel hook has the wrong original native source')
    reconstruct = recipe.get('reconstruct_source', recipe.get('reconstruct'))
    require(callable(reconstruct), 'Guarded native source reconstruction helper missing')
    expected = reconstruct(original.read_bytes())
    require(current.read_bytes() == expected, 'Native cancellation source differs from the guarded reconstruction')
    patch = folder / 'native-queue.patch'
    expected_patch = ''.join(difflib.unified_diff(original.read_text().splitlines(True), expected.decode().splitlines(True),
        fromfile='a/src/quickjs_backend.cpp', tofile='b/src/quickjs_backend.cpp')).encode()
    require(patch.read_bytes() == expected_patch, 'Native cancellation patch differs')
    require(overlay.get('guardPassed') is True and overlay.get('beforeSHA256') == ORIGINAL_CPP
            and overlay.get('afterSHA256') == digest(current)
            and overlay.get('patchSHA256') == digest(patch)
            and overlay.get('previousNativeBuildSHA256') == digest(prior_path)
            and overlay.get('preservedSourceOverlays') == prior['sourceOverlays'],
            'Native cancellation source/preserved-overlay identities differ')
    require(overlay.get('originalBuildRecipeSHA256') == digest(ROOT / 'tools/build-native-blueprint.sh'),
            'Original matching native build recipe changed')
    expected_sources = dict(prior['sourceOverlays'], **{'quickjs_backend.cpp': digest(current)})
    objects = ['src/CMakeFiles/warzone2100.dir/quickjs_backend.cpp.o']
    require(build.get('version') == overlay.get('version') == '0.43' and build.get('passed') is True
            and build.get('nativeBuildPerformed') is True and build.get('nativeFullFreshBuildPerformed') is False
            and build.get('relinkedNativeEngine') is True and build.get('compiledObjects') == objects
            and build.get('sourceOverlays') == expected_sources
            and build.get('previousNativeBuildSHA256') == digest(prior_path)
            and build.get('sourceOverlaySHA256') == digest(overlay_path), 'One-object native cancellation build provenance differs')
    log = ROOT / build['log']; repo_path(log)
    log_text = log.read_text(encoding='utf-8')
    require(digest(log) == build['logSHA256'] and re.findall(r'Building CXX object (\S+)', log_text) == objects
            and len(re.findall(r'Linking CXX executable[^\n]*warzone2100', log_text)) == 1,
            'Native build compiled more than the approved cancellation object/link')
    require(runtime.get('version') == payload.get('version') == '0.43' and runtime.get('passed') is True
            and payload.get('passed') is True and runtime['baselineAPK']['sha256'] == BASELINE_SHA
            and payload.get('baselineSHA256') == BASELINE_SHA
            and payload.get('changedVFSFiles') == [VIRTUAL]
            and payload.get('addedVFSFiles') == payload.get('removedVFSFiles') == [], 'Queue runtime/VFS proof differs')
    raw_rows = {r['file']: r for r in build['raw']}
    require(set(raw_rows) == {'warzone2100.js', 'warzone2100.wasm'}, 'Unexpected generated native output')
    raw_js_path, raw_wasm_path = Path(runtime['raw']['jsPath']), Path(runtime['raw']['wasmPath'])
    for filename, path in (('warzone2100.js', raw_js_path), ('warzone2100.wasm', raw_wasm_path)):
        require(path.is_file() and path.stat().st_size == raw_rows[filename]['bytes']
                and digest(path) == raw_rows[filename]['sha256'], 'Source-built native raw output differs: ' + filename)
    helper = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='package_043_runtime_helpers')
    with ZipFile(baseline) as old, ZipFile(candidate) as apk:
        old_js = old.read('assets/warzone/warzone2100.js').decode()
        old_data = old.read('assets/warzone/warzone2100.data')
        script = apk.read('assets/warzone/warzone2100.js').decode()
        data = apk.read('assets/warzone/warzone2100.data')
        raw_js = raw_js_path.read_text(encoding='utf-8')
        _, _, old_index, old_meta = helper['package_call'](old_js)
        begin, end, index, meta = helper['package_call'](script)
        raw_begin, raw_end, _, _ = helper['package_call'](raw_js)
        old_names = helper['verify_index'](old_meta, old_data)
        require(helper['verify_index'](meta, data) == old_names, 'Native VFS filename/order inventory changed')
        source = (ROOT / 'scenario/warzone-towers-commands.js').read_bytes()
        require(data == old_data + source, 'Native data must be the exact frozen prefix plus one commands append')
        changed = []
        for before, after in zip(old_meta['files'], meta['files']):
            a = old_data[before['start']:before['end']]
            b = data[after['start']:after['end']]
            if before['filename'] == VIRTUAL:
                require(after['start'] == len(old_data) and b == source, 'Commands VFS does not match authored scenario')
            else:
                require(before == after and a == b, 'Unrelated native VFS file changed: ' + before['filename'])
            if a != b:
                changed.append(before['filename'])
        require(changed == [VIRTUAL], 'Exactly one commands VFS file must differ')
        hooks = re.findall(r'var out=console\.log\.bind\(console\);var blockNightOutputChannel=.*?;var wasmBinary;', old_js, re.S)
        require(len(hooks) == 1, 'Exact prior worker-output hook missing')
        original_hook = 'var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;'
        require(raw_js.count(original_hook) == 1 and 'blockNightOutputChannel' not in raw_js, 'Generated stdout hook differs')
        expected_js = (raw_js[:raw_begin] + index + raw_js[raw_end:]).replace(original_hook, hooks[0], 1)
        require(script == expected_js, 'Native loader changed beyond final VFS index and exact existing worker hook')
        require(apk.read('assets/warzone/warzone2100.wasm') == raw_wasm_path.read_bytes(), 'Native WASM differs from source build')
        contract = helper['verify_runtime_contract'](old_js, raw_js)
        require(runtime.get('generatedCodeUnchangedOutsideIndexAndExistingWorkerHook') is True,
                'Raw native runtime contract missing')
        require(payload.get('unchangedVirtualFiles') == len(old_names) - 1,
                'Unchanged authored virtual-file count differs')
        outputs = {r['file']: r for r in payload['outputs']}
        require(set(outputs) == {'warzone2100.js', 'warzone2100.wasm', 'warzone2100.data'}, 'Native payload outputs differ')
        for name, row in outputs.items():
            member = 'assets/warzone/' + name
            require(apk.getinfo(member).file_size == row['bytes'] and zip_digest(apk, member) == row['sha256'],
                    'Final native payload hash differs: ' + name)
    proofs = {repo_path(p) for p in (build_path, overlay_path, runtime_path, payload_path,
        original, current, patch, log, recipe_path, ROOT / 'tools/integrate-native-queue-043.py')}
    return {'nativeBuildPerformed': True, 'nativeFullFreshBuildPerformed': False,
            'changedCPPFiles': ['quickjs_backend.cpp'], 'compiledObjects': objects,
            'preservedNativeSourceOverlays': len(prior['sourceOverlays']),
            'changedVFSFiles': [VIRTUAL], 'unchangedVirtualFiles': len(old_names) - 1,
            'frozenDataPrefixUnchanged': True, 'runtimeContract': contract,
            'proofInputs': [{'path': n, 'sha256': digest(ROOT / n)} for n in sorted(proofs)]}


def validate_apk(candidate, baseline, candidate_sha):
    require(candidate.is_file() and digest(candidate) == candidate_sha, 'Candidate APK hash differs')
    aapt, java, signer = sdk_paths()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(candidate)], text=True, encoding='utf-8')
    require(all(token in badging for token in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='43'",
            "versionName='0.43'", "application-label:'Warzone Towers'", 'application-debuggable')), 'Wrong APK identity/version')
    xml = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(candidate), '--file', 'AndroidManifest.xml'], text=True, encoding='utf-8')
    require(PRIOR['APP_ID'] in xml, 'Publisher consent identity changed')
    signing = certificate(candidate, java, signer)
    require(signing == certificate(baseline, java, signer), 'Signing certificate changed')
    allowed_assets = {n.removeprefix('app/src/main/') for n in SOURCE_SCOPE if n.startswith('app/src/main/assets/')}
    with ZipFile(candidate) as apk, ZipFile(baseline) as old:
        names, old_names = set(apk.namelist()), set(old.namelist())
        require(len(names) == len(apk.namelist()) and apk.testzip() is None, 'Corrupt/duplicate APK entry')
        require({n for n in names if n.startswith('assets/')} == {n for n in old_names if n.startswith('assets/')},
                'App asset inventory changed')
        changed = []
        for name in sorted(names | old_names):
            if name in names & old_names and zip_digest(apk, name) == zip_digest(old, name):
                continue
            require(name in allowed_assets or COMMON['metadata'](name) or name.startswith('res/'),
                    'APK changed beyond Home/cancel scope: ' + name)
            changed.append(name)
        require(any('towers_home_grey_tank' in n for n in names), 'New grey tank resource missing from APK')
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in names and digest(path) == zip_digest(apk, name), 'APK asset differs from current source: ' + name)
        music = 'assets/warzone/music/music.data'
        require(apk.getinfo(music).compress_type == ZIP_STORED and zip_digest(apk, music) == zip_digest(old, music),
                'Bundled soundtrack changed/compressed')
        dex = [apk.read(n) for n in names if re.fullmatch(r'classes(?:\d+)?\.dex', n)]
        require(any(PRIOR['TEST_AD_UNIT'] in v for v in dex) and not any(PRIOR['LIVE_AD_UNIT'] in v for v in dex),
                'Only existing sample rewarded ads may ship')
    native = verify_native_queue(candidate, baseline)
    return {'changedAPKMembers': changed, 'sameSigningCertificateAs042': True,
            'certificateSHA256': signing, 'nativeCancellationIntegration': native,
            'mapsMusicWalletSaveAndAdsPolicyUnchanged': True, 'testAdsOnly': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery output must stay outside source tree')
    apk_out, source_out, checksums = (args.output / n for n in ('Warzone-Towers-0.43-Test-Ads.apk',
        'warzone-towers-0.43-source.zip', 'Warzone-Towers-0.43-Test-Ads-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksums, partial)), 'Existing output/partial must not be overwritten')
    baseline, source = baseline_paths()
    with ZipFile(source) as archive:
        names = set(archive.namelist())
    files = source_inventory(names)
    preservation = validate_source(source, files)
    apk = validate_apk(args.apk, baseline, args.expected_sha256.lower())
    require({r['path'] for r in apk['nativeCancellationIntegration']['proofInputs']} <= set(files),
            'Exact native cancellation source/build proof missing from complete source')
    record = {'version': '0.43', 'versionCode': 43,
        'scope': 'Selected grey-tank Home image, Home-only rbabbit/version label and exact current/waiting production cancellation in Queue.',
        'emulatorUsed': False, 'androidRuntimeExecuted': False, 'actualNativeEngineExecuted': False,
        'gameplayVerified': False, 'gpuRenderingVerified': False, 'layoutRuntimeVerified': False,
        'candidateAPK_SHA256': args.expected_sha256.lower(), 'sourcePreservation': preservation,
        'fallbackRecord': {'path': FALLBACK, 'sha256': digest(ROOT / FALLBACK)},
        'sourceInventory': 'Every prior complete-source ZIP entry plus current source; caches/private/transient files excluded.',
        'githubPublished': False, 'vpsChanged': False,
        'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'), **apk}
    if args.validate_only:
        print(json.dumps({'packageValidationPassed': True, 'deliveryWritten': False, 'sourceFiles': len(files),
            'changedSources': preservation['changedSources'], 'changedAPKMembers': apk['changedAPKMembers'],
            'emulatorUsed': False}, indent=2))
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
        'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size, 'candidateAPK_SHA256': args.expected_sha256.lower(),
        'source': str(source_out), 'sourceBytes': source_out.stat().st_size, 'sourceZIP_SHA256': source_sha,
        'sourceFiles': len(files), 'rawCopiedUnchangedZIPMembers': reused,
        'sourceWithin2GiB': source_out.stat().st_size < 2 * 1024 ** 3,
        'streamedEverySourceEntryCRCAndSHA': True, 'checksums': str(checksums)}, indent=2))


if __name__ == '__main__':
    main()
