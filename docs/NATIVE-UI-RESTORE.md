# Preserved Towers fallbacks

Before the compact v6.1 changes, the current v6.0 delivery was frozen:

- APK: `C:/timerApp/Warzone-Towers-v6.0-Android-UI.apk`
- Complete source: `C:/timerApp/warzone-towers-v6.0-android-ui-source.zip`
- Verified duplicate: `C:/timerApp/_backups/towers-v6.0-before-compact-native-20261106/`

APK SHA256: `be349d592e4ee77f706b7630c2e4c3b27a9017aab1be62085432e27f746bb923`.
Source ZIP SHA256: `3c2ee82152793339c1f985679e01e6615447fb4f5206929952d7982ce81286fb`.
The original files are unchanged. Extract the independent source ZIP into a
separate directory to inspect/build the earlier project.

The candidate and both fallback APKs use the same verified signing certificate.
Install the new APK as an update to retain private Android data, including
`saved_designs_v1`. Uninstalling or clearing app data removes that library.
Production still needs the saved model's components researched in each battle.

To restore v6.0 with Android SDK tools, choose the intended device and run from
the directory containing the preserved APK:

```powershell
adb install -r -d Warzone-Towers-v6.0-Android-UI.apk
```

The older HTML/CSS v5.12 fallback also remains untouched:

- `C:/timerApp/Warzone-Towers-v5.12.apk`
- `C:/timerApp/warzone-towers-v5.12-source.zip`
- `C:/timerApp/_backups/towers-v5.12-before-native-ui-20261106/`

APK SHA256: `102316bdb80435971a2fd6561e4b269671774048d751d7d49663325d198f9313`.
Source ZIP SHA256: `e92ce34eaf98fac5e57b86be6364cc80162e9ba6d87374df90ff023ae0d7e57a`.
Its HTML/CSS interface source is also retained in the current project's
`archive/legacy-html-ui/`. It is absent from the native UI APK.

The v6.1 source delivery contains the complete editable Android project,
assets, original mod/maps and scoped verification evidence. Signing keys,
local SDK settings, build caches and temporary CDP endpoints are excluded.
