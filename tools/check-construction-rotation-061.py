"""Record focused host checks. Native gameplay is verified separately."""
from pathlib import Path
from hashlib import sha256
import datetime
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
COMMANDS = [
    ["node", "tools/check-construction-sites-061.cjs"],
    ["node", "tools/check-construction-recovery-052.cjs", "--behavior-only"],
    ["node", "tools/check-construction-ui-061.cjs"],
    ["node", "tools/check-touch-rotation-061.cjs"],
]
SOURCES = [
    "scenario/warzone-towers-commands.js", "campaign/commands.js",
    "scenario/ffa/commands.js",
    "app/src/main/assets/warzone-command-pages.js",
    "app/src/main/assets/warzone-touch-controls.js",
]


def main():
    checks = []
    for command in COMMANDS:
        result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
        print(result.stdout, end="")
        if result.returncode:
            raise RuntimeError(result.stderr or "Host check failed: " + " ".join(command))
        checks.append({"command": command, "passed": True, "output": result.stdout})
    report = {
        "version": "0.61", "passed": True,
        "emulatorUsed": False, "actualNativeEngineExecuted": False,
        "scope": "Actual JavaScript under bounded native API/DOM/SDL fixtures; not device gameplay.",
        "checks": checks,
        "sources": [{"path": name, "sha256": sha256((ROOT / name).read_bytes()).hexdigest()}
                    for name in SOURCES],
        "recordedUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    target = ROOT / "archive/construction-rotation-0.61-host-checks.json"
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("PASS focused host checks recorded: " + str(target))


if __name__ == "__main__":
    main()
