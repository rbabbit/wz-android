"""Build the isolated two-player Challenge payload from retained stock data.

Map and bot archives are read as data. The unrelated waves ZIP is retained as
provenance only and is never installed. Existing FFA/Towers runtimes are frozen.
"""
from pathlib import Path, PurePosixPath
from hashlib import sha256
from zipfile import ZipFile
from copy import deepcopy
from collections import Counter
import argparse, configparser, io, json, re, runpy, struct
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'app/src/main/assets'
WZ=ASSETS/'warzone'
SOURCE=ROOT/'scenario/challenge'
ORIGINAL=ROOT/'vendor/challenge-099/original'
STOCK_SIZE=64424618
STOCK_SHA='9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424'
SPECS=[
 ('firefight','DA-firefight1x1b','FFA-CHFFIGHT-T1','arizona'),
 ('towers2','DA-towers2','FFA-CHTOWERS-T1','rockies'),
 ('hells-pass','HellsPass','FFA-CHHELLS-T1','arizona'),
 ('fort-scav','DO-FortScavWar2p','FFA-CHFORTSCAV-T1','arizona'),
 ('dramatic-scavs','DramaticScavs','FFA-CHDRAMATIC-T1','arizona'),
 ('earthsea','Earthsea','FFA-CHEARTHSEA-T1','arizona'),
 ('cross-flair','H_Cross_Flair_3','FFA-CHCROSS-T1','urban'),
 ('no-hill','NO_HILL','FFA-CHNOHILL-T1','arizona'),
 ('face-to-face','RQ_face2face','FFA-CHFACE-T1','arizona'),
 ('startup2','StartUp2','FFA-CHSTARTUP-T1','arizona')]

def require(ok,message):
 if not ok:raise RuntimeError(message)
def digest(data):return sha256(data).hexdigest()
def write(path,value):
 path.parent.mkdir(parents=True,exist_ok=True)
 # New Challenge outputs only. Break an existing hardlink before rebuilding.
 value=value.encode('utf-8')if isinstance(value,str)else value
 temp=path.with_name(path.name+'.challenge-tmp');require(not temp.exists(),'Preserve partial output '+str(temp));temp.write_bytes(value);temp.replace(path)
def dump(path,value):write(path,json.dumps(value,indent=2,ensure_ascii=False)+'\n')
def replace(text,before,after):
 require(text.count(before)==1,'Source anchor changed '+before[:80]);return text.replace(before,after,1)
def position(row):
 v=row['position'];return[float(x)for x in v.split(',')]if isinstance(v,str)else v
def owner(row):return str(row.get('startpos',row.get('player','neutral')))

class Stock:
 def __init__(self):
  self.data=(WZ/'warzone2100.data').read_bytes()[:STOCK_SIZE]
  require(digest(self.data)==STOCK_SHA,'Stock prefix changed')
  self.files=json.loads((ROOT/'vendor/duel-stock/package-index.json').read_text());self.index={e['filename']:e for e in self.files}
  require(len(self.files)==len(self.index),'Duplicate stock path')
 def read(self,path):
  e=self.index[path];return self.data[e['start']:e['end']]
 def text(self,path):return self.read(path).decode('utf-8')
 def json(self,path):return json.loads(self.read(path))

def objects(archive,folder,kind):
 key={'droid':'droids','struct':'structures','feature':'features'}[kind]
 for extension in ('json','ini','bjo'):
  base={'droid':'dinit','feature':'feat','struct':'struct'}[kind]if extension=='bjo'else kind
  path=folder+base+'.'+extension
  if path not in archive.namelist():continue
  raw=archive.read(path)
  if extension=='json':
   value=json.loads(raw)[key];return list(value.values())if isinstance(value,dict)else value
  if extension=='ini':
   parser=configparser.ConfigParser(interpolation=None);parser.read_string(raw.decode('utf-8-sig'));return[dict(parser[s])for s in parser.sections()]
  magic,version,count=struct.unpack_from('<4sII',raw)
  stride=120 if kind=='struct'else 76
  require(version==8 and len(raw)==12+count*stride,'Unsupported map binary object format '+path)
  rows=[]
  for i in range(count):
   at=12+i*stride;fields=struct.unpack_from('<9I',raw,at+40)
   rows.append({'name':raw[at:at+40].split(b'\0')[0].decode('utf-8'),'id':fields[0],
    'position':list(fields[1:4]),'player':'scavenger'if fields[5]==7 else fields[5]})
  return rows
 raise RuntimeError('Missing authored '+kind+' data')

