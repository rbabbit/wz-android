"""Package only the exact checked v0.52 Towers loss/construction delivery.

This is a packaging gate, never an emulator runner or native/bootstrap builder.
Unchanged complete-source ZIP members reuse their preserved compressed bytes.
"""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
import argparse
import json
import re
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CAMPAIGN = runpy.run_path(str(ROOT / 'tools/package-campaign-051.py'), run_name='loss052_package_helpers')
H, C = CAMPAIGN['H'], CAMPAIGN['C']
digest, zip_digest, require = (C[key] for key in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
R = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='loss052_index_helpers')
FALLBACK = 'archive/fallback-0.52.json'
EMULATOR = 'archive/loss-builders-0.52-emulator-checks.json'
PAYLOAD = 'archive/loss-builders-0.52-payload.json'
NATIVE = 'archive/native-unit-loss-0.52/'
RECORD = 'archive/release-0.52-loss-builders.json'
GRADLE = 'app/build.gradle.kts'
ASSETS = 'app/src/main/assets/'
SCENARIO = 'scenario/warzone-towers-commands.js'
VIRTUAL = '/data/mp/tests/warzone-towers-commands.js'
BASELINE_APK_SHA = '9f52adb6738eee5596129f68f3bce2e235e9b793bd3d75a6c6829b879e687d26'
BASELINE_SOURCE_SHA = '5a18b59dc8c6b66feb7a0dd04ed3e3af8ec54e7d8ef15e55faae3529dbc8fbf7'
APP_CHANGES = {ASSETS + name for name in ('warzone-towers-notices.js', 'warzone-command-pages.js',
    'warzone/ui/build-display.js', 'warzone/index.html', 'warzone/warzone2100.data')}
APP_ADDITIONS = {ASSETS + 'warzone/' + name for name in ('warzone2100-towers-052.js', 'warzone2100-towers-052.wasm')}
APP_SCOPE = APP_CHANGES | APP_ADDITIONS
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
    require(saved.get('version') == '0.52' and saved.get('baseline') == '0.51', 'Wrong fallback record')
    for row in saved['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'],
            'Immutable v0.51 fallback changed: ' + str(path))
    apk = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.apk'))
    source = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.zip'))
    require(digest(apk) == BASELINE_APK_SHA and digest(source) == BASELINE_SOURCE_SHA, 'Wrong v0.51 baseline bytes')
    return apk, source


def validate_emulator(expected_sha):
    proof = read_json(ROOT / EMULATOR)
    require(proof.get('version') == '0.52' and proof.get('passed') is True
        and proof.get('emulatorUsed') is True and proof.get('candidateAPK_SHA256') == expected_sha,
        'Passed exact delivery-APK emulator proof is required')
    sources = pinned_rows(proof.get('sources'), 'emulator source')
    evidence = pinned_rows(proof.get('evidence'), 'emulator evidence')
    require(all(not name.startswith('qa/') for name in evidence), 'Curated emulator evidence must be retained outside disposable QA')
    return proof, sources, evidence


