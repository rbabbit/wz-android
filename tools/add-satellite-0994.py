from pathlib import Path
import json, runpy, shutil, uuid

R=Path('C:/timerApp/candidates/icons-spacing-0.99.2-test-20261119')
Q=Path('C:/timerApp/satellite-support-0994-20261119');Q.mkdir(exist_ok=True)
changed=[]
def write(path,content):
    rel=path.relative_to(R);backup=Q/'before'/rel
    if path.exists() and not backup.exists():
        backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,backup)
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_name(path.name+'.satellite-tmp')
    tmp.write_bytes(content.encode('utf8') if isinstance(content,str) else content);tmp.replace(path)
    changed.append(str(rel).replace('\\','/'))
def edit(name,fn):
    p=R/name;write(p,fn(p.read_text(encoding='utf8')))
java='app/src/main/java/com/rbabbit/blocknight/warzone/'
edit(java+'RewardCatalog.java',lambda s:s.replace(
    '    boolean structure() {',
    '    boolean purchasable() { return !"mf_atgm_design".equals(id); }\n    boolean structure() {').replace(
    '      building("laser_sat",',
    '      building("satellite_uplink", "Satellite Uplink Centre", "Support", 100, "A0Sat-linkCentre", false, 1),\n      building("laser_sat",'))
edit(java+'RewardsView.java',lambda s:s.replace(
    'category.equals(item.category)&&eligible(item)',
    'item.purchasable()&&category.equals(item.category)&&eligible(item)').replace(
    '"laser_sat".equals(item.id) || item.nativeId.isEmpty()',
    'item.maxPerMatch == 1 || item.nativeId.isEmpty()').replace(
    'if ("laser_sat".equals(item.id)) available',
    'if (item.structure() && item.maxPerMatch == 1) available').replace(
    '            case "laser_sat":',
    '            case "satellite_uplink": filename = "Satellite Uplink Centre.gif"; break;\n            case "laser_sat":'))
edit(java+'RewardLedger.java',lambda s:s.replace(
    '    RewardCatalog.requireEligible(item,profile,map);\n    if (quantity <',
    '    RewardCatalog.requireEligible(item,profile,map);\n    if (!item.purchasable()) throw new IllegalArgumentException("This item is no longer sold.");\n    if (quantity <').replace(
    '    RewardCatalog.requireEligible(item,run.profile,run.map);',
    '    RewardCatalog.requireEligible(item,run.profile,run.map);\n    if (!item.purchasable()) throw new IllegalArgumentException("This item is no longer sold.");').replace(
    'if ("laser_sat".equals(id) && owned(id) + quantity > 1)',
    'if (item.structure() && item.maxPerMatch == 1 && owned(id) + quantity > 1)').replace(
    '"You can store one Laser Satellite Command Post."',
    '"You can store one " + item.name + "."').replace(
    'if ("laser_sat".equals(itemId) && owned(itemId) + quantity > 1)',
    'if (item.structure() && item.maxPerMatch == 1 && owned(itemId) + quantity > 1)').replace(
    '"You can own one Laser Satellite Command Post."',
    '"You can own one " + item.name + "."'))
edit('app/build.gradle.kts',lambda s:s.replace('versionCode = 103','versionCode = 104').replace('versionName = "0.99.3"','versionName = "0.99.4"'))

# Replace only reward-stock virtual scripts in the existing three data packages.
# Append bytes and repoint their index entries; preserve all other engine/data bytes.
helper=runpy.run_path('C:/timerApp/candidates/challenge-test-0.99-20261118/tools/integrate-native-runtime.py',run_name='satellite_packaging')
package_call=helper['package_call'];W=R/'app/src/main/assets/warzone'
anchor='    laser_sat:{id:"A0LasSatCommand",research:"R-Wpn-LasSat"},'
addition='    satellite_uplink:{id:"A0Sat-linkCentre",research:"R-Sys-Sensor-UpLink",max:1},\n'
groups=[('warzone2100.data',['warzone2100.js','warzone2100-towers-052.js']),
        ('warzone2100-survival.data',['warzone2100-survival.js']),
        ('warzone2100-challenge.data',['warzone2100-challenge.js'])]
native_sources=[]
for data_name,loaders in groups:
    data=bytearray((W/data_name).read_bytes())
    first=(W/loaders[0]).read_text(encoding='utf8');_,_,_,index=package_call(first)
    replacements={}
    for row in index['files']:
        if row['filename'].rsplit('/',1)[-1] not in ('warzone-towers-rewards.js','challenge-reward-stock.js'):continue
        script=bytes(data[row['start']:row['end']]).decode('utf8')
        if anchor not in script:raise RuntimeError('Reward source anchor missing: '+row['filename'])
        script=script.replace(anchor,anchor+'\n'+addition.rstrip('\n'),1)
        offset=len(data);data.extend(script.encode('utf8'));replacements[row['filename']]=(offset,len(data))
        source=Q/'native-source'/data_name/row['filename'].lstrip('/')
        source.parent.mkdir(parents=True,exist_ok=True);source.write_text(script,encoding='utf8')
        native_sources.append(str(source.relative_to(Q)).replace('\\','/'))
    if not replacements:raise RuntimeError('Reward script absent: '+data_name)
    write(W/data_name,data)
    package_uuid=str(uuid.uuid4())
    for loader in loaders:
        text=(W/loader).read_text(encoding='utf8');start,end,_,meta=package_call(text)
        for row in meta['files']:
            if row['filename'] in replacements:row['start'],row['end']=replacements[row['filename']]
        meta['remote_package_size']=len(data);meta['package_uuid']=package_uuid
        write(W/loader,text[:start]+'loadPackage('+json.dumps(meta,separators=(',',':'))+')'+text[end:])
(Q/'CHANGES.json').write_text(json.dumps({'version':'0.99.4','versionCode':104,'changedFiles':changed,'nativeSources':native_sources,
    'satellite':{'id':'satellite_uplink','structure':'A0Sat-linkCentre','price':100,'maxPerMatch':1},
    'retiredShopItem':'mf_atgm_design','legacyInventoryRetained':True,'testsRun':False,'emulatorRun':False,'published':False},indent=2))
print('Satellite Support added; ATGM design licence removed from sale. Native data repackaged; no tests run.')
