"""Verify a UI-only delivery against the frozen v5.7 APK."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json

root = Path(__file__).resolve().parents[1]
baseline = root.parent/'Warzone-Towers-v5.7.apk'
candidate = root/'app/build/outputs/apk/debug/app-debug.apk'
allowed = {'assets/warzone-command-pages.js', 'assets/warzone/ui/command-pages.css'}
with ZipFile(baseline) as old, ZipFile(candidate) as new:
    names = {n for n in old.namelist() if n.startswith(('assets/', 'res/', 'lib/'))}
    assert names == {n for n in new.namelist() if n.startswith(('assets/', 'res/', 'lib/'))}, 'Unexpected asset additions/removals'
    changed = {n for n in names if old.read(n) != new.read(n)}
    assert changed == allowed, 'Unexpected asset changes: '+str(changed)
    count = 0
    for f in (root/'app/src/main/assets').rglob('*'):
        if f.is_file():
            assert new.read('assets/'+f.relative_to(root/'app/src/main/assets').as_posix()) == f.read_bytes(), 'Stale APK: '+str(f)
            count += 1
    result = dict(apkSHA256=sha256(candidate.read_bytes()).hexdigest(), changedAssets=sorted(changed),
                  unchangedAssets=len(names)-len(changed), engineWasmDataAndScenarioIdentical=True,
                  originalTowerDefenseModAndResearchPreserved=True, sourceAssetsMatchAPK=True, checkedSourceAssets=count)
    (root/'qa/v5.8/preservation.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
