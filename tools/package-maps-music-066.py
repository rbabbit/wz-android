"""Package the exact emulator-checked v0.66 FFA maps and music APK and complete retained source.

This tool never builds or controls a device. Compiled native programs and unrelated VFS files
are preserved from v0.65; unchanged complete-source ZIP entries reuse their original
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
HELPERS = runpy.run_path(str(ROOT / 'tools/package-launcher-059.py'), run_name='maps_music066_helpers')
H, C = HELPERS['H'], HELPERS['C']
digest, zip_digest, require = (C[name] for name in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
FALLBACK = 'archive/fallback-0.66.json'
EMULATOR = 'archive/maps-music-0.66-emulator-checks.json'
RECORD = 'archive/release-0.66-maps-music.json'
BASELINE_APK_SHA = 'ef18e0df365b5dc8bc50128aaf5bb93466138082fc16e233e9e223fa616c02fe'
BASELINE_SOURCE_SHA = '0d566d6852a939dfbb865794bf925a3cde7dab377a2fae5074c47641c901185c'
GRADLE = 'app/build.gradle.kts'
ASSETS = 'app/src/main/assets/'
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
NATIVE_CHANGES = {ASSETS+'warzone/warzone2100-ffa.'+suffix for suffix in ('js','data')}
APP_CHANGES = NATIVE_CHANGES | {JAVA+name for name in ('BattleLaunchSpec.java','FfaSetupView.java','MainActivity.java','MapMusicIndex.java','SaveGameStore.java','SavedGamesView.java')}
APP_CHANGES |= {ASSETS+name for name in ('guide/practical-data.js','guide/screenshots-data.js','warzone-ffa-hud.js','warzone-touch-controls.js','warzone/index-campaign.html','warzone/index-ffa.html','warzone/mobile-ffa.html','warzone/music-catalog.js','warzone/music-loader.js','warzone/saved-games.js')}
APP_ADDITIONS = {JAVA+'FfaMapCatalog.java',ASSETS+'ffa-maps.json'} | {ASSETS+'ffa-previews/'+name+'.png' for name in ('emag','contact','templar-ffa','rb-simple','rb-usefull','emaj-6p')}
APP_ADDITIONS.add(ASSETS+'guide/screenshots/ffa-setup-066.png')
SOURCE_CHANGES = {'scenario/ffa/'+name for name in ('PACKAGE.json','policy.js','rules.js','runtime-prepare.js','test-backend.cjs')}
SOURCE_ADDITION_PREFIXES = ('scenario/ffa/','map/ffa-emag/','map/ffa-contact/','map/ffa-templar-ffa/','map/ffa-rb-simple/','map/ffa-rb-usefull/','map/ffa-emaj-6p/','vendor/ffa-maps/')
DOCUMENTATION = {'AGENTS.md','README.md','design-qa.md','docs/KNOWN-ISSUES.md','docs/releases/0.66-ffa-maps-music.md','docs/music-0.66-source-audit.md'}
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
    require(saved.get('version') == '0.66' and saved.get('baseline') == '0.65', 'Wrong fallback record')
    for row in saved['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'],
            'Immutable v0.65 fallback changed: ' + str(path))
    apk = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.apk'))
    source = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.zip'))
    require(digest(apk) == BASELINE_APK_SHA and digest(source) == BASELINE_SOURCE_SHA, 'Wrong delivered v0.65 bytes')
    return apk, source


def validate_emulator(expected):
    proof = read_json(ROOT / EMULATOR)
    require(proof.get('version') == '0.66' and proof.get('passed') is True
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
    path = ROOT / 'archive/maps-music-clean-apk-0.66.json'
    proof = read_json(path)
    require(proof.get('passed') is True and proof.get('cleanBuild') is True
        and proof.get('candidateAPK_SHA256') == expected, 'Exact clean-build APK proof is required')
    return dict(path=path.relative_to(ROOT).as_posix(), sha256=digest(path), bytes=proof['candidateBytes'])


def validate_host_checks():
    rows=[]
    for name in ('ffa-maps-0.66-java-checks.json','ffa-maps-0.66-js-checks.json','ffa-maps-0.66-ui-checks.json','ffa-maps-0.66-preload-checks.json','ffa-maps-0.66-structure-checks.json','guide-0.66-browser-checks.json','music-0.66-index-checks.json','music-0.66-playlist-checks.json','music-0.66-browser-checks.json','music-0.66-towers-checks.json'):
        path=ROOT/'archive'/name;proof=read_json(path)
        require(proof.get('passed') is True or name=='music-0.66-towers-checks.json' and proof.get('simulatedSourceChecks') is True,'Passed source host proof required: '+name)
        if name=='ffa-maps-0.66-structure-checks.json':
            # This deterministic six-map native packing audit predates source
            # rows; rerun its actual checker rather than inventing such rows.
            import contextlib,io
            before=path.read_bytes();check=runpy.run_path(str(ROOT/'tools/check-ffa-structure-limits-066.py'),run_name='package066_structure_check')
            with contextlib.redirect_stdout(io.StringIO()):check['main']()
            require(path.read_bytes()==before,'Structure audit changed; record current evidence')
        else:
            pinned_rows(proof.get('sources'),'Host source')
        count=proof.get('checksPassed') or len(proof.get('checks',[]))
        if not count and name=='ffa-maps-0.66-preload-checks.json':
            count=len(proof.get('mapStructureLimits',[]));require(count==6 and proof.get('actualCompiledRemoveDependencyOrderingVerified') is True,'Missing real preload-phase cases')
        if not count and name=='ffa-maps-0.66-structure-checks.json':count=len(proof.get('maps',[]));require(count==6,'Missing six-map structure audit')
        require(count,'Missing host cases: '+name)
        rows.append(dict(path=path.relative_to(ROOT).as_posix(),sha256=digest(path),checksPassed=count))
    return rows


def validate_maps_music_assets():
    path=ROOT/'archive/ffa-maps-0.66-payload.json';proof=read_json(path)
    require(proof.get('passed') is True and proof.get('compiledFFAProgramUnchanged') is True and proof.get('noNativeBuild') is True and proof.get('actualNativeEngineExecuted') is False,'Missing honest native/map payload proof')
    pinned_rows(proof['outputs'],'FFA payload')
    require(len(proof['mapResults'])==6 and all(r['nativeFilesByteIdentical'] for r in proof['mapResults']),'Original maps not preserved')
    # Execute the actual narrow binary/map/source checker. Its deterministic
    # report must remain byte-identical to the pinned, already reviewed proof.
    import contextlib,io
    before=path.read_bytes();checker=runpy.run_path(str(ROOT/'tools/check-ffa-maps-066.py'),run_name='package066_native_check')
    with contextlib.redirect_stdout(io.StringIO()):checker['main']()
    require(path.read_bytes()==before,'Native payload proof changed; rerun recording before packaging')
    music=read_json(ROOT/'archive/music-0.66-source-review.json')
    require(music.get('passed') is True and music.get('noVPSChanges') is True and music.get('noNativeBuild') is True,'Missing music source audit')
    output=music['output'];require(digest(repository_path(output['path']))==output['sha256'],'Music catalogue audit changed')
    require(music['playlists']['campaign']['tracks']==['original_soundtrack/track1.opus','original_soundtrack/track2.opus','original_soundtrack/track3.opus'] and len(music['playlists']['ffa']['tracks'])==39,'Stock music policy differs')
    return dict(nativeProof=dict(path=path.relative_to(ROOT).as_posix(),sha256=digest(path)),maps=6,challenges=18,compiledNativeProgramUnchanged=True,originalMapBytesPreserved=True,musicAudit=dict(path='archive/music-0.66-source-review.json',sha256=digest(ROOT/'archive/music-0.66-source-review.json')),ffaTracks=39,campaignTracks=3)


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
        require(gradle.count(b'versionCode = 65') == gradle.count(b'versionName = "0.65"') == 1, 'Ambiguous baseline version')
        expected = gradle.replace(b'versionCode = 65', b'versionCode = 66').replace(b'versionName = "0.65"', b'versionName = "0.66"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond exact version65-to66 bump')
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
        unrelatedScenarioSourcesPreserved=True, onlyApprovedMapsAndMusicSourcesChanged=True)


def validate_apk(apk, baseline, expected):
    require(apk.is_file() and digest(apk) == expected, 'Candidate APK changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='66'",
        "versionName='0.66'", "application-label:'Warzone Towers'")), 'APK identity/version mismatch')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    config = (ROOT / BUILD_CONFIG).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*66\s*;', config)
        and re.search(r'\bVERSION_NAME\s*=\s*"0\.66"\s*;', config)
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
    payload = validate_maps_music_assets()
    clean = validate_clean_build(expected)
    host_checks = validate_host_checks()
    with ZipFile(source) as old:
        required = set(old.namelist())
    files = source_inventory(required, evidence)
    preservation = validate_source(source, files, checked)
    apk_record = validate_apk(args.apk, baseline, expected)
    require(digest(args.apk) == expected, 'Candidate APK changed during validation')
    if args.validate_only:
        print(json.dumps(dict(packageValidationPassed=True, deliveryWritten=False, sourceFiles=len(files), mapsAndMusic=payload, cleanBuild=clean, focusedHostChecks=host_checks, **preservation, **apk_record), indent=2))
        return
    apk_out, source_out, checksum = (args.output / name for name in ('Warzone-Towers-0.66.apk', 'warzone-towers-0.66-source.zip', 'Warzone-Towers-0.66-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(path.exists() for path in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    record = dict(version='0.66', versionCode=66, candidateAPK_SHA256=expected,
        scope='Six authored FFA maps and independent four/six-player matches, with existing bundled music playlists in FFA/Campaign. Compiled native programs, Towers/Campaign gameplay, gestures, rewards, ads and soundtrack bytes remain preserved.',
        emulatorUsed=True, exactAPKVerified=True, verification=proof, fallback=dict(path=FALLBACK, sha256=digest(ROOT / FALLBACK)),
        sourcePreservation=preservation, mapsAndMusic=payload, cleanBuild=clean, focusedHostChecks=host_checks, **apk_record, liveAdsTested=False, githubPublished=False, vpsChanged=False,
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
