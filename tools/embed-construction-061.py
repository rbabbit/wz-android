"""Append only reviewed construction bridges to the pinned v0.60 VFS payloads.

No native compilation or mission regeneration. Towers and Campaign retain their
exact original data prefixes and compiled program bodies; FFA is rebuilt through
its isolated stock-VFS builder using the same reviewed Towers commands source.
"""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import json
import re
import runpy
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets/warzone"
FALLBACK = ROOT / "archive/fallback-0.61.json"
REPORT = ROOT / "archive/construction-0.61-payload.json"
HELPERS = runpy.run_path(str(ROOT / "tools/integrate-native-runtime.py"), run_name="construction061_helpers")
PACKAGE = HELPERS["package_call"]
ASSEMBLY = ["campaign/mobile-events.js", "campaign/research-bridge.js", "campaign/commands.js"]


def digest(value):
    return sha256(value).hexdigest()


def file_digest(path):
    result = sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def function_sections(text):
    matches = list(re.finditer(r"^function (wtcmd_[A-Za-z0-9_]+)\(", text, flags=re.M))
    return {m.group(1): text[m.start():matches[i+1].start() if i+1 < len(matches) else len(text)] for i, m in enumerate(matches)}


def verify_source_scope(source):
    changed = {"wtcmd_recoverySite", "wtcmd_resumeBuilds", "wtcmd_constructionState", "wtcmd_trackSite",
        "wtcmd_planBuild", "wtcmd_tickBuildsImpl", "wtcmd_poll"}
    added = {"wtcmd_buildPackability", "wtcmd_tooClose", "wtcmd_buildReservations", "wtcmd_reservationError",
        "wtcmd_buildSiteError", "wtcmd_blockBuild", "wtcmd_assignBuildWorkers", "wtcmd_explicitBuildWorkers", "wtcmd_retryBuild"}
    result = []
    for name in ["scenario/warzone-towers-commands.js", "campaign/commands.js"]:
        old = source.read(name).decode("utf-8").replace("\r\n", "\n")
        new = (ROOT / name).read_text(encoding="utf-8")
        before, after = function_sections(old), function_sections(new)
        assert set(after) - set(before) == added, name + " unexpected new functions"
        assert not set(before) - set(after), name + " deleted functions"
        assert old[:old.index("function ")] == new[:new.index("function ")], name + " global state changed"
        actual = []
        for function, content in before.items():
            # Added helpers sit after the existing overlap function; remove them
            # before comparing that original function's unchanged source slice.
            current = after[function]
            if function == "wtcmd_overlap":
                current = current[:current.index("// Match native isBlueprintTooClose")].rstrip() + "\n\n"
            if current != content:
                assert function in changed, name + " unrelated function changed: " + function
                actual.append(function)
        result.append({"path": name, "sha256": file_digest(ROOT / name), "changedFunctions": actual, "addedFunctions": sorted(added)})
    for name in ASSEMBLY[:2]:
        assert (ROOT / name).read_bytes() == source.read(name), "Campaign event/research hooks changed: " + name
    return result


def append_bridge(old, loader_name, data_name, virtual, content):
    loader_bytes = old.read("assets/warzone/" + loader_name)
    data = old.read("assets/warzone/" + data_name)
    loader = loader_bytes.decode("utf-8")
    a, b, _, metadata = PACKAGE(loader)
    original = {row["filename"]: dict(row) for row in metadata["files"]}
    assert len(original) == len(metadata["files"]) and virtual in original
    entries = [dict(row) for row in metadata["files"]]
    target = next(row for row in entries if row["filename"] == virtual)
    final = data + content
    target.update(start=len(data), end=len(final))
    metadata.update(files=entries, remote_package_size=len(final), package_uuid="construction-061-" + digest(final)[:20])
    generated = (loader[:a] + "loadPackage(" + json.dumps(metadata, separators=(",", ":")) + ")" + loader[b:]).encode("utf-8")
    x, y, _, parsed = PACKAGE(generated.decode("utf-8"))
    body = loader[:a] + "PACKAGE" + loader[b:]
    assert generated.decode("utf-8")[:x] + "PACKAGE" + generated.decode("utf-8")[y:] == body
    assert final[:len(data)] == data and parsed["remote_package_size"] == len(final)
    for row in parsed["files"]:
        if row["filename"] == virtual:
            assert final[row["start"]:row["end"]] == content
        else:
            assert row == original[row["filename"]], "Other VFS row changed: " + row["filename"]
            assert final[row["start"]:row["end"]] == data[row["start"]:row["end"]]
    for name, baseline, value in [(loader_name, loader_bytes, generated), (data_name, data, final)]:
        current = (ASSETS / name).read_bytes()
        assert current in (baseline, value), "Unreviewed current payload: " + name
    return {loader_name: generated, data_name: final}, {"loader": loader_name, "data": data_name,
        "onlyChangedVirtualFile": virtual, "baselineDataBytes": len(data), "baselineDataSHA256": digest(data),
        "originalDataPrefixUnchanged": True, "unchangedVirtualFiles": len(entries)-1,
        "compiledProgramUnchanged": True, "runtimeBodySHA256": digest(body.encode("utf-8")),
        "sourceContentSHA256": digest(content), "loaderSHA256": digest(generated), "dataSHA256": digest(final)}


