# v5.11: two maps and compact startup

Delivery APK: version `5.11-two-maps`, code 61.
SHA-256: `08e9d1610d55c927b000026331f25013a608d0d05764bc05ff725ab90916a36a`.
The installed emulator APK matches this exact file. The v5.10 APK/source/checksum
fallback remains unchanged outside the repository.

## Scope and implementation

The reported checklist was: add the supplied map without replacing the existing
map or Towers rules; test it first; then provide two named map choices, a smaller
launch/download console, explicit music choices and offline Normal graphics.

The new **Tower Defense 1** is NoQ's `td1_v3`, 64x80 tiles. The original archive
and all seven members are preserved exactly. Its native scroll bounds are 63x79;
the rectangular minimap now has matching input bounds. Human position 0 starts
with four construction trucks, two factories and two labs. Trucks occupy raised
building platforms disconnected from the HQ route, as authored in the map.
**Tower Defense 2** remains arc's existing 64x64 map and six starting trucks.
Both maps are included offline and use the unchanged supplied 30-round Towers
mod. Native startup clicks the correct human Ready row for each map.

The original splash artwork remains visible behind a compact bottom-right
console. Map, graphics and music selections persist. HQ download completion
stays on the start screen; it does not silently launch a game. Music starts
with zero selected tracks, supports explicit All/Clear, preserves saved choices
and does not enable itself when downloaded. Enabling an empty playlist asks for
track selection. Inactive startup controls are hidden while Music is open.

## Real emulator verification

One owned emulator, `emulator-5556`, was reused. No free units, power or research
were granted. Units in the final gameplay journeys were produced normally.
Native save JSON, engine orders, positions and completed build points were
inspected alongside screenshots; these are not just script/build assertions.

| Check | Observed result / evidence |
| --- | --- |
| Map integration before splash changes | [map-first results](map-first/results.json): correct starts, original AI-base removal, actual defence completion, normal production/MOVE, two labs and 35 native first-round attackers. This was an earlier prototype, not the delivery APK. |
| TD1 offline delivery launch | [offline proof](td1/offline-start.json), [network state](td1/offline-network.txt): map selected through the actual card, Normal/Music off, no active default network, native four trucks and complete HUD. |
| TD1 delivery gameplay | [results](td1/results.json): two nearby trucks receive actual BUILD order 4; GuardTower1 completes with 300 build points at tile 8,71. Normal MG-unit production, selection and MOVE, both labs, Factory/Research returns, 14 spawn entrances and all 35 first-round enemies with actual attack orders. No complete 30-round run is claimed. |
| TD2 delivery regression | [results](td2/results.json): repeated and mixed-item FIFO orders survive Exit; both towers complete; selection/MOVE and automatic/manual placement exits restore input. Repeated Research/Factory returns and a visibly opened Android keyboard followed by Back pass. Three native queue sites and View All remain visible. |
| Native screen sizes | Startup and TD2 placement/exit inspected at 1600x720, 1280x576 and 1080x600 logical viewports. [Compact startup](startup/compact.png), [standard](startup/standard.png), [large](startup/large.png). Buttons/cards fit without clipping, artwork stays visible and startup scrolls if needed. |
| Music choices and download | [startup results](startup/results.json): 0/39 default; explicit All 39/Clear 0; choose one before download; map/playlist retained through Back and process restart. Actual 114,721,578-byte download verifies. Download does not turn playback on; empty enabled playlist blocks Play; explicit single track permits it. |
| HQ failure/cancel/resume | Real network failure leaves Normal usable. A disclosed seeded 1 MiB verified prefix makes cancellation observable on the fast emulator connection; native Cancel retains it, then actual network resume completes SHA verification and stays on splash. Cached HQ enables Play. Original QA cache restored and networking enabled afterward. |
| Optional packs in the game | [TD2 pack state](td2/optional-packs.json): HQ mounted, terrain mode 2, music archive loaded, native music preference file read and the one explicitly chosen track opened by the engine. No audible-output or HQ visual-quality claim is made. |
| Preservation | [package verification](preservation.json): compiled engine logic/WASM and entire prior data prefix identical; exact new map members; original map/mod/Research/artwork unchanged; all 456 source assets match the delivery APK. Only the map registry changes among prior virtual files. |

Music archive SHA-256:
`602ea6c69f4073a9617676a39f8397232953637a9b7a36e7cc28e93dd15184cd`.
HQ archive SHA-256:
`a16a06c2a6b68e86a03934240880ec0b0fd72666606af3bf12ed5ffda7734f0e`.

Both gameplay drivers recorded no Runtime exceptions during their connected
journeys. TD2 also recorded no quiet-HUD violations. The TD1 wave bridge reports
four early polling errors before native state became ready; subsequent state,
commands and wave spawns remained live. The final native simulation is paused
and its clock was checked rather than assuming Escape paused it.

All 15 focused Node regression scripts passed; see [the captured output](regressions.txt).
These support the native checks above and do not substitute for them.

## Fixture corrections and limits

The first TD1 fixture guessed building sites near HQ. Native terrain/reachability
inspection showed the authored trucks live on disconnected platforms, so the
fixture was corrected to an accessible site and proper height. An old square
radar helper was corrected for the new rectangular map. The first native Ready
coordinate incorrectly targeted TD2's row; the map-specific startup fix is in
the delivery APK and both real map-card launches pass.

One startup hierarchy check exposed occluded launch controls behind Music; the
delivery APK hides that inactive page. A test helper initially confused the
on-device `music.data` filename with its browser `music-v1.data` route. Native
download had succeeded; the helper was corrected. Slow-network and too-fast-
Cancel fixtures were replaced with the bounded verified-prefix case described
above. A 40-second optional-pack readiness wait was too short; observing actual
ready state resolved it. Retained failure/prototype evidence is not counted as
a delivery pass. The offline proof match was restarted before the final TD1
journey to avoid testing an aged fixture.

The software-rendered emulator still shows the previously documented black
terrain. Native map geometry, rendering of units/buildings, minimap, UI and
orders were observed, but this does not establish physical-device terrain/HQ
quality, audible music, frame-rate or a full native 30-round victory. Those
limits remain in [Known issues](../../docs/KNOWN-ISSUES.md).
