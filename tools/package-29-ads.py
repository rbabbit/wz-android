"""Validate and package the exact 0.29 AdMob APK and complete source archive.

Run --validate-only first: no delivery ZIP is written until exact-APK evidence,
source reports, production IDs, update signing and frozen game payload pass.
Google's official test ads/device traffic is the only permitted emulator traffic.
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
COMMON = runpy.run_path(str(ROOT / 'tools/package-24-home.py'), run_name='package_029_helpers')
require, digest, zip_digest = (COMMON[k] for k in ('require', 'digest', 'zip_digest'))
read_json, repo_path, metadata = (COMMON[k] for k in ('read_json', 'repo_path', 'metadata'))
NATIVE_SOURCE, MANIFEST, STORED, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[k] for k in (
    'NATIVE_SOURCE', 'MANIFEST', 'STORED', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
FALLBACK = 'archive/fallback-0.29.json'
RECORD = 'archive/release-0.29-focused-tested.json'
BASELINE_SHA = 'fa1d41a8287937c3edf2f1f36b1bcddfce95e31dd1f06ad26dc500c4a8d9e52f'
SOURCE_SHA = '1c49d9a3167519d0bf9de9de6018b8ae8c6fe88028225db1598c7c8eb0f1069b'
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
AD_UNIT_ID = 'ca-app-pub-3430279660625393/5338770704'
NEW_ASSET_SCOPE = {'assets/warzone/rewarded-ads.js'}
INCLUDE_SCOPE = {'assets/warzone/mobile.html', 'assets/warzone/index.html'}
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
SOURCE_SCOPE = {JAVA + name for name in (
    'MainActivity.java', 'RewardedAdsController.java', 'RewardsView.java',
    'RewardStore.java', 'RewardLedger.java', 'GraphicsSetupView.java')}
SOURCE_SCOPE |= {'app/src/main/AndroidManifest.xml'}
SOURCE_SCOPE |= {'app/src/main/' + name for name in NEW_ASSET_SCOPE | INCLUDE_SCOPE}


def write_json(path, value):
    """Bind source records to deterministic LF bytes on Windows too."""
    with path.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def verify_include(before, after, name):
    """An adapter include cannot conceal a gameplay or layout alteration."""
    text = after.decode('utf-8')
    lines = text.splitlines(keepends=True)
    inserted = [line for line in lines if 'rewarded-ads.js' in line]
    require(len(inserted) == 1, 'Expected one rewarded-ad adapter include in ' + name)
    require(re.fullmatch(r'\s*<script\s+src=[\"\'](?:\./)?rewarded-ads\.js[\"\']\s*>\s*</script>\s*',
                         inserted[0]) is not None, 'Adapter include is not a plain script element: ' + name)
    require(''.join(line for line in lines if line != inserted[0]).encode('utf-8') == before,
            'Existing game adapter changed beyond one rewarded-ad script include: ' + name)


def sdk_member(name):
    """SDK Java/resources are separate from the frozen bundled game assets."""
    return metadata(name) or name.startswith(('res/', 'META-INF/', 'lib/', 'kotlin/', 'google/')) or name.endswith(
        ('.properties', '.version', '.proto')) or name in {'DebugProbesKt.bin', 'kotlin-tooling-metadata.json'}


def verify_emulator(args, candidate):
    name = repo_path(args.emulator_report)
    require(digest(args.emulator_report) == args.expected_emulator_report_sha256, 'Emulator report hash differs')
    proof = read_json(args.emulator_report)
    require(proof.get('candidateAPK_SHA256') == candidate and proof.get('emulatorUsed') is True,
            'Focused observations must bind the exact delivery APK')
    require(proof.get('gameplayVerified') is False, 'Focused ad checks must not claim a full gameplay pass')
    require(proof.get('liveAdsTested', False) is False, 'Live production ad testing is not permitted')
    require(proof.get('testAdsOnly') is True or proof.get('adsTestTrafficOnly') is True,
            'Report must explicitly identify only Google test-ad/device traffic')
    checks = proof.get('checks', [])
    require(isinstance(checks, list) and checks and all(isinstance(c, dict) and c.get('name')
            and c.get('passed') is True for c in checks), 'Focused observations must name only passed checks')
    evidence = proof.get('evidenceFiles', [])
    supporting = proof.get('supportingObservations', [])
    require(isinstance(evidence, list) and evidence and isinstance(supporting, list), 'Evidence inventory missing')
    for entry in evidence + supporting:
        path = ROOT / entry['path']; repo_path(path)
        require(path.is_file() and digest(path) == entry['sha256'], 'Evidence changed: ' + entry['path'])
    return name, proof, checks, evidence, supporting


def verify_reports(paths):
    reports = []
    wallet_found = False
    for path in paths:
        name = repo_path(path); value = read_json(path)
        require(value.get('emulatorUsed') is False, 'Source fixture must explicitly exclude emulator use')
        for entry in value.get('sources', []):
            source = ROOT / entry['path']; repo_path(source)
            require(source.is_file() and digest(source) == entry['sha256'], 'Checked source changed: ' + entry['path'])
        if name == 'archive/reward-ledger-0.29-checks.json':
            require(value.get('checksPassed', 0) >= 241 and value.get('adWalletChecks', 0) >= 41,
                    'Focused wallet checks are incomplete')
            wallet_found = True
        reports.append({'path': name, 'sha256': digest(path)})
    require(wallet_found, 'Actual wallet policy report required')
    return reports


def validate(args):
    candidate = digest(args.apk)
    require(candidate == args.expected_sha256, 'Candidate APK hash differs')
    emulator_name, emulator, checks, evidence, supporting = verify_emulator(args, candidate)
    saved = read_json(ROOT / FALLBACK)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'],
                'Frozen 0.28 fallback changed: ' + str(path))
    baseline = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.28.apk')
    old_source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.28-source.zip')
    require(digest(baseline) == BASELINE_SHA and digest(old_source) == SOURCE_SHA, 'Wrong frozen 0.28 baseline')
    reports = verify_reports(args.source_report)
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'AppData/Local/Android/Sdk')))
    aapt = sdk / 'build-tools/36.1.0/aapt2.exe'
    with ZipFile(args.apk) as apk, ZipFile(baseline) as old:
        require(apk.testzip() is None, 'Built APK CRC failure')
        names, old_names = set(apk.namelist()), set(old.namelist())
        require(len(names) == len(apk.namelist()), 'Duplicate APK member')
        added, removed = names - old_names, old_names - names
        require(not any(name.startswith('assets/') for name in removed), 'Bundled game assets were removed')
        new_assets = {name for name in added if name.startswith('assets/')}
        require(new_assets == NEW_ASSET_SCOPE, 'New asset inventory differs from the rewarded-ad adapter')
        changed = [name for name in apk.namelist() if name not in old_names
                   or zip_digest(old, name) != zip_digest(apk, name)]
        changed_assets = {name for name in changed if name.startswith('assets/') and name in old_names}
        require(changed_assets <= INCLUDE_SCOPE and len(changed_assets) <= 1,
                'Existing game assets changed outside one minimal adapter include')
        for name in changed_assets:
            verify_include(old.read(name), apk.read(name), name)
        require(all(name in NEW_ASSET_SCOPE | INCLUDE_SCOPE or sdk_member(name) for name in changed),
                'Unexpected APK changes outside ad/SDK scope')
        require(all(sdk_member(name) for name in removed), 'Unexpected removed APK member')
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in names and digest(path) == zip_digest(apk, name), 'Stale APK source asset: ' + name)
        frozen_assets = {name for name in old_names if name.startswith('assets/') and name not in changed_assets}
        require(all(zip_digest(apk, name) == zip_digest(old, name) for name in frozen_assets), 'Protected asset changed')
        helpers = runpy.run_path(str(ROOT / 'tools/package-28-rewards.py'), run_name='package_029_native')
        native = helpers['verify_native'](apk, old)
        dex = [name for name in names if re.fullmatch(r'classes(?:\d+)?\.dex', name)]
        require(dex and any(AD_UNIT_ID.encode('ascii') in apk.read(name) for name in dex),
                'Production rewarded-ad ID is absent from candidate DEX')
    with ZipFile(old_source) as source:
        source_names = set(source.namelist())
        protected = [name for name in source_names if not name.endswith('/') and (
            name.startswith(('vendor/', 'map/', 'scenario/')) or name == NATIVE_SOURCE or
            name.startswith('app/src/main/') and name not in SOURCE_SCOPE)]
        for name in protected:
            path = ROOT / name
            require(path.is_file() and digest(path) == zip_digest(source, name), 'Frozen source changed: ' + name)
        app_files = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src/main').rglob('*') if p.is_file()}
        require(app_files - source_names <= SOURCE_SCOPE, 'Unexpected new app source: ' + str(app_files - source_names))
    build = (ROOT / 'app/build.gradle.kts').read_text(encoding='utf-8')
    require(all(value in build for value in ('versionCode = 29', 'versionName = "0.29"',
            'com.google.android.gms:play-services-ads:25.5.0', 'com.google.android.ump:user-messaging-platform:4.0.0')),
            'Build version or pinned official SDK versions differ')
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='29'",
            "versionName='0.29'", "application-label:'Warzone Towers'", 'application-debuggable')),
            'Package/version/label/debug-update signing build differs')
    manifest = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(args.apk), '--file', 'AndroidManifest.xml'],
                                       text=True, encoding='utf-8')
    require('com.google.android.gms.ads.APPLICATION_ID' in manifest and APP_ID in manifest,
            'Production AdMob app ID missing from packaged manifest')
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
    require(signing_sha == certificate(baseline), 'APK cannot update the existing 0.28 signing identity')
    return {'version': '0.29', 'versionCode': 29, 'candidateAPK_SHA256': candidate,
        'scope': 'Optional Home/in-game rewarded ads, fixed ten-crystal wallet grants and consent/privacy handling.',
        'emulatorUsed': True, 'gameplayVerified': False, 'testAdsOnly': True, 'liveAdsTested': False,
        'verification': 'Only hash-bound focused emulator observations plus source fixtures, APK signing/archive and frozen payload checks.',
        'emulatorProof': {'path': emulator_name, 'sha256': args.expected_emulator_report_sha256},
        'focusedEmulatorChecks': checks, 'emulatorEvidenceFiles': evidence, 'supportingObservations': supporting,
        'changedAPKAssets': sorted(changed_assets), 'newAPKAssets': sorted(new_assets),
        'changedAPKMembers': changed, 'removedAPKMembers': sorted(removed),
        'nativePreservation': native, 'mapsMusicDuelNativeByteIdentical': True,
        'preservedOriginalSourceFiles': len(protected), 'preservedAPKAssets': len(frozen_assets),
        'deliveryAds': {'appId': APP_ID, 'rewardedAdUnitId': AD_UNIT_ID, 'crystalsPerEarnedAd': 10,
                        'emulatorTraffic': 'The controller routes Android emulators to Google\'s official sample rewarded unit.',
                        'liveServingVerified': False, 'accountAndStoreApproval': 'External AdMob setup remains required.'},
        'signing': {'debugSignedForExistingAppUpdates': True, 'sameCertificateAs028': True, 'certificateSHA256': signing_sha},
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
    require(required <= {name for name, _ in files}, 'Required complete source missing: '
            + str(sorted(required - {name for name, _ in files})))
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, required=True)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--source-report', type=Path, action='append', required=True)
    parser.add_argument('--emulator-report', '--emulator-proof', dest='emulator_report', type=Path, required=True)
    parser.add_argument('--expected-emulator-report-sha256', '--expected-emulator-proof-sha256',
                        dest='expected_emulator_report_sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery output must be outside source tree')
    outputs = [args.output / name for name in ('Warzone-Towers-0.29.apk', 'warzone-towers-0.29-source.zip',
                                               'Warzone-Towers-0.29-SHA256.txt')]
    apk_out, source_out, checksums = outputs; partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in outputs + [partial]), 'Frozen delivery/partial must not be overwritten')
    record = validate(args)
    required = {NATIVE_SOURCE, 'tools/package-24-home.py', 'tools/package-28-rewards.py',
        'tools/package-29-ads.py', 'tools/integrate-native-runtime.py', RECORD, FALLBACK, 'README.md', 'AGENTS.md',
        'docs/releases/0.29-rewarded-ads.md', 'docs/admob-setup.md', record['emulatorProof']['path']}
    for report in record['sourceCheckReports']: required.add(report['path'])
    for entry in record['emulatorEvidenceFiles'] + record['supportingObservations']: required.add(entry['path'])
    files = source_inventory(required)
    if args.validate_only:
        print(json.dumps({'validationPassed': True, 'deliveryFilesWritten': False, 'candidateAPK_SHA256': record['candidateAPK_SHA256'],
            'focusedChecks': len(record['focusedEmulatorChecks']), 'sourceFiles': len(files),
            'mapsMusicDuelNativeByteIdentical': True, 'sameSigningCertificateAs028': True,
            'productionAdIDsPresent': True, 'emulatorTestAdsOnly': True}, indent=2))
        return
    write_json(ROOT / RECORD, record)
    entries = [{'path': name, 'bytes': path.stat().st_size, 'sha256': digest(path)} for name, path in files if name != MANIFEST]
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
    require(digest(args.apk) == record['candidateAPK_SHA256']
            and digest(args.emulator_report) == args.expected_emulator_report_sha256, 'APK or emulator proof changed during packaging')
    for report in record['sourceCheckReports']:
        require(digest(ROOT / report['path']) == report['sha256'], 'Source report changed during packaging')
    for entry in record['emulatorEvidenceFiles'] + record['supportingObservations']:
        require(digest(ROOT / entry['path']) == entry['sha256'], 'Emulator evidence changed during packaging')
    shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == record['candidateAPK_SHA256'], 'Delivery APK differs from exact checked candidate')
    partial.rename(source_out); source_sha = digest(source_out)
    checksums.write_text(f'{record["candidateAPK_SHA256"]}  {apk_out.name}\n{source_sha}  {source_out.name}\n', encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed': True, 'emulatorUsed': True, 'gameplayVerified': False,
        'testAdsOnly': True, 'liveAdsTested': False, 'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size,
        'candidateAPK_SHA256': record['candidateAPK_SHA256'], 'source': str(source_out),
        'sourceBytes': source_out.stat().st_size, 'sourceZIP_SHA256': source_sha,
        'sourceFiles': len(files), 'checksums': str(checksums), 'streamedEverySourceEntryCRCAndSHA': True}, indent=2))


if __name__ == '__main__':
    main()
