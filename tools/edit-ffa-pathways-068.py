"""Edit v0.67 NTW terrain in place: clear ground lanes and rock banks, no new layouts.

Every source map is read from the retained v0.67 complete-source ZIP. Object
records, dimensions, bases and oil stay byte-identical. This is offline native
format/geometry checking, never an emulator or native pathfinder test.
"""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
from collections import Counter, deque
import argparse,json,math,runpy,struct
from PIL import Image,ImageDraw,ImageFont,ImageFilter

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'app/src/main/assets'
BASELINE=Path('C:/timerApp/warzone-towers-0.67-source.zip')
BASELINE_SHA='2de8af6ebec215ddedb02e35f74ad1bcd0adc412f19b642fd9489bf3557aa8e1'
MANIFEST=ROOT/'scenario/ffa/generated-maps-067.json'
G=runpy.run_path(str(ROOT/'tools/generate-ntw-maps-067.py'),run_name='pathways068_geometry_helpers')
NATIVE=('level.json','gam.json','game.map','ttypes.ttp','struct.json','droid.json','feature.json')
UNCHANGED=tuple(n for n in NATIVE if n!='game.map')+('level.lev','DESIGN-067.json','AUTHORING-067.json')
EXPAND=G['expand'];CONNECTED=G['connected'];FOOTPRINT=G['footprint']

def digest(raw):return sha256(raw).hexdigest()
def require(ok,message):
 if not ok:raise RuntimeError(message)
