"""Derive playback policies from the already bundled, immutable official albums.

No network, native build, soundtrack conversion, or VPS operations.
"""
from pathlib import Path
import hashlib
import json
import tarfile

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'app/src/main/assets/warzone'
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    return h.hexdigest()
def main():
    manifest=json.loads((ROOT/'vendor/music/official-v1/manifest.json').read_text())
    data=ASSETS/'music/music.data';assert data.stat().st_size==manifest['archiveBytes'] and digest(data)==manifest['archiveSha256']
    path=ASSETS/'music-catalog.js';text=path.read_text();catalog=json.loads(text[text.index('{'):text.rindex('}')+1])
    assert catalog['bytes']==manifest['archiveBytes'] and catalog['sha256']==manifest['archiveSha256'] and len(catalog['trackIds'])==39
    campaign=[];albums=[];all_ids=[]
    with data.open('rb') as stream:
        for album in manifest['albums']:
            entry=next(e for e in manifest['files'] if e['filename']=='/data/music/'+album['path'])
            stream.seek(entry['start']);raw=stream.read(entry['end']-entry['start']);assert hashlib.sha256(raw).hexdigest()==entry['sha256']
            value=json.loads(raw);prefix=Path(album['path']).parent.as_posix().removeprefix('albums/')
            ids=[prefix+'/'+track['filename'] for track in value['tracks']];all_ids+=ids
            campaign += [prefix+'/'+track['filename'] for track in value['tracks'] if 'campaign' in track['default_music_modes']]
            albums.append(dict(path=entry['filename'],sha256=entry['sha256'],tracks=[dict(id=prefix+'/'+track['filename'],defaultMusicModes=track['default_music_modes'],baseVolume=track['base_volume']) for track in value['tracks']]))
    assert all_ids==catalog['trackIds'] and campaign==['original_soundtrack/track1.opus','original_soundtrack/track2.opus','original_soundtrack/track3.opus']
    catalog['playlists']={'ffa':{'selection':'shuffle','tracks':all_ids},'campaign':{'selection':'random-start-sequential','tracks':campaign}}
    native=[]
    with tarfile.open(ROOT/'archive/native-blueprint-4.7.0-source.tar.gz','r:gz') as archive:
        for name in ['source/lib/sound/playlist.cpp','source/lib/sound/cdaudio.cpp','source/src/init.cpp','source/src/main.cpp','source/src/seqdisp.cpp','source/src/loop.cpp','source/src/levels.cpp','source/src/mission.cpp','source/src/hci.h']:
            raw=archive.extractfile(name).read();native.append(dict(archive='archive/native-blueprint-4.7.0-source.tar.gz',member=name,sha256=hashlib.sha256(raw).hexdigest()))
        header=archive.extractfile('source/src/hci.h').read().decode()
        import re
        enum=header.split('enum INTMODE',1)[1].split('{',1)[1].split('}',1)[0]
        names=[part.strip() for part in re.sub(r'//[^\n]*','',enum).split(',') if part.strip()]
        result_mode=names.index('INT_MISSIONRES');assert result_mode==12
        catalog['playlists']['campaign']['nativeMissionResultsMode']=result_mode
    path.write_text(text[:text.index('window.WarzoneMusicCatalog=')]+'window.WarzoneMusicCatalog='+json.dumps(catalog,separators=(',',':'))+';\n')
    proof=dict(version='0.66',passed=True,researchOnly=True,runtimeVerified=False,noNativeBuild=True,noVPSChanges=True,
        originalSoundtrack=dict(path=data.relative_to(ROOT).as_posix(),bytes=data.stat().st_size,sha256=digest(data)),
        sourceRepository=manifest['source'],sourceCommit=manifest['sourceCommit'],albums=albums,nativeSources=native,
        playlists=catalog['playlists'],campaignScope='In-game music; the separate native frontend/menu cue is not an album mission assignment.',
        ruleEvidence=[dict(member='source/lib/sound/playlist.cpp',lines='362-380, 478-494, 573-635',rule='Mode filtering; album defaults; sequential next and randomized start.'),dict(member='source/lib/sound/cdaudio.cpp',lines='223-295',rule='In-game starts randomize; completion requests the next matching song.'),dict(member='source/src/init.cpp',lines='1686, 1797-1798',rule='stageThreeInitialise starts/randomizes in-game music.'),dict(member='source/src/levels.cpp',lines='1286-1302',rule='Mission/save script loading is followed by stageThreeInitialise.'),dict(member='source/src/seqdisp.cpp',lines='575-579',rule='Video entry pauses music.'),dict(member='source/src/loop.cpp',lines='812-815',rule='Video exit resumes music.'),dict(member='source/src/mission.cpp',lines='2324-2335',rule='Native results use the separate frontend/menu cue.')],
        rules=['Campaign mode uses album default_music_modes, not a per-mission or Alpha/Beta/Gamma track table.','Native in-game start randomizes a matching song, then track completion advances to the next matching song.','Native video playback pauses music and resumes it afterward.','FFA explicitly shuffles all39 bundled album tracks; Towers keeps its existing46 map assignments and one-track loops.'],
        officialSources=['https://github.com/Warzone2100/warzone2100/blob/4.7.0/lib/sound/playlist.cpp','https://github.com/Warzone2100/warzone2100/blob/4.7.0/lib/sound/cdaudio.cpp','https://github.com/Warzone2100/warzone2100/blob/4.7.0/src/seqdisp.cpp','https://github.com/Warzone2100/data-music-opus/tree/'+manifest['sourceCommit']],
        output=dict(path=path.relative_to(ROOT).as_posix(),sha256=digest(path)))
    (ROOT/'archive/music-0.66-source-review.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(dict(passed=True,ffaTracks=len(all_ids),campaignTracks=len(campaign),soundtrackSHA256=digest(data))))
if __name__=='__main__':main()
