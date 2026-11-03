# Warzone Towers v4.9 audit

Test date: 3 November 2026. Version: 4.9-command-fixes (49).
APK SHA-256: `c9d717c5e390224b15529f0afc39637df90389cf727af156d3b6e9ffb42a7d71`.

## Fixes

- Mouse and pen construction placement previously bypassed the custom build
  scheduler. Trusted mouse clicks reproduced zero placements in v4.8. Both input
  types now use the scheduler during placement; forwarded SDL events are tagged
  to avoid recursion. Middle-button camera input remains delegated; right-click
  cancels placement. Placement touches tolerate 14 CSS pixels of drift; intentional
  drags still pan.
- Terrain projection recognizes original depth shaders whose unused `paramx1`
  uniform was optimized away, using `paramx2` plus `lightmap_tex`. No original
  shader, engine or game asset was edited. The optimizer regression passes with
  the fix and fails when the added detection is removed. The baseline HQ emulator
  already found a fallback terrain layer; this is a portability correction.
- DESIGN now exposes NEW DESIGN, SAVE CHANGES and SAVE AS NEW. New drafts receive
  independent IDs and default names. Editing and copying preserve other designs.
- Draft validation is invalidated on New/Edit and captures a stable draft ID and
  revision. Optional turret slots cannot silently replace the required first slot.
  Save blocks duplicate submissions, permits retry after errors, rolls back failed
  persistence, and cannot replace a newer draft or redirect a later page.
- Search updates its results without replacing the input. Body changes update only
  turret controls instead of rebuilding the whole editor. Page scroll and factory
  quantity are retained. Factory availability/templates refresh on live changes.
  Navigation invalidates pending native-menu acknowledgements.

## Real Android tests

Pixel_10_Pro AVD, Android 16, WebView 158.0.8127.2, SwiftShader, `-no-audio`,
1920x1200 Android extent / 1280x800 landscape WebView. Tests used actual ADB taps,
Android native component/quantity/factory pickers and trusted CDP mouse/pen/touch
and text input. Design components were not selected by assigning DOM `.value`.
UI tests ran sequentially. No research automation, free units, teleportation or
simulation modifications were used.

| Test | Result and evidence |
| --- | --- |
| Automatic construction | Three cannon defences completed in FIFO order with one retained automatic truck. Native `struct.json` records each with `currentBuildPts=400`. `matrix-results.json`, `matrix-automatic-completed.json`. |
| Manual group / rejection / transport | Six selected trucks assigned; STOP cleared their queues. Occupied tap kept placement active and showed red feedback. BASE/zoom retained the chosen structure. All 25 transport commands received replies. `matrix-results.json`, `matrix-stopped-commands.json`. |
| Larger structure | Actual touch placed a 2x2 research facility at tile 4,30; ordinary native construction completed. Rejected candidate sites were not treated as build failures. `large-build-results.json`, `large-build-native.json`. |
| Input types | Trusted mouse, pen and an 11px drifting touch each produced exactly one accepted native build job. `input-results.json`, `inputs-native.json`. |
| Design library | Two independent blueprints created with real native pickers; editing the first preserved the second; Save as New retained the original with a distinct ID. `design-library-results.json`, `design-library.png`. |
| Factory | Native quantity 5 retained across factory selection; two factories delivered real tanks with Body1REC, wheeled01, Cannon1Mk1. `production-results.json`, `production-native.json`. |
| Gestures | Native save camera values changed for pan/pinch/tilt; heading stayed stable during tilt. Minimap, cancelled touch and HELP/TECH returns did not add accidental jobs; held footprint appeared. `gesture-results.json`, `gestures-*.json`. |
| Overlay and native menus | Six HELP scroll/return and TECH return cycles; native Stats, Factory and Commanders open/close. Header/input restored. `final-overlays-run.log`, `final-native-panels-run.log`. |
| Pages and search | Four cycles through Design/Saved/Factory/Queue/More/Build and native Stats transitions. Continuous trusted search typing retained focus and text; native Back stayed hidden after navigation; battlefield inert cleared. `page-results.json`. |
| Layout | Header/wave controls fit; Extra large buttons and stock images loaded at tested extent. `layout-results.json`. |
| Restart / Normal mode | All four design identities/components persisted across process restart and graphics-mode change; existing design reopened and validated. Normal `terrainMode=1` confirmed. `restart-results.json`. |
| Combat selection fallback | With an actually produced combat unit selected, BUILD automatically assigned one constructor and completed the defence. `normal/combat-fallback-results.json`, `normal/combat-selection-native.json`. |
| Normal construction | Three automatic FIFO structures completed again; six-truck assignment, rejection, STOP and transport burst passed. A direct battlefield tap selected one truck and that truck completed its defence. `normal/matrix-results.json`, `normal/single-truck-results.json`. |

The first long-running battle ended normally while the next audit was waiting;
it was restarted for interaction tests. The emulator also showed a System UI
startup timeout before gameplay. These startup/render delays remain limitations.

## Regression/build preservation

All 15 `tools/test-*.cjs` scripts passed. Added deterministic tests cover stale
validation/save results, duplicate Save, Save as New, failed-save retry, storage
rollback, required turret slot and native-menu races. The touch harness now routes
forwarded PointerEvents through capture listeners to exercise recursion prevention.
The terrain negative check proves its regression detects the unfixed behavior.
See `final-regressions.log`, `command-page-races.log`, `terrain-negative.log`.

Gradle assembleDebug and APK v2 signature verification passed. Installed package
versionCode=49/versionName=4.9-command-fixes and its on-device SHA-256 matched the
built APK. `engine-preservation.json` verifies identical official engine program,
WASM, complete 65,434,780-byte v4.8 data prefix and all 3,284 prior resolved assets.
Original survival mod/map, research choices, enemy roster, icon and splash remain.

## Limits

The emulator renders black terrain in both Normal and HQ, as the frozen baseline
also did. Objects, minimap and simulation remain usable for these checks. No claim
of HQ visual quality or physical Samsung Tab S8 startup/compatibility is made.
Audio was silent by emulator configuration. Compact-phone layout, every possible
module/oil/research combination, and every mouse/pen camera motion were not covered
by these live tests. Invalid/outside/unreachable and component/factory rejection
paths also have regression coverage; that is distinct from real Android coverage.
The user's exact physical finger-placement/page report was not reproduced on their
hardware. An earlier native-picker failure was corrected in the test helper, not
reported as a game fix.

The v4.8 APK/source/checksum fallback and original qa/v4.8 remain frozen.
