"""Audit original authored structure caps/module owners for all six FFA maps.

Models only native cap/order/module-parent checks from cached 4.7 source. Does
not claim engine execution, construction-site/pathfinding or gameplay evidence.
"""
from pathlib import Path
from zipfile import ZipFile
from collections import Counter
from hashlib import sha256
import json
import math
import runpy

ROOT=Path(__file__).resolve().parents[1]
HELPERS=runpy.run_path(str(ROOT/'tools/build-ffa-maps-066.py'),run_name='ffa_authored_limit_checks')
MODULE_OWNERS={'POWER MODULE':{'POWER GENERATOR'},'RESEARCH MODULE':{'RESEARCH'},'FACTORY MODULE':{'FACTORY','VTOL FACTORY'}}
MODULE_MAX={'POWER GENERATOR':1,'RESEARCH':1,'FACTORY':2,'VTOL FACTORY':2}


def load_stats():
    rows=json.loads((ROOT/'vendor/duel-stock/package-index.json').read_text());record=next(row for row in rows if row['filename']=='/data/mp/stats/structure.json')
    with (ROOT/'app/src/main/assets/warzone/warzone2100.data').open('rb') as stream:stream.seek(record['start']);return json.loads(stream.read(record['end']-record['start']))


def simulate(structures,stats,overrides):
    counts=Counter();tiles={};dropped=[];orphans=[];standalone=0;embedded=0
    for row in structures:
        id=row['name'];stat=stats[id];kind=stat['type'];owner=HELPERS['owner'](row);pos=HELPERS['position'](row);x,y=pos[0]/128,pos[1]/128
        if kind in MODULE_OWNERS:
            standalone+=1;parent=tiles.get((owner,math.floor(x),math.floor(y)))
            if not parent or parent['kind'] not in MODULE_OWNERS[kind]:orphans.append({'owner':owner,'module':id,'x':x,'y':y})
            else:
                parent['modules']+=1
                assert parent['modules']<=MODULE_MAX[parent['kind']],('too many authored modules',id,owner,x,y)
            continue
        cap=overrides.get(id,stat.get('userLimits',[0,65535,65535])[1])
        if counts[owner,id]>=cap:dropped.append({'owner':owner,'id':id,'x':x,'y':y});continue
        counts[owner,id]+=1
        modules=int(row.get('modules',0));embedded+=modules
        if modules:assert kind in MODULE_MAX and modules<=MODULE_MAX[kind],('invalid embedded module',id,owner,modules)
        parent={'kind':kind,'modules':modules}
        # Native getTileStructure checks the tile occupied by the parent,
        # including odd/even footprints; module coordinates need not be its
        # exact centre. Raw JSON/INI ordering and authored ownership are kept.
        width,breadth=stat['width'],stat['breadth'];left,top=math.floor(x-width/2),math.floor(y-breadth/2)
        for tx in range(left,left+width):
            for ty in range(top,top+breadth):tiles[owner,tx,ty]=parent
    return {'dropped':dropped,'orphanModules':orphans,'standaloneModules':standalone,'embeddedModules':embedded,'loadedCounts':{owner:{id:count for (player,id),count in counts.items() if player==owner} for owner in sorted({player for player,id in counts})}}


def main():
    stats=load_stats();assert stats['A0PowerGenerator']['userLimits']==[0,10,10]
    proof=json.loads((ROOT/'vendor/ffa-maps/PROVENANCE.json').read_text());preload=json.loads((ROOT/'archive/ffa-maps-0.66-preload-checks.json').read_text())
    source=json.loads((ROOT/'scenario/ffa/maps-source.json').read_text());by_preload={row['id']:row for row in preload['mapStructureLimits']}
    results=[]
    for row,map_proof in zip(source['maps'],proof['maps']):
        archive_path=ROOT/row['source'];assert sha256(archive_path.read_bytes()).hexdigest()==row['sourceSHA256']
        with ZipFile(archive_path) as archive:
            folder='' if 'level.json' in archive.namelist() else 'multiplay/maps/4c-Ng-TemplarFFA/'
            structures=HELPERS['objects'](archive,folder,'structure')
        overrides=map_proof['requiredInitialStructureLimits'];assert overrides==by_preload[row['id']]['overrides']
        before=simulate(structures,stats,{})
        after=simulate(structures,stats,overrides)
        assert not after['dropped'] and not after['orphanModules'],(row['id'],after)
        for owner,counts in map_proof['baseCounts'].items():
            for id,count in counts.items():
                if stats[id]['type'] not in MODULE_OWNERS:assert after['loadedCounts'][owner][id]==count,(row['id'],owner,id)
        if row['id']=='contact':
            assert overrides=={'A0PowerGenerator':14}
            assert Counter(value['owner'] for value in before['dropped'])=={'0':3,'1':3,'2':3,'3':4}
            assert before['orphanModules'],'Unpatched stock cap must reproduce missing module owners'
        else:assert overrides=={} and not before['dropped'] and not before['orphanModules'],row['id']
        results.append({'id':row['id'],'overrides':overrides,'stockRejectedStructures':len(before['dropped']),'stockOrphanModules':len(before['orphanModules']),
            'authoredStructuresPreserved':len(structures),'standaloneModules':after['standaloneModules'],'embeddedModules':after['embeddedModules'],'afterRejectedStructures':0,'afterOrphanModules':0})
    report={'version':'0.66','passed':True,'actualNativeEngineExecuted':False,'allSixMapsAudited':True,'contactOnlyInitialLimitTuple':[0,14,14],
        'nativeSourceEvidence':{'structure.cpp':'568-595 userLimits default/max;1521 cap check before build','game.cpp':'3298-3308 initial map load;6334 module parent lookup'},'maps':results,
        'publicCatalogueSHA256':sha256((ROOT/'app/src/main/assets/ffa-maps.json').read_bytes()).hexdigest()}
    assert report['publicCatalogueSHA256']=='d6c626637d573349d5ec02ef377624b54442ec96c52967789d61163c525bf098'
    (ROOT/'archive/ffa-maps-0.66-structure-checks.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({'passed':True,'allSixMapsAudited':True,'maps':results},indent=2))


if __name__=='__main__':main()
