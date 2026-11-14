"""Verify the FFA-only Cobra change against the pinned v0.63 delivery.

This checks original native program/data identity, exact stock Cobra sources,
the retained NullBot save route and the limited FFA VFS changes. Actual AI
gameplay and archive restore remain delivery-APK emulator checks.
"""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import json
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets/warzone"
SOURCE = ROOT / "scenario/ffa"
FALLBACK = ROOT / "archive/fallback-0.64.json"
REPORT = ROOT / "archive/cobra-0.64-payload.json"
HELPERS = runpy.run_path(str(ROOT / "tools/build-ffa-package.py"), run_name="cobra064_helpers")
PACKAGE = HELPERS["package_call"]


def digest(value):
    return sha256(value).hexdigest()


def stream_digest(stream):
    result = sha256()
    for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
        result.update(block)
    return result.hexdigest()


def file_digest(path):
    with path.open("rb") as stream:
        return stream_digest(stream)


def read_vfs(loader, data):
    a, b, _, package = PACKAGE(loader)
    assert package["remote_package_size"] == len(data)
    assert len(package["files"]) == len({row["filename"] for row in package["files"]})
    assert all(0 <= row["start"] <= row["end"] <= len(data) for row in package["files"])
    return loader[:a] + "PACKAGE" + loader[b:], {row["filename"]: data[row["start"]:row["end"]] for row in package["files"]}


def unchanged_rules_body(old, current):
    # Only authoritative bot identity observation was added. In particular,
    # event handlers, timer registration and saved globals remain unchanged.
    current, count = re.subn(r"function ffaNativeBotType\(data\) \{.*?(?=function ffaPlayerDiagnostic)", "", current, flags=re.S)
    assert count == 1
    current = current.replace(', botType:ffaNativeBotType(data)', '', 1)
    current = current.replace(', botType:ffaNativeMatchBotType(players)', '', 1)
    assert current == old, "FFA rules changed outside bot identity observation"


def unchanged_entrypoint(old, current):
    current, count = re.subn(r"    const ffaLaunchQuery = new URLSearchParams\(location.search\);\n    const ffaExpectedBotType = .*?;\n", "", current)
    assert count == 1
    current = current.replace(",botType:ffaExpectedBotType", "", 1)
    assert current == old, "FFA entrypoint changed outside bot identity bootstrap"


def legacy_save_proof():
    archive = ROOT / "archive/cobra-0.64/original-easy-nullbot.zip"
    expected = "0e8efd55458b06bbf8ec28d79754f0d8bfde962505a745b510abe8a236b1545d"
    assert file_digest(archive) == expected, "Ordinary legacy save fixture changed"
    with ZipFile(archive) as saved:
        main = json.loads(saved.read("native/main.json"))
        gam = json.loads(saved.read("native/gam.json"))
        state = json.loads(saved.read("native/scriptstate.json"))
    for player in (1, 2, 3):
        assert main["players"][player]["nameAI"] == gam["netPlayers"][player]["aiName"] == "NullBot (ground)"
        assert main["players"][player]["difficulty"] == 1
        assert state["globals_" + str(player)]["scriptName"] == "ffa-nullbot"
        assert state["globals_" + str(player)]["me"] == player
    triggers = [row for key, row in state.items() if key.startswith("triggers_")]
    assert len(triggers) == len({row["timerID"] for row in triggers})
    return {"path": archive.relative_to(ROOT).as_posix(), "sha256": expected,
        "actualBotType": "nullbot", "nativeAIName": "NullBot (ground)", "nativeScriptStem": "ffa-nullbot",
        "threeIndependentScriptContexts": True, "savedNativeTimerIDsUnique": True,
        "deviceRestoreStillRequired": True}


