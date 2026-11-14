"""Guard and package v0.34's compact routine notices and defeat return.

The immutable v0.33 APK and complete source ZIP are the baseline. This does not
depend on v0.33 having been committed to Git. Package only the exact APK checked
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
import tarfile

ROOT = Path(__file__).resolve().parents[1]
COMMON = runpy.run_path(str(ROOT / 'tools/package-24-home.py'), run_name='package_034_common')
require, digest, zip_digest = (COMMON[k] for k in ('require', 'digest', 'zip_digest'))
read_json, repo_path, metadata = (COMMON[k] for k in ('read_json', 'repo_path', 'metadata'))
NATIVE_SOURCE, MANIFEST, STORED, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[k] for k in (
    'NATIVE_SOURCE', 'MANIFEST', 'STORED', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
NATIVE_ASSETS = {'assets/warzone/warzone2100.' + ext for ext in ('js', 'data', 'wasm')}
ASSET_SCOPE = NATIVE_ASSETS | {'assets/warzone/saved-games.js',
    'assets/warzone/index.html', 'assets/warzone-towers-wave-hud.js',
    'assets/warzone/ui/towers-status.js', 'assets/warzone/ui/towers-status.css',
    'assets/warzone-towers-notices.js'}
ADDED_APP_SOURCE = {'app/src/main/assets/warzone-towers-notices.js'}
SCENARIO_SCOPE = {'scenario/warzone-towers-objective.js', 'scenario/warzone-towers-waves.js'}
VFS_SCOPE = {'/data/mp/tests/' + Path(n).name: n for n in SCENARIO_SCOPE}
SOURCE_SCOPE = {JAVA + 'MainActivity.java'} | SCENARIO_SCOPE
SOURCE_SCOPE |= {'app/src/main/' + n for n in ASSET_SCOPE}
GRADLE = 'app/build.gradle.kts'
FALLBACK = 'archive/fallback-0.34.json'
RECORD = 'archive/release-0.34-focused-tested.json'
SOURCE_REPORT = 'archive/notices-0.34-source-checks.json'
DOC = 'docs/releases/0.34-notices.md'
BASELINE_SHA = '9988786994ef4ee9b3c426bd4af690a9e6f382a94bbeed0dfc351546c51cf0f7'
SOURCE_SHA = '2a061c80effbae9b21128557e9b532a4fe883d30cf7b3a411bc69e20424db2ce'
MUSIC_ASSET = 'assets/warzone/music/music.data'
MUSIC_SHA = '602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd'
MUSIC_BYTES = 114721578
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~3347511713'
AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917'
PUBLISHER_AD_UNIT_ID = 'ca-app-pub-3430279660625393/5338770704'
NATIVE_REQUIRED = {NATIVE_SOURCE, 'archive/native-hud-0.31/display3d.cpp',
    'archive/native-hud-0.31/native-hud.patch', 'archive/native-hud-0.31/source-overlay.json',
    'archive/native-hud-0.31/README.md', 'tools/prepare-native-hud-031.py',
    'tools/build-native-hud-031.py', 'tools/build-native-blueprint.sh', 'tools/integrate-native-runtime.py'}
NATIVE_NEW = {'archive/native-notices-0.34/' + n for n in (
    'research.cpp', 'keybind.cpp', 'native-notices.patch', 'source-overlay.json', 'README.md')}
NATIVE_NEW |= {'tools/prepare-native-notices-034.py', 'tools/build-native-notices-034.py',
    'tools/embed-notices-034.py', 'archive/notices-0.34-native-payload.json',
    'qa/0.34-notices/native-notices-build.json', 'qa/0.34-notices/native-runtime-integration.json',
    'qa/0.34-notices/native-notices-incremental-build.log'}
PAYLOAD = 'archive/notices-0.34-native-payload.json'
BUILD_PROOF = 'qa/0.34-notices/native-notices-build.json'
RUNTIME_PROOF = 'qa/0.34-notices/native-runtime-integration.json'
OVERLAY = 'archive/native-notices-0.34/source-overlay.json'
EXTRA_SOURCE_REPORTS = {'qa/0.34-notices/research-notices-source-checks.json'}
SUPPORTING_SOURCE = {'tools/check-research-notices-034.cjs', 'tools/test-tower-defense.cjs',
    'qa/0.34-notices/research-notices-source-checks.json',
    'qa/0.34-notices/tower-defense-source-fixture.json'}


def write_json(path, value):
    with path.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.is_file() and path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'],
                'Frozen v0.33 fallback changed: ' + str(path))
    apk = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.33-Test-Ads.apk')
    source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.33-source.zip')
    require(digest(apk) == BASELINE_SHA and digest(source) == SOURCE_SHA, 'Wrong immutable v0.33 baseline')
    return apk, source


def verify_native_sources():
    """Recompute the two C++ overlays against the complete original source."""
    overlay = read_json(ROOT / OVERLAY)
    require(overlay.get('version') == '0.34' and overlay.get('guardPassed') is True,
            'Guarded native source overlay missing')
    require(overlay.get('baselineSourceBundle') == NATIVE_SOURCE
            and digest(ROOT / NATIVE_SOURCE) == overlay.get('baselineSourceBundleSHA256'),
            'Complete native source bundle differs')
    display = digest(ROOT / 'archive/native-hud-0.31/display3d.cpp')
    require(display == overlay.get('priorDisplayOverlaySHA256'), 'Existing v0.31 HUD suppression was lost')
    require(overlay.get('markerPath') == '/tmp/warzone-towers-ui-v34'
            and overlay.get('markerContents') == '1', 'Native opt-in marker differs')
    patcher = runpy.run_path(str(ROOT / 'tools/prepare-native-notices-034.py'), run_name='package_034_overlay')
    entries = overlay.get('files', [])
    require({v['file'] for v in entries} == {'research.cpp', 'keybind.cpp'} and len(entries) == 2,
            'Native source exception is limited to two notification callsites')
    with tarfile.open(ROOT / NATIVE_SOURCE) as archive:
        for entry in entries:
            original = archive.extractfile('source/src/' + entry['file']).read()
            current = (ROOT / 'archive/native-notices-0.34' / entry['file']).read_bytes()
            require(sha256(original).hexdigest() == entry['beforeSHA256'], 'Original C++ source differs')
            require(current == patcher['patched'](entry['file'], original)
                    and sha256(current).hexdigest() == entry['afterSHA256'],
                    'Native overlay changed beyond guarded stock notification suppression: ' + entry['file'])
    require(digest(ROOT / 'archive/native-notices-0.34/native-notices.patch') == overlay.get('patchSHA256'),
            'Native patch does not match its source record')
    build = read_json(ROOT / BUILD_PROOF)
    require(build.get('passed') is True and build.get('nativeBuildPerformed') is True
            and build.get('nativeFullFreshBuildPerformed') is False and build.get('relinkedNativeEngine') is True,
            'Bounded source-build provenance missing')
    require(set(build.get('compiledObjects', [])) == {'src/CMakeFiles/warzone2100.dir/' + n + '.o'
            for n in ('research.cpp', 'keybind.cpp')}, 'Incremental build compiled outside two scoped C++ objects')
    expected = {'display3d.cpp': display} | {v['file']: v['afterSHA256'] for v in entries}
    require(build.get('sourceOverlays') == expected, 'Native build used different overlay sources')
    require(digest(ROOT / 'qa/0.34-notices/native-notices-incremental-build.log') == build.get('logSHA256'),
            'Native build log differs')
    log = (ROOT / 'qa/0.34-notices/native-notices-incremental-build.log').read_text(encoding='utf-8')
    require(sorted(re.findall(r'Building CXX object (\S+)', log)) == sorted(build['compiledObjects'])
            and len(re.findall(r'Linking CXX executable[^\n]*warzone2100', log)) == 1,
            'Build log must show exactly the two C++ compilations and one engine link')
    return {'overlayPath': OVERLAY, 'overlaySHA256': digest(ROOT / OVERLAY),
            'changedCPPFiles': sorted(v['file'] for v in entries),
            'priorHUDOverlayPreserved': True, 'completeNativeBaseSourcePreserved': True,
            'nativeBuildPerformed': True, 'nativeFullFreshBuildPerformed': False}


def verify_native(apk, old):
    """Reconstruct matched-runtime integration and compare every resolved VFS file."""
    runtime = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='package_034_runtime')
    payload, integration, build = (read_json(ROOT / n) for n in (PAYLOAD, RUNTIME_PROOF, BUILD_PROOF))
    before_js = old.read('assets/warzone/warzone2100.js').decode('utf-8')
    before_data = old.read('assets/warzone/warzone2100.data')
    final_js = apk.read('assets/warzone/warzone2100.js').decode('utf-8')
    final_data = apk.read('assets/warzone/warzone2100.data')
    final_wasm = apk.read('assets/warzone/warzone2100.wasm')
    ba, bb, frozen_index, before_index = runtime['package_call'](before_js)
    fa, fb, _, final_index = runtime['package_call'](final_js)
    runtime['verify_index'](before_index, before_data)
    runtime['verify_index'](final_index, final_data)
    require(integration.get('passed') is True and integration.get('generatedCodeUnchangedOutsideIndexAndExistingWorkerHook') is True,
            'Matched loader integration proof missing')
    require(integration.get('baselineAssets', {}).get('jsSHA256') == sha256(before_js.encode()).hexdigest()
            and integration.get('frozenDataSHA256') == sha256(before_data).hexdigest()
            and integration.get('frozenPackageIndexSHA256') == sha256(frozen_index.encode()).hexdigest(),
            'Native runtime integration did not use frozen v0.33 authored data/index')
    raw_record = integration['raw']
    raw_js_path, raw_wasm_path = Path(raw_record['jsPath']), Path(raw_record['wasmPath'])
    require(raw_js_path.is_file() and raw_wasm_path.is_file(), 'Raw source-built pair needed for independent final integration check')
    require(digest(raw_js_path) == raw_record['jsSHA256'] and digest(raw_wasm_path) == raw_record['wasmSHA256'],
            'Raw source-built pair differs from build integration proof')
    built = {v['file']: v for v in build['raw']}
    require(built['warzone2100.js']['sha256'] == raw_record['jsSHA256']
            and built['warzone2100.wasm']['sha256'] == raw_record['wasmSHA256'], 'Native build and integration do not match')
    raw = raw_js_path.read_text(encoding='utf-8')
    ra, rb, _, _ = runtime['package_call'](raw)
    contract = runtime['verify_runtime_contract'](before_js, raw)
    require(integration.get('runtimeContract') == contract, 'Native runtime contract proof differs')
    directory_pattern = r'Module\["FS_createPath"\]\("[^"\\]*","[^"\\]*",true,true\);'
    require(set(re.findall(directory_pattern, before_js)) <= set(re.findall(directory_pattern, raw)),
            'Generated loader cannot mount all frozen authored directories')
    hook_pattern = r'var out=console\.log\.bind\(console\);var blockNightOutputChannel=.*?;var wasmBinary;'
    hooks = re.findall(hook_pattern, before_js, re.S)
    require(len(hooks) == 1, 'Expected exactly one original private output hook')
    hook = hooks[0]
    stdout = 'var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;'
    require(raw.count(stdout) == 1 and 'blockNightOutputChannel' not in raw, 'Unexpected raw loader integration state')
    integrated_js = (raw[:ra] + frozen_index + raw[rb:]).replace(stdout, hook, 1)
    integrated = {v['file']: v for v in integration['integrated']}
    require(sha256(integrated_js.encode()).hexdigest() == integrated['warzone2100.js']['sha256'],
            'Independent source-built loader reconstruction differs')
    ia, ib, _, _ = runtime['package_call'](integrated_js)
    native_body = integrated_js[:ia] + 'PACKAGE_INDEX' + integrated_js[ib:]
    require(final_js[:fa] + 'PACKAGE_INDEX' + final_js[fb:] == native_body,
            'Final generated program changed outside two-scenario package index')
    require(final_wasm == raw_wasm_path.read_bytes()
            and sha256(final_wasm).hexdigest() == integrated['warzone2100.wasm']['sha256'],
            'Final WASM does not match the source-built loader')
    require(final_data[:len(before_data)] == before_data, 'Original native data prefix changed')
    before = {r['filename']: r for r in before_index['files']}
    final = {r['filename']: r for r in final_index['files']}
    require(set(before) == set(final), 'Native VFS inventory added or removed files')
    def contents(data, rows, name):
        row = rows[name]
        return data[int(row['start']):int(row['end'])]
    changed = {n for n in before if contents(before_data, before, n) != contents(final_data, final, n)}
    require(changed == set(VFS_SCOPE), 'Resolved native data changed beyond objective/waves notification hooks')
    segments = []
    for name, source in VFS_SCOPE.items():
        content = (ROOT / source).read_bytes()
        require(contents(final_data, final, name) == content, 'Native scenario is stale: ' + source)
        segments.append((int(final[name]['start']), int(final[name]['end'])))
        require({k: v for k, v in final[name].items() if k not in ('start', 'end')} ==
                {k: v for k, v in before[name].items() if k not in ('start', 'end')}, 'Scenario VFS metadata changed')
    cursor = len(before_data)
    for start, end in sorted(segments):
        require(start == cursor and end >= start, 'Data append contains unreviewed bytes/gaps')
        cursor = end
    require(cursor == len(final_data), 'Unexpected native payload bytes appended')
    require(all(final[n] == before[n] for n in set(before) - set(VFS_SCOPE)), 'Unrelated VFS offsets/metadata changed')
    ignored = {'files', 'remote_package_size', 'package_uuid'}
    require({k: v for k, v in final_index.items() if k not in ignored} ==
            {k: v for k, v in before_index.items() if k not in ignored}, 'Native package metadata changed outside index/size/identity')
    require(payload.get('passed') is True and payload.get('baselineSHA256') == BASELINE_SHA
            and payload.get('baselineDataSHA256') == sha256(before_data).hexdigest()
            and set(payload.get('changedVFSFiles', [])) == changed
            and payload.get('addedVFSFiles') == [] and payload.get('removedVFSFiles') == []
            and payload.get('nativeProgramBodySHA256') == sha256(native_body.encode()).hexdigest()
            and payload.get('matchedWASMSHA256') == sha256(final_wasm).hexdigest(), 'Scenario payload proof differs from shipped bytes')
    for entry in payload['sources'] + payload['outputs']:
        path = ROOT / entry['path']; repo_path(path)
        require(path.is_file() and digest(path) == entry['sha256'] and path.stat().st_size == entry['bytes'],
                'Native source/payload changed: ' + entry['path'])
    require({v['path'] for v in payload['sources']} == SCENARIO_SCOPE
            and {v['path'] for v in payload['outputs']} == {'app/src/main/' + n for n in NATIVE_ASSETS},
            'Native proof source/output scope differs')
    return {'sourceBuiltMatchedRuntimeVerified': True, 'nativeBuildPerformed': True,
            'nativeFullFreshBuildPerformed': False, 'originalDataPrefixUnchanged': True,
            'changedVFSFiles': sorted(changed), 'unchangedResolvedVFSFiles': len(before) - len(changed),
            'allMapsMusicRewardPoliciesAndUnrelatedScenariosFrozen': True,
            'normalizedNativeBodySHA256': sha256(native_body.encode()).hexdigest(),
            'proofs': [{'path': n, 'sha256': digest(ROOT / n)} for n in (PAYLOAD, BUILD_PROOF, RUNTIME_PROOF)]}


def validate_source(source):
    """Source preservation only; this deliberately makes no rendered UI claim."""
    changed, protected = [], []
    with ZipFile(source) as archive:
        names = set(archive.namelist())
        require(len(names) == len(archive.namelist()), 'Duplicate baseline source member')
        manifest = json.loads(archive.read(MANIFEST))
        indexed = {entry['path']: entry for entry in manifest['files']}
        require(set(indexed) == names - {MANIFEST}, 'v0.33 source inventory is incomplete')
        expected_gradle = archive.read(GRADLE).replace(b'versionCode = 33', b'versionCode = 34').replace(
            b'versionName = "0.33"', b'versionName = "0.34"')
        require((ROOT / GRADLE).read_bytes() == expected_gradle, 'Build settings changed beyond version 34')
        require((ROOT / '.gitattributes').read_bytes() == archive.read('.gitattributes'), 'LFS storage rules changed')
        for name, entry in indexed.items():
            if not (name.startswith(('app/src/main/', 'vendor/', 'map/', 'scenario/')) or name in NATIVE_REQUIRED):
                continue
            path = ROOT / name
            require(path.is_file(), 'Required baseline source was removed: ' + name)
            actual = digest(path)
            if actual != entry['sha256']:
                require(name in SOURCE_SCOPE, 'Source changed outside notices/defeat/close-affordance scope: ' + name)
                changed.append({'path': name, 'beforeSHA256': entry['sha256'], 'sha256': actual})
            else:
                protected.append(name)
        app_files = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src/main').rglob('*') if p.is_file()}
        require(app_files - names == ADDED_APP_SOURCE, 'Unexpected new app source/assets: ' + str(sorted(app_files - names)))
        changed_names = {v['path'] for v in changed}
        require(SCENARIO_SCOPE <= changed_names, 'Both scoped scenario notification hooks must change')
        require({'app/src/main/' + n for n in NATIVE_ASSETS} <= changed_names,
                'The scoped native relink and matched payload are missing')
        require('app/src/main/assets/warzone/saved-games.js' in changed_names, 'Save acknowledgement did not change')
    native_overlay = verify_native_sources()
    build = (ROOT / GRADLE).read_text(encoding='utf-8')
    require(all(v in build for v in ('versionCode = 34', 'versionName = "0.34"',
        'com.google.android.gms:play-services-ads:25.5.0', 'com.google.android.ump:user-messaging-platform:4.0.0')),
        'Version or existing pinned ad SDKs changed')
    scope = sorted(SOURCE_SCOPE | NATIVE_NEW | SUPPORTING_SOURCE | {GRADLE})
    return {'changedAppSources': changed, 'preservedOriginalSourceFiles': len(protected),
            'sources': [{'path': name, 'sha256': digest(ROOT / name)} for name in scope],
            'baselineManifestEntries': len(manifest['files']),
            'sourceZIPBaselineSHA256': SOURCE_SHA, 'mapsAndUnrelatedScenariosFrozen': True,
            'nativeSourceOverlay': native_overlay,
            'walletSaveCodecAndAdControllerFrozen': True}


def verify_source_report(path):
    name = repo_path(path); report = read_json(path)
    require(report.get('version') == '0.34' and report.get('emulatorUsed') is False
            and report.get('checksPassed', 0) > 0, 'Current source-only preservation report missing')
    require({v['path'] for v in report.get('sources', [])} >= SOURCE_SCOPE | NATIVE_NEW | SUPPORTING_SOURCE | {GRADLE},
            'Source report must bind the final changed app scope')
    for entry in report['sources']:
        current = ROOT / entry['path']; repo_path(current)
        require(current.is_file() and digest(current) == entry['sha256'], 'Reviewed source changed: ' + entry['path'])
    return {'path': name, 'sha256': digest(path)}


def verify_additional_source_reports():
    reports = []
    for name in sorted(EXTRA_SOURCE_REPORTS):
        report = read_json(ROOT / name)
        require(report.get('version') == '0.34' and report.get('passed') is True
                and report.get('emulatorUsed') is False and report.get('actualNativeEngineExecuted') is False,
                'Additional source-only notice checks missing or mislabeled')
        checks = report.get('checks', [])
        require(checks and len(checks) == report.get('sourceCheckGroupsPassed')
                and all(c.get('name') and c.get('passed') is True for c in checks),
                'Additional source check groups do not match their assertions')
        for entry in report.get('sources', []):
            path = ROOT / entry['path']; repo_path(path)
            require(path.is_file() and digest(path) == entry['sha256'],
                    'Additional reviewed notice source changed: ' + entry['path'])
        require(report.get('sources'), 'Additional source-only checks do not bind their inputs')
        reports.append({'path': name, 'sha256': digest(ROOT / name)})
    name = 'qa/0.34-notices/tower-defense-source-fixture.json'
    report = read_json(ROOT / name)
    require(report.get('passed') is True and report.get('emulatorUsed') is False
            and report.get('gameplayVerified') is False
            and report.get('nativeComponentResolution') == 'not exercised by this fixture',
            'Native-script fixture must disclose its source-only scope')
    require(all(report.get(k) is True for k in ('terminalPackets', 'hqDefeat', 'victory',
            'selectedHumanStockResultsSuppressed')), 'Final native-script terminal fixture did not pass')
    reports.append({'path': name, 'sha256': digest(ROOT / name)})
    return reports


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
            'The compact notifications need an actual small-phone observation')
    focused = proof.get('focusedObservations', {})
    required = ('defeatTransitionVerified', 'researchNoticeVerified', 'saveConfirmationVerified',
                'waveIncomingVerified', 'closeButtonsRemovedVerified')
    require(all(focused.get(k) is True for k in required), 'Required notices/defeat/navigation observation is missing')
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
    additional_reviewed = verify_additional_source_reports()
    preservation = validate_source(source)
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'AppData/Local/Android/Sdk')))
    aapt = sdk / 'build-tools/36.1.0/aapt2.exe'
    with ZipFile(args.apk) as apk, ZipFile(baseline) as old:
        require(apk.testzip() is None, 'Built APK CRC failure')
        names, old_names = set(apk.namelist()), set(old.namelist())
        require(len(names) == len(apk.namelist()), 'Duplicate APK member')
        assets = {n for n in names if n.startswith('assets/')}
        require(assets - {n for n in old_names if n.startswith('assets/')} ==
                {n.removeprefix('app/src/main/') for n in ADDED_APP_SOURCE}
                and not ({n for n in old_names if n.startswith('assets/')} - assets),
                'App asset inventory changed beyond the common notices host')
        changed = [n for n in apk.namelist() if n not in old_names or zip_digest(apk, n) != zip_digest(old, n)]
        removed = old_names - names
        require(all(n in ASSET_SCOPE or metadata(n) for n in changed + list(removed)),
                'APK changed outside approved notices/defeat/close-affordance UI and metadata')
        changed_assets = {n for n in changed if n.startswith('assets/')}
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in assets and digest(path) == zip_digest(apk, name), 'Stale APK asset: ' + name)
        native_names = sorted(NATIVE_ASSETS)
        native_hashes = {n: zip_digest(apk, n) for n in native_names}
        native = verify_native(apk, old)
        require(apk.getinfo(MUSIC_ASSET).file_size == MUSIC_BYTES
                and apk.getinfo(MUSIC_ASSET).compress_type == ZIP_STORED and zip_digest(apk, MUSIC_ASSET) == MUSIC_SHA,
                'Bundled original soundtrack changed or is compressed/extracted')
        dex = [apk.read(n) for n in names if re.fullmatch(r'classes(?:\d+)?\.dex', n)]
        require(dex and any(AD_UNIT_ID.encode('ascii') in v for v in dex)
                and not any(PUBLISHER_AD_UNIT_ID.encode('ascii') in v for v in dex), 'Only sample rewarded ads may ship')
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    require(all(v in badging for v in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='34'",
        "versionName='0.34'", "application-label:'Warzone Towers'", 'application-debuggable')), 'App identity/version changed')
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
    return {'version': '0.34', 'versionCode': 34, 'candidateAPK_SHA256': candidate,
        'scope': 'Defeat return, compact routine notices, wave preview and Research/Production close affordances.',
        'emulatorUsed': True, 'gameplayVerified': False, 'testAdsOnly': True, 'liveAdsTested': False,
        'emulatorProof': {'path': emulator_name, 'sha256': args.expected_emulator_report_sha256},
        'focusedEmulatorChecks': checks, 'focusedObservations': proof['focusedObservations'],
        'emulatorEvidenceFiles': evidence, 'supportingObservations': supporting,
        'smallPhoneConfigurations': configurations, 'sourceCheckReports': [reviewed] + additional_reviewed,
        'changedAPKAssets': sorted(changed_assets), 'changedAPKMembers': changed, 'removedAPKMembers': sorted(removed),
        'sourcePreservation': preservation, 'nativeAssetSHA256': native_hashes,
        'nativePreservation': native, 'bundledMusicByteIdenticalTo033': True,
        'mapsDuelAndScenarioCatalogsUnchanged': True, 'walletSaveCodecAndAdsControllerUnchanged': True,
        'signing': {'sameCertificateAs033': True, 'certificateSHA256': signing_sha},
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
    outputs = [args.output / n for n in ('Warzone-Towers-0.34-Test-Ads.apk', 'warzone-towers-0.34-source.zip', 'Warzone-Towers-0.34-Test-Ads-SHA256.txt')]
    apk_out, source_out, checksums = outputs; partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in outputs + [partial]), 'Frozen delivery/partial must not be overwritten')
    record = validate(args)
    required = NATIVE_REQUIRED | NATIVE_NEW | SUPPORTING_SOURCE | {'tools/package-24-home.py', 'tools/package-34-notices.py',
        'tools/check-notices-034.py', RECORD, FALLBACK, DOC, MANIFEST, 'README.md', 'AGENTS.md', record['emulatorProof']['path']}
    for entry in record['sourceCheckReports'] + record['emulatorEvidenceFiles'] + record['supportingObservations']:
        required.add(entry['path'])
    files = source_inventory(required)
    if args.validate_only:
        print(json.dumps({'validationPassed': True, 'deliveryFilesWritten': False,
            'candidateAPK_SHA256': record['candidateAPK_SHA256'], 'focusedChecks': len(record['focusedEmulatorChecks']),
            'sourceFiles': len(files), 'scopedNativeRelinkAndTwoScenarioReplacementsVerified': True,
            'mapsMusicAndRewardPolicyFrozen': True, 'sameSigningCertificateAs033': True}, indent=2))
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
