# v5.12: selected splash footer and display names

Version `5.12-footer` (62). Tested APK SHA-256:
`102316bdb80435971a2fd6561e4b269671774048d751d7d49663325d198f9313`.
The v5.11 APK, complete source and SHA-256 fallback were verified before edits.

## What changed

- Selected official heavy-armour artwork and the original Warzone logo.
- Footer map tabs, centred rounded rectangular Play, native graphics popup,
  compact music/HQ download controls and integrated progress/error/Cancel.
- Dustfall is the display name for td1; Iron Valley is the display name for td2.
  Internal IDs, original authors, map data and Towers rules remain unchanged.
- The Music and loading screens use the same artwork. Empty music selection
  remains explicit; old saved track choices remain saved.
- Narrow layouts use two-line utility labels; very narrow or enlarged-text
  layouts wrap to a second row. Every checked control keeps 48dp touch height.

Original PNG assets are used directly; [provenance](../../docs/SPLASH-ARTWORK.md).
The native renderer fits the square art proportionally, using softened source
edge colours around it. This preserves the vehicle rather than cropping its
missile pod or tracks or generating replacement artwork.

## Native screen and interaction evidence

[Startup results](startup/layouts.json) match the installed APK hash above:

- 1080x600, 1280x576, 1600x720, 720x360 and 640x360 logical viewports, plus
  1080x600 with font scale 1.3. Screens and native UI trees are retained.
- Both tabs, selected state and dynamic Play text; graphics Normal/HQ selection
  and Back dismissing its menu without changing the selected quality.
- Music Clear gives 0/39. An enabled empty playlist blocks Play and reopens the
  chooser; one explicitly selected track works. Repeated Back and process
  restart preserve the map and that explicit choice. Inactive launch controls
  stay hidden behind Music.

[Download results](startup/downloads.json) match the same installed APK:
uncached HQ blocks Play, Normal remains usable, real network failure shows
footer feedback, native Cancel retains a disclosed 1 MiB verified-prefix fixture,
then an actual network resume verifies the official 99,639,408-byte HQ pack.
Completion stays on the splash; cached HQ enables Play. The original emulator
cache was restored and both Wi-Fi/mobile data were enabled afterward. This is
a cancellation fixture, not a claim that every byte of that prefix was freshly
downloaded in the cancellation run.

## Gameplay verification

[Dustfall results](dustfall/results.json): four authored construction trucks,
two local builders, actual GuardTower1 BUILD orders and 300-point completion,
normal MG-unit production/selection/MOVE, two labs, Factory/Research returns,
14 entrances and 35 native first-round attackers with actual attack orders.
No free units, power or research were granted. The last pause assertion initially
sampled one pending half-second wave-log update. The visible PAUSED menu and
subsequent stable native clock (66502) confirmed pause in
[the observation](dustfall/pause-observation.json) and
[screenshot](dustfall/pause-observed.png); the completed gameplay journey was not
repeated. The harness now tolerates log catch-up before requiring clock stability.

[Iron Valley results](iron-valley/results.json): repeated/mixed-item native FIFO
survives Exit, both towers complete, Trucks and field MOVE work, explicit and
automatic placement exits restore input, repeated Research/Factory returns and
visible keyboard/Back work. Placement/exit screens pass at three viewports and
View All remains visible with three actual queue sites. No Runtime exceptions
or quiet-HUD violations were recorded in this journey; Dustfall also recorded
no Runtime exceptions. Both exact installed APK hashes match the delivery hash.

Iron Valley launched High graphics and Music on with one explicit track.
[Pack state](iron-valley/optional-packs.json) shows HQ mounted, terrainMode 2,
native music preference reads and the chosen track opened by the engine.
Graphics-read instrumentation was not enabled, so no observed native HQ archive
read or HQ visual-quality claim is made. Audio output is not verified on the
no-audio emulator. Both native journeys ended paused.

## Preservation and comparison

[Package proof](preservation.json): every prior APK asset and native library is
identical to v5.11 (456 members), including engine JS/WASM/data, both maps, original
Towers mod, Research and music-loader code. The new logo is byte-identical to
the existing bundled native logo. The backdrop SHA-256 matches the upstream
download `805f6ccf9cbbef180527e39781ff112ed245683d1339703332cb476c52a28e6b`.
Focused loader/notification regression output is in [regressions.txt](regressions.txt).

[Full comparison](comparison-full.png) and [footer detail](comparison-footer.png)
put the selected concept and native capture in the same diagnostic image.
The root [design QA](../../design-qa.md) records fonts, spacing, colour, imagery,
copy, density normalization and visual iterations. The source concept has the old
numbered labels and uncached packs; those are intentional state/copy differences.
Initial edge-repeat stripes and a flat-surround ground patch were corrected
before the delivery checks. Iteration captures are retained separately.

## Fixture corrections and limits

An initial readiness expression checked a nonexistent body class. It was
interrupted; the match then aged beyond the harness's early-start threshold.
The corrected native HUD/truck readiness check is chained directly to the fresh
gameplay driver. This was a test-fixture error, not a game defect.

The original asset composition uses softer outer ground and different framing
from the generated concept. Physical-device rendering/audio/performance and a
complete native 30-round playthrough remain unverified. The existing software
emulator's black-terrain limit remains; see [Known issues](../../docs/KNOWN-ISSUES.md).
