"""Prove that the build-display release does not change game behavior/assets."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json
root=Path(__file__).resolve().parents[1];qa=root/'qa/v6.4-build-display';candidate=root/'app/build/outputs/apk/debug/app-debug.apk'
digest=lambda b:sha256(b).hexdigest()
norm=lambda b:b.decode('utf8').replace('\r\n','\n')
allowed={'app/build.gradle.kts','app/src/main/assets/warzone-command-pages.js','app/src/main/assets/warzone-terrain-picker.js','app/src/main/assets/warzone/ui/command-pages.css'}
before=json.loads((qa/'before-runtime.json').read_text(encoding='utf8'))
changed={n for n,h in before.items() if digest((root/n).read_bytes())!=h};assert changed==allowed,changed
with ZipFile(root.parent/'Warzone-Towers-v6.3-Smooth-Building.apk') as old,ZipFile(candidate) as new:
    a={n for n in old.namelist() if n.startswith('assets/') and not n.endswith('/')};b={n for n in new.namelist() if n.startswith('assets/') and not n.endswith('/')}
    added=b-a;assert added=={'assets/warzone/ui/build-display.js','assets/warzone/build-ghost-models.json'},added
    differences={n for n in a if old.read(n)!=new.read(n)}
    assert differences=={n.removeprefix('app/src/main/') for n in allowed if '/assets/' in n},differences
    assert old.read('classes.dex')==new.read('classes.dex')
    for n in old.namelist():
        if n.startswith(('res/','lib/')) and not n.endswith('/'):assert old.read(n)==new.read(n),n
    prior=norm(old.read('assets/warzone-command-pages.js'));current=norm(new.read('assets/warzone-command-pages.js'))
    # The complete input/order lifecycle remains byte-equivalent after removal
    # of the explicitly display-only calls attached to selection/rejection.
    def part(text,start,end):return text[text.index(start):text.index(end,text.index(start))]
    for start,end in [('  function send(','  function accept('),('  function nativeBuildTap()','  function cancelPlacement()'),('  async function openBuild(','  function beginPlacement(')]:
        assert part(prior,start,end)==part(current,start,end),start
    p=part(prior,'  function placeAt(','  let validationTimer;');c=part(current,'  function placeAt(','  let validationTimer;').replace('window.WarzoneBuildDisplay?.reject(item.id,point.x,point.y);','');assert p==c,'Construction order changed'
    p=part(prior,'  let validationTimer;','  loadSaved();resetDraft();');c=part(current,'  let validationTimer;','  loadSaved();resetDraft();')
    c='\n'.join(line for line in c.split('\n') if "window.addEventListener('warzone-build-display-ready'" not in line);assert p==c,'Design, production or unrelated handlers changed'
    assert norm(new.read('assets/warzone/ui/command-pages.css')).startswith(norm(old.read('assets/warzone/ui/command-pages.css'))),'Existing CSS edited'
    for p in (root/'app/src/main/assets').rglob('*'):
        if p.is_file():assert new.read('assets/'+p.relative_to(root/'app/src/main/assets').as_posix())==p.read_bytes(),p
    renderer=norm(new.read('assets/warzone/ui/build-display.js'))
    for token in ['.send(','nativePressKey','nativeSelectClick','writeFile','BlockNightAndroid']:assert token not in renderer,token
report={'passed':True,'candidateAPK_SHA256':digest(candidate.read_bytes()),'changedRuntimeFiles':sorted(changed),'newDisplayAssets':sorted(added),'constructionScenarioAndOrdersUnchanged':True,'researchProductionDesignTemplatesUnchanged':True,'compiledEngineWasmDataMapsModsAndroidAndOtherAssetsUnchanged':True,'existingCssPreservedWithBuildingOnlyAppend':True}
(qa/'package-checks.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report,indent=2))
