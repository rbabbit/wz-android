"""Preserve the complete 0.98 source and append the guarded normal 0.99 profile.

Preparation requires the final observed delivery receipt and exact build inputs.
This tool neither builds an APK/AAB nor publishes anything.
"""
from pathlib import Path, PurePosixPath
from hashlib import file_digest, sha256
from datetime import datetime, timezone
import argparse
import json
import os
import re
import runpy
import shutil
import subprocess
import sys
import zipfile

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
PROFILE_NAME = "test-release-099"
PROFILE = ROOT / PROFILE_NAME
BASE = Path("C:/timerApp/warzone-towers-0.98-test-source.zip")
BASE_SHA = "ede3b16d45dda6b8a7524dca3ae023f64be25b27ca561fa620a1bf73b7ec6046"
BASE_MEMBERS = 17084
OUT = Path("C:/timerApp/warzone-towers-0.99-test-source.zip")
PRIVATE_SUFFIXES = {".apk", ".aab", ".jks", ".keystore", ".key", ".pem", ".p12", ".pyc", ".pyo"}


def require(value, message):
    if not value:
        raise RuntimeError(message)


def digest(path):
    if not path.is_file():
        return None
    with path.open("rb") as stream:
        return file_digest(stream, "sha256").hexdigest()


def write(path, value):
    require(not path.is_symlink(), "Refusing source symlink")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".099-tmp")
    require(not temporary.exists(), "Preserve existing partial source write")
    temporary.write_bytes(value)
    os.replace(temporary, path)


def jwrite(path, value):
    write(path, (json.dumps(value, indent=2) + "\n").encode())


def safe(name):
    parsed = PurePosixPath(name)
    require(name and str(parsed) == name and not parsed.is_absolute()
            and ".." not in parsed.parts and "\\" not in name and ":" not in name,
            "Unsafe relative source path: " + name)
    return name


def source_paths(build, prior_effective):
    # Preserve every prior source member. Scope every reproducible Challenge
    # input and exact app/build source; never sweep private QA/app-data roots.
    paths = set(build) | set(prior_effective)
    paths |= {"AGENTS.md", "tools/package-challenge-test-source-099.py",
              "tools/build-challenge-package.py"}
    tools = ROOT / "tools"
    paths |= {p.relative_to(ROOT).as_posix() for p in tools.glob("check-challenge*.*")
              if p.is_file() and p.suffix.lower() in {".py", ".cjs", ".js", ".java"}}
    directories = [ROOT / "scenario/challenge", ROOT / "vendor/challenge-099",
                   ROOT / "tools/reward-ledger-fixture", ROOT / "docs/challenge-099"]
    directories += [p for p in (ROOT / "map").glob("challenge-*") if p.is_dir()]
    for directory in directories:
        if directory.is_dir():
            paths |= {p.relative_to(ROOT).as_posix() for p in directory.rglob("*") if p.is_file()}
    # This directory contains source-derived host reports only. Runtime saves,
    # wallet snapshots and instrumentation stay in the separate private QA root.
    for name in ["reward-ledger-host.json", "rewards-native-host.json", "timers-native-host.json"]:
        p = ROOT / "qa/challenge-099" / name
        if p.is_file(): paths.add(p.relative_to(ROOT).as_posix())
    result = set()
    for name in paths:
        safe(name)
        parts = PurePosixPath(name).parts
        p = ROOT / name
        if not p.is_file():
            continue
        if any(part in {"build", ".gradle", ".git", "node_modules", "__pycache__", "host-browser-profile", "host-http-cache"}
               for part in parts):
            continue
        require(p.suffix.lower() not in PRIVATE_SUFFIXES and p.name not in {"local.properties", ".env", "known_hosts"}
                and not p.name.startswith(".env."), "Forbidden scoped source material: " + name)
        # Retained historical source includes a host fixture named
        # private-directory-player.js. Its sealed source identity is not app
        # data; do not reject preservation of earlier reviewed source by name.
        if name not in prior_effective:
            require(not any(part.lower().startswith("private-") for part in parts), "Private QA data refused: " + name)
        result.add(name)
    return result


def old_sources(source):
    old = json.loads(source.read("test-release-098/overlay-manifest.json"))
    effective = dict(old["effectiveFiles"])
    origins = dict(old["priorOverrideSources"])
    for row in old["files"]:
        origins[row["path"]] = "test-release-098/overrides/" + row["path"]
    return effective, origins


