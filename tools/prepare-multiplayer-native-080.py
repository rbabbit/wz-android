"""Install reviewed 080 room-only overlays in the retained official 4.7 warm tree.

Run under Ubuntu-24.04 WSL. This never restores unknown edits or regenerates
historical overlays; every pre-existing modified file must match retained 071.
"""
from pathlib import Path
import difflib, hashlib, json, re, subprocess

ROOT = Path('/mnt/c/timerApp/wz-towers-lab')
CACHE = Path('/home/punkech/wz-mp-070')
SOURCE = CACHE / 'source'
OUT = ROOT / 'vendor/multiplayer/native-080'
OLD = ROOT / 'vendor/multiplayer/native-079'
QA = ROOT / 'qa/multiplayer-room-080'
UPSTREAM = '7d3d8e51a61ceee89e6bf672a41337e1a9cd7392'
PATHS = ['src/quickjs_backend.cpp', 'lib/sdl/main_sdl.cpp', 'src/multiint.cpp',
         'src/wrappers.cpp', 'src/display3d.cpp', 'src/hci.cpp']

def sha(data):
    return hashlib.sha256(data).hexdigest()

assert subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD'], text=True).strip() == UPSTREAM
changed = subprocess.check_output(['git', '-C', str(SOURCE), 'diff', '--name-only'], text=True).splitlines()
assert set(changed) <= set(PATHS), 'Unknown warm-tree source modifications: ' + repr(changed)
for name in PATHS:
    current = (SOURCE / name).read_bytes()
    assert current in [(OLD / Path(name).name).read_bytes(), (OUT / Path(name).name).read_bytes()], 'Unknown warm overlay: ' + name

# All079 native private-context/gameplay code is frozen for this map-preview change.
for name in ['quickjs_backend.cpp','mobile-ui-native.cpp.inc','main_sdl.cpp','hci.cpp','display3d.cpp','wrappers.cpp','mobile-ui-bootstrap.js','autorevision.cache','netplay_config.h']:
    assert (OUT/name).read_bytes() == (OLD/name).read_bytes(), 'Unrelated079 native source changed: ' + name

records, patch = [], []
for name in PATHS:
    data = (OUT / Path(name).name).read_bytes()
    (SOURCE / name).write_bytes(data)
    original = subprocess.check_output(['git', '-C', str(SOURCE), 'show', UPSTREAM + ':' + name])
    records.append({'path': name, 'sha256': sha(data), 'bytes': len(data)})
    patch.append(''.join(difflib.unified_diff(original.decode().splitlines(True), data.decode().splitlines(True), fromfile='a/' + name, tofile='b/' + name)))
includes = ['mobile-room-native.cpp.inc','mobile-room-map-preview.cpp.inc']
for name in includes:
    data = (OUT/name).read_bytes()
    (SOURCE/'src'/name).write_bytes(data)
    patch.append(''.join(difflib.unified_diff([], data.decode().splitlines(True), fromfile='/dev/null', tofile='b/src/'+name)))
(OUT / 'native-ui.patch').write_text(''.join(patch), newline='\n')
record = {'version':'0.80', 'upstreamCommit': UPSTREAM, 'nativeDataUnchanged': True,
          'simulationSourcesUnchanged': True, 'previousOverlay':'vendor/multiplayer/native-079',
          'changed': records, 'newIncludes':[{'path':'src/'+name,'sha256':sha((OUT/name).read_bytes()),
          'bytes':(OUT/name).stat().st_size} for name in includes]}
(OUT / 'source-overlays.json').write_text(json.dumps(record, indent=2))
QA.mkdir(parents=True, exist_ok=True)
(QA / 'native-prepare.json').write_text(json.dumps(record, indent=2))
print(json.dumps(record, indent=2))
