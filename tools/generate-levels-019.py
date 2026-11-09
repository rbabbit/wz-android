"""Author 43 original Towers maps and render previews from their native data.

This tool authors assets and checks generation constraints. It does not run the
engine, native pathfinding, gameplay, an emulator, or a difficulty simulation.
Requires Python 3 and Pillow (``python -m pip install Pillow``).

Existing td1, td2, and Greenhaven source layouts are read-only. Their catalog
entries, if present, are retained when the new entries are regenerated.
"""
from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import argparse
import json
import struct

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "map/levels"
ASSETS = ROOT / "app/src/main/assets/warzone"
CATALOG = ASSETS / "levels/catalog.json"
PREVIEWS = ASSETS / "levels/previews"
W, H = 96, 112
RADIUS = 4  # Nine native tiles: room for wheeled units to pass and turn.


@dataclass(frozen=True)
class Recipe:
    name: str
    family: str
    description: str
    routes: tuple
    pads: tuple = ()
    links: tuple = ()


def path(*coordinates):
    return tuple(zip(coordinates[::2], coordinates[1::2]))


# These are 43 explicit geometric recipes, not palette/rotation copies. Each
# route starts on the actual northern spawn perimeter, follows native ground,
# and reaches the same connected southern base. Links create authored internal
# forks/loops; they never add an unlisted perimeter entrance.
EASY = [
    Recipe("Fernpass", "wide switchbacks", "One northern entrance follows three broad switchbacks into a sheltered southern base.",
           (path(14,0, 14,18, 78,18, 78,37, 26,37, 26,58, 64,58, 64,73, 48,73, 48,84),), ((78,32,7),(26,53,7))),
    Recipe("Copperbend", "long elbow", "A long western elbow opens into a central defense court before the rear base.",
           (path(78,0, 78,17, 22,17, 22,52, 70,52, 70,69, 43,69, 43,84),), ((22,38,8),(70,61,7))),
    Recipe("Willow Steps", "descending terraces", "Staggered terraces step from the northeast through three separate building courts.",
           (path(64,0, 64,15, 40,15, 40,33, 20,33, 20,51, 72,51, 72,70, 54,70, 54,84),), ((40,26,7),(20,43,7),(72,63,7))),
    Recipe("Amber Switch", "offset S pass", "An offset S pass reserves a broad western construction shelf near the final turn.",
           (path(20,0, 20,29, 75,29, 75,48, 33,48, 33,69, 48,69, 48,84),), ((20,19,7),(33,63,9))),
    Recipe("Juniper Run", "short neck and long shelf", "A narrow northern neck leads to a long eastern shelf and a late central turn.",
           (path(48,0, 48,14, 18,14, 18,35, 79,35, 79,65, 48,65, 48,84),), ((18,26,8),(79,54,7))),
    Recipe("Meadow Gate", "central bypass", "One entrance splits around a central stone island and rejoins well above the base.",
           (path(48,0, 48,20, 23,20, 23,49, 48,49, 48,69, 62,69, 62,84),), ((23,37,7),),
           (path(48,20, 73,20, 73,49, 48,49),)),
    Recipe("Quarry Walk", "deep western detour", "A deep western detour crosses the quarry once, leaving two generous staging pads.",
           (path(80,0, 80,27, 16,27, 16,62, 69,62, 69,76, 48,76, 48,84),), ((16,47,8),(48,62,7))),
    Recipe("Longford", "alternating causeways", "Four unequal causeways alternate across the valley before a single base entrance.",
           (path(28,0, 28,13, 69,13, 69,31, 38,31, 38,48, 80,48, 80,68, 44,68, 44,84),), ((38,40,7),(80,59,7))),
    Recipe("Pine Terrace", "terrace and fork", "A high eastern terrace feeds a small internal fork and one protected final approach.",
           (path(18,0, 18,22, 73,22, 73,45, 43,45, 43,73, 56,73, 56,84),), ((73,35,8),),
           (path(43,49, 20,49, 20,67, 43,67),)),
    Recipe("Slate Ribbon", "five-level ribbon", "A five-level ribbon offers repeated turns and compact construction pockets.",
           (path(68,0, 68,12, 31,12, 31,27, 78,27, 78,43, 22,43, 22,61, 56,61, 56,84),), ((31,21,7),(22,54,7))),
    Recipe("Orchard Way", "broad central court", "A northern dogleg opens into a broad central court with a western final flank.",
           (path(29,0, 29,26, 60,26, 60,48, 24,48, 24,72, 43,72, 43,84),), ((60,43,10),(24,63,7))),
    Recipe("Ochre Narrows", "staggered canyon", "A staggered canyon changes direction at unequal intervals before the wide base apron.",
           (path(81,0, 81,18, 51,18, 51,36, 16,36, 16,57, 73,57, 73,73, 52,73, 52,84),), ((51,28,7),(16,48,8))),
    Recipe("Cedar Reach", "long reach and side loop", "One long central reach has an optional eastern defense loop before the southern elbow.",
           (path(18,0, 18,16, 45,16, 45,60, 20,60, 20,74, 48,74, 48,84),), ((45,38,7),),
           (path(45,25, 76,25, 76,49, 45,49),)),
    Recipe("Lantern Basin", "offset basin", "An offset basin has a wide lower staging court and a short final neck to the base.",
           (path(61,0, 61,24, 22,24, 22,45, 77,45, 77,67, 43,67, 43,84),), ((22,35,7),(58,67,9))),
    Recipe("Quiet Approach", "double courtyard", "Two separated courtyards sit along a single winding road from the northwest.",
           (path(15,0, 15,20, 45,20, 45,38, 76,38, 76,59, 31,59, 31,74, 51,74, 51,84),), ((45,30,8),(76,51,8))),
]

