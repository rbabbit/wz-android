# Warzone Towers 0.8 verification

Verification passed on the exact installed candidate. Delivery archive packaging is separately gated on complete source-inventory, CRC and SHA readback.

- Version 0.8, code 8; app ID remains `com.rbabbit.warzonetowers.lab`.
- Candidate SHA-256: `751c90f6bb2ec1c1ec2286fabe1e499bc95234e2a2ce8198f763e1876098a3e0`.
- Scope: selected research option 3—large real topic pictures on the left, compact selected topic in the middle, active research/queue on the right, horizontal lab/filter strips—and a black return confirmation with white text/actions.

## Research gameplay and layout

The [research journey](research/research.json) passed using fresh authored Iron Valley, its four actual laboratories and existing level-one modules. No units were granted or world positions edited. Topic selection did not start research; explicit ADD controlled assignment. Queue removal, duplicate prevention across labs, a second lab researching, repeated panel returns and restored gameplay input passed. Native completion unlocked `Body5REC`; the laboratory's next actual target was `R-Vehicle-Engine03`. Native F7/save observations corroborated the wrapper state.

Real images and accessible ADD controls fit both the compact 854×480 profile with font scale 1.3/UI scale 1.4 and the wide 2400×1080 profile. Overflow was exercised with the **four real lab buttons**, constraining only their DOM strip to 140px: an actual swipe scrolled it 82.67px and Lab 4 remained selectable. This was a UI overflow fixture, not a test with fifteen native laboratories.

Fixture diagnostics are retained in the raw report: the initial wide override produced a portrait letterbox and was corrected to the established landscape override. Artificial fifteen-button DOM nodes were automatically reconciled to the native four, so the real-button narrow-strip fixture replaced that attempt. Testing continued on the same valid native state and exact APK; these fixture corrections required no runtime changes or unrelated full rerun.

## Actual Android Back and dialog

The [dialog journey](dialog/dialog.json) passed six actual SystemUI Back-triangle taps, with live navigation-pixel readiness checked before input. Five dialogs were observed; three cancellation paths included cancelling with actual Android Back. Return opened the custom main menu, a new battle started with working input, and saved-game/design bytes were preserved.

Pixel review found white title/action text, no teal text, and approximately 94% black dialog area. Both native action targets measured 88×48dp. Confirmation routing and gameplay behaviour remain the existing paths.

## Source and preservation

All seven [focused code checks](code-checks.json) passed. The [package/preservation verifier](package-verification.json) passed: same app ID/signature, unchanged compiled engine, stock assets, pickers and touch code. Runtime changes are limited to the two research files, Activity dialog presentation and version metadata. All 32 preserved artifact records passed; the v6.4 fallback remains clean with 4,916 manifest files verified. The prior 0.7 APK, complete source and checksum were copied and hash-checked in the [initial fallback](../../../fallbacks/towers-before-layout-0.8-20261107/).

## Delivery gate and limits

APK/source packaging must use the verified candidate hash above and pass the archive inventory, CRC and SHA readback before delivery. This report does not assert that an unfinished archive exists; final delivery hashes belong in the generated checksum file after that gate passes.

Testing used the API 36 emulator. A physical handset was not tested for 0.8. Pre-existing black emulator terrain remains with the unchanged engine. No full thirty-wave, HQ terrain or audio validation is claimed.
