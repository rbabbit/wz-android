"""Validate/package the exact 0.30 quiet rewarded-ad test APK and complete source.

Run --validate-only before writing the large archive. Delivery uses the real
publisher app ID for its consent message and only Google's sample rewarded unit.
All 0.29 game assets and unrelated Java/scenario sources stay frozen.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from datetime import datetime, timezone
import argparse
import json
import os
import re
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
COMMON = runpy.run_path(str(ROOT / 'tools/package-24-home.py'), run_name='package_030_helpers')
require, digest, zip_digest = (COMMON[k] for k in ('require', 'digest', 'zip_digest'))
read_json, repo_path, metadata = (COMMON[k] for k in ('read_json', 'repo_path', 'metadata'))
NATIVE_SOURCE, MANIFEST, STORED, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[k] for k in (
    'NATIVE_SOURCE', 'MANIFEST', 'STORED', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
FALLBACK = 'archive/fallback-0.30.json'
RECORD = 'archive/release-0.30-focused-tested.json'
BASELINE_SHA = 'fbd35815d25b9a31a2dda9708c42b6af5e951d892a65f661f7d32737184728d3'
SOURCE_SHA = 'fa3e076020908ef3ff48f65cd720154d885b9025cab1c05287e6d36343282fe6'
PHONE_TEST_SHA = '9dca561053553f64f2ea2b004e52956737a37f11e69b2631b71a453972b28072'
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~3347511713'
AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917'
PUBLISHER_AD_UNIT_ID = 'ca-app-pub-3430279660625393/5338770704'
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
SOURCE_SCOPE = {JAVA + name for name in (
    'MainActivity.java', 'RewardedAdsController.java', 'RewardsView.java')}


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
    reports, controller_found = [], False
    for path in paths:
        name = repo_path(path); value = read_json(path)
        require(value.get('emulatorUsed') is False, 'Source fixture must explicitly exclude emulator use')
        for entry in value.get('sources', []):
            source = ROOT / entry['path']; repo_path(source)
            require(source.is_file() and digest(source) == entry['sha256'], 'Checked source changed: ' + entry['path'])
        if value.get('version') == '0.30' and value.get('actualControllerExecutedOnJVM') is True:
            require(value.get('checksPassed', 0) > 0 and value.get('googleSDKExecuted') is False,
                    'Actual 0.30 controller fixture scope is missing')
            require(any(entry['path'] == JAVA + 'RewardedAdsController.java' for entry in value.get('sources', [])),
                    'Controller fixture does not bind the actual controller')
            controller_found = True
        reports.append({'path': name, 'sha256': digest(path)})
    require(controller_found, 'New actual-controller 0.30 policy report required')
    return reports


def validate(args):
    candidate = digest(args.apk)
    require(candidate == args.expected_sha256, 'Candidate APK hash differs')
    emulator_name, proof, checks, evidence, supporting = verify_emulator(args, candidate)
    saved = read_json(ROOT / FALLBACK)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'],
                'Frozen 0.29 fallback changed: ' + str(path))
    baseline = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.29.apk')
    old_source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.29-source.zip')
    phone_test = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.29-Test-Ads.apk')
    require(digest(baseline) == BASELINE_SHA and digest(old_source) == SOURCE_SHA
            and digest(phone_test) == PHONE_TEST_SHA, 'Wrong frozen 0.29 baseline')
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
        require(all(zip_digest(apk, n) == zip_digest(old, n) for n in assets), 'Protected asset changed')
        changed = [n for n in apk.namelist() if n not in old_names or zip_digest(apk, n) != zip_digest(old, n)]
        require(all(metadata(n) for n in changed + list(removed)),
                'APK changed beyond manifest/resources/dex/signing metadata')
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in assets and digest(path) == zip_digest(apk, name), 'Stale APK source asset: ' + name)
        helpers = runpy.run_path(str(ROOT / 'tools/package-28-rewards.py'), run_name='package_030_native')
        native = helpers['verify_native'](apk, old)
        dex = [apk.read(n) for n in names if re.fullmatch(r'classes(?:\d+)?\.dex', n)]
        require(dex and any(AD_UNIT_ID.encode('ascii') in value for value in dex),
                'Google sample rewarded unit missing from test APK')
        require(not any(PUBLISHER_AD_UNIT_ID.encode('ascii') in value for value in dex),
                'Publisher live rewarded unit must not be present in this test delivery')
    with ZipFile(old_source) as source:
        source_names = set(source.namelist())
        protected = [n for n in source_names if not n.endswith('/') and (
            n.startswith(('vendor/', 'map/', 'scenario/')) or n == NATIVE_SOURCE or
            n.startswith('app/src/main/') and n not in SOURCE_SCOPE)]
        for name in protected:
            path = ROOT / name
            require(path.is_file() and digest(path) == zip_digest(source, name), 'Frozen source changed: ' + name)
        app_files = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src/main').rglob('*') if p.is_file()}
        require(app_files - source_names <= SOURCE_SCOPE, 'Unexpected new app source: ' + str(app_files - source_names))
    build = (ROOT / 'app/build.gradle.kts').read_text(encoding='utf-8')
    require(all(value in build for value in ('versionCode = 30', 'versionName = "0.30"',
            'com.google.android.gms:play-services-ads:25.5.0', 'com.google.android.ump:user-messaging-platform:4.0.0')),
            'Build version or pinned SDK versions differ')
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='30'",
            "versionName='0.30'", "application-label:'Warzone Towers'", 'application-debuggable')),
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
    require(signing_sha == certificate(baseline), 'APK cannot update the existing 0.29 signing identity')
    return {'version': '0.30', 'versionCode': 30, 'candidateAPK_SHA256': candidate,
        'scope': 'Quiet optional Rewards ad action; publisher consent styling with on-demand Google sample ads.',
        'emulatorUsed': True, 'gameplayVerified': False, 'testAdsOnly': True, 'liveAdsTested': False,
        'verification': 'Hash-bound focused emulator observations plus controller/source fixtures and package/preservation checks.',
        'emulatorProof': {'path': emulator_name, 'sha256': args.expected_emulator_report_sha256},
        'focusedEmulatorChecks': checks, 'emulatorEvidenceFiles': evidence, 'supportingObservations': supporting,
        'changedAPKAssets': [], 'newAPKAssets': [], 'changedAPKMembers': changed,
        'removedAPKMembers': sorted(removed), 'nativePreservation': native,
        'mapsMusicDuelNativeByteIdentical': True, 'preservedOriginalSourceFiles': len(protected),
        'preservedAPKAssets': len(assets),
        'deliveryAds': {'appId': APP_ID, 'rewardedAdUnitId': AD_UNIT_ID, 'crystalsPerEarnedAd': 10,
                        'sampleAdsOnPhysicalPhones': True, 'publisherLiveAdUnitAbsentFromDEX': True,
                        'publisherConsentMessageVerified': proof.get('publisherConsentMessageVerified') is True,
                        'publisherFormatSettingsApplyToSampleUnit': False, 'liveServingVerified': False},
        'signing': {'debugSignedForExistingAppUpdates': True, 'sameCertificateAs029': True, 'certificateSHA256': signing_sha},
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
    parser.add_argument('--emulator-report', '--emulator-proof', dest='emulator_report', type=Path, required=True)
    parser.add_argument('--expected-emulator-report-sha256', '--expected-emulator-proof-sha256', dest='expected_emulator_report_sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery output must be outside source tree')
    outputs = [args.output / n for n in ('Warzone-Towers-0.30-Test-Ads.apk', 'warzone-towers-0.30-source.zip',
                                        'Warzone-Towers-0.30-Test-Ads-SHA256.txt')]
    apk_out, source_out, checksums = outputs; partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in outputs + [partial]), 'Frozen delivery/partial must not be overwritten')
    record = validate(args)
    required = {NATIVE_SOURCE, 'tools/package-24-home.py', 'tools/package-28-rewards.py',
        'tools/package-30-quiet-ads.py', 'tools/integrate-native-runtime.py', RECORD, FALLBACK, 'README.md', 'AGENTS.md',
        'docs/releases/0.30-quiet-ads.md', record['emulatorProof']['path']}
    for report in record['sourceCheckReports']: required.add(report['path'])
    for entry in record['emulatorEvidenceFiles'] + record['supportingObservations']: required.add(entry['path'])
    files = source_inventory(required)
    if args.validate_only:
        print(json.dumps({'validationPassed': True, 'deliveryFilesWritten': False, 'candidateAPK_SHA256': record['candidateAPK_SHA256'],
            'focusedChecks': len(record['focusedEmulatorChecks']), 'sourceFiles': len(files),
            'mapsMusicDuelNativeByteIdentical': True, 'sameSigningCertificateAs029': True,
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
    for entry in record['sourceCheckReports'] + record['emulatorEvidenceFiles'] + record['supportingObservations']:
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
