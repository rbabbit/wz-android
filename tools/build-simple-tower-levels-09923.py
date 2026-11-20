"""Author and package 50 practical single-route Towers maps.

This is a deterministic content build.  It writes native map sources, compact
actual-data previews, catalogue/launch metadata and appends the authored files
to the existing Emscripten data package.  It does not start Warzone, Android,
an emulator, a device, a pathfinder, or a gameplay/balance test.
"""
from __future__ import annotations

import argparse
from collections import Counter, deque
from hashlib import sha256
from pathlib import Path
import json
import re
import runpy
import struct

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets/warzone"
MAP_ROOT = ROOT / "map/simple-levels"
SCENARIO_ROOT = ROOT / "scenario/simple-levels"
FILES = ("game.map", "ttypes.ttp", "struct.json", "droid.json", "feature.json", "gam.json", "level.json")
VERSION = "0.99.24"

NAMES = {
    "easy": [
        "Long Bend", "Broad Reach", "Quiet Turn", "Southgate", "Gravel Run",
        "Open Elbow", "Clear Passage", "Meadow Hook", "Long Approach",
        "Wide Corner", "Simple S", "Base Road", "North Sweep", "Open Switch",
        "Broad Arc", "Safe Corridor", "Rear Haven",
    ],
    "medium": [
        "Wide Switchback", "Cross Bend", "Middle Run", "Three Turns",
        "Wide Zigzag", "Outer Sweep", "Central Hook", "Double Bend",
        "Long Return", "Open Ladder", "Sidewinder", "Bent Causeway",
        "Lower Switch", "Square S", "Offset Run", "Broad Ladder", "Long Defence",
    ],
    "hard": [
        "Three Corners", "Tight Switchback", "Deep Zigzag", "Long Gauntlet",
        "Outer Wall", "Repeated Bend", "Narrow Reach", "Hard Turn",
        "Five Corners", "West Run", "East Run", "Long Serpent",
        "Final Approach", "Hooked Line", "Deep Switch", "Rear Guard",
    ],
}

