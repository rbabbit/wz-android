"""Generate the tiny bundled offset table; audio stays on the VPS."""
from pathlib import Path
import json, argparse, hashlib

root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'vendor/music/official-v1/manifest.json').read_text(encoding='utf8'))
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pack',type=Path,required=True,help='Verified original music.data, used only to read album metadata')
args=parser.parse_args()
pack=args.pack.read_bytes()
assert hashlib.sha256(pack).hexdigest()==manifest['archiveSha256']
albums=[]
for album in manifest['albums']:
    entry=next(e for e in manifest['files'] if e['filename']=='/data/music/'+album['path'])
    data=json.loads(pack[entry['start']:entry['end']])
    album_id=Path(album['path']).parent.name
    albums.append({'id':album_id,'title':data['title'],'author':data['author'],
        'tracks':[{'id':album_id+'/'+t['filename'],'title':t['title'],'author':t['author']} for t in data['tracks']]})
assert sum(len(a['tracks']) for a in albums)==39
(root/'app/src/main/assets/warzone/music-tracks.json').write_text(json.dumps({'albums':albums},indent=2)+'\n',encoding='utf8')
catalog={'bytes':manifest['archiveBytes'],'sha256':manifest['archiveSha256'],
         'albums':manifest['albums'],'files':manifest['files'],
         'trackIds':[t['id'] for a in albums for t in a['tracks']]}
(root/'app/src/main/assets/warzone/music-catalog.js').write_text(
    '// Generated from vendor/music/official-v1/manifest.json; original files are unchanged.\n'
    +'window.WarzoneMusicCatalog='+json.dumps(catalog,separators=(',',':'))+';\n',encoding='utf8')
print('Recorded',len(catalog['files']),'original music files; no audio embedded')
