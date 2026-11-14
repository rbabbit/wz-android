"""Guard and package v0.39's monochrome UI and selected Production layout.

The immutable v0.38 APK and complete source ZIP are the baseline. This does not
depend on v0.38 having been committed to Git. No emulator testing is authorized.
Source/VM/Canvas fixtures and Android build/package checks do not establish
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

ROOT = Path(__file__).resolve().parents[1]
COMMON = runpy.run_path(str(ROOT / 'tools/package-24-home.py'), run_name='package_039_common')
require, digest, zip_digest = (COMMON[k] for k in ('require', 'digest', 'zip_digest'))
read_json, repo_path, metadata = (COMMON[k] for k in ('read_json', 'repo_path', 'metadata'))
NATIVE_SOURCE, MANIFEST, STORED, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[k] for k in (
    'NATIVE_SOURCE', 'MANIFEST', 'STORED', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
ASSET_SCOPE = {'assets/warzone-command-pages.js', 'assets/warzone-touch-controls.js',
    'assets/warzone/ui/towers-commands.css', 'assets/warzone/ui/towers-shell.css',
    'assets/warzone/ui/towers-research.css', 'assets/warzone/ui/towers-status.css',
    'assets/warzone/ui/towers-intelligence.css', 'assets/warzone/ui/towers-monochrome.css'}
JAVA_SCOPE = {JAVA + n for n in ('TowersTheme.java', 'GraphicsSetupView.java', 'MapPreviewPager.java',
    'RewardsView.java', 'SavedGamesView.java', 'RewardReceiptView.java', 'WarzoneSplashView.java',
    'BattleBriefingView.java', 'MainActivity.java')}
RESOURCE_SCOPE = {'app/src/main/res/values/colors.xml', 'app/src/main/res/values/styles.xml'}
ADDED_APP_SOURCE = {JAVA + 'TowersTheme.java', 'app/src/main/assets/warzone/ui/towers-monochrome.css'}
SOURCE_SCOPE = {'app/src/main/' + n for n in ASSET_SCOPE} | JAVA_SCOPE | RESOURCE_SCOPE
GRADLE = 'app/build.gradle.kts'
FALLBACK = 'archive/fallback-0.39.json'
RECORD = 'archive/release-0.39-source-build-only.json'
SOURCE_REPORT = 'archive/theme-0.39-source-checks.json'
DOC = 'docs/releases/0.39-theme.md'
BASELINE_SHA = '3eb96cc5ec3e829a422823126d8f664ad98e1c5064dab5f84087392fb5e6beae'
SOURCE_SHA = '28407a5782f8126438c13c7aeeba89f4ecdb3dbd2ab5cf56ec01ba4e89b85b7e'
MUSIC_ASSET = 'assets/warzone/music/music.data'
MUSIC_SHA = '602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd'
MUSIC_BYTES = 114721578
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~3347511713'
AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917'
PUBLISHER_AD_UNIT_ID = 'ca-app-pub-3430279660625393/5338770704'
NATIVE_REQUIRED = {NATIVE_SOURCE}


def write_json(path, value):
    with path.open('w', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.is_file() and path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'],
                'Frozen v0.38 fallback changed: ' + str(path))
    apk = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.38-Test-Ads.apk')
    source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.38-source.zip')
    require(digest(apk) == BASELINE_SHA and digest(source) == SOURCE_SHA, 'Wrong immutable v0.38 baseline')
    return apk, source


def validate_source(source):
    """Compare every original source file; no old native/gameplay suite is run."""
    changed, protected = [], []
    with ZipFile(source) as archive:
        names = set(archive.namelist())
        require(len(names) == len(archive.namelist()), 'Duplicate baseline source member')
        manifest = json.loads(archive.read(MANIFEST))
        indexed = {entry['path']: entry for entry in manifest['files']}
        require(set(indexed) == names - {MANIFEST}, 'v0.38 source inventory is incomplete')
        expected_gradle = archive.read(GRADLE).replace(b'versionCode = 38', b'versionCode = 39').replace(
            b'versionName = "0.38"', b'versionName = "0.39"')
        require((ROOT / GRADLE).read_bytes() == expected_gradle, 'Build settings changed beyond version 39')
        require((ROOT / '.gitattributes').read_bytes() == archive.read('.gitattributes'), 'LFS storage rules changed')
        for name, entry in indexed.items():
            if name == GRADLE or name in {MANIFEST, 'AGENTS.md', 'README.md', 'design-qa.md'} or name.startswith(('docs/', 'qa/')):
                continue
            path = ROOT / name
            require(path.is_file(), 'Required baseline source was removed: ' + name)
            actual = digest(path)
            if actual != entry['sha256']:
                require(name in SOURCE_SCOPE, 'Source changed outside presentation/theme scope: ' + name)
                changed.append({'path': name, 'beforeSHA256': entry['sha256'], 'sha256': actual})
            else:
                protected.append(name)
        app_files = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src/main').rglob('*') if p.is_file()}
        require(app_files - names == ADDED_APP_SOURCE, 'Unexpected new app source/assets: ' + str(sorted(app_files - names)))
        require({v['path'] for v in changed} <= SOURCE_SCOPE, 'Changes exceed inspected presentation scope')
        require({'app/src/main/assets/warzone-command-pages.js'} | RESOURCE_SCOPE <= {v['path'] for v in changed},
                'Selected Production and expected native resource presentation changes are missing')
        for name, old, new in (('app/src/main/res/values/colors.xml', b'#38251D', b'#080808'),
                               ('app/src/main/res/values/styles.xml', b'#8BD3CC', b'#F4F4F4')):
            before = archive.read(name)
            require(before.count(old) == 1 and (ROOT/name).read_bytes() == before.replace(old,new,1),
                    'Native resource changed beyond the exact background/accent color: '+name)
        hook = 'app/src/main/assets/warzone-touch-controls.js'
        anchor = b"            surface.head.appendChild(polishedTheme);\n"
        addition = b'''          }
          if (!surface.getElementById('wt-towers-monochrome-style')) {
            const monochromeTheme = surface.createElement('link');
            monochromeTheme.id = 'wt-towers-monochrome-style';
            monochromeTheme.rel = 'stylesheet';
            monochromeTheme.href = '/warzone/ui/towers-monochrome.css';
            surface.head.appendChild(monochromeTheme);
'''
        before = archive.read(hook)
        require(before.count(anchor) == 1 and (ROOT/hook).read_bytes() == before.replace(anchor,anchor+addition,1),
                'Touch controls changed beyond the inspected non-Duel theme link insertion')
    build = (ROOT / GRADLE).read_text(encoding='utf-8')
    require(all(v in build for v in ('versionCode = 39', 'versionName = "0.39"',
        'com.google.android.gms:play-services-ads:25.5.0', 'com.google.android.ump:user-messaging-platform:4.0.0')),
        'Version or existing pinned ad SDKs changed')
    scope = sorted(SOURCE_SCOPE | {GRADLE})
    return {'changedAppSources': changed, 'addedAppSources': sorted(ADDED_APP_SOURCE),
            'preservedOriginalSourceFiles': len(protected),
            'protectedSourcePaths': protected,
            'sources': [{'path': name, 'sha256': digest(ROOT / name)} for name in scope],
            'baselineManifestEntries': len(manifest['files']),
            'sourceZIPBaselineSHA256': SOURCE_SHA, 'nativeAndMapSourcesFrozen': True,
            'walletSaveCodecAndAdControllerFrozen': True}


def verify_source_report(path):
    name = repo_path(path); report = read_json(path)
    require(report.get('version') == '0.39' and report.get('emulatorUsed') is False
            and report.get('checksPassed', 0) > 0, 'Current source-only preservation report missing')
    require({v['path'] for v in report.get('sources', [])} >= SOURCE_SCOPE | {GRADLE},
            'Source report must bind the final changed app scope')
    for entry in report['sources']:
        current = ROOT / entry['path']; repo_path(current)
        require(current.is_file() and digest(current) == entry['sha256'], 'Reviewed source changed: ' + entry['path'])
    return {'path': name, 'sha256': digest(path)}


def verify_regression(args):
    require(len(args.regression_report) == len(args.expected_regression_report_sha256),
            'Supply one expected SHA256 for every regression report')
    require({repo_path(path) for path in args.regression_report} == {
        'archive/production-ui-0.39-checks.json', 'archive/web-theme-0.39-checks.json',
        'archive/native-theme-0.39-checks.json'} and len(args.regression_report) == 3,
        'All three final Production, web and native-source reports are required')
    reports, scopes, checks_all, inputs_by_path, evidence_by_path = [], [], [], {}, {}
    for path, expected in zip(args.regression_report, args.expected_regression_report_sha256):
        expected = expected.lower()
        name = repo_path(path)
        require(digest(path) == expected, 'Regression proof hash differs: '+name)
        proof = read_json(path)
        source_only_native = (proof.get('androidRuntimeExecuted') is False
                              and proof.get('renderedUIVerified') is False
                              and proof.get('actualNativeEngineExecuted') is not True)
        require(proof.get('version') == '0.39' and proof.get('passed') is True
                and proof.get('emulatorUsed') is False
                and (proof.get('actualNativeEngineExecuted') is False or source_only_native),
                'Regression proof must disclose controlled v0.39 non-native/non-emulator verification: '+name)
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
    required = {'app/src/main/assets/warzone-command-pages.js', 'app/src/main/assets/warzone-touch-controls.js'}
    require(required <= set(inputs_by_path), 'Reports must bind Production logic and Towers-only theme loading')
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
                and not ({n for n in old_names if n.startswith('assets/')} - assets), 'App asset inventory changed beyond monochrome stylesheet')
        changed = [n for n in apk.namelist() if n not in old_names or zip_digest(apk, n) != zip_digest(old, n)]
        removed = old_names - names
        require(all(n in ASSET_SCOPE or metadata(n) for n in changed + list(removed)),
                'APK changed outside approved presentation/theme UI and metadata')
        changed_assets = {n for n in changed if n.startswith('assets/')}
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in assets and digest(path) == zip_digest(apk, name), 'Stale APK asset: ' + name)
        native_names = ['assets/warzone/warzone2100.' + ext for ext in ('js', 'data', 'wasm')]
        native_hashes = {n: zip_digest(apk, n) for n in native_names}
        require(all(native_hashes[n] == zip_digest(old, n) for n in native_names), 'Native engine/loader/data changed')
        require(apk.getinfo(MUSIC_ASSET).file_size == MUSIC_BYTES
                and apk.getinfo(MUSIC_ASSET).compress_type == ZIP_STORED and zip_digest(apk, MUSIC_ASSET) == MUSIC_SHA,
                'Bundled original soundtrack changed or is compressed/extracted')
        dex = [apk.read(n) for n in names if re.fullmatch(r'classes(?:\d+)?\.dex', n)]
        require(dex and any(AD_UNIT_ID.encode('ascii') in v for v in dex)
                and not any(PUBLISHER_AD_UNIT_ID.encode('ascii') in v for v in dex), 'Only sample rewarded ads may ship')
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    require(all(v in badging for v in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='39'",
        "versionName='0.39'", "application-label:'Warzone Towers'", 'application-debuggable')), 'App identity/version changed')
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
    return {'version': '0.39', 'versionCode': 39, 'candidateAPK_SHA256': candidate,
        'scope': 'Monochrome presentation and Production mock 2, verified by controlled browser fixtures and source/build/package checks only.',
        'emulatorUsed': False, 'androidRuntimeExecuted': False, 'actualNativeEngineExecuted': False,
        'gameplayVerified': False, 'gpuRenderingVerified': False, 'testAdsOnly': True, 'liveAdsTested': False,
        'sourceCheckReports': [reviewed] + regressions, 'regressionScopes': regression_scopes,
        'regressionCheckCount': len(regression_checks), 'regressionChecks': regression_checks,
        'regressionInputSources': regression_inputs, 'desktopFixtureEvidence': fixture_evidence,
        'browserFixturesUsed': True, 'nativeAndroidViewsRuntimeVerified': False,
        'compiledResourcePalette': palette,
        'changedAPKAssets': sorted(changed_assets), 'changedAPKMembers': changed, 'removedAPKMembers': sorted(removed),
        'sourcePreservation': preservation, 'nativeAssetSHA256': native_hashes,
        'nativeEngineAndDataByteIdenticalTo038': True, 'bundledMusicByteIdenticalTo038': True,
        'mapsDuelScenarioCatalogsUnchanged': True, 'walletSaveCodecAndAdsControllerUnchanged': True,
        'signing': {'sameCertificateAs038': True, 'certificateSHA256': signing_sha},
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
    outputs = [args.output / n for n in ('Warzone-Towers-0.39-Test-Ads.apk', 'warzone-towers-0.39-source.zip', 'Warzone-Towers-0.39-Test-Ads-SHA256.txt')]
    apk_out, source_out, checksums = outputs; partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in outputs + [partial]), 'Frozen delivery/partial must not be overwritten')
    record = validate(args)
    required = NATIVE_REQUIRED | set(record['sourcePreservation']['protectedSourcePaths']) | {'tools/package-24-home.py', 'tools/package-39-theme.py',
        'tools/check-theme-039-preservation.py', 'tools/check-native-theme-039.py', RECORD, FALLBACK, DOC, MANIFEST,
        'docs/ui-0.39/design-qa.md', 'docs/ui-0.39/production-selected.png', 'README.md', 'AGENTS.md'}
    frozen_source = next(Path(entry['path']) for entry in read_json(ROOT / FALLBACK)['files']
                         if Path(entry['path']).name == 'warzone-towers-0.38-source.zip')
    with ZipFile(frozen_source) as archive:
        required.update(archive.namelist())
    for entry in record['sourceCheckReports'] + record['regressionInputSources'] + record['desktopFixtureEvidence']:
        required.add(entry['path'])
    files = source_inventory(required)
    if args.validate_only:
        print(json.dumps({'validationPassed': True, 'deliveryFilesWritten': False,
            'candidateAPK_SHA256': record['candidateAPK_SHA256'], 'regressionChecks': record['regressionCheckCount'],
            'sourceFiles': len(files), 'nativeEngineMapsMusicAndPolicyFrozen': True, 'sameSigningCertificateAs038': True}, indent=2))
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
    for entry in record['sourceCheckReports'] + record['regressionInputSources'] + record['desktopFixtureEvidence']:
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
