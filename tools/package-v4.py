from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile, ZIP_DEFLATED
import re

root=Path(__file__).resolve().parents[1]
output=root.parent
gradle=(root/"app/build.gradle.kts").read_text(encoding="utf8")
version=re.search(r'versionName = "([^"]+)"',gradle)[1].split("-")[0]
version_code=int(re.search(r'versionCode = (\d+)',gradle)[1])
apk=output/f"Warzone-Towers-v{version}.apk"
archive=output/f"warzone-towers-v{version}-source.zip"
assert apk.is_file(), f"Copy the built APK to {apk} before packaging"
excluded={".gradle",".git",".kotlin","build","node_modules","__pycache__"}
with ZipFile(archive,"w",compression=ZIP_DEFLATED,compresslevel=5) as zipped:
    for file in sorted(root.rglob("*")):
        if not file.is_file():
            continue
        relative=file.relative_to(root)
        if any(part in excluded for part in relative.parts):
            continue
        if relative.as_posix() in {"local.properties","tools/live-cdp-url.txt"}:
            continue
        zipped.write(file,relative.as_posix())
with ZipFile(archive) as zipped:
    assert zipped.testzip() is None
    assert f'versionCode = {version_code}'.encode() in zipped.read("app/build.gradle.kts")
    assert b'final result: passed' in zipped.read("design-qa.md")
    count=len(zipped.namelist())
lines=[]
for artifact in (apk,archive):
    digest=sha256(artifact.read_bytes()).hexdigest().upper()
    lines.append(f"{digest}  {artifact.name}")
    print(f"{artifact.name}: {artifact.stat().st_size} bytes; SHA256 {digest}")
(output/f"Warzone-Towers-v{version}-SHA256.txt").write_text("\n".join(lines)+"\n",encoding="utf8")
print(f"Source backup verified: {count} entries")
