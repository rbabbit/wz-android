# Warzone Towers for Android

## Current development revision: Warzone Towers 0.84 (version code 84)

**Development revision: 0.84 (84)** restores the original black landscape Home
and applies the approved compact native Campaign, Towers, FFA and Multiplayer
landing pages. Towers/FFA place real map previews beside compact settings and a
fixed Play/Start action. The native Multiplayer list reuses the existing official
room parser, refresh and Join paths. Campaign download/readiness behavior,
Guide/Hub, waiting room, games and engine assets are retained. Delivered v0.83
APK/full source remain the fallback. Exact-APK checks passed for normal/compact
menus, native profile/filter/Refresh, private bot Join/Ready/return and retained
Towers input/resume; see the [0.84 notes](docs/releases/0.84-native-landings.md)
for the bounded fixture and inherited emulator terrain limitation.

## Historical development revision: Warzone Towers 0.83 (version code 83)

**Development revision: 0.83 (83)** implements the selected blue portrait Home,
with illustrated Campaign, Towers, FFA and Multiplayer cards, compact Guide/Hub
buttons and the existing research tagline. Destinations and games stay landscape;
Back restores portrait Home. The v0.82 APK and complete source remain the fallback.
Exact-APK ADB checks cover all six routes, small/enlarged-text layouts, retained
Activity/game state, Research and touch camera input. Existing emulator terrain
rendering remains limited. See the [0.83 notes](docs/releases/0.83-portrait-home.md).

## Historical development revision: Warzone Towers 0.82 (version code 82)

The mode splash gains the exact small research/build/upgrade tagline above its
existing art and six buttons. Multiplayer observers retain rendering/camera
access while player-owned research, manufacturing and orders remain disabled.
The private native owner VM no longer runs against a reserved spectator slot.
Official network protocol/data, simulation and other modes are unchanged.
The v0.81 APK/full source and all older fallbacks are preserved. The exact
installed APK passed scoped pre-start observer match/frame/camera/read-only and
return checks, normal-player menus/selection/pan and Home layout checks. See the
[0.82 notes](docs/releases/0.82-multiplayer-spectator.md).

## Historical development revision: Warzone Towers 0.80 (version code 80)

Multiplayer keeps one roster/chat/Ready room while typing. Chat/roster scrolling
retains its reading position, native map previews cover built-in and downloaded
maps when the room permits them, and room buttons reuse the existing Warzone
click/mute policy. The room's normal-density keyboard bounds are separate from
the unchanged game viewport. Exact-APK observations are recorded separately from
host simulations under `qa/multiplayer-room-080/`; see the
[0.80 notes](docs/releases/0.80-multiplayer-room-polish.md). The v0.79 APK/full
source and every older fallback remain preserved. The exact installed candidate
passed private-host inline typing/Send, list scrolling, keyboard restoration,
built-in/downloaded map previews, click PCM/mute and actual match movement,
Stop/Deselect, camera and Back/return checks. Physical speaker audition and a
full public match remain outside this scope.

## Historical development revision: Warzone Towers 0.79 (version code 79)

Multiplayer uses the compact roster/chat/Ready waiting room, with native team
and spectator permissions and generation-fenced loading/Back behavior. This is
an isolated Multiplayer change; Towers, Campaign, FFA, shared Research/Design,
maps, music, saves and the official network protocol/data remain unchanged.
The exact installed APK passed private-host room layout, chat/Ready, team and
spectator requests, keyboard/Back, rejoin and match-entry/input checks. These are
separate from host simulations; consult
[0.79 notes](docs/releases/0.79-multiplayer-room.md) and the retained
`qa/multiplayer-room-079/` evidence for scope and untested cases. The complete
v0.78 APK/source and every older fallback remain preserved.

## Historical accepted version: Warzone Towers 0.6 (version code 6)

