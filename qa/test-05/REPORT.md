# Warzone Towers 0.5 — building preview fixes

The experimental app's building previews now render together with module
highlights, align with the native queued model and eventual foundation, and
refresh their height after construction changes the terrain. The compact
HTML/CSS interface, original icon, supplied maps/mod, wave rules, research,
production and phone design library retain their existing implementation.

APK SHA-256:
`9be9cde8d4d62a4ea205a34e6c53fe2fab7ff8eb0d57f52b9775207853e2866b`

Android package: `com.rbabbit.warzonetowers.lab`; visible name: **Warzone Towers**;
version: **0.5**, code **5**. Install as an update to the experimental app to keep
its private data. Stable v6.4 remains separately installable.

## Findings and corrections

1. A boolean ordinary-building parent value reached `bounds.top`, stopping the
   custom renderer before it painted models, site numbers and module highlights.
   Parent geometry is now null-safe. Tests execute the actual renderer for all
   161 ordinary catalogue types, accepted sites and a mixed module frame.
2. The native queued blueprint used a tile centre for even footprint axes while
   native foundations snapped to the tile boundary. Nine added C++ lines correct
   the local visual position using rotated footprint parity. Real orders,
   module parents, foundation positions, height rules and line building are
   unchanged. The exact before/after source function compiled against deterministic
   engine-type stubs passed 1,932 cases: 216 earlier mismatches, zero afterward,
   zero order mutations and zero height changes. This probe is source coverage,
   separate from emulator gameplay.
3. Preview height sampling now follows native pre-build footprint vertices,
   flattened foundation centres and the original selected structure's bounds
   where appropriate. Geometry is invalidated after observed terrain uploads.
   Generated models gained original structure bounds; their existing mesh
   geometry and artwork remain unchanged.
4. Failed ground picks clear stale ordinary previews and coordinates. Unchecked
   touches use neutral pending feedback before native acceptance or rejection.
5. Real construction testing exposed GPU readback stalls after terrain updates.
   Height queries now use a spatial triangle index. Owned CPU copies of the two
   observed terrain buffers mirror known native uploads, preserving native GL
   calls and input offsets. Unknown writes invalidate the affected copy and
   retain a GPU fallback; memory is bounded. Focused tests cover offset/length
   forms, typed arrays/DataView, resizing, detached old Wasm views and invalidation.

## Exact-APK emulator results

All nine phases passed on `emulator-5556` with the APK hash above, verified again
after the journey. Native saves/orders and completion were inspected alongside
actual screenshots and real ADB touches.

| Check | Observed result |
| --- | --- |
| Ordinary and mixed module preview | Held neutral model; Research 2x2, Power 2x2, Cyborg 1x2 and Guard Tower 1x1 models/site numbers; module highlight and ordinary previews in the same painted frame. |
| Actual construction and FIFO | All four ordinary buildings completed at the expected native parity centres and build points; the new lab then completed its module in the recorded five-job order. |
| Elevated Dustfall sites | Native tower and Cyborg Factory completed, preview height matched the native foundation, and transient models cleared. Command Centre remained toward the footer. |
| Research and Power modules | Two native lab upgrades and one Power Module completed. Real roof/body taps, duplicate/full feedback and module-then-tower FIFO passed. |
| Native saves | Genuine F7/F8 rewound the native clock and preserved all three upgraded parents and the tower; normal input returned. The phone design library was unchanged. |
| Factory and production | Factory levels completed 0→1→2, with distinct working/queued orders. Normal PRODUCE 1 created new native Truck 160143, recorded as originating from Factory 160121. |
| Layout and re-entry | Phone and enlarged compact profiles kept all module choices, guidance, capacity feedback and exit controls visible. Same-module reopening restored target counts. |
| Iron Valley selection/movement | Exact visible constructor IDs/highlights, combat exclusion, two native tower completions, selection during work, noncentral movement/STOP and related returns passed without automatic zoom. |
| Returns and lifecycle | Twelve paused returns, two real keyboard show/dismiss cycles, real native Quit/Confirm, neutral end screen, app start return and usable fresh-battle Queue/Pause/Resume passed. |

The main preview journey recorded a maximum custom overlay paint of **82.72 ms**
on the software-rendered emulator, within the explicitly recorded 150 ms
regression ceiling. The earlier indexed candidate reached 330.76 ms and was not
delivered. During the accepted journey, GPU buffer reads stayed at the two cold
seed reads, CPU reads reached six, three native uploads were mirrored and no CPU
copy invalidations occurred. The last mesh snapshot took 0.025 ms. These are
scoped emulator observations, not a 60 FPS or physical-device guarantee.

## Fixtures and readiness corrections

Ordinary/module construction used fresh authored Dustfall units and real UI
orders, without granted units, power, research or edited world positions. Layout
checks reused the actual upgraded factory and normally produced truck. Iron
Valley selection reused a complete ordinary native save with six constructors
and two previously produced tanks; production itself was checked separately.

The initial source-built runtime was stopped before gameplay because its early
public `FS` export was missing. The pinned linker configuration was corrected
and startup/API checks now require that contract before integration. A later
aged save restored successfully but lost its HQ before a long construction
fixture finished; it was retired and the final construction journey used a
fresh battle. GPU stalls in intermediate candidates were diagnosed and fixed
before delivery. Their raw evidence remains under the iteration folders.

The ninth final phase initially timed out at the helper's 20-second CDP
transport limit during fresh engine startup. Quit, neutral exit and app start
had already succeeded. The visibly running new battle was inspected and reused;
the QA-only startup wait now has a scoped 90-second transport budget and
requires advancing native time before a fresh native acknowledgement. Queue
return and actual native Pause/Resume then passed. The first eight passing
reports were revalidated and retained. The original failure and resumed
chronology are preserved in `iteration-r4-quit-readiness/` and
`integrated-journey.json`. Runtime/APK bytes did not change during this recovery.

## Preservation and source

The pre-change 0.4 APK, complete source ZIP and checksums were copied and
verified before edits in
`C:/timerApp/fallbacks/towers-before-preview-fix-20261107`. Fourteen older/fallback
artifacts remain unchanged. Stable v6.4 is clean at
`9280cccad984320503240d9a39e7d766646c1dfe`, with all 4,916 source-manifest files
verified. Its project and APK were not modified.

The native build uses Warzone 4.7.0 commit
`7d3d8e51a61ceee89e6bf672a41337e1a9cd7392`. The complete native source archive,
nine-line patch, pinned build recipe, matching JS/WASM and provenance are
included. The 71,415,015-byte data file, all 3,849 package-index entries, stock
PIE assets, supplied scenarios/maps/mod, Android Java/resources and icon match
0.4. The six changed runtime assets and version metadata are enumerated in
`package-verification.json`.

Evidence: `DELIVERY.json` binds six required aggregates, nine raw gameplay
reports, the native geometry probe, 40 manually inspected screenshots and
separate diagnostic attempts. The source inventory and packaged ZIP are checked
for completeness and hashes by the release tools.

## Limits

The emulator's black terrain issue predates this work and occurs with Normal
and HQ graphics. Models, native terrain picks/heights, orders, positions and
completion were observable; ground textures and the visual appearance of slopes
could not be certified. Physical Android devices were not tested. The native
automatic wall variant is not exposed by the script API, so custom previews keep
the selected structure model. Representative structures and all three module
families were constructed; every catalogue type and the full 30-wave balance
were not played through. The 161-type renderer and 1,932-case native probes are
explicitly separate from that live gameplay coverage.
