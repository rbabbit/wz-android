"""Install only the reviewed spectator-owned-UI capability overlay in matched4.7.
Run in Ubuntu-24.04 WSL; retained080 source and evidence remain immutable.
"""
from pathlib import Path
import difflib, hashlib, json, re, subprocess

ROOT=Path('/mnt/c/timerApp/wz-towers-lab'); CACHE=Path('/home/punkech/wz-mp-070')
SOURCE=CACHE/'source'; OUT=ROOT/'vendor/multiplayer/native-082'
OLD=ROOT/'vendor/multiplayer/native-080'; QA=ROOT/'qa/multiplayer-spectator-082'
UPSTREAM='7d3d8e51a61ceee89e6bf672a41337e1a9cd7392'
PATHS=['src/quickjs_backend.cpp','lib/sdl/main_sdl.cpp','src/multiint.cpp',
       'src/wrappers.cpp','src/display3d.cpp','src/hci.cpp']
def sha(data): return hashlib.sha256(data).hexdigest()

old_quick=(OLD/'quickjs_backend.cpp').read_text()
marker='// Client-side mobile UI context for the official 4.7 multiplayer engine.'
prefix=old_quick[:old_quick.index(marker)]
registered=re.search(r'const std::set<std::string> registered=\{([^\n]+)\};',old_quick).group(1)
assert prefix+(OLD/'mobile-ui-native.cpp.inc').read_text().replace('MP_REGISTERED_FUNCTIONS',registered)==old_quick
quick=prefix+(OUT/'mobile-ui-native.cpp.inc').read_text().replace('MP_REGISTERED_FUNCTIONS',registered)
assert (OUT/'quickjs_backend.cpp').read_text()==quick, '082 native include/generated body mismatch'
assert subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD'],text=True).strip()==UPSTREAM
changed=subprocess.check_output(['git','-C',str(SOURCE),'diff','--name-only'],text=True).splitlines()
assert set(changed)<=set(PATHS), 'Unknown warm-tree edits: '+repr(changed)
for name in PATHS:
    assert (SOURCE/name).read_bytes() in [(OLD/Path(name).name).read_bytes(),(OUT/Path(name).name).read_bytes()], 'Unknown warm overlay: '+name
for name in ['main_sdl.cpp','multiint.cpp','hci.cpp','display3d.cpp','wrappers.cpp',
             'mobile-room-native.cpp.inc','mobile-room-map-preview.cpp.inc',
             'mobile-ui-bootstrap.js','autorevision.cache','netplay_config.h','upstream-tags.txt']:
    assert (OUT/name).read_bytes()==(OLD/name).read_bytes(), 'Unrelated080 native source changed: '+name

records=[]; patch=[]
for name in PATHS:
    data=(OUT/Path(name).name).read_bytes();(SOURCE/name).write_bytes(data)
    original=subprocess.check_output(['git','-C',str(SOURCE),'show',UPSTREAM+':'+name])
    records.append({'path':name,'sha256':sha(data),'bytes':len(data)})
    patch.append(''.join(difflib.unified_diff(original.decode().splitlines(True),data.decode().splitlines(True),fromfile='a/'+name,tofile='b/'+name)))
includes=['mobile-room-native.cpp.inc','mobile-room-map-preview.cpp.inc']
for name in includes:
    data=(OUT/name).read_bytes();(SOURCE/'src'/name).write_bytes(data)
    patch.append(''.join(difflib.unified_diff([],data.decode().splitlines(True),fromfile='/dev/null',tofile='b/src/'+name)))
(OUT/'native-ui.patch').write_text(''.join(patch),newline='\n')
record={'version':'0.82','upstreamCommit':UPSTREAM,'nativeDataUnchanged':True,
        'simulationSourcesUnchanged':True,'previousOverlay':'vendor/multiplayer/native-080',
        'changed':records,'newIncludes':[{'path':'src/'+n,'sha256':sha((OUT/n).read_bytes()),'bytes':(OUT/n).stat().st_size} for n in includes],
        'sourceHelpers':[{'path':'vendor/multiplayer/native-082/mobile-ui-native.cpp.inc','sha256':sha((OUT/'mobile-ui-native.cpp.inc').read_bytes())}],
        'onlyChangedTranslationUnit':'src/quickjs_backend.cpp'}
(OUT/'source-overlays.json').write_text(json.dumps(record,indent=2));QA.mkdir(parents=True,exist_ok=True)
(QA/'native-prepare.json').write_text(json.dumps(record,indent=2))
print(json.dumps({'prepared':True,'version':'0.82','onlyChangedTranslationUnit':'src/quickjs_backend.cpp'}))
