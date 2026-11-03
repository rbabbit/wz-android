# v5.0 gameplay audit

Status: reported gameplay flows and related menu checks passed on the delivery APK.
This is finite emulator coverage, not certification of every possible game state.

APK SHA-256: `1b99ef69e369a75c86ee42e1c545874b57293083cc476ccc6357aa2421e30006`.

## Changes

- BUILD uses Warzone's original structure picker, pending order lists and green
  blueprints. The custom neon/FIFO route is no longer the default.
- BUILD selects nearby constructors across builder pages, including expanding a
  manually selected pair. Native builder-card changes join completion tracking.
  Placement exits automatically; SELECT retains accepted work and STOP clears
  explicit orders. Readiness and navigation guards handle delayed input.
- A persistent triangular lower-left console exposes SELECT / MOVE, ALL UNITS,
  PATROL, BOX, STOP and TRUCKS. MORE remains visible in the header.
- Keyboard and custom/native page returns restore the battlefield and framebuffer
  aspect ratio. Density changes preserve the running game.
- Generated native templates remain producible, duplicate entries are removed,
  and factory capacity waits explain the original constructor limit.

## Actual emulator evidence

Each tested case checks the installed APK hash. Results carry their own hash and
completion time. The final gate rejects stale passes. Tests use Android taps and
pickers, trusted touch streams, screenshots and fresh original-engine QuickSave
data. Wrapper counters alone do not prove construction, movement or gestures.

| Evidence | Verified behavior |
| --- | --- |
| ship-normal/production-return-results.json | Native-picker design/save with keyboard open; real production, tank selection and movement after three Factory returns |
| ship-normal/controls-results.json | ALL combat selection/toggle, native PATROL, STOP, TRUCKS, BOX and actual group movement |
| ship-normal/gestures-results.json | Native camera position changes, pinch projection-scale change, saved tilt rotation and released keys |
| ship-normal/generated-template-results.json | Unique generated template cards and a real additional unit |
| ship-normal/build-interrupt-results.json | TECH interrupts BUILD while automatic selection is opening, without a late BUILD callback |
| ship-hq/large-group-results.json | Normal factory production to 15 constructors, selection across pages, selected pair expanded to 15, native work for every truck and three completed structures |
| ship-hq/queue-cancel-results.json | 12 native sites, occupied-site retention, SELECT preserving orders and STOP clearing explicit queues |
| ship-hq/fast-queue-pan-results.json | All six rapid sites retained in native orders/structures; immediate pan actually moves the camera |
| ship-pages/native-queue-results.json | Three initial nearby constructors, three original queued sites, completed structures, hidden preview and subsequent native MOVE orders |
| ship-pages/native-switch-results.json | Native card switch to the other base, construction, placement exit and real movement |
| ship-pages/roundtrip-results.json | Three repeated custom/native menu cycles, including HELP/TECH, with visible controls and correct framebuffer extent |
| ship-pages/invalid-tool-results.json | Empty native build choice rejects unsent sites and leaves navigation usable |
| ship-pages/wave-play-results.json | Actual wave advance, native enemies, surviving-enemy retention and real weapon firing |
| ship-compact/partial-resume-results.json | A single worker pauses an unfinished foundation at 130/400 points, then a normal tap issues HELPBUILD and completes the same structure |
| ship-compact/density-resize-results.json | Same WebView/game retained through density change and restoration |
| ship-compact/compact-smoke-results.json | Stable 1080x600 viewport: keyboard return, MORE, two sizes, all six field controls, HELP/TECH and real truck movement |

Normal and official HQ data were exercised on Pixel_10_Pro, SwiftShader, with
audio disabled. The 15/15 native constructor limit and clearing the waiting
factory queue were checked without adding free units or changing game speed.
Native camera records preserve the explicitly selected view during grouping.

All 16 regression scripts, Gradle build, APK signature and preservation checks
passed. Official engine code/WASM, the entire 65,434,780-byte v4.9 data prefix
and 3,283 prior resolved stock/mod records remain identical, excluding three
named custom scenario overrides. New data size: 66,158,381 bytes.

## Limits and diagnostics

The pre-existing black terrain remains in both Normal and HQ on this emulator.
Objects and native blueprints are visible. Physical Samsung tablet compatibility,
HQ visual improvement and audible output are not certified. Late-game waves,
every map/module/research combination and QuickLoad are not exhaustively tested.
The supplied map/mod, enemy roster, manual research, limits and artwork remain.
Native idle constructors can automatically assist nearby unfinished structures
after STOP clears explicit orders; that original engine rule is preserved.

Only ship-* evidence named in final-tests.json certifies this APK. Other folders
and loose captures are prototypes/diagnostics. Earlier fixtures included invalid
cliff sites, a stale terrain observer after STOP, insufficient isolated visible
ground, sloped projection assumptions and runs interrupted by actual HQ defeat.
These are not counted as passes. Cross-version QuickLoad is not certified.
