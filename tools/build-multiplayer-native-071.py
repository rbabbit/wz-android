"""Compile only restored/changed native objects and relink against retained data.
The full target's texture/transcode prerequisites are intentionally not run:
this app retains the exact official MP data file. This records exact commands,
source hashes, native protocol metadata, and raw JS/WASM pair for integration.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import subprocess,hashlib,json,time,shutil,sys,re
ROOT=Path('/mnt/c/timerApp/wz-towers-lab');CACHE=Path('/home/punkech/wz-mp-070');BUILD=CACHE/'build';OUT=ROOT/'qa/multiplayer-071'
files=['src/console.cpp','src/display3d.cpp','src/droid.cpp','src/hci.cpp','src/intdisplay.cpp','src/keybind.cpp','src/loadsave.cpp','src/main.cpp','src/quickjs_backend.cpp','src/radar.cpp','src/research.cpp','src/multiint.cpp','src/wrappers.cpp','lib/sdl/main_sdl.cpp','lib/netplay/netplay.cpp','src/version.cpp']
def command(target):
 lines=subprocess.check_output(['ninja','-C',str(BUILD),'-t','commands',target],text=True).splitlines();assert lines;return lines[-1]
def target(name):
 if name.startswith('src/'):return 'src/CMakeFiles/warzone2100.dir/'+Path(name).name+'.o'
 if name.startswith('lib/sdl/'):return 'lib/sdl/CMakeFiles/sdl-backend.dir/'+Path(name).name+'.o'
 if name.startswith('lib/netplay/'):return 'lib/netplay/CMakeFiles/netplay.dir/'+Path(name).name+'.o'
 return 'lib/framework/CMakeFiles/framework.dir/'+Path(name).name+'.o'
compile_commands=[(name,command(target(name)))for name in files if len(sys.argv)==1 or name in sys.argv[1:]]
log=OUT/'native-focused-build.log';log.write_text('Source-level MP UI bridge. No data rebuild.\n')
def run(row):
 name,cmd=row;path=OUT/('compile-'+Path(name).name+'.log');start=time.monotonic()
 with path.open('w')as stream:
  result=subprocess.run(['bash','-lc','source "$1/emsdk/emsdk_env.sh" >/dev/null 2>&1; cd "$1/build"; eval "$2"','mp071',str(CACHE),cmd],stdout=stream,stderr=subprocess.STDOUT)
 return name,result.returncode,time.monotonic()-start,path
with ThreadPoolExecutor(max_workers=4)as pool:
 for future in as_completed([pool.submit(run,row)for row in compile_commands]):
  name,status,seconds,p=future.result();print(name,status,round(seconds,1),flush=True)
  with log.open('a')as stream:stream.write(f'{name} exit={status} seconds={seconds:.1f}\n'+p.read_text())
  if status:raise RuntimeError('Compile failed: '+name)
for label,t in [('archive-sdl','lib/sdl/libsdl-backend.a'),('archive-netplay','lib/netplay/libnetplay.a'),('archive-framework','lib/framework/libframework.a'),('link','warzone2100')]:
 cmd=command(t)
 if label=='link':
  # Generated data is not shipped. The official frozen package index/data are
  # reattached after linking; optional campaign mod preloads are irrelevant.
  cmd=re.sub(r'--preload-file\s+([^\s]+)',lambda m:m.group(0) if Path(m.group(1).split('@')[0]).exists() else '',cmd)
  # Generated HTML / optional loose assets are not delivery inputs.
  cmd=cmd.split(' && cd ')[0]
 with log.open('a')as stream:
  stream.write('\n['+label+'] '+cmd+'\n');stream.flush()
  subprocess.run(['bash','-lc','source "$1/emsdk/emsdk_env.sh" >/dev/null 2>&1; cd "$1/build"; eval "$2"','mp071',str(CACHE),cmd],stdout=stream,stderr=subprocess.STDOUT,check=True)
 print(label,'passed',flush=True)
record={'version':'0.71','upstreamCommit':'7d3d8e51a61ceee89e6bf672a41337e1a9cd7392','protocolHeader':(BUILD/'lib/netplay/netplay_config.h').read_text(),'sources':[{'path':name,'sha256':hashlib.sha256((CACHE/'source'/name).read_bytes()).hexdigest()}for name in files], 'commands':dict(compile_commands),'raw':[]}
assert 'NETCODE_VERSION_MINOR = 104' in record['protocolHeader']
for name in ['warzone2100.js','warzone2100.wasm']:
 data=(BUILD/'src'/name).read_bytes();record['raw'].append({'name':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
 shutil.copy2(BUILD/'src'/name,ROOT/'vendor/multiplayer/native-071'/('raw-'+name))
(OUT/'native-build.json').write_text(json.dumps(record,indent=2))
print(json.dumps(record['raw']),flush=True)