def main():
    fallback = json.loads(FALLBACK.read_text(encoding="utf-8"))
    assert fallback["version"] == "0.61" and fallback["baseline"] == "0.60"
    paths = {}
    for row in fallback["files"]:
        path = Path(row["path"])
        assert path.is_file() and path.stat().st_size == row["bytes"] and file_digest(path) == row["sha256"], "Pinned v0.60 fallback changed"
        paths[path.suffix.lower()] = path
    writes, payloads = {}, []
    with ZipFile(paths[".apk"]) as old, ZipFile(paths[".zip"]) as source:
        scope = verify_source_scope(source)
        for name in ASSEMBLY:
            assert "campaign/" in name
        campaign = "\n".join((ROOT / name).read_text(encoding="utf-8") for name in ASSEMBLY).encode("utf-8")
        for loader, data, virtual, content in [
            ("warzone2100-towers-052.js", "warzone2100.data", "/data/mp/tests/warzone-towers-commands.js", (ROOT / "scenario/warzone-towers-commands.js").read_bytes()),
            ("warzone2100-campaign.js", "warzone2100-campaign.data", "/data/base/script/campaign/mobile/campaign-bridge.js", campaign)]:
            values, proof = append_bridge(old, loader, data, virtual, content)
            writes.update(values);payloads.append(proof)
        frozen = {}
        for name in old.namelist():
            if not name.startswith("assets/warzone/warzone2100") or name.endswith("/"):
                continue
            base = Path(name).name
            if base in writes or base.startswith("warzone2100-ffa."):
                continue
            current = ASSETS / base
            assert current.is_file() and file_digest(current) == digest(old.read(name)), "Frozen native asset changed: " + base
            frozen[base] = file_digest(current)
        # Complete validation precedes replacement. Existing compiled program
        # text is preserved; only literal VFS offsets/package sizes are updated.
        for name, content in writes.items():
            path = ASSETS / name;temporary = path.with_name(path.name + ".v61.tmp")
            temporary.write_bytes(content);temporary.replace(path)
        subprocess.run([sys.executable, str(ROOT / "tools/build-ffa-package.py")], cwd=ROOT, check=True)
        subprocess.run([sys.executable, str(ROOT / "tools/check-ffa-package-060.py")], cwd=ROOT, check=True)
        for name, expected in frozen.items():
            assert file_digest(ASSETS / name) == expected, "Frozen asset changed during FFA build: " + name
        for name in ["index-ffa.html", "mobile-ffa.html"]:
            assert (ASSETS / name).read_bytes() == old.read("assets/warzone/" + name), "FFA entrypoint changed"
    report = {"version": "0.61", "passed": True, "baseline": "0.60", "fallbackSHA256": file_digest(FALLBACK),
        "noNativeBuild": True, "compiledProgramsUnchanged": True, "originalMissionBodiesPreserved": True,
        "sourceScope": scope, "payloads": payloads, "frozenNativeAssets": frozen,
        "ffaProof": {"path": "scenario/ffa/PACKAGE.json", "sha256": file_digest(ROOT / "scenario/ffa/PACKAGE.json")}}
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"passed": True, "version": "0.61", "nativeBuild": False, "payloads": payloads, "proof": REPORT.relative_to(ROOT).as_posix()}, indent=2))


if __name__ == "__main__":
    main()
