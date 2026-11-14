"""Retain supplied maps byte-for-byte and draw honest data-derived overviews.

Reads map/terrain/object records only; never evaluates archive content as code.
Original JSON, INI and binary objects stay unchanged in their native formats.
"""
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
from hashlib import sha256
from collections import Counter
import configparser
import json
import struct
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets"
SOURCE = ROOT / "scenario/ffa/maps-source.json"


def digest(value):
    return sha256(value).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(value if isinstance(value,bytes) else value.encode("utf-8"))


def dump(path, value):
    write(path,json.dumps(value,indent=2,ensure_ascii=False)+"\n")


def position(row):
    value = row["position"]
    return [float(n) for n in value.split(",")] if isinstance(value,str) else value


def owner(row):
    return str(row.get("startpos",row.get("player","neutral")))


def objects(archive, folder, kind):
    json_name = folder + {"droid":"droid.json","structure":"struct.json","feature":"feature.json"}[kind]
    if json_name in archive.namelist():
        return json.loads(archive.read(json_name))[kind+"s"]
    ini_name = folder + {"droid":"droid.ini","structure":"struct.ini","feature":"feature.ini"}[kind]
    parser = configparser.ConfigParser(interpolation=None)
    parser.read_string(archive.read(ini_name).decode("utf-8"))
    return [dict(parser[section]) for section in parser.sections()]