# Centre lines in approach percentages (x across the map, y down to the base).
# Each route has its own bend locations. The first leg is vertical so the
# northern spawn stays together, even on diagonal layouts.
PATHS = {
    "easy": [
        [(24, 0), (24, 38), (67, 38), (67, 72), (51, 83), (51, 100)],
        [(46, 0), (46, 100)],
        [(71, 0), (71, 30), (41, 60), (41, 100)],
        [(56, 0), (56, 56), (38, 56), (38, 100)],
        [(20, 0), (20, 23), (67, 75), (67, 100)],
        [(76, 0), (76, 61), (49, 61), (49, 100)],
        [(33, 0), (33, 46), (56, 46), (56, 100)],
        [(21, 0), (21, 23), (68, 26), (68, 57), (52, 83), (52, 100)],
        [(74, 0), (74, 24), (31, 65), (43, 86), (43, 100)],
        [(29, 0), (29, 57), (64, 57), (64, 100)],
        [(53, 0), (53, 22), (25, 44), (27, 68), (56, 83), (56, 100)],
        [(63, 0), (63, 100)],
        [(21, 0), (21, 29), (48, 29), (74, 65), (60, 84), (60, 100)],
        [(71, 0), (71, 32), (26, 32), (26, 68), (44, 82), (44, 100)],
        [(38, 0), (38, 24), (67, 44), (68, 66), (43, 86), (43, 100)],
        [(58, 0), (58, 27), (33, 52), (33, 100)],
        [(40, 0), (40, 35), (70, 63), (57, 81), (57, 100)],
    ],
    "medium": [
        [(21, 0), (21, 25), (74, 25), (74, 61), (39, 61), (39, 100)],
        [(74, 0), (74, 27), (24, 46), (24, 62), (54, 83), (54, 100)],
        [(46, 0), (46, 29), (23, 46), (23, 70), (43, 83), (43, 100)],
        [(70, 0), (70, 35), (24, 35), (24, 72), (41, 72), (41, 100)],
        [(19, 0), (19, 23), (75, 45), (28, 77), (42, 88), (42, 100)],
        [(76, 0), (76, 24), (21, 51), (21, 74), (35, 88), (35, 100)],
        [(45, 0), (45, 25), (75, 43), (75, 68), (47, 80), (47, 100)],
        [(29, 0), (29, 32), (66, 32), (66, 72), (52, 72), (52, 100)],
        [(69, 0), (69, 26), (24, 26), (24, 67), (61, 78), (61, 100)],
        [(24, 0), (24, 26), (45, 26), (45, 56), (71, 56), (71, 100)],
        [(59, 0), (59, 22), (25, 36), (64, 59), (42, 82), (42, 100)],
        [(73, 0), (73, 33), (54, 33), (27, 68), (37, 84), (37, 100)],
        [(31, 0), (31, 55), (73, 55), (73, 76), (53, 86), (53, 100)],
        [(59, 0), (59, 27), (23, 27), (23, 63), (66, 63), (66, 100)],
        [(20, 0), (20, 33), (67, 54), (67, 100)],
        [(74, 0), (74, 26), (53, 26), (53, 53), (25, 53), (25, 76), (43, 88), (43, 100)],
        [(39, 0), (39, 25), (70, 25), (70, 53), (27, 72), (43, 88), (43, 100)],
    ],
    "hard": [
        [(23, 0), (23, 24), (74, 24), (74, 53), (29, 53), (29, 76), (52, 88), (52, 100)],
        [(75, 0), (75, 29), (27, 29), (27, 60), (64, 60), (64, 100)],
        [(26, 0), (26, 20), (73, 40), (27, 65), (65, 84), (65, 100)],
        [(67, 0), (67, 100)],
        [(79, 0), (79, 31), (58, 31), (58, 56), (29, 56), (29, 80), (42, 91), (42, 100)],
        [(22, 0), (22, 22), (71, 22), (71, 48), (25, 48), (25, 74), (57, 74), (57, 100)],
        [(35, 0), (35, 27), (67, 56), (67, 100)],
        [(65, 0), (65, 59), (35, 59), (35, 100)],
        [(22, 0), (22, 27), (46, 27), (46, 46), (74, 46), (74, 74), (46, 74), (46, 100)],
        [(29, 0), (29, 38), (20, 51), (20, 77), (41, 92), (41, 100)],
        [(72, 0), (72, 30), (52, 30), (53, 57), (73, 75), (67, 100)],
        [(40, 0), (40, 22), (74, 40), (22, 63), (54, 85), (54, 100)],
        [(20, 0), (20, 23), (52, 47), (74, 47), (74, 72), (55, 87), (55, 100)],
        [(76, 0), (76, 46), (23, 46), (23, 72), (38, 87), (38, 100)],
        [(32, 0), (32, 24), (74, 24), (74, 53), (31, 53), (31, 82), (62, 82), (62, 100)],
        [(64, 0), (64, 24), (24, 48), (37, 70), (56, 84), (56, 100)],
    ],
}


def require(value, message):
    if not value:
        raise RuntimeError(message)


def write(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data if isinstance(data, (bytes, bytearray)) else data.encode("utf-8"))