def validate_challenge_templates():
    """Verify the one authored-map alias against frozen stock and mounted bytes."""
    stock_path = ROOT / "app/src/main/assets/warzone/warzone2100.data"
    native_path = ROOT / "app/src/main/assets/warzone/warzone2100-challenge.data"
    loader_path = ROOT / "app/src/main/assets/warzone/warzone2100-challenge.js"
    template_path = ROOT / "scenario/challenge/templates.json"
    proof_path = ROOT / "scenario/challenge/TEMPLATE-COMPATIBILITY.json"
    stock_index = json.loads((ROOT / "vendor/duel-stock/package-index.json").read_text())
    stock_entries = {row["filename"]: row for row in stock_index}

    def read_record(path, row):
        start, end = row["start"], row["end"]
        require(type(start) is int and type(end) is int and 0 <= start <= end <= path.stat().st_size,
                "Invalid template source bounds")
        with path.open("rb") as stream:
            stream.seek(start)
            return json.loads(stream.read(end - start))

    original = read_record(stock_path, stock_entries["/data/mp/stats/templates.json"])
    campaign = read_record(stock_path, stock_entries["/data/base/stats/templates.json"])
    templates = json.loads(template_path.read_text())
    alias = "NX-M-Con-Hover"
    require(len(original) == 280 and set(templates) - set(original) == {alias}
            and len(templates) == 281, "Expected precisely the isolated authored constructor alias")
    require(all(templates[name] == value for name, value in original.items()),
            "An ordinary multiplayer template changed")
    require(templates[alias] == campaign[alias], "Constructor alias differs from stock campaign definition")
    package_call = runpy.run_path(str(ROOT / "tools/integrate-native-runtime.py"),
                                 run_name="challenge099_template_index")["package_call"]
    metadata = package_call(loader_path.read_text())[3]
    entries = {row["filename"]: row for row in metadata["files"]}
    require(read_record(native_path, entries["/data/mp/stats/templates.json"]) == templates,
            "Mounted Challenge templates differ from reproducible source")
    proof = json.loads(proof_path.read_text())
    require(proof.get("passed") is True and proof.get("allOriginalMPTemplatesUnchanged") is True
            and proof.get("originalMPTemplateCount") == 280 and proof.get("finalTemplateCount") == 281
            and set(proof.get("aliases", {})) == {alias}, "Template compatibility source proof differs")
    return {"passed": True, "ordinaryMultiplayerTemplatesUnchanged": 280,
            "isolatedAuthoredAlias": alias, "campaignDefinitionCopiedExactly": True,
            "mountedTemplateBytesMatchSource": True, "templatesSHA256": digest(template_path),
            "compatibilityProofSHA256": digest(proof_path)}


def delivery_inputs(apk, build_inputs, delivery, audit):
    require(all(p and p.is_file() for p in [apk, build_inputs, delivery, audit]),
            "Final APK, input inventory, passed delivery receipt and audit are required")
    receipt = json.loads(delivery.read_text())
    actual_apk_sha = digest(apk)
    require(receipt.get("passed") is True and receipt.get("versionCode") == 99
            and receipt.get("versionName") == "0.99" and receipt.get("SHA256") == actual_apk_sha,
            "Passed observed receipt for exact 0.99 APK required")
    build = json.loads(build_inputs.read_text())
    require(isinstance(build, dict) and len(build) >= 2249 and "app/build.gradle.kts" in build,
            "Unexpected exact APK source inventory")
    actual_app_sources = {p.relative_to(ROOT).as_posix() for p in (ROOT / "app/src").rglob("*") if p.is_file()}
    require(actual_app_sources == {n for n in build if n.startswith("app/src/")},
            "Build input inventory does not cover every current app source")
    for name, wanted in build.items():
        safe(name)
        require(digest(ROOT / name) == wanted, "Exact APK input changed: " + name)
    with zipfile.ZipFile(apk) as binary:
        assets = {"app/src/main/" + name: sha256(binary.read(name)).hexdigest()
                  for name in binary.namelist() if name.startswith("assets/") and not name.endswith("/")}
    expected_assets = {name: h for name, h in build.items() if name.startswith("app/src/main/assets/")}
    require(assets == expected_assets, "Exact APK assets do not match all source assets")
    return build, assets, actual_apk_sha


