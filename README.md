# Warzone Towers

**Warzone Towers 0.6 (6) is the current user-accepted version**, promoted from
the test edition on 7 November 2026. This repository's main branch continues
from this version. The tested APK is unchanged by promotion.

[Current release](https://github.com/rbabbit/wz-android/releases/tag/v0.6) ·
[Android APK](https://github.com/rbabbit/wz-android/releases/download/v0.6/Warzone-Towers-0.6.apk) ·
[Complete source ZIP](https://github.com/rbabbit/wz-android/releases/download/v0.6/warzone-towers-0.6-source.zip) ·
[SHA-256 checksums](https://github.com/rbabbit/wz-android/releases/download/v0.6/Warzone-Towers-0.6-SHA256.txt)

Its application ID remains `com.rbabbit.warzonetowers.lab` so it updates the
installed test edition and retains its saves/designs. The historical ID and
local directory name do not change the app's Warzone Towers name or current
status. v6.4 remains a separate, preserved fallback app and project.

The battle interface is HTML/CSS over the official Warzone engine compiled to
WebAssembly. The compact layout, original icon/artwork, maps, mod and normal
research, production and phone design library remain in use. The launcher,
start heading, splash and version no longer display TEST wording.

## Current changes and verification

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

Install the new APK as an update to the existing 0.6/test-line app; do not
uninstall first if you want to retain its saves and templates. Its private
library is separate from stable v6.4. Use Factory **SAVE TO PHONE** or Design
**SAVE BLUEPRINT**, then the blueprint library; normal research and compatible
factories are still required.

The 0.5 fallback APK and complete source ZIP are frozen with checksums in
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
