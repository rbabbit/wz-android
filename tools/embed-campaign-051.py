"""Create a separate additive campaign VFS; never change Towers JS/data.

Each original mission body is retained byte-for-byte and receives only the
explicit include suffix. Modern command/research bridges are copied into an
isolated campaign/mobile namespace directory, with their JSON paths adapted.
"""
from pathlib import Path
from hashlib import sha256
import difflib, importlib.util, json, re

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'app/src/main/assets/warzone'
OUT=ROOT/'archive/native-campaign-0.51'
BASE='/data/base/script/campaign/mobile/'
spec=importlib.util.spec_from_file_location('integrate_native',ROOT/'tools/integrate-native-runtime.py')
runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)

def main():
    before_js=(ASSETS/'warzone2100.js').read_bytes();before_data=(ASSETS/'warzone2100.data').read_bytes()
    start,end,_,metadata=runtime.package_call(before_js.decode())
    table={r['filename']:r for r in metadata['files']}
    def read(path):r=table[path];return before_data[int(r['start']):int(r['end'])]
    bridge=(ROOT/'scenario/warzone-towers-bridge.js').read_text(encoding='utf-8')
    bridge=re.sub(r'var blockNightV28OriginalEvent\w+ = \w+;\n','',bridge)
    bridge=re.sub(r'function warzoneTowersDiagnosticSnapshot\(\).*?(?=function blockNightV31PollZoomCommand)','',bridge,flags=re.S)
    bridge=bridge[:bridge.index('eventChat = function')]
    for name in ['blocknight-zoom-command.json','warzone-towers-control-command.json','blocknight-queue-command.json']:
        bridge=bridge.replace('includeJSON("'+name+'")','includeJSON("mobile/'+name+'")')
    commands=(ROOT/'scenario/warzone-towers-commands.js').read_text(encoding='utf-8')
    for name in ['warzone-towers-catalog.json','warzone-towers-command.json']:
        commands=commands.replace('includeJSON("'+name+'")','includeJSON("mobile/'+name+'")')
    commands=commands.replace("includeJSON('warzone-towers-demolition-intent.json',true)","includeJSON('mobile/warzone-towers-demolition-intent.json',true)")
    assert commands.count('setTimer("wtcmd_tick", 250);')==1
    commands=commands.replace('setTimer("wtcmd_tick", 250);','campmobile_setTimer("wtcmd_tick", 250);')
    needle='if (command.action === "state") wtcmd_answer(command, true, "", wtcmd_snapshot());'
    assert commands.count(needle)==1
    commands=commands.replace(needle,needle+'\n            else if (command.action === "campaign-select-combat") { const result=campaignSelectCombat();wtcmd_answer(command,Boolean(result),result?"":"selection-suspended",result); }')
    mobile=ROOT/'campaign';mobile.mkdir(exist_ok=True)
    (mobile/'research-bridge.js').write_text(bridge,encoding='utf-8',newline='\n')
    (mobile/'commands.js').write_text(commands,encoding='utf-8',newline='\n')
    files={BASE+'campaign-bridge.js':((mobile/'mobile-events.js').read_text(encoding='utf-8')+'\n'+bridge+'\n'+commands).encode(),
           BASE+'warzone-towers-catalog.json':(ROOT/'scenario/warzone-towers-catalog.json').read_bytes(),
           BASE+'campaign-control.json':b'{"enabled":false,"suspended":true}',
           BASE+'warzone-towers-demolition-intent.json':b'{"intent":"","active":false}'}
    for name in ['warzone-towers-command.json','warzone-towers-control-command.json','blocknight-queue-command.json','blocknight-zoom-command.json']:
        files[BASE+name]=b'{}'
    missions=sorted(p for p in table if re.fullmatch(r'/data/base/script/campaign/cam[^/]+\.js',p))
    assert len(missions)==52
    for path in missions:
        suffix=('\n// Mobile campaign bridge (append-only v0.51).\ninclude("script/campaign/mobile/campaign-bridge.js");\ncampmobile_level = '+json.dumps(Path(path).stem)+';\n').encode()
        files[path]=read(path)+suffix
    data=bytearray(before_data);entries=[dict(r) for r in metadata['files']];indices={r['filename']:i for i,r in enumerate(entries)}
    for path,content in files.items():
        a=len(data);data.extend(content);row={'filename':path,'start':a,'end':len(data)}
        if path in indices: entries[indices[path]]=row
        else: entries.append(row)
    metadata.update(files=entries,remote_package_size=len(data),package_uuid='campaign-mobile-051-'+sha256(data).hexdigest()[:16])
    index='loadPackage('+json.dumps(metadata,separators=(',',':'))+')'
    loader=before_js.decode();loader=loader[:start]+index+loader[end:]
    assert loader.count('var REMOTE_PACKAGE_BASE="warzone2100.data";')==1
    loader=loader.replace('var REMOTE_PACKAGE_BASE="warzone2100.data";','var REMOTE_PACKAGE_BASE="warzone2100-campaign.data";')
    # Preserve the existing worker transport and extend its filter only in this
    # separate campaign loader. Original generated program logic is unchanged.
    filter='text.includes("BNNOTICE")'
    assert loader.count(filter)==1
    loader=loader.replace(filter,filter+'||text.includes("BNCAMPAIGN")||text.includes("WTCMD")||text.includes("WTREADY")')
    (ASSETS/'warzone2100-campaign.js').write_text(loader,encoding='utf-8',newline='\n')
    (ASSETS/'warzone2100-campaign.data').write_bytes(data)
    assert (ASSETS/'warzone2100.js').read_bytes()==before_js and (ASSETS/'warzone2100.data').read_bytes()==before_data
    assert bytes(data[:len(before_data)])==before_data
    proof={'version':'0.51','passed':True,'towersJSUnchanged':True,'towersDataUnchanged':True,'originalPrefixBytes':len(before_data),'originalPrefixSHA256':sha256(before_data).hexdigest(),'originalMissionBodiesPreserved':len(missions),'addedMobileFiles':len(files)-len(missions),'replacedMissionEntriesOnly':missions,'bridgeJSONPrefix':BASE,'outputs':[]}
    for name in ['warzone2100-campaign.js','warzone2100-campaign.data']:
        p=ASSETS/name;proof['outputs'].append({'file':name,'bytes':p.stat().st_size,'sha256':sha256(p.read_bytes()).hexdigest()})
    OUT.mkdir(parents=True,exist_ok=True);(OUT/'campaign-payload.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:proof[k] for k in ['passed','originalMissionBodiesPreserved','addedMobileFiles','outputs']}))

if __name__=='__main__':main()
