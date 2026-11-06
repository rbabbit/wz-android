# Towers v6 Android UI — local delivery verification

The app-owned gameplay interface now uses real Android Views. The old HTML/CSS
presentation is archived outside runtime assets and absent from the APK.
The scoped emulator journeys below passed on the same installed APK; this
report does not claim a complete native engine port or exhaustive gameplay testing.

- Version: `6.0-native-ui`, Android version code `63`.
- APK: `Warzone-Towers-v6.0-Android-UI.apk`.
- SHA-256: `be349d592e4ee77f706b7630c2e4c3b27a9017aab1be62085432e27f746bb923`.
- Editable source: `warzone-towers-v6.0-android-ui-source.zip`.
- Machine-readable scope and required reports: [final/summary.json](final/summary.json).
- Original source baseline: `453d034914d5ca6e570eb077e1308efb7878d77f`.
- Work and delivery cover Towers. The cancelled 1v1 prototype is not part of this project.

## What changed and what remains in the engine

Android owns the header/wave/Skip controls, field commands, Build catalogue,
Research, Factory, Design, persistent blueprint library, Orders, Help, interface
size, pickers, confirmations, keyboard fields and touch/transition feedback.
Native diagnostics identify actual Java view classes and measured bounds;
WebView accessibility node names are not used as proof of a native interface.

The official battlefield, radar, engine messages, green construction blueprints
and original pause/save/load, statistics and commander menus remain engine
rendered through WebView/WASM/WebGL. JavaScript still transports engine data
and input. See [the full boundary](../../docs/NATIVE-ANDROID-UI.md).

The baseline reproduction and issue/check list were recorded before editing in
[PLAN.md](PLAN.md), with the actual v5.12 screens/native state retained in this
directory. Related changes address stable list identities and action geometry,
manual per-lab queues, selected-factory production, keyboard focus, saved design
IDs, session/navigation guards, input ownership and acknowledgements. Consumed
transport requests become inert JSON files, preventing old commands from
replaying after a load while keeping the native file poller operational.

## Test environment and fixtures

All emulator evidence uses the owned `emulator-5556`, AVD
`Warzone_Help_QA_220604`, with Normal graphics and audio disabled. Three profiles
were inspected: 1080×600 at 240 dpi/system font 1.3; 2400×1080 at 240 dpi/font 1;
and 2400×1080 at 420 dpi/font 1.3. App interface sizes Standard and Extra large
were exercised. Larger pages/list contents scroll while controls retain 48dp
minimum touch height.

Iron Valley tests reuse complete ordinary native QuickSaves containing the
authored six trucks, four labs, two factories and two normally produced MG tanks.
The research fixture contains manually assigned Cobra/Fuel and Composite
queues. No units, power, completed research or edited native saves were granted.
Dustfall starts fresh with its four authored trucks, two labs, two factories and
raised building platforms. Terrain height, footprints, selected IDs, reachable
sites and actual placement previews are checked before world taps. Simulation
progress, acknowledgements and native completion gate the journeys.

The result/replay test uses an explicit **UI result-callback fixture**. It is
not a native victory. Two-finger pinch/tilt uses CDP dispatch into the actual
WebView; it is not a physical touchscreen test. Complete native save restores,
saved-file hashes and exact saved wave/lab queues are recorded in
[checkpoint-restores.json](final/checkpoint-restores.json).

## Observed checks on the delivery APK

Every required report has `passed: true` and the APK hash above. The 23-report
set includes the following journeys and package checks:

