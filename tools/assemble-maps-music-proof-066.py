"""Join existing observed exact-APK results; does not create pass claims or operate a device."""
from pathlib import Path
from datetime import datetime, timezone
import argparse, hashlib, json

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/maps-music-066'
MAPS=('emag','contact','templar-ffa','rb-simple','rb-usefull','emaj-6p')

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--expected-sha256',required=True);a=p.parse_args();expected=a.expected_sha256
    assert len(expected)==64
    checks=[];results={}
    def read(name, native=True):
        path=QA/(expected[:8]+'-'+name+'.json');data=json.loads(path.read_text())
        assert data.get('passed') is True and data.get('candidateAPK_SHA256')==expected and data.get('runtimeErrors',[])==[],name
        assert not data.get('preflight') and not data.get('preflightOnly'),name
        if native: assert data.get('actualNativeEngineExecuted') is True,name
        checks.append(dict(name=name,passed=True,evidence=path.relative_to(ROOT).as_posix(),sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
        results[name]=data;return data
    for map_id in MAPS:
        data=read('map-'+map_id);assert data['progress'] is not None
        if map_id in ('rb-simple','emaj-6p'):assert data['saveReload']['allAIContextsPreserved']
        if map_id=='emaj-6p':assert data['controls']['noWorldGrants']
    tower=read('music-towers');campaign=read('music-campaign');ffa=read('music-ffa')
    for data in (tower,campaign,ffa):
        assert data['panel']['pcm']['decodedPCMNonZero'] and data['speakerOutputMonitored'] is False
        assert data['playing']['nativeConfig']['musicEnabled'] in ('0','false')
    assert tower['persistentToggleAfter']['media']['music']['enabled'] is False
    assert campaign['ready']['music']['enabled'] is False and ffa['ready']['music']['enabled'] is True
    assert campaign['video']['ordinaryNativeVideoReplay']
    for data in (campaign,ffa): assert data['advance']['pcm']['decodedPCMNonZero']
    read('legacy-saves');read('compact-ui');restore=read('restoration',False)
    assert len(restore['allOriginalPhoneSavesUnchanged'])==24 and all(x['restored'] for x in restore['walletAndPreferencesRestored'])
    result=dict(version='0.66',passed=True,candidateAPK_SHA256=expected,device='emulator-5558',emulatorUsed=True,actualNativeEngineExecuted=True,runtimeErrors=[],checks=checks,
        scope='Six authored native maps and independent bots, six-player and neutral-map phone saves, legacy saves, ordinary manufacturing/research, bundled music decoder and lifecycle, compact new Guide image/header/input, original wallet/profile/saves restoration.',
        speakerOutputMonitored=False,mediaFixtureDisclosure='Near-end HTMLMediaElement seeks shorten actual trusted media completions; no ended events or decoded samples are synthesized.',
        fixtureFailuresPreserved=['3535 FFA preloader missing directories','Derived EM_PRELOAD_CACHE hybrid after failed preloader; only cache removed','3535/512b natural media pause-before-ended bug','512b Contact native generator cap dropped authored objects','Host emulator exit after successful Contact Return; same AVD restarted'],
        earlierEvidence=[dict(path=p.relative_to(ROOT).as_posix(),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size) for p in sorted(QA.glob('*.json')) if '-failed-' in p.name or p.name in {'3535489f-campaign-native-logcat.json','3535489f-templar-native-logcat.json','3535489f-preload-cache-before.json','3535489f-preload-cache-recovery.json','3535489f-music-campaign-failed-1794528281916.json','512b3036-contact-native-logcat.json','guide-ffa-setup-066-provenance.json','e231ce35-emulator-host-exit.json','e231ce35-emulator-host-recovery.json'}],
        finishedAt=datetime.now(timezone.utc).isoformat())
    out=QA/'verify-maps-music-066.json';out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(passed=True,checks=len(checks),path=out.relative_to(ROOT).as_posix())))

if __name__=='__main__':main()
