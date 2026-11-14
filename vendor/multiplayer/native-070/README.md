# Multiplayer mobile UI engine, v0.70

This directory retains the source-level client UI additions to official Warzone
2100 4.7.0, commit `7d3d8e51a61ceee89e6bf672a41337e1a9cd7392`.
The upstream reference source and original binary/data inputs remain under
`../source/vendor/`. No game rules, maps, simulation implementations or packaged
game data are replaced by this UI adapter.

`native-ui.patch` and the six overlaid `.cpp` files are the authoritative source
changes. `mobile-ui-native.cpp.inc` is the retained code generator input for the
native bridge. `source-overlays.json` pins the exact overlaid source bytes.

The private QuickJS UI context is created only after a real game world exists.
It is not registered as a synchronized rules/AI instance, does not enter the
game's script checksum or save registry, and has no native simulation timers.
The retained bootstrap processes the player's UI FIFO locally and dispatches
ordinary queued native research, construction and manufacture messages. Native
factory cancellation also uses `ModeQueue`, preserving the engine's network
authorization, synchronization and refund handling. Unsafe game-rule APIs are
removed from the private context before the reviewed bootstrap is evaluated.

The C++ additions provide structured room/world readiness after actual rendering,
native viewport/projection/terrain/radar observations, own-unit selection,
factory/research progress, actual player power, real Intelligence messages and local report audio.
The UI event journal prunes acknowledged messages and writes only after a new
event, avoiding repeated serialization of historical catalogues every frame.
The stock power bar, map/timer decoration, reticle and object order panels are
suppressed; facility taps call the custom mobile screens. Custom-replaced native
controllers cannot create stock forms, and closing-animation forms are removed
before drawing. HTML overlay events are fenced after their target handlers and
before SDL's document listeners; forwarded canvas and native room input remain
available. Original room UI appears after a confirmed lobby frame.

Camera gestures use a separate latest-value mailbox, not simulated key or wheel
pulses. The local native frame applies absolute yaw, pitch and distance only in a
safe world, wraps yaw and clips pitch/zoom to the engine's own limits. Zoom also
replaces its old animation target with a zero-duration target. The snapshot
publishes applied camera values, limits and request nonce. This changes client
view state only; pan continues through the existing input route.

Mission timer text and connection warnings are exported as `uiStatus`, using the
actual native label and connection-status predicates. Their native parent forms
are hidden during native input hit-testing and drawing, then restored after each
pass. Native callbacks, timer updates and countdown audio continue; the app HUD renders
the same timer and warning meanings without the stock blue decoration.

## Reproduction

- `tools/prepare-multiplayer-native-070.py` restores the warm cache's previous UI
  overlays to the exact upstream Git source, adds these client-only hooks, and
  records their complete patch and hashes. Its configured WSL cache is an
  isolated copy at `/home/punkech/wz-mp-070`; it does not edit the Towers engine.
- `tools/build-multiplayer-native-070.py` compiles the restored/changed objects
  and relinks the matched program. Optional campaign-mod and locale preloads
  absent from this cache are omitted from its temporary generated data package;
  none of that generated data is shipped. `qa/multiplayer-070/native-build.json`
  records source hashes and the raw pair. The retained original native build
  recipe and expanded source bundle provide the dependency/toolchain inputs.
- Official annotated tag metadata was fetched for the unchanged upstream tag.
  `upstream-tags.txt`, `autorevision.cache` and `netplay_config.h` record the
  upstream-generated protocol `16384/104`. The runtime state separately reports
  `NETGetMajorVersion()` and `NETGetMinorVersion()` for emulator verification.
- `tools/integrate-multiplayer-native-070.py` attaches the original official
  package index, adds its missing directory declarations, and reapplies the
  reviewed Android transport/DNS/runtime-ready adaptations. It never edits WASM
  bytes. `runtime-integration.json` pins the integrated assets.
- `tools/compose-multiplayer-ui-070.cjs` reproduces `mobile-ui-runtime.js` from the
  retained command/research UI sources and `mobile-ui-bootstrap.js`. `--check`
  verifies the generated file without changing it. The exact Acorn distribution
  and its license are retained in `tooling/`; the script uses that relative
  fallback when a system Acorn package is unavailable.

`raw-warzone2100.js` and `raw-warzone2100.wasm` are the matched compiler outputs.
The shipped MP `.data` file remains exactly SHA-256
`9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424`.
The emulator verification belongs to the delivery record; compilation and source
checks alone do not establish gameplay correctness.