def validate_native_and_data(baseline):
    native = read_json(ROOT / (NATIVE + 'native-payload.json'))
    build_path, overlay_path = ROOT / (NATIVE + 'native-build.json'), ROOT / (NATIVE + 'source-overlay.json')
    build, overlay = read_json(build_path), read_json(overlay_path)
    require(native.get('version') == '0.52' and native.get('passed') is True
        and native.get('sourceBuiltPairedTowersRuntime') is True and native.get('onlyNativeObject') == 'droid.cpp'
        and native.get('campaignAndDuelFilesByteUnchanged') is True
        and native.get('frozenPackageIndexAndOutputHookPreserved') is True, 'Towers native isolation proof failed')
    require(native.get('nativeBuildProofSHA256') == digest(build_path) and build.get('version') == '0.52'
        and build.get('passed') is True and build.get('sourceOverlaySHA256') == digest(overlay_path)
        and build.get('logSHA256') == digest(ROOT / (NATIVE + 'native-build.log')), 'Native build provenance changed')
    only_object = ['src/CMakeFiles/warzone2100.dir/droid.cpp.o']
    require(build.get('compiledObjects') == only_object and build.get('changedObjects') == only_object
        and build.get('otherObjectsUnchanged', 0) > 0 and build.get('executableLinks') == 1
        and build.get('campaignFilesUnchanged') is True, 'Native compilation exceeded the authorized one object')
    require(overlay.get('version') == '0.52' and overlay.get('guardPassed') is True
        and overlay.get('recipeSHA256') == digest(ROOT / 'tools/build-native-unit-loss-052.py')
        and overlay.get('previousNativeBuildSHA256') == digest(ROOT / 'archive/native-campaign-0.51/selection-native-build.json')
        and overlay.get('sourceBeforeSHA256') == digest(ROOT / (NATIVE + 'original-droid.cpp'))
        and overlay.get('sourceAfterSHA256') == digest(ROOT / (NATIVE + 'droid.cpp')), 'Native source lineage changed')
    asset_root = ROOT / ASSETS / 'warzone'
    loader, wasm = asset_root / 'warzone2100-towers-052.js', asset_root / 'warzone2100-towers-052.wasm'
    require(native['towersLoader']['file'] == loader.name and native['towersWASM']['file'] == wasm.name
        and digest(wasm) == native['towersWASM']['sha256'], 'Towers matched WASM differs from source build')
    raw = {row['file']: row for row in build['raw']}
    require(raw['warzone2100.wasm']['sha256'] == digest(wasm), 'Source-built and delivered WASM differ')
    runtime = native['runtimeIntegration']
    require(runtime.get('passed') is True and runtime.get('generatedCodeUnchangedOutsideIndexAndExistingWorkerHook') is True
        and runtime['raw']['jsSHA256'] == raw['warzone2100.js']['sha256']
        and runtime['raw']['wasmSHA256'] == digest(wasm), 'Native integration/raw-program proof differs')
    payload = read_json(ROOT / PAYLOAD)
    require(payload.get('version') == '0.52' and payload.get('passed') is True
        and payload.get('baselineAPK_SHA256') == BASELINE_APK_SHA
        and payload.get('onlyChangedVirtualFile') == VIRTUAL and payload.get('sourcePath') == SCENARIO
        and payload.get('sourceSHA256') == digest(ROOT / SCENARIO)
        and payload.get('originalDataPrefixUnchanged') is True
        and payload.get('campaignAndDuelEntryRuntimeFilesUnchanged') is True, 'Construction VFS proof failed')
    before_path = repository_path(payload['nativeLoaderBeforeScenario']['path'])
    require(digest(before_path) == payload['nativeLoaderBeforeScenario']['sha256']
        == native['towersLoader']['sha256'], 'Pre-VFS source-built loader is not pinned')
    before, current = before_path.read_text(encoding='utf-8'), loader.read_text(encoding='utf-8')
    a, b, _, _ = R['package_call'](before)
    c, d, _, index = R['package_call'](current)
    body = current[:c] + 'PACKAGE_INDEX' + current[d:]
    require(body == before[:a] + 'PACKAGE_INDEX' + before[b:]
        and sha256(body.encode()).hexdigest() == payload['runtimeBodySHA256']
        and digest(loader) == payload['loaderSHA256'], 'Loader changed outside the reviewed package index')
    data_path = asset_root / 'warzone2100.data'
    data = data_path.read_bytes()
    require(digest(data_path) == payload['dataSHA256'] and len(data) == payload['dataBytes'], 'Embedded Towers data changed')
    with ZipFile(baseline) as old:
        old_data = old.read('assets/warzone/warzone2100.data')
        old_loader = old.read('assets/warzone/warzone2100.js').decode()
        _, _, _, old_index = R['package_call'](old_loader)
        require(payload['baselineDataSHA256'] == sha256(old_data).hexdigest()
            and payload['baselineDataBytes'] == len(old_data) and data[:len(old_data)] == old_data,
            'Frozen v0.51 data prefix changed')
        require(data[len(old_data):] == (ROOT / SCENARIO).read_bytes(), 'Data append exceeds the single reviewed source')
        for name, expected in native['preservedFiles'].items():
            require(zip_digest(old, 'assets/warzone/' + name) == expected, 'Native proof baseline mismatch: ' + name)
            if name != 'warzone2100.data':
                require(digest(asset_root / name) == expected, 'Generic/Campaign/Duel asset changed: ' + name)
        old_table = {row['filename']: row for row in old_index['files']}
        table = {row['filename']: row for row in index['files']}
        require(len(table) == len(index['files']) and set(table) == set(old_table), 'Virtual-file inventory changed')
        R['verify_index'](index, data)
        changed = []
        for name, row in table.items():
            prior = old_table[name]
            if data[row['start']:row['end']] != old_data[prior['start']:prior['end']]:
                changed.append(name)
        require(changed == [VIRTUAL] and payload['unchangedOtherVirtualFiles'] == len(table) - 1,
            'Virtual files changed beyond the Towers command bridge')
        row = table[VIRTUAL]
        require(row['start'] == len(old_data) and row['end'] == len(data)
            and data[row['start']:row['end']] == (ROOT / SCENARIO).read_bytes(), 'Wrong embedded command source')
        require(old.read('assets/warzone/index.html') == (ROOT / (NATIVE + 'original-index.html')).read_bytes(),
            'Towers entry baseline changed')
    require(digest(asset_root / 'index.html') == native['towersIndexAfterSHA256']
        == digest(ROOT / (NATIVE + 'index.html')), 'Towers runtime entry differs from reviewed routing')
    require('src="warzone2100-towers-052.js"' in (asset_root / 'index.html').read_text()
        and "return prefix + 'warzone2100-towers-052.wasm'" in (asset_root / 'index.html').read_text(), 'New Towers pair not routed')
    return dict(nativePayloadSHA256=digest(ROOT / (NATIVE + 'native-payload.json')),
        nativeBuildSHA256=digest(build_path), sourceBuiltTowersWASM_SHA256=digest(wasm),
        payloadSHA256=digest(ROOT / PAYLOAD), loaderSHA256=digest(loader), dataSHA256=digest(data_path),
        singleChangedVirtualFile=VIRTUAL, unchangedOtherVirtualFiles=len(table) - 1,
        originalDataPrefixUnchanged=True, campaignAndDuelRuntimeFrozen=True)