def prepare(base, apk, build_inputs, delivery, audit, evidence):
    require(not PROFILE.exists(), "Preserve existing 0.99 profile; use a new reviewed preparation if source changes")
    build, assets, apk_sha = delivery_inputs(apk, build_inputs, delivery, audit)
    templates = validate_challenge_templates()
    rows = []
    with zipfile.ZipFile(base) as source:
        names = source.namelist()
        require(len(names) == len(set(names)) == BASE_MEMBERS, "Unexpected complete 0.98 archive members")
        effective, origins = old_sources(source)
        hash_cache = {}

        def archived(name):
            if name not in source.NameToInfo:
                return None
            if name not in hash_cache:
                with source.open(name) as stream:
                    hash_cache[name] = file_digest(stream, "sha256").hexdigest()
            return hash_cache[name]

        accepted = {}
        for name in sorted(source_paths(build, effective)):
            path = ROOT / name
            require(not path.is_symlink(), "Source symlink refused: " + name)
            current = digest(path)
            previous = effective.get(name)
            if previous is None:
                previous = archived(name)
            if current == previous:
                continue
            data = path.read_bytes()
            require(not any(b"-----BEGIN " + kind + b"-----" in data for kind in
                            (b"PRIVATE KEY", b"OPENSSH PRIVATE KEY", b"RSA PRIVATE KEY")),
                    "Private key bytes refused: " + name)
            write(PROFILE / "overrides" / name, data)
            rows.append({"path": name, "sha256": current, "priorSHA256": previous, "bytes": len(data)})
            accepted[name] = sorted({previous, archived(name)}, key=lambda x: x or "")
        expected = dict(effective)
        expected.update({row["path"]: row["sha256"] for row in rows})
        for name, wanted in expected.items():
            require(digest(ROOT / name) == wanted, "Required source is absent or different: " + name)
        manifest = {"schemaVersion": 1, "versionCode": 99, "deltaScanScope": ["all exact app/build inputs", "all prior effective sources", "AGENTS.md", "099 packager", "Challenge generator/check tools and host fixtures", "scenario/challenge", "map/challenge-*", "vendor/challenge-099 originals/provenance", "curated qa/challenge-099 host reports", "docs/challenge-099"], "versionName": "0.99", "baseArchive": base.name,
                    "baseSHA256": BASE_SHA, "baseMembers": BASE_MEMBERS, "files": rows,
                    "acceptedInitialHashes": accepted, "priorEffectiveFiles": effective,
                    "priorOverrideSources": origins, "effectiveFiles": expected, "effectiveBuildSources": build,
                    "effectiveAPKAssets": assets, "knownAppSources": sorted(n for n in build if n.startswith("app/src/")),
                    "nativeTemplateCompatibility": templates,
                    "exactAPK_SHA256": apk_sha, "exactAPKBytes": apk.stat().st_size,
                    "buildInputInventorySHA256": digest(build_inputs), "deliveryRecordSHA256": digest(delivery),
                    "auditSHA256": digest(audit), "preparedUTC": datetime.now(timezone.utc).isoformat()}
        jwrite(PROFILE / "overlay-manifest.json", manifest)
    write(PROFILE / "prepare-and-build.py", RESTORE.encode())
    write(PROFILE / "README.md", README.encode())
    write(PROFILE / "AUDIT.md", audit.read_bytes())
    write(PROFILE / "DELIVERY.json", delivery.read_bytes())
    write(PROFILE / "BUILD-INPUTS.json", build_inputs.read_bytes())
    for path in evidence:
        require(path.is_file() and path.stat().st_size < 16 * 1024 * 1024
                and path.suffix.lower() not in PRIVATE_SUFFIXES, "Invalid curated evidence: " + str(path))
        require(not any(part.lower().startswith(("private-", "helper")) or part.lower() in
                        {"__pycache__", "app-data", "shared_prefs", "challenge-saved-games", "fixture-seeds"}
                        for part in path.parts), "Private app-data/instrumentation evidence refused: " + str(path))
        require(not (PROFILE / "validation" / path.name).exists(), "Duplicate evidence basename")
        write(PROFILE / "validation" / path.name, path.read_bytes())
    print(json.dumps({"prepared": True, "overrides": len(rows), "buildInputs": len(build), "assets": len(assets),
                      "manifestSHA256": digest(PROFILE / "overlay-manifest.json"), "APK_SHA256": apk_sha}))