def read_map(row):
    path = ROOT / row["source"]
    if not path.is_file():
        supplied = Path("C:/Users/punke/Music/maps") / row["supplied"]
        raw = supplied.read_bytes()
        assert digest(raw) == row["sourceSHA256"], "Supplied map hash changed: " + row["id"]
        write(path,raw)
    assert digest(path.read_bytes()) == row["sourceSHA256"], "Retained map changed: " + row["id"]
    with ZipFile(path) as archive:
        members = [info.filename for info in archive.infolist() if not info.is_dir()]
        assert len(members) == len(set(members))
        for name in members:
            assert not PurePosixPath(name).is_absolute() and ".." not in PurePosixPath(name).parts
        modern = "level.json" in members
        if modern:
            assert set(members) == {"level.json","gam.json","game.map","ttypes.ttp","droid.json","struct.json","feature.json"}
            metadata = json.loads(archive.read("level.json"))
            assert metadata["players"] == row["players"] and metadata["tileset"] == row["tileset"]
            folder, gam_name = "", "gam.json"
        else:
            assert row["id"] == "templar-ffa"
            folder = "multiplay/maps/4c-Ng-TemplarFFA/"
            gam_name = "multiplay/maps/4c-Ng-TemplarFFA.gam"
            assert set(members) == {"4c-Ng-TemplarFFA.xplayers.lev",gam_name} | {folder+name for name in ("dinit.bjo","droid.ini","feat.bjo","feature.ini","game.map","struct.bjo","struct.ini","ttypes.ttp")}
            metadata = {"name":"Ng-TemplarFFA","players":4,"tileset":"urban","author":{"name":"nergal"},"spdx-license-id":"GPL-2.0-or-later"}
        raw = archive.read(folder+"game.map")
        assert raw[:4] == b"map "
        version,width,height = struct.unpack_from("<III",raw,4)
        assert version in (10,40) and 0 < width <= 512 and 0 < height <= 512
        bpp = 4 if version==40 else 3
        assert len(raw) >= 16+width*height*bpp
        textures, heights = [],[]
        for tile in range(width*height):
            at = 16+tile*bpp
            textures.append(struct.unpack_from("<H",raw,at)[0] & 0x01ff)
            heights.append(struct.unpack_from("<H",raw,at+2)[0] if bpp==4 else raw[at+2]*2)
        terrain_raw = archive.read(folder+"ttypes.ttp")
        assert terrain_raw[:4] == b"ttyp"
        count = struct.unpack_from("<I",terrain_raw,8)[0]
        terrain = struct.unpack_from("<"+"H"*count,terrain_raw,12)
        assert max(textures) < count
        tile_types = [terrain[texture] for texture in textures]
        droids = objects(archive,folder,"droid")
        structures = objects(archive,folder,"structure")
        features = objects(archive,folder,"feature")
        starts, base_counts = [],{}
        for player in range(row["players"]):
            own = [s for s in structures if owner(s)==str(player)]
            hq = [s for s in own if s["name"]=="A0CommandCentre"]
            trucks = [s for s in droids if owner(s)==str(player)]
            assert len(hq)==1 and trucks and all(s.get("template")=="ConstructionDroid" for s in trucks)
            x,y = position(hq[0])[:2]
            assert 0 <= x/128 < width and 0 <= y/128 < height
            starts.append({"player":player,"x":x/128,"y":y/128,"trucks":len(trucks)})
            base_counts[str(player)] = dict(Counter(s["name"] for s in own))
        oil = {tuple(position(s)[:2]) for s in features if s["name"]=="OilResource"}
        oil.update(tuple(position(s)[:2]) for s in structures if s["name"]=="A0ResourceExtractor")
        mappings = []
        target = ROOT / "map" / row["mapDirectory"]
        for name in members:
            if name.endswith(".lev"): continue
            relative = name.removeprefix(folder) if name.startswith(folder) else name
            if name == gam_name and not modern:
                destination = target / "game.gam"
            else:
                destination = target / relative
            raw_member = archive.read(name)
            write(destination,raw_member)
            virtual = "/data/mp/multiplay/maps/" + row["mapDirectory"] + "/" + destination.relative_to(target).as_posix()
            if name == gam_name:
                gam_virtual = "/data/mp/multiplay/maps/" + row["mapDirectory"] + ".gam"
                mappings.append({"original":name,"host":destination.relative_to(ROOT).as_posix(),"virtual":gam_virtual,"sha256":digest(raw_member)})
            mappings.append({"original":name,"host":destination.relative_to(ROOT).as_posix(),"virtual":virtual,"sha256":digest(raw_member)})
        descriptor = ('// Exact authored map; see retained original and PROVENANCE-066.json.\nlevel '+row["level"]+'\nplayers '+str(row["players"])+
            '\ntype 14\ndataset MULTI_CAM_'+('2' if row["tileset"]=="urban" else '1')+'\ngame "multiplay/maps/'+row["mapDirectory"]+'.gam"\n')
        # Preserve EMAG's original descriptor and provenance byte-for-byte.
        if row["id"] != "emag": write(target/"level.lev",descriptor)
        else: descriptor=(target/"level.lev").read_text(encoding="utf-8")
        proof = {"id":row["id"],"source":row["source"],"sourceSHA256":row["sourceSHA256"],"author":metadata["author"],
            "license":metadata["spdx-license-id"],"nativeFilesByteIdentical":True,"mapVersion":version,"width":width,"height":height,
            "starts":starts,"baseCounts":base_counts,"oilLocations":len(oil),"terrainCounts":dict(Counter(tile_types)),
            "heightRange":[min(heights),max(heights)],"mappings":mappings,"descriptor":descriptor,
            "neutralStructureCounts":dict(Counter(s["name"] for s in structures if owner(s) not in {str(i) for i in range(row["players"])}))}
        dump(target/"PROVENANCE-066.json",proof)
        return proof, (width,height,tile_types,heights,starts,oil)