def preview(row,terrain,heights,starts,oil):
 width,height=row['width'],row['height']
 palette={0:(132,117,81),1:(120,108,78),2:(156,130,92),3:(111,104,79),4:(145,113,87),5:(153,113,95),6:(176,155,113),7:(47,104,129),8:(88,83,74),9:(122,112,100),10:(150,170,175),11:(104,138,145)}
 if row['tileset']=='urban':palette.update({0:(121,119,103),1:(98,109,99),2:(127,120,106),6:(88,91,92)})
 if row['tileset']=='rockies':palette.update({0:(139,144,135),1:(115,125,110),2:(160,165,159),6:(180,185,182)})
 pixels=[]
 for y in range(height):
  for x in range(width):
   i=y*width+x;shade=max(.65,min(1.3,1+(heights[i]-heights[y*width+max(0,x-1)])*.002-(heights[i]-heights[max(0,y-1)*width+x])*.002))
   pixels.append(tuple(max(0,min(255,round(c*shade)))for c in palette.get(terrain[i],(120,120,110))))
 image=Image.new('RGB',(width,height));image.putdata(pixels);image=image.resize((width*4,height*4),Image.Resampling.NEAREST);draw=ImageDraw.Draw(image)
 for x,y in oil:
  x,y=x/32,y/32;draw.ellipse((x-1.8,y-1.8,x+1.8,y+1.8),fill=(243,196,76))
 try:font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf',18)
 except OSError:font=ImageFont.load_default()
 for start in starts:
  x,y=start['x']*4,start['y']*4;draw.ellipse((x-12,y-12,x+12,y+12),fill=(78,168,219)if start['player']==0 else(203,80,65),outline=(245,245,235),width=2)
  label=str(start['player']+1);box=draw.textbbox((0,0),label,font=font);draw.text((x-(box[2]-box[0])/2,y-11),label,font=font,fill=(255,255,255))
 p=ASSETS/row['preview'];p.parent.mkdir(parents=True,exist_ok=True);image.save(p)

