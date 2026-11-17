"""Prepare one exact0.89 native source lineage from the retained full snapshot.

This creates a new isolated workspace only. It does not compile or install.
"""
from pathlib import Path
from hashlib import sha256
import argparse,json,shutil,tarfile
ROOT=Path(__file__).resolve().parents[1];NATIVE=ROOT/'vendor/native-089'
def digest(p):
 h=sha256()
 with p.open('rb') as f:
  while b:=f.read(8*1024*1024):h.update(b)
 return h.hexdigest()
def overlay(source,dest):
 rows=[]
 for p in sorted(source.rglob('*')):
  if p.is_file():
   relative=p.relative_to(source);out=dest/relative
   assert out.resolve().is_relative_to(dest.resolve())
   out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,out)
   rows.append({'path':relative.as_posix(),'sha256':digest(out)})
 return rows
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--workspace',type=Path,required=True)
 p.add_argument('--source-archive',type=Path,default=ROOT/'archive/native-blueprint-4.7.0-source.tar.gz')
 p.add_argument('--variant',choices=['shared','towers','multiplayer'],required=True)
 a=p.parse_args();work=a.workspace.resolve()
 assert not work.exists() or not any(work.iterdir()),'Choose a new or empty isolated workspace'
 assert a.source_archive.is_file(),'Supply retained archive/native-blueprint-4.7.0-source.tar.gz from the complete source snapshot'
 meta=json.loads((NATIVE/'bootstrap/retained-snapshot.json').read_text())
 assert digest(a.source_archive)==meta['sha256'],'Retained native source snapshot changed'
 family='multiplayer' if a.variant=='multiplayer' else 'offline'
 baseline=NATIVE/'bootstrap'/family/'source'
 # The retained snapshot has one original blueprint patch; both final lineage
 # overlays replace that complete translation unit, so no Git/reset is needed.
 assert all((baseline/name).is_file() for name in meta['patchedFiles'])
 work.mkdir(parents=True,exist_ok=True)
 with tarfile.open(a.source_archive,'r:gz') as t:t.extractall(work,filter='data')
 assert (work/'source/src/display3d.cpp').is_file()
 rows=overlay(baseline,work/'source')+overlay(NATIVE/'source'/family,work/'source')
 if a.variant=='shared':
  original=NATIVE/'source/shared051/src/droid.cpp'
  assert digest(original)=='b32c09a40baf1f34b1b00c33b2928f8e771b35646e65508a3331dd0104ccfea4'
  shutil.copy2(original,work/'source/src/droid.cpp')
 assert (work/'source/autorevision.cache').is_file(),'Keep the retained version metadata for Git-free source builds'
 record={'variant':a.variant,'family':family,'sourceCommit':'7d3d8e51a61ceee89e6bf672a41337e1a9cd7392','baselineArchiveSHA256':meta['sha256'],'sourceOverlays':rows,'dataMustRemainFrozenForDelivery':True}
 (work/'prepared-native-089.json').write_text(json.dumps(record,indent=2)+'\n')
 print(json.dumps({'prepared':str(work),'variant':a.variant,'compiled':False},indent=2))
if __name__=='__main__':main()