def source_inventory(required, evidence):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    names = set(filter(None, raw.decode().split('\0'))) | required | evidence | APP_ADDITIONS | {MANIFEST, RECORD, EMULATOR, PAYLOAD, FALLBACK}
    names |= {p.relative_to(ROOT).as_posix() for p in (ROOT / NATIVE).rglob('*') if p.is_file()}
    files = {}
    for name in sorted(names):
        rel = Path(name)
        if name.startswith(('qa/loss-builders-052/', 'qa/campaign-051/', 'qa/touch-pan-050/')):
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
        expected_gradle = old.read(GRADLE).replace(b'versionCode = 51', b'versionCode = 52').replace(
            b'versionName = "0.51"', b'versionName = "0.52"')
        require(files[GRADLE].read_bytes() == expected_gradle, 'Gradle changed beyond version52')
        changed = []
        for name, row in prior.items():
            actual = digest(files[name])
            if actual == row['sha256']:
                continue
            if name.startswith('app/'):
                require(name in APP_CHANGES | {GRADLE}, 'Unexpected app/Campaign/Duel source change: ' + name)
            elif name.startswith('scenario/'):
                require(name == SCENARIO, 'Other Towers/Duel scenario changed: ' + name)
            elif name.startswith('campaign/'):
                require(False, 'Campaign source changed: ' + name)
            else:
                require(name in DOCUMENTATION or name.startswith(('tools/', 'archive/')),
                    'Unrelated source changed: ' + name)
            changed.append(dict(path=name, beforeSHA256=row['sha256'], sha256=actual))
        additions = {name for name in files if name.startswith('app/') and name not in prior}
        require(additions == APP_ADDITIONS, 'Unexpected new app files: ' + str(sorted(additions)))
        require(not any(name.startswith('campaign/') and name not in prior for name in files), 'Campaign source added')
        require(not any(name.startswith('scenario/') and name not in prior for name in files), 'Scenario source added')
        delivery_changes = {row['path'] for row in changed if row['path'].startswith(('app/', 'scenario/'))} | APP_ADDITIONS
        require(delivery_changes <= checked_sources, 'Changed delivery source was not pinned by emulator proof: ' + str(sorted(delivery_changes - checked_sources)))
    return dict(changedBaselineSources=changed, baselineSourceEntries=len(names), addedAppSources=sorted(additions),
        everyBaselineSourceEntryRetained=True, campaignAndDuelSourcesFrozen=True)


