# BUILD, DESIGN and factory commands

v5.0 provides larger header commands and a persistent lower-left field console. TECH remains
the single research entry; STATS opens Warzone's real intelligence/player table.
ALL UNITS, PATROL, BOX, STOP, TRUCKS and SELECT / MOVE stay visible on the field.
MORE remains in the header and contains commanders and control size. Music
stays on startup. Existing zoom, BASE, STOP, HELP and wave controls remain.

## Construction

Open BUILD and choose a structure from Warzone's original construction panel.
Tap valid ground repeatedly. The touch adapter sends native Ctrl-clicks, so the
engine retains the actual pending order lists and draws its original green
queued building blueprints. Research, power, footprints, modules and prices
remain native. SELECT / MOVE exits placement and retains accepted orders; STOP
cancels selected units' orders. Placement also closes after the group has worked
and returned to idle. There is no custom neon footprint in this flow.

BUILD includes all constructors within eight map tiles of the nearest
constructor in view (or the selected constructor). A manually selected group
expands to include nearby constructors around its members. TRUCKS explicitly
selects the nearby group and leaves
normal movement active. Selection uses the original upper builder cards across
all pages, retaining the camera position. No one-truck or three-truck cap is
introduced. Original game limits remain in force, including 15 constructors.
Reopening BUILD keeps a complete selection without replaying every builder card.

Warzone's public `orderDroidBuild` replaces the native order list. The earlier
custom FIFO could therefore hide future sites from the engine's blueprint
renderer. The default BUILD path now uses native input instead. A generation
guard waits for the original build-selection callback before dispatching early
site taps. SELECT and menu navigation drain accepted placement input before
releasing modifiers; STOP explicitly discards unsent input. The old custom FIFO
is retained for protocol compatibility, not used by the normal BUILD button.

STOP clears explicit native orders. Under original Warzone rules, idle
constructors may automatically help nearby unfinished structures or repairs.
Move a constructor away to interrupt that assistance; tapping an unfinished
friendly structure with a constructor selected issues normal HELPBUILD.

The read-only terrain adapter observes the engine's terrain MVP and vertex/index
buffers for the viewport anchor and QA projection. It restores the COPY_READ
binding, caches projection data and invalidates changed meshes. Native
construction uses the engine's own pointer picking and blueprint renderer.
Neither adapter edits shaders, engine program code, WASM, models or textures.
Pan, pinch, tilt and minimap gestures remain native input.

The touch adapter also accepts mouse/pen placement, preserves native middle-button camera
input, supports right-click cancellation, and tolerates small touch drift while
placing. Optimized original terrain shaders remain eligible for projection.

## Designs and production

DESIGN selects researched body, propulsion and weapon/system components. Multiple
weapon slots follow the body's real slot count. The original engine's
`makeTemplate` validates compatibility and calculates power/build points before
SAVE DESIGN is enabled. A Command Centre is required. Saving adds no free unit
and starts no production.

Saved Designs is an app-private JSON library, persisted through the Android
bridge. It survives process restart and APK updates using the same signing key.
NEW DESIGN starts a separate, automatically named draft. SAVE CHANGES updates
the selected blueprint; SAVE AS NEW gives the copy a distinct identity. Saved
designs can be reopened, edited or deleted. Late validation/save replies cannot
replace a newer draft or redirect a later page; repeated Save is suppressed,
and a failed save can be retried. Research is checked again in
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
- `tools/user-flow-audit.cjs`: trusted mouse/pen/touch, actual Android component
  pickers, new/edit/copy, production, restart and focused search tests.
- `tools/test-command-pages.cjs`: deterministic validation/save/menu race and
  persistence-failure regressions.
- `tools/command-audit.cjs`: real Android taps, native QuickSave proof, six-worker
  checks, overlay returns and transport bursts for the historical v4.8 catalogue.
- `tools/gameplay-audit.cjs`: v5.0 Android/native-input flows and fresh native
  order, completion, production, movement and viewport evidence. Use a separate
  output directory for each candidate; each case checks the installed APK hash.
- `tools/finalize-v50-audit.cjs`: rejects missing, prototype or mismatched-artifact
  evidence before the final report is marked passed.

After changing scenario/catalogue sources, run the embedder and build. After only
wrapper changes, build directly. Repeated embedding grows the data file; do not
run it needlessly. Read-only preservation verification compares the previous APK's
entire data prefix, official code/WASM and every previous resolved stock/mod asset.

No automatic research, wave roster changes or free-unit shortcuts are involved.
