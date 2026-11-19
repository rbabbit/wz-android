# Warzone Towers

**Current Maps test revision: 0.99.11 (version code 111).** The Maps screen uses an adaptive compact three-column grid, a full map preview, compact settings and a full-width DOWNLOAD & PLAY action. Maps includes the official map catalogue, all supported player counts, bot and difficulty selection, paging fixes, plus FFA or locked Teams with presets, editable player assignments and team save/load support. The additional Dumbot25a, RatBot personalities and Wally sources, runtime assets and licence notices are included.

[Latest Maps layout notes](docs/releases/0.99.11-maps-layout.md) · [0.99.10 Maps feature and build notes](docs/releases/0.99.10-maps.md). The checkout includes the runtime assets needed to build this revision; regenerating the extra bot bundle is optional. No tests were run for this layout delivery or GitHub commit, as requested. This commit does not upload an APK or change the VPS update feed.

## Preserved combined test backup: 0.95

The combined backup includes automatic Medium-damage repair and protected ALL COMBAT (0.93), single-player Survival on TDN2/Wave plus crystal-only More Fortress items and save/load fixes (0.94), and Hub Watch Replay with battlefield/minimap/playback controls (0.95). Accepted cellular lobby networking and polished Players panels are retained.

[Normal test APKs and complete source backup](https://github.com/rbabbit/wz-android/releases/tag/v0.95-test) · [Combined backup inventory](docs/releases/0.95-combined-test-backup.md) · [Latest replay audit](archive/v0.95-test/AUDIT095.md)

The Git checkout contains the effective current source. Run `git lfs pull` after cloning for the two original LFS payloads. Build with `tools/build-normal-apk.py`, your existing normal signing key, JDK and Android SDK. The complete source ZIP preserves the original tree and restoration profiles; after extracting, follow `test-release-095/README.md` to apply the exact0.95 build inputs. Private keys and passwords are excluded.

The exact normal APKs are retained separately as0.93,0.94 and0.95 release assets. Focused emulator checks cover their changed paths; see the sealed audits for prepared fixtures and limits. Replay checks used two real public recordings, native-frame validation, touch controls, Back, offline Retry and phone/compact layouts. Later Survival waves, every replay and physical-phone performance are not claimed.

The user authorized this private GitHub backup on2026-11-18. Historical sealed records keep their original publication flags. No VPS/update-feed or Google Play change, AAB build or stable release promotion is included.

## Previous test backup: 0.92

[Players0.92 APK/source backup](https://github.com/rbabbit/wz-android/releases/tag/v0.92-test), [sealed checks](test-release-092/) and [approved mockups](docs/mockups/players-clean-v2/) remain preserved.

**Development revision: 0.86 (86)** adds live Multiplayer background protection,
concise directory retry errors, manual signed-APK updates from wz2100.uk, and
first-factory Manufacturing ALL beside the existing cycle control across all
four modes. v0.85 APK and complete source are preserved. Exact headless Android
runtime evidence and limits are in [0.86 notes](docs/releases/0.86.md).

**Development revision: 0.85 (85)** applies the five requested menu corrections:
the shorter Home tagline, removal of the Guide Mode control and large Campaign
heading, native Lobby wording with Refresh at the top right, and a fullscreen
waiting-room map preview. v0.84 APK and complete source remain the fallback.
Focused source/geometry checks and Android compilation passed; no emulator or
device testing was performed, as requested. See the [0.85 notes](docs/releases/0.85-menu-polish.md).

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

**Historical development revision: 0.83 (83)** implements the selected blue portrait Home,
with illustrated Campaign, Towers, FFA and Multiplayer cards, compact Guide/Hub
buttons and the existing research tagline. Destinations and games stay landscape;
Back restores portrait Home. The v0.82 APK and complete source remain the fallback.
Exact-APK ADB checks cover all six routes, small/enlarged-text layouts, retained
Activity/game state, Research and touch camera input. Existing emulator terrain
rendering remains limited. See the [0.83 notes](docs/releases/0.83-portrait-home.md).

**Development revision: 0.82 (82)** adds the small Home line “Advance Research
Tech · Build & Deploy Units · Upgrade Structures” and separates Multiplayer
spectator camera/rendering capability from player-owned commands. The complete
v0.81 APK/source remain the fallback. The exact installed APK passed the scoped
pre-start spectator, camera/read-only/return, ordinary-player and Home checks.
See the
[0.82 notes](docs/releases/0.82-multiplayer-spectator.md) for scope and limits.

**Development revision: 0.80 (80)** keeps Multiplayer chat inline with the
room, preserves scroll position through updates and keyboard changes, and adds
a real native map preview plus the existing Warzone click sound. Room-only
viewport handling no longer applies the game's minimum scale while typing.
The complete v0.79 APK/source remain the fallback. See the
[0.80 notes](docs/releases/0.80-multiplayer-room-polish.md) for scope and the
separate host/emulator evidence. The exact installed candidate passed the
private-room typing, scrolling, keyboard, real-map-preview, click/mute and scoped
match movement/input/return checks. Physical speaker audition and a full public
match remain outside the verified scope.

**Development revision: 0.79 (79)** replaces Multiplayer's stock waiting-room
screen with the approved compact player list, chat and Ready controls. Team and
spectator requests follow the host's native permissions; loading remains covered
until the matching room or battlefield is ready. The v0.78 APK and complete
source are preserved. The exact installed APK passed the scoped private-host
room and match-entry checks. See the
[0.79 notes](docs/releases/0.79-multiplayer-room.md) for observed scope, separate
host evidence and limits; physical phones and a full public match were not tested.

**Development release: 0.78 (78)** separates available Research choices from
the selected laboratory's current topic and ordered queue. Design name editing
uses a compact panel near the top of the screen. The v0.77 APK and complete
source remain the fallback. No emulator tests were requested; see the
[0.78 notes](docs/releases/0.78-research-assignment.md).

**Development release: 0.77 (77)** applies the approved compact Manufacturing
and Queue screens across the four modes. It adds continuous manufacturing and
one STOP action per factory, while retaining native production limits and real
unit progress. v0.76 APK/full source are preserved. The user requested no
emulator tests; see the [0.77 notes](docs/releases/0.77-manufacturing-clean.md).

**Development release: 0.76 (76)** simplifies the shared Research screen in
Towers, FFA, Campaign and Multiplayer. Numeric lab tabs and a larger scrolling
technology list replace duplicate headings, category controls and the bottom
lab detail block. Existing batch assignment and active/queued markers remain.
The v0.75 APK and complete source are preserved. No emulator testing was
requested; see the [0.76 notes](docs/releases/0.76-research-clean.md).

**Development release: 0.68 (68)** refines the existing 45 authored FFA maps
with defined paths and terrain banks that break up broad open combat ground.
Map identities, sizes, base positions and starting economies remain unchanged.
The six original FFA maps and other modes are preserved. v0.67 APK/full source
remain the fallback. No emulator tests were requested; see the
[0.68 release notes](docs/releases/0.68-ffa-pathways.md) for offline check scope.

**Development release: 0.67 (67)** adds 45 NTW-style FFA maps, fifteen each for
two, three and four players, with grouped swipe previews and independent Cobra
opponents. The six earlier FFA maps remain available under Originals. Delivered
v0.66 APK/full source remain the fallback. The user requested no emulator tests;
validation is limited to offline map, runtime, UI and packaging checks. See the
[0.67 release notes](docs/releases/0.67-ntw-map-pack.md).

**Development release: 0.66 (66)** adds five supplied FFA maps alongside EMAG,
with swipeable terrain previews and one human against three or five Cobra
opponents. FFA and Campaign gain the same MUSIC control as Towers. FFA shuffles
the bundled soundtrack; Campaign uses its original three-track in-game policy.
Existing EMAG saves and the v0.65 APK/source fallback are preserved. See the
[0.66 release notes](docs/releases/0.66-ffa-maps-music.md).

**Development release: 0.65 (65)** adds an offline **Guide** to Home and the
in-game Help reader. Research is organised into fifteen families, with separate
Towers, FFA and Campaign catalogues, all required prerequisites, unlocks and
upgrades. Ten practical chapters use real app screenshots with numbered
annotations. Delivered v0.64 APK/full source remain the fallback. See the
[0.65 release notes](docs/releases/0.65-field-guide.md).

**Development release: 0.64 (64)** uses **Cobra** for new FFA matches at Easy,
Medium and Hard. Three independent opponents and VTOL-off rules remain.
Existing NullBot saves retain their original AI and are labelled accordingly;
new Cobra saves record and verify the actual native bot identity. Delivered
v0.63 APK/full source are preserved. See the
[0.64 release notes](docs/releases/0.64-cobra-ffa.md).

**Development release: 0.63 (63)** makes two-finger rotation more tolerant of
short twists, close fingers and small spacing changes at the start of a turn.
Clear angular intent can take over from an accidental early zoom, tilt or pan.
Delivered v0.62 APK/full source are preserved. See the
[0.63 release notes](docs/releases/0.63-rotation-consistency.md).

**Development release: 0.62 (62)** corrects two-finger rotation when one finger
acts as a pivot or the fingers move unevenly. These gestures now turn the view
through full circles in either direction rather than being misread as tilt.
Parallel movement still tilts and pinching still zooms. Delivered v0.61 APK/full
source are preserved. See the [0.62 release notes](docs/releases/0.62-rotation.md).

**Development release: 0.61 (61)** fixes crowded construction queues in
Towers, Campaign and FFA, and adds two-finger twist rotation. Queued base
buildings respect native spacing; blocked plans explain the obstruction and
retry with explicitly selected trucks. Parallel two-finger tilt, pinch zoom
and one-finger movement remain available. Delivered v0.60 APK/full source are
preserved. See the [0.61 release notes](docs/releases/0.61-construction-rotation.md).

**Development release: 0.60 (60)** adds a separate **FFA** section: the supplied
EMAG map, you and three independent native bots, Easy/Medium/Hard difficulty,
ground-only play and separate phone saves. Campaign, Towers and the hidden Duel
payloads remain preserved, with v0.59 APK/full source as fallback. See the
[0.60 release notes](docs/releases/0.60-ffa.md) for scope and verification.

**Development release: 0.59 (59)** restores the original WZ2100 shield as the
Android app icon. The splash and game are unchanged; complete v0.58 APK/source
remain the fallback. Build and package checks only, with no emulator testing as
requested. See the [0.59 release notes](docs/releases/0.59-icon.md).

**Development release: 0.58 (58)** adds per-map Complete markers, matching Back
button styling and a one-time 1,000-crystal reward for completing every map in
each difficulty. The complete v0.57 APK/source remain the fallback. Verification
includes 390 host wallet cases and five exact-APK native/UI cases using a disclosed
seeded final-wave boundary; the original emulator wallet was restored afterward.
See the [0.58 release notes](docs/releases/0.58-completion.md) for scope and fixture corrections.

**Development release: 0.57 (57)** replaces the large Home cards with a minimal
native splash: the official logo and compact Campaign/Towers actions. Existing
Campaign setup, Towers map selection, saves and rewards remain available through
their previous screens. The complete v0.56 APK/source remain the fallback. The
exact installed APK passed five focused native layout/navigation cases, including
compact and enlarged text, both game routes and return paths. See the
[0.57 release notes](docs/releases/0.57-splash.md) for scope and fixture disclosure.

**Development release: 0.56 (56)** gives Campaign and Towers separate native
Home cards, with compact Rewards/Saved Games and direct Campaign New/Continue
actions. The complete v0.55 APK/source remain the fallback. The exact installed
APK passed ten focused native Home/navigation cases, including both game routes,
compact scrolling and enlarged text. See the
[0.56 release notes](docs/releases/0.56-home.md) for scope and fixture disclosure.

**Development release: 0.55 (55)** fixes Campaign cancellation records that
could leave queued blueprints visible until builders became idle. The exact
v0.54 APK and complete source remain the fallback. The exact installed APK passed
ten focused native checks, including cancelling while other builders work,
foundation retention, phone Save/Continue and completing the same foundation.
See the [0.55 release notes](docs/releases/0.55-campaign-cancel.md).

**Development release: 0.54 (54)** brings Campaign research Intelligence into
the dark report reader, repairs a hidden construction-overlay canvas and removes
the footer collapse button from Campaign and Towers. The complete v0.53 APK/source
remain preserved. The exact installed APK passed sixteen focused Campaign and
Towers checks, including queued models, menu handoffs, compact layout and phone
Save/Continue. See the
[0.54 release notes](docs/releases/0.54-campaign-overlays.md) for fixture scope,
empty report-history coverage and the existing cancellation-journal limitation.

**Development release: 0.53 (53)** polishes the Campaign header/footer,
refreshes Design validation when a Command Centre or research changes, and keeps
the original Game Guide available without automatic modal interruptions. The
complete v0.52 APK/source remain preserved. The exact installed APK passed the
opening Alpha Design/HQ/manufacturing journey, phone Save/Continue, compact
layout and a brief Towers regression. See the
[0.53 release notes](docs/releases/0.53-campaign-polish.md) for scope and test-report recovery provenance.

**Development release: 0.52 (52)** routes Towers unit-loss messages into the
compact black-and-white notice and adds explicit recovery for construction
whose assigned trucks were destroyed. The complete v0.51 APK/source remain
preserved. The exact installed APK passed a seeded native casualty, explicit
replacement-truck recovery through completion, ordinary production/menu checks,
normal Towers phone Save/Load and a brief Campaign Continue regression.
Campaign and Duel content/runtimes are preserved. See the
[0.52 release notes](docs/releases/0.52-loss-builders.md) for evidence and fixture limits.

**Development release: 0.51 (51)** adds the original Campaign beside Towers,
with a verified one-time movie download, persistent ALL COMBAT control and
separate campaign phone saves. The accepted v0.50 APK and complete source remain
as fallback. See the [0.51 release notes](docs/releases/0.51-campaign.md) and
the exact-APK verification record for tested scope and remaining limits.

**Previous development release: 0.50 (50)** corrects v0.49's touch-pan regression using
the native SDL release/idle lifecycle. It removes cursor recentering, restores
immediate drag activation and safely separates repeated swipes. A Towers-only
native middle-button change prevents rapid swipes becoming desktop double-clicks.
The installed APK is checked with actual Android touch input, native camera
projection, minimap, selection, construction/production, menu returns and saved
game loading. Native camera smoothing and other game content remain intact.
Complete v0.49 and v0.48 fallbacks remain. See the
[0.50 release notes](docs/releases/0.50-touch-camera.md) and current design QA
for the emulator's terrain-rendering limitation and device evidence.

**Previous development release: 0.49 (49)** fixes Towers finger-pan input cadence and
release handling. It batches raw motion to the latest absolute position per
frame, bounds drag coordinates to the canvas, and retains the final held point
through a native frame before releasing. Cancellation and new input clear old
callbacks. The native camera interpolation and other gestures stay intact.
Complete v0.48 APK/source are preserved. Verification is focused source/VM,
compilation and exact package integrity; no emulator or phone smoothness check.
See the [0.49 release notes](docs/releases/0.49-touch-pan.md).

**Previous development release: 0.48 (48)** fixes Intelligence closing on its first
heartbeat when the wave HUD timestamp lags the native engine. Clock comparisons
now stay within native replies, malformed timestamps are ignored, and late
heartbeat callbacks cannot affect a reopened panel. All other v0.47 changes
remain. Complete v0.47 APK/source are preserved. Verification is focused source/
VM, compilation and exact package integrity only; no emulator or gameplay run.
See the [0.48 release notes](docs/releases/0.48-intelligence-clock.md).

**Previous development release: 0.47 (47)** fixes Intelligence eligibility/refresh and
research artwork, reduces Build's construction display to one current unfinished
item, and corrects the Home map arrow's selected/pressed contrast. Complete
v0.46 APK/source are preserved first. Engine gameplay, construction orders,
research rules, saves, rewards, ads and current other layouts remain intact.
Verification is focused source/VM, compilation and package integrity only;
no emulator, browser, Android runtime or gameplay run. See the
[0.47 release notes](docs/releases/0.47-intelligence-build.md).

**Previous development release: 0.46 (46)** applies selected button sample 2's softly
rounded rectangles and returns the existing app to black-and-white surfaces.
Normal controls are charcoal/white; selected controls are white/black, with
separate pressed, disabled and focus states. Existing layouts, interactions,
original artwork and gameplay remain. Complete v0.45 is preserved first.
Verification is source/build/package integrity only: no emulator, browser,
Android runtime, sound playback, gameplay or ad serving check. See the
[0.46 release notes](docs/releases/0.46-rounded-monochrome.md).

**Previous development release: 0.45 (45)** gives the existing controls actual raster
faces, distinct press/selection states and restrained original Warzone click
feedback. Build moves from the top navigation to the footer after Analysis and
Manufacturing, keeping its original construction/selection logic. Matching
native action-button artwork retains the current Home/Rewards layout. Complete
v0.44 APK/source are preserved first. Verification is source/VM, compilation and
package integrity only; no emulator, browser, audible playback or gameplay run.
See the [0.45 release notes](docs/releases/0.45-game-controls.md).

**Previous development release: 0.44 (44)** groups Research/Manufacturing/Build, refines
the footer and Music highlight, moves Wave/Skip inward to the left, adjusts the
power-gauge scale and disables native autosaving while retaining manual saves.
It fixes the Home result overlay and starts normal cold launches on Easy's first
map. The delivery uses the publisher's real rewarded unit on physical phones;
explicit development builds can retain sample ads. Complete v0.43 is preserved.
No emulator/browser/live-ad request or gameplay test is performed. See the
[0.44 release notes](docs/releases/0.44-hud-home.md).

**Previous development release: 0.43 (43)** uses selected Home mock 2's grey cannon tank,
adds the Home-only `rbabbit v<current version>` label and production cancellation
in Queue. Complete v0.42 files remain preserved as fallback. No emulator or
gameplay testing is performed; this APK is supplied for the user's phone check.
See the [0.43 release notes](docs/releases/0.43-home-queue.md).

**Previous development release: 0.42 (42)** applies the selected light sage green / black
theme throughout Towers, including native Home, Rewards, saves, dialogs,
briefings, loading and notices, the web menus and sidebars, and Towers-only
native console/power-meter rendering. Current layouts, original game artwork,
gameplay and prior fixes remain. Complete v0.41 files are preserved as fallback.
This delivery is compiled and packaged for the user's phone check: **no emulator,
browser or gameplay testing**. See the [0.42 release notes](docs/releases/0.42-sage.md)
for scope and verification limits.

**Previous development release: 0.41 (41)** replaces Production footer component
placeholders with the real matching thumbnail, fixes missing live equipment
metadata, and removes internal queue-uncertainty labels. Complete v0.40 files
remain preserved as fallback. Focused source/desktop checks, native/Android
compilation and package integrity only; **no emulator testing**. See the
[0.41 release notes](docs/releases/0.41-thumbnail.md) for scope and limitations.

**Previous development release: 0.40 (40)** fixes selected footer/Build contrast and
header theme conflicts, and adds real production activity/progress and clearer
unit counts. Complete v0.39 artifacts remain frozen as fallback. Verification
is limited to focused source/desktop fixtures, native/Android compilation and
package integrity; **no emulator testing**. See the
[0.40 release notes](docs/releases/0.40-progress.md) for scope and limitations.

**Previous development release: 0.39 (39)** applies the approved monochrome theme across
Towers and revised Production mock 2 (numbered factory chips beside categories,
quantity by Produce). Current 0.38 APK/source are preserved as a fallback.
Verification is source/desktop fixtures, Android compilation and exact package
integrity only; **no emulator testing**, as requested. Android visuals and
gameplay for this revision remain unverified. See the
[0.39 release notes](docs/releases/0.39-theme.md) and
[bounded design comparison](docs/ui-0.39/design-qa.md).

**Current benchmark: Warzone Towers 0.31 (31)** was accepted by the user on
9 November 2026 for GitHub `main` and the `v0.31-benchmark` tag.

[Release](https://github.com/rbabbit/wz-android/releases/tag/v0.31-benchmark) ·
[APK](https://github.com/rbabbit/wz-android/releases/download/v0.31-benchmark/Warzone-Towers-0.31-Test-Ads.apk) ·
[Complete source ZIP](https://github.com/rbabbit/wz-android/releases/download/v0.31-benchmark/warzone-towers-0.31-source.zip) ·
[SHA-256 checksums](https://github.com/rbabbit/wz-android/releases/download/v0.31-benchmark/Warzone-Towers-0.31-Test-Ads-SHA256.txt)

The benchmark makes Research prominent, adds consistent header menu toggles,
removes the listed duplicate close controls and blue footer label/time, and
improves Produce feedback and the compact Gain 10 Crystals action. Test ads
remain enabled. The exact delivered APK already passed 27 focused emulator
checks; supporting host fixtures cover 19 command and 12 navigation checks.
No additional emulator testing is requested or performed for this promotion.
No full campaign, all-map graphics, physical-phone or live-ad pass is claimed.

The verified APK and complete source ZIP are promoted unchanged. The source
includes the full native base plus the exact guarded two-call render overlay,
patch and reproduction recipe. The complete v0.30 fallback and all older tags,
releases and artifacts remain preserved. See the
[benchmark record](docs/benchmarks/v0.31.md) and
[v0.31 release notes](docs/releases/0.31-ui.md) for hashes, evidence and limits.
Promotion documentation may postdate the frozen source ZIP.

**Previous benchmark: Warzone Towers 0.28 (28)** remains available through its
[release](https://github.com/rbabbit/wz-android/releases/tag/v0.28-benchmark) and
[benchmark record](docs/benchmarks/v0.28.md). Its APK, complete source and
checksums are unchanged. The v0.17 benchmark and every older fallback remain.

**Previous development release: Warzone Towers 0.27 (27)** adds phone save games, a
Saved Games list on Home, in-game Rewards purchases and a smaller cleared-wave
coin notice. Saves retain native game state and reward-run identity. Existing
wallet rules, prices, map content, music and the complete 0.26 fallback remain
preserved. Greenhaven's internal level alias is shortened to fit the native
save header; its displayed name and map content are unchanged. Verification
is source/JVM fixtures, Android compilation, package
integrity and only the brief exact-APK emulator observations recorded in the
delivery report. Full gameplay is not claimed verified. See the
[0.27 release notes](docs/releases/0.27-saves.md). The 0.17 benchmark remains
preserved as an older fallback.

**Previous development release: Warzone Towers 0.26 (26)** makes Rewards inventory
portable between maps, expands fortress/artillery choices and adds bulk buying
with a per-match loadout. Each actually cleared wave earns five coins once per
run; victory and first-completion bonuses remain. Existing wallet balances and
unspent purchases migrate without another starter gift. The complete 0.25
fallback is preserved. Verification is source review, focused source-only
fixtures, Android compilation and package integrity: **no emulator testing**.
Runtime screens, persistence and gameplay remain unverified. See the
[0.26 release notes](docs/releases/0.26-rewards.md). The 0.17 benchmark remains
preserved as an older fallback.

**Previous development release: Warzone Towers 0.25 (25)** adds a persistent crystal
wallet, optional match-only boosts and an already-credited result receipt. Both
outcomes return to Home with the same map selected before showing the receipt. The complete 0.24
fallback and existing maps, authored waves, music and Duel payloads are retained.
Verification is source review, focused source-only fixtures, Android compilation
and package integrity: **no emulator testing**, as requested. Runtime screens
and gameplay remain unverified. See the [0.25 release notes](docs/releases/0.25-rewards.md).
The 0.17 benchmark remains preserved as an older fallback.

**Previous development release: Warzone Towers 0.24 (24)** implements the selected compact
home layout with the existing map preview, smaller difficulty tabs and a single
Play/music action row. Optional HD/HQ graphics are removed from the app; VPS
files remain untouched. Verification is source review, Android compilation and
package integrity only: **no emulator testing**, as requested. See the
[0.24 release notes](docs/releases/0.24-compact-home.md). The complete 0.23
APK/source fallback, maps, engine, music player and dormant Duel gameplay remain
preserved. The 0.17 benchmark remains preserved as an older fallback.

**Previous development release: Warzone Towers 0.23 (23)** addresses the music failure
reproduced on the delivered 0.22 APK: WebView repeated the Content-Length field,
and the loader rejected its comma-separated value before playback. The change
is limited to the music loader and native track response. The exact candidate
passed focused emulator checks for advancing media, nonzero decoded PCM and
On/Off/On. Speaker output was not monitored and remains unverified. See the
[0.23 release notes](docs/releases/0.23-music-playback.md). Complete 0.22
fallback artifacts, maps, engine and dormant Duel implementation are preserved.

**Previous development release: Warzone Towers 0.22 (22)** repairs assigned-track
startup by loading the complete local track into a Blob URL, avoiding the
double application of seek ranges. Startup/buffering deadlines and explicit
On retry address the stuck Starting music state. The existing assignments,
music download, controls, maps, native engine and complete 0.21 fallback remain
preserved. Verification is source review, focused non-emulator checks and
Android/package compilation; device playback remains unverified. See the
[0.22 release notes](docs/releases/0.22-music-start.md) and
[fallback hashes](archive/fallback-0.22.json).

**Previous development release: Warzone Towers 0.21 (21)** assigns music to all 46
maps and adds a compact in-game MUSIC On/Off panel. The start screen now has
an optional music download instead of the long chooser. The 1v1 vs Bot entry
is hidden while its code remains retained. Maps, game rules, native engine,
sound effects and the complete 0.20 fallback remain preserved. Source review
and an Android build are the verification scope; **no emulator, playback or
gameplay testing is authorized**. See the
[0.21 release notes](docs/releases/0.21-map-music.md) and
[fallback hashes](archive/fallback-0.21.json). The 0.17 benchmark remains
preserved as an older fallback.

**Previous development release: Warzone Towers 0.20 (20)** remakes the 43 generated
maps as distinct native landscapes and adds a visible, tappable swipe arrow
to the home-screen map cards. Map names, difficulty groups, wave schedules,
the three original maps and Duel remain preserved. The catalog still contains
**46 maps: 16 Easy, 15 Medium and 15 Hard**. The previous maps are saved in
`C:/timerApp/old_maps-0.19.zip`; the complete 0.19 APK/source/checksums are also
frozen by [hash reference](archive/fallback-0.20.json). Work is limited to map
source/art review, static authoring constraints and an Android build: **no
emulator or gameplay testing is authorized for this revision**. Current engine
appearance, pathfinding, balance and swipe-arrow operation remain unverified.
See the [0.20 release notes](docs/releases/0.20-map-art.md). The 0.17 benchmark
remains preserved as an older fallback.

**Previous development release: Warzone Towers 0.19 (19)** adds 43 new Towers maps
(15 Easy, 15 Medium, 13 Hard), bringing the catalog to 46 maps with the three
existing maps: **16 Easy, 15 Medium, 15 Hard**. The native home screen has
difficulty tabs and swipeable previews from actual map data. This revision
also adds Greenhaven's satellite uplink and defence line previews of up to 64
candidate sites, subject to native validation. Source review and the Android
build passed. A brief home-screen emulator check observed the difficulty
tabs, map previews, swipe selection and matching Play label at normal and
compact sizes; see `qa/0.19-home/report.json`.
**Gameplay, pathfinding, balance and defence drag remain unverified.** See the
[0.19 release notes](docs/releases/0.19-levels.md). The complete 0.18 fallback is
preserved by [hash reference](archive/fallback-0.19.json); the 0.17 benchmark
remains preserved as an older fallback.

**Previous development release: Warzone Towers 0.18 (18)** adds Greenhaven, a third
Towers map labelled Beginner, with a connected southern starting base and a
separate proposed 15-wave gentle schedule. Its difficulty and playability are
**not runtime verified**. This release is limited to source audit/review and an
Android build: **no tests, emulator sessions or gameplay/runtime checks**, as
requested. See the [0.18 release notes](docs/releases/0.18-greenhaven.md).
The existing 0.17 APK, complete source ZIP and checksums remain frozen by hash
reference, and `v0.17-benchmark` remains preserved as an older fallback.

**Previous benchmark: Warzone Towers 0.17 (17)** was accepted by the user on
8 November 2026 for GitHub `main` and the `v0.17-benchmark` tag. It replaced the Towers bottom-left BOX/PATROL
buttons with DESELECT, which clears selection while keeping existing orders.
This release received source audit/review and an Android build only: **no tests,
emulator sessions or runtime checks for 0.17**, as requested. See the
[0.17 release notes](docs/releases/0.17-field-menu.md) and
[benchmark record](docs/benchmarks/v0.17.md). The complete 0.16
artifacts remain unchanged as fallback; older QA is historical.

## Historical 0.16 Research/Help release

**Warzone Towers 0.16 (16)** added single/multiple Research topic
selection before Add; the existing Standard/Large/Extra Large size options now
also scale Help text properly. This release received source audit/review and an
Android build only: **no tests, emulator sessions or
runtime checks for 0.16**, as requested. See the
[0.16 release notes](docs/releases/0.16-research-help.md). The complete 0.15
artifacts remain unchanged as the fallback; older QA is historical.

## Historical 0.15 facility-tap release

**Warzone Towers 0.15 (15)** addressed battlefield lab/factory taps.
This release received a source audit and Android build only. **No tests or
emulator/runtime checks were run for 0.15**, as requested. See the
[0.15 release notes](docs/releases/0.15-facility-taps.md). The 0.14 APK, complete
source ZIP and checksums remain unchanged as the fallback; its QA results are
historical and do not verify the current change.

## Historical 0.14 compact UI release

**Warzone Towers 0.14 (14)** introduced the approved compact,
border-free Production, Design and Research layout across active Towers pages.
Build, blueprints, queues, Help and field/header controls use the same flat
visual style. The activity footer and current-work sidebars retain their 0.13
source and original behaviour. Native start/settings/confirmation styling is
scoped to Towers; Duel retains its existing appearance. See the
[0.14 release notes](docs/releases/0.14-compact-towers.md),
[page inventory](qa/test-14/page-inventory.json) and
[verification report](qa/test-14/REPORT.md) for delivery status and evidence.

The deferred 1v1 mode is retained with its existing interface and unchanged
gameplay package. The frozen `v0.9-benchmark` tag and its
[historical benchmark artifacts](https://github.com/rbabbit/wz-android/releases/tag/v0.9-benchmark)
remain preserved as an older fallback; `main` uses the accepted 0.31 benchmark.
The complete 0.13 APK/source fallback and older versions remain preserved.

The application ID remains `com.rbabbit.warzonetowers.lab`, so 0.14 updates
the 0.13/test-line app while retaining its private saves and phone designs.
The in-game interface is HTML/CSS over the existing WebAssembly engine;
the launcher and return confirmation use Android views. v6.4 remains a
separate fallback app and project.

## Historical 0.6 promotion and release links

Warzone Towers 0.6 (6) was accepted and promoted from the test edition on
7 November 2026. Its tested APK was unchanged by that promotion.

[Historical 0.6 release](https://github.com/rbabbit/wz-android/releases/tag/v0.6) ·
[0.6 APK](https://github.com/rbabbit/wz-android/releases/download/v0.6/Warzone-Towers-0.6.apk) ·
[0.6 complete source ZIP](https://github.com/rbabbit/wz-android/releases/download/v0.6/warzone-towers-0.6-source.zip) ·
[0.6 SHA-256 checksums](https://github.com/rbabbit/wz-android/releases/download/v0.6/Warzone-Towers-0.6-SHA256.txt)

Its application ID was retained as `com.rbabbit.warzonetowers.lab` so it
updated the installed test edition and retained its saves/designs. The
historical ID and local directory name did not change its Warzone Towers name.

The battle interface is HTML/CSS over the official Warzone engine compiled to
WebAssembly. The compact layout, original icon/artwork, maps, mod and normal
research, production and phone design library remain in use. The launcher,
start heading, splash and version no longer display TEST wording.

## Historical 0.6 changes and verification

Version 0.6 fixes truck assignment after camera/group changes and Android Back.
New-area build orders refresh the visible constructor group once; previously
accepted jobs retain their workers. Current-view manual selections are respected.
Android Back closes an open panel/keyboard first, then asks **Return to main
menu?** with **Cancel / Return**. Return opens the original start screen directly.
The native confirmation blocks touches while the battle keeps running.

The exact 0.6 APK passed 14 focused source regressions, two independent native
tower/module queues, real single-truck assignment, repeated Cancel/Back/Return,
keyboard/panel returns and fresh-battle persistence checks. Twelve actual
screenshots were inspected. See [the 0.6 report](qa/test-06/REPORT.md).
The compiled engine, data, maps/mod, icon and compact layout match 0.5 exactly.
The 0.5 APK and complete source fallback are preserved in
`C:/timerApp/fallbacks/towers-before-truck-back-fix-20261107`; stable v6.4 is untouched.
Delivery files are `Warzone-Towers-0.6.apk`, `warzone-towers-0.6-source.zip` and
`Warzone-Towers-0.6-SHA256.txt`.

## Previous 0.5 preview correction

Version 0.5 corrects building previews. Ordinary models and site numbers render
alongside module highlights. Unchecked touches have neutral previews, rejected
sites use invalid feedback, and a failed terrain pick clears the previous site.
Heights follow the native footprint/foundation rules and observed terrain
changes invalidate cached geometry. Generated model metadata retains exact
original structure bounds; existing mesh artwork remains unchanged.

The matching 4.7.0 engine is rebuilt from source for one native visual correction:
queued blueprints use the same footprint-parity centre as their eventual
foundations. Real worker orders, foundation placement, modules, supplied maps/mod,
wave schedule, private designs and compact controls retain their existing rules.
Native source, patch, pinned build recipe and runtime provenance are included.

Delivery verification is recorded in [the 0.5 report](qa/test-05/REPORT.md).
The exact APK passed nine relevant emulator phases, 26 source checks, native
source/provenance checks and review of 40 screenshots. Representative ordinary
structures and all three module families completed in the real engine. Normal
production, native save/load and repeated input returns passed. The emulator's
existing black terrain limits ground-texture and slope appearance verification;
physical Android devices were not tested.
The earlier [0.4 report](qa/test-04/REPORT.md) is historical evidence. A later audit
found an ordinary-renderer exception and a native queued-model alignment issue
that its original checks missed; 0.5 adds direct renderer and mixed-frame checks.

Delivery names are `Warzone-Towers-0.5.apk`,
`warzone-towers-0.5-source.zip` and `Warzone-Towers-0.5-SHA256.txt`.

## Data and preserved fallbacks

Install the new APK as an update to the existing 0.13/test-line app; do not
uninstall first if you want to retain its saves and templates. Its private
library is separate from stable v6.4. Use Factory's options menu and **SAVE
DESIGN TO PHONE**, or Design **SAVE BLUEPRINT**, then the blueprint library;
normal research and compatible factories are still required.

The complete 0.13 APK/source fallback is frozen with checksums in
`C:/timerApp/fallbacks/towers-before-compact-0.14-20261108`; its complete source
archive and working manifest were verified before edits. The complete 0.12
fallback remains in
`C:/timerApp/fallbacks/towers-before-factory-0.13-20261108`. The complete 0.10
fallback remains frozen with checksums in
`C:/timerApp/fallbacks/towers-before-ui-0.11-20261108`. The 0.5 fallback APK and
complete source ZIP are frozen with checksums in
`C:/timerApp/fallbacks/towers-before-truck-back-fix-20261107`. The older 0.4
snapshot remains in `C:/timerApp/fallbacks/towers-before-preview-fix-20261107`.
The v6.4 fallback project is `C:/timerApp/wz-tower-defense`; current development
continues in `C:/timerApp/wz-towers-lab`. v6.4 and earlier release artifacts
remain untouched, including [the v6.4 GitHub release](https://github.com/rbabbit/wz-android/releases/tag/v6.4-build-blueprints).

The [0.3 report](qa/test-03/REPORT.md), [Test 02 report](qa/test-02/REPORT.md)
and [Lab 01 report](qa/lab-01/REPORT.md)
are preserved historical evidence. The new report distinguishes final-candidate
results from older exploratory or interrupted runs.

## Build

For a Git checkout, install Git LFS and run `git lfs pull` to retrieve the
preserved complete native source tar. The attached complete source ZIP already
contains its full bytes. Publication updates documentation and Git LFS metadata;
the frozen delivery source ZIP and APK keep their original hashes.

Configure an Android SDK with API 36 and the local Android Studio JDK:

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME='C:\Users\punke\AppData\Local\Android\Sdk'
.\gradlew.bat clean assembleDebug
```

The local debug APK is `app/build/outputs/apk/debug/app-debug.apk`. SDK settings,
`local.properties`, signing keys and build caches are excluded from the source
archive. The original provenance and preservation rules in `AGENTS.md`, `docs/`
and `vendor/` continue to apply.
