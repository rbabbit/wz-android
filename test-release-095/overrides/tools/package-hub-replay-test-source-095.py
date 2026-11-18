"""Append the exact 0.95 source profile to the preserved complete 0.94 archive.

This packages an authorized GitHub backup. It never builds an AAB or publishes.
"""
from pathlib import Path, PurePosixPath
from hashlib import file_digest, sha256
from datetime import datetime, timezone
import argparse
import json
import os
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PROFILE_NAME = "test-release-095"
PROFILE = ROOT / PROFILE_NAME
BASE = Path("C:/timerApp/warzone-towers-0.94-test-source.zip")
BASE_SHA = "29a6c43cc5e78dfaffe0a0f7f8d6a177e5d0ee2caf6e4260796c122c2d119359"
BASE_MEMBERS = 15367
OUT = Path("C:/timerApp/warzone-towers-0.95-test-source.zip")
QA = Path("C:/timerApp/hub-replay-095-20261118")
BUILD_INPUTS = QA / "build-candidate1-sources.json"
APK = Path("C:/timerApp/Warzone-Towers-0.95-Test.apk")
APK_SHA = "4e9492ce31cab58baeae6927e43a5363b15304076fac1e342abe3faf3fffb253"
PRIVATE_SUFFIXES = {".apk", ".aab", ".jks", ".keystore", ".key", ".pem", ".p12", ".pyc"}


def require(value, message):
    if not value:
        raise RuntimeError(message)


def digest(path):
    if not path.is_file():
        return None
    with path.open("rb") as stream:
        return file_digest(stream, "sha256").hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".095-tmp")
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


def source_paths():
    listing = subprocess.run(["git", "ls-files", "-c", "-o", "--exclude-standard", "-z"],
                             cwd=ROOT, capture_output=True, check=True).stdout
    paths = {safe(p) for p in listing.decode().split("\0") if p}
    paths |= {p.relative_to(ROOT).as_posix() for p in (ROOT / "app/src").rglob("*") if p.is_file()}
    # Every historical profile is already retained in the complete baseline. Do
    # not duplicate them or collect transient browser profiles and build output.
    prefixes = ("test-release-", "source-overlay/", "normal-release-", "google-play-release/", "network-test-")
    result = set()
    for name in paths:
        parts = PurePosixPath(name).parts
        p = ROOT / name
        if name.startswith(prefixes) or not p.is_file():
            continue
        if any(part in {"build", ".gradle", ".git", "node_modules", "__pycache__", "host-browser-profile", "host-http-cache"}
               for part in parts):
            continue
        if p.suffix.lower() in PRIVATE_SUFFIXES or p.name in {"local.properties", ".env", "known_hosts"} or p.name.startswith(".env."):
            continue
        result.add(name)
    return result


def old_sources(source):
    old = json.loads(source.read("test-release-094/overlay-manifest.json"))
    effective = dict(old["effectiveFiles"])
    origins = dict(old["priorOverrideSources"])
    for row in old["files"]:
        origins[row["path"]] = "test-release-094/overrides/" + row["path"]
    return old, effective, origins


