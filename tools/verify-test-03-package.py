"""Check the scoped module/wording release against frozen Test 02; no gameplay claim."""
from pathlib import Path
from zipfile import ZipFile
import argparse
import json
import os
import re
import runpy
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent
old = runpy.run_path(str(ROOT/'tools/verify-test-02-package.py'), run_name='preservation_helpers')
digest, require, package_index = old['digest'], old['require'], old['package_index']
FROZEN = dict(old['STABLE'], **{
    'Warzone-Towers-Test-02.apk': '64324e568fd21ac449958d3f0d6e0f289e1ef9a06befd1d05de550fee272822f',
    'warzone-towers-test-02-source.zip': 'df8f76b11810c3978f4e96bd0c5dc2c27546c3a2793475bfb7685d6e7adb7dff',
})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--out', type=Path, default=ROOT/'qa/test-03/package-verification.json')
    args = parser.parse_args()
    for name, expected in FROZEN.items():
        require(digest(BASE/name) == expected, 'Frozen fallback changed: '+name)
    baseline = json.loads((ROOT/'qa/test-02/package-verification.json').read_text(encoding='utf-8'))
    require(baseline['candidateAPK_SHA256'] == FROZEN['Warzone-Towers-Test-02.apk'], 'Wrong Test 02 baseline')
    allowed = {'assets/'+n for n in ('warzone-command-pages.js', 'warzone-touch-controls.js',
                                    'warzone/ui/build-display.js', 'warzone/warzone2100.js', 'warzone/warzone2100.data')}
    with ZipFile(BASE/'Warzone-Towers-Test-02.apk') as before, ZipFile(args.apk) as apk, ZipFile(BASE/'warzone-towers-test-02-source.zip') as source:
        assets = {n for n in before.namelist() if n.startswith('assets/') and not n.endswith('/')}
        require(assets == {n for n in apk.namelist() if n.startswith('assets/') and not n.endswith('/')}, 'Asset list changed')
        changed_assets = {n for n in assets if before.read(n) != apk.read(n)}
        require(changed_assets <= allowed, 'Asset changes outside module scope: '+str(changed_assets-allowed))
        asset_root = ROOT/'app/src/main/assets'
        current = {'assets/'+p.relative_to(asset_root).as_posix(): p for p in asset_root.rglob('*') if p.is_file()}
        require(current.keys() == assets, 'Source/APK asset lists differ')
        for name, path in current.items():
            require(apk.read(name) == path.read_bytes(), 'Stale packaged asset: '+name)
        prefix = 'assets/warzone/'
        a, b = before.read(prefix+'warzone2100.data'), apk.read(prefix+'warzone2100.data')
        aj, bj = before.read(prefix+'warzone2100.js').decode(), apk.read(prefix+'warzone2100.js').decode()
        ai, bi = package_index(aj, a), package_index(bj, b)
        require(re.sub(old['INDEX'], 'INDEX', aj) == re.sub(old['INDEX'], 'INDEX', bj), 'Compiled engine JS changed')
        require(before.read(prefix+'warzone2100.wasm') == apk.read(prefix+'warzone2100.wasm'), 'WASM changed')
        require(b.startswith(a) and ai.keys() == bi.keys(), 'Frozen data prefix or virtual file list changed')
        changed_virtual = {n for n in ai if a[slice(*ai[n])] != b[slice(*bi[n])]}
        scenario = {'/data/mp/tests/'+p.name: p for p in (ROOT/'scenario').iterdir() if p.is_file() and '/data/mp/tests/'+p.name in bi}
        canonical = '/data/mp/multiplay/script/rules/'
        scenario[canonical+'init.js'] = ROOT/'scenario/warzone-towers-rules.js'
        for name in ('warzone-towers-command.json', 'warzone-towers-wave-command.json', 'warzone-towers-control-command.json', 'warzone-towers-catalog.json', 'blocknight-queue-command.json', 'blocknight-zoom-command.json'):
            scenario[canonical+name] = ROOT/'scenario'/name
        require(changed_virtual <= scenario.keys(), 'Original engine/map/mod virtual content changed')
        for name, path in scenario.items():
            require(b[slice(*bi[name])] == path.read_bytes(), 'Stale embedded scenario: '+name)
        resources = [n for n in before.namelist() if n.startswith('res/') and not n.endswith('/')]
        require(all(apk.read(n) == before.read(n) for n in resources), 'Original packaged resources/icon changed')
        preserved = 0
        for name in source.namelist():
            if not name.endswith('/') and name.startswith(('vendor/', 'app/src/main/res/')):
                require((ROOT/name).read_bytes() == source.read(name), 'Original source artwork/map/mod changed: '+name)
                preserved += 1
        allowed_source = {'app/src/main/'+n for n in allowed} | {
            'app/build.gradle.kts', 'app/src/main/AndroidManifest.xml',
            'app/src/main/java/com/rbabbit/blocknight/warzone/GraphicsSetupView.java',
            'app/src/main/java/com/rbabbit/blocknight/warzone/WarzoneSplashView.java',
        }
        changed_runtime = []
        for entry in baseline['sourceFiles']:
            name = entry['path']
            if (ROOT/name).read_bytes() != source.read(name):
                changed_runtime.append(name)
                require(name in allowed_source, 'Runtime change outside module/wording scope: '+name)
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home()/'AppData/Local/Android/Sdk')))
    badging = subprocess.check_output([str(sdk/'build-tools/36.1.0/aapt2.exe'), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    for token in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='3'", "versionName='0.3'", "application-label:'Warzone Towers'"):
        require(token in badging, 'Wrong APK identity: '+token)
    for name in ('GraphicsSetupView.java', 'WarzoneSplashView.java'):
        text = (ROOT/'app/src/main/java/com/rbabbit/blocknight/warzone'/name).read_text(encoding='utf-8')
        require('WARZONE TOWERS TEST' not in text and 'WARZONE TOWERS' in text, 'Old visible test wording remains: '+name)
    runtime = sorted(p for p in (ROOT/'app/src').rglob('*') if p.is_file())+[ROOT/'app/build.gradle.kts']
    require({p.relative_to(ROOT).as_posix() for p in runtime} == {e['path'] for e in baseline['sourceFiles']}, 'Runtime source inventory changed')
    records = lambda paths: [{'path': p.relative_to(ROOT).as_posix(), 'sha256': digest(p)} for p in paths]
    report = {'passed': True, 'verification': 'Package/source only; exact-APK emulator evidence is separately required',
              'candidateAPK_SHA256': digest(args.apk), 'package': 'com.rbabbit.warzonetowers.lab', 'label': 'Warzone Towers', 'version': '0.3',
              'baselineAPK_SHA256': FROZEN['Warzone-Towers-Test-02.apk'], 'compiledEngineAndWasmPreserved': True,
              'frozenTest02DataPrefixPreserved': True, 'originalResourcesMapsModAndIconPreserved': True,
              'preservedSourceFiles': preserved, 'modifiedOriginalAssets': sorted(changed_assets), 'modifiedVirtualFiles': sorted(changed_virtual),
              'changedRuntimeFiles': sorted(changed_runtime), 'sourceAssetsMatchAPK': len(current), 'runtimeSourceFileCount': len(runtime),
              'sourceFiles': records(runtime), 'scenarioSourceFiles': records(sorted(p for p in (ROOT/'scenario').rglob('*') if p.is_file()))}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in ('sourceFiles', 'scenarioSourceFiles')}, indent=2))


if __name__ == '__main__':
    main()
