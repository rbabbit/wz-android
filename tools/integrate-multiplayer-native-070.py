"""Attach original official MP data and reviewed Android transport to new native UI build."""
from pathlib import Path
import hashlib,runpy,re,json
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/multiplayer/native-070';ASSETS=ROOT/'app/src/main/assets/multiplayer'
helpers=runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'));package=helpers['package_call']
raw=(OUT/'raw-warzone2100.js').read_text();stock=(ROOT/'vendor/multiplayer/source/vendor/stock/warzone2100.js').read_text();data=(ASSETS/'warzone2100.data').read_bytes()
assert hashlib.sha256(data).hexdigest()=='9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424'
a,b=package(raw),package(stock)
assert b[3]['remote_package_size']==len(data)
result=raw[:a[0]]+b[2]+raw[a[1]:]
pattern=r'Module\["FS_createPath"\]\("[^"\\]*","[^"\\]*",true,true\);'
existing=set(re.findall(pattern,result));missing=[call for call in re.findall(pattern,stock)if call not in existing]
if missing:
 declarations=list(re.finditer(pattern,result));assert declarations
 # Missing stock paths can depend on /data created by the raw loader. Append
 # after its existing directory calls, before file materialization.
 position=declarations[-1].end()
 result=result[:position]+''.join(missing)+result[position:]
assert result.count('if(flags&32){return-2}')==1
result=result.replace('if(flags&32){return-2}','flags&=~32;')
marker='preMain();readyPromiseResolve?.(Module);var noInitialRun=false;'
assert result.count(marker)==1
result=result.replace(marker,'preMain();Module["onRuntimeInitialized"]?.();readyPromiseResolve?.(Module);var noInitialRun=false;')
worker="globalThis.assert=(v,m)=>{if(!v)throw Error(m||'Emscripten assertion failed');};if(typeof importScripts==='function')importScripts('socket-bridge.js','lobby-http.js');\n"
result=worker+result
assert result.count('Module["FS"]=FS;')==1
assert 'getMultiplayerGameMode' not in result
final=package(result);assert final[3]==b[3]
# Validate the exact call order with createPath's parent-lookup requirement.
import posixpath
known={'/'}
for call in re.finditer(r'Module\["FS_createPath"\]\(("[^"\\]*"),("[^"\\]*"),true,true\);',result):
 parent,name=json.loads('['+call.group(1)+','+call.group(2)+']')
 parent=posixpath.normpath('/'+parent.lstrip('/'))
 assert parent in known, 'Preload directory parent missing before createPath: '+parent
 current=parent
 for component in name.split('/'):
  if not component:continue
  current=posixpath.normpath(posixpath.join(current,component));known.add(current)
for item in final[3]['files']:
 assert posixpath.dirname(item['filename']) in known, 'Preload file directory missing: '+item['filename']
(ASSETS/'warzone2100.js').write_text(result,encoding='utf8',newline='\n')
(ASSETS/'warzone2100.wasm').write_bytes((OUT/'raw-warzone2100.wasm').read_bytes())
record={'version':'0.70','protocol':[16384,104],'noWasmBinaryPatching':True,'nativeSourcePatch':'vendor/multiplayer/native-070/native-ui.patch','frozenDataSHA256':hashlib.sha256(data).hexdigest(),'frozenVirtualFileCount':len(final[3]['files']),'addedStockDirectoryDeclarations':len(missing),'integrations':['official frozen package index','official directory declarations','existing Android worker transport import','existing AI_ADDRCONFIG DNS gate','runtime-ready callback'],'outputs':[{'name':name,'bytes':(ASSETS/name).stat().st_size,'sha256':hashlib.sha256((ASSETS/name).read_bytes()).hexdigest()}for name in ['warzone2100.js','warzone2100.wasm','warzone2100.data']]}
(OUT/'runtime-integration.json').write_text(json.dumps(record,indent=2))
print(json.dumps(record,indent=2))
