"""Package the exact emulator-verified v0.79 Multiplayer waiting-room APK/full source.

No build/device/network operation is performed here. Native/host/browser proof,
private-host exact-APK observations and compiler provenance must already exist.
All v0.78 complete-source members are retained. Only the isolated Multiplayer
room assets/native client, narrow Activity Back cache and release metadata change.
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
PRIOR = runpy.run_path(str(ROOT / 'tools/package-multiplayer-072.py'), run_name='room079_prior_helpers')
H, C = PRIOR['H'], PRIOR['C']
PREVIOUS = PRIOR['PREVIOUS']
digest, zip_digest, require = (C[name] for name in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
FALLBACK = 'qa/multiplayer-room-079/fallback-0.79.json'
RECORD = 'archive/release-0.79-multiplayer-room.json'
TOOL = 'tools/package-multiplayer-room-079.py'
RECORDER = 'tools/record-multiplayer-room-079.py'
GRADLE = 'app/build.gradle.kts'
ASSETS = 'app/src/main/assets/'
MP_ASSETS = ASSETS + 'multiplayer/'
NATIVE = 'vendor/multiplayer/native-079/'
MP_ACTIVITY = 'app/src/main/java/com/rbabbit/blocknight/warzone/MultiplayerActivity.java'
BUILD_CONFIG = H['BUILD_CONFIG']
BASELINE_APK_SHA = '6bfe0885730aee099f7499c5e5127d7de9dab0400b07b93cc5b7b415c40033f5'
BASELINE_SOURCE_SHA = '3bd32c1f6b5f7ed78167ed23f2196c5943845cbb3b4bcb9a1f8d43b7109ad3ab'
STOCK_DATA_SHA = '9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424'
UPSTREAM = '7d3d8e51a61ceee89e6bf672a41337e1a9cd7392'
DOCUMENTATION = {'AGENTS.md', 'README.md', 'README-WARZONE-TOWERS.md', 'design-qa.md',
    'docs/KNOWN-ISSUES.md', 'vendor/multiplayer/README.md'}
NATIVE_TOOLS = {'tools/' + name for name in ('prepare-multiplayer-native-079.py',
    'build-multiplayer-native-079.py', 'integrate-multiplayer-native-079.py')}
FOCUSED_CHECKS = {'tools/' + name for name in ('test-multiplayer-room-native-079.py',
    'test-multiplayer-room-ui-079.cjs', 'test-multiplayer-room-session-079.cjs',
    'check-multiplayer-room-back-079.py')}
EMULATOR_TOOLS = {'tools/' + name for name in ('mp-live-079.cjs', 'mp-room-live-079.cjs',
    'test-multiplayer-room-emulator-079.cjs')}
ALLOWED_SOURCE_CHANGES = {MP_ACTIVITY} | {MP_ASSETS + name for name in (
    'index.html', 'session.js', 'native-ui-adapter.js', 'room-ui.js', 'room-ui.css',
    'warzone2100.js', 'warzone2100.wasm')}
NEW_PRODUCT_FILES = {MP_ASSETS + 'room-ui.js', MP_ASSETS + 'room-ui.css'}
ALLOWED_APK_ASSETS = {'assets/' + name[len(ASSETS):] for name in ALLOWED_SOURCE_CHANGES if name.startswith(ASSETS)}
NATIVE_PROOFS = {'qa/multiplayer-room-079/' + name for name in ('native-prepare.json',
    'native-build.json', 'native-focused-build.log', 'native-checks.json',
    'native-host-harness.cpp', 'compile-multiint.cpp.log', 'compile-quickjs_backend.cpp.log')}
OFFLINE_PROOFS = {'qa/multiplayer-room-079/' + name for name in
    ('room-ui-browser.json', 'session-host.json', 'back-host.json')}
REQUIRED_CHECKS = ('exactDeliveryAPK', 'roomPlayersAndChatLayout', 'nativeReadyAcknowledgement',
    'privateRoomChatRoundTrip', 'teamChangeOrAuthoritativeDenial', 'spectateChangeOrAuthoritativeDenial',
    'keyboardAndBack', 'leaveRejoinAndLoadCover', 'matchGameplayInput', 'existingModesNavigation')




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
    folder = ROOT / 'qa/multiplayer-room-079'
    needed = {
        'native-checks.json': {NATIVE + 'mobile-room-native.cpp.inc', 'tools/test-multiplayer-room-native-079.py'},
        'room-ui-browser.json': {MP_ASSETS + 'room-ui.js', MP_ASSETS + 'room-ui.css', 'tools/test-multiplayer-room-ui-079.cjs'},
        'session-host.json': {MP_ASSETS + 'session.js', MP_ASSETS + 'native-ui-adapter.js', 'tools/test-multiplayer-room-session-079.cjs'},
        'back-host.json': {MP_ACTIVITY, 'tools/check-multiplayer-room-back-079.py'}}
    evidence, screenshots, covered, counts = [], {}, set(), {}
    for name, required in needed.items():
        path = folder / name
        proof = read_json(path)
        require(proof.get('version') == '0.79' and proof.get('passed') is True
            and proof.get('emulatorUsed') is False and not proof.get('fatal'), 'Failed/stale host fixture: ' + name)
        require(proof.get('engineExecuted', proof.get('actualNativeEngineExecuted', False)) is False,
            'Host fixture must distinguish real native engine execution: ' + name)
        checks = proof.get('checks')
        require(isinstance(checks, list) and checks and proof.get('checksPassed') == len(checks)
            and all(isinstance(item, str) and item.strip() for item in checks), 'Missing passed assertion inventory: ' + name)
        names = checked_fixture_sources(proof, name)
        require(required <= names, 'Fixture lacks current implementation/test pins: ' + name)
        covered |= names; counts[name] = len(checks); evidence.append(pin(path))
        if name == 'room-ui-browser.json':
            require(proof.get('exceptions') == [] and proof.get('badRequests') == [], 'Room browser has runtime/asset errors')
            cases = proof.get('results', [])
            require(cases and all(row.get('passed') is True for row in cases), 'Room browser case failed')
            sizes = [row.get('viewport', row.get('size', [])) for row in cases]
            require(any(isinstance(v, list) and v and v[0] <= 640 for v in sizes)
                and any(isinstance(v, list) and v and v[0] >= 800 for v in sizes), 'Room browser lacks compact/wide layouts')
            shots = proof.get('screenshots', [])
            require(shots, 'Room screenshot inventory missing')
            for value in shots:
                shot = (folder / value).resolve()
                require(shot.is_relative_to(folder) and shot.is_file(), 'Missing/outside room screenshot')
                with shot.open('rb') as stream:
                    require(stream.read(8) == b'\x89PNG\r\n\x1a\n', 'Room screenshot is not PNG')
                screenshots[shot.relative_to(ROOT).as_posix()] = pin(shot)
    require(FOCUSED_CHECKS <= covered, 'Focused fixture omits its current test pin')
    return dict(evidence=evidence, assertionCounts=counts, checkedSourcePaths=sorted(covered),
        screenshots=[screenshots[name] for name in sorted(screenshots)])


def validate_emulator_proof(path, expected):
    proof = read_json(path)
    require(proof.get('version') == '0.79' and proof.get('passed') is True
        and proof.get('emulatorUsed') is True, 'Passed real emulator observation is required')
    require(proof.get('candidateAPK_SHA256') == expected and proof.get('installedAPK_SHA256') == expected,
        'Emulator did not run the exact delivery APK')
    require(proof.get('device') == 'emulator-5558', 'Unexpected emulator fixture identity')
    require(all(proof.get('checks', {}).get(name) is True for name in REQUIRED_CHECKS),
        'Required exact-APK room journey check is missing/failed')
    fixture = proof.get('fixture', {})
    require(fixture.get('kind') == 'private-local-host' and fixture.get('publicMessagesSent') is False,
        'Chat checks must use the isolated private host, never public-room messages')
    require(isinstance(proof.get('verificationScope'), str) and proof['verificationScope'].strip()
        and isinstance(proof.get('limitations'), list), 'Emulator observations must state scope/limitations')
    rows = proof.get('evidence', [])
    require(isinstance(rows, list) and rows, 'Actual emulator screenshot/native observations must be pinned')
    names = set()
    for row in rows:
        item = repository_path(row['path']); name = item.relative_to(ROOT).as_posix()
        require(name not in names and digest(item) == row.get('sha256')
            and item.stat().st_size == row.get('bytes'), 'Missing/stale emulator evidence: ' + name)
        names.add(name)
    require(any(name.endswith('.png') for name in names) and any(name.endswith('.json') for name in names),
        'Emulator proof needs both observed screenshots and native/installation state')
    return proof, names


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    rows = saved.get('immutableFallbacks', [])
    paths = []
    for suffix, expected in (('.apk', BASELINE_APK_SHA), ('.zip', BASELINE_SOURCE_SHA)):
        matches = [row for row in rows if str(row.get('path', '')).endswith(suffix)]
        require(len(matches) == 1, 'Ambiguous preserved v0.78 fallback: ' + suffix)
        row = matches[0]
        path = Path(row['path']).resolve()
        require(path.is_file() and row.get('sha256') == expected
            and path.stat().st_size == row.get('bytes') and digest(path) == expected,
            'Immutable v0.78 fallback changed: ' + str(path))
        paths.append(path)
    return paths


def validate_verification(path, build_log, expected):
    proof = read_json(path)
    require(proof.get('version') == '0.79' and proof.get('candidateAPK_SHA256') == expected
        and proof.get('passed') is True and proof.get('emulatorUsed') is True,
        'Exact v0.79 emulator-approved verification record required')
    require(all(proof.get('checks', {}).get(name) is True for name in REQUIRED_CHECKS), 'Final checks incomplete')
    require('BUILD SUCCESSFUL' in build_log.read_text(encoding='utf-8-sig', errors='replace'), 'Successful final build log missing')
    require(proof.get('buildLog', {}).get('sha256') == digest(build_log), 'Build log changed after verification')
    pinned = checked_fixture_sources(proof, 'Exact-APK verification')
    runtime = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src').rglob('*') if p.is_file()}
    native = {p.relative_to(ROOT).as_posix() for p in (ROOT / NATIVE).rglob('*') if p.is_file()}
    require(runtime | native | FOCUSED_CHECKS | NATIVE_TOOLS | EMULATOR_TOOLS | {GRADLE, TOOL, RECORDER} <= pinned,
        'Verification lacks current runtime/native/tool source pins')
    fixtures = validate_fixtures()
    for row in fixtures['evidence']:
        require(row in proof.get('offlineFixtureEvidence', []), 'Host proof changed after recording: ' + row['path'])
    require(proof.get('renderedScreenshots') == fixtures['screenshots'], 'Room screenshots changed after recording')
    emulator_row = proof.get('emulatorProof', {})
    emulator_path = repository_path(emulator_row.get('path', ''))
    require(emulator_row == pin(emulator_path), 'Emulator proof changed after recording')
    observed, names = validate_emulator_proof(emulator_path, expected)
    return dict(evidence=pin(path), buildLog=pin(build_log), emulatorProof=pin(emulator_path),
        emulatorUsed=True, exactInstalledAPKVerified=True, checks=observed['checks'],
        verificationScope=observed['verificationScope'], limitations=observed['limitations'],
        observedEvidencePaths=sorted(names), pinnedCheckedSourceFiles=len(pinned),
        assertionCounts=fixtures['assertionCounts'])


def source_inventory(required, evidence):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    names = set(filter(None, raw.decode().split('\0'))) | required | evidence | {
        MANIFEST, RECORD, FALLBACK, TOOL, RECORDER} | NATIVE_TOOLS | EMULATOR_TOOLS | FOCUSED_CHECKS | NATIVE_PROOFS | OFFLINE_PROOFS
    names.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src').rglob('*') if p.is_file())
    names.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'vendor/multiplayer').rglob('*') if p.is_file())
    files = {}
    retained = required | evidence | NATIVE_TOOLS | EMULATOR_TOOLS | FOCUSED_CHECKS | NATIVE_PROOFS | OFFLINE_PROOFS | {FALLBACK, TOOL, RECORDER}
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
    original = ROOT / 'vendor/multiplayer/source/source-inputs.json'
    for row in read_json(original)['files']:
        name = 'vendor/multiplayer/source/' + row['path']
        require(name in files and digest(files[name]) == row['sha256'] and files[name].stat().st_size == row['bytes'],
            'Historical portable MP input missing/changed: ' + name)
    overlays = read_json(ROOT / NATIVE / 'source-overlays.json')
    require(overlays.get('version') == '0.79' and overlays.get('upstreamCommit') == UPSTREAM
        and overlays.get('nativeDataUnchanged') is True and overlays.get('simulationSourcesUnchanged') is True,
        'Wrong native room UI provenance')
    changed, includes = overlays.get('changed', []), overlays.get('newIncludes', [])
    require(changed and includes and len(changed + includes) == len({row['path'] for row in changed + includes}),
        'Incomplete native overlay/include inventory')
    for row in changed + includes:
        name = NATIVE + Path(row['path']).name
        require(name in files and files[name].stat().st_size == row['bytes'] and digest(files[name]) == row['sha256'],
            'Native overlay/include changed: ' + name)
    patch = (ROOT / NATIVE / 'native-ui.patch').read_text(encoding='utf-8-sig')
    require(set(re.findall(r'^\+\+\+ b/(.+)$', patch, re.M)) == {row['path'] for row in changed + includes},
        'Native patch does not reproduce exact source/include inventory')
    protocol = (ROOT / NATIVE / 'netplay_config.h').read_text(encoding='utf-8-sig')
    require('NETCODE_VERSION_MAJOR = 0x4000' in protocol and 'NETCODE_VERSION_MINOR = 104' in protocol,
        'Official multiplayer protocol changed')
    build = read_json(ROOT / 'qa/multiplayer-room-079/native-build.json')
    require(build.get('version') == '0.79' and build.get('upstreamCommit') == UPSTREAM
        and build.get('protocolHeader') == protocol, 'Wrong native build/protocol proof')
    compiled = {row['path']: row['sha256'] for row in build.get('sources', [])}
    require(all(compiled.get(row['path']) == row['sha256'] for row in changed), 'Built native sources differ from overlays')
    host = read_json(ROOT / 'qa/multiplayer-room-079/native-checks.json')
    checked = checked_fixture_sources(host, 'Native room checks')
    require({NATIVE + Path(row['path']).name for row in includes} <= checked, 'New compiled room include lacks checked hash')
    for row in build.get('raw', []):
        name = NATIVE + 'raw-' + row['name']
        require(name in files and files[name].stat().st_size == row['bytes'] and digest(files[name]) == row['sha256'],
            'Matched compiler output changed: ' + name)
    require({row['name'] for row in build.get('raw', [])} == {'warzone2100.js', 'warzone2100.wasm'}, 'Compiler raw pair incomplete')
    integration = read_json(ROOT / NATIVE / 'runtime-integration.json')
    require(integration.get('version') == '0.79' and integration.get('protocol') == [16384, 104]
        and integration.get('noWasmBinaryPatching') is True and integration.get('frozenDataSHA256') == STOCK_DATA_SHA,
        'Native integration provenance differs')
    outputs = integration.get('outputs', [])
    require({row['name'] for row in outputs} == {'warzone2100.js', 'warzone2100.wasm', 'warzone2100.data'}, 'MP output provenance incomplete')
    for row in outputs:
        path = files.get(MP_ASSETS + row['name'])
        require(path and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'], 'Integrated native asset changed')
    require(digest(files[MP_ASSETS + 'warzone2100.wasm']) == digest(files[NATIVE + 'raw-warzone2100.wasm']), 'WASM patched after compilation')
    require(digest(files[MP_ASSETS + 'warzone2100.data']) == STOCK_DATA_SHA, 'Official MP data changed')
    for tool in ('compose-multiplayer-ui-077.cjs', 'compose-manufacturing-077.cjs', 'compose-multiplayer-music-072.cjs'):
        subprocess.run(['node', str(ROOT / 'tools' / tool), '--check'], cwd=ROOT, check=True)
    return dict(upstreamCommit=UPSTREAM, protocol=[16384, 104], nativeBuildPerformed=True,
        sourceOverlayManifest=pin(ROOT / NATIVE / 'source-overlays.json'), completePatch=pin(ROOT / NATIVE / 'native-ui.patch'),
        nativeBuild=pin(ROOT / 'qa/multiplayer-room-079/native-build.json'), integration=pin(ROOT / NATIVE / 'runtime-integration.json'),
        portableNativeSourcesAndRawPairVerified=True, officialMPDataFrozen=True, wasmBinaryUnmodifiedAfterCompiler=True)


def validate_source(source, files, evidence):
    with ZipFile(source) as old:
        names = set(old.namelist())
        require(len(names) == len(old.namelist()), 'Duplicate baseline source entry')
        manifest = json.loads(old.read(MANIFEST))['files']
        prior = {row['path']: row for row in manifest}
        require(len(prior) == len(manifest) and set(prior) == names - {MANIFEST}, 'Baseline complete-source manifest incomplete')
        gradle = old.read(GRADLE)
        require(gradle.count(b'versionCode = 78') == gradle.count(b'versionName = "0.78"') == 1, 'Ambiguous baseline version')
        expected = gradle.replace(b'versionCode = 78', b'versionCode = 79').replace(b'versionName = "0.78"', b'versionName = "0.79"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond exact version78-to79 update')
        changed = []
        for name, row in prior.items():
            actual = digest(files[name])
            if actual == row['sha256']:
                continue
            require(name in {GRADLE} | DOCUMENTATION | ALLOWED_SOURCE_CHANGES,
                'Existing source outside isolated Multiplayer room scope changed: ' + name)
            changed.append(dict(path=name, beforeSHA256=row['sha256'], sha256=actual))
        additions = set(files) - names
        for name in additions:
            require(not name.startswith(('app/', 'scenario/', 'campaign/', 'vendor/')) or name in NEW_PRODUCT_FILES or name.startswith(NATIVE), 'Unapproved new product/native file: ' + name)
            require(name in NEW_PRODUCT_FILES or name.startswith(NATIVE) or name.startswith(('tools/', 'archive/', 'docs/')) or name in evidence | NATIVE_PROOFS | OFFLINE_PROOFS | {FALLBACK},
                'Unexpected source addition: ' + name)
        require({MP_ASSETS + name for name in ('native-ui-adapter.js', 'terrain.js', 'intelligence.js', 'mobile-ui-runtime.js')} <= set(files),
            'MP interface/reader/terrain source missing')
        native = validate_native_inputs(files)
    return dict(changedBaselineSources=changed, addedSources=sorted(additions), baselineSourceEntries=len(names),
        everyBaselineSourceEntryRetained=True, onlyApprovedMultiplayerRoomScopeChanged=True, offlineModesSharedUIAndGameDataFrozen=True, **native)


def validate_apk(apk, baseline, expected):
    require(apk.is_file() and digest(apk) == expected, 'Candidate APK changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='79'",
        "versionName='0.79'", "application-label:'Warzone Towers'")), 'APK identity/version mismatch')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    config = (ROOT / BUILD_CONFIG).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*79\s*;', config) and re.search(r'\bVERSION_NAME\s*=\s*"0\.79"\s*;', config)
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
        for native_name in ('warzone2100.data',):
            require(zip_digest(current, 'assets/multiplayer/' + native_name) == zip_digest(old, 'assets/multiplayer/' + native_name),
                'Frozen official MP data changed: ' + native_name)
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
        allAPKAssetsMatchSource=True, allOtherAssetsResourcesAndNativeLibrariesFrozen=True, bundledMusicFrozen=True, nativeRoomClientMatchedToCompiler=True,
        livePhoneAdsAndEmulatorFallbackRetained=True, maximumAPKZipGapBytes=max(gaps), generatedBuildConfigSHA256=digest(ROOT / BUILD_CONFIG))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--verification', required=True, help='Exact-APK passed emulator verification with private-host room evidence and source pins')
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
    evidence |= set(verification['observedEvidencePaths']) | {verification['emulatorProof']['path']}
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
        ('Warzone-Towers-0.79.apk', 'warzone-towers-0.79-source.zip', 'Warzone-Towers-0.79-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    record = dict(version='0.79', versionCode=79, candidateAPK_SHA256=expected,
        scope='Isolated Multiplayer waiting-room roster/chat/Ready/team/spectator UI backed by original native room functions, loading/room transition fencing and cached Back behavior. Official network protocol/data, all offline modes and shared research/command UI frozen.',
        exactAPKVerification=verification, fallback=pin(ROOT / FALLBACK), sourcePreservation=preservation, **apk_record,
        emulatorUsed=True, actualAndroidViewsExecuted=True,
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
        exactTestedAPKCopied=True, packageChecksPassed=True, exactAPKVerification=verification), indent=2))


if __name__ == '__main__':
    main()
