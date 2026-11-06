# Known issues and verification limits

## Current v6.4 HTML/CSS construction display

The exact delivered APK passed the focused construction and screen checks in
[v6.4](../qa/v6.4-build-display/REPORT.md), following the
[v6.3 building interaction checks](../qa/v6.3-building/REPORT.md). Both maps,
actual native orders/positions/completions, phone/wide/enlarged-text layouts
and keyboard/menu returns are covered within those reports' stated scope.
The build canvas is a display-only projection of original building meshes.
Software-emulator black terrain remains unchanged. These checks do not verify
physical-device performance, a complete 30-round victory, or a new combat,
research and tank-production regression pass. Those systems were preserved
during the v6.3/v6.4 building-only changes.

## Historical v6.2 HTML/CSS return

The preserved HTML/CSS interface is active with the seven listed logic fixes
and persistent phone template saving. See [the scoped report](../qa/v6.2-html/REPORT.md).
The user prohibited emulator testing. Code regressions, the clean build and
package/source/signature checks passed; this release has no new gameplay,
UI-layout, physical-device, rendering, audio or FPS verification. Earlier
native-interface results below do not certify this HTML release. Existing
software-emulator black terrain and full30-round verification limits remain.

## Historical v6.1 compact native layout

The app-owned header, Research, Factory, Design/library, field commands,
Build, Orders and Help use Android Views. The official battlefield, radar,
engine messages, green blueprints and stock engine menus remain WebView/WASM.
The compact layout changes Android presentation; it does not port the engine.

The exact clean APK is covered in [the current verification report](../qa/v6.1-compact/REPORT.md):
manual research and queue advancement, real design saving/rename/copy/delete,
normal vehicle/cyborg production, waiting-batch removal without cancelling
active work, movement/orders, mixed construction completion on both maps,
save/load, repeated keyboard/menu returns and compact/enlarged/density layouts.
The finite Iron Valley combat journey records eight native rewarded kills,
68 reward power, survivor preservation and a live full-health HQ. Those
observations do not establish a complete native 30-round victory.

The factory adapter exposes no reliable native build-point percentage. Its
indeterminate bar and elapsed simulation timer show actual state. Saved models
persist in private Android storage; production still needs their components
researched in the current battle. Uninstalling or clearing data removes the
private library. Install the new APK as an update to retain it.

Software-emulator black terrain persists. Physical-device GPU rendering,
audio, FPS and a full native 30-round playthrough remain unverified. The rules
harness is not native endurance; the result/replay callback fixture is not a
native victory. Multitouch was dispatched into the real WebView via CDP and
does not certify a physical touchscreen. The preserved baseline emulator ANR
and test-fixture recovery are documented separately from product behavior.

## Historical v6.0 Android UI delivery

The app-owned header, field commands, Build, Research, Factory, Design,
blueprint library, Orders and Help use Android Views. The battlefield, radar,
engine messages, queued green blueprints and original pause/save/load,
statistics and commander menus still use the official engine inside WebView.
This is an Android interface migration; the engine has not been ported to
Android native graphics. The retired HTML/CSS app interface is absent from
the delivery APK. See [the implementation boundary](NATIVE-ANDROID-UI.md).

The exact v6 APK passed the scoped journeys in [the delivery report](../qa/native-ui/REPORT.md),
including native save/load with a clock rewind and exact waiting-lab queue
restoration, normal production, completed construction on both maps, actual
movement/orders, repeated keyboard/menu returns and compact/enlarged layouts.
Earlier save/load limits below describe older versions and are superseded only
for these explicitly tested v6 flows.

Remaining limits: black terrain on the software emulator persists;
physical-device GPU rendering, audio, FPS and complete native 30-round
endurance remain unverified. The 30-round rules harness is not an engine
playthrough. The result/replay lifecycle test uses an explicitly injected UI
result callback and does not establish a native victory. Multitouch was
dispatched into the real WebView through CDP, not certified on a physical
touchscreen. Saved blueprints use private Android storage and are removed by
uninstalling or clearing app data; install the APK as an update to retain them.

## Historical release notes and limits

v5.12 applies the selected official-art/footer design, with Dustfall and Iron
Valley as display names for the existing maps. Native startup, graphics/music
returns, download states and small/enlarged-text layouts are covered in
[v5.12 evidence](../qa/v5.12/REPORT.md). All existing engine/gameplay assets are
byte-identical to v5.11. Physical-device rendering/audio/performance and full
native 30-round endurance remain unverified; the emulator terrain limit below
is unchanged. The source backdrop is square, so its sharp central composition
uses a soft surround on wider screens rather than generating new artwork.

v5.11 adds the exact supplied td1_v3 map alongside the original TD2 map, with
the same unchanged Towers mod. TD1's trucks build on raised platforms; the HQ
route is not reachable from those platforms. This is authored map geometry.
The compact start screen, optional downloads and explicit music selection are
covered in [v5.11 evidence](../qa/v5.11/REPORT.md). Physical rendering, performance,
audible output and complete native 30-round endurance remain unverified. The
existing software-emulator black-terrain limitation below remains.

v5.10 reduces construction-selection overhead while retaining a fresh native
placement acknowledgement for every choice. A cached ready flag can outlive the
engine's placement tool, so it is deliberately not used to skip acknowledgement
on repeated choices. Entry/exit still need the native viewport transition and
an engine response; this is not an instant-selection or device frame-rate
guarantee. See [v5.10 evidence](../qa/v5.10/REPORT.md). Existing black terrain on
the software-rendered emulator, physical-device performance/audio/rendering,
and a complete native 30-round playthrough remain unverified or unresolved as
described below.

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