def import_maps(supplied,stock):
 retained=ORIGINAL/'1v1-maps.zip'
 if supplied:
  raw=supplied.read_bytes()
  if retained.exists():require(retained.read_bytes()==raw,'Retained supplied ZIP changed')
  else:write(retained,raw)
 require(retained.is_file(),'Retain supplied ZIP with --import-zip')
 catalogue=[];proofs=[];structureStats=stock.json('/data/mp/stats/structure.json')
 with ZipFile(retained)as outer:
  names=[n for n in outer.namelist()if not n.endswith('/')]
  require(len(names)==len(set(names))==12,'Unexpected supplied input inventory')
  for n in names:require(not PurePosixPath(n).is_absolute()and'..'not in PurePosixPath(n).parts,'Unsafe archive member')
  require(sum(n.endswith('.wz')for n in names)==10,'Expected ten authored maps')
  for id,name,level,tileset in SPECS:
   matches=[n for n in names if n.endswith('.wz')and re.sub(r'^2[cp]-','',n.split('/')[-1]).startswith(name)]
   require(len(matches)==1,'Map source not unique '+id);member=matches[0];raw=outer.read(member)
   path=ORIGINAL/'maps'/(id+'.wz')
   if path.exists():require(path.read_bytes()==raw,'Retained map changed '+id)
   else:write(path,raw)
   with ZipFile(io.BytesIO(raw))as archive:
    allnames=[n for n in archive.namelist()if not n.endswith('/')]
    gm=next(n for n in allnames if n.endswith('game.map'));folder=gm[:-8];modern=folder==''
    metadata=json.loads(archive.read('level.json'))if modern else{'name':name,'players':2,'tileset':tileset,'author':{'name':'Not specified in supplied archive'},'spdx-license-id':'Not specified in supplied archive'}
    require(metadata['players']==2 and metadata['tileset']==tileset,'Two-player map metadata differs '+id)
    mraw=archive.read(gm);version,width,height=struct.unpack_from('<III',mraw,4);require(mraw[:4]==b'map 'and version in(10,40),'Unsupported terrain '+id)
    bpp=4 if version==40 else 3;require(len(mraw)>=16+width*height*bpp,'Truncated terrain '+id)
    textures=[struct.unpack_from('<H',mraw,16+i*bpp)[0]&0x1ff for i in range(width*height)]
    heights=[struct.unpack_from('<H',mraw,18+i*bpp)[0]if bpp==4 else mraw[18+i*bpp]*2 for i in range(width*height)]
    t=archive.read(folder+'ttypes.ttp');count=struct.unpack_from('<I',t,8)[0];types=struct.unpack_from('<'+'H'*count,t,12);require(max(textures)<count,'Missing texture type')
    terrain=[types[n]for n in textures];structures=objects(archive,folder,'struct');droids=objects(archive,folder,'droid');features=objects(archive,folder,'feature')
    starts=[];baseCounts={};limits={}
    for player in(0,1):
     own=[s for s in structures if owner(s)==str(player)];hq=[s for s in own if s['name']=='A0CommandCentre'];trucks=[d for d in droids if owner(d)==str(player)]
     require(len(hq)==1 and trucks,'Missing authored HQ/units '+id+' player '+str(player));x,y=position(hq[0])[:2]
     starts.append({'player':player,'x':x/128,'y':y/128,'units':len(trucks)});baseCounts[str(player)]=dict(Counter(s['name']for s in own))
    for who in sorted({owner(s)for s in structures}):
     for stat,n in Counter(s['name']for s in structures if owner(s)==who).items():
      require(stat in structureStats,'Unknown authored structure '+id+': '+stat)
      lim=structureStats[stat].get('userLimits')
      if lim and n>lim[1]:limits[stat]=max(limits.get(stat,0),n)
    scav=any(owner(s)=='scavenger'for s in structures+droids)
    row={'id':id,'name':name,'level':level,'mapDirectory':'challenge-'+id,'preview':'challenge-previews/'+id+'.png','players':2,'bots':1,'width':width,'height':height,'tileset':tileset,'sourceSHA256':digest(raw),'scavengers':scav,
     'description':f'{width} × {height}. Two commanders. '+('Authored scavenger positions. 'if scav else'')+'VTOL enabled.'}
    target=ROOT/'map'/row['mapDirectory'];gam='gam.json'if modern else folder.rstrip('/')+'.gam';mappings=[]
    for n in allnames:
     if n.endswith('.lev'):continue
     if not modern and n!=gam and not n.startswith(folder):continue
     relative='game.gam'if n==gam and not modern else n.removeprefix(folder)
     dest=target/relative;blob=archive.read(n);write(dest,blob);virtual='/data/mp/multiplay/maps/'+row['mapDirectory']+'/'+relative
     mappings.append({'original':n,'host':dest.relative_to(ROOT).as_posix(),'virtual':virtual,'sha256':digest(blob)})
     if n==gam:mappings.append({'original':n,'host':dest.relative_to(ROOT).as_posix(),'virtual':'/data/mp/multiplay/maps/'+row['mapDirectory']+'.gam','sha256':digest(blob)})
    dataset={'arizona':'1','urban':'2','rockies':'3'}[tileset]
    descriptor='// Authored Challenge map; original bytes and credits in vendor/challenge-099.\nlevel '+level+'\nplayers 2\ntype 14\ndataset MULTI_CAM_'+dataset+'\ngame "multiplay/maps/'+row['mapDirectory']+'.gam"\n'
    write(target/'level.lev',descriptor)
    oil={tuple(position(s)[:2])for s in features if s['name']=='OilResource'};oil.update(tuple(position(s)[:2])for s in structures if s['name']=='A0ResourceExtractor')
    preview(row,terrain,heights,starts,oil)
    proof={'id':id,'source':path.relative_to(ROOT).as_posix(),'sourceSHA256':digest(raw),'originalZIPMember':member,'nativeFilesByteIdentical':True,'author':metadata.get('author'),'license':metadata.get('spdx-license-id'),'mapVersion':version,'width':width,'height':height,'starts':starts,'baseCounts':baseCounts,'scavengers':scav,'scavengerStructures':sum(owner(s)=='scavenger'for s in structures),'scavengerDroids':sum(owner(s)=='scavenger'for s in droids),'requiredInitialStructureLimits':limits,'terrainCounts':dict(Counter(terrain)),'mappings':mappings,'descriptor':descriptor}
    dump(target/'PROVENANCE-099.json',proof);catalogue.append(row);proofs.append(proof)
  bot=outer.read('1v1 maps/dumbot25a.zip');botzip=ORIGINAL/'dumbot25a.zip'
  if botzip.exists():require(botzip.read_bytes()==bot,'Retained Dumbot changed')
  else:write(botzip,bot)
  excluded=[n for n in names if n.endswith('.zip')and not n.endswith('dumbot25a.zip')]
  require(len(excluded)==1,'Expected separate unrelated waves mod')
  provenance={'version':1,'suppliedArchiveSHA256':digest(retained.read_bytes()),'maps':proofs,'botArchiveSHA256':digest(bot),'excludedArchives':[{'member':n,'sha256':digest(outer.read(n)),'reason':'Separate tower-defence/waves mod; disables VTOL and changes victory rules; never installed in Challenge'}for n in excluded],'previewMethod':'Data-derived terrain/heights, authored commander HQ starts and oil positions. No generated gameplay screenshot.'}
 dump(ASSETS/'challenge-maps.json',{'version':1,'maps':catalogue});dump(ROOT/'vendor/challenge-099/PROVENANCE.json',provenance)
 return catalogue,proofs

