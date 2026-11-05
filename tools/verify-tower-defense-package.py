"""Verify the explicitly authorized Survival -> Tower Defense migration."""
from pathlib import Path
from zipfile import ZipFile
import hashlib, json, re

root = Path(__file__).resolve().parents[1]
baseline = root.parent / 'Warzone-Towers-v5.6.apk'
candidate = root / 'app/build/outputs/apk/debug/app-debug.apk'
pattern = r'loadPackage\(\{files:\[.*?\],remote_package_size:.*?\}\)'
entry = r'\{filename:"([^"]+)",start:(\d+),end:(\d+)\}'
with ZipFile(baseline) as old, ZipFile(candidate) as new:
    p = 'assets/warzone/'
    a, b = old.read(p+'warzone2100.data'), new.read(p+'warzone2100.data')
    aj, bj = old.read(p+'warzone2100.js').decode(), new.read(p+'warzone2100.js').decode()
    assert re.sub(pattern, 'PACKAGE_INDEX', aj) == re.sub(pattern, 'PACKAGE_INDEX', bj), 'Engine JS changed'
    assert old.read(p+'warzone2100.wasm') == new.read(p+'warzone2100.wasm'), 'WASM changed'
    assert b.startswith(a), 'Frozen data prefix changed'
    def index(js):
        entries = re.findall(entry, re.search(pattern, js)[0])
        assert len(entries) == len({v[0] for v in entries}), 'Duplicate package paths'
        return {n:(int(s),int(e)) for n,s,e in entries}
    ai, bi = index(aj), index(bj)
    def resolved(name):
        return b[slice(*bi[name])]
    archive = root/'vendor/tower-defense/original/WZmodTowerDefense-v4.7.0-a.zip'
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == '1f0b72444bf3bba3bfe1d688f07fc52e0336a57969bd6d3a358200fbee2567f9'
    mod = set()
    with ZipFile(archive) as z:
        for f in z.infolist():
            if f.is_dir(): continue
            n = '/data/mp/'+f.filename
            assert resolved(n) == z.read(f), 'Supplied mod changed: '+n
            assert (root/'vendor/tower-defense/mod'/f.filename).read_bytes() == z.read(f)
            mod.add(n)
    embedded = {'/data/mp/tests/'+f.name for f in (root/'scenario').glob('*') if f.is_file() and '/data/mp/tests/'+f.name in bi}
    overrides = {'/data/mp/tests/'+n for n in ['warzonetowers.json','warzone-towers-rules.js','warzone-towers-waves.js','warzone-towers-objective.js','warzone-towers-bridge.js']}
    canonical = '/data/mp/multiplay/script/rules/'
    overrides.add(canonical+'init.js')
    assert resolved(canonical+'init.js') == (root/'scenario/warzone-towers-rules.js').read_bytes()
    for name in ['warzone-towers-command.json','warzone-towers-wave-command.json','warzone-towers-control-command.json','warzone-towers-catalog.json','blocknight-queue-command.json','blocknight-zoom-command.json']:
        overrides.add(canonical+name)
        assert resolved(canonical+name) == (root/'scenario'/name).read_bytes()
    for n in embedded:
        assert resolved(n) == (root/'scenario'/Path(n).name).read_bytes(), 'Stale scenario: '+n
    retired = {'/data/mp/'+f.relative_to(root/'vendor/survival/mod').as_posix() for f in (root/'vendor/survival/mod').rglob('*') if f.is_file()}
    retired -= mod | {canonical+'init.js'}
    retired |= {'/data/mp/tests/minimumResearchTime.json','/data/mp/multiplay/skirmish/warzone-towers-ai.js','/data/mp/multiplay/skirmish/warzone-towers-ai.json'}
    assert not retired.intersection(bi), 'Retired Survival files remain active'
    unchanged = 0
    for n, (s,e) in ai.items():
        if n in mod | overrides | retired: continue
        assert a[s:e] == resolved(n), 'Unexpected original asset change: '+n
        unchanged += 1
    for f in (root/'app/src/main/assets').rglob('*'):
        if f.is_file(): assert new.read('assets/'+f.relative_to(root/'app/src/main/assets').as_posix()) == f.read_bytes(), 'Stale APK: '+str(f)
    report = dict(officialEngineIdentical=True, wasmIdentical=True, frozenDataPrefixPreserved=True,
                  suppliedModFilesExact=len(mod), retiredSurvivalPaths=len(retired), unchangedAssets=unchanged,
                  sourceAssetsMatchAPK=True, apkSHA256=hashlib.sha256(candidate.read_bytes()).hexdigest())
    (root/'qa/v5.7/package-preservation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
