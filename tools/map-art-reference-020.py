"""Read actual 0.19 native terrain/scenery definitions for 0.20 map authoring.

This generates a source-only art library and optional tile contact sheets. It
does not execute the engine or claim a rendered gameplay result.
"""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
from collections import Counter, defaultdict
from io import BytesIO
import json
import re
import runpy
import subprocess
import sys
import configparser
import struct
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
APK=ROOT.parent/'Warzone-Towers-0.19.apk'
OUT=ROOT.parent/'tmp/map-art-020'


def reference_maps(vfs):
    """Render actual benchmark geometry/materials as overhead references."""
    import numpy as np
    library=json.loads((ROOT/'tools/map-art-library-020.json').read_text(encoding='utf-8'))
    specs={v['id']:v for v in json.loads((ROOT/'app/src/main/assets/warzone/command-catalog.json').read_text(encoding='utf-8'))['buildings']}
    feature_specs=library['features']
    inverse=((0,0),(1,0),(1,1),(0,1))
    native_slot={(0,0):3,(0,1):1,(1,0):2,(1,1):0}
    cycle={value:i for i,value in enumerate(inverse)}
    def actual_corners(texture,theme):
        result=[]
        for i,j in ((1,1),(0,1),(0,0),(1,0)):
            if texture&0x8000:i=1-i
            if texture&0x4000:j=1-j
            i,j=inverse[(cycle[i,j]-((texture>>12)&3))%4]
            result.append(theme['groundCorners'][texture&511][native_slot[i,j]])
        return result
    def objects(directory,kind):
        path=directory/(kind+'.json')
        if path.is_file():return json.loads(path.read_text(encoding='utf-8'))[{'struct':'structures','droid':'droids','feature':'features'}[kind]]
        parser=configparser.ConfigParser(interpolation=None);parser.read(directory/(kind+'.ini'))
        result=[]
        for section in parser.sections():
            item=dict(parser[section]);item['position']=[int(v.strip()) for v in item['position'].split(',')][:2];item['startpos']=int(item.get('startpos',-1));result.append(item)
        return result
    refs=[('Dustfall','arizona',ROOT/'vendor/maps/td1-v3/map',0),('Iron Valley','urban',ROOT/'vendor/survival/map/multiplay/maps/2c-TowerDefense2_m',1)]
    for title,theme_name,directory,human in refs:
        theme=library['themes'][theme_name];data=(directory/'game.map').read_bytes()
        version,w,h=struct.unpack_from('<III',data,4);scale=7;count=len(theme['groundNames'])
        corners=np.zeros((h,w,4),dtype=np.int16);heights=np.zeros((h,w),dtype=np.float32);types=np.zeros((h,w),dtype=np.int16);textures=np.zeros((h,w),dtype=np.uint16)
        for y in range(h):
            for x in range(w):
                offset=16+(y*w+x)*(4 if version==40 else 3)
                texture=struct.unpack_from('<H',data,offset)[0]
                textures[y,x]=texture
                heights[y,x]=struct.unpack_from('<H' if version==40 else 'B',data,offset+2)[0]*(1 if version==40 else 2)
                corners[y,x]=actual_corners(texture,theme);types[y,x]=theme['terrainTypes'][texture&511]
        votes=np.zeros((h+1,w+1,count),dtype=np.uint16)
        native_weight=np.where(types==8,100,np.where(types==7,1,10)).astype(np.uint16)
        for slot,(dx,dy) in enumerate(((0,0),(1,0),(1,1),(0,1))):
            for material in range(count):votes[dy:dy+h,dx:dx+w,material]+=(corners[:,:,slot]==material)*native_weight
        vertices=votes.argmax(axis=2);ids=[vertices[:h,:w],vertices[:h,1:],vertices[1:,1:],vertices[1:,:w]]
        yy,xx=np.mgrid[:scale,:scale]/scale;weights=[(1-xx)*(1-yy),xx*(1-yy),xx*yy,(1-xx)*yy]
        canvas=np.zeros((h*scale,w*scale,3),dtype=np.float32);gy,gx=np.mgrid[:h*scale,:w*scale]
        scales={line.split(',')[0]:float(line.split(',')[2]) for line in theme['groundTexturesDefinition'].strip().splitlines()[1:]}
        for material,name in enumerate(theme['groundNames']):
            mask=np.zeros((h*scale,w*scale),dtype=np.float32)
            for slot in range(4):mask+=np.repeat(np.repeat(ids[slot]==material,scale,axis=0),scale,axis=1)*np.tile(weights[slot],(h,w))
            if not mask.any():continue
            size=round(scales[name]*scale);art=Image.open(ROOT/'map/art-assets-020'/(name+'.png')).convert('RGB').resize((size,size),Image.Resampling.LANCZOS)
            sampled=np.asarray(art,dtype=np.float32)[gy%size,gx%size]
            if 'water' in name:sampled=sampled*.48+np.array([31,79,98])*.52
            canvas+=sampled*mask[:,:,None]
        dhy,dhx=np.gradient(heights);shade=np.clip(.97-dhx*.0015-dhy*.001,.55,1.29)
        canvas*=np.repeat(np.repeat(shade,scale,axis=0),scale,axis=1)[:,:,None]
        map_image=Image.fromarray(np.clip(canvas,0,255).astype(np.uint8),'RGB').convert('RGBA')
        decal_ids={int(n) for n in theme['decalDefinitions']};decal_cache={}
        for y in range(h):
            for x in range(w):
                texture=int(textures[y,x]);index=texture&511
                if index not in decal_ids:continue
                if texture not in decal_cache:
                    tile=Image.open(BytesIO(vfs[theme['tileImages'][str(index)]])).convert('RGBA').resize((scale,scale),Image.Resampling.LANCZOS)
                    if texture&0x8000:tile=tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                    if texture&0x4000:tile=tile.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
                    rotations=(None,Image.Transpose.ROTATE_270,Image.Transpose.ROTATE_180,Image.Transpose.ROTATE_90)
                    if rotations[(texture>>12)&3]:tile=tile.transpose(rotations[(texture>>12)&3])
                    decal_cache[texture]=tile
                map_image.alpha_composite(decal_cache[texture],(x*scale,y*scale))
        map_image=map_image.convert('RGB');draw=ImageDraw.Draw(map_image)
        for kind in ('feature','struct'):
            for item in objects(directory,kind):
                spec=(feature_specs if kind=='feature' else specs).get(item['name'])
                if not spec or item['name']=='OilResource':continue
                x,y=(v//128 for v in item['position']);width,breadth=spec['width'],spec['breadth']
                box=((x-width//2)*scale,(y-breadth//2)*scale,(x-width//2+width)*scale-1,(y-breadth//2+breadth)*scale-1)
                color=(113,108,94) if kind=='feature' else (240,200,80) if item['name']=='A0Sat-linkCentre' and item['startpos']==human else (111,174,209) if item['startpos']==human else (191,93,75)
                draw.rectangle(box,fill=color,outline=(35,40,38),width=1)
        image=Image.new('RGB',(max(480,map_image.width+24),map_image.height+62),(14,25,28));image.paste(map_image,((image.width-map_image.width)//2,34));draw=ImageDraw.Draw(image)
        draw.text((12,10),title+' / native terrain and object composition',fill=(231,239,236))
        draw.text((12,image.height-20),'Source-data overhead; decoded native materials, not gameplay.',fill=(163,185,181))
        output=OUT/(title.lower().replace(' ','-')+'-reference.png');image.save(output)
        print(str(output))


def decode_materials(vfs):
    """Regenerate permanent PNG inputs using the vendored asset transcoder."""
    permanent=ROOT/'map/art-assets-020'
    temporary=OUT/'ground'
    temporary.mkdir(parents=True,exist_ok=True)
    library=json.loads((ROOT/'tools/map-art-library-020.json').read_text(encoding='utf-8'))
    targets=[]
    for theme,row in library['themes'].items():
        for line in row['groundTexturesDefinition'].strip().splitlines()[1:]:
            material,png,scale=line.split(',')
            source='/data/base/texpages/'+png.replace('.png','.ktx2')
            ktx=temporary/Path(source).name
            ktx.write_bytes(vfs[source])
            targets.append({'theme':theme,'material':material,'sourceVFS':source,'ktx':str(ktx),
                            'png':str(permanent/(material+'.png')),'scale':float(scale)})
    target_file=temporary/'permanent-targets.json'
    target_file.write_text(json.dumps(targets,indent=2)+'\n',encoding='utf-8')
    subprocess.run(['node',str(ROOT/'tools/decode-map-materials-020.cjs'),str(target_file)],check=True,cwd=ROOT)
    results=json.loads(target_file.read_text(encoding='utf-8'))
    for result in results:
        result['png']=Path(result['png']).relative_to(ROOT).as_posix()
        result.pop('ktx')
    dependencies=[]
    for name,url in [('basis_transcoder.cjs','https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/libs/basis/basis_transcoder.js'),
                     ('basis_transcoder.wasm','https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/libs/basis/basis_transcoder.wasm'),
                     ('LICENSE-Apache-2.0.txt','https://raw.githubusercontent.com/BinomialLLC/basis_universal/master/LICENSE'),
                     ('LICENSE-Zstd-BSD.txt','https://raw.githubusercontent.com/facebook/zstd/dev/LICENSE')]:
        path=permanent/'decoder'/name
        dependencies.append({'path':path.relative_to(ROOT).as_posix(),'upstreamURL':url,'sha256':sha256(path.read_bytes()).hexdigest()})
    provenance={'scope':'Exact native KTX2 ground-material pixels decoded to RGBA/PNG for source-based preview generation; no game engine or emulator run.',
                'sourceAPK':APK.name,'sourceAPK_SHA256':sha256(APK.read_bytes()).hexdigest(),
                'decoder':'Vendored official Basis transcoder distributed by Three.js; asset-only WebAssembly execution.',
                'decoderLicense':'Basis Apache-2.0 plus bundled Zstandard BSD; decoder/LICENSE-Apache-2.0.txt and decoder/LICENSE-Zstd-BSD.txt',
                'nativeDataLicense':'Warzone source and data GPL-2.0-or-later, subject to COPYING.NONGPL exceptions. Original COPYING, COPYING.README and COPYING.NONGPL copied alongside.',
                'nativeLicensesSource':'vendor/engine/COPYING*','dependencies':dependencies,'materials':results}
    (permanent/'PROVENANCE.json').write_text(json.dumps(provenance,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'permanentMaterials':len(results),'directory':str(permanent)}))


def main():
    package_call=runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'),run_name='art020')['package_call']
    with ZipFile(APK) as archive:
        metadata=package_call(archive.read('assets/warzone/warzone2100.js').decode('utf-8'))[3]
        data=archive.read('assets/warzone/warzone2100.data')
    vfs={e['filename']:data[int(e['start']):int(e['end'])] for e in metadata['files']}
    if '--decode-materials' in sys.argv:
        decode_materials(vfs)
        return
    if '--references-only' in sys.argv:
        reference_maps(vfs)
        return
    basenames=defaultdict(list)
    for path in vfs:
        basenames[Path(path).name.lower()].append(path)
    terrain=json.loads(vfs['/data/base/tileset/tileTypes.json'])
    library={'scope':'Local native source/asset availability only; no emulator or engine run.',
             'sourceAPK':str(APK),'sourceAPK_SHA256':sha256(APK.read_bytes()).hexdigest(),
             'textureFlags':{'tileIndexMask':0x01ff,'xFlip':0x8000,'yFlip':0x4000,'rotationMask':0x3000,'rotationShift':12,'triangleFlip':0x0800},
             'flagSource':'lib/wzmaplib/include/wzmaplib/map.h in official local 4.7.0 source',
             'heightFormat':'Native V40 tile vertex height is uint16 in range0..510; world XY tile size is128. Legacy V10 height byte multiplies2.',
             'heightMaximum':510,'structureMaximumFoundationIncline':50,
             'structureInclineRule':'Non-defensive structures reject any footprint tile whose four native vertices differ by more than50. Walls/gates/defences exempt; keep starting bases and construction pads flat.',
             'featureFootprintRule':'Feature blocked bounds use width/breadth and snapped centre parity; unlike structures they do not swap dimensions with visual rotation (src/feature.cpp:getStructureBounds).',
             'groundCornerSourceOrder':'CSV fields are NW,NE,SW,SE before tile flips/rotation; see src/map.cpp:SetGroundForTile and determineGroundType.',
             'terrainNotes':['Terrain class7 WATER and8 CLIFFFACE are wheel-blocking; ordinary road6 and other ground classes remain native.',
                             'Material ground-corner definitions below are renderer source mappings. Tile rotation/flips change those corners too.',
                             'For a continuous ground surface, assign shared vertex materials coherently; avoid alternating uniform material tiles.',
                             'Scenery occupies actual native feature footprints; reserve routes and construction pads before placing scenery.'],
             'tilesets':{},'features':{}}
    OUT.mkdir(parents=True,exist_ok=True)
    for theme,title,num,stem in [('arizona','Arizona',1,'arizona'),('urban','Urban',2,'urban'),('rockies','Rockies',3,'rockie')]:
        enum=vfs[f'/data/base/tileset/{stem}_enum.txt'].decode().strip().splitlines()[1:]
        ground=[line.strip().split(',') for line in vfs[f'/data/base/tileset/{stem}ground.txt'].decode().strip().splitlines()[1:]]
        decals=[line.strip() for line in vfs[f'/data/base/tileset/{stem}decals.txt'].decode().strip().splitlines()[1:]]
        native_types=[terrain[title][f'Tile_{i:02d}'] for i in range(96)]
        uniform=defaultdict(list)
        for i,corners in enumerate(ground):
            if len(set(corners))==1: uniform[corners[0]].append(i)
        tile_images={i:f'/data/base/texpages/tertilesc{num}hw-128/tile-{i:02d}.png' for i in range(len(ground))}
        row={'nativeName':title,'dataset':f'MULTI_CAM_{num}','tileTypes':native_types,'materialEnum':enum,
             'tileGroundCorners':ground,'uniformTilesByMaterial':dict(uniform),'decalDefinitions':decals,
             'tileImages':{str(i):p for i,p in tile_images.items() if p in vfs},
             'groundSource':f'/data/base/tileset/{stem}ground.txt','groundTexturesDefinition':vfs[f'/data/base/tileset/tertilesc{num}hwGtype.txt'].decode()}
        row.update(terrainTypes=native_types,groundNames=enum,
                   groundCorners=[[enum.index(c) for c in corners] for corners in ground],
                   groundCornersNW_NE_SE_SW=[[enum.index(corners[i]) for i in (0,1,3,2)] for corners in ground],
                   safeUniformByMaterial={material:[i for i in ids if native_types[i] not in (7,8) and str(i) not in decals]
                                          for material,ids in uniform.items()},
                   roadTiles=[i for i in range(len(ground)) if native_types[i]==6],
                   cliffTiles=[i for i in range(len(ground)) if native_types[i]==8],
                   waterTiles=[i for i in range(len(ground)) if native_types[i]==7],
                   waterTile=17,textureExportFolder=str(OUT/theme/'tiles'))
        (OUT/theme/'tiles').mkdir(parents=True,exist_ok=True)
        for i,p in tile_images.items():
            if p in vfs:(OUT/theme/'tiles'/f'tile-{i:02d}.png').write_bytes(vfs[p])
        library['tilesets'][theme]=row
        size=86; canvas=Image.new('RGB',(8*size,((len(ground)+7)//8)*size+28),(20,25,30));draw=ImageDraw.Draw(canvas)
        draw.text((8,7),title+' actual native tile atlas / number and native terrain class',fill='white')
        for i,p in tile_images.items():
            if p not in vfs: continue
            source=Image.open(BytesIO(vfs[p])).convert('RGBA')
            tile=Image.new('RGBA',source.size,(17,23,27,255))
            tile.alpha_composite(source)
            tile=tile.convert('RGB').resize((80,64))
            x=(i%8)*size+3;y=(i//8)*size+28
            canvas.paste(tile,(x,y));draw.text((x,y+65),f'{i}: type{native_types[i]}',fill=(230,230,230))
        canvas.save(OUT/(theme+'-tiles.png'))
    features=json.loads(vfs['/data/base/stats/features.json'])
    for id,value in features.items():
        model=value.get('model',''); paths=basenames.get(model.lower(),[])
        textures=[]
        for path in paths:
            text=vfs[path].decode('utf-8',errors='replace')
            for texture in re.findall(r'^TEXTURE\s+\d+\s+(\S+)',text,re.M):
                options=basenames.get(texture.lower(),[])+basenames.get(str(Path(texture).with_suffix('.ktx2')).lower(),[])
                textures.append({'reference':texture,'resolvedAssets':options})
        library['features'][id]={'width':value.get('width',1),'breadth':value.get('breadth',1),
                                 'type':value.get('type'),'model':model,'modelAssets':paths,'textures':textures,
                                 'tileDraw':value.get('tileDraw'),'lineOfSight':value.get('lineOfSight'),
                                 'damageable':value.get('damageable',1),'hitpoints':value.get('hitpoints'),
                                 'allModelAndPrimaryTexturesBundled':bool(paths) and all(t['resolvedAssets'] for t in textures)}
    natural={
        'arizona':['arizonabush1','arizonabush2','arizonabush3','arizonabush4','arizonatree1','arizonatree2','arizonatree3','arizonatree4','arizonatree5','arizonatree6','Boulder1','Boulder2','Boulder3'],
        'urban':['Tree1','Tree2','Tree3','Ruin1','Ruin3','Ruin4','Ruin5','Ruin6','Ruin7','Ruin8','Ruin9','Ruin10','miruin2','building1','building2','building3','building7','building8','building10','building11','building12','OldFactory','OilTower','WaterTower','Crane','Pylon','BlueCar','Chevy','Pickup','Pipe','Pipe1A','Pipe2A','Pipe3A','bigcooltowr','nukepowstat'],
        'rockies':['Tree1','Tree2','Tree3','TreeSnow1','TreeSnow2','TreeSnow3','LogCabin1','LogCabin2','LogCabin3','LogCabin4','LogCabin5','Boulder1','Boulder2','Boulder3']}
    for theme,row in library['tilesets'].items():
        row['features']=[dict(name=name,**library['features'][name]) for name in natural[theme]]
    library['themes']=library['tilesets']
    output=ROOT/'tools/map-art-library-020.json'
    output.write_text(json.dumps(library,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'library':str(output),'features':len(features),'tilesets':list(library['tilesets']),'referenceSheets':str(OUT)}))


if __name__=='__main__':main()
