"""Build three matched0.89 native variants into isolated objects and outputs.

Run under Linux/WSL with the retained warm caches, or use BOOTSTRAP.md first.
No source, object, library or generated output in either cache is modified.
"""
from pathlib import Path
from hashlib import sha256
from concurrent.futures import ThreadPoolExecutor
import argparse, difflib, json, os, re, shlex, shutil, subprocess, time

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'vendor/native-089'
COMMIT='7d3d8e51a61ceee89e6bf672a41337e1a9cd7392'
EXPECTED_WASM={
 'shared':'497c65308d3e85f0b5370ec0ff0eb48e6a0876e735ad45e3b280829c7f3c2a06',
 'towers':'2924f46aa75d9b27b92494f01d56239856ad06b2164cd7131144a3a5faeb87db',
 'multiplayer':'1d050920393ab7be2d7871a8a269e5d5487b567bf9e46457ecb1104553c38d0d'}

FRAME_HELPER=r'''
// BEGIN NORMAL089_READONLY_COMBAT_SELECTION
// Local display observation only: never changes selection, orders or game state.
static void normalMobileCombatSelectionFrame()
{
#if defined(__EMSCRIPTEN__)
    static uint64_t publicationSerial = 0;
    const bool playing = GetGameMode() == GS_NORMAL && gameInitialised
        && selectedPlayer < MAX_PLAYERS && realSelectedPlayer == selectedPlayer
        && !NetPlay.players[selectedPlayer].isSpectator;
    const bool video = loop_GetVideoStatus();
    const bool paused = gamePaused() || gameUpdatePaused();
    const bool menu = InGameOpUp || isInGamePopupUp || bLoadSaveUp
        || intHelpOverlayIsUp() || intMode != INT_NORMAL;
    std::set<uint32_t> combat, selected;
    if (playing) for (const DROID *droid : apsDroidLists[selectedPlayer])
    {
        if (droid->asWeaps[0].nStat > 0 && !droid->isTransporter() && isSelectable(droid)) combat.insert(droid->id);
        if (droid->selected) selected.insert(droid->id);
    }
    auto combatIds = nlohmann::json::array(), selectedIds = nlohmann::json::array();
    for (const auto id : combat) combatIds.push_back(id);
    for (const auto id : selected) selectedIds.push_back(id);
    const auto value = nlohmann::json{{"schemaVersion",89},{"frame",++publicationSerial},
        {"gameTime",gameTime},{"realTime",realTime},{"player",selectedPlayer},
        {"playing",playing},{"worldSafe",playing && !video && !paused && !menu},
        {"combatSelection",{{"player",selectedPlayer},{"combatIds",combatIds},{"selectedIds",selectedIds}}}}.dump();
    FILE *file = fopen("/tmp/warzone-combat-selection-v89.json.tmp", "wb");
    if (!file) return;
    fwrite(value.data(),1,value.size(),file); fclose(file);
    rename("/tmp/warzone-combat-selection-v89.json.tmp","/tmp/warzone-combat-selection-v89.json");
#endif
}
// END NORMAL089_READONLY_COMBAT_SELECTION

'''

def digest(p):
 h=sha256()
 with Path(p).open('rb') as f:
  while b:=f.read(8*1024*1024): h.update(b)
 return h.hexdigest()
def jwrite(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2)+'\n')
def run(argv,**kw):return subprocess.check_output(argv,text=True,**kw).strip()
def write(p,b):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
def patch_health(text):
 start=text.index('static void queueDroidPowerBarsRects(DROID *psDroid, bool drawBox, BatchedMultiRectRenderer& batchedMultiRectRenderer, size_t rectGroup)\n{')
 end=text.index('\nstatic void queueDroidEnemyHealthBarsRects',start)
 block=text[start:end];mark=block.index('\t/* Power bars */\n');begin=mark+len('\t/* Power bars */\n')
 lines=block[begin:].splitlines(True)
 assert len(lines)>=3 and all('batchedMultiRectRenderer.addRect(PIERECT_DrawRequest(psDroid->sDisplay.screenX' in s for s in lines[:3])
 old=''.join(lines[:3]);new='\t// Normal0.89: retain selection corners and all unrelated status.\n\tif (!psDroid->selected)\n\t{\n'+''.join('\t'+s for s in lines[:3])+'\t}\n'
 assert block.count(old)==1
 changed=block.replace(old,new,1)
 assert changed.count('WZCOL_WHITE')==block.count('WZCOL_WHITE')==4
 return text[:start]+changed+text[end:]
def patch_frame(text):
 anchor='void campaignMobileFrame()\n{\n'
 assert text.count(anchor)==1 and 'normalMobileCombatSelectionFrame' not in text
 return text.replace(anchor,FRAME_HELPER+anchor+'    normalMobileCombatSelectionFrame();\n',1)