MEDIUM = [
    Recipe("Twin Ravines", "late twin confluence", "Two long ravines meet only at the southern base apron.",
           (path(16,0, 16,22, 34,22, 34,45, 17,45, 17,70, 39,70, 39,84),
            path(80,0, 80,30, 63,30, 63,54, 80,54, 80,73, 57,73, 57,84)), ((34,36,7),(63,45,7))),
    Recipe("Crosswind", "upper junction and tail", "Two upper arms converge into a shared lower switchback.",
           (path(18,0, 18,23, 48,23, 48,43, 22,43, 22,64, 68,64, 68,75, 48,75, 48,84),
            path(78,0, 78,13, 65,13, 65,23, 48,23)), ((22,54,7),(48,23,7))),
    Recipe("Westmere Fork", "unequal approaches", "A short central arm and a long western arm meet beside a lower defense shelf.",
           (path(15,0, 15,32, 32,32, 32,60, 51,60, 51,84),
            path(68,0, 68,20, 83,20, 83,45, 51,45, 51,60)), ((32,49,7),(72,45,7))),
    Recipe("Granite Junction", "crossbar basin", "A central crossbar joins two entrances, then splits around a lower granite island.",
           (path(24,0, 24,30, 48,30, 48,47, 25,47, 25,68, 48,68, 48,84),
            path(73,0, 73,18, 60,18, 60,30, 48,30)), ((48,30,8),),
           (path(48,47, 72,47, 72,68, 48,68),)),
    Recipe("Two Rivers", "parallel stairways", "Two independent stairways arrive at separated western and eastern base gates.",
           (path(15,0, 15,17, 34,17, 34,36, 18,36, 18,57, 38,57, 38,84),
            path(80,0, 80,25, 62,25, 62,46, 78,46, 78,68, 60,68, 60,84)), ((18,49,7),(78,59,7))),
    Recipe("High and Low", "high merge with low fork", "A high confluence feeds a long shared spine and a fork above the base.",
           (path(18,0, 18,20, 47,20, 47,52, 22,52, 22,73, 47,73, 47,84),
            path(78,0, 78,34, 47,34)), ((47,42,7),),
           (path(47,52, 73,52, 73,73, 47,73),)),
    Recipe("Crescent Pair", "two enclosing arcs", "Two wide arcs enclose a central cliff and converge late in a broad court.",
           (path(31,0, 31,14, 14,14, 14,55, 32,55, 32,72, 48,72, 48,84),
            path(64,0, 64,24, 82,24, 82,61, 65,61, 65,72, 48,72)), ((14,39,7),(82,45,7),(48,72,8))),
    Recipe("Staggered Roads", "offset merge", "Offset northern roads meet in the west before one long eastern return.",
           (path(17,0, 17,43, 35,43, 35,59, 77,59, 77,74, 51,74, 51,84),
            path(77,0, 77,20, 48,20, 48,43, 35,43)), ((17,31,7),(61,59,7))),
    Recipe("Split Mesa", "central spine and rim", "A central spine and an outer rim remain separate until the last northern ridge.",
           (path(40,0, 40,24, 24,24, 24,47, 42,47, 42,70, 50,70, 50,84),
            path(80,0, 80,44, 65,44, 65,70, 50,70)), ((24,37,7),(80,32,7))),
    Recipe("Willow Weave", "connected twin ladders", "Two staggered ladders share a central crossing but retain separate lower lanes.",
           (path(17,0, 17,20, 34,20, 34,58, 18,58, 18,72, 39,72, 39,84),
            path(79,0, 79,31, 62,31, 62,63, 79,63, 79,75, 58,75, 58,84)), ((34,44,7),(62,49,7)),
           (path(34,42, 62,42),)),
    Recipe("Basalt Bow", "western loop and eastern drop", "A western bow and a steep eastern descent combine above a central final bend.",
           (path(34,0, 34,17, 14,17, 14,48, 35,48, 35,65, 67,65, 67,76, 48,76, 48,84),
            path(80,0, 80,35, 67,35, 67,65)), ((14,33,8),(67,54,7))),
    Recipe("Long Branches", "distant base gates", "Long, unequal branches pressure two distant edges of the same connected base.",
           (path(18,0, 18,28, 33,28, 33,48, 16,48, 16,75, 29,75, 29,84),
            path(74,0, 74,15, 58,15, 58,42, 81,42, 81,67, 66,67, 66,84)), ((16,64,7),(81,55,7))),
    Recipe("Old Canals", "ladder network", "Two canal-like routes have two cross connections and three lower building courts.",
           (path(24,0, 24,28, 35,28, 35,61, 24,61, 24,74, 42,74, 42,84),
            path(72,0, 72,17, 61,17, 61,54, 77,54, 77,74, 56,74, 56,84)), ((35,46,7),(77,65,7)),
           (path(35,35, 61,35),path(35,61, 61,61, 61,54))),
    Recipe("Arrowhead", "pointed confluence", "Unequal upper arms meet at an arrowhead court before one long lower zigzag.",
           (path(16,0, 16,17, 34,17, 34,39, 49,39, 49,55, 77,55, 77,72, 44,72, 44,84),
            path(80,0, 80,27, 65,27, 65,39, 49,39)), ((49,39,8),(77,64,7))),
    Recipe("Broken Ring", "open ring and tail", "Two entrances reach opposite sides of a broken ring, then share a western tail.",
           (path(18,0, 18,24, 32,24, 32,43, 19,43, 19,68, 48,68, 48,84),
            path(78,0, 78,16, 61,16, 61,43, 76,43, 76,68, 48,68)), ((19,56,7),(76,56,7)),
           (path(32,33, 61,33),)),
]

