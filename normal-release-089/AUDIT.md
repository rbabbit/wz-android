# Normal0.89 delivery audit

The checked B2 APK is version0.89/code89, 612927776 bytes, SHA256
`dc1a273437f8393e66ebfbdb8886b06a4ddab82dec419553165bb07611efdf38`.
Its normal publisher certificate is
`4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15`.
The normal updater and notification-consent fix remain present. No AAB was built.

The immutable four-mode proof is focused-runtime.json, SHA256
`3b0c774246cf1377c8822b6da1495225369a302813e01163cb1031bab5038b78`.
Its56 explicitly hashed evidence files were checked before this audit was written.

Actual checks

- Campaign, Towers, FFA and Multiplayer screenshots/native state show selected
  horizontal health/background bars removed with selection corners retained.
  ALL COMBAT is white for default, partial, mixed and deselected states and green
  for the actual nonempty exact combat selection. Existing hover health inspection
  and unrelated native status are retained by the scoped implementation.
- Campaign returned twice each from Research, Manufacturing and Queue, then
  accepted actual native world selection. Multiplayer completed two real keyboard
  Show/Back/Cancel cycles; its viewport returned to1164x554 and native truck
  selection/input resumed.
- FFA produced two ordinary MG units (164187/164195). When the second completed,
  the native eligible set grew while only the first remained selected; ALL COMBAT
  correctly changed to white even though retained selection-lock intent was on.
- Multiplayer produced ordinary MG units in a private match. The final idle-human
  fixture produced160691/160693 through normal Manufacturing, then recorded a
  clear-lane MOVE order, changed native positions and completion. Final held keys,
  held mouse and active gesture were empty. Partial/mixed/deselected/exact states
  were checked with that retained pair.
- Towers has one reachable top ALL COMBAT control. Actual2400x1080,1920x1080 and
  1280x720 captures were checked. The smaller physical viewports auto-scaled to
  1063CSS pixels; these are not claims of a656CSS-pixel runtime viewport.

Fixture and capture limits

Towers used a disclosed private native save containing two seeded stock MG
units. Campaign used an existing native checkpoint. FFA and Multiplayer ordinary
production were observed. A proposed seeded FFA archive failed the canonical
mapName guard before native launch; the original early save was used instead.
Hostile FFA/initial Multiplayer worlds later lost their prepared units in real
AI combat. No completed-movement pass is claimed from those expired worlds.
Remaining Multiplayer checks used a supported idle enemy human host, with no
AI/mod/native seed and inactivity/time limits disabled for this private fixture.

Capture102 transiently showed a blank top header despite current DOM geometry;
it supports the movement/corner observations only. Fresh final capture106 was
directly inspected, with718 painted green ALL COMBAT text pixels measured. The
transient capture is not treated as proof of a header-hiding product regression.

The owned emulator was5562, with WebView159.0.8154.4 and inherited black terrain
also present in the baseline. Models, corners, HUD, actual orders/production and
input were inspected; physical-device terrain quality was not established.
User5558 and the preserved0.88 pilot userdata were not used for these checks.

Source and build scope

All658 source assets match the B2 APK;13 changed assets are enumerated in
apk-integrity.json. Data, maps, media and protocol16384/104 remain unchanged.
Three matched native lineages are retained: shared0.51, Towers0.52 and MP082.
All six full generated JS loaders and three WASM files pass the recorded raw-pair
and ASM_CONSTS normalization checks. The abandoned0.88 camera pilot is excluded.
The first candidate858a1000... failed Campaign startup because old dedicated
loaders were paired with new shared WASM; it is not a delivery artifact. B2
regenerated Campaign/FFA/deferred Duel loaders from their matching new raw JS.

<!-- BEGIN PUBLICATION_AND_UPDATER_STATUS -->
The first VPS attempt refused a stale homepage hash/size pin before any canonical
APK/feed swap. The observed homepage pin was refreshed; Caddy and the old APK/feed
were unchanged at that preflight. The failed attempt is preserved separately.

Publication completed at2026-11-16T15:31:29UTC. vps-deployment.json records a
private backup of the previous0.86 APK/feed, the full canonical HTTPS APK response
(612927776 bytes, exact B2 SHA256) verified before publishing the matching0.89
feed, and full feed verification. Feed SHA256 is
`fc767f33a346dc68d3b6edd3f17ceb887834a934e22747c4b62f0fb77bd53158`.
Homepage and Caddy bytes matched their pinned pre-publication values afterwards.

The actual normal0.86-to0.89 update journey passed in the same owned emulator.
Home detected the live0.89 feed, downloaded all612927776 bytes into an initially
absent cache, and independently measured the full cached APK hash before Install.
The scoped Android unknown-source permission flow returned to the app, then the
real PackageInstaller Update confirmation reached App updated. The journey did
not install the target package through ADB. Installed base.apk was independently
measured as the exact B2 hash/size before the target Main Activity ran.

All34 immediately pre-install fingerprinted save/preferences files matched after
installation before new Main. At that point the target process was absent and
PackageInstaller was still top; Done/Open had not been pressed. A separate
same-signer external instrumentation helper initialized Application only to read
those files, without starting a target Activity. That initialization is a test
limitation, not a claim that no target application code ran at all.

After Done and an explicit Main launch, Home showed0.89 and the update check
reported the installed version was current. Seven Campaign saves and Design1/2
blueprints remained present. The preserved native checkpoint loaded, ALL COMBAT
selected five original units with green text/corners and no selected health bars;
a physical tank tap selected160287 with white text and released input. The frozen
updater-journey.json binds37 actual JSON/PNG evidence files, retained as separate
hash-bound source-package audit attachments. This verifies the normal APK updater
path; no Google Play release or physical-device terrain-quality claim is made.
<!-- END PUBLICATION_AND_UPDATER_STATUS -->
