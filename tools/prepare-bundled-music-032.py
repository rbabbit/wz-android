"""Copy the exact existing official soundtrack into APK assets after full verification.

This reads the owner's already verified local music pack; it downloads nothing
and does not change the VPS or the frozen original music metadata/licenses.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / 'app/src/main/assets/warzone/music/music.data'
EXPECTED_BYTES = 114_721_578
EXPECTED_SHA = '602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT.parent / 'Warzone-Towers-Music-v1/music.data')
    args = parser.parse_args()
    vendor = ROOT / 'vendor/music/official-v1'
    manifest = json.loads((vendor / 'manifest.json').read_text(encoding='utf-8'))
    source = args.source.resolve()
    assert source.is_file() and source.stat().st_size == EXPECTED_BYTES
    assert digest(source) == manifest['archiveSha256'] == EXPECTED_SHA
    assert manifest['archiveBytes'] == EXPECTED_BYTES
    script = (ROOT / 'app/src/main/assets/warzone/music-catalog.js').read_text(encoding='utf-8')
    catalog = json.loads(script[script.index('{'):script.rindex('}') + 1])
    assert catalog['files'] == manifest['files'] and catalog['bytes'] == EXPECTED_BYTES
    assert catalog['sha256'] == EXPECTED_SHA
    tracks = json.loads((ROOT / 'app/src/main/assets/warzone/music-tracks.json').read_text(encoding='utf-8'))
    track_ids = {track['id'] for album in tracks['albums'] for track in album['tracks']}
    assert track_ids == set(catalog['trackIds']) and len(track_ids) == 39
    mapping = json.loads((ROOT / 'app/src/main/assets/warzone/map-music.json').read_text(encoding='utf-8'))['maps']
    assert len(mapping) == 46 and set(mapping.values()) <= track_ids
    files, opus, end = [], 0, 0
    with source.open('rb') as stream:
        for entry in manifest['files']:
            assert entry['filename'].startswith('/data/music/') and '..' not in entry['filename'].split('/')
            assert entry['start'] == end and entry['end'] >= end
            length = entry['end'] - entry['start']
            data = stream.read(length)
            assert len(data) == length and hashlib.sha256(data).hexdigest() == entry['sha256']
            if entry['filename'].endswith('.opus'):
                assert data[:4] == b'OggS' and b'OpusHead' in data[:64]
                opus += 1
            end = entry['end']; files.append(entry)
        assert stream.read(1) == b'' and end == EXPECTED_BYTES and len(files) == 55 and opus == 40
    ASSET.parent.mkdir(parents=True, exist_ok=True)
    if ASSET.exists():
        assert digest(ASSET) == EXPECTED_SHA, 'Existing bundled asset differs; inspect before replacing'
    else:
        shutil.copyfile(source, ASSET)
    assert ASSET.stat().st_size == EXPECTED_BYTES and digest(ASSET) == EXPECTED_SHA
    for name in ('COPYING', 'COPYING.NONGPL', 'COPYING.README', 'README.md'):
        shutil.copyfile(vendor / name, ASSET.parent / name)
        assert digest(vendor / name) == digest(ASSET.parent / name)
    notice = (
        'Warzone Towers bundled soundtrack\n\n'
        'Original Warzone 2100 Opus music is included unchanged.\n'
        'Source: https://github.com/Warzone2100/data-music-opus\n'
        'Pinned source commit: db73d2b2e58dfaa8a09ab27ad771cc636be31118\n\n'
        'Albums: Warzone 2100 OST (Martin Severn); Legacy, Aftermath and\n'
        'Reclamation Soundtracks (LupusMechanicus). The menu theme, original\n'
        'album metadata/covers and all 55 original files are preserved.\n\n'
        'See COPYING, COPYING.NONGPL, COPYING.README and README.md alongside\n'
        'this notice, and the original copies within music.data.\n'
        'The complete application source also retains vendor/music/official-v1\n'
        'metadata, original notices, per-file hashes and provenance.\n\n'
        'APK asset: warzone/music/music.data\n'
        'Bytes: 114721578\n'
        'SHA-256: ' + EXPECTED_SHA + '\n'
    )
    (ASSET.parent / 'NOTICE.txt').write_text(notice, encoding='utf-8', newline='\n')
    added = [ASSET] + [ASSET.parent / name for name in ('COPYING', 'COPYING.NONGPL', 'COPYING.README', 'README.md', 'NOTICE.txt')]
    report = {'version': '0.32', 'passed': True, 'emulatorUsed': False,
        'scope': 'Exact archive/file/track metadata and retained-license checks only; not Android playback.',
        'archiveBytes': EXPECTED_BYTES, 'archiveSHA256': EXPECTED_SHA,
        'sourcePinnedCommit': manifest['sourceCommit'], 'originalFileHashesMatched': len(files),
        'originalOpusFilesMatched': opus, 'albumTrackIds': len(track_ids),
        'mapAssignmentsPreserved': len(mapping), 'musicEncodingChanged': False,
        'firstLaunchExtractionRequired': False, 'musicNetworkDownloadRequired': False,
        'bundledAssets': [{'path': p.relative_to(ROOT).as_posix(), 'bytes': p.stat().st_size, 'sha256': digest(p)} for p in added],
        'sources': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': digest(p)} for p in (
            Path(__file__), vendor / 'manifest.json', ROOT / 'app/src/main/assets/warzone/music-catalog.js',
            ROOT / 'app/src/main/assets/warzone/music-tracks.json', ROOT / 'app/src/main/assets/warzone/map-music.json')],
        'originalFiles': files}
    (ROOT / 'archive/bundled-music-0.32.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({key: report[key] for key in ('passed', 'archiveBytes', 'archiveSHA256', 'originalFileHashesMatched', 'originalOpusFilesMatched', 'mapAssignmentsPreserved')}))


if __name__ == '__main__':
    main()
