"""Package 0.28's compact illustrated Rewards with bounded exact-APK evidence.

All native engine/map/music/Duel bytes remain identical to 0.27. Source-only
checks and actual emulator observations are separate, individually hash-bound
inputs. The complete source ZIP streams and verifies every entry before release.
"""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from datetime import datetime, timezone
import argparse
import json
import os
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
COMMON = runpy.run_path(str(ROOT / 'tools/package-24-home.py'), run_name='package_028_helpers')
require, digest, zip_digest = (COMMON[k] for k in ('require', 'digest', 'zip_digest'))
read_json, write_json, repo_path, metadata = (COMMON[k] for k in ('read_json', 'write_json', 'repo_path', 'metadata'))
NATIVE_SOURCE, MANIFEST, STORED, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[k] for k in (
    'NATIVE_SOURCE', 'MANIFEST', 'STORED', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
BASELINE_SHA = '5014b70184f120f0f237f33aef730981793b4dc982f255658290e4505370ad51'
SOURCE_SHA = '629e9ebda7a24afe6f04fa31e6b403446a3a9f8b504209023e073556b50dc6dc'
ASSET_SCOPE = {'assets/warzone-touch-controls.js', 'assets/warzone/rewards.js'}
NEW_ASSET_SCOPE = set()
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
SOURCE_SCOPE = {JAVA + n for n in ('MainActivity.java', 'GraphicsSetupView.java',
                                  'RewardsView.java', 'RewardStore.java', 'RewardLedger.java')}
SOURCE_SCOPE |= {'app/src/main/' + n for n in ASSET_SCOPE | NEW_ASSET_SCOPE}
RECORD = 'archive/release-0.28-focused-tested.json'
FALLBACK = 'archive/fallback-0.28.json'


def verify_native(apk, old):
    paths = ['assets/warzone/warzone2100.' + extension for extension in ('js', 'data', 'wasm')]
    hashes = {name: zip_digest(apk, name) for name in paths}
    require(all(hashes[name] == zip_digest(old, name) for name in paths), 'Native JS/data/WASM changed')
    runtime = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='package_028_native')
    program = apk.read(paths[0]).decode('utf-8')
    data = apk.read(paths[1])
    _, _, _, index = runtime['package_call'](program)
    runtime['verify_index'](index, data)
    catalog = read_json(ROOT / 'app/src/main/assets/warzone/levels/catalog.json')
    require(len(catalog['levels']) == 46 and all(0 < len(level['mapName'].encode('utf-8')) < 20
            for level in catalog['levels']), 'A native map name exceeds saved-game header capacity')
    return {'entireNativeAssetsByteIdentical': True, 'nativeAssetSHA256': hashes,
            'nativeVirtualFilesUnchanged': len(index['files']), 'all46SaveNamesWithinNativeLimit': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--source-report', type=Path, action='append', required=True)
    parser.add_argument('--emulator-proof', type=Path, required=True)
    parser.add_argument('--expected-emulator-proof-sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery output must be outside source tree')
    candidate = digest(args.apk)
    require(candidate == args.expected_sha256, 'Candidate APK hash differs')
    emulator_name = repo_path(args.emulator_proof)
    require(digest(args.emulator_proof) == args.expected_emulator_proof_sha256, 'Emulator proof hash differs')
    emulator = read_json(args.emulator_proof)
    require(emulator.get('candidateAPK_SHA256') == candidate and emulator.get('emulatorUsed') is True,
            'Focused emulator proof must bind the exact delivery APK')
    require(emulator.get('gameplayVerified') is False, 'Focused checks must not claim complete gameplay verification')
    checks = emulator.get('checks', [])
    require(isinstance(checks, list) and checks and all(check.get('name') and check.get('passed') is True
            for check in checks), 'Focused emulator observations must name only checks actually passed')
    evidence = emulator.get('evidenceFiles', [])
    require(isinstance(evidence, list) and evidence, 'Focused evidence inventory missing')
    supporting = emulator.get('supportingObservations', [])
    require(isinstance(supporting, list), 'Supplemental observation inventory must be a list')
    for entry in evidence + supporting:
        path = ROOT / entry['path']; repo_path(path)
        require(path.is_file() and digest(path) == entry['sha256'], 'Emulator evidence changed: ' + entry['path'])
    saved = read_json(ROOT / FALLBACK)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'],
                'Frozen 0.27 fallback changed: ' + str(path))
    baseline = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.27.apk')
    old_source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.27-source.zip')
    require(digest(baseline) == BASELINE_SHA and digest(old_source) == SOURCE_SHA, 'Wrong 0.27 baseline')
    reports = []
    for path in args.source_report:
        name = repo_path(path)
        report = read_json(path)
        require(report.get('emulatorUsed') is False, 'Source report must explicitly exclude emulator use')
        for entry in report.get('sources', []):
            source = ROOT / entry['path']; repo_path(source)
            require(source.is_file() and digest(source) == entry['sha256'], 'Reviewed source changed: ' + entry['path'])
        reports.append({'path': name, 'sha256': digest(path)})
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'AppData/Local/Android/Sdk')))
    aapt = sdk / 'build-tools/36.1.0/aapt2.exe'
    with ZipFile(args.apk) as apk, ZipFile(baseline) as old:
        require(apk.testzip() is None, 'Built APK CRC failure')
        names, old_names = set(apk.namelist()), set(old.namelist())
        require(len(names) == len(apk.namelist()), 'Duplicate APK entry')
        removed, added = old_names - names, names - old_names
        require(all(metadata(name) for name in removed), 'Unexpected removed APK member')
        added_assets = {name for name in added if name.startswith('assets/')}
        require(added_assets == NEW_ASSET_SCOPE, 'New APK asset inventory differs')
        changed = [name for name in apk.namelist() if name not in old_names or zip_digest(old, name) != zip_digest(apk, name)]
        changed_assets = {name for name in changed if name.startswith('assets/') and name in old_names}
        require(changed_assets == ASSET_SCOPE, 'APK asset changes differ from the two reviewed save/Rewards/version scripts')
        require(all(name in ASSET_SCOPE | NEW_ASSET_SCOPE or metadata(name) for name in changed),
                'APK changed outside authorized scope')
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in names and digest(path) == zip_digest(apk, name), 'Stale/missing APK source asset: ' + name)
        frozen_assets = {name: zip_digest(old, name) for name in old_names if name.startswith('assets/') and name not in changed_assets}
        require(all(zip_digest(apk, name) == value for name, value in frozen_assets.items()), 'Protected asset changed')
        native = verify_native(apk, old)
    with ZipFile(old_source) as source:
        source_names = set(source.namelist())
        gradle_name = 'app/build.gradle.kts'
        expected_gradle = source.read(gradle_name).replace(b'versionCode = 27', b'versionCode = 28').replace(b'versionName = "0.27"', b'versionName = "0.28"')
        require((ROOT / gradle_name).read_bytes() == expected_gradle, 'App build settings changed beyond the version bump')
        protected = [name for name in source_names if not name.endswith('/') and (
            name.startswith(('vendor/', 'map/', 'scenario/')) or name == NATIVE_SOURCE or
            (name.startswith('app/src/main/') and name not in SOURCE_SCOPE))]
        for name in protected:
            path = ROOT / name
            require(path.is_file() and digest(path) == zip_digest(source, name), 'Frozen source changed: ' + name)
        new_app_source = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src/main').rglob('*') if p.is_file()} - source_names
        require(new_app_source <= SOURCE_SCOPE, 'Unexpected app source additions: ' + str(new_app_source))
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    require(all(text in badging for text in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='28'",
            "versionName='0.28'", "application-label:'Warzone Towers'")), 'Wrong package/version/label')
    java = Path(os.environ.get('JAVA_HOME', 'C:/Program Files/Android/Android Studio/jbr')) / 'bin/java.exe'
    signer = sdk / 'build-tools/36.1.0/lib/apksigner.jar'
    signature = subprocess.check_output([str(java), '-jar', str(signer), 'verify', '--verbose', str(args.apk)],
                                       text=True, encoding='utf-8')
    require('Verified using v2 scheme (APK Signature Scheme v2): true' in signature, 'APK v2 signature did not verify')
    apk_out, source_out, checksums = [args.output / name for name in ('Warzone-Towers-0.28.apk',
                                      'warzone-towers-0.28-source.zip', 'Warzone-Towers-0.28-SHA256.txt')]
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksums, partial)), 'Existing delivery/partial must not be overwritten')
    write_json(ROOT / RECORD, {'version': '0.28', 'versionCode': 28, 'candidateAPK_SHA256': candidate,
        'scope': 'Option1 native illustrated Rewards on Home/in-game, version clarity and focused save/purchase verification.',
        'emulatorUsed': True, 'gameplayVerified': False,
        'verification': 'Source checks, Android build/signature/archive integrity and only the observations in the hash-bound emulator report.',
        'emulatorProof': {'path': emulator_name, 'sha256': args.expected_emulator_proof_sha256},
        'focusedEmulatorChecks': checks, 'emulatorEvidenceFiles': evidence,
        'supportingObservations': supporting,
        'changedAPKAssets': sorted(changed_assets), 'newAPKAssets': sorted(added_assets),
        'changedAPKMembers': changed, 'removedAPKMembers': sorted(removed),
        'nativePreservation': native, 'mapsMusicDuelNativeByteIdentical': True,
        'preservedOriginalSourceFiles': len(protected), 'preservedAPKAssets': len(frozen_assets),
        'sourceCheckReports': reports, 'fallbackRecord': {'path': FALLBACK, 'sha256': digest(ROOT / FALLBACK)},
        'sourceInventory': 'git ls-files --cached --others --exclude-standard; filtered caches/private/transient files',
        'gitMetadataIncluded': False, 'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')})
    required = {NATIVE_SOURCE, 'tools/package-24-home.py', 'tools/package-28-rewards.py',
                'tools/integrate-native-runtime.py', RECORD, FALLBACK, 'README.md', 'AGENTS.md',
                'docs/releases/0.28-rewards.md', 'docs/ui-0.28/1-rewards-drawer.png',
                'docs/ui-0.28/mockup.json', emulator_name}
    required.update(report['path'] for report in reports)
    required.update(entry['path'] for entry in evidence)
    required.update(entry['path'] for entry in supporting)
    names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode('utf-8').split('\0')
    tracked = set(filter(None, subprocess.check_output(['git', 'ls-files', '--cached', '-z'], cwd=ROOT).decode('utf-8').split('\0')))
    files = []
    for name in sorted(set(filter(None, names)) | {RECORD, MANIFEST}):
        rel = Path(name)
        if any(part in SKIP for part in rel.parts) or name in TRANSIENT or rel.suffix in {'.partial', '.tmp'}: continue
        require(rel.suffix.lower() not in PRIVATE_SUFFIXES and not rel.name.startswith('.env')
                and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local source entry: ' + name)
        path = ROOT / rel; repo_path(path)
        if path.is_file():
            require(name in tracked or path.stat().st_size <= 128 * 1024 * 1024, 'Unexpected large untracked source/cache: ' + name)
            files.append((name, path))
    require(required <= {name for name, _ in files}, 'Required complete source missing: ' + str(sorted(required - {name for name, _ in files})))
    entries = [{'path': name, 'bytes': path.stat().st_size, 'sha256': digest(path)} for name, path in files if name != MANIFEST]
    write_json(ROOT / MANIFEST, {'schemaVersion': 1, 'files': entries})
    expected = {entry['path']: entry for entry in entries}
    args.output.mkdir(parents=True, exist_ok=True)
    with ZipFile(partial, 'w', ZIP_DEFLATED, compresslevel=3) as archive:
        for name, path in files:
            archive.write(path, name, compress_type=ZIP_STORED if path.suffix.lower() in STORED else ZIP_DEFLATED)
    with ZipFile(partial) as archive:
        require(len(archive.namelist()) == len(files), 'Source archive entry count differs')
        require(archive.getinfo(NATIVE_SOURCE).file_size > 100 * 1024 * 1024, 'Complete native source missing/LFS pointer')
        for name, path in files:
            actual = zip_digest(archive, name)
            require(actual == digest(path) and (name not in expected or actual == expected[name]['sha256']), 'Source archive differs: ' + name)
    require(digest(args.apk) == candidate and digest(args.emulator_proof) == args.expected_emulator_proof_sha256,
            'Candidate/emulator proof changed during packaging')
    for report in reports: require(digest(ROOT / report['path']) == report['sha256'], 'Source report changed during packaging')
    for entry in evidence + supporting: require(digest(ROOT / entry['path']) == entry['sha256'], 'Emulator evidence changed during packaging')
    shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == candidate, 'Delivery APK differs from reviewed build')
    partial.rename(source_out)
    source_sha = digest(source_out)
    checksums.write_text(f'{candidate}  {apk_out.name}\n{source_sha}  {source_out.name}\n', encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed': True, 'emulatorUsed': True, 'gameplayVerified': False,
           'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size, 'candidateAPK_SHA256': candidate,
           'source': str(source_out), 'sourceBytes': source_out.stat().st_size, 'sourceZIP_SHA256': source_sha,
           'sourceFiles': len(files), 'checksums': str(checksums), 'streamedEverySourceEntryCRCAndSHA': True}, indent=2))


if __name__ == '__main__': main()
