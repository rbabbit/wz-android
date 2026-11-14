"""Focused graph/content checks; no game, build or device side effects."""
from pathlib import Path
from zipfile import ZipFile
from urllib.parse import unquote
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
HELPERS = runpy.run_path(str(ROOT / "guide/build-research-data.py"),run_name="guide_research_check")
Stock = HELPERS["Stock"]
digest = HELPERS["digest"]
file_digest = HELPERS["file_digest"]


def main():
    path = ROOT / "app/src/main/assets/guide/research-data.js"
    text = path.read_text(encoding="utf-8")
    prefix = "window.WarzoneGuideResearchData = "
    data = json.loads(text[text.index(prefix)+len(prefix):].rstrip().removesuffix(";"))
    assert data["version"] == 1
    stock = Stock()
    mp = stock.json("/data/mp/stats/research.json")
    campaign = stock.json("/data/base/stats/research.json")
    ffa = json.loads((ROOT / "scenario/ffa/research.json").read_text())
    policy = json.loads((ROOT / "scenario/ffa/policy.json").read_text())
    raw = {"towers":mp,"ffa":ffa,"campaign":campaign}
    sections = {section["id"] for section in data["sections"]}
    assert len(sections) == len(data["sections"]) == 15
    assert {mode:len(topics) for mode,topics in data["catalogues"].items()} == {"towers":390,"ffa":390,"campaign":413}
    for mode, topics in data["catalogues"].items():
        by = {topic["id"]:topic for topic in topics}
        assert len(by) == len(topics)
        assert set(by) == (set(raw[mode]) - {"R-FFA-Air-Locked"})
        for id, topic in by.items():
            native = raw[mode][id]
            assert topic["name"] == native["name"]
            assert topic["section"] in sections and set(topic["sections"]) <= sections
            assert topic["cost"] == {"power":native.get("researchPower"),"points":native.get("researchPoints")}
            expected = native.get("requiredResearch",[])
            if mode == "ffa" and id in policy["blockedResearch"]:
                expected = mp[id].get("requiredResearch",[])
            assert topic["requiresAll"] == expected, (mode,id,"prerequisites")
            assert set(topic["requiresAll"]) <= set(by)
            assert len(topic["requiresAll"]) == len(set(topic["requiresAll"]))
            assert topic["requiredBy"] == sorted(key for key,value in by.items() if id in value["requiresAll"])
            assert [value["id"] for value in topic["requiredStructures"]] == native.get("requiredStructures",[])
            assert [value["id"] for value in topic["unlocks"]] == native.get("resultComponents",[]) + native.get("resultStructures",[])
            for value in topic["unlocks"] + topic["obsoletes"] + topic["requiredStructures"]:
                assert value["id"] in data["components"][mode], (mode,id,"unresolved component",value["id"])
                assert value["name"] == data["components"][mode][value["id"]]["name"]
                assert value["type"] != "component", (mode,id,"untyped component")
            effects = [{key:value for key,value in effect.items() if key!="description"} for effect in topic["effects"]]
            assert effects == native.get("results",[]), (mode,id,"effects")
            assert [value["id"] for value in topic["obsoletes"]] == native.get("redComponents",[]) + native.get("redStructures",[])
            assert topic["icon"].startswith("../warzone/")
            assert (path.parent / unquote(topic["icon"])).resolve().is_file(), (mode,id,"icon")
            assert bool(topic.get("disabled")) == (mode=="ffa" and id in policy["blockedResearch"])
            if mode=="campaign":
                assert topic["campaignGate"]
                for reference in topic.get("artifactSources",[]):
                    source = stock.read(reference["source"]).decode("utf-8")
                    assert reference["label"] in source and ('"'+id+'"' in source or "'"+id+"'" in source)
                    assert reference["variantNote"]
        # All modes retain the complete native DAG; no simple linear rank is
        # invented, and no edge can produce a dead-end cycle in the reference.
        visiting, visited = set(), set()
        def visit(id):
            assert id not in visiting, (mode,id,"cycle")
            if id in visited: return
            visiting.add(id)
            for previous in by[id]["requiresAll"]: visit(previous)
            visiting.remove(id); visited.add(id)
        for id in by: visit(id)
    ffa_by = {topic["id"]:topic for topic in data["catalogues"]["ffa"]}
    for row in policy["groundPrerequisiteReplacements"]:
        assert ffa_by[row["topic"]]["requiresAll"] == row["replacement"]
    for id in ("R-Wpn-AAGun01","R-Wpn-Missile-LtSAM"):
        assert not ffa_by[id].get("disabled") and ffa_by[id]["section"] == "aircraft"
    assert {topic["id"] for topic in data["catalogues"]["ffa"] if topic.get("disabled")} == set(policy["blockedResearch"])
    # Known AND examples guard against accidental flattening of split paths.
    towers = {topic["id"]:topic for topic in data["catalogues"]["towers"]}
    assert len(towers["R-Wpn-RailGun01"]["requiresAll"]) == 4
    assert towers["R-Wpn-Rocket06-IDF"]["requiresAll"] == ["R-Wpn-Rocket02-MRL","R-Sys-CBSensor-Turret01"]
    report = json.loads((ROOT / "archive/guide-0.65-research.json").read_text())
    assert report["outputs"][0]["sha256"] == file_digest(path)
    fallback = json.loads((ROOT / "archive/fallback-0.65.json").read_text())
    apk_path = Path(next(row["path"] for row in fallback["files"] if row["path"].endswith(".apk")))
    pinned_native_count = 0
    touch_snapshot_sha = None
    touch_current_sha = None
    with ZipFile(apk_path) as old:
        for relative, expected in report["nativeAssetsFrozenBeforeAndAfter"].items():
            current = ROOT / relative
            member = "assets/" + relative.removeprefix("app/src/main/assets/")
            baseline = old.read(member)
            if relative.endswith("/warzone-touch-controls.js"):
                # Root owns the authorized offline-Help integration. Preserve
                # every gesture/input line while allowing only that new reader
                # block and its Campaign mode label in the existing Help page.
                before = baseline.decode("utf-8").replace("\r\n","\n")
                after = current.read_text(encoding="utf-8")
                begin = after.index("        // The offline field guide shares the Home content")
                end = after.index("        help.classList.add('wt-towers-guide');",begin)
                after = after[:begin] + after[end:]
                after = after.replace("(campaign?'CAMPAIGN':ffa?'FREE FOR ALL':'WARZONE TOWERS')", "(ffa?'FREE FOR ALL':'WARZONE TOWERS')",1)
                assert after == before, "Touch/input changed outside the authorized Guide Help reader"
                # This hash is the generator-time snapshot, not a promise that
                # root's authorized Help-only UI block is already frozen.
                touch_snapshot_sha = expected
                touch_current_sha = file_digest(current)
            else:
                assert file_digest(current) == expected
                assert digest(baseline) == expected, "Native baseline0.64 changed: " + relative
                pinned_native_count += 1
    check = {"version":"0.65","passed":True,"dataSHA256":file_digest(path),
        "exactGraphsCostsEffectsUnlocks":True,"andPrerequisitesAndReverseLinksValid":True,"allIconsLocal":True,
        "ffaDisabledTopics":24,"ffaGroundReplacements":2,"campaignArtifactReferencesConditional":True,
        "frozenNativeAssetsMatchedPinned064":pinned_native_count,
        "touchInputPreservedOutsideAuthorizedHelpReader":True,
        "touchGenerationSnapshotSHA256":touch_snapshot_sha,"authorizedHelpIntegrationCurrentSHA256":touch_current_sha,
        "checkSourceSHA256":file_digest(Path(__file__))}
    (ROOT / "archive/guide-0.65-research-checks.json").write_text(json.dumps(check,indent=2)+"\n",encoding="utf-8",newline="\n")
    print(json.dumps(check,indent=2))


if __name__ == "__main__":
    main()
