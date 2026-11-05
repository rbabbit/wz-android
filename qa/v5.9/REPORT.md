# v5.9 single item tap

Clean built and installed APK SHA-256:
`5d88d0866cfac08bd9eef2ed346b174f4555d908cecd4d642f080917098a87f2`.
The v5.8 APK/source/checksums remain frozen.

## Cause and behavior

Opening BUILD previously started a hidden native truck-selection task and
disabled every structure card during it. An early first MG-bunker tap was
therefore ignored. Earlier audits waited for that hidden setup to finish, which
missed the user's actual sequence.

BUILD now opens the catalogue immediately. One structure tap selects the closest
connected constructor group to the visible area and activates that structure.
A distant previous selection no longer overrides the nearby group. If there are
no constructors, the tool/group are cleared and Warzone's native Select All Trucks
shortcut clears any previous combat selection. The shortcut holds and releases
the actual Shift key across frames; a modifier flag alone did not work in SDL.
The existing v5.8 card/sidebar smoothing and native order handling remain.

## Observed on emulator-5556, with no audio

delivery/results.json records the exact installed APK:

- At 1600x720, 1280x576 and 1080x600, BUILD was followed by exactly one MG-bunker
  card tap without waiting for truck setup. The card was immediately enabled.
- Three nearby native constructors were selected. Actual native order statistics
  and positions matched **PillBox1**, not just a generic build-ready callback.
  Each requested bunker completed with its full 400 native construction points.
- Selecting the remote construction group first, then viewing the other base
  and tapping the MG bunker once, selected the nearby group and built there.
- A combat unit was produced normally. A controlled native save fixture then
  removed the six constructors while preserving that selected combat unit.
  On the real engine's zero-constructor roster, BUILD and one MG tap cleared
  selection, retained an empty builder group and activated no placement tool.
  This is an empty-roster fixture, not a claim of observing six combat deaths.
- A replacement constructor was produced normally from the factory. With that
  single constructor, one MG tap activated placement; its exact native order
  and completed bunker were verified. Exit kept accepted work.
- Screenshots of ready/empty states were inspected. The final native test state
  is paused. No units, power or research were granted by a product/debug API.

After native Save/Load, the engine normalized stock template IDs. The recovery
fixture initially used the pre-load ConstructionDroid alias; it was corrected to
the live native template ID and continued from the same healthy empty-roster
state. Earlier passing item/selection checks were retained, rather than replayed.

## Verification limits

All active regression scripts pass, including immediate catalogue availability,
nearest-group handoff, a held Shift chord, input draining and transition cover
ownership. verify-ui-only-package.py confirms only command-pages.js and
touch-controls.js changed among assets/resources versus v5.8. The engine, WASM,
data/scenario, Tower Defense mod, Research and layout stylesheet are identical.

This covers the requested Build/item/constructor flow and native completion.
It does not certify every timing/device combination. Existing emulator black
terrain and physical-device rendering, audio and performance limits remain.
