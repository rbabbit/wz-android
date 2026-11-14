"""Package the exact emulator-checked v0.61 construction/rotation APK and complete retained source.

This tool never builds or controls a device. Compiled native programs and unrelated VFS files
are preserved from v0.60; unchanged complete-source ZIP entries reuse their original
compressed bytes through the established delivery writer.
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
HELPERS = runpy.run_path(str(ROOT / 'tools/package-launcher-059.py'), run_name='construction061_helpers')
H, C = HELPERS['H'], HELPERS['C']
digest, zip_digest, require = (C[name] for name in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
FALLBACK = 'archive/fallback-0.61.json'
EMULATOR = 'archive/construction-0.61-emulator-checks.json'
RECORD = 'archive/release-0.61-construction-rotation.json'
BASELINE_APK_SHA = 'ddd4ff09b1c4e7943dfc10df49a88fca152798c3b2f1472a823d335c83cd269f'
BASELINE_SOURCE_SHA = '88b941b86c6bda6041070fcec683a23e446a64b23eaa20152b34f5259d2d98a7'
GRADLE = 'app/build.gradle.kts'
ASSETS = 'app/src/main/assets/'
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
NATIVE_CHANGES = {ASSETS + 'warzone/' + name for name in (
    'warzone2100-towers-052.js', 'warzone2100.data', 'warzone2100-campaign.js',
    'warzone2100-campaign.data', 'warzone2100-ffa.js', 'warzone2100-ffa.data')}
APP_CHANGES = NATIVE_CHANGES | {ASSETS + name for name in ('warzone-touch-controls.js', 'warzone-command-pages.js')}
APP_ADDITIONS = set()
SOURCE_CHANGES = {'scenario/warzone-towers-commands.js', 'campaign/commands.js', 'scenario/ffa/commands.js', 'scenario/ffa/PACKAGE.json'}
SOURCE_ADDITION_PREFIXES = ()
DOCUMENTATION = {'AGENTS.md', 'README.md', 'design-qa.md', 'docs/KNOWN-ISSUES.md', 'docs/releases/0.61-construction-rotation.md'}
BUILD_CONFIG = H['BUILD_CONFIG']


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
        require(name not in names and digest(path) == row['sha256'], label + ' changed/duplicated: ' + name)
        require('bytes' not in row or row['bytes'] == path.stat().st_size, label + ' size changed: ' + name)
        names.add(name)
    return names


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    require(saved.get('version') == '0.61' and saved.get('baseline') == '0.60', 'Wrong fallback record')
    for row in saved['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'],
            'Immutable v0.60 fallback changed: ' + str(path))
    apk = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.apk'))
    source = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.zip'))
    require(digest(apk) == BASELINE_APK_SHA and digest(source) == BASELINE_SOURCE_SHA, 'Wrong delivered v0.60 bytes')
    return apk, source


def validate_emulator(expected):
    proof = read_json(ROOT / EMULATOR)
    require(proof.get('version') == '0.61' and proof.get('passed') is True
        and proof.get('emulatorUsed') is True and proof.get('actualNativeEngineExecuted') is True
        and proof.get('candidateAPK_SHA256') == expected, 'Passed exact delivery-APK emulator proof is required')
    checks = proof.get('checks')
    require(isinstance(checks, list) and checks and all(isinstance(row, dict)
        and row.get('name') and row.get('passed') is True for row in checks), 'Missing/failed emulator checks')
    sources = pinned_rows(proof.get('sources'), 'emulator source')
    evidence = pinned_rows(proof.get('evidence'), 'emulator evidence')
    require(all(not name.startswith('qa/') for name in evidence), 'Retain evidence outside disposable QA')
    return proof, sources, evidence


def validate_ffa_payload():
    path = ROOT / 'scenario/ffa/PACKAGE.json'
    proof = read_json(path)
    require(proof.get('passed') is True and proof.get('mode') == 'ffa' and proof.get('map') == 'emag'
        and proof.get('players') == 4 and proof.get('noNativeBuild') is True
        and proof.get('compiledProgramNormalizedIdentical') is True and proof.get('sharedWASM') == 'warzone2100.wasm',
        'FFA payload provenance failed')
    outputs = pinned_rows(proof.get('outputs'), 'FFA payload output')
    require(outputs == {ASSETS + 'warzone/' + name for name in
        ('warzone2100-ffa.js', 'warzone2100-ffa.data', 'index-ffa.html', 'mobile-ffa.html')}, 'Unexpected FFA payload output inventory')
    original = proof.get('originalMap', {})
    original_path = repository_path(original.get('source', ''))
    require(digest(original_path) == original.get('sha256') and original.get('mapFilesByteIdentical') is True
        and original.get('addedFactories') == 0, 'Authored EMAG map preservation failed')
    return dict(path=path.relative_to(ROOT).as_posix(), sha256=digest(path), outputs=sorted(outputs),
        noNativeBuild=True, existingCompiledProgramRetained=True, authoredMapFilesByteIdentical=True)


def validate_construction_payload():
    path = ROOT / 'archive/construction-0.61-payload.json'
    proof = read_json(path)
    require(proof.get('version') == '0.61' and proof.get('baseline') == '0.60'
        and proof.get('passed') is True and proof.get('noNativeBuild') is True
        and proof.get('compiledProgramsUnchanged') is True and proof.get('originalMissionBodiesPreserved') is True
        and proof.get('fallbackSHA256') == digest(ROOT / FALLBACK), 'Construction payload provenance failed')
    require(pinned_rows(proof.get('sourceScope'), 'construction backend source') ==
        {'scenario/warzone-towers-commands.js', 'campaign/commands.js'}, 'Unexpected backend source inventory')
    expected = {'warzone2100-towers-052.js': ('warzone2100.data', '/data/mp/tests/warzone-towers-commands.js'),
        'warzone2100-campaign.js': ('warzone2100-campaign.data', '/data/base/script/campaign/mobile/campaign-bridge.js')}
    rows = proof.get('payloads', [])
    require(len(rows) == len(expected) and {row.get('loader') for row in rows} == set(expected), 'Missing mode payload')
    for row in rows:
        require((row.get('data'), row.get('onlyChangedVirtualFile')) == expected[row['loader']]
            and row.get('compiledProgramUnchanged') is True and row.get('originalDataPrefixUnchanged') is True,
            'Unreviewed native payload scope')
        for key, name in [('loaderSHA256', row['loader']), ('dataSHA256', row['data'])]:
            require(digest(ROOT / ASSETS / 'warzone' / name) == row[key], 'Construction payload changed: ' + name)
    frozen = proof.get('frozenNativeAssets', {})
    require(frozen and all(digest(ROOT / ASSETS / 'warzone' / name) == sha for name, sha in frozen.items()), 'Frozen native asset changed')
    ffa = proof.get('ffaProof', {})
    require(ffa.get('path') == 'scenario/ffa/PACKAGE.json' and digest(ROOT / ffa['path']) == ffa.get('sha256'), 'FFA provenance changed')
    # Recheck actual old/new loader bodies and every VFS member instead of
    # accepting boolean provenance fields as binary preservation evidence.
    package_call = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='construction061_vfs')['package_call']
    baseline = next(Path(row['path']) for row in read_json(ROOT / FALLBACK)['files'] if row['path'].endswith('.apk'))
    all_modes = [(row['loader'], row['data'], row['onlyChangedVirtualFile']) for row in rows]
    all_modes.append(('warzone2100-ffa.js', 'warzone2100-ffa.data', '/data/mp/tests/ffa-commands.js'))
    verified = []
    with ZipFile(baseline) as old:
        for loader_name, data_name, changed_virtual in all_modes:
            old_loader = old.read('assets/warzone/' + loader_name).decode('utf-8')
            new_loader = (ROOT / ASSETS / 'warzone' / loader_name).read_text(encoding='utf-8')
            a, b, _, before = package_call(old_loader)
            x, y, _, after = package_call(new_loader)
            require(old_loader[:a] + 'PACKAGE' + old_loader[b:] == new_loader[:x] + 'PACKAGE' + new_loader[y:], 'Compiled loader body changed: ' + loader_name)
            old_data = old.read('assets/warzone/' + data_name)
            new_data = (ROOT / ASSETS / 'warzone' / data_name).read_bytes()
            prior = {row['filename']: row for row in before['files']}
            current = {row['filename']: row for row in after['files']}
            require(len(prior) == len(before['files']) and len(current) == len(after['files']) and set(prior) == set(current), 'VFS inventory changed: ' + loader_name)
            differences = []
            for name, row in prior.items():
                new = current[name]
                if old_data[row['start']:row['end']] != new_data[new['start']:new['end']]:
                    differences.append(name)
            require(differences == [changed_virtual], 'Unexpected VFS changes: ' + str(differences))
            verified.append(dict(loader=loader_name, virtualFilesCompared=len(prior), onlyChangedVirtualFile=changed_virtual))
    return dict(path=path.relative_to(ROOT).as_posix(), sha256=digest(path),
        noNativeBuild=True, compiledProgramsPreserved=True, onlyConstructionVirtualFilesChanged=True,
        actualBinaryComparisons=verified, ffa=validate_ffa_payload())


def validate_clean_build(expected):
    path = ROOT / 'archive/construction-clean-apk-0.61.json'
    proof = read_json(path)
    require(proof.get('passed') is True and proof.get('cleanBuild') is True
        and proof.get('candidateAPK_SHA256') == expected, 'Exact clean-build APK proof is required')
    return dict(path=path.relative_to(ROOT).as_posix(), sha256=digest(path), bytes=proof['candidateBytes'])


def validate_host_checks():
    path = ROOT / 'archive/construction-rotation-0.61-host-checks.json'
    proof = read_json(path)
    require(proof.get('version') == '0.61' and proof.get('passed') is True
        and proof.get('emulatorUsed') is False and proof.get('actualNativeEngineExecuted') is False,
        'Focused host fixture proof missing or mislabelled')
    require(pinned_rows(proof.get('sources'), 'host fixture source') == {
        'scenario/warzone-towers-commands.js', 'campaign/commands.js', 'scenario/ffa/commands.js',
        ASSETS + 'warzone-command-pages.js', ASSETS + 'warzone-touch-controls.js'}, 'Host source inventory changed')
    counts = []
    for row in proof.get('checks', []):
        require(row.get('passed') is True and isinstance(row.get('output'), str), 'Failed/missing host fixture output')
        output = row['output'].strip()
        try:
            result = json.loads(output)
        except json.JSONDecodeError:
            result = json.loads(output.splitlines()[-1])
        require(result.get('passed') is True, 'Host stdout did not pass')
        counts.append(result.get('checksPassed', result.get('checks')))
    require(counts == [16, 16, 14, 11], 'Unexpected focused host check inventory: ' + str(counts))
    return dict(path=path.relative_to(ROOT).as_posix(), sha256=digest(path), checksPassed=sum(counts), emulatorUsed=False)


def source_inventory(required, evidence):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    names = set(filter(None, raw.decode().split('\0'))) | required | evidence | APP_ADDITIONS
    names |= {MANIFEST, RECORD, EMULATOR, FALLBACK}
    for prefix in SOURCE_ADDITION_PREFIXES:
        names.update(path.relative_to(ROOT).as_posix() for path in (ROOT / prefix).rglob('*') if path.is_file())
    files = {}
    for name in sorted(names):
        rel = Path(name)
        if name.startswith('qa/') and name not in required:
            continue
        if any(part in C['SKIP'] for part in rel.parts) or name in C['TRANSIENT'] or rel.suffix in {'.partial', '.tmp'}:
            require(name not in required, 'Prior complete-source member would be omitted: ' + name)
            continue
        require(rel.suffix.lower() not in C['PRIVATE_SUFFIXES'] and not rel.name.startswith('.env')
            and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local source: ' + name)
        require(not name.endswith(('.apk', '-source.zip', '-data.tar')), 'External runtime archive in source: ' + name)
        path = ROOT / name
        require(path.resolve().is_relative_to(ROOT) and (path.is_file() or name in {MANIFEST, RECORD}), 'Missing source: ' + name)
        files[name] = path
    require(required <= set(files), 'A prior complete-source member was omitted')
    return files


def validate_source(source, files, checked):
    with ZipFile(source) as old:
        prior_names = set(old.namelist())
        require(len(prior_names) == len(old.namelist()), 'Duplicate baseline source entry')
        prior = {row['path']: row for row in json.loads(old.read(MANIFEST))['files']}
        require(set(prior) == prior_names - {MANIFEST}, 'Baseline complete-source manifest incomplete')
        gradle = old.read(GRADLE)
        require(gradle.count(b'versionCode = 60') == gradle.count(b'versionName = "0.60"') == 1, 'Ambiguous baseline version')
        expected = gradle.replace(b'versionCode = 60', b'versionCode = 61').replace(b'versionName = "0.60"', b'versionName = "0.61"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond exact version60-to61 bump')
        changed = []
        for name, row in prior.items():
            actual = digest(files[name])
            if actual == row['sha256']:
                continue
            allowed = name in APP_CHANGES | SOURCE_CHANGES | {GRADLE} | DOCUMENTATION or name.startswith(('tools/', 'archive/'))
            require(allowed, 'Unapproved baseline source changed: ' + name)
            changed.append(dict(path=name, beforeSHA256=row['sha256'], sha256=actual))
        additions = set(files) - prior_names
        app_added = {name for name in additions if name.startswith('app/')}
        require(app_added == APP_ADDITIONS, 'Unexpected/missing new app files: ' + str(sorted(app_added ^ APP_ADDITIONS)))
        for name in additions:
            require(name in APP_ADDITIONS | DOCUMENTATION or name.startswith(('tools/', 'archive/') + SOURCE_ADDITION_PREFIXES),
                'Unapproved source addition: ' + name)
        product = {row['path'] for row in changed if row['path'].startswith('app/') or row['path'] in SOURCE_CHANGES} | app_added
        product |= {name for name in additions if name.startswith(SOURCE_ADDITION_PREFIXES)}
        require(product <= checked, 'Changed product source not pinned by emulator proof: ' + str(sorted(product - checked)))
    return dict(changedBaselineSources=changed, addedSources=sorted(additions),
        baselineSourceEntries=len(prior_names), everyBaselineSourceEntryRetained=True,
        unrelatedScenarioSourcesPreserved=True, onlyApprovedConstructionAndTouchSourcesChanged=True)


def validate_apk(apk, baseline, expected):
    require(apk.is_file() and digest(apk) == expected, 'Candidate APK changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='61'",
        "versionName='0.61'", "application-label:'Warzone Towers'")), 'APK identity/version mismatch')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    config = (ROOT / BUILD_CONFIG).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*61\s*;', config)
        and re.search(r'\bVERSION_NAME\s*=\s*"0\.61"\s*;', config)
        and re.search(r'\bADMOB_TEST_ADS\s*=\s*false\s*;', config)
        and re.search(r'\bADMOB_REWARDED_AD_UNIT_ID\s*=\s*"' + re.escape(HELPERS['LIVE_UNIT']) + r'"\s*;', config),
        'Final generated delivery BuildConfig mismatch')
    with ZipFile(apk) as current, ZipFile(baseline) as old:
        names, prior = set(current.namelist()), set(old.namelist())
        require(len(names) == len(current.namelist()) and current.testzip() is None, 'Corrupt/duplicate APK')
        require(prior <= names, 'A baseline APK member was removed')
        additions = {'assets/' + name[len(ASSETS):] for name in APP_ADDITIONS if name.startswith(ASSETS)}
        require({name for name in names if name.startswith('assets/')} == {name for name in prior if name.startswith('assets/')} | additions,
            'Unexpected APK asset inventory')
        changed, frozen_native = [], []
        for name in sorted(names):
            if name in prior and zip_digest(current, name) == zip_digest(old, name):
                continue
            require(C['metadata'](name) or name.startswith('assets/')
                and 'app/src/main/' + name in APP_CHANGES | APP_ADDITIONS, 'Unexpected APK member changed: ' + name)
            changed.append(name)
        for path in (ROOT / ASSETS).rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / ASSETS).as_posix()
                require(name in names and zip_digest(current, name) == digest(path), 'APK/source asset mismatch: ' + name)
        for name in prior:
            if re.fullmatch(r'assets/warzone/warzone2100(?:-[^/]+)?\.(?:js|wasm|data)', name) and 'app/src/main/' + name not in NATIVE_CHANGES:
                require(zip_digest(current, name) == zip_digest(old, name), 'Existing native engine/loader/data changed: ' + name)
                frozen_native.append(name)
        music = 'assets/warzone/music/music.data'
        require(current.getinfo(music).compress_type == ZIP_STORED and zip_digest(current, music) == zip_digest(old, music),
            'Bundled soundtrack changed/compressed')
        dex = [current.read(name) for name in names if re.fullmatch(r'classes(?:\d+)?\.dex', name)]
        require(any(HELPERS['LIVE_UNIT'].encode() in value for value in dex)
            and any(HELPERS['SAMPLE_UNIT'].encode() in value for value in dex), 'Phone live reward unit/emulator fallback missing')
    return dict(certificateSHA256=signing, changedAPKMembers=changed, everyBaselineAPKMemberRetained=True,
        allAPKAssetsMatchSource=True, frozenExistingNativeAssets=sorted(frozen_native),
        compiledNativeProgramsPreserved=True, unrelatedNativeAssetsFrozen=True, bundledMusicFrozen=True, livePhoneAdsAndEmulatorFallbackRetained=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    expected = args.expected_sha256.lower()
    require(re.fullmatch('[0-9a-f]{64}', expected), 'Invalid expected APK SHA256')
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery outputs must stay outside repository')
    baseline, source = baseline_paths()
    proof, checked, evidence = validate_emulator(expected)
    payload = validate_construction_payload()
    clean = validate_clean_build(expected)
    host_checks = validate_host_checks()
    with ZipFile(source) as old:
        required = set(old.namelist())
    files = source_inventory(required, evidence)
    preservation = validate_source(source, files, checked)
    apk_record = validate_apk(args.apk, baseline, expected)
    require(digest(args.apk) == expected, 'Candidate APK changed during validation')
    if args.validate_only:
        print(json.dumps(dict(packageValidationPassed=True, deliveryWritten=False, sourceFiles=len(files), constructionPayload=payload, cleanBuild=clean, focusedHostChecks=host_checks, **preservation, **apk_record), indent=2))
        return
    apk_out, source_out, checksum = (args.output / name for name in ('Warzone-Towers-0.61.apk', 'warzone-towers-0.61-source.zip', 'Warzone-Towers-0.61-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(path.exists() for path in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    record = dict(version='0.61', versionCode=61, candidateAPK_SHA256=expected,
        scope='Native-aware crowded construction reservations and explicit blocked-order recovery, plus two-finger twist camera rotation in Towers, Campaign and FFA.',
        emulatorUsed=True, exactAPKVerified=True, verification=proof, fallback=dict(path=FALLBACK, sha256=digest(ROOT / FALLBACK)),
        sourcePreservation=preservation, constructionPayload=payload, cleanBuild=clean, focusedHostChecks=host_checks, **apk_record, liveAdsTested=False, githubPublished=False, vpsChanged=False,
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
        require(required <= set(archive.namelist()), 'Prior complete source member missing from output ZIP')
        for name in files:
            if name.startswith(ASSETS):
                require(zip_digest(archive, name) == zip_digest(apk, 'assets/' + name[len(ASSETS):]), 'Source ZIP/APK asset mismatch: ' + name)
    partial.rename(source_out)
    apk_sha, source_sha = digest(apk_out), digest(source_out)
    require(apk_sha == expected and digest(args.apk) == expected, 'Exact APK changed before delivery completed')
    checksum.write_text(apk_sha + '  ' + apk_out.name + '\n' + source_sha + '  ' + source_out.name + '\n', encoding='utf-8')
    require(digest(apk_out) == expected and digest(source_out) == source_sha, 'Delivery changed before final checksum check')
    print(json.dumps(dict(packageIntegrityPassed=True, apk=str(apk_out), apkSHA256=apk_sha,
        source=str(source_out), sourceSHA256=source_sha, checksums=str(checksum), sourceFiles=len(files),
        rawCopiedUnchangedZIPMembers=reused, everySourceMemberCRCAndSHAStreamed=True, exactCheckedAPKCopied=True), indent=2))


if __name__ == '__main__':
    main()