def prepare(base):
    require(not (PROFILE / "PACKAGE-SEAL.json").exists(), "Preserve sealed 0.95 profile")
    build = json.loads(BUILD_INPUTS.read_text())
    require(len(build) == 2121, "Unexpected exact APK source inventory")
    for name, expected in build.items():
        safe(name)
        require(digest(ROOT / name) == expected, "Exact APK build input changed: " + name)
    rows = []
    with zipfile.ZipFile(base) as source:
        names = source.namelist()
        require(len(names) == len(set(names)) == BASE_MEMBERS, "Unexpected complete 0.94 members")
        old, effective, origins = old_sources(source)
        hash_cache = {}

        def archived(name):
            if name not in source.NameToInfo:
                return None
            if name not in hash_cache:
                with source.open(name) as stream:
                    hash_cache[name] = file_digest(stream, "sha256").hexdigest()
            return hash_cache[name]

        accepted = {}
        for name in sorted(source_paths()):
            p = ROOT / name
            require(not p.is_symlink(), "Source symlink refused: " + name)
            current = digest(p)
            previous = effective.get(name)
            if previous is None:
                previous = archived(name)
            if current == previous:
                continue
            data = p.read_bytes()
            require(not any(b"-----BEGIN " + kind + b"-----" in data for kind in
                            (b"PRIVATE KEY", b"OPENSSH PRIVATE KEY", b"RSA PRIVATE KEY")),
                    "Private key bytes refused: " + name)
            write(PROFILE / "overrides" / name, data)
            rows.append({"path": name, "sha256": current, "priorSHA256": previous, "bytes": len(data)})
            accepted[name] = sorted({previous, archived(name)}, key=lambda x: x or "")
        expected = dict(effective)
        expected.update({row["path"]: row["sha256"] for row in rows})
        for name, expected_hash in expected.items():
            require(digest(ROOT / name) == expected_hash, "Required source is absent or different: " + name)
        assets = {name: h for name, h in build.items() if name.startswith("app/src/main/assets/")}
        manifest = {"schemaVersion": 1, "versionCode": 95, "versionName": "0.95", "baseArchive": base.name,
                    "baseSHA256": BASE_SHA, "baseMembers": BASE_MEMBERS, "files": rows,
                    "acceptedInitialHashes": accepted, "priorEffectiveFiles": effective,
                    "priorOverrideSources": origins, "effectiveFiles": expected, "effectiveBuildSources": build,
                    "effectiveAPKAssets": assets, "knownAppSources": sorted(n for n in build if n.startswith("app/src/")),
                    "preparedUTC": datetime.now(timezone.utc).isoformat()}
        jwrite(PROFILE / "overlay-manifest.json", manifest)
    write(PROFILE / "prepare-and-build.py", RESTORE.encode())
    write(PROFILE / "README.md", ("# Normal test 0.95 complete source\n\n"
          "The complete archive preserves every member from the 0.94 source, including the 0.92/0.93/0.94 source profiles. "
          "After extraction, run `python test-release-095/prepare-and-build.py --apply-only`. This restores the exact 0.95 "
          "source through the retained 0.94 recipe, then applies the guarded 0.95 overrides. "
          "Running it again on exact 0.95 is idempotent. Partial or future source edits are refused.\n\n"
          "To build, omit `--apply-only` and supply `--keystore`, `--alias`, `--java-home` and `--android-sdk`; "
          "signing passwords come from private environment variables or an interactive prompt. No private signing inputs "
          "are included. The recipe builds a normal APK only and performs no upload.\n\n"
          "Repair/ALL COMBAT, Survival/More Fortress, and Hub replay work are included. See AUDIT.md, DELIVERY.json "
          "and SOURCE-COVERAGE.json for exact verification and limits. GitHub backup was authorized separately; "
          "no VPS/update-feed or Google Play publication is performed.\n").encode())
    copy_evidence()
    print(json.dumps({"prepared": True, "overrides": len(rows), "buildInputs": len(build), "assets": len(assets),
                      "manifestSHA256": digest(PROFILE / "overlay-manifest.json")}))


def copy_evidence():
    for source_name, target in [("AUDIT095.md", "AUDIT.md"), ("DELIVERY095.json", "DELIVERY.json")]:
        src = QA / source_name
        require(src.is_file(), "Required observed delivery record absent: " + source_name)
        write(PROFILE / target, src.read_bytes())
    selected = ["09-candidate1-integrity.json", "08-authorized-source-delta.json", "15-exact1-first-replay-status.json",
                "16-exact1-visible-controls-only.json", "19-exact1-pause-stable.json", "21-exact1-seek-native-frame-proof.json",
                "25-exact1-real-touch-pan.json", "29-exact1-play-speed-advance.json", "37-exact1-3d-restored.json",
                "65-exact1-recents-resume.json", "66-exact1-return-same-match.json", "73-exact1-offline-error.json",
                "76-exact1-retry-second-real-replay.json", "79-exact1-compact-controls-fit.json", "83-route-preservation.json",
                "86-exact1-final-preservation-identity.json", "89-clean-final-home.json",
                "15-exact1-first-replay.png", "24-exact1-seek-zoom-camera.png", "45-inspect-quality-fixture-screen.png",
                "73-exact1-offline-error-screen.png", "76-exact1-second-replay-ready.png", "78-exact1-compact-replay.png"]
    for name in selected:
        src = QA / name
        require(src.is_file() and src.stat().st_size < 16 * 1024 * 1024, "Invalid curated record: " + name)
        write(PROFILE / "validation" / name, src.read_bytes())