def main():
    fallback = json.loads(FALLBACK.read_text(encoding="utf-8"))
    assert fallback["version"] == "0.64" and fallback["baseline"] == "0.63"
    paths = {}
    for row in fallback["files"]:
        path = Path(row["path"])
        assert path.is_file() and path.stat().st_size == row["bytes"] and file_digest(path) == row["sha256"]
        paths[path.suffix.lower()] = path
    frozen, source_frozen = {}, []
    with ZipFile(paths[".apk"]) as old, ZipFile(paths[".zip"]) as source:
        for name in old.namelist():
            if not name.startswith("assets/warzone/") or name.endswith("/"):
                continue
            base = Path(name).name
            if not base.startswith(("warzone2100", "index", "mobile")) or "-ffa" in base:
                continue
            current = ASSETS / base
            with old.open(name) as stream:
                expected = stream_digest(stream)
            assert file_digest(current) == expected, "Frozen native asset changed: " + base
            frozen[base] = expected
        touch = ROOT / "app/src/main/assets/warzone-touch-controls.js"
        assert touch.read_bytes() == old.read("assets/warzone-touch-controls.js"), "v0.63 touch controls changed"
        frozen[touch.relative_to(ROOT).as_posix()] = file_digest(touch)
        old_loader = old.read("assets/warzone/warzone2100-ffa.js").decode("utf-8")
        old_data = old.read("assets/warzone/warzone2100-ffa.data")
        new_loader = (ASSETS / "warzone2100-ffa.js").read_text(encoding="utf-8")
        new_data = (ASSETS / "warzone2100-ffa.data").read_bytes()
        old_body, before = read_vfs(old_loader, old_data)
        new_body, after = read_vfs(new_loader, new_data)
        assert new_body == old_body, "Compiled FFA program changed"
        assert new_data[:HELPERS["STOCK_SIZE"]] == old_data[:HELPERS["STOCK_SIZE"]]
        assert set(before) == set(after), "Unexpected VFS additions/removals"
        changed = sorted(name for name in before if before[name] != after[name])
        allowed = {"/data/mp/tests/ffa-emag-" + difficulty + ".json" for difficulty in ("easy", "medium", "hard")}
        allowed.update({"/data/mp/tests/ffa-rules.js", "/data/mp/multiplay/script/rules/init.js"})
        allowed.update("/data/mp/" + folder + "/ffa-config.json" for folder in ("multiplay/script", "multiplay/script/rules", "multiplay/skirmish"))
        assert set(changed) == allowed, "Unexpected FFA virtual changes: " + str(set(changed) ^ allowed)
        for difficulty in ("easy", "medium", "hard"):
            name = "/data/mp/tests/ffa-emag-" + difficulty + ".json"
            previous, current = json.loads(before[name]), json.loads(after[name])
            for player in (1, 2, 3):
                assert current["player_" + str(player)]["ai"] == "multiplay/skirmish/Cobra.js"
                assert current["player_" + str(player)]["difficulty"] == difficulty.title()
                previous["player_" + str(player)]["ai"] = "multiplay/skirmish/Cobra.js"
                previous["player_" + str(player)]["name"] = "Cobra " + str(player)
            assert previous == current, "Challenge settings changed beyond the selected AI"
        for name in allowed:
            if name.endswith("/ffa-config.json"):
                previous, current = json.loads(before[name]), json.loads(after[name])
                assert current.pop("botType") == "cobra" and previous == current
        unchanged_rules_body(source.read("scenario/ffa/rules.js").decode("utf-8").replace("\r\n", "\n"), (SOURCE / "rules.js").read_text(encoding="utf-8"))
        for name in ("index-ffa.html", "mobile-ffa.html"):
            unchanged_entrypoint(old.read("assets/warzone/" + name).decode("utf-8").replace("\r\n", "\n"), (ASSETS / name).read_text(encoding="utf-8"))
        for path in ("policy.js", "command-policy.js", "policy.json", "research.json", "templates.json", "commands.js",
                "research-bridge.js", "runtime-prepare.js", "ai.js", "ai.json", "endconditions.js", "camTechEnabler.js"):
            relative = "scenario/ffa/" + path
            assert (ROOT / relative).read_bytes() == source.read(relative), "Unrelated FFA source changed: " + relative
            source_frozen.append({"path": relative, "sha256": file_digest(ROOT / relative)})
        cobra = json.loads((SOURCE / "COBRA.json").read_text(encoding="utf-8"))
        assert len(cobra["files"]) == 13
        for row in cobra["files"]:
            name = row["path"]
            review = SOURCE / "stock/cobra" / name.removeprefix("/data/mp/multiplay/skirmish/")
            assert before[name] == after[name] == review.read_bytes()
            assert digest(after[name]) == row["sha256"]
        for name in ("ffa-nullbot.js", "ffa-nullbot.json"):
            assert before["/data/mp/multiplay/skirmish/" + name] == after["/data/mp/multiplay/skirmish/" + name]
        # NullBot include/ruleset dependencies and all common stock AI scripts
        # remain covered by the byte-identical original data prefix.
    proof = json.loads((SOURCE / "PACKAGE.json").read_text(encoding="utf-8"))
    report = {"version": "0.64", "passed": True, "baseline": "0.63", "fallbackSHA256": file_digest(FALLBACK),
        "noNativeBuild": True, "compiledFFAProgramUnchanged": True, "runtimeBodySHA256": digest(new_body.encode("utf-8")),
        "frozenNativeAssetsAndTouch": frozen, "stockPrefixUnchanged": True,
        "changedVirtualFiles": changed, "unchangedVirtualFiles": len(after) - len(changed),
        "newAI": {"botType": "cobra", "nativeAIName": "Cobra", "nativeScript": "Cobra.js", "nativeDifficulties": [1, 2, 3],
            "stockDependencyFiles": cobra["files"], "stockSourcesByteIdentical": True,
            "nativeSaveTimersRetained": True, "newChallengesIgnoreBotQuery": True},
        "legacyAI": cobra["legacyAI"], "legacyOrdinarySave": legacy_save_proof(),
        "unchangedFFASources": source_frozen, "noAirPolicyUnchanged": True,
        "ffaPackageProof": {"path": "scenario/ffa/PACKAGE.json", "sha256": file_digest(SOURCE / "PACKAGE.json")},
        "outputs": proof["outputs"], "actualNativeGameplayVerified": False}
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"passed": True, "version": "0.64", "proof": REPORT.relative_to(ROOT).as_posix(),
        "changedVirtualFiles": len(changed), "unchangedVirtualFiles": report["unchangedVirtualFiles"],
        "frozenAssets": len(frozen), "actualNativeGameplayVerified": False}, indent=2))


if __name__ == "__main__":
    main()
