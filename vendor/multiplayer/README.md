# Multiplayer mobile integration — v0.70

The current Android app builds from the integrated sources/assets in `app/src`.
An ordinary Gradle build needs no sibling project or native build cache. The
Multiplayer activity, configuration and storage remain separate from Towers,
Campaign and FFA; those modes retain their existing runtimes and assets.

v0.70 uses a **source-built official 4.7.0 client with local UI hooks**, preserving
upstream commit `7d3d8e51a61ceee89e6bf672a41337e1a9cd7392` and protocol
`16384/104`. Its JS/WASM differ from v0.69. The original MP game-data package is
unchanged: SHA-256 `9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424`.
The original binary/source inputs remain preserved under `source/`.

The private native UI context provides actual facility, research, manufacturing,
selection, camera, power and Intelligence observations. Its local waiting queues
submit ordinary synchronized native player orders. It is separate from the
room's rules/AI contexts and checksums. Rendered native lobby/world signals drive
the loading cover; stock gameplay forms are suppressed. The existing compact
mobile pages are connected through `app/src/main/assets/multiplayer/` adapters.
Player name is stored in private Android preferences and applied before joining.

## Source and build records

See [`native-070/README.md`](native-070/README.md) for the native design and
reproduction prerequisites. That directory retains the complete source patch,
overlaid C++ files, generator inputs, matched raw compiler outputs, protocol/tag
metadata, pinned runtime integration and Acorn plus its licence.

From the project root, `node tools/compose-multiplayer-ui-070.cjs --check` verifies
the generated private UI runtime without changing it. The WSL prepare/build
recipes are `tools/prepare-multiplayer-native-070.py` and
`tools/build-multiplayer-native-070.py`; native recompilation requires their
configured toolchain/dependency cache, unlike an ordinary Android build.
`tools/integrate-multiplayer-native-070.py` assembles the native pair with the
frozen official data and Android transport. Hashes are recorded in
`native-070/source-overlays.json`, `native-070/runtime-integration.json` and
`qa/multiplayer-070/native-build.json`.

### Reconstruct the native source without an existing cache

The complete source ZIP also retains
`archive/native-blueprint-4.7.0-source.tar.gz`. Unlike the smaller historical
MP source-reference ZIP, this contains the full engine tree and the expanded
submodule/dependency sources used for the matching `7d3d8e51…` build. It also
contains source archives/ports and `build-record/` toolchain notes; it excludes
Git databases, build output and compiler/toolchain caches.

Run the following in Bash on Ubuntu/WSL, from the extracted Android project's
root. It creates a new temporary workspace, verifies the six retained v0.70
overlays against their manifest, and copies them to their original source paths.
The full overlays replace the older archive's blueprint renderer patch too;
do not apply either native patch a second time.

```bash
project_root="$(pwd -P)"
native_workspace="$(mktemp -d "${TMPDIR:-/tmp}/warzone-mp070-source.XXXXXX")"
tar --no-same-owner -xzf \
  "$project_root/archive/native-blueprint-4.7.0-source.tar.gz" \
  -C "$native_workspace"

python3 - "$project_root" "$native_workspace" <<'PY'
import hashlib, json, shutil, sys
from pathlib import Path

project, workspace = map(Path, sys.argv[1:])
retained = project / "vendor/multiplayer/native-070"
manifest = json.loads((retained / "source-overlays.json").read_text())
expected = {
    "src/quickjs_backend.cpp", "src/display3d.cpp", "src/hci.cpp",
    "src/multiint.cpp", "src/wrappers.cpp", "lib/sdl/main_sdl.cpp",
}
assert manifest["upstreamCommit"] == "7d3d8e51a61ceee89e6bf672a41337e1a9cd7392"
assert len(manifest["changed"]) == 6
assert {row["path"] for row in manifest["changed"]} == expected
for row in manifest["changed"]:
    data = (retained / Path(row["path"]).name).read_bytes()
    assert len(data) == row["bytes"]
    assert hashlib.sha256(data).hexdigest() == row["sha256"]
for row in manifest["changed"]:
    shutil.copyfile(retained / Path(row["path"]).name,
                    workspace / "source" / row["path"])
shutil.copyfile(retained / "autorevision.cache",
                workspace / "source/build_tools/autorevision.cache")
print("Matching v0.70 native source:", workspace / "source")
PY
```