def coverage(base, manifest):
    rows = {row["path"]: row for row in manifest["files"]}
    with zipfile.ZipFile(base) as source:
        cache = {}
        for name, wanted in manifest["effectiveBuildSources"].items():
            if name in rows:
                actual = digest(PROFILE / "overrides" / name)
                origin = PROFILE_NAME + "/overrides/" + name
            else:
                origin = manifest["priorOverrideSources"].get(name, name)
                require(origin in source.NameToInfo, "Clean archive source absent: " + origin)
                if origin not in cache:
                    with source.open(origin) as stream:
                        cache[origin] = file_digest(stream, "sha256").hexdigest()
                actual = cache[origin]
            require(actual == wanted, "Clean source overlay mismatch: " + name + " from " + origin)
    before = {name: digest(ROOT / name) for name in manifest["effectiveBuildSources"]}
    subprocess.run([sys.executable, str(PROFILE / "prepare-and-build.py"), "--apply-only"], cwd=ROOT, check=True,
                   env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
    after = {name: digest(ROOT / name) for name in manifest["effectiveBuildSources"]}
    require(before == after == manifest["effectiveBuildSources"], "Idempotence changed exact APK source")
    result = {"passed": True, "cleanArchiveOverlayBuildInputs": len(before), "exactSourceIdempotence": True,
              "buildInputsUnchanged": True, "APK_SHA256": manifest["exactAPK_SHA256"], "baseMembers": BASE_MEMBERS,
              "scope": "Resolve every exact build input through retained archive/profile origins; then run guarded recipe on exact current source."}
    jwrite(PROFILE / "SOURCE-COVERAGE.json", result)
    return result


def package(base, output, apk):
    require(PROFILE.is_dir() and not (PROFILE / "PACKAGE-SEAL.json").exists(), "An unsealed prepared 0.99 profile is required")
    require(not output.exists(), "Preserve existing complete 0.99 source delivery")
    pending = output.with_name(output.name + ".building")
    require(not pending.exists(), "Preserve existing partial source archive for diagnosis")
    manifest = json.loads((PROFILE / "overlay-manifest.json").read_text())
    require(validate_challenge_templates() == manifest["nativeTemplateCompatibility"],
            "Template compatibility changed after source preparation")
    for row in manifest["files"]:
        require(digest(ROOT / row["path"]) == row["sha256"] == digest(PROFILE / "overrides" / row["path"]),
                "Source changed after preparation: " + row["path"])
    for name, wanted in manifest["effectiveBuildSources"].items():
        require(digest(ROOT / name) == wanted, "Build input changed: " + name)
    require(digest(apk) == manifest["exactAPK_SHA256"], "Wrong exact tested APK")
    require(digest(PROFILE / "DELIVERY.json") == manifest["deliveryRecordSHA256"]
            and digest(PROFILE / "AUDIT.md") == manifest["auditSHA256"], "Delivery evidence changed after preparation")
    proof = coverage(base, manifest)
    jwrite(PROFILE / "PACKAGE-SEAL.json", {"versionCode": 99, "APK_SHA256": manifest["exactAPK_SHA256"],
            "sourceManifestSHA256": digest(PROFILE / "overlay-manifest.json"),
            "coverageSHA256": digest(PROFILE / "SOURCE-COVERAGE.json"),
            "githubPublished": False, "vpsUploaded": False, "googlePlayPublished": False, "aabBuilt": False})
    profile_paths = []
    for path in sorted(p for p in PROFILE.rglob("*") if p.is_file()):
        parts = path.relative_to(PROFILE).parts
        # Python guard/import tooling may create these locally. They are never
        # source-delivery inputs and must be excluded regardless of gitignore.
        if "__pycache__" in parts or path.suffix.lower() in {".pyc", ".pyo"}:
            continue
        require(not any(part in {"build", ".gradle", ".git", "node_modules", "host-browser-profile", "host-http-cache"}
                        for part in parts) and path.suffix.lower() not in PRIVATE_SUFFIXES,
                "Forbidden source profile material: " + path.relative_to(PROFILE).as_posix())
        profile_paths.append(path)
    with zipfile.ZipFile(base) as original:
        old_members = original.infolist()
        prefix = original.start_dir
    with base.open("rb") as src, pending.open("xb") as dst:
        shutil.copyfileobj(src, dst, 8 * 1024 * 1024)
    with zipfile.ZipFile(pending, "a", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in profile_paths:
            require(not path.is_symlink(), "Profile symlink refused")
            archive.write(path, PROFILE_NAME + "/" + path.relative_to(PROFILE).as_posix())
    with zipfile.ZipFile(pending) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)) and names[:len(old_members)] == [x.filename for x in old_members],
                "Old source members changed or duplicated")
        for before, after in zip(old_members, archive.infolist()):
            require((before.CRC, before.file_size, before.compress_size, before.header_offset) ==
                    (after.CRC, after.file_size, after.compress_size, after.header_offset), "Old compressed member changed")
        # New members are fully read/CRC-checked. Old members are covered by the
        # sealed baseline hash plus the byte-identical compressed-prefix check.
        credentials = {
            "private-key-block": re.compile(rb"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----"),
            "github-token": re.compile(rb"\bgh[pousr]_[A-Za-z0-9]{25,}\b"),
            "github-fine-token": re.compile(rb"\bgithub_pat_[A-Za-z0-9_]{30,}\b"),
            "openai-token": re.compile(rb"\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b"),
            "aws-access-key": re.compile(rb"\bAKIA[A-Z0-9]{16}\b"),
        }
        new_names = names[len(old_members):]
        require(len(new_names) == len(profile_paths), "Unexpected new archive members")
        for path, name in zip(profile_paths, new_names):
            require(name == PROFILE_NAME + "/" + path.relative_to(PROFILE).as_posix(), "Unexpected profile member")
            require("__pycache__" not in PurePosixPath(name).parts and path.suffix.lower() not in PRIVATE_SUFFIXES,
                    "Keys or caches entered source ZIP")
            data = archive.read(name)  # Reads the whole new member and verifies its CRC.
            require(sha256(data).hexdigest() == digest(path), "Profile ZIP bytes differ")
            for label, pattern in credentials.items():
                require(not pattern.search(data), "Credential pattern refused in " + name + ": " + label)
    with base.open("rb") as old, pending.open("rb") as new:
        remaining = prefix
        while remaining:
            count = min(remaining, 8 * 1024 * 1024)
            require(old.read(count) == new.read(count), "Original compressed prefix changed")
            remaining -= count
    os.replace(pending, output)
    result = {"passed": True, "archive": str(output), "sha256": digest(output), "bytes": output.stat().st_size,
              "baseSHA256": BASE_SHA, "baseMembers": BASE_MEMBERS, "members": len(names),
              "allOriginalMembersPreserved": True, "originalCompressedPrefixByteIdentical": True,
              "newProfileMembers": len(profile_paths), "allNewMembersCredentialScanPassed": True,
              "keysAndCachesExcluded": True,
              "sourceManifestSHA256": digest(PROFILE / "overlay-manifest.json"), "sourceCoverage": proof,
              "githubPublished": False, "vpsUploaded": False, "googlePlayPublished": False, "aabBuilt": False}
    jwrite(output.with_suffix(output.suffix + ".validation.json"), result)
    print(json.dumps(result, indent=2))