HARD = [
    Recipe("Three Crowns", "three late lanes", "Three northern gates keep separate lanes until the southern base apron.",
           (path(14,0, 14,27, 28,27, 28,54, 14,54, 14,73, 29,73, 29,84),
            path(48,0, 48,18, 43,18, 43,47, 50,47, 50,84),
            path(82,0, 82,35, 68,35, 68,62, 82,62, 82,75, 68,75, 68,84)), ((28,42,7),(68,50,7))),
    Recipe("Trident Gorge", "trident junction", "Three unequal arms converge at a gorge, then one switchback defends the rear base.",
           (path(14,0, 14,30, 33,30, 33,51, 49,51, 49,64, 75,64, 75,76, 48,76, 48,84),
            path(48,0, 48,20, 49,20, 49,51),
            path(82,0, 82,21, 66,21, 66,51, 49,51)), ((33,42,7),(66,39,7))),
    Recipe("Flanking Ridges", "two flanks and a spine", "A straight central spine is flanked by two long, independently winding ridge roads.",
           (path(14,0, 14,18, 29,18, 29,39, 14,39, 14,64, 31,64, 31,84),
            path(48,0, 48,34, 43,34, 43,60, 50,60, 50,84),
            path(82,0, 82,28, 67,28, 67,49, 82,49, 82,70, 68,70, 68,84)), ((14,54,7),(82,61,7))),
    Recipe("Triune Crossing", "crossed middle network", "Three upper routes share two middle crossings but divide into two final approaches.",
           (path(14,0, 14,24, 31,24, 31,60, 18,60, 18,73, 37,73, 37,84),
            path(48,0, 48,17, 51,17, 51,67, 60,67, 60,84),
            path(82,0, 82,34, 68,34, 68,67, 60,67)), ((31,46,7),(68,53,7)),
           (path(31,37, 51,37),path(51,54, 68,54))),
    Recipe("Three Rivers", "staggered tributaries", "Three staggered tributaries join at different depths before one central defense neck.",
           (path(16,0, 16,19, 32,19, 32,44, 47,44, 47,64, 22,64, 22,76, 47,76, 47,84),
            path(48,0, 48,24, 47,24, 47,44),
            path(80,0, 80,30, 66,30, 66,57, 47,57)), ((32,33,7),(66,45,7))),
    Recipe("Needle Forks", "lower three-way fan", "Three compact northern paths broaden into a lower three-way fan above the base.",
           (path(14,0, 14,34, 28,34, 28,52, 48,52, 48,84),
            path(48,0, 48,15, 43,15, 43,52, 48,52),
            path(82,0, 82,24, 68,24, 68,52, 48,52)), ((28,44,7),(68,40,7)),
           (path(48,61, 22,61, 22,84),path(48,68, 76,68, 76,84))),
    Recipe("Braided Front", "three-lane braid", "Three lanes are linked at alternating depths to form a broad braided front.",
           (path(14,0, 14,21, 29,21, 29,52, 16,52, 16,71, 34,71, 34,84),
            path(48,0, 48,31, 44,31, 44,63, 51,63, 51,84),
            path(82,0, 82,16, 67,16, 67,44, 81,44, 81,68, 66,68, 66,84)), ((16,62,7),(81,58,7)),
           (path(29,37, 44,37),path(44,56, 81,56))),
    Recipe("Split Summit", "paired upper arms and third flank", "Two summit arms meet early while a third eastern flank stays separate until the base.",
           (path(14,0, 14,26, 34,26, 34,45, 17,45, 17,65, 41,65, 41,84),
            path(48,0, 48,15, 34,15, 34,26),
            path(82,0, 82,37, 65,37, 65,58, 80,58, 80,74, 62,74, 62,84)), ((17,55,7),(80,66,7))),
    Recipe("Canyon Council", "three basin junctions", "Three entrances feed staggered basin junctions and a shared lower horseshoe.",
           (path(14,0, 14,18, 31,18, 31,48, 48,48, 48,60, 76,60, 76,74, 46,74, 46,84),
            path(48,0, 48,27, 48,48),
            path(82,0, 82,23, 65,23, 65,48, 48,48)), ((31,37,7),(65,36,7),(76,67,7)),
           (path(31,57, 22,57, 22,74, 46,74),)),
    Recipe("Triple Bend", "unequal triple elbows", "Three unequal elbows keep distinct timings and join across the wide base front.",
           (path(14,0, 14,39, 29,39, 29,60, 17,60, 17,76, 32,76, 32,84),
            path(48,0, 48,18, 43,18, 43,48, 52,48, 52,84),
            path(82,0, 82,14, 68,14, 68,36, 82,36, 82,59, 67,59, 67,84)), ((14,27,7),(82,48,7),(67,72,7))),
    Recipe("Crown Basin", "upper crown and divided tail", "An upper crown connects three gates before two separate lower defense courts.",
           (path(14,0, 14,28, 32,28, 32,48, 18,48, 18,70, 39,70, 39,84),
            path(48,0, 48,16, 49,16, 49,28, 32,28),
            path(82,0, 82,21, 66,21, 66,48, 78,48, 78,72, 59,72, 59,84)), ((18,60,8),(78,62,7)),
           (path(49,28, 66,28),)),
    Recipe("Ridge Network", "three linked ridge ladders", "Three linked ridge ladders offer many internal transfers and three base approaches.",
           (path(14,0, 14,17, 28,17, 28,47, 15,47, 15,69, 31,69, 31,84),
            path(48,0, 48,28, 45,28, 45,58, 50,58, 50,84),
            path(82,0, 82,24, 68,24, 68,52, 81,52, 81,73, 66,73, 66,84)), ((15,59,7),(81,63,7)),
           (path(28,34, 45,34),path(45,43, 68,43),path(31,69, 50,69))),
    Recipe("Final Confluence", "three distant confluences", "Three distant northern gates merge in stages around two broad cliff islands.",
           (path(14,0, 14,23, 31,23, 31,46, 48,46, 48,63, 72,63, 72,76, 47,76, 47,84),
            path(48,0, 48,13, 43,13, 43,31, 31,31),
            path(82,0, 82,32, 65,32, 65,54, 48,54)), ((31,40,7),(65,44,7),(72,69,7)),
           (path(48,63, 23,63, 23,76, 47,76),)),
]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def write(pathname, content):
    pathname.parent.mkdir(parents=True, exist_ok=True)
    pathname.write_bytes(content if isinstance(content, bytes) else content.encode("utf-8"))


