# Warzone Towers

**Current benchmark: Warzone Towers 0.28 (28)** was accepted by the user on
9 November 2026 for GitHub `main` and the `v0.28-benchmark` tag.

[Release](https://github.com/rbabbit/wz-android/releases/tag/v0.28-benchmark) ·
[APK](https://github.com/rbabbit/wz-android/releases/download/v0.28-benchmark/Warzone-Towers-0.28.apk) ·
[Complete source ZIP](https://github.com/rbabbit/wz-android/releases/download/v0.28-benchmark/warzone-towers-0.28-source.zip) ·
[SHA-256 checksums](https://github.com/rbabbit/wz-android/releases/download/v0.28-benchmark/Warzone-Towers-0.28-SHA256.txt)

The benchmark includes the selected compact native Rewards drawer on Home and
in-game, with direct category controls and real game artwork, plus the saving
and live-purchase fixes. The exact delivered APK already passed ten focused
emulator checks; supporting checks include 200 JVM wallet checks and 16 web
fixture groups. No additional emulator testing is requested or performed for
this promotion. No full campaign or all-map gameplay pass is claimed.

The verified APK and complete source ZIP are promoted unchanged. The complete
0.27 fallback and all older benchmark tags, releases and artifacts remain
preserved. See the [benchmark record](docs/benchmarks/v0.28.md) and
[0.28 release notes](docs/releases/0.28-rewards.md) for hashes, evidence and
verification limits. Promotion documentation may postdate the frozen source ZIP.

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
remain preserved as an older fallback; `main` uses the accepted 0.28 benchmark.
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
