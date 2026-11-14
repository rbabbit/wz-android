"""Package the exact offline-checked v0.75 Hub APK and portable source.

Never build, operate a device or invent runtime evidence. The user requested no
emulator tests. Require actual host/browser Hub evidence and a pinned successful
build, then verify APK identity/signing and byte-identical assets/libraries.
Retain every v0.74 complete-source member and historical proof.
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
PRIOR = runpy.run_path(str(ROOT / 'tools/package-multiplayer-072.py'), run_name='hub075_prior_helpers')
H, C = PRIOR['H'], PRIOR['C']
PREVIOUS = PRIOR['PREVIOUS']
digest, zip_digest, require = (C[name] for name in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
FALLBACK = 'qa/hub-075/fallback-0.75.json'
RECORD = 'archive/release-0.75-hub.json'
TOOL = 'tools/package-hub-075.py'
RECORDER = 'tools/record-hub-075.py'
GRADLE = 'app/build.gradle.kts'
ASSETS = 'app/src/main/assets/'
MP_ASSETS = ASSETS + 'multiplayer/'
NATIVE = 'vendor/multiplayer/native-071/'
MP_ACTIVITY = 'app/src/main/java/com/rbabbit/blocknight/warzone/MultiplayerActivity.java'
BUILD_CONFIG = H['BUILD_CONFIG']
BASELINE_APK_SHA = 'dbbd13e63a1281d17723e7c47881fde22d608701fb43942a0466c7e3ef1f269e'
BASELINE_SOURCE_SHA = '7f89a22d3db8e2387b7699250f6389deaec90a91da967bdf0c9cff21684c5296'
STOCK_DATA_SHA = '9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424'
UPSTREAM = '7d3d8e51a61ceee89e6bf672a41337e1a9cd7392'
DOCUMENTATION = {'AGENTS.md', 'README.md', 'README-WARZONE-TOWERS.md', 'design-qa.md',
    'docs/KNOWN-ISSUES.md', 'vendor/multiplayer/README.md'}
NATIVE_TOOLS = {'tools/' + name for name in ('prepare-multiplayer-native-071.py',
    'build-multiplayer-native-071.py', 'integrate-multiplayer-native-071.py',
    'compose-multiplayer-ui-070.cjs')}
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
ALLOWED_SOURCE_CHANGES = {JAVA + name for name in ('HomeModesView.java', 'HomeMenuLayout.java',
    'GraphicsSetupView.java', 'MainActivity.java')}
OPTIONAL_LAYOUT_CLASSES = {JAVA + 'HubView.java'}
HUB_ASSETS = ASSETS + 'hub/'


def focused_sources():
    names = {path.relative_to(ROOT).as_posix()
        for path in (ROOT / 'tools').glob('test-hub-*-075*') if path.is_file()}
    require(len(names) >= 3, 'Hub data, native and UI focused checks are required')
    return names

NATIVE_PROOFS = {'qa/multiplayer-071/' + name for name in ('native-build.json',
    'native-focused-build.log', 'native-combat-policy-check.json')}
OFFLINE_PROOFS = {'qa/hub-075/hub-checks.json'}
REQUIRED_CHECKS = ('homeHubNavigation', 'dataAndRatings', 'completeHistoryGate', 'cacheAndLifecycle', 'browserHubUi', 'successfulBuild')



def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def repository_path(value):
    path = Path(value)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), 'Missing/outside repository evidence: ' + str(value))
    return path


def pin(path):
    return dict(path=path.relative_to(ROOT).as_posix(), bytes=path.stat().st_size, sha256=digest(path))


def validate_hub_evidence():
    path = repository_path('qa/hub-075/hub-checks.json')
    proof = read_json(path)
    require(proof.get('version') == '0.75' and proof.get('passed') is True
        and proof.get('emulatorUsed') is False and proof.get('actualAndroidViewsExecuted') is False,
        'Current passed host/browser Hub evidence with an explicit offline scope is required')
    checks = proof.get('checks')
    require(isinstance(checks, list) and checks and proof.get('checksPassed') == len(checks)
        and all(isinstance(item, str) and item.strip() for item in checks),
        'Hub evidence must contain its complete passed assertion inventory')
    coverage = proof.get('coverage', {})
    require(all(coverage.get(name) is True for name in REQUIRED_CHECKS if name != 'successfulBuild'),
        'Merged Hub fixture lacks the required actual coverage summary')
    sources = proof.get('sources')
    require(isinstance(sources, list) and sources, 'Hub fixture has no checked source hashes')
    checked = set()
    for row in sources:
        require(isinstance(row, dict) and isinstance(row.get('path'), str), 'Invalid Hub fixture source pin')
        source = repository_path(row['path'])
        name = source.relative_to(ROOT).as_posix()
        require(name not in checked and digest(source) == row.get('sha256'),
            'Duplicate/stale Hub fixture source: ' + name)
        checked.add(name)
    needed = ALLOWED_SOURCE_CHANGES | focused_sources() | {
        name for name in OPTIONAL_LAYOUT_CLASSES if (ROOT / name).exists()} | {
        p.relative_to(ROOT).as_posix() for p in (ROOT / HUB_ASSETS).rglob("*") if p.is_file()}
    require(needed <= checked, 'Hub fixtures do not pin the actual view/helper/tests: '
        + str(sorted(needed - checked)))
    return dict(evidence=pin(path), assertions=len(checks), coverage=coverage,
        checkedSourcePaths=sorted(checked))


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    rows = saved.get('immutableFallbacks', [])
    paths = []
    for suffix, expected in (('.apk', BASELINE_APK_SHA), ('.zip', BASELINE_SOURCE_SHA)):
        matches = [row for row in rows if str(row.get('path', '')).endswith(suffix)]
        require(len(matches) == 1, 'Ambiguous preserved v0.74 fallback: ' + suffix)
        row = matches[0]
        path = Path(row['path']).resolve()
        require(path.is_file() and row.get('sha256') == expected
            and path.stat().st_size == row.get('bytes') and digest(path) == expected,
            'Immutable v0.74 fallback changed: ' + str(path))
        paths.append(path)
    return paths


def validate_verification(path, build_log, expected):
    proof = read_json(path)
    require(str(proof.get('version')) == '0.75' and proof.get('candidateAPK_SHA256') == expected,
        'Offline verification must name this exact v0.75 APK SHA256')
    require(proof.get('passed') is True and proof.get('emulatorUsed') is False
        and proof.get('emulatorOmittedAtUserRequest') is True,
        'v0.75 requires the explicitly requested offline-only verification record')
    require(proof.get('androidGameplayVerified') is False and proof.get('actualAndroidViewsExecuted') is False,
        'Offline verification must not claim Android native rendering or gameplay')
    require(proof.get('offlineHostChecksPassed') is True and proof.get('buildChecksPassed') is True,
        'Offline host/build checks must actually pass')
    require(isinstance(proof.get('verificationScope'), str) and proof['verificationScope'].strip()
        and isinstance(proof.get('limitations'), list) and proof['limitations']
        and all(isinstance(item, str) and item.strip() for item in proof['limitations']),
        'Verification must state offline scope and unverified Android runtime limits')
    checks = proof.get('checks', {})
    require(all(checks.get(name) is True for name in REQUIRED_CHECKS),
        'Required offline checks missing/failed: ' + ', '.join(name for name in REQUIRED_CHECKS if checks.get(name) is not True))
    log = build_log.read_text(encoding='utf-8-sig', errors='replace')
    require('BUILD SUCCESSFUL' in log, 'Successful final Gradle build log required')
    row = proof.get('buildLog')
    require(isinstance(row, dict) and row.get('sha256') == digest(build_log), 'Offline verification build-log pin missing/mismatched')
    sources = proof.get('sources')
    require(isinstance(sources, list) and sources, 'Offline checked source SHA256 pins are required')
    pinned = set()
    for row in sources:
        require(isinstance(row, dict) and isinstance(row.get('path'), str), 'Invalid offline source pin')
        source = repository_path(row['path'])
        name = source.relative_to(ROOT).as_posix()
        require(name not in pinned, 'Duplicate offline source pin: ' + name)
        require(digest(source) == row.get('sha256'), 'Source changed after offline verification: ' + name)
        pinned.add(name)
    runtime = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src').rglob('*') if p.is_file()} | {GRADLE}
    required = runtime | focused_sources() | {TOOL, RECORDER}
    require(required <= pinned, 'Offline verification lacks runtime/check source pins: ' + str(sorted(required - pinned)))
    fixture = validate_hub_evidence()
    require(set(fixture['checkedSourcePaths']) <= pinned, 'Offline record omitted a checked Java fixture source')
    evidence_pins = proof.get('offlineFixtureEvidence', [])
    require(any(row.get('path') == fixture['evidence']['path']
        and row.get('sha256') == fixture['evidence']['sha256'] for row in evidence_pins if isinstance(row, dict)),
        'Offline verification Hub-evidence pin is missing/stale')
    return dict(evidence=pin(path), buildLog=pin(build_log), emulatorUsed=False,
        emulatorOmittedAtUserRequest=True, androidGameplayVerified=False, actualAndroidViewsExecuted=False,
        offlineHostChecksPassed=True, buildChecksPassed=True,
        offlineFixtureEvidence=[pin(ROOT / name) for name in sorted(OFFLINE_PROOFS)],
        checks={name: checks[name] for name in REQUIRED_CHECKS}, verificationScope=proof['verificationScope'],
        limitations=proof['limitations'], pinnedCheckedSourceFiles=len(pinned), hubAssertions=fixture['assertions'])


def source_inventory(required, evidence):
    focused = focused_sources()
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    names = set(filter(None, raw.decode().split('\0'))) | required | evidence | {
        MANIFEST, RECORD, FALLBACK, TOOL, RECORDER} | NATIVE_TOOLS | focused | NATIVE_PROOFS | OFFLINE_PROOFS
    names.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src').rglob('*') if p.is_file())
    names.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'vendor/multiplayer').rglob('*') if p.is_file())
    files = {}
    retained = required | evidence | NATIVE_TOOLS | focused | NATIVE_PROOFS | OFFLINE_PROOFS | {FALLBACK, TOOL, RECORDER}
    for name in sorted(names):
        rel = Path(name)
        if name.startswith('qa/') and name not in retained:
            continue
        if any(part in C['SKIP'] for part in rel.parts) or name in C['TRANSIENT'] or rel.suffix in {'.partial', '.tmp'}:
            require(name not in retained, 'Required source member would be omitted: ' + name)
            continue
        require(rel.suffix.lower() not in C['PRIVATE_SUFFIXES'] and not rel.name.startswith('.env')
            and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local source: ' + name)
        require(not name.endswith(('.apk', '-source.zip', '-data.tar', '-userdata.tar')), 'Runtime/userdata archive in source: ' + name)
        path = ROOT / name
        require(path.resolve().is_relative_to(ROOT) and (path.is_file() or name in {MANIFEST, RECORD}), 'Missing source: ' + name)
        files[name] = path
    require(retained <= set(files), 'A retained source/evidence member was omitted')
    return files


def validate_native_inputs(files):
    # Keep native v0.71 provenance and the current v0.72 composers. Do not rerun
    # historical gameplay/renderer tests for this Hub-only change.
    return PRIOR['validate_native_inputs'](files)


def validate_source(source, files, evidence):
    with ZipFile(source) as old:
        names = set(old.namelist())
        require(len(names) == len(old.namelist()), 'Duplicate baseline source entry')
        manifest = json.loads(old.read(MANIFEST))['files']
        prior = {row['path']: row for row in manifest}
        require(len(prior) == len(manifest) and set(prior) == names - {MANIFEST}, 'Baseline complete-source manifest incomplete')
        gradle = old.read(GRADLE)
        require(gradle.count(b'versionCode = 74') == gradle.count(b'versionName = "0.74"') == 1, 'Ambiguous baseline version')
        expected = gradle.replace(b'versionCode = 74', b'versionCode = 75').replace(b'versionName = "0.74"', b'versionName = "0.75"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond exact version74-to75 update')
        changed = []
        for name, row in prior.items():
            actual = digest(files[name])
            if actual == row['sha256']:
                continue
            require(name in {GRADLE} | DOCUMENTATION | ALLOWED_SOURCE_CHANGES | OPTIONAL_LAYOUT_CLASSES,
                'Existing source outside the Hub scope changed: ' + name)
            changed.append(dict(path=name, beforeSHA256=row['sha256'], sha256=actual))
        additions = set(files) - names
        for name in additions:
            require(name.startswith(('tools/', 'archive/', 'docs/', HUB_ASSETS)) or name in
                evidence | NATIVE_PROOFS | OFFLINE_PROOFS | {FALLBACK} | OPTIONAL_LAYOUT_CLASSES,
                'Unexpected source addition: ' + name)
        require({MP_ASSETS + name for name in ('native-ui-adapter.js', 'terrain.js', 'intelligence.js', 'mobile-ui-runtime.js')} <= set(files),
            'MP interface/reader/terrain source missing')
        native = validate_native_inputs(files)
    return dict(changedBaselineSources=changed, addedSources=sorted(additions), baselineSourceEntries=len(names),
        everyBaselineSourceEntryRetained=True, onlyHomeAndHubChanged=True,
        allExistingAssetsAndOtherJavaSourceFrozen=True, **native)


def validate_apk(apk, baseline, expected):
    require(apk.is_file() and digest(apk) == expected, 'Candidate APK changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='75'",
        "versionName='0.75'", "application-label:'Warzone Towers'")), 'APK identity/version mismatch')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    config = (ROOT / BUILD_CONFIG).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*75\s*;', config) and re.search(r'\bVERSION_NAME\s*=\s*"0\.75"\s*;', config)
        and re.search(r'\bADMOB_TEST_ADS\s*=\s*false\s*;', config)
        and re.search(r'\bADMOB_REWARDED_AD_UNIT_ID\s*=\s*"' + re.escape(PREVIOUS['HELPERS']['LIVE_UNIT']) + r'"\s*;', config),
        'Delivery BuildConfig version/live phone rewarded ads changed')
    with ZipFile(apk) as current, ZipFile(baseline) as old:
        names, prior = set(current.namelist()), set(old.namelist())
        require(len(names) == len(current.namelist()) and current.testzip() is None, 'Corrupt/duplicate APK')
        require(prior <= names, 'A baseline APK member was removed')
        source_assets = {p.relative_to(ROOT / ASSETS).as_posix(): p for p in (ROOT / ASSETS).rglob('*') if p.is_file()}
        require({name for name in names if name.startswith('assets/')} == {'assets/' + name for name in source_assets}, 'Unexpected APK asset inventory')
        changed = []
        for name in sorted(names):
            if name in prior and zip_digest(current, name) == zip_digest(old, name):
                continue
            require(C['metadata'](name) or name.startswith('assets/hub/') and name not in prior, 'Unexpected APK member changed: ' + name)
            changed.append(name)
        for name, path in source_assets.items():
            require(zip_digest(current, 'assets/' + name) == digest(path), 'APK/source asset mismatch: ' + name)
        for name in prior:
            if name.startswith(('lib/', 'assets/', 'res/')):
                require(zip_digest(current, name) == zip_digest(old, name), 'Frozen APK asset/library changed: ' + name)
        require(zip_digest(current, 'assets/multiplayer/warzone2100.data') == zip_digest(old, 'assets/multiplayer/warzone2100.data') == STOCK_DATA_SHA,
            'Official MP game data differs from fallback')
        for native_name in ('warzone2100.js', 'warzone2100.wasm', 'warzone2100.data'):
            require(zip_digest(current, 'assets/multiplayer/' + native_name) == zip_digest(old, 'assets/multiplayer/' + native_name),
                'Compiled MP client changed from v0.74: ' + native_name)
        require(current.getinfo('assets/warzone/music/music.data').compress_type == ZIP_STORED, 'Bundled soundtrack was compressed')
        dex = [current.read(name) for name in names if re.fullmatch(r'classes(?:\d+)?\.dex', name)]
        for unit in (PREVIOUS['HELPERS']['LIVE_UNIT'], PREVIOUS['HELPERS']['SAMPLE_UNIT']):
            require(any(unit.encode() in value for value in dex), 'Reward unit/emulator fallback missing')
        ordered = sorted(current.infolist(), key=lambda item: item.header_offset)
        gaps = [ordered[0].header_offset]
        for index, info in enumerate(ordered):
            local_end = info.header_offset + 30 + len(info.filename.encode('utf-8')) + len(info.extra) + info.compress_size
            next_start = ordered[index + 1].header_offset if index + 1 < len(ordered) else current.start_dir
            gaps.append(max(0, next_start - local_end))
        require(max(gaps) < 2 * 1024 * 1024, 'Large unused APK gap; clean build required')
    return dict(certificateSHA256=signing, changedAPKMembers=changed, everyBaselineAPKMemberRetained=True,
        allAPKAssetsMatchSource=True, allExistingAssetsResourcesAndNativeLibrariesFrozen=True, bundledMusicFrozen=True, compiledMultiplayerClientByteIdenticalTo074=True,
        livePhoneAdsAndEmulatorFallbackRetained=True, maximumAPKZipGapBytes=max(gaps), generatedBuildConfigSHA256=digest(ROOT / BUILD_CONFIG))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--verification', required=True, help='Exact-APK passed offline JSON with explicit no-emulator/runtime limitations and checked source pins')
    parser.add_argument('--build-log', required=True, help='Successful final Gradle build log, pinned by verification')
    parser.add_argument('--evidence', action='append', default=[], help='Additional repository evidence to retain; repeatable')
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
    apk_record = validate_apk(args.apk.resolve(), baseline, expected)
    require(digest(args.apk) == expected, 'Candidate APK changed during validation')
    if args.validate_only:
        print(json.dumps(dict(packageValidationPassed=True, packageChecksPassed=True, deliveryWritten=False, sourceFiles=len(files),
            exactAPKVerification=verification, **preservation, **apk_record), indent=2))
        return
    apk_out, source_out, checksum = (args.output / name for name in
        ('Warzone-Towers-0.75.apk', 'warzone-towers-0.75-source.zip', 'Warzone-Towers-0.75-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    record = dict(version='0.75', versionCode=75, candidateAPK_SHA256=expected,
        scope='Home Hub button and isolated local results/rankings/player reader. Worker cached public data, independent source-method ratings and compact monochrome UI. No emulator tests; existing gameplay/assets and multiplayer joining frozen.',
        exactAPKVerification=verification, fallback=pin(ROOT / FALLBACK), sourcePreservation=preservation, **apk_record,
        nativeBuildPerformed=False, emulatorUsed=False, androidGameplayVerified=False, actualAndroidViewsExecuted=False,
        offlineHostChecksPassed=True, buildChecksPassed=True, packageChecksPassed=True,
        liveAdsTested=False, githubPublished=False, vpsChanged=False,
        recordedUTC=datetime.now(timezone.utc).isoformat())
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
    require(digest(baseline) == BASELINE_APK_SHA and digest(source) == BASELINE_SOURCE_SHA, 'Fallback changed during packaging')
    checksum.write_text(expected + '  ' + apk_out.name + '\n' + source_sha + '  ' + source_out.name + '\n', encoding='utf-8')
    print(json.dumps(dict(packageIntegrityPassed=True, apk=str(apk_out), apkSHA256=expected,
        source=str(source_out), sourceSHA256=source_sha, checksums=str(checksum), sourceFiles=len(files),
        rawCopiedUnchangedZIPMembers=reused, everySourceMemberCRCAndSHAStreamed=True,
        exactBuiltAPKCopied=True, packageChecksPassed=True, exactAPKVerification=verification), indent=2))


if __name__ == '__main__':
    main()
