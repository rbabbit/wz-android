"""Install reviewed 079 room-only overlays in the retained official 4.7 warm tree.

Run under Ubuntu-24.04 WSL. This never restores unknown edits or regenerates
historical overlays; every pre-existing modified file must match retained 071.
"""
from pathlib import Path
import difflib, hashlib, json, re, subprocess

ROOT = Path('/mnt/c/timerApp/wz-towers-lab')
CACHE = Path('/home/punkech/wz-mp-070')
SOURCE = CACHE / 'source'
OUT = ROOT / 'vendor/multiplayer/native-079'
OLD = ROOT / 'vendor/multiplayer/native-071'
QA = ROOT / 'qa/multiplayer-room-079'
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

# Rebuild the reviewed private-context suffix, retaining the exact071 native
# registration allowlist expansion. No generated program/binary editing occurs.
old_qjs = (OLD / 'quickjs_backend.cpp').read_text()
old_inc = (OLD / 'mobile-ui-native.cpp.inc').read_text()
position = old_qjs.index(old_inc[:150])
registered = re.search(r'const std::set<std::string> registered=\{(.+?)\};', old_qjs[position:]).group(1)
assert old_qjs[position:] == old_inc.replace('MP_REGISTERED_FUNCTIONS', registered)
expected = old_qjs[:position] + (OUT / 'mobile-ui-native.cpp.inc').read_text().replace('MP_REGISTERED_FUNCTIONS', registered)
assert (OUT / 'quickjs_backend.cpp').read_text() == expected

records, patch = [], []
for name in PATHS:
    data = (OUT / Path(name).name).read_bytes()
    (SOURCE / name).write_bytes(data)
    original = subprocess.check_output(['git', '-C', str(SOURCE), 'show', UPSTREAM + ':' + name])
    records.append({'path': name, 'sha256': sha(data), 'bytes': len(data)})
    patch.append(''.join(difflib.unified_diff(original.decode().splitlines(True), data.decode().splitlines(True), fromfile='a/' + name, tofile='b/' + name)))
(SOURCE / 'src/mobile-room-native.cpp.inc').write_bytes((OUT / 'mobile-room-native.cpp.inc').read_bytes())
patch.append(''.join(difflib.unified_diff([], (OUT / 'mobile-room-native.cpp.inc').read_text().splitlines(True),
    fromfile='/dev/null', tofile='b/src/mobile-room-native.cpp.inc')))
(OUT / 'native-ui.patch').write_text(''.join(patch), newline='\n')
record = {'version':'0.79', 'upstreamCommit': UPSTREAM, 'nativeDataUnchanged': True,
          'simulationSourcesUnchanged': True, 'previousOverlay':'vendor/multiplayer/native-071',
          'changed': records, 'newIncludes':[{'path':'src/mobile-room-native.cpp.inc',
          'sha256':sha((OUT / 'mobile-room-native.cpp.inc').read_bytes()),
          'bytes':(OUT / 'mobile-room-native.cpp.inc').stat().st_size}]}
(OUT / 'source-overlays.json').write_text(json.dumps(record, indent=2))
QA.mkdir(parents=True, exist_ok=True)
(QA / 'native-prepare.json').write_text(json.dumps(record, indent=2))
print(json.dumps(record, indent=2))