def generate_scripts(stock,maps):
 # Air technology and templates remain the original unfiltered stock records.
 policy={'version':1,'mode':'challenge','vtol':True,'blockedResearch':[],'airComponents':[k for k,v in stock.json('/data/mp/stats/propulsion.json').items()if v.get('type')=='Lift'],'researchCategory':{k:v.get('category','')for k,v in stock.json('/data/mp/stats/research.json').items()if not k.startswith('_')}}
 dump(SOURCE/'policy.json',policy)
 with ZipFile(ORIGINAL/'dumbot25a.zip')as bot:
  inventory=[]
  for n in bot.namelist():
   if n.endswith('/'):continue
   require(n.startswith('multiplay/skirmish/')and'..'not in PurePosixPath(n).parts,'Unsafe AI member')
   raw=bot.read(n);relative=n.removeprefix('multiplay/skirmish/');write(SOURCE/'stock/dumbot25a'/relative,raw);inventory.append({'path':n,'sha256':digest(raw)})
  text=bot.read('multiplay/skirmish/dumb25a.js').decode('utf-8-sig')
  anchor='const argv = argParse()'
  text=replace(text,anchor,anchor+'''\n// This isolated Challenge context controls the primary plan once per match.
const challengeAIConfig = includeJSON("challenge-config.json");
if (!challengeAIConfig || challengeAIConfig.mode !== "challenge"
    || ["cannon","rockets"].indexOf(challengeAIConfig.weapon) < 0) throw new Error("Invalid Challenge AI config");
argv.schema = challengeAIConfig.weapon === "cannon" ? argEnum.schema.CANNON : argEnum.schema.ROCKET;
argv.flags = 0; // A single-player chat message cannot change the chosen plan.
argv.reserved = 0;
''')
  text=replace(text,'mainList.forEach((i,index)=>setTimer(i.name,500+index+me))','''// Register new-match timers after native script initialization. Restored
// saves already contain these six native timers; include-time registration
// would collide with their saved IDs before restoration finishes.
var challengeAITimersStarted = false;
function challengeAIStartTimers() {
    if (challengeAITimersStarted) return;
    mainList.forEach((i,index)=>setTimer(i.name,500+index+me));
    challengeAITimersStarted = true;
}
function eventGameLoaded() { challengeAITimersStarted = true; }
''')
  text,n=re.subn(r'(function eventStartLevel\(\)\s*\{)',r'\1\n    challengeAIStartTimers();',text)
  require(n==1,'Dumbot start-event anchor changed')
  write(SOURCE/'ai.js',text);dump(SOURCE/'ai.json',{'AI':{'js':'challenge-dumb25a.js','name':'Dumbot25a','tip':'Dumbot25a Challenge opponent'}})
  dump(SOURCE/'DUMBOT.json',{'botType':'dumbot25a','nativeAIName':'Dumbot25a','nativeScript':'challenge-dumb25a.js','sourceArchiveSHA256':digest((ORIGINAL/'dumbot25a.zip').read_bytes()),'originals':inventory,'adapter':'Original main script plus strict saved Challenge primary cannon/rockets config; chat overrides disabled; new-match AI timers deferred to eventStartLevel and existing saved timers retained on load; all included strategy/VTOL/AA code unchanged','license':'Not specified in supplied AI archive'})
 endconditions=stock.text('/data/mp/multiplay/script/rules/endconditions.js');marker='\tfinalizeGame(state)\n\t{'
 write(SOURCE/'endconditions.js',replace(endconditions,marker,marker+'\n\t\tif (typeof ffaNativePlayerResult === "function") ffaNativePlayerResult(this.playNum, state);'))
 bridge=(ROOT/'scenario/warzone-towers-bridge.js').read_text(encoding='utf-8');a,b=bridge.index('function warzoneTowersDiagnosticSnapshot()'),bridge.index('function blockNightV31PollZoomCommand()');bridge=bridge[:a]+bridge[b:]
 bridge=bridge.replace('setTimer("warzoneTowersDiagnosticSnapshot", 5000);','');bridge=replace(bridge,'setTimer("blockNightV32PollBridgeCommands", 120);','');bridge=replace(bridge,'return enumResearch().sort(function','return enumResearch().filter(function (topic) { return ffaResearchAllowed(topic.id); }).sort(function');write(SOURCE/'research-bridge.js',bridge)
 commands=(ROOT/'scenario/warzone-towers-commands.js').read_text(encoding='utf-8')
 commands=replace(commands,'    removeTimer("wtcmd_tick");','    // Challenge keeps its restored timer; ffaSetTimer registers only a fresh one.')
 commands=replace(commands,'setTimer("wtcmd_tick", 250);','ffaSetTimer("wtcmd_tick", 250);')
 write(SOURCE/'commands.js',commands+'\n'+(SOURCE/'command-policy.js').read_text(encoding='utf-8'))
 for m in maps:
  for d in('easy','medium','hard'):
   for weapon in('cannon','rockets'):
    value={'challenge':{'bases':3,'description':'Defeat the opposing commander. VTOL enabled.','difficulty':d.title(),'map':m['level'],'maxPlayers':2,'name':'Challenge - '+m['name'],'alliances':0,'powerLevel':1,'scavengers':1 if m['scavengers']else 0,'techLevel':1,'version':2},'locked':{k:True for k in('ai','alliances','bases','difficulty','position','power','scavengers','teams')},'player_0':{'name':'Commander','position':0,'team':0},'player_1':{'ai':'multiplay/skirmish/challenge-dumb25a.js','difficulty':d.title(),'name':'Dumbot25a','position':1,'team':1}}
    dump(SOURCE/'challenges'/(m['id']+'-'+d+'-'+weapon+'.json'),value)

