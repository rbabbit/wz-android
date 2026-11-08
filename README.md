# Warzone Towers

**Current benchmark: Warzone Towers 0.17 (17)** was accepted by the user on
8 November 2026 for GitHub `main` and the `v0.17-benchmark` tag. It replaces the Towers bottom-left BOX/PATROL
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
remain preserved as an older fallback; `main` now uses the accepted 0.17 benchmark.
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
