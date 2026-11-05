"""Verify both maps and the unchanged Towers mod against the v5.10 fallback."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json,re

root=Path(__file__).resolve().parents[1]
candidate=root/'app/build/outputs/apk/debug/app-debug.apk'
with ZipFile(root.parent/'Warzone-Towers-v5.10.apk') as old,ZipFile(candidate) as new:
    prefix='assets/warzone/'
    a,b=old.read(prefix+'warzone2100.data'),new.read(prefix+'warzone2100.data')
    aj,bj=old.read(prefix+'warzone2100.js').decode(),new.read(prefix+'warzone2100.js').decode()
    pattern=r'loadPackage\(\{files:\[.*?\],remote_package_size:.*?\}\)'
    assert re.sub(pattern,'INDEX',aj)==re.sub(pattern,'INDEX',bj),'Compiled engine changed'
    assert old.read(prefix+'warzone2100.wasm')==new.read(prefix+'warzone2100.wasm')
    assert b.startswith(a),'Frozen data prefix changed'
    def index(s):
        entries=re.findall(r'\{filename:"([^"]+)",start:(\d+),end:(\d+)\}',re.search(pattern,s)[0])
        assert len(entries)==len({e[0] for e in entries})
        return {n:(int(x),int(y)) for n,x,y in entries}
    ai,bi=index(aj),index(bj)
    changed={n for n in ai if a[slice(*ai[n])]!=b[slice(*bi[n])]}
    assert changed=={'/data/mp/addon.lev'},changed
    assert set(bi)-set(ai)=={'/data/mp/tests/warzonetowers-td1.json'}|{'/data/mp/multiplay/maps/td1_v3/'+f.name for f in (root/'vendor/maps/td1-v3/map').iterdir()}
    original=root/'vendor/maps/td1-v3/original/td1_v3.wz'
    assert sha256(original.read_bytes()).hexdigest()=='f06326ad33bd3ea334fd9feeb256ff5a621282f8ad8e894f7239220aaa18f4a8'
    with ZipFile(original) as z:
        for n in z.namelist():
            assert b[slice(*bi['/data/mp/multiplay/maps/td1_v3/'+n])]==z.read(n)
            assert (root/'vendor/maps/td1-v3/map'/n).read_bytes()==z.read(n)
    assert b[slice(*bi['/data/mp/tests/warzonetowers-td1.json'])]==(root/'scenario/warzonetowers-td1.json').read_bytes()
    registry=b[slice(*bi['/data/mp/addon.lev'])].decode()
    assert registry.count('level td1_v3-T1')==1 and registry.count('TowerDefense2_m-T1')==1
    with ZipFile(root/'vendor/tower-defense/original/WZmodTowerDefense-v4.7.0-a.zip') as z:
        for f in z.infolist():
            if not f.is_dir():assert b[slice(*bi['/data/mp/'+f.filename])]==z.read(f),'Original mod changed: '+f.filename
    allowed={'assets/warzone/index.html','assets/warzone/music-loader.js','assets/warzone-touch-controls.js',prefix+'warzone2100.js',prefix+'warzone2100.data'}
    assets={n for n in old.namelist() if n.startswith(('assets/','lib/','res/'))}
    assert assets=={n for n in new.namelist() if n.startswith(('assets/','lib/','res/'))}
    assert {n for n in assets if old.read(n)!=new.read(n)}==allowed
    count=0
    for f in (root/'app/src/main/assets').rglob('*'):
        if f.is_file():
            assert new.read('assets/'+f.relative_to(root/'app/src/main/assets').as_posix())==f.read_bytes(),'Stale APK asset: '+str(f)
            count+=1
    result=dict(apkSHA256=sha256(candidate.read_bytes()).hexdigest(),compiledEngineAndWasmIdentical=True,frozenDataPrefixPreserved=True,
        suppliedMapArchiveExact=True,suppliedMapMembersExact=7,originalMapAndModAndResearchPreserved=True,
        changedVirtualFiles=sorted(changed),addedVirtualFiles=sorted(set(bi)-set(ai)),sourceAssetsMatchAPK=True,checkedSourceAssets=count)
    (root/'qa/v5.11/preservation.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
