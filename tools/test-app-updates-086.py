"""Host execution of the real update policy, bounded transfer and Home layout."""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / "app/src/main/java/com/rbabbit/blocknight/warzone"
JDK = Path("C:/Program Files/Android/Android Studio/jbr/bin")
sources = [JAVA / name for name in ("AppUpdatePolicy.java", "AppUpdateTransfer.java", "HomeMenuLayout.java")]
sources.append(Path(__file__).with_suffix(".java"))
with tempfile.TemporaryDirectory(prefix="wz-update-086-") as directory:
    built = subprocess.run([str(JDK / "javac.exe"), "-encoding", "UTF-8", "-d", directory,
                            *map(str, sources)], capture_output=True, text=True)
    if built.returncode:
        raise RuntimeError(built.stderr)
    ran = subprocess.run([str(JDK / "java.exe"), "-Djava.awt.headless=true", "-cp", directory,
                          "com.rbabbit.blocknight.warzone.AppUpdateCheck086",
                          str(ROOT / "app/src/main/assets/warzone/ui/Oswald.ttf")], capture_output=True, text=True)
    if ran.returncode:
        raise RuntimeError(ran.stderr)
    report = json.loads(ran.stdout)
report.update({
    "scope": "Production Java policy, stream-size/cancellation/checksum acceptance, signer-set comparison and Home geometry executed on host JDK.",
    "limits": "Android networking, native PackageManager APK parsing, installer approval, actual Android drawing/touch and update-data preservation require device verification.",
    "checks": ["Newer-version comparison; strict app/schema/version/URL/size/SHA256 contract",
               "Reject changed scheme/host/path/query/fragment/userinfo/port and incorrect intentional filename",
               "Reject missing/wrong/duplicate signers; accept same signers independent of ordering",
               "Transfer bytes and monotonic progress; reject truncation, oversize and cancellation",
               "Actual file SHA256 success/corruption/length/cancellation",
               "Home navigation stays above 48dp update footer in 36 compact/normal/enlarged-text geometry cases"],
    "sources": [{"path": p.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in sources],
})
output = ROOT / "qa/updates-086/host-checks.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
