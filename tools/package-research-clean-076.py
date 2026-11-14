"""Package exact offline-checked v0.76 compact Research APK and portable source.

The user explicitly requested no emulator testing. This tool performs no build,
device operation or runtime proof generation. It validates the pinned successful
build, new host/browser evidence and exact APK/assets/signing. Every v0.75 source
member and historical proof is retained; all assets except the shared research
renderer and theme, including every Multiplayer asset, remain byte-identical.
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
PRIOR = runpy.run_path(str(ROOT / 'tools/package-multiplayer-072.py'), run_name='research076_prior_helpers')
H, C = PRIOR['H'], PRIOR['C']
PREVIOUS = PRIOR['PREVIOUS']
digest, zip_digest, require = (C[name] for name in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
FALLBACK = 'qa/research-clean-076/fallback-0.76.json'
RECORD = 'archive/release-0.76-research-clean.json'
TOOL = 'tools/package-research-clean-076.py'
RECORDER = 'tools/record-research-clean-076.py'
GRADLE = 'app/build.gradle.kts'
ASSETS = 'app/src/main/assets/'
MP_ASSETS = ASSETS + 'multiplayer/'
NATIVE = 'vendor/multiplayer/native-071/'
MP_ACTIVITY = 'app/src/main/java/com/rbabbit/blocknight/warzone/MultiplayerActivity.java'
BUILD_CONFIG = H['BUILD_CONFIG']
BASELINE_APK_SHA = '88932001a5cb4962ff1fd3e1a4299908907ab7dcac8481666168a88755981df6'
BASELINE_SOURCE_SHA = '28ce211fa9c40f62e1d16e99143fdd639c47767d4a7540030de06eb2bcdc4798'
STOCK_DATA_SHA = '9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424'
UPSTREAM = '7d3d8e51a61ceee89e6bf672a41337e1a9cd7392'
DOCUMENTATION = {'AGENTS.md', 'README.md', 'README-WARZONE-TOWERS.md', 'design-qa.md',
    'docs/KNOWN-ISSUES.md', 'vendor/multiplayer/README.md'}
NATIVE_TOOLS = {'tools/' + name for name in ('prepare-multiplayer-native-071.py',
    'build-multiplayer-native-071.py', 'integrate-multiplayer-native-071.py',
    'compose-multiplayer-ui-070.cjs')}
FOCUSED_CHECKS = {'tools/' + name for name in (
    'test-research-clean-076.cjs', 'test-research-clean-browser-076.cjs')}
ALLOWED_SOURCE_CHANGES = {ASSETS + 'warzone-mobile-research.js',
    ASSETS + 'warzone/ui/towers-research.css'}
ALLOWED_APK_ASSETS = {'assets/' + name[len(ASSETS):] for name in ALLOWED_SOURCE_CHANGES}

NATIVE_PROOFS = {'qa/multiplayer-071/' + name for name in ('native-build.json',
    'native-focused-build.log', 'native-combat-policy-check.json')}
OFFLINE_PROOFS = {'qa/research-clean-076/checks.json', 'qa/research-clean-076/browser.json'}
REQUIRED_CHECKS = ('sharedResearchHostChecks', 'crossModeBrowserChecks', 'successfulBuild')



def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def repository_path(value):
    path = Path(value)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), 'Missing/outside repository evidence: ' + str(value))
    return path


def pin(path):
    return dict(path=path.relative_to(ROOT).as_posix(), bytes=path.stat().st_size, sha256=digest(path))


def checked_fixture_sources(proof, label):
    rows = proof.get('sources')
    require(isinstance(rows, list) and rows, label + ' has no checked source pins')
    names = set()
    for row in rows:
        require(isinstance(row, dict) and isinstance(row.get('path'), str), label + ' has an invalid source pin')
        path = repository_path(row['path'])
        name = path.relative_to(ROOT).as_posix()
        require(name not in names and digest(path) == row.get('sha256'), label + ' duplicate/stale source: ' + name)
        names.add(name)
    return names


def validate_fixtures():
    host_path = repository_path('qa/research-clean-076/checks.json')
    browser_path = repository_path('qa/research-clean-076/browser.json')
    host, browser = read_json(host_path), read_json(browser_path)
    require(host.get('version') == '0.76' and host.get('passed') is True
        and host.get('emulatorUsed') is False and host.get('actualNativeEngineExecuted') is False,
        'Passed v0.76 offline Research host fixture is required')
    checks = host.get('checks')
    require(isinstance(checks, list) and checks and host.get('checksPassed') == len(checks)
        and all(isinstance(value, str) and value.strip() for value in checks),
        'Host fixture has no complete passed assertion inventory')
    host_sources = checked_fixture_sources(host, 'Host fixture')
    require({'app/src/main/assets/warzone-mobile-research.js', 'tools/test-research-clean-076.cjs'} <= host_sources,
        'Host fixture lacks actual renderer/test pins')
    require(browser.get('version') == '0.76' and browser.get('passed') is True
        and browser.get('emulatorUsed') is False and browser.get('engineExecuted') is False
        and not browser.get('fatal') and browser.get('exceptions') == [] and browser.get('badRequests') == [],
        'Passed v0.76 host-browser renderer fixture without runtime claims is required')
    browser_sources = checked_fixture_sources(browser, 'Browser fixture')
    require(ALLOWED_SOURCE_CHANGES | {'tools/test-research-clean-browser-076.cjs'} <= browser_sources,
        'Browser fixture lacks actual renderer/theme/test pins')
    rows = browser.get('results', [])
    required_cases = {(mode, size) for mode in ('towers', 'campaign', 'ffa', 'multiplayer')
        for size in ((1164, 554), (800, 360), (640, 320))}
    require(isinstance(rows, list) and len(rows) >= len(required_cases)
        and browser.get('modeViewports') == len(rows)
        and all(isinstance(row, dict) and row.get('passed') is True for row in rows),
        'Browser mode/viewport assertions are incomplete or failed')
    actual_cases = {(row.get('mode'), tuple(row.get('viewport', []))) for row in rows}
    require(required_cases <= actual_cases, 'Browser fixture omits a required Research mode/viewport')
    shots = browser.get('screenshots')
    require(isinstance(shots, list) and shots, 'Rendered Research screenshots are required')
    screenshot_pins = []
    for value in shots:
        require(isinstance(value, str), 'Invalid screenshot inventory')
        path = (browser_path.parent / value).resolve()
        require(path.is_relative_to(browser_path.parent) and path.is_file(), 'Missing/outside fixture screenshot: ' + value)
        with path.open('rb') as source:
            require(source.read(8) == b'\x89PNG\r\n\x1a\n', 'Fixture screenshot is not a PNG: ' + value)
        screenshot_pins.append(pin(path))
    return dict(evidence=[pin(host_path), pin(browser_path)], hostAssertions=len(checks),
        browserModeViewports=len(rows), checkedSourcePaths=sorted(host_sources | browser_sources),
        screenshots=screenshot_pins)


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    rows = saved.get('immutableFallbacks', [])
    paths = []
    for suffix, expected in (('.apk', BASELINE_APK_SHA), ('.zip', BASELINE_SOURCE_SHA)):
        matches = [row for row in rows if str(row.get('path', '')).endswith(suffix)]
        require(len(matches) == 1, 'Ambiguous preserved v0.75 fallback: ' + suffix)
        row = matches[0]
        path = Path(row['path']).resolve()
        require(path.is_file() and row.get('sha256') == expected
            and path.stat().st_size == row.get('bytes') and digest(path) == expected,
            'Immutable v0.75 fallback changed: ' + str(path))
        paths.append(path)
    return paths


def validate_verification(path, build_log, expected):
    proof = read_json(path)
    require(str(proof.get('version')) == '0.76' and proof.get('candidateAPK_SHA256') == expected,
        'Offline verification must name this exact v0.76 APK SHA256')
    require(proof.get('passed') is True and proof.get('emulatorUsed') is False
        and proof.get('emulatorOmittedAtUserRequest') is True,
        'v0.76 requires the explicitly requested offline-only verification record')
    require(proof.get('androidGameplayVerified') is False and proof.get('actualAndroidViewsExecuted') is False,
        'Offline verification must not claim Android rendering or gameplay')
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
    required = runtime | FOCUSED_CHECKS | {TOOL, RECORDER}
    require(required <= pinned, 'Offline verification lacks runtime/check source pins: ' + str(sorted(required - pinned)))
    fixture = validate_fixtures()
    require(set(fixture['checkedSourcePaths']) <= pinned, 'Offline record omitted a checked Research fixture source')
    evidence_rows = proof.get('offlineFixtureEvidence', [])
    for expected_row in fixture['evidence']:
        require(any(isinstance(row, dict) and row.get('path') == expected_row['path']
            and row.get('sha256') == expected_row['sha256'] for row in evidence_rows),
            'Offline fixture evidence pin missing/stale: ' + expected_row['path'])
    recorded_shots = proof.get('renderedScreenshots', [])
    require(isinstance(recorded_shots, list) and len(recorded_shots) == len(fixture['screenshots']),
        'Verification must pin every rendered screenshot')
    for expected_row in fixture['screenshots']:
        require(any(isinstance(row, dict) and row.get('path') == expected_row['path']
            and row.get('sha256') == expected_row['sha256'] for row in recorded_shots),
            'Rendered screenshot changed after verification: ' + expected_row['path'])
    return dict(evidence=pin(path), buildLog=pin(build_log), emulatorUsed=False,
        emulatorOmittedAtUserRequest=True, androidGameplayVerified=False, actualAndroidViewsExecuted=False,
        offlineHostChecksPassed=True, buildChecksPassed=True,
        offlineFixtureEvidence=[pin(ROOT / name) for name in sorted(OFFLINE_PROOFS)],
        checks={name: checks[name] for name in REQUIRED_CHECKS}, verificationScope=proof['verificationScope'],
        limitations=proof['limitations'], pinnedCheckedSourceFiles=len(pinned),
        hostAssertions=fixture['hostAssertions'], browserModeViewports=fixture['browserModeViewports'])


def source_inventory(required, evidence):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    names = set(filter(None, raw.decode().split('\0'))) | required | evidence | {
        MANIFEST, RECORD, FALLBACK, TOOL, RECORDER} | NATIVE_TOOLS | FOCUSED_CHECKS | NATIVE_PROOFS | OFFLINE_PROOFS
    names.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src').rglob('*') if p.is_file())
    names.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'vendor/multiplayer').rglob('*') if p.is_file())
    files = {}
    retained = required | evidence | NATIVE_TOOLS | FOCUSED_CHECKS | NATIVE_PROOFS | OFFLINE_PROOFS | {FALLBACK, TOOL, RECORDER}
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
    # Reuse the retained compilation/integration provenance from v0.71 and the
    # still-current v0.72 UI/music composers. Do not rerun historical renderer
    # feature tests against the intentionally changed shared research code.
    return PRIOR['validate_native_inputs'](files)


def validate_source(source, files, evidence):
    with ZipFile(source) as old:
        names = set(old.namelist())
        require(len(names) == len(old.namelist()), 'Duplicate baseline source entry')
        manifest = json.loads(old.read(MANIFEST))['files']
        prior = {row['path']: row for row in manifest}
        require(len(prior) == len(manifest) and set(prior) == names - {MANIFEST}, 'Baseline complete-source manifest incomplete')
        gradle = old.read(GRADLE)
        require(gradle.count(b'versionCode = 75') == gradle.count(b'versionName = "0.75"') == 1, 'Ambiguous baseline version')
        expected = gradle.replace(b'versionCode = 75', b'versionCode = 76').replace(b'versionName = "0.75"', b'versionName = "0.76"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond exact version75-to76 update')
        changed = []
        for name, row in prior.items():
            actual = digest(files[name])
            if actual == row['sha256']:
                continue
            require(name in {GRADLE} | DOCUMENTATION | ALLOWED_SOURCE_CHANGES,
                'Existing source outside shared research scope changed: ' + name)
            changed.append(dict(path=name, beforeSHA256=row['sha256'], sha256=actual))
        additions = set(files) - names
        for name in additions:
            require(name.startswith(('tools/', 'archive/', 'docs/')) or name in evidence | NATIVE_PROOFS | OFFLINE_PROOFS | {FALLBACK},
                'Unexpected source addition: ' + name)
        require({MP_ASSETS + name for name in ('native-ui-adapter.js', 'terrain.js', 'intelligence.js', 'mobile-ui-runtime.js')} <= set(files),
            'MP interface/reader/terrain source missing')
        native = validate_native_inputs(files)
    return dict(changedBaselineSources=changed, addedSources=sorted(additions), baselineSourceEntries=len(names),
        everyBaselineSourceEntryRetained=True, onlySharedResearchAssetsChanged=True, multiplayerAndOtherAssetsFrozen=True, **native)


def validate_apk(apk, baseline, expected):
    require(apk.is_file() and digest(apk) == expected, 'Candidate APK changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='76'",
        "versionName='0.76'", "application-label:'Warzone Towers'")), 'APK identity/version mismatch')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    config = (ROOT / BUILD_CONFIG).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*76\s*;', config) and re.search(r'\bVERSION_NAME\s*=\s*"0\.76"\s*;', config)
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
            require(C['metadata'](name) or name in ALLOWED_APK_ASSETS, 'Unexpected APK member changed: ' + name)
            changed.append(name)
        for name, path in source_assets.items():
            require(zip_digest(current, 'assets/' + name) == digest(path), 'APK/source asset mismatch: ' + name)
        for name in prior:
            if name.startswith(('lib/', 'res/')) or name.startswith('assets/') and name not in ALLOWED_APK_ASSETS:
                require(zip_digest(current, name) == zip_digest(old, name), 'Frozen APK asset/library changed: ' + name)
        require(zip_digest(current, 'assets/multiplayer/warzone2100.data') == zip_digest(old, 'assets/multiplayer/warzone2100.data') == STOCK_DATA_SHA,
            'Official MP game data differs from fallback')
        for native_name in ('warzone2100.js', 'warzone2100.wasm', 'warzone2100.data'):
            require(zip_digest(current, 'assets/multiplayer/' + native_name) == zip_digest(old, 'assets/multiplayer/' + native_name),
                'Compiled MP client changed from v0.75: ' + native_name)
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
        allAPKAssetsMatchSource=True, allOtherAssetsResourcesAndNativeLibrariesFrozen=True, bundledMusicFrozen=True, compiledMultiplayerClientByteIdenticalTo075=True,
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
    evidence |= {row['path'] for row in validate_fixtures()['screenshots']}
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
        ('Warzone-Towers-0.76.apk', 'warzone-towers-0.76-source.zip', 'Warzone-Towers-0.76-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    record = dict(version='0.76', versionCode=76, candidateAPK_SHA256=expected,
        scope='Compact shared Research presentation, numeric laboratory labels and an unfiltered topic catalogue in Towers, Campaign, FFA and Multiplayer. Queue, progress and batch-selection behavior retained. User requested no emulator testing. Every Java source, other asset and native client frozen.',
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