def dump(path: Path, value):
    write(path, json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def digest(data):
    return sha256(data).hexdigest()


def map_id(difficulty, number):
    return "simple" + difficulty[0] + f"{number:02d}"


def native_folder(difficulty, number):
    return "wt-simple-" + difficulty[0] + f"{number:02d}"


def native_level(difficulty, number):
    return "WT-S" + difficulty[0].upper() + f"{number:02d}-T1"


def rectangle(x1, y1, x2, y2):
    return {(x, y) for y in range(y1, y2 + 1) for x in range(x1, x2 + 1)}


def brushed(points, radius, width, height):
    ground, road = set(), set()
    for (ax, ay), (bx, by) in zip(points, points[1:]):
        dx, dy = bx - ax, by - ay
        length_squared = dx * dx + dy * dy
        for x in range(max(0, min(ax, bx) - radius), min(width, max(ax, bx) + radius + 1)):
            for y in range(max(0, min(ay, by) - radius), min(height, max(ay, by) + radius + 1)):
                t = min(1, max(0, ((x - ax) * dx + (y - ay) * dy) / length_squared))
                distance_squared = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2
                if distance_squared <= radius ** 2:
                    ground.add((x, y))
                if distance_squared <= 2 ** 2:
                    road.add((x, y))
    return ground, road


def footprint(spec, x, y):
    width, breadth = spec["width"], spec["breadth"]
    return {(a, b) for a in range(x - width // 2, x - width // 2 + width)
            for b in range(y - breadth // 2, y - breadth // 2 + breadth)}


def author_map(difficulty, number, name, route_shape, specs, ttp):
    level_id = map_id(difficulty, number)
    folder = native_folder(difficulty, number)
    level = native_level(difficulty, number)
    widths = {"easy": (64, 72, 80), "medium": (80, 88, 72), "hard": (88, 80, 96)}
    heights = {"easy": (80, 84, 88), "medium": (96, 92, 100), "hard": (108, 104, 112)}
    W = widths[difficulty][(number - 1) % 3]
    H = heights[difficulty][(number - 1) % 3]
    base_top = H - (28 + number % 3)
    radius = {"easy": 7, "medium": 8, "hard": 7}[difficulty] + (number % 4 == 0)
    points = [(round(x * (W - 1) / 100), round(y * (base_top + 3) / 100))
              for x, y in route_shape]
    route, road = brushed(points, radius, W, H)
    spawn_x = points[0][0]
    lane_x = points[-1][0]
    base_half_width = 25 + number % 4
    base_x = max(base_half_width + 3, min(W - 4 - base_half_width,
                                          round((W / 2 + lane_x) / 2)))
    base = rectangle(base_x - base_half_width, base_top + 4, base_x + base_half_width, H - 4)
    base |= rectangle(base_x - base_half_width + 5, base_top, base_x + base_half_width - 5, base_top + 3)
    ground = route | base

    # Keep the only exterior opening at the north.  The broad southern base is
    # deliberately inset from every other map edge.
    edge = ({(x, 1) for x in range(1, W - 1)} | {(x, H - 2) for x in range(1, W - 1)}
            | {(1, y) for y in range(2, H - 1)} | {(W - 2, y) for y in range(2, H - 1)})
    entrance = sorted(ground & edge)
    expected_entrance = [(x, 1) for x in range(spawn_x - radius, spawn_x + radius + 1)]
    require(entrance == expected_entrance, "Unexpected exterior opening: " + level_id)

    count = struct.unpack_from("<I", ttp, 8)[0]
    types = struct.unpack_from("<" + "H" * count, ttp, 12)
    require(types[18] == 8 and types[23] == 3 and types[24] == 3 and types[77] == 6,
            "Arizona terrain table changed")

    def height(x, y):
        return 128 if any((x + dx, y + dy) in ground for dx, dy in ((0, 0), (-1, 0), (0, -1), (-1, -1))) else 384

    tiles = bytearray()
    for y in range(H):
        for x in range(W):
            texture = 18 if (x, y) not in ground else 77 if (x, y) in road else 23 if (x * 17 + y * 11 + number) % 9 else 24
            tiles.extend(struct.pack("<HH", texture, height(x, y)))
    game_map = b"map " + struct.pack("<III", 40, W, H) + tiles + struct.pack("<II", 1, 0)

    structures, droids, features, occupied = [], [], [], set()
    next_id = 100

    def structure(kind, x, y, player=0):
        nonlocal next_id
        cells = footprint(specs[kind], x, y)
        require(cells <= ground and not cells & occupied, "Invalid structure " + kind + " on " + level_id)
        occupied.update(cells)
        structures.append({"name": kind, "id": next_id,
                           "position": [round((x + (specs[kind]["width"] % 2) * .5) * 128),
                                        round((y + (specs[kind]["breadth"] % 2) * .5) * 128)],
                           "rotation": 0, "startpos": player})
        next_id += 1

    flank = -1 if number % 2 == 0 else 1
    for kind, offset_x, offset_y in [
        ("A0CommandCentre", 0, 13), ("A0PowerGenerator", -17, 8),
        ("A0ResearchFacility", -10, 8), ("A0ResearchFacility", -10, 14),
        ("A0LightFactory", 13, 8), ("A0LightFactory", 19, 8),
        ("A0CyborgFactory", 14, 17), ("A0Sat-linkCentre", 20, 21),
    ]:
        structure(kind, base_x + flank * offset_x, base_top + offset_y)
    gate_x = min(base_x + 13, max(base_x - 13, lane_x))
    for x in (gate_x - 5, gate_x + 5):
        structure("GuardTower1", x, base_top + 2)
    oils = [(base_x + flank * x, base_top + y) for x, y in
            ((-19, 14), (-15, 14), (-19, 20), (-15, 20))]
    for x, y in oils:
        structure("A0ResourceExtractor", x, y)
    structure("A0CommandCentre", spawn_x, 5, 1)

    trucks = [(base_x + x, base_top + 8) for x in (-6, -2, 2, 6)]
    for player, coordinates in [(0, trucks), (1, [(spawn_x, 9)])]:
        for x, y in coordinates:
            require((x, y) in ground and (x, y) not in occupied, "Blocked truck on " + level_id)
            droids.append({"template": "ConstructionDroid", "id": next_id,
                           "position": [x * 128 + 64, y * 128 + 64], "rotation": 0, "startpos": player})
            next_id += 1
    for x, y in oils:
        features.append({"name": "OilResource", "id": next_id,
                         "position": [x * 128 + 64, y * 128 + 64], "rotation": 0})
        next_id += 1

    # Generation constraints: one connected playable floor and reachable
    # starting objects.  These are authoring invariants, not engine tests.
    origin = (spawn_x, 1)
    seen, pending = {origin}, deque([origin])
    while pending:
        x, y = pending.popleft()
        for p in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if p in ground and p not in seen:
                seen.add(p); pending.append(p)
    require(seen == ground, "Disconnected authored ground on " + level_id)
    free = ground - occupied
    seen, pending = {origin}, deque([origin])
    while pending:
        x, y = pending.popleft()
        for p in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if p in free and p not in seen:
                seen.add(p); pending.append(p)
    require(all((d["position"][0] // 128, d["position"][1] // 128) in seen for d in droids),
            "Unreachable authored truck on " + level_id)

    rounds, preparation = {"easy": (15, 240), "medium": (20, 180), "hard": (25, 150)}[difficulty]
    directory = MAP_ROOT / level_id
    write(directory / "game.map", game_map)
    write(directory / "ttypes.ttp", ttp)
    dump(directory / "struct.json", {"version": 2, "structures": structures})
    dump(directory / "droid.json", {"version": 2, "droids": droids})
    dump(directory / "feature.json", {"version": 2, "features": features})
    dump(directory / "gam.json", {"version": 7, "gameTime": 0, "GameType": 0,
                                   "ScrollMinX": 0, "ScrollMinY": 0, "ScrollMaxX": W,
                                   "ScrollMaxY": H, "levelName": ""})
    dump(directory / "level.json", {"name": folder, "type": "skirmish", "players": 2,
                                     "tileset": "arizona", "author": {"name": "Warzone Towers"},
                                     "spdx-license-id": "CC0-1.0",
                                     "generator": "tools/build-simple-tower-levels-09923.py"})
    write(directory / "level.lev", f"// {name}: practical single-route Towers map, CC0-1.0\n"
          f"level {level}\nplayers 2\ntype 14\ndataset MULTI_CAM_1\n"
          f"game \"multiplay/maps/{folder}.gam\"\n")

    entry = {
        "id": level_id, "name": name, "difficulty": difficulty,
        "description": ("A straight approach with room for towers on both sides."
                        if len(points) == 2 else
                        "A broad approach with angled turns and a connected rear base."
                        if any(a[0] != b[0] and a[1] != b[1] for a, b in zip(points, points[1:])) else
                        "Wide lanes and square turns lead to a connected rear base."),
        "rounds": rounds, "preparationSeconds": preparation, "mapName": level,
        "nativeFolder": folder, "tileset": "arizona", "humanPosition": 0,
        "northFacing": True, "entryCount": 1,
        "sourceDirectory": f"map/simple-levels/{level_id}", "legacy": False,
        "preview": f"warzone/levels/previews/{level_id}.png",
        "previewDescription": "Actual native flat terrain, road and object footprints; not gameplay.",
        "dimensions": [W, H], "routeFamily": "practical single-route layout",
        "sourceOnly": True, "gameplayVerified": False, "simpleRevision": VERSION,
    }
    proof = {
        "id": level_id, "name": name, "difficulty": difficulty, "dimensions": [W, H],
        "routeCenters": points, "corridorRadius": radius, "groundTiles": len(ground),
        "entranceTiles": entrance, "startingHumanTrucks": 4,
        "staticConnectedGround": True, "staticStartingFootprintsAndRoutes": True,
        "nativePathfindingOrGameplayTested": False, "difficultyPlaytested": False,
        "nativeMapSHA256": digest(game_map),
        "geometrySHA256": digest(repr((W, H, sorted(ground))).encode("ascii")),
    }
    dump(directory / "AUTHORING.json", proof)
    render_preview(entry, ground, road, structures, droids, specs)
    return entry, proof


def render_preview(entry, ground, road, structures, droids, specs):
    W, H = entry["dimensions"]
    scale, header, footer = 5, 34, 34
    image = Image.new("RGB", (W * scale, H * scale + header + footer), (10, 27, 29))
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 12)
    except OSError:
        font = ImageFont.load_default()
    draw.text((8, 8), entry["name"] + " / " + entry["difficulty"].upper(), fill=(222, 233, 228), font=font)
    for y in range(H):
        for x in range(W):
            color = (82, 70, 59)
            if (x, y) in ground: color = (105, 126, 83)
            if (x, y) in road: color = (149, 145, 117)
            draw.rectangle((x * scale, header + y * scale, (x + 1) * scale - 1,
                            header + (y + 1) * scale - 1), fill=color)
    for item in structures:
        x, y = [v // 128 for v in item["position"]]
        cells = footprint(specs[item["name"]], x, y); xs, ys = zip(*cells)
        color = (246, 205, 82) if item["name"] == "A0Sat-linkCentre" else (108, 187, 224) if item["startpos"] == 0 else (224, 96, 75)
        draw.rectangle((min(xs) * scale, header + min(ys) * scale,
                        (max(xs) + 1) * scale - 1, header + (max(ys) + 1) * scale - 1), fill=color)
    for item in droids:
        x, y = [v // 128 for v in item["position"]]
        color = (210, 239, 245) if item["startpos"] == 0 else (236, 126, 101)
        draw.ellipse((x * scale, header + y * scale, (x + 1) * scale,
                      header + (y + 1) * scale), fill=color)
    draw.text((8, header + H * scale + 8), "Blue: base   Gold: uplink   Red: entry",
              fill=(189, 208, 202), font=font)
    path = ASSETS / entry["preview"].removeprefix("warzone/")
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def build_catalog(entries):
    path = ASSETS / "levels/catalog.json"
    catalog = json.loads(path.read_text(encoding="utf-8"))
    old = [value for value in catalog["levels"] if not value["id"].startswith("simple")]
    require(len(old) == 46, "Expected preserved 46-map catalogue")
    new = {difficulty: [e for e in entries if e["difficulty"] == difficulty]
           for difficulty in ("easy", "medium", "hard")}
    beginner = [e for e in old if e["id"] == "beginner"]
    originals = [e for e in old if e["id"] in ("td1", "td2")]
    scenic = {difficulty: [e for e in old if e["difficulty"] == difficulty and e["id"] not in ("beginner", "td1", "td2")]
              for difficulty in ("easy", "medium", "hard")}
    catalog["levels"] = (beginner + new["easy"] + scenic["easy"] + new["medium"]
                         + scenic["medium"] + new["hard"] + originals + scenic["hard"])
    catalog["previewDescription"] = "Actual written native map data previews; simple maps use flat terrain and clear object footprints, not engine screenshots."
    require(len(catalog["levels"]) == 96, "Expected 96 total Towers maps")
    dump(path, catalog)
    minimal = {e["id"]: {k: e[k] for k in ("rounds", "preparationSeconds", "northFacing")}
               for e in catalog["levels"]}
    write(ASSETS / "levels/runtime.js", "// Generated from levels/catalog.json.\nwindow.WarzoneLevelInfo = Object.freeze("
          + json.dumps(minimal, separators=(",", ":")) + ");\n")
    return catalog


def build_music(entries):
    path = ASSETS / "map-music.json"
    value = json.loads(path.read_text(encoding="utf-8"))
    existing = value["maps"]
    choices = {
        "easy": [existing[f"easy{i:02d}"] for i in range(1, 16)],
        "medium": [existing[f"medium{i:02d}"] for i in range(1, 16)],
        "hard": [existing[f"hard{i:02d}"] for i in range(1, 14)],
    }
    for entry in entries:
        number = int(entry["id"][-2:])
        existing[entry["id"]] = choices[entry["difficulty"]][(number - 1) % len(choices[entry["difficulty"]])]
    require(len(existing) == 96, "Expected 96 music assignments")
    dump(path, value)


def build_scenarios(entries):
    base = json.loads((ROOT / "scenario/levels/easy01.json").read_text(encoding="utf-8"))
    result = []
    for entry in entries:
        value = json.loads(json.dumps(base))
        value["challenge"].update(name="Warzone Towers: " + entry["name"], map=entry["mapName"],
                                  description=entry["description"])
        path = SCENARIO_ROOT / (entry["id"] + ".json")
        dump(path, value)
        pool = {"easy": 15, "medium": 15, "hard": 13}[entry["difficulty"]]
        profile = entry["difficulty"] + f"{((int(entry['id'][-2:]) - 1) % pool) + 1:02d}"
        result.append({"id": entry["id"], "mapName": entry["mapName"],
                       "difficulty": entry["difficulty"], "scheduleSource": profile})
    dump(SCENARIO_ROOT / "MAPS.json", {"schemaVersion": 1, "version": VERSION,
          "scope": "Fifty practical native maps. Existing authored wave profiles are reused by difficulty; no gameplay or balance test.",
          "maps": result})
    return result


def package(entries, schedules, baseline_assets):
    helper = runpy.run_path(str(ROOT / "tools/integrate-native-runtime.py"), run_name="simple_maps")
    package_call, verify_index = helper["package_call"], helper["verify_index"]
    index_path = ASSETS / "index.html"
    index = index_path.read_text(encoding="utf-8")
    launcher = re.search(r'<script\s+async\s+type="text/javascript"\s+src="(warzone2100-towers-\d+\.js)"', index)
    require(launcher is not None, "Towers runtime script missing from the launch page")
    loader_names = (launcher[1], "warzone2100.js")
    old_data = (baseline_assets / "warzone2100.data").read_bytes()
    baselines = {}
    for name in loader_names:
        old_js = (baseline_assets / name).read_text(encoding="utf-8")
        begin, end, _, metadata = package_call(old_js)
        verify_index(metadata, old_data)
        baselines[name] = (old_js, begin, end, metadata)
    metadata = baselines[launcher[1]][3]
    require(metadata["files"] == baselines["warzone2100.js"][3]["files"],
            "The two Towers loaders have different baseline data layouts")
    verify_index(metadata, old_data)
    rows = {row["filename"]: dict(row, start=int(row["start"]), end=int(row["end"])) for row in metadata["files"]}

    def old(path):
        row = rows[path]
        return old_data[row["start"]:row["end"]]

    source_router = old("/data/mp/config.js").decode("utf-8")
    match = re.search(r"const wtLevelConfigs=(\{.*?\});", source_router, re.S)
    require(match is not None, "Existing Towers router unavailable")
    router = json.loads(match.group(1))
    require(not any(name.startswith(("WT-SE", "WT-SM", "WT-SH")) for name in router),
            "Use original Towers assets from before the 50-map pack")
    schedule_by_id = {row["id"]: row for row in schedules}
    additions = {}
    registrations = []
    for entry in entries:
        row = schedule_by_id[entry["id"]]
        router[entry["mapName"]] = "tests/levels/" + row["scheduleSource"] + ".js"
        directory = MAP_ROOT / entry["id"]
        folder = "/data/mp/multiplay/maps/" + entry["nativeFolder"]
        for name in FILES:
            additions[folder + "/" + name] = (directory / name).read_bytes()
        additions[folder + ".gam"] = (directory / "gam.json").read_bytes()
        additions["/data/mp/tests/towers-" + entry["id"] + ".json"] = (SCENARIO_ROOT / (entry["id"] + ".json")).read_bytes()
        registrations.append((directory / "level.lev").read_bytes())

    router_js = source_router[:match.start(1)] + json.dumps(router, separators=(",", ":")) + source_router[match.end(1):]
    additions["/data/mp/config.js"] = router_js.encode("utf-8")
    additions["/data/mp/addon.lev"] = old("/data/mp/addon.lev") + b"\n" + b"\n".join(registrations)

    data = bytearray(old_data)
    for path, content in additions.items():
        offset = len(data); data.extend(content)
        rows[path] = {"filename": path, "start": offset, "end": len(data)}
    directory_lines = "".join('Module["FS_createPath"]("/data/mp/multiplay/maps",'
                              + json.dumps(entry["nativeFolder"]) + ',true,true);' for entry in entries)
    directory_hook = 'Module["FS_createPath"]("/data/mp/multiplay/maps","wt-e01",true,true);'
    loaders = {}
    for name, (old_js, begin, end, old_metadata) in baselines.items():
        updated_metadata = dict(old_metadata, files=list(rows.values()), remote_package_size=len(data),
                                package_uuid="warzone-towers-4.7.0-v1-" + str(len(data)))
        head = old_js[:begin]
        require(head.count(directory_hook) == 1, "Native preloader directory hook unavailable: " + name)
        head = head.replace(directory_hook, directory_hook + directory_lines, 1)
        package_index = "loadPackage(" + json.dumps(updated_metadata, separators=(",", ":")) + ")"
        loaders[name] = head + package_index + old_js[end:]
        verify_index(updated_metadata, data)

    index = re.sub(r"\n        // BEGIN TOWERS 0\.99\.23 SIMPLE LEVEL DIRECTORIES.*?// END TOWERS 0\.99\.23 SIMPLE LEVEL DIRECTORIES", "", index, flags=re.S)
    all_generated = [e["id"] for e in entries] + [e["id"] for e in json.loads((ASSETS / "levels/catalog.json").read_text(encoding="utf-8"))["levels"] if re.fullmatch(r"(?:easy|medium|hard)\d{2}", e["id"])]
    index, count = re.subn(r"const newTowerLevels = \[.*?\];", "const newTowerLevels = " + json.dumps(all_generated, separators=(",", ":")) + ";", index, count=1)
    require(count == 1, "Towers launch ID list missing")

    for name, content in {**loaders, "warzone2100.data": data}.items():
        target = ASSETS / name
        temp = target.with_name(target.name + ".new")
        write(temp, content)
        temp.replace(target)
    write(ROOT / "scenario/levels/config-router.js", router_js)
    write(index_path, index)
    return {"oldDataBytes": len(old_data), "newDataBytes": len(data), "addedVirtualFiles": len(additions),
            "towersLaunchLoader": launcher[1],
            "existingDataPrefixPreserved": True, "compiledEngineBodyUnchanged": True,
            "oldDataSHA256": digest(old_data), "newDataSHA256": digest(data)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-assets", required=True, type=Path,
                        help="Warzone asset directory from before the 50-map pack (0.99.22)")
    args = parser.parse_args()
    require({k: len(v) for k, v in NAMES.items()} == {"easy": 17, "medium": 17, "hard": 16}, "Name counts differ")
    require({k: len(v) for k, v in PATHS.items()} == {"easy": 17, "medium": 17, "hard": 16}, "Path counts differ")
    specs = {b["id"]: b for b in json.loads((ASSETS / "command-catalog.json").read_text(encoding="utf-8"))["buildings"]}
    ttp = (ROOT / "map/greenhaven-beginner/ttypes.ttp").read_bytes()
    entries, proofs = [], []
    for difficulty in ("easy", "medium", "hard"):
        for number, (name, route_shape) in enumerate(zip(NAMES[difficulty], PATHS[difficulty]), 1):
            entry, proof = author_map(difficulty, number, name, route_shape, specs, ttp)
            entries.append(entry); proofs.append(proof)
            print(json.dumps({"authored": entry["id"], "name": name, "difficulty": difficulty}), flush=True)
    require(len({p["geometrySHA256"] for p in proofs}) == 50, "Duplicate simple map geometry")
    catalog = build_catalog(entries)
    build_music(entries)
    schedules = build_scenarios(entries)
    package_report = package(entries, schedules, args.baseline_assets)
    counts = Counter(e["difficulty"] for e in entries)
    report = {"schemaVersion": 1, "version": VERSION, "newMaps": 50,
              "newDifficultyCounts": dict(counts), "totalMaps": len(catalog["levels"]),
              "ordering": {"easy": ["beginner"] + [e["id"] for e in entries if e["difficulty"] == "easy"],
                           "medium": [e["id"] for e in entries if e["difficulty"] == "medium"],
                           "hard": [e["id"] for e in entries if e["difficulty"] == "hard"]},
              "practicalDesign": {"singleRoute": True, "flatBuildableGround": True,
                                  "largeConnectedRearBase": True, "minimalScenery": True},
              "nativePathfindingOrGameplayTested": False, "difficultyPlaytested": False,
              "emulatorUsed": False, "package": package_report,
              "maps": [{"id": p["id"], "name": p["name"], "difficulty": p["difficulty"],
                        "nativeMapSHA256": p["nativeMapSHA256"]} for p in proofs]}
    dump(MAP_ROOT / f"GENERATION-{VERSION}.json", report)
    print(json.dumps({"authoredMaps": 50, "totalMaps": len(catalog["levels"]), **package_report}))


if __name__ == "__main__":
    main()
