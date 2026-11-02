# Warzone Towers v4.3 verification

final result: passed

Version 4.3-camera-waves, code 43. Pixel_10_Pro API 36.1 emulator,
WebView 158.0.8127.2, host GPU, audio disabled. Native display 2560x1600,
default WebView 1280x800 CSS. This is not physical Samsung S8 verification.

## Fallback saved first

Before editing, the previous APK and a fresh current-source ZIP were saved to
`C:/timerApp/_backups/warzone-towers-v4.2-before-wave-camera-20261102-212219`.
All 621 archived source files were verified against per-file hashes. The APK
copy was verified byte-for-byte. The folder includes source-manifest.json,
SHA256.json and RESTORE.txt. The delivered v4.2 artifacts were not overwritten.

Fallback APK SHA256:
`8BC71FA91FEC1BD1819813FEA67313708225B31F8A831E45BB3743893628E788`

Fresh fallback source ZIP SHA256:
`F3023EA60601A25E3F7C4E3176FA975332329F2848DAEBB82C53EE43FB50A820`

## Camera and header

- camera-before.json records the v4.2 baseline: real vertical swipes moved the
  native camera, and one direction reached the map boundary near the starting HQ.
  The adapter nevertheless had an incorrect tall-map radar hit area that
  intercepted drags above the actual square minimap; that area is corrected.
- camera-layout-results.json uses native F7 QuickSave metadata (viewDataP and
  viewDataR), rather than only counting dispatched gestures. Real adb swipes
  moved Z from 6885 to 8064, then back to 6798. A vertical swipe above the actual
  minimap moved Z again to 6190, without becoming a radar drag.
- Final two-finger tilt changed native pitch from 58254 to 55276, then 58909.
  X/Z stayed fixed at 1791/6190 and yaw stayed 32768 (south). Native altitude
  can adapt to pitch. No tilt key, camera key or active gesture remained held.
  Browser-dispatched multi-touch exercised the real adapter and native engine;
  these two-finger gestures were not physical tablet finger input.
- Pinch still zoomed and did not leave tilt or pan active. HELP explains the
  gestures and the map-edge limit. The header and wave panel do not overlap at
  1280x800, 1182x532, 1024x768, 900x650 or 642x576 CSS. Compact layouts use a
  94px command area; larger layouts use 50px. Every command remains visible.
- TECH expands to the full host height, then restores the full-width battlefield.
  HELP opens and returns at all test sizes. Both iframe and host remain isolated.
- The preparation dialog initially exposed a startup focus race. Startup facing
  now waits for rendered frames and finishes its native Ctrl+Down chord before
  the dialog can take focus. Two cold starts after this change passed; the final
  build verifies yaw 32768 before any test-only pitch reset.
- top-right-native.png, phone-layout.png, tablet-layout.png, compact-layout.png
  and minimum-layout.png are adb captures. Smaller temporary CDP viewports occupy
  the upper-left of the full emulator surface; unused outside space is test-only.

## Four-minute preparation and actual waves

- preparation-dialog.png shows the real cold-start dialog saying,
  “You have 4 minutes to prepare your defences.” The header displays the live
  countdown. The clock starts at level start, not at construction or dismissal.
- automatic-wave-results.json records a natural countdown, without accelerating
  game time or building any defence or combat unit. Deadline: gameTime 240202ms.
  Wave 1 started at the deadline and finished its four supplied-mod pulses with
  four enemies by gameTime 244202ms; human combat power remained zero.
- An actual adb tap on the top-right Skip Wave button advanced to Wave 2.
  All four survivors remained and four new enemies arrived, giving eight total.
  The controller retained the original roster (181 templates) and entrances.
- These wave rules were validated in a full four-minute run before the final
  camera sensitivity/startup refinements. The rules/data package did not change
  afterward. The final APK's camera, cold start and responsive UI were retested.
- The supplied adaptive spawner uses 0/0 when player combat power and its best
  power are both zero. The custom wrapper temporarily supplies a small power
  floor during spawning for an unarmed player. The original spawner and roster
  files are unchanged, and real player power is restored after every pulse.
- Nine regression scripts passed, including four-minute deadline independence
  from construction, automatic unarmed spawning, Skip Wave survivor retention,
  roster variety through Wave 9, HQ defeat, research, logs, zoom, sticky building,
  tilt cancellation and the radar hit-area correction.

## Preservation and boundaries

preservation-results.json verifies all 3,282 virtual packaged files against
v4.2. Only the custom warzone-towers-waves.js content changed. The complete
official WASM is byte-identical, and engine JavaScript differs only in generated
package offsets/size/UUID. The first 64,641,867 data bytes retain SHA256
`B70E49A50B80DC344414436DA2EE3A37E8347C8311E181F29D70B5E9EFD5290F`.
The supplied original mod/map, selected icon and fullscreen splash remain intact.

Map boundaries still constrain panning. The emulator's pre-existing dark-terrain
rendering remains visible; this release does not claim to solve that separate
issue or prove physical Samsung S8 startup. Native crash logs were empty during
the checks. The existing streaming-WASM fallback still starts the actual game.
