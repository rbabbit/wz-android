# Multiplayer combat selection — v0.71

This builds on the v0.70 client UI engine at upstream commit
`7d3d8e51a61ceee89e6bf672a41337e1a9cd7392`. Protocol remains `16384/104` and
the original Multiplayer game-data file remains unchanged. The retained
`native-070/` inputs, outputs and records are historical and are not overwritten.

The new policy changes local selection flags only. Enabling All Combat selects
all owned, selectable droids with an armed first weapon slot, excluding
transporters, across the whole map. These are the stock Ctrl+A criteria. It
idempotently adds new combat units and removes ineligible selection without
issuing orders or changing control groups, production, camera or game rules.

`PcMultiplayerNative.setCombatLock({enabled,suspended,activation})` writes the latest atomic
intent to `/tmp/mp-mobile-combat.json`. A deliberate ON press creates a new
activation ID; temporary suspension updates retain it. A manual override blocks
late ON updates from that same activation, while a new deliberate activation can
enable the mode again. The native client consumes intent before
selection commands and publishes the actual `combatLock` state, roster and
selected IDs. Temporary Build/UI suspension retains ON intent; resuming restores
the combat selection. Explicit manual selection cancels the mode. A changed
native selection/control group also cancels it, while ordinary orders preserve
it. Death and ownership changes prune expectations without cancelling the mode.
The mode starts OFF and resets when the rendered match ends.

The native helper is retained inside `mobile-ui-native.cpp.inc`. Its source-only
deterministic probe is `tools/check-multiplayer-combat-native-071.py`; it compiles
the actual helper and predicate with unit views. That check is not native engine
or emulator gameplay. Delivery verification must observe actual produced units
and selection on the exact APK.

`tools/prepare-multiplayer-native-071.py`,
`tools/build-multiplayer-native-071.py` and
`tools/integrate-multiplayer-native-071.py` write v0.71 source/build provenance
and matched compiler outputs here and under `qa/multiplayer-071/`. They reuse the
isolated WSL warm cache at `/home/punkech/wz-mp-070`; that cache name does not
identify the delivered version. The incremental v0.71 native change is confined
to the QuickJS translation unit. The original data package is reattached after
linking, with ordered directory/file-parent checks and no WASM byte patches.

For a fresh source tree, follow the portable extraction instructions in
`../README.md` using this directory's six full source overlays,
`source-overlays.json` and `autorevision.cache` instead of their v0.70 versions.
The full expanded engine/dependency archive remains
`archive/native-blueprint-4.7.0-source.tar.gz`. Native compilation needs the
pinned toolchain/dependencies; an Android Gradle build uses the integrated
assets directly. The private UI queue runtime is unchanged, so the retained
v0.70 composer still verifies it.
