"""Guard and package v0.35's full-screen briefings and scoped game notices.

The immutable v0.34 APK and complete source ZIP are the baseline. This does not
depend on v0.34 having been committed to Git. Package only the exact APK checked
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
COMMON = runpy.run_path(str(ROOT / 'tools/package-24-home.py'), run_name='package_035_common')
require, digest, zip_digest = (COMMON[k] for k in ('require', 'digest', 'zip_digest'))
read_json, repo_path, metadata = (COMMON[k] for k in ('read_json', 'repo_path', 'metadata'))
NATIVE_SOURCE, MANIFEST, STORED, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[k] for k in (
    'NATIVE_SOURCE', 'MANIFEST', 'STORED', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
NATIVE_ASSETS = {'assets/warzone/warzone2100.' + ext for ext in ('js', 'data', 'wasm')}
ASSET_SCOPE = NATIVE_ASSETS | {
    'assets/warzone/index.html', 'assets/warzone-towers-wave-hud.js',
    'assets/warzone-towers-notices.js', 'assets/warzone/ui/briefing-start.png',
    'assets/warzone/ui/briefing-defeat.png', 'assets/warzone/briefing.js'}
ADDED_APP_SOURCE = {JAVA + 'BattleBriefingView.java',
    'app/src/main/assets/warzone/ui/briefing-start.png',
    'app/src/main/assets/warzone/ui/briefing-defeat.png',
    'app/src/main/assets/warzone/briefing.js'}
VFS_SCOPE = {
    '/data/mp/multiplay/script/mods/configReader.js': 'scenario/warzone-towers-config-reader.js',
    '/data/mp/multiplay/script/rules/printsettings.js': 'scenario/warzone-towers-printsettings.js'}
SCENARIO_SCOPE = set(VFS_SCOPE.values())
SOURCE_SCOPE = {JAVA + 'MainActivity.java', JAVA + 'BattleBriefingView.java'} | SCENARIO_SCOPE
SOURCE_SCOPE |= {'app/src/main/' + n for n in ASSET_SCOPE}
PREVIOUS = runpy.run_path(str(ROOT / 'tools/package-34-notices.py'), run_name='package_035_previous')
GRADLE = 'app/build.gradle.kts'
FALLBACK = 'archive/fallback-0.35.json'
RECORD = 'archive/release-0.35-focused-tested.json'
SOURCE_REPORT = 'archive/briefings-0.35-source-checks.json'
DOC = 'docs/releases/0.35-briefings.md'
BASELINE_SHA = '4c5c5b6937ea756aea0f46697b0ea6c4f0192d918d88e4caa663a00a149fda7a'
SOURCE_SHA = '34dc0ffd2d255d3d661cf4683ad0cbf9862f75218aaa063c7e0f62eb623564f7'
MUSIC_ASSET = 'assets/warzone/music/music.data'
MUSIC_SHA = '602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd'
MUSIC_BYTES = 114721578
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~3347511713'
AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917'
PUBLISHER_AD_UNIT_ID = 'ca-app-pub-3430279660625393/5338770704'
NATIVE_REQUIRED = PREVIOUS['NATIVE_REQUIRED'] | PREVIOUS['NATIVE_NEW']
NATIVE_NEW = {'archive/native-notices-0.35/' + n for n in (
    'keybind.cpp', 'native-camera-notices.patch', 'source-overlay.json',
    'worker-output-before.js', 'worker-output-after.js', 'worker-output-delta.json', 'README.md')}
NATIVE_NEW |= {'tools/prepare-native-notices-035.py', 'tools/build-native-notices-035.py',
    'tools/integrate-native-notices-035.py', 'tools/embed-notices-035.py',
    'archive/notices-0.35-native-payload.json', 'qa/0.35-notices/native-notices-build.json',
    'qa/0.35-notices/native-runtime-integration.json', 'qa/0.35-notices/native-base-runtime-integration.json',
    'qa/0.35-notices/native-notices-incremental-build.log'}
PAYLOAD = 'archive/notices-0.35-native-payload.json'
BUILD_PROOF = 'qa/0.35-notices/native-notices-build.json'
RUNTIME_PROOF = 'qa/0.35-notices/native-runtime-integration.json'
BASE_RUNTIME_PROOF = 'qa/0.35-notices/native-base-runtime-integration.json'
OVERLAY = 'archive/native-notices-0.35/source-overlay.json'
EXTRA_SOURCE_REPORTS = {'qa/0.35-notices/notices-source-checks.json': '0.35',
    'qa/0.35-notices/research-notices-regression034.json': '0.34'}
SUPPORTING_SOURCE = {'tools/package-34-notices.py', 'tools/check-notices-035.cjs',
    'tools/check-briefing-pause-035.cjs', 'qa/0.35-briefings/pause-source-checks.json'} | set(EXTRA_SOURCE_REPORTS)
NATIVE_SCOPE_FINALIZED = True


def write_json(path, value):
    with path.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.is_file() and path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'],
                'Frozen v0.34 fallback changed: ' + str(path))
    apk = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.34-Test-Ads.apk')
    source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.34-source.zip')
    require(digest(apk) == BASELINE_SHA and digest(source) == SOURCE_SHA, 'Wrong immutable v0.34 baseline')
    return apk, source


def verify_native_sources():
    """Recompute the cumulative four-camera overlay over preserved v0.34."""
    require(NATIVE_SCOPE_FINALIZED, 'Native scope/proof paths are not finalized')
    prior = PREVIOUS['verify_native_sources']()
    overlay = read_json(ROOT / OVERLAY)
    require(overlay.get('version') == '0.35' and overlay.get('guardPassed') is True, 'Native v0.35 overlay missing')
    before_path = ROOT / 'archive/native-notices-0.34/keybind.cpp'
    after_path = ROOT / 'archive/native-notices-0.35/keybind.cpp'
    require(overlay.get('priorSource') == repo_path(before_path) and overlay.get('changedSource') == repo_path(after_path),
            'Native overlay source lineage differs')
    before = before_path.read_bytes()
    require(sha256(before).hexdigest() == overlay.get('beforeSHA256'), 'Prior QuickSave overlay differs')
    patcher = runpy.run_path(str(ROOT / 'tools/prepare-native-notices-035.py'), run_name='package_035_overlay')
    anchor = b'extern char\tScreenDumpPath[];'
    require(before.count(anchor) == 1, 'Native helper anchor differs')
    expected = before.replace(anchor, patcher['HELPER'].encode() + anchor, 1)
    for direction in ('North', 'South', 'East', 'West'):
        old = f'\tCONPRINTF("%s", _("View Aligned to {direction}"));'.encode()
        new = f'\ttowersCameraAlignmentNotice("{direction.lower()}", _("View Aligned to {direction}"));'.encode()
        require(expected.count(old) == 1, 'Camera success source anchor differs')
        expected = expected.replace(old, new, 1)
    require(after_path.read_bytes() == expected and digest(after_path) == overlay.get('afterSHA256'),
            'Cumulative keybind overlay differs beyond four camera notice sites')
    require(overlay.get('markerPath') == '/tmp/warzone-towers-ui-v34' and overlay.get('markerContents') == '1',
            'Existing transient Towers marker changed')
    require(digest(ROOT / 'archive/native-notices-0.34/research.cpp') == overlay.get('preservedResearchSourceSHA256')
            and digest(ROOT / 'archive/native-hud-0.31/display3d.cpp') == overlay.get('preservedDisplaySourceSHA256'),
            'Earlier research/HUD native overlays changed')
    require(digest(ROOT / overlay['patch']) == overlay.get('patchSHA256'), 'Camera source patch differs')
    build = read_json(ROOT / BUILD_PROOF)
    require(build.get('version') == '0.35' and build.get('passed') is True and build.get('nativeBuildPerformed') is True
            and build.get('nativeFullFreshBuildPerformed') is False and build.get('relinkedNativeEngine') is True,
            'Bounded native v0.35 build provenance missing')
    require(build.get('compiledObjects') == ['src/CMakeFiles/warzone2100.dir/keybind.cpp.o'],
            'Native v0.35 build must compile only keybind.cpp')
    expected_sources = {'keybind.cpp': digest(after_path),
        'research.cpp': overlay['preservedResearchSourceSHA256'], 'display3d.cpp': overlay['preservedDisplaySourceSHA256']}
    require(build.get('sourceOverlays') == expected_sources and build.get('sourceOverlaySHA256') == digest(ROOT / OVERLAY),
            'Native build used different source overlays')
    log_path = ROOT / 'qa/0.35-notices/native-notices-incremental-build.log'
    require(digest(log_path) == build.get('logSHA256'), 'Native build log differs')
    log = log_path.read_text(encoding='utf-8')
    require(re.findall(r'Building CXX object (\S+)', log) == build['compiledObjects']
            and len(re.findall(r'Linking CXX executable[^\n]*warzone2100', log)) == 1,
            'Build log must show exactly one keybind compilation and one link')
    return {'overlayPath': OVERLAY, 'overlaySHA256': digest(ROOT / OVERLAY), 'changedCPPFiles': ['keybind.cpp'],
            'priorSourceOverlay': prior, 'nativeBuildPerformed': True, 'nativeFullFreshBuildPerformed': False}


def verify_native(apk, old):
    """Reconstruct matched-runtime integration and compare every resolved VFS file."""
    runtime = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='package_035_runtime')
    payload, integration, build, base_integration = (read_json(ROOT / n) for n in (PAYLOAD, RUNTIME_PROOF, BUILD_PROOF, BASE_RUNTIME_PROOF))
    before_js = old.read('assets/warzone/warzone2100.js').decode('utf-8')
    before_data = old.read('assets/warzone/warzone2100.data')
    final_js = apk.read('assets/warzone/warzone2100.js').decode('utf-8')
    final_data = apk.read('assets/warzone/warzone2100.data')
    final_wasm = apk.read('assets/warzone/warzone2100.wasm')
    ba, bb, frozen_index, before_index = runtime['package_call'](before_js)
    fa, fb, _, final_index = runtime['package_call'](final_js)
    runtime['verify_index'](before_index, before_data)
    runtime['verify_index'](final_index, final_data)
    require(integration.get('passed') is True and integration.get('generatedCodeUnchangedOutsideIndexAndReviewedWorkerHook') is True
            and integration.get('noticeRouteOnlyWorkerHookChange') is True
            and base_integration.get('passed') is True
            and base_integration.get('generatedCodeUnchangedOutsideIndexAndExistingWorkerHook') is True,
            'Matched loader integration proof missing')
    require(integration.get('baselineSHA256') == BASELINE_SHA
            and base_integration.get('baselineAPK', {}).get('sha256') == BASELINE_SHA
            and integration.get('frozenDataSHA256') == sha256(before_data).hexdigest()
            and integration.get('frozenPackageIndexSHA256') == sha256(frozen_index.encode()).hexdigest(),
            'Native runtime integration did not use frozen v0.34 authored data/index')
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
    delta = read_json(ROOT / 'archive/native-notices-0.35/worker-output-delta.json')
    old_filter = 'text.includes("BNQUEUE")))'
    new_filter = 'text.includes("BNQUEUE")||text.includes("BNNOTICE")))'
    require(hook.count(old_filter) == 1, 'Expected original private filter anchor differs')
    reviewed_hook = hook.replace(old_filter, new_filter, 1)
    require(delta.get('passed') is True and delta.get('version') == '0.35'
            and delta.get('replaceFrom') == old_filter and delta.get('replaceTo') == new_filter
            and delta.get('replacementCount') == 1
            and delta.get('beforeSHA256') == sha256(hook.encode()).hexdigest()
            and delta.get('afterSHA256') == sha256(reviewed_hook.encode()).hexdigest(),
            'Reviewed worker-route delta differs')
    require((ROOT / 'archive/native-notices-0.35/worker-output-before.js').read_bytes() == hook.encode()
            and (ROOT / 'archive/native-notices-0.35/worker-output-after.js').read_bytes() == reviewed_hook.encode(),
            'Worker route before/after source files differ')
    require(integration.get('workerHookBeforeSHA256') == delta['beforeSHA256']
            and integration.get('workerHookAfterSHA256') == delta['afterSHA256'], 'Worker hook build proof differs')
    stdout = 'var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;'
    require(raw.count(stdout) == 1 and 'blockNightOutputChannel' not in raw, 'Unexpected raw loader integration state')
    base_js = (raw[:ra] + frozen_index + raw[rb:]).replace(stdout, hook, 1)
    base_outputs = {v['file']: v for v in base_integration['integrated']}
    require(sha256(base_js.encode()).hexdigest() == base_outputs['warzone2100.js']['sha256'],
            'Independent base matched-loader reconstruction differs')
    integrated_js = base_js.replace(hook, reviewed_hook, 1)
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
            'workerHookChangedOnlyByBNNOTICERoute': True,
            'allMapsMusicRewardPoliciesAndUnrelatedScenariosFrozen': True,
            'normalizedNativeBodySHA256': sha256(native_body.encode()).hexdigest(),
            'proofs': [{'path': n, 'sha256': digest(ROOT / n)} for n in (PAYLOAD, BUILD_PROOF, RUNTIME_PROOF, BASE_RUNTIME_PROOF)]}


def validate_source(source):
    """Source preservation only; this deliberately makes no rendered UI claim."""
    changed, protected = [], []
    with ZipFile(source) as archive:
        names = set(archive.namelist())
        require(len(names) == len(archive.namelist()), 'Duplicate baseline source member')
        manifest = json.loads(archive.read(MANIFEST))
        indexed = {entry['path']: entry for entry in manifest['files']}
        require(set(indexed) == names - {MANIFEST}, 'v0.34 source inventory is incomplete')
        expected_gradle = archive.read(GRADLE).replace(b'versionCode = 34', b'versionCode = 35').replace(
            b'versionName = "0.34"', b'versionName = "0.35"')
        require((ROOT / GRADLE).read_bytes() == expected_gradle, 'Build settings changed beyond version 35')
        require((ROOT / '.gitattributes').read_bytes() == archive.read('.gitattributes'), 'LFS storage rules changed')
        for name, entry in indexed.items():
            if not (name.startswith(('app/src/main/', 'vendor/', 'map/', 'scenario/')) or name in NATIVE_REQUIRED):
                continue
            path = ROOT / name
            require(path.is_file(), 'Required baseline source was removed: ' + name)
            actual = digest(path)
            if actual != entry['sha256']:
                require(name in SOURCE_SCOPE, 'Source changed outside briefings/start/round/camera scope: ' + name)
                changed.append({'path': name, 'beforeSHA256': entry['sha256'], 'sha256': actual})
            else:
                protected.append(name)
        app_files = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src/main').rglob('*') if p.is_file()}
        require(app_files - names == ADDED_APP_SOURCE, 'Unexpected new app source/assets: ' + str(sorted(app_files - names)))
        changed_names = {v['path'] for v in changed}
        require(SCENARIO_SCOPE <= changed_names | {n for n in SCENARIO_SCOPE if n not in names and (ROOT / n).is_file()},
                'Both scoped scenario banner replacements must be present')
        require({'app/src/main/' + n for n in NATIVE_ASSETS} <= changed_names,
                'The scoped native relink and matched payload are missing')
        require(JAVA + 'MainActivity.java' in changed_names, 'Native briefing lifecycle integration missing')
    native_overlay = verify_native_sources()
    build = (ROOT / GRADLE).read_text(encoding='utf-8')
    require(all(v in build for v in ('versionCode = 35', 'versionName = "0.35"',
        'com.google.android.gms:play-services-ads:25.5.0', 'com.google.android.ump:user-messaging-platform:4.0.0')),
        'Version or existing pinned ad SDKs changed')
    scope = sorted(SOURCE_SCOPE | NATIVE_NEW | SUPPORTING_SOURCE | {GRADLE})
    return {'changedAppSources': changed, 'addedAppSources': sorted(ADDED_APP_SOURCE),
            'preservedOriginalSourceFiles': len(protected),
            'sources': [{'path': name, 'sha256': digest(ROOT / name)} for name in scope],
            'baselineManifestEntries': len(manifest['files']),
            'sourceZIPBaselineSHA256': SOURCE_SHA, 'mapsAndUnrelatedScenariosFrozen': True,
            'nativeSourceOverlay': native_overlay,
            'walletSaveCodecAndAdControllerFrozen': True}


def verify_source_report(path):
    name = repo_path(path); report = read_json(path)
    require(report.get('version') == '0.35' and report.get('emulatorUsed') is False
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
        require(report.get('version') == EXTRA_SOURCE_REPORTS[name] and report.get('passed') is True
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
    name = 'qa/0.35-briefings/pause-source-checks.json'
    pause = read_json(ROOT / name)
    require(pause.get('passed') is True and pause.get('emulatorUsed') is False
            and pause.get('gameplayVerified') is False and pause.get('groups') == 7
            and len(pause.get('checks', [])) == 7
            and pause.get('sourceSHA256') == digest(ROOT / 'app/src/main/assets/warzone/briefing.js'),
            'Seven-group pause fixture does not bind the final briefing helper or source-only scope')
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
            'Full-screen briefings and compact notifications need an actual small-phone observation')
    focused = proof.get('focusedObservations', {})
    required = ('startBriefingVerified', 'defeatBriefingVerified', 'roundNoticeVerified',
                'startupInstructionsVerified', 'cameraAlignmentNoticeVerified')
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
                {n.removeprefix('app/src/main/') for n in ADDED_APP_SOURCE if n.startswith('app/src/main/assets/')}
                and not ({n for n in old_names if n.startswith('assets/')} - assets),
                'App asset inventory changed beyond the common notices host')
        changed = [n for n in apk.namelist() if n not in old_names or zip_digest(apk, n) != zip_digest(old, n)]
        removed = old_names - names
        require(all(n in ASSET_SCOPE or metadata(n) for n in changed + list(removed)),
                'APK changed outside approved briefings/start/round/camera UI and metadata')
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
    require(all(v in badging for v in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='35'",
        "versionName='0.35'", "application-label:'Warzone Towers'", 'application-debuggable')), 'App identity/version changed')
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
    return {'version': '0.35', 'versionCode': 35, 'candidateAPK_SHA256': candidate,
        'scope': 'Full-screen start/defeat briefings and scoped black/white round/start/camera notices.',
        'emulatorUsed': True, 'gameplayVerified': False, 'testAdsOnly': True, 'liveAdsTested': False,
        'emulatorProof': {'path': emulator_name, 'sha256': args.expected_emulator_report_sha256},
        'focusedEmulatorChecks': checks, 'focusedObservations': proof['focusedObservations'],
        'emulatorEvidenceFiles': evidence, 'supportingObservations': supporting,
        'smallPhoneConfigurations': configurations, 'sourceCheckReports': [reviewed] + additional_reviewed,
        'changedAPKAssets': sorted(changed_assets), 'changedAPKMembers': changed, 'removedAPKMembers': sorted(removed),
        'sourcePreservation': preservation, 'nativeAssetSHA256': native_hashes,
        'nativePreservation': native, 'bundledMusicByteIdenticalTo034': True,
        'mapsDuelAndScenarioCatalogsUnchanged': True, 'walletSaveCodecAndAdsControllerUnchanged': True,
        'signing': {'sameCertificateAs034': True, 'certificateSHA256': signing_sha},
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
    outputs = [args.output / n for n in ('Warzone-Towers-0.35-Test-Ads.apk', 'warzone-towers-0.35-source.zip', 'Warzone-Towers-0.35-Test-Ads-SHA256.txt')]
    apk_out, source_out, checksums = outputs; partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in outputs + [partial]), 'Frozen delivery/partial must not be overwritten')
    record = validate(args)
    required = NATIVE_REQUIRED | NATIVE_NEW | SUPPORTING_SOURCE | {'tools/package-24-home.py', 'tools/package-35-briefings.py',
        'tools/check-briefings-035.py', RECORD, FALLBACK, DOC, MANIFEST, 'README.md', 'AGENTS.md', record['emulatorProof']['path']}
    for entry in record['sourceCheckReports'] + record['emulatorEvidenceFiles'] + record['supportingObservations']:
        required.add(entry['path'])
    files = source_inventory(required)
    if args.validate_only:
        print(json.dumps({'validationPassed': True, 'deliveryFilesWritten': False,
            'candidateAPK_SHA256': record['candidateAPK_SHA256'], 'focusedChecks': len(record['focusedEmulatorChecks']),
            'sourceFiles': len(files), 'scopedNativeRelinkAndTwoScenarioReplacementsVerified': True,
            'mapsMusicAndRewardPolicyFrozen': True, 'sameSigningCertificateAs034': True}, indent=2))
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
