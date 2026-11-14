"""Package v0.45 game-control artwork, feedback and footer Build navigation.

Source/build/archive integrity only. No Android, browser, emulator, native-game
or ad execution. Every complete v0.44 source entry is retained; unchanged ZIP
members are raw-copied with their original compressed bytes.
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
PRIOR = runpy.run_path(str(ROOT / 'tools/package-44-hud-home.py'), run_name='package_045_helpers')
COMMON = PRIOR['COMMON']
require, digest, zip_digest = (COMMON[n] for n in ('require', 'digest', 'zip_digest'))
MANIFEST, NATIVE_SOURCE, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[n] for n in (
    'MANIFEST', 'NATIVE_SOURCE', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
read_json, write_json, sdk_paths, certificate, write_source_zip = (PRIOR[n] for n in (
    'read_json', 'write_json', 'sdk_paths', 'certificate', 'write_source_zip'))
FALLBACK = 'archive/fallback-0.45.json'
RECORD = 'archive/release-0.45-source-build-only.json'
GRADLE = 'app/build.gradle.kts'
BASELINE_SHA = '2ef4da8470c28a41ed0e8d916655c581336dab5ec20ca09d82228dffca97d46d'
SOURCE_SHA = '5d1dd405a169e6bc55ee56de296217ed7c96f73f813386efb7dcd6be7ae15391'
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
LIVE_UNIT = 'ca-app-pub-3430279660625393/5338770704'
SAMPLE_UNIT = 'ca-app-pub-3940256099942544/5224354917'
BUILD_CONFIG = 'app/build/generated/source/buildConfig/debug/com/rbabbit/blocknight/warzone/BuildConfig.java'
ASSET_ROOT = 'app/src/main/assets/'
JAVA_ROOT = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
ART = {ASSET_ROOT + 'warzone/ui/game-controls/' + name for name in ('button-plate.png', 'button-selected.png')}
CLICK = ASSET_ROOT + 'warzone/ui/game-controls/click.ogg'
FEEDBACK = ASSET_ROOT + 'warzone/ui/towers-feedback.js'
CONTROLS_CSS = ASSET_ROOT + 'warzone/ui/towers-game-controls.css'
NATIVE_DRAWABLE = JAVA_ROOT + 'TowersControlDrawable.java'
NATIVE_JAVA_SCOPE = {JAVA_ROOT + name for name in ('TowersTheme.java', 'GraphicsSetupView.java',
    'RewardsView.java', 'SavedGamesView.java', 'MainActivity.java')} | {NATIVE_DRAWABLE}
ADDED_APP = ART | {CLICK, FEEDBACK, CONTROLS_CSS, NATIVE_DRAWABLE}
ART_IDENTITIES = {
    'button-plate.png': ('exec-4d3e0a61-a5c6-48a3-aa4d-7001799f079d.png',
        'c6714adbbd6fb08324fe91aff907c36dfde9323478823fa192cd7c1edadd6910'),
    'button-selected.png': ('exec-22798795-61bd-443d-8089-05cacda4135f.png',
        'a98e7d4db68fe14f1af99b3226ca02690435df643a63fcc363c9fa74d757fe6d'),
}
SOURCE_SCOPE = {ASSET_ROOT + n for n in ('warzone-touch-controls.js', 'warzone-command-pages.js',
    'warzone/ui/lab-ui.js', 'warzone/ui/towers-status.js', 'warzone/index.html')} | ART | {CLICK, FEEDBACK} | NATIVE_JAVA_SCOPE
CORE = {'assets/warzone/warzone2100.' + ext for ext in ('js', 'wasm', 'data')}
PROOFS = {'archive/control-click-0.45.json', 'archive/game-controls-art-0.45.json',
    'archive/game-controls-0.45-checks.json', 'tools/extract-control-click-045.py', 'tools/check-game-controls-045.cjs'}


def allowed_source(name):
    return name in SOURCE_SCOPE or name.startswith(ASSET_ROOT + 'warzone/ui/') and name.endswith('.css')


def repo_path(path):
    path = path.resolve()
    require(path.is_relative_to(ROOT), 'Source outside repository: ' + str(path))
    return path.relative_to(ROOT).as_posix()


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    require(saved.get('version') == '0.45' and saved.get('baseline') == '0.44', 'Wrong fallback record')
    for row in saved['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'],
                'Immutable v0.44 fallback changed: ' + str(path))
    apk = next(Path(r['path']) for r in saved['files'] if r['path'].endswith('Warzone-Towers-0.44-Live-Ads.apk'))
    source = next(Path(r['path']) for r in saved['files'] if r['path'].endswith('warzone-towers-0.44-source.zip'))
    require(digest(apk) == BASELINE_SHA and digest(source) == SOURCE_SHA, 'Wrong v0.44 baseline')
    return apk, source


def source_inventory(baseline_names):
    result = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    candidates = set(filter(None, result.decode('utf-8').split('\0'))) | baseline_names | {RECORD, MANIFEST}
    files = {}
    for name in sorted(candidates):
        rel = Path(name)
        if any(part in SKIP for part in rel.parts) or name in TRANSIENT or rel.suffix in {'.partial', '.tmp'}:
            require(name not in baseline_names, 'Prior source entry would be omitted: ' + name)
            continue
        require(rel.suffix.lower() not in PRIVATE_SUFFIXES and not rel.name.startswith('.env')
                and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local source file: ' + name)
        require(not name.endswith(('.apk', '-source.zip', '-data.tar')), 'Delivery/runtime archive in source tree: ' + name)
        path = ROOT / name
        repo_path(path)
        require(path.is_file() or name in {RECORD, MANIFEST}, 'Required prior source was removed: ' + name)
        files[name] = path
    require(baseline_names <= set(files), 'Complete prior source archive must be retained')
    return files


def validate_source(source, files):
    changed, preserved = [], 0
    with ZipFile(source) as archive:
        names = set(archive.namelist())
        require(len(names) == len(archive.namelist()), 'Duplicate baseline source member')
        prior = json.loads(archive.read(MANIFEST))
        indexed = {r['path']: r for r in prior['files']}
        require(set(indexed) == names - {MANIFEST}, 'Prior source manifest incomplete')
        expected = archive.read(GRADLE).replace(b'versionCode = 44', b'versionCode = 45').replace(
            b'versionName = "0.44"', b'versionName = "0.45"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond version45; live/default/SDK configuration must stay frozen')
        for name, before in indexed.items():
            actual = digest(files[name])
            if actual == before['sha256']:
                preserved += 1
                continue
            require(name in {GRADLE, 'AGENTS.md', 'README.md', 'design-qa.md'} or allowed_source(name),
                    'Existing source changed beyond game-control/navigation scope: ' + name)
            changed.append({'path': name, 'beforeSHA256': before['sha256'], 'sha256': actual})
        added = {n for n in files if n.startswith('app/src/main/') and n not in indexed}
        require(added == ADDED_APP, 'New app files differ from approved art/feedback/native drawable: ' + str(sorted(added)))
        require({ASSET_ROOT + 'warzone-touch-controls.js', ASSET_ROOT + 'warzone/ui/lab-ui.js'}
                <= {r['path'] for r in changed}, 'Required top/footer navigation edits missing')
    for name in ART:
        data = files[name].read_bytes()
        require(data.startswith(b'\x89PNG\r\n\x1a\n') and len(data) > 100,
                'Real button PNG artwork missing: ' + name)
        require(int.from_bytes(data[16:20], 'big') >= 96 and int.from_bytes(data[20:24], 'big') >= 16,
                'Button plate art resolution too small: ' + name)
    return {'changedSources': changed, 'preservedBaselineFiles': preserved,
            'addedAppSources': sorted(added), 'baselineSourceEntries': len(indexed) + 1,
            'baselineSourceSHA256': SOURCE_SHA, 'nativeEngineScenarioArtMusicPolicySourcesFrozen': True,
            'nativeJavaPresentationScope': sorted(NATIVE_JAVA_SCOPE),
            'buttonArtwork': [{'path': name, 'bytes': files[name].stat().st_size, 'sha256': digest(files[name])} for name in sorted(ART)]}


def verify_click_asset(baseline, files):
    require(CLICK in files, 'Original game click asset missing')
    sound = files[CLICK].read_bytes()
    require(sound.startswith(b'OggS') and len(sound) == 2952
            and sha256(sound).hexdigest() == '345d636d2a73d95a1cf0136748f7bf90badcea2003b2fbe3654a8ce657c5b613',
            'Original game click Ogg bytes differ')
    helper = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='package_045_vfs_reader')
    with ZipFile(baseline) as old:
        script = old.read('assets/warzone/warzone2100.js').decode()
        data = old.read('assets/warzone/warzone2100.data')
        _, _, _, meta = helper['package_call'](script)
        helper['verify_index'](meta, data)
        matches = [row['filename'] for row in meta['files']
                   if str(row['filename']).lower().endswith('.ogg')
                   and data[row['start']:row['end']] == sound]
        require('/data/base/audio/sfx/interfce/beep3.ogg' in matches,
                'New click asset must be byte-identical to original native BUTTON_CLICK_3')
    proof = read_json(ROOT / 'archive/control-click-0.45.json')
    require(proof.get('version') == '0.45' and proof.get('baselineAPK_SHA256') == BASELINE_SHA
            and proof.get('sourceVFS') == '/data/base/audio/sfx/interfce/beep3.ogg'
            and proof.get('asset') == CLICK and proof.get('nativeSound') == 'ID_SOUND_BUTTON_CLICK_3'
            and proof.get('bytes') == len(sound) and proof.get('sha256') == sha256(sound).hexdigest()
            and proof.get('emulatorUsed') is False and proof.get('audioPlaybackVerified') is False
            and proof.get('gameDataModified') is False, 'Original control-click extraction provenance differs')
    return {'soundAssetAdded': True, 'sourceVirtualFilenames': matches,
            'bytes': len(sound), 'sha256': sha256(sound).hexdigest()}


def verify_controls_proofs(files):
    require(PROOFS <= set(files), 'Control artwork/feedback provenance omitted from complete source')
    art = read_json(ROOT / 'archive/game-controls-art-0.45.json')
    require(art.get('version') == '0.45' and art.get('borderSliceSourcePixels') == 64
            and art.get('controlEdgeCSSPixels') == 6 and art.get('emulatorUsed') is False
            and art.get('screensVerified') is False and {r['asset'] for r in art['assets']} == ART,
            'Control art provenance/slice settings differ')
    for row in art['assets']:
        path = files[row['asset']]
        png = path.read_bytes()
        origin, expected = ART_IDENTITIES[path.name]
        require(row.get('sourceImageGen') == origin and row.get('sha256') == digest(path) == expected
                and row.get('bytes') == path.stat().st_size
                and row.get('width') == int.from_bytes(png[16:20], 'big') == 2172
                and row.get('height') == int.from_bytes(png[20:24], 'big') == 724
                and row.get('mode') == 'RGBA' and png[25] == 6, 'Selected actual ImageGen control-art bytes differ: ' + path.name)
    proof = read_json(ROOT / 'archive/game-controls-0.45-checks.json')
    require(proof.get('version') == '0.45' and proof.get('passed') is True
            and all(proof.get(key) is False for key in ('emulatorUsed', 'browserUsed', 'androidRuntimeExecuted',
                'actualNativeEngineExecuted', 'gameplayVerified'))
            and proof.get('checksPassed') == len(proof.get('checks', [])) == 6,
            'Focused control-source/VM proof must disclose its non-runtime scope')
    expected_sources = {ASSET_ROOT + 'warzone-touch-controls.js', ASSET_ROOT + 'warzone/ui/lab-ui.js', FEEDBACK}
    require({r['path'] for r in proof['sources']} == expected_sources, 'Feedback source-proof scope differs')
    for row in proof['sources']:
        require(row['sha256'] == digest(files[row['path']]), 'Feedback source changed after focused VM checks: ' + row['path'])
    css = files[CONTROLS_CSS].read_text(encoding='utf-8')
    require(all(token in css for token in ('game-controls/button-plate.png', 'game-controls/button-selected.png',
        '--wt-control-slice:64', 'border-image-slice:var(--wt-control-slice) fill', 'pointer-events:none')),
        'Reviewed nine-slice control CSS missing')
    installer = files[ASSET_ROOT + 'warzone-touch-controls.js'].read_text(encoding='utf-8')
    require('/warzone/ui/towers-game-controls.css' in installer and '/warzone/ui/towers-feedback.js' in installer,
            'Actual controls installer must load the reviewed skin and feedback controller')
    return {'checksPassed': proof['checksPassed'], 'scope': proof['scope'],
            'nineSliceSourcePixels': 64, 'originalSVGIconsRetained': True,
            'proofInputs': [{'path': name, 'sha256': digest(files[name])} for name in sorted(PROOFS)]}


def verify_live_configuration(apk):
    path = ROOT / BUILD_CONFIG
    require(path.is_file(), 'Generated final BuildConfig missing')
    text = path.read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*45\s*;', text)
            and re.search(r'\bVERSION_NAME\s*=\s*"0\.45"\s*;', text)
            and re.search(r'\bADMOB_TEST_ADS\s*=\s*false\s*;', text)
            and re.search(r'\bADMOB_REWARDED_AD_UNIT_ID\s*=\s*"' + re.escape(LIVE_UNIT) + r'"\s*;', text),
            'Final BuildConfig must retain phone live rewarded-ad configuration')
    dex = [apk.read(n) for n in apk.namelist() if re.fullmatch(r'classes(?:\d+)?\.dex', n)]
    require(any(LIVE_UNIT.encode() in value for value in dex), 'Production rewarded ad unit missing from compiled APK')
    require(any(SAMPLE_UNIT.encode() in value for value in dex), 'Existing emulator sample fallback missing from compiled APK')
    return {'phoneLiveAdsConfigured': True, 'ADMOB_TEST_ADS': False, 'rewardedAdUnit': LIVE_UNIT,
            'publisherConsentAppId': APP_ID, 'emulatorSampleFallbackRetained': True,
            'adRequestsMade': False, 'generatedBuildConfig': {'path': BUILD_CONFIG, 'sha256': digest(path)}}


def validate_apk(candidate, baseline, candidate_sha, files):
    require(candidate.is_file() and digest(candidate) == candidate_sha, 'Candidate APK hash differs')
    aapt, java, signer = sdk_paths()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(candidate)], text=True, encoding='utf-8')
    require(all(token in badging for token in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='45'",
            "versionName='0.45'", "application-label:'Warzone Towers'", 'application-debuggable')), 'Wrong APK identity/version')
    xml = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(candidate), '--file', 'AndroidManifest.xml'], text=True, encoding='utf-8')
    require(APP_ID in xml, 'Publisher consent app ID changed')
    signing = certificate(candidate, java, signer)
    require(signing == certificate(baseline, java, signer), 'Signing certificate changed')
    with ZipFile(candidate) as apk, ZipFile(baseline) as old:
        names, old_names = set(apk.namelist()), set(old.namelist())
        require(len(names) == len(apk.namelist()) and apk.testzip() is None, 'Corrupt/duplicate APK member')
        added_assets = {n for n in names - old_names if n.startswith('assets/')}
        expected_added = {n.removeprefix('app/src/main/') for n in ADDED_APP if n.startswith(ASSET_ROOT)}
        require(added_assets == expected_added, 'New APK assets differ from reviewed game-control additions')
        require(not any(n.startswith('assets/') for n in old_names - names), 'Existing APK asset removed')
        changed = []
        for name in sorted(names | old_names):
            if name in names & old_names and zip_digest(apk, name) == zip_digest(old, name):
                continue
            require(name.startswith('assets/') and allowed_source('app/src/main/' + name)
                    or COMMON['metadata'](name) or name.startswith('res/'), 'APK changed outside controls/navigation scope: ' + name)
            changed.append(name)
        native = {}
        for name in sorted(CORE):
            native[name] = zip_digest(apk, name)
            require(native[name] == zip_digest(old, name), 'Native engine/loader/data changed: ' + name)
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in names and digest(path) == zip_digest(apk, name), 'APK asset differs from current source: ' + name)
        music = 'assets/warzone/music/music.data'
        require(apk.getinfo(music).compress_type == ZIP_STORED and zip_digest(apk, music) == zip_digest(old, music),
                'Bundled soundtrack changed/compressed')
        live = verify_live_configuration(apk)
    return {'changedAPKMembers': changed, 'sameSigningCertificateAs044': True,
            'certificateSHA256': signing, 'frozenNativeAssetSHA256': native, 'nativeBuildPerformed': False,
            'clickSound': verify_click_asset(baseline, files), 'controlSourceProof': verify_controls_proofs(files),
            'liveAdConfiguration': live,
            'nativeEngineScenarioSaveRewardControllerSDKsArtMapsMusicUnchanged': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery output must stay outside source tree')
    apk_out, source_out, checksums = (args.output / n for n in ('Warzone-Towers-0.45-Live-Ads.apk',
        'warzone-towers-0.45-source.zip', 'Warzone-Towers-0.45-Live-Ads-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksums, partial)), 'Existing output/partial must not be overwritten')
    baseline, source = baseline_paths()
    with ZipFile(source) as archive:
        names = set(archive.namelist())
    files = source_inventory(names)
    preservation = validate_source(source, files)
    apk = validate_apk(args.apk, baseline, args.expected_sha256.lower(), files)
    record = {'version': '0.45', 'versionCode': 45,
        'scope': 'Selected actual game-control artwork across existing HTML/native controls and responsive feedback; Build moves from top nav beside Analysis and Manufacturing in footer.',
        'emulatorUsed': False, 'browserUsed': False, 'androidRuntimeExecuted': False, 'actualNativeEngineExecuted': False,
        'gameplayVerified': False, 'gpuRenderingVerified': False, 'layoutRuntimeVerified': False, 'adRequestsMade': False,
        'candidateAPK_SHA256': args.expected_sha256.lower(), 'sourcePreservation': preservation,
        'fallbackRecord': {'path': FALLBACK, 'sha256': digest(ROOT / FALLBACK)},
        'sourceInventory': 'Every prior complete-source ZIP entry plus current source; caches/private/transient files excluded.',
        'githubPublished': False, 'vpsChanged': False,
        'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'), **apk}
    if args.validate_only:
        print(json.dumps({'packageValidationPassed': True, 'deliveryWritten': False, 'sourceFiles': len(files),
            'changedSources': preservation['changedSources'], 'changedAPKMembers': apk['changedAPKMembers'],
            'nativeBuildPerformed': False, 'liveAdConfiguration': apk['liveAdConfiguration'], 'emulatorUsed': False}, indent=2))
        return
    write_json(ROOT / RECORD, record)
    entries = [{'path': n, 'bytes': p.stat().st_size, 'sha256': digest(p)} for n, p in files.items() if n != MANIFEST]
    write_json(ROOT / MANIFEST, {'schemaVersion': 1, 'files': entries})
    args.output.mkdir(parents=True, exist_ok=True)
    reused = write_source_zip(source, partial, files, entries)
    require(digest(args.apk) == args.expected_sha256.lower(), 'Candidate APK changed during packaging')
    shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == args.expected_sha256.lower(), 'Delivered APK differs from compiled candidate')
    partial.rename(source_out)
    source_sha = digest(source_out)
    checksums.write_text(f'{args.expected_sha256.lower()}  {apk_out.name}\n{source_sha}  {source_out.name}\n', encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed': True, 'emulatorUsed': False, 'gameplayVerified': False,
        'adRequestsMade': False, 'phoneLiveAdsConfigured': True,
        'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size, 'candidateAPK_SHA256': args.expected_sha256.lower(),
        'source': str(source_out), 'sourceBytes': source_out.stat().st_size, 'sourceZIP_SHA256': source_sha,
        'sourceFiles': len(files), 'rawCopiedUnchangedZIPMembers': reused,
        'sourceWithin2GiB': source_out.stat().st_size < 2 * 1024 ** 3,
        'streamedEverySourceEntryCRCAndSHA': True, 'checksums': str(checksums)}, indent=2))


if __name__ == '__main__':
    main()
