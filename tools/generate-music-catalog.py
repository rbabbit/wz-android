"""Generate the tiny bundled offset table; audio stays on the VPS."""
from pathlib import Path
import json

root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'vendor/music/official-v1/manifest.json').read_text(encoding='utf8'))
catalog={'bytes':manifest['archiveBytes'],'sha256':manifest['archiveSha256'],
         'albums':manifest['albums'],'files':manifest['files']}
(root/'app/src/main/assets/warzone/music-catalog.js').write_text(
    '// Generated from vendor/music/official-v1/manifest.json; original files are unchanged.\n'
    +'window.WarzoneMusicCatalog='+json.dumps(catalog,separators=(',',':'))+';\n',encoding='utf8')
print('Recorded',len(catalog['files']),'original music files; no audio embedded')