def dump(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
def cells(image):
 return {(x,y) for y in range(image.height) for x in range(image.width) if image.getpixel((x,y))}
def mask(size,points):
 image=Image.new('1',size)
 for p in points:image.putpixel(p,1)
 return image

def brush_routes(routes,radii,ground):
 out=set();centres=[]
 for points,radius in zip(routes,radii):
  these=[]
  for a,b in zip(points,points[1:]):
   steps=max(1,math.ceil(math.dist(a,b)*2))
   for k in range(steps+1):
    p=tuple(round(a[j]+(b[j]-a[j])*k/steps) for j in (0,1))
    out |= EXPAND({p},radius);these.append(p)
  centres.append(list(dict.fromkeys(these)))
 return out&ground,centres

def path_to_region(origin,targets,allowed):
 require(origin in allowed,'Neutral oil source is not free original ground')
 todo=deque([origin]);parents={origin:None};end=None
 while todo:
  p=todo.popleft()
  if p in targets:end=p;break
  for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
   q=p[0]+dx,p[1]+dy
   if q in allowed and q not in parents:parents[q]=p;todo.append(q)
 require(end is not None,'No original ground route from oil to preserved lanes')
 result=[]
 while end is not None:result.append(end);end=parents[end]
 return result

def open_cells(ground,exclude,w,h,radius=10):
 image=Image.new('L',(w,h));image.putdata([255 if (x,y) in ground else 0 for y in range(h) for x in range(w)])
 eroded=image.filter(ImageFilter.MinFilter(radius*2+1))
 return sum(1 for y in range(h) for x in range(w) if (x,y) not in exclude and eroded.getpixel((x,y))==255)

def author(entry,oldproof,archive,library,specs):
 mapid=entry['id'];directory=ROOT/'map'/entry['mapDirectory'];prefix=directory.relative_to(ROOT).as_posix()+'/'
 design=json.loads(archive.read(prefix+'DESIGN-067.json'))
 # Existing authoring graph is the identity/route skeleton, not a replacement layout.
 geo=G['Geography'](design)
 oldraw=archive.read(prefix+'game.map');w,h=entry['width'],entry['height']
 original=json.loads(archive.read(prefix+'struct.json'))['structures']
 droids=json.loads(archive.read(prefix+'droid.json'))['droids']
 features=json.loads(archive.read(prefix+'feature.json'))['features']
 require(oldraw[:16]==b'map '+struct.pack('<III',40,w,h),mapid+': old map format mismatch')
 ttp=archive.read(prefix+'ttypes.ttp');count=struct.unpack_from('<I',ttp,8)[0];types=struct.unpack_from('<'+'H'*count,ttp,12)
 oldtypes=[types[struct.unpack_from('<H',oldraw,16+i*4)[0]&511] for i in range(w*h)]
 oldground={(x,y) for y in range(h) for x in range(w) if oldtypes[y*w+x] not in (7,8)}
 oldwater={(x,y) for y in range(h) for x in range(w) if oldtypes[y*w+x]==7}
 require(geo.ground==oldground and geo.water==oldwater,mapid+': regenerated baseline geometry differs from retained native map')
 for name in UNCHANGED:
  require((directory/name).read_bytes()==archive.read(prefix+name),mapid+': protected original file changed: '+name)
 objects=set()
 for row in original:
  if row['name']=='A0PowMod1':continue
  objects |= FOOTPRINT(specs[row['name']],tuple(v//128 for v in row['position']),row['rotation'])
 trucks={tuple(v//128 for v in row['position']) for row in droids}
 owned={tuple(v//128 for v in row['position']) for row in original if row['name']=='A0ResourceExtractor'}
 neutral={tuple(v//128 for v in row['position']) for row in features if row['name']=='OilResource'}-owned
 # Preserve the varied industrial campus and a useful apron; no base building,
 # existing factory exit, oil grid or constructor turning space is pinched.
 baseyard=(EXPAND(geo.campus_art,3)|EXPAND(objects|trucks,3))&oldground
 n=design['players'];number=design['number']
 radii=[5+(number%3==0) if i<n else 4+(number%4==0) for i in range(len(geo.routes))]
 lanes,centres=brush_routes(geo.routes,radii,oldground)
 # Small passing/turning courts at junctions; keep the authored central landmark.
 junctions=set()
 for i,route in enumerate(geo.routes):
  for p in (route[-1],route[1] if len(route)>2 else route[0]):
   q=(round(p[0]),round(p[1]))
   if q not in baseyard:
    junctions |= EXPAND({q},7+(number%2))
 junctions &= oldground
 keep=baseyard|lanes|junctions
 # Preserve every neutral oil with a broad spur connected to this same lane
 # network, using only its existing free ground and keeping object footprints.
 free=oldground-objects
 spurs=[]
 for oil in sorted(neutral):
  route=path_to_region(oil,keep-objects,free)
  spur=set()
  for p in route:spur |= EXPAND({p},4)
  spur |= EXPAND({oil},4)
  keep |= spur&oldground;spurs.append(route)
 # All excess combat ground becomes real native cliff terrain. Existing water
 # stays intact. This changes passability, not only road colour.
 newground=keep&oldground
 reached=CONNECTED(newground,next(iter(trucks)))
 require((objects|trucks|neutral)<=reached,mapid+': protected area disconnected after lane editing')
 newground=reached
 newrocks=oldground-newground
 require(len(newrocks)>0,mapid+': no actual terrain barrier added')
 geo.ground=newground;geo.water=oldwater;geo.cliffs={(x,y) for y in range(h) for x in range(w)}-newground-oldwater
 geo.roads=(lanes|junctions)&newground;geo.bases=baseyard;geo.campus_art &= newground
 native,_,_=G['terrain'](design,geo,library)
 (directory/'game.map').write_bytes(native)
 checks,readback=G['native_readback'](design,directory,specs)
 # Verify actual written native passability/clearances, not the source PNG.
 written_ground={(x,y) for y in range(h) for x in range(w) if readback[-1][readback[2][y*w+x]&511] not in (7,8)}
 require(written_ground==newground,mapid+': written passability differs from edited terrain')
 written_water={(x,y) for y in range(h) for x in range(w) if readback[-1][readback[2][y*w+x]&511]==7}
 require(written_water==oldwater,mapid+': written native water differs from original map')
 require(all(readback[-1][readback[2][y*w+x]&511]==8 for x,y in newrocks),mapid+': a new bank is not physical native cliff terrain')
 for line in centres:
  for p in line:require(EXPAND({p},4)<=written_ground,mapid+': authored lane lost nine-tile clear ground')
 before_combat=oldground-baseyard;after_combat=newground-baseyard
 reduction=1-len(after_combat)/max(1,len(before_combat))
 before_open=open_cells(oldground,baseyard,w,h);after_open=open_cells(newground,baseyard,w,h)
 require(reduction>=.12,mapid+': insufficient actual open-ground reduction '+str(reduction))
 require(after_open<before_open or before_open==0,mapid+': wide open pockets not reduced')
 for name in UNCHANGED:require((directory/name).read_bytes()==archive.read(prefix+name),mapid+': non-terrain native or authoring file changed')
 photo=G['preview'](design,readback,library,ASSETS/entry['preview'])
 plan=dict(version='0.68',id=mapid,edit='Terrain banks around the existing routes; dimensions, bases, objects and existing water retained.',
  baselineVersion='0.67',baselineNativeMapSHA256=digest(oldraw),baselineNativeMapBytes=len(oldraw),
  width=w,height=h,routeSkeleton=geo.routes,mainRouteRadiusTiles=radii[:n],flankRouteRadiusTiles=radii[n:],
  minimumSourceLaneSquare=9,protectedCampusApron=3,neutralOilSpurRadius=4,
  objectsAndSpawnsAndOilUnchanged=True,nativeObjectFilesUnchanged=list(UNCHANGED))
 planpath=directory/'PATHWAYS-068.json';dump(planpath,plan)
 sourcehash=digest(planpath.read_bytes())
 newentry=dict(entry,sourceSHA256=sourcehash,description=entry['description']+' Defined ground lanes and rock banks break up the open approaches.')
 proof=json.loads(json.dumps(oldproof))
 for mapping in proof['mappings']:
  if mapping['host']==prefix+'game.map':mapping['sha256']=digest(native)
 proof.update(sourceSHA256=sourcehash,sourceSHA256Meaning='Exact PATHWAYS-068.json edit plan bytes; original v0.67 design remains retained.',
  terrainEdit=dict(path=planpath.relative_to(ROOT).as_posix(),sha256=sourcehash),
  nativeMapSHA256=digest(native),geometryD4SHA256=G['canonical_geometry'](readback),preview=photo,checks=checks,
  generator='tools/edit-ffa-pathways-068.py',originalMapFilesModified=True,
  originalDimensionsAndStartingObjectsPreserved=True)
 metrics=dict(id=mapid,width=w,height=h,basePositionsUnchanged=True,protectedFilesByteIdentical=True,
  nativeMapBeforeSHA256=digest(oldraw),nativeMapSHA256=digest(native),geometryD4SHA256=proof['geometryD4SHA256'],
  baseyardTiles=len(baseyard),originalGroundTiles=len(oldground),editedGroundTiles=len(newground),newRockBankTiles=len(newrocks),
  oldInterBaseGroundTiles=len(before_combat),newInterBaseGroundTiles=len(after_combat),interBaseGroundReductionPercent=round(reduction*100,2),
  wideOpen21SquareCellsBefore=before_open,wideOpen21SquareCellsAfter=after_open,
  authoredRouteCount=len(geo.routes),neutralOilSpurs=len(spurs),allRouteSamplesNineTilesClear=True,
  originalWaterCellsByteClassPreserved=True,newRockBanksUseNativeCliffTerrain=True,
  nativeObjectsModulesFlatFoundationsAndOilChecks=checks,
  nativeEngineExecuted=False,emulatorUsed=False)
 return newentry,proof,metrics

def sheets(entries,archive):
 font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',14);title=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf',20)
 outputs=[]
 for players in (2,3,4):
  items=[e for e in entries if e['players']==players];cw,ch=242,282
  image=Image.new('RGB',(5*cw,50+3*ch),(15,17,19));d=ImageDraw.Draw(image)
  d.text((12,12),f'{players}-player FFA terrain edits — existing maps, clear paths and rock banks',font=title,fill=(240,240,235))
  for i,e in enumerate(items):
   x,y=i%5*cw,50+i//5*ch;art=Image.open(ASSETS/e['preview']).convert('RGB');art.thumbnail((cw-12,ch-54))
   image.paste(art,(x+(cw-art.width)//2,y))
   d.text((x+7,y+ch-46),f'{i+1:02}  {e["name"]}',font=font,fill=(238,238,232))
   d.text((x+7,y+ch-23),f'Unchanged size · {e["width"]}×{e["height"]}',font=font,fill=(159,171,177))
  out=ROOT/f'map/FFA-PATHWAYS-{players}P-OVERVIEW-068.png';image.save(out,optimize=True);outputs.append(out)
 # A three-map direct before/after comparison makes extent of actual edits reviewable.
 import io
 image=Image.new('RGB',(1440,1060),(15,17,19));d=ImageDraw.Draw(image)
 d.text((15,12),'Actual map-data previews: v0.67 BEFORE / v0.68 PATH EDITS',font=title,fill=(240,240,235))
 for row,players in enumerate((2,3,4)):
  e=next(e for e in entries if e['players']==players);yy=50+row*336
  for col,art in enumerate((Image.open(io.BytesIO(archive.read('app/src/main/assets/'+e['preview']))),Image.open(ASSETS/e['preview']))):
   art=art.convert('RGB');art.thumbnail((650,300));image.paste(art,(col*720+(700-art.width)//2,yy))
  d.text((15,yy+302),f'{players} players · {e["name"]} · positions and size unchanged',font=font,fill=(200,205,200))
 out=ROOT/'map/FFA-PATHWAYS-BEFORE-AFTER-068.png';image.save(out,optimize=True);outputs.append(out)
 return outputs

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--only');args=parser.parse_args()
 library=json.loads((ROOT/'tools/map-art-library-020.json').read_text());specs={r['id']:r for r in json.loads((ASSETS/'warzone/command-catalog.json').read_text())['buildings']}
 chosen=set(args.only.split(',')) if args.only else None
 entries=[];proofs=[];metrics=[]
 with ZipFile(BASELINE) as archive:
  baseline_manifest=json.loads(archive.read('scenario/ffa/generated-maps-067.json'))
  baseline_catalog=json.loads(archive.read('app/src/main/assets/ffa-maps.json'))
  originals=baseline_catalog['maps'][:6]
  old_paths={name:digest(archive.read(name)) for name in archive.namelist() if name.startswith('map/ffa-') and not name.startswith('map/ffa-ntw-')}
  for e,p in zip(baseline_manifest['maps'],baseline_manifest['proofs']):
   if chosen and e['id'] not in chosen:continue
   ne,np,m=author(e,p,archive,library,specs);entries.append(ne);proofs.append(np);metrics.append(m)
   print(json.dumps(dict(edited=e['id'],interBaseGroundReductionPercent=m['interBaseGroundReductionPercent'],newRockBankTiles=m['newRockBankTiles'])),flush=True)
  require(all(digest((ROOT/name).read_bytes())==value for name,value in old_paths.items()),'An original six-map source changed')
  for e in originals:require((ASSETS/e['preview']).read_bytes()==archive.read('app/src/main/assets/'+e['preview']),'Original preview changed')
  if chosen:return
  require(len(entries)==45 and len({p['geometryD4SHA256'] for p in proofs})==45,'Edited map count/geography uniqueness mismatch')
  output=dict(baseline_manifest,maps=entries,proofs=proofs,terrainRevision='0.68',scope='Existing v0.67 maps edited with bounded ground lanes and rock banks. Dimensions, starting bases, oil and native object records unchanged. Offline checks only.')
  dump(MANIFEST,output);dump(ASSETS/'ffa-maps.json',dict(version=1,maps=originals+entries))
  images=sheets(entries,archive)
 sources={Path(__file__),ROOT/'tools/generate-ntw-maps-067.py',ROOT/'tools/map-art-library-020.json',ASSETS/'warzone/command-catalog.json',ASSETS/'ffa-maps.json',MANIFEST,*images}
 for e in entries:
  sources.update(p for p in (ROOT/'map'/e['mapDirectory']).rglob('*') if p.is_file());sources.add(ASSETS/e['preview'])
  sources.update(ROOT/'map/art-assets-020'/(n+'.png') for n in library['themes'][e['tileset']]['groundNames'])
 report=dict(version='0.68',passed=True,emulatorUsed=False,actualNativeEngineExecuted=False,nativePathfindingOrGameplayVerified=False,
  editedMaps=45,originalSixUnchanged=True,allDimensionsAndStartingObjectsBytePreserved=True,allWaterRetained=True,
  noLayoutReplacement=True,uniqueGeographies=45,allNeutralOilAndStructuresReachable=True,allNativeFoundationsFlat=True,
  minimumSourceRouteGroundSquare=9,interBaseGroundReductionRangePercent=[min(m['interBaseGroundReductionPercent'] for m in metrics),max(m['interBaseGroundReductionPercent'] for m in metrics)],
  baselineSourceZIP=dict(path=str(BASELINE),sha256=BASELINE_SHA),maps=metrics,
  limitations=['Offline native file/geometry checks only. The native pathfinder, game rendering, live Cobra and balance were not tested in an emulator.'],
  sources=[dict(path=p.relative_to(ROOT).as_posix(),sha256=digest(p.read_bytes()),bytes=p.stat().st_size) for p in sorted(sources)])
 dump(ROOT/'archive/ffa-pathways-0.68-map-checks.json',report)
 print(json.dumps(dict(passed=True,editedMaps=45,interBaseGroundReductionRangePercent=report['interBaseGroundReductionRangePercent'],emulatorUsed=False)))
if __name__=='__main__':main()
