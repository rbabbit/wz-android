"""Extend retained complete0.90 cold source bootstrap with the Players0.91 TUs."""
from pathlib import Path
from hashlib import file_digest
import argparse,json,shutil,subprocess,sys
ROOT=Path(__file__).resolve().parents[1];NATIVE=ROOT/'vendor/native-091'
def digest(path):
 with path.open('rb')as stream:return file_digest(stream,'sha256').hexdigest()
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--workspace',type=Path,required=True)
 p.add_argument('--source-archive',type=Path,default=ROOT/'archive/native-blueprint-4.7.0-source.tar.gz')
 p.add_argument('--variant',choices=['shared','towers','multiplayer'],required=True);a=p.parse_args()
 subprocess.run([sys.executable,str(ROOT/'tools/prepare-native-selection-cold-090.py'),'--workspace',str(a.workspace),'--source-archive',str(a.source_archive),'--variant',a.variant],check=True)
 family='multiplayer'if a.variant=='multiplayer'else'offline';rows=[]
 for source in sorted((NATIVE/'source'/family).rglob('*')):
  if source.is_file():
   relative=source.relative_to(NATIVE/'source'/family);target=a.workspace/'source'/relative
   assert target.resolve().is_relative_to((a.workspace/'source').resolve());target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
   if a.variant=='towers'and relative.as_posix()=='src/hci.cpp':target.write_bytes(b'#define MOBILE_PLAYERS_SCENARIO91 1\n'+target.read_bytes())
   rows.append(dict(path=relative.as_posix(),sha256=digest(target)))
 for source in sorted((NATIVE/'source/common').glob('*.h')):
  target=a.workspace/'source/src'/source.name;shutil.copy2(source,target);rows.append(dict(path='src/'+source.name,sha256=digest(target)))
 record=dict(version='0.91',variant=a.variant,sourceOverlay=rows,towersReadOnlyProfileDefine=a.variant=='towers',
  defineMethod='source-local hci.cpp preprocessor define; warm build uses identical -Dflag',baselinePreparation='prepared-native-090.json',compiled=False)
 (a.workspace/'prepared-native-091.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record,indent=2))
if __name__=='__main__':main()
