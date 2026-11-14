"""Guard and package v0.37's six square unit controls.

The immutable v0.36 APK and complete source ZIP are the baseline. This does not
depend on v0.36 having been committed to Git. Package only the exact APK checked
by root in the emulator; source/build checks do not establish runtime behavior.
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
COMMON = runpy.run_path(str(ROOT / 'tools/package-24-home.py'), run_name='package_037_common')
require, digest, zip_digest = (COMMON[k] for k in ('require', 'digest', 'zip_digest'))
read_json, repo_path, metadata = (COMMON[k] for k in ('read_json', 'repo_path', 'metadata'))
NATIVE_SOURCE, MANIFEST, STORED, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[k] for k in (
    'NATIVE_SOURCE', 'MANIFEST', 'STORED', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
ASSET_SCOPE = {'assets/warzone/ui/towers-shell.css'}
SOURCE_SCOPE = {'app/src/main/' + n for n in ASSET_SCOPE}
GRADLE = 'app/build.gradle.kts'
FALLBACK = 'archive/fallback-0.37.json'
RECORD = 'archive/release-0.37-focused-tested.json'
SOURCE_REPORT = 'archive/square-controls-0.37-source-checks.json'
DOC = 'docs/releases/0.37-square-controls.md'
BASELINE_SHA = '9d4debdeb7b023ba347b3dd52bdaab735e546f93c74fb61c7a87c83d096acdb6'
SOURCE_SHA = 'dfbf14c16f417d08e65cbb2a1935ad45eb3e3d319d13b1cf33bc80ca4c9f4b9d'
MUSIC_ASSET = 'assets/warzone/music/music.data'
MUSIC_SHA = '602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd'
MUSIC_BYTES = 114721578
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~3347511713'
AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917'
PUBLISHER_AD_UNIT_ID = 'ca-app-pub-3430279660625393/5338770704'
NATIVE_REQUIRED = {NATIVE_SOURCE}


def write_json(path, value):
    with path.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.is_file() and path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'],
                'Frozen v0.36 fallback changed: ' + str(path))
    apk = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.36-Test-Ads.apk')
    source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.36-source.zip')
    require(digest(apk) == BASELINE_SHA and digest(source) == SOURCE_SHA, 'Wrong immutable v0.36 baseline')
    return apk, source


def validate_source(source):
    """Compare every original source file; no old native/gameplay suite is run."""
    changed, protected = [], []
    with ZipFile(source) as archive:
        names = set(archive.namelist())
        require(len(names) == len(archive.namelist()), 'Duplicate baseline source member')
        manifest = json.loads(archive.read(MANIFEST))
        indexed = {entry['path']: entry for entry in manifest['files']}
        require(set(indexed) == names - {MANIFEST}, 'v0.36 source inventory is incomplete')
        expected_gradle = archive.read(GRADLE).replace(b'versionCode = 36', b'versionCode = 37').replace(
            b'versionName = "0.36"', b'versionName = "0.37"')
        require((ROOT / GRADLE).read_bytes() == expected_gradle, 'Build settings changed beyond version 37')
        require((ROOT / '.gitattributes').read_bytes() == archive.read('.gitattributes'), 'LFS storage rules changed')
        for name, entry in indexed.items():
            if name == GRADLE or name in {MANIFEST, 'AGENTS.md', 'README.md', 'design-qa.md'} or name.startswith(('docs/', 'qa/')):
                continue
            path = ROOT / name
            require(path.is_file(), 'Required baseline source was removed: ' + name)
            actual = digest(path)
            if actual != entry['sha256']:
                require(name in SOURCE_SCOPE, 'Source changed outside square-control CSS scope: ' + name)
                changed.append({'path': name, 'beforeSHA256': entry['sha256'], 'sha256': actual})
            else:
                protected.append(name)
        app_files = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src/main').rglob('*') if p.is_file()}
        require(not (app_files - names), 'Unexpected new app source/assets: ' + str(sorted(app_files - names)))
        require({v['path'] for v in changed} == SOURCE_SCOPE, 'Only towers-shell.css may differ from existing source')
    build = (ROOT / GRADLE).read_text(encoding='utf-8')
    require(all(v in build for v in ('versionCode = 37', 'versionName = "0.37"',
        'com.google.android.gms:play-services-ads:25.5.0', 'com.google.android.ump:user-messaging-platform:4.0.0')),
        'Version or existing pinned ad SDKs changed')
    scope = sorted(SOURCE_SCOPE | {GRADLE})
    return {'changedAppSources': changed, 'preservedOriginalSourceFiles': len(protected),
            'protectedSourcePaths': protected,
            'sources': [{'path': name, 'sha256': digest(ROOT / name)} for name in scope],
            'baselineManifestEntries': len(manifest['files']),
            'sourceZIPBaselineSHA256': SOURCE_SHA, 'nativeAndMapSourcesFrozen': True,
            'walletSaveCodecAndAdControllerFrozen': True}


def verify_source_report(path):
    name = repo_path(path); report = read_json(path)
    require(report.get('version') == '0.37' and report.get('emulatorUsed') is False
            and report.get('checksPassed', 0) > 0, 'Current source-only preservation report missing')
    require({v['path'] for v in report.get('sources', [])} >= SOURCE_SCOPE | {GRADLE},
            'Source report must bind the final changed app scope')
    for entry in report['sources']:
        current = ROOT / entry['path']; repo_path(current)
        require(current.is_file() and digest(current) == entry['sha256'], 'Reviewed source changed: ' + entry['path'])
    return {'path': name, 'sha256': digest(path)}


def verify_emulator(args, candidate):
    name = repo_path(args.emulator_report)
    require(digest(args.emulator_report) == args.expected_emulator_report_sha256, 'Emulator proof hash differs')
    proof = read_json(args.emulator_report)
    require(proof.get('candidateAPK_SHA256') == candidate and proof.get('emulatorUsed') is True,
            'Runtime observations must bind the exact delivery APK')
    require(proof.get('gameplayVerified') is False and proof.get('liveAdsTested', False) is False
            and proof.get('testAdsOnly') is True, 'Focused checks must retain sample ads and not claim a full-game/live-ad pass')
    configurations = proof.get('smallPhoneConfigurations', proof.get('configurations', []))
    require(configurations and all(all(isinstance(c.get(k), (int, float)) and c[k] > 0
        for k in ('physicalWidth', 'physicalHeight', 'densityDpi', 'fontScale')) for c in configurations),
        'Actual tested screen dimensions/density/font scale missing')
    require(any(min(c['physicalWidth'], c['physicalHeight']) * 160 / c['densityDpi'] <= 360 for c in configurations),
            'The square-control layout needs an actual small-phone observation')
    focused = proof.get('focusedObservations', {})
    required = ('squareControlsLayoutVerified', 'outerWidthAndFooterPreservedVerified',
                'sixControlActionsVerified', 'smallScreenAndTextVerified')
    require(all(focused.get(k) is True for k in required), 'Required control-layout/action/viewport observation is missing')
    checks = proof.get('checks', [])
    require(checks and all(c.get('name') and c.get('passed') is True for c in checks), 'Only named observed passed checks belong in proof')
    evidence, supporting = proof.get('evidenceFiles', []), proof.get('supportingObservations', [])
    require(evidence and isinstance(supporting, list), 'Hash-bound screenshot and supporting evidence inventory missing')
    for entry in evidence + supporting:
        path = ROOT / entry['path']; repo_path(path)
        require(path.is_file() and digest(path) == entry['sha256'], 'Evidence changed: ' + entry['path'])
    return name, proof, configurations, checks, evidence, supporting


def validate(args):
    candidate = digest(args.apk)
    require(candidate == args.expected_sha256, 'Candidate APK hash differs')
    emulator_name, proof, configurations, checks, evidence, supporting = verify_emulator(args, candidate)
    baseline, source = baseline_paths()
    reviewed = verify_source_report(args.source_report)
    preservation = validate_source(source)
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'AppData/Local/Android/Sdk')))
    aapt = sdk / 'build-tools/36.1.0/aapt2.exe'
    with ZipFile(args.apk) as apk, ZipFile(baseline) as old:
        require(apk.testzip() is None, 'Built APK CRC failure')
        names, old_names = set(apk.namelist()), set(old.namelist())
        require(len(names) == len(apk.namelist()), 'Duplicate APK member')
        assets = {n for n in names if n.startswith('assets/')}
        require(assets == {n for n in old_names if n.startswith('assets/')}, 'App asset inventory changed')
        changed = [n for n in apk.namelist() if n not in old_names or zip_digest(apk, n) != zip_digest(old, n)]
        removed = old_names - names
        require(all(n in ASSET_SCOPE or metadata(n) for n in changed + list(removed)),
                'APK changed outside approved square-control CSS UI and metadata')
        changed_assets = {n for n in changed if n.startswith('assets/')}
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in assets and digest(path) == zip_digest(apk, name), 'Stale APK asset: ' + name)
        native_names = ['assets/warzone/warzone2100.' + ext for ext in ('js', 'data', 'wasm')]
        native_hashes = {n: zip_digest(apk, n) for n in native_names}
        require(all(native_hashes[n] == zip_digest(old, n) for n in native_names), 'Native engine/loader/data changed')
        require(apk.getinfo(MUSIC_ASSET).file_size == MUSIC_BYTES
                and apk.getinfo(MUSIC_ASSET).compress_type == ZIP_STORED and zip_digest(apk, MUSIC_ASSET) == MUSIC_SHA,
                'Bundled original soundtrack changed or is compressed/extracted')
        dex = [apk.read(n) for n in names if re.fullmatch(r'classes(?:\d+)?\.dex', n)]
        require(dex and any(AD_UNIT_ID.encode('ascii') in v for v in dex)
                and not any(PUBLISHER_AD_UNIT_ID.encode('ascii') in v for v in dex), 'Only sample rewarded ads may ship')
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    require(all(v in badging for v in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='37'",
        "versionName='0.37'", "application-label:'Warzone Towers'", 'application-debuggable')), 'App identity/version changed')
    xml = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(args.apk), '--file', 'AndroidManifest.xml'], text=True, encoding='utf-8')
    require('com.google.android.gms.ads.APPLICATION_ID' in xml and APP_ID in xml and SAMPLE_APP_ID not in xml,
            'Publisher consent app identity changed')
    java = Path(os.environ.get('JAVA_HOME', 'C:/Program Files/Android/Android Studio/jbr')) / 'bin/java.exe'
    signer = sdk / 'build-tools/36.1.0/lib/apksigner.jar'
    def certificate(path):
        result = subprocess.check_output([str(java), '-jar', str(signer), 'verify', '--verbose', '--print-certs', str(path)], text=True, encoding='utf-8')
        require('Verified using v2 scheme (APK Signature Scheme v2): true' in result, 'APK v2 signature invalid')
        match = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)', result)
        require(match is not None, 'APK signing certificate missing')
        return match[1].lower()
    signing_sha = certificate(args.apk)
    require(signing_sha == certificate(baseline), 'Update signing identity changed')
    return {'version': '0.37', 'versionCode': 37, 'candidateAPK_SHA256': candidate,
        'scope': 'Six square unit controls in three columns and two rows, retaining original footer and outer width.',
        'emulatorUsed': True, 'gameplayVerified': False, 'testAdsOnly': True, 'liveAdsTested': False,
        'emulatorProof': {'path': emulator_name, 'sha256': args.expected_emulator_report_sha256},
        'focusedEmulatorChecks': checks, 'focusedObservations': proof['focusedObservations'],
        'emulatorEvidenceFiles': evidence, 'supportingObservations': supporting,
        'smallPhoneConfigurations': configurations, 'sourceCheckReports': [reviewed],
        'changedAPKAssets': sorted(changed_assets), 'changedAPKMembers': changed, 'removedAPKMembers': sorted(removed),
        'sourcePreservation': preservation, 'nativeAssetSHA256': native_hashes,
        'nativeEngineAndDataByteIdenticalTo036': True, 'bundledMusicByteIdenticalTo036': True,
        'mapsDuelScenarioCatalogsUnchanged': True, 'walletSaveCodecAndAdsControllerUnchanged': True,
        'signing': {'sameCertificateAs036': True, 'certificateSHA256': signing_sha},
        'fallbackRecord': {'path': FALLBACK, 'sha256': digest(ROOT / FALLBACK)},
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
    require(required <= {n for n, _ in files}, 'Required complete source missing: ' + str(sorted(required - {n for n, _ in files})))
    require(not any(n.endswith(('.apk', '-source.zip', '-data.tar')) for n, _ in files), 'Delivery/emulator archives must stay outside source ZIP')
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, required=True)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--source-report', type=Path, default=ROOT / SOURCE_REPORT)
    parser.add_argument('--emulator-report', '--emulator-proof', dest='emulator_report', type=Path, required=True)
    parser.add_argument('--expected-emulator-report-sha256', '--expected-emulator-proof-sha256', dest='expected_emulator_report_sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery output must be outside source tree')
    outputs = [args.output / n for n in ('Warzone-Towers-0.37-Test-Ads.apk', 'warzone-towers-0.37-source.zip', 'Warzone-Towers-0.37-Test-Ads-SHA256.txt')]
    apk_out, source_out, checksums = outputs; partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in outputs + [partial]), 'Frozen delivery/partial must not be overwritten')
    record = validate(args)
    required = NATIVE_REQUIRED | set(record['sourcePreservation']['protectedSourcePaths']) | {'tools/package-24-home.py', 'tools/package-37-square-controls.py',
        'tools/check-square-controls-037.py', RECORD, FALLBACK, DOC, MANIFEST, 'README.md', 'AGENTS.md', record['emulatorProof']['path']}
    for entry in record['sourceCheckReports'] + record['emulatorEvidenceFiles'] + record['supportingObservations']:
        required.add(entry['path'])
    files = source_inventory(required)
    if args.validate_only:
        print(json.dumps({'validationPassed': True, 'deliveryFilesWritten': False,
            'candidateAPK_SHA256': record['candidateAPK_SHA256'], 'focusedChecks': len(record['focusedEmulatorChecks']),
            'sourceFiles': len(files), 'nativeEngineMapsMusicAndPolicyFrozen': True, 'sameSigningCertificateAs036': True}, indent=2))
        return
    write_json(ROOT / RECORD, record)
    entries = [{'path': n, 'bytes': p.stat().st_size, 'sha256': digest(p)} for n, p in files if n != MANIFEST]
    write_json(ROOT / MANIFEST, {'schemaVersion': 1, 'files': entries})
    expected = {entry['path']: entry for entry in entries}
    args.output.mkdir(parents=True, exist_ok=True)
    with ZipFile(partial, 'w', ZIP_DEFLATED, compresslevel=3) as archive:
        for name, path in files:
            archive.write(path, name, compress_type=ZIP_STORED if path.suffix.lower() in STORED else ZIP_DEFLATED)
    require(partial.stat().st_size < 2 * 1024 ** 3, 'Complete source exceeds the 2 GiB GitHub release-file limit')
    with ZipFile(partial) as archive:
        require(len(archive.namelist()) == len(files), 'Source archive count differs')
        require(archive.getinfo(NATIVE_SOURCE).file_size > 100 * 1024 * 1024, 'Complete native source missing/LFS pointer')
        require(archive.getinfo('app/src/main/' + MUSIC_ASSET).file_size == MUSIC_BYTES, 'Bundled music missing/LFS pointer')
        for name, path in files:
            actual = zip_digest(archive, name)
            require(actual == digest(path) and (name not in expected or actual == expected[name]['sha256']), 'Source changed while packaging: ' + name)
    require(digest(args.apk) == record['candidateAPK_SHA256'] and digest(args.emulator_report) == args.expected_emulator_report_sha256,
            'APK or emulator proof changed during packaging')
    for entry in record['sourceCheckReports'] + record['emulatorEvidenceFiles'] + record['supportingObservations']:
        require(digest(ROOT / entry['path']) == entry['sha256'], 'Source/evidence changed during packaging')
    shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == record['candidateAPK_SHA256'], 'Delivery APK differs from the exact checked candidate')
    partial.rename(source_out); source_sha = digest(source_out)
    with checksums.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(f'{record["candidateAPK_SHA256"]}  {apk_out.name}\n{source_sha}  {source_out.name}\n')
    print(json.dumps({'packageIntegrityPassed': True, 'emulatorUsed': True, 'gameplayVerified': False,
        'testAdsOnly': True, 'liveAdsTested': False, 'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size,
        'candidateAPK_SHA256': record['candidateAPK_SHA256'], 'source': str(source_out),
        'sourceBytes': source_out.stat().st_size, 'sourceZIP_SHA256': source_sha, 'sourceFiles': len(files),
        'sourceWithin2GiB': True, 'checksums': str(checksums), 'streamedEverySourceEntryCRCAndSHA': True}, indent=2))


if __name__ == '__main__':
    main()
