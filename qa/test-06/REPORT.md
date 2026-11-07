# Warzone Towers 0.6 — truck groups and Android Back

APK SHA-256: `fd136c8dcfd8caf52b616348b86245c657136b6ebd160da987d693b5a142bce4`.
Package `com.rbabbit.warzonetowers.lab`, visible name Warzone Towers, version 0.6/code 6.

## Reproduction and changes

On the original 0.5 APK, two authored Dustfall trucks (160001/160003) received a
tower at 8,71. After a real minimap move to the other base, the same active item
at 32,18 still queued those two distant trucks. Local truck 160005 was visible
and idle. The old Android Back path sent native Escape, showing the stock pause
menu confirmed in the supplied screenshot and emulator reproduction.

The custom placement path now refreshes visible constructors once after camera
intent changes and synchronizes current-view manual native selection. A changing
or empty view fails safely without a global-worker fallback. Native automatic
BOX replies are distinguished from manual selection intent. Every accepted job
retains its copied worker IDs; selection does not cancel/rewrite earlier jobs.

Android Back retains panel, keyboard and active-tool closure priorities. From
ordinary gameplay it opens a native **Return to main menu?** confirmation with
**Cancel / Return**. Cancel keeps the battle and restores input; Return retires
the old session, persists its existing config/saves, and opens the original
map/start menu directly. Session guards and dialog cleanup cover repeats and
late callbacks. The dialog blocks touches while simulation continues.

## Exact-APK checks

All checks below passed on the installed APK identified above, on emulator-5556:

- First-area tower used 160001/160003. Without re-opening BUILD or choosing a
  different item, the second-area tower used local truck 160005. Earlier worker
  IDs remained unchanged.
- A Factory Module stayed with 160005 behind its tower; after returning to the
  first area, a Research Module used 160001/160003. Both towers reached native
  300 build points, both module parents reached 500 points/module1, and each
  group's tower completed before its module.
- An actual native single-truck selection after choosing an item sent the next
  Tank Trap order to 160001 alone. That ordinary native job completed.
- Factory, Help, Research and Build Back returned without a menu confirmation.
  The real Android keyboard dismissed before the Design page closed.
- Three confirmation cancellations passed (two Cancel button touches and one
  Android Back dismissal), with usable native input/time afterward. Queue then
  opened normally. Return opened the original main menu directly.
- A fresh battle started with a new session, advancing native time, its own
  working confirmation/Cancel, unchanged phone design library and byte-identical
  previously created native QuickSave gam.json.
- Fourteen focused source regressions passed, including camera selection,
  manual/cleared groups, late native events, module placement, BOX/input modes,
  lifecycle and returns. Twelve actual screenshots were manually inspected.

`DELIVERY.json` binds the four required aggregate reports. The emulator report
hash-binds the three raw gameplay reports. These are focused checks for this
change; the previous complete 0.5 engine/preview evidence remains historical.

## Fixture notes and limits

The live construction journey used fresh authored Dustfall trucks and real ADB
catalogue, minimap and world/mesh touches, without grants or native world edits.
The single-truck check reused those actual completed units and the purpose-built
native selection-click API, then used real ADB construction input.

Two QA assumptions were corrected without changing APK bytes: a blank native
ground click preserves selection rather than clearing it, and an unopened Help
overlay may not exist. Their failed fixtures are preserved in the iteration
folders. The valid one-truck order was retained and its real completion checked;
manual-clear safety remains source-test coverage. A read-only package verifier
also needed its single-DEX assumption corrected: MainActivity is in classes3.dex.

An existing public main-loop pause API was tested and rejected because it
triggered the app's engine-exit lifecycle. No pause/resume API calls were included
in the delivered menu implementation, and no compiled engine was changed. The
confirmation is input-blocking, not a new simulation pause. The emulator was held
between fixtures with its established QA-only native Escape control; successful
Android Back confirmation screenshots show the delivered path instead.

The emulator's existing black terrain limits ground-texture visual checks.
Physical devices, every structure, Iron Valley gameplay and full 30-wave balance
were not replayed for this focused change. Shared selection/source checks and
byte-identical native/maps/mod preservation are recorded separately.

## Preservation

The 0.5 APK, complete source ZIP and checksum file were copied and hash-verified
before edits in `C:/timerApp/fallbacks/towers-before-truck-back-fix-20261107`.
Twenty frozen/original/copied artifacts match. Stable v6.4 remains clean at
`9280cccad984320503240d9a39e7d766646c1dfe`, with all 4,916 manifest files verified.

Only MainActivity, three custom JS assets and version metadata changed in the
runtime source. All 463 packaged source assets match the candidate. The compiled
JS/WASM/data, native source provenance, stock assets, icon, supplied maps/mod,
wave rules and compact CSS/layout match 0.5 exactly. No engine rebuild was used.
Install the APK as an update to retain the experimental app's data.