RESTORE = '''"""Restore guarded exact normal 0.99 source. No publication."""
from pathlib import Path,PurePosixPath
from hashlib import file_digest
import argparse,json,subprocess,sys,os
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent

def guarded(base,name):
 p=PurePosixPath(name)
 assert name and str(p)==name and not p.is_absolute() and '..'not in p.parts and chr(92)not in name and ':'not in name,'Unsafe source path'
 target=base/name
 assert not base.is_symlink() and not target.is_symlink() and target.resolve().is_relative_to(base.resolve()),'Source path escape'
 return target

def digest(p):
 if not p.is_file():return None
 with p.open('rb')as stream:return file_digest(stream,'sha256').hexdigest()

def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('--apply-only',action='store_true')
 for name in ['keystore','alias','java-home','android-sdk']:a.add_argument('--'+name)
 a.add_argument('--online',action='store_true');a.add_argument('--test-ads',action='store_true');args=a.parse_args()
 m=json.loads((HERE/'overlay-manifest.json').read_text());assert m['versionCode']==99 and m['versionName']=='0.99'
 actual={p.relative_to(ROOT).as_posix()for p in(ROOT/'app/src').rglob('*')if p.is_file()}
 assert actual<=set(m['knownAppSources']),'Preserve unknown future app source before applying0.99'
 for row in m['files']:
  guarded(ROOT,row['path']);assert digest(guarded(HERE/'overrides',row['path']))==row['sha256'],row['path']
 exact=all(digest(guarded(ROOT,name))==h for name,h in m['effectiveFiles'].items())
 if not exact:
  for row in m['files']:
   assert digest(guarded(ROOT,row['path']))in m['acceptedInitialHashes'][row['path']],'Preserve partial/local edits; extract a clean archive before applying: '+row['path']
  subprocess.run([sys.executable,str(ROOT/'test-release-098/prepare-and-build.py'),'--apply-only'],cwd=ROOT,check=True)
  for row in m['files']:
   target=guarded(ROOT,row['path']);target.parent.mkdir(parents=True,exist_ok=True);temporary=target.with_name(target.name+'.099-tmp')
   assert not temporary.exists(),'Preserve existing partial source write'
   temporary.write_bytes(guarded(HERE/'overrides',row['path']).read_bytes());os.replace(temporary,target)
 for name,h in m['effectiveFiles'].items():assert digest(guarded(ROOT,name))==h,name
 for name,h in m['effectiveBuildSources'].items():assert digest(guarded(ROOT,name))==h,name
 print('Applied exact normal test0.99 source. No publication.')
 if not args.apply_only:
  assert all([args.keystore,args.alias,args.java_home,args.android_sdk]),'Explicit private signing inputs required'
  cmd=[sys.executable,str(ROOT/'tools/build-normal-apk.py')]
  for name in ['keystore','alias','java-home','android-sdk']:cmd.extend(['--'+name,getattr(args,name.replace('-','_'))])
  if args.online:cmd.append('--online')
  if args.test_ads:cmd.append('--test-ads')
  raise SystemExit(subprocess.run(cmd,cwd=ROOT).returncode)
if __name__=='__main__':main()
'''

