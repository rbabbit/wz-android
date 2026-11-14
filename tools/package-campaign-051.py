"""Package the exact emulator-checked campaign APK and complete reproducible source."""
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
from datetime import datetime, timezone
import argparse
import json
import re
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
H = runpy.run_path(str(ROOT / 'tools/package-50-touch-camera.py'), run_name='campaign051_helpers')
C = H['COMMON']
digest, zip_digest, require = (C[k] for k in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
RECORD = 'archive/release-0.51-campaign.json'
A = 'app/src/main/assets/'
J = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
APP_CHANGES = {A + n for n in ('warzone-html-session.js', 'warzone-touch-controls.js',
    'warzone-command-pages.js', 'warzone-mobile-research.js', 'warzone-intelligence.js',
    'warzone/saved-games.js', 'warzone/warzone2100.wasm', 'warzone/warzone2100.js')}
APP_CHANGES |= {J + n for n in ('BattleLaunchSpec.java', 'GraphicsSetupView.java',
    'MainActivity.java', 'SaveGameStore.java', 'SavedGamesView.java')}


def repository_path(value):
    """Proofs were produced on both Windows and Linux; accept only this repository."""
    path = Path(str(value).replace('\\', '/'))
    path = (path if path.is_absolute() else ROOT / path).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), 'Missing/outside proof path: ' + str(value))
    return path


