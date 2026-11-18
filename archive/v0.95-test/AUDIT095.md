# Hub Watch Replay 0.95 — focused test record

Status: the focused replay, navigation, preservation and cleanup checks below are recorded for the exact candidate1 APK. This is not a claim that every public replay is playable. Source/delivery identity receipts are maintained separately by root.

APK SHA256: `4e9492ce31cab58baeae6927e43a5363b15304076fac1e342abe3faf3fffb253` (730,744,002 bytes). Normal signer: `4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15`. The 2,046 APK assets match the frozen build source; the input inventory contains 2,121 files (`09-candidate1-integrity.json`, `build-candidate1-sources.json`). Root reports no source changes after this APK was built.

## Requested behavior and baseline

Hub match details gain Watch Replay. Opening it shows only the battlefield, minimap and replay/camera controls. Statistics, research tables, graphs, analyzer/upload panels and the external site's navigation are absent from the viewer. Native Back returns to the existing Hub page.

The actual0.94 Hub match screen had no Watch Replay action (`05-baseline-match-observed.png`, `05-baseline-match.xml`); its existing public data model already retained replay URLs. Original/prepared save fingerprints were recorded before installing the candidate (`04-baseline-preserved-saves.json`). Only a normal test APK is authorized. No AAB, VPS/feed upload, GitHub or Google Play publication.

## Observed on the exact APK in owned emulator5562

- A real Hub match opened the actual Retropaganda replay `1794989715726`, mapped to confirmed public analysis8068 and decoded replay identity `2965375dc91b0a1e939bc4fb8952e6599370819e019cb8d2e1f439060ab842da`. The viewer reported632 recorded position frames, active/presented3D, loaded terrain/tiles and model definitions. The screenshot and visible-DOM inspection showed the battlefield/controls without statistics or graphs (`13`, `14`, `15`, `16`). This used live public replay data, not synthetic frames or a seeded match.
- A real pause touch stopped playback; time99,000ms and the recorded frame at96,002ms remained identical across reads (`17`, `18`, `19-exact1-pause-stable.json`).
- A real timeline touch sought to280,700ms. The displayed frame at279,002ms contained161 droids and149 structures, matching an independently decoded, unmodified public position frame (`20`, `21-exact1-seek-native-frame-proof.json`). No product-data injection was used for the comparison.
- Real touch exercised zoom, minimap positioning, canvas drag/pan, rotation, speed and play. Camera offsets changed after drag. At selected2× speed, replay time advanced from280,733.364ms to283,833.364ms and its displayed object frame changed (`22`–`29`). The record proves advancing playback and the selected speed; it is not a long-duration timing benchmark.
- Native selection changed the view to2D and then back to a settled3D presentation with terrain and models (`30`–`37`). The2D snapshot is transitional/loading; a separate settled2D visual result is not claimed from that snapshot alone.
- The quality menu was exercised using its actual focused Android popup, followed by minimap collapse/restore and camera reset (`48`, `49`, `50`–`52`). The later compact DOM check independently confirmed quality Low (`79`). Earlier helper attempts before the popup had focus were fixture failures; they do not establish a product failure.
- Actual Android Recents returned to the retained Hub viewer, with playback ready, no reported viewer errors and632 frames. Native Back then removed the iframe and restored the same match detail with Watch Replay (`65-exact1-recents-resume.json/png`, `66-exact1-return-same-match.json/png`). A prior plain `am start` test created an additional standard MainActivity instead of resuming the original; that extra activity was dismissed normally. It was a test-navigation issue, not evidence that the app lost its original Hub state.

- Reopening the first replay and pressing native Back while it loaded restored the same original match instead of leaving a loading overlay (`67`, `68`).
- Native text entry delivered the observed partial query Noo. Keyboard Back dismissed the keyboard while retaining that actual query (`69b`, `69c`). A synchronous real Android tap then opened the second matching replay after the earlier asynchronous tap missed during the IME transition (`69e`, `70`). Full Noobi1Kenobi text entry is not claimed; no product fix was made for this input-fixture issue.
- With the owned emulator's Wi-Fi and data disabled, the second replay reached a bounded error with no fabricated frames and no pending requests (`71`–`73`). Both settings were restored to their original enabled values (`74`). A real Retry touch loaded source1794987496444/analysis8064, decoded identity7846a7e09155bc9b9455cf23677067fe9854a99a8b08c17462297bca6808ad03, with395 recorded frames, ready/presented3D, terrain/tiles and an empty error list (`75`, `76`). This verifies network failure/recovery, not every unsupported or unprocessed-record variant.
- At actual1280×720, density320, the viewer CSS viewport was640×340. Eleven visible controls fitted, page scroll dimensions matched the viewport and analytics had zero layout rectangles. Low quality was selected; an actual compact zoom touch worked (`78`–`80`). Native Back restored the second match, then Results restored the original Noo query (`81`–`83`). An earlier assertion expecting that query on the match route was incorrect: the query belongs to Results history. No app source change was required. The original owned display was restored (`84`).

## Preservation, cleanup and delivery

- Normal Back from Hub returned to Home (`85-exact1-normal-home.json/png`).
- The installed APK rehashed to `4e9492ce31cab58baeae6927e43a5363b15304076fac1e342abe3faf3fffb253`. All seven baseline original/prepared save files remained byte-for-byte identical, including Campaign, Towers, FFA, the earlier repair fixture and all three Survival saves. Original network settings were restored to Wi-Fi/data enabled. The owned display was restored to1080×2400 with density override reset to physical480 (`86-exact1-final-preservation-identity.json`).
- The external helper was stopped/uninstalled and its port forward removed. Ordinary launcher MainActivity was opened without instrumentation (`87-helper-cleanup.json`). Screenshot88 captured only a transient splash; the actual final Home was separately observed in screenshot/XML89 as v0.95 (`89-clean-final-home.json/png/xml`).
- Normal test delivery: `C:/timerApp/Warzone-Towers-0.95-Test.apk`, expected exact SHA256 `4e9492ce31cab58baeae6927e43a5363b15304076fac1e342abe3faf3fffb253`,730,744,002 bytes. Root verifies the copied file and final source-input identity separately.
- No new source ZIP was requested for this APK-only delivery. The complete isolated current build source remains at `C:/timerApp/candidates/hub-replay-test-0.95-20261118`; existing0.94 APK and complete fallback source ZIP were preserved. No AAB, VPS/update-feed upload, GitHub or Google Play publication.

No product source changed during these exact-APK checks. No further runtime test is required by this record; stated limits below remain explicit.

## Limits

The browser3D replay depends on recorded position telemetry from the public replay-analysis service. The presence of a raw replay link does not establish available3D analysis. A known raw replay lacking processed analysis and every missing-record/error variant were not separately exercised. Native game execution, later Survival waves, every historical replay, physical-phone performance and long-session stability are outside these focused Hub checks.

Raw Retropaganda replay responses for the selected fixtures were verifiedHTTP200 and genuinely Brotli encoded. Their wire SHA differs from the decodedWZrp identity. Public fixture provenance and independent frame summaries are retained in `PLAYABLE-REPLAY-FIXTURES.json`, `RAW-REPLAY-PROVENANCE.json` and `REPLAY-CONTROL-NATIVE-ORACLES.json`. No device or product edits were made by the documentation/fixture-preparation agent.
