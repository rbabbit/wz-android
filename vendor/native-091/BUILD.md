# Source-built native Players0.91

The final native readout/navigation overlay uses retained upstream4.7.0 commit
7d3d8e51a61ceee89e6bf672a41337e1a9cd7392 and Emscripten4.0.10. No warm cache,
baseline0.90 source/object/output, data package, map, media or protocol is changed.
Native91 source/patches and native-build.json retain the exact five isolated
compile commands, three link commands, object/library/raw inputs and output hashes.

Current source changes are HCI plus MP quickjs_backend unconditional frame hooks,
two common read-only helper headers, and a tiny spectatorwidgets is-open accessor.
All0.90 selection/render logic and distinct shared0.51/Towers0.52/MP082 lineages
are retained. A related audit correction preserves playable-slot participants who
became native spectators, distinguishing currently connected/spectating humans
from disconnected former humans and inactive AI. No orders/selection API changes.

Warm reproduction requires the retained unchanged caches and0.90 isolated
display/droid objects recorded by the baseline proof. In a fresh output project:

    python tools/prepare-native-players-091.py --baseline-project /path/to/normal090 --stock-source /path/to/matched4.7source
    python tools/build-native-players-091.py --baseline-project /path/to/normal090
    python tools/check-native-players-091.py
    python tools/integrate-native-players-091.py --baseline-project /path/to/normal090 --retained-project /path/to/retained-full-source
    python tools/check-native-loader-pairs-091.py --baseline-project /path/to/normal090

Run compile/link/check commands under Ubuntu/WSL. The exact retained baseline
objects are hash-checked before and after. Towers compiles HCI separately with
-DMOBILE_PLAYERS_SCENARIO91=1; generic HCI has no define. The define changes only
read-only scenario roster filtering/mode/team presentation, not game rules.

Without caches/objects, use the complete source archive and a NEW workspace:

    python tools/prepare-native-players-cold-091.py --workspace /new/shared091 --variant shared --source-archive /path/to/archive/native-blueprint-4.7.0-source.tar.gz
    bash tools/build-native-players-cold-091.sh /new/shared091

Repeat for towers and multiplayer. Preparation first applies the retained complete
0.90 source/bootstrap, then the full91 translation units and helper headers. For
Towers it prepends the identical HCI-local profile define to that isolated source
file (recorded in prepared-native-091.json), rather than changing global CXXFLAGS.
Compiler/dependency pins come from the retained90/89 recipe. Cold wrappers were
syntax checked; a fresh dependency build was not performed. Different source paths
can change diagnostic strings/raw hashes; cross-path byte identity is not claimed.

Every full generated loader is regenerated from its matching raw program:
generic/Campaign/FFA/deferredDuel share the new0.51 WASM, Towers and MP use their
own new pairs. All six full programs including ASM_CONSTS, all three WASM files,
frozen per-mode data indexes/names/directories/hooks and entrypoint routes are
checked in runtime-integration.json and checks/loader-pairs.json. Generated raw
data/HTML, objects and host executables are not delivery source-overlay inputs.

checks/source-checks.json exercises the actual extracted roster/navigation helper
under disclosed native read/menu stubs, both generic and Towers profiles. It
covers1Hz cadence, immediate clear, scenario discovery, hidden/null statistics,
blind names, malformed UTF8, high-slot spectators, full observer details, defeated
participants, context/role changes, real menu ACK/close and denied navigation.
These host checks do not establish Android presentation. Exact signed normal91
APK runtime, physical screenshots, navigation/input and preserved native gameplay
are checked separately. This remains a local TEST; no AAB or publication.

Pre-delivery review corrected a name-read guard: included rows now always call
blind-safe getPlayerName(id,true), preserving native Commander/AI fallback names
when the raw name is empty. Slot eligibility controls phantom suppression.
The first native proof is retained separately, and all three cores/loaders were
source-rebuilt for this correction. Each helper profile now includes an explicit
empty-raw-name/native-Commander case. No first-build runtime is claimed for R2.
