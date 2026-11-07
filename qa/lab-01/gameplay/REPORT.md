# Towers Lab C5 — HTML gameplay journey

Exact installed APK SHA-256:
`6dafb70bff1dfec5614de3403b5e169f8d720c9507c6f612d0000de9ecf5118c`.

The six-phase journey, focused repeated keyboard returns, and selected-Lab-2
witness passed on this same APK. Actual device screenshots are 1080x600,
density 240, system font scale 1, with Standard application controls.
The APK was compared to its installed `/data/app/.../base.apk` before input.
No app source was changed during these checks.

## Observed gameplay

- Ordinary complete native saves were restored byte for byte, including all
  24 map, terrain, visibility and state files. Fresh acknowledgements, native
  unit completion records and lab queues verified the restored contexts.
  No units, power, research or native world fields were granted or edited.
- Actual touches started Cobra in lab 160169, queued Fuel Injection Engine
  Mk3 and removed that waiting topic. Cobra remained active and the other
  three labs stayed idle. A separate ordinary manual-lab checkpoint then
  completed Cobra, unlocked native Body5REC and advanced only lab 160169 to
  its manually queued Fuel topic. Lab 160171 retained Composite Alloys
  (`R-Vehicle-Metals01`); labs 160173/160175 remained idle. Native `struct.json`
  and script queues confirmed these targets and queue advancement.
- Both ordinary factories produced actual native droids: factory 160157
  produced 164513, and factory 160167 produced 164515. Both are Body1REC,
  wheeled01 units; native droid saves confirm their IDs and positions. Five
  waiting jobs were cleared while actual active production continued and
  completed.
- The Factory `SAVE TO PHONE` action saved Design 2, and the Design UI created
  Lab Scout 54626 using Viper/Wheels/Machinegun. Native validation returned
  cost 55 and 275 build points. Both models survived a genuine Lab
  force-stop/relaunch with the private library unchanged byte for byte.
- Blueprint `USE TEMPLATE` revealed its selected Factory card and an actual
  visible, hit-test-reachable Produce action inside the catalogue panel.
- The dock matched native observations during active research (1/4 labs)
  and production (2/2 factories, five waiting jobs). Its collapsed preference
  survived the same genuine restart. Actual dock buttons opened Research
  and Factory, hid behind those pages, and returned afterward.
- Two cycles covered Research/Factory/Design/Queue/Help returns, Android Back,
  native pause/resume and subsequent Build item selection. Three genuine IME
  open/type/Back journeys were observed in total: initial design naming plus
  two focused returns. The name field remained visible, the keyboard was
  visibly open before Back, and native design validation recovered afterward.
- Factory, Design, Blueprints, Queue, Research and Build were captured on the
  real screen. Build catalogue checks covered complete titles/rows at the
  top, after a real Android swipe and at the bottom.

## Actual inspected screenshots

- [Manual active research and waiting topic](lab-research-manual-active-and-queue.png)
- [Native completion and queued advancement](lab-research-completed-native-and-advanced.png)
- [Selected Lab 2, separate catalogue selection](lab-selected-lab2-actual-active-research.png)
- [Real active factory queue](lab-factory-real-active-and-waiting.png)
- [Both factories after native completion](lab-factory-normal-native-completed.png)
- [Blueprint to visible selected Factory design](lab-blueprint-use-template-reveals-factory-design.png)
- [Phone library after process restart](lab-phone-library-after-process-restart.png)
- [Second repeated visible Android keyboard](lab-repeat-keyboard-visible-2.png)
- [Second keyboard return and recovered validation](lab-repeat-keyboard-return-2.png)
- [Complete scrolled building catalogue](lab-layout-build-1080-1.0.png)
- [Actual paused handoff](lab-gameplay-handoff-paused.png)

The active/queued research, Lab 2, active/completed Factory, selected template,
restarted library, keyboard-visible/returned and building catalogue images
above were visually inspected, in addition to the assertions and native saves.

## Records, fixture diagnosis and limits

`lab-journey-all.json`, `lab-journey-keyboard.json` and
`selected-lab2-witness.json` all record `passed: true` and the APK checksum.
Every recorded phase has zero uncaught WebView runtime exceptions. Detailed
native JSON snapshots are retained alongside them; binary fixture arrays were
not duplicated into the journey reports.

The first readiness attempt requested a native state acknowledgement while
the game was already paused, so native timers could not answer. The actual
paused screen and state were inspected. Only the QA helper was corrected to
accept a ready paused baseline and resume before requesting acknowledgements.
The diagnostic record is `fixture-ready-paused-failure.json`; this was a test
readiness error, not a product defect. Subsequent gameplay passed on unchanged
C5 app source and APK.

The original two-model Factory catalogue did not overflow at this Standard
profile (`scrollHeight - clientHeight = 0`), so that initial subcase remains
accurately recorded as inapplicable. A later
[focused real-content scroll check](../scroll-delivery/REPORT.md) passed on the
same exact C5 APK: four genuine UI-saved copies produced overflow, actual swipe
and rerender/Blueprint-return behavior were checked, and only those copies
were deleted afterward. The original two-model library was preserved.

This report does not certify the separate construction journeys on both maps,
wide/enlarged-control profiles, physical-device performance, or a complete
30-round game. The root operator owns the remaining construction/profile
verification. Known software-emulator black terrain remains unchanged.

The emulator was handed back visibly paused on Iron Valley at native time
122002, phone profile 1080x600 / density240 / font1. The currently loaded state
is the complete ordinary manual-lab checkpoint. Lab's private library contains
the two UI-saved test designs. The stable app and its private data were never
targeted by these helpers.
