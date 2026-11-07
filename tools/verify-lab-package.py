"""Verify isolated Lab identity, exact source assets and unchanged v6.4 game code."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256, file_digest
import argparse, json, os, re, subprocess

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
p.add_argument('--out', type=Path, default=ROOT/'qa/lab-01/package-verification.json')
args = p.parse_args()
baseline = ROOT.parent/'Warzone-Towers-v6.4-Build-Blueprints.apk'
source = ROOT.parent/'warzone-towers-v6.4-build-blueprints-source.zip'
digest = lambda b: sha256(b).hexdigest()
def filehash(path):
    with path.open('rb') as f: return file_digest(f, 'sha256').hexdigest()
assert filehash(baseline) == '12532300d9ce2010b911fae879a6e197eb059a98bd672901bd65307cd9f3532a'
new_assets = {'assets/warzone/ui/'+name for name in ('lab-shell.css','lab-commands.css','lab-research.css','lab-ui.js')}
with ZipFile(baseline) as old, ZipFile(args.apk) as apk, ZipFile(source) as frozen:
    original = {n for n in old.namelist() if n.startswith('assets/') and not n.endswith('/')}
    current = {n for n in apk.namelist() if n.startswith('assets/') and not n.endswith('/')}
    assert original-current == set(), 'An original game asset was removed'
    assert current-original == new_assets, current-original
    changed = {n for n in original if apk.read(n) != old.read(n)}
    assert changed == {'assets/warzone-command-pages.js'}, changed
    before = frozen.read('app/src/main/assets/warzone-command-pages.js').decode('utf-8').replace('\r\n','\n')
    after = (ROOT/'app/src/main/assets/warzone-command-pages.js').read_text(encoding='utf-8')
    def functions(text):
        matches = list(re.finditer(r'^  (?:async )?function (\w+)\(', text, re.M))
        return {m[1]:text[m.start():matches[i+1].start() if i+1<len(matches) else len(text)] for i,m in enumerate(matches)}
    left, right = functions(before), functions(after)
    changed_functions = {name for name in left if left[name] != right.get(name)}
    assert changed_functions <= {'install','open','close','requestState','render'}, changed_functions
    assert right.keys()-left.keys() == {'rememberPanelScroll'}
    scenario = 'scenario/warzone-towers-commands.js'
    assert (ROOT/scenario).read_bytes() == frozen.read(scenario), 'Gameplay scenario changed'
    for n in frozen.namelist():
        if n.startswith('app/src/main/res/') and n.lower().endswith(('.png','.webp','.jpg','.ttf')):
            assert (ROOT/n).read_bytes() == frozen.read(n), 'Original artwork/font changed: '+n
    checked = []
    for path in sorted((ROOT/'app/src/main/assets').rglob('*')):
        if path.is_file():
            name='assets/'+path.relative_to(ROOT/'app/src/main/assets').as_posix()
            assert apk.read(name) == path.read_bytes(), 'APK/source mismatch: '+name
            checked.append(name)
sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home()/'AppData/Local/Android/Sdk')))
aapt = sdk/'build-tools/36.1.0/aapt2.exe'
badging = subprocess.check_output([str(aapt),'dump','badging',str(args.apk)], text=True, encoding='utf-8')
assert "package: name='com.rbabbit.warzonetowers.lab'" in badging
assert "versionName='0.1-lab'" in badging
assert "application-label:'Towers Lab'" in badging
runtime=[]
for path in sorted((ROOT/'app/src').rglob('*')):
    if path.is_file(): runtime.append({'path':path.relative_to(ROOT).as_posix(),'sha256':filehash(path)})
runtime.append({'path':'app/build.gradle.kts','sha256':filehash(ROOT/'app/build.gradle.kts')})
result={'passed':True,'candidateAPK_SHA256':filehash(args.apk),'package':'com.rbabbit.warzonetowers.lab','version':'0.1-lab','baselineAPK_SHA256':filehash(baseline),'unchangedOriginalAssets':len(original)-len(changed),'modifiedOriginalAssets':sorted(changed),'addedAssets':sorted(new_assets),'presentationFunctionsChanged':sorted(changed_functions),'gameplayScenarioUnchanged':True,'originalEngineWasmDataMapsModUnchanged':True,'sourceAssetsMatchAPK':len(checked),'sourceFiles':runtime}
args.out.parent.mkdir(parents=True,exist_ok=True)
args.out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='sourceFiles'},indent=2))
