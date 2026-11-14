"""Copy the original Warzone BUTTON_CLICK_3 bytes without changing game data."""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'app/src/main/assets/warzone/ui/game-controls/click.ogg'
VIRTUAL = '/data/base/audio/sfx/interfce/beep3.ogg'
frozen = json.loads((ROOT / 'archive/fallback-0.45.json').read_text(encoding='utf-8-sig'))
row = next(r for r in frozen['files'] if r['path'].endswith('.apk'))
apk = Path(row['path'])
assert apk.stat().st_size == row['bytes']
with apk.open('rb') as stream:
    from hashlib import file_digest
    assert file_digest(stream, 'sha256').hexdigest() == row['sha256']
helper = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'))
with ZipFile(apk) as archive:
    script = archive.read('assets/warzone/warzone2100.js').decode()
    data = archive.read('assets/warzone/warzone2100.data')
    metadata = helper['package_call'](script)[3]
    entry = next(v for v in metadata['files'] if v['filename'] == VIRTUAL)
    clip = data[entry['start']:entry['end']]
assert clip.startswith(b'OggS') and len(clip) > 100
OUT.parent.mkdir(parents=True, exist_ok=True)
assert not OUT.exists() or OUT.read_bytes() == clip
OUT.write_bytes(clip)
proof = {
    'version':'0.45', 'method':'Exact original VFS byte extraction; no synthesis or audio editing',
    'nativeSound':'ID_SOUND_BUTTON_CLICK_3',
    'nativeMapping':'lib/sound/audio_id.cpp maps BUTTON_CLICK_3 to beep3.ogg; audio/audio.json volume 30',
    'baselineAPK_SHA256':row['sha256'], 'sourceVFS':VIRTUAL,
    'asset':OUT.relative_to(ROOT).as_posix(), 'bytes':len(clip),
    'sha256':sha256(clip).hexdigest(), 'emulatorUsed':False,
    'audioPlaybackVerified':False, 'gameDataModified':False,
    'recordedUTC':datetime.now(timezone.utc).isoformat()
}
(ROOT / 'archive/control-click-0.45.json').write_text(json.dumps(proof, indent=2)+'\n', encoding='utf-8')
print(json.dumps(proof, indent=2))
