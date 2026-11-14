"""Guard optional Campaign Intel reticule decoration; one object and one link."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime,timezone
import argparse,difflib,json,os,shutil,subprocess,time
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'archive/native-campaign-0.51'
def digest(p):return sha256(p.read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,indent=2)+'\n',encoding='utf-8',newline='\n')
def main():
    p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--raw-out',type=Path,required=True);a=p.parse_args()
    assert os.name!='nt';cache=a.cache.resolve();build=cache/'build'
    previous=json.loads((OUT/'radar-native-build.json').read_text())
    for row in previous['raw']:assert digest(build/'src'/row['file'])==row['sha256']
    source=cache/'source/src/hci.cpp';original=source.read_bytes();assert original==(OUT/'radar-hci.cpp').read_bytes()
    widget=cache/'source/lib/widget/widget.cpp';widget_original=subprocess.check_output(['git','-C',str(cache/'source'),'show','HEAD:lib/widget/widget.cpp'])
    assert widget.read_bytes()==widget_original
    text=original.decode();start=text.index('void addIntelScreen()\n{');end=text.index('//sets up the Transporter Screen',start)
    before=text[start:end];needle='\twidgSetButtonState(psWScreen, IDRET_INTEL_MAP, WBUT_CLICKLOCK);'
    assert before.count(needle)==1
    after=before.replace(needle,'\t// The Campaign mobile host removes the stock reticule. Intel itself\n\t// remains native; only lock its optional button when that button exists.\n\tif (!campaignMobileEnabled() || widgGetFromID(psWScreen, IDRET_INTEL_MAP) != nullptr)\n\t{\n\t'+needle+'\n\t}',1)
    updated=(text[:start]+after+text[end:]).encode()
    (OUT/'intel-original-hci.cpp').write_bytes(original);(OUT/'intel-hci.cpp').write_bytes(updated)
    patch=''.join(difflib.unified_diff(original.decode().splitlines(True),updated.decode().splitlines(True),fromfile='a/src/hci.cpp',tofile='b/src/hci.cpp'))
    (OUT/'native-campaign-intel.patch').write_text(patch,encoding='utf-8',newline='\n')
    target='src/CMakeFiles/warzone2100.dir/hci.cpp.o'
    commands=[subprocess.check_output(['ninja','-C',str(build),'-t','commands',name],text=True).splitlines()[-1] for name in [target,'warzone2100']]
    assert ' -c ' in commands[0] and ' -o src/warzone2100.html ' in commands[1]
    objects={str(q.relative_to(build)):digest(q) for folder in ['src','lib'] for q in (build/folder).rglob('*.o')}
    proof={'version':'0.51','guardPassed':True,'scope':'Campaign-only optional reticule-button lock inside addIntelScreen; native Intel creation and all other modes unchanged','previousBuildSHA256':digest(OUT/'radar-native-build.json'),'sourceBeforeSHA256':sha256(original).hexdigest(),'sourceAfterSHA256':sha256(updated).hexdigest(),'widgetSourceUnmodified':True,'widgetSourceSHA256':sha256(widget_original).hexdigest(),'preBuildObjects':objects,'commands':commands,'recipeSHA256':digest(Path(__file__))}
    write(OUT/'intel-source-overlay.json',proof);source.write_bytes(updated)
    log=OUT/'intel-native-build.log';started=time.monotonic()
    with log.open('w') as stream:
        for i,c in enumerate(commands):
            stream.write('\n[step '+str(i)+']\n'+c+'\n');stream.flush()
            subprocess.run(['bash','-c','source "$1/emsdk/emsdk_env.sh" >/dev/null 2>&1 && cd "$1/build" && eval "$2"','campaign-intel051',str(cache),c],stdout=stream,stderr=subprocess.STDOUT,check=True,timeout=180)
    after_objects={str(q.relative_to(build)):digest(q) for folder in ['src','lib'] for q in (build/folder).rglob('*.o')}
    changed=sorted(n for n in objects if objects[n]!=after_objects[n]);assert changed==[target],changed
    assert digest(widget)==proof['widgetSourceSHA256']
    a.raw_out.mkdir(parents=True,exist_ok=True)
    result={'version':'0.51','passed':True,'compiledObjects':[target],'changedObjects':changed,'otherObjectsUnchanged':len(objects)-1,'executableLinks':1,'nativeFullFreshBuildPerformed':False,'widgetSourceUnmodified':True,'sourceOverlaySHA256':digest(OUT/'intel-source-overlay.json'),'logSHA256':digest(log),'elapsedSeconds':round(time.monotonic()-started,3),'recordedUTC':datetime.now(timezone.utc).isoformat(),'raw':[]}
    for name in ['warzone2100.js','warzone2100.wasm']:
        dest=a.raw_out/name;shutil.copy2(build/'src'/name,dest);result['raw'].append({'file':name,'bytes':dest.stat().st_size,'sha256':digest(dest)})
    write(OUT/'intel-native-build.json',result);print(json.dumps(result))
if __name__=='__main__':main()