def draw_preview(row, geometry):
    width,height,types,heights,starts,oil = geometry
    arizona = {0:(155,130,86),1:(132,117,81),2:(156,130,92),3:(117,107,73),4:(145,113,87),5:(153,113,95),6:(176,155,113),7:(47,104,129),8:(88,83,74),9:(122,112,100),10:(150,170,175),11:(104,138,145)}
    urban = {0:(121,119,103),1:(98,109,99),2:(127,120,106),3:(90,101,88),4:(123,119,110),5:(126,110,108),6:(88,91,92),7:(48,100,125),8:(69,73,76),9:(104,102,99),10:(155,175,181),11:(105,138,148)}
    palette = urban if row["tileset"]=="urban" else arizona
    image = Image.new("RGB",(width,height))
    pixels=[]
    for y in range(height):
        for x in range(width):
            i=y*width+x
            left=heights[y*width+max(0,x-1)]; up=heights[max(0,y-1)*width+x]
            light=max(.65,min(1.3,1+(heights[i]-left)*.002-(heights[i]-up)*.002))
            pixels.append(tuple(max(0,min(255,round(c*light))) for c in palette.get(types[i],(120,120,110))))
    image.putdata(pixels)
    scale=4
    size=(round(width*scale),round(height*scale))
    image=image.resize(size,Image.Resampling.NEAREST)
    preview=image
    ox,oy=0,0
    draw=ImageDraw.Draw(preview)
    for x,y in oil:
        px,py=ox+x/128*scale,oy+y/128*scale
        draw.ellipse((px-1.8,py-1.8,px+1.8,py+1.8),fill=(243,196,76))
    try: font=ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf",18);small=ImageFont.truetype("C:/Windows/Fonts/arial.ttf",15)
    except OSError: font=small=ImageFont.load_default()
    for start in starts:
        px,py=ox+start["x"]*scale,oy+start["y"]*scale
        draw.ellipse((px-12,py-12,px+12,py+12),fill=(78,168,219) if start["player"]==0 else (203,80,65),outline=(245,245,235),width=2)
        label=str(start["player"]+1); box=draw.textbbox((0,0),label,font=font)
        draw.text((px-(box[2]-box[0])/2,py-11),label,font=font,fill=(255,255,255))
    path=ASSETS/"ffa-previews"/(row["id"]+".png")
    path.parent.mkdir(parents=True,exist_ok=True);preview.save(path)
    return path


def build_maps():
    source=json.loads(SOURCE.read_text(encoding="utf-8"))
    stock_index=json.loads((ROOT/"vendor/duel-stock/package-index.json").read_text())
    stats_record=next(row for row in stock_index if row["filename"]=="/data/mp/stats/structure.json")
    with (ASSETS/"warzone/warzone2100.data").open("rb") as stream:stock_data=stream.read(64424618)
    assert digest(stock_data)=="9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424"
    structure_stats=json.loads(stock_data[stats_record["start"]:stats_record["end"]])
    catalogue,proofs=[],[]
    assert [r["id"] for r in source["maps"]] == ["emag","contact","templar-ffa","rb-simple","rb-usefull","emaj-6p"]
    for row in source["maps"]:
        assert row["players"] in (4,6) and len(row["level"])<=19
        proof,geometry=read_map(row);preview=draw_preview(row,geometry)
        entry={key:row[key] for key in ("id","name","players","level","mapDirectory","description","tileset","sourceSHA256")}
        entry.update(bots=row["players"]-1,preview=preview.relative_to(ASSETS).as_posix(),width=proof["width"],height=proof["height"])
        # Native initial-map loading enforces userLimits[1] before script
        # events. Raise only a selected map's authored over-cap structure type;
        # no map object, combat stat, cost or unrelated map default is changed.
        limits={}
        for counts in proof["baseCounts"].values():
            for id,count in counts.items():
                native=structure_stats[id].get("userLimits")
                if native and count>native[1]:limits[id]=max(limits.get(id,0),count)
        proof["requiredInitialStructureLimits"]=limits
        catalogue.append(entry);proofs.append(proof)
    result={"version":1,"maps":catalogue}
    dump(ASSETS/"ffa-maps.json",result)
    dump(ROOT/"vendor/ffa-maps/PROVENANCE.json",{"version":1,"maps":proofs,"previewMethod":"Actual native tile terrain types/heights, authored HQ starts and deduplicated oil positions; an overview, not a gameplay screenshot."})
    return result,proofs


if __name__=="__main__":
    catalogue,proofs=build_maps()
    print(json.dumps({"maps":[{key:r[key] for key in ("id","players","level","width","height","preview")} for r in catalogue["maps"]],"originalArchivesRetained":True},indent=2))
