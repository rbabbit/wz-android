# Focused Hub replay viewer 0.95

The visible viewer contains the real battlefield, minimap, play/pause, seek,
speed, view/quality, rotation, reset and zoom controls. It has no leaderboard,
player-statistics sidebar, momentum graph, analyzer forms or website navigation.
The parent native Hub owns Back and preserves its existing match/search state.

The renderer is adapted from MaWay2000/boha commit
`dcaf96520aa47f7a71160cae33da32e5ece1d5f0`. The copied subset is 1,359 files /
10,529,158 bytes, rather than the complete community repository. Each source file
was verified against its pinned Git blob hash; `upstream-assets.json` records
SHA256 hashes and source URLs. The original analyzer HTML/JS remain in `upstream/`
for review; `upstream-renderer.patch` records the adaptation. MIT, Three.js and
Warzone data notices accompany the packaged assets.

Retropaganda replay links are identifiers. The viewer maps the exact decimal ID
through the real published replay index, downloads the stored replay by its
verified SHA256, checks the actual bytes against that SHA256, parses its genuine
map and loads the corresponding processed native-engine position telemetry. No
raw replay is guessed, no match is assigned to another analysis, and no footage
or game objects are invented. This also avoids upstream raw downloads with mixed
genuine/mislabelled Brotli response headers. Missing analyses show unavailable.

The only remote requests use the app's allowlisted same-origin read proxy.
Geometry, models, textures, Three.js and renderer scripts are packaged locally.
The parsed public index caches only actual replay identity fields in the parent
Hub for five minutes. Failed or disposed requests clear pending shared Promises.
The viewer has bounded fetch/loading timeouts, Retry, pause/resume lifecycle
handlers, fetch abort and GPU disposal when its parent removes the iframe.
`WarzoneReplay.report()` / `HubReplay.report()` only observe viewer state.

## Focused host component evidence

`HOST-SMOKE.json` records a headless Edge/SwiftShader component check against the
real public replay `1794989715726`, SHA256
`2965375dc91b0a1e939bc4fb8952e6599370819e019cb8d2e1f439060ab842da`.
The genuine 632 position frames, real 3D models, map terrain and tiles rendered.
Play/pause, seek, lifecycle pause and disposal passed, with no runtime exceptions.
At slider time120100ms the source frame120002ms contains61 droids and145
structures, matching the independently read native telemetry. The original slider
uses100ms steps; an earlier assertion incorrectly tried to select120002 directly
and was corrected to the actual control's120100 step. Product interpolation was
not altered to satisfy that fixture.

Screenshots at980×440,760×360 and560×280 were inspected. Field and controls fit,
with no statistics/graphs visible. Headless tests are component checks, not a
substitute for the exact delivery APK in the owned emulator. Root performs that
separate Android evidence pass. Public-data cache and isolated headless browser
profile are ignored test outputs; they are not app inputs or source deliverables.

## Limits

Playback requires compatible upstream processed telemetry and internet access.
This is the upstream Three.js reconstruction from engine observations, not a
second Warzone engine executing arbitrary uploaded replays. Coverage, interpolation
and model fallback limits of that source remain. Headless rendering says nothing
about phone GPU performance or mobile-network availability; those need actual APK
observations. No VPS, update feed, GitHub or Google Play publication is authorized.
