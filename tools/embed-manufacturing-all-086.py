"""Append only the approved v0.86 manufacturing command rows to v0.85 VFS.

No native compilation or map/data regeneration. Every old data byte, other VFS
row and compiled loader body stays intact; repeated runs use the pinned fallback.
"""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json, runpy, subprocess

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/warzone'
FALLBACK = ROOT / 'qa/manufacturing-all-086/fallback-0.86.json'
REPORT = ROOT / 'qa/manufacturing-all-086/payload.json'
ASSEMBLY = ['campaign/mobile-events.js', 'campaign/research-bridge.js', 'campaign/commands.js']
HELPERS = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='manufacturing086_helpers')
SPECS = [
    ('warzone2100-towers-052.js', 'warzone2100.data', '/data/mp/tests/warzone-towers-commands.js', ['scenario/warzone-towers-commands.js']),
    ('warzone2100-campaign.js', 'warzone2100-campaign.data', '/data/base/script/campaign/mobile/campaign-bridge.js', ASSEMBLY),
    ('warzone2100-ffa.js', 'warzone2100-ffa.data', '/data/mp/tests/ffa-commands.js', ['scenario/ffa/commands.js'])]


def digest(data): return sha256(data).hexdigest()


def file_digest(path):
    h = sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4*1024*1024), b''): h.update(block)
    return h.hexdigest()


def verify_index(metadata, data):
    files = metadata['files']; names = [row['filename'] for row in files]
    assert len(set(names)) == len(names) and metadata['remote_package_size'] == len(data), 'Invalid VFS inventory/size'
    for row in files:
        assert isinstance(row['start'],int) and isinstance(row['end'],int) and 0 <= row['start'] <= row['end'] <= len(data), 'Invalid VFS offsets'


def assembled(parts, source=None):
    if len(parts) == 1:
        return source.read(parts[0]) if source else (ROOT / parts[0]).read_bytes()
    values = [(source.read(p).decode('utf-8').replace('\r\n', '\n') if source else (ROOT / p).read_text(encoding='utf-8')) for p in parts]
    return '\n'.join(values).encode('utf-8')


def source_scope(source):
    # Acorn reads actual syntax nodes, avoiding function-boundary regex guesses.
    script = r'''
const fs=require('node:fs'),a=require('./vendor/multiplayer/native-070/tooling/acorn.cjs');
const data=JSON.parse(fs.readFileSync(0,'utf8')),allowed=new Set(['wtcmd_queueProduction','wtcmd_setProductionRepeat']);
const additions=new Set(['wtcmd_allProductionFactories','wtcmd_setAllProductionRepeat']);
const globals=new Set([]);
const parse=s=>a.parse(s,{ecmaVersion:'latest'}).body,report=[];
for(const row of data){
 const before=row.before.replace(/\r\n/g,'\n'),after=row.after.replace(/\r\n/g,'\n'),b=parse(before),n=parse(after);
 const oldFns=new Map(b.filter(x=>x.type==='FunctionDeclaration').map(x=>[x.id.name,before.slice(x.start,x.end)]));
 const newFns=new Map(n.filter(x=>x.type==='FunctionDeclaration').map(x=>[x.id.name,after.slice(x.start,x.end)]));
 const changed=[];
 for(const [name,value]of oldFns){if(!newFns.has(name))throw Error(row.path+' deleted '+name);if(newFns.get(name)!==value){if(!allowed.has(name))throw Error(row.path+' unrelated function changed '+name);changed.push(name);}}
 const added=Array.from(newFns.keys()).filter(name=>!oldFns.has(name));if(added.length!==additions.size||added.some(name=>!additions.has(name)))throw Error('Unexpected production helpers '+row.path);
 const nodes=(nodes,text,skip)=>nodes.filter(x=>x.type!=='FunctionDeclaration'&&!(skip&&x.type==='VariableDeclaration'&&x.declarations.every(d=>globals.has(d.id.name)))).map(x=>text.slice(x.start,x.end));
 if(JSON.stringify(nodes(b,before,false))!==JSON.stringify(nodes(n,after,true)))throw Error(row.path+' unrelated top-level state/code changed');
 report.push({path:row.path,changedFunctions:changed,addedFunctions:added});
}
console.log(JSON.stringify(report));
'''
    rows = [{'path':p, 'before':source.read(p).decode('utf-8'), 'after':(ROOT/p).read_text(encoding='utf-8')} for p in ['scenario/warzone-towers-commands.js','campaign/commands.js','scenario/ffa/commands.js']]
    run = subprocess.run(['node','-e',script], cwd=ROOT, input=json.dumps(rows), text=True, capture_output=True, check=True)
    result = json.loads(run.stdout)
    for p in ASSEMBLY[:2] + ['scenario/ffa/command-policy.js','vendor/multiplayer/native-070/mobile-ui-bootstrap.js']:
        assert (ROOT/p).read_bytes() == source.read(p), 'Frozen event/research/FFA/MP bootstrap changed: '+p
    return result


