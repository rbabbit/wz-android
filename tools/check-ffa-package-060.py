"""Focused static checks for the isolated FFA VFS, map and native policies.

This verifies package construction and preserved native program identity. It is
not a substitute for gameplay, navigation or AI checks on the delivery APK.
"""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import copy
import json
import runpy
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets/warzone"
SOURCE = ROOT / "scenario/ffa"
builder = runpy.run_path(str(ROOT / "tools/build-ffa-package.py"), run_name="ffa_test_helpers")
package_call = builder["package_call"]


def read_vfs(loader, data):
    _, _, _, metadata = package_call(loader)
    assert metadata["remote_package_size"] == len(data)
    assert len(metadata["files"]) == len({e["filename"] for e in metadata["files"]})
    assert all(0 <= e["start"] <= e["end"] <= len(data) for e in metadata["files"])
    return {e["filename"]: data[e["start"]:e["end"]] for e in metadata["files"]}


def main():
    proof = json.loads((SOURCE / "PACKAGE.json").read_text())
    before = (ASSETS / "warzone2100.js").read_text(encoding="utf-8")
    generated = (ASSETS / "warzone2100-ffa.js").read_text(encoding="utf-8")
    a, b, _, _ = package_call(before)
    c, d, _, _ = package_call(generated)
    normalized = generated[:c] + "PACKAGE" + generated[d:]
    normalized = normalized.replace('var REMOTE_PACKAGE_BASE="warzone2100-ffa.data";', 'var REMOTE_PACKAGE_BASE="warzone2100.data";', 1)
    normalized = normalized.replace('text.includes("BNNOTICE")||text.includes("BNFFA")||text.includes("WTCMD")||text.includes("WTREADY")', 'text.includes("BNNOTICE")', 1)
    assert normalized == before[:a] + "PACKAGE" + before[b:]
    for path, expected in proof["preservedExistingFiles"].items():
        assert sha256((ROOT / path).read_bytes()).hexdigest() == expected, path
    data = (ASSETS / "warzone2100-ffa.data").read_bytes()
    stock_data = (ASSETS / "warzone2100.data").read_bytes()
    assert data[:builder["STOCK_SIZE"]] == stock_data[:builder["STOCK_SIZE"]]
    vfs = read_vfs(generated, data)
    stock = builder["Stock"](stock_data)
    original = ROOT / "vendor/ffa-map/original/EMAG_FFA.wz"
    assert sha256(original.read_bytes()).hexdigest() == builder["SUPPLIED_HASH"]
    with ZipFile(original) as archive:
        for name in archive.namelist():
            assert (ROOT / "map/ffa-emag" / name).read_bytes() == archive.read(name), name
            if name != "level.json":
                assert vfs["/data/mp/multiplay/maps/ffa-emag/" + name] == archive.read(name), name
        assert vfs["/data/mp/multiplay/maps/ffa-emag.gam"] == archive.read("gam.json")
    for difficulty in ("easy", "medium", "hard"):
        challenge = json.loads(vfs["/data/mp/tests/ffa-emag-" + difficulty + ".json"])
        assert challenge["challenge"]["alliances"] == 0
        assert challenge["challenge"]["maxPlayers"] == 4
        assert challenge["challenge"]["map"] == "FFA-EMAG-T1"
        for player in range(4):
            row = challenge["player_" + str(player)]
            assert row["position"] == row["team"] == player
            if player:
                assert row["difficulty"] == difficulty.title()
                expected_ai = "multiplay/skirmish/Cobra.js" if proof.get("botType") == "cobra" else "multiplay/skirmish/ffa-nullbot.js"
                assert row["ai"] == expected_ai
            else:
                assert "ai" not in row
    policy = json.loads((SOURCE / "policy.json").read_text())
    research = json.loads(vfs["/data/mp/stats/research.json"])
    original_research = stock.json("/data/mp/stats/research.json")
    replacements = {e["topic"]: e for e in policy["groundPrerequisiteReplacements"]}
    assert set(replacements) == {"R-Sys-Sensor-WS", "R-Vehicle-Engine07"}
    blocked = set(policy["blockedResearch"])
    assert "R-Vehicle-Prop-VTOL" in blocked and "R-Struc-VTOLFactory" in blocked
    for key, original_topic in original_research.items():
        expected = copy.deepcopy(original_topic)
        if key in blocked:
            expected["requiredResearch"] = ["R-FFA-Air-Locked"]
            expected.pop("category", None)
        elif key in replacements:
            expected["requiredResearch"] = replacements[key]["replacement"]
        for field, removed in (("resultComponents", policy["airComponents"]), ("resultStructures", policy["airStructures"])):
            if field in expected:
                expected[field] = [x for x in expected[field] if x not in removed]
        assert research[key] == expected, "Unexpected stock ground research mutation: " + key
        if key not in blocked:
            assert not set(research[key].get("requiredResearch", [])) & blocked
    templates = json.loads(vfs["/data/mp/stats/templates.json"])
    for template in templates.values():
        assert template.get("body") not in policy["airComponents"]
        assert template.get("propulsion") not in policy["airComponents"]
        assert not set(template.get("weapons", [])) & set(policy["airComponents"])
    ai = vfs["/data/mp/multiplay/skirmish/ffa-nullbot.js"].decode()
    assert ai == stock.text("/data/mp/multiplay/skirmish/nb_generic.js").replace("vtolness: 65", "vtolness: 0")
    if proof.get("botType") == "cobra":
        cobra = json.loads((SOURCE / "COBRA.json").read_text())
        for row in cobra["files"]:
            assert vfs[row["path"]] == stock.read(row["path"]), "Stock Cobra bytes changed: " + row["path"]
    observed = vfs["/data/mp/multiplay/script/rules/endconditions.js"].decode()
    addition = '\n\t\t// Observe the native result before the stock game-over call.\n\t\tif (typeof ffaNativePlayerResult === "function") ffaNativePlayerResult(this.playNum, state);'
    assert observed.count(addition) == 1
    assert observed.replace(addition, "", 1) == stock.text("/data/mp/multiplay/script/rules/endconditions.js")
    index = (ASSETS / "index-ffa.html").read_text(encoding="utf-8")
    assert "/tmp/warzone-towers-ui-v34" not in index
    assert "warzone2100-towers-052" not in index
    assert "--skirmish=warzonetowers" not in index
    assert "--skirmish=ffa-' + ffaMap.id" in index
    assert "return '/warzone2100-ffa-' + (ffaMap.id === 'emag'" in index
    assert "module.FS.writeFile('/tmp/warzone-campaign-mobile-v51', '1')" in index
    assert "function blockNightPrepareDemolitionIntent" not in index
    assert "push(blockNightPrepareDemolitionIntent)" not in index
    assert vfs["/data/mp/multiplay/script/rules/warzone-towers-demolition-intent.json"] == b'{"intent":"","active":false}'
    assert 'ffaSetTimer("blockNightV32PollBridgeCommands", 120)' not in (SOURCE / "research-bridge.js").read_text()
    for path in (SOURCE / "rules.js", SOURCE / "policy.js", SOURCE / "command-policy.js", SOURCE / "runtime-prepare.js", SOURCE / "commands.js", SOURCE / "research-bridge.js"):
        subprocess.run(["node", "--check", str(path)], check=True, capture_output=True)
    subprocess.run(["node", str(SOURCE / "test-backend.cjs")], cwd=ROOT, check=True)
    print("PASS: exact four-start map, three native difficulty challenges, hostile teams, no-air policy with retained ground costs/effects, stock AI/endconditions, matching unchanged native program and old payload hashes")


if __name__ == "__main__":
    main()
