# Known issues and verification limits

v5.9 fixes the first structure tap being ignored during hidden truck selection.
BUILD now opens the catalogue immediately; one item tap selects the nearest
group and activates placement. Native MG-bunker orders/completion, a prior
distant selection, an empty-constructor fixture and one normally produced
replacement constructor passed. See [v5.9 evidence](../qa/v5.9/REPORT.md).
The physical-device/rendering/performance limits below remain.

v5.8 smooths construction selection and exits, with persistent cards/sidebar,
stable queue geometry and covered native transitions. The exact APK passed the
reported flow, native orders/completion/movement and three emulator viewports.
See [v5.8 evidence](../qa/v5.8/REPORT.md). Native placement still needs a viewport
change on entry/exit; item changes retain it. This is not a physical-device
frame-rate guarantee, and the rendering/audio/performance limits below remain.

v5.7 replaces the active Survival rules with the exact supplied Tower Defense
mod, preserving the existing interface. See [v5.7 evidence](../qa/v5.7/REPORT.md).
Native combat was observed through round 5, including exact kill rewards and HQ
defeat; all 30 rounds/victory are covered by the rules harness. A native complete
30-round win/endurance run remains unverified. Native research assignment,
progress, queues and restoration passed; research completion after restoration
was not observed before that match's HQ defeat.

Fresh v5.7 native saves restore the canonical rules context, round/deadline,
spawn FIFO, manual lab queues and command bridge in the tested case. This fixes
the legacy custom-script-name mismatch described below. It does not certify
every Save/Load case. Start a new battle on upgrade; Survival saves are
incompatible. Physical rendering/audio/performance limits remain.

v5.6 verified the compact construction/control cleanup and native gameplay
journey at three emulator viewports. Research retains the v5.4 implementation.
See [the v5.6 report](../qa/v5.6/REPORT.md) for exact coverage and remaining limits.

v5.4 dedicates the right Research sidebar to the selected lab and moves the
catalogue preview/action to the centre. Four real labs, queued topics, native
completion/advancement and related returns passed at 1280×576; compact layout,
filters and two wrapper control sizes passed at 1080×600. See
[the v5.4 report](../qa/v5.4/REPORT.md). This focused UI change leaves the
engine/scenario and the limits below unchanged.

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

v5.5 journals sites placed through the field sidebar and lists pending/current
construction with live estimates; original green blueprints remain native.
Construction points are private to the engine script API: ordinary progress
uses foundation health and live worker rates, while modules integrate observed
work. Damage and missed samples can affect the estimate. Power-starvation timing
is covered by bridge tests, without a separate real-emulator power-starved run.
Older native saves may contain queued orders without journal entries.
QUEUE also lists factory jobs. A copied native QuickSave test fixture failed to
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
   v5.6 keeps the native truck window outside the placement view by extending the
   real viewport below the host. The additional rendering work has not been
   benchmarked on physical hardware.

8. **Design and page fixes:** v4.9 adds explicit New/Edit/Save as New, protects
   drafts from late validation/save replies, permits failed-save retry, preserves
   search focus, quantity and page scroll, and invalidates stale native menus.
   Native-picker creation/edit/copy and factory production passed on the emulator.
   Delayed/failure behavior is covered by deterministic regressions; this is not
   a claim that every possible device-specific page issue was reproduced.

See the versioned `qa/` reports for exact conditions, results and screenshots.
