"""Guard and package v0.41's production unit thumbnails and complete current-design identity fixes.

The immutable v0.40 APK and complete source ZIP are the baseline. This does not
depend on v0.40 having been committed to Git. No emulator testing is authorized.
Controlled source/browser fixtures and Android build/package checks do not establish
actual gameplay, GPU rendering or screen acceptance.
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
import difflib

ROOT = Path(__file__).resolve().parents[1]
COMMON = runpy.run_path(str(ROOT / 'tools/package-24-home.py'), run_name='package_041_common')
require, digest, zip_digest = (COMMON[k] for k in ('require', 'digest', 'zip_digest'))
read_json, repo_path, metadata = (COMMON[k] for k in ('read_json', 'repo_path', 'metadata'))
NATIVE_SOURCE, MANIFEST, STORED, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[k] for k in (
    'NATIVE_SOURCE', 'MANIFEST', 'STORED', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
NATIVE_ASSETS = {'assets/warzone/warzone2100.' + ext for ext in ('js','data','wasm')}
ASSET_SCOPE = NATIVE_ASSETS | {'assets/warzone-command-pages.js',
    'assets/warzone/ui/towers-status.js', 'assets/warzone/ui/towers-status.css'}
ADDED_APP_SOURCE = set()
VFS_SCOPE = {'/data/mp/tests/warzone-towers-commands.js': 'scenario/warzone-towers-commands.js'}
SCENARIO_SCOPE = set(VFS_SCOPE.values())
SOURCE_SCOPE = {'app/src/main/' + n for n in ASSET_SCOPE} | SCENARIO_SCOPE
GRADLE = 'app/build.gradle.kts'
FALLBACK = 'archive/fallback-0.41.json'
RECORD = 'archive/release-0.41-source-build-only.json'
SOURCE_REPORT = 'archive/thumbnail-0.41-source-checks.json'
DOC = 'docs/releases/0.41-thumbnail.md'
BASELINE_SHA = '999623bca729d340e5d0356558e3d9bbab5170a96e678cbbb4ecd09f24375b91'
SOURCE_SHA = '6fb8c8657d75e4ab29f774f2de8e85598e7b87e31ffb12b1976a854810d1375d'
MUSIC_ASSET = 'assets/warzone/music/music.data'
MUSIC_SHA = '602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd'
MUSIC_BYTES = 114721578
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~3347511713'
AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917'
PUBLISHER_AD_UNIT_ID = 'ca-app-pub-3430279660625393/5338770704'
NATIVE_REQUIRED = {NATIVE_SOURCE}
NATIVE_NEW = {'archive/native-production-0.41/' + n for n in ('quickjs_backend.cpp', 'production-helper.inc',
    'native-production.patch', 'native-production-cumulative.patch', 'source-overlay.json', 'README.md', 'native-build.json', 'native-build.log')}
NATIVE_NEW |= {'tools/build-native-production-041.py', 'tools/integrate-native-production-041.py',
    'tools/check-production-current-041.cjs'}
OVERLAY = 'archive/native-production-0.41/source-overlay.json'
BUILD_PROOF = 'archive/native-production-0.41/native-build.json'
RUNTIME_PROOF = 'archive/native-production-0.41/native-runtime-integration.json'
PAYLOAD = 'archive/native-production-0.41/native-payload.json'
NATIVE_NEW |= {RUNTIME_PROOF, PAYLOAD}


def write_json(path, value):
    with path.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.is_file() and path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'],
                'Frozen v0.40 fallback changed: ' + str(path))
    apk = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.40-Test-Ads.apk')
    source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.40-source.zip')
    require(digest(apk) == BASELINE_SHA and digest(source) == SOURCE_SHA, 'Wrong immutable v0.40 baseline')
    return apk, source


def validate_source(source):
    """Compare every original source file; no old native/gameplay suite is run."""
    changed, protected = [], []
    with ZipFile(source) as archive:
        names = set(archive.namelist())
        require(len(names) == len(archive.namelist()), 'Duplicate baseline source member')
        manifest = json.loads(archive.read(MANIFEST))
        indexed = {entry['path']: entry for entry in manifest['files']}
        require(set(indexed) == names - {MANIFEST}, 'v0.40 source inventory is incomplete')
        expected_gradle = archive.read(GRADLE).replace(b'versionCode = 40', b'versionCode = 41').replace(
            b'versionName = "0.40"', b'versionName = "0.41"')
        require((ROOT / GRADLE).read_bytes() == expected_gradle, 'Build settings changed beyond version 41')
        require((ROOT / '.gitattributes').read_bytes() == archive.read('.gitattributes'), 'LFS storage rules changed')
        for name, entry in indexed.items():
            if name == GRADLE or name in {MANIFEST, 'AGENTS.md', 'README.md', 'design-qa.md'}:
                continue
            path = ROOT / name
            require(path.is_file(), 'Required baseline source was removed: ' + name)
            actual = digest(path)
            if actual != entry['sha256']:
                require(name in SOURCE_SCOPE, 'Source changed outside thumbnail/equipment scope: ' + name)
                changed.append({'path': name, 'beforeSHA256': entry['sha256'], 'sha256': actual})
            else:
                protected.append(name)
        app_files = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src/main').rglob('*') if p.is_file()}
        require(app_files - names == ADDED_APP_SOURCE, 'Unexpected new app source/assets: ' + str(sorted(app_files - names)))
        require({v['path'] for v in changed} <= SOURCE_SCOPE, 'Changes exceed inspected presentation scope')
        require({'app/src/main/assets/warzone-command-pages.js', 'app/src/main/assets/warzone/ui/towers-status.js'} <= {v['path'] for v in changed},
                'Production thumbnail/equipment fixes are missing')
    build = (ROOT / GRADLE).read_text(encoding='utf-8')
    require(all(v in build for v in ('versionCode = 41', 'versionName = "0.41"',
        'com.google.android.gms:play-services-ads:25.5.0', 'com.google.android.ump:user-messaging-platform:4.0.0')),
        'Version or existing pinned ad SDKs changed')
    scope = sorted(SOURCE_SCOPE | {GRADLE})
    return {'changedAppSources': changed, 'addedAppSources': sorted(ADDED_APP_SOURCE),
            'preservedOriginalSourceFiles': len(protected),
            'protectedSourcePaths': protected,
            'sources': [{'path': name, 'sha256': digest(ROOT / name)} for name in scope],
            'baselineManifestEntries': len(manifest['files']),
            'sourceZIPBaselineSHA256': SOURCE_SHA, 'mapsAndUnrelatedNativeSourcesFrozen': True,
            'javaAndResourceSourcesFrozen': True, 'walletSaveCodecAndAdControllerFrozen': True}


def verify_source_report(path):
    name = repo_path(path); report = read_json(path)
    require(report.get('version') == '0.41' and report.get('emulatorUsed') is False
            and report.get('checksPassed', 0) > 0, 'Current source-only preservation report missing')
    require({v['path'] for v in report.get('sources', [])} >= SOURCE_SCOPE | {GRADLE},
            'Source report must bind the final changed app scope')
    for entry in report['sources']:
        current = ROOT / entry['path']; repo_path(current)
        require(current.is_file() and digest(current) == entry['sha256'], 'Reviewed source changed: ' + entry['path'])
    return {'path': name, 'sha256': digest(path)}


def verify_native_sources():
    """Independently reverse the additive observer and bind the one-object build."""
    prior = runpy.run_path(str(ROOT / 'tools/package-40-progress.py'), run_name='native_041_prior')
    previous_provenance = prior['verify_native_sources']()
    old_recipe = runpy.run_path(str(ROOT / 'tools/build-native-production-040.py'), run_name='native_041_base_recipe')
    original = old_recipe['validate_overlay']()
    overlay = read_json(ROOT / OVERLAY)
    require(overlay.get('version') == '0.41' and overlay.get('guardPassed') is True
            and overlay.get('baselineSourceBundle') == NATIVE_SOURCE
            and overlay.get('baselineSourceEntry') == 'source/src/quickjs_backend.cpp'
            and overlay.get('originalSourceSHA256') == sha256(original).hexdigest(),
            'Current-design observer original source lineage differs')
    previous = ROOT / 'archive/native-production-0.40/quickjs_backend.cpp'
    helper_before = ROOT / 'archive/native-production-0.40/production-helper.inc'
    current = ROOT / overlay['changedSource']; helper = ROOT / overlay['helper']
    patch = ROOT / overlay['patch']; cumulative = ROOT / overlay['cumulativePatch']
    require(overlay.get('deltaBaseSource') == repo_path(previous)
            and digest(previous) == overlay.get('beforeSHA256') ==
            '6f3033eb6ea18da2e2f640f521e40483c5f5af8ab63a22b567d26c4f6997217e',
            'Native delta does not begin at the immutable v0.40 observer')
    require(repo_path(current) == 'archive/native-production-0.41/quickjs_backend.cpp'
            and repo_path(helper) == 'archive/native-production-0.41/production-helper.inc'
            and repo_path(patch) == 'archive/native-production-0.41/native-production.patch'
            and repo_path(cumulative) == 'archive/native-production-0.41/native-production-cumulative.patch',
            'Current-design observer paths exceed inspected scope')
    anchor = b'\tQuickJS_DefinePropertyValue(ctx, value, "currentName", JS_NewString(ctx, getStatsName(subject)), JS_PROP_ENUMERABLE);\n'
    addition = b'''\tJSValue subjectDesign = convTemplate(subject, ctx);
\tQuickJS_DefinePropertyValue(ctx, subjectDesign, "templateId", JS_NewUint32(ctx, subject->multiPlayerID), JS_PROP_ENUMERABLE);
\tQuickJS_DefinePropertyValue(ctx, value, "subjectDesign", subjectDesign, JS_PROP_ENUMERABLE);
'''
    require(previous.read_bytes().count(anchor) == 1 and helper_before.read_bytes().count(anchor) == 1,
            'Current-design observer insertion anchor differs')
    expected = previous.read_bytes().replace(anchor, anchor + addition, 1)
    require(current.read_bytes() == expected
            and helper.read_bytes() == helper_before.read_bytes().replace(anchor,anchor+addition,1),
            'Native current-design change exceeds the three additive subject lines')
    def expected_patch(before):
        return ''.join(difflib.unified_diff(before.decode().splitlines(True),expected.decode().splitlines(True),
            fromfile='a/src/quickjs_backend.cpp',tofile='b/src/quickjs_backend.cpp')).encode()
    require(patch.read_bytes() == expected_patch(previous.read_bytes())
            and cumulative.read_bytes() == expected_patch(original), 'Native delta/cumulative patch differs')
    require(digest(current) == overlay.get('afterSHA256') and digest(helper) == overlay.get('helperSHA256')
            and digest(patch) == overlay.get('patchSHA256')
            and digest(cumulative) == overlay.get('cumulativePatchSHA256'), 'Native observer source proof is stale')
    preserved = {name: digest(ROOT / path) for name,path in {
        'display3d.cpp':'archive/native-hud-0.31/display3d.cpp',
        'research.cpp':'archive/native-notices-0.34/research.cpp',
        'keybind.cpp':'archive/native-notices-0.35/keybind.cpp',
        'hci.cpp':'archive/native-intelligence-0.36/hci.cpp'}.items()}
    require(preserved == overlay.get('preservedSourceOverlays'), 'Earlier native fixes are not preserved')
    build = read_json(ROOT / BUILD_PROOF)
    require(build.get('version') == '0.41' and build.get('passed') is True
            and build.get('nativeBuildPerformed') is True and build.get('nativeFullFreshBuildPerformed') is False
            and build.get('relinkedNativeEngine') is True
            and build.get('compiledObjects') == ['src/CMakeFiles/warzone2100.dir/quickjs_backend.cpp.o'],
            'Expected one observer object compile and matched link')
    require(build.get('previousNativeBuild') == 'archive/native-production-0.40/native-build.json'
            and build.get('previousNativeBuildSHA256') == digest(ROOT / build['previousNativeBuild']),
            'Current-design build does not bind the immutable v0.40 native build')
    require(build.get('sourceOverlay') == OVERLAY and build.get('sourceOverlaySHA256') == digest(ROOT / OVERLAY)
            and build.get('sourceOverlays') == preserved | {'quickjs_backend.cpp':digest(current)}
            and build.get('originalBuildRecipeSHA256') == overlay.get('originalBuildRecipeSHA256')
            == digest(ROOT / 'tools/build-native-blueprint.sh'), 'Native build source hashes differ')
    log = ROOT / build['log']; repo_path(log)
    require(digest(log) == build.get('logSHA256'), 'Native build log changed')
    text = log.read_text(encoding='utf-8')
    require(re.findall(r'Building CXX object (\S+)',text) == build['compiledObjects']
            and len(re.findall(r'Linking CXX executable[^\n]*warzone2100',text)) == 1,
            'Native build log exceeds the bounded compile/link scope')
    paths = {OVERLAY, BUILD_PROOF, repo_path(helper), repo_path(current), repo_path(patch), repo_path(cumulative), repo_path(log),
             'tools/build-native-production-041.py'}
    return {'changedCPPFiles':['quickjs_backend.cpp'], 'additiveCurrentSubjectDesignVerified':True,
            'previous040ObserverProvenance':previous_provenance,
            'priorFourNativeFixesRetained':True, 'nativeBuildPerformed':True,
            'nativeFullFreshBuildPerformed':False,
            'proofInputs':[{'path':n,'sha256':digest(ROOT/n)} for n in sorted(paths)]}


def verify_regression(args):
    require(len(args.regression_report) == len(args.expected_regression_report_sha256),
            'Supply one expected SHA256 for every regression report')
    require(len(args.regression_report) == 2 and {repo_path(path) for path in args.regression_report} == {
            'archive/production-thumbnail-0.41-checks.json', 'archive/production-current-0.41-checks.json'},
            'Two final UI thumbnail/count and native current-design reports are required')
    reports, scopes, checks_all, inputs_by_path, evidence_by_path = [], [], [], {}, {}
    for path, expected in zip(args.regression_report, args.expected_regression_report_sha256):
        expected = expected.lower()
        name = repo_path(path)
        require(digest(path) == expected, 'Regression proof hash differs: '+name)
        proof = read_json(path)
        source_only_native = (proof.get('androidRuntimeExecuted') is False
                              and proof.get('gameplayVerified') is False
                              and proof.get('actualNativeEngineExecuted') is not True
                              and re.search(r'no (?:actual )?native execution', proof.get('scope','').lower()) is not None)
        require(proof.get('version') == '0.41' and proof.get('passed') is True
                and proof.get('emulatorUsed') is False
                and (proof.get('actualNativeEngineExecuted') is False or source_only_native),
                'Regression proof must disclose controlled v0.41 non-native/non-emulator verification: '+name)
        require(proof.get('gameplayVerified', False) is False, 'UI fixture must not claim native gameplay')
        scope = proof.get('scope', proof.get('fixture', ''))
        require(scope, 'Regression fixture scope missing: '+name)
        checks = proof.get('checks', [])
        require(isinstance(checks,list) and checks, 'Named regression checks missing: '+name)
        for check in checks:
            if isinstance(check,str):
                require(check.strip(), 'Empty named fixture check')
                checks_all.append({'name':check,'passed':True,'report':name})
            else:
                require(check.get('name') and check.get('passed') is True, 'Fixture check did not pass: '+name)
                checks_all.append(dict(check,report=name))
        require(proof.get('checksPassed',len(checks)) == len(checks), 'Reported check count differs: '+name)
        inputs = proof.get('sources', [])
        if not inputs and isinstance(proof.get('inputSHA256'), dict):
            inputs = [{'path':p,'sha256':v} for p,v in proof['inputSHA256'].items()]
        if isinstance(proof.get('checker'), dict):
            inputs = list(inputs) + [proof['checker']]
        require(inputs, 'Regression proof must bind actual fixture inputs: '+name)
        for entry in inputs:
            current = ROOT / entry['path']; repo_path(current)
            require(current.is_file() and digest(current) == entry['sha256'], 'Regression input changed: '+entry['path'])
            require(entry['path'] not in inputs_by_path or inputs_by_path[entry['path']]['sha256'] == entry['sha256'],
                    'Reports disagree about shared input: '+entry['path'])
            inputs_by_path[entry['path']] = entry
        for item in proof.get('screenshots', []):
            shot = ROOT / item; shot_name = repo_path(shot)
            require(shot.is_file(), 'Desktop fixture capture missing: '+shot_name)
            evidence_by_path[shot_name] = {'path':shot_name,'sha256':digest(shot),'kind':'controlled desktop browser fixture'}
        reports.append({'path':name,'sha256':expected}); scopes.append({'path':name,'scope':scope,'checks':len(checks)})
    required = {'app/src/main/assets/warzone-command-pages.js', 'app/src/main/assets/warzone/ui/towers-status.js', 'scenario/warzone-towers-commands.js'}
    require(required <= set(inputs_by_path), 'Reports must bind actual Production UI and native adapter logic')
    return reports, scopes, checks_all, list(inputs_by_path.values()), list(evidence_by_path.values())


def verify_resource_palette(aapt, candidate):
    table = subprocess.check_output([str(aapt),'dump','resources',str(candidate)], text=True, encoding='utf-8').lower()
    def entry(name):
        match = re.search(r'^\s*resource 0x[0-9a-f]+ '+re.escape(name)+r'\s*\n(.*?)(?=^\s*resource |^\s*type |\Z)', table, re.M|re.S)
        require(match is not None, 'Compiled resource missing: '+name)
        return match[1]
    require('#ff080808' in entry('color/warzone_brand_background'), 'Compiled theme background is stale')
    require('#ff29482d' in entry('color/warzone_icon_background'), 'Original app icon background changed')
    require('0x01010435=#fff4f4f4' in entry('style/apptheme.base'), 'Compiled Android colorAccent is stale')
    return {'brandBackground':'#ff080808','originalIconBackground':'#ff29482d','colorAccent':'#fff4f4f4'}


def verify_native(apk, old):
    """Reconstruct the source-built runtime; compare all VFS bytes to frozen v0.40."""
    source_provenance = verify_native_sources()
    runtime = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='package_041_runtime')
    payload, integration, build = (read_json(ROOT / n) for n in (PAYLOAD, RUNTIME_PROOF, BUILD_PROOF))
    before_js = old.read('assets/warzone/warzone2100.js').decode('utf-8')
    before_data = old.read('assets/warzone/warzone2100.data')
    final_js = apk.read('assets/warzone/warzone2100.js').decode('utf-8')
    final_data = apk.read('assets/warzone/warzone2100.data')
    final_wasm = apk.read('assets/warzone/warzone2100.wasm')
    _, _, frozen_index, before_index = runtime['package_call'](before_js)
    fa, fb, _, final_index = runtime['package_call'](final_js)
    runtime['verify_index'](before_index, before_data); runtime['verify_index'](final_index, final_data)
    require(integration.get('passed') is True and integration.get('version') == '0.41'
            and integration.get('baselineAPK', {}).get('sha256') == BASELINE_SHA
            and integration.get('generatedCodeUnchangedOutsideIndexAndExistingWorkerHook') is True
            and integration.get('productionObservationVFSChanges') == [] and integration.get('workerHookChanged') is False,
            'Matched native production integration proof differs')
    require(integration.get('frozenDataSHA256') == sha256(before_data).hexdigest()
            and integration.get('frozenPackageIndexSHA256') == sha256(frozen_index.encode()).hexdigest(),
            'Native integration did not use frozen v0.40 data/index')
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
    require(final_js[:fa] + 'PACKAGE_INDEX' + final_js[fb:] == body, 'Generated program changed outside production package index')
    require(final_wasm == raw_wasm_path.read_bytes()
            and sha256(final_wasm).hexdigest() == integrated['warzone2100.wasm']['sha256'], 'Final WASM does not match loader')
    require(final_data[:len(before_data)] == before_data, 'Frozen native data prefix changed')
    before = {r['filename']:r for r in before_index['files']}; final = {r['filename']:r for r in final_index['files']}
    require(set(before) == set(final), 'Native VFS inventory changed')
    def contents(data, rows, name):
        row = rows[name]; return data[int(row['start']):int(row['end'])]
    changed = {n for n in before if contents(before_data,before,n) != contents(final_data,final,n)}
    require(changed == set(VFS_SCOPE), 'Native VFS changed beyond the production commands adapter')
    for virtual, relative in VFS_SCOPE.items():
        content = (ROOT / relative).read_bytes(); row = final[virtual]
        require(contents(final_data,final,virtual) == content and int(row['start']) == len(before_data)
                and int(row['end']) == len(final_data) and len(final_data) == len(before_data)+len(content),
                'Appended production adapter is stale or unexpected bytes were appended')
        require({k:v for k,v in row.items() if k not in ('start','end')} ==
                {k:v for k,v in before[virtual].items() if k not in ('start','end')}, 'Command adapter metadata changed')
    require(all(final[n] == before[n] for n in set(before)-set(VFS_SCOPE)), 'Unrelated VFS offsets/metadata changed')
    ignore = {'files','remote_package_size','package_uuid'}
    require({k:v for k,v in final_index.items() if k not in ignore} == {k:v for k,v in before_index.items() if k not in ignore},
            'Native package metadata changed outside the reviewed append/index')
    require(payload.get('version') == '0.41' and payload.get('passed') is True
            and payload.get('nativeRuntimeProof') == RUNTIME_PROOF
            and set(payload.get('changedVFSFiles',[])) == changed and payload.get('addedVFSFiles') == []
            and payload.get('removedVFSFiles') == [] and payload.get('frozenDataPrefixUnchanged') is True
            and payload.get('nativeProgramUnchangedOutsidePackageIndex') is True
            and payload.get('matchedWASMUnchanged') is True, 'production payload proof differs')
    source = payload['source']; require(source['path'] in SCENARIO_SCOPE, 'Wrong commands adapter source')
    require(digest(ROOT / source['path']) == source['sha256'] and (ROOT/source['path']).stat().st_size == source['bytes'],
            'production source proof is stale')
    outputs = {v['file']:v for v in payload['outputs']}
    require(set(outputs) == {'warzone2100.'+ext for ext in ('js','data','wasm')}, 'Wrong native output inventory')
    for file,entry in outputs.items():
        shipped = apk.read('assets/warzone/'+file)
        require(len(shipped) == entry['bytes'] and sha256(shipped).hexdigest() == entry['sha256'], 'Shipped native bytes differ from proof')
    return {'sourceBuiltMatchedRuntimeVerified':True,'nativeBuildPerformed':True,'nativeFullFreshBuildPerformed':False,
            'originalDataPrefixUnchanged':True,'workerHookUnchanged':True,'changedVFSFiles':sorted(changed),
            'unchangedResolvedVFSFiles':len(before)-len(changed),'allModelsAudioMapsAndUnrelatedVFSBytesFrozen':True,
            'normalizedNativeBodySHA256':sha256(body.encode()).hexdigest(),
            'nativeSourceProvenance':source_provenance,
            'proofs':[{'path':n,'sha256':digest(ROOT/n)} for n in (PAYLOAD,BUILD_PROOF,RUNTIME_PROOF)]}


def validate(args):
    candidate = digest(args.apk)
    require(candidate == args.expected_sha256, 'Candidate APK hash differs')
    regressions, regression_scopes, regression_checks, regression_inputs, fixture_evidence = verify_regression(args)
    baseline, source = baseline_paths()
    reviewed = verify_source_report(args.source_report)
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
                and not ({n for n in old_names if n.startswith('assets/')} - assets), 'App asset inventory changed')
        changed = [n for n in apk.namelist() if n not in old_names or zip_digest(apk, n) != zip_digest(old, n)]
        removed = old_names - names
        require(all(n in ASSET_SCOPE or metadata(n) for n in changed + list(removed)),
                'APK changed outside approved thumbnail/equipment scope and metadata')
        require(not any(n == 'resources.arsc' or n.startswith('res/') for n in changed + list(removed)),
                'Compiled Android resources changed despite frozen resource sources')
        changed_assets = {n for n in changed if n.startswith('assets/')}
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in assets and digest(path) == zip_digest(apk, name), 'Stale APK asset: ' + name)
        native_names = ['assets/warzone/warzone2100.' + ext for ext in ('js', 'data', 'wasm')]
        native_hashes = {n: zip_digest(apk, n) for n in native_names}
        native = verify_native(apk, old)
        require(apk.getinfo(MUSIC_ASSET).file_size == MUSIC_BYTES
                and apk.getinfo(MUSIC_ASSET).compress_type == ZIP_STORED and zip_digest(apk, MUSIC_ASSET) == MUSIC_SHA,
                'Bundled original soundtrack changed or is compressed/extracted')
        dex = [apk.read(n) for n in names if re.fullmatch(r'classes(?:\d+)?\.dex', n)]
        require(dex and any(AD_UNIT_ID.encode('ascii') in v for v in dex)
                and not any(PUBLISHER_AD_UNIT_ID.encode('ascii') in v for v in dex), 'Only sample rewarded ads may ship')
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    require(all(v in badging for v in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='41'",
        "versionName='0.41'", "application-label:'Warzone Towers'", 'application-debuggable')), 'App identity/version changed')
    palette = verify_resource_palette(aapt, args.apk)
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
    return {'version': '0.41', 'versionCode': 41, 'candidateAPK_SHA256': candidate,
        'scope': 'Production unit thumbnails, complete current-design identity and count-label clarity, verified by controlled browser/source fixtures and matched native build/package checks only.',
        'emulatorUsed': False, 'androidRuntimeExecuted': False, 'actualNativeEngineExecuted': False,
        'gameplayVerified': False, 'gpuRenderingVerified': False, 'testAdsOnly': True, 'liveAdsTested': False,
        'sourceCheckReports': [reviewed] + regressions, 'regressionScopes': regression_scopes,
        'regressionCheckCount': len(regression_checks), 'regressionChecks': regression_checks,
        'regressionInputSources': regression_inputs, 'desktopFixtureEvidence': fixture_evidence,
        'browserFixturesUsed': True, 'nativeAndroidViewsRuntimeVerified': False,
        'compiledResourcePalette': palette,
        'changedAPKAssets': sorted(changed_assets), 'changedAPKMembers': changed, 'removedAPKMembers': sorted(removed),
        'sourcePreservation': preservation, 'nativeAssetSHA256': native_hashes,
        'nativeProductionIntegration': native, 'bundledMusicByteIdenticalTo040': True,
        'mapsAndDuelCatalogsUnchanged': True, 'walletSaveCodecAndAdsControllerUnchanged': True,
        'signing': {'sameCertificateAs040': True, 'certificateSHA256': signing_sha},
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
    parser.add_argument('--regression-report', type=Path, action='append', required=True)
    parser.add_argument('--expected-regression-report-sha256', action='append', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery output must be outside source tree')
    outputs = [args.output / n for n in ('Warzone-Towers-0.41-Test-Ads.apk', 'warzone-towers-0.41-source.zip', 'Warzone-Towers-0.41-Test-Ads-SHA256.txt')]
    apk_out, source_out, checksums = outputs; partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in outputs + [partial]), 'Frozen delivery/partial must not be overwritten')
    record = validate(args)
    required = NATIVE_REQUIRED | set(record['sourcePreservation']['protectedSourcePaths']) | {'tools/package-24-home.py', 'tools/package-41-thumbnail.py',
        'tools/check-thumbnail-041-preservation.py', RECORD, FALLBACK, DOC, MANIFEST, 'README.md', 'AGENTS.md'} | NATIVE_NEW
    frozen_source = next(Path(entry['path']) for entry in read_json(ROOT / FALLBACK)['files']
                         if Path(entry['path']).name == 'warzone-towers-0.40-source.zip')
    with ZipFile(frozen_source) as archive:
        required.update(archive.namelist())
    for entry in record['sourceCheckReports'] + record['regressionInputSources'] + record['desktopFixtureEvidence'] + record['nativeProductionIntegration']['proofs']:
        required.add(entry['path'])
    files = source_inventory(required)
    if args.validate_only:
        print(json.dumps({'validationPassed': True, 'deliveryFilesWritten': False,
            'candidateAPK_SHA256': record['candidateAPK_SHA256'], 'regressionChecks': record['regressionCheckCount'],
            'sourceFiles': len(files), 'unrelatedNativePolicyMapsMusicFrozen': True, 'sameSigningCertificateAs040': True}, indent=2))
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
    require(digest(args.apk) == record['candidateAPK_SHA256'], 'APK changed during source packaging')
    for entry in record['sourceCheckReports'] + record['regressionInputSources'] + record['desktopFixtureEvidence'] + record['nativeProductionIntegration']['proofs']:
        require(digest(ROOT / entry['path']) == entry['sha256'], 'Source/evidence changed during packaging')
    shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == record['candidateAPK_SHA256'], 'Delivery APK differs from the exact checked candidate')
    partial.rename(source_out); source_sha = digest(source_out)
    with checksums.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(f'{record["candidateAPK_SHA256"]}  {apk_out.name}\n{source_sha}  {source_out.name}\n')
    print(json.dumps({'packageIntegrityPassed': True, 'emulatorUsed': False, 'gameplayVerified': False,
        'testAdsOnly': True, 'liveAdsTested': False, 'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size,
        'candidateAPK_SHA256': record['candidateAPK_SHA256'], 'source': str(source_out),
        'sourceBytes': source_out.stat().st_size, 'sourceZIP_SHA256': source_sha, 'sourceFiles': len(files),
        'sourceWithin2GiB': True, 'checksums': str(checksums), 'streamedEverySourceEntryCRCAndSHA': True}, indent=2))


if __name__ == '__main__':
    main()
