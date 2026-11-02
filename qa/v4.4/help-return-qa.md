# Warzone Towers v4.4 HELP return verification

final result: passed (emulator regression checks)

Version 4.4-help-return, code 44. The user's report was specifically HELP →
BACK TO BATTLE leaving a running game with missing interface/controls.

## Fallback before edits

Saved `C:/timerApp/_backups/warzone-towers-v4.3-before-help-fix-20261102-220111`.
The APK copy and all 639 archived source files were verified. SHA256.json and
source-manifest.json accompany the snapshot. Original delivered v4.3 files
were preserved.

## Implementation

- HELP uses a normal, fixed app overlay with role=dialog and aria-modal, instead
  of a browser-native modal. While open, the command header and engine iframe
  are inert. Closing restores their previous interaction state.
- CLOSE, BACK TO BATTLE and Escape share one return action. It hides the overlay,
  releases transient gestures/keys, restores the host's battle layout and header,
  resets scroll offsets, reveals the toolbar and focuses the canvas on the next
  frame. Reopening before that frame cannot steal focus into the engine.
- Keyboard Tab stays within HELP. Closing does not depend on browser-native
  dialog focus restoration. The host grid is fixed to the screen.
- All 440 APK assets were compared with v4.3: 437 are byte-identical. Only the
  touch wrapper, mobile host page and wrapper theme CSS changed. The complete
  engine JS/WASM/data, wave/mod/map assets and branding remain unchanged.

## Tests

A separate AVD was used so the existing emulator session was not interrupted.
API 36.1, WebView 158.0.8127.2, audio disabled. The additional host-GPU instance
crashed, so final tests used software graphics at 1280x532, density 160. These
are actual Android WebView taps/swipes, not only DOM button.click() calls.

- The v4.3 baseline passed three tablet-size and three phone-size touch returns.
  **The reported disappearance was not reproduced on the emulator.** The new
  implementation is a targeted hardening of the return flow, not a confirmed
  reproduction/fix of the user's exact device failure.
- The v4.4 APK passed six actual HELP → scroll → bottom BACK TO BATTLE cycles.
  At 1280x532, HELP content was 780px tall within a 498px scroll area. Each test
  scrolled 282px to reach the actual bottom button. See help-probe-results.json
  and v44-first-return-tests.json.
- After every return, host and child scroll offsets were zero, the toolbar was
  visible and inside the header, the engine canvas filled its 1280x482 viewport,
  both interaction regions were no longer inert, and focus returned to canvas.
- The final three cycles also performed a real camera pan and tapped a top zoom
  button after each return. Native engine acknowledgements confirmed CLOSE=1600,
  MAP=3600 and BATTLE=2600. Pan count increased from 0 to 3, no key remained held,
  and no gesture remained active.
- An actual tap on the bottom Build button opened the native structure list and
  constructor panel. native-build-menu-after-help.png shows both native panels,
  the top toolbar, wave status and minimap present after all return cycles.
- Runtime exception trace was empty. Nine existing regression scripts passed.
  Gradle build and APK signature verification passed.

Physical Samsung tablet confirmation remains pending. The existing emulator
dark-terrain rendering issue is separate and was not changed in this release.
