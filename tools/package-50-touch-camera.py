"""Package v0.50's bounded frame-paced finger-pan input fix.

Focused source and installed-APK native camera verification; no ad request.
Retains every complete v0.49 source entry and unchanged compressed ZIP members.
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
PRIOR = runpy.run_path(str(ROOT / 'tools/package-45-game-controls.py'), run_name='package_050_helpers')
COMMON = PRIOR['COMMON']
require, digest, zip_digest = (COMMON[n] for n in ('require', 'digest', 'zip_digest'))
MANIFEST, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[n] for n in (
    'MANIFEST', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
read_json, write_json, sdk_paths, certificate, write_source_zip = (PRIOR[n] for n in (
    'read_json', 'write_json', 'sdk_paths', 'certificate', 'write_source_zip'))
FALLBACK = 'archive/fallback-0.50.json'
RECORD = 'archive/release-0.50-camera-verified.json'
GRADLE = 'app/build.gradle.kts'
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
ASSETS = 'app/src/main/assets/'
BASELINE_SHA = '9c51733883b05a2e16adba26e9c2b9cf085b9e85488f932c567d072dfe946282'
SOURCE_SHA = '2ad189a3b1f20d3fcc732c2c62a3e11af248b73cb12cf39feff7a387ec1c88de'
EXPECTED_WASM = '987a5bcc96ac95ca3ad55ba64b10bf81b58eda182f76b1263d168445b65d9aa1'
OLD_WASM = '55416581d2281eec535bcb4614e119c02302c6e45fb2579f72edbf18c4cede64'
ADDED_APP = set()
SCOPE = {ASSETS + 'warzone-touch-controls.js', ASSETS + 'warzone/warzone2100.wasm'}
PROOFS = ('archive/touch-pan-0.50-checks.json', 'archive/touch-pan-0.50-emulator-checks.json')
BUILD_CONFIG = PRIOR['BUILD_CONFIG']


def allowed_source(name):
    return name in SCOPE


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    require(saved.get('version') == '0.50' and saved.get('baseline') == '0.49', 'Wrong fallback record')
    for row in saved['files']:
        p = Path(row['path'])
        require(p.is_file() and p.stat().st_size == row['bytes'] and digest(p) == row['sha256'],
                'Immutable v0.49 fallback changed: ' + str(p))
    apk = next(Path(r['path']) for r in saved['files'] if r['path'].endswith('Warzone-Towers-0.49-Live-Ads.apk'))
    source = next(Path(r['path']) for r in saved['files'] if r['path'].endswith('warzone-towers-0.49-source.zip'))
    require(digest(apk) == BASELINE_SHA and digest(source) == SOURCE_SHA, 'Wrong v0.49 baseline')
    return apk, source


def source_inventory(baseline_names):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    candidates = set(filter(None, raw.decode('utf-8').split('\0'))) | baseline_names | {RECORD, MANIFEST}
    # Retain the earlier compiler log even if *.log is ignored by git.
    candidates |= {p.relative_to(ROOT).as_posix() for folder in ['archive/native-theme-0.46','archive/native-touch-0.50'] for p in (ROOT / folder).rglob('*') if p.is_file()}
    files = {}
    for name in sorted(candidates):
        # Disposable emulator backups/logs are not source. Only the curated,
        # hashed evidence under archive/touch-camera-0.50 is delivered.
        if name.startswith('qa/touch-pan-050/'):
            require(name not in baseline_names, 'Unexpected baseline QA member: ' + name)
            continue
        rel = Path(name)
        if any(p in SKIP for p in rel.parts) or name in TRANSIENT or rel.suffix in {'.partial', '.tmp'}:
            require(name not in baseline_names, 'Prior source entry would be omitted: ' + name)
            continue
        require(rel.suffix.lower() not in PRIVATE_SUFFIXES and not rel.name.startswith('.env')
                and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local file: ' + name)
        require(not name.endswith(('.apk', '-source.zip', '-data.tar')), 'Delivery/runtime archive in source: ' + name)
        p = ROOT / name
        require(p.resolve().is_relative_to(ROOT), 'Source outside repository: ' + name)
        require(p.is_file() or name in {RECORD, MANIFEST}, 'Required source missing: ' + name)
        files[name] = p
    require(baseline_names <= set(files), 'Every complete prior source entry must be retained')
    return files


def validate_source(source, files):
    changed, preserved = [], 0
    with ZipFile(source) as z:
        names = set(z.namelist())
        require(len(names) == len(z.namelist()), 'Duplicate prior source member')
        indexed = {r['path']: r for r in json.loads(z.read(MANIFEST))['files']}
        require(set(indexed) == names - {MANIFEST}, 'Prior complete-source manifest incomplete')
        expected = z.read(GRADLE).replace(b'versionCode = 49', b'versionCode = 50').replace(
            b'versionName = "0.49"', b'versionName = "0.50"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond version50')
        for name, row in indexed.items():
            actual = digest(files[name])
            if actual == row['sha256']:
                preserved += 1
                continue
            require(name in {GRADLE, 'AGENTS.md', 'README.md', 'design-qa.md'} or allowed_source(name),
                    'Existing source changed beyond finger-pan scope: ' + name)
            changed.append({'path': name, 'beforeSHA256': row['sha256'], 'sha256': actual})
        added_app = {n for n in files if n.startswith('app/src/main/') and n not in indexed}
        require(added_app == ADDED_APP, 'No new app assets or screens are authorized: ' + str(sorted(added_app)))
    for name in PROOFS:
        proof = read_json(ROOT / name)
        require(proof.get('version') == '0.50' and proof.get('passed') is True, 'Failed current proof: ' + name)
        require(proof.get('emulatorUsed') is (name.endswith('-emulator-checks.json')), 'Wrong verification scope: ' + name)
        for row in proof.get('sources', []):
            require(row['sha256'] == digest(ROOT / row['path']), 'Source changed after proof: ' + row['path'])
    require(digest(ROOT / (ASSETS + 'warzone/warzone2100.wasm')) == EXPECTED_WASM, 'Guarded native input payload differs')
    native = read_json(ROOT / 'archive/native-touch-0.50/native-build.json')
    require(native.get('passed') is True and native.get('allOtherEngineObjectsUnchanged') is True
            and native.get('changedObjects') == ['lib/sdl/CMakeFiles/sdl-backend.dir/main_sdl.cpp.o'],
            'Native change exceeded its guarded one-object scope')
    observed = read_json(ROOT / 'archive/touch-pan-0.50-emulator-checks.json')
    require(observed.get('passed') is True and observed.get('candidateAPK_SHA256')
            == digest(ROOT / 'app/build/outputs/apk/debug/app-debug.apk'), 'The exact delivery APK was not verified')
    return {'changedSources': changed, 'preservedBaselineFiles': preserved,
            'addedAppSources': sorted(ADDED_APP), 'baselineSourceEntries': len(indexed) + 1,
            'baselineSourceSHA256': SOURCE_SHA,
            'currentProofs': [{'path': n, 'sha256': digest(ROOT / n)} for n in PROOFS]}


def validate_apk(candidate, baseline, expected_sha):
    require(candidate.is_file() and digest(candidate) == expected_sha, 'Candidate APK changed')
    aapt, java, signer = sdk_paths()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(candidate)], text=True, encoding='utf-8')
    require(all(t in badging for t in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='50'",
        "versionName='0.50'", "application-label:'Warzone Towers'")), 'Wrong APK identity/version')
    xml = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(candidate), '--file', 'AndroidManifest.xml'], text=True, encoding='utf-8')
    require(PRIOR['APP_ID'] in xml, 'Publisher consent app ID changed')
    signing = certificate(candidate, java, signer)
    require(signing == certificate(baseline, java, signer), 'Signing certificate changed')
    config = (ROOT / BUILD_CONFIG).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*50\s*;', config)
            and re.search(r'\bVERSION_NAME\s*=\s*"0\.50"\s*;', config)
            and re.search(r'\bADMOB_TEST_ADS\s*=\s*false\s*;', config), 'Version/live build config mismatch')
    require(PRIOR['LIVE_UNIT'] in config, 'Phone rewarded unit changed')
    with ZipFile(candidate) as apk, ZipFile(baseline) as old:
        names, old_names = set(apk.namelist()), set(old.namelist())
        require(len(names) == len(apk.namelist()) and apk.testzip() is None, 'Corrupt/duplicate APK')
        require({n for n in names if n.startswith('assets/')} == {n for n in old_names if n.startswith('assets/')}
                | {n.removeprefix('app/src/main/') for n in ADDED_APP}, 'Existing asset added/removed unexpectedly')
        changed = []
        for name in sorted(names | old_names):
            if name in names & old_names and zip_digest(apk, name) == zip_digest(old, name):
                continue
            require(name.startswith('assets/') and allowed_source('app/src/main/' + name)
                    or COMMON['metadata'](name) or name.startswith('res/'), 'Unexpected APK change: ' + name)
            changed.append(name)
        for p in (ROOT / 'app/src/main/assets').rglob('*'):
            if p.is_file():
                name = 'assets/' + p.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in names and digest(p) == zip_digest(apk, name), 'APK/source asset mismatch: ' + name)
        for ext in ('js', 'data'):
            name = 'assets/warzone/warzone2100.' + ext
            require(zip_digest(apk, name) == zip_digest(old, name), 'Frozen engine loader/data changed: ' + name)
        require(zip_digest(apk, 'assets/warzone/warzone2100.wasm') == EXPECTED_WASM and zip_digest(old, 'assets/warzone/warzone2100.wasm') == OLD_WASM, 'Native input WASM differs from guarded source build')
        music = 'assets/warzone/music/music.data'
        require(apk.getinfo(music).compress_type == ZIP_STORED and zip_digest(apk, music) == zip_digest(old, music),
                'Bundled music changed/compressed')
        dex = [apk.read(n) for n in names if re.fullmatch(r'classes(?:\d+)?\.dex', n)]
        require(any(PRIOR['LIVE_UNIT'].encode() in b for b in dex) and any(PRIOR['SAMPLE_UNIT'].encode() in b for b in dex),
                'Compiled live reward unit/emulator sample fallback missing')
    return {'changedAPKMembers': changed, 'certificateSHA256': signing, 'sameSigningCertificateAs049': True,
            'sourceBuiltNativeWASM_SHA256': EXPECTED_WASM, 'engineLoaderDataVFSFrozen': True,
            'phoneLiveAdsConfigured': True, 'emulatorSampleFallbackRetained': True,
            'originalButtonArtworkRetainedUnused': True, 'originalSoundArtworkMapsMusicFrozen': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery must remain outside source tree')
    apk_out, source_out, checksums = (args.output / n for n in ('Warzone-Towers-0.50-Live-Ads.apk',
        'warzone-towers-0.50-source.zip', 'Warzone-Towers-0.50-Live-Ads-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (source_out, checksums, partial)), 'Existing source output must not be overwritten')
    require(not apk_out.exists() or digest(apk_out) == args.expected_sha256.lower(), 'Existing APK must match the verified candidate')
    baseline, source = baseline_paths()
    with ZipFile(source) as z:
        names = set(z.namelist())
    files = source_inventory(names)
    preservation = validate_source(source, files)
    apk = validate_apk(args.apk, baseline, args.expected_sha256.lower())
    record = {'version': '0.50', 'versionCode': 50,
        'scope': 'Native-correct pan release/rearm and synchronous first motion, with Towers-only middle-button repeat-drag normalization; native camera smoothing retained.',
        'emulatorUsed': True, 'browserUsed': False, 'androidRuntimeExecuted': True,
        'actualNativeEngineExecuted': True, 'gameplayVerified': True, 'screensVerified': False,
        'verifiedGameplayScope': 'Camera/input, native selection, construction/production, navigation and saved-game restoration',
        'terrainVisualCorrectnessVerified': False, 'physicalPhoneFramePacingVerified': False,
        'audioPlaybackVerified': False, 'adRequestsMade': False,
        'candidateAPK_SHA256': args.expected_sha256.lower(), 'sourcePreservation': preservation,
        'fallbackRecord': {'path': FALLBACK, 'sha256': digest(ROOT / FALLBACK)},
        'sourceInventory': 'Every prior complete-source entry plus current source and focused change proofs; no caches/private files.',
        'githubPublished': False, 'vpsChanged': False,
        'recordedUTC': datetime.now(timezone.utc).isoformat(), **apk}
    if args.validate_only:
        print(json.dumps({'packageValidationPassed': True, 'deliveryWritten': False, 'sourceFiles': len(files),
            'changedSources': preservation['changedSources'], 'changedAPKMembers': apk['changedAPKMembers']}, indent=2))
        return
    write_json(ROOT / RECORD, record)
    entries = [{'path': n, 'bytes': p.stat().st_size, 'sha256': digest(p)} for n, p in files.items() if n != MANIFEST]
    write_json(ROOT / MANIFEST, {'schemaVersion': 1, 'files': entries})
    args.output.mkdir(parents=True, exist_ok=True)
    reused = write_source_zip(source, partial, files, entries)
    require(digest(args.apk) == args.expected_sha256.lower(), 'Candidate APK changed while packaging')
    if not apk_out.exists():
        shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == args.expected_sha256.lower(), 'Delivery APK changed')
    partial.rename(source_out)
    source_sha = digest(source_out)
    checksums.write_text(f'{args.expected_sha256.lower()}  {apk_out.name}\n{source_sha}  {source_out.name}\n', encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed': True, 'emulatorUsed': True, 'gameplayVerified': True,
        'adRequestsMade': False, 'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size,
        'candidateAPK_SHA256': args.expected_sha256.lower(), 'source': str(source_out),
        'sourceBytes': source_out.stat().st_size, 'sourceZIP_SHA256': source_sha,
        'sourceFiles': len(files), 'rawCopiedUnchangedZIPMembers': reused,
        'sourceWithin2GiB': source_out.stat().st_size < 2 * 1024 ** 3,
        'streamedEverySourceEntryCRCAndSHA': True, 'checksums': str(checksums)}, indent=2))


if __name__ == '__main__':
    main()
