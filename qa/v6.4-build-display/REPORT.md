# Towers v6.4 — build display fixes

Exact delivery APK SHA-256: 12532300d9ce2010b911fae879a6e197eb059a98bd672901bd65307cd9f3532a

The previous v6.3 APK and complete source remain unchanged at their delivery paths and in C:/timerApp/_backups/towers-v6.3-before-build-display-20261106.

## The four requested changes

1. Actual accepted queued sites appear as translucent 3D wireframe building ghosts, with matching numbered markers. An active foundation keeps its site marker while the real engine renders construction. Completed/cancelled plans stop drawing their ghosts.
2. The selected placement preview uses the original building and weapon meshes, rather than a flat rectangle and floating name/cost. Accepting an order replaces the temporary preview with its numbered queued ghost.
3. Site numbers remain attached to native job IDs as the queue advances. Rows show coordinates, status and remaining time; pending and completed counts are labelled separately. Native completion records are deduplicated in the display.
4. The catalogue measures the available height and full title height, displays complete rows, and snaps scrolling to row boundaries. Building names remain readable at the top, after a real swipe and at the bottom.

This remains the existing HTML/CSS interface over the unchanged game engine. The new canvas is a display-only projection of 173 original PIE meshes assembled into 165 structure models; it never sends input or construction commands. All 164 catalogue buildings have original geometry. The renderer reads the observed camera matrix and terrain height, leaves native minimap input available, and hides behind command/help/research pages.

## Scope verification

Byte comparisons against v6.3 confirm unchanged construction scenario code, queue/worker/order functions, movement/input code, research/production/design/template code, Android Java/classes, compiled engine/WASM/data, maps/mods and other assets. Existing CSS is preserved with building-only additions. Runtime changes are the build display/controller metadata, read-only terrain accessors, building CSS additions, two display assets and release version. All 17 existing saved templates remained present after update.

## Emulator evidence on the exact APK

- Reused a complete ordinary native eight-site QuickSave, byte for byte. No units, power, research or edited world state were seeded. Fresh native replies verified the restored context.
- Eight Mini-Rocket Towers plus two real touch placement orders (Mini-Rocket Tower and Heavy Machinegun Guard Tower) completed. Native saves confirmed every actual structure position and full build points.
- Selected and queued original models were inspected on actual screens. Queued ghosts stayed anchored after native minimap navigation; projected positions agreed with the observed terrain projection within one CSS pixel.
- Full queue rows kept the same site numbers after completion and included coordinates. Counts distinguished pending and done. The completed scene had no remaining queued ghosts.
- Wide 2400x1080, phone 1080x600 and Android font-scale 1.3 profiles passed full-card/title checks, including a real scrolling swipe and the catalogue bottom. Checks waited for observable scroll settling.
- Two help/keyboard/build return cycles passed. Actual Android IME visibility was checked before Back. Native pause/resume was checked after construction completion.
- On Dustfall, two ordinary authored trucks completed a guard tower and cyborg factory on the raised platform. The factory ghost's actual 1x2 footprint and world position matched the native foundation at [960,8832,510]; its observed terrain height was exactly 510. Both completed ghosts cleared.
- The emulator was left paused. No new physical-device or whole-game regression claim is made.

## Actual screenshots and records

- [Numbered queued building models](01-eight-queued-models.png)
- [Selected original model during a held Android touch](selected-green-model-confirmed.png)
- [World-anchored models after minimap movement](03-world-anchored-after-radar.png)
- [Queue identities and locations](04-identifiable-complete-queue.png)
- [Full phone catalogue rows and names](05-catalogue-phone.png)
- [Enlarged-text catalogue profile](05-catalogue-enlarged.png)
- [Raised-platform factory ghost](td1-raised-models.png)
- [Completed sites, zero pending ghosts](07-finished-count-no-ghosts.png)
- [Full hashed test summary](summary.json)

Known black terrain in the SwiftShader emulator remains unchanged. Wireframe blueprint geometry is intentional; this does not replace the native renderer or alter finished building graphics. Combat, research and tank production received no new emulator gameplay pass in this display-only change; their code and assets were verified unchanged.
