# Campaign Test v1 — observed coverage

Delivery APK SHA-256: `630c594149860a61c66780933576fcd606cc326cd9704855df9e0cd40cd00b29`.
`delivery-gate.json` compares this hash with the APK installed in the real emulator.
This is an opening-mission test build, not certification of the whole campaign.

## Result

The original graphics/music splash opens Alpha mission 1 directly. The separate
`com.rbabbit.warzonecampaign` package and campaign config directory keep Towers
and its saves separate. The original Alpha/Beta/Gamma assets are present. Fifty-two
mission scripts receive additive mobile hooks; original mission bodies, objectives,
enemy rules and research availability remain intact.

The official compiled engine and WASM match frozen Towers v5.4. Its entire
67,240,144-byte data prefix is preserved. All 3,234 other resolved assets match;
52 campaign scripts match their original bytes plus the explicit include suffix.
The embedder was rerun and appended zero assets. See `preservation.json`.

## Actual emulator observations

- Started from the native splash/START GAME, without a skirmish lobby or Towers
  waves. Original starting state: three trucks and four machinegun units.
- Build opens the available Structures category. Construction used ordinary
  native orders and resources. A command centre, factory and lab were built during
  preparation. On the exact delivery APK, five ordinary trucks built generator
  162725; saved native orders and the completed 500 build points were checked.
- Designed CampaignMG from the original Viper/Wheels/Machinegun parts, typed its
  name through the real Android keyboard and saved the blueprint. The exact
  delivery pass repeated keyboard entry/return and factory/page returns.
- Ordinary production made two machinegun units and two trucks. The final two
  were produced on the exact delivery APK. The visible active/waiting queue and
  native droid IDs were inspected. Total power decreased from 1,300 to 748,
  consistent with structures and units; no free objects or research were seeded.
- Five trucks selected through the native builder cards kept their orders when
  leaving placement, completed construction, then moved after page/keyboard
  returns. Every saved native position changed by more than half a tile.
- Original tutorial windows and Intel pause the game. Mobile pages now reveal
  those native windows; MENU and BACK TO BATTLE close native pauses directly.
  Repeated Intel/Research/Factory returns resumed the simulation and input.
- Native F7 QuickSave and F8 QuickLoad restored the ordinary campaign checkpoint,
  including its buildings, units, research lab and mobile state. This is a focused
  QuickSave/QuickLoad check, not general Save/Load certification.
- The lab is correctly idle with no available topics before artefact recovery.
  The Research screen explains the campaign unlock path and returns normally.
- Inspected 1280×576 and 1080×600 layouts. Stable screenshots and rectangle/hit
  checks show all title/field controls inside the viewport, no overlap between
  the command toolbar and campaign status, zero scroll offsets, and matching
  native framebuffer aspect ratio. See `wide-layout.json`, `compact-layout.json`,
  `wide-battle-stable.png`, `compact-battle-stable.png`, and `compact-research.png`.

## Fixes and fixture corrections during testing

Initial campaign integration exposed a missing preload directory and the
script-relative includeJSON paths. Both were corrected before delivery testing.
Native tutorial pauses could cover themselves with a mobile page; pause handling
and Intel return were corrected and retested. The initial Build category and
empty-research wording were adapted for campaign availability.

The fixture initially chose invalid terrain, points outside the current camera,
and a point covered by the command HUD. It also mixed tile centres with the native
integer centres of 2×2 buildings. Native placement/reachability, actual camera
projection and footprint alignment were inspected; the fixture now checks fresh
native frames, HUD coverage and accurate world coordinates. The successful final
placement is proven by native orders and completion, not by a tap counter.

One failed tap was followed by Android Back with no keyboard open, exiting the
app. The ordinary native save was restored, and subsequent command sequences
stopped on failure and checked input focus/keyboard visibility before Back.
No fifteen-truck fixture was rebuilt. After default tutorial behaviour was
exercised, the original guide's Disable Topic Pop-ups setting was enabled in the
test save for the remaining gameplay checks; that preference is not in the APK.

The first compact screenshot was taken during an ADB density/surface resize and
shows a transient incomplete frame. It is not a passing screenshot. The stable
screenshots and native framebuffer/layout checks were taken after the resize
settled, including after the real keyboard returned.

## Limits

The previously recorded emulator black-terrain issue remains visible. Physical
device appearance, HQ rendering, audio and downloaded music were not newly
certified. The native Intel background does render, but campaign cinematics were
not comprehensively tested.

No complete Alpha/Beta/Gamma playthrough, later mission transition, off-world
transport/home-base workflow or active campaign research after artefact recovery
is claimed. Native combat shot counters were present in the ordinary checkpoint;
the delivery pass did not establish a new shot/kill delta. Shared research sidebar
and queue regression scripts passed, which does not replace an active campaign
research test.

Earlier screenshots/native saves in this directory document iteration and fixture
diagnosis. Use `delivery-gate.json` and the files named above for delivery scope.
