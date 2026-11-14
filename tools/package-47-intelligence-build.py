"""Package v0.47's Intelligence, compact Build summary and Home arrow fixes.

Source/build/archive integrity only; no device, browser, gameplay or ad request.
Retains every complete v0.46 source entry and unchanged compressed ZIP members.
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
PRIOR = runpy.run_path(str(ROOT / 'tools/package-45-game-controls.py'), run_name='package_047_helpers')
COMMON = PRIOR['COMMON']
require, digest, zip_digest = (COMMON[n] for n in ('require', 'digest', 'zip_digest'))
MANIFEST, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[n] for n in (
    'MANIFEST', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
read_json, write_json, sdk_paths, certificate, write_source_zip = (PRIOR[n] for n in (
    'read_json', 'write_json', 'sdk_paths', 'certificate', 'write_source_zip'))
FALLBACK = 'archive/fallback-0.47.json'
RECORD = 'archive/release-0.47-source-build-only.json'
GRADLE = 'app/build.gradle.kts'
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
ASSETS = 'app/src/main/assets/'
BASELINE_SHA = '139afb98e0c7383046c8ccde58e3e9296eb4c9128c0f3100f8905b9250f7169c'
SOURCE_SHA = 'e5787ddb2ced876e6d0d40472fd349974b866eca8e4bc726ba646a232a234df4'
EXPECTED_WASM = '55416581d2281eec535bcb4614e119c02302c6e45fb2579f72edbf18c4cede64'
UI_JAVA = {JAVA + n for n in ('MapPreviewPager.java', 'MainActivity.java')}
ADDED_APP = {ASSETS + 'warzone/ui/research-art.js'}
SCOPE = UI_JAVA | {ASSETS + n for n in ('warzone-intelligence.js', 'warzone-towers-notices.js',
    'warzone-mobile-research.js', 'warzone-command-pages.js')} | ADDED_APP
PROOFS = ('archive/intelligence-0.47-checks.json', 'archive/research-art-0.47-checks.json',
    'archive/build-summary-0.47-checks.json', 'archive/home-arrow-0.47-checks.json')
BUILD_CONFIG = PRIOR['BUILD_CONFIG']


def allowed_source(name):
    return name in SCOPE or name.startswith(ASSETS + 'warzone/ui/') and name.endswith('.css')


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    require(saved.get('version') == '0.47' and saved.get('baseline') == '0.46', 'Wrong fallback record')
    for row in saved['files']:
        p = Path(row['path'])
        require(p.is_file() and p.stat().st_size == row['bytes'] and digest(p) == row['sha256'],
                'Immutable v0.46 fallback changed: ' + str(p))
    apk = next(Path(r['path']) for r in saved['files'] if r['path'].endswith('Warzone-Towers-0.46-Live-Ads.apk'))
    source = next(Path(r['path']) for r in saved['files'] if r['path'].endswith('warzone-towers-0.46-source.zip'))
    require(digest(apk) == BASELINE_SHA and digest(source) == SOURCE_SHA, 'Wrong v0.46 baseline')
    return apk, source


def source_inventory(baseline_names):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    candidates = set(filter(None, raw.decode('utf-8').split('\0'))) | baseline_names | {RECORD, MANIFEST}
    # Retain the earlier compiler log even if *.log is ignored by git.
    candidates |= {p.relative_to(ROOT).as_posix() for p in (ROOT / 'archive/native-theme-0.46').rglob('*') if p.is_file()}
    files = {}
    for name in sorted(candidates):
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
        expected = z.read(GRADLE).replace(b'versionCode = 46', b'versionCode = 47').replace(
            b'versionName = "0.46"', b'versionName = "0.47"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond version47')
        for name, row in indexed.items():
            actual = digest(files[name])
            if actual == row['sha256']:
                preserved += 1
                continue
            require(name in {GRADLE, 'AGENTS.md', 'README.md', 'design-qa.md'} or allowed_source(name),
                    'Existing source changed beyond presentation scope: ' + name)
            changed.append({'path': name, 'beforeSHA256': row['sha256'], 'sha256': actual})
        added_app = {n for n in files if n.startswith('app/src/main/') and n not in indexed}
        require(added_app == ADDED_APP, 'Only the shared research artwork resolver may be added: ' + str(sorted(added_app)))
    for name in PROOFS:
        proof = read_json(ROOT / name)
        require(proof.get('version') == '0.47' and proof.get('passed') is True, 'Failed current proof: ' + name)
        require(proof.get('emulatorUsed') is False, 'Device testing was not authorized')
        for row in proof.get('sources', []):
            require(row['sha256'] == digest(ROOT / row['path']), 'Source changed after proof: ' + row['path'])
    require(digest(ROOT / (ASSETS + 'warzone/warzone2100.wasm')) == EXPECTED_WASM, 'Native colour payload differs')
    return {'changedSources': changed, 'preservedBaselineFiles': preserved,
            'addedAppSources': sorted(ADDED_APP), 'baselineSourceEntries': len(indexed) + 1,
            'baselineSourceSHA256': SOURCE_SHA,
            'currentProofs': [{'path': n, 'sha256': digest(ROOT / n)} for n in PROOFS]}


def validate_apk(candidate, baseline, expected_sha):
    require(candidate.is_file() and digest(candidate) == expected_sha, 'Candidate APK changed')
    aapt, java, signer = sdk_paths()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(candidate)], text=True, encoding='utf-8')
    require(all(t in badging for t in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='47'",
        "versionName='0.47'", "application-label:'Warzone Towers'")), 'Wrong APK identity/version')
    xml = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(candidate), '--file', 'AndroidManifest.xml'], text=True, encoding='utf-8')
    require(PRIOR['APP_ID'] in xml, 'Publisher consent app ID changed')
    signing = certificate(candidate, java, signer)
    require(signing == certificate(baseline, java, signer), 'Signing certificate changed')
    config = (ROOT / BUILD_CONFIG).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*47\s*;', config)
            and re.search(r'\bVERSION_NAME\s*=\s*"0\.47"\s*;', config)
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
        require(zip_digest(apk, 'assets/warzone/warzone2100.wasm') == zip_digest(old, 'assets/warzone/warzone2100.wasm') == EXPECTED_WASM, 'Frozen native WASM differs')
        music = 'assets/warzone/music/music.data'
        require(apk.getinfo(music).compress_type == ZIP_STORED and zip_digest(apk, music) == zip_digest(old, music),
                'Bundled music changed/compressed')
        dex = [apk.read(n) for n in names if re.fullmatch(r'classes(?:\d+)?\.dex', n)]
        require(any(PRIOR['LIVE_UNIT'].encode() in b for b in dex) and any(PRIOR['SAMPLE_UNIT'].encode() in b for b in dex),
                'Compiled live reward unit/emulator sample fallback missing')
    return {'changedAPKMembers': changed, 'certificateSHA256': signing, 'sameSigningCertificateAs046': True,
            'frozenNativeWASM_SHA256': EXPECTED_WASM, 'engineLoaderDataVFSFrozen': True,
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
    apk_out, source_out, checksums = (args.output / n for n in ('Warzone-Towers-0.47-Live-Ads.apk',
        'warzone-towers-0.47-source.zip', 'Warzone-Towers-0.47-Live-Ads-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksums, partial)), 'Existing output must not be overwritten')
    baseline, source = baseline_paths()
    with ZipFile(source) as z:
        names = set(z.namelist())
    files = source_inventory(names)
    preservation = validate_source(source, files)
    apk = validate_apk(args.apk, baseline, args.expected_sha256.lower())
    record = {'version': '0.47', 'versionCode': 47,
        'scope': 'Engine-issued Intelligence report eligibility, robust refresh and correct research artwork; one live Build summary; readable map arrow states.',
        'emulatorUsed': False, 'browserUsed': False, 'androidRuntimeExecuted': False,
        'actualNativeEngineExecuted': False, 'gameplayVerified': False, 'screensVerified': False,
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
    shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == args.expected_sha256.lower(), 'Delivery APK changed')
    partial.rename(source_out)
    source_sha = digest(source_out)
    checksums.write_text(f'{args.expected_sha256.lower()}  {apk_out.name}\n{source_sha}  {source_out.name}\n', encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed': True, 'emulatorUsed': False, 'gameplayVerified': False,
        'adRequestsMade': False, 'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size,
        'candidateAPK_SHA256': args.expected_sha256.lower(), 'source': str(source_out),
        'sourceBytes': source_out.stat().st_size, 'sourceZIP_SHA256': source_sha,
        'sourceFiles': len(files), 'rawCopiedUnchangedZIPMembers': reused,
        'sourceWithin2GiB': source_out.stat().st_size < 2 * 1024 ** 3,
        'streamedEverySourceEntryCRCAndSHA': True, 'checksums': str(checksums)}, indent=2))


if __name__ == '__main__':
    main()
