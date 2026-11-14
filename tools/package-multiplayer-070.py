"""Package only an emulator-approved exact v0.70 APK and complete portable source.

This tool never builds an APK, operates a device, creates emulator proof or
changes Git/VPS state. It fails closed unless externally collected verification
names the exact APK and pins the tested runtime/check sources. Every member of
the preserved v0.69 complete source is retained; unchanged members reuse their
original compressed bytes through the established streaming ZIP writer.
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
PREVIOUS = runpy.run_path(str(ROOT / 'tools/package-multiplayer-069.py'), run_name='multiplayer070_helpers')
H, C = PREVIOUS['H'], PREVIOUS['C']
digest, zip_digest, require = (C[name] for name in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
FALLBACK = 'qa/multiplayer-070/fallback-0.70.json'
RECORD = 'archive/release-0.70-multiplayer-polish.json'
TOOL = 'tools/package-multiplayer-070.py'
GRADLE = 'app/build.gradle.kts'
ASSETS = 'app/src/main/assets/'
MP_ASSETS = ASSETS + 'multiplayer/'
NATIVE = 'vendor/multiplayer/native-070/'
MP_ACTIVITY = 'app/src/main/java/com/rbabbit/blocknight/warzone/MultiplayerActivity.java'
BUILD_CONFIG = H['BUILD_CONFIG']
BASELINE_APK_SHA = '6f6c095699183a3b74dbafc6bccb4ab736fe03915e86f950ad2474c843c7ea22'
BASELINE_SOURCE_SHA = '1f717203f63b7df045c04b1ec27c9b0147d26ea11505b3cb8d9f394c478362ec'
STOCK_DATA_SHA = '9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424'
UPSTREAM = '7d3d8e51a61ceee89e6bf672a41337e1a9cd7392'
DOCUMENTATION = {'AGENTS.md', 'README.md', 'README-WARZONE-TOWERS.md', 'design-qa.md',
    'docs/KNOWN-ISSUES.md', 'vendor/multiplayer/README.md'}
NATIVE_TOOLS = {'tools/' + name for name in ('prepare-multiplayer-native-070.py',
    'build-multiplayer-native-070.py', 'integrate-multiplayer-native-070.py',
    'compose-multiplayer-ui-070.cjs')}
FOCUSED_CHECKS = {'tools/' + name for name in ('test-multiplayer-shell-070.cjs',
    'test-multiplayer-input-070.cjs', 'test-multiplayer-intelligence-070.cjs',
    'check-multiplayer-terrain-070.cjs', 'check-multiplayer-activity-070.py',
    'check-multiplayer-controls-config-069.cjs')} | {'tools/compose-multiplayer-ui-070.cjs'}
NATIVE_PROOFS = {'qa/multiplayer-070/' + name for name in ('native-build.json',
    'native-focused-build.log', 'native-prepare.json', 'mobile-ui-runtime-contract.json')}
REQUIRED_CHECKS = ('exactDeliveryAPK', 'loadingLobbyAndTransfers', 'savedPlayerName',
    'compactLayouts', 'customMenusAndOrders', 'selectionAndCamera', 'leaveAndRejoin',
    'existingModeNavigation')


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
    rows = saved.get('immutableFallbacks', [])
    paths = []
    for suffix, expected in (('.apk', BASELINE_APK_SHA), ('.zip', BASELINE_SOURCE_SHA)):
        matches = [row for row in rows if str(row.get('path', '')).endswith(suffix)]
        require(len(matches) == 1, 'Ambiguous preserved v0.69 fallback: ' + suffix)
        row = matches[0]
        path = Path(row['path']).resolve()
        require(path.is_file() and row.get('sha256') == expected
            and path.stat().st_size == row.get('bytes') and digest(path) == expected,
            'Immutable v0.69 fallback changed: ' + str(path))
        paths.append(path)
    return paths


def validate_verification(path, build_log, expected):
    proof = read_json(path)
    require(str(proof.get('version')) == '0.70' and proof.get('candidateAPK_SHA256') == expected,
        'Verification must name this exact v0.70 APK SHA256')
    require(proof.get('emulatorUsed') is True and proof.get('passed') is True,
        'Passed exact-APK emulator verification is required; build/scripts are insufficient')
    require(proof.get('verificationScope') and isinstance(proof.get('limitations'), list),
        'Verification must state its observed scope and remaining limitations')
    checks = proof.get('checks', {})
    require(all(checks.get(name) is True for name in REQUIRED_CHECKS),
        'Required emulator journey checks missing/failed: ' + ', '.join(name for name in REQUIRED_CHECKS if checks.get(name) is not True))
    log = build_log.read_text(encoding='utf-8-sig', errors='replace')
    require('BUILD SUCCESSFUL' in log, 'Successful final Gradle build log required')
    row = proof.get('buildLog')
    require(isinstance(row, dict) and row.get('sha256') == digest(build_log), 'Verification build-log pin missing/mismatched')
    sources = proof.get('sources')
    require(isinstance(sources, list) and sources, 'Tested source SHA256 pins are required')
    pinned = set()
    for row in sources:
        require(isinstance(row, dict) and isinstance(row.get('path'), str), 'Invalid tested source pin')
        source = repository_path(row['path'])
        name = source.relative_to(ROOT).as_posix()
        require(name not in pinned, 'Duplicate tested source pin: ' + name)
        require(digest(source) == row.get('sha256'), 'Source changed after exact-APK verification: ' + name)
        pinned.add(name)
    runtime = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src').rglob('*') if p.is_file()} | {GRADLE}
    required = runtime | FOCUSED_CHECKS
    require(required <= pinned, 'Verification lacks runtime/check source pins: ' + str(sorted(required - pinned)))
    return dict(evidence=pin(path), buildLog=pin(build_log), emulatorUsed=True,
        checks={name: checks[name] for name in REQUIRED_CHECKS}, verificationScope=proof['verificationScope'],
        limitations=proof['limitations'], pinnedTestedSourceFiles=len(pinned))


def source_inventory(required, evidence):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    names = set(filter(None, raw.decode().split('\0'))) | required | evidence | {
        MANIFEST, RECORD, FALLBACK, TOOL} | NATIVE_TOOLS | FOCUSED_CHECKS | NATIVE_PROOFS
    names.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'vendor/multiplayer').rglob('*') if p.is_file())
    files = {}
    retained = required | evidence | NATIVE_TOOLS | FOCUSED_CHECKS | NATIVE_PROOFS | {FALLBACK, TOOL}
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
    require(overlays.get('upstreamCommit') == UPSTREAM and overlays.get('nativeDataUnchanged') is True,
        'Wrong native upstream/data provenance')
    changed = overlays.get('changed', [])
    require(changed and len(changed) == len({row['path'] for row in changed}), 'Invalid native source overlay inventory')
    for row in changed:
        name = NATIVE + Path(row['path']).name
        require(name in files and files[name].stat().st_size == row['bytes'] and digest(files[name]) == row['sha256'],
            'Overlaid native source missing/changed: ' + name)
    patch = (ROOT / NATIVE / 'native-ui.patch').read_text(encoding='utf-8-sig')
    paths = set(re.findall(r'^\+\+\+ b/(.+)$', patch, re.M))
    require(paths == {row['path'] for row in changed}, 'Native patch/source inventory differs')
    protocol = (ROOT / NATIVE / 'netplay_config.h').read_text(encoding='utf-8-sig')
    require('NETCODE_VERSION_MAJOR = 0x4000' in protocol and 'NETCODE_VERSION_MINOR = 104' in protocol,
        'Official multiplayer protocol changed')
    build = read_json(ROOT / 'qa/multiplayer-070/native-build.json')
    require(build.get('version') == '0.70' and build.get('upstreamCommit') == UPSTREAM
        and build.get('protocolHeader') == protocol, 'Native build/protocol evidence differs')
    compiled = {row['path']: row['sha256'] for row in build.get('sources', [])}
    require(all(compiled.get(row['path']) == row['sha256'] for row in changed), 'Built native sources differ from retained overlays')
    for row in build.get('raw', []):
        name = NATIVE + 'raw-' + row['name']
        require(name in files and files[name].stat().st_size == row['bytes'] and digest(files[name]) == row['sha256'],
            'Matched native compiler output missing/changed: ' + name)
    require({row['name'] for row in build.get('raw', [])} == {'warzone2100.js', 'warzone2100.wasm'}, 'Native raw pair incomplete')
    integration = read_json(ROOT / NATIVE / 'runtime-integration.json')
    require(integration.get('version') == '0.70' and integration.get('protocol') == [16384, 104]
        and integration.get('noWasmBinaryPatching') is True and integration.get('frozenDataSHA256') == STOCK_DATA_SHA,
        'MP runtime integration provenance changed')
    outputs = integration.get('outputs', [])
    require({row['name'] for row in outputs} == {'warzone2100.js', 'warzone2100.wasm', 'warzone2100.data'}, 'MP output provenance incomplete')
    for row in outputs:
        path = files.get(MP_ASSETS + row['name'])
        require(path and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'],
            'Integrated MP asset differs from native provenance: ' + row['name'])
    require(digest(files[MP_ASSETS + 'warzone2100.wasm']) == digest(files[NATIVE + 'raw-warzone2100.wasm']), 'WASM changed after native compilation')
    require(digest(files[MP_ASSETS + 'warzone2100.data']) == STOCK_DATA_SHA, 'Official MP data changed')
    subprocess.run(['node', str(ROOT / 'tools/compose-multiplayer-ui-070.cjs'), '--check'], cwd=ROOT, check=True)
    return dict(upstreamCommit=UPSTREAM, protocol=[16384, 104], nativeBuildPerformed=True,
        sourceOverlayManifest=pin(ROOT / NATIVE / 'source-overlays.json'), completePatch=pin(ROOT / NATIVE / 'native-ui.patch'),
        nativeBuild=pin(ROOT / 'qa/multiplayer-070/native-build.json'), integration=pin(ROOT / NATIVE / 'runtime-integration.json'),
        portableNativeSourcesAndRawPairVerified=True, officialMPDataFrozen=True, wasmBinaryUnmodifiedAfterCompiler=True)


def validate_source(source, files, evidence):
    with ZipFile(source) as old:
        names = set(old.namelist())
        require(len(names) == len(old.namelist()), 'Duplicate baseline source entry')
        manifest = json.loads(old.read(MANIFEST))['files']
        prior = {row['path']: row for row in manifest}
        require(len(prior) == len(manifest) and set(prior) == names - {MANIFEST}, 'Baseline complete-source manifest incomplete')
        gradle = old.read(GRADLE)
        require(gradle.count(b'versionCode = 69') == gradle.count(b'versionName = "0.69"') == 1, 'Ambiguous baseline version')
        expected = gradle.replace(b'versionCode = 69', b'versionCode = 70').replace(b'versionName = "0.69"', b'versionName = "0.70"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond exact version69-to70 update')
        changed = []
        for name, row in prior.items():
            actual = digest(files[name])
            if actual == row['sha256']:
                continue
            require(name in {GRADLE, MP_ACTIVITY} | DOCUMENTATION or name.startswith(MP_ASSETS),
                'Existing non-MP/historical source changed: ' + name)
            changed.append(dict(path=name, beforeSHA256=row['sha256'], sha256=actual))
        additions = set(files) - names
        for name in additions:
            require(name.startswith((MP_ASSETS, NATIVE, 'tools/', 'archive/', 'docs/')) or name in evidence | NATIVE_PROOFS | {FALLBACK},
                'Unexpected source addition: ' + name)
        require({MP_ASSETS + name for name in ('native-ui-adapter.js', 'terrain.js', 'intelligence.js', 'mobile-ui-runtime.js')} <= set(files),
            'MP interface/reader/terrain source missing')
        native = validate_native_inputs(files)
    return dict(changedBaselineSources=changed, addedSources=sorted(additions), baselineSourceEntries=len(names),
        everyBaselineSourceEntryRetained=True, existingTowersCampaignFFAAssetsFrozen=True, **native)


def validate_apk(apk, baseline, expected):
    require(apk.is_file() and digest(apk) == expected, 'Candidate APK changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='70'",
        "versionName='0.70'", "application-label:'Warzone Towers'")), 'APK identity/version mismatch')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    config = (ROOT / BUILD_CONFIG).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*70\s*;', config) and re.search(r'\bVERSION_NAME\s*=\s*"0\.70"\s*;', config)
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
            require(C['metadata'](name) or name.startswith('assets/multiplayer/'), 'Unexpected APK member changed: ' + name)
            changed.append(name)
        for name, path in source_assets.items():
            require(zip_digest(current, 'assets/' + name) == digest(path), 'APK/source asset mismatch: ' + name)
        for name in prior:
            if name.startswith('lib/') or name.startswith('assets/') and not name.startswith('assets/multiplayer/'):
                require(zip_digest(current, name) == zip_digest(old, name), 'Existing-mode APK asset/library changed: ' + name)
        require(zip_digest(current, 'assets/multiplayer/warzone2100.data') == zip_digest(old, 'assets/multiplayer/warzone2100.data') == STOCK_DATA_SHA,
            'Official MP game data differs from fallback')
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
        allAPKAssetsMatchSource=True, existingModeAssetsAndNativeLibrariesFrozen=True, bundledMusicFrozen=True,
        livePhoneAdsAndEmulatorFallbackRetained=True, maximumAPKZipGapBytes=max(gaps), generatedBuildConfigSHA256=digest(ROOT / BUILD_CONFIG))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--verification', required=True, help='Exact-APK passed emulator JSON with required checks/source pins')
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
        print(json.dumps(dict(packageValidationPassed=True, deliveryWritten=False, sourceFiles=len(files),
            exactAPKVerification=verification, **preservation, **apk_record), indent=2))
        return
    apk_out, source_out, checksum = (args.output / name for name in
        ('Warzone-Towers-0.70.apk', 'warzone-towers-0.70-source.zip', 'Warzone-Towers-0.70-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    record = dict(version='0.70', versionCode=70, candidateAPK_SHA256=expected,
        scope='Repair isolated public Multiplayer mobile menus, viewport, loading/return lifecycle, input and saved player identity; preserve existing modes.',
        exactAPKVerification=verification, fallback=pin(ROOT / FALLBACK), sourcePreservation=preservation, **apk_record,
        nativeBuildPerformed=True, liveAdsTested=False, githubPublished=False, vpsChanged=False,
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
        exactTestedAPKCopied=True, exactAPKVerification=verification), indent=2))


if __name__ == '__main__':
    main()