def main():
    saved = json.loads(FALLBACK.read_text(encoding='utf-8'))
    paths = {}
    for row in saved['immutableFallbacks']:
        p = Path(row['path'])
        assert p.is_file() and p.stat().st_size == row['bytes'] and file_digest(p) == row['sha256'], 'Pinned v0.85 fallback changed'
        paths[p.suffix.lower()] = p
    assert set(paths) == {'.apk','.zip'}
    subprocess.run(['node',str(ROOT/'tools/compose-manufacturing-077.cjs'),'--check'],cwd=ROOT,check=True)
    writes, payloads = {}, []
    with ZipFile(paths['.apk']) as old, ZipFile(paths['.zip']) as source:
        scope = source_scope(source)
        for loader_name,data_name,virtual,parts in SPECS:
            old_loader = old.read('assets/warzone/'+loader_name); data=old.read('assets/warzone/'+data_name)
            assert source.read('app/src/main/assets/warzone/'+loader_name)==old_loader
            assert source.read('app/src/main/assets/warzone/'+data_name)==data, 'APK/source payload mismatch'
            loader = old_loader.decode('utf-8'); start,end,_,metadata=HELPERS['package_call'](loader)
            verify_index(metadata,data)
            original={row['filename']:dict(row) for row in metadata['files']}
            assert len(original)==len(metadata['files']) and virtual in original
            target=original[virtual]
            assert data[target['start']:target['end']]==assembled(parts,source), 'Baseline VFS differs from complete source: '+virtual
            content=assembled(parts); final=data+content
            assert content!=assembled(parts,source), 'Expected reviewed manufacturing update'
            entries=[dict(row) for row in metadata['files']]
            next(row for row in entries if row['filename']==virtual).update(start=len(data),end=len(final))
            metadata.update(files=entries,remote_package_size=len(final),package_uuid='manufacturing086-'+digest(final)[:20])
            generated=(loader[:start]+'loadPackage('+json.dumps(metadata,separators=(',',':'))+')'+loader[end:]).encode('utf-8')
            a,b,_,parsed=HELPERS['package_call'](generated.decode('utf-8')); verify_index(parsed,final)
            body=loader[:start]+'PACKAGE_INDEX'+loader[end:]
            assert generated.decode('utf-8')[:a]+'PACKAGE_INDEX'+generated.decode('utf-8')[b:]==body
            assert final[:len(data)]==data and parsed['remote_package_size']==len(final)
            for row in parsed['files']:
                name=row['filename']
                if name==virtual:
                    assert row['start']==len(data) and row['end']==len(final) and final[row['start']:row['end']]==content
                else:
                    assert row==original[name] and final[row['start']:row['end']]==data[row['start']:row['end']], 'Other VFS entry changed: '+name
            for name,value,baseline in [(loader_name,generated,old_loader),(data_name,final,data)]:
                assert (ASSETS/name).read_bytes() in (baseline,value), 'Unreviewed current payload: '+name
                writes[name]=value
            payloads.append({'loader':loader_name,'data':data_name,'onlyChangedVirtualFile':virtual,'sourceAssembly':parts,
                'baselineDataBytes':len(data),'baselineDataSHA256':digest(data),'dataBytes':len(final),'dataSHA256':digest(final),
                'loaderSHA256':digest(generated),'sourceContentSHA256':digest(content),'runtimeBodySHA256':digest(body.encode('utf-8')),
                'originalDataPrefixUnchanged':True,'compiledProgramUnchanged':True,'unchangedOtherVirtualFiles':len(entries)-1})
        frozen=[]
        for name in old.namelist():
            if not name.startswith('assets/') or name.endswith('/') or not (name.endswith(('.wasm','.data')) or '/warzone2100' in name):continue
            relative=name.removeprefix('assets/'); local=ROOT/'app/src/main/assets'/relative
            if relative.startswith('warzone/') and relative.removeprefix('warzone/') in writes:continue
            assert local.is_file() and file_digest(local)==digest(old.read(name)), 'Frozen native payload changed: '+name
            frozen.append({'path':local.relative_to(ROOT).as_posix(),'sha256':file_digest(local)})
        for name,value in writes.items():
            target=ASSETS/name;temporary=target.with_name(target.name+'.v086.tmp');temporary.write_bytes(value);temporary.replace(target)
    inputs=['tools/embed-manufacturing-all-086.py','tools/compose-manufacturing-077.cjs','tools/compose-multiplayer-ui-077.cjs']
    report={'version':'0.86','passed':True,'emulatorUsed':False,'actualNativeEngineExecuted':False,'noNativeBuild':True,
        'fallbackSHA256':file_digest(FALLBACK),'sourceScope':scope,'payloads':payloads,'frozenNativeAssets':frozen,
        'sources':[{'path':p,'sha256':file_digest(ROOT/p)} for p in inputs]}
    REPORT.parent.mkdir(parents=True,exist_ok=True);REPORT.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'passed':True,'version':'0.86','payloads':payloads,'proof':REPORT.relative_to(ROOT).as_posix()}))


if __name__=='__main__':main()
