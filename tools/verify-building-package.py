"""Verify that v6.3 changes only the audited building interaction."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import json,re

root=Path(__file__).resolve().parents[1]
qa=root/'qa/v6.3-building'
candidate=root/'app/build/outputs/apk/debug/app-debug.apk'
digest=lambda data:sha256(data).hexdigest()
allowed={'app/src/main/assets/warzone-command-pages.js','app/src/main/assets/warzone-touch-controls.js',
         'app/src/main/assets/warzone/warzone2100.data','app/src/main/assets/warzone/warzone2100.js',
         'scenario/warzone-towers-commands.js','app/build.gradle.kts'}
before=json.loads((qa/'before-runtime.json').read_text())
changed={n for n,h in before.items() if digest((root/n).read_bytes())!=h}
assert changed==allowed,changed
pattern=r'loadPackage\(\{files:\[.*?\],remote_package_size:.*?\}\)'
def index(js):
    return {n:(int(a),int(b)) for n,a,b in re.findall(r'\{filename:"([^"]+)",start:(\d+),end:(\d+)\}',re.search(pattern,js)[0])}
with ZipFile(root.parent/'Warzone-Towers-v6.2-HTML-Templates.apk') as old,ZipFile(candidate) as new:
    old_assets={n for n in old.namelist() if n.startswith('assets/') and not n.endswith('/')}
    new_assets={n for n in new.namelist() if n.startswith('assets/') and not n.endswith('/')}
    assert old_assets==new_assets
    changed_assets={n for n in old_assets if old.read(n)!=new.read(n)}
    assert changed_assets=={n.removeprefix('app/src/main/') for n in allowed if '/assets/' in n},changed_assets
    old_js=old.read('assets/warzone/warzone2100.js').decode();new_js=new.read('assets/warzone/warzone2100.js').decode()
    assert re.sub(pattern,'PACKAGE_INDEX',old_js)==re.sub(pattern,'PACKAGE_INDEX',new_js),'Compiled engine changed'
    old_data=old.read('assets/warzone/warzone2100.data');new_data=new.read('assets/warzone/warzone2100.data')
    assert new_data.startswith(old_data),'Fallback data prefix changed'
    a,b=index(old_js),index(new_js);assert a.keys()==b.keys()
    virtual_changed={n for n in a if old_data[slice(*a[n])]!=new_data[slice(*b[n])]}
    assert virtual_changed=={'/data/mp/tests/warzone-towers-commands.js'},virtual_changed
    assert new_data[slice(*b[next(iter(virtual_changed))])]==(root/'scenario/warzone-towers-commands.js').read_bytes()
    original=old_data[slice(*a[next(iter(virtual_changed))])].decode().replace('\r\n','\n')
    current=(root/'scenario/warzone-towers-commands.js').read_text(encoding='utf8')
    restored=current.replace('''    // The mobile build catalogue supplies its local group directly; opening
    // stock selection widgets just to assign these trucks stalls the live view.
    let candidates = Array.isArray(command.workerIds)
        ? builders.filter(function (d) { return command.workerIds.indexOf(d.id) >= 0; }) : selected;''','    let candidates = selected;').replace('if (!candidates.length && !Array.isArray(command.workerIds))','if (!candidates.length)')
    start=restored.index('    // Reuse the construction journal for live travel/progress/module display.')
    end=restored.index('    job.workers.forEach(function (id) {',start)
    restored=restored[:start]+restored[end:]
    restored=restored.replace('        if (!ids.length) return;','        if (!ids.length || !wtcmd_idle(droid)) return;')
    start=restored.index('        // A new native move/stop/other order overrides this truck')
    end=restored.index('        if (job.issued[key] && gameTime',start)
    restored=restored[:start]+restored[end:]
    assert restored==original,'Scenario changed beyond building assignment, progress and preserving manual override'

    old_touch=old.read('assets/warzone-touch-controls.js').decode().replace('\r\n','\n')
    new_touch=new.read('assets/warzone-touch-controls.js').decode().replace('\r\n','\n')
    restored_touch=new_touch.replace('&&!window.__warzoneCommands.isPlacement?.()','').replace('    if (radar) window.__warzoneCommands?.hidePreview?.();\n','')
    assert restored_touch==old_touch,'Touch changes outside building hit regions / clearing its preview on radar use'
    old_pages=old.read('assets/warzone-command-pages.js').decode().replace('\r\n','\n')
    new_pages=new.read('assets/warzone-command-pages.js').decode().replace('\r\n','\n')
    for marker,end_marker in [('  let validationTimer;','  loadSaved();resetDraft();')]:
        assert old_pages[old_pages.index(marker):old_pages.index(end_marker)]==new_pages[new_pages.index(marker):new_pages.index(end_marker)],'Design/production handlers changed'

    assert old.read('classes.dex')==new.read('classes.dex'),'Android implementation changed'
    for n in old.namelist():
        if n.startswith(('res/','lib/')) and not n.endswith('/'):assert old.read(n)==new.read(n),n
    for p in (root/'app/src/main/assets').rglob('*'):
        if p.is_file():assert new.read('assets/'+p.relative_to(root/'app/src/main/assets').as_posix())==p.read_bytes(),p
report={'passed':True,'candidateAPK_SHA256':digest(candidate.read_bytes()),'changedRuntimeFiles':sorted(changed),
        'changedAssets':sorted(changed_assets),'compiledEngineWasmMapsModsAndroidAndOtherAssetsUnchanged':True,
        'fallbackDataPrefixPreserved':True,'unchangedResolvedVirtualFiles':len(a)-1,'onlyScenarioChange':'local building worker IDs, progress journal and preserving native movement/STOP override'}
(qa/'package-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
