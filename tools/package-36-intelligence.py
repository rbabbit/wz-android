"""Guard and package v0.36's Demolish and completed-research Intelligence.

The immutable v0.35 APK and complete source ZIP are the baseline. This does not
depend on v0.35 having been committed to Git. Package only the exact APK checked
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
import ast

ROOT = Path(__file__).resolve().parents[1]
COMMON = runpy.run_path(str(ROOT / 'tools/package-24-home.py'), run_name='package_036_common')
require, digest, zip_digest = (COMMON[k] for k in ('require', 'digest', 'zip_digest'))
read_json, repo_path, metadata = (COMMON[k] for k in ('read_json', 'repo_path', 'metadata'))
NATIVE_SOURCE, MANIFEST, STORED, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[k] for k in (
    'NATIVE_SOURCE', 'MANIFEST', 'STORED', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
NATIVE_ASSETS = {'assets/warzone/warzone2100.' + ext for ext in ('js', 'data', 'wasm')}
ASSET_SCOPE = NATIVE_ASSETS | {'assets/warzone-intelligence.js',
    'assets/warzone/ui/towers-intelligence.css', 'assets/warzone-html-session.js', 'assets/warzone/index.html',
    'assets/warzone-towers-notices.js', 'assets/warzone-touch-controls.js',
    'assets/warzone-command-pages.js', 'assets/warzone/ui/build-display.js',
    'assets/warzone/ui/towers-shell.css'}
ADDED_APP_SOURCE = {'app/src/main/assets/warzone-intelligence.js',
    'app/src/main/assets/warzone/ui/towers-intelligence.css'}
VFS_SCOPE = {'/data/mp/tests/warzone-towers-commands.js': 'scenario/warzone-towers-commands.js'}
SCENARIO_SCOPE = set(VFS_SCOPE.values())
SOURCE_SCOPE = {JAVA + 'MainActivity.java'} | SCENARIO_SCOPE
SOURCE_SCOPE |= {'app/src/main/' + n for n in ASSET_SCOPE}
PREVIOUS = runpy.run_path(str(ROOT / 'tools/package-35-briefings.py'), run_name='package_036_previous')
GRADLE = 'app/build.gradle.kts'
FALLBACK = 'archive/fallback-0.36.json'
RECORD = 'archive/release-0.36-focused-tested.json'
SOURCE_REPORT = 'archive/intelligence-0.36-source-checks.json'
DOC = 'docs/releases/0.36-intelligence.md'
BASELINE_SHA = '438d8f708da975270973cfee65c67ce71739132d9d979cbf8d462bb2176c2e06'
SOURCE_SHA = 'd1dfce3a5ae6926517e07d13be3709c7e63d73345ec514ea7cad7a581af85524'
MUSIC_ASSET = 'assets/warzone/music/music.data'
MUSIC_SHA = '602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd'
MUSIC_BYTES = 114721578
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~3347511713'
AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917'
PUBLISHER_AD_UNIT_ID = 'ca-app-pub-3430279660625393/5338770704'
NATIVE_REQUIRED = PREVIOUS['NATIVE_REQUIRED'] | PREVIOUS['NATIVE_NEW'] | {
    'tools/package-34-notices.py', 'tools/package-35-briefings.py'}
NATIVE_NEW = {'archive/native-intelligence-0.36/' + n for n in (
    'hci.cpp', 'intelligence-helper.inc', 'native-intelligence.patch', 'source-overlay.json', 'README.md')}
NATIVE_NEW |= {'tools/prepare-native-intelligence-036.py', 'tools/build-native-intelligence-036.py',
    'tools/integrate-native-intelligence-036.py', 'tools/embed-demolish-036.py',
    'qa/0.36-demolish/native-payload.json', 'qa/0.36-intelligence/native-intelligence-build.json',
    'qa/0.36-intelligence/native-runtime-integration.json',
    'qa/0.36-intelligence/native-intelligence-incremental-build.log',
    'qa/0.36-intelligence/native-intelligence-first-compile-missing-header.log'}
PAYLOAD = 'qa/0.36-demolish/native-payload.json'
BUILD_PROOF = 'qa/0.36-intelligence/native-intelligence-build.json'
RUNTIME_PROOF = 'qa/0.36-intelligence/native-runtime-integration.json'
OVERLAY = 'archive/native-intelligence-0.36/source-overlay.json'
SUPPORTING_SOURCE = {'tools/check-demolish-036.cjs', 'qa/0.36-demolish/source-checks.json',
    'tools/check-intelligence-ui-036.cjs', 'qa/0.36-intelligence/ui-source-checks.json',
    'tools/qa-intelligence-demolish-036.cjs', 'tools/qa-restore-036.cjs',
    'tools/record-focused-intelligence-036.py'}


def write_json(path, value):
    with path.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.is_file() and path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'],
                'Frozen v0.35 fallback changed: ' + str(path))
    apk = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.35-Test-Ads.apk')
    source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.35-source.zip')
    require(digest(apk) == BASELINE_SHA and digest(source) == SOURCE_SHA, 'Wrong immutable v0.35 baseline')
    return apk, source


def verify_native_sources():
    """Reconstruct the one-file hci extension over the full preserved native source."""
    prior = PREVIOUS['verify_native_sources']()
    overlay = read_json(ROOT / OVERLAY)
    require(overlay.get('version') == '0.36' and overlay.get('guardPassed') is True,
            'Native Intelligence overlay missing')
    require(overlay.get('baselineSourceBundle') == NATIVE_SOURCE
            and overlay.get('baselineSourceEntry') == 'source/src/hci.cpp', 'Native base source lineage differs')
    with tarfile.open(ROOT / NATIVE_SOURCE) as archive:
        original = archive.extractfile('source/src/hci.cpp').read()
    require(sha256(original).hexdigest() == overlay.get('beforeSHA256'), 'Original hci.cpp differs')
    helper_path = ROOT / 'archive/native-intelligence-0.36/intelligence-helper.inc'
    require(digest(helper_path) == overlay.get('helperSHA256'), 'Native Intelligence helper differs')
    tree = ast.parse((ROOT / 'tools/prepare-native-intelligence-036.py').read_text(encoding='utf-8'))
    headers = [ast.literal_eval(n.value) for n in ast.walk(tree) if isinstance(n, ast.Assign)
               and any(isinstance(t, ast.Name) and t.id == 'headers' for t in n.targets)]
    require(len(headers) == 1 and isinstance(headers[0], bytes), 'Expected exact native header block')
    def replace_once(value, before, after):
        require(value.count(before) == 1, 'Native hook anchor differs')
        return value.replace(before, after, 1)
    result = replace_once(original, b'bool intInitialise()\n{',
        b'namespace { static void towersIntelligenceReset(); }\n\nbool intInitialise()\n{\n\ttowersIntelligenceReset();')
    result = replace_once(result, b'void interfaceShutDown()\n{',
        b'void interfaceShutDown()\n{\n\ttowersIntelligenceReset();')
    result = replace_once(result, b'void intDisplayWidgets()\n',
        headers[0] + helper_path.read_bytes() + b'\nvoid intDisplayWidgets()\n')
    anchor = b'\tif (bLoadSaveUp)\n\t{\n\t\tdisplayLoadSave();\n\t}\n}\n\nvoid intShowWidgetHelp()'
    result = replace_once(result, anchor, anchor.replace(b'\n}\n\nvoid intShowWidgetHelp()',
        b'\n\ttowersIntelligenceFrame();\n}\n\nvoid intShowWidgetHelp()'))
    current = ROOT / 'archive/native-intelligence-0.36/hci.cpp'
    require(current.read_bytes() == result and digest(current) == overlay.get('afterSHA256'),
            'Native source changed beyond Intelligence helper and three lifecycle hooks')
    require(digest(ROOT / 'archive/native-intelligence-0.36/native-intelligence.patch') == overlay.get('patchSHA256'),
            'Native patch differs')
    preserved = {name: digest(ROOT / relative) for name, relative in {
        'display3d.cpp':'archive/native-hud-0.31/display3d.cpp',
        'research.cpp':'archive/native-notices-0.34/research.cpp',
        'keybind.cpp':'archive/native-notices-0.35/keybind.cpp'}.items()}
    require(overlay.get('preservedSourceOverlays') == preserved, 'Earlier native overlays changed')
    build = read_json(ROOT / BUILD_PROOF)
    require(build.get('version') == '0.36' and build.get('passed') is True and build.get('nativeBuildPerformed') is True
            and build.get('nativeFullFreshBuildPerformed') is False and build.get('relinkedNativeEngine') is True,
            'Bounded native Intelligence build provenance missing')
    require(build.get('compiledObjects') == ['src/CMakeFiles/warzone2100.dir/hci.cpp.o'],
            'Only hci.cpp may compile for the Intelligence extension')
    require(build.get('sourceOverlays') == preserved | {'hci.cpp': digest(current)}
            and build.get('sourceOverlaySHA256') == digest(ROOT / OVERLAY), 'Native build source hashes differ')
    log_path = ROOT / 'qa/0.36-intelligence/native-intelligence-incremental-build.log'
    require(digest(log_path) == build.get('logSHA256'), 'Native successful build log differs')
    log = log_path.read_text(encoding='utf-8')
    require(re.findall(r'Building CXX object (\S+)', log) == build['compiledObjects']
            and len(re.findall(r'Linking CXX executable[^\n]*warzone2100', log)) == 1,
            'Successful build log must show one hci compilation and one native link')
    first = build.get('priorCompileAttempt', {})
    require(first.get('successful') is False and first.get('nativeRuntimeInstalled') is False
            and digest(ROOT / first['log']) == first.get('logSHA256'), 'Initial failed compile is not accurately disclosed')
    return {'overlayPath': OVERLAY, 'overlaySHA256': digest(ROOT / OVERLAY), 'changedCPPFiles': ['hci.cpp'],
            'priorSourceOverlay': prior, 'nativeBuildPerformed': True, 'nativeFullFreshBuildPerformed': False,
            'priorFailedCompileDisclosed': True}


def verify_native(apk, old):
    """Reconstruct the source-built runtime; compare all VFS bytes to frozen v0.35."""
    runtime = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='package_036_runtime')
    payload, integration, build = (read_json(ROOT / n) for n in (PAYLOAD, RUNTIME_PROOF, BUILD_PROOF))
    before_js = old.read('assets/warzone/warzone2100.js').decode('utf-8')
    before_data = old.read('assets/warzone/warzone2100.data')
    final_js = apk.read('assets/warzone/warzone2100.js').decode('utf-8')
    final_data = apk.read('assets/warzone/warzone2100.data')
    final_wasm = apk.read('assets/warzone/warzone2100.wasm')
    _, _, frozen_index, before_index = runtime['package_call'](before_js)
    fa, fb, _, final_index = runtime['package_call'](final_js)
    runtime['verify_index'](before_index, before_data); runtime['verify_index'](final_index, final_data)
    require(integration.get('passed') is True and integration.get('version') == '0.36'
            and integration.get('baselineSHA256') == BASELINE_SHA
            and integration.get('generatedCodeUnchangedOutsideIndexAndExistingWorkerHook') is True
            and integration.get('intelligenceVFSChanges') == [] and integration.get('workerHookChanged') is False,
            'Matched native Intelligence integration proof differs')
    require(integration.get('baselineAssets', {}).get('jsSHA256') == sha256(before_js.encode()).hexdigest()
            and integration.get('frozenDataSHA256') == sha256(before_data).hexdigest()
            and integration.get('frozenPackageIndexSHA256') == sha256(frozen_index.encode()).hexdigest(),
            'Native integration did not use frozen v0.35 data/index')
    raw_record = integration['raw']; raw_js_path = Path(raw_record['jsPath']); raw_wasm_path = Path(raw_record['wasmPath'])
    require(raw_js_path.is_file() and raw_wasm_path.is_file(), 'Raw matched runtime needed for independent integration check')
    require(digest(raw_js_path) == raw_record['jsSHA256'] and digest(raw_wasm_path) == raw_record['wasmSHA256'],
            'Raw source-built runtime hashes differ')
    built = {v['file']:v for v in build['raw']}
    require(built['warzone2100.js']['sha256'] == raw_record['jsSHA256']
            and built['warzone2100.wasm']['sha256'] == raw_record['wasmSHA256'], 'Build/integration pairs differ')
    raw = raw_js_path.read_bytes().decode('utf-8'); ra, rb, _, _ = runtime['package_call'](raw)
    require(runtime['verify_runtime_contract'](before_js, raw) == integration.get('runtimeContract'), 'Runtime exports differ')
    directories = r'Module\["FS_createPath"\]\("[^"\\]*","[^"\\]*",true,true\);'
    require(set(re.findall(directories, before_js)) <= set(re.findall(directories, raw)), 'Frozen authored directories missing')
    hooks = re.findall(r'var out=console\.log\.bind\(console\);var blockNightOutputChannel=.*?;var wasmBinary;', before_js, re.S)
    require(len(hooks) == 1, 'Expected one original private worker hook'); hook = hooks[0]
    require(sha256(hook.encode()).hexdigest() == integration.get('frozenWorkerOutputHookSHA256'), 'Private output hook changed')
    stdout = 'var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;'
    require(raw.count(stdout) == 1 and 'blockNightOutputChannel' not in raw, 'Unexpected raw integration state')
    integrated_js = (raw[:ra] + frozen_index + raw[rb:]).replace(stdout, hook, 1)
    integrated = {v['file']:v for v in integration['integrated']}
    require(sha256(integrated_js.encode()).hexdigest() == integrated['warzone2100.js']['sha256'], 'Reconstructed loader differs')
    ia, ib, _, _ = runtime['package_call'](integrated_js)
    body = integrated_js[:ia] + 'PACKAGE_INDEX' + integrated_js[ib:]
    require(final_js[:fa] + 'PACKAGE_INDEX' + final_js[fb:] == body, 'Generated program changed outside Demolish package index')
    require(final_wasm == raw_wasm_path.read_bytes()
            and sha256(final_wasm).hexdigest() == integrated['warzone2100.wasm']['sha256'], 'Final WASM does not match loader')
    require(final_data[:len(before_data)] == before_data, 'Frozen native data prefix changed')
    before = {r['filename']:r for r in before_index['files']}; final = {r['filename']:r for r in final_index['files']}
    require(set(before) == set(final), 'Native VFS inventory changed')
    def contents(data, rows, name):
        row = rows[name]; return data[int(row['start']):int(row['end'])]
    changed = {n for n in before if contents(before_data,before,n) != contents(final_data,final,n)}
    require(changed == set(VFS_SCOPE), 'Native VFS changed beyond the Demolish command adapter')
    for virtual, relative in VFS_SCOPE.items():
        content = (ROOT / relative).read_bytes(); row = final[virtual]
        require(contents(final_data,final,virtual) == content and int(row['start']) == len(before_data)
                and int(row['end']) == len(final_data) and len(final_data) == len(before_data)+len(content),
                'Appended Demolish adapter is stale or unexpected bytes were appended')
        require({k:v for k,v in row.items() if k not in ('start','end')} ==
                {k:v for k,v in before[virtual].items() if k not in ('start','end')}, 'Command adapter metadata changed')
    require(all(final[n] == before[n] for n in set(before)-set(VFS_SCOPE)), 'Unrelated VFS offsets/metadata changed')
    ignore = {'files','remote_package_size','package_uuid'}
    require({k:v for k,v in final_index.items() if k not in ignore} == {k:v for k,v in before_index.items() if k not in ignore},
            'Native package metadata changed outside the reviewed append/index')
    require(payload.get('version') == '0.36' and payload.get('passed') is True
            and payload.get('nativeRuntimeProof') == RUNTIME_PROOF
            and set(payload.get('changedVFSFiles',[])) == changed and payload.get('addedVFSFiles') == []
            and payload.get('removedVFSFiles') == [] and payload.get('frozenDataPrefixUnchanged') is True
            and payload.get('nativeProgramUnchangedOutsidePackageIndex') is True
            and payload.get('matchedWASMUnchanged') is True, 'Demolish payload proof differs')
    source = payload['source']; require(source['path'] in SCENARIO_SCOPE, 'Wrong command adapter source')
    require(digest(ROOT / source['path']) == source['sha256'] and (ROOT/source['path']).stat().st_size == source['bytes'],
            'Demolish source proof is stale')
    outputs = {v['file']:v for v in payload['outputs']}
    require(set(outputs) == {'warzone2100.'+ext for ext in ('js','data','wasm')}, 'Wrong native output inventory')
    for file,entry in outputs.items():
        shipped = apk.read('assets/warzone/'+file)
        require(len(shipped) == entry['bytes'] and sha256(shipped).hexdigest() == entry['sha256'], 'Shipped native bytes differ from proof')
    return {'sourceBuiltMatchedRuntimeVerified':True,'nativeBuildPerformed':True,'nativeFullFreshBuildPerformed':False,
            'originalDataPrefixUnchanged':True,'workerHookUnchanged':True,'changedVFSFiles':sorted(changed),
            'unchangedResolvedVFSFiles':len(before)-len(changed),'allModelsAudioMapsAndUnrelatedVFSBytesFrozen':True,
            'normalizedNativeBodySHA256':sha256(body.encode()).hexdigest(),
            'proofs':[{'path':n,'sha256':digest(ROOT/n)} for n in (PAYLOAD,BUILD_PROOF,RUNTIME_PROOF)]}


def validate_source(source):
    """Source preservation only; this deliberately makes no rendered UI claim."""
    changed, protected = [], []
    with ZipFile(source) as archive:
        names = set(archive.namelist())
        require(len(names) == len(archive.namelist()), 'Duplicate baseline source member')
        manifest = json.loads(archive.read(MANIFEST))
        indexed = {entry['path']: entry for entry in manifest['files']}
        require(set(indexed) == names - {MANIFEST}, 'v0.35 source inventory is incomplete')
        expected_gradle = archive.read(GRADLE).replace(b'versionCode = 35', b'versionCode = 36').replace(
            b'versionName = "0.35"', b'versionName = "0.36"')
        require((ROOT / GRADLE).read_bytes() == expected_gradle, 'Build settings changed beyond version 36')
        require((ROOT / '.gitattributes').read_bytes() == archive.read('.gitattributes'), 'LFS storage rules changed')
        for name, entry in indexed.items():
            if not (name.startswith(('app/src/main/', 'vendor/', 'map/', 'scenario/')) or name in NATIVE_REQUIRED):
                continue
            path = ROOT / name
            require(path.is_file(), 'Required baseline source was removed: ' + name)
            actual = digest(path)
            if actual != entry['sha256']:
                require(name in SOURCE_SCOPE, 'Source changed outside demolish/intelligence scope: ' + name)
                changed.append({'path': name, 'beforeSHA256': entry['sha256'], 'sha256': actual})
            else:
                protected.append(name)
        app_files = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src/main').rglob('*') if p.is_file()}
        require(app_files - names == ADDED_APP_SOURCE, 'Unexpected new app source/assets: ' + str(sorted(app_files - names)))
        changed_names = {v['path'] for v in changed}
        require(SCENARIO_SCOPE <= changed_names | {n for n in SCENARIO_SCOPE if n not in names and (ROOT / n).is_file()},
                'The scoped Demolish command adapter must be present')
        require({'app/src/main/' + n for n in NATIVE_ASSETS} <= changed_names,
                'The scoped native relink and matched payload are missing')
        require(JAVA + 'MainActivity.java' in changed_names, 'Intelligence host integration missing')
    native_overlay = verify_native_sources()
    build = (ROOT / GRADLE).read_text(encoding='utf-8')
    require(all(v in build for v in ('versionCode = 36', 'versionName = "0.36"',
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
    require(report.get('version') == '0.36' and report.get('emulatorUsed') is False
            and report.get('checksPassed', 0) > 0, 'Current source-only preservation report missing')
    require({v['path'] for v in report.get('sources', [])} >= SOURCE_SCOPE | NATIVE_NEW | SUPPORTING_SOURCE | {GRADLE},
            'Source report must bind the final changed app scope')
    for entry in report['sources']:
        current = ROOT / entry['path']; repo_path(current)
        require(current.is_file() and digest(current) == entry['sha256'], 'Reviewed source changed: ' + entry['path'])
    return {'path': name, 'sha256': digest(path)}


def verify_additional_source_reports():
    name = 'qa/0.36-demolish/source-checks.json'
    report = read_json(ROOT / name)
    require(report.get('version') == '0.36' and report.get('passed') is True
            and report.get('checks', 0) >= 16
            and 'no native gameplay or emulator verification' in report.get('scope',''),
            'Focused Demolish source/VM/geometry proof missing or mislabeled')
    reports = [{'path':name,'sha256':digest(ROOT/name)}]
    ui_name = 'qa/0.36-intelligence/ui-source-checks.json'
    ui = read_json(ROOT / ui_name)
    require(ui.get('version') == '0.36' and ui.get('passed') is True
            and len(ui.get('checks', [])) >= 15
            and all(c.get('name') and c.get('passed') is True for c in ui.get('checks', []))
            and 'no Android/native gameplay' in ui.get('scope', ''),
            'Intelligence DOM/native-transport fixture missing or mislabeled')
    for report in (report, ui):
        entries = report.get('sources', [])
        if not entries and isinstance(report.get('inputSHA256'), dict):
            entries = [{'path':p,'sha256':v} for p,v in report['inputSHA256'].items()]
        require(entries, 'Source fixture must bind its actual inputs')
        for entry in entries:
            path = ROOT / entry['path']; repo_path(path)
            require(path.is_file() and digest(path) == entry['sha256'],
                    'Reviewed fixture input changed: ' + entry['path'])
    reports.append({'path':ui_name,'sha256':digest(ROOT/ui_name)})
    return reports


def verify_emulator(args, candidate):
    name = repo_path(args.emulator_report)
    require(digest(args.emulator_report) == args.expected_emulator_report_sha256, 'Emulator proof hash differs')
    proof = read_json(args.emulator_report)
    require(proof.get('candidateAPK_SHA256') == candidate and proof.get('emulatorUsed') is True,
            'Runtime observations must bind the exact delivery APK')
    require(proof.get('gameplayVerified') is False and proof.get('liveAdsTested', False) is False
            and proof.get('testAdsOnly') is True, 'Focused checks must retain sample ads and not claim a full-game/live-ad pass')
    require(proof.get('audibleAudioVerified') is False and '-no-audio' in proof.get('audioDisclosure', ''),
            'Native audio dispatch checks must not claim audible playback on the no-audio emulator')
    configurations = proof.get('smallPhoneConfigurations', proof.get('configurations', []))
    require(configurations and all(all(isinstance(c.get(k), (int, float)) and c[k] > 0
        for k in ('physicalWidth', 'physicalHeight', 'densityDpi', 'fontScale')) for c in configurations),
        'Actual tested screen dimensions/density/font scale missing')
    require(any(min(c['physicalWidth'], c['physicalHeight']) * 160 / c['densityDpi'] <= 360 for c in configurations),
            'The Demolish/Intelligence controls need an actual small-phone observation')
    focused = proof.get('focusedObservations', {})
    required = ('demolishNativeOrdersVerified', 'demolishCancellationAndLoadVerified',
                'intelligenceCompletedHistoryVerified', 'intelligencePreviewAndOriginalAudioDispatchVerified',
                'intelligenceNavigationAndInputVerified')
    require(all(focused.get(k) is True for k in required), 'Required Demolish/Intelligence observation is missing')
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
                'APK changed outside approved demolish/intelligence UI and metadata')
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
    require(all(v in badging for v in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='36'",
        "versionName='0.36'", "application-label:'Warzone Towers'", 'application-debuggable')), 'App identity/version changed')
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
    return {'version': '0.36', 'versionCode': 36, 'candidateAPK_SHA256': candidate,
        'scope': 'Selected-truck Demolish and completed-research Intelligence with native preview/audio.',
        'emulatorUsed': True, 'gameplayVerified': False, 'testAdsOnly': True, 'liveAdsTested': False,
        'emulatorProof': {'path': emulator_name, 'sha256': args.expected_emulator_report_sha256},
        'focusedEmulatorChecks': checks, 'focusedObservations': proof['focusedObservations'],
        'emulatorEvidenceFiles': evidence, 'supportingObservations': supporting,
        'smallPhoneConfigurations': configurations, 'sourceCheckReports': [reviewed] + additional_reviewed,
        'changedAPKAssets': sorted(changed_assets), 'changedAPKMembers': changed, 'removedAPKMembers': sorted(removed),
        'sourcePreservation': preservation, 'nativeAssetSHA256': native_hashes,
        'nativePreservation': native, 'bundledMusicByteIdenticalTo035': True,
        'mapsDuelAndScenarioCatalogsUnchanged': True, 'walletSaveCodecAndAdsControllerUnchanged': True,
        'signing': {'sameCertificateAs035': True, 'certificateSHA256': signing_sha},
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
    outputs = [args.output / n for n in ('Warzone-Towers-0.36-Test-Ads.apk', 'warzone-towers-0.36-source.zip', 'Warzone-Towers-0.36-Test-Ads-SHA256.txt')]
    apk_out, source_out, checksums = outputs; partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in outputs + [partial]), 'Frozen delivery/partial must not be overwritten')
    record = validate(args)
    required = NATIVE_REQUIRED | NATIVE_NEW | SUPPORTING_SOURCE | {'tools/package-24-home.py', 'tools/package-36-intelligence.py',
        'tools/check-intelligence-036.py', RECORD, FALLBACK, DOC, MANIFEST, 'README.md', 'AGENTS.md', record['emulatorProof']['path']}
    for entry in record['sourceCheckReports'] + record['emulatorEvidenceFiles'] + record['supportingObservations']:
        required.add(entry['path'])
    files = source_inventory(required)
    if args.validate_only:
        print(json.dumps({'validationPassed': True, 'deliveryFilesWritten': False,
            'candidateAPK_SHA256': record['candidateAPK_SHA256'], 'focusedChecks': len(record['focusedEmulatorChecks']),
            'sourceFiles': len(files), 'scopedNativeRelinkAndTwoScenarioReplacementsVerified': True,
            'mapsMusicAndRewardPolicyFrozen': True, 'sameSigningCertificateAs035': True}, indent=2))
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
