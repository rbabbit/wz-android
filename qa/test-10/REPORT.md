# Warzone Towers 0.10 — offline 1v1

Exact installed candidate: `d29a3e6e2e6da13a8eac6b2d6540b5c4070b39f0115de1dc44025822237a31b3`. All required final source, package-preservation, emulator and explicitly reviewed screenshot evidence passed. Source-archive creation remains gated on complete inventory, CRC and SHA readback.

The native launcher keeps Towers as its default and adds 1v1 vs Bot with Cannon or Rockets. The human and bot use opposite weapon branches plus shared technology. Research remains manually queued; production uses normal native power/time; the phone blueprint library is retained and incompatible designs stay unavailable. The 1v1 field shows branch, native elapsed time and own HQ status without wave controls.

The [Cannon journey](final-cannon/duel.json) and [Rockets journey](final-rockets/duel.json) verified branch-filtered research, manual queues, forbidden research/design/production rejection, retained MG blueprints, genuine visible truck selection, ordinary production/completion and menu returns. The [combat journey](final-cannon/combat.json) observed real selected-unit movement and ordinary native fighting. The [save/load journey](final-save-rewind/save-ordinary.json) restored a genuine native save, branch policy and working research/input.

The [victory](final-victory/save-victory.json) and [defeat](final-defeat/save-defeat.json) reports exercise authoritative native HQ outcomes and lifecycle handling using disclosed modified complete-save copies. They do not establish naturally won/lost matches.

The [native replay journey](final-replay-recovered/replay.json) observed the actual result-panel Replay, a distinct fresh battle with the same chosen branch, and Cancel/Return to the custom main menu. Any observer-readiness continuation is disclosed below.

The [native mode journey](final-modes/modes.json) covered default Towers, both 1v1 branch selections and returning to Towers in normal and compact/enlarged-text profiles. The [Towers header](final-towers-header/header.json) and [native dialog](final-towers-dialog/dialog.json) regressions replayed Build/Research/Factory/Design/Queue/Help, actual SystemUI Back, Cancel, direct main-menu return and a fresh session.

The package verifier confirms unchanged benchmark Towers JS/WASM/data/index/mobile, metadata-only differences in the separate Duel runtime, the unchanged64,424,618-byte official stock prefix and exact retained source embedding. Complete native source, authored map/attribution, Duel policy and reproducible package builder are retained. The frozen0.9 benchmark (`v0.9-benchmark`, commit `28fe51dc5725d5262b0302de10776ae1a37eb994`), older APK/source artifacts and separate v6.4 fallback remain preserved.

Earlier candidate/startup/transport diagnostics are retained as supporting evidence and are excluded from the passing delivery evidence.

Limitations:

- Verified on the Android emulator; a physical handset, hardware GPU/FPS, audio and HQ graphics were not newly tested.
- Both weapon branches used ordinary authored units, manual research and normal production. Sustained ordinary combat was observed in the Cannon-human/Rockets-bot journey.
- Victory and defeat handling used explicitly seeded complete-save copies with one Command Centre removed. These are native outcome/lifecycle checks, not naturally completed wins/losses.
- The Towers benchmark payload/maps remain byte-identical. Scoped Towers launcher/build/research/overlay/Back regressions were replayed; a complete30-wave run was not repeated.
- An earlier ordinary F8 preflight observed a stale clock packet. The passing final-save-rewind check required an actual native clock rewind, fresh command replies and restored research/input; the earlier transport/readiness attempt is diagnostic only.
- Black terrain remains visible on the software emulator, as in the preserved benchmark; native units, projectiles, orders, positions and map picking were observed. This is not a physical-handset rendering or FPS test.
- Replay readiness fixture continuation: Continued the already replaying native match after the original QA observer hit a20-second CDP transport timeout during engine loading. No additional Replay/engine input was sent. The same already-started battle was checked with a bounded90-second readiness transport; no additional Replay input or runtime change was used. The original20-second observer timeout is retained as diagnostic evidence.

Seeded fixture disclosures:

- A separate complete genuine QuickSave was copied in memory; only the enemy Command Centre entry was removed from struct.json, then loaded with native F8. This exercises authoritative native HQ detection and result/menu handling; it is not a naturally won/lost match.
- A separate complete genuine QuickSave was copied in memory; only the human Command Centre entry was removed from struct.json, then loaded with native F8. This exercises authoritative native HQ detection and result/menu handling; it is not a naturally won/lost match.
