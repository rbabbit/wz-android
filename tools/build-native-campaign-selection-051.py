"""Make Campaign ALL selection idempotent without touching orders or movement."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime,timezone
import argparse,difflib,json,os,shutil,subprocess,time
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'archive/native-campaign-0.51'
def digest(p):return sha256(p.read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,indent=2)+'\n',encoding='utf-8',newline='\n')
HELPER=r'''
// Preserve a standing combat selection without deselecting/reselecting it on
// every maintenance tick. Match native selCombat and isSelectable predicates;
// emit one normal selection refresh only when the actual set changes.
static unsigned campaignReconcileCombatSelection()
{
    unsigned count = 0;
    bool changed = false;
    for (DROID *droid : apsDroidLists[selectedPlayer])
    {
        const bool eligible = droid->asWeaps[0].nStat > 0 && !droid->isTransporter() && isSelectable(droid);
        if (eligible) ++count;
        if (droid->selected != eligible)
        {
            droid->selected = eligible;
            changed = true;
        }
    }
    if (changed)
    {
        intRefreshScreen();
        triggerEventSelected();
    }
    return count;
}

'''
def main():
    p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--raw-out',type=Path,required=True);a=p.parse_args()
    assert os.name!='nt';cache=a.cache.resolve();build=cache/'build'
    previous=json.loads((OUT/'intel-native-build.json').read_text())
    for row in previous['raw']:assert digest(build/'src'/row['file'])==row['sha256']
    path=cache/'source/src/quickjs_backend.cpp';original=path.read_bytes();assert original==(OUT/'quickjs_backend.cpp').read_bytes()
    source=original.decode();needle='static JSValue campaignSelectCombatJS(JSContext *ctx, JSValueConst, int, JSValueConst *)'
    assert source.count(needle)==1;source=source.replace(needle,HELPER+needle,1)
    old='const unsigned count = selDroidSelection(selectedPlayer,DS_BY_TYPE,DST_ALL_COMBAT,false);'
    assert source.count(old)==1;source=source.replace(old,'const unsigned count = campaignReconcileCombatSelection();',1)
    updated=source.encode();(OUT/'selection-original-quickjs_backend.cpp').write_bytes(original);(OUT/'selection-quickjs_backend.cpp').write_bytes(updated)
    patch=''.join(difflib.unified_diff(original.decode().splitlines(True),source.splitlines(True),fromfile='a/src/quickjs_backend.cpp',tofile='b/src/quickjs_backend.cpp'))
    (OUT/'native-campaign-selection.patch').write_text(patch,encoding='utf-8',newline='\n')
    target='src/CMakeFiles/warzone2100.dir/quickjs_backend.cpp.o'
    commands=[subprocess.check_output(['ninja','-C',str(build),'-t','commands',n],text=True).splitlines()[-1] for n in [target,'warzone2100']]
    objects={str(q.relative_to(build)):digest(q) for folder in ['src','lib'] for q in (build/folder).rglob('*.o')}
    proof={'version':'0.51','guardPassed':True,'previousBuildSHA256':digest(OUT/'intel-native-build.json'),'sourceBeforeSHA256':sha256(original).hexdigest(),'sourceAfterSHA256':sha256(updated).hexdigest(),'preBuildObjects':objects,'commands':commands,'recipeSHA256':digest(Path(__file__))}
    write(OUT/'selection-source-overlay.json',proof);path.write_bytes(updated)
    log=OUT/'selection-native-build.log';started=time.monotonic()
    with log.open('w') as stream:
        for i,c in enumerate(commands):
            stream.write('\n[step '+str(i)+']\n'+c+'\n');stream.flush()
            subprocess.run(['bash','-c','source "$1/emsdk/emsdk_env.sh" >/dev/null 2>&1 && cd "$1/build" && eval "$2"','campaign-selection051',str(cache),c],stdout=stream,stderr=subprocess.STDOUT,check=True,timeout=180)
    after={str(q.relative_to(build)):digest(q) for folder in ['src','lib'] for q in (build/folder).rglob('*.o')}
    changed=sorted(n for n in objects if objects[n]!=after[n]);assert changed==[target]
    a.raw_out.mkdir(parents=True,exist_ok=True)
    result={'version':'0.51','passed':True,'compiledObjects':[target],'changedObjects':changed,'otherObjectsUnchanged':len(objects)-1,'executableLinks':1,'nativeFullFreshBuildPerformed':False,'sourceOverlaySHA256':digest(OUT/'selection-source-overlay.json'),'logSHA256':digest(log),'elapsedSeconds':round(time.monotonic()-started,3),'recordedUTC':datetime.now(timezone.utc).isoformat(),'raw':[]}
    for name in ['warzone2100.js','warzone2100.wasm']:
        dest=a.raw_out/name;shutil.copy2(build/'src'/name,dest);result['raw'].append({'file':name,'bytes':dest.stat().st_size,'sha256':digest(dest)})
    write(OUT/'selection-native-build.json',result);print(json.dumps(result))
if __name__=='__main__':main()
