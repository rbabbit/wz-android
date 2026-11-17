"""Prepare source-built Players readouts/navigation from frozen0.90 sources."""
from pathlib import Path
from hashlib import sha256
import argparse,difflib,json
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/native-091'
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--baseline-project',type=Path,default=Path('C:/timerApp/candidates/normal-test-0.90-20261116'))
 p.add_argument('--stock-source',type=Path,default=Path('C:/timerApp/.reference-warzone2100-4.7.0'));a=p.parse_args();rows=[]
 for family,name in [('offline','hci.cpp'),('multiplayer','quickjs_backend.cpp')]:
  source=a.baseline_project/'vendor/native-090/source'/family/'src'/name;before=source.read_text();after=before
  if family=='offline':
   anchor='// BEGIN NORMAL090_NATIVE_COMBAT_LATCH';assert after.count(anchor)==1;after=after.replace(anchor,'#include "mobile-players-v91.h"\n'+anchor,1)
   anchor='    static uint64_t publicationSerial=0;';assert after.count(anchor)==1
   after=after.replace(anchor,anchor+'\n    mobilePlayersFrameV91(GetGameMode()==GS_NORMAL&&gameInitialised&&!loop_GetVideoStatus());',1)
  else:
   anchor='void mpMobileFrame()\n{';assert after.count(anchor)==1
   after=after.replace(anchor,'#include "mobile-players-v91.h"\n'+anchor,1)
   anchor='    const bool world=GetGameMode()==GS_NORMAL&&gameInitialised&&!mpMobileLoading&&mpMobileViewReady;';assert after.count(anchor)==1
   after=after.replace(anchor,anchor+'\n    mobilePlayersFrameV91(world);',1)
  target=OUT/'source'/family/'src'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(after)
  patch=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/src/'+name,tofile='b/src/'+name))
  out=OUT/'patches'/family/(name+'.patch');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(patch)
  rows.append(dict(family=family,path='src/'+name,beforeSHA256=sha256(source.read_bytes()).hexdigest(),afterSHA256=sha256(target.read_bytes()).hexdigest()))
  source=a.stock_source/'src/spectatorwidgets.cpp';before=source.read_text();anchor='static std::shared_ptr<SpectatorStatsView> globalStatsForm = nullptr;';assert before.count(anchor)==1
  after=before.replace(anchor,anchor+'\n\n// Read-only observation for the mobile Players navigation ACK.\nbool mobileSpectatorStatsOpenV91() { return globalStatsForm != nullptr; }',1)
  target=OUT/'source'/family/'src/spectatorwidgets.cpp';target.write_text(after)
  out=OUT/'patches'/family/'spectatorwidgets.cpp.patch';out.write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/src/spectatorwidgets.cpp',tofile='b/src/spectatorwidgets.cpp')))
  rows.append(dict(family=family,path='src/spectatorwidgets.cpp',beforeSHA256=sha256(before.encode()).hexdigest(),afterSHA256=sha256(target.read_bytes()).hexdigest(),baselineNewlinesNormalized=True))
 record=dict(passed=True,version='0.91',baseline='0.90',sourceChanges=rows,unconditionalOfflineAndMPFramePublication=True,compiled=False)
 (OUT/'source-preparation.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record,indent=2))
if __name__=='__main__':main()