def template_compatibility(stock,proofs):
 """Resolve authored campaign-prefab references without changing map objects."""
 templates=stock.json('/data/mp/stats/templates.json')
 originals=deepcopy(templates)
 campaign=stock.json('/data/base/stats/templates.json')
 references={};aliases={}
 component_files={'body':'body','propulsion':'propulsion','construct':'construction','sensor':'sensor','repair':'repair','brain':'brain','ecm':'ecm'}
 for proof in proofs:
  with ZipFile(ROOT/proof['source'])as archive:
   folder=next(n for n in archive.namelist()if n.endswith('game.map'))[:-8]
   names=sorted({d.get('template',d.get('name'))for d in objects(archive,folder,'droid')})
  references[proof['id']]=names
  for name in names:
   if name in templates:continue
   require(name in campaign,'No native template definition for authored droid '+name)
   template=deepcopy(campaign[name])
   require(template.get('type')=='CONSTRUCT','Unexpected missing non-constructor template '+name)
   for field,file in component_files.items():
    if field in template:require(template[field]in stock.json('/data/mp/stats/'+file+'.json'),'Missing MP component in authored template '+name+': '+field)
   for weapon in template.get('weapons',[]):require(weapon in stock.json('/data/mp/stats/weapons.json'),'Missing MP weapon in authored template '+name)
   templates[name]=template;aliases[name]={'source':'/data/base/stats/templates.json','definition':template,'reason':'Authored map references this stock campaign constructor; absent from stock MP template registry.'}
 require(set(aliases)=={'NX-M-Con-Hover'},'Unexpected authored template compatibility inventory')
 require(all(templates[name]==value for name,value in originals.items()),'An original MP template was changed')
 require(all(name in templates for names in references.values()for name in names),'Unresolved authored template')
 dump(SOURCE/'templates.json',templates)
 proof={'passed':True,'referencedTemplatesByMap':references,'aliases':aliases,'allOriginalMPTemplatesUnchanged':True,'originalMPTemplateCount':len(originals),'finalTemplateCount':len(templates),'mapObjectFilesUnchanged':True,'campaignDefinitionCopiedExactly':True}
 dump(SOURCE/'TEMPLATE-COMPATIBILITY.json',proof)
 return proof