def frozen(cache):
 paths=set()
 for folder in ['src','lib','3rdparty']:
  for pat in ['*.o','*.a']:paths.update((cache/'build'/folder).rglob(pat))
 for n in ['build/build.ninja','build/CMakeCache.txt','build/src/warzone2100.js','build/src/warzone2100.wasm','build/src/warzone2100.data','build/src/extern-postjs.js']:
  if (cache/n).is_file():paths.add(cache/n)
 for p in (cache/'source/src').rglob('*.cpp'):paths.add(p)
 for p in (cache/'source/lib').rglob('*.cpp'):paths.add(p)
 return {str(p.relative_to(cache)):digest(p) for p in sorted(paths)}
def target(source):return 'src/CMakeFiles/warzone2100.dir/'+Path(source).name+'.o'
def compile_command(cache,source,patched,object_path):
 original=run(['ninja','-C',str(cache/'build'),'-t','commands',target(source)]).splitlines()[-1]
 tokens=shlex.split(original);old_source=str(cache/'source'/source)
 for flag,value in [('-o',str(object_path)),('-MF',str(object_path)+'.d'),('-MT',str(object_path)),('-c',str(patched))]:
  index=tokens.index(flag);tokens[index+1]=value
 assert old_source not in tokens and tokens.count(str(patched))==1
 tokens[1:1]=['-iquote',str((cache/'source'/source).parent)]
 return original,tokens
def environment(cache):
 raw=subprocess.check_output(['bash','-c','source "$1/emsdk/emsdk_env.sh" >/dev/null 2>&1 && env -0','native089',str(cache)])
 return dict(part.decode().split('=',1) for part in raw.split(b'\0') if b'=' in part)
def execute(tokens,cache,env,log):
 started=time.monotonic();log.parent.mkdir(parents=True,exist_ok=True)
 with log.open('w') as f:subprocess.run(tokens,cwd=cache/'build',env=env,stdout=f,stderr=subprocess.STDOUT,check=True,timeout=240)
 return round(time.monotonic()-started,3)
