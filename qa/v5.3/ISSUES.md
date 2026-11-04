# v5.3 reported issues and checks

1. Header clipped at the top, especially wave status. User screenshots reproduce
   the visible failure. Fresh v5.2 emulator at 1600x720 has a correctly positioned
   header; audit native WebView focus scrolling and test the shorter 1280x576
   viewport, keyboard returns, startup and repeated page returns.
2. Research active topic, time and ordered queue unclear. Reproduced on v5.2:
   adding a topic leaves the lab READY until exiting the page; there is no
   countdown, and the active item disappears from the waiting list. Verify
   immediate engine assignment while open, visible active topic, explicitly
   estimated time, multiple waiting items, removal, per-lab status, ordered
   completion/advance and return persistence against native state.
3. Construction status overlaps the original purple builder cards. User screenshot
   shows this; source confirms both panels occupy the same footprint. Replace
   that visible window with one construction status panel. Verify screenshots,
   control hit targets, original native blueprints, accepted native order lists,
   completion, automatic tool exit, movement and menu returns.

The existing emulator black-terrain limitation affects the frozen v5.2 baseline
as well; it is tracked in docs/KNOWN-ISSUES.md and is not a new v5.3 regression.