README = '''# Normal test 0.99 complete source

This archive preserves every original 0.98 member and every earlier restoration profile. After extraction, run `python test-release-099/prepare-and-build.py --apply-only` to restore the exact tested 0.99 source through the retained 0.98 recipe and guarded 0.99 overrides. Repeating it on exact 0.99 is idempotent; partial, local and unknown future app edits are refused.

To build, omit `--apply-only` and supply `--keystore`, `--alias`, `--java-home` and `--android-sdk`. Signing passwords come from private environment variables or an interactive prompt. Private keys and credentials are not included. This recipe builds a normal APK only, never uploads and never builds an AAB.

Challenge is a separate FFA section with ten authored two-player maps, one Dumbot25a opponent, Easy/Medium/Hard, a saved cannon-or-rockets primary strategy, VTOL enabled, general crystal purchases and once-only win rewards. Ordinary Cobra FFA remains separate with VTOL off. More Fortress purchases remain restricted to Towers/Survival. Existing Repair/ALL COMBAT, Players, Survival, Hub Replay without minimap and the compact About page remain included from prior profiles.

Exact tested APK app/assets are already included. Reproducible native inputs include `tools/build-challenge-package.py`, `scenario/challenge`, ten `map/challenge-*` directories, and original supplied ZIP/maps/bot plus provenance in `vendor/challenge-099`. Focused host checks and their required preference fixtures are retained. Unspecified author/licence details are documented accurately in the bundled notices, not silently assigned terms.

Read AUDIT.md and DELIVERY.json for observed runtime checks, any disclosed seeded fixtures, and limits. SOURCE-COVERAGE.json records complete exact-input restoration coverage. Local test delivery only: no VPS, update-feed, GitHub, Google Play or site publication. Private wallet/app-data/instrumentation fixtures are excluded.
'''



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--pack", action="store_true")
    parser.add_argument("--base", type=Path, default=BASE)
    parser.add_argument("--output", type=Path, default=OUT)
    parser.add_argument("--apk", type=Path, default=Path("C:/timerApp/Warzone-Towers-0.99-Test.apk"))
    parser.add_argument("--build-inputs", type=Path)
    parser.add_argument("--delivery", type=Path)
    parser.add_argument("--audit", type=Path)
    parser.add_argument("--evidence", type=Path, action="append", default=[])
    args = parser.parse_args()
    require(args.prepare or args.pack, "Choose --prepare or --pack")
    require(digest(args.base) == BASE_SHA, "Complete 0.98 fallback source hash changed")
    if args.prepare:
        prepare(args.base, args.apk, args.build_inputs, args.delivery, args.audit, args.evidence)
    if args.pack:
        package(args.base, args.output, args.apk)


if __name__ == "__main__":
    main()
