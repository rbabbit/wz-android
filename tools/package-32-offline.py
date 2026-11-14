"""Validate/package the exact bundled-music and small-phone v0.32 APK.

Validation-only never writes delivery files. Native/game/map/save/economy data
are frozen against v0.31; the full soundtrack is added as a signed APK asset.
Runtime music and small-screen claims require hash-bound root emulator proof.
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
COMMON = runpy.run_path(str(ROOT / 'tools/package-24-home.py'), run_name='package_032_helpers')
require, digest, zip_digest = (COMMON[k] for k in ('require', 'digest', 'zip_digest'))
read_json, repo_path, metadata = (COMMON[k] for k in ('read_json', 'repo_path', 'metadata'))
NATIVE_SOURCE, MANIFEST, STORED, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[k] for k in (
    'NATIVE_SOURCE', 'MANIFEST', 'STORED', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
FALLBACK = 'archive/fallback-0.32.json'
RECORD = 'archive/release-0.32-focused-tested.json'
BASELINE_SHA = '93374c1a611ba2cf9bf3f999a3f42e17939bbd56dfba559395b4ef84634f03bc'
SOURCE_SHA = '92827bcb97ca086606165974ddfb8da8a3be3dfa8f886508df8c8ecce01aa3fe'
MUSIC_SHA = '602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd'
MUSIC_BYTES = 114721578
MUSIC_REPORT = 'archive/bundled-music-0.32.json'
MUSIC_ASSET = 'assets/warzone/music/music.data'
NEW_ASSETS = {'assets/warzone/music/' + name for name in (
    'music.data', 'COPYING', 'COPYING.NONGPL', 'COPYING.README', 'README.md', 'NOTICE.txt')}
ASSET_SCOPE = {'assets/warzone/music-loader.js', 'assets/warzone-touch-controls.js'}
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
SOURCE_SCOPE = {JAVA + name for name in (
    'MainActivity.java', 'RewardsView.java', 'GraphicsSetupView.java', 'MapPreviewPager.java',
    'MusicPackStore.java', 'MusicTrackResponse.java', 'MusicTrackCatalog.java', 'MapMusicIndex.java')}
SOURCE_SCOPE |= {'app/src/main/' + name for name in ASSET_SCOPE | NEW_ASSETS}
NATIVE_REQUIRED = {NATIVE_SOURCE, 'archive/native-hud-0.31/display3d.cpp',
    'archive/native-hud-0.31/native-hud.patch', 'archive/native-hud-0.31/source-overlay.json',
    'archive/native-hud-0.31/README.md', 'tools/prepare-native-hud-031.py',
    'tools/build-native-hud-031.py', 'tools/build-native-blueprint.sh', 'tools/integrate-native-runtime.py'}
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~3347511713'
AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917'
PUBLISHER_AD_UNIT_ID = 'ca-app-pub-3430279660625393/5338770704'


def write_json(path, value):
    with path.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def verify_emulator(args, candidate):
    name = repo_path(args.emulator_report)
    require(digest(args.emulator_report) == args.expected_emulator_report_sha256, 'Emulator proof hash differs')
    proof = read_json(args.emulator_report)
    require(proof.get('candidateAPK_SHA256') == candidate and proof.get('emulatorUsed') is True,
            'Runtime observations must bind the exact delivery APK')
    require(proof.get('gameplayVerified') is False and proof.get('liveAdsTested', False) is False,
            'Focused layout/music checks must not claim a full game or live-ad pass')
    require(proof.get('testAdsOnly') is True or proof.get('adsTestTrafficOnly') is True,
            'Delivery proof must identify sample-ad configuration')
    configurations = proof.get('smallPhoneConfigurations', [])
    require(isinstance(configurations, list) and configurations, 'Actual small-phone configurations missing')
    for value in configurations:
        require(all(isinstance(value.get(k), (int, float)) and value[k] > 0
                    for k in ('physicalWidth', 'physicalHeight', 'densityDpi', 'fontScale')),
                'Every phone configuration must record physical dimensions, density and font scale')
    require(any(min(c['physicalWidth'], c['physicalHeight']) * 160 / c['densityDpi'] <= 360
                for c in configurations), 'No genuinely short phone layout was observed')
    offline = proof.get('offlineMusic', {})
    require(offline.get('networkDisabled') is True and offline.get('legacyCacheAbsent') is True,
            'Offline playback must exclude the old downloaded pack and network')
    require(offline.get('playing') is True and offline.get('transport') in ('track-blob', 'apk-track-blob')
            and isinstance(offline.get('timeBefore'), (int, float))
            and isinstance(offline.get('timeAfter'), (int, float))
            and offline['timeAfter'] > offline['timeBefore'] >= 0,
            'Actual media time progression from the APK must be observed')
    checks = proof.get('checks', [])
    require(isinstance(checks, list) and checks and all(isinstance(c, dict) and c.get('name')
            and c.get('passed') is True for c in checks), 'Only named passed checks belong in delivery proof')
    evidence, supporting = proof.get('evidenceFiles', []), proof.get('supportingObservations', [])
    require(isinstance(evidence, list) and evidence and isinstance(supporting, list), 'Evidence inventory missing')
    for entry in evidence + supporting:
        path = ROOT / entry['path']; repo_path(path)
        require(path.is_file() and digest(path) == entry['sha256'], 'Evidence changed: ' + entry['path'])
    return name, proof, checks, evidence, supporting


def verify_reports(paths):
    reports, home_found, stream_found = [], False, False
    all_paths = list(paths)
    if not any(path.resolve() == (ROOT / MUSIC_REPORT).resolve() for path in all_paths):
        all_paths.append(ROOT / MUSIC_REPORT)
    for path in all_paths:
        name = repo_path(path); value = read_json(path)
        require(value.get('emulatorUsed') is False, 'Source evidence must exclude emulator use')
        for entry in value.get('sources', []):
            source = ROOT / entry['path']; repo_path(source)
            require(source.is_file() and digest(source) == entry['sha256'], 'Reviewed source changed: ' + entry['path'])
        if value.get('version') == '0.32':
            home_found |= value.get('checksPassed', 0) > 0 and any(
                s['path'] == JAVA + 'GraphicsSetupView.java' for s in value.get('sources', []))
            stream_found |= value.get('sourceCheckGroupsPassed', 0) > 0 and value.get('boundedAssetStreamsClosed') is True
        reports.append({'path': name, 'sha256': digest(path)})
    require(home_found and stream_found, 'Current Home and actual bundled-stream host reports are required')
    return reports


def verify_music(apk):
    report = read_json(ROOT / MUSIC_REPORT)
    require(report.get('passed') is True and report.get('version') == '0.32'
            and report.get('archiveSHA256') == MUSIC_SHA and report.get('archiveBytes') == MUSIC_BYTES,
            'Bundled archive identity differs from the verified official soundtrack')
    require(report.get('originalFileHashesMatched') == 55 and report.get('originalOpusFilesMatched') == 40
            and report.get('albumTrackIds') == 39 and report.get('mapAssignmentsPreserved') == 46
            and report.get('musicEncodingChanged') is False
            and report.get('firstLaunchExtractionRequired') is False
            and report.get('musicNetworkDownloadRequired') is False, 'Music inventory/provenance differs')
    info = apk.getinfo(MUSIC_ASSET)
    require(info.file_size == MUSIC_BYTES and info.compress_type == ZIP_STORED
            and zip_digest(apk, MUSIC_ASSET) == MUSIC_SHA, 'Music must be the exact uncompressed, signed APK asset')
    expected_assets = {entry['path'].replace('app/src/main/', '', 1): entry for entry in report['bundledAssets']}
    require(set(expected_assets) == NEW_ASSETS, 'Unexpected bundled music/license asset inventory')
    for name, entry in expected_assets.items():
        require(apk.getinfo(name).file_size == entry['bytes'] and zip_digest(apk, name) == entry['sha256'],
                'Bundled music/license differs: ' + name)
    raw = apk.read(MUSIC_ASSET)
    original_files = report.get('originalFiles', [])
    require(len(original_files) == 55, 'Full original music file inventory missing')
    for entry in original_files:
        start, end = entry['start'], entry['end']
        require(0 <= start < end <= len(raw) and sha256(raw[start:end]).hexdigest() == entry['sha256'],
                'Original soundtrack file changed: ' + entry['filename'])
    return {'archiveAsset': MUSIC_ASSET, 'archiveBytes': MUSIC_BYTES, 'archiveSHA256': MUSIC_SHA,
            'originalFilesByteIdentical': 55, 'originalOpusFilesByteIdentical': 40,
            'mapAssignmentsUnchanged': 46, 'nativeExtractionRequired': False,
            'legacyDownloadedCacheRequired': False, 'networkDownloadRequired': False,
            'packStoredUncompressed': True, 'report': {'path': MUSIC_REPORT, 'sha256': digest(ROOT / MUSIC_REPORT)}}


def validate(args):
    candidate = digest(args.apk)
    require(candidate == args.expected_sha256, 'Candidate APK hash differs')
    emulator_name, proof, checks, evidence, supporting = verify_emulator(args, candidate)
    saved = read_json(ROOT / FALLBACK)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'],
                'Frozen 0.31 fallback changed: ' + str(path))
    baseline = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.31-Test-Ads.apk')
    old_source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.31-source.zip')
    require(digest(baseline) == BASELINE_SHA and digest(old_source) == SOURCE_SHA, 'Wrong frozen 0.31 baseline')
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
        require(assets == old_assets | NEW_ASSETS, 'Unexpected added/removed asset inventory')
        changed = [n for n in apk.namelist() if n not in old_names or zip_digest(apk, n) != zip_digest(old, n)]
        changed_assets = {n for n in changed if n.startswith('assets/')}
        require(changed_assets <= ASSET_SCOPE | NEW_ASSETS, 'Asset changed outside offline music and small-screen UI scope')
        require(all(n in ASSET_SCOPE | NEW_ASSETS or metadata(n) for n in changed + list(removed)),
                'APK changed beyond approved UI/assets and app metadata')
        frozen_assets = old_assets - ASSET_SCOPE
        require(all(zip_digest(apk, n) == zip_digest(old, n) for n in frozen_assets), 'Protected v0.31 asset changed')
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in assets and digest(path) == zip_digest(apk, name), 'Stale APK asset: ' + name)
        music = verify_music(apk)
        native_paths = ['assets/warzone/warzone2100.' + extension for extension in ('js', 'data', 'wasm')]
        native_hashes = {name: zip_digest(apk, name) for name in native_paths}
        require(all(native_hashes[n] == zip_digest(old, n) for n in native_paths), 'Native v0.31 engine/loader/data changed')
        require(native_hashes[native_paths[2]] == 'c69a9d1a3873aa23e774524b67db0cb1257a8326904ed06eddca7b45691eba78',
                'The accepted v0.31 native HUD correction was not retained')
        dex = [apk.read(n) for n in names if re.fullmatch(r'classes(?:\d+)?\.dex', n)]
        require(dex and any(AD_UNIT_ID.encode('ascii') in value for value in dex)
                and not any(PUBLISHER_AD_UNIT_ID.encode('ascii') in value for value in dex),
                'Delivery must retain only the Google sample rewarded unit')
    with ZipFile(old_source) as source:
        source_names = set(source.namelist())
        gradle_name = 'app/build.gradle.kts'
        expected_gradle = source.read(gradle_name).replace(b'versionCode = 31', b'versionCode = 32').replace(b'versionName = "0.31"', b'versionName = "0.32"')
        require((ROOT / gradle_name).read_bytes() == expected_gradle, 'Build settings changed beyond v0.32 version bump')
        old_attributes = source.read('.gitattributes').decode('utf-8').splitlines()
        new_attributes = (ROOT / '.gitattributes').read_text(encoding='utf-8').splitlines()
        lines = lambda rows: [line.strip() for line in rows if line.strip() and not line.lstrip().startswith('#')]
        require(lines(new_attributes) == lines(old_attributes) + ['app/src/main/assets/warzone/music/music.data filter=lfs diff=lfs merge=lfs -text'],
                'Git attributes changed beyond future bundled-music LFS storage')
        protected = [n for n in source_names if not n.endswith('/') and (
            n.startswith(('vendor/', 'map/', 'scenario/')) or n in NATIVE_REQUIRED
            or n.startswith('app/src/main/') and n not in SOURCE_SCOPE)]
        for name in protected:
            path = ROOT / name
            require(path.is_file() and digest(path) == zip_digest(source, name), 'Frozen source changed: ' + name)
        app_files = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src/main').rglob('*') if p.is_file()}
        require(app_files - source_names <= SOURCE_SCOPE, 'Unexpected new app source: ' + str(app_files - source_names))
    build = (ROOT / 'app/build.gradle.kts').read_text(encoding='utf-8')
    require(all(value in build for value in ('versionCode = 32', 'versionName = "0.32"',
            'com.google.android.gms:play-services-ads:25.5.0', 'com.google.android.ump:user-messaging-platform:4.0.0')),
            'Build version or pinned SDK versions differ')
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='32'",
            "versionName='0.32'", "application-label:'Warzone Towers'", 'application-debuggable')),
            'Package/version/label/update identity differs')
    manifest = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(args.apk), '--file', 'AndroidManifest.xml'],
                                       text=True, encoding='utf-8')
    require('com.google.android.gms.ads.APPLICATION_ID' in manifest and APP_ID in manifest and SAMPLE_APP_ID not in manifest,
            'Publisher consent identity changed')
    java = Path(os.environ.get('JAVA_HOME', 'C:/Program Files/Android/Android Studio/jbr')) / 'bin/java.exe'
    signer = sdk / 'build-tools/36.1.0/lib/apksigner.jar'
    def certificate(path):
        result = subprocess.check_output([str(java), '-jar', str(signer), 'verify', '--verbose', '--print-certs', str(path)], text=True, encoding='utf-8')
        require('Verified using v2 scheme (APK Signature Scheme v2): true' in result, 'APK v2 signature invalid')
        match = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)', result)
        require(match is not None, 'APK signing certificate digest missing')
        return match[1].lower()
    signing_sha = certificate(args.apk)
    require(signing_sha == certificate(baseline), 'APK cannot update the v0.31 signing identity')
    return {'version': '0.32', 'versionCode': 32, 'candidateAPK_SHA256': candidate,
        'scope': 'Bundled original soundtrack, simplified Home/Rewards controls and verified small-phone overflow layouts.',
        'emulatorUsed': True, 'gameplayVerified': False, 'testAdsOnly': True, 'liveAdsTested': False,
        'verification': 'Hash-bound actual offline playback and small-screen observations plus source/stream/package guards.',
        'emulatorProof': {'path': emulator_name, 'sha256': args.expected_emulator_report_sha256},
        'focusedEmulatorChecks': checks, 'emulatorEvidenceFiles': evidence, 'supportingObservations': supporting,
        'smallPhoneConfigurations': proof['smallPhoneConfigurations'], 'offlineMusic': proof['offlineMusic'],
        'changedAPKAssets': sorted(changed_assets - NEW_ASSETS), 'newAPKAssets': sorted(NEW_ASSETS),
        'changedAPKMembers': changed, 'removedAPKMembers': sorted(removed), 'bundledMusic': music,
        'nativeAssetSHA256': native_hashes, 'nativeEngineAndDataByteIdenticalTo031': True,
        'mapsDuelScenarioCatalogsUnchanged': True, 'walletSaveAndAdsControllerUnchanged': True,
        'preservedOriginalSourceFiles': len(protected), 'preservedAPKAssets': len(frozen_assets),
        'deliveryAds': {'appId': APP_ID, 'rewardedAdUnitId': AD_UNIT_ID, 'crystalsPerEarnedAd': 10,
                        'sampleAdsOnPhysicalPhones': True, 'publisherLiveAdUnitAbsentFromDEX': True, 'liveServingVerified': False},
        'signing': {'debugSignedForExistingAppUpdates': True, 'sameCertificateAs031': True, 'certificateSHA256': signing_sha},
        'sourceCheckReports': reports, 'fallbackRecord': {'path': FALLBACK, 'sha256': digest(ROOT / FALLBACK)},
        'sourceInventory': 'git ls-files --cached --others --exclude-standard; caches/private/transient files excluded',
        'gitMetadataIncluded': False, 'vpsChanged': False, 'githubPublished': False,
        'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}


def source_inventory(required):
    names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode('utf-8').split('\0')
    tracked = set(filter(None, subprocess.check_output(['git', 'ls-files', '--cached', '-z'], cwd=ROOT).decode('utf-8').split('\0')))
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
    parser.add_argument('--emulator-report', '--emulator-proof', dest='emulator_report', type=Path, required=True)
    parser.add_argument('--expected-emulator-report-sha256', '--expected-emulator-proof-sha256', dest='expected_emulator_report_sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery output must be outside source tree')
    outputs = [args.output / n for n in ('Warzone-Towers-0.32-Test-Ads.apk', 'warzone-towers-0.32-source.zip', 'Warzone-Towers-0.32-Test-Ads-SHA256.txt')]
    apk_out, source_out, checksums = outputs; partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in outputs + [partial]), 'Frozen delivery/partial must not be overwritten')
    record = validate(args)
    required = NATIVE_REQUIRED | {'tools/package-24-home.py', 'tools/package-32-offline.py',
        RECORD, FALLBACK, MUSIC_REPORT, 'README.md', 'AGENTS.md', 'docs/releases/0.32-offline-small.md',
        'tools/prepare-bundled-music-032.py', record['emulatorProof']['path']}
    required |= {'app/src/main/' + name for name in NEW_ASSETS}
    for report in record['sourceCheckReports']: required.add(report['path'])
    for entry in record['emulatorEvidenceFiles'] + record['supportingObservations']: required.add(entry['path'])
    files = source_inventory(required)
    if args.validate_only:
        print(json.dumps({'validationPassed': True, 'deliveryFilesWritten': False, 'candidateAPK_SHA256': record['candidateAPK_SHA256'],
            'focusedChecks': len(record['focusedEmulatorChecks']), 'sourceFiles': len(files),
            'nativeEngineDataMapsAndControllerFrozen': True, 'bundledMusicBytes': MUSIC_BYTES,
            'all55MusicFilesAnd46AssignmentsPreserved': True, 'sameSigningCertificateAs031': True,
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
        require(archive.getinfo('app/src/main/' + MUSIC_ASSET).file_size == MUSIC_BYTES, 'Complete music is absent/LFS pointer')
        for name, path in files:
            actual = zip_digest(archive, name)
            require(actual == digest(path) and (name not in expected or actual == expected[name]['sha256']), 'Source changed during packaging: ' + name)
    require(digest(args.apk) == record['candidateAPK_SHA256'] and digest(args.emulator_report) == args.expected_emulator_report_sha256,
            'APK or emulator proof changed during packaging')
    for entry in record['sourceCheckReports'] + record['emulatorEvidenceFiles'] + record['supportingObservations']:
        require(digest(ROOT / entry['path']) == entry['sha256'], 'Source/evidence changed during packaging')
    shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == record['candidateAPK_SHA256'], 'Delivery APK differs from exact checked candidate')
    partial.rename(source_out); source_sha = digest(source_out)
    with checksums.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(f'{record["candidateAPK_SHA256"]}  {apk_out.name}\n{source_sha}  {source_out.name}\n')
    print(json.dumps({'packageIntegrityPassed': True, 'emulatorUsed': True, 'gameplayVerified': False,
        'testAdsOnly': True, 'liveAdsTested': False, 'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size,
        'candidateAPK_SHA256': record['candidateAPK_SHA256'], 'source': str(source_out),
        'sourceBytes': source_out.stat().st_size, 'sourceZIP_SHA256': source_sha, 'sourceFiles': len(files),
        'checksums': str(checksums), 'streamedEverySourceEntryCRCAndSHA': True}, indent=2))


if __name__ == '__main__':
    main()
