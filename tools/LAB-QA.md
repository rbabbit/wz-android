# Towers Lab gameplay verification

These helpers target only `com.rbabbit.warzonetowers.lab`. They refuse a stable
package override, refuse launching/stopping another package and require Lab to
be the resumed Android Activity before sending device input. The v6.4 source
project and stable app are not test targets.

`native-live.cjs` uses `WZ_QA_DEVICE` (default `emulator-5556`),
`WZ_QA_PACKAGE` (must be the Lab ID), `WZ_QA_CDP_PORT` (default `9256`) and
`WZ_NATIVE_QA` (default `qa/lab`). Set a distinct evidence directory for each
candidate. Temporary WebSocket endpoints are neither written nor logged.

The root operator owns installation, emulator profile changes and the first
launch. Once the exact candidate is running on Iron Valley, use:

```
node tools/lab-journey.cjs research --apk C:/path/to/exact-candidate.apk
node tools/lab-journey.cjs research-completion --apk C:/path/to/exact-candidate.apk
node tools/lab-journey.cjs production --apk C:/path/to/exact-candidate.apk
node tools/lab-journey.cjs designs --apk C:/path/to/exact-candidate.apk
node tools/lab-journey.cjs returns --apk C:/path/to/exact-candidate.apk
node tools/lab-journey.cjs layouts --apk C:/path/to/exact-candidate.apk
```

`all` runs those phases once in that order. `--start` explicitly starts Lab and
taps its accessible Iron Valley Play control first. Each phase compares the
installed APK's actual SHA-256 to `--apk`, `WZ_QA_APK`, the local debug candidate,
or an explicit `WZ_QA_EXPECTED_APK_SHA256`. Successful journeys leave the native
simulation paused. A failed phase records the actual screen and native state,
attempts bounded recovery and stops; it does not repeat the failing fixture.

## Ordinary prepared states

- `qa/v6.1-compact/final/checkpoints/td2-normal-early.json`: complete 24-file
  ordinary native QuickSave at simulation time 26302, four labs, two factories,
  six authored trucks and two normally produced vehicles. Used for manual
  research queue editing, normal production, templates and custom designs.
- `qa/v6.1-compact/final/checkpoints/td2-manual-labs.json`: complete native save at
  time 112802. Lab 160169 has Cobra active and Fuel Injection Engine Mk3 queued;
  Lab 160171 has Vehicle Metals active; labs 160173/160175 are idle. Used to
  observe real completion, unlocks and manually queued advancement.
- `qa/v6.4-build-display/ordinary-eight-site-fixture.json`: complete ordinary
  Iron Valley save at time 23002 with eight accepted tower sites. Used by the
  adapted build-display audit. It reads the frozen fixture and baseline from
  `qa/v6.4-build-display`, independently of the new output directory. Override
  with `WZ_QA_BUILD_FIXTURE_DIR` only for a separately validated complete save.

The restore helper validates binary map/terrain/visibility files and hashes
when recorded, creates a genuine native QuickSave slot with F7, writes the
complete unchanged fixture, performs one F8 and requires a fresh canonical
native state acknowledgement, actual truck/factory IDs and restored queues.
No units, power, research or partial native world fields are seeded.

## Evidence and scope

Actual UI actions use Android touches at observed DOM geometry. CDP observes
queue acknowledgements, lab targets, unlocked parts, native clocks and rendered
frames. Genuine F7 saves prove actual native research targets and produced
droid IDs/positions. Phone designs and factory templates are saved through UI
and verified after a real Lab force-stop/relaunch. The old app's private library
is not copied or changed.

Run construction audits separately using the adapted Lab identity helpers.
For Dustfall, use a fresh authored start with platform trucks 160001/160003;
the existing TD1 audit verifies tower and factory completion, a 1x2 factory
footprint and raised terrain height. Do not restore Iron Valley fixtures there.

For screen passes, verify actual screenshot dimensions at wide 2400x1080 and
phone 1080x600 (the emulator's `wm size 600x1080` produces the latter in this
landscape app), density 240 and font scale 1 / 1.3. `layouts` records the real
PNG size and WebView viewport, captures every relevant HTML panel and checks
full building catalogue rows after actual swipe/scroll settling. Inspect the
screenshots, including activity dock, clipping, selected/disabled states and
touch return behavior; a successful script is not a substitute for inspection.
