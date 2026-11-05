# v5.5 — field construction sidebar and live build estimates

Delivery APK SHA-256:
`37b9ac288ade3477fb9b8357e85c6a5ab10f846dbf6f27d5bfbf8fcd6addd5e5`.

Option 2 is implemented in the actual Towers app. BUILD opens the left field
sidebar and selects the nearby constructor group. Only the structure cards
scroll; categories, current construction, queue access and Exit remain visible.
The field console and minimap retain their space. An instruction panel replaces
the stock builder cards while the original native placement tool remains alive.

Cards use existing Warzone research artwork and five original engine-rendered
build-card crops. Their source screenshot and extraction tool are retained.
Research keeps its v5.4 implementation and layout.

## Observed on the exact installed APK

The fresh-match integrated run in `delivery-results.json` passed with the
installed APK hash equal to the packaged candidate. It used ordinary starting
units, normal construction and normal factory production; no units, research,
power or completed buildings were seeded.

- At 1280×576, real Android scrolling moved the catalogue while the queue/exit
  stayed fixed. Header buttons, field controls and genuine artwork were checked.
- Three nearby trucks received both tower orders in their native order lists.
  Duplicate placement was rejected. Live progress/time followed working trucks;
  the displayed time froze with native pause and continued after resume.
- Changing structure type preserved a mixed native queue containing a 2×2
  Research Facility and Factory Module. Fresh native saves verified both towers
  at 300 construction points, the facility at 500 points and the factory at two
  completed modules. The facility journal was bound to its real foundation ID.
- Normal factory production completed a truck. A real field tap selected that
  produced unit; a ground tap produced a native MOVE order and changed position.
- A valid unit design was assembled/saved. The Android keyboard was photographed
  open before Back; the full viewport returned. Repeated Research, Factory,
  Design/Build and battle returns passed, including two rapid Build requests.
- At 1080×600, Build, placement, Research and battle returns passed. Screenshots
  were inspected for clipped controls, overlap, card text and stock-panel leaks.

The bridge, queue/lifecycle, design, functional-screen, Research-sidebar and
terrain-picker checks also passed. These support the emulator evidence.

## Timing and native queue matching

The queue journal observes validated sites; it never issues script build orders
or replaces the native Ctrl-build FIFO. Warzone still owns placement, power,
pathfinding, queued blueprints and completion.

Public script objects expose health, status and worker actions, but not current
construction points. Remaining time is therefore labelled approximate. Ordinary
foundations use their health and upgraded worker rates; modules integrate observed
work in simulation time. Travelling/idle workers do not run a countdown. Damage
and missed samples can affect estimates. Power-starvation behavior has bridge
tests; there was no separate power-starved real-emulator run.

The mixed-size test found that the terrain observer and native cursor can differ
at an even footprint boundary. Matching exact requested coordinates left a
completed facility journal marked interrupted. New entries now retain existing
structure IDs and bind only a newly observed nearby foundation, excluding older
neighbours and other entries' targets. The corrected case passed on this APK.

## Fixture corrections and scope

During iteration the audit was corrected to wait for image loading, validate
reachable/visible sites, use native save defaults for completed structures,
calibrate the camera, lock emulator rotation and wait for the Android keyboard
before Back. An unguarded Back had exited the app. A QuickLoad recovery attempt
did not restore the command bridge and was abandoned. The delivery run used a
fresh ordinary match and completed without those recovery steps.

This is a finite construction/UI journey, not certification of every wave or
every device. Physical-device, HQ terrain, audio and native Save/Load limitations
remain in `docs/KNOWN-ISSUES.md`. Black terrain is the recorded emulator baseline.
The current run checks Standard wrapper controls at the two stated viewports.

## Preservation

`preservation.json` verifies unchanged official engine code, WASM, the entire
frozen v5.4 data prefix and 3,282 resolved assets. Catalogue gameplay statistics
are identical; only artwork references changed. All 455 editable assets and the
embedded custom scenario match the delivery APK. The frozen v5.4 APK/source are
retained independently of this worktree.

The clean distribution APK is 90,765,982 bytes. Gradle incremental packaging had
retained a 67 MB unused gap; a clean build removed it. `clean-package.json`
records identical unsigned payload entries, and the complete installed-APK
journey was repeated successfully on the clean distribution hash above.
