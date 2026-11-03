# v4.8 command-page verification

Final tested APK SHA-256:
`efff0474e805c99be92c23ed77fc6a33d3658bbb0b7689ebe6fa1b4b0d77d4c0`.
The installed APK checksum matches the delivered file; see `installed-apk.json`.

The v4.7 APK and complete source snapshot were saved before editing in
`C:\timerApp\_backups\warzone-towers-v4.7-before-command-pages-20261103`.
That frozen APK's SHA-256 is
`4911ed72f21809327076cc4881dd6139781cba614a9e686150d21bf63fdca87b`.

## Environment and evidence

Pixel_10_Pro AVD, Android 16/API 36.1, Android System WebView 158.0.8127.2,
SwiftShader, `-no-audio`. The primary final extent is a 1280×800 landscape
WebView. An 800×600 compatibility extent was exercised during implementation.
Android touches use adb and CDP Input; screenshots use native screencap.
Native F7 QuickSave evidence is accepted only after the file modification time
changes, and the harness waits for simulation to resume after saving.

The core final passes are `final-matrix-run.log`, `final-design-run.log`,
`final-gestures-run.log`, `final-overlays-run.log`, `final-layout-run.log` and
`final-native-panels-run.log`. These runs are newer than the final APK build.
Older/intermediate screenshots and saves are retained as development evidence.

## Native construction

- `matrix-results.json`: three real battlefield touches queue three jobs for the
  same automatically assigned reachable constructor. The final repeat uses
  tiles (9,38), (8,39), (9,39); a previous final-APK pass also completed (8,36),
  (9,36), (8,38).
- `matrix-automatic-completed.json`: real native structures at those sites with
  `currentBuildPts=400`. This is completion proof, beyond wrapper queue counts.
  The command snapshot records completion event times and assigned workers.
- Occupied/duplicate taps reject without cancelling the chosen item, and the
  footprint turns red (`invalid-site-preview.png`). BASE and all zoom presets
  retain the selected item.
- `matrix-manual-selected-commands.json` and `matrix-manual-six-commands.json`:
  all six starting constructors are selected through native input; their manual
  group takes priority over automatic assignment. The accepted job names six
  workers. STOP clears their pending work (`matrix-stopped-commands.json`).
- Twenty-five simultaneous requests exceed the eight-command file batch; every
  request receives an acknowledgement. The 100-job regression verifies that
  native structure enumeration stays bounded and busy native work is untouched.

## Real designs and factory output

The app-private library survives process and APK restart. Its saved design
reopens, validates in the original engine and edits in place without adding a
duplicate. `final-saved-library.png` shows the saved blueprint with stock cannon
art. Native cost/build points are 120/475.

The same saved design is explicitly queued at two factories: five units at the
first factory, one at the second. The first factory has a real active job and
four waiting jobs in `final-factory-first-commands.json`. Both factories deliver
without one replacing the other's equal-name native template.

`final-produced-units.json` contains actual native tanks 160229, 160231 and
160233. Their native `parts` records identify Body1REC, wheeled01 and Cannon1Mk1.
`design-production-results.json` derives the component records from that save;
these are real manufactured units. Production uses native buildDroid, normal
power/build time and native eventDroidBuilt. Saving creates no free unit.

## Input, overlays and layout

- `gestures-before/pan/pinch/tilt.json`: native camera position and pitch change
  under actual pan/pinch/two-finger tilt. Heading stays unchanged during tilt.
- Minimap taps, touch cancellation and HELP/TECH round trips leave placement
  active and add no accidental construction. `held-build-preview.png` shows the
  visible footprint while the touch is held. The script checks fixed positioning
  and the projected polygon before releasing the touch.
- Six HELP scroll/repeated BACK TO BATTLE and TECH return cycles keep the header
  visible, the frame uninert and input usable (`overlay-results.json`).
- `layout-results.json`: Extra large BUILD buttons, loaded original stock art,
  every header command inside the viewport, no wave-panel overlap, and the
  engine above its minimum dimensions. Size returns to Standard afterward.
- Native player/kill statistics, factory controls and commanders open and return
  through the explicit BACK TO BATTLE control. The header/minimap remain present.

Early harness attempts were discarded after sampling a camera still settling,
running another UI audit into an active test, and reaching the defeated/replay
screen during a long test battle. Final cases run sequentially with a stable-view
wait and fresh preparation for the motion/overlay/layout pass.

## Build and preservation

Fourteen regression scripts pass (`regressions.log`), Android assembleDebug
passes, and apksigner verifies the existing debug/test signing identity
(`apk-signature.txt`). `engine-preservation.json` verifies identical official
engine program/WASM, the full 65,133,558-byte previous data prefix and 3,281
unchanged previous resolved assets. Custom rules/bridge are explicit overrides;
new command/catalogue files are appended. The supplied original mod/map, research
choices, wave roster, launcher art, Music and HQ packs are preserved.

The emulator's pre-existing black terrain remains. The tests do not certify the
physical Samsung tablet's startup, HQ appearance, sound quality, or a physical
frame-rate guarantee. See `docs/KNOWN-ISSUES.md` for the retained limitations.
