# v5.10 construction response

Scope: Build/item selection response and related native queue, selection, exit
and screen-return behavior. Android version 60, clean built and installed APK:
`5b9d515e7c7e5e24008c4c82b5f46ef109952a1939112a9ada10308ffd0a2f65`.
Frozen v5.9 APK, source and checksums remain preserved.

## Change

Selection previously sent 9-10 state requests and repeated truck/picker setup,
with fixed waits after input. Outstanding read-only state requests now share one
reply; redundant polling is suspended during setup. A fresh native snapshot
validates the nearby constructor group. Matching truck selections need no extra
builder-card taps. Menu clicks signal native completion directly; world clicks
retain their original terrain-picking, press and release frame barriers.

Every choice still reopens and acknowledges the real native placement tool,
including repeated choices. A faster cached-ready shortcut was rejected after
the actual FIFO check caught a queued MOVE instead of BUILD. Native focus/save
transitions can invalidate that cached tool state; the shortcut is absent from
the delivery. Exit during asynchronous selection invalidates late activation.
The covered transition and persistent sidebar/cards are retained.

The display journal also required a fix: one idle sample between native FIFO
jobs could permanently mark the next job interrupted before its foundation
appeared. It now requires 1,200 ms of sustained native simulation idle. This
observer never issues/replaces construction orders. The supplied mod is unchanged.

## Observed response

Single-run Android/WebView samples, 1080x600 CSS viewport, one live constructor:

| Item choice | v5.9 ms | v5.10 ms |
| --- | ---: | ---: |
| first | 3268 | 1501 |
| repeat | 3221 | 1192 |
| change | 3302 | 1014 |
| back | 2865 | 1340 |

Timing ends at the observed interactive frame: no pending item, real native
readiness, requested item active, and the frame cover removed. Delivery traces
contain 1-2 state sends and two real native menu taps per choice. Native match
load/timing differs between samples; these are observations, not a statistical
benchmark or a physical-device speed guarantee. Native activation remains about
1.0-1.5 seconds on this software-rendered emulator; it is not instant.
See baseline/results.json, delivery/results.json and comparison.json.

## Exact delivery APK on emulator-5556

- final-related/results.json: same-item reselect between two real tower sites,
  different-item selection and Exit retain actual native BUILD orders. Both
  GuardTower1 structures reach 300 native build points. Matching unit IDs and
  native positions verify subsequent MOVE. Map retains the sidebar; Trucks,
  Select/Move and automatic completion restore normal field input.
- That journey also passes two Research/Factory/battle return loops, Designer
  keyboard visibly opened before Android Back and restored viewport/input,
  three native queued sites with a fully hittable View All control, and
  placement/exit/header hit targets at 1600x720, 1280x576 and 1080x600.
- final-single/results.json: BUILD followed immediately by one MG-bunker tap at
  all three sizes selects three nearby constructors. Native order statistics,
  target coordinates and full 400-point PillBox1 completion are checked. A
  prior distant selection does not override the current area's group. Exit
  during in-flight selection stays closed.
- The empty-roster fixture removes constructors from an ordinary native save,
  retaining a normally produced selected combat unit. One item tap clears that
  selection and activates no placement tool. A replacement constructor is then
  produced normally; the single-constructor item/order/completion check passes.
  No power, research or units are granted by a product/debug API.
- final-visual/results.json records 60 compositor frames and one catalogue
  revision through opening, item changes, Trucks, reopening and Exit. The actual
  screenshots/contact sheet were inspected; cards/sidebar stay stable during
  item changes, with the native setup covered. Explicit exits hide the sidebar.
- Installed APK checksums match the build in the native journeys, performance
  trace and visual capture. Runtime exception/quiet-HUD checks pass. The final
  native test state is paused.

## Fixtures and unsuccessful checks

Earlier candidate traces and failed checks are retained, including the rejected
cached-tool optimization; they are not delivery evidence. An initial completion
check sampled an idle FIFO gap. Fresh native saves established actual completion
and exposed the separate journal issue above.

The combined delivery journey later reached HQ defeat in round 4 during the
last solo-constructor check. Its failure screenshot is retained in final-single.
Only that unfinished check was repeated using a validated early native save,
with constructors removed and one replacement produced normally. Previously
passing checks on this same APK were retained. late-one-truck-* preserves the
expired attempt; one-truck-* is the successful early-state retry.
fixtures/early-save-files.json preserves the complete original early QuickSave
for repeatable future setup. This is fixture recovery, not a claimed gameplay fix.

## Preservation and limits

preservation.json verifies the compiled engine logic, WASM, entire frozen data
prefix, original Tower Defense mod, Research, stylesheet and stock assets.
Only two UI scripts and the appended queue-observer adapter differ from v5.9;
the loader package index is regenerated by the approved embedding tool.
The built APK matches all 456 source assets. Thirteen related regression
scripts pass; regressions.txt records their output.

This validates the affected construction and screen journey. It does not certify
every game/device combination. Existing black terrain on the software-rendered
emulator remains, as do unverified physical rendering/audio/performance and a
complete native 30-round win/endurance run. See ../../docs/KNOWN-ISSUES.md.
