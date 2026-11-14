"""Route only Towers unit-loss console text to a typed mobile notice."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import argparse, difflib, json, os, shutil, subprocess, time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'archive/native-unit-loss-0.52'

def digest(path): return sha256(path.read_bytes()).hexdigest()
def write(path, value): path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8', newline='\n')

HELPER = r'''
#if defined(__EMSCRIPTEN__)
#include <nlohmann/json.hpp>

// Only the custom Towers UI consumes this notice. Campaign, Duel and ordinary
// native builds retain their stock console notice, score and loss sound.
static bool towersUnitLossNoticeEnabled()
{
    FILE *file = fopen("/tmp/warzone-towers-ui-v34", "rb");
    if (!file) return false;
    const bool enabled = fgetc(file) == '1';
    fclose(file);
    return enabled;
}

static void towersUnitLossNotice(const DROID *droid)
{
    const nlohmann::json notice = {
        {"kind", "unit-lost"}, {"id", droid->id}, {"name", droid->aName},
        {"constructor", droid->droidType == DROID_CONSTRUCT || droid->droidType == DROID_CYBORG_CONSTRUCT},
        {"player", droid->player}, {"gameTime", gameTime}
    };
    const std::string packet = notice.dump(-1, ' ', false, nlohmann::json::error_handler_t::replace);
    fprintf(stderr, "BNNOTICE:%s\n", packet.c_str());
}
#endif

'''

CALLER = '''#if defined(__EMSCRIPTEN__)
\t\t\tif (towersUnitLossNoticeEnabled()) towersUnitLossNotice(psDroid);
\t\t\telse
#endif
\t\t\t{
\t\t\t\t// TRANSLATORS: Refers to the loss of a single unit, known by its name
\t\t\t\tCONPRINTF(_("%s Lost!"), objInfo(psDroid));
\t\t\t}'''

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--cache', type=Path, required=True); parser.add_argument('--raw-out', type=Path, required=True)
    args=parser.parse_args(); assert os.name != 'nt'
    cache=args.cache.resolve(); source=cache/'source'; build=cache/'build'; OUT.mkdir(parents=True, exist_ok=True)
    previous_path=ROOT/'archive/native-campaign-0.51/selection-native-build.json'
    previous=json.loads(previous_path.read_text())
    for row in previous['raw']: assert digest(build/'src'/row['file']) == row['sha256'], 'Native cache output lineage mismatch'
    for name, frozen in [('quickjs_backend.cpp','selection-quickjs_backend.cpp'),('hci.cpp','intel-hci.cpp'),('radar.cpp','radar-radar.cpp'),('main.cpp','main.cpp')]:
        assert (source/'src'/name).read_bytes() == (ROOT/'archive/native-campaign-0.51'/frozen).read_bytes(), name+' source lineage mismatch'
    path=source/'src/droid.cpp'; original=path.read_bytes()
    stock=subprocess.check_output(['git','-C',str(source),'show','HEAD:src/droid.cpp'])
    assert original == stock, 'droid.cpp must be original source before this patch'
    text=original.decode(); anchor='#define DEFAULT_RECOIL_TIME'; assert text.count(anchor)==1
    text=text.replace(anchor, HELPER+anchor, 1)
    old='\t\t\t// TRANSLATORS:\tRefers to the loss of a single unit, known by its name\n\t\t\tCONPRINTF(_("%s Lost!"), objInfo(psDroid));'
    assert text.count(old)==1; text=text.replace(old,CALLER,1); updated=text.encode()
    assert text.count('towersUnitLossNotice(psDroid);')==1
    assert text.count('scoreUpdateVar(WD_UNITS_LOST);')==original.decode().count('scoreUpdateVar(WD_UNITS_LOST);')
    assert text.count('audio_QueueTrackMinDelayPos(ID_SOUND_UNIT_DESTROYED, UNIT_LOST_DELAY,')==original.decode().count('audio_QueueTrackMinDelayPos(ID_SOUND_UNIT_DESTROYED, UNIT_LOST_DELAY,')
    (OUT/'original-droid.cpp').write_bytes(original); (OUT/'droid.cpp').write_bytes(updated)
    patch=''.join(difflib.unified_diff(original.decode().splitlines(True),text.splitlines(True),fromfile='a/src/droid.cpp',tofile='b/src/droid.cpp'))
    (OUT/'native-unit-loss.patch').write_text(patch,encoding='utf-8',newline='\n')
    target='src/CMakeFiles/warzone2100.dir/droid.cpp.o'
    commands=[subprocess.check_output(['ninja','-C',str(build),'-t','commands',name],text=True).splitlines()[-1] for name in [target,'warzone2100']]
    objects={str(p.relative_to(build)):digest(p) for folder in ['src','lib'] for p in (build/folder).rglob('*.o')}
    campaign={p.name:digest(p) for p in (ROOT/'app/src/main/assets/warzone').iterdir() if 'campaign' in p.name and p.is_file()}
    index=(ROOT/'app/src/main/assets/warzone/index.html').read_text(); duel=(ROOT/'app/src/main/assets/warzone/index-duel.html').read_text()
    assert "writeFile('/tmp/warzone-towers-ui-v34', '1')" in index
    assert '/tmp/warzone-towers-ui-v34' not in duel
    proof={'version':'0.52','guardPassed':True,'previousNativeBuildSHA256':digest(previous_path),'sourceCommit':subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip(),'sourceBeforeSHA256':sha256(original).hexdigest(),'sourceAfterSHA256':sha256(updated).hexdigest(),'commands':commands,'preBuildObjects':objects,'campaignFilesBefore':campaign,'recipeSHA256':digest(Path(__file__))}
    write(OUT/'source-overlay.json',proof); path.write_bytes(updated)
    log=OUT/'native-build.log'; started=time.monotonic()
    with log.open('w') as stream:
        for index, command in enumerate(commands):
            stream.write('\n[step '+str(index)+']\n'+command+'\n'); stream.flush()
            subprocess.run(['bash','-c','source "$1/emsdk/emsdk_env.sh" >/dev/null 2>&1 && cd "$1/build" && eval "$2"','unit-loss052',str(cache),command],stdout=stream,stderr=subprocess.STDOUT,check=True,timeout=180)
    after={str(p.relative_to(build)):digest(p) for folder in ['src','lib'] for p in (build/folder).rglob('*.o')}
    changed=sorted(name for name in objects if objects[name]!=after[name]); assert changed==[target], changed
    assert campaign=={p.name:digest(p) for p in (ROOT/'app/src/main/assets/warzone').iterdir() if 'campaign' in p.name and p.is_file()}
    args.raw_out.mkdir(parents=True,exist_ok=True)
    result={'version':'0.52','passed':True,'compiledObjects':[target],'changedObjects':changed,'otherObjectsUnchanged':len(objects)-1,'executableLinks':1,'nativeFullFreshBuildPerformed':False,'campaignFilesUnchanged':True,'sourceOverlaySHA256':digest(OUT/'source-overlay.json'),'logSHA256':digest(log),'elapsedSeconds':round(time.monotonic()-started,3),'recordedUTC':datetime.now(timezone.utc).isoformat(),'raw':[]}
    for name in ['warzone2100.js','warzone2100.wasm']:
        dest=args.raw_out/name; shutil.copy2(build/'src'/name,dest); result['raw'].append({'file':name,'bytes':dest.stat().st_size,'sha256':digest(dest)})
    write(OUT/'native-build.json',result); print(json.dumps(result))

if __name__=='__main__': main()
