"""Publish exact Campaign radar geometry; two guarded objects and one link."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime,timezone
import argparse,difflib,json,os,shutil,subprocess,time
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'archive/native-campaign-0.51'
def digest(p):return sha256(p.read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,indent=2)+'\n',encoding='utf-8',newline='\n')
def rep(s,a,b):assert s.count(a)==1,a;return s.replace(a,b,1)

HELPER=r'''
// Observation only: the separate Campaign host needs the actual scroll-area
// radar, not a rectangle inferred from the full map or widget diagonal.
std::string campaignMobileRadarStateJSON()
{
    const uint16_t inverseAngle = static_cast<uint16_t>(rotateRadar ? -playerPos.r.y : 0);
    const bool visible = !loop_GetVideoStatus() && !gameUpdatePaused()
        && pRadarWidget && pRadarWidget->visible() && radarVisible()
        && radarWidth > 0 && radarHeight > 0;
    return nlohmann::json{{"visible",visible},{"centerX",radarCenterX},{"centerY",radarCenterY},
        {"width",radarWidth},{"height",radarHeight},
        {"rotation",rotateRadar ? playerPos.r.y * (M_PI / 32768.0) : 0.0},
        {"inverseCos",iCos(inverseAngle)/65536.0},{"inverseSin",iSin(inverseAngle)/65536.0},
        {"viewportWidth",pie_GetVideoBufferWidth()},{"viewportHeight",pie_GetVideoBufferHeight()}}.dump();
}

'''

def main():
    p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--raw-out',type=Path,required=True);p.add_argument('--prepare-only',action='store_true');p.add_argument('--resume',action='store_true');a=p.parse_args()
    assert os.name!='nt';cache=a.cache.resolve();build=cache/'build'
    previous=json.loads((OUT/'native-build.json').read_text());overlay=json.loads((OUT/'source-overlay.json').read_text())
    draft=json.loads((OUT/'radar-source-overlay.json').read_text()) if a.resume else None
    current=json.loads((OUT/'radar-native-build.json').read_text()) if a.resume else previous
    for row in current['raw']:assert digest(build/'src'/row['file'])==row['sha256']
    assert digest(cache/'source/src/hci.cpp')==(draft['sources']['hci.cpp']['after'] if draft else overlay['sources']['src/hci.cpp']['after'])
    if draft:assert digest(cache/'source/src/radar.cpp')==draft['sources']['radar.cpp']['after']
    radar=(OUT/'radar-original-radar.cpp').read_bytes() if draft else (cache/'source/src/radar.cpp').read_bytes()
    assert radar==subprocess.check_output(['git','-C',str(cache/'source'),'show','HEAD:src/radar.cpp'])
    originals={'radar.cpp':radar,'hci.cpp':(OUT/'radar-original-hci.cpp').read_bytes() if draft else (cache/'source/src/hci.cpp').read_bytes()}
    sources={}
    for name,data in originals.items():
        s=data.decode()
        if name=='radar.cpp':
            s=rep(s,'#include <cstdlib>','#include <cstdlib>\n#include <nlohmann/json.hpp>')
            s=rep(s,'bool CoordInRadar(int x, int y)\n{',HELPER+'bool CoordInRadar(int x, int y)\n{')
        else:
            s=rep(s,'std::string campaignMobileNativeStateJSON()\n{','extern std::string campaignMobileRadarStateJSON();\nstd::string campaignMobileNativeStateJSON()\n{')
            s=rep(s,'{"worldSafe",playing && !video && !paused && !menu}}.dump();','{"worldSafe",playing && !video && !paused && !menu},\n        {"radar",nlohmann::json::parse(campaignMobileRadarStateJSON())}}.dump();')
        (OUT/('radar-original-'+name)).write_bytes(data);(OUT/('radar-'+name)).write_text(s,encoding='utf-8',newline='\n')
        sources[name]={'before':sha256(data).hexdigest(),'after':digest(OUT/('radar-'+name))}
    patch=''.join(''.join(difflib.unified_diff(originals[name].decode().splitlines(True),(OUT/('radar-'+name)).read_text().splitlines(True),fromfile='a/src/'+name,tofile='b/src/'+name)) for name in originals)
    (OUT/'native-campaign-radar.patch').write_text(patch,encoding='utf-8',newline='\n')
    targets=['src/CMakeFiles/warzone2100.dir/'+name+'.o' for name in originals]
    commands=[subprocess.check_output(['ninja','-C',str(build),'-t','commands',target],text=True).splitlines()[-1] for target in targets+['warzone2100']]
    assert all(' -c ' in c for c in commands[:-1]) and ' -o src/warzone2100.html ' in commands[-1]
    before=draft['preBuildObjects'] if draft else {str(q.relative_to(build)):digest(q) for folder in ['src','lib'] for q in (build/folder).rglob('*.o')}
    proof={'version':'0.51','guardPassed':True,'previousNativeBuildSHA256':digest(OUT/'native-build.json'),'sources':sources,'preBuildObjects':before,'commands':commands,'recipeSHA256':digest(Path(__file__))}
    write(OUT/'radar-source-overlay.json',proof)
    if a.prepare_only:print('radar native source prepared');return
    for name in originals:shutil.copyfile(OUT/('radar-'+name),cache/'source/src'/name)
    log=OUT/'radar-native-build.log';started=time.monotonic()
    with log.open('w') as stream:
        for i,c in enumerate(commands):
            stream.write('\n[step '+str(i)+']\n'+c+'\n');stream.flush()
            subprocess.run(['bash','-c','source "$1/emsdk/emsdk_env.sh" >/dev/null 2>&1 && cd "$1/build" && eval "$2"','campaign-radar051',str(cache),c],stdout=stream,stderr=subprocess.STDOUT,check=True,timeout=180)
    after={str(q.relative_to(build)):digest(q) for folder in ['src','lib'] for q in (build/folder).rglob('*.o')}
    changed=sorted(n for n in before if before[n]!=after[n]);assert changed==sorted(targets),changed
    a.raw_out.mkdir(parents=True,exist_ok=True)
    result={'version':'0.51','passed':True,'scope':'Campaign-only exact radar observation; all native hit testing, geometry and camera behavior unchanged','compiledObjects':targets,'changedObjects':changed,'otherObjectsUnchanged':len(before)-len(changed),'executableLinks':1,'nativeFullFreshBuildPerformed':False,'sourceOverlaySHA256':digest(OUT/'radar-source-overlay.json'),'logSHA256':digest(log),'elapsedSeconds':round(time.monotonic()-started,3),'recordedUTC':datetime.now(timezone.utc).isoformat(),'raw':[]}
    for name in ['warzone2100.js','warzone2100.wasm']:
        dest=a.raw_out/name;shutil.copy2(build/'src'/name,dest);result['raw'].append({'file':name,'bytes':dest.stat().st_size,'sha256':digest(dest)})
    write(OUT/'radar-native-build.json',result);print(json.dumps(result))
if __name__=='__main__':main()
