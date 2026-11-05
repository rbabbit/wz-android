"""Verify v5.10 UI/queue observer changes against the frozen v5.9 APK."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json, re

root = Path(__file__).resolve().parents[1]
baseline = root.parent/'Warzone-Towers-v5.9.apk'
candidate = root/'app/build/outputs/apk/debug/app-debug.apk'
allowed = {'assets/warzone-command-pages.js', 'assets/warzone-touch-controls.js',
           'assets/warzone/warzone2100.data', 'assets/warzone/warzone2100.js'}
with ZipFile(baseline) as old, ZipFile(candidate) as new:
    names = {n for n in old.namelist() if n.startswith(('assets/', 'res/', 'lib/'))}
    assert names == {n for n in new.namelist() if n.startswith(('assets/', 'res/', 'lib/'))}, 'Unexpected asset additions/removals'
    changed = {n for n in names if old.read(n) != new.read(n)}
    assert changed == allowed, 'Unexpected asset changes: '+str(changed)
    p='assets/warzone/'
    a,b=old.read(p+'warzone2100.data'),new.read(p+'warzone2100.data')
    aj,bj=old.read(p+'warzone2100.js').decode(),new.read(p+'warzone2100.js').decode()
    pattern=r'loadPackage\(\{files:\[.*?\],remote_package_size:.*?\}\)'
    assert re.sub(pattern,'PACKAGE_INDEX',aj)==re.sub(pattern,'PACKAGE_INDEX',bj), 'Compiled engine changed'
    assert b.startswith(a), 'Frozen data prefix changed'
    def index(js):
        entries=re.findall(r'\{filename:"([^"]+)",start:(\d+),end:(\d+)\}',re.search(pattern,js)[0])
        assert len(entries)==len({v[0] for v in entries})
        return {n:(int(s),int(e)) for n,s,e in entries}
    ai,bi=index(aj),index(bj)
    assert ai.keys()==bi.keys(), 'Virtual package paths changed'
    virtualChanged={n for n in ai if a[slice(*ai[n])]!=b[slice(*bi[n])]}
    assert virtualChanged=={'/data/mp/tests/warzone-towers-commands.js'}, str(virtualChanged)
    assert b[slice(*bi['/data/mp/tests/warzone-towers-commands.js'])]==(root/'scenario/warzone-towers-commands.js').read_bytes()
    count = 0
    for f in (root/'app/src/main/assets').rglob('*'):
        if f.is_file():
            assert new.read('assets/'+f.relative_to(root/'app/src/main/assets').as_posix()) == f.read_bytes(), 'Stale APK: '+str(f)
            count += 1
    result = dict(apkSHA256=sha256(candidate.read_bytes()).hexdigest(), changedAssets=sorted(changed),
                  unchangedAssets=len(names)-len(changed), compiledEngineAndWasmIdentical=True,
                  frozenDataPrefixPreserved=True, changedVirtualFiles=sorted(virtualChanged),
                  originalTowerDefenseModAndResearchPreserved=True, sourceAssetsMatchAPK=True, checkedSourceAssets=count)
    (root/'qa/v5.10/preservation.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
