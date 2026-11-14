"""Check terrain-only FFA edits against delivered v0.67, without an engine/device.

Every old native VFS path and all map objects remain. The only changed slices
are our forty-five game.map records and the three catalogue metadata mirrors.
"""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256, file_digest
from PIL import Image
import json
import re
import runpy
import struct

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets"
HELPERS = runpy.run_path(str(ROOT / "tools/build-ffa-package.py"), run_name="pathways068_native_helpers")
PACKAGE = HELPERS["package_call"]
BASELINE_APK = "1eb1e538e7f457479c8eeccf9559d53317471da4dcdb5d55d5de546e6495a920"
SAVE_FIXTURES = (
    "archive/cobra-0.64/cobra-easy-phone-save.zip",
    "archive/maps-music-0.66/e231ce35-emaj-6p-easy-native.zip",
)
UPSTREAM = "https://github.com/Warzone2100/warzone2100/blob/7d3d8e51a61ceee89e6bf672a41337e1a9cd7392/src/game.cpp"


def digest(raw):
    return sha256(raw).hexdigest()


def row(path):
    with path.open("rb") as stream:
        value = file_digest(stream, "sha256").hexdigest()
    return dict(path=path.relative_to(ROOT).as_posix(), sha256=value, bytes=path.stat().st_size)


def read_vfs(js, data):
    start, end, _, metadata = PACKAGE(js)
    assert metadata["remote_package_size"] == len(data)
    files = metadata["files"]
    assert len(files) == len({item["filename"] for item in files})
    assert all(0 <= item["start"] <= item["end"] <= len(data) for item in files)
    return js[:start] + "PACKAGE" + js[end:], {item["filename"]: data[item["start"]:item["end"]] for item in files}


def normalized_html(raw):
    pattern = r"(?m)^    const ffaMapCatalogue = (.*);$"
    matches = re.findall(pattern, raw)
    assert len(matches) == 1
    catalogue = json.loads(matches[0])
    return re.sub(pattern, "    const ffaMapCatalogue = CATALOGUE;", raw), catalogue


def save_terrain_audit():
    """Genuine native archive inspection plus existing bridge/source review only."""
    observations = []
    for name in SAVE_FIXTURES:
        path = ROOT / name
        before = row(path)
        with ZipFile(path) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            terrain = archive.read("native/game.map")
            types = archive.read("native/ttypes.ttp")
            assert terrain[:4] == b"map " and struct.unpack_from("<I", terrain, 4)[0] == 40
            width, height = struct.unpack_from("<II", terrain, 8)
            assert len(terrain) == 16 + width * height * 4 + 8
            assert types[:4] == b"ttyp"
            for leaf, raw in (("game.map", terrain), ("ttypes.ttp", types)):
                assert manifest[leaf]["bytes"] == len(raw) and manifest[leaf]["sha256"] == digest(raw)
            meta = json.loads(archive.read("metadata.json"))
            observations.append(dict(path=name, mapId=meta["mapId"], width=width, height=height,
                archivedMapSHA256=digest(terrain), archivedTerrainTypesSHA256=digest(types),
                archiveSHA256=before["sha256"], actualNativeArchive=True))
        assert row(path) == before
    bridge = (ASSETS / "warzone/saved-games.js").read_text(encoding="utf-8")
    store = (ROOT / "app/src/main/java/com/rbabbit/blocknight/warzone/SaveGameStore.java").read_text(encoding="utf-8")
    assert "'scriptstate.json','game.map'" in bridge and '"scriptstate.json", "game.map"' in store
    assert "(ffa?'--loadskirmish=':'--loadcampaign=')+payload.metadata.id" in bridge
    assert "for(const[name,bytes]of files)" in bridge and "fs.writeFile(target,bytes)" in bridge
    return dict(genuineArchives=observations, archiveTerrainBytesRetained=True,
        appHydratesSavedNativeFilesBeforeLoadSkirmish=True,
        nativeSource=dict(url=UPSTREAM, savedTerrainWriteLines="3345-3351", savedTerrainLoadLines="2407-2425,2706-2712,2923-2949"),
        expectedBehavior="New matches use the edited map. Existing saves retain their archived terrain.",
        sourceAndFormatReviewOnly=True, actualNativeReloadRetested=False)


