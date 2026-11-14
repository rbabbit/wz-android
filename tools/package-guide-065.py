"""Package the exact emulator-checked v0.65 offline Guide APK and complete retained source.

This tool never builds or controls a device. Compiled native programs and unrelated VFS files
are preserved from v0.64; unchanged complete-source ZIP entries reuse their original
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
HELPERS = runpy.run_path(str(ROOT / 'tools/package-launcher-059.py'), run_name='guide065_helpers')
H, C = HELPERS['H'], HELPERS['C']
digest, zip_digest, require = (C[name] for name in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
FALLBACK = 'archive/fallback-0.65.json'
EMULATOR = 'archive/guide-0.65-emulator-checks.json'
RECORD = 'archive/release-0.65-guide.json'
BASELINE_APK_SHA = '4d22e9a6bebda3d10dfdb4a2de6bf66e5120072711f6f349b293907572638ebd'
BASELINE_SOURCE_SHA = 'ebcc5546cd77d016ac46532f60c891be9f06b6bac52194aa4bc569f1bda7ec99'
GRADLE = 'app/build.gradle.kts'
ASSETS = 'app/src/main/assets/'
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
NATIVE_CHANGES = set()
APP_CHANGES = {JAVA + name for name in ('MainActivity.java','HomeModesView.java','GraphicsSetupView.java')} | {ASSETS + 'warzone-touch-controls.js'}
APP_ADDITIONS = {JAVA + 'GuideView.java'} | {path.relative_to(ROOT).as_posix() for path in (ROOT / ASSETS / 'guide').rglob('*') if path.is_file()}
SOURCE_CHANGES = set()
SOURCE_ADDITION_PREFIXES = ('guide/',)
DOCUMENTATION = {'AGENTS.md','README.md','design-qa.md','docs/KNOWN-ISSUES.md','docs/releases/0.65-field-guide.md'}
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
    require(saved.get('version') == '0.65' and saved.get('baseline') == '0.64', 'Wrong fallback record')
    for row in saved['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'],
            'Immutable v0.64 fallback changed: ' + str(path))
    apk = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.apk'))
    source = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.zip'))
    require(digest(apk) == BASELINE_APK_SHA and digest(source) == BASELINE_SOURCE_SHA, 'Wrong delivered v0.64 bytes')
    return apk, source


def validate_emulator(expected):
    proof = read_json(ROOT / EMULATOR)
    require(proof.get('version') == '0.65' and proof.get('passed') is True
        and proof.get('emulatorUsed') is True and proof.get('actualNativeEngineExecuted') is True
        and proof.get('candidateAPK_SHA256') == expected, 'Passed exact delivery-APK emulator proof is required')
    checks = proof.get('checks')
    require(isinstance(checks, list) and checks and all(isinstance(row, dict)
        and row.get('name') and row.get('passed') is True for row in checks), 'Missing/failed emulator checks')
    sources = pinned_rows(proof.get('sources'), 'emulator source')
    evidence = pinned_rows(proof.get('evidence'), 'emulator evidence')
    require(all(not name.startswith('qa/') for name in evidence), 'Retain evidence outside disposable QA')
    return proof, sources, evidence


def validate_clean_build(expected):
    path = ROOT / 'archive/guide-clean-apk-0.65.json'
    proof = read_json(path)
    require(proof.get('passed') is True and proof.get('cleanBuild') is True
        and proof.get('candidateAPK_SHA256') == expected, 'Exact clean-build APK proof is required')
    return dict(path=path.relative_to(ROOT).as_posix(), sha256=digest(path), bytes=proof['candidateBytes'])


def validate_host_checks():
    rows=[]
    for name in ('guide-0.65-content-checks.json','guide-0.65-browser-checks.json'):
        path=ROOT/'archive'/name; proof=read_json(path)
        require(proof.get('version')=='0.65' and proof.get('passed') is True, 'Passed final Guide host proof required: '+name)
        pinned_rows(proof.get('sources'),'Guide host source')
        require(proof.get('checks') and all(c.get('passed') is True for c in proof['checks']), 'Missing/failed Guide host cases')
        rows.append(dict(path=path.relative_to(ROOT).as_posix(),sha256=digest(path),checksPassed=len(proof['checks'])))
    return rows


def validate_guide_assets():
    path=ROOT/'archive/guide-0.65-research.json'; data=read_json(path)
    require(data.get('version')=='0.65' and data.get('passed') is True and data.get('noNativeBuildOrPayloadRegeneration') is True,'Missing read-only Guide research proof')
    pinned_rows(data.get('outputs'),'Guide research output')
    checked=ROOT/'archive/guide-0.65-research-checks.json'; check=read_json(checked)
    require(check.get('passed') is True and check.get('version')=='0.65' and check['dataSHA256']==digest(ROOT/ASSETS/'guide/research-data.js') and check['checkSourceSHA256']==digest(ROOT/'guide/check-research-data.py'),'Guide research check/source changed')
    pictures=ROOT/'archive/guide-0.65-screenshots.json'; proof=read_json(pictures)
    require(proof.get('version')=='0.65' and proof.get('passed') is True and proof.get('unmodifiedPixels') is True and proof.get('actualGuideRuntimeVerified') is False,'Missing honest original-screenshot proof')
    pinned_rows(proof.get('images'),'Guide original screenshot')
    image_paths={r['path'] for r in proof['images']}
    for row in proof['images']:
        require(row.get('unmodified') is True and row['sha256']==row['sourceSHA256'],'Guide raster was altered')
    text=(ROOT/ASSETS/'guide/screenshots-data.js').read_text(encoding='utf-8')
    figures=json.loads(text.split('window.WarzoneGuideScreenshots =',1)[1].strip().removesuffix(';'))
    from struct import unpack
    for key, figure in figures.items():
        image=(ROOT/ASSETS/'guide'/figure['src']).resolve()
        require(image.is_relative_to(ROOT/ASSETS/'guide') and image.relative_to(ROOT).as_posix() in image_paths,'Unpinned/outside Guide figure: '+key)
        content=image.read_bytes();require(content[:8]==b'\x89PNG\r\n\x1a\n' and unpack('>II',content[16:24])==(figure['width'],figure['height']),'Guide image size mismatch')
        rects=[c['targetRect'] for c in figure['callouts']]+([figure['focusRect']] if 'focusRect' in figure else [])
        require(figure['callouts'] and all(len(r)==4 and r[0]>=0 and r[1]>=0 and r[2]>0 and r[3]>0 and r[0]+r[2]<=1.000001 and r[1]+r[3]<=1.000001 for r in rects),'Guide annotation outside actual figure')
    return dict(research=dict(path=path.relative_to(ROOT).as_posix(),sha256=digest(path)),researchChecks=dict(path=checked.relative_to(ROOT).as_posix(),sha256=digest(checked)),screenshots=dict(path=pictures.relative_to(ROOT).as_posix(),sha256=digest(pictures)),uniqueOriginalImages=len(proof['images']),figureIDs=len(figures),noNativePayloadChange=True)


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
        require(gradle.count(b'versionCode = 64') == gradle.count(b'versionName = "0.64"') == 1, 'Ambiguous baseline version')
        expected = gradle.replace(b'versionCode = 64', b'versionCode = 65').replace(b'versionName = "0.64"', b'versionName = "0.65"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond exact version64-to65 bump')
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
        unrelatedScenarioSourcesPreserved=True, onlyApprovedGuideSourcesChanged=True)


def validate_apk(apk, baseline, expected):
    require(apk.is_file() and digest(apk) == expected, 'Candidate APK changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='65'",
        "versionName='0.65'", "application-label:'Warzone Towers'")), 'APK identity/version mismatch')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    config = (ROOT / BUILD_CONFIG).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*65\s*;', config)
        and re.search(r'\bVERSION_NAME\s*=\s*"0\.65"\s*;', config)
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
    payload = validate_guide_assets()
    clean = validate_clean_build(expected)
    host_checks = validate_host_checks()
    with ZipFile(source) as old:
        required = set(old.namelist())
    files = source_inventory(required, evidence)
    preservation = validate_source(source, files, checked)
    apk_record = validate_apk(args.apk, baseline, expected)
    require(digest(args.apk) == expected, 'Candidate APK changed during validation')
    if args.validate_only:
        print(json.dumps(dict(packageValidationPassed=True, deliveryWritten=False, sourceFiles=len(files), guideAssets=payload, cleanBuild=clean, focusedHostChecks=host_checks, **preservation, **apk_record), indent=2))
        return
    apk_out, source_out, checksum = (args.output / name for name in ('Warzone-Towers-0.65.apk', 'warzone-towers-0.65-source.zip', 'Warzone-Towers-0.65-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(path.exists() for path in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    record = dict(version='0.65', versionCode=65, candidateAPK_SHA256=expected,
        scope='Offline research reference and practical Guide with real unmodified screenshots, available from Home and existing Help. Native gameplay/data/maps/saves/rewards/music remain preserved.',
        emulatorUsed=True, exactAPKVerified=True, verification=proof, fallback=dict(path=FALLBACK, sha256=digest(ROOT / FALLBACK)),
        sourcePreservation=preservation, guideAssets=payload, cleanBuild=clean, focusedHostChecks=host_checks, **apk_record, liveAdsTested=False, githubPublished=False, vpsChanged=False,
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
