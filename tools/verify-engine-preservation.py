"""Compare the stock engine and resolved stock assets against a frozen APK."""
from pathlib import Path
from zipfile import ZipFile
import argparse, hashlib, json, re

parser=argparse.ArgumentParser()
parser.add_argument('--baseline',required=True,type=Path)
parser.add_argument('--candidate',type=Path,default=Path('app/build/outputs/apk/debug/app-debug.apk'))
parser.add_argument('--report',type=Path)
args=parser.parse_args()
prefix='assets/warzone/'
pattern=r'loadPackage\(\{files:\[.*?\],remote_package_size:.*?\}\)'
with ZipFile(args.baseline) as old,ZipFile(args.candidate) as new:
    old_data=old.read(prefix+'warzone2100.data');new_data=new.read(prefix+'warzone2100.data')
    old_js=old.read(prefix+'warzone2100.js').decode();new_js=new.read(prefix+'warzone2100.js').decode()
    old_index=re.search(pattern,old_js);new_index=re.search(pattern,new_js)
    assert old_index and new_index,'Package index not found'
    old_code=re.sub(pattern,'loadPackage(PACKAGE_INDEX)',old_js)
    new_code=re.sub(pattern,'loadPackage(PACKAGE_INDEX)',new_js)
    assert old_code==new_code,'Official engine program changed'
    assert old.read(prefix+'warzone2100.wasm')==new.read(prefix+'warzone2100.wasm'),'Official WASM changed'
    assert new_data.startswith(old_data),'Frozen data prefix changed'
    entry_pattern=r'\{filename:"([^"]+)",start:(\d+),end:(\d+)\}'
    previous={name:(int(start),int(end)) for name,start,end in re.findall(entry_pattern,old_index.group())}
    current={name:(int(start),int(end)) for name,start,end in re.findall(entry_pattern,new_index.group())}
    custom={'/data/mp/tests/warzone-towers-bridge.js','/data/mp/tests/warzone-towers-rules.js','/data/mp/tests/warzone-towers-commands.js','/data/mp/tests/warzone-towers-catalog.json'}
    catalogue='/data/mp/tests/warzone-towers-catalog.json'
    old_catalogue=json.loads(old_data[slice(*previous[catalogue])])
    new_catalogue=json.loads(new_data[slice(*current[catalogue])])
    for value in (old_catalogue,new_catalogue):
        for item in value['buildings']:item.pop('image',None)
    assert old_catalogue==new_catalogue,'Catalogue gameplay statistics changed'
    count=0
    for name,(start,end) in previous.items():
        if name in custom:continue
        a,b=current[name]
        assert old_data[start:end]==new_data[a:b],f'Original asset changed: {name}'
        count+=1
    assert '/data/mp/tests/warzone-towers-control-command.json' in current
    root=Path(__file__).resolve().parents[1]
    editable=list((root/'app/src/main/assets').rglob('*'))
    checked=0
    for asset in editable:
        if asset.is_file():
            name='assets/'+asset.relative_to(root/'app/src/main/assets').as_posix()
            assert new.read(name)==asset.read_bytes(),f'Candidate is stale: {name} differs from editable source'
            checked+=1
    for name in custom:
        a,b=current[name]
        assert new_data[a:b]==(root/'scenario'/Path(name).name).read_bytes(),f'Embedded scenario is stale: {name}'
    changed_custom=sorted(name for name in custom if old_data[slice(*previous[name])]!=new_data[slice(*current[name])])
    assert changed_custom==['/data/mp/tests/warzone-towers-commands.js'],changed_custom
    queue_snapshot='''        researchQueues: enumStruct(selectedPlayer, RESEARCH_LAB).map(function(lab) {
            return {labId: lab.id, topicIds: (typeof blockNightV28Queues === "object" && blockNightV28Queues[String(lab.id)] || []).slice()};
        }),
'''
    command_path='/data/mp/tests/warzone-towers-commands.js'
    previous_commands=old_data[slice(*previous[command_path])].decode().replace('\r\n','\n')
    current_commands=new_data[slice(*current[command_path])].decode().replace('\r\n','\n')
    assert current_commands.count(queue_snapshot)==1
    remove_waiting_group = '            else if (command.action === "remove-production") {\n                const factory = getObject(STRUCTURE, selectedPlayer, Number(command.factoryId));\n                if (!factory || [FACTORY, CYBORG_FACTORY, VTOL_FACTORY].indexOf(factory.stattype) < 0) {\n                    wtcmd_answer(command, false, "factory-missing"); return;\n                }\n                const ids = Array.isArray(command.jobIds) ? command.jobIds : [command.jobId];\n                if (!ids.length || ids.length > 64 || ids.some(function (id) {\n                    return typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id);\n                })) { wtcmd_answer(command, false, "invalid"); return; }\n                const key = String(factory.id), jobs = wtcmd_production[key] || [];\n                const requested = new Set(ids), removed = jobs.filter(function (job) { return requested.has(job.id); });\n                // A unit may have started since the player touched its waiting group.\n                // Remove only exact IDs still waiting; active production is never touched.\n                if (!removed.length) { wtcmd_answer(command, false, "job-missing"); return; }\n                wtcmd_production[key] = jobs.filter(function (job) { return !requested.has(job.id); });\n                wtcmd_answer(command, true, "waiting-units-removed", {\n                    factoryId: factory.id, jobIds: removed.map(function (job) { return job.id; })\n                });\n            }\n'
    assert current_commands.count(remove_waiting_group)==1
    normalized_previous=previous_commands.replace(queue_snapshot,'').replace(remove_waiting_group,'')
    normalized_current=current_commands.replace(queue_snapshot,'').replace(remove_waiting_group,'')
    assert normalized_current==normalized_previous,'Native command adapter changed beyond the exact queue snapshot and scoped waiting-group removal'
    result={'passed':True,'candidateAPK_SHA256':hashlib.sha256(args.candidate.read_bytes()).hexdigest(),
        'officialEngineCodeIdentical':True,'wasmIdentical':True,'frozenDataPrefixPreserved':True,'catalogueGameplayStatisticsIdentical':True,
        'previousDataBytes':len(old_data),'newDataBytes':len(new_data),'unchangedResolvedAssets':count,
        'customBridgeOverride':sorted(custom),'normalizedEngineSHA256':hashlib.sha256(old_code.encode()).hexdigest(),
        'editableAssetsMatchCandidate':True,'checkedEditableAssetFiles':checked,'embeddedScenarioMatchesSource':True,
        'nativeCommandAdapterChangesVerified':['read-only laboratory queue snapshot','exact scoped waiting-group removal preserving active production'],'rulesAndOtherCustomScenarioBytesUnchanged':True}
    print(json.dumps(result,indent=2))
    if args.report:args.report.write_text(json.dumps(result,indent=2)+'\n')
