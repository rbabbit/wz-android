# Native HUD source overlay for v0.31

The blue level name and elapsed-time text behind the mobile Research/Production
dock came from the native `draw3DScene()` renderer. They are rendered whenever
native widgets are enabled. Disabling native widgets would also disable the
minimap and affect input, so the correction suppresses only the two text draw
calls in `src/display3d.cpp`.

`display3d.cpp` is the complete active source file. `native-hud.patch` records
the exact two-call correction against the same entry in the unchanged complete
`archive/native-blueprint-4.7.0-source.tar.gz` source bundle. The original queued
blueprint alignment correction remains intact. Clock calculations and state,
debug-status text, minimap rendering, native widgets, touch/order processing,
authored maps and scenario scripts are unchanged.

The shipped runtime was built incrementally in the verified prepared WSL source
cache, using Emscripten 4.0.10 and the existing pinned build inputs. Before any
edit, its source file matched the bundled source byte for byte, and its cached
JS/WASM matched the shipping baseline artifacts. The actual compile rebuilt
only `display3d.cpp.o` and linked the existing engine; utility data tasks ran but
none of their stock data replaced the app's authored virtual data package.

For a complete fresh rebuild under Linux/WSL, use the existing native build
prerequisites described by `tools/build-native-blueprint.sh`, then run:

```sh
python3 tools/build-native-hud-031.py --workspace /absolute/empty/build-directory
```

The wrapper checks the original build recipe and overlay hashes, extracts the
original complete source, installs only this full source overlay, and executes
the pinned original build recipe. Its final integration uses
`tools/integrate-native-runtime.py`, preserving the current app's package index,
all authored virtual files, exact worker-output hook and early runtime exports.
`--verify-only` validates these source guards and shell syntax without starting
a build. A clean dependency/toolchain rebuild was not repeated for this change.

The regenerated JavaScript is byte-identical to v0.30 after integration. The
virtual data package is also byte-identical. Only the compiled WASM changes;
the complete matched build/integration evidence is in
`qa/0.31-ui/native-hud-build.json` and `native-runtime-integration.json`.