def validate_native_payload():
    """Bind the delivered runtime to every preserved Campaign compilation stage."""
    folder = ROOT / 'archive/native-campaign-0.51'
    payload_path = folder / 'native-payload.json'
    payload = json.loads(payload_path.read_text())
    require(payload.get('version') == '0.51' and all(payload.get(key) is True for key in (
        'passed', 'sourceBuiltPairedRuntime', 'frozenTowersDataUnchanged',
        'generatedCodeUnchangedOutsideIndexAndExistingWorkerHook')), 'Campaign runtime integration proof failed')
    stages = (
        ('', 'build-native-campaign-051.py', {
            'lib/sdl/main_sdl.cpp': ('original-main_sdl.cpp', 'main_sdl.cpp'),
            'src/hci.cpp': ('original-hci.cpp', 'hci.cpp'),
            'src/quickjs_backend.cpp': ('original-quickjs_backend.cpp', 'quickjs_backend.cpp'),
            'src/main.cpp': ('original-main.cpp', 'main.cpp')}),
        ('radar-', 'build-native-campaign-radar-051.py', {
            'radar.cpp': ('radar-original-radar.cpp', 'radar-radar.cpp'),
            'hci.cpp': ('radar-original-hci.cpp', 'radar-hci.cpp')}),
        ('intel-', 'build-native-campaign-intel-051.py', {
            'hci.cpp': ('intel-original-hci.cpp', 'intel-hci.cpp')}),
        ('selection-', 'build-native-campaign-selection-051.py', {
            'quickjs_backend.cpp': ('selection-original-quickjs_backend.cpp', 'selection-quickjs_backend.cpp')}),
    )
    previous_path = ROOT / 'archive/native-touch-0.50/native-build.json'
    source_state, proof_inputs = {}, [previous_path]
    latest_build, latest_path = None, None
    for prefix, recipe, snapshots in stages:
        build_path = folder / (prefix + 'native-build.json')
        overlay_path = folder / (prefix + 'source-overlay.json')
        log_path = folder / (prefix + 'native-build.log')
        build = json.loads(build_path.read_text())
        overlay = json.loads(overlay_path.read_text())
        require(build.get('version') == '0.51' and build.get('passed') is True
            and overlay.get('version') == '0.51' and overlay.get('guardPassed') is True,
            'Campaign build/source guard failed: ' + prefix)
        require(build.get('sourceOverlaySHA256') == digest(overlay_path)
            and build.get('logSHA256') == digest(log_path), 'Campaign build provenance changed: ' + prefix)
        require(overlay.get('recipeSHA256') == digest(ROOT / 'tools' / recipe),
            'Campaign build recipe changed: ' + recipe)
        if not prefix:
            require(repository_path(overlay['previousProof']) == previous_path.resolve()
                and overlay.get('previousSHA256') == digest(previous_path), 'Campaign base lineage changed')
        else:
            require(overlay.get('previousNativeBuildSHA256', overlay.get('previousBuildSHA256'))
                == digest(previous_path), 'Campaign build chain changed: ' + prefix)
        for native_name, (before_name, after_name) in snapshots.items():
            row = overlay['sources'][native_name] if 'sources' in overlay else {
                'before': overlay['sourceBeforeSHA256'], 'after': overlay['sourceAfterSHA256']}
            before, after = folder / before_name, folder / after_name
            require(digest(before) == row['before'] and digest(after) == row['after'],
                'Campaign source snapshot changed: ' + after_name)
            key = Path(native_name).name
            require(key not in source_state or source_state[key] == row['before'],
                'Campaign source stage lost its predecessor: ' + native_name)
            source_state[key] = row['after']
            proof_inputs.extend((before, after))
        require(build.get('executableLinks') == 1 and build.get('compiledObjects')
            and set(build['changedObjects']) <= set(build['compiledObjects']),
            'Campaign native compilation scope invalid: ' + prefix)
        proof_inputs.extend((build_path, overlay_path, log_path, ROOT / 'tools' / recipe))
        previous_path, latest_build, latest_path = build_path, build, build_path
    require(repository_path(payload['nativeBuildProof']) == latest_path.resolve()
        and payload.get('nativeBuildSHA256') == digest(latest_path), 'Latest Campaign build not bound to runtime')
    outputs = payload.get('outputs', {})
    require(set(outputs) == {'warzone2100.js', 'warzone2100.wasm', 'warzone2100.data'},
        'Campaign native output inventory changed')
    assets = ROOT / 'app/src/main/assets/warzone'
    for name, expected in outputs.items():
        require(digest(assets / name) == expected, 'Native integration/asset mismatch: ' + name)
    runtime = payload.get('runtimeIntegration', {})
    require(runtime.get('passed') is True
        and runtime.get('generatedCodeUnchangedOutsideIndexAndExistingWorkerHook') is True
        and runtime.get('frozenDataSHA256') == outputs['warzone2100.data'],
        'Campaign native integration/frozen-data proof failed')
    raw = {row['file']: row for row in latest_build.get('raw', [])}
    require(set(raw) == {'warzone2100.js', 'warzone2100.wasm'}
        and raw['warzone2100.wasm']['sha256'] == outputs['warzone2100.wasm'],
        'Latest source-built WASM differs from delivery')
    for name, key in (('warzone2100.js', 'jsSHA256'), ('warzone2100.wasm', 'wasmSHA256')):
        require(runtime.get('raw', {}).get(key) == raw[name]['sha256'], 'Native raw-runtime lineage differs: ' + name)
    integrated = {row['file']: row for row in runtime.get('integrated', [])}
    require(set(integrated) == set(outputs), 'Native integrated-runtime inventory differs')
    for name, expected in outputs.items():
        require(integrated[name]['sha256'] == expected and integrated[name]['bytes'] == (assets / name).stat().st_size,
            'Native integrated-runtime metadata differs: ' + name)
    proof_inputs.extend((payload_path, ROOT / 'tools/integrate-native-campaign-051.py', previous_path))
    return dict(latestBuild=latest_path.relative_to(ROOT).as_posix(), outputs=outputs,
        proofs=[dict(path=p.relative_to(ROOT).as_posix(), sha256=digest(p)) for p in sorted(set(proof_inputs))])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    args = parser.parse_args()
    fallback = json.loads((ROOT / 'archive/fallback-0.51.json').read_text())
    for row in fallback['files']:
        p = Path(row['path'])
        require(p.stat().st_size == row['bytes'] and digest(p) == row['sha256'], 'Fallback changed: ' + str(p))
    baseline = next(Path(r['path']) for r in fallback['files'] if r['path'].endswith('.apk'))
    source = next(Path(r['path']) for r in fallback['files'] if r['path'].endswith('.zip'))
    require(digest(args.apk) == args.expected_sha256, 'Candidate APK changed')
    proof = json.loads((ROOT / 'archive/campaign-0.51-emulator-checks.json').read_text())
    require(proof['passed'] and proof['candidateAPK_SHA256'] == args.expected_sha256, 'Exact APK checks missing')
    for row in proof['sources']:
        require(digest(ROOT / row['path']) == row['sha256'], 'Source changed since checks: ' + row['path'])
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    require(all(v in badging for v in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='51'",
        "versionName='0.51'", "application-label:'Warzone Towers'")), 'APK identity mismatch')
    require(H['certificate'](args.apk, java, signer) == H['certificate'](baseline, java, signer), 'Signing identity changed')
    native = validate_native_payload()
    with ZipFile(args.apk) as z, ZipFile(baseline) as old:
        require(z.testzip() is None, 'Invalid APK archive')
        require(set(old.namelist()) <= set(z.namelist()), 'Original APK entries removed')
        for ext in ('data',):
            n = 'assets/warzone/warzone2100.' + ext
            require(zip_digest(z, n) == zip_digest(old, n), 'Towers loader/data changed')
        n = 'assets/warzone/music/music.data'
        require(z.getinfo(n).compress_type == ZIP_STORED and zip_digest(z,n) == zip_digest(old,n), 'Bundled music changed')
        for p in (ROOT / 'app/src/main/assets').rglob('*'):
            if p.is_file():
                n = 'assets/' + p.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(zip_digest(z, n) == digest(p), 'APK/source mismatch: ' + n)
    with ZipFile(source) as old:
        required = set(old.namelist())
        prior = {r['path']: r for r in json.loads(old.read(MANIFEST))['files']}
    raw = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT)
    names = set(filter(None, raw.decode().split('\0'))) | required | {MANIFEST, RECORD}
    names |= {p.relative_to(ROOT).as_posix() for p in (ROOT/'archive/native-campaign-0.51').rglob('*') if p.is_file()}
    files = {}
    for n in sorted(names):
        p = ROOT / n
        if n.startswith(('qa/campaign-051/', 'qa/touch-pan-050/')):
            require(n not in required, 'Unexpected baseline transient: ' + n)
            continue
        if any(v in C['SKIP'] for v in Path(n).parts) or n in C['TRANSIENT'] or p.suffix in {'.partial','.tmp'}:
            require(n not in required, 'Prior source would be omitted: ' + n)
            continue
        require(p.suffix.lower() not in C['PRIVATE_SUFFIXES'] and not p.name.startswith('.env')
            and n not in {'local.properties','tools/live-cdp-url.txt'}, 'Private source file: ' + n)
        require(not n.endswith(('.apk','-source.zip','-data.tar')), 'Runtime archive in source: ' + n)
        require(p.resolve().is_relative_to(ROOT) and (p.is_file() or n in {MANIFEST, RECORD}), 'Missing source: ' + n)
        files[n] = p
    require(required <= set(files), 'Complete prior source omitted')
    changed = []
    for n, row in prior.items():
        if digest(files[n]) != row['sha256']:
            require(not n.startswith('scenario/'), 'Towers scenario changed: ' + n)
            if n.startswith('app/src/main/'):
                require(n in APP_CHANGES, 'Unexpected shared app change: ' + n)
            changed.append(n)
    record = dict(version='0.51', candidateAPK_SHA256=args.expected_sha256,
        scope='Original campaign alongside Towers, optional verified videos, persistent ALL COMBAT and separate campaign saves.',
        emulatorUsed=True, exactAPKVerified=True, fullCampaignPlaythroughVerified=False,
        githubPublished=False, vpsChanged=False, rewardedAdControlsInvoked=False,
        changedBaselineSources=changed, baselineSourceEntries=len(required), verification=proof,
        nativeRuntimeProvenance=native,
        recordedUTC=datetime.now(timezone.utc).isoformat())
    (ROOT / RECORD).write_text(json.dumps(record,indent=2)+'\n')
    entries=[dict(path=n,bytes=p.stat().st_size,sha256=digest(p)) for n,p in files.items() if n != MANIFEST]
    (ROOT / MANIFEST).write_text(json.dumps(dict(files=entries),indent=2)+'\n')
    apk_out=ROOT.parent/'Warzone-Towers-0.51-Campaign.apk'
    source_out=ROOT.parent/'warzone-towers-0.51-source.zip'
    checksum=ROOT.parent/'Warzone-Towers-0.51-Campaign-SHA256.txt'
    partial=source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out,source_out,checksum,partial)), 'Output already exists')
    reused=H['write_source_zip'](source,partial,files,entries)
    require(digest(args.apk) == args.expected_sha256, 'Candidate APK changed during source packaging')
    shutil.copy2(args.apk,apk_out)
    require(digest(apk_out) == args.expected_sha256, 'Delivery APK differs from the exact tested APK')
    require(digest(args.apk) == args.expected_sha256, 'Candidate APK changed during delivery copy')
    partial.rename(source_out)
    checksum.write_text('\n'.join(digest(p)+'  '+p.name for p in (apk_out,source_out))+'\n')
    require(digest(args.apk) == args.expected_sha256 and digest(apk_out) == args.expected_sha256,
        'Exact tested APK changed before delivery completed')
    print(json.dumps(dict(apk=str(apk_out),source=str(source_out),entries=len(files),reused=reused,
        apkSHA256=digest(apk_out),sourceSHA256=digest(source_out))))

if __name__ == '__main__': main()