def coverage(base, manifest):
    rows = {row["path"]: row for row in manifest["files"]}
    with zipfile.ZipFile(base) as source:
        cache = {}
        for name, expected in manifest["effectiveBuildSources"].items():
            if name in rows:
                actual = digest(PROFILE / "overrides" / name)
                origin = PROFILE_NAME + "/overrides/" + name
            else:
                origin = manifest["priorOverrideSources"].get(name, name)
                require(origin in source.NameToInfo, "Clean archive restoration source absent: " + origin)
                if origin not in cache:
                    with source.open(origin) as stream:
                        cache[origin] = file_digest(stream, "sha256").hexdigest()
                actual = cache[origin]
            require(actual == expected, "Clean source overlay mismatch: " + name + " from " + origin)
    before = {name: digest(ROOT / name) for name in manifest["effectiveBuildSources"]}
    subprocess.run([sys.executable, str(PROFILE / "prepare-and-build.py"), "--apply-only"], cwd=ROOT, check=True)
    after = {name: digest(ROOT / name) for name in manifest["effectiveBuildSources"]}
    require(before == after == manifest["effectiveBuildSources"], "Idempotence changed exact APK source")
    result = {"passed": True, "cleanArchiveOverlayBuildInputs": len(before), "exactSourceIdempotence": True,
              "buildInputsUnchanged": True, "APK_SHA256": APK_SHA, "baseMembers": BASE_MEMBERS,
              "scope": "Independently resolve every build input through retained archive/profile origins; then run guarded recipe on exact current source."}
    jwrite(PROFILE / "SOURCE-COVERAGE.json", result)
    return result


def package(base, output, apk):
    require(not output.exists(), "Preserve existing complete 0.95 delivery")
    pending = output.with_name(output.name + ".building")
    require(not pending.exists(), "Preserve existing partial archive for diagnosis")
    manifest = json.loads((PROFILE / "overlay-manifest.json").read_text())
    for row in manifest["files"]:
        require(digest(ROOT / row["path"]) == row["sha256"] == digest(PROFILE / "overrides" / row["path"]),
                "Source changed after preparation: " + row["path"])
    for name, wanted in manifest["effectiveBuildSources"].items():
        require(digest(ROOT / name) == wanted, "Build input changed: " + name)
    require(digest(apk) == APK_SHA, "Wrong exact tested APK")
    delivered = json.loads((QA / "DELIVERY095.json").read_text())
    require(delivered.get("passed") is True and delivered.get("SHA256") == APK_SHA, "Exact observed delivery receipt required")
    with zipfile.ZipFile(apk) as binary:
        actual = {"app/src/main/" + name: sha256(binary.read(name)).hexdigest() for name in binary.namelist()
                  if name.startswith("assets/") and not name.endswith("/")}
        require(actual == manifest["effectiveAPKAssets"], "APK assets differ from source")
    proof = coverage(base, manifest)
    jwrite(PROFILE / "PACKAGE-SEAL.json", {"versionCode": 95, "APK_SHA256": APK_SHA,
            "sourceManifestSHA256": digest(PROFILE / "overlay-manifest.json"),
            "coverageSHA256": digest(PROFILE / "SOURCE-COVERAGE.json"),
            "githubBackupAuthorized": True, "vpsUploaded": False, "googlePlayPublished": False, "aabBuilt": False})
    with zipfile.ZipFile(base) as original:
        old_members = original.infolist()
        prefix = original.start_dir
    with base.open("rb") as src, pending.open("xb") as dst:
        shutil.copyfileobj(src, dst, 8 * 1024 * 1024)
    with zipfile.ZipFile(pending, "a", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(PROFILE.rglob("*")):
            if path.is_file():
                require(not path.is_symlink(), "Profile symlink refused")
                archive.write(path, PROFILE_NAME + "/" + path.relative_to(PROFILE).as_posix())
    with zipfile.ZipFile(pending) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)) and names[:len(old_members)] == [x.filename for x in old_members],
                "Old source members changed or duplicated")
        require(archive.testzip() is None, "Complete archive CRC failed")
        for a, b in zip(old_members, archive.infolist()):
            require((a.CRC, a.file_size, a.compress_size, a.header_offset) ==
                    (b.CRC, b.file_size, b.compress_size, b.header_offset), "Old compressed member changed")
        for p in PROFILE.rglob("*"):
            if p.is_file():
                with archive.open(PROFILE_NAME + "/" + p.relative_to(PROFILE).as_posix()) as stream:
                    require(file_digest(stream, "sha256").hexdigest() == digest(p), "Profile ZIP bytes differ")
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
              "sourceManifestSHA256": digest(PROFILE / "overlay-manifest.json"), "sourceCoverage": proof,
              "vpsUploaded": False, "googlePlayPublished": False, "aabBuilt": False}
    jwrite(output.with_suffix(output.suffix + ".validation.json"), result)
    print(json.dumps(result, indent=2))