The user selected this edition as the current version on 7 November 2026.
The exact tested APK is retained, including its existing application ID and
private saves/designs. Development continues from this source on `main`;
previous releases and the separate v6.4 project remain preserved fallbacks.
See [the current release](https://github.com/rbabbit/wz-android/releases/tag/v0.6)
for the unchanged APK, complete source ZIP and checksums.

Version 0.6 fixes cross-area truck assignment and Android Back/menu routing.
New build orders use the current visible/manual group, preserving earlier job
workers. Back closes panels/keyboard first, then shows **Return to main menu?**
with **Cancel / Return**. Return goes directly to the original start screen.
The confirmation blocks input while simulation continues. The compiled engine,
data, original icon, maps/mod and compact layout are unchanged from 0.5.

The exact APK passed the focused emulator journey, 14 source checks, package/
preservation verification and inspection of 12 screenshots. Details and limits:
[0.6 report](qa/test-06/REPORT.md). The complete pre-change 0.5 fallback is in
`C:/timerApp/fallbacks/towers-before-truck-back-fix-20261107`. Stable v6.4 remains
untouched. Install as an update to keep experimental saves/designs.

## Historical experimental edition: Warzone Towers 0.5 (version code 5)

Version 0.5 fixes the ordinary building preview renderer, mixed module highlight
painting, stale previews, unchecked placement feedback and terrain-height caches.
The matching 4.7.0 engine is rebuilt from preserved source for a scoped queued
blueprint centre correction. Actual orders/foundations, data, maps/mod, wave rules,
original icon and compact layout retain their existing behaviour. The separate
application ID remains `com.rbabbit.warzonetowers.lab`.

The exact APK passed nine relevant emulator phases, 26 source checks, native
build/provenance verification and review of 40 screenshots. See
[the 0.5 report](qa/test-05/REPORT.md) for the APK identity, observed native
construction/production/save results, QA readiness correction and limitations.
The emulator's existing black terrain limits ground-texture/slope visual checks;
physical Android devices were not tested. The complete pre-change 0.4 APK/source/checksum fallback is in
`C:/timerApp/fallbacks/towers-before-preview-fix-20261107`. Stable v6.4 is untouched.

## Historical experimental edition: Warzone Towers 0.4 (version code 4)

The separate application ID remains `com.rbabbit.warzonetowers.lab`. Version
0.4 adds module guidance, real parent-building outlines and roof/body hit
testing, capacity feedback, accepted-preview cleanup and a persistent module
tool. The custom command bridge validates actual parent IDs and queued module
capacity, including a factory's second level. The compiled engine, authored
maps, supplied mod and wave schedule are retained.

The exact 0.4 APK passed all seven scoped integrated emulator phases, 23 source
regressions, package/source checks, visual review and preservation checks.
Actual native module completion, normal production/construction, genuine
save/load and repeated input/menu returns were observed. See [the current
README](README.md) and [0.4 report](qa/test-04/REPORT.md) for the exact APK hash,
two QA readiness corrections and verification limits.

Those historical checks missed an ordinary building renderer exception and the
native queued-blueprint half-tile mismatch discovered in the later structure
audit. Version 0.5 addresses these with direct actual-renderer coverage and a
source-built native visual correction; 0.4 remains a frozen fallback.

The complete 0.3 APK/source fallback is frozen in
`C:/timerApp/fallbacks/towers-before-module-ui-fix-20261107`. Stable v6.4 remains
separate and untouched. Delivery filenames are `Warzone-Towers-0.4.apk`,
`warzone-towers-0.4-source.zip` and `Warzone-Towers-0.4-SHA256.txt`.

## Historical experimental edition: Warzone Towers 0.3 (version code 3)

The separate application ID remains `com.rbabbit.warzonetowers.lab`. Version
0.3 removes visible TEST wording and changes selection used by BUILD/TRUCKS
and module placement. The old tile-centre projection could miss trucks after
they moved; selection now verifies real native constructor IDs. The exact
delivery APK passed 20 source checks, package/preservation checks and all eight
integrated emulator phases, including original-save reproduction, modules and
genuine save/load, mixed selection/construction/FIFO, wide/compact layouts,
twelve paused returns, keyboard and real Quit/new-battle recovery. No compiled
engine or scenario rules are changed.
See [the current README](README.md) and [0.3 report](qa/test-03/REPORT.md).

The pre-change APK/source fallback is frozen in
`C:/timerApp/fallbacks/towers-before-module-fix-20261107`. Stable v6.4 remains
separate and untouched. Delivery filenames are `Warzone-Towers-0.3.apk` and
`warzone-towers-0.3-source.zip`.

## Historical Test 02: 0.2-test (version code 2)

Test 02 was the separate test edition of Warzone Towers v6.4, with Android
application ID `com.rbabbit.warzonetowers.lab`. It updates the previous Towers
Lab test installation and keeps its private saves and templates. The stable
v6.4 app (`com.rbabbit.warzonetowers`) and its source/APK remain separate and
untouched.

The compact battle interface uses HTML/CSS over the official Warzone engine
compiled to WebAssembly. The original icon and familiar wording are restored.
Test 02 changes truck selection, battle-menu/exit cleanup and Dustfall's starting
camera view. All ten integrated emulator phases passed on that version's exact
APK, including native save/load, real Quit/recovery and Dustfall. The final
delivery gate passes all 18 required reports and 12 scoped checks. See
[the historical Test 02 report](qa/test-02/REPORT.md).

The initial test APK and complete source ZIP are preserved with checksums in
`C:/timerApp/fallbacks/towers-test-before-fixes-20261107`. The unchanged supplied
Tower Defense mod and both offline maps remain in this project. Sections below
retain historical implementation and provenance notes; older verification
results do not certify Test 02.

## Historical content provenance

- Supplied archive: `vendor/survival/original/survival_mod.zip`
- Supplied archive SHA-256: `D347F71B21EEE245B0AC5FA899F52F46897AD2198F7B337148754EFB23D0A937`
- The map descriptor identifies the map as CC0 and credits `arc`.
- No separate licence metadata was found for the Survival Mod. Confirm redistribution permission before publishing this package publicly.

## Engine preservation

The original data payload is retained byte-for-byte at the beginning of
`warzone2100.data`. Custom scenario, map, mod and bridge files are appended.
The Emscripten package index exposes those files and a redirected `addon.lev`.
Version 0.5 keeps the complete existing data file and all 3,849 package-index
entries unchanged. It rebuilds the matching 4.7.0 engine from source with nine
visual-position lines in `renderBuildOrder`, aligning queued blueprints with
their native foundations. Real orders, module parents, foundation placement,
height rules and line building retain their native implementation. The source
archive, patch, pinned build recipe and runtime provenance are included under
`archive/` and `tools/`. Earlier editions through 0.4 used the original compiled
engine without this correction.

The generated compatibility copy of the supplied level descriptor omits three obsolete WRF references that are absent from the packaged Warzone 4.7 web dataset. The original supplied archive remains unchanged in `vendor/survival/original`.

## Build

Use Android Studio's bundled JDK and run:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'C:\Users\punke\AppData\Local\Android\Sdk'
.\gradlew.bat clean assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`. A Play Store upload requires a release build signed with the owner's private upload key; the included APK is debug-signed for direct testing only.

Configure these environment variables for the local machine. SDK settings,
`local.properties`, signing keys and build caches are excluded from the source
archive.

## Historical version: 4.5-graphics-choice (version code 45)

Startup offers Normal or High Quality over the existing splash illustration.
Normal requires no extra download. High Quality downloads the official,
unmodified 99,639,408-byte terrain/water pack from the owner's VPS. It supports
cancel/resume, SHA-256 verification, retry, a Normal fallback and offline reuse.
The choice is remembered between launches. This is a terrain/water upgrade;
it does not add replacement tank models or automatically alter gameplay.

Actual engine startup used terrainMode=2 and read 42,113,022 bytes from the
optional archive. Both Normal and cached High Quality reached the battlefield
offline. The emulator still has its pre-existing black terrain issue in both
modes, so visual improvement and the physical Samsung tablet are unverified.
Full evidence: `qa/v4.5/graphics-qa.md`.

## Version 4.4-help-return (version code 44)

HELP's BACK TO BATTLE action explicitly restores the header, viewport and input
focus. The help overlay blocks the battlefield while open and restores previous
interaction state when closed. The host cannot scroll its header out of view.
Six actual touch/scroll/return cycles passed on the new APK, with the last three
also checking native zoom acknowledgements and real panning after every return.
The native Build menu opened afterward. See `qa/v4.4/help-return-qa.md`.

A fresh verified v4.3 fallback was saved before edits. The complete engine
JS/WASM/data, wave rules, supplied mod/map, icon and splash are unchanged.
The exact device-specific disappearance was not reproduced on the emulator;
physical tablet confirmation is still required.

## Version 4.3-camera-waves (version code 43)

- The previous v4.2 APK and a fresh source snapshot were saved and verified
  before edits in `_backups/warzone-towers-v4.2-before-wave-camera-20261102-212219`
  beside this project. The fallback includes SHA256 hashes and restore notes.
- Wave status and Skip Wave sit at the top-right of the command header, above
  the battlefield and its native notifications. Compact screens use two rows.
- Vertical panning is verified against native QuickSave camera coordinates.
  The touch adapter uses the square radar's actual bounds; drags above it pan.
- Two-finger vertical movement tilts the camera through native pitch bindings;
  it leaves heading and map position alone. Pinch remains zoom. HELP explains it.
- A preparation dialog says, “You have 4 minutes to prepare your defences.”
  The countdown starts at match startup, independently of construction or unit
  production. Wave 1 then spawns real supplied-mod units even for an unarmed
  player. Skip Wave works during preparation and keeps survivors in later waves.
- Original Warzone code/WASM/assets and the supplied map/mod are preserved.
  Only custom wave rules and Android/browser wrapper files changed. Generated
  package offsets redirect the custom rule; official engine code is untouched.

See `qa/v4.3/` for camera, layout, natural countdown and preservation evidence.

## Version 4.2-fullscreen (version code 42)

The battlefield uses an actual full-width engine viewport below the command row,
without finished-frame scaling or grey side gutters. The loading image uses a
panoramic adaptation with native CENTER_CROP, filling the display without
stretching. Original launcher artwork remains unchanged. See `qa/v4.2/`.

## Version 4.1-artwork (version code 41)

The selected first green-field image, **Grassland Defence**, is now the launcher icon and loading-screen artwork. The original is retained unchanged as `app/src/main/res/drawable-nodpi/warzone_branding.png` (SHA-256 `44C3EA0942A7C31A49C5A5C9510414191FF06137C0B67089364593C66319D8C2`). No image regeneration or game-engine asset replacement was performed.

Adaptive/round launcher resources keep the artwork within Android's central safe zone. Android 12+ uses the branded icon during its system launch screen. The engine loading overlay displays the complete square image with FIT_CENTER, a dimmed softly blurred extension behind it on supported Android versions, and a compact bottom progress/status strip. Loading taps are consumed by the overlay so they cannot disturb the covered native lobby. Failure messages remain readable in the status strip.

The change is limited to Android branding and its loading overlay. The engine JS/WASM/data, supplied map/mod and gameplay wrapper scripts remain the same as v4.0. See `qa/v4.1/` for native emulator screenshots of the actual launcher, loading artwork and gameplay after reveal. Physical Samsung S8 confirmation remains pending.

## Version 4.0-towers (version code 40)

- Minimal Tactical command rail with local [Phosphor Bold icons](https://github.com/phosphor-icons/core) and [Oswald](https://github.com/google/fonts/tree/main/ofl/oswald), including MIT/OFL licences under `app/src/main/assets/warzone/ui`.
- Scrollable HELP explains +Q, repeated defence placement, Skip Wave, command-centre defeat, camera gestures, commands and research, with CLOSE/BACK TO BATTLE exits.
- +Q arms sticky mode without holding Ctrl over the first defence selection. Menu taps remain unmodified; world placements restore native Ctrl. STOP exits sticky mode before issuing its command.
- The map starts facing south once behind the splash. BASE and waves preserve that direction. The gear is hidden through supported `optionsButtonVisibility=0` configuration.
- The full native frame fits below the command rail, keeping native messages readable. Uniform scaling preserves aspect ratio and touch mapping; repeated resizes do not shrink the frame. Page-level zoom is locked, while game pinch remains available.
- The compact wave panel shows plain hostile counts and Skip Wave. It moves temporarily below research notifications when needed.
- Both log consumers now read appended bytes instead of repeatedly copying historic logs exceeding 26 MB. Partial JSON/UTF-8 and truncation are handled.

See `design-qa.md` and `qa/v4/` for final evidence. Real adb touches checked truck → +Q → one defence selection → three placement taps, completed armed defences, and six Skip Wave commands through Wave 6. The camera stayed south-facing. Wide/compact/tablet layout, HELP scrolling, real swipe, live synthetic pinch/BOX, zoom acknowledgements and research return were checked. Physical Samsung S8 testing remains pending.

The complete engine `.js`, `.wasm` and `.data`, plus all 32 supplied extracted mod files, match v2.2 byte for byte. Official data-prefix SHA-256 remains `B70E49A50B80DC344414436DA2EE3A37E8347C8311E181F29D70B5E9EFD5290F` (64,641,867 bytes).

Run the existing wave/spawner/AI/objective/camera/research/zoom tests, `test-touch-zoom.cjs`, and `test-wave-log-reader.cjs`. The latter checks both incremental log consumers, archived bytes, partial UTF-8/JSON, truncation and file closure.

## Version 2.2 changes (historical)

- Native build-menu taps stop combat-selection modes and release the Ctrl queue modifier throughout menu navigation; the next world placement restores it. Clicks span a rendered engine frame so short input pulses cannot disappear during slow frames.
- Skip Wave calls the next numbered wave immediately and preserves survivors. Survivors are excluded from the next round's spawn budget so the new wave still arrives.
- The supplied minute-indexed roster advances one step per wave from the map's starting research tier. Player research can lead this frontier; no research is granted to the player.
- A separate Towers AI prioritises reachable command centres, leaves moving/firing orders alone, and retries stalled units against nearby blockers. Empty aircraft retain the supplied mod's `(1,1)` despawn route.
- Losing the player's command centre stops wave spawning, invokes the engine's defeat state, and displays YOU HAVE FAILED with a replay action.
- Startup taps follow the lobby's expandable 480–640 pixel backdrop and the separate fixed-height Limits screen. The app declares its game category for Android tablet orientation handling. Delayed automatic camera facing was removed, and BASE uses the position-only `centreView` API.
- All 32 extracted mod files match the nested mod in the supplied original ZIP. The supplied roster, mod archive and official engine payload are preserved.

Local regression tests: `test-wave-rules.cjs`, `test-waves-survival.cjs`, `test-towers-ai.cjs`, `test-towers-objective.cjs`, `test-touch-zoom.cjs`, `test-research-queue-bridge.cjs`, and `test-zoom-rule.cjs`. The Survival integration test uses the supplied roster and spawner through wave 9, with checks for unit variety, survivors, fresh spawns and duplicate commands.

Live v2.2 emulator validation (API 36.1, updated WebView, 1280x800 CSS tablet viewport, audio disabled): normal splash startup reached gameplay; two armed towers completed with sticky placement; Skip Wave advanced from 4 survivors in Wave 1 to 8 enemies in Wave 2; six early-wave commands reached Wave 7 with 27 enemies and the native build list still visible. AI logs showed continuous position changes, attack orders targeting HQ 160163, and nine supplied bodies (rocket jeep, buggy, trike, jeep, bus, Viper, Cobra, cyborg and scavenger infantry). HQ health fell from 100 to 63 and then the HQ was destroyed. The controller entered `defeated`, stopped spawning, and the Android overlay displayed YOU HAVE FAILED. Automatic camera-facing calls remained zero. Physical Samsung S8 confirmation remains pending.

## Verified emulator behaviour

- Loads the actual `TowerDefense2_m-T1` map.
- Detects six Survival spawn entrances.
- Starts with six human construction units and four research labs.
- Shows a build phase until the player produces an armed vehicle or completes a ground defence.
- Starts Wave 1 after a visible 15-second preparation countdown.
- Groups four calls to the supplied Survival Mod's `spawn_tick()` into one numbered wave. This retains the supplied 181-unit roster, research frontier, entrance selection, adaptive power calculation, and enemy AI.
- A produced Light Cannon raised human combat power to 120; Wave 1 then completed its four pulses with four enemies and stopped spawning. Producing more cannons raised human power to 360 without restarting the old continuous five-second spawner.
- Keeps a wave active until all spawned enemies are destroyed, then schedules a 20-second intermission before the next numbered wave.
- Mobile research assignment and CLOSE/BATTLE/MAP camera presets were acknowledged without bridge errors.
- Version 2.0 keeps the native lobby covered by a dark Warzone Towers splash and reveals the WebView only after the current numbered-wave controller reports the battlefield ready.
- The aligned top command strip leaves the engine's top-centre message lane clear. The finished Survival Control panel sits below the settings corner and hides while Tactical Queue is open.
- `+Q` now holds Warzone's native Ctrl queue modifier. Select a structure once and each valid placement remains in the constructor queue with the same build ghost ready for the next placement; tapping `+Q` again releases it.
- A live Heavy Machinegun Bunker test confirmed the build ghost remained active and moved to the next site after consecutive placements. The modifier is also preserved through Ctrl-based toolbar shortcuts.
- A live Medium Body - Cobra research completed through Tactical Queue with one command acknowledgement, no rejection, no timeout, and the queue returning to an idle laboratory.

The heavy web build can take roughly 60–85 seconds to enter gameplay in the Android emulator after launch.

Phone/tablet viewport-specific scaling is planned as a separate follow-up. Version 2.0 still uses the fixed mobile control layout.
