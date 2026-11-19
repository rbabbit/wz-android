"""Preserve the current complete Maps test source without build caches or keys.

Run with --snapshot only after the delivery sources are stable. Existing output
is never replaced. Unchanged large media/native files use immutable hardlinks;
source text and changed files are independent copies. No build or publication.
"""
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
import argparse
import hashlib
import json
import os
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path("C:/timerApp/maps-test-0996-20261119/source")
EXCLUDED_PARTS = {".git", ".gradle", ".kotlin", ".idea", "build", "node_modules", "__pycache__", ".cxx", ".externalNativeBuild"}
EXCLUDED_SUFFIXES = {".apk", ".aab", ".jks", ".keystore", ".p12", ".key", ".pyc", ".pyo"}
BINARY_IMMUTABLE = {".data", ".wasm", ".zip", ".wz", ".bin", ".png", ".webp", ".jpg", ".jpeg", ".ogg", ".mp3", ".mp4", ".wav", ".flac", ".ttf", ".otf"}


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def source_files():
    tracked = set(git("ls-files", "-z").decode("utf-8").split("\0")) - {""}
    untracked = set(git("ls-files", "--others", "--exclude-standard", "-z").decode("utf-8").split("\0")) - {""}
    # Newly added implementation/source checks only; no host app data or deliveries.
    untracked = {n for n in untracked if n.startswith(("app/", "scenario/", "tools/", "docs/", "qa/maps-0996/"))}
    changed = set(git("diff", "--name-only", "HEAD", "-z").decode("utf-8").split("\0")) | untracked
    result = []
    for name in sorted(tracked | untracked):
        relative = PurePosixPath(name)
        if relative.is_absolute() or ".." in relative.parts or "\\" in name or ":" in name:
            raise RuntimeError("Unsafe source path: " + name)
        path = ROOT / name
        if any(part in EXCLUDED_PARTS for part in relative.parts) or path.suffix.lower() in EXCLUDED_SUFFIXES:
            continue
        if path.name in {"local.properties", "key.properties", ".env", "known_hosts"} or path.name.startswith(".env."):
            continue
        if not path.is_file():
            continue
        if path.is_symlink() or not path.resolve().is_relative_to(ROOT):
            raise RuntimeError("Source link outside the snapshot refused: " + name)
        result.append((name, path, name not in changed))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", action="store_true")
    args = parser.parse_args()
    paths = source_files()
    size = sum(path.stat().st_size for _, path, _ in paths)
    if not args.snapshot:
        print(json.dumps({"files": len(paths), "bytes": size, "destination": str(OUTPUT), "written": False}))
        return
    if OUTPUT.exists():
        raise RuntimeError("Preserve existing source snapshot: " + str(OUTPUT))
    OUTPUT.mkdir(parents=True)
    rows = []
    for name, path, unchanged in paths:
        target = OUTPUT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        link = unchanged and path.stat().st_size >= 1024 * 1024 and path.suffix.lower() in BINARY_IMMUTABLE
        if link:
            try:
                os.link(path, target)
            except OSError:
                link = False
                shutil.copy2(path, target)
        else:
            shutil.copy2(path, target)
        row = {"path": name, "bytes": target.stat().st_size, "storage": "immutable-hardlink" if link else "independent-copy"}
        if not link:
            with target.open("rb") as stream:
                row["sha256"] = hashlib.file_digest(stream, "sha256").hexdigest()
        rows.append(row)
    manifest = {"version": "0.99.6", "createdUTC": datetime.now(timezone.utc).isoformat(),
                "baseCommit": git("rev-parse", "HEAD").decode().strip(), "files": rows,
                "totalBytes": size, "hardlinkedFiles": sum(r["storage"] == "immutable-hardlink" for r in rows),
                "note": "Complete effective working-tree source. Copy hardlinked immutable media/native files independently before editing; signing keys and build caches are intentionally excluded."}
    (OUTPUT / "MAPS-SOURCE-MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"files": len(rows), "bytes": size, "hardlinks": manifest["hardlinkedFiles"], "destination": str(OUTPUT), "written": True}))


if __name__ == "__main__":
    main()