def main():
    fallback = json.loads((ROOT / "archive/fallback-0.68.json").read_text())
    assert fallback["version"] == "0.68" and fallback["baseline"] == "0.67"
    apk = next(Path(item["path"]) for item in fallback["files"] if item["path"].endswith(".apk"))
    with apk.open("rb") as stream:
        assert file_digest(stream, "sha256").hexdigest() == BASELINE_APK
    catalogue, proofs = HELPERS["generated_maps"]()
    maps = catalogue["maps"]
    assert len(maps) == len(proofs) == 51
    current_js = (ASSETS / "warzone/warzone2100-ffa.js").read_text(encoding="utf-8")
    current_data = (ASSETS / "warzone/warzone2100-ffa.data").read_bytes()
    body, vfs = read_vfs(current_js, current_data)
    assert digest(current_data[:HELPERS["STOCK_SIZE"]]) == HELPERS["STOCK_HASH"]
    package = json.loads((ROOT / "scenario/ffa/PACKAGE.json").read_text())
    assert package["maps"] == maps and len(package["launchArguments"]) == 153
    parents = sorted({str(Path(name).parent).replace("\\", "/") for name in vfs})
    assert package["nativePreloadDirectories"] == parents and len(parents) == 294
    edited_ids = ["ntw-" + str(n) + "p-" + str(i).zfill(2) for n in (2, 3, 4) for i in range(1, 16)]
    edited = {"/data/mp/multiplay/maps/ffa-" + map_id + "/game.map" for map_id in edited_ids}
    mirrors = {"/data/mp/" + folder + "/ffa-maps.json" for folder in ("multiplay/script", "multiplay/script/rules", "multiplay/skirmish")}
    frozen = []
    results = []
    with ZipFile(apk) as old:
        old_body, before = read_vfs(old.read("assets/warzone/warzone2100-ffa.js").decode(), old.read("assets/warzone/warzone2100-ffa.data"))
        assert old_body == body, "Compiled native FFA program changed"
        old_maps = json.loads(old.read("assets/ffa-maps.json"))["maps"]
        assert maps[:6] == old_maps[:6]
        assert set(before) == set(vfs) and len(vfs) == 4377
        changed = sorted(name for name in before if before[name] != vfs[name])
        assert set(changed) == edited | mirrors, "Native changes extend beyond 45 terrains/catalogue mirrors: " + str(set(changed) ^ (edited | mirrors))
        allowed_assets = {"assets/ffa-maps.json", *("assets/" + entry["preview"] for entry in maps[6:]),
            "assets/warzone/warzone2100-ffa.js", "assets/warzone/warzone2100-ffa.data",
            "assets/warzone/index-ffa.html", "assets/warzone/mobile-ffa.html"}
        for name in old.namelist():
            if name.startswith("assets/") and not name.endswith("/") and name not in allowed_assets:
                assert (ASSETS / name.removeprefix("assets/")).read_bytes() == old.read(name), "Unrelated app asset changed: " + name
                frozen.append(name)
        for name in ("index-ffa.html", "mobile-ffa.html"):
            old_normalized, old_catalogue = normalized_html(old.read("assets/warzone/" + name).decode())
            normalized, new_catalogue = normalized_html((ASSETS / "warzone" / name).read_text(encoding="utf-8"))
            assert old_normalized == normalized, "FFA wrapper changed beyond embedded map metadata"
            assert old_catalogue[:6] == new_catalogue[:6]
        for previous, entry, proof in zip(old_maps, maps, proofs):
            assert {k:v for k,v in previous.items() if k not in {"sourceSHA256", "description"}} == {k:v for k,v in entry.items() if k not in {"sourceSHA256", "description"}}, "Map identity/layout facts changed: " + entry["id"]
            assert entry["players"] - 1 == entry["bots"] and proof["id"] == entry["id"]
            for mapping in proof["mappings"]:
                raw = (ROOT / mapping["host"]).read_bytes()
                assert raw == vfs[mapping["virtual"]] and digest(raw) == mapping["sha256"]
            prefix = "/data/mp/multiplay/maps/" + entry["mapDirectory"]
            if entry["id"] in edited_ids:
                raw = vfs[prefix + "/game.map"]
                old_raw = before[prefix + "/game.map"]
                assert raw != old_raw and raw[:16] == old_raw[:16] and raw[-8:] == old_raw[-8:]
                assert struct.unpack_from("<III", raw, 4) == (40, entry["width"], entry["height"])
                for leaf in ("struct.json", "droid.json", "feature.json", "gam.json", "ttypes.ttp", "level.json"):
                    assert before[prefix + "/" + leaf] == vfs[prefix + "/" + leaf]
            with Image.open(ASSETS / entry["preview"]) as image:
                scale = min(4, 640 / max(entry["width"], entry["height"])) if entry["id"] in edited_ids else 4
                assert abs(image.width - round(entry["width"] * scale)) <= 1 and abs(image.height - round(entry["height"] * scale)) <= 1
            results.append(dict(id=entry["id"], terrainEdited=entry["id"] in edited_ids,
                width=entry["width"], height=entry["height"], players=entry["players"],
                objectsAndEconomyPreserved=True, nativeFilesMatchSource=True))
        for mirror in mirrors:
            expected = [dict(entry, structureLimits=proof["requiredInitialStructureLimits"]) for entry,proof in zip(maps, proofs)]
            assert json.loads(vfs[mirror])["maps"] == expected
    save_audit = save_terrain_audit()
    paths = [Path(__file__), ROOT / "archive/fallback-0.68.json", ROOT / "tools/build-ffa-package.py",
        ROOT / "scenario/ffa/PACKAGE.json", ROOT / "scenario/ffa/generated-maps-067.json", ASSETS / "ffa-maps.json",
        ASSETS / "warzone/saved-games.js", ROOT / "app/src/main/java/com/rbabbit/blocknight/warzone/SaveGameStore.java",
        ROOT / "docs/ffa-pathways-0.68-save-terrain.md"]
    paths += [ASSETS / "warzone" / name for name in ("warzone2100-ffa.js", "warzone2100-ffa.data", "index-ffa.html", "mobile-ffa.html")]
    paths += [ROOT / name for name in SAVE_FIXTURES]
    paths += [ROOT / mapping["host"] for proof in proofs for mapping in proof["mappings"]]
    paths = sorted(set(paths))
    report = dict(version="0.68", passed=True, checksPassed=len(results), emulatorUsed=False,
        actualNativeEngineExecuted=False, nativeBuildPerformed=False, compiledFFAProgramUnchanged=True,
        otherModeEnginesAndMusicAndUIFrozen=True, originalSixMapsAndChallengesUnchanged=True,
        stockCobraAndRulesUnchanged=True, mapIdentityDimensionsObjectsAndEconomyUnchanged=True,
        changedExistingVirtualFiles=changed, addedVirtualFiles=0, frozenAssets=frozen,
        maps=results, editedTerrains=45, nativeChallenges=153, nativePreloadDirectories=len(parents),
        saveTerrainAudit=save_audit, limitations=["No emulator, native startup, pathfinding or gameplay/balance testing in this revision."],
        sources=[row(path) for path in paths])
    target = ROOT / "archive/ffa-pathways-0.68-payload-checks.json"
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(dict(passed=True, maps=len(results), editedTerrains=45, changedNativeSlices=len(changed),
        compiledNativeUnchanged=True, saveTerrainRetentionSourceReviewed=True, emulatorUsed=False)))


if __name__ == "__main__":
    main()
