"""Focused static checks; never starts a game or advances any native wave."""
from pathlib import Path
from hashlib import sha256
from io import BytesIO
from zipfile import ZipFile
import configparser
import json
import re
import runpy
import subprocess

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'app/src/main/assets/warzone'
SOURCE=ROOT/'scenario/survival'
VENDOR=ROOT/'vendor/survival-094'
package_call=runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'))['package_call']
checks=[]
def check(value,label):
    if not value:raise AssertionError(label)
    checks.append(label)
def digest(data):return sha256(data).hexdigest()
def package(name,data):
    script=(ASSETS/name).read_text(encoding='utf8');_,_,_,metadata=package_call(script)
    raw=(ASSETS/data).read_bytes();index={row['filename']:row for row in metadata['files']}
    check(len(index)==len(metadata['files']) and metadata['remote_package_size']==len(raw),'Valid unique offsets/length: '+name)
    check(all(0<=row['start']<=row['end']<=len(raw) for row in index.values()),'All offsets bounded: '+name)
    return script,metadata,lambda path:raw[index[path]['start']:index[path]['end']],index


def main():
    baseline=json.loads((VENDOR/'towers-093-input.json').read_text())
    towers,tm,tr,ti=package('warzone2100-towers-052.js','warzone2100.data')
    survival,sm,sr,si=package('warzone2100-survival.js','warzone2100-survival.data')
    base=(ASSETS/'warzone2100.data').read_bytes()[:baseline['bytes']]
    check(digest(base)==baseline['sha256'],'Frozen0.93 original data prefix preserved')
    originals={row['filename']:base[row['start']:row['end']] for row in baseline['metadata']['files']}
    for name,expected in baseline['wasm'].items():check(digest((ASSETS/name).read_bytes())==expected,'Frozen0.93 WASM unchanged: '+name)
    check(tr('/data/mp/stats/research.json')==sr('/data/mp/stats/research.json')==originals['/data/mp/stats/research.json'],'No MoreFortress research or research-tree changes')
    fort=ZipFile(VENDOR/'original/MoreFortress-v0.6.wz')
    for kind in ('structure','weapons'):
        additions=json.loads(fort.read('diffs/MoreFort/stats/'+kind+'.json'))
        old=json.loads(originals['/data/mp/stats/'+kind+'.json']);new=json.loads(tr('/data/mp/stats/'+kind+'.json'))
        check(set(new)==set(old)|set(additions),'Only7additive MoreFortress '+kind+' entries')
        check(all(new[key]==value for key,value in old.items()),'Every existing Towers '+kind+' stat preserved')
        check(all(new[key]==value for key,value in additions.items()),'Supplied MoreFortress '+kind+' fields unchanged')
    check(not any('/diffs/MoreFort/' in path for path in ti|si),'MoreFortress research diffs not mounted')
    maps=json.loads((SOURCE/'maps.json').read_text())['maps']
    outer=ZipFile(VENDOR/'original/emag-survival.zip')
    mod=ZipFile(BytesIO(outer.read(next(name for name in outer.namelist() if name.endswith('emag td.zip')))))
    check(sr('/data/mp/config.js')==mod.read('config.js'),'Supplied60-round configuration byte-identical')
    for row in maps:
        prefix='/data/mp/multiplay/maps/survival-'+row['id']
        archive=ZipFile(BytesIO(outer.read(row['sourceEntry'])))
        original='multiplay/maps/'+row['folder']
        check(sr(prefix+'/game.map')==archive.read(original+'/game.map') and sr(prefix+'/ttypes.ttp')==archive.read(original+'/ttypes.ttp'),'Terrain and tile types unchanged: '+row['id'])
        for name,container in [('struct.json','structures'),('droid.json','droids')]:
            objects=json.loads(sr(prefix+'/'+name))
            check(objects['version']==2 and all(item['startpos'] in (0,1) for item in objects[container]),'Supported native JSON/no unused2–4 objects: '+row['id']+'/'+name)
            source=configparser.ConfigParser(interpolation=None);source.read_string((SOURCE/'maps'/row['id']/name.replace('.json','.ini')).read_text())
            check(len(source.sections())==len(objects[container]),'Selected object counts preserved: '+row['id']+'/'+name)
            exact=True
            for item in objects[container]:
                original=next(source[section] for section in source.sections() if source[section].getint('id')==item['id'])
                exact=exact and item['position']==[int(x.strip()) for x in original['position'].split(',')[:2]] \
                    and item['rotation']==int(original['rotation'].split(',')[0]) and item.get('modules',0)==original.getint('modules',fallback=0) \
                    and item['startpos']==1-original.getint('startpos')
            check(exact,'Exact native geometry/modules and start0/1 swap: '+row['id']+'/'+name)
            if container=='structures':
                own=[item for item in objects[container] if item['startpos']==0]
                check(len(own)==sum(row['humanStructures'].values())
                    and next(item for item in own if item['name']=='A0CommandCentre')['position']==[int(x.strip()) for x in row['humanHQ']['position'].split(',')[:2]],
                    'Human start0 retains original corner1 base/HQ geometry: '+row['id'])
            else: check(sum(item['startpos']==0 for item in objects[container])==row['humanTrucks'],'Human start0 retains original corner1 trucks: '+row['id'])
        check(not any(path.startswith(prefix+'/') and path.endswith('.bjo') for path in si),'No duplicate unfiltered binary objects: '+row['id'])
        challenge=json.loads(sr('/data/mp/tests/survival-'+row['id']+'.json'))
        check(challenge['challenge']['maxPlayers']==2 and challenge['player_0']['position']==0 and challenge['player_1']['position']==1,'Explicit human0/enemy1 and Ready-row alignment: '+row['id'])
        check(challenge['challenge']['map']==row['level'] and len(row['level'])<=19,'Distinct saveable native level: '+row['id'])
        check((ASSETS/row['preview']).is_file(),'Actual map preview generated: '+row['id'])
    rules=sr('/data/mp/multiplay/script/rules/init.js').decode()
    check(rules.count('rules/includes.js')==1 and rules.count('warzone-towers-waves.js')==1,'Exactly one supplied scheduler and one HUD observer')
    check('survival-policy.js' in rules and 'reward-context-094.js' in rules,'Native identity and reward profile guards included')
    native=sr('/data/mp/tests/reward-context-094.js').decode()
    check('typeof mapName' in native and 'campaignMobileState()' not in native,'Reward scope uses available native read-only map identity')
    contexts=json.loads(sr('/data/mp/tests/reward-context-094.json'))
    check(contexts['Survival-TDN2-T1']=={'profile':'survival','map':'tdn2'} and contexts['Greenhaven-T1']=={'profile':'towers','map':'beginner'},'Separate actual Waves/Survival purchase profiles')
    html=(ASSETS/'index-survival.html').read_text()
    check("'/warzone2100-survival-' + survivalMap.id" in html and "'--skirmish=survival-'" in html,'Separate config/save namespace and challenge launch')
    check("warzone2100-towers-052.wasm" in html and 'warzone2100-survival.js' in html,'Matched frozen Towers native program reused')
    # Compile only: supplied JS is inspected/parsed, not run as game code.
    paths=sorted(set(SOURCE.rglob('*.js')) | {ROOT/'app/src/main/assets/warzone-html-session.js',ROOT/'app/src/main/assets/warzone-towers-wave-hud.js',ASSETS/'saved-games.js'})
    for path in paths:
        result=subprocess.run(['node','--check',str(path)],capture_output=True,text=True)
        check(result.returncode==0,'JavaScript syntax: '+path.relative_to(ROOT).as_posix())
    # Execute the reviewed declarative config DSL in a bounded VM only. This
    # collects authored counts; there are no engine/network/filesystem bindings.
    program="""const fs=require('fs'),vm=require('vm');const context=vm.createContext({});
vm.runInContext('let actions=[];let totalRounds=0;let researchDelayMs=0;let powerRewardFunction;',context);
vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),context,{timeout:1000});
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),context,{timeout:1000});
const result=vm.runInContext('({actions,totalRounds,researchDelayMs})',context);console.log(JSON.stringify(result));"""
    result=subprocess.run(['node','-e',program,str(SOURCE/'supplied/multiplay/script/mods/configAPI.js'),str(SOURCE/'supplied/config.js')],capture_output=True,text=True,check=True)
    schedule=json.loads(result.stdout);actions=schedule['actions'];first=[]
    for action in actions[2:]:
        if action['type']!='spawn':break
        first.append(action)
    check(schedule['totalRounds']==60 and schedule['researchDelayMs']==360000,'Authored60-round configuration/static research delay')
    check(actions[0]=={'type':'wait','seconds':240} and sum(a['count'] for a in first)==120,'Authored initial240seconds and120first-wave units')
    check(actions[2+len(first)]=={'type':'wait','seconds':25},'First-to-second authored wait remains25seconds')
    guard_program=r"""const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=process.argv[1],read=name=>fs.readFileSync(root+'/'+name,'utf8');
const mappings=JSON.parse(read('maps.json')).maps;const profiles={'Greenhaven-T1':{profile:'towers',map:'beginner'}};
for(const m of mappings)profiles[m.level]={profile:'survival',map:m.id};
const provider=read('reward-context.js'),policy=read('policy.js');
function ctx(level='Survival-TDN2-T1',map='tdn2'){const cfg={mode:'survival',map,level:map==='tdn2'?'Survival-TDN2-T1':'Survival-Wave-T1'};
return vm.createContext({mapName:level,selectedPlayer:0,maxPlayers:2,scavAI:1,IS_HACK:false,playerData:[{isHuman:true},{isAI:true}],namespace:()=>{},includeJSON:name=>name==='survival-config.json'?cfg:profiles});}
let c=ctx();vm.runInContext(provider+'\n'+policy,c);assert.equal(vm.runInContext('survivalValidateIdentity()',c),true);
assert.equal(vm.runInContext('survivalIdentity.map',c),'tdn2');
assert.equal(JSON.stringify(vm.runInContext('wt_rewardContext()',c)),JSON.stringify({profile:'survival',map:'tdn2'}));
c.mapName='Greenhaven-T1';assert.equal(JSON.stringify(vm.runInContext('wt_rewardContext()',c)),JSON.stringify({profile:'towers',map:'beginner'}));
assert.throws(()=>vm.runInContext('survivalValidateIdentity()',c));
c.mapName='CAM_1A';assert.equal(vm.runInContext('wt_rewardContext()',c),null);
c=ctx('Survival-Wave-T1','wave');vm.runInContext(provider+'\n'+policy,c);assert.equal(vm.runInContext('survivalValidateIdentity()',c),true);
vm.runInContext('survivalIdentity.map="tdn2"',c);assert.throws(()=>vm.runInContext('survivalValidateIdentity()',c));
c=ctx();c.playerData[1].isAI=false;vm.runInContext(provider+'\n'+policy,c);assert.throws(()=>vm.runInContext('survivalValidateIdentity()',c));
c=ctx();c.playerData[0].isHuman=false;vm.runInContext(provider,c);assert.equal(vm.runInContext('wt_rewardContext()',c),null);
console.log('8 actual-source native profile/identity guard cases passed');"""
    guards=subprocess.run(['node','-e',guard_program,str(SOURCE)],capture_output=True,text=True)
    check(guards.returncode==0,'Actual-source profile guards: correct maps/closed foreign modes/mismatched save/roles: '+guards.stdout.strip())
    if guards.returncode:raise AssertionError(guards.stderr)
    proof={'passed':True,'checks':len(checks),'results':checks,'nativeWavesExecuted':0,'laterWaveGameplayTested':False,
           'scope':'Static packaging/syntax/profile/config checks only; exact APK early-game verification belongs to root.'}
    (SOURCE/'STATIC-CHECKS.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'passed':True,'checks':len(checks),'nativeWavesExecuted':0,'laterWaveGameplayTested':False}))


if __name__=='__main__':main()
