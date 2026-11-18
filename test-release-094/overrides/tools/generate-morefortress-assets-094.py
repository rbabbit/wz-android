"""Add MoreFortress catalog/art/display ghosts without changing any stock record or native data."""
from pathlib import Path
import ast, hashlib, json, math, mmap, re, shutil, zipfile

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'app/src/main/assets/warzone'
VENDOR=ROOT/'vendor/survival-094/original'
MOD=VENDOR/'MoreFortress-v0.6.wz'
ART=VENDOR/'More-Fortress-0.6.zip'
PICTURES={'X-Super-AA':('mf_aa_flak','AA_FLAK_FORT.png'),'X-Super-AG':('mf_assault_gun','AG_FORT.png'),
 'X-Super-Flame':('mf_flamer','FLAM_FORT.png'),'X-Super-Laser':('mf_laser','LAS_FORT.png'),
 'X-Super-RIM116':('mf_rim116','RIM116_FORT.png'),'X-Super-Howitzer':('mf_howitzer','H_FORT.png'),
 'Emplacement-ATGM':('mf_atgm_emplacement','ATGM_Emplacement.png')}
sha=lambda b:hashlib.sha256(b).hexdigest()

def main():
    if not ART.exists():shutil.copyfile(Path.home()/'Downloads/More-Fortress-0.6.zip',ART)
    assert sha(MOD.read_bytes())=='19d58e8d729387e11d431247fb6d5c24965b4814b7018a4bad3be3cc51b6b73b'
    with zipfile.ZipFile(MOD)as archive:
        payloads={name:archive.read(name)for name in archive.namelist()if not name.endswith('/')}
    structures=json.loads(payloads['diffs/MoreFort/stats/structure.json'])
    weapons=json.loads(payloads['diffs/MoreFort/stats/weapons.json'])
    assert set(structures)==set(PICTURES)and set(weapons)=={'AAGunSuper','AGFort','FlameSuper','LaserSuper','RIM116Super','HowitzerSuper','Rocket-ATGM'}
    artdir=ASSETS/'more-fortress-icons';artdir.mkdir(exist_ok=True)
    with zipfile.ZipFile(ART)as archive:
        for id,(slug,name)in PICTURES.items():
            raw=archive.read('More-Fortress-0.6/Pictures/'+name)
            (artdir/(slug+'.png')).write_bytes(raw)
            (ASSETS/'build-icons'/(id+'.png')).write_bytes(raw)
    catalog=json.loads((ASSETS/'command-catalog.json').read_text())
    stock_buildings={b['id']:b for b in catalog['buildings']if b['id']not in structures}
    stock_weapons={w['id']:w for w in catalog['components']['Weapon']if w['id']!='Rocket-ATGM'}
    catalog['buildings']=[b for b in catalog['buildings']if b['id']not in structures]
    for id,row in structures.items():
        catalog['buildings'].append({'id':id,'name':row['name'],'kind':row['type'],'category':'DEFENCES',
            'width':row['width'],'breadth':row['breadth'],'power':row['buildPower'],'points':row['buildPoints'],
            'image':'build-icons/'+id+'.png','rewardsOnly':True})
    row=weapons['Rocket-ATGM']
    catalog['components']['Weapon']=[w for w in catalog['components']['Weapon']if w['id']!='Rocket-ATGM']
    catalog['components']['Weapon'].append({'id':'Rocket-ATGM','name':'ATGM','group':'Weapon','power':row['buildPower'],
        'image':'more-fortress-icons/mf_atgm_emplacement.png','slots':1,'size':None,'propulsionType':None,
        'vtol':False,'weight':row['weight'],'hitpoints':row['hitpoints'],'rewardsOnly':True})
    assert stock_buildings=={b['id']:b for b in catalog['buildings']if b['id']not in structures}
    assert stock_weapons=={w['id']:w for w in catalog['components']['Weapon']if w['id']!='Rocket-ATGM'}
    text=json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n'
    (ASSETS/'command-catalog.json').write_text(text)
    (ROOT/'scenario/warzone-towers-catalog.json').write_text(text)

    index={name:(int(start),int(end))for name,start,end in re.findall(r'\{\s*"?filename"?\s*:\s*"([^"]+)"\s*,\s*"?start"?\s*:\s*(\d+)\s*,\s*"?end"?\s*:\s*(\d+)',(ASSETS/'warzone2100.js').read_text())}
    pie_paths={}
    for name in sorted(index,key=lambda name:(name.startswith('/data/mp/'),'/diffs/'in name,name)):
        if name.lower().endswith('.pie'):pie_paths[Path(name).name.lower()]=name
    for name in payloads:
        if name.lower().endswith('.pie'):pie_paths[Path(name).name.lower()]='mod:'+name
    with (ASSETS/'warzone2100.data').open('rb')as source,mmap.mmap(source.fileno(),0,access=mmap.ACCESS_READ)as data:
        def read(name):return payloads[name[4:]]if name.startswith('mod:')else data[slice(*index[name])]
        # Reuse only the established pure PIE parser/assembler, not its top-level generation.
        module=ast.parse((ROOT/'tools/extract-build-ghosts.py').read_text())
        functions=[node for node in module.body if isinstance(node,ast.FunctionDef)and node.name in ('mesh','assembled')]
        namespace={'re':re,'math':math,'sha256':hashlib.sha256,'read':read,'pie_paths':pie_paths,
            'sources':{},'cache':{},'components':{'weapons':weapons,'sensor':{},'ecm':{},'repair':{},'brain':{}}}
        exec(compile(ast.Module(body=functions,type_ignores=[]),'retained-pie-parser','exec'),namespace)
        ghosts=json.loads((ASSETS/'build-ghost-models.json').read_text())
        stock_ghosts={key:value for key,value in ghosts['models'].items()if key not in structures}
        for id,row in structures.items():
            model=namespace['assembled'](row)
            assert model and model['p']and model['f']and model['structureBounds'],id
            ghosts['models'][id]=model
        assert stock_ghosts=={key:value for key,value in ghosts['models'].items()if key not in structures}
        (ASSETS/'build-ghost-models.json').write_text(json.dumps(ghosts,separators=(',',':'))+'\n')
    report={'modSHA256':sha(MOD.read_bytes()),'sourcePicturesSHA256':sha(ART.read_bytes()),
        'newStructures':list(structures),'newDesignableWeapon':'Rocket-ATGM','stockBuildingRecordsPreserved':len(stock_buildings),
        'stockWeaponRecordsPreserved':len(stock_weapons),'stockGhostsPreserved':len(stock_ghosts),
        'catalogSHA256':sha(text.encode()),'ghostSHA256':sha((ASSETS/'build-ghost-models.json').read_bytes()),
        'meshes':namespace['sources'],'researchAdded':False,'nativeDataModified':False}
    output=ROOT/'qa/survival-094/morefortress-assets.json';output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({key:value for key,value in report.items()if key!='meshes'}))

if __name__=='__main__':main()