def dump(pathname, obj):
    write(pathname, json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


def rectangle(x1, y1, x2, y2):
    return {(x, y) for x in range(x1, x2 + 1) for y in range(y1, y2 + 1)}


def trace(points):
    cells = set()
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        require(x1 == x2 or y1 == y2, "Non-orthogonal authored segment")
        cells |= rectangle(min(x1,x2), min(y1,y2), max(x1,x2), max(y1,y2))
    return cells


def brush(cells, radius):
    return {(x+dx, y+dy) for x,y in cells
            for dx in range(-radius, radius+1) for dy in range(-radius, radius+1)
            if 0 <= x+dx < W and 0 <= y+dy < H}


def connected(cells, origin):
    require(origin in cells, "Connectivity origin is not native ground")
    seen, pending = {origin}, deque([origin])
    while pending:
        x,y = pending.popleft()
        for p in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if p in cells and p not in seen:
                seen.add(p)
                pending.append(p)
    return seen


def footprint(spec, x, y):
    w,h = spec["width"],spec["breadth"]
    return rectangle(x-w//2, y-h//2, x-w//2+w-1, y-h//2+h-1)


def map_floor(recipe, number):
    lines = recipe.routes + recipe.links
    centerlines = set().union(*(trace(p) for p in lines))
    ground = brush(centerlines, RADIUS)
    base = rectangle(7,82,88,106)
    # Different front shoulders create usable connected construction shelves.
    if number % 4 == 0:
        base |= rectangle(10,76,31,84)
    elif number % 4 == 1:
        base |= rectangle(64,76,85,84)
    elif number % 4 == 2:
        base |= rectangle(10,78,27,84) | rectangle(68,78,85,84)
    else:
        base |= rectangle(35,76,60,84)
    ground |= base
    for x,y,radius in recipe.pads:
        ground |= rectangle(x-radius,y-radius,x+radius,y+radius)
    require(all(0 <= x < W and 0 <= y < H for x,y in ground), "Ground outside native map")
    roads = brush(centerlines, 1)
    # The actual native road continues through the main base aisle.
    roads |= rectangle(45,82,50,99) | rectangle(12,92,82,94)
    return ground, roads & ground, base


def gateways(recipe, ground):
    gates, used = [], set()
    for points in recipe.routes + recipe.links:
        for (x1,y1),(x2,y2) in zip(points,points[1:]):
            if abs(x2-x1)+abs(y2-y1) < 14:
                continue
            x,y = (x1+x2)//2,(y1+y2)//2
            if y < 10 or y > 74:
                continue
            gate = (x-RADIUS,y,x+RADIUS,y) if x1 == x2 else (x,y-RADIUS,x,y+RADIUS)
            a,b,c,d = gate
            cells = rectangle(a,b,c,d)
            outside = {(a-1,b),(c+1,d)} if b == d else {(a,b-1),(c,d+1)}
            if cells <= ground and not outside & ground and not brush(cells,2) & used:
                gates.append(gate)
                used |= cells
    return gates


def native_objects(recipe, difficulty, number, ground, specs):
    structures, droids, features, occupied = [], [], [], set()
    next_id = 100
    shift = (-3,0,3)[number % 3]
    def add_structure(name,x,y,player=0):
        nonlocal next_id
        spec = specs[name]
        cells = footprint(spec,x,y)
        require(cells <= ground and not cells & occupied, f"Invalid footprint: {recipe.name} {name} {(x,y)}")
        occupied.update(cells)
        structures.append({"name":name,"id":next_id,
                           "position":[round((x+(spec['width']%2)*.5)*128),round((y+(spec['breadth']%2)*.5)*128)],
                           "rotation":0,"startpos":player})
        next_id += 1
    # All owned infrastructure lies on one broad flat rear base. The uplink
    # is behind the HQ, on its own clear court, and never on a spawn platform.
    for name,x,y in [
        ("A0CommandCentre",48+shift,96),
        ("A0Sat-linkCentre",48+shift,103),
        ("A0ResearchFacility",25+shift,89),
        ("A0ResearchFacility",25+shift,97),
        ("A0LightFactory",68+shift,89),
        ("A0LightFactory",80+shift,96),
        ("A0CyborgFactory",66+shift,100),
        ("A0PowerGenerator",12+shift,88),
        ("GuardTower1",37+shift,84),
        ("GuardTower1",58+shift,84),
    ]:
        add_structure(name,x,y)
    if difficulty != "easy" or number % 2 == 0:
        add_structure("A0PowerGenerator",12+shift,96)
    if difficulty == "hard":
        add_structure("GuardTower1",20+shift,84)
        add_structure("GuardTower1",75+shift,84)
    oil = [(11+shift,102),(17+shift,102),(29+shift,104),(35+shift,104)]
    for x,y in oil:
        add_structure("A0ResourceExtractor",x,y)
        features.append({"name":"OilResource","id":next_id,"position":[x*128+64,y*128+64],"rotation":0})
        next_id += 1
    enemy_x = recipe.routes[0][0][0]
    add_structure("A0CommandCentre",enemy_x-2,6,1)
    human_count = {"easy":4,"medium":5,"hard":6}[difficulty]
    for player,points in [(0,[(39+2*n,89) for n in range(human_count)]),(1,[(enemy_x+2,9)])]:
        for x,y in points:
            require((x,y) in ground and (x,y) not in occupied, f"Truck blocked: {recipe.name}")
            droids.append({"template":"ConstructionDroid","id":next_id,"position":[x*128+64,y*128+64],"rotation":0,"startpos":player})
            next_id += 1
    # Scenery is on blocked ridge tiles, never on build pads or the approach.
    candidates = [(x,y) for y in range(9,78,13) for x in range(7,90,17)
                  if (x,y) not in ground and (x+1,y) not in ground and (x,y+1) not in ground]
    for n,(x,y) in enumerate(candidates):
        if (n+number)%3:
            continue
        features.append({"name":"Boulder"+str(1+n%3),"id":next_id,
                         "position":[x*128+64,y*128+64],"rotation":(n*8192)%65536})
        next_id += 1
    return structures,droids,features,occupied


def source_constraints(recipe, difficulty, ground, base, occupied, structures, droids, specs):
    entrance_centers = [p[0][0] for p in recipe.routes]
    edges = {(x,1) for x in range(1,W-1)} | {(x,H-2) for x in range(1,W-1)}
    edges |= {(1,y) for y in range(2,H-1)} | {(W-2,y) for y in range(2,H-1)}
    entrances = ground & edges
    expected = {(x,1) for cx in entrance_centers for x in range(cx-RADIUS,cx+RADIUS+1)}
    require(entrances == expected, f"Unexpected perimeter mouth: {recipe.name}")
    require(len(entrance_centers) == {"easy":1,"medium":2,"hard":3}[difficulty], "Difficulty entrance mismatch")
    origin = (entrance_centers[0],1)
    require(connected(ground,origin) == ground, f"Disconnected terrain: {recipe.name}")
    free = ground-occupied
    reached = connected(free,origin)
    require(expected <= reached, f"Blocked perimeter mouth: {recipe.name}")
    trucks = {(d["position"][0]//128,d["position"][1]//128) for d in droids}
    require(trucks <= reached, f"Disconnected starting truck: {recipe.name}")
    for s in structures:
        x,y = (v//128 for v in s["position"])
        cells = footprint(specs[s["name"]],x,y)
        ring = brush(cells,1)-occupied
        require(bool(ring & reached), f"Unreachable structure perimeter: {recipe.name} {s['name']}")
    sat = next(s for s in structures if s["name"] == "A0Sat-linkCentre")
    sx,sy = (v//128 for v in sat["position"])
    sat_cells = footprint(specs[sat["name"]],sx,sy)
    sat_court = brush(sat_cells,3)-sat_cells
    require(sat_court <= base, f"Satellite court is not inside the rear base: {recipe.name}")
    require(not sat_court & (occupied-sat_cells | trucks), f"Satellite lacks three clear tiles: {recipe.name}")
    require(sat_court <= reached, f"Satellite court is disconnected: {recipe.name}")
    hq = next(s for s in structures if s["name"] == "A0CommandCentre" and s["startpos"] == 0)
    require(sat["position"][1] > hq["position"][1], "Satellite must be behind the human HQ")
    return {"dimensions":[W,H],"groundTiles":len(ground),"entryCount":len(entrance_centers),
            "entranceCenters":[[x,1] for x in entrance_centers],"entranceTiles":sorted(entrances),
            "staticConnectedGround":True,"staticStartingFootprintsAndRoutes":True,
            "staticSatelliteThreeTileClearCourt":True,"authoredHumanSatelliteId":sat["id"],
            "humanSatelliteTile":[sx,sy],"humanHQTile":[hq["position"][0]//128,hq["position"][1]//128],
            "startingHumanTrucks":sum(d["startpos"]==0 for d in droids),
            "authoredHumanTruckIds":[d["id"] for d in droids if d["startpos"]==0],
            "runtimeNativeIdsObserved":False,
            "humanTruckTiles":[[d["position"][0]//128,d["position"][1]//128] for d in droids if d["startpos"]==0],
            "startingHumanStructures":dict(Counter(s["name"] for s in structures if s["startpos"]==0)),
            "nativePathfindingOrGameplayTested":False,"difficultyPlaytested":False}


def font(size, bold=False):
    # Prefer the same font when present; Pillow's bundled fallback keeps this
    # usable elsewhere. Map and object pixels are independent of typography.
    candidates = [Path("C:/Windows/Fonts/" + ("segoeuib.ttf" if bold else "segoeui.ttf")),
                  Path("/usr/share/fonts/truetype/dejavu/DejaVuSans" + ("-Bold.ttf" if bold else ".ttf"))]
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate),size)
    return ImageFont.load_default(size=size)


def render_preview(directory, entry, specs):
    """Read back written V40 terrain and JSON objects; no invented screenshots."""
    data = (directory/"game.map").read_bytes()
    require(data[:4] == b"map ", "Preview source is not a native map")
    version,width,height = struct.unpack_from("<III",data,4)
    require(version == 40, "Preview source map version changed")
    types = (directory/"ttypes.ttp").read_bytes()
    terrain_count = struct.unpack_from("<I",types,8)[0]
    terrain = struct.unpack_from("<"+"H"*terrain_count,types,12)
    scale, margin, header, footer = 4,12,52,50
    image = Image.new("RGB",(width*scale+2*margin,height*scale+header+footer),(15,22,24))
    draw = ImageDraw.Draw(image)
    draw.text((margin,5),entry["name"],font=font(21,True),fill=(237,244,236))
    draw.text((margin,32),f"{entry['difficulty'].upper()}  /  {entry['entryCount']} northern entrance"+("s" if entry["entryCount"]>1 else ""),font=font(12),fill=(159,181,172))
    # Terrain class colors are a schematic rendering of the native texture's
    # real terrain class: cliff 8, ground 3, road 6, water 7.
    palette = {8:(64,66,59),3:(92,119,68),6:(163,144,99),7:(48,88,112)}
    for y in range(height):
        for x in range(width):
            texture,altitude = struct.unpack_from("<HH",data,16+4*(y*width+x))
            kind = terrain[texture & 0x1ff]
            color = palette.get(kind,(116,105,76))
            if kind == 8:
                shade = ((x*11+y*7)%5-2)*3
                color = tuple(max(0,min(255,c+shade)) for c in color)
            elif kind == 3 and texture & 0x1ff == 24:
                color = (101,126,74)
            draw.rectangle((margin+x*scale,header+y*scale,margin+(x+1)*scale-1,header+(y+1)*scale-1),fill=color)
    def tile_rect(x1,y1,x2,y2):
        return (margin+x1*scale,header+y1*scale,margin+(x2+1)*scale-1,header+(y2+1)*scale-1)
    for feature in json.loads((directory/"feature.json").read_text())["features"]:
        x,y = (v//128 for v in feature["position"])
        if feature["name"] == "OilResource":
            draw.ellipse(tile_rect(x,y,x,y),fill=(36,43,41))
        elif feature["name"].startswith("Boulder"):
            draw.ellipse(tile_rect(x,y,x,y),fill=(89,86,72),outline=(46,49,43))
    structures = json.loads((directory/"struct.json").read_text())["structures"]
    for s in structures:
        x,y = (v//128 for v in s["position"])
        cells = footprint(specs[s["name"]],x,y)
        x1,y1 = min(p[0] for p in cells),min(p[1] for p in cells)
        x2,y2 = max(p[0] for p in cells),max(p[1] for p in cells)
        color = (123,189,224) if s["startpos"] == 0 else (219,102,82)
        if s["name"] == "A0Sat-linkCentre":
            color = (255,219,117)
            draw.rectangle(tile_rect(x1-3,y1-3,x2+3,y2+3),outline=(223,196,112),width=1)
        elif s["name"] == "A0CommandCentre" and s["startpos"] == 0:
            color = (221,241,244)
        draw.rectangle(tile_rect(x1,y1,x2,y2),fill=color,outline=(25,39,42),width=1)
        if s["name"] == "A0Sat-linkCentre":
            px,py = margin+x*scale,header+y*scale
            draw.line((px,py-6,px,py+4),fill=(255,237,169),width=2)
            draw.arc((px-5,py-8,px+5,py+2),180,360,fill=(255,237,169),width=2)
    for d in json.loads((directory/"droid.json").read_text())["droids"]:
        x,y = (v//128 for v in d["position"])
        draw.ellipse(tile_rect(x,y,x,y),fill=(187,235,245) if d["startpos"] == 0 else (240,132,107))
    for x,y in entry["entrances"]:
        px,py = margin+x*scale,header+3
        draw.polygon(((px-5,py),(px+5,py),(px,py+9)),fill=(239,130,100))
    draw.text((margin+width*scale-23,header+12),"N",font=font(14,True),fill=(234,238,223))
    draw.line((margin+width*scale-17,header+34,margin+width*scale-17,header+52),fill=(234,238,223),width=2)
    y = header+height*scale+10
    for x,color,label in [(margin,(123,189,224),"Your base"),(150,(255,219,117),"Uplink"),(277,(239,130,100),"Enemy entry")]:
        draw.rectangle((x,y+3,x+9,y+12),fill=color)
        draw.text((x+15,y),label,font=font(12),fill=(211,223,211))
    draw.text((margin,y+23),"Native map data preview · terrain and starting objects",font=font(11),fill=(142,161,151))
    PREVIEWS.mkdir(parents=True,exist_ok=True)
    image.save(PREVIEWS/(entry["id"]+".png"),optimize=True)


def author(recipe, difficulty, number, ttp, specs):
    prefix = {"easy":"E","medium":"M","hard":"H"}[difficulty]
    level_id = f"{difficulty}{number:02}"
    native_folder = f"wt-{prefix.lower()}{number:02}"
    map_name = f"WT-{prefix}{number:02}-T1"
    directory = OUT/level_id
    ground,roads,base = map_floor(recipe,number)
    structures,droids,features,occupied = native_objects(recipe,difficulty,number,ground,specs)
    proof = source_constraints(recipe,difficulty,ground,base,occupied,structures,droids,specs)
    require(all(rectangle(x-r,y-r,x+r,y+r) <= ground-occupied for x,y,r in recipe.pads),
            f"Construction pad is not clear: {recipe.name}")
    flat_vertices = {(x+dx,y+dy) for x,y in ground for dx,dy in ((0,0),(1,0),(0,1),(1,1))}
    gates = gateways(recipe,ground)
    tiles = bytearray()
    for y in range(H):
        for x in range(W):
            texture = 18 if (x,y) not in ground else 77 if (x,y) in roads else 24 if (x*17+y*11+number)%13 == 0 else 23
            tiles.extend(struct.pack("<HH",texture,128 if (x,y) in flat_vertices else 384))
    write(directory/"game.map",b"map "+struct.pack("<III",40,W,H)+tiles+struct.pack("<II",1,len(gates))+bytes(v for gate in gates for v in gate))
    write(directory/"ttypes.ttp",ttp)
    dump(directory/"struct.json",{"version":2,"structures":structures})
    dump(directory/"droid.json",{"version":2,"droids":droids})
    dump(directory/"feature.json",{"version":2,"features":features})
    dump(directory/"gam.json",{"version":7,"gameTime":0,"GameType":0,"ScrollMinX":0,"ScrollMinY":0,"ScrollMaxX":W,"ScrollMaxY":H,"levelName":""})
    dump(directory/"level.json",{"name":native_folder,"type":"skirmish","players":2,"tileset":"arizona","author":{"name":"Warzone Towers"},"spdx-license-id":"CC0-1.0","generator":"tools/generate-levels-019.py"})
    write(directory/"level.lev",f"// {recipe.name}: original Towers layout, CC0-1.0\nlevel {map_name}\nplayers 2\ntype 14\ndataset MULTI_CAM_1\ngame \"multiplay/maps/{native_folder}.gam\"\n")
    entry = {"id":level_id,"name":recipe.name,"difficulty":difficulty,"description":recipe.description,
             "rounds":{"easy":15,"medium":20,"hard":25}[difficulty],
             "preparationSeconds":{"easy":240,"medium":180,"hard":150}[difficulty],
             "mapName":map_name,"nativeFolder":native_folder,"tileset":"arizona",
             "preview":f"warzone/levels/previews/{level_id}.png","humanPosition":0,"northFacing":True,"legacy":False,
             "entryCount":len(recipe.routes),"entrances":[[p[0][0],1] for p in recipe.routes],"dimensions":[W,H],
             "routeFamily":recipe.family,"satellite":"A0Sat-linkCentre","satelliteTile":proof["humanSatelliteTile"],
             "previewDescription":"Schematic rendered from this map's actual native terrain and starting objects; not gameplay.",
             "sourceDirectory":f"map/levels/{level_id}","sourceOnly":True,"gameplayVerified":False}
    proof.update({"id":level_id,"name":recipe.name,"routeFamily":recipe.family,"routes":recipe.routes,"links":recipe.links,
                  "constructionPads":recipe.pads,"gateways":gates,"humanPosition":0,"northFacing":True,
                  "staticClearConstructionPads":True,"staticFlatGroundHeight":128,
                  "tileset":"arizona","terrainTypeSource":"vendor/maps/td1-v3/map/ttypes.ttp",
                  "terrainTypeSourceLicense":"CC0-1.0, NoQ td1_v3 supplied map dependency",
                  "geometrySHA256":sha256(json.dumps(sorted(ground)).encode()).hexdigest(),
                  "nativeMapSHA256":sha256((directory/"game.map").read_bytes()).hexdigest(),
                  "verificationScope":"Generation constraints only; no engine, emulator, native pathfinding, gameplay, or difficulty run."})
    dump(directory/"AUTHORING.json",proof)
    render_preview(directory,entry,specs)
    return entry,proof


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--new-only-catalog",action="store_true",help="Omit retained legacy entries from the catalog (does not delete their sources).")
    args = parser.parse_args()
    require((len(EASY),len(MEDIUM),len(HARD)) == (15,15,13), "Incorrect authored level counts")
    ttp = (ROOT/"vendor/maps/td1-v3/map/ttypes.ttp").read_bytes()
    count = struct.unpack_from("<I",ttp,8)[0]
    types = struct.unpack_from("<"+"H"*count,ttp,12)
    require(types[18] == 8 and types[23] == 3 and types[24] == 3 and types[77] == 6, "Arizona terrain mapping changed")
    catalog = json.loads((ASSETS/"command-catalog.json").read_text(encoding="utf-8"))
    specs = {b["id"]:b for b in catalog["buildings"]}
    require(specs["A0Sat-linkCentre"]["width"] == 2 and specs["A0Sat-linkCentre"]["breadth"] == 2, "Native satellite footprint changed")
    entries,proofs = [],[]
    for difficulty,recipes in (("easy",EASY),("medium",MEDIUM),("hard",HARD)):
        for number,recipe in enumerate(recipes,1):
            entry,proof = author(recipe,difficulty,number,ttp,specs)
            entries.append(entry)
            proofs.append(proof)
    require(len({p["geometrySHA256"] for p in proofs}) == 43,"Duplicate traversable geometry")
    require(len({e["routeFamily"] for e in entries}) >= 21,"Not enough distinct route recipes")
    legacy = []
    if CATALOG.is_file() and not args.new_only_catalog:
        previous = json.loads(CATALOG.read_text(encoding="utf-8"))
        legacy = [e for e in previous.get("levels",[]) if e.get("id") in ("td1","td2","beginner")]
    dump(CATALOG,{"schemaVersion":1,"previewDescription":"Previews are schematic native-map-data renderings, not gameplay screenshots.","levels":legacy+entries})
    dump(OUT/"GENERATION.json",{"schemaVersion":1,"generator":"tools/generate-levels-019.py","newLevels":43,
         "counts":{"easy":15,"medium":15,"hard":13},"distinctRouteRecipes":len({e["routeFamily"] for e in entries}),
         "uniqueNativeGeometries":len({p["geometrySHA256"] for p in proofs}),
         "nativeMapFormat":40,"dimensions":[W,H],"terrainTypeSHA256":sha256(ttp).hexdigest(),
         "humanSatelliteInEveryNewRearBase":True,"satelliteClearanceTiles":3,
         "staticGenerationConstraintsSatisfied":True,"nativePathfindingOrGameplayTested":False,
         "difficultyPlaytested":False,"existingMapSourcesModified":False,
         "maps":[{"id":p["id"],"geometrySHA256":p["geometrySHA256"],"nativeMapSHA256":p["nativeMapSHA256"]} for p in proofs]})
    print(json.dumps({"authored":43,"catalogLevels":len(legacy)+43,"uniqueGeometry":43,
                      "routeRecipes":len({e["routeFamily"] for e in entries}),"previewSource":"actual native map/object data",
                      "scope":"source generation constraints only; no engine/emulator/gameplay/difficulty run"}))


if __name__ == "__main__":
    main()
