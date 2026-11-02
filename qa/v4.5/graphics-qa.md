# v4.5 graphics/download verification

Date: 2026-11-02. Version: 4.5-graphics-choice, code 45.

## Saved fallback

Before edits, a fresh 662-file source archive, per-file hash manifest and v4.4
APK were saved and verified in
`C:/timerApp/_backups/warzone-towers-v4.4-before-graphics-20261102-224641`.
The delivered v4.4 APK/source ZIP are also preserved.

## Hosted extra

- Owner's existing VPS: krishna.org.uk; existing game files/config untouched.
- Pack: https://krishna.org.uk/game/graphics/hq-v3/high.wz
- Manifest: https://krishna.org.uk/game/graphics/hq-v3/manifest.json
- Official source: https://github.com/Warzone2100/data-terrain-high/releases/tag/v3
- 99,639,408 bytes (95.02 MiB).
- SHA-256: `a16a06c2a6b68e86a03934240880ec0b0fd72666606af3bf12ed5ffda7734f0e`.
- Public full GET matched the official pinned size/hash. A request for bytes
  1310720-1310751 returned HTTP 206, the exact Content-Range and 32 bytes.
- Official COPYING, COPYING.NONGPL and COPYING.README accompany the pack.

The APK does not contain the extra archive. Native Android downloads and hashes
it in a background worker. The engine receives the verified local archive at its
existing `/data/terrain_overrides/high.wz` path; official engine code is untouched.

## Actual Android tests

Separate Warzone_Help_QA_220604 AVD, emulator-5556, API 36.1, WebView
158.0.8127.2. Audio disabled throughout. The other emulator was not operated.

- Normal selected by default; native Start Battle reached the real game with
  terrainMode=1, no archive and no HQ reads.
- After disabling Wi-Fi and mobile data, a failed HQ request displayed a friendly
  connection message, Retry Download and the selectable Normal card. Normal then
  reached the actual battlefield offline: `normal-offline-gameplay-results.json`.
- Cancel Download stopped the transfer and retained a 1,310,720-byte partial.
  Restart/update preserved it; retry with connectivity restored completed the
  download and SHA verification. The final cache file was exactly 99,639,408 bytes.
- High Quality launched actual gameplay with terrainMode=2, 212 archive opens
  and 42,113,022 native bytes read from high.wz:
  `high-online-gameplay-results.json`.
- Wi-Fi/mobile data disabled again; a new launch remembered High Quality and
  showed Downloaded / Ready offline with Start Battle. Cached High Quality
  reached the battlefield offline, with the same native archive use:
  `high-offline-gameplay-results.json`. The preparation dialog was dismissed
  with a real Android tap; the toolbar, map objects and minimap were present.
- Native chooser visually inspected at 1280x532 and 1280x800, density 160.
  Evidence: `graphics-choice-normal.png`, `graphics-choice-high.png`,
  `hq-cached-offline.png`, `graphics-choice-tablet.png`, progress/paused/error
  screenshots. Artwork fills both viewports and the CTA stays inside the screen.
- Additional emulator display-size changes were rejected by automatic approval
  review (only reason: blocked by policy). The premature 800x360 capture was
  discarded; no reliable compact-phone size check is claimed.

## Regression and preservation

Gradle assembleDebug passed. All ten `tools/test-*.cjs` scripts passed: new
graphics loader success/original-byte mounting/failure blocking, research queue,
touch/zoom, AI, camera, objective, incremental logs, wave deadline, supplied
Survival spawner and native zoom rules.

`asset-preservation-results.json` compares the final APK with delivered v4.4:
439 existing assets are identical. Only wrapper index.html changed and
graphics-loader.js was added. Complete engine JS/WASM/data, supplied map/mod and
existing branding are unchanged. The optional archive is not inside the APK.

## Explicit limits

The emulator has an existing black-terrain rendering issue in Normal and High
Quality, also present in v4.4. Host and SwiftShader rendering both showed it.
The actual extra archive is mounted/read and the native quality mode is selected;
this does **not** establish a visually correct HQ terrain result on this emulator.
There was also an emulator System UI ANR during software-renderer boot, dismissed
before the completed offline test. No Android app fatal exception was observed.

Physical Samsung S8/tablet compatibility and visual improvement still require a
physical-device test. Normal remains selectable on each launch. The unrelated
reported +Q deselection issue was not changed in this release.
