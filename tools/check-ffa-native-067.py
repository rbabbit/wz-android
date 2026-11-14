"""Check the 45-map extension against the exact v0.66 APK without running an engine."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256, file_digest
from PIL import Image
import json
import runpy
import struct
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets"
HELPERS = runpy.run_path(str(ROOT / "tools/build-ffa-package.py"), run_name="ntw067_native_helpers")
PACKAGE = HELPERS["package_call"]


def digest(raw):
    return sha256(raw).hexdigest()


def row(path):
    with path.open("rb") as stream:
        value = file_digest(stream, "sha256").hexdigest()
    return dict(path=path.relative_to(ROOT).as_posix(), sha256=value, bytes=path.stat().st_size)


def read_vfs(js, data):
    start, end, _, metadata = PACKAGE(js)
    assert metadata["remote_package_size"] == len(data)
    assert len(metadata["files"]) == len({item["filename"] for item in metadata["files"]})
    assert all(0 <= item["start"] <= item["end"] <= len(data) for item in metadata["files"])
    return js[:start] + "PACKAGE" + js[end:], {item["filename"]: data[item["start"]:item["end"]] for item in metadata["files"]}


def main():
    fallback = json.loads((ROOT / "archive/fallback-0.67.json").read_text())
    assert fallback["version"] == "0.67" and fallback["baseline"] == "0.66"
    apk = next(Path(item["path"]) for item in fallback["files"] if item["path"].endswith(".apk"))
    assert digest(apk.read_bytes()) == "e231ce3589687edf77f5c5962b55fcf171267162e499b2a7326c3a70306f1ffa"
    catalogue, proofs = HELPERS["generated_maps"]()
    maps = catalogue["maps"]
    generated = json.loads((ROOT / "scenario/ffa/generated-maps-067.json").read_text())
    assert maps[6:] == generated["maps"] and len(maps) == 51
    current_js = (ASSETS / "warzone/warzone2100-ffa.js").read_text(encoding="utf-8")
    current_data = (ASSETS / "warzone/warzone2100-ffa.data").read_bytes()
    body, vfs = read_vfs(current_js, current_data)
    assert digest(current_data[:HELPERS["STOCK_SIZE"]]) == HELPERS["STOCK_HASH"]
    package = json.loads((ROOT / "scenario/ffa/PACKAGE.json").read_text())
    assert package["maps"] == maps and len(package["launchArguments"]) == 153
    assert package["nativePreloadDirectories"] == sorted({str(Path(name).parent).replace("\\", "/") for name in vfs})
    frozen = []
    with ZipFile(apk) as old:
        old_body, before = read_vfs(old.read("assets/warzone/warzone2100-ffa.js").decode(), old.read("assets/warzone/warzone2100-ffa.data"))
        assert old_body == body, "Compiled native FFA program changed"
        assert json.loads(old.read("assets/ffa-maps.json"))["maps"] == maps[:6], "Original six map rows changed"
        assert set(before) <= set(vfs), "Existing native record was removed"
        changed = sorted(name for name in before if before[name] != vfs[name])
        allowed = {"/data/mp/addon.lev", "/data/mp/tests/ffa-policy.js", "/data/mp/tests/ffa-rules.js", "/data/mp/multiplay/script/rules/init.js"}
        allowed |= {"/data/mp/" + folder + "/ffa-maps.json" for folder in ("multiplay/script", "multiplay/script/rules", "multiplay/skirmish")}
        assert set(changed) == allowed, "Unexpected native changes: " + str(set(changed) ^ allowed)
        assert vfs["/data/mp/addon.lev"].startswith(before["/data/mp/addon.lev"]), "Prior map registration changed"
        for name in old.namelist():
            if name.startswith("assets/warzone/") and "-ffa" not in Path(name).name and Path(name).name.startswith(("warzone2100", "index", "mobile")):
                assert (ASSETS / name.removeprefix("assets/")).read_bytes() == old.read(name), "Other mode engine/entry changed: " + name
                frozen.append(name)
        for name in ("warzone-touch-controls.js", "warzone/saved-games.js", "warzone/music-loader.js", "warzone/music-catalog.js", "warzone/music/music.data", "warzone/music-tracks.json", "warzone/map-music.json"):
            assert (ASSETS / name).read_bytes() == old.read("assets/" + name), "Unrelated input/save/music asset changed: " + name
            frozen.append("assets/" + name)
        for entry in maps[:6]:
            assert (ASSETS / entry["preview"]).read_bytes() == old.read("assets/" + entry["preview"]), "Original preview changed"
        for name, raw in before.items():
            if name.startswith("/data/mp/multiplay/maps/ffa-") or name.startswith("/data/mp/tests/ffa-") and name.endswith(".json"):
                assert vfs[name] == raw, "Existing map or challenge changed: " + name
    cobra = json.loads((ROOT / "scenario/ffa/COBRA.json").read_text())
    for item in cobra["files"]:
        assert digest(vfs[item["path"]]) == item["sha256"], "Stock Cobra changed"
    results = []
    new_records = set()
    for entry, proof in zip(maps, proofs):
        count = entry["players"]
        assert proof["id"] == entry["id"] and len(entry["level"].encode()) < 20
        for mapping in proof["mappings"]:
            raw = (ROOT / mapping["host"]).read_bytes()
            assert raw == vfs[mapping["virtual"]] and digest(raw) == mapping["sha256"]
            if entry["id"].startswith("ntw-"):
                new_records.add(mapping["virtual"])
        descriptor = proof["descriptor"]
        dataset = {"arizona": 1, "urban": 2, "rockies": 3}[entry["tileset"]]
        assert "players " + str(count) + "\n" in descriptor and "dataset MULTI_CAM_" + str(dataset) + "\n" in descriptor
        assert descriptor.encode() in vfs["/data/mp/addon.lev"]
        if entry["id"].startswith("ntw-"):
            prefix = "/data/mp/multiplay/maps/" + entry["mapDirectory"]
            level = json.loads(vfs[prefix + "/level.json"])
            assert level["players"] == count and level["tileset"] == entry["tileset"] and level["name"] == entry["name"]
            raw = vfs[prefix + "/game.map"]
            assert raw[:4] == b"map " and struct.unpack_from("<III", raw, 4) == (40, entry["width"], entry["height"])
            gam = json.loads(vfs[prefix + ".gam"])
            assert (gam["ScrollMinX"], gam["ScrollMinY"], gam["ScrollMaxX"], gam["ScrollMaxY"]) == (0, 0, entry["width"], entry["height"])
            structures = json.loads(vfs[prefix + "/struct.json"])["structures"]
            units = json.loads(vfs[prefix + "/droid.json"])["droids"]
            assert all(item["startpos"] in range(count) for item in structures + units)
            owned_oil = {tuple(item["position"][:2]) for item in structures if item["name"] == "A0ResourceExtractor"}
            feature_oil = {tuple(item["position"][:2]) for item in json.loads(vfs[prefix + "/feature.json"])["features"] if item["name"] == "OilResource"}
            assert len(owned_oil) == count * 24 and len(feature_oil - owned_oil) == count * 8
            for player in range(count):
                expected = {"A0CommandCentre": 1, "A0LightFactory": 1, "A0CyborgFactory": 1, "A0Sat-linkCentre": 1, "A0ResearchFacility": 5,
                    "A0PowerGenerator": 6, "A0PowMod1": 6, "A0ResourceExtractor": 24}
                assert dict(Counter(item["name"] for item in structures if item["startpos"] == player)) == expected
                own_units = [item for item in units if item["startpos"] == player]
                assert len(own_units) == 4 and all(item["template"] == "ConstructionDroid" for item in own_units)
        for difficulty in ("easy", "medium", "hard"):
            path = "/data/mp/tests/ffa-" + entry["id"] + "-" + difficulty + ".json"
            source_challenge = ROOT / "scenario/ffa" / ("challenge-" + difficulty + ".json") if entry["id"] == "emag" else ROOT / "scenario/ffa/challenges" / (entry["id"] + "-" + difficulty + ".json")
            assert source_challenge.read_bytes() == vfs[path], "Challenge source differs from native package: " + entry["id"]
            challenge = json.loads(vfs[path])
            assert challenge["challenge"]["map"] == entry["level"] and challenge["challenge"]["maxPlayers"] == count
            assert challenge["challenge"]["alliances"] == challenge["challenge"]["scavengers"] == 0
            assert {key for key in challenge if key.startswith("player_")} == {"player_" + str(player) for player in range(count)}
            for player in range(count):
                slot = challenge["player_" + str(player)]
                assert slot["team"] == slot["position"] == player
                if player:
                    assert slot["ai"] == "multiplay/skirmish/Cobra.js" and slot["difficulty"] == difficulty.title()
                else:
                    assert "ai" not in slot
            if entry["id"].startswith("ntw-"):
                new_records.add(path)
        with Image.open(ASSETS / entry["preview"]) as image:
            if entry["id"].startswith("ntw-"):
                scale = min(4, 640 / max(entry["width"], entry["height"]))
                assert max(image.size) <= 640 and min(image.size) > 0
                assert abs(image.width - round(entry["width"] * scale)) <= 1 and abs(image.height - round(entry["height"] * scale)) <= 1, "Preview aspect differs from native map"
            else:
                assert image.size == (entry["width"] * 4, entry["height"] * 4)
        results.append(dict(id=entry["id"], players=count, bots=count - 1, challenges=3, nativeFilesMatchSource=True))
    assert set(vfs) - set(before) == new_records and len(new_records) == 495
    # The source script, actual packaged script and all three catalogue mirrors agree.
    assert vfs["/data/mp/tests/ffa-policy.js"] == (ROOT / "scenario/ffa/policy.js").read_bytes()
    assert vfs["/data/mp/tests/ffa-rules.js"] == vfs["/data/mp/multiplay/script/rules/init.js"] == (ROOT / "scenario/ffa/rules.js").read_bytes()
    for folder in ("multiplay/script", "multiplay/script/rules", "multiplay/skirmish"):
        native = json.loads(vfs["/data/mp/" + folder + "/ffa-maps.json"])["maps"]
        assert [dict(entry, structureLimits=proof["requiredInitialStructureLimits"]) for entry, proof in zip(maps, proofs)] == native
    paths = [Path(__file__), ROOT / "archive/fallback-0.67.json", ROOT / "tools/build-ffa-package.py", ROOT / "scenario/ffa/PACKAGE.json", ROOT / "scenario/ffa/generated-maps-067.json", ROOT / "scenario/ffa/policy.js", ROOT / "scenario/ffa/rules.js", ASSETS / "ffa-maps.json"]
    paths += [ASSETS / "warzone" / name for name in ("warzone2100-ffa.js", "warzone2100-ffa.data", "index-ffa.html", "mobile-ffa.html")]
    paths += [ROOT / "scenario/ffa" / ("challenge-" + difficulty + ".json") if entry["id"] == "emag" else ROOT / "scenario/ffa/challenges" / (entry["id"] + "-" + difficulty + ".json")
        for entry in maps for difficulty in ("easy", "medium", "hard")]
    report = dict(version="0.67", passed=True, checksPassed=len(results), emulatorUsed=False, actualNativeEngineExecuted=False,
        compiledFFAProgramUnchanged=True, otherModeEnginesAndMusicFrozen=True, originalSixMapsAndChallengesUnchanged=True,
        stockCobraUnchanged=True, stockPrefixBytes=HELPERS["STOCK_SIZE"], stockPrefixSHA256=HELPERS["STOCK_HASH"],
        changedExistingVirtualFiles=changed, addedVirtualFiles=len(new_records), frozenAssets=frozen,
        maps=results, nativeChallenges=153, nativePreloadDirectories=len(package["nativePreloadDirectories"]),
        limitations=["No emulator testing, native startup or AI/gameplay balance observation in this revision."], sources=[row(path) for path in paths])
    target = ROOT / "archive/ffa-maps-0.67-payload-checks.json"
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(dict(passed=True, maps=len(results), nativeChallenges=153, addedVirtualFiles=len(new_records), compiledNativeUnchanged=True, emulatorUsed=False)))


if __name__ == "__main__":
    main()
