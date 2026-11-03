# BUILD, DESIGN and factory commands

v4.8 replaces the native blue hexagon with larger header commands. TECH remains
the single research entry; STATS opens Warzone's real intelligence/player table.
MORE contains combat selection, patrol, BOX, commanders and control size. Music
stays on startup. Existing zoom, BASE, STOP, HELP and wave controls remain.

## Construction

Open BUILD, choose a structure and press BUILD THIS. Tap open ground to place it
repeatedly. Every tower-map placement queues; there is no queue toggle to forget.
DONE ends placement and CHANGE opens the catalogue again. Research controls which
items appear. Prices come from native Stats, including supplied mod overrides.
Stock research images are reused, with a neutral category symbol where no stock
picture exists. No generated game art is introduced.

Selected friendly constructors take priority. With none selected, the scenario
chooses the nearest reachable constructor, then retains it for that placement
session. Bad, occupied, unreachable and duplicate taps do not cancel the chosen
structure. A selected group is retained without issuing a native click at the
placement location. The queue page shows waiting/working/blocked jobs, Retry and
Remove. STOP clears selected constructors' queues, or automatically assigned
builders if no friendly units are selected. A destroyed worker leaves a blocked
job; Retry assigns a live reachable builder.

Warzone's public `orderDroidBuild` replaces a droid's current native order list.
Its ModeQueue argument orders network messages; it does not append a construction
job. The custom scenario therefore keeps a FIFO per worker, waits for the native
worker to become idle, and issues only the next explicit user job. Completion is
confirmed by the real structure/status/module count. It never repeatedly sends
orders to a busy truck. Existing native work is allowed to finish first. Queued
sites reserve their footprint and structure-limit slot; invalid sites are rejected
rather than silently moved to a nearby tile. Modules require the matching parent.

The read-only terrain adapter observes the engine's terrain MVP and vertex/index
buffers. It ray-picks the rendered terrain instead of estimating map coordinates
from screen proportions. It restores the COPY_READ buffer binding after reading,
caches mesh/projection data, and invalidates the mesh when terrain buffers change.
It does not edit shaders, engine program code, WASM, models or textures. Pan,
pinch, tilt and minimap gestures remain native input. Camera movement hides the
old footprint; a tap previews its new site. Invalid placements show red feedback.

## Designs and production

DESIGN selects researched body, propulsion and weapon/system components. Multiple
weapon slots follow the body's real slot count. The original engine's
`makeTemplate` validates compatibility and calculates power/build points before
SAVE DESIGN is enabled. A Command Centre is required. Saving adds no free unit
and starts no production.

Saved Designs is an app-private JSON library, persisted through the Android
bridge. It survives process restart and APK updates using the same signing key.
Saved designs can be reopened, edited or deleted. Research is checked again in
each new battle. Deleting a library entry does not mutate production already
queued from it. The library is bounded to 100 designs/256 KiB.

FACTORY offers saved designs and available native templates. Select a completed
factory and quantity; production waits behind existing native work and uses
normal power/build time. Body size, factory role and component availability are
checked. A native rejection blocks that job for Retry instead of deleting the
rest of the queue. Factory controls provides the original production panel for
native cancellation and other factory settings.

The public engine API has no register-without-producing template operation.
Accordingly the private library holds validated blueprints; explicit Produce
calls native `buildDroid`, which registers/manufactures the actual template.
Native template names include a stable factory ID because buildDroid replaces
equal-name templates and otherwise can cancel another factory's production.
Units are confirmed through native `eventDroidBuilt`, not a wrapper timer.

## Editable files and protocol

- `scenario/warzone-towers-commands.js`: native checks, FIFO scheduling, commands.
- `scenario/warzone-towers-command.json`: atomic JSON inbox, at most eight pending
  commands per revision. Responses are nonce-deduplicated and logged as WTCMD.
- `scenario/warzone-towers-catalog.json`: static structure footprints/components.
- `warzone-command-pages.js`, `warzone-terrain-picker.js`, `ui/command-pages.css`:
  wrapper UI, private library, terrain observation and input handoff.
- `tools/generate-command-catalog.py`: reads packaged original stats and existing
  icons into both catalogue copies; never changes the stats.
- `tools/command-audit.cjs`: real Android taps, native QuickSave proof, six-worker
  checks, overlay returns and transport bursts. Its default QA output is v4.8.

After changing scenario/catalogue sources, run the embedder and build. After only
wrapper changes, build directly. Repeated embedding grows the data file; do not
run it needlessly. Read-only preservation verification compares the previous APK's
entire data prefix, official code/WASM and every previous resolved stock/mod asset.

No automatic research, wave roster changes or free-unit shortcuts are involved.
