# Towers v6.3 — building interaction

Delivery APK SHA-256: 4af89fe1e9ac2719f534459d6d8081a8b7b6b918dec21c5c3c63231a05576eae

The exact installed APK passed the attached emulator checks. This remains the HTML/CSS interface over the existing native game engine. The v6.2 APK and complete source are preserved unchanged in C:/timerApp/_backups/towers-v6.2-before-smooth-building-20261106 and at the original delivery paths.

## Changes limited to construction

- Structure choice stays local and immediate, using the existing validated queue-build/native construction orders instead of opening and clicking through hidden stock widgets.
- The engine viewport stays at its normal size. No captured battlefield frame covers selection, repeat selection, item changes or exit.
- The native minimap remains visible and usable during placement. Navigating it retains the chosen structure; the redundant MAP control that cancelled placement is removed.
- Constructor grouping, FIFO work, module progress, explicit STOP, and manual movement overriding construction are preserved. Preview cleanup and stale blocked-site messages are cleared in that building flow.

The byte comparison confirms unchanged research, production and saved-design handlers, HTML/CSS layouts, Android Java implementation, stock resources, compiled engine/WASM and authored maps/mods. Runtime changes are the two building/input scripts, construction-only scenario code and its embedded package/index, plus the release version. All 17 existing saved templates remained present after update.

## Observed checks on this APK

- Iron Valley, phone-sized 1080x600: BUILD followed immediately by an item tap; repeat bunker selection; switch to tower; native minimap use; two bunkers and a tower completed in FIFO order at (8,40), (9,40), (9,42). Actual native orders and completed build points were inspected.
- Two help/keyboard/Back cycles, two native pause/menu returns, occupied-site rejection, a successful subsequent order, automatic exit and normal module construction. The native factory reached two completed modules.
- Wide 2400x1080: STOP cancelled active/pending construction; building worked afterward. Real native movement cancelled queued construction and the queue stayed cancelled after movement; a new tower then completed. The rendered closing state was additionally checked twice after waiting for native frames, with sidebar and preview visibly cleared.
- Dustfall: first selection from a fresh launch before terrain/radar warmup, then two authored platform trucks built a guard tower and cyborg factory on reachable validated sites. Native completion was verified.
- Sampled viewport/canvas dimensions remained fixed throughout construction, no frozen overlay appeared and no automatic zoom commands were generated. First-launch choice handling was 38.3 ms; the three mixed-queue click handlers took 25.6, 32.9, 5.5 ms. These measure selection handling, not total touch/display latency or a physical-phone frame-rate benchmark.

The final relevant checks used the same installed APK checksum, ordinary authored units, real Android touches and native saves/orders/positions/completion. No units, power or research were granted. The emulator was left paused.

## Evidence and limits

- [Live phone placement with minimap](04-mixed-queue.png)
- [Native-completed mixed structures](06-completed.png)
- [Actual Android keyboard return](returns-keyboard-1.png)
- [Live module construction](returns-module-progress.png)
- [Dustfall platform construction](td1-live-mixed-builds.png)
- [Dustfall completed tower and factory](td1-completed.png)
- [Rendered wide return after closing](wide-final-clean-return.png)
- [Signed APK, fallback and complete test record](summary.json)

Known black terrain in the SwiftShader emulator remains visible. No terrain/graphics change or physical-device performance claim is made. Combat, research and tank production were outside this building-only change and were not given a new gameplay regression pass.
