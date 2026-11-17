# Native0.90 test source

The exact completed build uses unchanged upstream4.7.0 commit
7d3d8e51a61ceee89e6bf672a41337e1a9cd7392, Emscripten4.0.10 and the retained
0.89 toolchain/dependency pins. native-build.json records all compile/link
commands, new raw hashes and the five isolated objects. Cached source, objects,
libraries and generated outputs match before/after. No0.89 output was overwritten.

The source delta from0.89 changes the two display3d.cpp files (four selected
corner rectangles removed; selected horizontal health suppression retained),
offline hci.cpp (common frame latch), MP quickjs_backend.cpp (matching latch),
and one shared policy header. Only ordinary native SelectDroid/DeSelectDroid
calls apply local UI selection; the policy issues no orders or production.
The final HCI also contains the separate guarded visible-constructor action.

Three lineages remain distinct: shared0.51 uses original droid.cpp; Towers0.52
keeps its loss-notice object; MP082 retains its room/ownership/transport sources.
All frozen data/maps/media and protocol16384/104 are preserved.

Warm build on Ubuntu/WSL, in a fresh output project, with the retained caches:

    python3 tools/prepare-native-selection-090.py --baseline-project /path/to/normal089
    python3 tools/build-native-selection-090.py --baseline-project /path/to/normal089
    python3 tools/check-native-selection-090.py --baseline-project /path/to/normal089
    python3 tools/integrate-native-selection-090.py --baseline-project /path/to/normal089 --retained-project /path/to/full-retained-source
    python3 tools/check-native-loader-pairs-090.py --baseline-project /path/to/normal089

The builder uses the unchanged helper functions from build-native-selection-089.py;
its hash is recorded. New objects are compiled outside the caches, with an
explicit -iquote vendor/native-090/source/common for the shared policy header.
Keep completed records and binaries intact; the builder refuses their overwrite.

Without warm caches, the COMPLETE source baseline contains the retained native
source archive and old bootstrap tools. For each variant in a new workspace:

    python3 tools/prepare-native-selection-cold-090.py --workspace /new/shared090 --variant shared --source-archive /path/to/archive/native-blueprint-4.7.0-source.tar.gz
    bash tools/build-native-selection-cold-090.sh /new/shared090

Repeat for towers and multiplayer. The preparation wrapper applies complete0.89
sources first, then the new full0.90 translation units. It explicitly copies
mobile-combat-latch-v90.h into source/src, so normal quoted includes work for
BOTH offline and MP without a machine-specific include path. The shell wrapper
uses the exact retained SDK/vcpkg/configure recipe. These cold wrappers were
syntax checked; a fresh dependency build was not run. Different source paths can
change diagnostic strings and raw hashes; no cross-path byte identity is claimed.

Regenerate every full loader from its matching raw JS/WASM pair: generic,
Campaign, FFA and deferred Duel use new shared0.51; Towers and MP use their own
pairs. runtime-integration.json and checks/loader-pairs.json prove all six full
JS programs (including ASM_CONSTS), three WASM files, per-mode frozen package
indexes/data names/output hooks/directories and unchanged entrypoint routes.
Generated data/HTML are not delivery inputs. Never reuse an old full alias loader.

This is a LOCAL TEST APK. Exact-APK runtime proof and complete test-source
packaging are separate from these host/source checks. No AAB, VPS, GitHub or
Google Play action is authorized by this recipe.

The first test APK reproduced a Towers TRUCKS handoff failure in the retained
recursive JS box-selection recovery. The native latch remained suspended; it
did not steal selection. The correction adds the authoritative constructor
mailbox described in CONTRACT.md. Initial raw pairs/proofs are preserved in
release-records/native-before-constructor-api (generated raw data omitted).
rebuild-native-constructors-090.py compiles only the new offline HCI object and
relinks shared/Towers using the already isolated render/droid objects. MP and
both warm caches remain unchanged. The completed native-build.json records the
incremental commands, previous proof hash and current raw pair hashes.
check-native-constructors-090.py exercises the actual extracted helper with
selection/visibility stubs; it is host evidence, not Android gameplay proof.
A fresh full warm/cold build uses the complete current HCI directly, so the
incremental recipe is unnecessary when reproducing from source alone.