| Area | Observed result and evidence |
| --- | --- |
| Phone layout and rapid research | All four header actions reachable; enlarged queue removal controls retain full touch height; rapid Cobra/Fuel input selects the intended topics; action bounds stay fixed. [Layout](final/audit-phone-layout.json), [removal/rapid input](final/audit-remove-research.json). |
| Manual labs and completion | Exact selected-lab queues, independent idle labs and topic removal/re-addition; Cobra naturally completes, unlocks its native component and advances only that lab to Fuel. Lab picker/action positions remain valid through the update. [Assignment](final/audit-research.json), [completion](final/audit-native-research-completion.json). |
| Production | Two normal factories produce actual MG tanks. Quantity-five waiting work can be cleared while active production continues. [Report](final/audit-production.json). |
| Design, keyboard and persistence | Native component choices/validation; same-ID edit, new-ID copy, cancel/delete; seven observed IME returns, with 42 verified four-character input batches; blueprint IDs/search survive process restart and a new battle. Per-page filters stay independent; replay resets battle filters/quantity and ignores old-session callbacks. [Editor](final/audit-editor.json), [lifecycle](final/audit-native-lifecycle.json). |
| Engine menus and returns | Repeated page/Back/statistics/commander/Orders returns; real Skip Wave creates native enemies. Actual engine pause/load restores the saved Fuel queue in native state and Android presentation after rewinding the clock. Subsequent complete QuickSave restores return to saved wave zero without replaying Skip. [Menus/load](final/audit-native-menus-pause-load.json), [returns](final/audit-native-returns.json). |
| Selection, movement and camera | Nearby three/all six trucks; exact three-unit Box selection; normal tank movement and arrival; accepted queued destinations and completion; Patrol followed by normal Move; scoped Stop; Queue/Combat/Patrol/Box on/off; camera presets, Base, pan, radar, pinch and tilt; input release and inert acknowledged requests. [Toggles](final/audit-native-field-toggles.json), [field](final/audit-native-field.json), [gestures](final/audit-native-gestures.json). |
| Iron Valley Build returns | Immediate first choice, fresh acknowledgement on reselection, caption blocks field taps, More/category Cancel, map/radar return and preserved accepted orders. Two MG bunkers and a guard tower complete at their native sites. [Report](final/audit-native-build-returns.json). |
| Fresh Dustfall | Actual raised terrain and reachable builders; guard tower and 1×2 cyborg factory complete; normal tank and Heavy Gunner Cyborg production completes. [Report](final/audit-native-td1.json). |
| Enlarged/narrow layout | Research/Factory/Design and header/save/back controls checked at the 914dp profile. Returning to narrow density preserves all header actions. The 48dp READY control activates a real guard tower at native site (7,72), with aligned touch feedback and observed completion. [Screens](final/audit-screens.json), [narrow Build](final/audit-native-narrow-build.json). |
| Transport and exact package | All five request files are present, valid JSON and contain no actionable old request; paused read-only state queries are allowed. Actual Android classes are packaged, former HTML/CSS interface files absent, and all 455 editable assets match the APK. [Transport](final/native-transport-files.json), [package](final/native-package.json). |
| Rules, build, engine and fallback | Six active bridge/input/result/terrain/rules/Stop checks pass; clean-build APK matches installed hash and runtime sources. Official engine program/WASM and original resources remain preserved. Fallback hashes and signing certificate match. [Modules](final/active-module-checks.json), [source/build](final/source-build-match.json), [preservation](final/engine-preservation.json), [signature/fallback](final/signature-and-fallback.json). |

The rules harness covers 30 rounds and 2,526 configured enemies. This is a pure
rules check, not a 30-round native endurance run. The complete delivery journey
was resumed from prepared states between focused phases; passing unrelated
phases were not repeatedly rerun after fixture-only corrections.

## Actual screenshots

- [Research with manual active/waiting topics](final/audit-native-research-active-and-waiting.png)
- [Factory production on two normal factories](final/audit-native-production-two-factories.png)
- [Android Design and pinned save controls](final/audit-native-design-validated.png)
- [Persistent edited blueprint library](final/audit-native-library-edited-and-persistent.png)
- [Native load with restored research queue](final/menu-loaded-research-queue-restored.png)
- [Narrow READY control and real placement](final/narrow-build-actual-native-placement.png)
- [Dustfall completed construction](final/td1-native-both-structures-completed.png)
- [Dustfall normally produced tank and cyborg](final/td1-native-normal-tank-and-cyborg-completed.png)

Partial rows at list edges are scroll positions. These are emulator captures of
the installed app, not generated mockups. The black field terrain is the existing
software-emulator renderer limitation and remains visible in the evidence.

## Preservation, diagnosis history and limits

The official engine program is identical after normalizing the asset index;
WASM is byte-identical. The full original 68,509,966-byte data prefix is retained.
The new 68,770,034-byte bundle appends the custom command adapter with one
read-only lab-queue snapshot field. All other custom scenario/rules bytes and
3,273 resolved original assets are unchanged. The entire data bundle is therefore
not byte-identical to v5.12.

Earlier failure JSON/screenshots and other `qa/native-ui` evidence directories
are deliberately retained as diagnosis history. They include superseded builds
and fixture failures. Fixtures were corrected for load-reset generations,
reordered lab arrays, actual unit positions/terrain, real dialog/IME readiness,
ADB text-batch delivery and an already-occupied test site. They are not unresolved
product defects. The required current-hash reports in `final/summary.json` define
this delivery result; earlier failures are not silently counted as passes.

Remaining limits are physical-device GPU rendering, audio, FPS/performance and
a full native 30-round playthrough. The software-emulator black terrain is not
fixed. Private Android blueprint storage survives battles/process restarts and
updates, but uninstall/app-data clearing removes it; there is no export feature.

The preserved v5.12 APK/source and backup remain intact. Both APKs have the
same verified certificate; [restore/update instructions](../../docs/NATIVE-UI-RESTORE.md)
explain how to retain private storage. Source packaging excludes signing keys,
SDK-local settings, build caches and ephemeral CDP endpoints. The source archive
is checked against the repository SHA-256 file manifest and ZIP CRCs. Delivery
is local; no release upload or repository push was performed.

After verification the app was paused/synced, the emulator profile returned to
2400×1080/density 240/font 1 and the app was left on its actual startup screen,
with Standard interface size and no active battle left running. See
[environment-restored.json](final/environment-restored.json).