RESTORE = '''"""Restore the guarded exact normal 0.95 source. No publication."""
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
 m=json.loads((HERE/'overlay-manifest.json').read_text());assert m['versionCode']==95 and m['versionName']=='0.95'
 actual={p.relative_to(ROOT).as_posix()for p in(ROOT/'app/src').rglob('*')if p.is_file()}
 assert actual<=set(m['knownAppSources']),'Preserve unknown future app source before applying0.95'
 for row in m['files']:
  guarded(ROOT,row['path']);assert digest(guarded(HERE/'overrides',row['path']))==row['sha256'],row['path']
 exact=all(digest(guarded(ROOT,name))==h for name,h in m['effectiveFiles'].items())
 if not exact:
  for row in m['files']:
   assert digest(guarded(ROOT,row['path']))in m['acceptedInitialHashes'][row['path']],'Preserve partial/local edits; extract a clean archive before applying: '+row['path']
  subprocess.run([sys.executable,str(ROOT/'test-release-094/prepare-and-build.py'),'--apply-only'],cwd=ROOT,check=True)
  for row in m['files']:
   target=guarded(ROOT,row['path']);target.parent.mkdir(parents=True,exist_ok=True);temporary=target.with_name(target.name+'.095-tmp')
   temporary.write_bytes(guarded(HERE/'overrides',row['path']).read_bytes());os.replace(temporary,target)
 for name,h in m['effectiveFiles'].items():assert digest(guarded(ROOT,name))==h,name
 for name,h in m['effectiveBuildSources'].items():assert digest(guarded(ROOT,name))==h,name
 print('Applied exact normal test0.95 source. No publication.')
 if not args.apply_only:
  assert all([args.keystore,args.alias,args.java_home,args.android_sdk]),'Explicit private signing inputs required'
  cmd=[sys.executable,str(ROOT/'tools/build-normal-apk.py')]
  for name in ['keystore','alias','java-home','android-sdk']:cmd.extend(['--'+name,getattr(args,name.replace('-','_'))])
  if args.online:cmd.append('--online')
  if args.test_ads:cmd.append('--test-ads')
  raise SystemExit(subprocess.run(cmd,cwd=ROOT).returncode)
if __name__=='__main__':main()
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--pack", action="store_true")
    parser.add_argument("--base", type=Path, default=BASE)
    parser.add_argument("--output", type=Path, default=OUT)
    parser.add_argument("--apk", type=Path, default=APK)
    args = parser.parse_args()
    require(digest(args.base) == BASE_SHA, "Complete 0.94 fallback source hash changed")
    if args.prepare:
        prepare(args.base)
    if args.pack:
        package(args.base, args.output, args.apk)
    require(args.prepare or args.pack, "Choose --prepare or --pack")


if __name__ == "__main__":
    main()
