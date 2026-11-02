# v4.1 artwork verification

final result: passed

Selected artwork: the first green-field concept, Grassland Defence. The original PNG was copied unchanged to `app/src/main/res/drawable-nodpi/warzone_branding.png`.

SHA-256: `44C3EA0942A7C31A49C5A5C9510414191FF06137C0B67089364593C66319D8C2`.

## Changes

- Application launcher and round-icon declarations now use the selected artwork. Adaptive XML keeps the square illustration within the central safe area, with a dark-green background layer.
- Android 12+ system launch screen displays the same adaptive icon.
- The long engine-loading screen now uses the complete illustration, FIT_CENTER, above a dimmed backdrop derived from that same drawable. API 31+ softens the backdrop with the native blur API; earlier supported Android versions retain a dimmed backdrop.
- A compact bottom strip shows the spinner/status and expands for engine failure text. The old large title/boxed card was removed because the artwork already contains the small title.
- The loading overlay consumes touches so hidden lobby controls cannot be tapped during startup. Startup automation and gameplay remain on the existing path.

## Native emulator evidence

Environment: Pixel_10_Pro AVD, API 36.1, WebView 158.0.8127.2, audio disabled. Native display 2560 × 1600, WebView 1280 × 800 CSS. Physical Samsung S8 verification remains pending.

- `launcher.png` and `launcher.xml`: the actual Pixel launcher shows the green tank artwork for Warzone Towers. The other Block Night package still has its own older icon.
- `launcher-cold-start.png`: cold launch by tapping Warzone Towers in the launcher shows Android's system splash with the new circular artwork.
- `splash-tablet.png`: the complete image, small baked-in title, full tank and tower are visible. Side space is filled by the subdued backdrop. The bottom status strip remains readable.
- `battlefield-after-splash.png`: normal startup completed and removed the native loading overlay, revealing the actual numbered-wave battlefield and working command toolbar.
- `startup-results.json`: the subsequent launcher cold start also reached gameplay; automatic facing occurred once and the current numbered-wave snapshot is present. No Android fatal exception was observed.

## Packaging and preservation

- Gradle assembleDebug passed for versionCode 41 / versionName 4.1-artwork.
- APK Signature Scheme v2 verification passed.
- All **439 packaged files under assets/** match the delivered v4.0 APK byte for byte, including the engine JS/WASM/data, scenario payload, supplied mod/map and mobile gameplay scripts.
- The change did not regenerate the selected artwork or replace any official Warzone assets.

References for Android resource handling: [adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive), [system splash screens](https://developer.android.com/develop/ui/views/launch/splash-screen).
