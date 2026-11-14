"""Package only the exact checked v0.54 Campaign overlays delivery.

This is a packaging gate, never an emulator runner or native/bootstrap builder.
Unchanged complete-source ZIP members reuse their preserved compressed bytes.
"""
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
import argparse
import json
import re
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CAMPAIGN = runpy.run_path(str(ROOT / 'tools/package-campaign-051.py'), run_name='campaign054_package_helpers')
H, C = CAMPAIGN['H'], CAMPAIGN['C']
digest, zip_digest, require = (C[key] for key in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
FALLBACK = 'archive/fallback-0.54.json'
EMULATOR = 'archive/campaign-0.54-emulator-checks.json'
RECORD = 'archive/release-0.54-campaign-overlays.json'
GRADLE = 'app/build.gradle.kts'
ASSETS = 'app/src/main/assets/'
BASELINE_APK_SHA = 'addecad6d7229b921f9f311ea08fe35890e9dec5b64ad1d21342f33e3079e7d1'
BASELINE_SOURCE_SHA = '9cf904ebded4d1b5a9bf880e307b9e9db2db00d34d76c6b7342a9c67195ccec5'
APP_CHANGES = {ASSETS + name for name in ('warzone-intelligence.js', 'warzone-campaign-hud.js',
    'warzone/ui/lab-ui.js', 'warzone/ui/build-display.js')} | {
    'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'}
APP_ADDITIONS = set()
APP_SCOPE = {name for name in APP_CHANGES if name.startswith(ASSETS)}
DOCUMENTATION = {'AGENTS.md', 'README.md', 'design-qa.md', 'docs/KNOWN-ISSUES.md'}


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def repository_path(value):
    path = Path(str(value).replace('\\', '/'))
    path = (path if path.is_absolute() else ROOT / path).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), 'Missing/outside repository file: ' + str(value))
    return path


def pinned_rows(rows, label):
    require(isinstance(rows, list) and rows, 'Missing pinned ' + label)
    names = set()
    for row in rows:
        path = repository_path(row['path'])
        name = path.relative_to(ROOT).as_posix()
        require(name not in names and row['sha256'] == digest(path), label + ' changed/duplicated: ' + name)
        if 'bytes' in row:
            require(row['bytes'] == path.stat().st_size, label + ' size changed: ' + name)
        names.add(name)
    return names


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    require(saved.get('version') == '0.54' and saved.get('baseline') == '0.53', 'Wrong fallback record')
    for row in saved['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'],
            'Immutable v0.53 fallback changed: ' + str(path))
    apk = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.apk'))
    source = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.zip'))
    require(digest(apk) == BASELINE_APK_SHA and digest(source) == BASELINE_SOURCE_SHA, 'Wrong v0.53 baseline bytes')
    return apk, source


def validate_emulator(expected_sha):
    proof = read_json(ROOT / EMULATOR)
    require(proof.get('version') == '0.54' and proof.get('passed') is True
        and proof.get('emulatorUsed') is True and proof.get('actualNativeEngineExecuted') is True
        and proof.get('candidateAPK_SHA256') == expected_sha,
        'Passed exact delivery-APK emulator proof is required')
    sources = pinned_rows(proof.get('sources'), 'emulator source')
    evidence = pinned_rows(proof.get('evidence'), 'emulator evidence')
    require(all(not name.startswith('qa/') for name in evidence), 'Curated emulator evidence must be retained outside disposable QA')
    return proof, sources, evidence


def validate_native_assets(baseline):
    """Whole-file equality; no loader metadata, VFS append or native build."""
    frozen = []
    with ZipFile(baseline) as old:
        for name in old.namelist():
            if not re.fullmatch(r'assets/warzone/warzone2100(?:-[^/]+)?\.(?:js|wasm|data)', name):
                continue
            current = ROOT / 'app/src/main' / name
            require(current.is_file() and digest(current) == zip_digest(old, name),
                'Frozen native engine/loader/data changed: ' + name)
            frozen.append(name)
    require(any(name.endswith('warzone2100-campaign.js') for name in frozen)
        and any(name.endswith('warzone2100-campaign.data') for name in frozen)
        and any(name.endswith('warzone2100.wasm') for name in frozen), 'Native freeze inventory incomplete')
    return dict(wholeNativeFilesByteUnchanged=True, noVFSAppend=True, noNativeBuild=True,
        frozenNativeAssets=frozen)