def validate_apk(apk, baseline, expected_sha):
    require(apk.is_file() and digest(apk) == expected_sha, 'Candidate APK changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='52'",
        "versionName='0.52'", "application-label:'Warzone Towers'")), 'APK identity/version mismatch')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    with ZipFile(apk) as current, ZipFile(baseline) as old:
        names, prior = set(current.namelist()), set(old.namelist())
        require(len(names) == len(current.namelist()) and current.testzip() is None, 'Corrupt or duplicate APK archive')
        require(prior <= names, 'A prior APK member was removed')
        asset_additions = {name.removeprefix('app/src/main/') for name in APP_ADDITIONS}
        require({name for name in names if name.startswith('assets/')} == {name for name in prior if name.startswith('assets/')} | asset_additions,
            'APK asset inventory changed beyond the isolated Towers pair')
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
        for name in ('warzone2100.js', 'warzone2100.wasm', 'warzone2100-campaign.js', 'warzone2100-campaign.data',
                     'index-campaign.html', 'mobile-campaign.html', 'warzone2100-duel.js', 'index-duel.html'):
            entry = 'assets/warzone/' + name
            require(zip_digest(current, entry) == zip_digest(old, entry), 'Frozen shared/Campaign/Duel runtime changed: ' + name)
        music = 'assets/warzone/music/music.data'
        require(current.getinfo(music).compress_type == ZIP_STORED and zip_digest(current, music) == zip_digest(old, music),
            'Bundled soundtrack changed or compressed')
    return dict(certificateSHA256=signing, changedAPKMembers=changed, allAPKAssetsMatchSource=True,
        everyBaselineAPKMemberRetained=True, genericCampaignAndDuelRuntimeFrozen=True)


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
    native = validate_native_and_data(baseline)
    with ZipFile(source) as old:
        required = set(old.namelist())
    files = source_inventory(required, evidence)
    preservation = validate_source(source, files, checked_sources)
    apk_record = validate_apk(args.apk, baseline, expected)
    require(digest(args.apk) == expected, 'Candidate APK changed during validation')
    if args.validate_only:
        print(json.dumps(dict(packageValidationPassed=True, deliveryWritten=False, sourceFiles=len(files),
            **preservation, **apk_record, nativeRuntime=native), indent=2))
        return
    apk_out, source_out, checksum = (args.output / name for name in ('Warzone-Towers-0.52.apk',
        'warzone-towers-0.52-source.zip', 'Warzone-Towers-0.52-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(path.exists() for path in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    record = dict(version='0.52', versionCode=52, candidateAPK_SHA256=expected,
        scope='Towers-only structured unit-loss notices and native-faithful construction crew recovery after assigned trucks die.',
        emulatorUsed=True, exactAPKVerified=True, githubPublished=False, vpsChanged=False,
        fallback=dict(path=FALLBACK, sha256=digest(ROOT / FALLBACK)), verification=proof,
        sourcePreservation=preservation, nativeRuntime=native, **apk_record,
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
        exactCheckedAPKCopied=True, campaignAndDuelFrozen=True), indent=2))


if __name__ == '__main__':
    main()
