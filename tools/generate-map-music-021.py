"""Record stable map soundtrack assignments using the existing verified albums.

Titles, album names and landscape themes inform these associations. This does
not claim that audio was auditioned or playback was tested. No audio bytes,
map files or downloaded-pack metadata are changed.
"""
from pathlib import Path
from collections import Counter
import json

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'app/src/main/assets/warzone'

# Real track titles from music-tracks.json. Keep assignments explicit so adding
# a future level cannot silently shuffle any existing map's soundtrack.
ASSIGNMENTS={
    'beginner':'Track 1', 'td1':'My Kind of Wasteland', 'td2':'Advanced Manufacturing',
    'easy01':'Moonlight Tactics', 'easy02':'Scavengers', 'easy03':'Recovery Ops',
    'easy04':'Aftershocks', 'easy05':'Outgrowth', 'easy06':'Foundation',
    'easy07':'Mechanization', 'easy08':'Reminiscence', 'easy09':'Nordeast',
    'easy10':'Incoming Transmission', 'easy11':'New Dawn', 'easy12':'Uncertain Future',
    'easy13':'Menu Theme - Enhanced', 'easy14':'Track 2', 'easy15':'The Project',
    'medium01':'Nuclear Heartbeat', 'medium02':'Shifting Realities',
    'medium03':'Undisclosed Location', 'medium04':'Awakened', 'medium05':'Rainout',
    'medium06':'Unexpected Outcome', 'medium07':'Eviction', 'medium08':'Blast Zone',
    'medium09':'Broken Dreams', 'medium10':'Track 3', 'medium11':'Artifact Beacon',
    'medium12':'Reclamation', 'medium13':'Geiger Ghosts', 'medium14':'Track 3 - Enhanced',
    'medium15':'The Collective',
    'hard01':'Conviction', 'hard02':'Coup de Grace', 'hard03':'The Collapse',
    'hard04':'Just Rewards', 'hard05':'No Way Out', 'hard06':'Launch Codes',
    'hard07':'Nordeast', 'hard08':'Shifting Realities', 'hard09':'Aftershocks',
    'hard10':'The Collective', 'hard11':'Nuclear Heartbeat',
    'hard12':'Undisclosed Location', 'hard13':'Launch Codes',
}


def main():
    levels=json.loads((ASSETS/'levels/catalog.json').read_text(encoding='utf-8'))['levels']
    albums=json.loads((ASSETS/'music-tracks.json').read_text(encoding='utf-8'))['albums']
    tracks={track['title']:dict(track,album=album['title']) for album in albums for track in album['tracks']}
    assert len(ASSIGNMENTS)==46 and set(ASSIGNMENTS)=={level['id'] for level in levels}, 'Map assignment inventory differs'
    assert set(ASSIGNMENTS.values())<=set(tracks), 'Assigned title missing from real albums'
    maps={key:tracks[title]['id'] for key,title in ASSIGNMENTS.items()}
    assert len(set(maps.values()))==39, 'Expected all39 existing tracks to be represented'
    (ASSETS/'map-music.json').write_text(json.dumps({'schemaVersion':1,'maps':maps},indent=2)+'\n',encoding='utf-8')
    report={'schemaVersion':1,'scope':'Stable soundtrack assignment only; no playback audition, emulator or gameplay check.',
        'mapCount':46,'distinctTracks':39,'trackUseCounts':dict(Counter(maps.values())),
        'assignments':[dict(mapId=level['id'],mapName=level['name'],trackId=maps[level['id']],
            title=ASSIGNMENTS[level['id']],author=tracks[ASSIGNMENTS[level['id']]]['author'],album=tracks[ASSIGNMENTS[level['id']]]['album']) for level in levels],
        'audioBytesChanged':False,'mapDataChanged':False,'emulatorUsed':False,'playbackVerified':False}
    (ROOT/'archive/map-music-0.21-assignments.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'maps':46,'existingTracks':39,'allAssignmentsValid':True,'audioChanged':False}))


if __name__=='__main__': main()
