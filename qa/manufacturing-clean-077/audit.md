# Manufacturing / Queue 0.77 scoped audit

## Report and approved target

User screenshots Screenshot_20261114-150333.png and
Screenshot_20261114-150417.png show a large duplicated Manufacturing/Orders
heading and power total, Units/Design/Blueprints row, FACTORIES label, four
quantity buttons, repeated current/ready/waiting readouts and multiple
OPEN/CANCEL actions per factory. The approved v2 code-rendered mocks remove
both inner headings and Units, combine the toolbar, move progress into the unit
row, substitute a cycle control/MANUFACTURE, and show one STOP per factory.

Before edits, the exact v0.76 APK/full source hashes were verified and recorded
in fallback-0.77.json. Existing main command renderer/CSS, native observation,
queue submission/cancellation, finite FIFO, save globals and four-mode payload
composition were read. The four modes share the UI, with separate command
scripts/data and composed MP runtime; the hidden Duel retains its old path.

Related issues found: relabelling CANCEL would still start the next queued unit,
and the existing count API has no continuous policy. Both need authoritative
command behavior rather than decorative controls. Live progress formerly
replaced complete Queue rows; STOP must retain its touch node through updates.
Removing Units must retain a route back from Design/Blueprints.

## Relevant checklist

- Preserve the exact fallback and all historical source/proof entries.
- Match header-free compact screens; check narrow/enlarged content, multiple
  vehicle/cyborg factories, long lists, options and subpage return paths.
- Render actual unit artwork and matching native progress only; show paused or
  waiting state truthfully and keep action nodes stable through progress ticks.
- Manufacture one unit with a clear pending face and no duplicate pending tap.
- Repeat is per factory/design, bounded, native validated and saveable; idle
  UI choice alone creates no order. OFF removes automatic future work only.
- STOP is one validated atomic action for native current, waiting and repeat;
  rejection preserves authoritative jobs and other factories remain untouched.
- Clear invalid policies/draft UI on destruction, ownership, level/player/load
  transitions; do not apply a late acknowledgement to a different factory.
- Preserve finite FIFO, construction queues, designs, saves and all other UI.
- Verify exact command-only payload appends and compiled/native/map preservation.
- Focused host/browser checks, clean build and exact APK/source package checks.
- No emulator, device, public multiplayer, live ads, GitHub or VPS operations.

Host/native-API and browser packet fixtures are synthetic. Their results do
not establish actual native engine execution, Android rendering or gameplay.
Evidence is recorded in native.json, ui.json, browser.json, payload.json and
the exact-build verification/package records once those checks complete.

## Focused results

44 command/native-API fixture cases and 42 shared UI function cases passed.
The actual shared renderer and shipped styles passed 28 host-browser mode/layout
cases, including compact screens, multiple factories, long unit lists, empty
and waiting states, repeat display, Design/Blueprints returns and stable
Manufacture/repeat/STOP targets across progress updates. Root inspected the
normal Manufacturing, compact Queue and multi-factory Campaign captures.

A live-progress assertion initially combined node identity with an expected
57 percent. The nodes were retained; JavaScript floating-point flooring of
0.57 yielded 56. The fixture now uses exactly representable 0.5/0.75 checkpoints.
An earlier empty-state minimum-list-height assertion also expected a populated
list's height; the fixture now checks that the actual empty message fits.
Neither fixture correction required a product change or native run.

The clean Android build with the final stylesheet succeeded in 16 seconds.
The exact candidate APK SHA256 is
`716ea028b62e5ab34f01f9375d9caeb83d1f8437b2446d9e42cf4b27b8fb5179`.
No emulator, Android touch/gameplay or live multiplayer/ads were tested.
