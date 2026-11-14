"""Append only the Campaign mobile bridge to the frozen v0.52 Campaign VFS."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json,runpy
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'app/src/main/assets/warzone'
BASE=ROOT.parent/'Warzone-Towers-0.52.apk'
SOURCE=ROOT.parent/'warzone-towers-0.52-source.zip'
VIRTUAL='/data/base/script/campaign/mobile/campaign-bridge.js'
R=runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'),run_name='campaign053_vfs_helpers')
def digest(v):return sha256(v).hexdigest()
def main():
 with ZipFile(BASE) as old,ZipFile(SOURCE) as source:
  loader=old.read('assets/warzone/warzone2100-campaign.js').decode()
  data=old.read('assets/warzone/warzone2100-campaign.data')
  start,end,_,index=R['package_call'](loader)
  prior_table={v['filename']:dict(v) for v in index['files']};entries=[dict(v) for v in index['files']];table={v['filename']:v for v in entries}
  assert len(entries)==len(table) and VIRTUAL in table
  old_events=source.read('campaign/mobile-events.js').decode().replace('\r\n','\n')
  old_research=source.read('campaign/research-bridge.js').decode().replace('\r\n','\n')
  old_commands=source.read('campaign/commands.js').decode().replace('\r\n','\n')
  assert (ROOT/'campaign/research-bridge.js').read_text()==old_research
  assert (ROOT/'campaign/commands.js').read_text()==old_commands
  prior=(old_events+'\n'+old_research+'\n'+old_commands).encode()
  entry=table[VIRTUAL];assert data[entry['start']:entry['end']]==prior
  events=(ROOT/'campaign/mobile-events.js').read_text()
  content=(events+'\n'+old_research+'\n'+old_commands).encode()
  assert events!=old_events and b'campmobile' in content
  final=data+content
  entry['start']=len(data);entry['end']=len(final)
  index.update(files=entries,remote_package_size=len(final),package_uuid='campaign-mobile-053-'+digest(final)[:16])
  current=loader[:start]+'loadPackage('+json.dumps(index,separators=(',',':'))+')'+loader[end:]
  a,b,_,parsed=R['package_call'](current)
  body=current[:a]+'PACKAGE_INDEX'+current[b:]
  assert body==loader[:start]+'PACKAGE_INDEX'+loader[end:]
  R['verify_index'](parsed,final)
  for name,row in table.items():
   if name!=VIRTUAL:
    prior_row=prior_table[name]
    assert row==prior_row and final[row['start']:row['end']]==data[row['start']:row['end']]
  for name in ['warzone2100.js','warzone2100.wasm','warzone2100.data','warzone2100-towers-052.js','warzone2100-towers-052.wasm','warzone2100-duel.js','index.html','index-duel.html']:
   assert (A/name).read_bytes()==old.read('assets/warzone/'+name),name
  (A/'warzone2100-campaign.js').write_bytes(current.encode())
  (A/'warzone2100-campaign.data').write_bytes(final)
  proof=dict(version='0.53',passed=True,baselineAPK_SHA256=digest(BASE.read_bytes()),
   onlyChangedVirtualFile=VIRTUAL,sourcePath='campaign/mobile-events.js',sourceSHA256=digest((ROOT/'campaign/mobile-events.js').read_bytes()),
   sourceAssembly=['campaign/mobile-events.js','campaign/research-bridge.js','campaign/commands.js'],
   preservedResearchBridgeSHA256=digest((ROOT/'campaign/research-bridge.js').read_bytes()),preservedCommandsSHA256=digest((ROOT/'campaign/commands.js').read_bytes()),
   baselineDataBytes=len(data),baselineDataSHA256=digest(data),originalDataPrefixUnchanged=True,
   unchangedOtherVirtualFiles=len(entries)-1,originalMissionBodiesPreserved=True,originalMissionIncludesPreserved=True,
   runtimeBodySHA256=digest(body.encode()),loaderSHA256=digest(current.encode()),dataSHA256=digest(final),dataBytes=len(final),
   towersAndDuelRuntimeFrozen=True,nativeRuntimeUnchanged=True)
  (ROOT/'archive/campaign-0.53-payload.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
  print(json.dumps(proof))
if __name__=='__main__':main()
