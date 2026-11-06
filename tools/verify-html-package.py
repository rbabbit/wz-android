"""Check the scoped v6.2 HTML return without launching Android or the game."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json, re

root = Path(__file__).resolve().parents[1]
candidate = root/'app/build/outputs/apk/debug/app-debug.apk'
digest = lambda data: sha256(data).hexdigest()
prefix = 'assets/warzone/'
pattern = r'loadPackage\(\{files:\[.*?\],remote_package_size:.*?\}\)'
def index(js):
    entries = re.findall(r'\{filename:"([^"]+)",start:(\d+),end:(\d+)\}', re.search(pattern,js)[0])
    assert len(entries) == len({n for n,_,_ in entries})
    return {n:(int(a),int(b)) for n,a,b in entries}

with ZipFile(root.parent/'Warzone-Towers-v6.1-Compact-Native.apk') as native, ZipFile(root.parent/'Warzone-Towers-v5.12.apk') as legacy, ZipFile(candidate) as apk:
    old_data=native.read(prefix+'warzone2100.data');data=apk.read(prefix+'warzone2100.data')
    old_js=native.read(prefix+'warzone2100.js').decode();js=apk.read(prefix+'warzone2100.js').decode()
    assert re.sub(pattern,'PACKAGE_INDEX',old_js)==re.sub(pattern,'PACKAGE_INDEX',js),'Compiled engine changed'
    assert apk.read(prefix+'warzone2100.wasm')==native.read(prefix+'warzone2100.wasm'),'WASM changed'
    assert data.startswith(old_data),'Frozen native6.1 data prefix changed'
    before,after=index(old_js),index(js);assert before.keys()==after.keys(),'Map/mod virtual files changed'
    changed={n for n in before if old_data[slice(*before[n])]!=data[slice(*after[n])]}
    command='/data/mp/tests/warzone-towers-commands.js';assert changed=={command},changed
    prior=old_data[slice(*before[command])].decode().replace('\r\n','\n');current=data[slice(*after[command])].decode().replace('\r\n','\n')
    start=current.index('    } else {\n        // A stored factory template');end=current.index('    const count = Number(command.count || 1);',start)
    original='''    } else {
        const validation = wtcmd_validateDesign(command.design, false);
        if (validation.error) { wtcmd_answer(command, false, validation.error); return; }
        design = validation.design;
    }
'''
    assert current[:start]+original+current[end:]==prior,'Scenario changes outside portable-template production'
    assert data[slice(*after[command])]==(root/'scenario/warzone-towers-commands.js').read_bytes()
    old_assets={n for n in legacy.namelist() if n.startswith('assets/') and not n.endswith('/')}
    new_assets={n for n in apk.namelist() if n.startswith('assets/') and not n.endswith('/')}
    assert old_assets-new_assets==set()
    assert new_assets-old_assets=={'assets/warzone-html-session.js'}
    actual_changed={n for n in old_assets if apk.read(n)!=legacy.read(n)}
    assert actual_changed=={'assets/warzone-command-pages.js','assets/warzone-mobile-research.js','assets/warzone-touch-controls.js','assets/warzone-towers-wave-hud.js',prefix+'index.html',prefix+'warzone2100.data',prefix+'warzone2100.js'},actual_changed
    old_html=legacy.read(prefix+'index.html').decode()
    assert old_html.replace('try { window.BlockNightAndroid.battleFinished(); } catch (_) {}','try { window.__warzoneTowersWaves?.engineExited?.(); } catch (_) {}')==apk.read(prefix+'index.html').decode()
    resource_names=[n for n in legacy.namelist() if n.startswith(('res/','lib/')) and not n.endswith('/')]
    for n in resource_names:assert apk.read(n)==legacy.read(n),n
    assert b'TowersNativeUi' not in apk.read('classes.dex'),'Retired native controls still compiled'
    checked=0
    for f in (root/'app/src/main/assets').rglob('*'):
        if f.is_file():
            assert apk.read('assets/'+f.relative_to(root/'app/src/main/assets').as_posix())==f.read_bytes(),f
            checked+=1
    report={'passed':True,'candidateAPK_SHA256':digest(candidate.read_bytes()),'verification':'code/package only; no emulator or gameplay testing','compiledEngineAndWasmUnchanged':True,'frozenV61DataPrefixPreserved':True,'unchangedResolvedVirtualFiles':len(before)-1,'onlyChangedVirtualFile':command,'nativeScenarioChange':'portable saved factory templates require a matching currently available engine template or standard design validation; normal factory/module/cost checks retained','originalHtmlCssLayoutRestored':True,'originalResourcesUnchanged':len(resource_names),'nativeControlClassAbsent':True,'sourceAssetsMatchAPK':checked,'changedVsHtmlV512':sorted(actual_changed)}
    (root/'qa/v6.2-html/package-checks.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))