def notices():
 provenance=json.loads((ROOT/'vendor/challenge-099/PROVENANCE.json').read_text())
 lines=['Challenge maps and Dumbot25a — supplied asset notices','',
  'The complete source package retains the original user-supplied 1v1 maps ZIP, each original map WZ and Dumbot ZIP. Authored map terrain and object records are unchanged. Data-derived previews were generated for the app.',
  '', 'Dumbot25a (native identity dumb25a)',
  'The supplied AI archive contains no author, copyright or licence declaration. Its original files are retained byte-for-byte in scenario/challenge/stock/dumbot25a and vendor/challenge-099/original/dumbot25a.zip.',
  'The isolated Challenge main-script adapter selects the saved cannon/rockets primary strategy, disables chat commands that could change it and registers AI timers only when a new match starts. Native saved timers are retained on load. Included research, production, VTOL and anti-air strategy files are unchanged.',
  'The authored RQ_face2face map references the stock campaign NX-M-Con-Hover constructor. Its exact stock campaign template definition is registered in the isolated Challenge MP template catalogue; every original MP template and every authored map object remains unchanged.',
  '', 'Map metadata declarations:']
 for row in provenance['maps']:
  lines.extend(['',row['id'], 'Author: '+str((row.get('author')or{}).get('name','Not specified in supplied archive')),
   'Declared licence: '+str(row.get('license')or'Not specified in supplied archive'),
   'Original source: '+row['source'],'SHA256: '+row['sourceSHA256']])
 lines.extend(['','The three legacy archives DA-firefight1x1b, DA-towers2 and HellsPass contain no author/licence metadata declaration. This notice records the supplied information; no ownership or licence grant is inferred.',
  '', 'The unrelated waves-mod ZIP in the supplied outer archive is retained as provenance only. Its scripts and game-rule overrides are not installed in Challenge.',
  '', 'Declared licence references:', 'GPL-2.0-or-later: https://www.gnu.org/licenses/old-licenses/gpl-2.0.html',
  'CC0-1.0: https://creativecommons.org/publicdomain/zero/1.0/',
  'CC-BY-3.0: https://creativecommons.org/licenses/by/3.0/'])
 text='\n'.join(lines)+'\n';write(ASSETS/'legal/content/CHALLENGE-099-NOTICES.txt',text)
 write(ROOT/'vendor/challenge-099/NOTICES.txt',text)
 catalog=ASSETS/'legal/catalog.json';value=json.loads(catalog.read_text(encoding='utf-8'))
 title='Challenge maps and Dumbot25a'
 value['sections']=[s for s in value['sections']if s.get('title')!=title]
 value['sections'].append({'title':title,'body':'Challenge includes ten authored maps and the supplied Dumbot25a opponent. The notice records map authors and declared licences, original-source identities and the limited Challenge adapter. Some supplied archives contain no licence declaration.',
  'documents':[{'title':'Challenge asset credits and supplied licence declarations','path':'content/CHALLENGE-099-NOTICES.txt'}]})
 dump(catalog,value)

def html(maps,directories):
 config='''\n  <script>
    const ffaLaunchQuery = new URLSearchParams(location.search);
    const ffaDifficulty = ffaLaunchQuery.get('bnFfaDifficulty') || 'easy';
    const challengeWeapon = ffaLaunchQuery.get('bnChallengeWeapon');
    if (!['easy','medium','hard'].includes(ffaDifficulty) || !['cannon','rockets'].includes(challengeWeapon)) throw new Error('Invalid Challenge launch choices.');
    const ffaMapCatalogue = CHALLENGE_MAPS;
    const ffaMap = ffaMapCatalogue.find(map => map.id === (ffaLaunchQuery.get('bnFfaMap') || 'firefight'));
    if (!ffaMap) throw new Error('Unknown Challenge map.');
    window.__warzoneFfa = true;
    window.__warzoneChallenge = true;
    window.__warzoneFfaMaps = ffaMapCatalogue;
    window.__warzoneFfaConfig = Object.freeze({mode:'challenge',map:ffaMap.id,mapName:ffaMap.name,level:ffaMap.level,players:2,bots:1,structureLimits:Object.freeze({...ffaMap.structureLimits}),difficulty:ffaDifficulty,player:0,botType:'dumbot25a',weapon:challengeWeapon,vtol:true,scavengers:ffaMap.scavengers});
  </script>\n'''.replace('CHALLENGE_MAPS',json.dumps(maps,separators=(',',':'),ensure_ascii=False))
 index=(WZ/'index.html').read_text(encoding='utf-8');index=replace(index,'  <head>','  <head>'+config)
 index=replace(index,"return '/warzone2100' + WZ_CONFIG_DIR_SUFFIX;","return '/warzone2100-challenge-' + ffaMap.id + '-' + ffaDifficulty + '-' + challengeWeapon + WZ_CONFIG_DIR_SUFFIX;")
 index=replace(index,"module.FS.writeFile('/tmp/warzone-towers-ui-v34', '1')","module.FS.writeFile('/tmp/warzone-campaign-mobile-v51', '1')")
 index,n=re.subn(r"      function blockNightPrepareDemolitionIntent\(module\) \{.*?      Module\['preRun'\]\.push\(blockNightPrepareDemolitionIntent\);\n",'',index,flags=re.S);require(n==1,'Demolition preRun anchor changed')
 a=index.index("      const towerMap = new URLSearchParams(location.search).get('map');");b=index.index('      // END TOWERS 0.19 LEVEL ARGUMENT',a)+len('      // END TOWERS 0.19 LEVEL ARGUMENT');index=index[:a]+"      Module.arguments.push('--skirmish=challenge-' + ffaMap.id + '-' + ffaDifficulty + '-' + challengeWeapon + '.json');"+index[b:]
 index=replace(index,"if (path === 'warzone2100.wasm') return prefix + 'warzone2100-towers-052.wasm';","if (path === 'warzone2100.wasm') return prefix + 'warzone2100.wasm';")
 index=replace(index,'if (path.endsWith(".data")) {','if (path === "warzone2100.data") return "warzone2100-challenge.data";\n        if (path.endsWith(".data")) {')
 prepare=(SOURCE/'runtime-prepare.js').read_text(encoding='utf-8');prepare=replace(prepare,'CHALLENGE_NATIVE_PACKAGE_DIRECTORIES',json.dumps(directories,separators=(',',':')))
 index=replace(index,'    function constructWZModuleConfig(additional_command_line_args) {',prepare+'\n    function constructWZModuleConfig(additional_command_line_args) {')
 index=replace(index,'      return Module;','      prepareChallengeModule(Module, window.__warzoneFfaConfig);\n      return Module;');index=replace(index,'src="warzone2100-towers-052.js"','src="warzone2100-challenge.js"');write(WZ/'index-challenge.html',index)
 mobile=(WZ/'mobile.html').read_text(encoding='utf-8');mobile=replace(mobile,'<head>','<head>'+config);mobile=replace(mobile,'"index.html" + location.search','"index-challenge.html" + location.search');write(WZ/'mobile-challenge.html',mobile)

