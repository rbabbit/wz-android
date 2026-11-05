# v5.6 compact field controls and quiet construction

Verified 2026-11-05 on the owned Android emulator-5556, started with no audio.
The clean delivery APK and installed APK have the same SHA-256:
`3cfb98b4cd12f1236ded54387edc4694f4ac62bd21991573eef8f3d67b86f147`.

## Changes

- Compact power/truck row replaces the repeated BUILD heading. The scrollable
  catalogue uses the full left height on compact screens, with a visible thumb.
- A bottom-left units icon expands all six field commands. Commands run before
  the compact panel collapses; larger screens retain expanded controls.
- No central construction instruction panel, Preparing narration, routine
  success toast or preparation modal. Selection uses a small card spinner and a
  fresh battlefield frame during native menu setup. Real errors stay inline.
- Native truck cards and minimap sit below the clipped placement view. MAP,
  Select/Move and automatic completion restore the minimap and keep accepted
  orders. The chosen card reflects the active tool; completed rows lose stale ETA.
- Native display-scale tips are suppressed through their saved preferences;
  unrelated notifications are preserved. Research layout and gameplay are unchanged.

## Delivery verification

`delivery-results.json` records the complete relevant journey on this APK from
an ordinary fresh Towers match. No units, research, power or structures were
seeded, and QuickLoad was not used. Real Android taps/swipes drove the controls;
fresh native saves checked engine orders, positions and completed objects.

- Three nearby constructors received two native tower FIFO orders. Green native
  blueprints, duplicate rejection, progress and live remaining time were checked.
  A terrain tap in the former truck-window area issued an actual native order.
- Towers, a 2x2 research facility and a factory module completed. Item changes
  retained queued work. Native pause/resume froze and resumed the ETA.
- Ordinary factory production made a truck and the saved machinegun design.
  A real field tap selected the produced truck; its MOVE order and changed
  native position verified movement after menu returns.
- All Units selected the combat unit. A destination tap produced native PATROL
  order 31. STOP cleared its action and queue; Warzone returned it to idle guard.
  Nearby Trucks, a real BOX drag and Select/Move also passed.
- Design/save, visible Android keyboard/Back restoration, double Build requests,
  repeated Factory/Research/battle returns and lab switching passed.
- Screens and hit targets were checked at 1280x576, 1080x600 and 1600x720.
  The final large-screen screenshots contain no display-scale popup. Another
  real construction completed and automatically cleared placement/restored MAP;
  reopening BUILD showed no stale selection. No captured JS errors or routine
  narration violations occurred. The environment was paused after verification.

Screens include `delivery-live-time-and-queue.png`, `delivery-compact-placement.png`,
`delivery-large-expanded.png`, `delivery-auto-completion-restored.png`, and the
additional painted-screen checks `delivery-designer-final.png`,
`delivery-blueprints-final.png`, `delivery-research-final.png`.

## Checks and limits

The command-page, functional-screen, touch/zoom, native-placement lifecycle and
native-notification preference regressions passed. Clean Gradle build passed.
`engine-preservation.json` confirms identical engine program, WASM, full data
prefix, scenario and 3,282 resolved stock assets. `apk-structure.json` confirms
a 90,769,499-byte valid APK with only a 4,096-byte maximum ZIP gap.

Iteration caught and fixed native widget processing stopping under Tab, compact
controls becoming inert before touch release, stale completion ETA and the
native scale prompt. Test expectations were corrected for Patrol's destination,
STOP's idle guard state and invisible catalogue metadata. An earlier undefended
fixture lost its HQ; this was fixture expiry, not a newly invented game defect.
The delivery pass above was rerun after the implementation stabilized.

Existing Save/Load bridge, software-emulator black terrain, physical-device/HQ,
audio and performance limitations remain in `docs/KNOWN-ISSUES.md`. Placement
renders an extra 232 pixels below the host; physical-device cost is unmeasured.
This is verification of the affected Towers journey, not every campaign, wave,
device or large army size. The tested v5.5 APK/source/checksums remain frozen.
