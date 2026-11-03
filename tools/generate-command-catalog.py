"""Read original packaged statistics and existing stock artwork; never edit them."""
from pathlib import Path
import json,re,hashlib,urllib.parse
ROOT=Path(__file__).resolve().parents[1]
assets=ROOT/'app/src/main/assets/warzone'
js=(assets/'warzone2100.js').read_text(encoding='utf8')
entries={n:(int(a),int(b)) for n,a,b in re.findall(r'\{filename:"([^"]+)",start:(\d+),end:(\d+)\}',js)}
data=(assets/'warzone2100.data').read_bytes()
images={p.stem.casefold():p.name for p in (assets/'research-icons').iterdir() if p.is_file()}
def picture(name):
    aliases={'Heavy Machinegun Guard Tower':'Machinegun Guard Tower','Heavy Machinegun Bunker':'Machinegun Bunker',
      'Command Relay Center':'Command Relay Post','Command Turret':'Command Turret',
      'Hardcrete Corner Wall':'Hardcrete Wall','Hardcrete Wall':'Improved Hardcrete',
      'Repair Turret':'Mobile Repair Turret','Construction Turret':'Engineering'}
    aliases.update({'Half-tracks':'Half-tracked Propulsion','Tracks':'Tracked Propulsion','Hover':'Hover Propulsion','VTOL':'VTOL Propulsion'})
    for body in ['Bug','Leopard','Retaliation']: aliases[body]='Light Body - '+body
    for body in ['Cobra','Panther','Retribution','Scorpion']: aliases[body]='Medium Body - '+body
    for body in ['Python','Tiger','Vengeance','Wyvern']: aliases[body]='Heavy Body - '+body
    aliases['Dragon']='Multi Turret Body - Dragon'
    filename=images.get(aliases.get(name,name).casefold())
    return 'research-icons/'+urllib.parse.quote(filename) if filename else None
def read_stats(filename):
    result={}
    paths=[p for p in entries if p.startswith('/data/mp/') and p.endswith('/stats/'+filename+'.json')]
    paths.sort(key=lambda p:('/diffs/' in p,p))
    for p in paths: result.update(json.loads(data[slice(*entries[p])]))
    return result
buildings=[]
for key,value in read_stats('structure').items():
    if value.get('type')=='DEMOLISH':continue
    kind=value.get('type','GENERIC')
    category='DEFENCES' if kind in ['DEFENSE','WALL','WALLCORNER','CORNER WALL','GATE','FORTRESS'] else 'MODULES' if 'MODULE' in kind else 'STRUCTURES'
    name=value.get('name',key)
    buildings.append({'id':key,'name':name,'kind':kind,'category':category,
      'width':value.get('width',1),'breadth':value.get('breadth',1),
      'power':value.get('buildPower',0),'points':value.get('buildPoints',0),
      'image':picture(name)})
components={}
for group,filename in [('Body','body'),('Propulsion','propulsion'),('Weapon','weapons'),
                       ('Sensor','sensor'),('Repair','repair'),('Construct','construction'),('ECM','ecm'),('Brain','brain')]:
    rows=[]
    for key,value in read_stats(filename).items():
        if not value.get('designable',False):continue
        if group in ['Sensor','Repair','ECM'] and value.get('location')!='TURRET':continue
        name=value.get('name',key)
        rows.append({'id':key,'name':name,'group':group,'power':value.get('buildPower',0),
          'image':picture(name),'slots':value.get('weaponSlots',1),
          'size':value.get('size'),'propulsionType':value.get('type'),
          'vtol':bool(value.get('vtolAttackRuns',0)),'weight':value.get('weight',0),
          'hitpoints':value.get('hitpoints',0)})
    components[group]=rows
catalog={'version':1,'buildings':buildings,'components':components}
text=json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n'
(assets/'command-catalog.json').write_text(text,encoding='utf8')
(ROOT/'scenario/warzone-towers-catalog.json').write_text(text,encoding='utf8')
print('Read',len(buildings),'original structure records and',sum(map(len,components.values())),'designable components; stock images:',sum(bool(x['image']) for x in buildings))