def build(supplied):
 frozen={p.relative_to(ROOT).as_posix():digest(p.read_bytes())for p in WZ.iterdir()if p.is_file()and(p.name.startswith(('warzone2100','index','mobile'))and'-challenge'not in p.name)}
 stock=Stock();maps,proofs=import_maps(supplied,stock);generate_scripts(stock,maps);compatibility=template_compatibility(stock,proofs);notices()
 package=runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'),run_name='challenge_package_helpers')['package_call']
 script=(WZ/'warzone2100.js').read_text(encoding='utf-8');begin,end,_,metadata=package(script);entries={e['filename']:deepcopy(e)for e in stock.files};data=bytearray(stock.data);appended=[]
 def add(virtual,content):
  content=content.encode('utf-8')if isinstance(content,str)else content;start=len(data);data.extend(content);entries[virtual]={'filename':virtual,'start':start,'end':len(data)};appended.append({'path':virtual,'sha256':digest(content),'bytes':len(content)})
 def file(virtual,path):add(virtual,path.read_bytes())
 add('/data/mp/addon.lev',stock.read('/data/mp/addon.lev')+b'\n'+'\n'.join(p['descriptor']for p in proofs).encode())
 for p in proofs:
  for row in p['mappings']:file(row['virtual'],ROOT/row['host'])
 native=[dict(m,structureLimits=p['requiredInitialStructureLimits'])for m,p in zip(maps,proofs)]
 for m in maps:
  for d in('easy','medium','hard'):
   for weapon in('cannon','rockets'):file('/data/mp/tests/challenge-'+m['id']+'-'+d+'-'+weapon+'.json',SOURCE/'challenges'/(m['id']+'-'+d+'-'+weapon+'.json'))
 for name in('policy','rules','research-bridge','commands'):file('/data/mp/tests/challenge-'+name+'.js',SOURCE/(name+'.js'))
 file('/data/mp/multiplay/script/rules/init.js',SOURCE/'rules.js');file('/data/mp/multiplay/script/rules/endconditions.js',SOURCE/'endconditions.js')
 file('/data/mp/stats/templates.json',SOURCE/'templates.json')
 file('/data/mp/multiplay/skirmish/challenge-dumb25a.js',SOURCE/'ai.js');file('/data/mp/multiplay/skirmish/challenge-dumb25a.json',SOURCE/'ai.json')
 for p in(SOURCE/'stock/dumbot25a/dumb25a').iterdir():file('/data/mp/multiplay/skirmish/dumb25a/'+p.name,p)
 require((SOURCE/'rewards.js').is_file(),'Challenge reward adapter must be supplied before package build')
 file('/data/mp/tests/challenge-rewards.js',SOURCE/'rewards.js');file('/data/mp/tests/challenge-reward-stock.js',ROOT/'scenario/warzone-towers-rewards.js')
 for folder in('multiplay/script','multiplay/script/rules','multiplay/skirmish'):
  add('/data/mp/'+folder+'/challenge-policy.json',(SOURCE/'policy.json').read_bytes())
  add('/data/mp/'+folder+'/challenge-config.json',json.dumps(dict(native[0],mode='challenge',map=maps[0]['id'],difficulty='easy',player=0,botType='dumbot25a',weapon='cannon',vtol=True)))
  add('/data/mp/'+folder+'/challenge-maps.json',json.dumps({'version':1,'maps':native},separators=(',',':'),ensure_ascii=False))
 for name in('warzone-towers-catalog.json','warzone-towers-command.json','warzone-towers-control-command.json','blocknight-queue-command.json','blocknight-zoom-command.json'):
  for folder in('tests','multiplay/script/rules'):file('/data/mp/'+folder+'/'+name,ROOT/'scenario'/name)
 add('/data/mp/multiplay/script/rules/warzone-towers-demolition-intent.json','{"intent":"","active":false}')
 # Reward command paths are part of the retained stock Towers integration.
 for p in(ROOT/'scenario').glob('*reward*.json'):
  for folder in('tests','multiplay/script/rules'):file('/data/mp/'+folder+'/'+p.name,p)
 new=dict(metadata,files=list(entries.values()),remote_package_size=len(data),package_uuid='challenge-'+digest(data));generated=script[:begin]+'loadPackage('+json.dumps(new,separators=(',',':'),ensure_ascii=False)+')'+script[end:]
 original='var REMOTE_PACKAGE_BASE="warzone2100.data";';generated=replace(generated,original,'var REMOTE_PACKAGE_BASE="warzone2100-challenge.data";')
 filt='text.includes("BNNOTICE")';extended=filt+'||text.includes("BNFFA")||text.includes("WTCMD")||text.includes("WTREADY")||text.includes("WTREWARD")';generated=replace(generated,filt,extended)
 b,e,_,parsed=package(generated);normalized=(generated[:b]+'PACKAGE'+generated[e:]).replace('var REMOTE_PACKAGE_BASE="warzone2100-challenge.data";',original,1).replace(extended,filt,1);require(normalized==script[:begin]+'PACKAGE'+script[end:],'Compiled loader changed beyond package/output adapters')
 write(WZ/'warzone2100-challenge.js',generated);write(WZ/'warzone2100-challenge.data',bytes(data));directories=sorted({str(PurePosixPath(e['filename']).parent)for e in parsed['files']});html(native,directories)
 require(all(digest((ROOT/n).read_bytes())==h for n,h in frozen.items()),'Existing runtime was modified')
 require('/data/mp/stats/research.json'in entries and stock.read('/data/mp/stats/research.json')==data[entries['/data/mp/stats/research.json']['start']:entries['/data/mp/stats/research.json']['end']],'Air research not exact stock')
 final_templates=json.loads(data[entries['/data/mp/stats/templates.json']['start']:entries['/data/mp/stats/templates.json']['end']])
 require(all(final_templates[k]==v for k,v in stock.json('/data/mp/stats/templates.json').items()),'Original stock templates were changed')
 outputs=[WZ/n for n in('warzone2100-challenge.js','warzone2100-challenge.data','index-challenge.html','mobile-challenge.html')]
 proof={'passed':True,'version':1,'mode':'challenge','players':2,'bots':1,'botType':'dumbot25a','vtol':True,'maps':native,'compiledProgramNormalizedIdentical':True,'noNativeBuild':True,'sharedWASM':'warzone2100.wasm','stockPrefixBytes':STOCK_SIZE,'stockPrefixSHA256':STOCK_SHA,'stockResearchByteIdentical':True,'allOriginalMPTemplatesUnchanged':True,'templateCompatibility':compatibility,'nativePreloadDirectories':directories,'mapProofs':proofs,'preservedExistingFiles':frozen,'virtualOverrides':appended,'outputs':[{'path':p.relative_to(ROOT).as_posix(),'sha256':digest(p.read_bytes()),'bytes':p.stat().st_size}for p in outputs]}
 dump(SOURCE/'PACKAGE.json',proof);print(json.dumps({k:proof[k]for k in('passed','mode','players','bots','vtol','stockResearchByteIdentical','allOriginalMPTemplatesUnchanged','outputs')},indent=2))

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--import-zip',type=Path);args=parser.parse_args();build(args.import_zip)
