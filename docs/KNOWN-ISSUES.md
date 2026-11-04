# Known issues and verification limits

v5.3 fixes the reported header clipping protection, live research/ordered queue
visibility and overlapping builder window. The exact delivery APK passed the
finite emulator flows at 1280×576, 1080×600 and 1600×720 in
[the v5.3 report](../qa/v5.3/REPORT.md). Research time/progress are labelled
estimates based on simulation time and upgraded lab rates, with native
completion authoritative. Native UI scale was 100%; wrapper control sizes
Standard and Extra large were checked. The physical/HQ/audio/Save-Load limits
below remain.

v5.2 implements the command-page redesign, top BUILD structure choices, MORE
removal, integrated component buttons, stable header and native selection/queue
fixes. Both emulator sizes passed the finite flows in [the v5.2 report](../qa/v5.2/REPORT.md).
Research's 408 files are identical to the frozen v5.1 APK.

Future build orders remain native battlefield blueprints; QUEUE lists current
construction and factory jobs. A copied native QuickSave test fixture failed to
restore the custom scenario context; that fixture was abandoned. Native
Save/Load is not certified. The fifteen-constructor selection fixture uses
stock debug cloning only in the owned emulator; ordinary production is tested
separately. Physical-device, HQ rendering and audio limits below remain.

1. **BUILD physical retest:** v5.0 replaces the default custom FIFO with native
   construction selection and native queued blueprint rendering. Nearby-group
   selection, placement completion/exit, normal unit movement and production
   returns passed the versioned v5.0 emulator audit. The persistent field
   console and changed construction UI still need a physical-device retest.
   Historical v4.9 evidence follows; it does not certify v5.0's new input flow.
   v4.9 fixes ignored mouse/pen placement, tolerates
   small placement-touch drift, and recognizes optimized terrain shaders. Real
   emulator tests completed automatic FIFO defences and a 2x2 facility, and
   verified native mouse/pen/touch-drift jobs. The physical finger-placement
   report has not been reproduced on the user's hardware.
   v4.8 replaces the native sticky +Q route with an
   always-queued BUILD catalogue and explicit native FIFO scheduling. Native
   structure completion, one/six-truck assignment and factory production were
   checked on the emulator. The new controls need a physical tablet retest.
   v4.6 corrected the earlier unrelated-tap input path and verified
   actual native queues for one and six trucks, two defence types, rapid taps,
   occupied/edge/held taps, cancellation, tilt, minimap and HELP/TECH returns.
   STOP is acknowledged by the native scenario and clears the selected trucks.
   These cases passed on the emulator; the user's tablet still needs a retest.
2. **Physical Samsung tablet:** an earlier APK installed but reported that the
   battlefield was not ready in time. Updated physical-device startup has not
   been confirmed. Do not describe emulator testing as tablet certification.
3. **HQ appearance:** the official pack is downloaded, checksum-verified,
   mounted and read by the engine with terrainMode=2. The emulator has black
   terrain in both Normal and High Quality, including software rendering.
   Visual improvement needs confirmation on a rendering-capable device.
4. **Compact coverage:** v5.0 passed a stable 1080x600 WebView test, including
   keyboard return, MORE, two control sizes, all six field buttons, HELP/TECH
   and actual truck movement. A density change retained the same running game.
   Other physical screen sizes and device-specific cutouts still need testing.
5. **HELP device-specific issue:** v4.4 hardened the return path and passed real
   repeated Android tap/scroll/return tests, but the user's exact disappearing-UI
   report was not reproduced on the emulator. A physical-device retest is needed.
6. **Music sound output:** original albums/audio are checksum-verified and the
   native engine opens and streams selected Opus tracks. v4.7 moves track choices
   to startup and removes the battle menu route that hid controls on the user's
   device. Native selection/persistence/playback and battle controls passed on
   the emulator; exact physical-device behavior still needs a retest. Testing uses
   `-no-audio`; speaker/headphone quality has not been assessed.
7. **Performance:** v4.8 caches structure enumeration during queue ticks and
   prewarms the terrain projection used for placement. v4.6 removed repeated
   Android layout requests and avoided
   treating minimap finger drift as a camera drag. This emulator can still have
   long cold-start/render stalls. It does not establish a frame-rate guarantee
   for physical devices or resolve its pre-existing black-terrain issue.

8. **Design and page fixes:** v4.9 adds explicit New/Edit/Save as New, protects
   drafts from late validation/save replies, permits failed-save retry, preserves
   search focus, quantity and page scroll, and invalidates stale native menus.
   Native-picker creation/edit/copy and factory production passed on the emulator.
   Delayed/failure behavior is covered by deterministic regressions; this is not
   a claim that every possible device-specific page issue was reproduced.

See the versioned `qa/` reports for exact conditions, results and screenshots.
