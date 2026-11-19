# Hub replay without minimap — normal test 0.98

The replay page no longer contains the minimap canvas or its toggle. The main battlefield and existing playback/camera controls remain. The renderer skips minimap drawing and interaction setup when the canvas is absent. Main stage dimensions, camera defaults and controls are unchanged. The smaller About button from 0.97 remains included.

Exact APK SHA256: `4b8385ab5add3a6bb765fa556b772b5f140287f8efd77f259f24b44b4ac0d554`, 731,577,947 bytes. Normal signer: `4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15`.

## Observed verification

- Reproduced the visible minimap in the actual 0.97 Hub replay before editing. Previous APK/source and prepared saves remain preserved.
- Built and installed the exact normal 0.98 APK in-place on owned emulator 5562. Gradle release assembly and vital lint passed; JavaScript syntax passed. No target app uninstall or data wipe.
- Opened public replay `1794989715726` through Home → Hub → match → Watch Replay. Its raw identity is `2965375dc91b0a1e939bc4fb8952e6599370819e019cb8d2e1f439060ab842da`; it provides 632 recorded position frames. Real terrain and unit/structure models rendered in 3D, and 2D also rendered, with no replay errors. No minimap or toggle elements remained in either view.
- Playback time advanced, pause held time and the speed control changed to 4×. A real timeline seek matched unit/structure counts from independently decoded, unchanged native replay telemetry at the observed time.
- Zoom in/out, rotation both ways and reset changed the observed camera correctly. An actual drag starting in the former minimap corner reached the main battlefield canvas and changed camera offsets. The former overlay no longer intercepts input.
- Native 2D/3D and quality selections worked. Medium quality rendered, Low was restored, and the prior replay preference string was restored exactly, including its stored `minimapCollapsed:false` setting.
- Inspected screenshots and control bounds at 2400×1080 and compact 1280×720. Visible compact controls were unobstructed and within the viewport; the zoom slider remains intentionally hidden by the existing compact stylesheet, while its minus/plus controls work. Back remained visible.
- The visible Back button returned to the same match. Reopening that real replay still showed no minimap despite the saved non-collapsed preference. Repeated Android Back returned through match, results and Home.
- All seven retained saved-game archives remained byte-identical. The installed base.apk hash matches the delivered APK. Original size override 1080×2400, physical density 480, font scale 1.0 and Wi-Fi/mobile-data settings were retained/restored. The external helper was removed; a final ordinary, non-instrumented Home launch showed 0.98 and the compact About button.
- Independently compared all 2,249 app/build inputs with 0.97. Only three replay asset files and version metadata changed. Asset names remain 2,173; all 2,170 other asset files are byte-identical, including gameplay and licence content.

## Test boundaries and fixtures

The test used real public replay data, actual Android touch input and a separate instrumentation helper for read-only DOM/native state observation. No units were seeded, no replay frames or positions were fabricated/injected, and no app-specific fake rendering fixture was used. Popup focus was initially sampled before it settled; subsequent choices waited for the actual focused popup. A zero-duration adb tap during dismissal and another after compact zoom did not activate their controls; settled/70ms Android touches at the same measured targets worked. These were QA timing corrections, with no additional product changes.

This is focused emulator verification, not a physical-phone acceptance test or a complete 31-minute playback run. Unrelated gameplay, licence, carrier-network and Recents suites were not rerun for this scoped change. Existing public-release licence/source-access limitations remain recorded in the preserved 0.96 audit.

Local test APK and complete corresponding source only. No AAB, VPS/feed change, GitHub, Google Play or site publication. User session 5558 and retained pilot data 5560 were not operated.
