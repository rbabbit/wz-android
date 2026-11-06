# Current delivery: compact v6.1 verified

See [the v6.1 checkpoint](../v6.1-compact/CURRENT.md) and [current report](../v6.1-compact/REPORT.md) for the 29 current-hash reports, actual gameplay and preserved v6.0 fallback. Everything below is historical v6.0 work.

> Active development: the user approved the compact native layout after this v6.0 delivery. See [the v6.1 checkpoint](../v6.1-compact/CURRENT.md). The v6.0 APK/source remain frozen fallbacks; the working tree has subsequent changes.

# Towers native Android UI — delivery checkpoint

Towers only. The 1v1 work was cancelled and is excluded. No public upload,
repository push, VPS or online work is authorized or performed.

Version 6.0-native-ui (63), branch codex/towers-native-interface.
Candidate APK SHA-256:
`be349d592e4ee77f706b7630c2e4c3b27a9017aab1be62085432e27f746bb923`.
There are no unbuilt runtime changes. All 23 required reports in
[final/summary.json](final/summary.json) passed on this exact installed APK.
See [REPORT.md](REPORT.md) for the observed journeys, fixtures and limits.

Android Views own the app header, field commands, Build, Research, Factory,
Design/library, Orders and Help. The official battlefield/radar/messages/green
blueprints and stock engine menus remain inside WebView/WASM/WebGL. The old
HTML/CSS app interface is archived outside assets and absent from this APK.

The complete relevant finite emulator journey covers both maps, three screen
profiles, native orders/completions, ordinary production, actual save/load,
keyboard/menu returns and saved blueprint process-restart persistence. The
result/replay UI callback is an explicit fixture, not native victory. Physical
GPU/audio/performance and full native 30-round endurance remain unverified;
software-emulator black terrain persists.

The owned emulator has Standard app size restored through native Help. The
app was paused/synced and force-stopped before restoring the wide profile,
then launched only to its observed startup screen. No battle is left running.
See final/environment-restored.json and final/environment-startup.png.

Delivery is generated with tools/package-native-ui.py after the repository
manifest is refreshed and verified. Output files are:
- C:/timerApp/Warzone-Towers-v6.0-Android-UI.apk
- C:/timerApp/warzone-towers-v6.0-android-ui-source.zip
- C:/timerApp/Warzone-Towers-v6.0-Android-UI-SHA256.txt

The packager refuses a mixed-hash report set, verifies source manifest hashes,
checks ZIP CRCs and preserves existing archives. The frozen v5.12 APK/source
and C:/timerApp/_backups/towers-v5.12-before-native-ui-20261106 remain intact.
The same signing certificate allows an update retaining private saved designs.
Do not uninstall or clear app data to upgrade.

Earlier failure snapshots and other QA directories are historical evidence,
not the current pass set. WORK-IN-PROGRESS.md is retained as a historical log.