def link_command(cache,replacements,output):
 original=run(['ninja','-C',str(cache/'build'),'-t','commands','warzone2100']).splitlines()[-1]
 text=original.split(' && cd ')[0]
 if text.startswith(': && '):text=text[5:]
 tokens=shlex.split(text);omitted=[];i=0
 while i<len(tokens):
  if tokens[i]=='--preload-file' and not Path(tokens[i+1].split('@')[0]).exists():
   omitted.append(tokens[i+1]);del tokens[i:i+2];continue
  i+=1
 for old,new in replacements.items():
  assert tokens.count(old)==1,(old,tokens.count(old));tokens[tokens.index(old)]=str(new)
 tokens[tokens.index('-o')+1]=str(output/'warzone2100.html')
 return original,tokens,omitted
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--offline-cache',type=Path,default=Path('/home/punkech/wz-blueprint-20261107'))
 p.add_argument('--mp-cache',type=Path,default=Path('/home/punkech/wz-mp-070'))
 p.add_argument('--baseline-project',type=Path,default=Path('/mnt/c/timerApp/candidates/play-store-0.87-20261116'))
 p.add_argument('--retained-project',type=Path,default=Path('/mnt/c/timerApp/wz-towers-lab'))
 a=p.parse_args();assert os.name!='nt','Run under Linux/WSL'
 assert not (OUT/'native-build.json').exists(),'Preserve a prior completed build'
 caches={'offline':a.offline_cache.resolve(),'multiplayer':a.mp_cache.resolve()}
 before={};envs={};proof={'version':'0.89','upstreamCommit':COMMIT,'sourceChanges':[],'compiles':[],'links':[],'dataRebuiltOrShipped':False}
 for name,cache in caches.items():
  assert run(['git','-C',str(cache/'source'),'rev-parse','HEAD'])==COMMIT
  assert (cache/'emsdk/upstream/emscripten/emscripten-version.txt').read_text().strip(' \n\"')=='4.0.10'
  before[name]=frozen(cache);envs[name]=environment(cache)
  modified=run(['git','-C',str(cache/'source'),'diff','--name-only']).splitlines()
  untracked=run(['git','-C',str(cache/'source'),'ls-files','--others','--exclude-standard']).splitlines()
  for relative in modified+untracked:
   source=cache/'source'/relative;assert source.is_file()
   write(OUT/'bootstrap'/name/'source'/relative,source.read_bytes())
  write(OUT/'bootstrap'/name/'baseline-git.patch',subprocess.check_output(['git','-C',str(cache/'source'),'diff','--binary','HEAD']))
  write(OUT/'bootstrap'/name/'CMakeCache.txt',(cache/'build/CMakeCache.txt').read_bytes())
  proof.setdefault('bootstrap',{})[name]={'sourceOverlayFiles':modified+untracked,'sourceCommit':COMMIT,'emscripten':'4.0.10'}
  jwrite(OUT/'proof'/(name+'-cache-before.json'),before[name])
 assets=a.baseline_project/'app/src/main/assets'
 for name,file in [('shared',assets/'warzone/warzone2100.wasm'),('towers',assets/'warzone/warzone2100-towers-052.wasm'),('multiplayer',assets/'multiplayer/warzone2100.wasm')]:assert digest(file)==EXPECTED_WASM[name],name
 assert digest(caches['offline']/'build/src/warzone2100.wasm')==EXPECTED_WASM['towers']
 assert digest(caches['multiplayer']/'build/src/warzone2100.wasm')==EXPECTED_WASM['multiplayer']
 jobs=[]
 for name,sources in [('offline',['src/display3d.cpp','src/hci.cpp']),('multiplayer',['src/display3d.cpp'])]:
  for relative in sources:
   original=(caches[name]/'source'/relative).read_text();updated=patch_frame(original) if relative.endswith('hci.cpp') else patch_health(original)
   destination=OUT/'source'/name/relative;write(destination,updated.encode())
   write(OUT/'patches'/name/(Path(relative).name+'.patch'),''.join(difflib.unified_diff(original.splitlines(True),updated.splitlines(True),fromfile='a/'+relative,tofile='b/'+relative)).encode())
   proof['sourceChanges'].append({'family':name,'path':relative,'beforeSHA256':sha256(original.encode()).hexdigest(),'afterSHA256':digest(destination)})
   obj=OUT/'objects'/name/(Path(relative).name+'.o');obj.parent.mkdir(parents=True,exist_ok=True)
   old,cmd=compile_command(caches[name],relative,destination,obj);jobs.append((name,relative,cmd,obj));proof['compiles'].append({'family':name,'path':relative,'originalCommand':old,'isolatedCommand':shlex.join(cmd)})
 stock=a.retained_project/'archive/native-unit-loss-0.52/original-droid.cpp'
 assert digest(stock)=='b32c09a40baf1f34b1b00c33b2928f8e771b35646e65508a3331dd0104ccfea4'
 stock_copy=OUT/'source/shared051/src/droid.cpp';write(stock_copy,stock.read_bytes())
 obj=OUT/'objects/shared051/droid.cpp.o';obj.parent.mkdir(parents=True,exist_ok=True)
 old,cmd=compile_command(caches['offline'],'src/droid.cpp',stock_copy,obj);jobs.append(('offline','src/droid.cpp',cmd,obj));proof['compiles'].append({'family':'shared051','path':'src/droid.cpp','originalCommand':old,'isolatedCommand':shlex.join(cmd),'reason':'Retain exact shared0.51 lineage without Towers0.52 loss-notice TU'})
 jwrite(OUT/'build-plan.json',proof)
 def work(job):
  name,relative,cmd,obj=job;seconds=execute(cmd,caches[name],envs[name],OUT/'logs'/('compile-'+obj.parent.name+'-'+Path(relative).name+'.log'))
  print(json.dumps({'compile':name+'/'+relative,'seconds':seconds,'objectSHA256':digest(obj)}),flush=True);return {'family':name,'path':relative,'seconds':seconds,'object':str(obj.relative_to(OUT)),'sha256':digest(obj)}
 with ThreadPoolExecutor(max_workers=2) as pool:proof['compileResults']=list(pool.map(work,jobs))
 for name,family in [('shared','offline'),('towers','offline'),('multiplayer','multiplayer')]:
  replacements={target('src/display3d.cpp'):OUT/'objects'/family/'display3d.cpp.o'}
  if family=='offline':replacements[target('src/hci.cpp')]=OUT/'objects/offline/hci.cpp.o'
  if name=='shared':replacements[target('src/droid.cpp')]=OUT/'objects/shared051/droid.cpp.o'
  output=OUT/'raw'/name;output.mkdir(parents=True,exist_ok=True)
  original,cmd,omitted=link_command(caches[family],replacements,output)
  seconds=execute(cmd,caches[family],envs[family],OUT/'logs'/('link-'+name+'.log'))
  raw=[{'file':n,'bytes':(output/n).stat().st_size,'sha256':digest(output/n)} for n in ['warzone2100.js','warzone2100.wasm']]
  proof['links'].append({'variant':name,'originalCommand':original,'isolatedCommand':shlex.join(cmd),'omittedMissingGeneratedPreloads':omitted,'seconds':seconds,'raw':raw})
  print(json.dumps({'linked':name,'seconds':seconds,'raw':raw}),flush=True)
 for name,cache in caches.items():
  after=frozen(cache);jwrite(OUT/'proof'/(name+'-cache-after.json'),after)
  assert after==before[name],name+' cache changed; inspect before/after records'
 proof.update(passed=True,warmSourcesObjectsLibrariesAndRawOutputsUnchanged=True,fullFreshBuildPerformed=False)
 jwrite(OUT/'native-build.json',proof)
 print(json.dumps({'passed':True,'record':str(OUT/'native-build.json')}),flush=True)
if __name__=='__main__':main()
