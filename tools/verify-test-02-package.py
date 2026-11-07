"""Verify the test-only gameplay release against the frozen v6.4 engine and assets.

This is a package/source check. It does not claim emulator or gameplay testing.
"""
from pathlib import Path
from zipfile import ZipFile
from hashlib import file_digest, sha256
import argparse
import json
import os
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent
INDEX = r'loadPackage\(\{files:\[.*?\],remote_package_size:.*?\}\)'
ENTRY = r'\{filename:"([^"]+)",start:(\d+),end:(\d+)\}'
STABLE = {
    'Warzone-Towers-v6.4-Build-Blueprints.apk': '12532300d9ce2010b911fae879a6e197eb059a98bd672901bd65307cd9f3532a',
    'warzone-towers-v6.4-build-blueprints-source.zip': '46346399ae4df757b2e9f7178fb427b2ae5c66c0352fb1c8e99d63da3302b610',
}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def package_index(script, data):
    matches = list(re.finditer(INDEX, script))
    require(len(matches) == 1, 'Expected one Emscripten package index')
    entries = re.findall(ENTRY, matches[0][0])
    require(len(entries) == len({name for name, _, _ in entries}), 'Duplicate virtual paths')
    result = {name: (int(start), int(end)) for name, start, end in entries}
    require(all(0 <= start <= end <= len(data) for start, end in result.values()), 'Invalid data offsets')
    size = int(re.search(r'remote_package_size:(\d+)', matches[0][0])[1])
    require(size == len(data), 'Package metadata has stale data length')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--out', type=Path, default=ROOT/'qa/test-02/package-verification.json')
    args = parser.parse_args()
    for name, expected in STABLE.items():
        require(digest(BASE/name) == expected, 'Stable fallback changed: '+name)
    assets_root = ROOT/'app/src/main/assets'
    added = {'assets/warzone/ui/'+name for name in ('lab-shell.css', 'lab-commands.css', 'lab-research.css', 'lab-ui.js')}
    allowed = {'assets/'+name for name in (
        'warzone-command-pages.js', 'warzone-html-session.js', 'warzone-mobile-research.js',
        'warzone-touch-controls.js', 'warzone-towers-wave-hud.js', 'warzone-terrain-picker.js',
        'warzone/mobile.html', 'warzone/index.html', 'warzone/ui/build-display.js',
        'warzone/warzone2100.js', 'warzone/warzone2100.data')}
    with ZipFile(BASE/'Warzone-Towers-v6.4-Build-Blueprints.apk') as old, ZipFile(args.apk) as apk, ZipFile(BASE/'warzone-towers-v6.4-build-blueprints-source.zip') as frozen:
        old_assets = {n for n in old.namelist() if n.startswith('assets/') and not n.endswith('/')}
        actual_assets = {n for n in apk.namelist() if n.startswith('assets/') and not n.endswith('/')}
        require(not old_assets-actual_assets, 'An original asset was removed')
        require(actual_assets-old_assets == added, 'Unexpected extra assets: '+str(actual_assets-old_assets))
        modified = {n for n in old_assets if old.read(n) != apk.read(n)}
        require(modified <= allowed, 'Changes outside test release scope: '+str(modified-allowed))
        source_assets = {'assets/'+p.relative_to(assets_root).as_posix(): p for p in assets_root.rglob('*') if p.is_file()}
        require(source_assets.keys() == actual_assets, 'Source/APK asset lists differ')
        for name, path in source_assets.items():
            require(apk.read(name) == path.read_bytes(), 'Source/APK mismatch: '+name)
        prefix = 'assets/warzone/'
        old_data, data = old.read(prefix+'warzone2100.data'), apk.read(prefix+'warzone2100.data')
        old_js, js = old.read(prefix+'warzone2100.js').decode(), apk.read(prefix+'warzone2100.js').decode()
        before, after = package_index(old_js, old_data), package_index(js, data)
        require(re.sub(INDEX, 'PACKAGE_INDEX', old_js) == re.sub(INDEX, 'PACKAGE_INDEX', js), 'Compiled engine JavaScript changed')
        require(apk.read(prefix+'warzone2100.wasm') == old.read(prefix+'warzone2100.wasm'), 'Compiled engine WASM changed')
        require(data.startswith(old_data), 'Frozen v6.4 data prefix changed')
        require(before.keys() == after.keys(), 'Resolved engine/map/mod file list changed')
        changed_virtual = {n for n in before if old_data[slice(*before[n])] != data[slice(*after[n])]}
        # Scenario adapters are editable; all other resolved engine/map/mod content is frozen.
        scenario = {}
        for path in (ROOT/'scenario').iterdir():
            if path.is_file() and '/data/mp/tests/'+path.name in after:
                scenario['/data/mp/tests/'+path.name] = path
        canonical = '/data/mp/multiplay/script/rules/'
        scenario[canonical+'init.js'] = ROOT/'scenario/warzone-towers-rules.js'
        for name in ('warzone-towers-command.json', 'warzone-towers-wave-command.json', 'warzone-towers-control-command.json', 'warzone-towers-catalog.json', 'blocknight-queue-command.json', 'blocknight-zoom-command.json'):
            scenario[canonical+name] = ROOT/'scenario'/name
        require(changed_virtual <= scenario.keys(), 'Original engine/map/mod content changed: '+str(changed_virtual-scenario.keys()))
        for virtual, source in scenario.items():
            require(data[slice(*after[virtual])] == source.read_bytes(), 'Stale embedded scenario: '+virtual)
        camera_bridge = '/data/mp/tests/warzone-towers-bridge.js'
        require(camera_bridge in changed_virtual, 'The Dustfall starting-camera adapter was not embedded')
        for virtual, source in scenario.items():
            if source.suffix == '.json':
                json.loads(data[slice(*after[virtual])])
        preserved = 0
        for name in frozen.namelist():
            if name.endswith('/'):
                continue
            official = name.startswith(('vendor/survival/', 'vendor/tower-defense/', 'vendor/maps/'))
            artwork = name.startswith('app/src/main/res/') and name.lower().endswith(('.png', '.webp', '.jpg', '.ttf'))
            icon = name in {'app/src/main/res/drawable/ic_launcher_foreground.xml', 'app/src/main/res/values/colors.xml'} or name.startswith(('app/src/main/res/mipmap-anydpi/', 'app/src/main/res/mipmap-anydpi-v26/'))
            if official or artwork or icon:
                require((ROOT/name).read_bytes() == frozen.read(name), 'Original source artwork/icon/map/mod changed: '+name)
                preserved += 1
        icon_names = [n for n in old.namelist() if n.startswith('res/') and ('ic_launcher' in n or 'warzone_branding' in n)]
        require(icon_names, 'Original APK icon resources missing')
        for name in icon_names:
            require(apk.read(name) == old.read(name), 'Packaged original icon changed: '+name)
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home()/'AppData/Local/Android/Sdk')))
    aapt = sdk/'build-tools/36.1.0/aapt2.exe'
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='2'", "versionName='0.2-test'", "application-label:'Warzone Towers Test'"):
        require(value in badging, 'Wrong APK identity: '+value)
    runtime_paths = sorted(p for p in (ROOT/'app/src').rglob('*') if p.is_file())+[ROOT/'app/build.gradle.kts']
    require(len(runtime_paths) >= 486, 'Runtime source inventory is incomplete')
    records = lambda paths: [{'path': p.relative_to(ROOT).as_posix(), 'sha256': digest(p)} for p in paths]
    report = {
        'passed': True, 'verification': 'Package and source only; emulator gameplay is separately required',
        'candidateAPK_SHA256': digest(args.apk), 'package': 'com.rbabbit.warzonetowers.lab', 'version': '0.2-test',
        'baselineAPK_SHA256': STABLE['Warzone-Towers-v6.4-Build-Blueprints.apk'],
        'compiledEngineJavaScriptUnchangedExceptPackageIndex': True, 'compiledEngineWasmIdentical': True,
        'frozenV64DataPrefixPreserved': True, 'originalArtworkIconsMapsAndModPreserved': True,
        'preservedSourceFiles': preserved, 'packagedOriginalIconFiles': len(icon_names),
        'unchangedResolvedVirtualFiles': len(before)-len(changed_virtual),
        'modifiedVirtualFiles': sorted(changed_virtual), 'embeddedScenarioMatchesSource': sorted(scenario),
        'modifiedOriginalAssets': sorted(modified), 'addedAssets': sorted(added),
        'sourceAssetsMatchAPK': len(source_assets), 'runtimeSourceFileCount': len(runtime_paths),
        'sourceFiles': records(runtime_paths),
        'scenarioSourceFiles': records(sorted(p for p in (ROOT/'scenario').rglob('*') if p.is_file())),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in ('sourceFiles', 'scenarioSourceFiles', 'embeddedScenarioMatchesSource')}, indent=2))


if __name__ == '__main__':
    main()
