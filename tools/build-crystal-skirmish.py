"""Convert the supplied Centerpede map into the bundled Crystal Skirmish preset."""

import argparse
import base64
import configparser
from hashlib import sha256
import json
from pathlib import Path
import runpy
import struct
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets/warzone"
SOURCE = ROOT / "map/ffa-crystal-skirmish"
MAP_ID = "crystal-skirmish"
FOLDER = "ffa-crystal-skirmish"
LEVEL = "FFA-CENTERPEDE-T4"
ORIGINAL = "4c-Rb_Centerpede_2"


def encode_json(value):
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def object_rows(raw, kind):
    parser = configparser.ConfigParser(interpolation=None)
    parser.read_string(raw.decode("utf-8-sig"))
    rows = []
    for section in parser.values():
        if section.name == "DEFAULT":
            continue
        row = {
            "id": section.getint("id"),
            "position": [int(n.strip()) for n in section["position"].split(",")[:2]],
            "rotation": int(section.get("rotation", "0").split(",")[0]),
        }
        if kind == "droid":
            row["template"] = section["template"]
        else:
            row["name"] = section["name"]
        if kind in ("struct", "droid"):
            row["startpos"] = section.getint("startpos")
        if kind == "struct":
            row["modules"] = section.getint("modules", fallback=0)
        rows.append(row)
    return rows


def deploy_starters(droids, structures, width, height):
    for player in range(4):
        trucks = [row for row in droids if row["startpos"] == player]
        if len(trucks) != 8 or any(row["template"] != "ConstructionDroid" for row in trucks):
            raise ValueError("Expected eight original constructor positions for each player.")
        # Reuse the authored spawn cells nearest the centre for combat units.
        # Constructors remain at the other clear start cells.
        trucks.sort(key=lambda row: (row["position"][0] - width * 64) ** 2
                    + (row["position"][1] - height * 64) ** 2)
        templates = ("WyvernGaussTracks", "WyvernPulseTracks") if player == 0 else (
            "PythonGaussTracks", "PythonPulseTracks")
        for i, droid in enumerate(trucks[:6 if player == 0 else 4]):
            droid["template"] = templates[i % 2]
    for structure in structures:
        if structure["name"] == "A0LightFactory":
            structure["modules"] = 2


def ffa_baseline_assets():
    """Read the templates and exact native rules used by the normal FFA app."""
    package_call = runpy.run_path(str(ROOT / "tools/integrate-native-runtime.py"))["package_call"]
    _, _, _, meta = package_call((ASSETS / "warzone2100-ffa.js").read_text(encoding="utf-8"))
    rows = {row["filename"]: row for row in meta["files"]}
    paths = ("/data/mp/stats/templates.json", "/data/mp/multiplay/script/rules/init.js")
    result = []
    with (ASSETS / "warzone2100-ffa.data").open("rb") as stream:
        for path in paths:
            start, end = (int(rows[path][key]) for key in ("start", "end"))
            stream.seek(start)
            result.append(stream.read(end - start).decode("utf-8"))
    return json.loads(result[0]), result[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    folder = f"multiplay/maps/{ORIGINAL}"
    with ZipFile(args.archive) as source:
        files = {
            f"{FOLDER}.gam": source.read(folder + ".gam"),
            f"{FOLDER}/game.map": source.read(folder + "/game.map"),
            f"{FOLDER}/ttypes.ttp": source.read(folder + "/ttypes.ttp"),
        }
        version, width, height = struct.unpack_from("<III", files[f"{FOLDER}/game.map"], 4)
        if (version, width, height) != (10, 30, 30):
            raise ValueError("Expected the original 30 × 30 Centerpede 2 map.")
        structures = object_rows(source.read(folder + "/struct.ini"), "struct")
        droids = object_rows(source.read(folder + "/droid.ini"), "droid")
        features = object_rows(source.read(folder + "/feature.ini"), "feature")
    deploy_starters(droids, structures, width, height)
    templates, native_rules = ffa_baseline_assets()
    if any(row["template"] not in templates for row in droids):
        raise ValueError("A starting unit template is missing from the bundled FFA stats.")
    if native_rules.count("vtol:false, alliancesType:alliancesType") != 1:
        raise ValueError("The FFA native telemetry hook changed.")
    for basename, key, rows in (
        ("struct", "structures", structures), ("droid", "droids", droids),
        ("feature", "features", features),
    ):
        files[f"{FOLDER}/{basename}.json"] = encode_json({"version": 2, key: rows}).encode("utf-8")

    challenge = json.loads((ROOT / "scenario/ffa/challenge-easy.json").read_text(encoding="utf-8"))
    challenge["challenge"].update(name="Crystal Skirmish", map=LEVEL, techLevel=4,
                                  description="Centerpede 2. Last commander standing.")
    # The legacy dataset supplies the Arizona terrain. The skirmish config
    # selects stock T4 research independently of the dataset name.
    level = (f"// Centerpede 2 by punkech (GPL-2.0-or-later).\nlevel {LEVEL}\n"
             f'players 4\ntype 14\ndataset MULTI_CAM_1\ngame "multiplay/maps/{FOLDER}.gam"\n')
    raw = args.archive.read_bytes()
    map_info = {
        "id": MAP_ID, "name": "Centerpede", "level": LEVEL, "mapDirectory": FOLDER,
        "width": width, "height": height, "players": 4, "bots": 3,
        "structureLimits": {}, "tileset": "arizona", "sourceSHA256": sha256(raw).hexdigest(),
    }
    payload = {
        "map": map_info, "registration": level, "challenge": challenge,
        "files": {name: base64.b64encode(value).decode("ascii") for name, value in files.items()},
    }
    SOURCE.mkdir(parents=True, exist_ok=True)
    original = SOURCE / "Centerpede-2-original.wz"
    if original.exists() and original.read_bytes() != raw:
        raise ValueError("The retained Centerpede archive differs from the supplied one.")
    if not original.exists():
        original.write_bytes(raw)
    for path, value in files.items():
        (SOURCE / Path(path).name).write_bytes(value)
    (SOURCE / "level.lev").write_text(level, encoding="utf-8")
    (SOURCE / "skirmish.json").write_text(json.dumps(challenge, indent=2) + "\n", encoding="utf-8")
    (ASSETS / "crystal-skirmish-map.js").write_text(
        "// Generated by tools/build-crystal-skirmish.py from the supplied Centerpede 2 archive.\n"
        + "window.WarzoneCrystalMap = " + encode_json(payload) + ";\n", encoding="utf-8")
    print(f"Packed {width} × {height} Centerpede 2 with a T4 skirmish descriptor and four starter forces.")


if __name__ == "__main__":
    main()
