"""Package the exact emulator-checked v0.69 APK and complete portable source.

No build, device action, lobby interaction or Git mutation is performed here.
Unchanged v0.68 source ZIP members retain their original compressed bytes.
The verification JSON records the observed scope and limitations; packaging
never substitutes an archive/build check for a successful gameplay check.
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
HELPERS = runpy.run_path(str(ROOT / 'tools/package-launcher-059.py'), run_name='multiplayer069_helpers')
H, C = HELPERS['H'], HELPERS['C']
digest, zip_digest, require = (C[name] for name in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
FALLBACK = 'archive/fallback-0.69.json'
RECORD = 'archive/release-0.69-multiplayer.json'
BASELINE_APK_SHA = '606ebcf7a86527a619c93572a749625bf5b081ad45028c9905c5be8135332a9b'
BASELINE_SOURCE_SHA = '65d27bb7ca2ec9ab428a16b6e3c3373537f2c1edf397562185ad2816654976ff'
GRADLE = 'app/build.gradle.kts'
ASSETS = 'app/src/main/assets/'
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
APP_CHANGES = {GRADLE, 'app/src/main/AndroidManifest.xml'} | {JAVA + name for name in
    ('MainActivity.java', 'GraphicsSetupView.java', 'HomeModesView.java')}
DOCUMENTATION = {'AGENTS.md', 'README.md'}
MP_ASSETS = ASSETS + 'multiplayer/'
MP_ACTIVITY = JAVA + 'MultiplayerActivity.java'
BUILD_CONFIG = H['BUILD_CONFIG']


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def repository_path(value):
    path = Path(value)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), 'Missing/outside repository evidence: ' + str(value))
    return path


def pin(path):
    return dict(path=path.relative_to(ROOT).as_posix(), bytes=path.stat().st_size, sha256=digest(path))


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    require(saved.get('version') == '0.69' and saved.get('preserved') is True, 'Wrong/unpreserved fallback record')
    paths = []
    for kind, expected in (('apk', BASELINE_APK_SHA), ('source', BASELINE_SOURCE_SHA)):
        row = saved[kind]
        path = Path(row.get('path', ROOT.parent / row['file'])).resolve()
        require(path.is_file() and row['sha256'] == expected and digest(path) == expected,
            'Immutable v0.68 fallback changed: ' + str(path))
        paths.append(path)
    return paths


def validate_verification(path, build_log, expected):
    proof = read_json(path)
    require(str(proof.get('version')) == '0.69' and proof.get('candidateAPK_SHA256') == expected,
        'Verification must name this exact v0.69 APK hash')
    require(proof.get('emulatorUsed') is True and proof.get('passed') is True,
        'A passed exact-APK emulator verification record is required')
    require(proof.get('verificationScope') and isinstance(proof.get('limitations'), list),
        'Verification must state its observed scope and limitations')
    log = build_log.read_text(encoding='utf-8-sig', errors='replace')
    require('BUILD SUCCESSFUL' in log, 'Successful Gradle build log required')
    if 'buildLog' in proof:
        row = proof['buildLog']
        require(row.get('sha256') == digest(build_log), 'Verification build log hash mismatch')
    # Optional source pins are checked when the QA collector supplies them.
    for row in proof.get('sources', []):
        source = repository_path(row['path'])
        require(digest(source) == row['sha256'], 'Tested source changed: ' + row['path'])
    return dict(evidence=pin(path), buildLog=pin(build_log), emulatorUsed=True,
        verificationScope=proof['verificationScope'], limitations=proof['limitations'])


def source_inventory(required, evidence):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    names = set(filter(None, raw.decode().split('\0'))) | required | evidence | {MANIFEST, RECORD, FALLBACK}
    names.update(path.relative_to(ROOT).as_posix() for path in (ROOT / 'vendor/multiplayer').rglob('*') if path.is_file())
    files = {}
    for name in sorted(names):
        rel = Path(name)
        if name.startswith('qa/') and name not in required | evidence:
            continue
        if any(part in C['SKIP'] for part in rel.parts) or name in C['TRANSIENT'] or rel.suffix in {'.partial', '.tmp'}:
            require(name not in required | evidence, 'Required source member would be omitted: ' + name)
            continue
        require(rel.suffix.lower() not in C['PRIVATE_SUFFIXES'] and not rel.name.startswith('.env')
            and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local source: ' + name)
        require(not name.endswith(('.apk', '-source.zip', '-data.tar')), 'External runtime archive in source: ' + name)
        path = ROOT / name
        require(path.resolve().is_relative_to(ROOT) and (path.is_file() or name in {MANIFEST, RECORD}), 'Missing source: ' + name)
        files[name] = path
    require(required <= set(files), 'A v0.68 complete-source member was omitted')
    require(evidence <= set(files), 'Required delivery evidence omitted')
    return files


def validate_source(source, files, evidence):
    with ZipFile(source) as old:
        names = set(old.namelist())
        require(len(names) == len(old.namelist()) == 12176, 'Wrong/duplicate v0.68 source inventory')
        prior = {row['path']: row for row in json.loads(old.read(MANIFEST))['files']}
        require(set(prior) == names - {MANIFEST}, 'Baseline source manifest incomplete')
        gradle = old.read(GRADLE)
        require(gradle.count(b'versionCode = 68') == gradle.count(b'versionName = "0.68"') == 1,
            'Ambiguous baseline version')
        expected = gradle.replace(b'versionCode = 68', b'versionCode = 69').replace(b'versionName = "0.68"', b'versionName = "0.69"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond exact version68-to69 update')
        changed = []
        for name, row in prior.items():
            actual = digest(files[name])
            if actual == row['sha256']:
                continue
            require(name in APP_CHANGES | DOCUMENTATION, 'Unexpected baseline source changed: ' + name)
            changed.append(dict(path=name, beforeSHA256=row['sha256'], sha256=actual))
        additions = set(files) - names
        for name in additions:
            approved = name == MP_ACTIVITY or name.startswith((MP_ASSETS, 'vendor/multiplayer/', 'tools/', 'archive/', 'docs/')) or name in evidence
            require(approved, 'Unexpected source addition: ' + name)
        require(MP_ACTIVITY in additions and any(name.startswith(MP_ASSETS) for name in additions),
            'Multiplayer integration source missing')
        # A complete standalone checkout must contain all pinned engine inputs.
        inputs_path = ROOT / 'vendor/multiplayer/source/source-inputs.json'
        inputs = read_json(inputs_path)
        for row in inputs['files']:
            name = 'vendor/multiplayer/source/' + row['path']
            require(name in files and digest(files[name]) == row['sha256'] and files[name].stat().st_size == row['bytes'],
                'Portable multiplayer input missing/changed: ' + name)
        engine = runpy.run_path(str(ROOT / 'tools/import-multiplayer-069.py'), run_name='multiplayer069_reproduction')
        for name, content in engine['prepare']().items():
            require((ROOT / MP_ASSETS / name).read_bytes() == content, 'Integrated engine differs from portable inputs: ' + name)
    return dict(changedBaselineSources=changed, addedSources=sorted(additions), baselineSourceEntries=len(names),
        everyBaselineSourceEntryRetained=True, otherModesAssetsAndScenarioSourcesFrozen=True,
        portableMultiplayerInputsVerified=True, portableInputsManifest=pin(inputs_path))


def validate_apk(apk, baseline, expected):
    require(apk.is_file() and digest(apk) == expected, 'Candidate APK changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='69'",
        "versionName='0.69'", "application-label:'Warzone Towers'")), 'APK identity/version mismatch')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    config = (ROOT / BUILD_CONFIG).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*69\s*;', config)
        and re.search(r'\bVERSION_NAME\s*=\s*"0\.69"\s*;', config)
        and re.search(r'\bADMOB_TEST_ADS\s*=\s*false\s*;', config)
        and re.search(r'\bADMOB_REWARDED_AD_UNIT_ID\s*=\s*"' + re.escape(HELPERS['LIVE_UNIT']) + r'"\s*;', config),
        'Final delivery BuildConfig must retain version and live phone rewarded ads')
    with ZipFile(apk) as current, ZipFile(baseline) as old:
        names, prior = set(current.namelist()), set(old.namelist())
        require(len(names) == len(current.namelist()) and current.testzip() is None, 'Corrupt/duplicate APK')
        require(prior <= names, 'A baseline APK member was removed')
        source_assets = {path.relative_to(ROOT / ASSETS).as_posix(): path for path in (ROOT / ASSETS).rglob('*') if path.is_file()}
        require({name for name in names if name.startswith('assets/')} == {'assets/' + name for name in source_assets},
            'Unexpected APK asset inventory')
        changed, frozen_native = [], []
        for name in sorted(names):
            if name in prior and zip_digest(current, name) == zip_digest(old, name):
                if re.fullmatch(r'assets/warzone/warzone2100(?:-[^/]+)?\.(?:js|wasm|data)', name):
                    frozen_native.append(name)
                continue
            require(C['metadata'](name) or name.startswith('assets/multiplayer/'), 'Unexpected APK member changed: ' + name)
            changed.append(name)
        for name, path in source_assets.items():
            require(zip_digest(current, 'assets/' + name) == digest(path), 'APK/source asset mismatch: ' + name)
        for name in prior:
            if name.startswith(('assets/', 'lib/')):
                require(zip_digest(current, name) == zip_digest(old, name), 'Existing mode asset/library changed: ' + name)
        music = 'assets/warzone/music/music.data'
        require(current.getinfo(music).compress_type == ZIP_STORED, 'Bundled soundtrack was compressed')
        dex = [current.read(name) for name in names if re.fullmatch(r'classes(?:\d+)?\.dex', name)]
        require(any(HELPERS['LIVE_UNIT'].encode() in value for value in dex)
            and any(HELPERS['SAMPLE_UNIT'].encode() in value for value in dex), 'Reward unit/emulator fallback missing')
        # Detect oversized stale ZIP gaps after adding another engine payload.
        ordered = sorted(current.infolist(), key=lambda item: item.header_offset)
        gaps = [ordered[0].header_offset]
        for index, info in enumerate(ordered):
            local_end = info.header_offset + 30 + len(info.filename.encode('utf-8')) + len(info.extra) + info.compress_size
            next_start = ordered[index + 1].header_offset if index + 1 < len(ordered) else current.start_dir
            gaps.append(max(0, next_start - local_end))
        require(max(gaps) < 2 * 1024 * 1024, 'Large unused APK gap; clean build required')
    return dict(certificateSHA256=signing, changedAPKMembers=changed, everyBaselineAPKMemberRetained=True,
        allAPKAssetsMatchSource=True, frozenExistingNativeAssets=sorted(frozen_native),
        allBaselineAssetsAndNativeLibrariesFrozen=True, bundledMusicFrozen=True,
        livePhoneAdsAndEmulatorFallbackRetained=True, maximumAPKZipGapBytes=max(gaps),
        generatedBuildConfigSHA256=digest(ROOT / BUILD_CONFIG))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--verification', required=True, help='Repository JSON with exact APK hash, observed scope and limitations')
    parser.add_argument('--build-log', required=True, help='Repository log of the successful Gradle build')
    parser.add_argument('--evidence', action='append', default=[], help='Additional repository evidence path to retain; repeatable')
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    expected = args.expected_sha256.lower()
    require(re.fullmatch('[0-9a-f]{64}', expected), 'Invalid expected APK SHA256')
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery outputs must stay outside repository')
    verification_path, log_path = repository_path(args.verification), repository_path(args.build_log)
    evidence = {repository_path(value).relative_to(ROOT).as_posix() for value in args.evidence}
    evidence |= {verification_path.relative_to(ROOT).as_posix(), log_path.relative_to(ROOT).as_posix()}
    baseline, source = baseline_paths()
    verification = validate_verification(verification_path, log_path, expected)
    with ZipFile(source) as old:
        required = set(old.namelist())
    files = source_inventory(required, evidence)
    preservation = validate_source(source, files, evidence)
    apk_record = validate_apk(args.apk, baseline, expected)
    require(digest(args.apk) == expected, 'Candidate APK changed during validation')
    if args.validate_only:
        print(json.dumps(dict(packageValidationPassed=True, deliveryWritten=False, sourceFiles=len(files),
            exactAPKVerification=verification, **preservation, **apk_record), indent=2))
        return
    apk_out, source_out, checksum = (args.output / name for name in
        ('Warzone-Towers-0.69.apk', 'warzone-towers-0.69-source.zip', 'Warzone-Towers-0.69-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(path.exists() for path in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    record = dict(version='0.69', versionCode=69, candidateAPK_SHA256=expected,
        scope='Add a separate public Multiplayer lobby/engine and touchscreen controls through a compact home entry; preserve existing Towers/Campaign/FFA assets.',
        exactAPKVerification=verification, fallback=dict(path=FALLBACK, sha256=digest(ROOT / FALLBACK)),
        sourcePreservation=preservation, **apk_record, nativeBuildPerformed=False,
        liveAdsTested=False, githubPublished=False, vpsChanged=False, recordedUTC=datetime.now(timezone.utc).isoformat())
    (ROOT / RECORD).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    entries = [dict(path=name, bytes=path.stat().st_size, sha256=digest(path)) for name, path in files.items() if name != MANIFEST]
    (ROOT / MANIFEST).write_text(json.dumps(dict(schemaVersion=1, files=entries), indent=2) + '\n', encoding='utf-8')
    args.output.mkdir(parents=True, exist_ok=True)
    reused = H['write_source_zip'](source, partial, files, entries)
    require(digest(args.apk) == expected, 'Candidate changed while complete source was packaged')
    shutil.copy2(args.apk, apk_out)
    require(digest(apk_out) == expected and digest(args.apk) == expected, 'Delivery APK copy changed')
    with ZipFile(partial) as archive, ZipFile(apk_out) as apk:
        require(required <= set(archive.namelist()), 'Prior complete source member missing from delivery ZIP')
        for name in files:
            if name.startswith(ASSETS):
                require(zip_digest(archive, name) == zip_digest(apk, 'assets/' + name[len(ASSETS):]), 'Source ZIP/APK asset mismatch: ' + name)
    partial.rename(source_out)
    source_sha = digest(source_out)
    require(digest(apk_out) == expected and digest(args.apk) == expected, 'Exact APK changed before delivery completed')
    checksum.write_text(expected + '  ' + apk_out.name + '\n' + source_sha + '  ' + source_out.name + '\n', encoding='utf-8')
    print(json.dumps(dict(packageIntegrityPassed=True, apk=str(apk_out), apkSHA256=expected,
        source=str(source_out), sourceSHA256=source_sha, checksums=str(checksum), sourceFiles=len(files),
        rawCopiedUnchangedZIPMembers=reused, everySourceMemberCRCAndSHAStreamed=True,
        exactTestedAPKCopied=True, exactAPKVerification=verification), indent=2))


if __name__ == '__main__':
    main()
