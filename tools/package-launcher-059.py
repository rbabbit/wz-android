"""Package v0.59's authentic launcher icon only; no emulator or runtime checks.

The supplied APK is verified and copied without rebuilding. Earlier complete
source entries are retained; unchanged members reuse their compressed bytes.
"""
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
import argparse
import io
import json
import re
import runpy
import shutil
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PREVIOUS = runpy.run_path(str(ROOT / 'tools/package-completion-058.py'), run_name='launcher059_helpers')
H, C = PREVIOUS['H'], PREVIOUS['C']
digest, zip_digest, require = (C[key] for key in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
FALLBACK = 'archive/fallback-0.59.json'
RECORD = 'archive/release-0.59-icon-only.json'
TOOL = 'tools/package-launcher-059.py'
GRADLE = 'app/build.gradle.kts'
ASSETS = 'app/src/main/assets/'
RES = 'app/src/main/res/'
ICON = RES + 'drawable-nodpi/warzone_launcher_icon.png'
ORIGINAL_ICON = ASSETS + 'warzone/assets/android-chrome-192x192.png'
APP_CHANGES = {GRADLE, RES + 'drawable/ic_launcher_foreground.xml',
    RES + 'mipmap-anydpi/ic_launcher.xml', RES + 'mipmap-anydpi/ic_launcher_round.xml'}
DOCUMENTATION = {'AGENTS.md', 'README.md', 'docs/releases/0.59-icon.md'}
SUPPORT = DOCUMENTATION | {TOOL, FALLBACK, RECORD}
BUILD_CONFIG = H['BUILD_CONFIG']
BASELINE_APK_SHA = '0bc1d0dcf86d5f4c046edd617e2c08bdf1274c9f8377ded1c63e0f7dfe671d89'
BASELINE_SOURCE_SHA = 'fc0bcde30e48e5d36a7ac8bbbd740e44bccb010540be45a1384e6dfd00e98c98'
ICON_SHA = 'e4ab588956e98cc2dbe02e29826dd82965eaae4ef401f85ef477f57a02630ccd'
APP_ID = 'ca-app-pub-3430279660625393~3119801475'
LIVE_UNIT = 'ca-app-pub-3430279660625393/5338770704'
SAMPLE_UNIT = 'ca-app-pub-3940256099942544/5224354917'


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    require(saved.get('version') == '0.59' and saved.get('baseline') == '0.58', 'Wrong fallback record')
    for row in saved['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'],
            'Immutable v0.58 fallback changed: ' + str(path))
    apk = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.apk'))
    source = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.zip'))
    require(digest(apk) == BASELINE_APK_SHA and digest(source) == BASELINE_SOURCE_SHA, 'Wrong v0.58 baseline bytes')
    return apk, source


def source_inventory(required):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    names = set(filter(None, raw.decode().split('\0'))) | required | {ICON, TOOL, FALLBACK, RECORD, MANIFEST}
    files = {}
    for name in sorted(names):
        rel = Path(name)
        if name.startswith('qa/') and name not in required:
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


def validate_source(source, files):
    with ZipFile(source) as old:
        names = set(old.namelist())
        require(len(names) == len(old.namelist()), 'Duplicate baseline source entry')
        prior = {row['path']: row for row in json.loads(old.read(MANIFEST))['files']}
        require(set(prior) == names - {MANIFEST}, 'Baseline complete-source manifest incomplete')
        gradle = old.read(GRADLE)
        require(gradle.count(b'versionCode = 58') == gradle.count(b'versionName = "0.58"') == 1,
            'Baseline Gradle version is ambiguous')
        expected = gradle.replace(b'versionCode = 58', b'versionCode = 59').replace(b'versionName = "0.58"', b'versionName = "0.59"')
        require(files[GRADLE].read_bytes() == expected, 'Gradle changed beyond exact version58-to59 update')
        changed = []
        for name, row in prior.items():
            actual = digest(files[name])
            if actual != row['sha256']:
                require(name in APP_CHANGES | SUPPORT, 'Source changed beyond launcher-only scope: ' + name)
                changed.append(dict(path=name, beforeSHA256=row['sha256'], sha256=actual))
        additions = set(files) - names
        require(additions <= SUPPORT | {ICON}, 'Unexpected new source files: ' + str(sorted(additions - SUPPORT - {ICON})))
        require({name for name in additions if name.startswith('app/')} == {ICON}, 'Expected exactly one new launcher drawable')
        require(digest(files[ICON]) == digest(files[ORIGINAL_ICON]) == zip_digest(old, ORIGINAL_ICON) == ICON_SHA,
            'Launcher artwork must byte-match the authentic bundled WZ2100 icon')
        for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
            legacy = ET.fromstring(files[RES + 'mipmap-anydpi/' + name].read_bytes())
            require(legacy.tag == 'bitmap' and legacy.get('{http://schemas.android.com/apk/res/android}src')
                == '@drawable/warzone_launcher_icon', 'Legacy launcher source must use the authentic icon: ' + name)
    return dict(changedBaselineSources=changed, addedSources=sorted(additions), baselineSourceEntries=len(names),
        everyBaselineSourceEntryRetained=True, allOtherAppSourcesFrozen=True, allJavaAssetsScenariosCampaignFrozen=True,
        authenticIcon=dict(path=ICON, original=ORIGINAL_ICON, sha256=ICON_SHA))


