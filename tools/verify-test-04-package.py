"""Verify the module UI release against frozen 0.3; package/source checks only."""
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
common = runpy.run_path(str(ROOT/'tools/package-test-04.py'), run_name='release_helpers')
digest, require, FROZEN, FALLBACK = (common[n] for n in ('digest', 'require', 'FROZEN', 'FALLBACK'))
engine = runpy.run_path(str(ROOT/'tools/verify-test-02-package.py'), run_name='engine_helpers')
package_index = engine['package_index']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--out', type=Path, default=ROOT/'qa/test-04/package-verification.json')
    args = parser.parse_args()
    for name, expected in FROZEN.items():
        require(digest(BASE/name) == expected, 'Frozen fallback changed: '+name)
    for name in ('Warzone-Towers-0.3.apk', 'warzone-towers-0.3-source.zip'):
        require(digest(FALLBACK/name) == FROZEN[name], 'Copied initial fallback changed: '+name)
    baseline = common['read'](ROOT/'qa/test-03/package-verification.json')
    require(baseline['candidateAPK_SHA256'] == FROZEN['Warzone-Towers-0.3.apk'], 'Wrong 0.3 baseline')
    allowed = {'assets/'+n for n in ('warzone-command-pages.js', 'warzone-touch-controls.js', 'warzone/ui/build-display.js',
                                    'warzone/ui/lab-commands.css', 'warzone/warzone2100.js', 'warzone/warzone2100.data')}
    with ZipFile(BASE/'Warzone-Towers-0.3.apk') as before, ZipFile(args.apk) as apk, ZipFile(BASE/'warzone-towers-0.3-source.zip') as source:
        require(apk.testzip() is None, 'APK CRC check failed')
        assets = {n for n in before.namelist() if n.startswith('assets/') and not n.endswith('/')}
        require(assets == {n for n in apk.namelist() if n.startswith('assets/') and not n.endswith('/')}, 'Asset list changed')
        changed_assets = {n for n in assets if before.read(n) != apk.read(n)}
        require(changed_assets <= allowed, 'Asset change outside module UI scope: '+str(changed_assets-allowed))
        asset_root = ROOT/'app/src/main/assets'
        current = {'assets/'+p.relative_to(asset_root).as_posix(): p for p in asset_root.rglob('*') if p.is_file()}
        require(current.keys() == assets and len(current) == baseline['sourceAssetsMatchAPK'] == 463, 'Source/APK asset inventory changed')
        for name, path in current.items():
            require(apk.read(name) == path.read_bytes(), 'Stale packaged asset: '+name)
        prefix = 'assets/warzone/'
        a, b = before.read(prefix+'warzone2100.data'), apk.read(prefix+'warzone2100.data')
        aj, bj = before.read(prefix+'warzone2100.js').decode(), apk.read(prefix+'warzone2100.js').decode()
        ai, bi = package_index(aj, a), package_index(bj, b)
        require(re.sub(engine['INDEX'], 'INDEX', aj) == re.sub(engine['INDEX'], 'INDEX', bj), 'Compiled engine JS changed outside package metadata')
        require(before.read(prefix+'warzone2100.wasm') == apk.read(prefix+'warzone2100.wasm'), 'WASM changed')
        require(b.startswith(a) and ai.keys() == bi.keys(), 'Frozen 0.3 data prefix or virtual file inventory changed')
        changed_virtual = {n for n in ai if a[slice(*ai[n])] != b[slice(*bi[n])]}
        module_virtual = '/data/mp/tests/warzone-towers-commands.js'
        require(changed_virtual == {module_virtual}, 'Only the audited module command scenario may change: '+str(changed_virtual))
        require(b[slice(*bi[module_virtual])] == (ROOT/'scenario/warzone-towers-commands.js').read_bytes(), 'Stale embedded module command scenario')
        scenario = {'/data/mp/tests/'+p.name: p for p in (ROOT/'scenario').iterdir() if p.is_file() and '/data/mp/tests/'+p.name in bi}
        canonical = '/data/mp/multiplay/script/rules/'
        scenario[canonical+'init.js'] = ROOT/'scenario/warzone-towers-rules.js'
        for name in ('warzone-towers-command.json', 'warzone-towers-wave-command.json', 'warzone-towers-control-command.json', 'warzone-towers-catalog.json', 'blocknight-queue-command.json', 'blocknight-zoom-command.json'):
            scenario[canonical+name] = ROOT/'scenario'/name
        for name, path in scenario.items():
            require(b[slice(*bi[name])] == path.read_bytes(), 'Stale embedded scenario: '+name)
        resources = {n for n in before.namelist() if n.startswith('res/') and not n.endswith('/')}
        require(resources == {n for n in apk.namelist() if n.startswith('res/') and not n.endswith('/')}, 'Resource inventory changed')
        require(all(apk.read(n) == before.read(n) for n in resources), 'Original packaged resources/icon changed')
        preserved = 0
        for name in source.namelist():
            if not name.endswith('/') and name.startswith(('vendor/', 'app/src/main/res/')):
                require((ROOT/name).read_bytes() == source.read(name), 'Original artwork/map/mod changed: '+name)
                preserved += 1
        allowed_source = {'app/src/main/'+n for n in allowed} | {'app/build.gradle.kts'}
        changed_runtime = []
        for entry in baseline['sourceFiles']:
            name = entry['path']
            if (ROOT/name).read_bytes() != source.read(name):
                changed_runtime.append(name)
                require(name in allowed_source, 'Runtime change outside module UI scope: '+name)
        scenario_files = sorted(p for p in (ROOT/'scenario').rglob('*') if p.is_file())
        require({p.relative_to(ROOT).as_posix() for p in scenario_files} == {e['path'] for e in baseline['scenarioSourceFiles']}, 'Scenario source inventory changed')
        changed_scenario = [p.relative_to(ROOT).as_posix() for p in scenario_files if p.read_bytes() != source.read(p.relative_to(ROOT).as_posix())]
        require(changed_scenario == ['scenario/warzone-towers-commands.js'], 'Scenario changes outside audited module commands')
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home()/'AppData/Local/Android/Sdk')))
    badging = subprocess.check_output([str(sdk/'build-tools/36.1.0/aapt2.exe'), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    for token in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='4'", "versionName='0.4'", "application-label:'Warzone Towers'"):
        require(token in badging, 'Wrong APK identity: '+token)
    runtime = sorted(p for p in (ROOT/'app/src').rglob('*') if p.is_file())+[ROOT/'app/build.gradle.kts']
    require(len(runtime) == baseline['runtimeSourceFileCount'] == 486 and {p.relative_to(ROOT).as_posix() for p in runtime} == {e['path'] for e in baseline['sourceFiles']}, 'Runtime source inventory changed')
    records = lambda paths: [{'path': p.relative_to(ROOT).as_posix(), 'sha256': digest(p)} for p in paths]
    report = {'passed': True, 'verification': 'Package/source only; exact-APK gameplay and visual evidence are separately required',
              'candidateAPK_SHA256': digest(args.apk), 'package': 'com.rbabbit.warzonetowers.lab', 'label': 'Warzone Towers', 'version': '0.4', 'versionCode': 4,
              'baselineAPK_SHA256': FROZEN['Warzone-Towers-0.3.apk'], 'compiledEngineAndWasmPreserved': True,
              'frozen03DataPrefixPreserved': True, 'originalResourcesMapsModAndIconPreserved': True,
              'preservedSourceFiles': preserved, 'modifiedOriginalAssets': sorted(changed_assets), 'modifiedVirtualFiles': sorted(changed_virtual),
              'changedRuntimeFiles': sorted(changed_runtime), 'changedScenarioFiles': changed_scenario,
              'sourceAssetsMatchAPK': len(current), 'runtimeSourceFileCount': len(runtime),
              'sourceFiles': records(runtime), 'scenarioSourceFiles': records(scenario_files)}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in ('sourceFiles', 'scenarioSourceFiles')}, indent=2))


if __name__ == '__main__':
    main()