The v0.70 `autorevision.cache` records the actual upstream commit and official
tag count 104. Copying it preserves the version metadata needed to regenerate
protocol `16384/104` when building without Git. The retained
`native-070/netplay_config.h` is a verification reference, not a request to edit
protocol constants manually.

This reconstruction needs no clone or pre-existing native cache. A fresh native
compile still needs the host packages, Emscripten 4.0.10 and pinned vcpkg inputs
documented in the extracted `build-record/BUILD-NOTES.txt` and
`build-record/build-native-blueprint.sh`. Use that script as the pinned
toolchain/configuration reference; its initial extraction step is for the older
archive and must not overwrite the v0.70 overlays after the steps above. A clean
build from this reconstruction was not performed for v0.70: the recorded native
compile used the isolated warm cache. The current prepare/build Python scripts
are those warm-cache recipes, with configured WSL paths; they are not portable
clean-workspace launchers. An Android Gradle build uses the already integrated
assets and requires none of this native toolchain setup.

Keep rebuilt JS and WASM together and use the current v0.70 integration tool.
Do not ship a fresh build's generated game-data package over the frozen official
Multiplayer `.data` file or the app's authored game assets.

`tools/package-multiplayer-070.py` does not build or manufacture test evidence.
It requires a passed emulator record for the exact APK, tested source pins and
successful build log, then checks APK/source equality and preserves every older
complete-source ZIP member. The final delivery record controls the verified
scope; compilation and host tests alone do not establish gameplay correctness.

## Observed checks and fixture limits

Actual emulator sessions reached the public **1 vs AI Bots Battle** room,
followed its autohost transfer/second Ready step and entered a rendered world.
The native name `noobcrusher` and protocol `16384/104` were observed. Two research
topics were queued through the custom page with a native acknowledgement and no
stock research pane. Manufacturing/cancellation evidence exists from a real
session; final delivery checks must be tied to that delivery's APK hash.

A camera gesture sequence measured 64,626 of 65,536 native yaw units (about 355°
of travel), pinch distance 2,600 → 1,376 for span ratio 45/85, and about 6° tilt
for 96 CSS pixels with zoom unchanged. This is measured emulator evidence, not
an exhaustive guarantee for every gesture, handset or full-turn endpoint.

The public room's map, timing and availability are external fixture conditions.
Use observed player slots and readiness rather than fixed waits. A saved phone
blueprint can correctly change a Produce button from `data-produce-template` to
`data-produce`; test the displayed enabled action instead of assuming a template
ID. After closing a full page, wait for visible footer bounds before tapping it.
These integration observations do not claim a completed match, every public
room/mod, physical curved-screen coverage or the final remaining journey checks.

---

## Historical v0.69 import documentation (retained verbatim)

The following commands and byte-identical-WASM statements describe the preserved
v0.69 import only. They do not describe or verify the current v0.70 native pair.

# Multiplayer source and binary provenance

The main app builds directly from the integrated Java, HTML, JavaScript, CSS and
three multiplayer engine assets under `app/src/main`. No sibling project or
external source folder is required for a Gradle build.

`source/` retains the exact original Web Edition 4.7.0 JS, WASM and data inputs,
the original source-reference archive and licenses, the standalone 0.2 preparation
tool, and the historical transport/Activity templates. Every retained input is
pinned by `source/source-inputs.json`. The source archive records upstream commit
`7d3d8e51a61ceee89e6bf672a41337e1a9cd7392`; Git submodules are not expanded.

Run `python tools/import-multiplayer-069.py --check` from the project root to
reproduce and verify the exact three integrated engine assets without changing
application files. `--output-dir <scratch-folder>` optionally exports those assets
and the historical templates for inspection. It refuses app-directory outputs.

The original 0.2 wrapper import was a one-time migration. Its retained templates
are provenance, not the final main-app UI. Current `MultiplayerActivity.java`,
multiplayer session/controls/UI files and home callbacks are authoritative source.
Do not copy the old Activity or UI templates over the integrated implementation.

The WASM and game data remain original and byte-identical. The JS preparation
reapplies the reviewed Android transport/runtime adapters, then exposes a
read-only native game-mode getter. Its address is tied to the exact WASM SHA256
and independently validated by `tools/verify-multiplayer-state-probe-069.py`.
No simulation, netcode version or C++ game rules are changed by that getter.