def validate_apk(apk, baseline, expected):
    require(apk.is_file() and digest(apk) == expected, 'Candidate APK changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='59'",
        "versionName='0.59'", "application-label:'Warzone Towers'")), 'APK identity/version mismatch')
    manifest = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(apk), '--file', 'AndroidManifest.xml'], text=True, encoding='utf-8')
    require(APP_ID in manifest, 'Publisher consent application ID changed')
    table = subprocess.check_output([str(aapt), 'dump', 'resources', str(apk)], text=True, encoding='utf-8')
    resources = {name: (resource_id, body) for resource_id, name, body in re.findall(
        r'^\s*resource (0x[0-9a-fA-F]+) (\S+)[^\n]*\n(.*?)(?=^\s*resource |\Z)', table, re.M | re.S)}
    routes = {}
    for name in ('mipmap/ic_launcher', 'mipmap/ic_launcher_round', 'drawable/ic_launcher_foreground', 'drawable/warzone_launcher_icon'):
        require(name in resources, 'Compiled launcher resource missing: ' + name)
        paths = re.findall(r'\(file\)\s+(res/[^\s]+)', resources[name][1])
        require(len(paths) == 1, 'Expected one compiled launcher resource path: ' + name)
        routes[name] = paths[0]
    for name in ('mipmap/ic_launcher', 'mipmap/ic_launcher_round'):
        compiled = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(apk), '--file', routes[name]], text=True, encoding='utf-8')
        foreground = re.search(r'E: foreground\b.*?(?=\n\s*E:|\Z)', compiled, re.S)
        require('E: adaptive-icon' in compiled and foreground and re.search(
            r':drawable\b[^\n]*=@' + re.escape(resources['drawable/ic_launcher_foreground'][0]) + r'\b', foreground[0]),
            'Compiled adaptive launcher must route to the shared foreground: ' + name)
        attribute = 'roundIcon' if name.endswith('_round') else 'icon'
        require(re.search(r':' + attribute + r'\b[^\n]*=@' + re.escape(resources[name][0]) + r'\b', manifest),
            'Compiled manifest launcher route missing: ' + name)
    compiled = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(apk), '--file', routes['drawable/ic_launcher_foreground']], text=True, encoding='utf-8')
    require('E: inset' in compiled and 'E: bitmap' in compiled and re.search(
        r':src\b[^\n]*=@' + re.escape(resources['drawable/warzone_launcher_icon'][0]) + r'\b', compiled),
        'Compiled foreground must route to the authentic launcher PNG')
    inset = re.search(r':inset\b[^\n]*=([^\n]+)', compiled)
    require(inset, 'Compiled adaptive foreground inset missing')
    fraction = re.search(r'(?<![\w.])(\d+(?:\.\d+)?)\s*(%)?(?:\s|\Z)', inset[1])
    if fraction:
        # AAPT2 prints the stored fraction as "0.240000%" for source 24%.
        inset_value = float(fraction[1])
        if fraction[2] and inset_value > 1:
            inset_value /= 100
    else:
        encoded = re.findall(r'0x([0-9a-fA-F]{8})', inset[1])
        require(encoded, 'Unrecognized compiled adaptive inset: ' + inset[1])
        value = int(encoded[-1], 16)
        inset_value = (value & 0xffffff00) / (1 << (8, 15, 23, 31)[(value >> 4) & 3])
    require(abs(inset_value - 0.24) < 0.000001, 'Compiled adaptive inset must be 24%')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    config = (ROOT / BUILD_CONFIG).read_text(encoding='utf-8')
    require(re.search(r'\bVERSION_CODE\s*=\s*59\s*;', config)
        and re.search(r'\bVERSION_NAME\s*=\s*"0\.59"\s*;', config)
        and re.search(r'\bADMOB_TEST_ADS\s*=\s*false\s*;', config)
        and re.search(r'\bADMOB_REWARDED_AD_UNIT_ID\s*=\s*"' + re.escape(LIVE_UNIT) + r'"\s*;', config),
        'Final generated BuildConfig must retain live phone rewarded ads')
    with ZipFile(apk) as current, ZipFile(baseline) as old:
        names, prior = set(current.namelist()), set(old.namelist())
        require(len(names) == len(current.namelist()) and current.testzip() is None, 'Corrupt or duplicate APK archive')
        require(prior <= names, 'A prior APK member was removed')
        require({name for name in names if name.startswith(('assets/', 'lib/'))}
            == {name for name in prior if name.startswith(('assets/', 'lib/'))}, 'APK assets/native inventory changed')
        changed = []
        for name in sorted(names):
            if name in prior and zip_digest(current, name) == zip_digest(old, name):
                continue
            # Existing compiled XML may receive new generated resource IDs.
            require(C['metadata'](name) or name.startswith('res/') and name.endswith('.xml')
                or re.fullmatch(r'res/drawable-nodpi(?:-v\d+)?/warzone_launcher_icon\.png', name),
                'Unexpected APK member change: ' + name)
            changed.append(name)
        for path in (ROOT / ASSETS).rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / ASSETS).as_posix()
                require(name in names and zip_digest(current, name) == digest(path) == zip_digest(old, name),
                    'Frozen APK/source asset mismatch: ' + name)
        icons = [name for name in names if re.fullmatch(r'res/drawable-nodpi(?:-v\d+)?/warzone_launcher_icon\.png', name)]
        require(len(icons) == 1, 'APK must contain exactly one launcher PNG')
        require(routes['drawable/warzone_launcher_icon'] == icons[0], 'Compiled icon resource table must resolve to the verified PNG')
        # AAPT may losslessly recompress PNGs; source bytes are pinned above.
        from PIL import Image
        with Image.open(io.BytesIO(current.read(icons[0]))) as packed, Image.open(ROOT / ICON) as original:
            require(packed.size == original.size and packed.convert('RGBA').tobytes() == original.convert('RGBA').tobytes(),
                'APK launcher pixels differ from authentic PNG')
        packed_icon_sha = zip_digest(current, icons[0])
        music = 'assets/warzone/music/music.data'
        require(current.getinfo(music).compress_type == ZIP_STORED, 'Bundled soundtrack was compressed')
        dex = [current.read(name) for name in names if re.fullmatch(r'classes(?:\d+)?\.dex', name)]
        require(any(LIVE_UNIT.encode() in value for value in dex) and any(SAMPLE_UNIT.encode() in value for value in dex),
            'Compiled phone reward unit/emulator sample fallback missing')
    return dict(certificateSHA256=signing, changedAPKMembers=changed, everyBaselineAPKMemberRetained=True,
        allAPKAssetsMatchSource=True, allAPKAssetsAndNativeLibrariesFrozenToBaseline=True,
        nativeCampaignTowersAndDuelRuntimeFrozen=True, phoneLiveAdsConfigured=True,
        emulatorSampleFallbackRetained=True, packagedLauncherPixelsMatchSource=True,
        compiledAdaptiveLauncherRoutes=routes, compiledAdaptiveInsetPercent=24,
        packagedLauncherPNG_SHA256=packed_icon_sha, generatedBuildConfigSHA256=digest(ROOT / BUILD_CONFIG))


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
    apk_out, source_out, checksum = (args.output / name for name in ('Warzone-Towers-0.59.apk',
        'warzone-towers-0.59-source.zip', 'Warzone-Towers-0.59-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(path.exists() for path in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    baseline, source = baseline_paths()
    with ZipFile(source) as old:
        required = set(old.namelist())
    files = source_inventory(required)
    preservation = validate_source(source, files)
    apk_record = validate_apk(args.apk, baseline, expected)
    require(digest(args.apk) == expected, 'Candidate APK changed during validation')
    if args.validate_only:
        print(json.dumps(dict(packageValidationPassed=True, deliveryWritten=False, sourceFiles=len(files),
            emulatorUsed=False, browserFixturesUsed=False, gameplayVerified=False, **preservation, **apk_record), indent=2))
        return
    record = dict(version='0.59', versionCode=59, candidateAPK_SHA256=expected,
        scope='Restore the authentic bundled WZ2100 shield as Android launcher/adaptive icon; exact version bump only beyond launcher resources.',
        verification='Build/package integrity only; no emulator, browser, screen, launcher-runtime or gameplay verification.',
        emulatorUsed=False, browserFixturesUsed=False, androidRuntimeExecuted=False,
        actualNativeEngineExecuted=False, gameplayVerified=False, launcherRuntimeVerified=False,
        nativeBuildPerformed=False, liveAdsTested=False, githubPublished=False, vpsChanged=False,
        fallback=dict(path=FALLBACK, sha256=digest(ROOT / FALLBACK)), sourcePreservation=preservation,
        **apk_record, recordedUTC=datetime.now(timezone.utc).isoformat())
    (ROOT / RECORD).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    entries = [dict(path=name, bytes=path.stat().st_size, sha256=digest(path)) for name, path in files.items() if name != MANIFEST]
    (ROOT / MANIFEST).write_text(json.dumps(dict(schemaVersion=1, files=entries), indent=2) + '\n', encoding='utf-8')
    args.output.mkdir(parents=True, exist_ok=True)
    reused = H['write_source_zip'](source, partial, files, entries)
    require(digest(args.apk) == expected, 'Candidate APK changed while complete source was packaged')
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
    require(digest(apk_out) == expected and digest(source_out) == source_sha, 'Delivery changed before final checksum verification')
    print(json.dumps(dict(packageIntegrityPassed=True, apk=str(apk_out), apkSHA256=apk_sha,
        source=str(source_out), sourceSHA256=source_sha, checksums=str(checksum), sourceFiles=len(files),
        rawCopiedUnchangedZIPMembers=reused, everySourceMemberCRCAndSHAStreamed=True,
        emulatorUsed=False, browserFixturesUsed=False, gameplayVerified=False), indent=2))


if __name__ == '__main__':
    main()
