# v4.6 Music and input verification

Final native run: passed on the installed APK identified in `test-environment.json`.
Do not treat prototype captures as release passes.

The frozen v4.5 APK and a verified source snapshot were saved before edits at
`C:/timerApp/_backups/warzone-towers-v4.5-before-music-20261103`.

## Method

`tools/queue-audit.cjs` sends actual Android touches, plus trusted WebView touch
events for rapid/multi-finger cases. It requests a fresh native F7 QuickSave,
requires the file modification time to advance, and reads the native droid order
lists, structures, camera position/rotation and wave state. It also waits for
native simulation to advance again before the next gesture. A wrapper tap
counter alone is never proof that a truck received construction orders.

The final logs are `final-pancheck-run.log`, `final-music-run.log`,
`final-music-back-run.log`, `final-matrix-run.log` and `final-extended-run.log`.
`test-environment.json` identifies the APK, AVD, WebView and silent audio setting.
`queue-matrix-results.json` and `extended-results.json` summarize the native
snapshots. The corresponding `matrix-*.json` / `extended-*.json` retain raw saves.

## Input cases

The audit covers one and six selected trucks; selecting a machine-gun tower
once and placing repeatedly; switching once to a cannon hardpoint; occupied,
edge and held taps; rapid touch bursts; touch cancellation; one-finger pan;
pinch; all three acknowledged camera presets; two-finger horizontal pan and
vertical tilt; a blank-header tap; ten minimap taps; repeated scrolled HELP
returns during a real wave; TECH return; and stopping all originally selected
trucks. Native heading must remain unchanged through minimap and gesture cases.

The expanded tests found two additional defects: parallel horizontal pointer
updates could lock into pinch before the second finger updated, and Skip Wave
could lose its compatibility click after cancelling pointerdown. The wrapper
now batches multi-touch updates before classifying them, and the wave button
executes on touch release with duplicate-click suppression.

The final six-truck run accepted six initial machine-gun build intents per truck,
then queued cannon hardpoints after one defence selection. A failed earlier
audit skipped opening the actual truck stats and used unbuildable tiles; its
test sequence was corrected after inspecting the real native menu. Valid and
invalid placements are distinguished using the native saved orders.

## Music and downloads

The original pack contains 55 unchanged files: four albums, 39 album tracks and
the menu theme. Its SHA-256 is
`602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd`.
The native download was cancelled at 71,696,384 bytes, remained paused at that
length, resumed and produced the exact 114,721,578-byte verified archive.
`music-download-paused-ui.json` and `music-download-complete-ui.json` record the
native controls. Runtime downloads use only the owner's VPS; redirects are off.

Cached Music started with Wi-Fi/mobile data disabled and Android reporting
`Active default network: none` (`offline-network-state.txt`). The native manager
reads all four original album descriptions, opens selected original Opus tracks
and streams their bytes. The audit also scrolls to and plays a different album,
then returns with both the header action and Android Back.

Music waits for observed native rendering and delivered touch-up events before
advancing stock menus. Browser animation callbacks can run between engine
worker frames. Frame observation delegates every WebGL call unchanged; its
regression checks reject offscreen/depth-only passes and verify delegation.
Album-cover reads are diagnostics and can be absent when textures are cached.

## Integrity and limits

`engine-integrity.json` compares the candidate against the frozen v4.5 APK:
official compiled code and WASM match, the old data prefix is intact and 3,281
resolved assets are unchanged. Only the custom scenario STOP bridge is appended
and reindexed. The supplied mod/map, original roster, research choices and
branding are preserved. `apk-signature.txt` records APK v2 signature verification.

The emulator still has pre-existing black terrain and slow cold rendering.
The final tests use SwiftShader without a desktop window: host graphics hung,
then failed during restart, while Android and the installed APK ran successfully
with software rendering. All gameplay touches still pass through actual Android
WebView. Screenshots come from the emulator framebuffer.
Music tests use `-no-audio`; audible output quality, HQ visual improvement and
physical Samsung tablet compatibility remain unconfirmed. The 800×600 CSS host
uses an 800×506 battlefield. `header-layout.json` checks command/wave overlap.

The `prototypes/` directory and other diagnostic images record earlier attempts,
including failed STOP/input/navigation experiments. They are not final passes.
Old checks that reused a stale QuickSave or failed to map the actual app window
are excluded. Temporary CDP endpoints and emulator runtime/authentication logs
are kept out of Git and release ZIPs.
