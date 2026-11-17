# Native0.89 source reproduction

The shipped APK uses three distinct4.7 lineages: shared0.51 for Campaign/FFA,
Towers0.52 with its guarded unit-loss notice, and Multiplayer082. Do not replace
the shared core with the Towers core. All use upstream commit
`7d3d8e51a61ceee89e6bf672a41337e1a9cd7392`, emsdk commit
`1693ce7359fc9694f198694f902a2cc061239b86`, SDK4.0.10, and vcpkg commit
`6fdd23fa0a9479a9f9a1c48178696f60cf39255d`. The unchanged upstream package
baseline is `77df67cfff9c12ccfdb52284e07c87c75092f723`.

The exact completed build is recorded in native-build.json, source/, patches/,
proof/*cache-before.json, proof/*cache-after.json and runtime-integration.json.
The shared raw pair supplies FOUR full loaders: generic, Campaign, FFA and
deferred Duel. Each is regenerated from the new shared raw JS, preserving its
own exact package index, data-name declaration, worker-output hook and retained
directory declarations. All resolve the same new shared WASM; reusing an old
full Campaign/FFA/Duel JS loader with that WASM is invalid. The pthread runtime
loads its own _scriptName, so each worker inherits the matching full loader.
Run tools/check-native-loader-pairs-089.py with --baseline-project pointing to
the prepared retained0.87 source. checks/loader-pairs.json proves all SIX full
generated loaders (four shared, Towers, MP), their native-pair hashes, exact
normalized generated program including ASM_CONSTS, frozen data and HTML routes.
This static check does not replace exact-APK startup verification.
The first0.89 APK candidate, SHA256
858a100040d281325089dc30c87c2dead127b8c3c937d51e224b1bcc52d33da2,
failed Campaign startup with ASM_CONSTS[emAsmAddr] is not a function because
the initial integration updated the shared WASM but missed the dedicated full
Campaign/FFA loaders. That initial artifact is not a delivery candidate.
The integration recipe now regenerates Campaign/FFA/deferred Duel from the
recorded matching raw shared JS, yielding six full loaders and three WASM
files. Exact-APK runtime verification of this corrected integration is recorded
separately; the static source/loader proof alone does not establish startup.
Only display3d.cpp is changed for horizontal selected-unit health rendering.
The offline family additionally changes hci.cpp to publish read-only actual
selection IDs. Original warm sources, objects, static libraries and generated
outputs were hashed before and after and remained unchanged. Generated data
was not shipped. The object/link commands are recorded in full, including the
isolated output paths. Source checks execute the actual extracted C++ helpers;
they do not substitute for exact-APK gameplay verification.

## With retained warm caches

The default caches used were `/home/punkech/wz-blueprint-20261107` and
`/home/punkech/wz-mp-070`. The build script accepts --offline-cache, --mp-cache,
--baseline-project and --retained-project for other locations. It compiles new
objects outside those caches and relinks to isolated raw outputs. It does not
edit cached translation units or objects. Start with a new isolated output
project; it intentionally refuses to overwrite a completed native-build record.

    python3 tools/build-native-selection-089.py --baseline-project /path/to/prepared-Play0.87 --retained-project /path/to/complete-retained-source
    python3 tools/check-native-selection-089.py --json-include /path/to/source/3rdparty/json/include
    python3 tools/integrate-native-selection-089.py --baseline-project /path/to/prepared-Play0.87 --retained-project /path/to/complete-retained-source

The retained project supplies the original0.51 droid.cpp and established
integration recipe; copies of those necessary inputs and recipes are included
here. Existing historical vendor082 output locations are never overwritten.

## Without warm caches

Use Ubuntu24.04/WSL2. Required host packages are build-essential, cmake,
ninja-build, git, zip, unzip, gettext, autoconf, autoconf-archive, automake,
libtool, pkg-config and python3. Python3.12 supplies the safe tar data filter.

The complete retained0.87 source ZIP already contains
`archive/native-blueprint-4.7.0-source.tar.gz` (565368157 bytes). It includes
the expanded native source/submodule inputs, dependency source archives,
Emscripten port sources and original build records. There is no need to copy
that large archive into this overlay. Its hash and one original blueprint
source delta are recorded in bootstrap/retained-snapshot.json. The archive
omits Git databases, SDK/toolchain binaries and build caches; autorevision.cache
retains upstream version metadata. Both family source overlays replace the
archive's sole patched display3d.cpp, so no Git reset or reverse patch is needed.

For each variant, prepare a separate NEW/EMPTY workspace:

    python3 tools/prepare-native-selection-cold-089.py --source-archive /path/to/complete-source/archive/native-blueprint-4.7.0-source.tar.gz --workspace /new/shared089 --variant shared
    bash tools/build-native-selection-cold-089.sh /new/shared089

Repeat with --variant towers and --variant multiplayer in separate workspaces.
The preparation tool applies the complete retained family source overlay and
the reviewed0.89 source. Shared additionally restores the exact original
droid.cpp; Towers retains0.52's guarded loss-notice source. Multiplayer retains
its room/privacy/transport source overlays and two include files. The cold
shell recipe uses the same pinned SDK/vcpkg and configure flags as the retained
full build recipe. SDK/vcpkg Git repositories and missing binary tools may need
network access. Bundled dependency/port source archives are reused.

The cold preparation/build recipes were syntax reviewed; a second full cold
dependency build was not performed for this focused update. The actual release
build used the verified warm caches and exact object/link commands. Different
absolute source paths can change embedded diagnostic strings; do not claim
bit-identical raw output solely from source equivalence.

## Delivery integration

Use each rebuilt JS/WASM as a matched pair. The normal integration script
records exact per-variant package-index and runtime hooks and installs nine
candidate files (six generated JS loaders plus three WASM). Offline keeps the existing worker-output hook and each loader's
own exact index. The shared0.51 index deliberately addresses only the original
prefix of the physical data file; Towers indexes its appended command tail.
The existing HTML preRun hooks create authored map directories. These retained
index, directory and worker details are validated without new behavior patches.
MP keeps its exact official data index, Android worker transport imports, prior
DNS-gate integration and runtime-ready callback. Protocol remains16384/104.

Keep all .data, maps, models, music, scenario scripts and saves byte-identical.
Do not distribute generated stock data/music from any native build. The0.88
camera pilot is not included. Verify all four modes on the exact signed normal
APK before publication; native compile/host-source checks establish narrower
claims only.
