"""Prove the footer release preserves engine, maps, mod and gameplay assets."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json,re

root=Path(__file__).resolve().parents[1]
candidate=root/'app/build/outputs/apk/debug/app-debug.apk'
with ZipFile(root.parent/'Warzone-Towers-v5.11.apk') as old,ZipFile(candidate) as new:
    names={n for n in old.namelist() if n.startswith(('assets/','lib/'))}
    assert names=={n for n in new.namelist() if n.startswith(('assets/','lib/'))}
    for name in names:assert old.read(name)==new.read(name),'Changed gameplay asset: '+name
    for path in (root/'app/src/main/assets').rglob('*'):
        if path.is_file():assert new.read('assets/'+path.relative_to(root/'app/src/main/assets').as_posix())==path.read_bytes()
    data=old.read('assets/warzone/warzone2100.data');js=old.read('assets/warzone/warzone2100.js').decode()
    entry=re.search(r'filename:"/data/base/images/frontend/image_fe_logo.png",start:(\d+),end:(\d+)',js)
    logo=(root/'app/src/main/res/drawable-nodpi/warzone_official_logo.png').read_bytes();assert logo==data[int(entry[1]):int(entry[2])]
    backdrop=root/'app/src/main/res/drawable-nodpi/warzone_official_backdrop.png'
    for asset in (backdrop,root/'app/src/main/res/drawable-nodpi/warzone_official_logo.png'):
        entry=next(n for n in new.namelist() if n.startswith('res/') and Path(n).name==asset.name)
        assert new.read(entry)==asset.read_bytes(),'Stale artwork resource: '+entry
    result=dict(apkSHA256=sha256(candidate.read_bytes()).hexdigest(),allPriorAssetsAndNativeLibrariesIdentical=True,
        engineMapsModResearchAndMusicCodeIdentical=True,checkedAPKMembers=len(names),sourceAssetsMatchAPK=True,
        originalLogoByteIdentical=True,newArtworkResourcesMatchSource=True,backdropSHA256=sha256(backdrop.read_bytes()).hexdigest(),logoSHA256=sha256(logo).hexdigest())
    (root/'qa/v5.12/preservation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
