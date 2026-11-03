"""Mirror the pinned official music tree and concatenate original bytes for the wrapper.

Run on the VPS; the Android app downloads only the resulting VPS-hosted data.
No tracks, album metadata, covers or notices are converted or edited.
"""
from pathlib import Path
from hashlib import sha1, sha256
from concurrent.futures import ThreadPoolExecutor
import argparse, json, urllib.request, urllib.parse

COMMIT = 'db73d2b2e58dfaa8a09ab27ad771cc636be31118'
REPOSITORY = 'Warzone2100/data-music-opus'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tree', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    tree = json.loads(args.tree.read_text(encoding='utf-8-sig'))
    files = sorted((f for f in tree['tree'] if f['type'] == 'blob'), key=lambda f:f['path'])
    args.output.mkdir(parents=True, exist_ok=True)
    originals = args.output / 'originals'
    def download(entry):
        relative = Path(entry['path'])
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Invalid upstream path')
        target = originals / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        expected = entry['sha']
        def valid(payload):
            return len(payload) == entry['size'] and sha1(b'blob '+str(len(payload)).encode()+b'\0'+payload).hexdigest() == expected
        payload = target.read_bytes() if target.is_file() else b''
        if not valid(payload):
            url = 'https://raw.githubusercontent.com/'+REPOSITORY+'/'+COMMIT+'/'+urllib.parse.quote(entry['path'])
            with urllib.request.urlopen(url, timeout=60) as response:
                payload = response.read()
            if not valid(payload):
                raise ValueError('Official Git blob mismatch: '+entry['path'])
            target.write_bytes(payload)
        return entry, payload
    with ThreadPoolExecutor(max_workers=4) as executor:
        downloaded = list(executor.map(download, files))
    entries, albums, offset = [], [], 0
    data = args.output / 'music.data'
    with data.open('wb') as output:
        for entry, payload in downloaded:
            output.write(payload)
            entries.append({'filename':'/data/music/'+entry['path'], 'start':offset,
                'end':offset+len(payload), 'sha256':sha256(payload).hexdigest()})
            offset += len(payload)
            if entry['path'].endswith('/album.json'):
                album = json.loads(payload)
                albums.append({'title':album['title'], 'author':album['author'],
                    'tracks':len(album['tracks']), 'path':entry['path']})
    digest = sha256(data.read_bytes()).hexdigest()
    manifest = {'schemaVersion':1, 'packageId':'warzone-towers-official-music',
        'version':1, 'archive':'music.data', 'archiveBytes':offset, 'archiveSha256':digest,
        'url':'https://krishna.org.uk/game/music/official-v1/music.data',
        'source':'https://github.com/'+REPOSITORY, 'sourceCommit':COMMIT,
        'albums':albums, 'menuTracks':1, 'files':entries}
    (args.output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
    for name in ['COPYING','COPYING.NONGPL','COPYING.README','README.md']:
        (args.output/name).write_bytes((originals/name).read_bytes())
    print(json.dumps({'bytes':offset,'sha256':digest,'files':len(entries),'albums':albums}))

if __name__ == '__main__':
    main()
