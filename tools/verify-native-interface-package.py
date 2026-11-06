"""Check the native UI package against the frozen v5.12 Towers APK."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import argparse, json, re

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline', type=Path, default=root.parent/'Warzone-Towers-v5.12.apk')
parser.add_argument('--candidate', type=Path, default=root/'app/build/outputs/apk/debug/app-debug.apk')
parser.add_argument('--report', type=Path, default=root/'qa/native-ui/native-package.json')
args = parser.parse_args()
legacy = {'assets/'+name for name in (
    'warzone-command-pages.js', 'warzone-touch-controls.js',
    'warzone-mobile-research.js', 'warzone-towers-wave-hud.js',
    'warzone/ui/command-pages.css', 'warzone/ui/towers-v4.css')}
native = {'assets/'+name for name in (
    'warzone-native-bridge.js', 'warzone-command-core.js',
    'warzone-engine-input.js', 'warzone-research-core.js', 'warzone-wave-core.js')}
digest = lambda value: sha256(value).hexdigest()
with ZipFile(args.baseline) as old, ZipFile(args.candidate) as new:
    old_assets = {n for n in old.namelist() if n.startswith('assets/') and not n.endswith('/')}
    new_assets = {n for n in new.namelist() if n.startswith('assets/') and not n.endswith('/')}
    assert old_assets-new_assets == legacy, 'Unexpected removed assets'
    assert new_assets-old_assets == native, 'Unexpected added assets'
    assert not legacy & new_assets, 'Retired HTML UI is still packaged'
    changed = {n for n in old_assets & new_assets if old.read(n) != new.read(n)}
    assert changed == {'assets/warzone/mobile.html', 'assets/warzone/index.html',
                       'assets/warzone/warzone2100.js', 'assets/warzone/warzone2100.data'}, changed
    package_index = r'loadPackage\(\{files:\[.*?\],remote_package_size:.*?\}\)'
    old_engine = old.read('assets/warzone/warzone2100.js').decode()
    new_engine = new.read('assets/warzone/warzone2100.js').decode()
    assert re.sub(package_index, 'PACKAGE_INDEX', old_engine) == re.sub(package_index, 'PACKAGE_INDEX', new_engine)
    assert new.read('assets/warzone/warzone2100.data').startswith(old.read('assets/warzone/warzone2100.data'))
    assert old.read('assets/warzone/warzone2100.wasm') == new.read('assets/warzone/warzone2100.wasm')
    old_exit = "try { window.BlockNightAndroid.battleFinished(); } catch (_) {}"
    new_exit = "try { if (window.__warzoneTowersWaves) window.__warzoneTowersWaves.engineExited(); else window.BlockNightAndroid.battleFinished(window.__towersNativeSession || ''); } catch (_) {}"
    old_index = old.read('assets/warzone/index.html').decode()
    new_index = new.read('assets/warzone/index.html').decode()
    assert new_index.count(new_exit) == 1
    assert new_index.replace(new_exit, old_exit) == old_index, 'Engine HTML changed beyond the Android exit callback'
    original_resources = {n for n in old.namelist() if n.startswith('res/') and not n.endswith('/')}
    assert all(old.read(n) == new.read(n) for n in original_resources), 'Original artwork/resources changed'
    source_assets = {f'assets/{p.relative_to(root/"app/src/main/assets").as_posix()}':p
                     for p in (root/'app/src/main/assets').rglob('*') if p.is_file()}
    assert source_assets.keys() == new_assets, 'Stale/extra assets in the candidate'
    for name, source in source_assets.items():
        assert new.read(name) == source.read_bytes(), 'Stale packaged asset: '+name
    for name in native:
        assert not re.search(r'createElement|innerHTML', new.read(name).decode()), name+' renders HTML widgets'
    mobile = new.read('assets/warzone/mobile.html').decode()
    assert not re.search(r'<(?:button|header|nav|input|select|textarea)\b', mobile), 'HTML app controls remain'
    dex = b''.join(new.read(n) for n in new.namelist() if re.fullmatch(r'classes\d*\.dex',n))
    assert b'Lcom/rbabbit/blocknight/warzone/TowersNativeUi;' in dex, 'Native Android controller missing'
    assert b'Lcom/rbabbit/blocknight/warzone/TowersNativeUi$NativePicker;' in dex
    result = {'passed':True, 'candidateAPK_SHA256':digest(args.candidate.read_bytes()),
              'baselineAPK_SHA256':digest(args.baseline.read_bytes()),
              'retiredHTML_UIAbsent':True, 'nativeAndroidClassesPackaged':True,
              'engineHTMLOnlyAndroidExitCallbackChanged':True,
              'allSourceAssetsMatchAPK':True, 'sourceAssetsChecked':len(source_assets),
              'officialEngineCodeUnchanged':True, 'engineWasmExactlyIdenticalToV512':True,
              'originalDataPrefixPreserved':True,
              'customAdapterChange':'Read-only native laboratory queue snapshot and exact scoped waiting-group removal; no rules/mod/map changes',
              'originalResourcesUnchanged':len(original_resources),
              'removedLegacyAssets':sorted(legacy),'addedBridgeAssets':sorted(native),
              'remainingBrowserRendering':'Official engine battlefield, radar, messages, blueprints and stock engine menus'}
args.report.parent.mkdir(parents=True, exist_ok=True)
args.report.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
