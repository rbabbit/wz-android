"""Validate/package the exact 0.31 interface APK and complete source.

Run --validate-only before writing the large archive. Delivery uses the real
publisher app ID for its consent message and only Google's sample rewarded unit.
Maps, music, data and unrelated source stay frozen against the complete 0.30
fallback. The guarded source-built WASM change removes two obsolete HUD draws.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from datetime import datetime, timezone
from hashlib import sha256
import argparse
import json
import os
import re
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
COMMON = runpy.run_path(str(ROOT / 'tools/package-24-home.py'), run_name='package_031_helpers')
require, digest, zip_digest = (COMMON[k] for k in ('require', 'digest', 'zip_digest'))
read_json, repo_path, metadata = (COMMON[k] for k in ('read_json', 'repo_path', 'metadata'))
NATIVE_SOURCE, MANIFEST, STORED, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[k] for k in (
    'NATIVE_SOURCE', 'MANIFEST', 'STORED', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
FALLBACK = 'archive/fallback-0.31.json'
RECORD = 'archive/release-0.31-focused-tested.json'
BASELINE_SHA = 'd76b6e37d9839c45dd9659994ee1cb998c8f0c5cbac29e93c77301f20214f28d'
SOURCE_SHA = '5aff4cc1a1b88f76deb134add9766079d469905bf94ad5c69c5503cb630f6101'
BASE_WASM_SHA = 'd909a4ecb7475643107fa6f489279562c00deae1e0a0f531ddd1328457d78f1e'
NEW_WASM_SHA = 'c69a9d1a3873aa23e774524b67db0cb1257a8326904ed06eddca7b45691eba78'
OVERLAY_SOURCE = 'archive/native-hud-0.31/display3d.cpp'
OVERLAY_SHA = '3b5c1a41144011805819d15e9bfac6f1289d726da276433bfeb237904c0fa15f'
OVERLAY_PATCH = 'archive/native-hud-0.31/native-hud.patch'
PATCH_SHA = '6ad571f05607d19b2a1320d0b5a3c0b9c85cf7b0351f35eb8dccdeb3fcc4a44c'
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~3347511713'
AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917'
PUBLISHER_AD_UNIT_ID = 'ca-app-pub-3430279660625393/5338770704'
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
ASSET_SCOPE = {'assets/' + name for name in (
    'warzone-command-pages.js', 'warzone-touch-controls.js', 'warzone-mobile-research.js',
    'warzone-html-session.js', 'warzone/rewards.js', 'warzone/music-loader.js',
    'warzone/saved-games.js', 'warzone/ui/towers-shell.css', 'warzone/warzone2100.wasm')}
SOURCE_SCOPE = {JAVA + name for name in ('MainActivity.java', 'RewardsView.java')}
SOURCE_SCOPE |= {'app/src/main/' + name for name in ASSET_SCOPE}
NATIVE_REQUIRED = {NATIVE_SOURCE, OVERLAY_SOURCE, OVERLAY_PATCH,
    'archive/native-hud-0.31/source-overlay.json', 'tools/prepare-native-hud-031.py',
    'tools/build-native-hud-031.py', 'tools/build-native-blueprint.sh',
    'archive/native-hud-0.31/README.md', 'tools/integrate-native-runtime.py',
    'qa/0.31-ui/native-hud-build.json', 'qa/0.31-ui/native-hud-incremental-build.log'}


def write_json(path, value):
    with path.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def verify_emulator(args, candidate):
    name = repo_path(args.emulator_report)
    require(digest(args.emulator_report) == args.expected_emulator_report_sha256, 'Emulator proof hash differs')
    proof = read_json(args.emulator_report)
    require(proof.get('candidateAPK_SHA256') == candidate and proof.get('emulatorUsed') is True,
            'Focused observations must bind the exact delivery APK')
    require(proof.get('gameplayVerified') is False, 'Focused checks must not claim a full gameplay pass')
    require(proof.get('liveAdsTested', False) is False, 'Live production ad testing is not permitted')
    require(proof.get('testAdsOnly') is True or proof.get('adsTestTrafficOnly') is True,
            'Proof must explicitly identify Google sample/test-ad traffic')
    checks = proof.get('checks', [])
    require(isinstance(checks, list) and checks and all(isinstance(c, dict) and c.get('name')
            and c.get('passed') is True for c in checks), 'Only named passed observations belong in proof')
    evidence, supporting = proof.get('evidenceFiles', []), proof.get('supportingObservations', [])
    require(isinstance(evidence, list) and evidence and isinstance(supporting, list), 'Evidence inventory missing')
    for entry in evidence + supporting:
        path = ROOT / entry['path']; repo_path(path)
        require(path.is_file() and digest(path) == entry['sha256'], 'Evidence changed: ' + entry['path'])
    return name, proof, checks, evidence, supporting


def verify_reports(paths):
    reports, navigation_found, commands_found = [], False, False
    for path in paths:
        name = repo_path(path); value = read_json(path)
        require(value.get('emulatorUsed') is False, 'Source fixture must explicitly exclude emulator use')
        for entry in value.get('sources', []):
            source = ROOT / entry['path']; repo_path(source)
            require(source.is_file() and digest(source) == entry['sha256'], 'Checked source changed: ' + entry['path'])
        if value.get('version') == '0.31':
            require(value.get('checksPassed', 0) > 0, 'New 0.31 fixture has no passing checks')
            navigation_found |= value.get('actualNavigationFunctionsExecuted') is True
            commands_found |= value.get('actualCommandFunctionsExecuted') is True
        reports.append({'path': name, 'sha256': digest(path)})
    require(navigation_found and commands_found, 'Both new 0.31 actual-navigation and command-function reports are required')
    return reports


def verify_native(apk, old, report_path):
    report_name = repo_path(report_path)
    report = read_json(report_path)
    require(report.get('passed') is True and report.get('generatedCodeUnchangedOutsideIndexAndExistingWorkerHook') is True,
            'Source-built native runtime integration report did not pass')
    paths = ['assets/warzone/warzone2100.' + extension for extension in ('js', 'data', 'wasm')]
    hashes = {name: zip_digest(apk, name) for name in paths}
    require(all(hashes[name] == zip_digest(old, name) for name in paths[:2]),
            'Native loader JS, data, custom hooks or virtual file index changed')
    require(zip_digest(old, paths[2]) == BASE_WASM_SHA and hashes[paths[2]] == NEW_WASM_SHA,
            'Unexpected native WASM outside the reviewed two-call source build')
    require(apk.read(paths[2]).startswith(b'\0asm'), 'Candidate is not a native WASM module')
    integrated = {item['file']: item for item in report.get('integrated', [])}
    for name in paths:
        short = name.rsplit('/', 1)[1]
        require(short in integrated and integrated[short]['sha256'] == hashes[name]
                and integrated[short]['bytes'] == apk.getinfo(name).file_size,
                'Native integration record differs from APK: ' + short)
    require(report.get('raw', {}).get('wasmSHA256') == NEW_WASM_SHA,
            'Source-built WASM was modified after compilation')
    require(digest(ROOT / OVERLAY_SOURCE) == OVERLAY_SHA and digest(ROOT / OVERLAY_PATCH) == PATCH_SHA,
            'The exact two-draw-call native source overlay changed')
    overlay = read_json(ROOT / 'archive/native-hud-0.31/source-overlay.json')
    require(overlay.get('guardPassed') is True and overlay.get('baselineWasmSHA256') == BASE_WASM_SHA
            and overlay.get('changedSourceSHA256') == OVERLAY_SHA and overlay.get('patchSHA256') == PATCH_SHA,
            'Native source preparation guards differ')
    build_report = ROOT / 'qa/0.31-ui/native-hud-build.json'
    built = read_json(build_report)
    require(built.get('passed') is True and built.get('nativeBuildPerformed') is True
            and built.get('emulatorUsed') is False and built.get('nativeFullFreshBuildPerformed') is False
            and built.get('finalWasmSHA256') == NEW_WASM_SHA,
            'Native incremental-build provenance missing or overstated')
    native_inputs = [{'path': repo_path(report_path), 'sha256': digest(report_path)},
                     {'path': repo_path(build_report), 'sha256': digest(build_report)}]
    for name in ('sourceOverlay', 'sourceOverlayCPP', 'sourcePatch', 'originalNativeBundle',
                 'buildRecipe', 'preparationRecipe', 'buildLog', 'integrationReport'):
        path = ROOT / built[name]; repo_path(path)
        require(path.is_file() and digest(path) == built[name + 'SHA256'], 'Native build input changed: ' + name)
        native_inputs.append({'path': repo_path(path), 'sha256': digest(path)})
    runtime = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='package_031_native')
    program, data = apk.read(paths[0]).decode('utf-8'), apk.read(paths[1])
    _, _, index_text, index = runtime['package_call'](program)
    names = runtime['verify_index'](index, data)
    require(report.get('frozenDataSHA256') == hashes[paths[1]]
            and report.get('frozenPackageIndexSHA256') == sha256(index_text.encode()).hexdigest(),
            'Native data/index integration record mismatch')
    catalog = read_json(ROOT / 'app/src/main/assets/warzone/levels/catalog.json')
    require(len(catalog['levels']) == 46 and all(0 < len(level['mapName'].encode('utf-8')) < 20
            for level in catalog['levels']), 'A native map name exceeds saved-game header capacity')
    return {'nativeAssetSHA256': hashes, 'nativeJSAndDataByteIdentical': True,
            'nativeWasmSourceBuiltForTwoHudDraws': True, 'binaryPatchingUsed': False,
            'nativeVirtualFilesUnchanged': len(names), 'all46SaveNamesWithinNativeLimit': True,
            'sourceOverlay': OVERLAY_SOURCE, 'sourceOverlaySHA256': OVERLAY_SHA,
            'incrementalBuildPerformed': True, 'fullFreshDependencyBuildPerformed': False,
            'checkedInputs': native_inputs,
            'integrationReport': {'path': report_name, 'sha256': digest(report_path)}}


def validate(args):
    candidate = digest(args.apk)
    require(candidate == args.expected_sha256, 'Candidate APK hash differs')
    emulator_name, proof, checks, evidence, supporting = verify_emulator(args, candidate)
    saved = read_json(ROOT / FALLBACK)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'],
                'Frozen 0.30 fallback changed: ' + str(path))
    baseline = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.30-Test-Ads.apk')
    old_source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.30-source.zip')
    require(digest(baseline) == BASELINE_SHA and digest(old_source) == SOURCE_SHA, 'Wrong frozen 0.30 baseline')
    reports = verify_reports(args.source_report)
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'AppData/Local/Android/Sdk')))
    aapt = sdk / 'build-tools/36.1.0/aapt2.exe'
    with ZipFile(args.apk) as apk, ZipFile(baseline) as old:
        require(apk.testzip() is None, 'Built APK CRC failure')
        names, old_names = set(apk.namelist()), set(old.namelist())
        require(len(names) == len(apk.namelist()), 'Duplicate APK member')
        added, removed = names - old_names, old_names - names
        assets = {n for n in names if n.startswith('assets/')}
        old_assets = {n for n in old_names if n.startswith('assets/')}
        require(assets == old_assets, 'Game asset inventory changed')
        changed = [n for n in apk.namelist() if n not in old_names or zip_digest(apk, n) != zip_digest(old, n)]
        changed_assets = {n for n in changed if n.startswith('assets/')}
        require(changed_assets <= ASSET_SCOPE and 'assets/warzone/warzone2100.wasm' in changed_assets,
                'APK assets changed beyond the approved interface and native label fix')
        require(all(n in ASSET_SCOPE or metadata(n) for n in changed + list(removed)),
                'APK changed beyond approved interface/native assets and app metadata')
        frozen_assets = assets - ASSET_SCOPE
        require(all(zip_digest(apk, n) == zip_digest(old, n) for n in frozen_assets), 'Protected asset changed')
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in assets and digest(path) == zip_digest(apk, name), 'Stale APK source asset: ' + name)
        native = verify_native(apk, old, args.native_report)
        dex = [apk.read(n) for n in names if re.fullmatch(r'classes(?:\d+)?\.dex', n)]
        require(dex and any(AD_UNIT_ID.encode('ascii') in value for value in dex),
                'Google sample rewarded unit missing from test APK')
        require(not any(PUBLISHER_AD_UNIT_ID.encode('ascii') in value for value in dex),
                'Publisher live rewarded unit must not be present in this test delivery')
    with ZipFile(old_source) as source:
        source_names = set(source.namelist())
        gradle_name = 'app/build.gradle.kts'
        expected_gradle = source.read(gradle_name).replace(b'versionCode = 30', b'versionCode = 31').replace(b'versionName = "0.30"', b'versionName = "0.31"')
        require((ROOT / gradle_name).read_bytes() == expected_gradle, 'App build settings changed beyond the version bump')
        protected = [n for n in source_names if not n.endswith('/') and (
            n.startswith(('vendor/', 'map/', 'scenario/')) or n == NATIVE_SOURCE or
            n.startswith('app/src/main/') and n not in SOURCE_SCOPE)]
        for name in protected:
            path = ROOT / name
            require(path.is_file() and digest(path) == zip_digest(source, name), 'Frozen source changed: ' + name)
        app_files = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src/main').rglob('*') if p.is_file()}
        require(app_files - source_names <= SOURCE_SCOPE, 'Unexpected new app source: ' + str(app_files - source_names))
    build = (ROOT / 'app/build.gradle.kts').read_text(encoding='utf-8')
    require(all(value in build for value in ('versionCode = 31', 'versionName = "0.31"',
            'com.google.android.gms:play-services-ads:25.5.0', 'com.google.android.ump:user-messaging-platform:4.0.0')),
            'Build version or pinned SDK versions differ')
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='31'",
            "versionName='0.31'", "application-label:'Warzone Towers'", 'application-debuggable')),
            'Package/version/label/update identity differs')
    manifest = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(args.apk), '--file', 'AndroidManifest.xml'],
                                       text=True, encoding='utf-8')
    require('com.google.android.gms.ads.APPLICATION_ID' in manifest and APP_ID in manifest,
            'Publisher app ID missing from packaged consent configuration')
    require(SAMPLE_APP_ID not in manifest, 'Generic Google sample app ID must not control publisher consent styling')
    java = Path(os.environ.get('JAVA_HOME', 'C:/Program Files/Android/Android Studio/jbr')) / 'bin/java.exe'
    signer = sdk / 'build-tools/36.1.0/lib/apksigner.jar'
    def certificate(path):
        result = subprocess.check_output([str(java), '-jar', str(signer), 'verify', '--verbose', '--print-certs', str(path)],
                                         text=True, encoding='utf-8')
        require('Verified using v2 scheme (APK Signature Scheme v2): true' in result, 'APK v2 signature invalid')
        match = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)', result)
        require(match is not None, 'APK signing certificate digest missing')
        return match[1].lower()
    signing_sha = certificate(args.apk)
    require(signing_sha == certificate(baseline), 'APK cannot update the existing 0.30 signing identity')
    return {'version': '0.31', 'versionCode': 31, 'candidateAPK_SHA256': candidate,
        'scope': 'Compact Gain 10 Crystals, acknowledged production feedback, prominent Research, header menu toggles and duplicate-close removal; two obsolete native label/time draws suppressed.',
        'emulatorUsed': True, 'gameplayVerified': False, 'testAdsOnly': True, 'liveAdsTested': False,
        'verification': 'Hash-bound focused emulator observations plus controller/source fixtures and package/preservation checks.',
        'emulatorProof': {'path': emulator_name, 'sha256': args.expected_emulator_report_sha256},
        'focusedEmulatorChecks': checks, 'emulatorEvidenceFiles': evidence, 'supportingObservations': supporting,
        'changedAPKAssets': sorted(changed_assets), 'newAPKAssets': [], 'changedAPKMembers': changed,
        'removedAPKMembers': sorted(removed), 'nativePreservation': native,
        'mapsMusicDuelContentByteIdentical': True, 'nativeJSAndDataByteIdentical': True,
        'preservedOriginalSourceFiles': len(protected), 'preservedAPKAssets': len(frozen_assets),
        'deliveryAds': {'appId': APP_ID, 'rewardedAdUnitId': AD_UNIT_ID, 'crystalsPerEarnedAd': 10,
                        'sampleAdsOnPhysicalPhones': True, 'publisherLiveAdUnitAbsentFromDEX': True,
                        'publisherConsentMessageVerified': proof.get('publisherConsentMessageVerified') is True,
                        'publisherFormatSettingsApplyToSampleUnit': False, 'liveServingVerified': False},
        'signing': {'debugSignedForExistingAppUpdates': True, 'sameCertificateAs030': True, 'certificateSHA256': signing_sha},
        'sourceCheckReports': reports, 'fallbackRecord': {'path': FALLBACK, 'sha256': digest(ROOT / FALLBACK)},
        'sourceInventory': 'git ls-files --cached --others --exclude-standard; caches/private/transient files excluded',
        'gitMetadataIncluded': False, 'vpsChanged': False,
        'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}


def source_inventory(required):
    names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
                                    cwd=ROOT).decode('utf-8').split('\0')
    tracked = set(filter(None, subprocess.check_output(['git', 'ls-files', '--cached', '-z'],
                        cwd=ROOT).decode('utf-8').split('\0')))
    files = []
    for name in sorted(set(filter(None, names)) | {RECORD, MANIFEST}):
        rel = Path(name)
        if any(part in SKIP for part in rel.parts) or name in TRANSIENT or rel.suffix in {'.partial', '.tmp'}:
            continue
        require(rel.suffix.lower() not in PRIVATE_SUFFIXES and not rel.name.startswith('.env')
                and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local source entry: ' + name)
        path = ROOT / rel; repo_path(path)
        if path.is_file() or name in {RECORD, MANIFEST}:
            require(name in tracked or name in {RECORD, MANIFEST} or path.stat().st_size <= 128 * 1024 * 1024,
                    'Unexpected large untracked cache/source: ' + name)
            files.append((name, path))
    require(required <= {name for name, _ in files}, 'Required complete source missing: ' + str(sorted(required - {n for n, _ in files})))
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, required=True)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--source-report', type=Path, action='append', required=True)
    parser.add_argument('--native-report', type=Path, required=True)
    parser.add_argument('--emulator-report', '--emulator-proof', dest='emulator_report', type=Path, required=True)
    parser.add_argument('--expected-emulator-report-sha256', '--expected-emulator-proof-sha256', dest='expected_emulator_report_sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery output must be outside source tree')
    outputs = [args.output / n for n in ('Warzone-Towers-0.31-Test-Ads.apk', 'warzone-towers-0.31-source.zip',
                                        'Warzone-Towers-0.31-Test-Ads-SHA256.txt')]
    apk_out, source_out, checksums = outputs; partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in outputs + [partial]), 'Frozen delivery/partial must not be overwritten')
    record = validate(args)
    required = NATIVE_REQUIRED | {'tools/package-24-home.py', 'tools/package-31-ui.py',
        RECORD, FALLBACK, 'README.md', 'AGENTS.md', 'docs/releases/0.31-ui.md',
        record['emulatorProof']['path'], record['nativePreservation']['integrationReport']['path']}
    for report in record['sourceCheckReports']: required.add(report['path'])
    for entry in record['emulatorEvidenceFiles'] + record['supportingObservations']: required.add(entry['path'])
    files = source_inventory(required)
    if args.validate_only:
        print(json.dumps({'validationPassed': True, 'deliveryFilesWritten': False, 'candidateAPK_SHA256': record['candidateAPK_SHA256'],
            'focusedChecks': len(record['focusedEmulatorChecks']), 'sourceFiles': len(files),
            'mapsMusicDuelContentByteIdentical': True, 'nativeJSAndDataByteIdentical': True,
            'nativeWasmGuardedTwoDrawSourceBuild': True, 'sameSigningCertificateAs030': True,
            'publisherConsentAppIdPresent': True, 'onlySampleRewardedUnitPresent': True}, indent=2))
        return
    write_json(ROOT / RECORD, record)
    entries = [{'path': n, 'bytes': p.stat().st_size, 'sha256': digest(p)} for n, p in files if n != MANIFEST]
    write_json(ROOT / MANIFEST, {'schemaVersion': 1, 'files': entries})
    expected = {entry['path']: entry for entry in entries}
    args.output.mkdir(parents=True, exist_ok=True)
    with ZipFile(partial, 'w', ZIP_DEFLATED, compresslevel=3) as archive:
        for name, path in files:
            archive.write(path, name, compress_type=ZIP_STORED if path.suffix.lower() in STORED else ZIP_DEFLATED)
    with ZipFile(partial) as archive:
        require(len(archive.namelist()) == len(files), 'Source archive count differs')
        require(archive.getinfo(NATIVE_SOURCE).file_size > 100 * 1024 * 1024, 'Complete native source missing/LFS pointer')
        for name, path in files:
            actual = zip_digest(archive, name)
            require(actual == digest(path) and (name not in expected or actual == expected[name]['sha256']),
                    'Source archive changed while packaging: ' + name)
    require(digest(args.apk) == record['candidateAPK_SHA256'] and digest(args.emulator_report) == args.expected_emulator_report_sha256,
            'APK or emulator proof changed during packaging')
    for entry in record['sourceCheckReports'] + record['emulatorEvidenceFiles'] + record['supportingObservations'] + record['nativePreservation']['checkedInputs']:
        require(digest(ROOT / entry['path']) == entry['sha256'], 'Checked source/evidence changed during packaging')
    shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == record['candidateAPK_SHA256'], 'Delivery APK differs from exact checked candidate')
    partial.rename(source_out); source_sha = digest(source_out)
    with checksums.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(f'{record["candidateAPK_SHA256"]}  {apk_out.name}\n{source_sha}  {source_out.name}\n')
    print(json.dumps({'packageIntegrityPassed': True, 'emulatorUsed': True, 'gameplayVerified': False,
        'testAdsOnly': True, 'liveAdsTested': False, 'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size,
        'candidateAPK_SHA256': record['candidateAPK_SHA256'], 'source': str(source_out),
        'sourceBytes': source_out.stat().st_size, 'sourceZIP_SHA256': source_sha,
        'sourceFiles': len(files), 'checksums': str(checksums), 'streamedEverySourceEntryCRCAndSHA': True}, indent=2))


if __name__ == '__main__':
    main()