def source_inventory(required, evidence):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    names = set(filter(None, raw.decode().split('\0'))) | required | evidence | APP_ADDITIONS | {MANIFEST, RECORD, EMULATOR, FALLBACK}
    files = {}
    for name in sorted(names):
        rel = Path(name)
        if name.startswith('qa/') and name not in required:
            require(name not in required, 'Prior complete source unexpectedly contains disposable QA: ' + name)
            continue
        if any(part in C['SKIP'] for part in rel.parts) or name in C['TRANSIENT'] or rel.suffix in {'.partial', '.tmp'}:
            require(name not in required, 'Prior source entry would be omitted: ' + name)
            continue
        require(rel.suffix.lower() not in C['PRIVATE_SUFFIXES'] and not rel.name.startswith('.env')
            and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local source: ' + name)
        require(not name.endswith(('.apk', '-source.zip', '-data.tar')), 'External runtime archive in source: ' + name)
        path = ROOT / name
        require(path.resolve().is_relative_to(ROOT) and (path.is_file() or name in {MANIFEST, RECORD}), 'Missing source: ' + name)
        files[name] = path
    require(required <= set(files), 'A prior complete-source entry was omitted')
    return files


def validate_source(source, files, checked_sources):
    with ZipFile(source) as old:
        names = set(old.namelist())
        require(len(names) == len(old.namelist()), 'Duplicate baseline source entry')
        prior = {row['path']: row for row in json.loads(old.read(MANIFEST))['files']}
        require(set(prior) == names - {MANIFEST}, 'Baseline complete-source manifest incomplete')
        expected_gradle = old.read(GRADLE).replace(b'versionCode = 53', b'versionCode = 54').replace(
            b'versionName = "0.53"', b'versionName = "0.54"')
        require(files[GRADLE].read_bytes() == expected_gradle, 'Gradle changed beyond version54')
        changed = []
        for name, row in prior.items():
            actual = digest(files[name])
            if actual == row['sha256']:
                continue
            if name.startswith('app/'):
                require(name in APP_CHANGES | {GRADLE}, 'Unexpected app/Campaign/Duel source change: ' + name)
            elif name.startswith('scenario/'):
                require(False, 'Towers/Duel scenario changed: ' + name)
            elif name.startswith('campaign/'):
                require(False, 'Original Campaign source/bridge changed: ' + name)
            else:
                require(name in DOCUMENTATION or name.startswith(('tools/', 'archive/')),
                    'Unrelated source changed: ' + name)
            changed.append(dict(path=name, beforeSHA256=row['sha256'], sha256=actual))
        additions = {name for name in files if name.startswith('app/') and name not in prior}
        require(additions == APP_ADDITIONS, 'Unexpected new app files: ' + str(sorted(additions)))
        require(not any(name.startswith('campaign/') and name not in prior for name in files), 'Campaign source added')
        require(not any(name.startswith('scenario/') and name not in prior for name in files), 'Scenario source added')
        delivery_changes = {row['path'] for row in changed if row['path'].startswith(('app/', 'scenario/', 'campaign/'))} | APP_ADDITIONS
        require(delivery_changes <= checked_sources, 'Changed delivery source was not pinned by emulator proof: ' + str(sorted(delivery_changes - checked_sources)))
    return dict(changedBaselineSources=changed, baselineSourceEntries=len(names), addedAppSources=sorted(additions),
        everyBaselineSourceEntryRetained=True, allUnapprovedAppSourcesFrozen=True,
        scenarioSourcesFrozen=True, originalCampaignAndBridgeSourcesFrozen=True)


def validate_apk(apk, baseline, expected_sha):
    require(apk.is_file() and digest(apk) == expected_sha, 'Candidate APK changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='54'",
        "versionName='0.54'", "application-label:'Warzone Towers'")), 'APK identity/version mismatch')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    with ZipFile(apk) as current, ZipFile(baseline) as old:
        names, prior = set(current.namelist()), set(old.namelist())
        require(len(names) == len(current.namelist()) and current.testzip() is None, 'Corrupt or duplicate APK archive')
        require(prior <= names, 'A prior APK member was removed')
        asset_additions = {name.removeprefix('app/src/main/') for name in APP_ADDITIONS}
        require({name for name in names if name.startswith('assets/')} == {name for name in prior if name.startswith('assets/')} | asset_additions,
            'APK asset inventory changed beyond approved overlays')
        changed = []
        for name in sorted(names):
            if name in prior and zip_digest(current, name) == zip_digest(old, name):
                continue
            require(name.startswith('assets/') and 'app/src/main/' + name in APP_SCOPE or C['metadata'](name),
                'Unexpected APK member change: ' + name)
            changed.append(name)
        for path in (ROOT / ASSETS).rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / ASSETS).as_posix()
                require(name in names and zip_digest(current, name) == digest(path), 'APK/source asset mismatch: ' + name)
        for name in prior:
            if re.fullmatch(r'assets/warzone/warzone2100(?:-[^/]+)?\.(?:js|wasm|data)', name):
                require(zip_digest(current, name) == zip_digest(old, name),
                    'Frozen engine/loader/data asset changed: ' + name)
        music = 'assets/warzone/music/music.data'
        require(current.getinfo(music).compress_type == ZIP_STORED and zip_digest(current, music) == zip_digest(old, music),
            'Bundled soundtrack changed or compressed')
    return dict(certificateSHA256=signing, changedAPKMembers=changed, allAPKAssetsMatchSource=True,
        everyBaselineAPKMemberRetained=True, nativeCampaignTowersAndDuelRuntimeFrozen=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    expected = args.expected_sha256.lower()
    require(re.fullmatch('[0-9a-f]{64}', expected), 'Invalid expected APK SHA256')
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery outputs must stay outside the repository')
    baseline, source = baseline_paths()
    proof, checked_sources, evidence = validate_emulator(expected)
    native = validate_native_assets(baseline)
    with ZipFile(source) as old:
        required = set(old.namelist())
    files = source_inventory(required, evidence)
    preservation = validate_source(source, files, checked_sources)
    apk_record = validate_apk(args.apk, baseline, expected)
    require(digest(args.apk) == expected, 'Candidate APK changed during validation')
    if args.validate_only:
        print(json.dumps(dict(packageValidationPassed=True, deliveryWritten=False, sourceFiles=len(files),
            **preservation, **apk_record, nativePreservation=native), indent=2))
        return
    apk_out, source_out, checksum = (args.output / name for name in ('Warzone-Towers-0.54.apk',
        'warzone-towers-0.54-source.zip', 'Warzone-Towers-0.54-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(path.exists() for path in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    record = dict(version='0.54', versionCode=54, candidateAPK_SHA256=expected,
        scope='Campaign research Intelligence and construction overlay corrections, plus removal of the footer collapse control from Campaign and Towers; Duel retains collapse behavior.',
        emulatorUsed=True, exactAPKVerified=True, githubPublished=False, vpsChanged=False,
        fallback=dict(path=FALLBACK, sha256=digest(ROOT / FALLBACK)), verification=proof,
        sourcePreservation=preservation, nativePreservation=native, **apk_record,
        recordedUTC=datetime.now(timezone.utc).isoformat())
    (ROOT / RECORD).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    entries = [dict(path=name, bytes=path.stat().st_size, sha256=digest(path)) for name, path in files.items() if name != MANIFEST]
    (ROOT / MANIFEST).write_text(json.dumps(dict(schemaVersion=1, files=entries), indent=2) + '\n', encoding='utf-8')
    args.output.mkdir(parents=True, exist_ok=True)
    reused = H['write_source_zip'](source, partial, files, entries)
    require(digest(args.apk) == expected, 'Candidate changed while complete source was packaged')
    shutil.copy2(args.apk, apk_out)
    require(digest(apk_out) == expected and digest(args.apk) == expected, 'Delivery/candidate APK changed during copy')
    with ZipFile(partial) as archive, ZipFile(apk_out) as apk:
        require(required <= set(archive.namelist()), 'Complete prior source missing from output ZIP')
        for name in files:
            if name.startswith(ASSETS):
                require(zip_digest(archive, name) == zip_digest(apk, 'assets/' + name[len(ASSETS):]), 'Source ZIP/APK asset mismatch: ' + name)
    partial.rename(source_out)
    apk_sha, source_sha = digest(apk_out), digest(source_out)
    require(apk_sha == expected and digest(args.apk) == expected, 'Exact APK changed before delivery completed')
    checksum.write_text(apk_sha + '  ' + apk_out.name + '\n' + source_sha + '  ' + source_out.name + '\n', encoding='utf-8')
    require(digest(apk_out) == expected and digest(args.apk) == expected and digest(source_out) == source_sha,
        'Delivery output changed before final checksum verification')
    print(json.dumps(dict(packageIntegrityPassed=True, apk=str(apk_out), apkSHA256=apk_sha,
        source=str(source_out), sourceSHA256=source_sha, checksums=str(checksum), sourceFiles=len(files),
        rawCopiedUnchangedZIPMembers=reused, everySourceMemberCRCAndSHAStreamed=True,
        exactCheckedAPKCopied=True, nativeCampaignTowersAndDuelFrozen=True), indent=2))


if __name__ == '__main__':
    main()
