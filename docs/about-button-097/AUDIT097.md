# Compact About button test 0.97

The About action is visually smaller in the same top-right corner. Text decreases from 14sp to 11sp; the ordinary visible face decreases from 72×32dp to 48×22dp. The retained 56×48dp touch target includes invisible padding, so the control remains easy to tap. At larger font scales, the face can grow to contain its text. The existing 72dp tagline clearance preserves adjacent layout.

Exact normal APK SHA256: `da6a3df8bd4bc794d13b9b3be7733d0eb49bd7035bccd19ba4b1175bd3ec4289`, 731,578,183 bytes. Normal signer remains `4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15`.

## Observed checks

- Actual 0.96 Home and relevant code inspected before editing; the 0.96 APK and source remain preserved.
- Exact delivery APK installed in-place in owned emulator 5562 and observed in an ordinary non-instrumented launch. No target app uninstall, data wipe, gameplay fixtures or seeded units.
- The 2400×1080 Home screenshot shows the smaller face and text. Native touch bounds are 168×144 physical pixels (56×48dp); the visible face is 144×66 pixels. Both the visible centre and invisible lower padding opened About. Page Back and Android Back restored Home.
- A 1280×720 cold launch with density 320 and font scale 1.3 was inspected visually. The smaller label remains readable and unobstructed; About opens and Back returns.
- All six mode buttons and the tagline have the same phone bounds as 0.96 in actual UI XML. The version label changes to 0.97.
- Gradle assembleRelease and lintVitalRelease passed. All 2,173 existing assets, including every replay/minimap and licence file, remain byte-identical. Only HomeModesView.java and version metadata differ among 2,249 app/build inputs.
- The full installed base.apk SHA equals the delivered APK. The original display override 1080×2400, physical density 480 and font scale 1.0 were restored. Wi-Fi/mobile toggles remain 1/1, no external helper is installed, and final ordinary Home was observed.

The replay screenshot was discussed only: its circled element is the minimap. The user said no work yet for that change, so all Hub/replay code and assets remain unchanged. No physical-phone test or unrelated gameplay, licence, network or Recents suite was rerun for this small visual adjustment. Existing 0.96 public-release licence and source-access limitations remain documented in the retained prior audit.

Local normal APK and complete corresponding source only. No VPS/feed, GitHub, Google Play or website publication; no AAB. Emulator 5558 and retained 5560 data were not operated.
